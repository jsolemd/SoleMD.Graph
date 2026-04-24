from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import json
import logging
from time import perf_counter
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.db import open_named_connection
from app.document_schema import (
    DOCUMENT_SOURCE_KIND_PMC_BIOC,
    TEXT_AVAILABILITY_FULLTEXT,
)
from app.document_spine import replace_document_spines
from app.evidence.errors import PaperNotFound, PaperTextFetchFailed, PaperTextUnavailable
from app.evidence.models import (
    AcquirePaperTextRequest,
    FetchManifest,
    PaperMetadata,
    PaperTextRunRecord,
    ResolvedLocator,
)
from app.evidence.ncbi import fetch_pmc_biocxml, resolve_locators
from app.evidence.parser import parse_pmc_bioc_document
from app.telemetry.metrics import (
    observe_evidence_text_acquisition,
    record_evidence_text_document_rows,
    record_evidence_text_failure,
    record_evidence_text_run,
    track_active_worker_run,
    track_evidence_text_inprogress,
)


LOGGER = logging.getLogger(__name__)

PAPER_TEXT_RUN_STATUS_STARTED = 1
PAPER_TEXT_RUN_STATUS_PUBLISHED = 2
PAPER_TEXT_RUN_STATUS_UNAVAILABLE = 3
PAPER_TEXT_RUN_STATUS_FAILED = 4
PAPER_TEXT_RUN_STATUS_ABORTED = 5
_PAPER_TEXT_PROGRESS_TOTAL_UNITS = 5.0


async def acquire_paper_text(
    request: AcquirePaperTextRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    started = perf_counter()
    run_id: UUID | None = None
    async with open_named_connection(runtime_settings, name="ingest_write") as control_connection:
        lock_key = await _acquire_paper_lock(control_connection, request.corpus_id)
        try:
            async with track_evidence_text_inprogress():
                async with track_active_worker_run(
                    worker_scope="evidence",
                    run_kind="evidence_text",
                    run_label="evidence_text",
                ) as active_run:
                    active_run.set_state(phase="load_metadata")
                    active_run.set_progress(
                        progress_kind="overall",
                        completed_units=0,
                        total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                    )
                    async with ingest_pool.acquire() as connection:
                        paper = await _load_paper_metadata(connection, request.corpus_id)
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=1,
                            total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                        )
                        existing_run = await _load_existing_current_run(connection, paper.corpus_id)
                    if existing_run is not None and not request.force_refresh:
                        record_evidence_text_run(
                            outcome="already_current",
                            locator_kind="pmc_bioc",
                            resolver_kind="current_document",
                        )
                        observe_evidence_text_acquisition(
                            outcome="already_current",
                            locator_kind="pmc_bioc",
                            resolver_kind="current_document",
                            duration_seconds=perf_counter() - started,
                        )
                        _emit_event(
                            "evidence.paper_text.already_current",
                            corpus_id=paper.corpus_id,
                            paper_text_run_id=existing_run.paper_text_run_id,
                        )
                        return str(existing_run.paper_text_run_id)

                    async with ingest_pool.acquire() as connection:
                        run_id = await _insert_started_run(connection, request)
                    try:
                        active_run.set_state(phase="resolve_locators")
                        locators = await resolve_locators(runtime_settings, paper)
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=2,
                            total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                        )
                        active_run.set_state(phase="fetch_payload")
                        payload, manifest = await _fetch_first_available_payload(
                            runtime_settings,
                            locators,
                        )
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=3,
                            total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                        )
                        active_run.set_state(phase="parse_document")
                        document = parse_pmc_bioc_document(payload, corpus_id=paper.corpus_id)
                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=4,
                            total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                        )
                        active_run.set_state(phase="publish_document")

                        async with ingest_pool.acquire() as connection:
                            async with connection.transaction():
                                await replace_document_spines(
                                    connection,
                                    (document,),
                                    source_revision=manifest.resolved_pmc_id or manifest.locator_value,
                                )
                                await connection.execute(
                                    """
                                    UPDATE solemd.paper_text
                                    SET text_availability = $2::smallint
                                    WHERE corpus_id = $1
                                    """,
                                    paper.corpus_id,
                                    TEXT_AVAILABILITY_FULLTEXT,
                                )
                                if manifest.resolved_pmc_id:
                                    await connection.execute(
                                        """
                                        UPDATE solemd.papers
                                        SET pmc_id = $2
                                        WHERE corpus_id = $1
                                          AND pmc_id IS DISTINCT FROM $2
                                        """,
                                        paper.corpus_id,
                                        manifest.resolved_pmc_id,
                                    )
                                await _finalize_run(
                                    connection,
                                    run_id,
                                    status=PAPER_TEXT_RUN_STATUS_PUBLISHED,
                                    locator_kind=manifest.locator_kind,
                                    locator_value=manifest.locator_value,
                                    resolver_kind=manifest.resolver_kind,
                                    resolved_pmc_id=manifest.resolved_pmc_id,
                                    manifest_uri=manifest.manifest_uri,
                                    response_checksum=manifest.response_checksum,
                                )

                        active_run.set_progress(
                            progress_kind="overall",
                            completed_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                            total_units=_PAPER_TEXT_PROGRESS_TOTAL_UNITS,
                        )
                        record_evidence_text_run(
                            outcome="published",
                            locator_kind=manifest.locator_kind,
                            resolver_kind=manifest.resolver_kind,
                        )
                        observe_evidence_text_acquisition(
                            outcome="published",
                            locator_kind=manifest.locator_kind,
                            resolver_kind=manifest.resolver_kind,
                            duration_seconds=perf_counter() - started,
                        )
                        record_evidence_text_document_rows(
                            section_count=len(document["sections"]),
                            block_count=len(document["blocks"]),
                            sentence_count=len(document["sentences"]),
                        )
                        _emit_event(
                            "evidence.paper_text.published",
                            corpus_id=paper.corpus_id,
                            paper_text_run_id=run_id,
                            locator_kind=manifest.locator_kind,
                            locator_value=manifest.locator_value,
                            resolved_pmc_id=manifest.resolved_pmc_id,
                            section_count=len(document["sections"]),
                            block_count=len(document["blocks"]),
                            sentence_count=len(document["sentences"]),
                        )
                        return str(run_id)
                    except PaperTextUnavailable as exc:
                        failed_locator = exc.locator
                        if await _record_terminal_run_state(
                            runtime_settings,
                            run_id=run_id,
                            status=PAPER_TEXT_RUN_STATUS_UNAVAILABLE,
                            locator_kind=getattr(failed_locator, "locator_kind", None),
                            locator_value=getattr(failed_locator, "locator_value", None),
                            resolver_kind=getattr(failed_locator, "resolver_kind", None),
                            resolved_pmc_id=getattr(failed_locator, "resolved_pmc_id", None),
                            error_message=str(exc),
                        ):
                            record_evidence_text_run(
                                outcome="unavailable",
                                locator_kind=getattr(failed_locator, "locator_kind", None),
                                resolver_kind=getattr(failed_locator, "resolver_kind", None),
                            )
                            observe_evidence_text_acquisition(
                                outcome="unavailable",
                                locator_kind=getattr(failed_locator, "locator_kind", None),
                                resolver_kind=getattr(failed_locator, "resolver_kind", None),
                                duration_seconds=perf_counter() - started,
                            )
                            _emit_event(
                                "evidence.paper_text.unavailable",
                                corpus_id=request.corpus_id,
                                paper_text_run_id=run_id,
                                reason=str(exc),
                            )
                        raise
                    except asyncio.CancelledError:
                        if run_id is not None:
                            try:
                                recorded = await asyncio.shield(
                                    _record_terminal_run_state(
                                        runtime_settings,
                                        run_id=run_id,
                                        status=PAPER_TEXT_RUN_STATUS_ABORTED,
                                        error_message="run cancelled (time_limit or worker shutdown)",
                                    )
                                )
                                if recorded:
                                    record_evidence_text_run(
                                        outcome="aborted",
                                        locator_kind=None,
                                        resolver_kind=None,
                                    )
                                    observe_evidence_text_acquisition(
                                        outcome="aborted",
                                        locator_kind=None,
                                        resolver_kind=None,
                                        duration_seconds=perf_counter() - started,
                                    )
                                    _emit_event(
                                        "evidence.paper_text.aborted",
                                        corpus_id=request.corpus_id,
                                        paper_text_run_id=run_id,
                                        reason="cancelled",
                                    )
                            except BaseException:
                                LOGGER.exception(
                                    "failed to mark evidence text run aborted during cancellation",
                                )
                        raise
                    except Exception as exc:
                        failed_locator = exc.locator if isinstance(exc, PaperTextFetchFailed) else None
                        if await _record_terminal_run_state(
                            runtime_settings,
                            run_id=run_id,
                            status=PAPER_TEXT_RUN_STATUS_FAILED,
                            locator_kind=getattr(failed_locator, "locator_kind", None),
                            locator_value=getattr(failed_locator, "locator_value", None),
                            resolver_kind=getattr(failed_locator, "resolver_kind", None),
                            resolved_pmc_id=getattr(failed_locator, "resolved_pmc_id", None),
                            error_message=str(exc),
                        ):
                            record_evidence_text_run(
                                outcome="failed",
                                locator_kind=getattr(failed_locator, "locator_kind", None),
                                resolver_kind=getattr(failed_locator, "resolver_kind", None),
                            )
                            record_evidence_text_failure(failure_class=type(exc).__name__)
                            observe_evidence_text_acquisition(
                                outcome="failed",
                                locator_kind=getattr(failed_locator, "locator_kind", None),
                                resolver_kind=getattr(failed_locator, "resolver_kind", None),
                                duration_seconds=perf_counter() - started,
                            )
                            _emit_event(
                                "evidence.paper_text.failed",
                                corpus_id=request.corpus_id,
                                paper_text_run_id=run_id,
                                locator_kind=getattr(failed_locator, "locator_kind", None),
                                locator_value=getattr(failed_locator, "locator_value", None),
                                resolver_kind=getattr(failed_locator, "resolver_kind", None),
                                resolved_pmc_id=getattr(failed_locator, "resolved_pmc_id", None),
                                error_class=type(exc).__name__,
                                error_message=str(exc),
                            )
                        raise
        finally:
            await _unlock_advisory_lock_best_effort(
                control_connection,
                lock_key,
                scope=f"evidence:{request.corpus_id}",
            )


async def _acquire_paper_lock(connection: asyncpg.Connection, corpus_id: int) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        f"evidence:{corpus_id}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise PaperTextUnavailable(
            f"paper {corpus_id} is already locked for evidence-text acquisition"
        )
    return int(lock_key)


async def _load_paper_metadata(connection: asyncpg.Connection, corpus_id: int) -> PaperMetadata:
    row = await connection.fetchrow(
        """
        SELECT papers.corpus_id, papers.pmid, papers.pmc_id, papers.doi_norm, paper_text.title
        FROM solemd.papers papers
        JOIN solemd.paper_text paper_text
          ON paper_text.corpus_id = papers.corpus_id
        WHERE papers.corpus_id = $1
        """,
        corpus_id,
    )
    if row is None:
        raise PaperNotFound(f"paper {corpus_id} does not exist in the warehouse")
    return PaperMetadata.model_validate(dict(row))


async def _load_existing_current_run(
    connection: asyncpg.Connection,
    corpus_id: int,
) -> PaperTextRunRecord | None:
    row = await connection.fetchrow(
        """
        SELECT runs.paper_text_run_id, runs.status
        FROM solemd.paper_text_acquisition_runs runs
        JOIN solemd.paper_documents documents
          ON documents.corpus_id = runs.corpus_id
        WHERE runs.corpus_id = $1
          AND runs.status = $2
          AND documents.document_source_kind = $3
        ORDER BY runs.started_at DESC
        LIMIT 1
        """,
        corpus_id,
        PAPER_TEXT_RUN_STATUS_PUBLISHED,
        DOCUMENT_SOURCE_KIND_PMC_BIOC,
    )
    if row is None:
        return None
    return PaperTextRunRecord.model_validate(dict(row))


async def _insert_started_run(
    connection: asyncpg.Connection,
    request: AcquirePaperTextRequest,
) -> UUID:
    return await connection.fetchval(
        """
        INSERT INTO solemd.paper_text_acquisition_runs (
            advisory_lock_key,
            corpus_id,
            requested_by,
            status
        )
        VALUES (
            hashtextextended($1, 0)::bigint,
            $2,
            $3,
            $4
        )
        RETURNING paper_text_run_id
        """,
            f"evidence:{request.corpus_id}",
        request.corpus_id,
        request.requested_by,
        PAPER_TEXT_RUN_STATUS_STARTED,
    )


async def _finalize_run(
    connection: asyncpg.Connection,
    run_id: UUID,
    *,
    status: int,
    locator_kind: str | None = None,
    locator_value: str | None = None,
    resolver_kind: str | None = None,
    resolved_pmc_id: str | None = None,
    manifest_uri: str | None = None,
    response_checksum: str | None = None,
    error_message: str | None = None,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.paper_text_acquisition_runs
        SET completed_at = now(),
            status = $2,
            locator_kind = COALESCE($3, locator_kind),
            locator_value = COALESCE($4, locator_value),
            resolver_kind = COALESCE($5, resolver_kind),
            resolved_pmc_id = COALESCE($6, resolved_pmc_id),
            manifest_uri = COALESCE($7, manifest_uri),
            response_checksum = COALESCE($8, response_checksum),
            error_message = $9
        WHERE paper_text_run_id = $1
        """,
        run_id,
        status,
        locator_kind,
        locator_value,
        resolver_kind,
        resolved_pmc_id,
        manifest_uri,
        response_checksum,
        error_message,
    )


async def _record_terminal_run_state(
    runtime_settings: Settings,
    *,
    run_id: UUID,
    status: int,
    locator_kind: str | None = None,
    locator_value: str | None = None,
    resolver_kind: str | None = None,
    resolved_pmc_id: str | None = None,
    manifest_uri: str | None = None,
    response_checksum: str | None = None,
    error_message: str | None = None,
) -> bool:
    try:
        async with open_named_connection(runtime_settings, name="ingest_write") as connection:
            await _finalize_run(
                connection,
                run_id,
                status=status,
                locator_kind=locator_kind,
                locator_value=locator_value,
                resolver_kind=resolver_kind,
                resolved_pmc_id=resolved_pmc_id,
                manifest_uri=manifest_uri,
                response_checksum=response_checksum,
                error_message=error_message,
            )
        return True
    except Exception:
        LOGGER.exception(
            "failed to persist terminal paper-text run state",
            extra={
                "paper_text_run_id": str(run_id),
                "status": status,
            },
        )
        return False


async def _unlock_advisory_lock_best_effort(
    connection: asyncpg.Connection,
    lock_key: int,
    *,
    scope: str,
) -> None:
    try:
        await asyncio.shield(connection.execute("SELECT pg_advisory_unlock($1)", lock_key))
    except BaseException:
        LOGGER.exception("failed to release advisory lock for %s", scope)


def _emit_event(event_name: str, **payload: object) -> None:
    LOGGER.info("%s %s", event_name, json.dumps(payload, default=_json_default, sort_keys=True))


def _json_default(value: object) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)


async def _fetch_first_available_payload(
    runtime_settings: Settings,
    locators: tuple[ResolvedLocator, ...],
) -> tuple[bytes, FetchManifest]:
    last_error: PaperTextUnavailable | None = None
    for locator in locators:
        try:
            return await fetch_pmc_biocxml(runtime_settings, locator)
        except PaperTextUnavailable as exc:
            last_error = PaperTextUnavailable(str(exc), locator=exc.locator or locator)
            _emit_event(
                "evidence.paper_text.fetch_candidate_unavailable",
                locator_kind=locator.locator_kind,
                locator_value=locator.locator_value,
                resolver_kind=locator.resolver_kind,
                reason=str(exc),
            )
    if last_error is None:
        raise PaperTextUnavailable("no PMC BioC locator candidates were available")
    raise last_error
