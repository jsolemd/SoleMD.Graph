from __future__ import annotations

import json
from uuid import UUID

import asyncpg
import pytest

from app.corpus.models import (
    StartCorpusQualityAuditRequest,
    StartCorpusSelectionRequest,
)
from app.corpus.quality_audit import run_corpus_quality_audit
from app.corpus.runtime import run_corpus_selection
from app.db import open_pools
from corpus_test_support import seed_selection_fixture as _seed_selection_fixture


@pytest.mark.asyncio
async def test_corpus_quality_audit_snapshots_summary_quality(
    warehouse_dsns: dict[str, str],
    runtime_settings_factory,
) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    await _seed_selection_fixture(warehouse_dsns["admin"])

    pools = await open_pools(runtime_settings, names=("ingest_write",))
    try:
        selection_run_id = UUID(
            await run_corpus_selection(
                StartCorpusSelectionRequest(
                    s2_release_tag="s2-2026-04-01",
                    pt3_release_tag="pt3-2026-04-01",
                    selector_version="selector-v1-quality-audit",
                    requested_by="tester",
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
        audit_run_id = UUID(
            await run_corpus_quality_audit(
                StartCorpusQualityAuditRequest(
                    corpus_selection_run_id=selection_run_id,
                    requested_by="tester",
                    sample_size=3,
                ),
                ingest_pool=pools.get("ingest_write"),
                runtime_settings=runtime_settings,
            )
        )
    finally:
        await pools.close()

    connection = await asyncpg.connect(warehouse_dsns["admin"])
    try:
        row = await connection.fetchrow(
            """
            SELECT
                status,
                summary_row_count,
                mapped_row_count,
                rag_eligible_row_count,
                distributions,
                relation_diagnostic,
                top_signals,
                samples,
                findings
            FROM solemd.corpus_quality_audit_runs
            WHERE corpus_quality_audit_run_id = $1
            """,
            audit_run_id,
        )
    finally:
        await connection.close()

    assert row is not None
    assert row["status"] == "complete"
    assert row["summary_row_count"] == 7
    assert row["mapped_row_count"] > 0
    assert row["rag_eligible_row_count"] > 0

    distributions = _jsonb_value(row["distributions"])
    relation_diagnostic = _jsonb_value(row["relation_diagnostic"])
    top_signals = _jsonb_value(row["top_signals"])
    samples = _jsonb_value(row["samples"])
    findings = _jsonb_value(row["findings"])

    assert distributions["status"]
    assert distributions["mapped_relevance_content"]
    assert "evidence_publication_types" in distributions
    assert distributions["entity_signal_coverage"]
    assert "metadata_only_profile" in distributions
    assert "metadata_only_publication_types" in distributions
    assert relation_diagnostic["summary"]["mapped_relation_match_rows"] >= 1
    assert relation_diagnostic["signals"]
    assert top_signals["venues"]
    assert top_signals["topic_tracks"]
    assert samples["rag_ready_high_confidence"]
    assert samples["relation_driven"]
    assert "metadata_only_venue_only_no_entity" in samples
    assert isinstance(findings, list)


def _jsonb_value(value):
    if isinstance(value, str):
        return json.loads(value)
    return value
