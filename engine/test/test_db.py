from __future__ import annotations

import sys
from types import SimpleNamespace

from psycopg.rows import dict_row

from app import db


def test_get_pool_opens_explicitly_and_caches(monkeypatch):
    created: list[dict] = []

    class FakeConnectionPool:
        def __init__(self, **kwargs):
            created.append(kwargs)

        def close(self):
            return None

    monkeypatch.setitem(
        sys.modules,
        "psycopg_pool",
        SimpleNamespace(ConnectionPool=FakeConnectionPool),
    )
    monkeypatch.setattr(db.settings, "database_url", "postgresql://example")
    monkeypatch.setattr(db, "_pool", None)

    pool = db.get_pool(min_size=2, max_size=7)
    assert isinstance(pool, FakeConnectionPool)
    assert created == [
        {
            "conninfo": "postgresql://example",
            "min_size": 2,
            "max_size": 7,
            "open": True,
            "kwargs": {"row_factory": dict_row},
        }
    ]

    cached = db.get_pool(min_size=9, max_size=9)
    assert cached is pool
    assert len(created) == 1

    db.close_pool()
    assert db._pool is None
