"""Tests for app.corpus.enrich enrichment tracking behavior."""

from __future__ import annotations

from app.corpus.enrich import _format_embedding, _get_unenriched_ids, _text_array


class TestGetUnenrichedIds:
    def test_full_mode_uses_full_check_sentinel(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 1}, {"corpus_id": 2}])

        result = _get_unenriched_ids(conn, embedding_only=False)

        assert result == [1, 2]
        query = conn.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
        assert "p.s2_full_checked_at IS NULL" in query
        assert "p.abstract IS NULL" not in query

    def test_embedding_mode_uses_embedding_check_sentinel(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 5}])

        result = _get_unenriched_ids(conn, embedding_only=True)

        assert result == [5]
        query = conn.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
        assert "p.embedding IS NULL" in query
        assert "p.s2_embedding_checked_at IS NULL" in query
        assert "p.s2_found IS DISTINCT FROM false" in query

    def test_full_mode_can_use_release_id(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 9}])

        result = _get_unenriched_ids(conn, embedding_only=False, release_id="s2-2026-03")

        assert result == [9]
        execute = conn.cursor.return_value.__enter__.return_value.execute
        query = execute.call_args.args[0]
        params = execute.call_args.args[1]
        assert "p.s2_full_release_id IS DISTINCT FROM %s" in query
        assert params == ("s2-2026-03",)

    def test_embedding_mode_can_use_release_id(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 10}])

        result = _get_unenriched_ids(conn, embedding_only=True, release_id="s2-2026-03")

        assert result == [10]
        execute = conn.cursor.return_value.__enter__.return_value.execute
        query = execute.call_args.args[0]
        params = execute.call_args.args[1]
        assert "p.s2_embedding_release_id IS DISTINCT FROM %s" in query
        assert "p.embedding IS NULL" not in query
        assert params == ("s2-2026-03",)


class TestFormatEmbedding:
    def test_formats_vector_for_pgvector(self):
        assert _format_embedding([0.1, 0.2, 0.3]) == "[0.1,0.2,0.3]"

    def test_single_element(self):
        assert _format_embedding([1.0]) == "[1.0]"

    def test_empty_vector(self):
        assert _format_embedding([]) == "[]"


class TestTextArray:
    def test_filters_falsy_values(self):
        assert _text_array(["a", "", "b", None]) == ["a", "b"]

    def test_none_input(self):
        assert _text_array(None) == []

    def test_empty_input(self):
        assert _text_array([]) == []
