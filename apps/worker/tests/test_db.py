from __future__ import annotations

import pytest

from app.config import settings as default_settings
from app.db import build_pool_specs, ensure_worker_pools_open, set_worker_pools


@pytest.mark.asyncio
async def test_ensure_worker_pools_open_initializes_once(runtime_settings_factory, warehouse_dsns, monkeypatch) -> None:
    runtime_settings = runtime_settings_factory(ingest_dsn=warehouse_dsns["ingest"])
    calls: list[tuple[str, ...] | None] = []

    class FakePools:
        pools = {"ingest_write": object()}

    async def fake_open_pools(settings, names=None):
        calls.append(names)
        return FakePools()

    monkeypatch.setattr("app.db.open_pools", fake_open_pools)
    set_worker_pools(None)
    try:
        first = await ensure_worker_pools_open(runtime_settings, names=("ingest_write",))
        second = await ensure_worker_pools_open(runtime_settings, names=("ingest_write",))
    finally:
        set_worker_pools(None)

    assert first is second
    assert calls == [("ingest_write",)]


def test_ingest_write_pool_spec_uses_contract_defaults() -> None:
    runtime_settings = default_settings.model_copy(
        update={
            "warehouse_dsn_ingest": "postgresql://engine_ingest_write:engine_ingest_write@localhost:5432/warehouse",
        }
    )
    specs = build_pool_specs(runtime_settings)
    assert "ingest_write" in specs
    spec = specs["ingest_write"]
    assert spec.statement_cache_size == 128
    server_settings = dict(spec.server_settings)
    assert server_settings.get("idle_in_transaction_session_timeout") == "900000"
    assert server_settings.get("tcp_keepalives_idle") == "60"
    assert server_settings.get("tcp_keepalives_interval") == "10"
    assert server_settings.get("tcp_keepalives_count") == "6"
