from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
import json
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.sources import semantic_scholar
from app.ingest.writers.base import (
    copy_records,
    iter_file_batches,
)


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

_CITATION_METRIC_STAGE_COLUMNS: tuple[str, ...] = (
    "ingest_run_id",
    "source_release_id",
    "file_name",
    "batch_ordinal",
    "citing_paper_id",
    "reference_out_count",
    "influential_reference_count",
    "linked_reference_count",
    "orphan_reference_count",
)

_S2ORC_DOCUMENT_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "source_release_id",
    "text_hash",
    "document_payload",
    "last_seen_run_id",
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
    if family_name == "citations":
        return await _load_citations(
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
        return await _load_s2orc_documents(
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


async def _iter_s2_row_batches(
    file_path: Path,
    *,
    family_name: str,
    request: StartReleaseRequest,
    batch_size: int,
    on_input_progress: Callable[[int], None] | None = None,
):
    async for row_batch in iter_file_batches(
        file_path,
        row_iterator=lambda path, on_progress: semantic_scholar.stream_family(
            family_name,
            path,
            max_records_per_file=request.max_records_per_file,
            on_progress=on_progress,
        ),
        batch_size=batch_size,
        on_input_progress=on_input_progress,
    ):
        yield row_batch


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
        upsert=_upsert_publication_venues,
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
            async for row_batch in _iter_s2_row_batches(
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
                    await _upsert_author_registry(
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
            async for row_batch in _iter_s2_row_batches(
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
            async for row_batch in _iter_s2_row_batches(
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


async def _load_citations(
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
    async with pool.acquire() as control_connection, control_connection.transaction():
        await control_connection.execute(
            """
            DELETE FROM solemd.s2_paper_reference_metrics_stage
            WHERE source_release_id = $1
               OR ingest_run_id = $2
            """,
            source_release_id,
            ingest_run_id,
        )
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            written = await _stage_citation_metrics_for_file(
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

    try:
        async with asyncio.TaskGroup() as group:
            tasks = [group.create_task(worker(file_plan.path)) for file_plan in files]
    except Exception:
        async with pool.acquire() as control_connection, control_connection.transaction():
            await control_connection.execute(
                "DELETE FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
                ingest_run_id,
            )
        raise
    async with pool.acquire() as control_connection, control_connection.transaction():
        final_row_count = await _replace_citation_metrics_from_stage(
            control_connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
        )
    return CopyStats(
        family="citations",
        row_count=final_row_count,
        file_count=len(files),
    )


async def _load_s2orc_documents(
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
    async for row_batch in _iter_s2_row_batches(
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
    async for row_batch in _iter_s2_row_batches(
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
        written += await _flush_document_batch(
            connection,
            row_batch,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
        )
        if on_rows_written is not None:
            on_rows_written(file_path, len(row_batch))
        if on_batch_processed is not None and row_batch:
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


async def _upsert_publication_venues(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
) -> None:
    source_ids: list[str] = []
    issns: list[str | None] = []
    display_names: list[str] = []
    normalized_names: list[str] = []
    seen_source_ids: set[str] = set()
    seen_issns: set[str] = set()
    seen_normalized_names: set[str] = set()
    for row in batch:
        source_venue_id = row["source_venue_id"]
        issn = row["issn"]
        normalized_name = " ".join(str(row["display_name"]).strip().lower().split())
        if source_venue_id in seen_source_ids:
            continue
        if issn is not None and issn in seen_issns:
            continue
        if normalized_name in seen_normalized_names:
            continue
        seen_source_ids.add(source_venue_id)
        if issn is not None:
            seen_issns.add(issn)
        seen_normalized_names.add(normalized_name)
        source_ids.append(source_venue_id)
        issns.append(issn)
        display_names.append(row["display_name"])
        normalized_names.append(normalized_name)
    await connection.execute(
        """
        WITH input_rows AS (
            SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])
                AS row(source_venue_id, issn, display_name, normalized_name)
        ),
        updated_by_source AS (
            UPDATE solemd.venues venues
            SET issn = COALESCE(venues.issn, input_rows.issn),
                display_name = input_rows.display_name
            FROM input_rows
            WHERE venues.source_venue_id = input_rows.source_venue_id
            RETURNING input_rows.source_venue_id
        ),
        updated_by_issn AS (
            UPDATE solemd.venues venues
            SET display_name = input_rows.display_name
            FROM input_rows
            WHERE input_rows.issn IS NOT NULL
              AND venues.issn = input_rows.issn
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_source updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
            RETURNING input_rows.source_venue_id
        ),
        updated_by_normalized_name AS (
            UPDATE solemd.venues venues
            SET issn = COALESCE(venues.issn, input_rows.issn),
                source_venue_id = COALESCE(venues.source_venue_id, input_rows.source_venue_id),
                display_name = input_rows.display_name
            FROM input_rows
            WHERE venues.normalized_name = input_rows.normalized_name
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_source updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM updated_by_issn updated
                  WHERE updated.source_venue_id = input_rows.source_venue_id
              )
            RETURNING input_rows.source_venue_id
        )
        INSERT INTO solemd.venues (source_venue_id, issn, display_name)
        SELECT input_rows.source_venue_id, input_rows.issn, input_rows.display_name
        FROM input_rows
        WHERE NOT EXISTS (
                SELECT 1
                FROM updated_by_source updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
          AND NOT EXISTS (
                SELECT 1
                FROM updated_by_issn updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
          AND NOT EXISTS (
                SELECT 1
                FROM updated_by_normalized_name updated
                WHERE updated.source_venue_id = input_rows.source_venue_id
            )
        ON CONFLICT (source_venue_id)
        DO UPDATE SET
            issn = COALESCE(EXCLUDED.issn, solemd.venues.issn),
            display_name = EXCLUDED.display_name
        """,
        source_ids,
        issns,
        display_names,
        normalized_names,
    )


async def _upsert_author_registry(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.s2_authors_raw (
            source_release_id,
            source_author_id,
            orcid,
            display_name,
            last_seen_run_id
        )
        SELECT * FROM unnest($1::integer[], $2::text[], $3::text[], $4::text[], $5::uuid[])
        ON CONFLICT (source_release_id, source_author_id)
        DO UPDATE SET
            orcid = COALESCE(EXCLUDED.orcid, solemd.s2_authors_raw.orcid),
            display_name = EXCLUDED.display_name,
            last_seen_run_id = EXCLUDED.last_seen_run_id
        """,
        [source_release_id] * len(batch),
        [row["source_author_id"] for row in batch],
        [row["orcid"] for row in batch],
        [row["display_name"] for row in batch],
        [ingest_run_id] * len(batch),
    )


async def _stage_citation_metrics_for_file(
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
    batch_ordinal = 0
    async for row_batch in _iter_s2_row_batches(
        file_path,
        family_name="citations",
        request=request,
        batch_size=batch_size,
        on_input_progress=(
            None
            if on_input_progress is None
            else lambda bytes_read: on_input_progress(file_path, bytes_read)
        ),
    ):
        metrics_by_paper: dict[str, list[int]] = {}
        for row in row_batch:
            counts = metrics_by_paper.setdefault(row["citing_paper_id"], [0, 0, 0, 0])
            counts[0] += 1
            if row["is_influential"]:
                counts[1] += 1
            if row["cited_paper_id"] is not None:
                counts[2] += 1
            else:
                counts[3] += 1
        paper_ids = list(metrics_by_paper.keys())
        stage_rows = [
            (
                ingest_run_id,
                source_release_id,
                file_path.name,
                batch_ordinal,
                paper_id,
                metrics_by_paper[paper_id][0],
                metrics_by_paper[paper_id][1],
                metrics_by_paper[paper_id][2],
                metrics_by_paper[paper_id][3],
            )
            for paper_id in paper_ids
        ]
        async with connection.transaction():
            await copy_records(
                connection,
                table_name="s2_paper_reference_metrics_stage",
                schema_name="solemd",
                columns=_CITATION_METRIC_STAGE_COLUMNS,
                records=stage_rows,
            )
        written += len(paper_ids)
        batch_ordinal += 1
        if on_rows_written is not None:
            on_rows_written(file_path, len(paper_ids))
        if on_batch_processed is not None and paper_ids:
            await on_batch_processed(file_path, len(paper_ids))
    return written


async def _replace_citation_metrics_from_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> int:
    await connection.execute(
        "DELETE FROM solemd.s2_paper_reference_metrics_raw WHERE source_release_id = $1",
        source_release_id,
    )
    inserted_count = await connection.fetchval(
        """
        WITH inserted AS (
            INSERT INTO solemd.s2_paper_reference_metrics_raw (
                source_release_id,
                citing_paper_id,
                reference_out_count,
                influential_reference_count,
                linked_reference_count,
                orphan_reference_count,
                last_seen_run_id
            )
            SELECT
                source_release_id,
                citing_paper_id,
                SUM(reference_out_count)::integer,
                SUM(influential_reference_count)::integer,
                SUM(linked_reference_count)::integer,
                SUM(orphan_reference_count)::integer,
                $2::uuid
            FROM solemd.s2_paper_reference_metrics_stage
            WHERE source_release_id = $1
              AND ingest_run_id = $2
            GROUP BY source_release_id, citing_paper_id
            ORDER BY source_release_id, citing_paper_id
            RETURNING 1
        )
        SELECT count(*)::integer FROM inserted
        """,
        source_release_id,
        ingest_run_id,
    )
    await connection.execute(
        "DELETE FROM solemd.s2_paper_reference_metrics_stage WHERE ingest_run_id = $1",
        ingest_run_id,
    )
    return int(inserted_count or 0)
