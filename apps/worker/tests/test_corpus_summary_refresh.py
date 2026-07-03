from __future__ import annotations

import json
from uuid import UUID

import asyncpg
import pytest

from app.corpus.models import (
    StartCorpusSelectionRequest,
    StartSelectionSummaryRefreshRequest,
)
from app.corpus.runtime import run_corpus_selection
from app.corpus.summary_refresh import run_selection_summary_refresh
from app.db import open_pools
from corpus_test_support import seed_selection_fixture as _seed_selection_fixture


@pytest.mark.asyncio
async def test_selection_summary_refresh_applies_completed_enrichment(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        selection_run_id = UUID(
            await run_corpus_selection(
                StartCorpusSelectionRequest(
                    s2_release_tag="s2-2026-04-01",
                    pt3_release_tag="pt3-2026-04-01",
                    selector_version="selector-v1-refresh",
                    requested_by="tester",
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    s2_run_id, pubmed_run_id = await _seed_completed_enrichment(
        warehouse_dsns["admin"],
        selection_run_id,
    )
    await _truncate_selection_artifact(
        warehouse_dsns["admin"],
        selection_run_id,
        artifact_kind="paper_scope",
    )

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        before = await admin_connection.fetchrow(
            """
            SELECT
                incoming_citation_count,
                s2_fields_of_study,
                publication_type_tracks,
                mesh_major_tracks
            FROM solemd.paper_selection_summary summary
            JOIN solemd.papers papers
              ON papers.corpus_id = summary.corpus_id
            WHERE summary.corpus_selection_run_id = $1
              AND papers.s2_paper_id = 'S2-101'
            """,
            selection_run_id,
        )
    finally:
        await admin_connection.close()
    assert before is not None
    assert before["incoming_citation_count"] == 0
    assert before["s2_fields_of_study"] == []
    assert before["publication_type_tracks"] == []
    assert before["mesh_major_tracks"] == []

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        refresh_run_id = UUID(
            await run_selection_summary_refresh(
                StartSelectionSummaryRefreshRequest(
                    corpus_selection_run_id=selection_run_id,
                    requested_by="tester",
                    s2_graph_enrichment_run_id=s2_run_id,
                    pubmed_metadata_fetch_run_id=pubmed_run_id,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        refreshed = await admin_connection.fetchrow(
            """
            SELECT
                incoming_citation_count,
                influential_citation_count,
                s2_fields_of_study,
                s2_publication_types,
                open_access_pdf_status,
                publication_venue_type,
                publication_type_tracks,
                mesh_major_tracks,
                mapped_priority_score,
                evidence_priority_score
            FROM solemd.paper_selection_summary summary
            JOIN solemd.papers papers
              ON papers.corpus_id = summary.corpus_id
            WHERE summary.corpus_selection_run_id = $1
              AND papers.s2_paper_id = 'S2-101'
            """,
            selection_run_id,
        )
        audit_row = await admin_connection.fetchrow(
            """
            SELECT
                status,
                summary_row_count,
                chunk_count,
                s2_enrichment_row_count,
                pubmed_metadata_row_count,
                pre_refresh_detail,
                post_refresh_detail
            FROM solemd.corpus_selection_summary_refresh_runs
            WHERE corpus_selection_summary_refresh_run_id = $1
            """,
            refresh_run_id,
        )
        chunk_metrics = await admin_connection.fetchrow(
            """
            SELECT
                count(*) FILTER (WHERE status = 'complete') AS complete_chunks,
                coalesce(sum((row_counts ->> 'summary_rows')::INTEGER), 0)
                    AS summary_rows,
                min(attempts) AS min_attempts,
                max(attempts) AS max_attempts
            FROM solemd.corpus_selection_chunks
            WHERE corpus_selection_run_id = $1
              AND phase_name = 'selection_summary'
            """,
            selection_run_id,
        )
    finally:
        await admin_connection.close()

    assert refreshed is not None
    assert refreshed["incoming_citation_count"] == 42
    assert refreshed["influential_citation_count"] == 7
    assert refreshed["s2_fields_of_study"] == ["medicine", "psychology"]
    assert refreshed["s2_publication_types"] == ["journalarticle"]
    assert refreshed["open_access_pdf_status"] == "gold"
    assert refreshed["publication_venue_type"] == "journal"
    assert refreshed["publication_type_tracks"] == [
        "Journal Article",
        "Meta-Analysis",
    ]
    assert refreshed["mesh_major_tracks"] == [
        "Mental Disorders",
        "Neoplasms",
    ]
    assert refreshed["mapped_priority_score"] > 0
    assert refreshed["evidence_priority_score"] > 0

    assert audit_row is not None
    assert audit_row["status"] == "complete"
    assert audit_row["summary_row_count"] == 7
    assert audit_row["chunk_count"] == runtime_settings.corpus_materialization_bucket_count
    assert audit_row["s2_enrichment_row_count"] == 1
    assert audit_row["pubmed_metadata_row_count"] == 1
    pre_refresh_detail = _jsonb_value(audit_row["pre_refresh_detail"])
    post_refresh_detail = _jsonb_value(audit_row["post_refresh_detail"])
    assert pre_refresh_detail["incoming_citation_rows"] == 0
    assert post_refresh_detail["incoming_citation_rows"] == 1
    assert post_refresh_detail["publication_type_track_rows"] == 1

    assert chunk_metrics is not None
    assert chunk_metrics["complete_chunks"] == runtime_settings.corpus_materialization_bucket_count
    assert chunk_metrics["summary_rows"] == 7
    assert chunk_metrics["min_attempts"] == 1
    assert chunk_metrics["max_attempts"] == 1


async def _seed_completed_enrichment(
    admin_dsn: str,
    selection_run_id: UUID,
) -> tuple[UUID, UUID]:
    connection = await asyncpg.connect(admin_dsn)
    try:
        target = await connection.fetchrow(
            """
            SELECT
                runs.s2_source_release_id,
                papers.corpus_id,
                papers.s2_paper_id,
                papers.pmid
            FROM solemd.corpus_selection_runs runs
            JOIN solemd.paper_selection_summary summary
              ON summary.corpus_selection_run_id = runs.corpus_selection_run_id
            JOIN solemd.papers papers
              ON papers.corpus_id = summary.corpus_id
            WHERE runs.corpus_selection_run_id = $1
              AND papers.s2_paper_id = 'S2-101'
            """,
            selection_run_id,
        )
        assert target is not None
        s2_run_id = await connection.fetchval(
            """
            INSERT INTO solemd.s2_graph_enrichment_runs (
                corpus_selection_run_id,
                s2_source_release_id,
                requested_by,
                status,
                completed_at
            )
            VALUES ($1, $2, 'tester', 'complete', now())
            RETURNING s2_graph_enrichment_run_id
            """,
            selection_run_id,
            int(target["s2_source_release_id"]),
        )
        await connection.execute(
            """
            INSERT INTO solemd.s2_graph_enrichment_tasks (
                s2_graph_enrichment_run_id,
                source_release_id,
                corpus_id,
                paper_id,
                status,
                completed_at
            )
            VALUES ($1, $2, $3, $4, 'complete', now())
            """,
            s2_run_id,
            int(target["s2_source_release_id"]),
            int(target["corpus_id"]),
            str(target["s2_paper_id"]),
        )
        await connection.execute(
            """
            INSERT INTO solemd.s2_paper_enrichment (
                source_release_id,
                paper_id,
                corpus_id,
                response_checksum,
                citation_count,
                influential_citation_count,
                publication_types,
                fields_of_study,
                open_access_pdf_status,
                publication_venue_type
            )
            VALUES (
                $1,
                $2,
                $3,
                's2-enrichment-checksum',
                42,
                7,
                ARRAY['JournalArticle']::TEXT[],
                ARRAY['Medicine', 'Psychology']::TEXT[],
                'gold',
                'journal'
            )
            """,
            int(target["s2_source_release_id"]),
            str(target["s2_paper_id"]),
            int(target["corpus_id"]),
        )
        pubmed_run_id = await connection.fetchval(
            """
            INSERT INTO solemd.pubmed_metadata_fetch_runs (
                corpus_selection_run_id,
                requested_by,
                status,
                completed_at
            )
            VALUES ($1, 'tester', 'complete', now())
            RETURNING pubmed_metadata_fetch_run_id
            """,
            selection_run_id,
        )
        await connection.execute(
            """
            INSERT INTO solemd.pubmed_metadata_fetch_tasks (
                pubmed_metadata_fetch_run_id,
                corpus_id,
                pmid,
                status,
                completed_at
            )
            VALUES ($1, $2, $3, 'complete', now())
            """,
            pubmed_run_id,
            int(target["corpus_id"]),
            int(target["pmid"]),
        )
        await connection.execute(
            """
            INSERT INTO solemd.pubmed_metadata (
                pmid,
                response_checksum,
                article_title,
                abstract_text,
                publication_types,
                mesh_major_terms
            )
            VALUES (
                $1,
                'pubmed-metadata-checksum',
                'Amyloid beta in depression',
                'PubMed abstract text',
                ARRAY['Journal Article', 'Meta-Analysis']::TEXT[],
                ARRAY['Mental Disorders', 'Neoplasms']::TEXT[]
            )
            """,
            int(target["pmid"]),
        )
        return UUID(str(s2_run_id)), UUID(str(pubmed_run_id))
    finally:
        await connection.close()


async def _truncate_selection_artifact(
    admin_dsn: str,
    selection_run_id: UUID,
    *,
    artifact_kind: str,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        artifact = await connection.fetchrow(
            """
            SELECT storage_schema, storage_table
            FROM solemd.corpus_selection_artifacts
            WHERE corpus_selection_run_id = $1
              AND artifact_kind = $2
            """,
            selection_run_id,
            artifact_kind,
        )
        assert artifact is not None
        await connection.execute(
            f"""
            TRUNCATE TABLE "{artifact['storage_schema']}"."{artifact['storage_table']}"
            """
        )
    finally:
        await connection.close()


def _jsonb_value(value: object) -> dict[str, object]:
    if isinstance(value, str):
        return json.loads(value)
    if isinstance(value, dict):
        return value
    raise TypeError(f"unexpected jsonb value: {type(value)!r}")
