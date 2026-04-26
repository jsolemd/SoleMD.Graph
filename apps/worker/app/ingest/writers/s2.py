from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.writers import s2_citations, s2_documents, s2_upserts
from app.ingest.writers.base import (
    copy_records,
)
from app.ingest.writers.s2_streaming import iter_s2_row_batches


_PAPER_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "source_release_id",
    "corpus_id",
    "source_venue_id",
    "pmid",
    "doi_norm",
    "pmc_id",
    "title",
    "abstract",
    "tldr",
    "venue_raw",
    "year",
    "publication_date",
    "is_open_access",
    "payload_checksum",
    "last_seen_run_id",
)

_PAPER_AUTHOR_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "author_ordinal",
    "source_author_id",
    "name_raw",
    "affiliation_raw",
)

_AUTHOR_REGISTRY_COLUMNS: tuple[str, ...] = (
    "source_release_id",
    "source_author_id",
    "orcid",
    "display_name",
    "last_seen_run_id",
)

_PAPER_ASSET_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "asset_kind",
    "asset_url",
    "content_type",
    "availability_raw",
    "asset_checksum",
)

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
    if family_name == "publication_venues":
        return await _load_publication_venues(
            pool,
            settings,
            family.files,
            request,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "authors":
        return await _load_authors(
            pool,
            settings,
            family.files,
            request,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "papers":
        return await _load_papers(
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
    if family_name == "abstracts":
        return await _load_text_patch(
            pool,
            settings,
            family.files,
            request,
            patch_column="abstract",
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "tldrs":
        return await _load_text_patch(
            pool,
            settings,
            family.files,
            request,
            patch_column="tldr",
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    if family_name == "embeddings_specter_v2":
        raise ValueError(
            "embeddings_specter_v2 is owned by the mapped tier and is not loadable through default S2 raw ingest"
        )
    if family_name == "citations":
        return await s2_citations.load_citations_inline(
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
    if family_name == "s2orc_v2":
        return await s2_documents.load_s2orc_documents(
            pool,
            settings,
            family.files,
            request,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            on_file_completed=on_file_completed,
            on_rows_written=on_rows_written,
            on_input_progress=on_input_progress,
            on_batch_processed=on_batch_processed,
        )
    raise ValueError(f"unsupported S2 family {family_name}")


async def load_family_distributed(
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
    if family_name == "citations":
        return await s2_citations.load_citations_distributed(
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
    return await load_family(
        pool,
        settings,
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


async def _load_publication_venues(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    return await _load_small_upsert_family(
        pool,
        settings,
        files,
        request,
        family_name="publication_venues",
        upsert=s2_upserts.upsert_publication_venues,
        on_file_completed=on_file_completed,
        on_rows_written=on_rows_written,
        on_input_progress=on_input_progress,
        on_batch_processed=on_batch_processed,
    )


async def _load_authors(
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
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            file_row_count = 0
            async for row_batch in iter_s2_row_batches(
                file_path,
                family_name="authors",
                request=request,
                batch_size=settings.ingest_copy_batch_rows,
                on_input_progress=(
                    None
                    if on_input_progress is None
                    else lambda bytes_read: on_input_progress(file_path, bytes_read)
                ),
            ):
                async with connection.transaction():
                    await s2_upserts.upsert_author_registry(
                        connection,
                        row_batch,
                        source_release_id=source_release_id,
                        ingest_run_id=ingest_run_id,
                    )
                file_row_count += len(row_batch)
                if on_rows_written is not None:
                    on_rows_written(file_path, len(row_batch))
                if on_batch_processed is not None:
                    await on_batch_processed(file_path, len(row_batch))
            if on_file_completed is not None:
                on_file_completed(file_path, file_row_count)
            return file_row_count

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family="authors",
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _load_small_upsert_family(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    family_name: str,
    upsert,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            file_row_count = 0
            async for row_batch in iter_s2_row_batches(
                file_path,
                family_name=family_name,
                request=request,
                batch_size=settings.ingest_copy_batch_rows,
                on_input_progress=(
                    None
                    if on_input_progress is None
                    else lambda bytes_read: on_input_progress(file_path, bytes_read)
                ),
            ):
                async with connection.transaction():
                    await upsert(connection, row_batch)
                file_row_count += len(row_batch)
                if on_rows_written is not None:
                    on_rows_written(file_path, len(row_batch))
                if on_batch_processed is not None:
                    await on_batch_processed(file_path, len(row_batch))
            if on_file_completed is not None:
                on_file_completed(file_path, file_row_count)
            return file_row_count

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family=family_name,
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _load_papers(
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
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            written = await _copy_paper_file(
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
            if on_file_completed is not None:
                on_file_completed(file_path, written)
            return written

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family="papers",
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _load_text_patch(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    patch_column: str,
    on_file_completed: Callable[[Path, int], None] | None = None,
    on_rows_written: Callable[[Path, int], None] | None = None,
    on_input_progress: Callable[[Path, int], None] | None = None,
    on_batch_processed: Callable[[Path, int], Awaitable[None]] | None = None,
) -> CopyStats:
    family_name = "abstracts" if patch_column == "abstract" else "tldrs"
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            file_row_count = 0
            async for row_batch in iter_s2_row_batches(
                file_path,
                family_name=family_name,
                request=request,
                batch_size=settings.ingest_copy_batch_rows,
                on_input_progress=(
                    None
                    if on_input_progress is None
                    else lambda bytes_read: on_input_progress(file_path, bytes_read)
                ),
            ):
                async with connection.transaction():
                    await _apply_text_patch(
                        connection,
                        row_batch,
                        patch_column=patch_column,
                    )
                file_row_count += len(row_batch)
                if on_rows_written is not None:
                    on_rows_written(file_path, len(row_batch))
                if on_batch_processed is not None:
                    await on_batch_processed(file_path, len(row_batch))
            if on_file_completed is not None:
                on_file_completed(file_path, file_row_count)
            return file_row_count

    async with asyncio.TaskGroup() as group:
        tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    return CopyStats(
        family=family_name,
        row_count=sum(task.result() for task in tasks),
        file_count=len(files),
    )


async def _copy_paper_file(
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
        family_name="papers",
        request=request,
        batch_size=batch_size,
        on_input_progress=(
            None
            if on_input_progress is None
            else lambda bytes_read: on_input_progress(file_path, bytes_read)
        ),
    ):
        pending_deletes: list[str] = []
        paper_rows: list[tuple] = []
        author_rows: list[tuple] = []
        asset_rows: list[tuple] = []
        for row in row_batch:
            pending_deletes.append(row["paper_id"])
            paper_rows.append(
                (
                    row["paper_id"],
                    source_release_id,
                    None,
                    row["source_venue_id"],
                    row["pmid"],
                    row["doi_norm"],
                    row["pmc_id"],
                    row["title"],
                    None,
                    None,
                    row["venue_raw"],
                    row["year"],
                    row["publication_date"],
                    row["is_open_access"],
                    row["payload_checksum"],
                    ingest_run_id,
                )
            )
            for author in row["authors"]:
                author_rows.append(
                    (
                        author["paper_id"],
                        author["author_ordinal"],
                        author["source_author_id"],
                        author["name_raw"],
                        author["affiliation_raw"],
                    )
                )
            for asset in row["assets"]:
                asset_rows.append(
                    (
                        asset["paper_id"],
                        asset["asset_kind"],
                        asset["asset_url"],
                        asset["content_type"],
                        asset["availability_raw"],
                        asset["asset_checksum"],
                    )
                )
        async with connection.transaction():
            await connection.execute(
                "DELETE FROM solemd.s2_papers_raw WHERE paper_id = ANY($1::text[])",
                pending_deletes,
            )
            written += await copy_records(
                connection,
                table_name="s2_papers_raw",
                schema_name="solemd",
                columns=_PAPER_COLUMNS,
                records=paper_rows,
            )
            if on_rows_written is not None:
                on_rows_written(file_path, len(paper_rows))
            if author_rows:
                await copy_records(
                    connection,
                    table_name="s2_paper_authors_raw",
                    schema_name="solemd",
                    columns=_PAPER_AUTHOR_COLUMNS,
                    records=author_rows,
                )
            if asset_rows:
                await copy_records(
                    connection,
                    table_name="s2_paper_assets_raw",
                    schema_name="solemd",
                    columns=_PAPER_ASSET_COLUMNS,
                    records=asset_rows,
                )
        if on_batch_processed is not None and paper_rows:
            await on_batch_processed(file_path, len(paper_rows))
    return written


async def _apply_text_patch(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
    *,
    patch_column: str,
) -> None:
    paper_ids = [row["paper_id"] for row in batch]
    values = [row[patch_column] for row in batch]
    await connection.execute(
        f"""
        UPDATE solemd.s2_papers_raw raw
        SET {patch_column} = patch.value
        FROM unnest($1::text[], $2::text[]) AS patch(paper_id, value)
        WHERE raw.paper_id = patch.paper_id
        """,
        paper_ids,
        values,
    )
