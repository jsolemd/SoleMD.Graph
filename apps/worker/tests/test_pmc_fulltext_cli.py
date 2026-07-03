from __future__ import annotations

import json
from uuid import UUID

import pytest

from app.config import Settings
from app.pmc_fulltext.cli import _json_payload, _run_request
from app.pmc_fulltext.models import PmcFullTextRunRequest, PmcFullTextRunSummary


@pytest.mark.asyncio
async def test_run_request_serializes_slotted_summary(monkeypatch) -> None:
    run_id = UUID("019e14de-f554-7983-b6b5-7b1eeb433f71")
    fake_pools = _FakePools()

    async def fake_open_pools(*args, **kwargs) -> _FakePools:
        assert kwargs["names"] == ("ingest_write",)
        return fake_pools

    async def fake_run_pmc_fulltext(*args, **kwargs) -> PmcFullTextRunSummary:
        assert kwargs["ingest_pool"] == "fake-ingest-pool"
        return PmcFullTextRunSummary(
            run_id=run_id,
            status="complete",
            candidate_count=1,
            unavailable_count=0,
            fetched_count=1,
            parsed_count=1,
            promoted_count=1,
            skipped_count=0,
            failed_count=0,
        )

    monkeypatch.setattr("app.pmc_fulltext.cli.open_pools", fake_open_pools)
    monkeypatch.setattr("app.pmc_fulltext.cli.run_pmc_fulltext", fake_run_pmc_fulltext)

    payload = await _run_request(
        PmcFullTextRunRequest(
            selector_version="metadata-only-pmcid",
            limit=1,
            requested_by="tester",
        ),
        runtime_settings=Settings(
            REDIS_URL="redis://127.0.0.1:57379/0",
            WORKER_METRICS_PORT="",
        ),
    )

    assert payload["run_id"] == run_id
    assert json.loads(_json_payload(payload))["run_id"] == str(run_id)
    assert fake_pools.closed is True


class _FakePools:
    closed = False

    def get(self, name: str) -> str:
        assert name == "ingest_write"
        return "fake-ingest-pool"

    async def close(self) -> None:
        self.closed = True
