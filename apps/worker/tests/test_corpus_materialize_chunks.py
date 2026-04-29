from __future__ import annotations

from uuid import UUID, uuid4

import asyncpg
import pytest

from app.corpus.materialize_chunks import prepare_phase_chunks_for_resume


async def _seed_selection_run(connection: asyncpg.Connection) -> UUID:
    s2_release_id = await connection.fetchval(
        """
        INSERT INTO solemd.source_releases (
            source_name,
            source_release_key,
            release_status,
            manifest_uri,
            manifest_checksum,
            source_published_at
        )
        VALUES ('s2', $1, 'loaded', 's3://s2/test', 's2-test', now())
        RETURNING source_release_id
        """,
        f"s2-{uuid4()}",
    )
    pt3_release_id = await connection.fetchval(
        """
        INSERT INTO solemd.source_releases (
            source_name,
            source_release_key,
            release_status,
            manifest_uri,
            manifest_checksum,
            source_published_at
        )
        VALUES ('pt3', $1, 'loaded', 's3://pt3/test', 'pt3-test', now())
        RETURNING source_release_id
        """,
        f"pt3-{uuid4()}",
    )
    run_id = await connection.fetchval(
        """
        INSERT INTO solemd.corpus_selection_runs (
            s2_source_release_id,
            pt3_source_release_id,
            selector_version,
            requested_by,
            status,
            plan_checksum,
            plan_manifest
        )
        VALUES ($1, $2, 'selector-test', 'pytest', 5, 'checksum', '{}')
        RETURNING corpus_selection_run_id
        """,
        int(s2_release_id),
        int(pt3_release_id),
    )
    return UUID(str(run_id))


@pytest.mark.asyncio
async def test_prepare_phase_chunks_requeues_interrupted_running_at_retry_cap(
    warehouse_dsns: dict[str, str],
) -> None:
    connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        run_id = await _seed_selection_run(connection)
        await connection.execute(
            """
            INSERT INTO solemd.corpus_selection_chunks (
                corpus_selection_run_id,
                phase_name,
                bucket_id,
                bucket_count,
                status,
                attempts,
                started_at
            )
            VALUES ($1, 'mapped_surface_materialization', 0, 4, 'running', 3, now())
            """,
            run_id,
        )
        await prepare_phase_chunks_for_resume(
            connection,
            corpus_selection_run_id=run_id,
            phase_name="mapped_surface_materialization",
            max_attempts=3,
        )
        row = await connection.fetchrow(
            """
            SELECT status, attempts, error_message
            FROM solemd.corpus_selection_chunks
            WHERE corpus_selection_run_id = $1
              AND phase_name = 'mapped_surface_materialization'
              AND bucket_id = 0
            """,
            run_id,
        )
    finally:
        await connection.close()

    assert row is not None
    assert row["status"] == "pending"
    assert row["attempts"] == 2
    assert row["error_message"] is None


@pytest.mark.asyncio
async def test_prepare_phase_chunks_keeps_failed_retry_cap_terminal(
    warehouse_dsns: dict[str, str],
) -> None:
    connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        run_id = await _seed_selection_run(connection)
        await connection.execute(
            """
            INSERT INTO solemd.corpus_selection_chunks (
                corpus_selection_run_id,
                phase_name,
                bucket_id,
                bucket_count,
                status,
                attempts,
                error_message
            )
            VALUES ($1, 'mapped_surface_materialization', 0, 4, 'failed', 3, 'poison')
            """,
            run_id,
        )
        with pytest.raises(RuntimeError, match="retry limit reached"):
            await prepare_phase_chunks_for_resume(
                connection,
                corpus_selection_run_id=run_id,
                phase_name="mapped_surface_materialization",
                max_attempts=3,
            )
        row = await connection.fetchrow(
            """
            SELECT status, attempts, error_message
            FROM solemd.corpus_selection_chunks
            WHERE corpus_selection_run_id = $1
              AND phase_name = 'mapped_surface_materialization'
              AND bucket_id = 0
            """,
            run_id,
        )
    finally:
        await connection.close()

    assert row is not None
    assert row["status"] == "failed"
    assert row["attempts"] == 3
    assert row["error_message"] == "poison"
