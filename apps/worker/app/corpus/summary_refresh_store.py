from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

import asyncpg

from app.corpus.artifacts import PAPER_SCOPE, RELATION_AGGREGATE
from app.corpus.errors import (
    SelectionRunNotPublished,
    SelectionSummaryRefreshAlreadyInProgress,
    SelectionSummaryRefreshPrerequisiteMissing,
    SelectorPlanDrift,
)
from app.corpus.materialize_chunks import (
    SELECTION_SUMMARY_PHASE_NAME,
    ensure_phase_chunks,
)
from app.corpus.models import CorpusPlan, StartSelectionSummaryRefreshRequest
from app.corpus.rollups import relation_rollup_refs, selection_rollup_refs
from app.corpus.runtime_support import CORPUS_SELECTION_STATUS_PUBLISHED


_TERMINAL_ABSENT_STATUS = "not_found"
_COMPLETE_STATUS = "complete"
_ENRICHMENT_SUCCESS_STATUSES = {_COMPLETE_STATUS, _TERMINAL_ABSENT_STATUS}


@dataclass(frozen=True, slots=True)
class SelectionRunContext:
    corpus_selection_run_id: UUID
    selector_version: str
    s2_release_tag: str
    pt3_release_tag: str
    plan: CorpusPlan


@dataclass(frozen=True, slots=True)
class EnrichmentRunSnapshot:
    run_id: UUID
    row_count: int
    not_found_count: int
    task_status_counts: dict[str, int]


async def load_published_selection_run(
    connection: asyncpg.Connection,
    request: StartSelectionSummaryRefreshRequest,
) -> SelectionRunContext:
    return await load_published_selection_run_by_id(
        connection,
        corpus_selection_run_id=request.corpus_selection_run_id,
    )


async def load_published_selection_run_by_id(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> SelectionRunContext:
    row = await connection.fetchrow(
        """
        SELECT
            runs.corpus_selection_run_id,
            runs.status,
            runs.selector_version,
            runs.plan_checksum,
            runs.plan_manifest,
            s2.source_release_key AS s2_release_tag,
            pt3.source_release_key AS pt3_release_tag
        FROM solemd.corpus_selection_runs runs
        JOIN solemd.source_releases s2
          ON s2.source_release_id = runs.s2_source_release_id
        JOIN solemd.source_releases pt3
          ON pt3.source_release_id = runs.pt3_source_release_id
        WHERE runs.corpus_selection_run_id = $1
        """,
        corpus_selection_run_id,
    )
    if row is None or int(row["status"]) != CORPUS_SELECTION_STATUS_PUBLISHED:
        raise SelectionRunNotPublished(
            "selection-summary refresh requires a published corpus selection run"
        )
    plan = CorpusPlan.model_validate(row["plan_manifest"])
    if str(row["plan_checksum"]) != plan.plan_checksum:
        raise SelectorPlanDrift(
            "persisted corpus selection plan checksum does not match its manifest"
        )
    return SelectionRunContext(
        corpus_selection_run_id=UUID(str(row["corpus_selection_run_id"])),
        selector_version=str(row["selector_version"]),
        s2_release_tag=str(row["s2_release_tag"]),
        pt3_release_tag=str(row["pt3_release_tag"]),
        plan=plan,
    )


async def acquire_refresh_lock(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::BIGINT",
        f"corpus-selection-summary-refresh:{corpus_selection_run_id}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise SelectionSummaryRefreshAlreadyInProgress(
            "selection-summary refresh is already running for this corpus selection run"
        )
    return int(lock_key)


async def validate_required_artifacts(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> None:
    selection_refs = await selection_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    relation_refs = await relation_rollup_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
    )
    if PAPER_SCOPE not in selection_refs or RELATION_AGGREGATE not in relation_refs:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            "selection-summary refresh requires paper_scope and relation_aggregate artifacts"
        )


async def resolve_s2_graph_run_snapshot(
    connection: asyncpg.Connection,
    *,
    request: StartSelectionSummaryRefreshRequest,
    context: SelectionRunContext,
) -> EnrichmentRunSnapshot:
    run_id = request.s2_graph_enrichment_run_id
    if run_id is None:
        run_id = await connection.fetchval(
            """
            SELECT s2_graph_enrichment_run_id
            FROM solemd.s2_graph_enrichment_runs
            WHERE corpus_selection_run_id = $1
              AND s2_source_release_id = $2
              AND max_papers IS NULL
              AND status = 'complete'
            ORDER BY completed_at DESC NULLS LAST, started_at DESC
            LIMIT 1
            """,
            context.corpus_selection_run_id,
            context.plan.s2_source_release_id,
        )
    if run_id is None:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            "no completed full S2 Graph enrichment run exists for this selection run"
        )
    row = await connection.fetchrow(
        """
        SELECT status, max_papers, s2_source_release_id
        FROM solemd.s2_graph_enrichment_runs
        WHERE s2_graph_enrichment_run_id = $1
          AND corpus_selection_run_id = $2
        """,
        run_id,
        context.corpus_selection_run_id,
    )
    if row is None:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            f"S2 Graph enrichment run does not belong to this selection run: {run_id}"
        )
    if (
        row["status"] != _COMPLETE_STATUS
        or row["max_papers"] is not None
        or int(row["s2_source_release_id"]) != context.plan.s2_source_release_id
    ):
        raise SelectionSummaryRefreshPrerequisiteMissing(
            "S2 Graph enrichment must be a completed full run for the same S2 release"
        )
    counts = await _s2_task_status_counts(connection, run_id)
    _raise_for_incomplete_status_counts("S2 Graph enrichment", counts)
    row_count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.s2_paper_enrichment enrichment
        WHERE enrichment.source_release_id = $2
          AND EXISTS (
            SELECT 1
            FROM solemd.s2_graph_enrichment_tasks tasks
            WHERE tasks.s2_graph_enrichment_run_id = $1
              AND tasks.paper_id = enrichment.paper_id
              AND tasks.status = 'complete'
          )
        """,
        run_id,
        context.plan.s2_source_release_id,
    )
    return EnrichmentRunSnapshot(
        run_id=UUID(str(run_id)),
        row_count=int(row_count or 0),
        not_found_count=counts.get(_TERMINAL_ABSENT_STATUS, 0),
        task_status_counts=counts,
    )


async def resolve_pubmed_run_snapshot(
    connection: asyncpg.Connection,
    *,
    request: StartSelectionSummaryRefreshRequest,
    context: SelectionRunContext,
) -> EnrichmentRunSnapshot:
    run_id = request.pubmed_metadata_fetch_run_id
    if run_id is None:
        run_id = await connection.fetchval(
            """
            SELECT pubmed_metadata_fetch_run_id
            FROM solemd.pubmed_metadata_fetch_runs
            WHERE corpus_selection_run_id = $1
              AND max_papers IS NULL
              AND status = 'complete'
            ORDER BY completed_at DESC NULLS LAST, started_at DESC
            LIMIT 1
            """,
            context.corpus_selection_run_id,
        )
    if run_id is None:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            "no completed full PubMed metadata enrichment run exists for this selection run"
        )
    row = await connection.fetchrow(
        """
        SELECT status, max_papers
        FROM solemd.pubmed_metadata_fetch_runs
        WHERE pubmed_metadata_fetch_run_id = $1
          AND corpus_selection_run_id = $2
        """,
        run_id,
        context.corpus_selection_run_id,
    )
    if row is None:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            f"PubMed metadata run does not belong to this selection run: {run_id}"
        )
    if row["status"] != _COMPLETE_STATUS or row["max_papers"] is not None:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            "PubMed metadata enrichment must be a completed full run"
        )
    counts = await _pubmed_task_status_counts(connection, run_id)
    _raise_for_incomplete_status_counts("PubMed metadata enrichment", counts)
    row_count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.pubmed_metadata metadata
        WHERE EXISTS (
            SELECT 1
            FROM solemd.pubmed_metadata_fetch_tasks tasks
            WHERE tasks.pubmed_metadata_fetch_run_id = $1
              AND tasks.pmid = metadata.pmid
              AND tasks.status = 'complete'
        )
        """,
        run_id,
    )
    return EnrichmentRunSnapshot(
        run_id=UUID(str(run_id)),
        row_count=int(row_count or 0),
        not_found_count=counts.get(_TERMINAL_ABSENT_STATUS, 0),
        task_status_counts=counts,
    )


async def open_refresh_run(
    connection: asyncpg.Connection,
    *,
    request: StartSelectionSummaryRefreshRequest,
    context: SelectionRunContext,
    s2_snapshot: EnrichmentRunSnapshot,
    pubmed_snapshot: EnrichmentRunSnapshot,
    pre_refresh_detail: dict[str, int],
) -> UUID:
    return await connection.fetchval(
        """
        INSERT INTO solemd.corpus_selection_summary_refresh_runs (
            corpus_selection_run_id,
            selector_version,
            s2_graph_enrichment_run_id,
            pubmed_metadata_fetch_run_id,
            requested_by,
            status,
            plan_checksum,
            chunk_count,
            s2_enrichment_row_count,
            s2_not_found_count,
            pubmed_metadata_row_count,
            pubmed_not_found_count,
            pre_refresh_detail
        )
        VALUES (
            $1, $2, $3, $4, $5, 'running', $6, $7, $8, $9, $10, $11, $12
        )
        RETURNING corpus_selection_summary_refresh_run_id
        """,
        context.corpus_selection_run_id,
        context.selector_version,
        s2_snapshot.run_id,
        pubmed_snapshot.run_id,
        request.requested_by,
        context.plan.plan_checksum,
        context.plan.materialization_bucket_count,
        s2_snapshot.row_count,
        s2_snapshot.not_found_count,
        pubmed_snapshot.row_count,
        pubmed_snapshot.not_found_count,
        {
            **pre_refresh_detail,
            "s2_task_status_counts": s2_snapshot.task_status_counts,
            "pubmed_task_status_counts": pubmed_snapshot.task_status_counts,
        },
    )


async def mark_refresh_run_complete(
    connection: asyncpg.Connection,
    *,
    refresh_run_id: UUID,
    summary_row_count: int,
    post_refresh_detail: dict[str, int],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_summary_refresh_runs
        SET status = 'complete',
            completed_at = now(),
            summary_row_count = $2,
            post_refresh_detail = $3,
            error_message = NULL
        WHERE corpus_selection_summary_refresh_run_id = $1
        """,
        refresh_run_id,
        summary_row_count,
        post_refresh_detail,
    )


async def mark_refresh_run_failed(
    connection: asyncpg.Connection,
    *,
    refresh_run_id: UUID,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_summary_refresh_runs
        SET status = 'failed',
            completed_at = now(),
            error_message = $2
        WHERE corpus_selection_summary_refresh_run_id = $1
        """,
        refresh_run_id,
        error_message[:2000],
    )


async def reset_selection_summary_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    bucket_count: int,
) -> None:
    await ensure_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=SELECTION_SUMMARY_PHASE_NAME,
        bucket_count=bucket_count,
    )
    row = await connection.fetchrow(
        """
        SELECT
            count(*) AS chunk_count,
            min(bucket_count) AS min_bucket_count,
            max(bucket_count) AS max_bucket_count
        FROM solemd.corpus_selection_chunks
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        SELECTION_SUMMARY_PHASE_NAME,
    )
    if (
        row is None
        or int(row["chunk_count"]) != bucket_count
        or int(row["min_bucket_count"]) != bucket_count
        or int(row["max_bucket_count"]) != bucket_count
    ):
        raise SelectorPlanDrift(
            "selection-summary chunk ledger does not match the persisted plan bucket count"
        )
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_chunks
        SET status = 'pending',
            attempts = 0,
            started_at = NULL,
            completed_at = NULL,
            row_counts = '{}'::JSONB,
            error_message = NULL,
            updated_at = now()
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        SELECTION_SUMMARY_PHASE_NAME,
    )


async def load_summary_detail(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> dict[str, int]:
    row = await connection.fetchrow(
        """
        SELECT
            count(*)::BIGINT AS summary_rows,
            count(*) FILTER (WHERE current_status = 'mapped')::BIGINT AS mapped_rows,
            count(*) FILTER (WHERE rag_candidate)::BIGINT AS rag_candidate_rows,
            count(*) FILTER (WHERE rag_eligible)::BIGINT AS rag_eligible_rows,
            count(*) FILTER (WHERE incoming_citation_count > 0)::BIGINT
                AS incoming_citation_rows,
            count(*) FILTER (WHERE cardinality(s2_fields_of_study) > 0)::BIGINT
                AS s2_fields_of_study_rows,
            count(*) FILTER (WHERE cardinality(publication_type_tracks) > 0)::BIGINT
                AS publication_type_track_rows,
            count(*) FILTER (WHERE cardinality(mesh_major_tracks) > 0)::BIGINT
                AS mesh_major_track_rows,
            count(*) FILTER (WHERE has_cl_bridge)::BIGINT AS cl_bridge_rows
        FROM solemd.paper_selection_summary
        WHERE corpus_selection_run_id = $1
        """,
        corpus_selection_run_id,
    )
    if row is None:
        return {}
    return {key: int(value or 0) for key, value in dict(row).items()}


async def _s2_task_status_counts(
    connection: asyncpg.Connection,
    run_id: UUID,
) -> dict[str, int]:
    rows = await connection.fetch(
        """
        SELECT status, count(*) AS task_count
        FROM solemd.s2_graph_enrichment_tasks
        WHERE s2_graph_enrichment_run_id = $1
        GROUP BY status
        """,
        run_id,
    )
    return {str(row["status"]): int(row["task_count"]) for row in rows}


async def _pubmed_task_status_counts(
    connection: asyncpg.Connection,
    run_id: UUID,
) -> dict[str, int]:
    rows = await connection.fetch(
        """
        SELECT status, count(*) AS task_count
        FROM solemd.pubmed_metadata_fetch_tasks
        WHERE pubmed_metadata_fetch_run_id = $1
        GROUP BY status
        """,
        run_id,
    )
    return {str(row["status"]): int(row["task_count"]) for row in rows}


def _raise_for_incomplete_status_counts(
    provider_label: str,
    counts: dict[str, int],
) -> None:
    incomplete = {
        status: count
        for status, count in counts.items()
        if status not in _ENRICHMENT_SUCCESS_STATUSES and count > 0
    }
    if incomplete:
        raise SelectionSummaryRefreshPrerequisiteMissing(
            f"{provider_label} has incomplete task statuses: {incomplete}"
        )
