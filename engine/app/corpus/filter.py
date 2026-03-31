"""Filter S2 papers to the domain corpus and load into PostgreSQL.

Reads the downloaded S2 papers JSONL shards with DuckDB, applies
two-signal domain filtering (venue identity + PubTator3 vocab matching),
and writes results to solemd.corpus + solemd.papers.

Pipeline:
  1. Stream PubTator3 → build vocab_pmids set (~18M PMIDs in memory)
  2. Register DuckDB helpers (NLM venues table + clean_venue macro)
  3. Load vocab_pmids into DuckDB temp table
  4. For each S2 shard: DuckDB filter → COPY to PG staging → upsert
  5. Log run to solemd.load_history

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.filter              # all 60 shards
    uv run python -m app.corpus.filter --quick      # single shard (testing)
    uv run python -m app.corpus.filter --dry-run    # count only, no DB writes
    uv run python -m app.corpus.filter --shard 5    # process specific shard
"""

from __future__ import annotations

import argparse
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Callable

import duckdb
import psycopg

from app import db
from app.config import settings
from app.corpus._etl import log_etl_run, read_expr
from app.corpus.venues import register_duckdb_helpers
from app.corpus.vocab import load_vocab_aliases, stream_pubtator_matches

logger = logging.getLogger(__name__)

S2_DIR = settings.semantic_scholar_papers_dir_path

# DuckDB column spec — only the columns we need from S2 papers JSONL.
# Explicit schema avoids auto-detection overhead on 51 GB of data.
COLUMNS = {
    "corpusid": "BIGINT",
    "externalids": "JSON",
    "title": "VARCHAR",
    "year": "INTEGER",
    "venue": "VARCHAR",
    "journal": "JSON",
    "publicationdate": "VARCHAR",
    "citationcount": "INTEGER",
    "referencecount": "INTEGER",
    "influentialcitationcount": "INTEGER",
    "isopenaccess": "BOOLEAN",
    "s2fieldsofstudy": "JSON",
    "publicationtypes": "VARCHAR[]",
    "url": "VARCHAR",
}

# Venue patterns for journals not in the NLM catalog.
# Applied via DuckDB LIKE on clean_venue(venue).
# These fill gaps where NLM's Broad Subject Terms don't cover
# clearly domain-relevant journals.
VENUE_PATTERNS = [
    # Frontiers journals (some missing from NLM catalog)
    "frontiers in neuro%",
    "frontiers in psychiatr%",
    "frontiers in pharmacol%",
    "frontiers in aging neuroscience",
    "frontiers in behavioral neuroscience",
    # Brain research family
    "brain research%",
    "brain sciences",
    # Pharmacology / neuropharmacology
    "%neuropharmacol%",
    "%psychopharmacol%",
    # Cross-discipline neuro
    "%neuropsychiatr%",
    "%neuroimmunol%",
    "%neuroendocrinol%",
    "%neuropathol%",
    "%neurotoxicol%",
]


def _read_expr(source: str) -> str:
    """Build DuckDB read_json expression with explicit schema."""
    return read_expr(source, COLUMNS)


def _pattern_sql(alias: str) -> str:
    """Build DuckDB SQL for venue pattern matching.

    Returns a parenthesized OR expression:
        (alias LIKE 'pattern1' OR alias LIKE 'pattern2' OR ...)
    """
    clauses = [f"{alias} LIKE '{p}'" for p in VENUE_PATTERNS]
    return "(" + " OR ".join(clauses) + ")"


def _get_shards(quick: bool = False, shard: int | None = None) -> list[Path]:
    """Get S2 shard file paths to process."""
    all_shards = sorted(S2_DIR.glob("papers-*.jsonl.gz"))
    if not all_shards:
        raise FileNotFoundError(f"No S2 shard files found in {S2_DIR}")
    if shard is not None:
        if shard >= len(all_shards):
            raise ValueError(f"Shard {shard} out of range (0-{len(all_shards) - 1})")
        return [all_shards[shard]]
    if quick:
        return all_shards[:1]
    return all_shards


def _load_vocab_pmids_to_duckdb(con: duckdb.DuckDBPyConnection, vocab_pmids: set[int]) -> None:
    """Load vocab PMID set into DuckDB temp table via temp CSV.

    Writing to CSV and reading with DuckDB's read_csv is much faster
    than executemany for ~18M rows.
    """
    logger.info("Loading %d vocab PMIDs into DuckDB ...", len(vocab_pmids))
    t0 = time.monotonic()

    fd, temp_path = tempfile.mkstemp(suffix=".csv")
    try:
        with os.fdopen(fd, "w") as f:
            for pmid in vocab_pmids:
                f.write(f"{pmid}\n")
        safe_path = temp_path.replace("'", "''")
        con.execute(f"""
            CREATE TEMP TABLE vocab_pmids AS
            SELECT column0::BIGINT AS pmid
            FROM read_csv('{safe_path}', header=false, columns={{'column0': 'BIGINT'}})
        """)
    finally:
        os.unlink(temp_path)

    count = con.execute("SELECT COUNT(*) FROM vocab_pmids").fetchone()[0]
    logger.info("Loaded %d vocab PMIDs into DuckDB (%.1fs)", count, time.monotonic() - t0)


def _build_filter_query(source: str) -> str:
    """Build the main filter query for a single S2 shard.

    Returns all columns needed for both solemd.corpus and solemd.papers.
    """
    src = _read_expr(source)
    patterns = _pattern_sql("b.cv")

    return f"""
        WITH base AS (
            SELECT
                p.corpusid,
                TRY_CAST(p.externalids->>'PubMed' AS BIGINT) AS pmid,
                p.externalids->>'DOI' AS doi,
                p.externalids->>'PubMedCentral' AS pmc_id,
                p.title,
                p.year,
                p.venue,
                json_extract_string(p.journal, '$.name') AS journal_name,
                p.publicationdate,
                p.citationcount,
                p.referencecount,
                p.influentialcitationcount,
                p.isopenaccess,
                p.publicationtypes,
                CASE WHEN p.s2fieldsofstudy IS NOT NULL
                    THEN list_distinct([
                        json_extract_string(fos, '$.category')
                        FOR fos IN CAST(p.s2fieldsofstudy AS JSON[])
                    ])
                    ELSE NULL
                END AS fields_of_study,
                p.url AS s2_url,
                clean_venue(p.venue) AS cv
            FROM {src} p
            WHERE TRY_CAST(p.externalids->>'PubMed' AS BIGINT) IS NOT NULL
              AND p.corpusid IS NOT NULL
              AND p.title IS NOT NULL
        )
        SELECT
            b.corpusid,
            CAST(b.pmid AS INTEGER) AS pmid,
            b.doi,
            b.pmc_id,
            CASE
                WHEN nlm.name IS NOT NULL AND vp.pmid IS NOT NULL THEN 'journal_and_vocab'
                WHEN nlm.name IS NOT NULL THEN 'journal_match'
                WHEN {patterns} THEN 'pattern_match'
                ELSE 'vocab_entity_match'
            END AS admission_reason,
            b.title,
            b.year,
            b.venue,
            b.journal_name,
            b.publicationdate,
            b.citationcount,
            b.referencecount,
            b.influentialcitationcount,
            b.isopenaccess,
            b.publicationtypes,
            b.fields_of_study,
            b.s2_url
        FROM base b
        LEFT JOIN nlm_venues nlm ON b.cv = nlm.name
        LEFT JOIN vocab_pmids vp ON b.pmid = vp.pmid
        WHERE nlm.name IS NOT NULL
           OR {patterns}
           OR vp.pmid IS NOT NULL
    """


# ─── Staging table DDL ──────────────────────────────────────

_STAGING_DDL = """
    CREATE TEMP TABLE _stg (
        corpus_id BIGINT,
        pmid INTEGER,
        doi TEXT,
        pmc_id TEXT,
        admission_reason TEXT,
        title TEXT,
        year INTEGER,
        venue TEXT,
        journal_name TEXT,
        publication_date TEXT,
        citation_count INTEGER,
        reference_count INTEGER,
        influential_citation_count INTEGER,
        is_open_access BOOLEAN,
        publication_types TEXT[],
        fields_of_study TEXT[],
        s2_url TEXT
    ) ON COMMIT DROP
"""

_STAGING_COPY = """
    COPY _stg (
        corpus_id, pmid, doi, pmc_id, admission_reason,
        title, year, venue, journal_name, publication_date,
        citation_count, reference_count, influential_citation_count,
        is_open_access, publication_types, fields_of_study, s2_url
    ) FROM STDIN
"""

_DEDUP_STAGING = """
    DELETE FROM _stg s
    USING solemd.corpus c
    WHERE s.pmid = c.pmid AND s.corpus_id != c.corpus_id
"""

_DEDUP_STAGING_INTERNAL = """
    DELETE FROM _stg a
    USING _stg b
    WHERE a.pmid = b.pmid AND a.corpus_id > b.corpus_id
"""

_UPSERT_CORPUS = """
    INSERT INTO solemd.corpus (corpus_id, pmid, doi, pmc_id, admission_reason)
    SELECT corpus_id, pmid, doi, pmc_id, admission_reason FROM _stg
    ON CONFLICT (corpus_id) DO UPDATE SET
        pmid = EXCLUDED.pmid,
        doi = EXCLUDED.doi,
        pmc_id = EXCLUDED.pmc_id,
        admission_reason = EXCLUDED.admission_reason
"""

_UPSERT_PAPERS = """
    INSERT INTO solemd.papers (
        corpus_id, title, year, venue, journal_name, publication_date,
        citation_count, reference_count, influential_citation_count,
        is_open_access, publication_types, fields_of_study, s2_url
    )
    SELECT
        corpus_id, title, year, venue, journal_name,
        CASE
            WHEN publication_date ~ '^\\d{4}$'
                THEN (publication_date || '-01-01')::DATE
            WHEN publication_date ~ '^\\d{4}-\\d{2}$'
                THEN (publication_date || '-01')::DATE
            WHEN publication_date ~ '^\\d{4}-\\d{2}-\\d{2}'
                THEN LEFT(publication_date, 10)::DATE
            ELSE NULL
        END,
        citation_count, reference_count, influential_citation_count,
        is_open_access, publication_types, fields_of_study, s2_url
    FROM _stg
    ON CONFLICT (corpus_id) DO UPDATE SET
        title = EXCLUDED.title,
        year = EXCLUDED.year,
        venue = EXCLUDED.venue,
        journal_name = EXCLUDED.journal_name,
        publication_date = EXCLUDED.publication_date,
        citation_count = EXCLUDED.citation_count,
        reference_count = EXCLUDED.reference_count,
        influential_citation_count = EXCLUDED.influential_citation_count,
        is_open_access = EXCLUDED.is_open_access,
        publication_types = EXCLUDED.publication_types,
        fields_of_study = EXCLUDED.fields_of_study,
        s2_url = EXCLUDED.s2_url,
        updated_at = now()
"""


def _upsert_shard(conn: psycopg.Connection, rows: list[tuple]) -> int:
    """COPY rows into staging table, then upsert into corpus + papers.

    Uses ON COMMIT DROP staging table so each shard is an atomic
    transaction. If a shard fails, previous shards are preserved.

    Returns number of rows upserted.
    """
    if not rows:
        return 0

    with conn.cursor() as cur:
        cur.execute(_STAGING_DDL)

        with cur.copy(_STAGING_COPY) as copy:
            for row in rows:
                copy.write_row(row)

        # Deduplicate: S2 can have multiple corpus_ids for the same PMID.
        # Remove staging rows whose PMID already exists with a different corpus_id,
        # and resolve internal duplicates by keeping the lowest corpus_id.
        cur.execute(_DEDUP_STAGING_INTERNAL)
        cur.execute(_DEDUP_STAGING)

        cur.execute(_UPSERT_CORPUS)
        cur.execute(_UPSERT_PAPERS)

    conn.commit()
    return len(rows)


def run_filter(
    *,
    quick: bool = False,
    dry_run: bool = False,
    shard: int | None = None,
    skip_vocab: bool = False,
) -> dict:
    """Run the full corpus filter pipeline.

    Args:
        quick: Process single shard only (testing).
        dry_run: Count matches per shard without writing to DB.
        shard: Process specific shard number (0-indexed).
        skip_vocab: Skip PubTator3 streaming (journal-only filter).

    Returns:
        Dict with run statistics.
    """
    t_start = time.monotonic()

    # ── Step 1: Build vocab PMID set from PubTator3 ──────────
    if skip_vocab:
        vocab_pmids: set[int] = set()
        logger.info("Skipping vocab signal (--skip-vocab)")
    else:
        logger.info("Step 1: Building vocab PMID set from PubTator3 ...")
        aliases = load_vocab_aliases()
        logger.info("  %d aliases loaded", len(aliases))
        vocab_pmids = stream_pubtator_matches(aliases=aliases)
        logger.info("  %d vocab PMIDs", len(vocab_pmids))

    # ── Step 2: Set up DuckDB ────────────────────────────────
    logger.info("Step 2: Setting up DuckDB ...")
    con = duckdb.connect()
    con.execute("SET memory_limit = '8GB'")
    con.execute("SET threads TO 4")

    register_duckdb_helpers(con)
    nlm_count = con.execute("SELECT COUNT(*) FROM nlm_venues").fetchone()[0]
    logger.info("  NLM venues: %d", nlm_count)

    # ── Step 3: Load vocab PMIDs into DuckDB ─────────────────
    if vocab_pmids:
        _load_vocab_pmids_to_duckdb(con, vocab_pmids)
    else:
        # Create empty table so queries don't fail
        con.execute("CREATE TEMP TABLE vocab_pmids (pmid BIGINT)")

    # ── Step 4: Process shards ───────────────────────────────
    shards = _get_shards(quick=quick, shard=shard)
    logger.info("Step 3: Processing %d shard(s) ...", len(shards))

    total_processed = 0
    total_loaded = 0
    reason_counts: dict[str, int] = {}
    pg_conn = None if dry_run else db.connect()

    failed_shards: list[str] = []

    try:
        for idx, shard_path in enumerate(shards):
            t_shard = time.monotonic()
            query = _build_filter_query(str(shard_path))

            try:
                rows = con.execute(query).fetchall()
            except Exception as e:
                shard_time = time.monotonic() - t_shard
                logger.error(
                    "  Shard %d/%d: FAILED (%.1fs) — %s: %s",
                    idx + 1, len(shards), shard_time, type(e).__name__, e,
                )
                failed_shards.append(shard_path.name)
                continue

            total_processed += len(rows)

            # Count filter reasons
            for row in rows:
                reason = row[4]  # admission_reason is 5th column
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

            if dry_run:
                shard_time = time.monotonic() - t_shard
                logger.info(
                    "  Shard %d/%d: %d papers (%.1fs) [dry run]",
                    idx + 1, len(shards), len(rows), shard_time,
                )
            else:
                loaded = _upsert_shard(pg_conn, rows)
                total_loaded += loaded
                shard_time = time.monotonic() - t_shard
                logger.info(
                    "  Shard %d/%d: %d papers → %d upserted (%.1fs)",
                    idx + 1, len(shards), len(rows), loaded, shard_time,
                )

        # ── Step 5: Log to load_history ──────────────────────
        elapsed = time.monotonic() - t_start
        stats = {
            "shards": len(shards),
            "failed_shards": failed_shards,
            "quick": quick,
            "dry_run": dry_run,
            "skip_vocab": skip_vocab,
            "vocab_pmids": len(vocab_pmids),
            "reason_counts": reason_counts,
            "elapsed_seconds": round(elapsed, 1),
        }

        status = "completed" if not failed_shards else "completed_with_errors"
        if not dry_run:
            log_etl_run(
                pg_conn,
                operation="filter_papers",
                source=f"S2 papers ({len(shards)} shards)",
                rows_processed=total_processed,
                rows_loaded=total_loaded,
                status=status,
                metadata=stats,
            )

        logger.info("=" * 60)
        logger.info("Filter complete")
        logger.info("  Shards:    %d (%d failed)", len(shards), len(failed_shards))
        logger.info("  Processed: %d", total_processed)
        logger.info("  Loaded:    %d", total_loaded)
        logger.info("  Time:      %.1fs", elapsed)
        logger.info("  Reasons:")
        for reason, count in sorted(reason_counts.items()):
            logger.info("    %-25s %d", reason, count)
        if failed_shards:
            logger.warning("  Failed shards (re-download and re-run with --shard):")
            for name in failed_shards:
                logger.warning("    %s", name)
        logger.info("=" * 60)

        # ── Step 6: Promote journal_rule matches into the mapped universe ──
        if not dry_run:
            try:
                journal_stats = promote_journal_rules(dry_run=False)
                stats["journal_promotion"] = journal_stats
            except Exception as e:
                logger.warning("journal_rule promotion failed (non-fatal): %s", e)
                stats["journal_promotion_error"] = str(e)

        # ── Step 7: Promote entity_rule matches ───────────────
        if not dry_run:
            try:
                entity_stats = promote_entity_rules(dry_run=False)
                stats["entity_promotion"] = entity_stats
            except Exception as e:
                logger.warning("entity_rule promotion failed (non-fatal): %s", e)
                stats["entity_promotion_error"] = str(e)

        # ── Step 8: Promote relation_rule matches ─────────────
        if not dry_run:
            try:
                relation_stats = promote_relation_rules(dry_run=False)
                stats["relation_promotion"] = relation_stats
            except Exception as e:
                logger.warning("relation_rule promotion failed (non-fatal): %s", e)
                stats["relation_promotion_error"] = str(e)

        return stats

    finally:
        con.close()
        if pg_conn is not None:
            pg_conn.close()


def _run_promotion(
    label: str,
    count_sql: str,
    count_params: tuple = (),
    update_sql: str = "",
    update_params: tuple = (),
    *,
    setup_fn: Callable[[psycopg.Connection], tuple[int, dict]] | None = None,
    update_fn: Callable[[psycopg.Connection], tuple[int, dict]] | None = None,
    dry_run: bool = False,
    etl_operation: str = "",
    etl_source: str = "",
) -> dict:
    """Shared orchestration for promote_*_rules functions.

    Flow: connect → setup_fn (optional) → count/preview → dry_run check →
    update → log_etl_run → close.

    For simple promotions (journal rules), provide count_sql + update_sql.
    For complex promotions (entity/relation), provide setup_fn + update_fn
    which handle temp tables and multi-step updates internally.

    Args:
        label: Human-readable label for logging (e.g. "journal_rule").
        count_sql: SQL that returns rows with a 'cnt' column for preview.
        count_params: Parameters for count_sql.
        update_sql: SQL UPDATE ... RETURNING for simple promotions.
        update_params: Parameters for update_sql.
        setup_fn: Called before count_sql. Returns (total, breakdown_dict).
                  Used by entity_rules for temp table creation.
        update_fn: Called instead of update_sql for complex multi-step updates.
                   Returns (promoted_count, stats_dict).
        dry_run: If True, preview only — no writes.
        etl_operation: Operation name for load_history.
        etl_source: Source name for load_history.
    """
    conn = db.connect()
    try:
        # Phase 1: Setup (optional — entity/relation rules create temp tables)
        if setup_fn is not None:
            total, breakdown = setup_fn(conn)
        else:
            with conn.cursor() as cur:
                cur.execute(count_sql, count_params)
                breakdown = {row[next(iter(row))]: row["cnt"] for row in cur.fetchall()}
            total = sum(breakdown.values())

        logger.info("%s promotion: %d candidate papers to promote", label, total)
        for key, cnt in breakdown.items():
            logger.info("  %-40s %d", key, cnt)

        if dry_run:
            logger.info("Dry run — no changes made")
            return {"total": total, "breakdown": breakdown, "dry_run": True}

        # Phase 2: Execute UPDATE
        if update_fn is not None:
            promoted, stats = update_fn(conn)
        else:
            with conn.cursor() as cur:
                cur.execute(update_sql, update_params)
                promoted = cur.rowcount
            conn.commit()
            stats = {"promoted": promoted, "breakdown": breakdown}

        # Phase 3: Audit trail
        log_etl_run(
            conn,
            operation=etl_operation,
            source=etl_source,
            rows_processed=total,
            rows_loaded=promoted,
            status="completed",
            metadata=stats,
        )

        logger.info("Promoted %d papers to mapped layout via %s", promoted, label)
        return stats
    finally:
        conn.close()


def promote_journal_rules(*, dry_run: bool = False) -> dict:
    """Promote candidate papers whose venue matches a journal_rule entry to mapped layout.

    Uses solemd.clean_venue() for normalization consistent with the filter pipeline.
    Called automatically at the end of run_filter(), or standalone via --promote-journals.
    """
    count_sql = """
        SELECT jr.family_key, COUNT(*) AS cnt
        FROM solemd.corpus c
        JOIN solemd.papers p ON p.corpus_id = c.corpus_id
        JOIN solemd.journal_rule jr ON solemd.clean_venue(p.venue) = jr.venue_normalized
        WHERE c.layout_status = 'candidate'
          AND jr.include_in_corpus = true
        GROUP BY jr.family_key
        ORDER BY cnt DESC
    """
    update_sql = """
        UPDATE solemd.corpus c
        SET layout_status = 'mapped'
        FROM solemd.papers p
        JOIN solemd.journal_rule jr ON solemd.clean_venue(p.venue) = jr.venue_normalized
        WHERE c.corpus_id = p.corpus_id
          AND c.layout_status = 'candidate'
          AND jr.include_in_corpus = true
        RETURNING c.corpus_id
    """
    return _run_promotion(
        "journal_rule",
        count_sql=count_sql,
        update_sql=update_sql,
        dry_run=dry_run,
        etl_operation="promote_journal_rules",
        etl_source="solemd.journal_rule",
    )


def promote_entity_rules(*, dry_run: bool = False) -> dict:
    """Promote candidate papers matching entity_rule to mapped layout.

    Three confidence tiers:
    - high/moderate: promote if paper has entity annotation + passes citation gate
    - requires_second_gate: promote only if paper ALSO has a high-confidence
      entity_rule match OR a treat/cause relation on the same PMID
    """
    high_mod_match_query = """
        CREATE TEMP TABLE tmp_entity_high_mod_matches AS
        SELECT DISTINCT c.corpus_id, c.pmid, er.family_key, er.confidence
        FROM solemd.entity_rule er
        JOIN pubtator.entity_annotations ea
            ON ea.entity_type = er.entity_type
            AND ea.concept_id = er.concept_id
        JOIN solemd.corpus c
            ON c.pmid = ea.pmid
            AND c.layout_status = 'candidate'
        JOIN solemd.papers p
            ON p.corpus_id = c.corpus_id
        WHERE er.confidence IN ('high', 'moderate')
          AND COALESCE(p.citation_count, 0) >= er.min_citation_count
    """

    gene_match_query = """
        CREATE TEMP TABLE tmp_entity_gene_matches AS
        SELECT DISTINCT c.corpus_id, c.pmid, er_gene.family_key, er_gene.confidence
        FROM solemd.entity_rule er_gene
        JOIN pubtator.entity_annotations ea_gene
            ON ea_gene.entity_type = er_gene.entity_type
            AND ea_gene.concept_id = er_gene.concept_id
        JOIN solemd.corpus c
            ON c.pmid = ea_gene.pmid
            AND c.layout_status = 'candidate'
        JOIN solemd.papers p
            ON p.corpus_id = c.corpus_id
        WHERE er_gene.confidence = 'requires_second_gate'
          AND COALESCE(p.citation_count, 0) >= er_gene.min_citation_count
          AND NOT EXISTS (
              SELECT 1
              FROM tmp_entity_high_mod_matches hm
              WHERE hm.corpus_id = c.corpus_id
          )
          AND (
              EXISTS (
                  SELECT 1
                  FROM tmp_entity_high_mod_matches hm2
                  WHERE hm2.pmid = c.pmid
              )
              OR EXISTS (
                  SELECT 1
                  FROM pubtator.relations r
                  WHERE r.pmid = c.pmid
                    AND r.relation_type IN ('treat', 'cause')
              )
          )
    """

    def _setup(conn: psycopg.Connection) -> tuple[int, dict]:
        by_category: dict[str, int] = {}
        with conn.cursor() as cur:
            cur.execute("SET LOCAL jit = off")
            cur.execute(high_mod_match_query)
            cur.execute(
                "CREATE INDEX tmp_entity_high_mod_matches_corpus_idx "
                "ON tmp_entity_high_mod_matches (corpus_id)"
            )
            cur.execute(
                "CREATE INDEX tmp_entity_high_mod_matches_pmid_idx "
                "ON tmp_entity_high_mod_matches (pmid)"
            )

            cur.execute(gene_match_query)
            cur.execute(
                "CREATE INDEX tmp_entity_gene_matches_corpus_idx "
                "ON tmp_entity_gene_matches (corpus_id)"
            )

            cur.execute(
                """
                SELECT family_key, confidence, COUNT(DISTINCT corpus_id) AS cnt
                FROM tmp_entity_high_mod_matches
                GROUP BY family_key, confidence
                ORDER BY cnt DESC
                """
            )
            high_mod_counts = {
                f"{row['family_key']}({row['confidence']})": row["cnt"]
                for row in cur.fetchall()
            }

            cur.execute(
                """
                SELECT family_key, confidence, COUNT(DISTINCT corpus_id) AS cnt
                FROM tmp_entity_gene_matches
                GROUP BY family_key, confidence
                ORDER BY cnt DESC
                """
            )
            gene_counts = {
                f"{row['family_key']}({row['confidence']})": row["cnt"]
                for row in cur.fetchall()
            }

            cur.execute("SELECT COUNT(DISTINCT corpus_id) AS cnt FROM tmp_entity_high_mod_matches")
            high_mod_total = cur.fetchone()["cnt"]
            cur.execute("SELECT COUNT(DISTINCT corpus_id) AS cnt FROM tmp_entity_gene_matches")
            gene_total = cur.fetchone()["cnt"]

        by_category.update(high_mod_counts)
        by_category.update(gene_counts)
        return high_mod_total + gene_total, by_category

    def _update(conn: psycopg.Connection) -> tuple[int, dict]:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE solemd.corpus c
                SET layout_status = 'mapped'
                FROM (
                    SELECT DISTINCT corpus_id
                    FROM tmp_entity_high_mod_matches
                ) hm
                WHERE c.corpus_id = hm.corpus_id
                RETURNING c.corpus_id
                """
            )
            promoted_high = cur.rowcount
            logger.info("Promoted %d papers via high/moderate entity rules", promoted_high)

            cur.execute(
                """
                UPDATE solemd.corpus c
                SET layout_status = 'mapped'
                FROM (
                    SELECT DISTINCT corpus_id
                    FROM tmp_entity_gene_matches
                ) gm
                WHERE c.corpus_id = gm.corpus_id
                RETURNING c.corpus_id
                """
            )
            promoted_gene = cur.rowcount
        conn.commit()
        logger.info("Promoted %d papers via second-gate entity rules", promoted_gene)

        total_promoted = promoted_high + promoted_gene
        stats = {
            "promoted": total_promoted,
            "promoted_high_moderate": promoted_high,
            "promoted_second_gate": promoted_gene,
        }
        return total_promoted, stats

    return _run_promotion(
        "entity_rule",
        count_sql="",  # handled by setup_fn
        setup_fn=_setup,
        update_fn=_update,
        dry_run=dry_run,
        etl_operation="promote_entity_rules",
        etl_source="solemd.entity_rule",
    )


def promote_relation_rules(*, dry_run: bool = False) -> dict:
    """Promote candidate papers matching relation_rule base families into mapped layout.

    relation_rule can also store overlay-targeted families.
    Those are counted in dry-runs but are not yet promoted because overlay is not
    materialized in layout_status.
    """
    relation_match_query = """
        CREATE TEMP TABLE tmp_relation_matches AS
        SELECT DISTINCT
            c.corpus_id,
            c.pmid,
            rr.canonical_name,
            rr.family_key,
            rr.target_scope
        FROM solemd.relation_rule rr
        JOIN pubtator.relations r
            ON r.subject_type = rr.subject_type
            AND r.relation_type = rr.relation_type
            AND r.object_type = rr.object_type
            AND r.object_id = rr.object_id
        JOIN solemd.corpus c
            ON c.pmid = r.pmid
            AND c.layout_status = 'candidate'
        JOIN solemd.papers p
            ON p.corpus_id = c.corpus_id
        WHERE COALESCE(p.citation_count, 0) >= rr.min_citation_count
    """

    def _setup(conn: psycopg.Connection) -> tuple[int, dict]:
        with conn.cursor() as cur:
            cur.execute("SET LOCAL jit = off")
            cur.execute(relation_match_query)
            cur.execute(
                "CREATE INDEX tmp_relation_matches_corpus_idx "
                "ON tmp_relation_matches (corpus_id)"
            )
            cur.execute(
                "CREATE INDEX tmp_relation_matches_target_idx "
                "ON tmp_relation_matches (target_scope)"
            )

            cur.execute(
                """
                SELECT canonical_name, family_key, target_scope, COUNT(DISTINCT corpus_id) AS cnt
                FROM tmp_relation_matches
                GROUP BY canonical_name, family_key, target_scope
                ORDER BY cnt DESC
                """
            )
            by_rule = {
                f"{row['canonical_name']} [{row['family_key']}/{row['target_scope']}]": row["cnt"]
                for row in cur.fetchall()
            }

            cur.execute(
                """
                SELECT COUNT(DISTINCT corpus_id) AS cnt
                FROM tmp_relation_matches
                WHERE target_scope = 'base'
                """
            )
            base_total = cur.fetchone()["cnt"]

            cur.execute(
                """
                SELECT COUNT(DISTINCT corpus_id) AS cnt
                FROM tmp_relation_matches
                WHERE target_scope = 'overlay'
                """
            )
            overlay_total = cur.fetchone()["cnt"]

        logger.info(
            "  (includes %d overlay-only matches, not yet promoted)", overlay_total,
        )
        return base_total, by_rule

    def _update(conn: psycopg.Connection) -> tuple[int, dict]:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE solemd.corpus c
                SET layout_status = 'mapped'
                FROM (
                    SELECT DISTINCT corpus_id
                    FROM tmp_relation_matches
                    WHERE target_scope = 'base'
                ) rm
                WHERE c.corpus_id = rm.corpus_id
                RETURNING c.corpus_id
                """
            )
            promoted = cur.rowcount
        conn.commit()
        stats = {"promoted": promoted}
        return promoted, stats

    return _run_promotion(
        "relation_rule",
        count_sql="",  # handled by setup_fn
        setup_fn=_setup,
        update_fn=_update,
        dry_run=dry_run,
        etl_operation="promote_relation_rules",
        etl_source="solemd.relation_rule",
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Filter S2 papers to domain corpus",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    uv run python -m app.corpus.filter --quick --dry-run   # Preview single shard
    uv run python -m app.corpus.filter --quick             # Load single shard
    uv run python -m app.corpus.filter                     # Full run (all 60 shards)
    uv run python -m app.corpus.filter --skip-vocab        # Journal-only filter
    uv run python -m app.corpus.filter --shard 5           # Specific shard
    uv run python -m app.corpus.filter --promote-journals   # Promote journal_rule matches
    uv run python -m app.corpus.filter --promote-entities   # Promote entity_rule matches
    uv run python -m app.corpus.filter --promote-relations  # Promote relation_rule matches
    uv run python -m app.corpus.filter --promote-entities --dry-run  # Preview entity promotion
        """,
    )
    parser.add_argument("--quick", action="store_true", help="Single shard only (testing)")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no DB writes")
    parser.add_argument(
        "--shard", type=int, default=None, help="Process specific shard (0-indexed)",
    )
    parser.add_argument("--skip-vocab", action="store_true", help="Skip PubTator3 vocab signal")
    parser.add_argument(
        "--promote-journals", action="store_true",
        help="Promote journal_rule matches from candidate to mapped layout",
    )
    parser.add_argument(
        "--promote-entities", action="store_true",
        help="Promote entity_rule matches from candidate to mapped layout",
    )
    parser.add_argument(
        "--promote-relations", action="store_true",
        help="Promote relation_rule base matches from candidate to mapped layout",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    if args.promote_journals:
        promote_journal_rules(dry_run=args.dry_run)
    elif args.promote_entities:
        promote_entity_rules(dry_run=args.dry_run)
    elif args.promote_relations:
        promote_relation_rules(dry_run=args.dry_run)
    else:
        run_filter(
            quick=args.quick,
            dry_run=args.dry_run,
            shard=args.shard,
            skip_vocab=args.skip_vocab,
        )


if __name__ == "__main__":
    main()
