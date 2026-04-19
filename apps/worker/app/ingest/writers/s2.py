from __future__ import annotations

import asyncio
from collections.abc import Sequence
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.models import CopyStats, FilePlan, IngestPlan, StartReleaseRequest
from app.ingest.sources import semantic_scholar
from app.ingest.writers.base import (
    BatchCopyBuffer,
    copy_files_concurrently,
    copy_records,
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

_PAPER_ASSET_COLUMNS: tuple[str, ...] = (
    "paper_id",
    "asset_kind",
    "asset_url",
    "content_type",
    "availability_raw",
    "asset_checksum",
)

_CITATION_COLUMNS: tuple[str, ...] = (
    "source_release_id",
    "citing_paper_id",
    "reference_checksum",
    "cited_paper_id",
    "linkage_status",
    "is_influential",
    "intent_raw",
)

_PAPER_DOCUMENT_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "document_source_kind",
    "source_priority",
    "source_revision",
    "text_hash",
    "is_active",
)

_PAPER_SECTION_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "section_ordinal",
    "parent_section_ordinal",
    "section_role",
    "numbering_token",
    "display_label",
)

_PAPER_BLOCK_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "block_ordinal",
    "section_ordinal",
    "start_offset",
    "end_offset",
    "block_kind",
    "section_role",
    "is_retrieval_default",
    "linked_asset_ref",
    "text",
)

_PAPER_SENTENCE_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "block_ordinal",
    "sentence_ordinal",
    "section_ordinal",
    "start_offset",
    "end_offset",
    "segmentation_source",
    "text",
)


async def load_family(
    pool: asyncpg.Pool,
    settings: Settings,
    request: StartReleaseRequest,
    plan: IngestPlan,
    family_name: str,
    source_release_id: int,
    ingest_run_id: UUID,
) -> CopyStats:
    family = next(item for item in plan.families if item.family == family_name)
    if family_name == "publication_venues":
        return await _load_publication_venues(pool, settings, family.files, request)
    if family_name == "authors":
        return await _load_authors(pool, settings, family.files, request)
    if family_name == "papers":
        return await _load_papers(pool, settings, family.files, request, source_release_id, ingest_run_id)
    if family_name == "abstracts":
        return await _load_text_patch(pool, settings, family.files, request, patch_column="abstract")
    if family_name == "tldrs":
        return await _load_text_patch(pool, settings, family.files, request, patch_column="tldr")
    if family_name == "citations":
        return await _load_citations(pool, settings, family.files, request, source_release_id)
    if family_name == "s2orc_v2":
        return await _load_s2orc_documents(
            pool,
            settings,
            family.files,
            request,
            release_tag=plan.release_tag,
        )
    raise ValueError(f"unsupported S2 family {family_name}")


async def _load_publication_venues(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
) -> CopyStats:
    return await _load_small_upsert_family(
        pool,
        settings,
        files,
        request,
        family_name="publication_venues",
        upsert=_upsert_publication_venues,
    )


async def _load_authors(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
) -> CopyStats:
    return await _load_small_upsert_family(
        pool,
        settings,
        files,
        request,
        family_name="authors",
        upsert=_upsert_authors,
    )


async def _load_small_upsert_family(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    family_name: str,
    upsert,
) -> CopyStats:
    row_count = 0
    async with pool.acquire() as connection:
        buffer = BatchCopyBuffer[dict[str, Any]](batch_size=settings.ingest_copy_batch_rows)
        for file_plan in files:
            for row in semantic_scholar.stream_family(
                family_name,
                file_plan.path,
                max_records_per_file=request.max_records_per_file,
            ):
                batch = buffer.add(row)
                if batch:
                    async with connection.transaction():
                        await upsert(connection, batch)
                    row_count += len(batch)
        if buffer.rows:
            batch = buffer.flush()
            async with connection.transaction():
                await upsert(connection, batch)
            row_count += len(batch)
    return CopyStats(family=family_name, row_count=row_count, file_count=len(files))


async def _load_papers(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    source_release_id: int,
    ingest_run_id: UUID,
) -> CopyStats:
    semaphore = asyncio.Semaphore(settings.ingest_max_concurrent_files)

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            return await _copy_paper_file(
                connection,
                file_path=file_path,
                request=request,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                batch_size=settings.ingest_copy_batch_rows,
            )

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
) -> CopyStats:
    family_name = "abstracts" if patch_column == "abstract" else "tldrs"
    row_count = 0
    async with pool.acquire() as connection:
        buffer = BatchCopyBuffer[dict[str, Any]](batch_size=settings.ingest_copy_batch_rows)
        for file_plan in files:
            for row in semantic_scholar.stream_family(
                family_name,
                file_plan.path,
                max_records_per_file=request.max_records_per_file,
            ):
                batch = buffer.add(row)
                if batch:
                    async with connection.transaction():
                        await _apply_text_patch(connection, batch, patch_column=patch_column)
                    row_count += len(batch)
        if buffer.rows:
            batch = buffer.flush()
            async with connection.transaction():
                await _apply_text_patch(connection, batch, patch_column=patch_column)
            row_count += len(batch)
    return CopyStats(family=family_name, row_count=row_count, file_count=len(files))


async def _load_citations(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    source_release_id: int,
) -> CopyStats:
    async with pool.acquire() as control_connection, control_connection.transaction():
        await control_connection.execute(
            "DELETE FROM solemd.s2_paper_references_raw WHERE source_release_id = $1",
            source_release_id,
        )

    def row_to_tuple(row: dict) -> tuple:
        return (
            source_release_id,
            row["citing_paper_id"],
            row["reference_checksum"],
            row["cited_paper_id"],
            row["linkage_status"],
            row["is_influential"],
            row["intent_raw"],
        )

    def row_iterator(file_path):
        return semantic_scholar.stream_family(
            "citations",
            file_path,
            max_records_per_file=request.max_records_per_file,
        )

    row_count = await copy_files_concurrently(
        pool,
        [file_plan.path for file_plan in files],
        row_iterator=row_iterator,
        row_to_tuple=row_to_tuple,
        table_name="s2_paper_references_raw",
        schema_name="solemd",
        columns=_CITATION_COLUMNS,
        batch_size=settings.ingest_copy_batch_rows,
        concurrency=settings.ingest_max_concurrent_files,
    )
    return CopyStats(family="citations", row_count=row_count, file_count=len(files))


async def _load_s2orc_documents(
    pool: asyncpg.Pool,
    settings: Settings,
    files: Sequence[FilePlan],
    request: StartReleaseRequest,
    *,
    release_tag: str,
) -> CopyStats:
    semaphore = asyncio.Semaphore(max(1, settings.ingest_max_concurrent_files // 2))

    async def worker(file_path: Path) -> int:
        async with semaphore, pool.acquire() as connection:
            return await _copy_s2orc_file(
                connection,
                file_path=file_path,
                request=request,
                source_revision=release_tag,
                batch_size=max(64, settings.ingest_copy_batch_rows // 32),
            )

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
) -> int:
    paper_rows: list[tuple] = []
    author_rows: list[tuple] = []
    asset_rows: list[tuple] = []
    pending_deletes: list[str] = []
    written = 0

    async def flush_all() -> None:
        nonlocal written, pending_deletes, paper_rows, author_rows, asset_rows
        if not paper_rows:
            return
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
        pending_deletes = []
        paper_rows = []
        author_rows = []
        asset_rows = []

    for row in semantic_scholar.stream_family(
        "papers",
        file_path,
        max_records_per_file=request.max_records_per_file,
    ):
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
        if len(paper_rows) >= batch_size:
            await flush_all()

    if paper_rows:
        await flush_all()
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
    source_revision: str,
    batch_size: int,
) -> int:
    document_batch: list[dict[str, Any]] = []
    written = 0
    for row in semantic_scholar.stream_family(
        "s2orc_v2",
        file_path,
        max_records_per_file=request.max_records_per_file,
    ):
        document_batch.append(row)
        if len(document_batch) >= batch_size:
            written += await _flush_document_batch(connection, document_batch, source_revision=source_revision)
            document_batch = []
    if document_batch:
        written += await _flush_document_batch(connection, document_batch, source_revision=source_revision)
    return written


async def _flush_document_batch(
    connection: asyncpg.Connection,
    documents: Sequence[dict[str, Any]],
    *,
    source_revision: str,
) -> int:
    paper_ids = [document["paper_id"] for document in documents]

    async with connection.transaction():
        # One round-trip: resolve corpus_ids for this batch and cascade-delete any
        # prior spine rows for those ids. The 4 DELETE branches + the papers
        # SELECT collapse into a single CTE execution.
        corpus_rows = await connection.fetch(
            """
            WITH targets AS (
                SELECT s2_paper_id, corpus_id
                FROM solemd.papers
                WHERE s2_paper_id = ANY($1::text[])
            ),
            corpus_targets AS (
                SELECT corpus_id FROM targets
            ),
            deleted_sentences AS (
                DELETE FROM solemd.paper_sentences
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            ),
            deleted_blocks AS (
                DELETE FROM solemd.paper_blocks
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            ),
            deleted_sections AS (
                DELETE FROM solemd.paper_sections
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            ),
            deleted_documents AS (
                DELETE FROM solemd.paper_documents
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            )
            SELECT s2_paper_id, corpus_id FROM targets
            """,
            paper_ids,
        )
        corpus_by_paper_id = {
            str(row["s2_paper_id"]): int(row["corpus_id"]) for row in corpus_rows
        }
        if not corpus_by_paper_id:
            return 0

        document_rows: list[tuple] = []
        section_rows: list[tuple] = []
        block_rows: list[tuple] = []
        sentence_rows: list[tuple] = []

        for document in documents:
            corpus_id = corpus_by_paper_id.get(document["paper_id"])
            if corpus_id is None:
                continue
            document_rows.append(
                (
                    corpus_id,
                    document["document_source_kind"],
                    document["source_priority"],
                    source_revision,
                    document["text_hash"],
                    True,
                )
            )
            for section in document["sections"]:
                section_rows.append(
                    (
                        corpus_id,
                        section["section_ordinal"],
                        section["parent_section_ordinal"],
                        section["section_role"],
                        section["numbering_token"],
                        section["display_label"],
                    )
                )
            for block in document["blocks"]:
                block_rows.append(
                    (
                        corpus_id,
                        block["block_ordinal"],
                        block["section_ordinal"],
                        block["start_offset"],
                        block["end_offset"],
                        block["block_kind"],
                        block["section_role"],
                        block["is_retrieval_default"],
                        block["linked_asset_ref"],
                        block["text"],
                    )
                )
            for sentence in document["sentences"]:
                sentence_rows.append(
                    (
                        corpus_id,
                        sentence["block_ordinal"],
                        sentence["sentence_ordinal"],
                        sentence["section_ordinal"],
                        sentence["start_offset"],
                        sentence["end_offset"],
                        sentence["segmentation_source"],
                        sentence["text"],
                    )
                )

        await copy_records(
            connection,
            table_name="paper_documents",
            schema_name="solemd",
            columns=_PAPER_DOCUMENT_COLUMNS,
            records=document_rows,
        )
        if section_rows:
            await copy_records(
                connection,
                table_name="paper_sections",
                schema_name="solemd",
                columns=_PAPER_SECTION_COLUMNS,
                records=section_rows,
            )
        if block_rows:
            await copy_records(
                connection,
                table_name="paper_blocks",
                schema_name="solemd",
                columns=_PAPER_BLOCK_COLUMNS,
                records=block_rows,
            )
        if sentence_rows:
            await copy_records(
                connection,
                table_name="paper_sentences",
                schema_name="solemd",
                columns=_PAPER_SENTENCE_COLUMNS,
                records=sentence_rows,
            )
    return len(document_rows)


async def _upsert_publication_venues(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.venues (source_venue_id, issn, display_name)
        SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
        ON CONFLICT (source_venue_id)
        DO UPDATE SET
            issn = EXCLUDED.issn,
            display_name = EXCLUDED.display_name
        """,
        [row["source_venue_id"] for row in batch],
        [row["issn"] for row in batch],
        [row["display_name"] for row in batch],
    )


async def _upsert_authors(
    connection: asyncpg.Connection,
    batch: Sequence[dict[str, Any]],
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.authors (source_author_id, orcid, display_name)
        SELECT * FROM unnest($1::text[], $2::text[], $3::text[])
        ON CONFLICT (source_author_id)
        DO UPDATE SET
            orcid = COALESCE(EXCLUDED.orcid, solemd.authors.orcid),
            display_name = EXCLUDED.display_name
        """,
        [row["source_author_id"] for row in batch],
        [row["orcid"] for row in batch],
        [row["display_name"] for row in batch],
    )
