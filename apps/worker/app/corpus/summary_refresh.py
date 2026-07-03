from __future__ import annotations

from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.corpus.assets import build_curated_assets
from app.corpus.materialize_chunks import SELECTION_SUMMARY_PHASE_NAME
from app.corpus.models import StartSelectionSummaryRefreshRequest
from app.corpus.rollups import ensure_relation_rollup
from app.corpus.runtime_support import corpus_selection_run_label, emit_event
from app.corpus.selectors.provenance import refresh_selection_summary
from app.corpus.summary_refresh_store import (
    acquire_refresh_lock,
    load_published_selection_run,
    load_summary_detail,
    mark_refresh_run_complete,
    mark_refresh_run_failed,
    open_refresh_run,
    reset_selection_summary_chunks,
    resolve_pubmed_run_snapshot,
    resolve_s2_graph_run_snapshot,
    validate_required_artifacts,
)
from app.telemetry.metrics import (
    observe_corpus_selection_phase,
    record_corpus_selection_failure,
    record_corpus_selection_summary_rows,
    track_active_worker_run,
)


REFRESH_PHASE_NAME = "selection_summary_refresh"


async def run_selection_summary_refresh(
    request: StartSelectionSummaryRefreshRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    started = perf_counter()
    assets = build_curated_assets(runtime_settings)
    async with ingest_pool.acquire() as connection:
        context = await load_published_selection_run(connection, request)
        lock_key = await acquire_refresh_lock(
            connection,
            corpus_selection_run_id=context.corpus_selection_run_id,
        )
        refresh_run_id: UUID | None = None
        async with track_active_worker_run(
            worker_scope="corpus",
            run_kind=REFRESH_PHASE_NAME,
            run_label=corpus_selection_run_label(
                selector_version=context.selector_version,
                s2_release_tag=context.s2_release_tag,
                pt3_release_tag=context.pt3_release_tag,
            ),
            selector_version=context.selector_version,
            s2_release_tag=context.s2_release_tag,
            pt3_release_tag=context.pt3_release_tag,
        ) as active_run:
            try:
                active_run.set_state(phase="validate")
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=0,
                    total_units=5,
                )
                s2_snapshot = await resolve_s2_graph_run_snapshot(
                    connection,
                    request=request,
                    context=context,
                )
                pubmed_snapshot = await resolve_pubmed_run_snapshot(
                    connection,
                    request=request,
                    context=context,
                )
                pre_refresh_detail = await load_summary_detail(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                )
                refresh_run_id = await open_refresh_run(
                    connection,
                    request=request,
                    context=context,
                    s2_snapshot=s2_snapshot,
                    pubmed_snapshot=pubmed_snapshot,
                    pre_refresh_detail=pre_refresh_detail,
                )

                active_run.set_state(phase="ensure_rollups")
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=1,
                    total_units=5,
                )
                await ensure_relation_rollup(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    plan=context.plan,
                    assets=assets,
                    bucket_count=context.plan.materialization_bucket_count,
                )
                await validate_required_artifacts(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                )

                active_run.set_state(phase="reset_chunks")
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=2,
                    total_units=5,
                )
                await reset_selection_summary_chunks(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    bucket_count=context.plan.materialization_bucket_count,
                )

                active_run.set_state(phase=SELECTION_SUMMARY_PHASE_NAME)
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=3,
                    total_units=5,
                )
                await refresh_selection_summary(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    plan=context.plan,
                    bucket_count=context.plan.materialization_bucket_count,
                    connection_pool=ingest_pool,
                    max_parallel_chunks=_parallel_chunk_limit(runtime_settings),
                    chunk_max_attempts=(
                        runtime_settings.corpus_materialization_chunk_max_attempts
                    ),
                )

                active_run.set_state(phase="finalize")
                post_refresh_detail = await load_summary_detail(
                    connection,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                )
                summary_row_count = int(post_refresh_detail["summary_rows"])
                await mark_refresh_run_complete(
                    connection,
                    refresh_run_id=refresh_run_id,
                    summary_row_count=summary_row_count,
                    post_refresh_detail=post_refresh_detail,
                )
                record_corpus_selection_summary_rows(
                    selector_version=context.selector_version,
                    row_count=summary_row_count,
                )
                observe_corpus_selection_phase(
                    selector_version=context.selector_version,
                    phase=REFRESH_PHASE_NAME,
                    duration_seconds=perf_counter() - started,
                )
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=5,
                    total_units=5,
                )
                emit_event(
                    "corpus.selection_summary_refresh.completed",
                    corpus_selection_summary_refresh_run_id=refresh_run_id,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    summary_row_count=summary_row_count,
                    duration_s=perf_counter() - started,
                )
                return str(refresh_run_id)
            except Exception as exc:
                if refresh_run_id is not None:
                    await mark_refresh_run_failed(
                        connection,
                        refresh_run_id=refresh_run_id,
                        error_message=str(exc),
                    )
                record_corpus_selection_failure(
                    selector_version=context.selector_version,
                    phase=REFRESH_PHASE_NAME,
                    failure_class=type(exc).__name__,
                )
                emit_event(
                    "corpus.selection_summary_refresh.failed",
                    corpus_selection_summary_refresh_run_id=refresh_run_id,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                    duration_s=perf_counter() - started,
                )
                raise
            finally:
                await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)


def _parallel_chunk_limit(runtime_settings: Settings) -> int:
    pool_headroom = max(1, runtime_settings.pool_ingest_max - 1)
    return min(
        runtime_settings.corpus_materialization_max_parallel_chunks,
        pool_headroom,
    )
