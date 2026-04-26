from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, StartReleaseRequest
from app.ingest.writers import s2_citation_stage, s2_citation_tasks


LOGGER = logging.getLogger(__name__)

_CITATION_FAMILY_NAME = "citations"


async def load_citations_inline(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    file_names = tuple(file_plan.path.name for file_plan in files)
    async with pool.acquire() as control_connection, control_connection.transaction():
        completed_file_names = await s2_citation_stage.completed_citation_file_names(
            control_connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            file_names=file_names,
        )
        await s2_citation_stage.reset_citation_stage_for_pending_files(
            control_connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            completed_file_names=completed_file_names,
        )
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))
    pending_files = tuple(
        file_plan
        for file_plan in files
        if file_plan.path.name not in completed_file_names
    )

    if on_file_completed is not None:
        for file_plan in files:
            if file_plan.path.name in completed_file_names:
                on_file_completed(file_plan.path, 0)

    async def worker(file_plan: FilePlan) -> int:
        file_path = file_plan.path
        async with semaphore, pool.acquire() as connection:
            await s2_citation_stage.reset_citation_file_stage(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_path.name,
            )
            written = await s2_citation_stage.stage_citation_metrics_for_file(
                connection,
                file_path=file_path,
                request=request,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                batch_size=settings.ingest_copy_batch_rows,
                on_rows_written=on_rows_written,
                on_input_progress=on_input_progress,
                on_batch_processed=on_batch_processed,
            )
            stage_row_count = await s2_citation_stage.mark_citation_file_completed(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_path.name,
                file_byte_count=file_plan.byte_count,
            )
            if on_file_completed is not None:
                on_file_completed(file_path, stage_row_count)
            return written

    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(worker(file_plan)) for file_plan in pending_files]
    except Exception:
        async with pool.acquire() as control_connection, control_connection.transaction():
            completed_file_names = await s2_citation_stage.completed_citation_file_names(
                control_connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_names=file_names,
            )
            await s2_citation_stage.delete_incomplete_citation_file_stage(
                control_connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                completed_file_names=completed_file_names,
            )
        raise
    async with pool.acquire() as control_connection, control_connection.transaction():
        final_row_count = await s2_citation_stage.replace_citation_metrics_from_stage(
            control_connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
        )
    return CopyStats(
        family=_CITATION_FAMILY_NAME,
        row_count=final_row_count,
        file_count=len(files),
    )


async def load_citations_distributed(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    del on_batch_processed
    file_names = tuple(file_plan.path.name for file_plan in files)
    file_by_name = {file_plan.path.name: file_plan for file_plan in files}
    completed_seen: set[str] = set()
    reported_rows = 0

    async with pool.acquire() as connection, connection.transaction():
        completed_file_names = await _prepare_citation_file_tasks(
            connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            files=files,
            file_names=file_names,
        )
        completed_seen.update(completed_file_names)
        dispatch_names = await s2_citation_tasks.claim_pending_citation_dispatches(
            connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            stale_after_seconds=settings.ingest_file_task_stale_after_seconds,
        )

    for file_name in sorted(dispatch_names):
        _send_citation_file_task(
            request=request,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            file_plan=file_by_name[file_name],
        )

    for file_name in sorted(completed_file_names):
        file_plan = file_by_name[file_name]
        if on_input_progress is not None:
            on_input_progress(file_plan.path, file_plan.byte_count)
        if on_file_completed is not None:
            on_file_completed(file_plan.path, 0)

    while True:
        async with pool.acquire() as connection:
            await s2_citation_tasks.raise_if_run_aborted(connection, ingest_run_id)
            stale_names = await s2_citation_tasks.reset_stale_citation_file_tasks(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                stale_after_seconds=settings.ingest_file_task_stale_after_seconds,
            )
            retry_names = await s2_citation_tasks.reset_retryable_citation_file_tasks(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                max_attempts=settings.ingest_file_task_max_attempts,
            )
            dispatch_names = await s2_citation_tasks.claim_pending_citation_dispatches(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                stale_after_seconds=settings.ingest_file_task_stale_after_seconds,
            )
            progress = await s2_citation_tasks.fetch_citation_file_task_progress(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
            )
            completed_rows = await s2_citation_tasks.fetch_completed_citation_file_tasks(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
            )
            terminal_failures = await s2_citation_tasks.fetch_terminal_citation_file_failures(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                max_attempts=settings.ingest_file_task_max_attempts,
            )

        for file_name in sorted(set(stale_names) | set(retry_names) | set(dispatch_names)):
            _send_citation_file_task(
                request=request,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_plan=file_by_name[file_name],
            )

        completed_stage_rows = int(progress["completed_stage_rows"] or 0)
        if on_rows_written is not None and completed_stage_rows > reported_rows:
            on_rows_written(files[0].path, completed_stage_rows - reported_rows)
            reported_rows = completed_stage_rows

        for row in completed_rows:
            file_name = str(row["file_name"])
            if file_name in completed_seen:
                continue
            completed_seen.add(file_name)
            file_plan = file_by_name[file_name]
            if on_input_progress is not None:
                on_input_progress(file_plan.path, file_plan.byte_count)
            if on_file_completed is not None:
                on_file_completed(file_plan.path, int(row["stage_row_count"] or 0))

        if terminal_failures:
            first = terminal_failures[0]
            raise RuntimeError(
                "S2 citation file task failed after "
                f"{first['attempt_count']} attempt(s): {first['file_name']}: "
                f"{first['last_error']}"
            )
        if int(progress["completed_count"] or 0) == len(files):
            break

        await asyncio.sleep(settings.ingest_file_task_poll_interval_seconds)

    async with pool.acquire() as control_connection, control_connection.transaction():
        final_row_count = await s2_citation_stage.replace_citation_metrics_from_stage(
            control_connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
        )
    return CopyStats(
        family=_CITATION_FAMILY_NAME,
        row_count=final_row_count,
        file_count=len(files),
    )


async def load_citation_file_task(
    pool: asyncpg.Pool,
    settings: Settings,
    *,
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    file_plan: FilePlan,
) -> None:
    async with pool.acquire() as connection:
        claim_token = await s2_citation_tasks.claim_citation_file_task(
            connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            file_name=file_plan.path.name,
            max_attempts=settings.ingest_file_task_max_attempts,
        )
        if claim_token is None:
            return
        try:
            await s2_citation_tasks.raise_if_run_aborted(connection, ingest_run_id)
            await s2_citation_stage.reset_citation_file_stage(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_plan.path.name,
            )

            rows_written = 0
            latest_input_bytes = 0

            def on_input_progress(input_bytes: int) -> None:
                nonlocal latest_input_bytes
                latest_input_bytes = max(latest_input_bytes, input_bytes)

            async def on_batch_processed(_file_path: Path, batch_row_count: int) -> None:
                nonlocal rows_written
                rows_written += batch_row_count
                await s2_citation_tasks.heartbeat_citation_file_task(
                    connection,
                    source_release_id=source_release_id,
                    ingest_run_id=ingest_run_id,
                    file_name=file_plan.path.name,
                    claim_token=claim_token,
                    input_bytes_read=latest_input_bytes,
                    rows_written=rows_written,
                )
                await s2_citation_tasks.raise_if_run_aborted(connection, ingest_run_id)

            await s2_citation_stage.stage_citation_metrics_for_file(
                connection,
                file_path=file_plan.path,
                request=request,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                batch_size=settings.ingest_copy_batch_rows,
                on_input_progress=lambda _path, input_bytes: on_input_progress(input_bytes),
                on_batch_processed=on_batch_processed,
                claim_token=claim_token,
            )
            stage_row_count = await s2_citation_stage.mark_citation_file_completed(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_plan.path.name,
                file_byte_count=file_plan.byte_count,
                claim_token=claim_token,
            )
            await s2_citation_tasks.complete_citation_file_task(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_plan.path.name,
                claim_token=claim_token,
                file_byte_count=file_plan.byte_count,
                stage_row_count=stage_row_count,
            )
        except Exception as exc:
            await s2_citation_tasks.fail_citation_file_task(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_plan.path.name,
                claim_token=claim_token,
                error_message=str(exc),
            )
            LOGGER.exception(
                "S2 citation file task failed",
                extra={
                    "ingest_run_id": str(ingest_run_id),
                    "source_release_id": source_release_id,
                    "file_name": file_plan.path.name,
                },
            )


async def _prepare_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    files: Sequence[FilePlan],
    file_names: Sequence[str],
) -> frozenset[str]:
    completed_file_names = await s2_citation_stage.completed_citation_file_names(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        file_names=file_names,
    )
    await s2_citation_tasks.upsert_citation_file_tasks(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        files=files,
    )
    await s2_citation_stage.reset_citation_stage_for_pending_files(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        completed_file_names=completed_file_names,
    )
    await s2_citation_stage.delete_invalid_citation_file_checkpoints(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        completed_file_names=completed_file_names,
    )
    await s2_citation_tasks.mark_completed_citation_file_tasks_from_checkpoints(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        completed_file_names=completed_file_names,
    )
    await s2_citation_tasks.reset_pending_citation_file_tasks(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        completed_file_names=completed_file_names,
    )
    return completed_file_names


def _send_citation_file_task(
    *,
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    file_plan: FilePlan,
) -> None:
    from app.actors.ingest import load_s2_citation_file

    load_s2_citation_file.send(
        request=request.model_dump(mode="json"),
        source_release_id=source_release_id,
        ingest_run_id=str(ingest_run_id),
        file_plan=file_plan.model_dump(mode="json"),
    )
