from __future__ import annotations

from datetime import UTC, datetime
import hashlib
from uuid import UUID

import asyncpg

from app.pmc_fulltext.models import FetchedPmcPayload, PmcAvailability
from app.pmc_fulltext.parse_bioc import PARSER_NAME, PARSER_VERSION


RUNTIME_BIOC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <source>PMC</source>
  <date>20260511</date>
  <key>test</key>
  <document>
    <id>PMC900001</id>
    <passage>
      <infon key="type">abstract</infon>
      <infon key="section_type">ABSTRACT</infon>
      <offset>0</offset>
      <text>Abstract text supports retrieval.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>40</offset>
      <text>Introduction</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>55</offset>
      <text>Body text supports full text promotion.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">REF</infon>
      <offset>100</offset>
      <text>References</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">REF</infon>
      <offset>112</offset>
      <text>1. This reference must stay out.</text>
    </passage>
  </document>
</collection>
"""


class FakeAvailabilityResolver:
    async def resolve(self, pmcid: str) -> PmcAvailability:
        if pmcid == "PMC900001":
            return PmcAvailability(
                pmcid=pmcid,
                available=True,
                provider="pmc_oa",
                source_url=f"https://example.test/oa/{pmcid}",
                license="CC BY",
                license_url="https://creativecommons.org/licenses/by/4.0/",
            )
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oa",
            source_url=f"https://example.test/oa/{pmcid}",
            reason="not in the PMC Open Access subset",
        )


class FakePayloadFetcher:
    async def fetch_bioc_payload(self, availability: PmcAvailability) -> FetchedPmcPayload:
        return FetchedPmcPayload(
            pmcid=availability.pmcid,
            provider="pmc_bioc",
            source_url=f"https://example.test/bioc/{availability.pmcid}",
            payload=RUNTIME_BIOC_XML,
            checksum=hashlib.sha256(RUNTIME_BIOC_XML).hexdigest(),
            fetched_at=datetime.now(UTC),
            license=availability.license,
            license_url=availability.license_url,
            license_source_provider=availability.provider,
        )


async def seed_pmc_summary_paper(
    admin_dsn: str,
    *,
    corpus_id: int,
    pmcid: str,
    content_status: str,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        s2_release_id = await ensure_source_release(connection, "s2", "s2-pmc-test")
        pt3_release_id = await ensure_source_release(connection, "pt3", "pt3-pmc-test")
        selection_run_id = await ensure_selection_run(connection, s2_release_id, pt3_release_id)
        await seed_pmc_summary_paper_for_connection(
            connection,
            corpus_id=corpus_id,
            pmcid=pmcid,
            selection_run_id=selection_run_id,
            content_status=content_status,
            include_quality_warning=True,
        )
    finally:
        await connection.close()


async def insert_previous_parser_document(
    admin_dsn: str,
    *,
    corpus_id: int,
    pmcid: str,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        await connection.execute(
            """
            INSERT INTO solemd.pmc_fulltext_documents (
                corpus_id,
                pmcid,
                source_provider,
                source_url,
                source_checksum,
                parser_name,
                parser_version,
                status,
                is_current
            )
            VALUES (
                $1,
                $2,
                'pmc_bioc',
                'https://example.test/bioc/old',
                $3,
                $4,
                'bioc-2.1:solemd-pmc-bioc-v1',
                'parsed',
                true
            )
            """,
            corpus_id,
            pmcid,
            hashlib.sha256(RUNTIME_BIOC_XML).hexdigest(),
            PARSER_NAME,
        )
    finally:
        await connection.close()


async def insert_empty_parsed_document(
    connection: asyncpg.Connection,
    *,
    corpus_id: int,
    pmcid: str,
) -> UUID:
    await seed_pmc_summary_paper_for_connection(connection, corpus_id=corpus_id, pmcid=pmcid)
    return await connection.fetchval(
        """
        INSERT INTO solemd.pmc_fulltext_documents (
            corpus_id,
            pmcid,
            source_provider,
            source_url,
            source_checksum,
            parser_name,
            parser_version,
            license,
            status,
            fetched_at,
            parsed_at
        )
        VALUES (
            $1,
            $2,
            'pmc_bioc',
            'https://example.test/empty',
            'empty-checksum',
            $3,
            $4,
            'CC BY',
            'parsed',
            now(),
            now()
        )
        RETURNING pmc_fulltext_document_id
        """,
        corpus_id,
        pmcid,
        PARSER_NAME,
        PARSER_VERSION,
    )


async def insert_invalid_license_parsed_document(
    connection: asyncpg.Connection,
    *,
    corpus_id: int,
    pmcid: str,
) -> UUID:
    await seed_pmc_summary_paper_for_connection(connection, corpus_id=corpus_id, pmcid=pmcid)
    document_id = await connection.fetchval(
        """
        INSERT INTO solemd.pmc_fulltext_documents (
            corpus_id,
            pmcid,
            source_provider,
            source_url,
            source_checksum,
            parser_name,
            parser_version,
            license,
            status,
            fetched_at,
            parsed_at
        )
        VALUES (
            $1,
            $2,
            'pmc_bioc',
            'https://example.test/invalid-license',
            'invalid-license-checksum',
            $3,
            $4,
            'none',
            'parsed',
            now(),
            now()
        )
        RETURNING pmc_fulltext_document_id
        """,
        corpus_id,
        pmcid,
        PARSER_NAME,
        PARSER_VERSION,
    )
    await connection.execute(
        """
        INSERT INTO solemd.pmc_fulltext_passages (
            pmc_fulltext_document_id,
            corpus_id,
            pmcid,
            section_ordinal,
            section_ordinal_path,
            passage_ordinal,
            passage_role,
            text,
            char_count,
            token_estimate,
            text_checksum,
            is_retrievable,
            parser_name,
            parser_version
        )
        VALUES (
            $1,
            $2,
            $3,
            0,
            '0001',
            0,
            'body',
            'Body passage should not promote without reusable license provenance.',
            68,
            12,
            'invalid-license-passage-checksum',
            true,
            $4,
            $5
        )
        """,
        document_id,
        corpus_id,
        pmcid,
        PARSER_NAME,
        PARSER_VERSION,
    )
    return document_id


async def ensure_source_release(
    connection: asyncpg.Connection,
    source_name: str,
    release_key: str,
) -> int:
    return int(
        await connection.fetchval(
            """
            INSERT INTO solemd.source_releases (source_name, source_release_key, release_status)
            VALUES ($1, $2, 'loaded')
            ON CONFLICT (source_name, source_release_key)
            DO UPDATE SET release_status = EXCLUDED.release_status
            RETURNING source_release_id
            """,
            source_name,
            release_key,
        )
    )


async def ensure_selection_run(
    connection: asyncpg.Connection,
    s2_release_id: int,
    pt3_release_id: int,
) -> UUID:
    row = await connection.fetchval(
        """
        SELECT corpus_selection_run_id
        FROM solemd.corpus_selection_runs
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND selector_version = 'test-selector'
        LIMIT 1
        """,
        s2_release_id,
        pt3_release_id,
    )
    if row is not None:
        return row
    return await connection.fetchval(
        """
        INSERT INTO solemd.corpus_selection_runs (
            s2_source_release_id,
            pt3_source_release_id,
            selector_version,
            status,
            plan_checksum,
            plan_manifest
        )
        VALUES ($1, $2, 'test-selector', 7, 'test-plan', '{}'::jsonb)
        RETURNING corpus_selection_run_id
        """,
        s2_release_id,
        pt3_release_id,
    )


async def seed_pmc_summary_paper_for_connection(
    connection: asyncpg.Connection,
    *,
    corpus_id: int,
    pmcid: str,
    selection_run_id: UUID | None = None,
    content_status: str = "metadata_only",
    include_quality_warning: bool = False,
) -> None:
    if selection_run_id is None:
        s2_release_id = await ensure_source_release(connection, "s2", "s2-pmc-test")
        pt3_release_id = await ensure_source_release(connection, "pt3", "pt3-pmc-test")
        selection_run_id = await ensure_selection_run(connection, s2_release_id, pt3_release_id)
    await connection.execute(
        """
        INSERT INTO solemd.corpus (corpus_id, admission_reason, domain_status)
        VALUES ($1, 'pmc-test', 'mapped')
        ON CONFLICT (corpus_id) DO NOTHING
        """,
        corpus_id,
    )
    await connection.execute(
        """
        INSERT INTO solemd.papers (corpus_id, pmid, pmc_id, s2_paper_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (corpus_id) DO UPDATE
        SET pmc_id = EXCLUDED.pmc_id,
            updated_at = now()
        """,
        corpus_id,
        corpus_id + 1000,
        pmcid,
        f"S2-{corpus_id}",
    )
    await connection.execute(
        """
        INSERT INTO solemd.paper_text (corpus_id, text_availability, title)
        VALUES ($1, 0, $2)
        ON CONFLICT (corpus_id) DO NOTHING
        """,
        corpus_id,
        f"PMC test paper {corpus_id}",
    )
    quality_warnings = '{"title_only": true}' if include_quality_warning else "{}"
    await connection.execute(
        """
        INSERT INTO solemd.paper_selection_summary (
            corpus_id,
            corpus_selection_run_id,
            selector_version,
            current_status,
            has_pmc_id,
            has_locator_candidate,
            rag_candidate,
            rag_eligible,
            content_status,
            quality_warnings,
            evidence_priority_score
        )
        VALUES (
            $1,
            $2,
            'test-selector',
            'mapped',
            true,
            true,
            true,
            false,
            $3,
            $4::jsonb,
            100
        )
        ON CONFLICT (corpus_id) DO UPDATE
        SET content_status = EXCLUDED.content_status,
            rag_eligible = false,
            has_pmc_id = true,
            has_locator_candidate = true,
            quality_warnings = EXCLUDED.quality_warnings
        """,
        corpus_id,
        selection_run_id,
        content_status,
        quality_warnings,
    )
