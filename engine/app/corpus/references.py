"""Sync outgoing references for graph-tier papers via the S2 batch API.

Populates `solemd.paper_references` from Semantic Scholar Graph API `references.*`
fields and derives domain-domain citation edges into `solemd.citations`.

This is intentionally separate from `enrich.py`:
- full metadata enrichment owns paper-local metadata
- reference sync owns outgoing bibliography and graph edges

Usage:
    cd /workspaces/SoleMD.Graph/engine
    uv run python -m app.corpus.references --dry-run
    uv run python -m app.corpus.references --limit 1000 --release-id s2-2026-03-20
"""

from __future__ import annotations

import argparse
import logging
import time

import psycopg

from app import db
from app.corpus._etl import coalesce_release_id, jsonb, log_etl_run
from app.corpus.s2_client import S2Client
from app.config import settings

logger = logging.getLogger(__name__)

REFERENCE_FIELDS = ",".join(
    [
        "references.paperId",
        "references.corpusId",
        "references.title",
        "references.year",
        "references.externalIds",
    ]
)

CHECKPOINT_INTERVAL = 100


def _get_unchecked_reference_ids(
    conn: psycopg.Connection,
    *,
    release_id: str = "",
) -> list[int]:
    params: tuple[str, ...] | tuple[()] = ()
    if release_id:
        query = """
            SELECT p.corpus_id
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.corpus_tier = 'graph'
              AND p.s2_references_release_id IS DISTINCT FROM %s
              AND p.s2_found IS DISTINCT FROM false
            ORDER BY p.corpus_id
        """
        params = (release_id,)
    else:
        query = """
            SELECT p.corpus_id
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.corpus_tier = 'graph'
              AND p.s2_references_checked_at IS NULL
              AND p.s2_found IS DISTINCT FROM false
            ORDER BY p.corpus_id
        """

    with conn.cursor() as cur:
        cur.execute(query, params)
        return [row["corpus_id"] for row in cur.fetchall()]


def _extract_external_id(external_ids: dict, *keys: str) -> str | None:
    if not external_ids:
        return None

    lowered = {str(key).lower(): value for key, value in external_ids.items()}
    for key in keys:
        value = lowered.get(key.lower())
        if value:
            return str(value)
    return None


def _collect_valid_domain_corpus_ids(
    conn: psycopg.Connection,
    results: list[dict | None],
) -> set[int]:
    candidate_ids: set[int] = set()

    for result in results:
        if result is None:
            continue
        for ref in result.get("references") or []:
            corpus_id = ref.get("corpusId")
            if corpus_id is None:
                continue
            try:
                candidate_ids.add(int(corpus_id))
            except (TypeError, ValueError):
                continue

    if not candidate_ids:
        return set()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT corpus_id
            FROM solemd.corpus
            WHERE corpus_id = ANY(%s)
            """,
            (list(candidate_ids),),
        )
        return {int(row["corpus_id"]) for row in cur.fetchall()}


def _replace_references(
    conn: psycopg.Connection,
    corpus_id: int,
    result: dict,
    *,
    valid_domain_corpus_ids: set[int],
    release_id: str = "",
) -> int:
    references = result.get("references") or []

    with conn.cursor() as cur:
        cur.execute("DELETE FROM solemd.paper_references WHERE corpus_id = %s", (corpus_id,))

        inserted = 0
        for reference_index, ref in enumerate(references, start=1):
            external_ids = ref.get("externalIds") or {}
            referenced_corpus_id = ref.get("corpusId")
            try:
                normalized_corpus_id = int(referenced_corpus_id)
            except (TypeError, ValueError):
                normalized_corpus_id = None

            if normalized_corpus_id not in valid_domain_corpus_ids:
                normalized_corpus_id = None

            cur.execute(
                """
                INSERT INTO solemd.paper_references (
                    corpus_id,
                    reference_index,
                    referenced_paper_id,
                    referenced_corpus_id,
                    title,
                    year,
                    external_ids,
                    doi,
                    pmid,
                    pmcid,
                    arxiv_id,
                    acl_id,
                    dblp_id,
                    mag_id,
                    source_release_id,
                    updated_at
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, now()
                )
                """,
                (
                    corpus_id,
                    reference_index,
                    ref.get("paperId"),
                    normalized_corpus_id,
                    ref.get("title"),
                    ref.get("year"),
                    jsonb(external_ids),
                    _extract_external_id(external_ids, "doi"),
                    _extract_external_id(external_ids, "pmid"),
                    _extract_external_id(external_ids, "pmcid"),
                    _extract_external_id(external_ids, "arxiv", "arxivId"),
                    _extract_external_id(external_ids, "acl"),
                    _extract_external_id(external_ids, "dblp"),
                    _extract_external_id(external_ids, "mag"),
                    coalesce_release_id(release_id),
                ),
            )
            inserted += 1

        cur.execute(
            """
            UPDATE solemd.papers
            SET s2_references_checked_at = now(),
                s2_references_release_id = COALESCE(%s, s2_references_release_id),
                s2_found = true,
                updated_at = now()
            WHERE corpus_id = %s
            """,
            (coalesce_release_id(release_id), corpus_id),
        )

    return inserted


def _mark_reference_not_found(
    conn: psycopg.Connection,
    corpus_id: int,
    *,
    release_id: str = "",
) -> None:
    with conn.cursor() as cur:
        cur.execute("DELETE FROM solemd.paper_references WHERE corpus_id = %s", (corpus_id,))
        cur.execute("DELETE FROM solemd.citations WHERE citing_corpus_id = %s", (corpus_id,))
        cur.execute(
            """
            UPDATE solemd.papers
            SET s2_references_checked_at = now(),
                s2_references_release_id = COALESCE(%s, s2_references_release_id),
                s2_found = COALESCE(s2_found, false),
                updated_at = now()
            WHERE corpus_id = %s
            """,
            (coalesce_release_id(release_id), corpus_id),
        )


def _rebuild_citations(
    conn: psycopg.Connection,
    corpus_ids: list[int],
    *,
    release_id: str = "",
) -> int:
    if not corpus_ids:
        return 0

    with conn.cursor() as cur:
        cur.execute(
            "DELETE FROM solemd.citations WHERE citing_corpus_id = ANY(%s)",
            (corpus_ids,),
        )
        cur.execute(
            """
            INSERT INTO solemd.citations (
                citing_corpus_id,
                cited_corpus_id,
                cited_paper_id,
                source_release_id,
                updated_at
            )
            SELECT DISTINCT
                pr.corpus_id,
                pr.referenced_corpus_id,
                pr.referenced_paper_id,
                %s,
                now()
            FROM solemd.paper_references pr
            WHERE pr.corpus_id = ANY(%s)
              AND pr.referenced_corpus_id IS NOT NULL
              AND pr.referenced_corpus_id != pr.corpus_id
            """,
            (coalesce_release_id(release_id), corpus_ids),
        )
        return cur.rowcount


def _log_checkpoint(
    conn: psycopg.Connection,
    *,
    synced_papers: int,
    inserted_references: int,
    citation_edges: int,
    nulls: int,
    errors: int,
    total: int,
    elapsed: float,
    client_stats: dict,
) -> None:
    metadata = {
        "synced_papers": synced_papers,
        "inserted_references": inserted_references,
        "citation_edges": citation_edges,
        "nulls": nulls,
        "errors": errors,
        "remaining": total - synced_papers - nulls - errors,
        "elapsed_seconds": round(elapsed, 1),
        "client_stats": client_stats,
    }
    log_etl_run(
        conn,
        operation="sync_paper_references",
        source="S2 batch API",
        rows_processed=synced_papers + nulls + errors,
        rows_loaded=synced_papers,
        status="checkpoint",
        metadata=metadata,
    )


def run_reference_sync(
    *,
    limit: int = 0,
    dry_run: bool = False,
    release_id: str = "",
) -> dict:
    t_start = time.monotonic()

    with db.connect() as conn:
        corpus_ids = _get_unchecked_reference_ids(conn, release_id=release_id)

    if limit:
        corpus_ids = corpus_ids[:limit]

    if release_id:
        logger.info(
            "%d papers need reference sync for release %s",
            len(corpus_ids),
            release_id,
        )
    else:
        logger.info("%d papers need reference sync", len(corpus_ids))

    if not corpus_ids:
        logger.info("Nothing to sync")
        return {"synced_papers": 0, "total": 0}

    if dry_run:
        logger.info("Dry run — would sync references for %d papers", len(corpus_ids))
        return {"total": len(corpus_ids), "dry_run": True}

    synced_papers = 0
    inserted_references = 0
    citation_edges = 0
    nulls = 0
    errors = 0
    batch_count = 0
    batch_size = 500

    with S2Client() as client, db.connect() as conn:
        for i in range(0, len(corpus_ids), batch_size):
            batch = corpus_ids[i : i + batch_size]
            batch_count += 1

            try:
                results = client.fetch_batch(batch, REFERENCE_FIELDS)
            except RuntimeError as exc:
                logger.error("Reference batch %d failed: %s — skipping", batch_count, exc)
                errors += len(batch)
                continue

            valid_domain_corpus_ids = _collect_valid_domain_corpus_ids(conn, results)
            successful_batch_ids: list[int] = []

            for j, result in enumerate(results):
                corpus_id = batch[j]
                if result is None:
                    _mark_reference_not_found(conn, corpus_id, release_id=release_id)
                    nulls += 1
                    continue

                try:
                    inserted_references += _replace_references(
                        conn,
                        corpus_id,
                        result,
                        valid_domain_corpus_ids=valid_domain_corpus_ids,
                        release_id=release_id,
                    )
                except (psycopg.errors.DataError, KeyError, TypeError, ValueError) as exc:
                    logger.warning("Error syncing references for corpus_id %d: %s", corpus_id, exc)
                    errors += 1
                    continue

                synced_papers += 1
                successful_batch_ids.append(corpus_id)

            citation_edges += _rebuild_citations(
                conn,
                successful_batch_ids,
                release_id=release_id,
            )
            conn.commit()

            if batch_count % CHECKPOINT_INTERVAL == 0:
                elapsed = time.monotonic() - t_start
                _log_checkpoint(
                    conn,
                    synced_papers=synced_papers,
                    inserted_references=inserted_references,
                    citation_edges=citation_edges,
                    nulls=nulls,
                    errors=errors,
                    total=len(corpus_ids),
                    elapsed=elapsed,
                    client_stats=client.stats,
                )
                logger.info(
                    "Checkpoint @ batch %d: %d papers, %d refs, %d citation edges, %d null, %d errors (%.0f min)",
                    batch_count,
                    synced_papers,
                    inserted_references,
                    citation_edges,
                    nulls,
                    errors,
                    elapsed / 60,
                )

    elapsed = time.monotonic() - t_start
    stats = {
        "synced_papers": synced_papers,
        "inserted_references": inserted_references,
        "citation_edges": citation_edges,
        "nulls": nulls,
        "errors": errors,
        "total": len(corpus_ids),
        "elapsed_seconds": round(elapsed, 1),
        "release_id": release_id or None,
    }

    with db.connect() as conn:
        log_etl_run(
            conn,
            operation="sync_paper_references",
            source="S2 batch API",
            rows_processed=synced_papers + nulls + errors,
            rows_loaded=synced_papers,
            status="completed",
            metadata=stats,
        )

    logger.info("=" * 60)
    logger.info("Reference sync complete (%.1f min)", elapsed / 60)
    logger.info("  Papers synced: %d", synced_papers)
    logger.info("  References inserted: %d", inserted_references)
    logger.info("  Citation edges materialized: %d", citation_edges)
    logger.info("  Null (unknown to S2): %d", nulls)
    logger.info("  Errors: %d", errors)
    logger.info("  Total: %d", len(corpus_ids))
    logger.info("=" * 60)

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync outgoing references via S2 batch API")
    parser.add_argument("--limit", type=int, default=0, help="Max papers to sync (0=unlimited)")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no API calls")
    parser.add_argument(
        "--release-id",
        default=settings.s2_release_id,
        help="Semantic Scholar release ID for release-aware reference tracking",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    run_reference_sync(
        limit=args.limit,
        dry_run=args.dry_run,
        release_id=args.release_id,
    )


if __name__ == "__main__":
    main()
