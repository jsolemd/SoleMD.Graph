from __future__ import annotations

import asyncio
from collections import Counter
from dataclasses import asdict, is_dataclass
from datetime import UTC, datetime
import json
import logging
from time import perf_counter
from typing import Protocol
from uuid import UUID

import asyncpg

from app.config import Settings, settings
from app.pmc_fulltext.availability import PmcAvailabilityResolver
from app.pmc_fulltext.candidates import (
    select_pmc_fulltext_candidates,
    select_retry_candidates,
)
from app.pmc_fulltext.fetch import PmcFullTextFetcher, build_pmc_bioc_url
from app.pmc_fulltext.license import has_license_provenance
from app.pmc_fulltext.models import (
    FetchedPmcPayload,
    PmcAvailability,
    PmcFullTextCandidate,
    PmcFullTextFetchFailed,
    PmcFullTextRetryRequest,
    PmcFullTextRunRequest,
    PmcFullTextRunSummary,
    PmcFullTextUnavailable,
)
from app.pmc_fulltext.parse_bioc import parse_pmc_bioc_fulltext
from app.pmc_fulltext.promote import promote_pmc_fulltext_document
from app.pmc_fulltext.store import (
    finalize_run,
    load_document_by_checksum,
    load_existing_parsed_document,
    materialize_document,
    negative_checksum,
    record_candidate_count,
    run_summary,
    start_run,
    upsert_document_state,
)
from app.telemetry.metrics import track_active_worker_run
from app.telemetry.pmc_fulltext_metrics import (
    record_pmc_fulltext_document,
    record_pmc_fulltext_parse_failure,
    record_pmc_fulltext_passages,
)


LOGGER = logging.getLogger(__name__)


class AvailabilityResolver(Protocol):
    async def resolve(self, pmcid: str) -> PmcAvailability:
        ...


class BiocPayloadFetcher(Protocol):
    async def fetch_bioc_payload(self, availability: PmcAvailability) -> FetchedPmcPayload:
        ...


async def run_pmc_fulltext(
    request: PmcFullTextRunRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
    availability_resolver: AvailabilityResolver | None = None,
    payload_fetcher: BiocPayloadFetcher | None = None,
) -> PmcFullTextRunSummary:
    fetcher = payload_fetcher or PmcFullTextFetcher(
        runtime_settings,
        requests_per_second=runtime_settings.pmc_fulltext_requests_per_second,
        max_attempts=runtime_settings.pmc_fulltext_max_attempts,
    )
    resolver = availability_resolver or PmcAvailabilityResolver(runtime_settings, fetcher)  # type: ignore[arg-type]
    async with ingest_pool.acquire() as connection:
        run_id = await start_run(
            connection,
            selector_version=request.selector_version,
            limit=request.limit,
            requested_by=request.requested_by,
            runtime_settings=runtime_settings,
            run_config={"mode": "run"},
        )
        candidates = await select_pmc_fulltext_candidates(
            connection,
            selector_version=request.selector_version,
            limit=request.limit,
        )
        await record_candidate_count(connection, run_id=run_id, count=len(candidates))
    return await _process_candidates(
        ingest_pool=ingest_pool,
        runtime_settings=runtime_settings,
        run_id=run_id,
        candidates=candidates,
        resolver=resolver,
        fetcher=fetcher,
    )


async def retry_pmc_fulltext_run(
    request: PmcFullTextRetryRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
    availability_resolver: AvailabilityResolver | None = None,
    payload_fetcher: BiocPayloadFetcher | None = None,
) -> PmcFullTextRunSummary:
    fetcher = payload_fetcher or PmcFullTextFetcher(
        runtime_settings,
        requests_per_second=runtime_settings.pmc_fulltext_requests_per_second,
        max_attempts=runtime_settings.pmc_fulltext_max_attempts,
    )
    resolver = availability_resolver or PmcAvailabilityResolver(runtime_settings, fetcher)  # type: ignore[arg-type]
    async with ingest_pool.acquire() as connection:
        run_id = await start_run(
            connection,
            selector_version=f"retry:{request.run_id}",
            limit=request.limit,
            requested_by=request.requested_by,
            runtime_settings=runtime_settings,
            run_config={"mode": "retry", "source_run_id": str(request.run_id)},
        )
        candidates = await select_retry_candidates(
            connection,
            run_id=request.run_id,
            limit=request.limit,
        )
        await record_candidate_count(connection, run_id=run_id, count=len(candidates))
    return await _process_candidates(
        ingest_pool=ingest_pool,
        runtime_settings=runtime_settings,
        run_id=run_id,
        candidates=candidates,
        resolver=resolver,
        fetcher=fetcher,
    )


async def qa_pmc_fulltext_run(
    connection: asyncpg.Connection,
    *,
    run_id: UUID,
    sample: int,
) -> dict[str, object]:
    status_rows = await connection.fetch(
        """
        SELECT status, source_provider, count(*)::BIGINT AS rows
        FROM solemd.pmc_fulltext_documents
        WHERE pmc_fulltext_fetch_run_id = $1
        GROUP BY status, source_provider
        ORDER BY status, source_provider
        """,
        run_id,
    )
    passage_rows = await connection.fetch(
        """
        SELECT passage_role, count(*)::BIGINT AS rows
        FROM solemd.pmc_fulltext_passages passages
        JOIN solemd.pmc_fulltext_documents documents
          ON documents.pmc_fulltext_document_id = passages.pmc_fulltext_document_id
        WHERE documents.pmc_fulltext_fetch_run_id = $1
        GROUP BY passage_role
        ORDER BY passage_role
        """,
        run_id,
    )
    samples = await connection.fetch(
        """
        SELECT
            documents.corpus_id,
            documents.pmcid,
            passages.passage_role,
            passages.section_ordinal_path,
            left(passages.text, 240) AS text_preview
        FROM solemd.pmc_fulltext_documents documents
        JOIN solemd.pmc_fulltext_passages passages
          ON passages.pmc_fulltext_document_id = documents.pmc_fulltext_document_id
        WHERE documents.pmc_fulltext_fetch_run_id = $1
          AND passages.is_retrievable
        ORDER BY documents.corpus_id, passages.passage_ordinal
        LIMIT $2
        """,
        run_id,
        sample,
    )
    return {
        "run_id": str(run_id),
        "documents": [dict(row) for row in status_rows],
        "passages": [dict(row) for row in passage_rows],
        "samples": [dict(row) for row in samples],
    }


async def _process_candidates(
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings,
    run_id: UUID,
    candidates: tuple[PmcFullTextCandidate, ...],
    resolver: AvailabilityResolver,
    fetcher: BiocPayloadFetcher,
) -> PmcFullTextRunSummary:
    counters: Counter[str] = Counter(candidate_count=len(candidates))
    selector_version = candidates[0].selector_version if candidates else ""
    started = perf_counter()
    try:
        async with track_active_worker_run(
            worker_scope="pmc_fulltext",
            run_kind="pmc_fulltext",
            run_label=f"pmc_fulltext:{selector_version or 'empty'}",
            selector_version=selector_version,
        ) as active_run:
            for index, candidate in enumerate(candidates, start=1):
                active_run.set_state(phase="candidate", work_item=candidate.pmcid)
                active_run.set_progress(
                    progress_kind="papers",
                    completed_units=index - 1,
                    total_units=len(candidates),
                )
                await _process_candidate(
                    ingest_pool=ingest_pool,
                    runtime_settings=runtime_settings,
                    run_id=run_id,
                    candidate=candidate,
                    resolver=resolver,
                    fetcher=fetcher,
                    counters=counters,
                )
                active_run.set_progress(
                    progress_kind="papers",
                    completed_units=index,
                    total_units=len(candidates),
                )
        async with ingest_pool.acquire() as connection:
            await finalize_run(connection, run_id=run_id, status="complete", counters=counters)
        _emit_event(
            "pmc_fulltext.run.complete",
            run_id=run_id,
            duration_seconds=perf_counter() - started,
            **dict(counters),
        )
        return run_summary(run_id, "complete", counters)
    except BaseException as exc:
        async with ingest_pool.acquire() as connection:
            await finalize_run(
                connection,
                run_id=run_id,
                status="aborted"
                if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt))
                else "failed",
                counters=counters,
                error_message=str(exc),
            )
        raise


async def _process_candidate(
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings,
    run_id: UUID,
    candidate: PmcFullTextCandidate,
    resolver: AvailabilityResolver,
    fetcher: BiocPayloadFetcher,
    counters: Counter[str],
) -> None:
    _emit_event("pmc_fulltext.candidate.selected", **_event_payload(candidate))
    async with ingest_pool.acquire() as connection:
        existing_id = await load_existing_parsed_document(connection, candidate)
        if existing_id is not None:
            promotion = await promote_pmc_fulltext_document(connection, document_id=existing_id)
            _emit_promotion_event(candidate, promotion.applied, promotion.passage_count)
            counters["promoted_count"] += int(promotion.applied)
            counters["skipped_count"] += 1
            return

    try:
        availability = await resolver.resolve(candidate.pmcid)
    except PmcFullTextFetchFailed as exc:
        provider = exc.provider or "pmc_oa"
        async with ingest_pool.acquire() as connection:
            await upsert_document_state(
                connection,
                run_id=run_id,
                candidate=candidate,
                provider=provider,
                source_url=None,
                source_checksum=negative_checksum(candidate.pmcid, provider, exc.reason),
                status="fetch_failed",
                error_reason=exc.reason,
                license_text=None,
                license_url=None,
                license_source_provider=provider,
            )
        counters["failed_count"] += 1
        record_pmc_fulltext_document(status="fetch_failed", provider=provider)
        _emit_event(
            "pmc_fulltext.availability.failed",
            corpus_id=candidate.corpus_id,
            pmcid=candidate.pmcid,
            provider=provider,
            reason=exc.reason,
        )
        return
    _emit_event("pmc_fulltext.availability.resolved", **_event_payload(availability))
    if not availability.available or not has_license_provenance(
        license_text=availability.license,
        license_url=availability.license_url,
    ):
        async with ingest_pool.acquire() as connection:
            await upsert_document_state(
                connection,
                run_id=run_id,
                candidate=candidate,
                provider=availability.provider,
                source_url=availability.source_url,
                source_checksum=negative_checksum(candidate.pmcid, availability.provider, availability.reason),
                status="unavailable",
                error_reason=availability.reason or "licensed PMC text unavailable",
                license_text=availability.license,
                license_url=availability.license_url,
                license_source_provider=availability.provider,
            )
        counters["unavailable_count"] += 1
        record_pmc_fulltext_document(status="unavailable", provider=availability.provider)
        _emit_event("pmc_fulltext.fetch.unavailable", corpus_id=candidate.corpus_id, pmcid=candidate.pmcid)
        return

    try:
        fetched = await fetcher.fetch_bioc_payload(availability)
        counters["fetched_count"] += 1
        _emit_event("pmc_fulltext.fetch.succeeded", corpus_id=candidate.corpus_id, pmcid=candidate.pmcid)
    except PmcFullTextUnavailable as exc:
        async with ingest_pool.acquire() as connection:
            await upsert_document_state(
                connection,
                run_id=run_id,
                candidate=candidate,
                provider="pmc_bioc",
                source_url=build_pmc_bioc_url(runtime_settings, candidate.pmcid),
                source_checksum=negative_checksum(candidate.pmcid, "pmc_bioc", exc.reason),
                status="unavailable",
                error_reason=exc.reason,
                license_text=availability.license,
                license_url=availability.license_url,
                license_source_provider=availability.provider,
            )
        counters["unavailable_count"] += 1
        record_pmc_fulltext_document(status="unavailable", provider="pmc_bioc")
        return
    except PmcFullTextFetchFailed as exc:
        async with ingest_pool.acquire() as connection:
            await upsert_document_state(
                connection,
                run_id=run_id,
                candidate=candidate,
                provider="pmc_bioc",
                source_url=build_pmc_bioc_url(runtime_settings, candidate.pmcid),
                source_checksum=negative_checksum(candidate.pmcid, "pmc_bioc", exc.reason),
                status="fetch_failed",
                error_reason=exc.reason,
                license_text=availability.license,
                license_url=availability.license_url,
                license_source_provider=availability.provider,
            )
        counters["failed_count"] += 1
        record_pmc_fulltext_document(status="fetch_failed", provider="pmc_bioc")
        _emit_event(
            "pmc_fulltext.fetch.failed",
            corpus_id=candidate.corpus_id,
            pmcid=candidate.pmcid,
            reason=exc.reason,
        )
        return

    async with ingest_pool.acquire() as connection:
        existing_id = await load_document_by_checksum(connection, candidate, fetched.checksum)
        if existing_id is not None:
            promotion = await promote_pmc_fulltext_document(connection, document_id=existing_id)
            _emit_promotion_event(candidate, promotion.applied, promotion.passage_count)
            counters["promoted_count"] += int(promotion.applied)
            counters["skipped_count"] += 1
            return

    try:
        document = parse_pmc_bioc_fulltext(
            fetched.payload,
            corpus_id=candidate.corpus_id,
            pmcid=candidate.pmcid,
        )
    except Exception as exc:
        reason = str(exc)
        async with ingest_pool.acquire() as connection:
            await upsert_document_state(
                connection,
                run_id=run_id,
                candidate=candidate,
                provider=fetched.provider,
                source_url=fetched.source_url,
                source_checksum=fetched.checksum,
                status="parse_failed",
                error_reason=reason,
                license_text=fetched.license,
                license_url=fetched.license_url,
                license_source_provider=fetched.license_source_provider,
                fetched_at=fetched.fetched_at,
            )
        counters["failed_count"] += 1
        record_pmc_fulltext_parse_failure(provider=fetched.provider, reason=type(exc).__name__)
        record_pmc_fulltext_document(status="parse_failed", provider=fetched.provider)
        _emit_event("pmc_fulltext.parse.failed", corpus_id=candidate.corpus_id, pmcid=candidate.pmcid, reason=reason)
        return

    async with ingest_pool.acquire() as connection:
        async with connection.transaction():
            document_id = await materialize_document(
                connection,
                run_id=run_id,
                candidate=candidate,
                fetched=fetched,
                document=document,
            )
            promotion = await promote_pmc_fulltext_document(connection, document_id=document_id)
            _emit_promotion_event(candidate, promotion.applied, promotion.passage_count)
    counters["parsed_count"] += 1
    counters["promoted_count"] += int(promotion.applied)
    record_pmc_fulltext_document(status="parsed", provider=fetched.provider)
    for role, count in Counter(passage.passage_role for passage in document.passages).items():
        record_pmc_fulltext_passages(role=role, provider=fetched.provider, count=count)
    _emit_event(
        "pmc_fulltext.document.materialized",
        corpus_id=candidate.corpus_id,
        pmcid=candidate.pmcid,
        section_count=len(document.sections),
        passage_count=len(document.passages),
        promoted=promotion.applied,
    )


def _emit_event(event_name: str, **payload: object) -> None:
    LOGGER.info("%s %s", event_name, json.dumps(payload, default=_json_default, sort_keys=True))


def _emit_promotion_event(
    candidate: PmcFullTextCandidate,
    applied: bool,
    passage_count: int,
) -> None:
    _emit_event(
        "pmc_fulltext.promotion.applied" if applied else "pmc_fulltext.promotion.skipped",
        corpus_id=candidate.corpus_id,
        pmcid=candidate.pmcid,
        passage_count=passage_count,
    )


def _event_payload(value: object) -> dict[str, object]:
    if is_dataclass(value):
        return asdict(value)
    return {}


def _json_default(value: object) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value)
