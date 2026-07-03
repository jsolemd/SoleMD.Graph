from __future__ import annotations

import json

import asyncpg
import pytest

from app.db import open_pools
from app.pmc_fulltext.models import PmcFullTextRunRequest
from app.pmc_fulltext.parse_bioc import PARSER_VERSION
from app.pmc_fulltext.promote import promote_pmc_fulltext_document
from app.pmc_fulltext.runtime import run_pmc_fulltext
from tests.pmc_fulltext_runtime_fixtures import (
    FakeAvailabilityResolver,
    FakePayloadFetcher,
    insert_empty_parsed_document,
    insert_invalid_license_parsed_document,
    insert_previous_parser_document,
    seed_pmc_summary_paper,
)


@pytest.mark.asyncio
async def test_pmc_fulltext_run_materializes_promotes_and_is_idempotent(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await seed_pmc_summary_paper(
        warehouse_dsns["admin"],
        corpus_id=101,
        pmcid="PMC900001",
        content_status="metadata_only",
    )
    await insert_previous_parser_document(
        warehouse_dsns["admin"],
        corpus_id=101,
        pmcid="PMC900001",
    )
    await seed_pmc_summary_paper(
        warehouse_dsns["admin"],
        corpus_id=202,
        pmcid="PMC900404",
        content_status="metadata_only",
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        summary = await run_pmc_fulltext(
            PmcFullTextRunRequest(
                selector_version="metadata-only-pmcid",
                limit=10,
                requested_by="tester",
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
            availability_resolver=FakeAvailabilityResolver(),
            payload_fetcher=FakePayloadFetcher(),
        )
    finally:
        await pools.close()

    assert summary.candidate_count == 2
    assert summary.parsed_count == 1
    assert summary.promoted_count == 1
    assert summary.unavailable_count == 1

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        parsed_document_id, passage_count = await _assert_initial_run_state(admin_connection)
    finally:
        await admin_connection.close()

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        rerun_summary = await run_pmc_fulltext(
            PmcFullTextRunRequest(
                selector_version="mapped-pmcid",
                limit=10,
                requested_by="tester",
            ),
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
            availability_resolver=FakeAvailabilityResolver(),
            payload_fetcher=FakePayloadFetcher(),
        )
    finally:
        await pools.close()

    assert rerun_summary.skipped_count == 1
    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        await _assert_rerun_state(admin_connection, parsed_document_id, passage_count)
        await _assert_promotion_refusals(admin_connection)
    finally:
        await admin_connection.close()


async def _assert_initial_run_state(admin_connection: asyncpg.Connection) -> tuple[str, int]:
    promoted = await admin_connection.fetchrow(
        """
        SELECT content_status, rag_eligible, quality_warnings, pmc_fulltext_passage_count
        FROM solemd.paper_selection_summary
        WHERE corpus_id = 101
        """
    )
    assert promoted is not None
    assert promoted["content_status"] == "fulltext_ready"
    assert promoted["rag_eligible"] is True
    warnings = (
        json.loads(promoted["quality_warnings"])
        if isinstance(promoted["quality_warnings"], str)
        else dict(promoted["quality_warnings"])
    )
    assert "title_only" not in warnings
    assert promoted["pmc_fulltext_passage_count"] == 2

    unavailable = await admin_connection.fetchrow(
        """
        SELECT content_status, rag_eligible
        FROM solemd.paper_selection_summary
        WHERE corpus_id = 202
        """
    )
    assert unavailable is not None
    assert unavailable["content_status"] == "metadata_only"
    assert unavailable["rag_eligible"] is False

    document_rows = await admin_connection.fetch(
        """
        SELECT pmcid, status, source_provider, license
        FROM solemd.pmc_fulltext_documents
        WHERE parser_version = $1
        ORDER BY pmcid, status
        """,
        PARSER_VERSION,
    )
    assert [(row["pmcid"], row["status"], row["source_provider"]) for row in document_rows] == [
        ("PMC900001", "parsed", "pmc_bioc"),
        ("PMC900404", "unavailable", "pmc_oa"),
    ]
    assert document_rows[0]["license"] == "CC BY"
    old_current = await admin_connection.fetchval(
        """
        SELECT is_current
        FROM solemd.pmc_fulltext_documents
        WHERE pmcid = 'PMC900001'
          AND parser_version = 'bioc-2.1:solemd-pmc-bioc-v1'
        """
    )
    assert old_current is False

    parsed_document_id = await admin_connection.fetchval(
        """
        SELECT pmc_fulltext_document_id
        FROM solemd.pmc_fulltext_documents
        WHERE pmcid = 'PMC900001'
          AND parser_version = $1
        """,
        PARSER_VERSION,
    )
    passage_count = await admin_connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.pmc_fulltext_passages
        WHERE pmc_fulltext_document_id = $1
        """,
        parsed_document_id,
    )
    assert passage_count == 2
    section_rows = await admin_connection.fetch(
        """
        SELECT
            title,
            section_type,
            section_role,
            section_role_codes,
            section_role_confidence,
            section_role_source
        FROM solemd.pmc_fulltext_sections
        WHERE pmc_fulltext_document_id = $1
        ORDER BY section_ordinal
        """,
        parsed_document_id,
    )
    assert [
        (
            row["title"],
            row["section_type"],
            row["section_role"],
            tuple(row["section_role_codes"]),
            row["section_role_source"],
        )
        for row in section_rows
    ] == [
        ("Abstract", "ABSTRACT", "abstract", ("abstract",), "section_type_and_title"),
        ("Introduction", "INTRO", "introduction", ("introduction",), "section_type_and_title"),
    ]
    assert all(float(row["section_role_confidence"]) > 0.8 for row in section_rows)
    return parsed_document_id, int(passage_count)


async def _assert_rerun_state(
    admin_connection: asyncpg.Connection,
    parsed_document_id: str,
    passage_count: int,
) -> None:
    assert await admin_connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.pmc_fulltext_documents
        WHERE pmcid = 'PMC900001'
          AND parser_version = $1
        """,
        PARSER_VERSION,
    ) == 1
    assert await admin_connection.fetchval(
        "SELECT count(*) FROM solemd.pmc_fulltext_passages WHERE pmc_fulltext_document_id = $1",
        parsed_document_id,
    ) == passage_count


async def _assert_promotion_refusals(admin_connection: asyncpg.Connection) -> None:
    empty_document_id = await insert_empty_parsed_document(
        admin_connection,
        corpus_id=303,
        pmcid="PMC900303",
    )
    result = await promote_pmc_fulltext_document(
        admin_connection,
        document_id=empty_document_id,
    )
    assert result.applied is False
    assert await _content_status(admin_connection, corpus_id=303) == "metadata_only"

    invalid_license_document_id = await insert_invalid_license_parsed_document(
        admin_connection,
        corpus_id=404,
        pmcid="PMC900405",
    )
    result = await promote_pmc_fulltext_document(
        admin_connection,
        document_id=invalid_license_document_id,
    )
    assert result.applied is False
    assert await _content_status(admin_connection, corpus_id=404) == "metadata_only"


async def _content_status(admin_connection: asyncpg.Connection, *, corpus_id: int) -> str:
    return await admin_connection.fetchval(
        """
        SELECT content_status
        FROM solemd.paper_selection_summary
        WHERE corpus_id = $1
        """,
        corpus_id,
    )
