"""Stream PubTator3 bulk files and load domain-filtered rows into PostgreSQL.

Reads bioconcepts2pubtator3.gz and relation2pubtator3.gz, keeping only
rows whose PMID appears in solemd.corpus. Uses psycopg COPY for fast
bulk loading into the UNLOGGED pubtator.* tables.

After bulk load, creates indexes and runs ANALYZE.

Reference: SoleMD.App/pipeline/scripts/load/load_pubtator3.py

Data format (from NCBI README):
    bioconcepts2pubtator3: PMID<TAB>Type<TAB>Concept_ID<TAB>Mentions<TAB>Resource
    relation2pubtator3:    PMID<TAB>Type<TAB>Entity1(Type|ID)<TAB>Entity2(Type|ID)

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.pubtator                    # both entities + relations
    uv run python -m app.corpus.pubtator --entities-only    # just entities
    uv run python -m app.corpus.pubtator --relations-only   # just relations
    uv run python -m app.corpus.pubtator --skip-indexes     # skip index creation
"""

from __future__ import annotations

import argparse
import gzip
import logging
import time

import psycopg

from app import db
from app.config import settings
from app.corpus._etl import log_etl_run

logger = logging.getLogger(__name__)

ENTITY_FILE = "bioconcepts2pubtator3.gz"
RELATION_FILE = "relation2pubtator3.gz"

PROGRESS_INTERVAL = 1_000_000  # Log every 1M lines

# Known PubTator3 entity types (lowercased for comparison)
_KNOWN_ENTITY_TYPES = frozenset({
    "gene", "disease", "chemical", "species", "mutation",
    "cellline", "dnamutation", "proteinmutation", "snp",
})
_warned_entity_types: set[str] = set()


# ─── Entity parsing ─────────────────────────────────────────

def _parse_entity_line(line: str) -> tuple[int, str, str, str, str] | None:
    """Parse entity annotation line.

    Format: PMID<TAB>Type<TAB>Concept_ID<TAB>Mentions<TAB>Resource

    Returns (pmid, entity_type, concept_id, mentions, resource) or None.
    """
    parts = line.rstrip("\n").split("\t")
    if len(parts) < 4:
        return None

    try:
        pmid = int(parts[0])
        entity_type = parts[1].lower()
        concept_id = parts[2] if parts[2] else ""
        mentions = parts[3] if len(parts) > 3 else ""
        resource = parts[4] if len(parts) > 4 else "PubTator3"

        # Warn once per unknown entity type
        if entity_type not in _KNOWN_ENTITY_TYPES and entity_type not in _warned_entity_types:
            _warned_entity_types.add(entity_type)
            logger.warning("Unknown PubTator entity type %r (will still load)", entity_type)

        # Clean up mentions that end with backslash (encoding artifacts)
        if mentions.endswith("\\"):
            mentions = mentions[:-1]

        return (pmid, entity_type, concept_id, mentions, resource)
    except (ValueError, IndexError):
        return None


def _parse_relation_line(line: str) -> tuple[int, str, str, str, str, str] | None:
    """Parse relation line.

    Format: PMID<TAB>Type<TAB>Entity1(Type|ID)<TAB>Entity2(Type|ID)

    Returns (pmid, relation_type, subject_type, subject_id, object_type, object_id) or None.
    """
    parts = line.rstrip("\n").split("\t")
    if len(parts) < 4:
        return None

    try:
        pmid = int(parts[0])
        relation_type = parts[1]

        e1_parts = parts[2].split("|", 1)
        e2_parts = parts[3].split("|", 1)

        if len(e1_parts) != 2 or len(e2_parts) != 2:
            return None

        return (
            pmid,
            relation_type,
            e1_parts[0].lower(),  # subject_type
            e1_parts[1],          # subject_id
            e2_parts[0].lower(),  # object_type
            e2_parts[1],          # object_id
        )
    except (ValueError, IndexError):
        return None


# ─── Corpus PMID set ────────────────────────────────────────

def _load_corpus_pmids(conn: psycopg.Connection) -> set[int]:
    """Load all PMIDs from solemd.corpus into a set for filtering."""
    logger.info("Loading corpus PMIDs from solemd.corpus ...")
    t0 = time.monotonic()

    with conn.cursor() as cur:
        cur.execute("SELECT pmid FROM solemd.corpus WHERE pmid IS NOT NULL")
        pmids = {row["pmid"] for row in cur.fetchall()}

    logger.info("Loaded %d corpus PMIDs (%.1fs)", len(pmids), time.monotonic() - t0)
    return pmids


# ─── Bulk loaders ───────────────────────────────────────────

from collections.abc import Callable
from typing import Any


def _stream_load(
    conn: psycopg.Connection,
    corpus_pmids: set[int],
    *,
    table: str,
    columns: str,
    parser: Callable[[str], tuple[Any, ...] | None],
    file_path: Any,
    label: str,
) -> dict:
    """Generic gzipped PubTator file -> PostgreSQL COPY loader.

    Parses and filters rows BEFORE entering the COPY context so that
    a single bad row cannot abort the entire COPY operation.
    """
    if not file_path.exists():
        raise FileNotFoundError(f"{label} file not found: {file_path}")

    logger.info("Loading %s from %s ...", label, file_path.name)
    t0 = time.monotonic()
    loaded = 0
    skipped = 0
    errors = 0
    lines = 0

    with conn.cursor() as cur:
        # Truncate for idempotent re-runs
        cur.execute(f"TRUNCATE {table}")
        cur.execute(f"ALTER TABLE {table} SET (autovacuum_enabled = false)")
        conn.commit()

        # Phase 1: Parse, validate, and filter rows from the gzipped file.
        # We use a generator to avoid materialising millions of rows in memory.
        def _valid_rows():
            nonlocal lines, skipped, errors
            with gzip.open(file_path, "rt", encoding="utf-8", errors="replace") as f:
                for line in f:
                    lines += 1

                    if lines % PROGRESS_INTERVAL == 0:
                        elapsed = time.monotonic() - t0
                        rate = lines / elapsed if elapsed > 0 else 0
                        logger.info(
                            "  %dM lines | %d loaded | %d skipped | %.0f lines/sec",
                            lines // 1_000_000, loaded, skipped, rate,
                        )

                    parsed = parser(line)
                    if parsed is None:
                        errors += 1
                        continue

                    pmid = parsed[0]
                    if pmid not in corpus_pmids:
                        skipped += 1
                        continue

                    yield parsed

        # Phase 2: Feed only valid, filtered rows into a single COPY.
        try:
            with cur.copy(f"COPY {table} ({columns}) FROM STDIN") as copy:
                for row in _valid_rows():
                    copy.write_row(row)
                    loaded += 1
        except Exception as exc:
            # A COPY-level failure aborts the whole batch; log clearly
            logger.error(
                "%s COPY aborted after %d rows: %s", label, loaded, exc,
            )
            conn.rollback()
            # Re-commit the TRUNCATE so the table is clean for retry
            with conn.cursor() as cur2:
                cur2.execute(f"TRUNCATE {table}")
            conn.commit()
            errors += 1
        else:
            conn.commit()

        cur.execute(f"ALTER TABLE {table} SET (autovacuum_enabled = true)")
        conn.commit()

    elapsed = time.monotonic() - t0
    stats = {
        "lines": lines,
        "loaded": loaded,
        "skipped": skipped,
        "errors": errors,
        "elapsed_seconds": round(elapsed, 1),
        "rate": round(loaded / elapsed) if elapsed > 0 else 0,
    }
    logger.info(
        "%s load complete: %d loaded, %d skipped, %d errors in %.1fs (%d rows/sec)",
        label, loaded, skipped, errors, elapsed, stats["rate"],
    )
    return stats


def load_entities(conn: psycopg.Connection, corpus_pmids: set[int]) -> dict:
    """Stream entities from PubTator3 dump, filtering to corpus PMIDs."""
    return _stream_load(
        conn,
        corpus_pmids,
        table="pubtator.entity_annotations",
        columns="pmid, entity_type, concept_id, mentions, resource",
        parser=_parse_entity_line,
        file_path=settings.pubtator_entities_path,
        label="Entity",
    )


def load_relations(conn: psycopg.Connection, corpus_pmids: set[int]) -> dict:
    """Stream relations from PubTator3 dump, filtering to corpus PMIDs."""
    return _stream_load(
        conn,
        corpus_pmids,
        table="pubtator.relations",
        columns="pmid, relation_type, subject_type, subject_id, object_type, object_id",
        parser=_parse_relation_line,
        file_path=settings.pubtator_relations_path,
        label="Relation",
    )


# ─── Index creation ─────────────────────────────────────────

INDEXES = [
    # Entity indexes
    (
        "idx_pt_entity_pmid",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_pmid "
        "ON pubtator.entity_annotations(pmid)",
    ),
    (
        "idx_pt_entity_concept",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_concept "
        "ON pubtator.entity_annotations(concept_id)",
    ),
    (
        "idx_pt_entity_type",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_type "
        "ON pubtator.entity_annotations(entity_type)",
    ),
    (
        "idx_pt_entity_pmid_type",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_pmid_type "
        "ON pubtator.entity_annotations(pmid, entity_type)",
    ),
    (
        "idx_pt_entity_disease",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_disease "
        "ON pubtator.entity_annotations(pmid, concept_id) WHERE entity_type = 'disease'",
    ),
    (
        "idx_pt_entity_chemical",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_chemical "
        "ON pubtator.entity_annotations(pmid, concept_id) WHERE entity_type = 'chemical'",
    ),
    (
        "idx_pt_entity_gene",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_entity_gene "
        "ON pubtator.entity_annotations(pmid, concept_id) WHERE entity_type = 'gene'",
    ),
    # Relation indexes
    (
        "idx_pt_relation_pmid",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_relation_pmid "
        "ON pubtator.relations(pmid)",
    ),
    (
        "idx_pt_relation_subject",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_relation_subject "
        "ON pubtator.relations(subject_type, subject_id)",
    ),
    (
        "idx_pt_relation_object",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_relation_object "
        "ON pubtator.relations(object_type, object_id)",
    ),
    (
        "idx_pt_relation_type",
        "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pt_relation_type "
        "ON pubtator.relations(relation_type)",
    ),
]


def create_indexes(conn: psycopg.Connection) -> None:
    """Create indexes after bulk load.

    Uses CREATE INDEX CONCURRENTLY which requires autocommit mode
    (can't run inside a transaction).
    """
    logger.info("Creating indexes (%d total) ...", len(INDEXES))
    conn.autocommit = True
    try:
        for name, ddl in INDEXES:
            t0 = time.monotonic()
            try:
                with conn.cursor() as cur:
                    cur.execute(ddl)
                logger.info("  %-30s (%.1fs)", name, time.monotonic() - t0)
            except Exception as e:
                logger.error("  %-30s FAILED: %s", name, e)
    finally:
        conn.autocommit = False
    logger.info("Index creation complete")


def analyze_tables(conn: psycopg.Connection) -> None:
    """Run ANALYZE for query planner optimization."""
    logger.info("Analyzing tables ...")
    with conn.cursor() as cur:
        cur.execute("ANALYZE pubtator.entity_annotations")
        cur.execute("ANALYZE pubtator.relations")
    conn.commit()
    logger.info("Analysis complete")


# ─── Log to load_history ────────────────────────────────────

def _log_history(
    conn: psycopg.Connection,
    entity_stats: dict | None,
    relation_stats: dict | None,
) -> None:
    """Record PubTator3 load in solemd.load_history."""
    total_loaded = (
        (entity_stats.get("loaded", 0) if entity_stats else 0)
        + (relation_stats.get("loaded", 0) if relation_stats else 0)
    )
    total_processed = (
        (entity_stats.get("lines", 0) if entity_stats else 0)
        + (relation_stats.get("lines", 0) if relation_stats else 0)
    )

    metadata = {}
    if entity_stats:
        metadata["entities"] = entity_stats
    if relation_stats:
        metadata["relations"] = relation_stats

    log_etl_run(
        conn,
        operation="load_pubtator3",
        source="bioconcepts2pubtator3.gz + relation2pubtator3.gz",
        rows_processed=total_processed,
        rows_loaded=total_loaded,
        status="completed",
        metadata=metadata,
    )


# ─── Main ───────────────────────────────────────────────────

def run_pubtator(
    *,
    entities_only: bool = False,
    relations_only: bool = False,
    skip_indexes: bool = False,
) -> dict:
    """Run the full PubTator3 loading pipeline.

    Args:
        entities_only: Load only entity annotations.
        relations_only: Load only relations.
        skip_indexes: Skip index creation after load.

    Returns:
        Dict with load statistics.
    """
    t_start = time.monotonic()
    entity_stats = None
    relation_stats = None

    with db.connect() as conn:
        corpus_pmids = _load_corpus_pmids(conn)

        if not corpus_pmids:
            logger.error("No PMIDs in solemd.corpus — run filter.py first")
            return {"error": "empty corpus"}

        if not relations_only:
            entity_stats = load_entities(conn, corpus_pmids)

        if not entities_only:
            relation_stats = load_relations(conn, corpus_pmids)

    # Indexes require autocommit — use separate connection
    if not skip_indexes:
        with db.connect_autocommit() as conn:
            create_indexes(conn)

    with db.connect() as conn:
        analyze_tables(conn)
        _log_history(conn, entity_stats, relation_stats)

    elapsed = time.monotonic() - t_start
    logger.info("=" * 60)
    logger.info("PubTator3 load complete (%.1fs / %.1f min)", elapsed, elapsed / 60)
    if entity_stats:
        logger.info("  Entities:  %d loaded", entity_stats["loaded"])
    if relation_stats:
        logger.info("  Relations: %d loaded", relation_stats["loaded"])
    logger.info("=" * 60)

    return {
        "entities": entity_stats,
        "relations": relation_stats,
        "elapsed_seconds": round(elapsed, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Load PubTator3 data into PostgreSQL")
    parser.add_argument("--entities-only", action="store_true", help="Load only entity annotations")
    parser.add_argument("--relations-only", action="store_true", help="Load only relations")
    parser.add_argument("--skip-indexes", action="store_true", help="Skip index creation")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    run_pubtator(
        entities_only=args.entities_only,
        relations_only=args.relations_only,
        skip_indexes=args.skip_indexes,
    )


if __name__ == "__main__":
    main()
