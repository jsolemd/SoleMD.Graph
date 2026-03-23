"""Tests for app.corpus._etl — shared ETL helpers."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, call, patch

import pytest

from app.corpus._etl import log_etl_run, read_expr


# ── read_expr ──────────────────────────────────────────────────


class TestReadExpr:
    """Tests for the DuckDB read_json expression builder."""

    def test_basic_columns(self):
        result = read_expr("data/file.jsonl.gz", {"id": "BIGINT", "name": "VARCHAR"})
        assert result.startswith("read_json(")
        assert "'data/file.jsonl.gz'" in result
        assert "format='newline_delimited'" in result
        assert "compression='gzip'" in result
        assert "id: 'BIGINT'" in result
        assert "name: 'VARCHAR'" in result

    def test_single_quote_escaping(self):
        """Single quotes in file paths must be escaped to prevent SQL injection."""
        result = read_expr("data/it's a file.jsonl.gz", {"id": "BIGINT"})
        assert "it''s a file" in result
        assert "it's a file" not in result

    def test_double_single_quote_escaping(self):
        result = read_expr("path/with''two.gz", {"x": "INT"})
        # '' becomes '''' (each ' -> '')
        assert "with''''two" in result

    def test_empty_columns(self):
        result = read_expr("file.gz", {})
        assert "columns={}" in result

    def test_multiple_columns_order(self):
        cols = {"corpusid": "BIGINT", "title": "VARCHAR", "year": "INTEGER"}
        result = read_expr("f.gz", cols)
        assert "corpusid: 'BIGINT'" in result
        assert "title: 'VARCHAR'" in result
        assert "year: 'INTEGER'" in result

    def test_glob_pattern_source(self):
        result = read_expr("data/*.jsonl.gz", {"id": "BIGINT"})
        assert "'data/*.jsonl.gz'" in result


# ── log_etl_run ────────────────────────────────────────────────


class TestLogEtlRun:
    """Tests for the load_history INSERT helper."""

    def test_calls_execute_with_correct_sql(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        log_etl_run(
            mock_conn,
            operation="filter_papers",
            source="S2 papers (1 shard)",
            rows_processed=100,
            rows_loaded=50,
            status="completed",
            metadata={"quick": True},
        )

        # Verify execute was called
        mock_cursor.execute.assert_called_once()
        sql, params = mock_cursor.execute.call_args.args
        assert "INSERT INTO solemd.load_history" in sql
        assert params[0] == "filter_papers"
        assert params[1] == "S2 papers (1 shard)"
        assert params[2] == 100
        assert params[3] == 50
        assert params[4] == "completed"
        assert json.loads(params[5]) == {"quick": True}

    def test_commit_called(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        log_etl_run(
            mock_conn,
            operation="test",
            source="test",
            rows_processed=0,
            rows_loaded=0,
            status="completed",
        )

        mock_conn.commit.assert_called_once()

    def test_metadata_defaults_to_empty_dict(self):
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        log_etl_run(
            mock_conn,
            operation="op",
            source="src",
            rows_processed=0,
            rows_loaded=0,
            status="completed",
            metadata=None,
        )

        _, params = mock_cursor.execute.call_args.args
        assert json.loads(params[5]) == {}

    def test_requires_keyword_arguments(self):
        """All parameters after conn must be keyword-only."""
        mock_conn = MagicMock()
        with pytest.raises(TypeError):
            log_etl_run(mock_conn, "op", "src", 0, 0, "completed")
