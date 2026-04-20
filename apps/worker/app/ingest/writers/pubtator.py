from __future__ import annotations

import asyncio
from collections.abc import Callable
from pathlib import Path
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.sources import pubtator
from app.ingest.writers.base import copy_files_concurrently, copy_records, iter_file_batches


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
) -> CopyStats:
    await _reset_release_resource(
        pool,
        table="entity_annotations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        resource=_BIOCXML_RESOURCE_CODE,
    )
    await _reset_release_resource(
        pool,
        table="entity_annotations",
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
    await _reset_release_relation_source(
        pool,
        table="relations",
        schema="pubtator",
        source_release_id=source_release_id,
        relation_source=_BIOCXML_RELATION_SOURCE_CODE,
    )

    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            written = 0
            async for row_batch in iter_file_batches(
                file_path,
                row_iterator=lambda path: pubtator.stream_family(
                    "biocxml",
                    path,
                    max_records_per_file=request.max_records_per_file,
                ),
                batch_size=settings.ingest_copy_batch_rows,
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
                        batch_written = await copy_records(
                            connection,
                            table_name="entity_annotations_stage",
                            schema_name="pubtator",
                            columns=_ENTITY_COLUMNS,
                            records=entity_batch,
                        )
                        written += batch_written
                        if on_rows_written is not None and batch_written:
                            on_rows_written(file_path, batch_written)
                    if relation_batch:
                        batch_written = await copy_records(
                            connection,
                            table_name="relations_stage",
                            schema_name="pubtator",
                            columns=_RELATION_COLUMNS,
                            records=relation_batch,
                        )
                        written += batch_written
                        if on_rows_written is not None and batch_written:
                            on_rows_written(file_path, batch_written)
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
    await _reset_release_resource(
        pool,
        table="entity_annotations",
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

    def row_iterator(file_path):
        return pubtator.stream_family(
            family_name,
            file_path,
            max_records_per_file=request.max_records_per_file,
        )

    row_count = await copy_files_concurrently(
        pool,
        [file_plan.path for file_plan in files],
        row_iterator=row_iterator,
        row_to_tuple=row_to_tuple,
        on_file_completed=on_file_completed,
        on_rows_written=on_rows_written,
        table_name="entity_annotations_stage",
        schema_name="pubtator",
        columns=_ENTITY_COLUMNS,
        batch_size=settings.ingest_copy_batch_rows,
        concurrency=settings.ingest_max_concurrent_files,
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
) -> CopyStats:
    await _reset_release_relation_source(
        pool,
        table="relations_stage",
        schema="pubtator",
        source_release_id=source_release_id,
        relation_source=_RELATION_TSV_SOURCE_CODE,
    )
    await _reset_release_relation_source(
        pool,
        table="relations",
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

    def row_iterator(file_path):
        return pubtator.stream_family(
            "relations",
            file_path,
            max_records_per_file=request.max_records_per_file,
        )

    row_count = await copy_files_concurrently(
        pool,
        [file_plan.path for file_plan in files],
        row_iterator=row_iterator,
        row_to_tuple=row_to_tuple,
        on_file_completed=on_file_completed,
        on_rows_written=on_rows_written,
        table_name="relations_stage",
        schema_name="pubtator",
        columns=_RELATION_COLUMNS,
        batch_size=settings.ingest_copy_batch_rows,
        concurrency=settings.ingest_max_concurrent_files,
    )
    return CopyStats(family="relations", row_count=row_count, file_count=len(files))


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
