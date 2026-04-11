from __future__ import annotations

from app.entities.highlight_policy import (
    HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT,
    HIGHLIGHT_MODE_EXACT,
)
from app.entities.repository import EntityCatalogRepository


def test_fetch_alias_matches_uses_highlight_mode_policy(monkeypatch):
    executed: dict[str, object] = {}

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, query, params):
            executed["query"] = query
            executed["params"] = params

        def fetchall(self):
            return []

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return FakeCursor()

    monkeypatch.setattr("app.entities.repository.db.pooled", lambda: FakeConnection())

    repository = EntityCatalogRepository()
    repository.fetch_alias_matches(alias_keys=["and", "schizophrenia"], entity_types=[])

    assert "highlight_mode = ANY" in str(executed["query"])
    assert "ea.is_canonical = true" not in str(executed["query"])
    assert executed["params"] == [
        ["and", "schizophrenia"],
        [HIGHLIGHT_MODE_EXACT, HIGHLIGHT_MODE_CASE_SENSITIVE_EXACT],
    ]
