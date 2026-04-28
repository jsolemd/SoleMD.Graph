from __future__ import annotations

import asyncio
import logging
from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.corpus.assets import (
    CuratedCorpusAssets,
    build_curated_assets,
    materialize_curated_vocab,
)
from app.corpus.artifacts import garbage_collect_artifacts
from app.corpus.errors import (
    CorpusSelectionAlreadyInProgress,
    CorpusSelectionAlreadyPublished,
)
from app.corpus.materialize import (
    materialize_corpus_baseline,
    materialize_mapped_surfaces,
)
from app.corpus.models import (
    CORPUS_SELECTION_PHASES,
    CorpusPlan,
    StartCorpusSelectionRequest,
)
from app.corpus.rollups import ensure_mapped_detail_rollups, ensure_selection_rollups
from app.corpus.runtime_support import emit_event
from app.corpus.selection_run_store import (
    acquire_selection_lock as _acquire_selection_lock,
    build_selection_plan as _build_selection_plan,
    count_materialized_papers as _count_materialized_papers,
    count_phase_signals as _count_phase_signals,
    count_summary_rows as _count_summary_rows,
    finalize_selection_published as _finalize_selection_published,
    load_mapped_surface_counts as _load_mapped_surface_counts,
    load_pipeline_stage_counts as _load_pipeline_stage_counts,
    mark_selection_phase_completed as _mark_selection_phase_completed,
    open_or_resume_selection_run as _open_or_resume_selection_run,
    set_selection_phase as _set_selection_phase,
    set_selection_terminal_status as _set_selection_terminal_status,
)
from app.corpus.selectors import corpus, mapped, provenance
from app.telemetry.metrics import (
    observe_corpus_selection_phase,
    track_active_worker_run,
    record_corpus_selection_failure,
    record_corpus_selection_materialized_papers,
    record_corpus_selection_materialized_rows,
    record_corpus_pipeline_stage_count,
    record_corpus_selection_run,
    record_corpus_selection_signals,
    record_corpus_selection_summary_rows,
    track_corpus_selection_lock_age,
)


_LOGGER = logging.getLogger(__name__)


async def run_corpus_selection(
    request: StartCorpusSelectionRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    assets = build_curated_assets(runtime_settings)
    cycle_started = perf_counter()
    async with ingest_pool.acquire() as connection:
        lock_key = await _acquire_selection_lock(connection, request)
        run_id: UUID | None = None
        completed_phases: set[str] = set()
        active_phase_name: str | None = None
        active_phase_started: float | None = None
        async with track_corpus_selection_lock_age(
            selector_version=request.selector_version,
            s2_release_tag=request.s2_release_tag,
            pt3_release_tag=request.pt3_release_tag,
        ):
            try:
                plan = await _build_selection_plan(
                    connection,
                    request,
                    assets,
                    runtime_settings=runtime_settings,
                )
                run = await _open_or_resume_selection_run(
                    connection,
                    request=request,
                    plan=plan,
                    lock_key=lock_key,
                )
                run_id = run.corpus_selection_run_id
                completed_phases = set(run.phases_completed)
                phase_sequence = tuple(
                    phase_name
                    for phase_name in CORPUS_SELECTION_PHASES
                    if request.phase_allowlist is None or phase_name in request.phase_allowlist
                )

                async with track_active_worker_run(
                    worker_scope="corpus",
                    run_kind="corpus_selection",
                    run_label=(
                        f"{request.selector_version}:"
                        f"{request.s2_release_tag}:{request.pt3_release_tag}"
                    ),
                    selector_version=request.selector_version,
                    s2_release_tag=request.s2_release_tag,
                    pt3_release_tag=request.pt3_release_tag,
                ) as active_run:
                    total_progress_units = float(max(1, len(phase_sequence)))
                    active_run.set_progress(
                        progress_kind="overall",
                        completed_units=float(len(completed_phases & set(phase_sequence))),
                        total_units=total_progress_units,
                    )
                    emit_event(
                        "corpus.selection.started",
                        corpus_selection_run_id=run_id,
                        s2_release_tag=request.s2_release_tag,
                        pt3_release_tag=request.pt3_release_tag,
                        selector_version=request.selector_version,
                        plan=plan.model_dump(mode="json"),
                    )

                    for phase_name in phase_sequence:
                        if phase_name in completed_phases:
                            await _ensure_completed_phase_artifacts(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                phase_name=phase_name,
                            )
                            continue
                        active_phase_name = phase_name
                        active_phase_started = perf_counter()
                        active_run.set_state(phase=phase_name)
                        await _set_selection_phase(connection, run_id, phase_name=phase_name)
                        if phase_name == "assets":
                            async with connection.transaction():
                                term_count, alias_count = await materialize_curated_vocab(
                                    connection,
                                    assets,
                                )
                            emit_event(
                                "corpus.selection.assets.completed",
                                corpus_selection_run_id=run_id,
                                term_count=term_count,
                                alias_count=alias_count,
                            )
                        elif phase_name == "corpus_admission":
                            await ensure_selection_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                bucket_count=plan.materialization_bucket_count,
                            )
                            async with connection.transaction():
                                await corpus.refresh_corpus_admission(
                                    connection,
                                    corpus_selection_run_id=run_id,
                                    plan=plan,
                                )
                            corpus_signal_count = await _count_phase_signals(
                                connection,
                                run_id,
                                phase_name,
                            )
                            record_corpus_selection_signals(
                                selector_version=request.selector_version,
                                phase=phase_name,
                                signal_count=corpus_signal_count,
                            )
                            emit_event(
                                "corpus.selection.corpus.completed",
                                corpus_selection_run_id=run_id,
                                corpus_signal_count=corpus_signal_count,
                            )
                        elif phase_name == "mapped_promotion":
                            await ensure_selection_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                bucket_count=plan.materialization_bucket_count,
                            )
                            async with connection.transaction():
                                await mapped.refresh_mapped_promotion(
                                    connection,
                                    corpus_selection_run_id=run_id,
                                    plan=plan,
                                )
                            mapped_signal_count = await _count_phase_signals(
                                connection,
                                run_id,
                                phase_name,
                            )
                            record_corpus_selection_signals(
                                selector_version=request.selector_version,
                                phase=phase_name,
                                signal_count=mapped_signal_count,
                            )
                            emit_event(
                                "corpus.selection.mapped.completed",
                                corpus_selection_run_id=run_id,
                                mapped_signal_count=mapped_signal_count,
                            )
                        elif phase_name == "corpus_baseline_materialization":
                            await ensure_selection_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                bucket_count=plan.materialization_bucket_count,
                            )
                            async with connection.transaction():
                                await materialize_corpus_baseline(
                                    connection,
                                    corpus_selection_run_id=run_id,
                                    plan=plan,
                                )
                            materialized_corpus_count = await _count_materialized_papers(
                                connection,
                                plan.s2_source_release_id,
                            )
                            record_corpus_selection_materialized_papers(
                                selector_version=request.selector_version,
                                paper_count=materialized_corpus_count,
                            )
                            emit_event(
                                "corpus.selection.corpus_baseline_materialization.completed",
                                corpus_selection_run_id=run_id,
                                materialized_corpus_count=materialized_corpus_count,
                            )
                        elif phase_name == "mapped_surface_materialization":
                            await ensure_selection_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                bucket_count=plan.materialization_bucket_count,
                            )
                            await ensure_mapped_detail_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                            )
                            await materialize_mapped_surfaces(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                bucket_count=plan.materialization_bucket_count,
                                connection_pool=ingest_pool,
                                max_parallel_chunks=_parallel_chunk_limit(runtime_settings),
                                chunk_max_attempts=(
                                    runtime_settings.corpus_materialization_chunk_max_attempts
                                ),
                            )
                            mapped_surface_counts = await _load_mapped_surface_counts(
                                connection,
                                s2_source_release_id=plan.s2_source_release_id,
                                pt3_source_release_id=plan.pt3_source_release_id,
                            )
                            for surface_name, row_count in mapped_surface_counts.items():
                                record_corpus_selection_materialized_rows(
                                    selector_version=request.selector_version,
                                    surface=surface_name,
                                    row_count=row_count,
                                )
                            emit_event(
                                "corpus.selection.mapped_surface_materialization.completed",
                                corpus_selection_run_id=run_id,
                                mapped_surface_counts=mapped_surface_counts,
                            )
                        else:
                            await ensure_selection_rollups(
                                connection,
                                corpus_selection_run_id=run_id,
                                plan=plan,
                                assets=assets,
                                bucket_count=plan.materialization_bucket_count,
                            )
                            async with connection.transaction():
                                await provenance.refresh_selection_summary(
                                    connection,
                                    corpus_selection_run_id=run_id,
                                    plan=plan,
                                )
                            summary_row_count = await _count_summary_rows(connection, run_id)
                            record_corpus_selection_summary_rows(
                                selector_version=request.selector_version,
                                row_count=summary_row_count,
                            )
                            pipeline_stage_counts = await _load_pipeline_stage_counts(
                                connection,
                                corpus_selection_run_id=run_id,
                                s2_source_release_id=plan.s2_source_release_id,
                            )
                            for stage_name, paper_count in pipeline_stage_counts.items():
                                record_corpus_pipeline_stage_count(
                                    selector_version=request.selector_version,
                                    s2_release_tag=request.s2_release_tag,
                                    pt3_release_tag=request.pt3_release_tag,
                                    stage=stage_name,
                                    paper_count=paper_count,
                                )
                            emit_event(
                                "corpus.selection.summary.completed",
                                corpus_selection_run_id=run_id,
                                summary_row_count=summary_row_count,
                                pipeline_stage_counts=pipeline_stage_counts,
                            )
                        observe_corpus_selection_phase(
                            selector_version=request.selector_version,
                            phase=phase_name,
                            duration_seconds=perf_counter() - active_phase_started,
                        )
                        await _mark_selection_phase_completed(connection, run_id, phase_name)
                        completed_phases.add(phase_name)
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=float(len(completed_phases & set(phase_sequence))),
                            total_units=total_progress_units,
                        )
                        active_phase_name = None
                        active_phase_started = None

                    if set(CORPUS_SELECTION_PHASES).issubset(completed_phases):
                        await _finalize_selection_published(connection, run_id)
                        dropped_artifact_count = await garbage_collect_artifacts(
                            connection,
                            plan=plan,
                            retention_runs=runtime_settings.corpus_artifact_retention_runs,
                        )
                        record_corpus_selection_run(
                            selector_version=request.selector_version,
                            outcome="published",
                        )
                        emit_event(
                            "corpus.selection.published",
                            corpus_selection_run_id=run_id,
                            published_phases=sorted(completed_phases),
                            dropped_artifact_count=dropped_artifact_count,
                            total_duration_s=perf_counter() - cycle_started,
                        )
                    else:
                        record_corpus_selection_run(
                            selector_version=request.selector_version,
                            outcome="partial",
                        )
                        emit_event(
                            "corpus.selection.partial",
                            corpus_selection_run_id=run_id,
                            completed_phases=sorted(completed_phases),
                            total_duration_s=perf_counter() - cycle_started,
                        )
                    return str(run_id)
            except (CorpusSelectionAlreadyPublished, CorpusSelectionAlreadyInProgress):
                raise
            except asyncio.CancelledError:
                if active_phase_name is not None and active_phase_started is not None:
                    observe_corpus_selection_phase(
                        selector_version=request.selector_version,
                        phase=active_phase_name,
                        duration_seconds=perf_counter() - active_phase_started,
                    )
                if run_id is not None:
                    try:
                        await _set_selection_terminal_status(
                            connection,
                            run_id,
                            "run cancelled (time_limit or worker shutdown)",
                        )
                        record_corpus_selection_run(
                            selector_version=request.selector_version,
                            outcome="aborted",
                        )
                        emit_event(
                            "corpus.selection.aborted",
                            corpus_selection_run_id=run_id,
                            reason="cancelled",
                            total_duration_s=perf_counter() - cycle_started,
                        )
                    except Exception:
                        _LOGGER.exception(
                            "failed to mark corpus selection run aborted during cancellation",
                        )
                raise
            except Exception as exc:
                if active_phase_name is not None and active_phase_started is not None:
                    observe_corpus_selection_phase(
                        selector_version=request.selector_version,
                        phase=active_phase_name,
                        duration_seconds=perf_counter() - active_phase_started,
                    )
                if run_id is not None:
                    await _set_selection_terminal_status(connection, run_id, str(exc))
                    record_corpus_selection_run(
                        selector_version=request.selector_version,
                        outcome="failed",
                    )
                    record_corpus_selection_failure(
                        selector_version=request.selector_version,
                        phase=active_phase_name or "start",
                        failure_class=type(exc).__name__,
                    )
                    emit_event(
                        "corpus.selection.failed",
                        corpus_selection_run_id=run_id,
                        error_class=type(exc).__name__,
                        error_message=str(exc),
                        total_duration_s=perf_counter() - cycle_started,
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


async def _ensure_completed_phase_artifacts(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    assets: CuratedCorpusAssets,
    phase_name: str,
) -> None:
    if phase_name in {
        "corpus_admission",
        "mapped_promotion",
        "corpus_baseline_materialization",
        "mapped_surface_materialization",
        "selection_summary",
    }:
        await ensure_selection_rollups(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            assets=assets,
            bucket_count=plan.materialization_bucket_count,
        )
    if phase_name == "mapped_surface_materialization":
        await ensure_mapped_detail_rollups(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
        )
