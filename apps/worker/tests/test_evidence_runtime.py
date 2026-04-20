from __future__ import annotations

from urllib.error import HTTPError
from uuid import UUID

import asyncpg
import pytest

from app.config import settings
from app.db import open_pools
from app.document_schema import DOCUMENT_SOURCE_KIND_PMC_BIOC, TEXT_AVAILABILITY_FULLTEXT
from app.evidence.errors import PaperTextFetchFailed, PaperTextUnavailable
from app.evidence.models import AcquirePaperTextRequest, FetchManifest, PaperMetadata, ResolvedLocator
from app.evidence.ncbi import fetch_pmc_biocxml, resolve_locator
from app.evidence.runtime import (
    PAPER_TEXT_RUN_STATUS_FAILED,
    PAPER_TEXT_RUN_STATUS_PUBLISHED,
    acquire_paper_text,
)
from telemetry_test_support import metric_sample_value


SAMPLE_PMC_BIOC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <source>PMC</source>
  <document>
    <id>PMC6220770</id>
    <passage>
      <infon key="type">front</infon>
      <offset>0</offset>
      <text>Cancer and dementia: Two sides of the same coin?</text>
    </passage>
    <passage>
      <infon key="type">abstract_title_1</infon>
      <infon key="section_type">ABSTRACT</infon>
      <offset>56</offset>
      <text>Abstract</text>
    </passage>
    <passage>
      <infon key="type">abstract</infon>
      <infon key="section_type">ABSTRACT</infon>
      <offset>65</offset>
      <text>Background. Observational data suggest an inverse relation between cancer and dementia.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>152</offset>
      <text>Introduction</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>165</offset>
      <text>Neurodegeneration and malignancy have long been studied together. Shared biology remains debated.</text>
    </passage>
    <passage>
      <infon key="type">table_caption</infon>
      <infon key="section_type">RESULTS</infon>
      <infon key="id">tbl1</infon>
      <offset>270</offset>
      <text>Table 1. Cohort characteristics.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">REF</infon>
      <offset>304</offset>
      <text>References</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">REF</infon>
      <offset>315</offset>
      <text>1. Example reference entry.</text>
    </passage>
  </document>
</collection>
"""


@pytest.mark.asyncio
async def test_evidence_runtime_writes_canonical_pmc_document(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_hot_text_paper(warehouse_dsns["admin"], corpus_id=101, pmid=30112764)

    async def fake_resolve_locators(*_args, **_kwargs) -> tuple[ResolvedLocator, ...]:
        return (
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value="PMC2869000",
                resolver_kind="paper_row_pmcid",
                resolved_pmc_id="PMC2869000",
            ),
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value="PMC6220770",
                resolver_kind="pubmed_esummary_pmid",
                resolved_pmc_id="PMC6220770",
            ),
        )

    attempted: list[str] = []

    def fake_fetch_bytes(url: str, *_args, **_kwargs) -> bytes:
        if "PMC2869000" in url:
            attempted.append("PMC2869000")
            raise HTTPError(url, 404, "not found", hdrs=None, fp=None)
        if "PMC6220770" in url:
            attempted.append("PMC6220770")
            return SAMPLE_PMC_BIOC_XML
        raise AssertionError(f"unexpected fetch url: {url}")

    monkeypatch.setattr("app.evidence.runtime.resolve_locators", fake_resolve_locators)
    monkeypatch.setattr("app.evidence.ncbi._fetch_bytes", fake_fetch_bytes)

    request = AcquirePaperTextRequest(
        corpus_id=101,
        force_refresh=False,
        requested_by="tester",
    )

    before_published = metric_sample_value(
        "paper_text_acquisitions_total",
        {
            "outcome": "published",
            "locator_kind": "pmcid",
            "resolver_kind": "pubmed_esummary_pmid",
        },
    )
    before_duration_count = metric_sample_value(
        "paper_text_acquisition_duration_seconds_count",
        {
            "outcome": "published",
            "locator_kind": "pmcid",
            "resolver_kind": "pubmed_esummary_pmid",
        },
    )
    before_sections = metric_sample_value(
        "paper_text_document_rows_total",
        {"structure_kind": "sections"},
    )
    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        run_id = await acquire_paper_text(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    assert metric_sample_value(
        "paper_text_acquisitions_total",
        {
            "outcome": "published",
            "locator_kind": "pmcid",
            "resolver_kind": "pubmed_esummary_pmid",
        },
    ) == before_published + 1
    assert metric_sample_value(
        "paper_text_acquisition_duration_seconds_count",
        {
            "outcome": "published",
            "locator_kind": "pmcid",
            "resolver_kind": "pubmed_esummary_pmid",
        },
    ) == before_duration_count + 1
    assert metric_sample_value(
        "paper_text_document_rows_total",
        {"structure_kind": "sections"},
    ) > before_sections

    assert attempted == ["PMC2869000", "PMC6220770"]

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        run_row = await admin_connection.fetchrow(
            """
            SELECT status, locator_kind, resolved_pmc_id, resolver_kind, manifest_uri
            FROM solemd.paper_text_acquisition_runs
            WHERE paper_text_run_id = $1::uuid
            """,
            run_id,
        )
        assert run_row is not None
        assert run_row["status"] == PAPER_TEXT_RUN_STATUS_PUBLISHED
        assert run_row["locator_kind"] == "pmcid"
        assert run_row["resolved_pmc_id"] == "PMC6220770"
        assert run_row["resolver_kind"] == "pubmed_esummary_pmid"
        assert "PMC6220770/unicode" in run_row["manifest_uri"]

        paper_row = await admin_connection.fetchrow(
            """
            SELECT pmc_id FROM solemd.papers WHERE corpus_id = 101
            """
        )
        assert paper_row is not None
        assert paper_row["pmc_id"] == "PMC6220770"

        text_row = await admin_connection.fetchrow(
            """
            SELECT text_availability FROM solemd.paper_text WHERE corpus_id = 101
            """
        )
        assert text_row is not None
        assert text_row["text_availability"] == TEXT_AVAILABILITY_FULLTEXT

        document_row = await admin_connection.fetchrow(
            """
            SELECT document_source_kind, source_revision
            FROM solemd.paper_documents
            WHERE corpus_id = 101
            """
        )
        assert document_row is not None
        assert document_row["document_source_kind"] == DOCUMENT_SOURCE_KIND_PMC_BIOC
        assert document_row["source_revision"] == "PMC6220770"

        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.paper_sections WHERE corpus_id = 101"
        ) >= 3
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.paper_blocks WHERE corpus_id = 101"
        ) == 4
        assert await admin_connection.fetchval(
            "SELECT count(*) FROM solemd.paper_sentences WHERE corpus_id = 101"
        ) >= 4

        reference_row = await admin_connection.fetchrow(
            """
            SELECT is_retrieval_default
            FROM solemd.paper_blocks
            WHERE corpus_id = 101
              AND text = '1. Example reference entry.'
            """
        )
        assert reference_row is not None
        assert reference_row["is_retrieval_default"] is False
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_evidence_runtime_fails_loudly_on_upstream_fetch_error(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_hot_text_paper(warehouse_dsns["admin"], corpus_id=404, pmid=30112764, pmc_id="PMC2869000")

    async def fake_resolve_locators(*_args, **_kwargs) -> tuple[ResolvedLocator, ...]:
        return (
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value="PMC2869000",
                resolver_kind="paper_row_pmcid",
                resolved_pmc_id="PMC2869000",
            ),
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value="PMC6220770",
                resolver_kind="pubmed_esummary_pmid",
                resolved_pmc_id="PMC6220770",
            ),
        )

    attempted: list[str] = []

    def fake_fetch_bytes(url: str, *_args, **_kwargs) -> bytes:
        if "PMC2869000" in url:
            attempted.append("PMC2869000")
            raise HTTPError(url, 503, "service unavailable", hdrs=None, fp=None)
        if "PMC6220770" in url:
            attempted.append("PMC6220770")
            return SAMPLE_PMC_BIOC_XML
        raise AssertionError(f"unexpected fetch url: {url}")

    monkeypatch.setattr("app.evidence.runtime.resolve_locators", fake_resolve_locators)
    monkeypatch.setattr("app.evidence.ncbi._fetch_bytes", fake_fetch_bytes)

    request = AcquirePaperTextRequest(
        corpus_id=404,
        force_refresh=False,
        requested_by="tester",
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(PaperTextFetchFailed, match="HTTP 503"):
            await acquire_paper_text(
                request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()

    assert attempted == ["PMC2869000"]

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        run_row = await admin_connection.fetchrow(
            """
            SELECT status, locator_kind, locator_value, resolver_kind, resolved_pmc_id, error_message
            FROM solemd.paper_text_acquisition_runs
            WHERE corpus_id = 404
            ORDER BY started_at DESC
            LIMIT 1
            """
        )
        assert run_row is not None
        assert run_row["status"] == PAPER_TEXT_RUN_STATUS_FAILED
        assert run_row["locator_kind"] == "pmcid"
        assert run_row["locator_value"] == "PMC2869000"
        assert run_row["resolver_kind"] == "paper_row_pmcid"
        assert run_row["resolved_pmc_id"] == "PMC2869000"
        assert "HTTP 503" in run_row["error_message"]
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_evidence_runtime_is_deterministic_without_force_refresh(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_hot_text_paper(
        warehouse_dsns["admin"],
        corpus_id=202,
        pmid=30112764,
        pmc_id="PMC6220770",
    )

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        existing_run_id = await admin_connection.fetchval(
            """
            INSERT INTO solemd.paper_text_acquisition_runs (
                advisory_lock_key,
                corpus_id,
                requested_by,
                status,
                locator_kind,
                locator_value,
                resolved_pmc_id,
                resolver_kind,
                manifest_uri,
                response_checksum,
                completed_at
            )
            VALUES (
                1,
                202,
                'tester',
                2,
                'pmcid',
                'PMC6220770',
                'PMC6220770',
                'paper_row_pmcid',
                'https://example.test/pmc/PMC6220770',
                'checksum-1',
                now()
            )
            RETURNING paper_text_run_id
            """
        )
        await admin_connection.execute(
            """
            INSERT INTO solemd.paper_documents (
                corpus_id,
                document_source_kind,
                source_priority,
                source_revision,
                text_hash,
                is_active
            )
            VALUES ($1, $2, 5, 'PMC6220770', decode('00112233445566778899aabbccddeeff', 'hex'), true)
            """,
            202,
            DOCUMENT_SOURCE_KIND_PMC_BIOC,
        )
    finally:
        await admin_connection.close()

    request = AcquirePaperTextRequest(
        corpus_id=202,
        force_refresh=False,
        requested_by="tester",
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        run_id = await acquire_paper_text(
            request,
            ingest_pool=pools.get("ingest_write"),
            runtime_settings=runtime_settings,
        )
    finally:
        await pools.close()

    assert UUID(run_id) == existing_run_id

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        assert (
            await admin_connection.fetchval(
                "SELECT count(*) FROM solemd.paper_text_acquisition_runs WHERE corpus_id = 202"
            )
            == 1
        )
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_evidence_runtime_records_failed_locator_on_unavailable(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
    monkeypatch,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_hot_text_paper(warehouse_dsns["admin"], corpus_id=303, pmid=20466091, pmc_id="PMC2869000")

    async def fake_resolve_locators(*_args, **_kwargs) -> tuple[ResolvedLocator, ...]:
        return (
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value="PMC2869000",
                resolver_kind="paper_row_pmcid",
                resolved_pmc_id="PMC2869000",
            ),
            ResolvedLocator(
                locator_kind="pmid",
                locator_value="20466091",
                resolver_kind="pmid_direct",
            ),
        )

    async def fake_fetch(_runtime_settings, locator: ResolvedLocator) -> tuple[bytes, FetchManifest]:
        raise PaperTextUnavailable(f"PMC BioC returned a non-XML payload for {locator.locator_kind}:{locator.locator_value}")

    monkeypatch.setattr("app.evidence.runtime.resolve_locators", fake_resolve_locators)
    monkeypatch.setattr("app.evidence.runtime.fetch_pmc_biocxml", fake_fetch)

    request = AcquirePaperTextRequest(
        corpus_id=303,
        force_refresh=False,
        requested_by="tester",
    )

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        with pytest.raises(PaperTextUnavailable):
            await acquire_paper_text(
                request,
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
    finally:
        await pools.close()

    admin_connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        run_row = await admin_connection.fetchrow(
            """
            SELECT status, locator_kind, locator_value, resolver_kind, resolved_pmc_id
            FROM solemd.paper_text_acquisition_runs
            WHERE corpus_id = 303
            ORDER BY started_at DESC
            LIMIT 1
            """
        )
        assert run_row is not None
        assert run_row["status"] == 3
        assert run_row["locator_kind"] == "pmid"
        assert run_row["locator_value"] == "20466091"
        assert run_row["resolver_kind"] == "pmid_direct"
        assert run_row["resolved_pmc_id"] is None
    finally:
        await admin_connection.close()


@pytest.mark.asyncio
async def test_resolve_locator_uses_pubmed_summary_when_id_converter_misses(monkeypatch) -> None:
    async def fake_id_converter(*_args, **_kwargs) -> str | None:
        return None

    async def fake_pubmed_summary(*_args, **_kwargs) -> str | None:
        return "PMC6220770"

    monkeypatch.setattr("app.evidence.ncbi._resolve_via_id_converter", fake_id_converter)
    monkeypatch.setattr("app.evidence.ncbi._resolve_via_pubmed_summary", fake_pubmed_summary)

    locator = await resolve_locator(
        settings,
        PaperMetadata(
            corpus_id=1,
            pmid=30112764,
            pmc_id=None,
            doi_norm="10.1111/eci.13019",
            title="Cancer and dementia: Two sides of the same coin?",
        ),
    )

    assert locator.locator_kind == "pmcid"
    assert locator.locator_value == "PMC6220770"
    assert locator.resolver_kind == "pubmed_esummary_pmid"


@pytest.mark.asyncio
async def test_fetch_pmc_biocxml_treats_explicit_no_result_payload_as_unavailable(monkeypatch) -> None:
    def fake_fetch_bytes(*_args, **_kwargs) -> bytes:
        return b"No result can be found for the given identifier."

    monkeypatch.setattr("app.evidence.ncbi._fetch_bytes", fake_fetch_bytes)

    locator = ResolvedLocator(
        locator_kind="pmid",
        locator_value="20466091",
        resolver_kind="pmid_direct",
    )

    with pytest.raises(PaperTextUnavailable, match="reported no result"):
        await fetch_pmc_biocxml(settings, locator)


async def _seed_hot_text_paper(
    admin_dsn: str,
    *,
    corpus_id: int,
    pmid: int,
    pmc_id: str | None = None,
) -> None:
    connection = await asyncpg.connect(admin_dsn)
    try:
        await connection.execute(
            """
            INSERT INTO solemd.corpus (corpus_id, admission_reason, domain_status)
            VALUES ($1, 'test-seed', 'mapped')
            """,
            corpus_id,
        )
        await connection.execute(
            """
            INSERT INTO solemd.papers (corpus_id, pmid, pmc_id, doi_norm, s2_paper_id)
            VALUES ($1, $2, $3, '10.1111/eci.13019', '52013067')
            """,
            corpus_id,
            pmid,
            pmc_id,
        )
        await connection.execute(
            """
            INSERT INTO solemd.paper_text (corpus_id, text_availability, title, abstract)
            VALUES (
                $1,
                1,
                'Cancer and dementia: Two sides of the same coin?',
                'Observational data suggest an inverse relation between cancer and dementia.'
            )
            """,
            corpus_id,
        )
    finally:
        await connection.close()
