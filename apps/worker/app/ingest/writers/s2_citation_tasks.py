from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID, uuid4

import asyncpg

from app.ingest.errors import IngestAborted
from app.ingest.models import FilePlan


CITATION_FAMILY_NAME = "citations"
INGEST_REQUESTED_STATUS_ABORT = 2

FILE_TASK_STATUS_PENDING = 1
FILE_TASK_STATUS_RUNNING = 2
FILE_TASK_STATUS_COMPLETED = 3
FILE_TASK_STATUS_FAILED = 4


async def upsert_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    files: Sequence[FilePlan],
) -> None:
    if not files:
        return
    await connection.execute(
        """
        INSERT INTO solemd.ingest_file_tasks (
            ingest_run_id,
            source_release_id,
            family_name,
            file_name,
            file_path,
            file_byte_count,
            status,
            updated_at
        )
        SELECT
            $1::uuid,
            $2::integer,
            $3::text,
            payload.file_name,
            payload.file_path,
            payload.file_byte_count,
            $7::smallint,
            now()
        FROM unnest(
            $4::text[],
            $5::text[],
            $6::bigint[]
        ) AS payload(file_name, file_path, file_byte_count)
        ON CONFLICT (ingest_run_id, family_name, file_name)
        DO UPDATE SET
            source_release_id = EXCLUDED.source_release_id,
            file_path = EXCLUDED.file_path,
            file_byte_count = EXCLUDED.file_byte_count,
            updated_at = now()
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        [file_plan.path.name for file_plan in files],
        [str(file_plan.path) for file_plan in files],
        [file_plan.byte_count for file_plan in files],
        FILE_TASK_STATUS_PENDING,
    )


async def mark_completed_citation_file_tasks_from_checkpoints(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    completed_file_names: Sequence[str],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_file_tasks task
        SET status = $4,
            input_bytes_read = task.file_byte_count,
            rows_written = checkpoint.stage_row_count,
            stage_row_count = checkpoint.stage_row_count,
            claim_token = NULL,
            completed_at = checkpoint.completed_at,
            last_error = NULL,
            updated_at = now()
        FROM solemd.s2_paper_reference_metrics_file_checkpoints checkpoint
        WHERE task.ingest_run_id = $1
          AND task.source_release_id = $2
          AND task.family_name = $3
          AND task.file_name = checkpoint.file_name
          AND checkpoint.ingest_run_id = task.ingest_run_id
          AND checkpoint.source_release_id = task.source_release_id
          AND task.file_name = ANY($5::text[])
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_COMPLETED,
        list(completed_file_names),
    )


async def reset_pending_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    completed_file_names: Sequence[str],
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $4,
            enqueued_at = NULL,
            started_at = NULL,
            completed_at = NULL,
            input_bytes_read = 0,
            rows_written = 0,
            stage_row_count = 0,
            claim_token = NULL,
            last_error = NULL,
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name <> ALL($5::text[])
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_PENDING,
        list(completed_file_names),
    )


async def claim_pending_citation_dispatches(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    stale_after_seconds: float,
) -> tuple[str, ...]:
    rows = await connection.fetch(
        """
        UPDATE solemd.ingest_file_tasks
        SET enqueued_at = now(),
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND status = $4
          AND (
              enqueued_at IS NULL
              OR enqueued_at < now() - ($5::double precision * interval '1 second')
          )
        RETURNING file_name
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_PENDING,
        stale_after_seconds,
    )
    return tuple(str(row["file_name"]) for row in rows)


async def claim_citation_file_task(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    max_attempts: int,
    claim_token: UUID | None = None,
) -> UUID | None:
    token = claim_token or uuid4()
    row = await connection.fetchrow(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $5,
            attempt_count = attempt_count + 1,
            claim_token = $9,
            started_at = now(),
            updated_at = now(),
            last_error = NULL
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name = $4
          AND status IN ($6, $7)
          AND attempt_count < $8
        RETURNING file_name
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        file_name,
        FILE_TASK_STATUS_RUNNING,
        FILE_TASK_STATUS_PENDING,
        FILE_TASK_STATUS_FAILED,
        max_attempts,
        token,
    )
    if row is None:
        return None
    return token


async def lock_citation_file_task_claim(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    claim_token: UUID,
) -> None:
    row = await connection.fetchrow(
        """
        SELECT 1
        FROM solemd.ingest_file_tasks
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name = $4
          AND status = $5
          AND claim_token = $6
        FOR UPDATE
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        file_name,
        FILE_TASK_STATUS_RUNNING,
        claim_token,
    )
    if row is None:
        raise RuntimeError(f"stale S2 citation file task claim for {file_name}")


async def heartbeat_citation_file_task(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    claim_token: UUID,
    input_bytes_read: int,
    rows_written: int,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_file_tasks
        SET input_bytes_read = GREATEST(input_bytes_read, $5),
            rows_written = GREATEST(rows_written, $6),
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name = $4
          AND status = $7
          AND claim_token = $8
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        file_name,
        input_bytes_read,
        rows_written,
        FILE_TASK_STATUS_RUNNING,
        claim_token,
    )


async def complete_citation_file_task(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    claim_token: UUID,
    file_byte_count: int,
    stage_row_count: int,
) -> bool:
    result = await connection.execute(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $5,
            input_bytes_read = $6::bigint,
            rows_written = $7::bigint,
            stage_row_count = $7::integer,
            claim_token = NULL,
            completed_at = now(),
            last_error = NULL,
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name = $4
          AND status = $8
          AND claim_token = $9
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        file_name,
        FILE_TASK_STATUS_COMPLETED,
        file_byte_count,
        stage_row_count,
        FILE_TASK_STATUS_RUNNING,
        claim_token,
    )
    return result.endswith(" 1")


async def fail_citation_file_task(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    file_name: str,
    claim_token: UUID,
    error_message: str,
) -> bool:
    result = await connection.execute(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $5,
            claim_token = NULL,
            last_error = $6,
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND file_name = $4
          AND status = $7
          AND claim_token = $8
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        file_name,
        FILE_TASK_STATUS_FAILED,
        error_message[:2000],
        FILE_TASK_STATUS_RUNNING,
        claim_token,
    )
    return result.endswith(" 1")


async def reset_stale_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    stale_after_seconds: float,
) -> tuple[str, ...]:
    rows = await connection.fetch(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $4,
            enqueued_at = NULL,
            claim_token = NULL,
            last_error = 'reset after stale running heartbeat',
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND status = $5
          AND updated_at < now() - ($6::double precision * interval '1 second')
        RETURNING file_name
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_PENDING,
        FILE_TASK_STATUS_RUNNING,
        stale_after_seconds,
    )
    return tuple(str(row["file_name"]) for row in rows)


async def reset_retryable_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    max_attempts: int,
) -> tuple[str, ...]:
    rows = await connection.fetch(
        """
        UPDATE solemd.ingest_file_tasks
        SET status = $4,
            enqueued_at = NULL,
            claim_token = NULL,
            updated_at = now()
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND status = $5
          AND attempt_count < $6
        RETURNING file_name
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_PENDING,
        FILE_TASK_STATUS_FAILED,
        max_attempts,
    )
    return tuple(str(row["file_name"]) for row in rows)


async def fetch_citation_file_task_progress(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> asyncpg.Record:
    return await connection.fetchrow(
        """
        SELECT
            count(*) FILTER (WHERE status = $4)::integer AS completed_count,
            COALESCE(sum(stage_row_count) FILTER (WHERE status = $4), 0)::bigint
                AS completed_stage_rows,
            COALESCE(sum(file_byte_count) FILTER (WHERE status = $4), 0)::bigint
                AS completed_input_bytes,
            count(*)::integer AS total_count
        FROM solemd.ingest_file_tasks
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_COMPLETED,
    )


async def fetch_completed_citation_file_tasks(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
) -> Sequence[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT file_name, stage_row_count
        FROM solemd.ingest_file_tasks
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND status = $4
        ORDER BY file_name
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_COMPLETED,
    )


async def fetch_terminal_citation_file_failures(
    connection: asyncpg.Connection,
    *,
    source_release_id: int,
    ingest_run_id: UUID,
    max_attempts: int,
) -> Sequence[asyncpg.Record]:
    return await connection.fetch(
        """
        SELECT file_name, attempt_count, last_error
        FROM solemd.ingest_file_tasks
        WHERE ingest_run_id = $1
          AND source_release_id = $2
          AND family_name = $3
          AND status = $4
          AND attempt_count >= $5
        ORDER BY file_name
        LIMIT 5
        """,
        ingest_run_id,
        source_release_id,
        CITATION_FAMILY_NAME,
        FILE_TASK_STATUS_FAILED,
        max_attempts,
    )


async def raise_if_run_aborted(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
) -> None:
    requested_status = await connection.fetchval(
        "SELECT requested_status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
        ingest_run_id,
    )
    if requested_status == INGEST_REQUESTED_STATUS_ABORT:
        raise IngestAborted(f"operator requested abort for run {ingest_run_id}")
