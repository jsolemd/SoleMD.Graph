from __future__ import annotations

import pytest

from app.db import ensure_worker_pools_open, set_worker_pools


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
