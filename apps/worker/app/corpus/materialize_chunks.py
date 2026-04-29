from __future__ import annotations

from collections.abc import Awaitable, Callable
from uuid import UUID

import asyncpg


CORPUS_BASELINE_PHASE_NAME = "corpus_baseline_materialization"
MAPPED_SURFACES_PHASE_NAME = "mapped_surface_materialization"
SELECTION_SUMMARY_PHASE_NAME = "selection_summary"
BucketMaterializer = Callable[[asyncpg.Connection, int], Awaitable[dict[str, int]]]


async def ensure_phase_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    bucket_count: int,
) -> None:
    await connection.execute(
        """
        INSERT INTO solemd.corpus_selection_chunks (
            corpus_selection_run_id,
            phase_name,
            bucket_id,
            bucket_count,
            status
        )
        SELECT
            $1::UUID,
            $2::TEXT,
            bucket.bucket_id,
            $3::INTEGER,
            'pending'
        FROM generate_series(0, $3::INTEGER - 1) AS bucket(bucket_id)
        ON CONFLICT (corpus_selection_run_id, phase_name, bucket_id)
        DO NOTHING
        """,
        corpus_selection_run_id,
        phase_name,
        bucket_count,
    )


async def prepare_phase_chunks_for_resume(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    max_attempts: int,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_chunks
        SET status = 'pending',
            attempts = CASE
                WHEN status = 'running' AND attempts > 0 THEN attempts - 1
                ELSE attempts
            END,
            updated_at = now(),
            error_message = NULL
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
          AND (
            status = 'running'
            OR (status = 'failed' AND attempts < $3)
          )
        """,
        corpus_selection_run_id,
        phase_name,
        max_attempts,
    )
    await raise_if_terminal_failed_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=phase_name,
        max_attempts=max_attempts,
    )


async def raise_if_terminal_failed_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    max_attempts: int,
) -> None:
    rows = await connection.fetch(
        """
        SELECT bucket_id, attempts
        FROM solemd.corpus_selection_chunks
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
          AND status = 'failed'
          AND attempts >= $3
        ORDER BY bucket_id
        LIMIT 5
        """,
        corpus_selection_run_id,
        phase_name,
        max_attempts,
    )
    if not rows:
        return
    failed = ", ".join(
        f"{row['bucket_id']} ({row['attempts']} attempts)" for row in rows
    )
    raise RuntimeError(
        f"{phase_name} chunk retry limit reached for bucket(s): "
        f"{failed}"
    )


async def drain_phase_chunks_from_pool(
    connection_pool: asyncpg.Pool,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    materialize_bucket: BucketMaterializer,
) -> None:
    async with connection_pool.acquire() as worker_connection:
        await drain_phase_chunks(
            worker_connection,
            corpus_selection_run_id=corpus_selection_run_id,
            phase_name=phase_name,
            materialize_bucket=materialize_bucket,
        )


async def drain_phase_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    materialize_bucket: BucketMaterializer,
) -> None:
    while True:
        bucket_id = await _claim_next_chunk(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            phase_name=phase_name,
        )
        if bucket_id is None:
            break
        try:
            async with connection.transaction():
                await connection.execute("SET LOCAL synchronous_commit = off")
                row_counts = await materialize_bucket(connection, bucket_id)
                await _mark_chunk_complete(
                    connection,
                    corpus_selection_run_id=corpus_selection_run_id,
                    phase_name=phase_name,
                    bucket_id=bucket_id,
                    row_counts=row_counts,
                )
        except Exception as exc:
            await _mark_chunk_failed(
                connection,
                corpus_selection_run_id=corpus_selection_run_id,
                phase_name=phase_name,
                bucket_id=bucket_id,
                error_message=str(exc),
            )
            raise


async def _claim_next_chunk(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
) -> int | None:
    row = await connection.fetchrow(
        """
        WITH next_chunk AS (
            SELECT bucket_id
            FROM solemd.corpus_selection_chunks
            WHERE corpus_selection_run_id = $1
              AND phase_name = $2
              AND status = 'pending'
            ORDER BY bucket_id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        UPDATE solemd.corpus_selection_chunks chunks
        SET status = 'running',
            attempts = attempts + 1,
            started_at = now(),
            updated_at = now(),
            error_message = NULL
        FROM next_chunk
        WHERE chunks.corpus_selection_run_id = $1
          AND chunks.phase_name = $2
          AND chunks.bucket_id = next_chunk.bucket_id
        RETURNING chunks.bucket_id
        """,
        corpus_selection_run_id,
        phase_name,
    )
    if row is None:
        return None
    return int(row["bucket_id"])


async def _mark_chunk_complete(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    bucket_id: int,
    row_counts: dict[str, int],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_chunks
        SET status = 'complete',
            completed_at = now(),
            row_counts = $4,
            updated_at = now(),
            error_message = NULL
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
          AND bucket_id = $3
        """,
        corpus_selection_run_id,
        phase_name,
        bucket_id,
        row_counts,
    )


async def _mark_chunk_failed(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
    bucket_id: int,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_chunks
        SET status = 'failed',
            error_message = $4,
            updated_at = now()
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
          AND bucket_id = $3
        """,
        corpus_selection_run_id,
        phase_name,
        bucket_id,
        error_message[:2000],
    )


async def ensure_mapped_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    bucket_count: int,
) -> None:
    await ensure_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=MAPPED_SURFACES_PHASE_NAME,
        bucket_count=bucket_count,
    )


async def prepare_mapped_chunks_for_resume(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    max_attempts: int,
) -> None:
    await prepare_phase_chunks_for_resume(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=MAPPED_SURFACES_PHASE_NAME,
        max_attempts=max_attempts,
    )


async def drain_mapped_chunks_from_pool(
    connection_pool: asyncpg.Pool,
    *,
    corpus_selection_run_id: UUID,
    materialize_bucket: BucketMaterializer,
) -> None:
    await drain_phase_chunks_from_pool(
        connection_pool,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=MAPPED_SURFACES_PHASE_NAME,
        materialize_bucket=materialize_bucket,
    )


async def drain_mapped_chunks(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    materialize_bucket: BucketMaterializer,
) -> None:
    await drain_phase_chunks(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name=MAPPED_SURFACES_PHASE_NAME,
        materialize_bucket=materialize_bucket,
    )


def parse_command_row_count(command_tag: str) -> int:
    try:
        return int(command_tag.rsplit(" ", 1)[-1])
    except ValueError:
        return 0
