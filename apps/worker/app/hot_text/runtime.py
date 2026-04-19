from __future__ import annotations

from datetime import UTC, datetime
import json
import logging
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.document_schema import (
    DOCUMENT_SOURCE_KIND_PMC_BIOC,
    TEXT_AVAILABILITY_FULLTEXT,
)
from app.document_spine import replace_document_spines
from app.hot_text.errors import PaperNotFound, PaperTextUnavailable
from app.hot_text.models import (
    AcquirePaperTextRequest,
    FetchManifest,
    PaperMetadata,
    PaperTextRunRecord,
    ResolvedLocator,
)
from app.hot_text.ncbi import fetch_pmc_biocxml, resolve_locators
from app.hot_text.parser import parse_pmc_bioc_document


LOGGER = logging.getLogger(__name__)

PAPER_TEXT_RUN_STATUS_STARTED = 1
PAPER_TEXT_RUN_STATUS_PUBLISHED = 2
PAPER_TEXT_RUN_STATUS_UNAVAILABLE = 3
PAPER_TEXT_RUN_STATUS_FAILED = 4


async def acquire_paper_text(
    request: AcquirePaperTextRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    async with ingest_pool.acquire() as connection:
        lock_key = await _acquire_paper_lock(connection, request.corpus_id)
        try:
            paper = await _load_paper_metadata(connection, request.corpus_id)
            existing_run = await _load_existing_current_run(connection, paper.corpus_id)
            if existing_run is not None and not request.force_refresh:
                _emit_event(
                    "hot_text.paper.already_current",
                    corpus_id=paper.corpus_id,
                    paper_text_run_id=existing_run.paper_text_run_id,
                )
                return str(existing_run.paper_text_run_id)

            run_id = await _insert_started_run(connection, request)
            try:
                locators = await resolve_locators(runtime_settings, paper)
                payload, manifest = await _fetch_first_available_payload(runtime_settings, locators)
                document = parse_pmc_bioc_document(payload, corpus_id=paper.corpus_id)

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

                _emit_event(
                    "hot_text.paper.published",
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
                await _finalize_run(
                    connection,
                    run_id,
                    status=PAPER_TEXT_RUN_STATUS_UNAVAILABLE,
                    locator_kind=getattr(failed_locator, "locator_kind", None),
                    locator_value=getattr(failed_locator, "locator_value", None),
                    resolver_kind=getattr(failed_locator, "resolver_kind", None),
                    resolved_pmc_id=getattr(failed_locator, "resolved_pmc_id", None),
                    error_message=str(exc),
                )
                _emit_event(
                    "hot_text.paper.unavailable",
                    corpus_id=request.corpus_id,
                    paper_text_run_id=run_id,
                    reason=str(exc),
                )
                raise
            except Exception as exc:
                await _finalize_run(
                    connection,
                    run_id,
                    status=PAPER_TEXT_RUN_STATUS_FAILED,
                    error_message=str(exc),
                )
                _emit_event(
                    "hot_text.paper.failed",
                    corpus_id=request.corpus_id,
                    paper_text_run_id=run_id,
                    error_class=type(exc).__name__,
                    error_message=str(exc),
                )
                raise
        finally:
            await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)


async def _acquire_paper_lock(connection: asyncpg.Connection, corpus_id: int) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        f"hot_text:{corpus_id}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise PaperTextUnavailable(f"paper {corpus_id} is already locked for hot-text acquisition")
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
        f"hot_text:{request.corpus_id}",
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
            last_error = PaperTextUnavailable(str(exc), locator=locator)
            _emit_event(
                "hot_text.paper.fetch_candidate_unavailable",
                locator_kind=locator.locator_kind,
                locator_value=locator.locator_value,
                resolver_kind=locator.resolver_kind,
                reason=str(exc),
            )
    if last_error is None:
        raise PaperTextUnavailable("no PMC BioC locator candidates were available")
    raise last_error
