from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import logging
from pathlib import Path
from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.db import open_named_connection
from app.ingest.errors import (
    IngestAborted,
    IngestAlreadyInProgress,
    IngestAlreadyPublished,
    PlanDrift,
    SourceSchemaDrift,
)
from app.ingest.models import (
    CopyStats,
    IngestPlan,
    IngestRunRecord,
    SourceCode,
    StartReleaseRequest,
)
from app.ingest.s2_diff import mark_s2_family_base_loaded
from app.ingest.sources import pubtator, semantic_scholar
from app.telemetry.metrics import (
    observe_ingest_phase,
    record_ingest_failure,
    record_ingest_family_load,
    record_ingest_run,
    track_active_worker_run,
    track_ingest_lock_age,
)
from app.ingest.writers import pubtator as pubtator_writer
from app.ingest.writers import s2 as s2_writer


LOGGER = logging.getLogger(__name__)

INGEST_STATUS_STARTED = 1
INGEST_STATUS_LOADING = 2
INGEST_STATUS_INDEXING = 3
INGEST_STATUS_ANALYZING = 4
INGEST_STATUS_PUBLISHED = 5
INGEST_STATUS_FAILED = 6
INGEST_STATUS_ABORTED = 7
INGEST_REQUESTED_STATUS_ABORT = 2


@dataclass(frozen=True, slots=True)
class SourceAdapter:
    build_plan: Callable[[Settings, StartReleaseRequest], IngestPlan]
    promote_family: Callable[[asyncpg.Connection, IngestPlan, str, int, UUID], asyncio.Future | object]


@dataclass(frozen=True, slots=True)
class SourceWriter:
    load_family: Callable[
        [
            asyncpg.Pool,
            Settings,
            StartReleaseRequest,
            IngestPlan,
            str,
            int,
            UUID,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], Awaitable[None]] | None,
        ],
        asyncio.Future | object,
    ]
    load_family_distributed: Callable[
        [
            asyncpg.Pool,
            Settings,
            StartReleaseRequest,
            IngestPlan,
            str,
            int,
            UUID,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], Awaitable[None]] | None,
        ],
        asyncio.Future | object,
    ] | None = None
    parallel_family_groups: tuple[tuple[str, ...], ...] = ()


SOURCE_ADAPTERS: dict[SourceCode, SourceAdapter] = {
    "s2": SourceAdapter(
        build_plan=semantic_scholar.build_plan,
        promote_family=semantic_scholar.promote_family,
    ),
    "pt3": SourceAdapter(
        build_plan=pubtator.build_plan,
        promote_family=pubtator.promote_family,
    ),
}

SOURCE_WRITERS: dict[SourceCode, SourceWriter] = {
    "s2": SourceWriter(
        load_family=s2_writer.load_family,
        load_family_distributed=s2_writer.load_family_distributed,
    ),
    "pt3": SourceWriter(
        load_family=pubtator_writer.load_family,
        parallel_family_groups=(("bioconcepts", "relations"),),
    ),
}


async def run_release_ingest(
    request: StartReleaseRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
    distributed_file_tasks: bool = False,
) -> str:
    adapter = SOURCE_ADAPTERS[request.source_code]
    writer = SOURCE_WRITERS[request.source_code]
    plan = adapter.build_plan(runtime_settings, request)
    cycle_started = perf_counter()

    async with open_named_connection(runtime_settings, name="ingest_write") as control_connection:
        lock_key = await _acquire_release_lock(control_connection, request)
        ingest_run_id: UUID | None = None
        family_name: str | None = None
        active_phase_name: str | None = None
        active_phase_started: float | None = None
        async with track_ingest_lock_age(
            source_code=request.source_code,
            release_tag=request.release_tag,
        ):
            try:
                source_release_id = await _ensure_source_release(control_connection, request, plan)
                run = await _open_or_resume_run(
                    control_connection,
                    request=request,
                    plan=plan,
                    source_release_id=source_release_id,
                    lock_key=lock_key,
                )
                await _mark_source_release_ingesting(control_connection, source_release_id)
                ingest_run_id = run.ingest_run_id
                async with track_active_worker_run(
                    worker_scope="ingest",
                    run_kind="release_ingest",
                    run_label=f"{request.source_code}:{request.release_tag}",
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                ) as active_run:
                    total_progress_units = float(max(1, len(plan.family_names) + 2))
                    completed_family_count = len(run.families_loaded)
                    active_run.set_progress(
                        progress_kind="overall",
                        completed_units=float(completed_family_count),
                        total_units=total_progress_units,
                    )
                    active_run.set_progress(
                        progress_kind="current_work_item_files",
                        completed_units=0,
                        total_units=0,
                    )
                    active_run.set_progress(
                        progress_kind="current_work_item_input_bytes",
                        completed_units=0,
                        total_units=0,
                    )
                    _emit_event(
                        "ingest.cycle.started",
                        ingest_run_id=ingest_run_id,
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        plan=plan.model_dump(mode="json"),
                    )
                    await _set_phase(
                        control_connection,
                        ingest_run_id,
                        status_code=INGEST_STATUS_LOADING,
                        phase_name="loading",
                    )
                    active_phase_name = "loading"
                    active_phase_started = perf_counter()
                    active_run.set_state(phase="loading")

                    abort_error = IngestAborted(f"operator requested abort for run {ingest_run_id}")
                    abort_requested = asyncio.Event()

                    def raise_if_abort_requested() -> None:
                        if abort_requested.is_set():
                            raise abort_error

                    async def on_batch_processed(file_path: Path, batch_row_count: int) -> None:
                        del batch_row_count
                        raise_if_abort_requested()
                        active_run.set_state(
                            phase="loading",
                            work_item=f"{family_name}:{file_path.name}" if family_name is not None else file_path.name,
                        )

                    async def load_parallel_family_group(
                        family_group: tuple[str, ...],
                    ) -> dict[str, CopyStats]:
                        nonlocal family_name
                        family_name = "+".join(family_group)
                        group_family_plans = {
                            item.family: item for item in plan.families if item.family in family_group
                        }
                        group_file_sizes = {
                            file_plan.path: max(0, file_plan.byte_count)
                            for item in group_family_plans.values()
                            for file_plan in item.files
                        }
                        file_family_names = {
                            file_plan.path: item.family
                            for item in group_family_plans.values()
                            for file_plan in item.files
                        }
                        group_file_total = sum(len(item.files) for item in group_family_plans.values())
                        group_input_total_units = float(sum(group_file_sizes.values()))
                        file_input_progress = {
                            file_plan.path: 0
                            for item in group_family_plans.values()
                            for file_plan in item.files
                        }
                        completed_file_count = 0
                        written_rows_by_family = {item: 0 for item in family_group}
                        active_run.set_state(phase="loading", work_item=family_name)
                        active_run.set_progress(
                            progress_kind="current_work_item_files",
                            completed_units=0,
                            total_units=float(group_file_total),
                        )
                        active_run.set_progress(
                            progress_kind="current_work_item_input_bytes",
                            completed_units=0,
                            total_units=group_input_total_units,
                        )
                        active_run.set_progress(
                            progress_kind="current_work_item_rows",
                            completed_units=0,
                            total_units=0,
                        )

                        def update_group_progress() -> None:
                            fractional_completed = 1.0
                            if group_input_total_units > 0:
                                completed_input_units = float(sum(file_input_progress.values()))
                                active_run.set_progress(
                                    progress_kind="current_work_item_input_bytes",
                                    completed_units=completed_input_units,
                                    total_units=group_input_total_units,
                                )
                                fractional_completed = completed_input_units / group_input_total_units
                            elif group_file_total > 0:
                                fractional_completed = completed_file_count / group_file_total
                            active_run.set_progress(
                                progress_kind="overall",
                                completed_units=float(completed_family_count) + fractional_completed,
                                total_units=total_progress_units,
                            )

                        def make_on_file_completed(
                            group_family_name: str,
                        ) -> Callable[[Path, int], None]:
                            def on_file_completed(_file_path: Path, _written_rows: int) -> None:
                                nonlocal completed_file_count
                                raise_if_abort_requested()
                                completed_file_count += 1
                                file_input_progress[_file_path] = max(
                                    file_input_progress.get(_file_path, 0),
                                    group_file_sizes.get(_file_path, 0),
                                )
                                active_run.set_state(
                                    phase="loading",
                                    work_item=f"{group_family_name}:{_file_path.name}",
                                )
                                active_run.set_progress(
                                    progress_kind="current_work_item_files",
                                    completed_units=float(completed_file_count),
                                    total_units=float(group_file_total),
                                )
                                update_group_progress()

                            return on_file_completed

                        def on_input_progress(_file_path: Path, input_bytes: int) -> None:
                            raise_if_abort_requested()
                            next_bytes = min(
                                group_file_sizes.get(_file_path, 0),
                                max(file_input_progress.get(_file_path, 0), input_bytes),
                            )
                            if next_bytes == file_input_progress.get(_file_path, 0):
                                return
                            file_input_progress[_file_path] = next_bytes
                            active_run.set_state(
                                phase="loading",
                                work_item=(
                                    f"{file_family_names.get(_file_path, family_name)}:"
                                    f"{_file_path.name}"
                                ),
                            )
                            update_group_progress()

                        def make_on_rows_written(
                            group_family_name: str,
                        ) -> Callable[[Path, int], None]:
                            def on_rows_written(_file_path: Path, batch_row_count: int) -> None:
                                raise_if_abort_requested()
                                written_rows_by_family[group_family_name] += batch_row_count
                                active_run.set_state(
                                    phase="loading",
                                    work_item=f"{group_family_name}:{_file_path.name}",
                                )
                                active_run.set_progress(
                                    progress_kind="current_work_item_rows",
                                    completed_units=float(sum(written_rows_by_family.values())),
                                    total_units=0,
                                )

                            return on_rows_written

                        async def make_on_batch_processed(
                            group_family_name: str,
                            file_path: Path,
                            batch_row_count: int,
                        ) -> None:
                            del batch_row_count
                            raise_if_abort_requested()
                            active_run.set_state(
                                phase="loading",
                                work_item=f"{group_family_name}:{file_path.name}",
                            )

                        family_loader = (
                            writer.load_family_distributed
                            if distributed_file_tasks
                            and writer.load_family_distributed is not None
                            else writer.load_family
                        )

                        async def load_one(group_family_name: str) -> CopyStats:
                            return await _load_family_with_abort_monitor(
                                load_family=family_loader,
                                ingest_pool=ingest_pool,
                                runtime_settings=runtime_settings,
                                request=request,
                                plan=plan,
                                family_name=group_family_name,
                                source_release_id=source_release_id,
                                ingest_run_id=ingest_run_id,
                                abort_requested=abort_requested,
                                abort_error=abort_error,
                                on_file_completed=make_on_file_completed(group_family_name),
                                on_rows_written=make_on_rows_written(group_family_name),
                                on_input_progress=on_input_progress,
                                on_batch_processed=lambda file_path, batch_row_count: make_on_batch_processed(
                                    group_family_name,
                                    file_path,
                                    batch_row_count,
                                ),
                            )

                        async with asyncio.TaskGroup() as group:
                            tasks = {
                                item: group.create_task(load_one(item))
                                for item in family_group
                            }
                        return {item: task.result() for item, task in tasks.items()}

                    for family_group in _plan_family_execution_groups(
                        plan,
                        loaded_families=run.families_loaded,
                        parallel_family_groups=writer.parallel_family_groups,
                    ):
                        if len(family_group) > 1:
                            await _assert_not_aborted(control_connection, ingest_run_id)
                            stats_by_family = await load_parallel_family_group(family_group)
                            raise_if_abort_requested()
                            await _assert_not_aborted(control_connection, ingest_run_id)
                            async with control_connection.transaction():
                                for loaded_family_name in family_group:
                                    await adapter.promote_family(
                                        control_connection,
                                        plan,
                                        loaded_family_name,
                                        source_release_id,
                                        ingest_run_id,
                                    )
                                    await _mark_family_loaded(
                                        control_connection,
                                        ingest_run_id,
                                        loaded_family_name,
                                    )
                                    await _mark_s2_dataset_cursor_base_loaded(
                                        control_connection,
                                        request=request,
                                        plan=plan,
                                        family_name=loaded_family_name,
                                        source_release_id=source_release_id,
                                    )
                            completed_family_count += len(family_group)
                            active_run.set_progress(
                                progress_kind="overall",
                                completed_units=float(completed_family_count),
                                total_units=total_progress_units,
                            )
                            for loaded_family_name, stats in stats_by_family.items():
                                record_ingest_family_load(
                                    source_code=request.source_code,
                                    family_name=loaded_family_name,
                                    row_count=stats.row_count,
                                    file_count=stats.file_count,
                                )
                                _emit_event(
                                    "ingest.family.loaded",
                                    ingest_run_id=ingest_run_id,
                                    source_code=request.source_code,
                                    release_tag=request.release_tag,
                                    family=loaded_family_name,
                                    row_count=stats.row_count,
                                    file_count=stats.file_count,
                                )
                            continue

                        family_name = family_group[0]
                        await _assert_not_aborted(control_connection, ingest_run_id)
                        if family_name in run.families_loaded:
                            continue
                        family_plan = next(item for item in plan.families if item.family == family_name)
                        family_file_total = _plan_family_file_total(plan, family_name)
                        family_file_sizes = {
                            file_plan.path: max(0, file_plan.byte_count)
                            for file_plan in family_plan.files
                        }
                        family_input_total_units = float(
                            sum(family_file_sizes.values())
                        )
                        file_input_progress = {
                            file_plan.path: 0 for file_plan in family_plan.files
                        }
                        completed_file_count = 0
                        active_run.set_state(phase="loading", work_item=family_name)
                        active_run.set_progress(
                            progress_kind="current_work_item_files",
                            completed_units=0,
                            total_units=float(family_file_total),
                        )
                        active_run.set_progress(
                            progress_kind="current_work_item_input_bytes",
                            completed_units=0,
                            total_units=family_input_total_units,
                        )
                        active_run.set_progress(
                            progress_kind="current_work_item_rows",
                            completed_units=0,
                            total_units=0,
                        )
                        written_row_count = 0

                        def update_family_progress() -> None:
                            fractional_completed = 1.0
                            if family_input_total_units > 0:
                                completed_input_units = float(sum(file_input_progress.values()))
                                active_run.set_progress(
                                    progress_kind="current_work_item_input_bytes",
                                    completed_units=completed_input_units,
                                    total_units=family_input_total_units,
                                )
                                fractional_completed = completed_input_units / family_input_total_units
                            elif family_file_total > 0:
                                fractional_completed = completed_file_count / family_file_total
                            active_run.set_progress(
                                progress_kind="overall",
                                completed_units=float(completed_family_count) + fractional_completed,
                                total_units=total_progress_units,
                            )

                        def on_file_completed(_file_path: Path, _written_rows: int) -> None:
                            nonlocal completed_file_count
                            raise_if_abort_requested()
                            completed_file_count += 1
                            file_input_progress[_file_path] = max(
                                file_input_progress.get(_file_path, 0),
                                family_file_sizes.get(_file_path, 0),
                            )
                            active_run.set_state(
                                phase="loading",
                                work_item=f"{family_name}:{_file_path.name}",
                            )
                            active_run.set_progress(
                                progress_kind="current_work_item_files",
                                completed_units=float(completed_file_count),
                                total_units=float(family_file_total),
                            )
                            update_family_progress()

                        def on_input_progress(_file_path: Path, input_bytes: int) -> None:
                            raise_if_abort_requested()
                            next_bytes = min(
                                family_file_sizes.get(_file_path, 0),
                                max(file_input_progress.get(_file_path, 0), input_bytes),
                            )
                            if next_bytes == file_input_progress.get(_file_path, 0):
                                return
                            file_input_progress[_file_path] = next_bytes
                            active_run.set_state(
                                phase="loading",
                                work_item=f"{family_name}:{_file_path.name}",
                            )
                            update_family_progress()

                        def on_rows_written(_file_path: Path, batch_row_count: int) -> None:
                            nonlocal written_row_count
                            raise_if_abort_requested()
                            written_row_count += batch_row_count
                            active_run.set_state(
                                phase="loading",
                                work_item=f"{family_name}:{_file_path.name}",
                            )
                            active_run.set_progress(
                                progress_kind="current_work_item_rows",
                                completed_units=float(written_row_count),
                                total_units=0,
                            )

                        family_loader = (
                            writer.load_family_distributed
                            if distributed_file_tasks
                            and writer.load_family_distributed is not None
                            else writer.load_family
                        )
                        stats = await _load_family_with_abort_monitor(
                            load_family=family_loader,
                            ingest_pool=ingest_pool,
                            runtime_settings=runtime_settings,
                            request=request,
                            plan=plan,
                            family_name=family_name,
                            source_release_id=source_release_id,
                            ingest_run_id=ingest_run_id,
                            abort_requested=abort_requested,
                            abort_error=abort_error,
                            on_file_completed=on_file_completed,
                            on_rows_written=on_rows_written,
                            on_input_progress=on_input_progress,
                            on_batch_processed=on_batch_processed,
                        )
                        raise_if_abort_requested()
                        await _assert_not_aborted(control_connection, ingest_run_id)
                        async with control_connection.transaction():
                            await adapter.promote_family(
                                control_connection,
                                plan,
                                family_name,
                                source_release_id,
                                ingest_run_id,
                            )
                            await _mark_family_loaded(control_connection, ingest_run_id, family_name)
                            await _mark_s2_dataset_cursor_base_loaded(
                                control_connection,
                                request=request,
                                plan=plan,
                                family_name=family_name,
                                source_release_id=source_release_id,
                            )
                        completed_family_count += 1
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=float(completed_family_count),
                            total_units=total_progress_units,
                        )
                        record_ingest_family_load(
                            source_code=request.source_code,
                            family_name=family_name,
                            row_count=stats.row_count,
                            file_count=stats.file_count,
                        )
                        _emit_event(
                            "ingest.family.loaded",
                            ingest_run_id=ingest_run_id,
                            source_code=request.source_code,
                            release_tag=request.release_tag,
                            family=family_name,
                            row_count=stats.row_count,
                            file_count=stats.file_count,
                        )

                    _observe_active_phase(
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        phase_name=active_phase_name,
                        phase_started=active_phase_started,
                    )
                    active_run.set_state(phase="indexing")
                    active_run.set_progress(
                        progress_kind="current_work_item_files",
                        completed_units=0,
                        total_units=0,
                    )
                    active_run.set_progress(
                        progress_kind="current_work_item_input_bytes",
                        completed_units=0,
                        total_units=0,
                    )
                    active_run.set_progress(
                        progress_kind="current_work_item_rows",
                        completed_units=0,
                        total_units=0,
                    )

                    await _set_phase(
                        control_connection,
                        ingest_run_id,
                        status_code=INGEST_STATUS_INDEXING,
                        phase_name="indexing",
                    )
                    active_phase_name = "indexing"
                    active_phase_started = perf_counter()
                    _observe_active_phase(
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        phase_name=active_phase_name,
                        phase_started=active_phase_started,
                    )
                    active_run.set_progress(
                        progress_kind="overall",
                        completed_units=float(len(plan.family_names) + 1),
                        total_units=total_progress_units,
                    )

                    await _set_phase(
                        control_connection,
                        ingest_run_id,
                        status_code=INGEST_STATUS_ANALYZING,
                        phase_name="analyzing",
                    )
                    active_phase_name = "analyzing"
                    active_phase_started = perf_counter()
                    active_run.set_state(phase="analyzing")
                    _observe_active_phase(
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        phase_name=active_phase_name,
                        phase_started=active_phase_started,
                    )
                    active_run.set_progress(
                        progress_kind="overall",
                        completed_units=total_progress_units,
                        total_units=total_progress_units,
                    )
                    active_phase_name = None
                    active_phase_started = None
                    await _assert_not_aborted(control_connection, ingest_run_id)
                    await _finalize_published(control_connection, ingest_run_id, source_release_id)
                    record_ingest_run(source_code=request.source_code, outcome="published")
                    _emit_event(
                        "ingest.cycle.published",
                        ingest_run_id=ingest_run_id,
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        families=plan.family_names,
                        total_duration_s=perf_counter() - cycle_started,
                    )
                    return str(ingest_run_id)
            except (IngestAlreadyPublished, IngestAlreadyInProgress):
                raise
            except IngestAborted as exc:
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                if ingest_run_id is not None:
                    if await _record_terminal_status_fresh(
                        runtime_settings,
                        ingest_run_id=ingest_run_id,
                        status_code=INGEST_STATUS_ABORTED,
                        error_message=str(exc),
                    ):
                        record_ingest_run(source_code=request.source_code, outcome="aborted")
                        _emit_event(
                            "ingest.cycle.aborted",
                            ingest_run_id=ingest_run_id,
                            source_code=request.source_code,
                            release_tag=request.release_tag,
                            reason=str(exc),
                        )
                raise
            except asyncio.CancelledError:
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                if ingest_run_id is not None:
                    try:
                        recorded = await asyncio.shield(
                            _record_terminal_status_fresh(
                                runtime_settings,
                                ingest_run_id=ingest_run_id,
                                status_code=INGEST_STATUS_ABORTED,
                                error_message="run cancelled (time_limit or worker shutdown)",
                            )
                        )
                        if recorded:
                            record_ingest_run(source_code=request.source_code, outcome="aborted")
                            _emit_event(
                                "ingest.cycle.aborted",
                                ingest_run_id=ingest_run_id,
                                source_code=request.source_code,
                                release_tag=request.release_tag,
                                reason="cancelled",
                            )
                    except BaseException:
                        LOGGER.exception(
                            "failed to mark ingest run aborted during cancellation",
                        )
                raise
            except Exception as exc:
                failure_phase = active_phase_name or ("loading" if family_name is not None else "start")
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                if ingest_run_id is not None:
                    if await _record_terminal_status_fresh(
                        runtime_settings,
                        ingest_run_id=ingest_run_id,
                        status_code=INGEST_STATUS_FAILED,
                        error_message=str(exc),
                    ):
                        record_ingest_run(source_code=request.source_code, outcome="failed")
                        record_ingest_failure(
                            source_code=request.source_code,
                            phase=failure_phase,
                            failure_class=type(exc).__name__,
                            family=family_name,
                        )
                        _emit_event(
                            "ingest.cycle.failed",
                            ingest_run_id=ingest_run_id,
                            source_code=request.source_code,
                            release_tag=request.release_tag,
                            phase=failure_phase,
                            family=family_name,
                            error_class=type(exc).__name__,
                            error_message=str(exc),
                        )
                raise
            finally:
                await _unlock_advisory_lock_best_effort(
                    control_connection,
                    lock_key,
                    scope=f"ingest:{request.source_code}:{request.release_tag}",
                )


async def _acquire_release_lock(
    connection: asyncpg.Connection,
    request: StartReleaseRequest,
) -> int:
    lock_key = await resolve_release_advisory_lock_key(
        connection,
        source_code=request.source_code,
        release_tag=request.release_tag,
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise IngestAlreadyInProgress(
            f"release {request.source_code}:{request.release_tag} is already locked"
        )
    return int(lock_key)


async def resolve_release_advisory_lock_key(
    connection: asyncpg.Connection,
    *,
    source_code: SourceCode,
    release_tag: str,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        f"ingest:{source_code}:{release_tag}",
    )
    return int(lock_key)


async def _ensure_source_release(
    connection: asyncpg.Connection,
    request: StartReleaseRequest,
    plan: IngestPlan,
) -> int:
    row = await connection.fetchrow(
        """
        INSERT INTO solemd.source_releases (
            source_published_at,
            manifest_checksum,
            manifest_uri,
            source_name,
            source_release_key,
            release_status
        )
        VALUES ($1, $2, $3, $4, $5, 'planned')
        ON CONFLICT (source_name, source_release_key)
        DO UPDATE SET
            source_published_at = EXCLUDED.source_published_at,
            manifest_checksum = EXCLUDED.manifest_checksum,
            manifest_uri = EXCLUDED.manifest_uri
        RETURNING source_release_id
        """,
        plan.source_published_at,
        plan.release_checksum,
        plan.manifest_uri,
        request.source_code,
        request.release_tag,
    )
    return int(row["source_release_id"])


async def _mark_source_release_ingesting(
    connection: asyncpg.Connection,
    source_release_id: int,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.source_releases
        SET release_status = 'ingesting'
        WHERE source_release_id = $1
        """,
        source_release_id,
    )


async def _open_or_resume_run(
    connection: asyncpg.Connection,
    *,
    request: StartReleaseRequest,
    plan: IngestPlan,
    source_release_id: int,
    lock_key: int,
) -> IngestRunRecord:
    latest = await connection.fetchrow(
        """
        SELECT ingest_run_id, source_release_id, status, families_loaded, last_loaded_family,
               manifest_uri, plan_manifest, requested_status
        FROM solemd.ingest_runs
        WHERE source_release_id = $1
        ORDER BY started_at DESC
        LIMIT 1
        """,
        source_release_id,
    )
    plan_payload = plan.model_dump(mode="json")

    if latest is not None:
        run = IngestRunRecord.model_validate(dict(latest))
        if run.status == INGEST_STATUS_PUBLISHED and not request.force_new_run:
            raise IngestAlreadyPublished(
                f"release {request.source_code}:{request.release_tag} already published"
            )
        if request.force_new_run and run.status not in (
            INGEST_STATUS_PUBLISHED,
            INGEST_STATUS_FAILED,
            INGEST_STATUS_ABORTED,
        ):
            raise IngestAlreadyInProgress(
                "unfinished ingest run must resume before force_new_run is allowed"
            )
        if run.status != INGEST_STATUS_PUBLISHED and not request.force_new_run:
            ignored_resume_families = _ignored_resume_families(
                run.plan_manifest,
                plan_payload,
                loaded_families=run.families_loaded,
            )
            if (
                run.plan_manifest is not None
                and _resume_contract_digest(
                    run.plan_manifest,
                    loaded_families=run.families_loaded,
                    ignored_families=ignored_resume_families,
                )
                != _resume_contract_digest(
                    plan_payload,
                    loaded_families=run.families_loaded,
                    ignored_families=ignored_resume_families,
                )
            ):
                raise PlanDrift(
                    f"planned family layout drifted for {request.source_code}:{request.release_tag}"
                )
            if latest["requested_status"] == INGEST_REQUESTED_STATUS_ABORT and run.status not in (
                INGEST_STATUS_FAILED,
                INGEST_STATUS_ABORTED,
            ):
                abort_message = f"operator requested abort for run {run.ingest_run_id}"
                await _set_terminal_status(
                    connection,
                    run.ingest_run_id,
                    INGEST_STATUS_ABORTED,
                    abort_message,
                )
                raise IngestAborted(abort_message)
            await connection.execute(
                """
                UPDATE solemd.ingest_runs
                SET advisory_lock_key = $1,
                    manifest_uri = $2,
                    plan_manifest = $3,
                    error_message = NULL,
                    completed_at = NULL,
                    requested_status = NULL
                WHERE ingest_run_id = $4
                """,
                lock_key,
                plan.manifest_uri,
                plan_payload,
                run.ingest_run_id,
            )
            return IngestRunRecord(
                ingest_run_id=run.ingest_run_id,
                source_release_id=source_release_id,
                status=run.status,
                families_loaded=run.families_loaded,
                last_loaded_family=run.last_loaded_family,
                manifest_uri=plan.manifest_uri,
                plan_manifest=plan_payload,
            )

    row = await connection.fetchrow(
        """
        INSERT INTO solemd.ingest_runs (
            advisory_lock_key,
            source_release_id,
            status,
            manifest_uri,
            plan_manifest,
            phase_started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ingest_run_id, source_release_id, status, families_loaded, last_loaded_family,
                  manifest_uri, plan_manifest
        """,
        lock_key,
        source_release_id,
        INGEST_STATUS_STARTED,
        plan.manifest_uri,
        plan_payload,
        {"started": datetime.now(UTC).isoformat()},
    )
    return IngestRunRecord.model_validate(dict(row))


async def _set_phase(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    *,
    status_code: int,
    phase_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            phase_started_at = phase_started_at || jsonb_build_object($2::text, $3::text)
        WHERE ingest_run_id = $4
        """,
        status_code,
        phase_name,
        datetime.now(UTC).isoformat(),
        ingest_run_id,
    )


async def _mark_family_loaded(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    family_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET families_loaded = CASE
                WHEN NOT ($1 = ANY(families_loaded)) THEN array_append(families_loaded, $1)
                ELSE families_loaded
            END,
            last_loaded_family = $1
        WHERE ingest_run_id = $2
        """,
        family_name,
        ingest_run_id,
    )


async def _mark_s2_dataset_cursor_base_loaded(
    connection: asyncpg.Connection,
    *,
    request: StartReleaseRequest,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
) -> None:
    if request.source_code != "s2":
        return
    await mark_s2_family_base_loaded(
        connection,
        plan=plan,
        family_name=family_name,
        source_release_id=source_release_id,
    )


def _plan_family_file_total(plan: IngestPlan, family_name: str) -> int:
    family = next(item for item in plan.families if item.family == family_name)
    return len(family.files)


def _plan_family_execution_groups(
    plan: IngestPlan,
    *,
    loaded_families: tuple[str, ...],
    parallel_family_groups: tuple[tuple[str, ...], ...],
) -> tuple[tuple[str, ...], ...]:
    loaded = set(loaded_families)
    family_names = plan.family_names
    groups: list[tuple[str, ...]] = []
    index = 0
    while index < len(family_names):
        family_name = family_names[index]
        if family_name in loaded:
            index += 1
            continue
        matched_group: tuple[str, ...] | None = None
        for candidate in parallel_family_groups:
            candidate_length = len(candidate)
            if candidate_length <= 1:
                continue
            if tuple(family_names[index : index + candidate_length]) != candidate:
                continue
            if any(item in loaded for item in candidate):
                continue
            matched_group = candidate
            break
        if matched_group is None:
            groups.append((family_name,))
            index += 1
            continue
        groups.append(matched_group)
        index += len(matched_group)
    return tuple(groups)


async def _assert_not_aborted(connection: asyncpg.Connection, ingest_run_id: UUID) -> None:
    requested_status = await connection.fetchval(
        "SELECT requested_status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
        ingest_run_id,
    )
    if requested_status == INGEST_REQUESTED_STATUS_ABORT:
        raise IngestAborted(f"operator requested abort for run {ingest_run_id}")


async def _finalize_published(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    source_release_id: int,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            completed_at = now(),
            error_message = NULL
        WHERE ingest_run_id = $2
        """,
        INGEST_STATUS_PUBLISHED,
        ingest_run_id,
    )
    await connection.execute(
        """
        UPDATE solemd.source_releases
        SET release_status = 'loaded',
            source_ingested_at = now()
        WHERE source_release_id = $1
        """,
        source_release_id,
    )


async def _set_terminal_status(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    status_code: int,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            completed_at = now(),
            error_message = $2,
            requested_status = NULL
        WHERE ingest_run_id = $3
        """,
        status_code,
        error_message[:2000],
        ingest_run_id,
    )


async def _record_terminal_status_fresh(
    runtime_settings: Settings,
    *,
    ingest_run_id: UUID,
    status_code: int,
    error_message: str,
) -> bool:
    try:
        async with open_named_connection(runtime_settings, name="ingest_write") as connection:
            await _set_terminal_status(
                connection,
                ingest_run_id,
                status_code,
                error_message,
            )
        return True
    except Exception:
        LOGGER.exception(
            "failed to persist terminal ingest status",
            extra={
                "ingest_run_id": str(ingest_run_id),
                "status_code": status_code,
            },
        )
        return False


async def _load_family_with_abort_monitor(
    *,
    load_family: Callable[
        [
            asyncpg.Pool,
            Settings,
            StartReleaseRequest,
            IngestPlan,
            str,
            int,
            UUID,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], None] | None,
            Callable[[Path, int], Awaitable[None]] | None,
        ],
        asyncio.Future | object,
    ],
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings,
    request: StartReleaseRequest,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
    ingest_run_id: UUID,
    abort_requested: asyncio.Event,
    abort_error: IngestAborted,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    family_task = asyncio.create_task(
        load_family(
            ingest_pool,
            runtime_settings,
            request,
            plan,
            family_name,
            source_release_id,
            ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    )
    try:
        async with open_named_connection(runtime_settings, name="ingest_write") as abort_connection:
            abort_task = asyncio.create_task(
                _wait_for_abort_signal(
                    abort_connection,
                    ingest_run_id=ingest_run_id,
                    abort_requested=abort_requested,
                    poll_interval_seconds=runtime_settings.ingest_abort_poll_interval_seconds,
                    abort_error=abort_error,
                )
            )
            try:
                done, _pending = await asyncio.wait(
                    {family_task, abort_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if family_task in done:
                    abort_task.cancel()
                    await asyncio.gather(abort_task, return_exceptions=True)
                    try:
                        return await family_task
                    except BaseException as exc:
                        if _contains_exception(exc, IngestAborted):
                            raise abort_error from exc
                        raise

                abort_exception = await abort_task
                try:
                    await asyncio.wait_for(
                        asyncio.shield(family_task),
                        timeout=runtime_settings.ingest_abort_poll_interval_seconds,
                    )
                except TimeoutError:
                    family_task.cancel()
                except BaseException as exc:
                    if _contains_exception(exc, IngestAborted):
                        pass
                    else:
                        raise
                await asyncio.gather(family_task, return_exceptions=True)
                raise abort_exception
            finally:
                if not abort_task.done():
                    abort_task.cancel()
                    await asyncio.gather(abort_task, return_exceptions=True)
    finally:
        if not family_task.done():
            family_task.cancel()
            await asyncio.gather(family_task, return_exceptions=True)


async def _wait_for_abort_signal(
    connection: asyncpg.Connection,
    *,
    ingest_run_id: UUID,
    abort_requested: asyncio.Event,
    poll_interval_seconds: float,
    abort_error: IngestAborted,
) -> IngestAborted:
    while True:
        await asyncio.sleep(poll_interval_seconds)
        try:
            await _assert_not_aborted(connection, ingest_run_id)
        except IngestAborted:
            abort_requested.set()
            return abort_error


async def _unlock_advisory_lock_best_effort(
    connection: asyncpg.Connection,
    lock_key: int,
    *,
    scope: str,
) -> None:
    try:
        await asyncio.shield(connection.execute("SELECT pg_advisory_unlock($1)", lock_key))
    except BaseException:
        LOGGER.exception("failed to release advisory lock for %s", scope)


def _contains_exception(exc: BaseException, expected_type: type[BaseException]) -> bool:
    if isinstance(exc, expected_type):
        return True
    if isinstance(exc, BaseExceptionGroup):
        return any(_contains_exception(item, expected_type) for item in exc.exceptions)
    return False


def _resume_contract_digest(
    payload: dict,
    *,
    loaded_families: tuple[str, ...] = (),
    ignored_families: frozenset[str] = frozenset(),
) -> str:
    loaded_family_set = set(loaded_families)
    canonical_families: list[dict[str, object]] = []
    for family in payload.get("families", ()):
        family_name = family.get("family")
        if family_name in loaded_family_set or family_name in ignored_families:
            continue
        canonical_families.append(
            {
                "family": family_name,
                "source_datasets": family.get("source_datasets", ()),
                "target_tables": family.get("target_tables", ()),
                "files": [
                    {
                        "dataset": file_plan.get("dataset"),
                        "byte_count": file_plan.get("byte_count"),
                        "content_kind": file_plan.get("content_kind"),
                    }
                    for file_plan in family.get("files", ())
                ],
            }
        )
    canonical_payload = {
        "schema_version": payload.get("schema_version"),
        "source_code": payload.get("source_code"),
        "release_tag": payload.get("release_tag"),
        "release_checksum": payload.get("release_checksum"),
        "source_published_at": payload.get("source_published_at"),
        "families": canonical_families,
    }
    return hashlib.sha256(
        json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _ignored_resume_families(
    persisted_payload: dict | None,
    current_payload: dict,
    *,
    loaded_families: tuple[str, ...],
) -> frozenset[str]:
    if persisted_payload is None:
        return frozenset()
    loaded_family_set = set(loaded_families)
    current_family_names = {
        str(family.get("family"))
        for family in current_payload.get("families", ())
        if family.get("family")
    }
    current_deferred_names = {
        str(family_name)
        for family_name in current_payload.get("deferred_families", ())
    }
    ignored: set[str] = set()
    for family in persisted_payload.get("families", ()):
        family_name = family.get("family")
        if not family_name:
            continue
        family_name = str(family_name)
        if family_name in loaded_family_set or family_name in current_family_names:
            continue
        if family_name in current_deferred_names:
            ignored.add(family_name)
    return frozenset(ignored)


def _emit_event(event_name: str, **fields: object) -> None:
    LOGGER.info("%s %s", event_name, json.dumps(fields, sort_keys=True, default=str))


def _observe_active_phase(
    *,
    source_code: str,
    release_tag: str,
    phase_name: str | None,
    phase_started: float | None,
) -> None:
    if phase_name is None or phase_started is None:
        return
    observe_ingest_phase(
        source_code=source_code,
        release_tag=release_tag,
        phase=phase_name,
        duration_seconds=perf_counter() - phase_started,
    )
