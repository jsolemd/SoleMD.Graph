from __future__ import annotations

import asyncio
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import logging
from pathlib import Path
from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.ingest.errors import (
    IngestAborted,
    IngestAlreadyInProgress,
    IngestAlreadyPublished,
    PlanDrift,
    SourceSchemaDrift,
)
from app.ingest.models import (
    CopyStats,
    IngestPlan,
    IngestRunRecord,
    SourceCode,
    StartReleaseRequest,
)
from app.ingest.sources import pubtator, semantic_scholar
from app.telemetry.metrics import (
    observe_ingest_phase,
    record_ingest_failure,
    record_ingest_family_load,
    record_ingest_run,
    track_ingest_lock_age,
)
from app.ingest.writers import pubtator as pubtator_writer
from app.ingest.writers import s2 as s2_writer


LOGGER = logging.getLogger(__name__)

INGEST_STATUS_STARTED = 1
INGEST_STATUS_LOADING = 2
INGEST_STATUS_INDEXING = 3
INGEST_STATUS_ANALYZING = 4
INGEST_STATUS_PUBLISHED = 5
INGEST_STATUS_FAILED = 6
INGEST_STATUS_ABORTED = 7
INGEST_REQUESTED_STATUS_ABORT = 2


@dataclass(frozen=True, slots=True)
class SourceAdapter:
    build_plan: Callable[[Settings, StartReleaseRequest], IngestPlan]
    promote_family: Callable[[asyncpg.Connection, IngestPlan, str, int, str], asyncio.Future | object]


@dataclass(frozen=True, slots=True)
class SourceWriter:
    load_family: Callable[
        [asyncpg.Pool, Settings, StartReleaseRequest, IngestPlan, str, int, str],
        asyncio.Future | object,
    ]


SOURCE_ADAPTERS: dict[SourceCode, SourceAdapter] = {
    "s2": SourceAdapter(
        build_plan=semantic_scholar.build_plan,
        promote_family=semantic_scholar.promote_family,
    ),
    "pt3": SourceAdapter(
        build_plan=pubtator.build_plan,
        promote_family=pubtator.promote_family,
    ),
}

SOURCE_WRITERS: dict[SourceCode, SourceWriter] = {
    "s2": SourceWriter(load_family=s2_writer.load_family),
    "pt3": SourceWriter(load_family=pubtator_writer.load_family),
}


async def run_release_ingest(
    request: StartReleaseRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    adapter = SOURCE_ADAPTERS[request.source_code]
    writer = SOURCE_WRITERS[request.source_code]
    plan = adapter.build_plan(runtime_settings, request)
    cycle_started = perf_counter()

    async with ingest_pool.acquire() as control_connection:
        lock_key = await _acquire_release_lock(control_connection, request)
        ingest_run_id: UUID | None = None
        family_name: str | None = None
        active_phase_name: str | None = None
        active_phase_started: float | None = None
        async with track_ingest_lock_age(
            source_code=request.source_code,
            release_tag=request.release_tag,
        ):
            try:
                source_release_id = await _ensure_source_release(control_connection, request, plan)
                run = await _open_or_resume_run(
                    control_connection,
                    request=request,
                    plan=plan,
                    source_release_id=source_release_id,
                    lock_key=lock_key,
                )
                ingest_run_id = run.ingest_run_id
                _emit_event(
                    "ingest.cycle.started",
                    ingest_run_id=ingest_run_id,
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    plan=plan.model_dump(mode="json"),
                )
                await _set_phase(
                    control_connection,
                    ingest_run_id,
                    status_code=INGEST_STATUS_LOADING,
                    phase_name="loading",
                )
                active_phase_name = "loading"
                active_phase_started = perf_counter()
                for family_name in plan.family_names:
                    await _assert_not_aborted(control_connection, ingest_run_id)
                    if family_name in run.families_loaded:
                        continue
                    stats = await writer.load_family(
                        ingest_pool,
                        runtime_settings,
                        request,
                        plan,
                        family_name,
                        source_release_id,
                        ingest_run_id,
                    )
                    async with control_connection.transaction():
                        await adapter.promote_family(
                            control_connection,
                            plan,
                            family_name,
                            source_release_id,
                            ingest_run_id,
                        )
                        await _mark_family_loaded(control_connection, ingest_run_id, family_name)
                    record_ingest_family_load(
                        source_code=request.source_code,
                        family_name=family_name,
                        row_count=stats.row_count,
                        file_count=stats.file_count,
                    )
                    _emit_event(
                        "ingest.family.loaded",
                        ingest_run_id=ingest_run_id,
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        family=family_name,
                        row_count=stats.row_count,
                        file_count=stats.file_count,
                    )

                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )

                await _set_phase(
                    control_connection,
                    ingest_run_id,
                    status_code=INGEST_STATUS_INDEXING,
                    phase_name="indexing",
                )
                active_phase_name = "indexing"
                active_phase_started = perf_counter()
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )

                await _set_phase(
                    control_connection,
                    ingest_run_id,
                    status_code=INGEST_STATUS_ANALYZING,
                    phase_name="analyzing",
                )
                active_phase_name = "analyzing"
                active_phase_started = perf_counter()
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                active_phase_name = None
                active_phase_started = None
                await _finalize_published(control_connection, ingest_run_id, source_release_id)
                record_ingest_run(source_code=request.source_code, outcome="published")
                _emit_event(
                    "ingest.cycle.published",
                    ingest_run_id=ingest_run_id,
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    families=plan.family_names,
                    total_duration_s=perf_counter() - cycle_started,
                )
                return str(ingest_run_id)
            except (IngestAlreadyPublished, IngestAlreadyInProgress):
                raise
            except IngestAborted as exc:
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                if ingest_run_id is not None:
                    await _set_terminal_status(
                        control_connection,
                        ingest_run_id,
                        INGEST_STATUS_ABORTED,
                        str(exc),
                    )
                    record_ingest_run(source_code=request.source_code, outcome="aborted")
                    _emit_event(
                        "ingest.cycle.aborted",
                        ingest_run_id=ingest_run_id,
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        reason=str(exc),
                    )
                raise
            except Exception as exc:
                failure_phase = active_phase_name or ("loading" if family_name is not None else "start")
                _observe_active_phase(
                    source_code=request.source_code,
                    release_tag=request.release_tag,
                    phase_name=active_phase_name,
                    phase_started=active_phase_started,
                )
                if ingest_run_id is not None:
                    await _set_terminal_status(
                        control_connection,
                        ingest_run_id,
                        INGEST_STATUS_FAILED,
                        str(exc),
                    )
                    record_ingest_run(source_code=request.source_code, outcome="failed")
                    record_ingest_failure(
                        source_code=request.source_code,
                        phase=failure_phase,
                        failure_class=type(exc).__name__,
                    )
                    _emit_event(
                        "ingest.cycle.failed",
                        ingest_run_id=ingest_run_id,
                        source_code=request.source_code,
                        release_tag=request.release_tag,
                        phase=failure_phase,
                        family=family_name,
                        error_class=type(exc).__name__,
                        error_message=str(exc),
                    )
                raise
            finally:
                await control_connection.execute("SELECT pg_advisory_unlock($1)", lock_key)


async def _acquire_release_lock(
    connection: asyncpg.Connection,
    request: StartReleaseRequest,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        f"ingest:{request.source_code}:{request.release_tag}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise IngestAlreadyInProgress(
            f"release {request.source_code}:{request.release_tag} is already locked"
        )
    return int(lock_key)


async def _ensure_source_release(
    connection: asyncpg.Connection,
    request: StartReleaseRequest,
    plan: IngestPlan,
) -> int:
    row = await connection.fetchrow(
        """
        INSERT INTO solemd.source_releases (
            source_published_at,
            manifest_checksum,
            manifest_uri,
            source_name,
            source_release_key,
            release_status
        )
        VALUES ($1, $2, $3, $4, $5, 'ingesting')
        ON CONFLICT (source_name, source_release_key)
        DO UPDATE SET
            source_published_at = EXCLUDED.source_published_at,
            manifest_checksum = EXCLUDED.manifest_checksum,
            manifest_uri = EXCLUDED.manifest_uri,
            release_status = 'ingesting',
            source_ingested_at = now()
        RETURNING source_release_id
        """,
        plan.source_published_at,
        plan.release_checksum,
        plan.manifest_uri,
        request.source_code,
        request.release_tag,
    )
    return int(row["source_release_id"])


async def _open_or_resume_run(
    connection: asyncpg.Connection,
    *,
    request: StartReleaseRequest,
    plan: IngestPlan,
    source_release_id: int,
    lock_key: int,
) -> IngestRunRecord:
    latest = await connection.fetchrow(
        """
        SELECT ingest_run_id, source_release_id, status, families_loaded, last_loaded_family,
               manifest_uri, plan_manifest
        FROM solemd.ingest_runs
        WHERE source_release_id = $1
        ORDER BY started_at DESC
        LIMIT 1
        """,
        source_release_id,
    )
    plan_payload = plan.model_dump(mode="json")

    if latest is not None:
        run = IngestRunRecord.model_validate(dict(latest))
        if run.status == INGEST_STATUS_PUBLISHED and not request.force_new_run:
            raise IngestAlreadyPublished(
                f"release {request.source_code}:{request.release_tag} already published"
            )
        if run.plan_manifest is not None and _digest_payload(run.plan_manifest) != _digest_payload(plan_payload):
            raise PlanDrift(
                f"planned family layout drifted for {request.source_code}:{request.release_tag}"
            )
        if run.status != INGEST_STATUS_PUBLISHED and not request.force_new_run:
            await connection.execute(
                """
                UPDATE solemd.ingest_runs
                SET advisory_lock_key = $1,
                    manifest_uri = $2,
                    plan_manifest = $3,
                    error_message = NULL
                WHERE ingest_run_id = $4
                """,
                lock_key,
                plan.manifest_uri,
                plan_payload,
                run.ingest_run_id,
            )
            return IngestRunRecord(
                ingest_run_id=run.ingest_run_id,
                source_release_id=source_release_id,
                status=run.status,
                families_loaded=run.families_loaded,
                last_loaded_family=run.last_loaded_family,
                manifest_uri=plan.manifest_uri,
                plan_manifest=plan_payload,
            )

    row = await connection.fetchrow(
        """
        INSERT INTO solemd.ingest_runs (
            advisory_lock_key,
            source_release_id,
            status,
            manifest_uri,
            plan_manifest,
            phase_started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ingest_run_id, source_release_id, status, families_loaded, last_loaded_family,
                  manifest_uri, plan_manifest
        """,
        lock_key,
        source_release_id,
        INGEST_STATUS_STARTED,
        plan.manifest_uri,
        plan_payload,
        {"started": datetime.now(UTC).isoformat()},
    )
    return IngestRunRecord.model_validate(dict(row))


async def _set_phase(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    *,
    status_code: int,
    phase_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            phase_started_at = phase_started_at || jsonb_build_object($2::text, $3::text)
        WHERE ingest_run_id = $4
        """,
        status_code,
        phase_name,
        datetime.now(UTC).isoformat(),
        ingest_run_id,
    )


async def _mark_family_loaded(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    family_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET families_loaded = CASE
                WHEN NOT ($1 = ANY(families_loaded)) THEN array_append(families_loaded, $1)
                ELSE families_loaded
            END,
            last_loaded_family = $1
        WHERE ingest_run_id = $2
        """,
        family_name,
        ingest_run_id,
    )


async def _assert_not_aborted(connection: asyncpg.Connection, ingest_run_id: UUID) -> None:
    requested_status = await connection.fetchval(
        "SELECT requested_status FROM solemd.ingest_runs WHERE ingest_run_id = $1",
        ingest_run_id,
    )
    if requested_status == INGEST_REQUESTED_STATUS_ABORT:
        raise IngestAborted(f"operator requested abort for run {ingest_run_id}")


async def _finalize_published(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    source_release_id: int,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            completed_at = now(),
            error_message = NULL
        WHERE ingest_run_id = $2
        """,
        INGEST_STATUS_PUBLISHED,
        ingest_run_id,
    )
    await connection.execute(
        """
        UPDATE solemd.source_releases
        SET release_status = 'loaded',
            source_ingested_at = now()
        WHERE source_release_id = $1
        """,
        source_release_id,
    )


async def _set_terminal_status(
    connection: asyncpg.Connection,
    ingest_run_id: UUID,
    status_code: int,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.ingest_runs
        SET status = $1,
            completed_at = now(),
            error_message = $2
        WHERE ingest_run_id = $3
        """,
        status_code,
        error_message[:2000],
        ingest_run_id,
    )


def _digest_payload(payload: dict) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()


def _emit_event(event_name: str, **fields: object) -> None:
    LOGGER.info("%s %s", event_name, json.dumps(fields, sort_keys=True, default=str))


def _observe_active_phase(
    *,
    source_code: str,
    release_tag: str,
    phase_name: str | None,
    phase_started: float | None,
) -> None:
    if phase_name is None or phase_started is None:
        return
    observe_ingest_phase(
        source_code=source_code,
        release_tag=release_tag,
        phase=phase_name,
        duration_seconds=perf_counter() - phase_started,
    )
