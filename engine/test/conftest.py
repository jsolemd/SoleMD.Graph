"""Shared test fixtures for engine tests."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def mock_conn():
    """Factory fixture for mock psycopg connection with cursor context manager.

    Usage:
        conn = mock_conn()                              # empty fetchall
        conn = mock_conn(rows=[{"corpus_id": 1}])       # pre-set fetchall
    """

    def _factory(rows: list[dict] | None = None) -> MagicMock:
        conn = MagicMock()
        cur = MagicMock()
        cur.fetchall.return_value = rows or []
        conn.cursor.return_value.__enter__.return_value = cur
        conn.cursor.return_value.__exit__.return_value = False
        return conn

    return _factory


@pytest.fixture
def mock_settings():
    """Mock settings with test defaults."""
    with patch("app.config.settings") as s:
        s.database_url = "postgresql://test:test@localhost:5433/test"
        s.s2_api_key = "test-key"
        s.semantic_scholar_dataset_path.return_value = "/tmp/test"
        yield s
