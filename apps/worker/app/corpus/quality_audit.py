from __future__ import annotations

from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.corpus.models import StartCorpusQualityAuditRequest
from app.corpus.quality_audit_store import (
    QUALITY_AUDIT_PHASE_NAME,
    acquire_quality_audit_lock,
    build_quality_audit_detail,
    mark_quality_audit_complete,
    mark_quality_audit_failed,
    open_quality_audit_run,
)
from app.corpus.runtime_support import corpus_selection_run_label, emit_event
from app.corpus.summary_refresh_store import load_published_selection_run_by_id
from app.telemetry.metrics import (
    observe_corpus_selection_phase,
    record_corpus_selection_failure,
    track_active_worker_run,
)


async def run_corpus_quality_audit(
    request: StartCorpusQualityAuditRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    del runtime_settings
    started = perf_counter()
    async with ingest_pool.acquire() as connection:
        context = await load_published_selection_run_by_id(
            connection,
            corpus_selection_run_id=request.corpus_selection_run_id,
        )
        lock_key = await acquire_quality_audit_lock(
            connection,
            corpus_selection_run_id=context.corpus_selection_run_id,
        )
        audit_run_id: UUID | None = None
        async with track_active_worker_run(
            worker_scope="corpus",
            run_kind=QUALITY_AUDIT_PHASE_NAME,
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
                active_run.set_state(phase="open")
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=0,
                    total_units=3,
                )
                audit_run_id = await open_quality_audit_run(
                    connection,
                    request=request,
                    context=context,
                )

                active_run.set_state(phase="snapshot")
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=1,
                    total_units=3,
                )
                detail = await build_quality_audit_detail(
                    connection,
                    context=context,
                    sample_size=request.sample_size,
                )

                active_run.set_state(phase="finalize")
                await mark_quality_audit_complete(
                    connection,
                    audit_run_id=audit_run_id,
                    detail=detail,
                )
                observe_corpus_selection_phase(
                    selector_version=context.selector_version,
                    phase=QUALITY_AUDIT_PHASE_NAME,
                    duration_seconds=perf_counter() - started,
                )
                active_run.set_progress(
                    progress_kind="phase",
                    completed_units=3,
                    total_units=3,
                )
                emit_event(
                    "corpus.quality_audit.completed",
                    corpus_quality_audit_run_id=audit_run_id,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    summary_row_count=detail.summary_row_count,
                    mapped_row_count=detail.mapped_row_count,
                    rag_eligible_row_count=detail.rag_eligible_row_count,
                    duration_s=perf_counter() - started,
                )
                return str(audit_run_id)
            except Exception as exc:
                if audit_run_id is not None:
                    await mark_quality_audit_failed(
                        connection,
                        audit_run_id=audit_run_id,
                        error_message=str(exc),
                    )
                record_corpus_selection_failure(
                    selector_version=context.selector_version,
                    phase=QUALITY_AUDIT_PHASE_NAME,
                    failure_class=type(exc).__name__,
                )
                emit_event(
                    "corpus.quality_audit.failed",
                    corpus_quality_audit_run_id=audit_run_id,
                    corpus_selection_run_id=context.corpus_selection_run_id,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                    duration_s=perf_counter() - started,
                )
                raise
            finally:
                await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)
