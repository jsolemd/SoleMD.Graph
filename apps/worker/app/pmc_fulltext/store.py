from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
import hashlib
import json
from uuid import UUID

import asyncpg

from app.config import Settings
from app.ingest.writers.base import copy_records
from app.pmc_fulltext.models import (
    DEFAULT_SOURCE_ORDER,
    FetchedPmcPayload,
    NormalizedPmcFullTextDocument,
    PmcFullTextCandidate,
    PmcFullTextRunSummary,
)
from app.pmc_fulltext.license import DOCUMENTS_LICENSE_PROVENANCE_SQL
from app.pmc_fulltext.parse_bioc import PARSER_NAME, PARSER_VERSION


_SECTION_COLUMNS = (
    "pmc_fulltext_document_id",
    "corpus_id",
    "pmcid",
    "section_ordinal",
    "parent_section_ordinal",
    "section_ordinal_path",
    "title",
    "section_label",
    "depth",
    "section_type",
    "section_role",
    "section_role_codes",
    "section_role_confidence",
    "section_role_source",
    "source_type",
)
_PASSAGE_COLUMNS = (
    "pmc_fulltext_document_id",
    "corpus_id",
    "pmcid",
    "section_ordinal",
    "section_ordinal_path",
    "passage_ordinal",
    "passage_role",
    "source_type",
    "text",
    "char_count",
    "token_estimate",
    "text_checksum",
    "is_retrievable",
    "parser_name",
    "parser_version",
)


async def start_run(
    connection: asyncpg.Connection,
    *,
    selector_version: str,
    limit: int | None,
    requested_by: str | None,
    runtime_settings: Settings,
    run_config: dict[str, object],
) -> UUID:
    return await connection.fetchval(
        """
        INSERT INTO solemd.pmc_fulltext_fetch_runs (
            requested_by,
            selector_version,
            source_order,
            limit_count,
            requests_per_second,
            run_config
        )
        VALUES ($1, $2, $3::text[], $4, $5, ($6::TEXT)::jsonb)
        RETURNING pmc_fulltext_fetch_run_id
        """,
        requested_by,
        selector_version,
        list(DEFAULT_SOURCE_ORDER),
        limit,
        runtime_settings.pmc_fulltext_requests_per_second,
        json.dumps(run_config),
    )


async def record_candidate_count(connection: asyncpg.Connection, *, run_id: UUID, count: int) -> None:
    await connection.execute(
        """
        UPDATE solemd.pmc_fulltext_fetch_runs
        SET candidate_count = $2
        WHERE pmc_fulltext_fetch_run_id = $1
        """,
        run_id,
        count,
    )


async def finalize_run(
    connection: asyncpg.Connection,
    *,
    run_id: UUID,
    status: str,
    counters: Counter[str],
    error_message: str | None = None,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.pmc_fulltext_fetch_runs
        SET completed_at = now(),
            status = $2,
            candidate_count = $3,
            unavailable_count = $4,
            fetched_count = $5,
            parsed_count = $6,
            promoted_count = $7,
            skipped_count = $8,
            failed_count = $9,
            error_message = $10
        WHERE pmc_fulltext_fetch_run_id = $1
        """,
        run_id,
        status,
        int(counters["candidate_count"]),
        int(counters["unavailable_count"]),
        int(counters["fetched_count"]),
        int(counters["parsed_count"]),
        int(counters["promoted_count"]),
        int(counters["skipped_count"]),
        int(counters["failed_count"]),
        error_message,
    )


async def load_existing_parsed_document(
    connection: asyncpg.Connection,
    candidate: PmcFullTextCandidate,
) -> UUID | None:
    return await connection.fetchval(
        f"""
        SELECT documents.pmc_fulltext_document_id
        FROM solemd.pmc_fulltext_documents documents
        WHERE documents.corpus_id = $1
          AND documents.pmcid = $2
          AND documents.status = 'parsed'
          AND documents.source_provider = 'pmc_bioc'
          AND documents.parser_version = $3
          AND documents.is_current
          AND {DOCUMENTS_LICENSE_PROVENANCE_SQL}
          AND EXISTS (
              SELECT 1
              FROM solemd.pmc_fulltext_passages passages
              WHERE passages.pmc_fulltext_document_id = documents.pmc_fulltext_document_id
          )
        ORDER BY documents.parsed_at DESC
        LIMIT 1
        """,
        candidate.corpus_id,
        candidate.pmcid,
        PARSER_VERSION,
    )


async def load_document_by_checksum(
    connection: asyncpg.Connection,
    candidate: PmcFullTextCandidate,
    checksum: str,
) -> UUID | None:
    return await connection.fetchval(
        f"""
        SELECT documents.pmc_fulltext_document_id
        FROM solemd.pmc_fulltext_documents documents
        WHERE documents.corpus_id = $1
          AND documents.pmcid = $2
          AND documents.source_provider = 'pmc_bioc'
          AND documents.source_checksum = $3
          AND documents.parser_version = $4
          AND documents.status = 'parsed'
          AND {DOCUMENTS_LICENSE_PROVENANCE_SQL}
          AND EXISTS (
              SELECT 1
              FROM solemd.pmc_fulltext_passages passages
              WHERE passages.pmc_fulltext_document_id = documents.pmc_fulltext_document_id
          )
        LIMIT 1
        """,
        candidate.corpus_id,
        candidate.pmcid,
        checksum,
        PARSER_VERSION,
    )


async def materialize_document(
    connection: asyncpg.Connection,
    *,
    run_id: UUID,
    candidate: PmcFullTextCandidate,
    fetched: FetchedPmcPayload,
    document: NormalizedPmcFullTextDocument,
) -> UUID:
    document_id = await upsert_document_state(
        connection,
        run_id=run_id,
        candidate=candidate,
        provider=fetched.provider,
        source_url=fetched.source_url,
        source_checksum=fetched.checksum,
        status="parsed",
        error_reason=None,
        license_text=fetched.license,
        license_url=fetched.license_url,
        license_source_provider=fetched.license_source_provider,
        fetched_at=fetched.fetched_at,
        parsed_at=datetime.now(UTC),
        passage_count=len(document.passages),
        retrievable_passage_count=document.retrievable_passage_count,
    )
    await connection.execute(
        "DELETE FROM solemd.pmc_fulltext_sections WHERE pmc_fulltext_document_id = $1",
        document_id,
    )
    await connection.execute(
        "DELETE FROM solemd.pmc_fulltext_passages WHERE pmc_fulltext_document_id = $1",
        document_id,
    )
    await copy_records(
        connection,
        schema_name="solemd",
        table_name="pmc_fulltext_sections",
        columns=_SECTION_COLUMNS,
        records=[
            (
                document_id,
                candidate.corpus_id,
                candidate.pmcid,
                section.section_ordinal,
                section.parent_section_ordinal,
                section.section_ordinal_path,
                section.title,
                section.section_label,
                section.depth,
                section.section_type,
                section.section_role,
                list(section.section_role_codes),
                section.section_role_confidence,
                section.section_role_source,
                section.source_type,
            )
            for section in document.sections
        ],
    )
    await copy_records(
        connection,
        schema_name="solemd",
        table_name="pmc_fulltext_passages",
        columns=_PASSAGE_COLUMNS,
        records=[
            (
                document_id,
                candidate.corpus_id,
                candidate.pmcid,
                passage.section_ordinal,
                passage.section_ordinal_path,
                passage.passage_ordinal,
                passage.passage_role,
                passage.source_type,
                passage.text,
                passage.char_count,
                passage.token_estimate,
                passage.text_checksum,
                passage.is_retrievable,
                document.parser_name,
                document.parser_version,
            )
            for passage in document.passages
        ],
    )
    return document_id


async def upsert_document_state(
    connection: asyncpg.Connection,
    *,
    run_id: UUID,
    candidate: PmcFullTextCandidate,
    provider: str,
    source_url: str | None,
    source_checksum: str,
    status: str,
    error_reason: str | None,
    license_text: str | None,
    license_url: str | None,
    license_source_provider: str | None,
    fetched_at: datetime | None = None,
    parsed_at: datetime | None = None,
    passage_count: int = 0,
    retrievable_passage_count: int = 0,
) -> UUID:
    await connection.execute(
        """
        UPDATE solemd.pmc_fulltext_documents
        SET is_current = false,
            updated_at = now()
        WHERE pmcid = $1
          AND source_provider = $2
          AND (parser_version <> $3 OR source_checksum <> $4)
          AND is_current
        """,
        candidate.pmcid,
        provider,
        PARSER_VERSION,
        source_checksum,
    )
    return await connection.fetchval(
        """
        INSERT INTO solemd.pmc_fulltext_documents (
            pmc_fulltext_fetch_run_id,
            corpus_id,
            pmcid,
            source_provider,
            source_url,
            source_checksum,
            parser_name,
            parser_version,
            license,
            license_url,
            license_source_provider,
            status,
            error_reason,
            fetched_at,
            parsed_at,
            is_current,
            passage_count,
            retrievable_passage_count
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, true, $16, $17
        )
        ON CONFLICT (pmcid, source_provider, source_checksum, parser_version)
        DO UPDATE SET
            pmc_fulltext_fetch_run_id = EXCLUDED.pmc_fulltext_fetch_run_id,
            corpus_id = EXCLUDED.corpus_id,
            source_url = EXCLUDED.source_url,
            license = EXCLUDED.license,
            license_url = EXCLUDED.license_url,
            license_source_provider = EXCLUDED.license_source_provider,
            status = EXCLUDED.status,
            error_reason = EXCLUDED.error_reason,
            fetched_at = COALESCE(EXCLUDED.fetched_at, solemd.pmc_fulltext_documents.fetched_at),
            parsed_at = COALESCE(EXCLUDED.parsed_at, solemd.pmc_fulltext_documents.parsed_at),
            is_current = true,
            passage_count = EXCLUDED.passage_count,
            retrievable_passage_count = EXCLUDED.retrievable_passage_count,
            updated_at = now()
        RETURNING pmc_fulltext_document_id
        """,
        run_id,
        candidate.corpus_id,
        candidate.pmcid,
        provider,
        source_url,
        source_checksum,
        PARSER_NAME,
        PARSER_VERSION,
        license_text,
        license_url,
        license_source_provider,
        status,
        error_reason,
        fetched_at,
        parsed_at,
        passage_count,
        retrievable_passage_count,
    )


def negative_checksum(pmcid: str, provider: str, reason: str | None) -> str:
    value = f"negative\0{pmcid}\0{provider}\0{reason or ''}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def run_summary(run_id: UUID, status: str, counters: Counter[str]) -> PmcFullTextRunSummary:
    return PmcFullTextRunSummary(
        run_id=run_id,
        status=status,
        candidate_count=int(counters["candidate_count"]),
        unavailable_count=int(counters["unavailable_count"]),
        fetched_count=int(counters["fetched_count"]),
        parsed_count=int(counters["parsed_count"]),
        promoted_count=int(counters["promoted_count"]),
        skipped_count=int(counters["skipped_count"]),
        failed_count=int(counters["failed_count"]),
    )
