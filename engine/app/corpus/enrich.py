"""Enrich mapped-universe papers via S2 batch API.

Pulls stable S2 paper metadata, author snapshots, OA PDF metadata,
abstracts, TLDRs, SPECTER2 embeddings, and text availability for mapped-universe
papers in solemd.corpus that don't yet have them. Updates solemd.papers and
related normalized tables in place. Supports resume (skips already-enriched rows).

Only papers with layout_status = 'mapped' are enriched. Candidate papers
are metadata-only and deferred until they are promoted into the mapped universe.

Time estimate:
    ~2.5M mapped-universe papers / 500 per batch = ~5K requests
    At 1 req/sec with overhead ≈ 1.4 hours
    Resumable: can stop (Ctrl+C) and restart at any time

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.enrich                          # all missing
    uv run python -m app.corpus.enrich --limit 1000             # first 1000 only
    uv run python -m app.corpus.enrich --embedding-only         # just embeddings
    uv run python -m app.corpus.enrich --dry-run                # count only
"""

from __future__ import annotations

import argparse
import logging
import time
from collections.abc import Iterable

import psycopg
import psycopg.errors

from app import db
from app.corpus._etl import coalesce_release_id, jsonb, log_etl_run
from app.corpus.s2_client import S2Client
from app.config import settings

logger = logging.getLogger(__name__)

# S2 batch API fields for enrichment.
ENRICH_FIELDS = ",".join(
    [
        "paperId",
        "externalIds",
        "abstract",
        "tldr",
        "embedding.specter_v2",
        "textAvailability",
        "publicationVenue",
        "journal",
        "openAccessPdf",
        "authors.authorId",
        "authors.name",
        "authors.affiliations",
        "authors.externalIds",
    ]
)
EMBEDDING_FIELDS = "embedding.specter_v2"

# Commit progress every N batches to avoid losing work on crash
CHECKPOINT_INTERVAL = 100

# Stop the run if this many consecutive batches fail (API down, key revoked, etc.)
# Prevents hammering a broken API with thousands of doomed requests.
MAX_CONSECUTIVE_BATCH_FAILURES = 10


def _get_unenriched_ids(
    conn: psycopg.Connection,
    embedding_only: bool = False,
    *,
    release_id: str = "",
) -> list[int]:
    """Get corpus_ids that need enrichment (mapped-universe only).

    Only papers with layout_status = 'mapped' are enriched. Candidate papers
    are metadata-only until promoted into the mapped universe.

    Args:
        embedding_only: Only fetch papers missing embeddings.

    Returns:
        List of corpus_ids to enrich.
    """
    params: tuple[str, ...] | tuple[()] = ()
    if embedding_only:
        if release_id:
            query = """
                SELECT p.corpus_id FROM solemd.papers p
                JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
                WHERE c.layout_status = 'mapped'
                  AND p.s2_embedding_release_id IS DISTINCT FROM %s
                  AND p.s2_found IS DISTINCT FROM false
                ORDER BY p.corpus_id
            """
            params = (release_id,)
        else:
            query = """
                SELECT p.corpus_id FROM solemd.papers p
                JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
                WHERE c.layout_status = 'mapped'
                  AND p.embedding IS NULL
                  AND p.s2_embedding_checked_at IS NULL
                  AND p.s2_found IS DISTINCT FROM false
                ORDER BY p.corpus_id
            """
    else:
        if release_id:
            query = """
                SELECT p.corpus_id FROM solemd.papers p
                JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
                WHERE c.layout_status = 'mapped'
                  AND p.s2_full_release_id IS DISTINCT FROM %s
                ORDER BY p.corpus_id
            """
            params = (release_id,)
        else:
            query = """
                SELECT p.corpus_id FROM solemd.papers p
                JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
                WHERE c.layout_status = 'mapped'
                  AND p.s2_full_checked_at IS NULL
                ORDER BY p.corpus_id
            """

    with conn.cursor() as cur:
        cur.execute(query, params)
        return [row["corpus_id"] for row in cur.fetchall()]


def _format_embedding(vector: list[float]) -> str:
    """Format embedding vector for PostgreSQL pgvector insertion.

    pgvector expects format: [0.1,0.2,0.3,...] (no spaces).
    """
    return "[" + ",".join(str(x) for x in vector) + "]"


def _text_array(values: Iterable[str] | None) -> list[str]:
    if not values:
        return []
    return [value for value in values if value]


def _write_batch(
    conn: psycopg.Connection,
    batch_pairs: list[tuple[int, dict]],
    null_corpus_ids: list[int],
    *,
    release_id: str = "",
    embedding_only: bool = False,
) -> tuple[int, int]:
    """Write an entire API batch to the database using batch operations.

    Instead of ~15 SQL statements per paper (4,500+ for a 300-paper batch),
    this uses batch DELETEs and executemany() with psycopg3's pipeline mode
    to reduce round-trips to ~10 total operations.

    Args:
        batch_pairs: List of (corpus_id, result_dict) for found papers.
        null_corpus_ids: List of corpus_ids where S2 returned null.
        release_id: S2 release ID for tracking.
        embedding_only: Only update embeddings.

    Returns:
        Tuple of (enriched_count, error_count).
    """
    if not batch_pairs and not null_corpus_ids:
        return 0, 0

    rel_id = coalesce_release_id(release_id)
    enriched = 0
    errors = 0

    with conn.cursor() as cur:
        # ── Mark not-found papers ────────────────────────────
        if null_corpus_ids:
            if embedding_only:
                cur.executemany(
                    """
                    UPDATE solemd.papers SET
                        s2_embedding_checked_at = now(),
                        s2_embedding_release_id = COALESCE(%s, s2_embedding_release_id),
                        s2_found = false, updated_at = now()
                    WHERE corpus_id = %s
                    """,
                    [(rel_id, cid) for cid in null_corpus_ids],
                )
            else:
                cur.executemany(
                    """
                    UPDATE solemd.papers SET
                        s2_full_checked_at = now(), s2_embedding_checked_at = now(),
                        s2_full_release_id = COALESCE(%s, s2_full_release_id),
                        s2_embedding_release_id = COALESCE(%s, s2_embedding_release_id),
                        s2_found = false, updated_at = now()
                    WHERE corpus_id = %s
                    """,
                    [(rel_id, rel_id, cid) for cid in null_corpus_ids],
                )

        if not batch_pairs:
            return 0, 0

        # ── Embedding-only fast path ─────────────────────────
        if embedding_only:
            emb_rows = []
            no_emb_rows = []
            for corpus_id, result in batch_pairs:
                emb_obj = result.get("embedding")
                if emb_obj:
                    emb_rows.append((_format_embedding(emb_obj["vector"]), rel_id, corpus_id))
                else:
                    no_emb_rows.append((rel_id, corpus_id))

            if emb_rows:
                cur.executemany(
                    """
                    UPDATE solemd.papers SET
                        embedding = %s, s2_embedding_checked_at = now(),
                        s2_embedding_release_id = COALESCE(%s, s2_embedding_release_id),
                        s2_found = true, updated_at = now()
                    WHERE corpus_id = %s
                    """,
                    emb_rows,
                )
            if no_emb_rows:
                cur.executemany(
                    """
                    UPDATE solemd.papers SET
                        s2_embedding_checked_at = now(),
                        s2_embedding_release_id = COALESCE(%s, s2_embedding_release_id),
                        s2_found = true, updated_at = now()
                    WHERE corpus_id = %s
                    """,
                    no_emb_rows,
                )
            return len(batch_pairs), 0

        # ── Full enrichment: collect phase ───────────────────
        corpus_ids_in_batch = [cid for cid, _ in batch_pairs]

        venue_rows = []        # for executemany upsert
        author_rows = []       # for executemany upsert into solemd.authors
        paper_author_rows = [] # for executemany insert
        affiliation_rows = []  # for executemany insert
        asset_rows = []        # for executemany insert
        paper_rows = []        # for executemany update

        # Check for duplicate paper_ids in one query
        all_paper_ids = [
            r.get("paperId") for _, r in batch_pairs if r.get("paperId")
        ]
        claimed_paper_ids: set[str] = set()
        if all_paper_ids:
            cur.execute(
                "SELECT paper_id FROM solemd.papers "
                "WHERE paper_id = ANY(%s) AND corpus_id != ALL(%s)",
                (all_paper_ids, corpus_ids_in_batch),
            )
            claimed_paper_ids = {row["paper_id"] for row in cur.fetchall()}

        for corpus_id, result in batch_pairs:
            try:
                # Publication venue
                pub_venue = result.get("publicationVenue")
                venue_id = None
                if pub_venue and pub_venue.get("id"):
                    venue_id = pub_venue["id"]
                    venue_rows.append((
                        venue_id,
                        pub_venue.get("name"),
                        pub_venue.get("type"),
                        pub_venue.get("issn"),
                        pub_venue.get("url"),
                        _text_array(pub_venue.get("alternate_names")),
                        _text_array(pub_venue.get("alternate_urls")),
                        rel_id,
                    ))

                # Authors
                for pos, author in enumerate(result.get("authors") or [], start=1):
                    author_id = author.get("authorId")
                    author_name = author.get("name") or "Unknown author"
                    affiliations = _text_array(author.get("affiliations"))
                    ext_ids = author.get("externalIds") or {}

                    if author_id:
                        author_rows.append((
                            author_id, author_name, jsonb(ext_ids), rel_id,
                        ))

                    paper_author_rows.append((
                        corpus_id, pos, author_id, author_name,
                        affiliations, jsonb(ext_ids), rel_id,
                    ))

                    for aff_idx, raw_aff in enumerate(affiliations, start=1):
                        affiliation_rows.append((
                            corpus_id, pos, aff_idx, raw_aff, rel_id,
                        ))

                # OA PDF asset
                oa_pdf = result.get("openAccessPdf")
                if oa_pdf and oa_pdf.get("url"):
                    asset_rows.append((
                        corpus_id, rel_id,
                        oa_pdf.get("url"), oa_pdf.get("status"),
                        oa_pdf.get("license"), oa_pdf.get("disclaimer"),
                        jsonb(oa_pdf),
                    ))

                # Paper update
                abstract = result.get("abstract")
                tldr_obj = result.get("tldr")
                tldr = tldr_obj["text"] if tldr_obj else None
                emb_obj = result.get("embedding")
                embedding = _format_embedding(emb_obj["vector"]) if emb_obj else None
                text_avail = result.get("textAvailability")
                paper_id = result.get("paperId")
                ext_ids = result.get("externalIds") or {}
                journal = result.get("journal") or {}

                # Skip paper_id if already claimed by another corpus_id
                if paper_id and paper_id in claimed_paper_ids:
                    logger.warning(
                        "Duplicate S2 paper_id %s — corpus_id %d shares "
                        "paper with another row, skipping paper_id write",
                        paper_id, corpus_id,
                    )
                    paper_id = None

                paper_rows.append((
                    paper_id, jsonb(ext_ids), venue_id,
                    journal.get("name"), journal.get("volume"),
                    journal.get("issue"), journal.get("pages"),
                    abstract, tldr, embedding, text_avail,
                    rel_id, rel_id, corpus_id,
                ))
                enriched += 1
            except (KeyError, TypeError) as e:
                logger.warning("Error processing corpus_id %d: %s", corpus_id, e)
                errors += 1

        # ── Batch write phase ────────────────────────────────
        # 1. Batch DELETE related rows for all corpus_ids at once
        cur.execute(
            "DELETE FROM solemd.author_affiliations WHERE corpus_id = ANY(%s)",
            (corpus_ids_in_batch,),
        )
        cur.execute(
            "DELETE FROM solemd.paper_authors WHERE corpus_id = ANY(%s)",
            (corpus_ids_in_batch,),
        )
        cur.execute(
            """
            DELETE FROM solemd.paper_assets
            WHERE corpus_id = ANY(%s)
              AND asset_kind = 'open_access_pdf'
              AND source = 'semantic_scholar_graph_api'
            """,
            (corpus_ids_in_batch,),
        )

        # 2. Upsert publication venues (deduplicated)
        if venue_rows:
            seen_venues: set[str] = set()
            unique_venues = []
            for row in venue_rows:
                if row[0] not in seen_venues:
                    seen_venues.add(row[0])
                    unique_venues.append(row)

            cur.executemany(
                """
                INSERT INTO solemd.publication_venues (
                    publication_venue_id, name, venue_type, issn, url,
                    alternate_names, alternate_urls, last_seen_release_id, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (publication_venue_id) DO UPDATE SET
                    name = EXCLUDED.name, venue_type = EXCLUDED.venue_type,
                    issn = EXCLUDED.issn, url = EXCLUDED.url,
                    alternate_names = EXCLUDED.alternate_names,
                    alternate_urls = EXCLUDED.alternate_urls,
                    last_seen_release_id = EXCLUDED.last_seen_release_id,
                    updated_at = now()
                """,
                unique_venues,
            )

        # 3. Upsert authors (deduplicated within batch)
        if author_rows:
            seen_authors: set[str] = set()
            unique_authors = []
            for row in author_rows:
                if row[0] not in seen_authors:
                    seen_authors.add(row[0])
                    unique_authors.append(row)

            cur.executemany(
                """
                INSERT INTO solemd.authors (
                    author_id, name, external_ids, last_seen_release_id, updated_at
                )
                VALUES (%s, %s, %s, %s, now())
                ON CONFLICT (author_id) DO UPDATE SET
                    name = EXCLUDED.name, external_ids = EXCLUDED.external_ids,
                    last_seen_release_id = EXCLUDED.last_seen_release_id,
                    updated_at = now()
                """,
                unique_authors,
            )

        # 4. Insert paper_authors
        if paper_author_rows:
            cur.executemany(
                """
                INSERT INTO solemd.paper_authors (
                    corpus_id, author_position, author_id, name,
                    affiliations, external_ids, source_release_id, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, now())
                """,
                paper_author_rows,
            )

        # 5. Insert author_affiliations
        if affiliation_rows:
            cur.executemany(
                """
                INSERT INTO solemd.author_affiliations (
                    corpus_id, author_position, affiliation_index,
                    raw_affiliation, source_release_id, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, now())
                """,
                affiliation_rows,
            )

        # 6. Insert OA PDF assets
        if asset_rows:
            cur.executemany(
                """
                INSERT INTO solemd.paper_assets (
                    corpus_id, asset_kind, source, source_release_id,
                    remote_url, access_status, license, disclaimer, metadata, updated_at
                )
                VALUES (%s, 'open_access_pdf', 'semantic_scholar_graph_api', %s,
                        %s, %s, %s, %s, %s, now())
                """,
                asset_rows,
            )

        # 7. Update papers
        if paper_rows:
            cur.executemany(
                """
                UPDATE solemd.papers SET
                    paper_id = COALESCE(%s, paper_id),
                    paper_external_ids = %s,
                    publication_venue_id = COALESCE(%s, publication_venue_id),
                    journal_name = COALESCE(%s, journal_name),
                    journal_volume = COALESCE(%s, journal_volume),
                    journal_issue = COALESCE(%s, journal_issue),
                    journal_pages = COALESCE(%s, journal_pages),
                    abstract = %s, tldr = %s, embedding = %s,
                    text_availability = %s,
                    s2_full_checked_at = now(), s2_embedding_checked_at = now(),
                    s2_full_release_id = COALESCE(%s, s2_full_release_id),
                    s2_embedding_release_id = COALESCE(%s, s2_embedding_release_id),
                    s2_found = true, updated_at = now()
                WHERE corpus_id = %s
                """,
                paper_rows,
            )

    return enriched, errors


def _log_checkpoint(
    conn: psycopg.Connection,
    enriched: int,
    errors: int,
    nulls: int,
    total: int,
    elapsed: float,
    client_stats: dict,
) -> None:
    """Write a checkpoint to load_history for resume tracking."""
    metadata = {
        "enriched": enriched,
        "errors": errors,
        "nulls": nulls,
        "remaining": total - enriched - errors - nulls,
        "elapsed_seconds": round(elapsed, 1),
        "client_stats": client_stats,
    }
    log_etl_run(
        conn,
        operation="enrich_papers",
        source="S2 batch API",
        rows_processed=enriched + errors + nulls,
        rows_loaded=enriched,
        status="checkpoint",
        metadata=metadata,
    )


def run_enrich(
    *,
    embedding_only: bool = False,
    limit: int = 0,
    dry_run: bool = False,
    release_id: str = "",
    batch_size: int = 0,
) -> dict:
    """Run batch API enrichment for unenriched papers.

    Args:
        embedding_only: Only fetch embeddings (not abstracts/TLDRs).
        limit: Max papers to enrich (0 = unlimited).
        dry_run: Count unenriched papers without fetching.
        batch_size: Papers per API request (max 500). 0 = auto-select
            based on mode: 300 for full enrichment (large responses with
            authors/embeddings), 500 for embedding-only (smaller payloads).

    Returns:
        Dict with enrichment statistics.
    """
    t_start = time.monotonic()

    with db.connect() as conn:
        corpus_ids = _get_unenriched_ids(conn, embedding_only=embedding_only, release_id=release_id)

    if limit:
        corpus_ids = corpus_ids[:limit]

    mode = "embedding-only" if embedding_only else "full"
    if release_id:
        logger.info("%d papers need %s enrichment for release %s", len(corpus_ids), mode, release_id)
    else:
        logger.info("%d papers need %s enrichment", len(corpus_ids), mode)

    if not corpus_ids:
        logger.info("Nothing to enrich")
        return {"enriched": 0, "total": 0}

    if dry_run:
        logger.info("Dry run — would enrich %d papers", len(corpus_ids))
        return {"total": len(corpus_ids), "dry_run": True}

    fields = EMBEDDING_FIELDS if embedding_only else ENRICH_FIELDS
    enriched = 0
    errors = 0
    nulls = 0
    batch_count = 0
    consecutive_failures = 0

    if not batch_size:
        batch_size = 500 if embedding_only else 300
    batch_size = min(batch_size, 500)  # hard API cap
    total_batches = (len(corpus_ids) + batch_size - 1) // batch_size
    logger.info(
        "Batch size: %d (%d batches, ~%.1f hours at measured pace)",
        batch_size, total_batches, total_batches * 7.0 / 3600,
    )

    with S2Client() as client, db.connect() as conn:
        for i in range(0, len(corpus_ids), batch_size):
            batch = corpus_ids[i : i + batch_size]
            batch_count += 1

            try:
                results = client.fetch_batch(batch, fields)
            except RuntimeError as e:
                consecutive_failures += 1
                logger.error(
                    "Batch %d failed (%d consecutive): %s — skipping",
                    batch_count, consecutive_failures, e,
                )
                errors += len(batch)
                if consecutive_failures >= MAX_CONSECUTIVE_BATCH_FAILURES:
                    logger.critical(
                        "ABORTING: %d consecutive batch failures — API may be "
                        "down or key revoked. Stopping to avoid further damage. "
                        "Re-run to resume from where we left off.",
                        consecutive_failures,
                    )
                    break
                continue

            consecutive_failures = 0

            # Separate found vs null results
            batch_pairs = []
            null_ids = []
            for j, result in enumerate(results):
                if result is None:
                    null_ids.append(batch[j])
                else:
                    batch_pairs.append((batch[j], result))

            # Batch write — all DB ops for this batch in ~10 operations
            batch_enriched, batch_errors = _write_batch(
                conn, batch_pairs, null_ids,
                release_id=release_id,
                embedding_only=embedding_only,
            )
            enriched += batch_enriched
            errors += batch_errors
            nulls += len(null_ids)

            conn.commit()

            # Checkpoint to load_history
            if batch_count % CHECKPOINT_INTERVAL == 0:
                elapsed = time.monotonic() - t_start
                _log_checkpoint(
                    conn, enriched, errors, nulls,
                    len(corpus_ids), elapsed, client.stats,
                )
                logger.info(
                    "Checkpoint @ batch %d: %d enriched, %d null, %d errors (%.0f min)",
                    batch_count, enriched, nulls, errors, elapsed / 60,
                )

    # Final log
    elapsed = time.monotonic() - t_start
    stats = {
        "enriched": enriched,
        "errors": errors,
        "nulls": nulls,
        "total": len(corpus_ids),
        "elapsed_seconds": round(elapsed, 1),
        "mode": mode,
        "release_id": release_id or None,
    }

    with db.connect() as conn:
        log_etl_run(
            conn,
            operation="enrich_papers",
            source="S2 batch API",
            rows_processed=enriched + errors + nulls,
            rows_loaded=enriched,
            status="completed",
            metadata=stats,
        )

    logger.info("=" * 60)
    logger.info("Enrichment complete (%.1f min)", elapsed / 60)
    logger.info("  Enriched: %d", enriched)
    logger.info("  Null (unknown to S2): %d", nulls)
    logger.info("  Errors: %d", errors)
    logger.info("  Total: %d", len(corpus_ids))
    logger.info("=" * 60)

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich papers via S2 batch API")
    parser.add_argument(
        "--embedding-only", action="store_true", help="Only fetch embeddings"
    )
    parser.add_argument("--limit", type=int, default=0, help="Max papers to enrich (0=unlimited)")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no API calls")
    parser.add_argument(
        "--release-id",
        default=settings.s2_release_id,
        help="Semantic Scholar release ID for release-aware enrichment tracking",
    )
    parser.add_argument(
        "--batch-size", type=int, default=0,
        help="Papers per API request (max 500, 0=auto: 300 full / 500 embedding-only)",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    run_enrich(
        embedding_only=args.embedding_only,
        limit=args.limit,
        dry_run=args.dry_run,
        release_id=args.release_id,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
