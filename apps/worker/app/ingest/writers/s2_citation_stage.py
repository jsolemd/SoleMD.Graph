from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from pathlib import Path
from uuid import UUID

import asyncpg

from app.ingest.models import StartReleaseRequest
from app.ingest.writers import s2_citation_tasks
from app.ingest.writers.s2_streaming import iter_s2_row_batches


LEGACY_CITATION_AGGREGATE_STAGE_FILE_NAME = "__aggregate__"
CITATION_FILE_STAGE_BATCH_ORDINAL = 0
CITATION_STAGE_MERGE_MAX_ATTEMPTS = 5
CITATION_FAMILY_NAME = "citations"


async def completed_citation_file_names(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_names: Sequence[str],
) -> frozenset[str]:
    if not file_names:
        return frozenset()
    rows = await connection.fetch(
        """
        WITH stage_counts AS (
            SELECT file_name, count(*)::integer AS stage_row_count
            FROM solemd.s2_paper_reference_metrics_stage
            WHERE ingest_run_id = $1
              AND source_release_id = $2
              AND file_name = ANY($3::text[])
            GROUP BY file_name
        )
        SELECT checkpoint.file_name
        FROM solemd.s2_paper_reference_metrics_file_checkpoints checkpoint
        LEFT JOIN stage_counts stage USING (file_name)
        WHERE checkpoint.ingest_run_id = $1
          AND checkpoint.source_release_id = $2
          AND checkpoint.file_name = ANY($3::text[])
          AND checkpoint.stage_row_count = COALESCE(stage.stage_row_count, 0)
        """,
        ingest_run_id,
        source_release_id,
        list(file_names),
    )
    return frozenset(str(row["file_name"]) for row in rows)


async def reset_citation_stage_for_pending_files(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    completed_file_names: Sequence[str],
) -> None:
    await delete_legacy_citation_aggregate_stage(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
    )
    await delete_incomplete_citation_file_stage(
        connection,
        source_release_id=source_release_id,
        ingest_run_id=ingest_run_id,
        completed_file_names=completed_file_names,
    )


async def delete_legacy_citation_aggregate_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.s2_paper_reference_metrics_stage
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND file_name = $3
        """,
        ingest_run_id,
        source_release_id,
        LEGACY_CITATION_AGGREGATE_STAGE_FILE_NAME,
    )


async def delete_incomplete_citation_file_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    completed_file_names: Sequence[str],
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.s2_paper_reference_metrics_stage
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND file_name <> ALL($3::text[])
        """,
        ingest_run_id,
        source_release_id,
        list(completed_file_names),
    )


async def delete_invalid_citation_file_checkpoints(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    completed_file_names: Sequence[str],
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.s2_paper_reference_metrics_file_checkpoints
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND file_name <> ALL($3::text[])
        """,
        ingest_run_id,
        source_release_id,
        list(completed_file_names),
    )


async def reset_citation_file_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.s2_paper_reference_metrics_stage
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND file_name = $3
        """,
        ingest_run_id,
        source_release_id,
        file_name,
    )


async def mark_citation_file_completed(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    file_byte_count: int,
    claim_token: UUID | None = None,
) -> int:
    async with connection.transaction():
        if claim_token is not None:
            await s2_citation_tasks.lock_citation_file_task_claim(
                connection,
                source_release_id=source_release_id,
                ingest_run_id=ingest_run_id,
                file_name=file_name,
                claim_token=claim_token,
            )
        stage_row_count = await connection.fetchval(
            """
            SELECT count(*)::integer
            FROM solemd.s2_paper_reference_metrics_stage
            WHERE ingest_run_id = $1
              AND source_release_id = $2
              AND file_name = $3
            """,
            ingest_run_id,
            source_release_id,
            file_name,
        )
        await connection.execute(
            """
            INSERT INTO solemd.s2_paper_reference_metrics_file_checkpoints (
                ingest_run_id,
                source_release_id,
                file_name,
                file_byte_count,
                stage_row_count,
                completed_at
            )
            VALUES ($1, $2, $3, $4, $5, now())
            ON CONFLICT (ingest_run_id, source_release_id, file_name)
            DO UPDATE SET
                file_byte_count = EXCLUDED.file_byte_count,
                stage_row_count = EXCLUDED.stage_row_count,
                completed_at = EXCLUDED.completed_at
            """,
            ingest_run_id,
            source_release_id,
            file_name,
            file_byte_count,
            int(stage_row_count or 0),
        )
    return int(stage_row_count or 0)


async def stage_citation_metrics_for_file(
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
    claim_token: UUID | None = None,
) -> int:
    written = 0
    async for row_batch in iter_s2_row_batches(
        file_path,
        family_name=CITATION_FAMILY_NAME,
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
        paper_ids = sorted(metrics_by_paper)
        await merge_citation_metrics_into_stage_with_retry(
            connection,
            source_release_id=source_release_id,
            ingest_run_id=ingest_run_id,
            file_name=file_path.name,
            batch_ordinal=CITATION_FILE_STAGE_BATCH_ORDINAL,
            claim_token=claim_token,
            paper_ids=paper_ids,
            reference_out_counts=[
                metrics_by_paper[paper_id][0] for paper_id in paper_ids
            ],
            influential_reference_counts=[
                metrics_by_paper[paper_id][1] for paper_id in paper_ids
            ],
            linked_reference_counts=[
                metrics_by_paper[paper_id][2] for paper_id in paper_ids
            ],
            orphan_reference_counts=[
                metrics_by_paper[paper_id][3] for paper_id in paper_ids
            ],
        )
        written += len(paper_ids)
        if on_rows_written is not None:
            on_rows_written(file_path, len(paper_ids))
        if on_batch_processed is not None and paper_ids:
            await on_batch_processed(file_path, len(paper_ids))
    return written


async def merge_citation_metrics_into_stage_with_retry(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    batch_ordinal: int,
    claim_token: UUID | None = None,
    paper_ids: Sequence[str],
    reference_out_counts: Sequence[int],
    influential_reference_counts: Sequence[int],
    linked_reference_counts: Sequence[int],
    orphan_reference_counts: Sequence[int],
) -> None:
    for attempt in range(CITATION_STAGE_MERGE_MAX_ATTEMPTS):
        try:
            async with connection.transaction():
                if claim_token is not None:
                    await s2_citation_tasks.lock_citation_file_task_claim(
                        connection,
                        source_release_id=source_release_id,
                        ingest_run_id=ingest_run_id,
                        file_name=file_name,
                        claim_token=claim_token,
                    )
                await merge_citation_metrics_into_stage(
                    connection,
                    source_release_id=source_release_id,
                    ingest_run_id=ingest_run_id,
                    file_name=file_name,
                    batch_ordinal=batch_ordinal,
                    paper_ids=paper_ids,
                    reference_out_counts=reference_out_counts,
                    influential_reference_counts=influential_reference_counts,
                    linked_reference_counts=linked_reference_counts,
                    orphan_reference_counts=orphan_reference_counts,
                )
            return
        except asyncpg.exceptions.DeadlockDetectedError:
            if attempt + 1 >= CITATION_STAGE_MERGE_MAX_ATTEMPTS:
                raise
            await asyncio.sleep(0.25 * (attempt + 1))


async def merge_citation_metrics_into_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    batch_ordinal: int,
    paper_ids: Sequence[str],
    reference_out_counts: Sequence[int],
    influential_reference_counts: Sequence[int],
    linked_reference_counts: Sequence[int],
    orphan_reference_counts: Sequence[int],
) -> None:
    if not paper_ids:
        return
    await connection.execute(
        """
        INSERT INTO solemd.s2_paper_reference_metrics_stage AS stage (
            ingest_run_id,
            source_release_id,
            file_name,
            batch_ordinal,
            citing_paper_id,
            reference_out_count,
            influential_reference_count,
            linked_reference_count,
            orphan_reference_count
        )
        SELECT
            $1::uuid,
            $2::integer,
            $3::text,
            $4::integer,
            payload.citing_paper_id,
            payload.reference_out_count,
            payload.influential_reference_count,
            payload.linked_reference_count,
            payload.orphan_reference_count
        FROM unnest(
            $5::text[],
            $6::integer[],
            $7::integer[],
            $8::integer[],
            $9::integer[]
        ) AS payload(
            citing_paper_id,
            reference_out_count,
            influential_reference_count,
            linked_reference_count,
            orphan_reference_count
        )
        ORDER BY payload.citing_paper_id
        ON CONFLICT (
            ingest_run_id,
            source_release_id,
            file_name,
            batch_ordinal,
            citing_paper_id
        )
        DO UPDATE SET
            reference_out_count = (
                stage.reference_out_count
                + EXCLUDED.reference_out_count
            ),
            influential_reference_count = (
                stage.influential_reference_count
                + EXCLUDED.influential_reference_count
            ),
            linked_reference_count = (
                stage.linked_reference_count
                + EXCLUDED.linked_reference_count
            ),
            orphan_reference_count = (
                stage.orphan_reference_count
                + EXCLUDED.orphan_reference_count
            )
        """,
        ingest_run_id,
        source_release_id,
        file_name,
        batch_ordinal,
        list(paper_ids),
        list(reference_out_counts),
        list(influential_reference_counts),
        list(linked_reference_counts),
        list(orphan_reference_counts),
    )


async def replace_citation_metrics_from_stage(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> int:
    stage_exists = await connection.fetchval(
        """
        SELECT EXISTS (
            SELECT 1
            FROM solemd.s2_paper_reference_metrics_stage
            WHERE source_release_id = $1
              AND ingest_run_id = $2
            LIMIT 1
        )
        """,
        source_release_id,
        ingest_run_id,
    )
    if not stage_exists:
        finalized_count = await connection.fetchval(
            """
            SELECT count(*)::integer
            FROM solemd.s2_paper_reference_metrics_raw
            WHERE source_release_id = $1
              AND last_seen_run_id = $2
            """,
            source_release_id,
            ingest_run_id,
        )
        if finalized_count:
            return int(finalized_count)

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
