from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, StartReleaseRequest
from app.ingest.writers.base import copy_records
from app.ingest.writers.s2_streaming import iter_s2_row_batches


_S2ORC_DOCUMENT_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "source_release_id",
    "text_hash",
    "document_payload",
    "last_seen_run_id",
)


async def load_s2orc_documents(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files // 2))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            written = await _copy_s2orc_file(
                connection,
                file_path=file_path,
                request=request,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                batch_size=max(64, settings.ingest_copy_batch_rows // 32),
                on_rows_written=on_rows_written,
                on_input_progress=on_input_progress,
                on_batch_processed=on_batch_processed,
            )
            if on_file_completed is not None:
                on_file_completed(file_path, written)
            return written

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family="s2orc_v2",
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _copy_s2orc_file(
    connection: asyncpg.Connection,
    *,
    file_path: Path,
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    batch_size: int,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> int:
    written = 0
    async for row_batch in iter_s2_row_batches(
        file_path,
        family_name="s2orc_v2",
        request=request,
        batch_size=batch_size,
        on_input_progress=(
            None
            if on_input_progress is None
            else lambda bytes_read: on_input_progress(file_path, bytes_read)
        ),
    ):
        await _flush_document_batch(
            connection,
            row_batch,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
        )
        written += len(row_batch)
        if on_rows_written is not None:
            on_rows_written(file_path, len(row_batch))
        if on_batch_processed is not None:
            await on_batch_processed(file_path, len(row_batch))
    return written


async def _flush_document_batch(
    connection: asyncpg.Connection,
    documents: Sequence[dict[str, Any]],
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> int:
    if not documents:
        return 0
    paper_ids = [document["paper_id"] for document in documents]
    payload_rows = [
        (
            document["paper_id"],
            source_release_id,
            document["text_hash"],
            json.dumps(
                {
                    "document_source_kind": document["document_source_kind"],
                    "source_priority": document["source_priority"],
                    "sections": document["sections"],
                    "blocks": document["blocks"],
                    "sentences": document["sentences"],
                },
                sort_keys=True,
                separators=(",", ":"),
            ),
            ingest_run_id,
        )
        for document in documents
    ]
    async with connection.transaction():
        await connection.execute(
            """
            DELETE FROM solemd.s2orc_documents_raw
            WHERE paper_id = ANY($1::text[])
            """,
            paper_ids,
        )
        return await copy_records(
            connection,
            table_name="s2orc_documents_raw",
            schema_name="solemd",
            columns=_S2ORC_DOCUMENT_COLUMNS,
            records=payload_rows,
        )
