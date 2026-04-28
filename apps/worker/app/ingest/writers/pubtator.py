from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from pathlib import Path
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.sources import pubtator
from app.ingest.writers.base import copy_records, iter_file_batches


_ENTITY_COLUMNS: tuple[str, ...] = (
    "source_release_id",
    "pmid",
    "start_offset",
    "end_offset",
    "entity_type",
    "mention_text",
    "concept_id_raw",
    "resource",
    "corpus_id",
    "last_seen_run_id",
)

_RELATION_COLUMNS: tuple[str, ...] = (
    "source_release_id",
    "pmid",
    "relation_type",
    "subject_entity_id",
    "object_entity_id",
    "subject_type",
    "object_type",
    "relation_source",
    "corpus_id",
    "last_seen_run_id",
)

_BIOCXML_RESOURCE_CODE = 1
_BIOCONCEPTS_RESOURCE_CODE = 2
_BIOCXML_RELATION_SOURCE_CODE = 1
_RELATION_TSV_SOURCE_CODE = 2
_ENTITY_STAGE_BUFFER_TABLE = "pt3_entity_annotations_stage_buffer"
_RELATION_STAGE_BUFFER_TABLE = "pt3_relations_stage_buffer"


async def load_family(
    pool: asyncpg.Pool,
    settings: Settings,
    request: StartReleaseRequest,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
    ingest_run_id: UUID,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    family = next(item for item in plan.families if item.family == family_name)
    if family_name == "biocxml":
        return await _load_biocxml_family(
            pool,
            settings,
            family.files,
            request,
            source_release_id,
            ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "bioconcepts":
        return await _load_entity_family(
            pool,
            settings,
            family_name,
            family.files,
            request,
            source_release_id,
            ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "relations":
        return await _load_relations_family(
            pool,
            settings,
            family.files,
            request,
            source_release_id,
            ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    raise ValueError(f"unsupported PubTator family {family_name}")


async def _load_biocxml_family(
    pool: asyncpg.Pool,
    settings: Settings,
    files: tuple[FilePlan, ...],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    await _reset_release_resource(
        pool,
        table="entity_annotations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        resource=_BIOCXML_RESOURCE_CODE,
    )
    await _reset_release_relation_source(
        pool,
        table="relations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        relation_source=_BIOCXML_RELATION_SOURCE_CODE,
    )

    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            await _ensure_stage_merge_buffers(connection)
            written = 0
            async for row_batch in iter_file_batches(
                file_path,
                row_iterator=lambda path, on_progress: pubtator.stream_family(
                    "biocxml",
                    path,
                    max_records_per_file=request.max_records_per_file,
                    on_progress=on_progress,
                ),
                batch_size=settings.ingest_copy_batch_rows,
                on_input_progress=(
                    None
                    if on_input_progress is None
                    else lambda bytes_read: on_input_progress(file_path, bytes_read)
                ),
            ):
                entity_batch = [
                    (
                        source_release_id,
                        row["pmid"],
                        row["start_offset"],
                        row["end_offset"],
                        row["entity_type"],
                        row["mention_text"],
                        row["concept_id_raw"],
                        row["resource"],
                        None,
                        ingest_run_id,
                    )
                    for row in row_batch
                    if row["row_kind"] == "entity"
                ]
                relation_batch = [
                    (
                        source_release_id,
                        row["pmid"],
                        row["relation_type"],
                        row["subject_entity_id"],
                        row["object_entity_id"],
                        row["subject_type"],
                        row["object_type"],
                        row["relation_source"],
                        None,
                        ingest_run_id,
                    )
                    for row in row_batch
                    if row["row_kind"] == "relation"
                ]
                async with connection.transaction():
                    if entity_batch:
                        batch_written = await _merge_entity_stage_batch(connection, entity_batch)
                        written += batch_written
                        if on_rows_written is not None and batch_written:
                            on_rows_written(file_path, batch_written)
                        if on_batch_processed is not None and batch_written:
                            await on_batch_processed(file_path, batch_written)
                    if relation_batch:
                        batch_written = await _merge_relation_stage_batch(
                            connection,
                            relation_batch,
                        )
                        written += batch_written
                        if on_rows_written is not None and batch_written:
                            on_rows_written(file_path, batch_written)
                        if on_batch_processed is not None and batch_written:
                            await on_batch_processed(file_path, batch_written)
            if on_file_completed is not None:
                on_file_completed(file_path, written)
            return written

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family="biocxml",
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _load_entity_family(
    pool: asyncpg.Pool,
    settings: Settings,
    family_name: str,
    files: tuple[FilePlan, ...],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    resource = (
        _BIOCXML_RESOURCE_CODE if family_name == "biocxml" else _BIOCONCEPTS_RESOURCE_CODE
    )
    await _reset_release_resource(
        pool,
        table="entity_annotations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        resource=resource,
    )

    def row_to_tuple(row: dict) -> tuple:
        return (
            source_release_id,
            row["pmid"],
            row["start_offset"],
            row["end_offset"],
            row["entity_type"],
            row["mention_text"],
            row["concept_id_raw"],
            row["resource"],
            None,
            ingest_run_id,
        )

    def row_iterator(file_path, on_progress):
        return pubtator.stream_family(
            family_name,
            file_path,
            max_records_per_file=request.max_records_per_file,
            on_progress=on_progress,
        )

    row_count = await _copy_stage_files_concurrently(
        pool,
        [file_plan.path for file_plan in files],
        row_iterator=row_iterator,
        row_to_tuple=row_to_tuple,
        on_file_completed=on_file_completed,
        on_rows_written=on_rows_written,
        on_input_progress=on_input_progress,
        on_batch_processed=on_batch_processed,
        batch_size=settings.ingest_copy_batch_rows,
        concurrency=settings.ingest_max_concurrent_files,
        batch_concurrency=settings.ingest_max_concurrent_batches_per_file,
        merge_batch=_merge_entity_stage_batch,
    )
    return CopyStats(family=family_name, row_count=row_count, file_count=len(files))


async def _load_relations_family(
    pool: asyncpg.Pool,
    settings: Settings,
    files: tuple[FilePlan, ...],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    await _reset_release_relation_source(
        pool,
        table="relations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        relation_source=_RELATION_TSV_SOURCE_CODE,
    )

    def row_to_tuple(row: dict) -> tuple:
        return (
            source_release_id,
            row["pmid"],
            row["relation_type"],
            row["subject_entity_id"],
            row["object_entity_id"],
            row["subject_type"],
            row["object_type"],
            row["relation_source"],
            None,
            ingest_run_id,
        )

    def row_iterator(file_path, on_progress):
        return pubtator.stream_family(
            "relations",
            file_path,
            max_records_per_file=request.max_records_per_file,
            on_progress=on_progress,
        )

    row_count = await _copy_stage_files_concurrently(
        pool,
        [file_plan.path for file_plan in files],
        row_iterator=row_iterator,
        row_to_tuple=row_to_tuple,
        on_file_completed=on_file_completed,
        on_rows_written=on_rows_written,
        on_input_progress=on_input_progress,
        on_batch_processed=on_batch_processed,
        batch_size=settings.ingest_copy_batch_rows,
        concurrency=settings.ingest_max_concurrent_files,
        batch_concurrency=settings.ingest_max_concurrent_batches_per_file,
        merge_batch=_merge_relation_stage_batch,
    )
    return CopyStats(family="relations", row_count=row_count, file_count=len(files))


async def _copy_stage_files_concurrently(
    pool: asyncpg.Pool,
    file_paths: list[Path],
    *,
    row_iterator: Callable[[Path, Callable[[int], None] | None], object],
    row_to_tuple: Callable[[dict], tuple],
    on_file_completed: Callable[[Path, int], None] | None,
    on_rows_written: Callable[[Path, int], None] | None,
    on_input_progress: Callable[[Path, int], None] | None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None,
    batch_size: int,
    concurrency: int,
    batch_concurrency: int,
    merge_batch: Callable[[asyncpg.Connection, list[tuple]], asyncio.Future | object],
) -> int:
    if not file_paths:
        return 0

    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def worker(file_path: Path) -> int:
        async with semaphore:
            written = await _copy_stage_file_batches(
                pool,
                file_path,
                row_iterator=row_iterator,
                row_to_tuple=row_to_tuple,
                on_rows_written=on_rows_written,
                on_input_progress=on_input_progress,
                on_batch_processed=on_batch_processed,
                batch_size=batch_size,
                batch_concurrency=batch_concurrency,
                merge_batch=merge_batch,
            )
            if on_file_completed is not None:
                on_file_completed(file_path, written)
            return written

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_path)) for file_path in file_paths]
    return sum(task.result() for task in tasks)


async def _copy_stage_file_batches(
    pool: asyncpg.Pool,
    file_path: Path,
    *,
    row_iterator: Callable[[Path, Callable[[int], None] | None], object],
    row_to_tuple: Callable[[dict], tuple],
    on_rows_written: Callable[[Path, int], None] | None,
    on_input_progress: Callable[[Path, int], None] | None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None,
    batch_size: int,
    batch_concurrency: int,
    merge_batch: Callable[[asyncpg.Connection, list[tuple]], asyncio.Future | object],
) -> int:
    worker_count = max(1, batch_concurrency)
    if worker_count == 1:
        async with pool.acquire() as connection:
            await _ensure_stage_merge_buffers(connection)
            written = 0
            async for row_batch in iter_file_batches(
                file_path,
                row_iterator=row_iterator,
                batch_size=batch_size,
                on_input_progress=(
                    None
                    if on_input_progress is None
                    else lambda bytes_read: on_input_progress(file_path, bytes_read)
                ),
            ):
                batch = [row_to_tuple(row) for row in row_batch]
                async with connection.transaction():
                    batch_written = await merge_batch(connection, batch)
                written += batch_written
                if on_rows_written is not None and batch_written:
                    on_rows_written(file_path, batch_written)
                if on_batch_processed is not None and batch_written:
                    await on_batch_processed(file_path, batch_written)
            return written

    queue: asyncio.Queue[list[dict] | None] = asyncio.Queue(maxsize=worker_count * 2)
    written = 0
    written_lock = asyncio.Lock()

    async def producer() -> None:
        async for row_batch in iter_file_batches(
            file_path,
            row_iterator=row_iterator,
            batch_size=batch_size,
            queue_depth=worker_count * 2,
            on_input_progress=(
                None
                if on_input_progress is None
                else lambda bytes_read: on_input_progress(file_path, bytes_read)
            ),
        ):
            await queue.put(row_batch)
        for _ in range(worker_count):
            await queue.put(None)

    async def consumer() -> None:
        nonlocal written
        async with pool.acquire() as connection:
            await _ensure_stage_merge_buffers(connection)
            while True:
                row_batch = await queue.get()
                try:
                    if row_batch is None:
                        return
                    batch = [row_to_tuple(row) for row in row_batch]
                    async with connection.transaction():
                        batch_written = await merge_batch(connection, batch)
                    if on_rows_written is not None and batch_written:
                        on_rows_written(file_path, batch_written)
                    if on_batch_processed is not None and batch_written:
                        await on_batch_processed(file_path, batch_written)
                    async with written_lock:
                        written += batch_written
                finally:
                    queue.task_done()

    async with asyncio.TaskGroup() as group:
        group.create_task(producer())
        for _ in range(worker_count):
            group.create_task(consumer())
    return written


async def _ensure_stage_merge_buffers(connection: asyncpg.Connection) -> None:
    await connection.execute(
        f"""
        CREATE TEMP TABLE IF NOT EXISTS {_ENTITY_STAGE_BUFFER_TABLE}
        (LIKE pubtator.entity_annotations_stage)
        ON COMMIT DELETE ROWS
        """
    )
    await connection.execute(
        f"""
        CREATE TEMP TABLE IF NOT EXISTS {_RELATION_STAGE_BUFFER_TABLE}
        (LIKE pubtator.relations_stage)
        ON COMMIT DELETE ROWS
        """
    )


async def _merge_entity_stage_batch(
    connection: asyncpg.Connection,
    records: list[tuple],
) -> int:
    if not records:
        return 0
    await copy_records(
        connection,
        table_name=_ENTITY_STAGE_BUFFER_TABLE,
        schema_name="pg_temp",
        columns=_ENTITY_COLUMNS,
        records=records,
    )
    await connection.execute(
        f"""
        INSERT INTO pubtator.entity_annotations_stage (
            source_release_id,
            pmid,
            start_offset,
            end_offset,
            entity_type,
            mention_text,
            concept_id_raw,
            resource,
            corpus_id,
            last_seen_run_id
        )
        SELECT DISTINCT ON (
            source_release_id,
            pmid,
            start_offset,
            end_offset,
            entity_type,
            digest(concept_id_raw, 'sha256'),
            resource
        )
            source_release_id,
            pmid,
            start_offset,
            end_offset,
            entity_type,
            mention_text,
            concept_id_raw,
            resource,
            corpus_id,
            last_seen_run_id
        FROM pg_temp.{_ENTITY_STAGE_BUFFER_TABLE}
        ORDER BY
            source_release_id,
            pmid,
            start_offset,
            end_offset,
            entity_type,
            digest(concept_id_raw, 'sha256'),
            resource,
            mention_text
        ON CONFLICT (
            source_release_id,
            pmid,
            start_offset,
            end_offset,
            entity_type,
            (digest(concept_id_raw, 'sha256')),
            resource
        )
        DO UPDATE SET
            entity_type = EXCLUDED.entity_type,
            mention_text = EXCLUDED.mention_text,
            corpus_id = COALESCE(
                pubtator.entity_annotations_stage.corpus_id,
                EXCLUDED.corpus_id
            ),
            last_seen_run_id = EXCLUDED.last_seen_run_id
        WHERE pubtator.entity_annotations_stage.entity_type IS DISTINCT FROM EXCLUDED.entity_type
           OR pubtator.entity_annotations_stage.mention_text IS DISTINCT FROM EXCLUDED.mention_text
           OR pubtator.entity_annotations_stage.corpus_id IS DISTINCT FROM COALESCE(
                pubtator.entity_annotations_stage.corpus_id,
                EXCLUDED.corpus_id
            )
           OR pubtator.entity_annotations_stage.last_seen_run_id IS DISTINCT FROM EXCLUDED.last_seen_run_id
        """
    )
    return len(records)


async def _merge_relation_stage_batch(
    connection: asyncpg.Connection,
    records: list[tuple],
) -> int:
    if not records:
        return 0
    await copy_records(
        connection,
        table_name=_RELATION_STAGE_BUFFER_TABLE,
        schema_name="pg_temp",
        columns=_RELATION_COLUMNS,
        records=records,
    )
    await connection.execute(
        f"""
        INSERT INTO pubtator.relations_stage (
            source_release_id,
            pmid,
            relation_type,
            subject_entity_id,
            object_entity_id,
            subject_type,
            object_type,
            relation_source,
            corpus_id,
            last_seen_run_id
        )
        SELECT DISTINCT ON (
            source_release_id,
            pmid,
            digest(subject_entity_id, 'sha256'),
            relation_type,
            digest(object_entity_id, 'sha256'),
            relation_source
        )
            source_release_id,
            pmid,
            relation_type,
            subject_entity_id,
            object_entity_id,
            subject_type,
            object_type,
            relation_source,
            corpus_id,
            last_seen_run_id
        FROM pg_temp.{_RELATION_STAGE_BUFFER_TABLE}
        ORDER BY
            source_release_id,
            pmid,
            digest(subject_entity_id, 'sha256'),
            relation_type,
            digest(object_entity_id, 'sha256'),
            relation_source,
            subject_type,
            object_type
        ON CONFLICT (
            source_release_id,
            pmid,
            (digest(subject_entity_id, 'sha256')),
            relation_type,
            (digest(object_entity_id, 'sha256')),
            relation_source
        )
        DO UPDATE SET
            subject_type = EXCLUDED.subject_type,
            object_type = EXCLUDED.object_type,
            corpus_id = COALESCE(
                pubtator.relations_stage.corpus_id,
                EXCLUDED.corpus_id
            ),
            last_seen_run_id = EXCLUDED.last_seen_run_id
        WHERE pubtator.relations_stage.subject_type IS DISTINCT FROM EXCLUDED.subject_type
           OR pubtator.relations_stage.object_type IS DISTINCT FROM EXCLUDED.object_type
           OR pubtator.relations_stage.corpus_id IS DISTINCT FROM COALESCE(
                pubtator.relations_stage.corpus_id,
                EXCLUDED.corpus_id
            )
           OR pubtator.relations_stage.last_seen_run_id IS DISTINCT FROM EXCLUDED.last_seen_run_id
        """
    )
    return len(records)


async def _reset_release_resource(
    pool: asyncpg.Pool,
    *,
    table: str,
    schema: str,
    source_release_id: int,
    resource: int,
) -> None:
    async with pool.acquire() as connection, connection.transaction():
        await connection.execute(
            f"DELETE FROM {schema}.{table} WHERE source_release_id = $1 AND resource = $2",
            source_release_id,
            resource,
        )


async def _reset_release_relation_source(
    pool: asyncpg.Pool,
    *,
    table: str,
    schema: str,
    source_release_id: int,
    relation_source: int,
) -> None:
    async with pool.acquire() as connection, connection.transaction():
        await connection.execute(
            f"DELETE FROM {schema}.{table} WHERE source_release_id = $1 AND relation_source = $2",
            source_release_id,
            relation_source,
        )
