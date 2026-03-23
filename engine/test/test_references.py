"""Tests for release-aware S2 reference sync behavior."""

from __future__ import annotations

from app.corpus.references import (
    _collect_valid_domain_corpus_ids,
    _extract_external_id,
    _get_unchecked_reference_ids,
    _mark_reference_not_found,
    _replace_references,
    _rebuild_citations,
)


class TestGetUncheckedReferenceIds:
    def test_default_mode_uses_reference_check_sentinel(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 1}, {"corpus_id": 2}])

        result = _get_unchecked_reference_ids(conn)

        assert result == [1, 2]
        query = conn.cursor.return_value.__enter__.return_value.execute.call_args.args[0]
        assert "p.s2_references_checked_at IS NULL" in query
        assert "p.s2_found IS DISTINCT FROM false" in query

    def test_release_mode_uses_reference_release_id(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 5}])

        result = _get_unchecked_reference_ids(conn, release_id="s2-2026-03")

        assert result == [5]
        execute = conn.cursor.return_value.__enter__.return_value.execute
        query = execute.call_args.args[0]
        params = execute.call_args.args[1]
        assert "p.s2_references_release_id IS DISTINCT FROM %s" in query
        assert params == ("s2-2026-03",)


class TestReferenceHelpers:
    def test_extract_external_id_is_case_insensitive(self):
        external_ids = {"DOI": "10.1/test", "PmId": "12345"}

        assert _extract_external_id(external_ids, "doi") == "10.1/test"
        assert _extract_external_id(external_ids, "pmid") == "12345"

    def test_collect_valid_domain_corpus_ids_filters_to_local_domain(self, mock_conn):
        conn = mock_conn(rows=[{"corpus_id": 100}, {"corpus_id": 200}])
        results = [
            {
                "references": [
                    {"corpusId": 100},
                    {"corpusId": 200},
                    {"corpusId": 300},
                    {"corpusId": None},
                ]
            }
        ]

        valid = _collect_valid_domain_corpus_ids(conn, results)

        assert valid == {100, 200}


class TestReferencePersistence:
    def test_replace_references_marks_checked_and_inserts_rows(self, mock_conn):
        conn = mock_conn()
        result = {
            "references": [
                {
                    "paperId": "S2:abc",
                    "corpusId": 42,
                    "title": "Ref one",
                    "year": 2020,
                    "externalIds": {"DOI": "10.1/ref1"},
                },
                {
                    "paperId": "S2:def",
                    "corpusId": 999999,
                    "title": "Ref two",
                    "year": 2021,
                    "externalIds": {"PMID": "123"},
                },
            ]
        }

        inserted = _replace_references(
            conn,
            7,
            result,
            valid_domain_corpus_ids={42},
            release_id="s2-2026-03",
        )

        assert inserted == 2
        execute_calls = conn.cursor.return_value.__enter__.return_value.execute.call_args_list
        insert_query = execute_calls[1].args[0]
        assert "INSERT INTO solemd.paper_references" in insert_query
        second_insert_params = execute_calls[2].args[1]
        assert second_insert_params[3] is None
        update_query = execute_calls[-1].args[0]
        assert "s2_references_checked_at = now()" in update_query
        assert "s2_found = true" in update_query

    def test_mark_reference_not_found_marks_checked_without_overwriting_true(self, mock_conn):
        conn = mock_conn()

        _mark_reference_not_found(conn, 9, release_id="s2-2026-03")

        query = conn.cursor.return_value.__enter__.return_value.execute.call_args_list[-1].args[0]
        assert "s2_references_checked_at = now()" in query
        assert "s2_found = COALESCE(s2_found, false)" in query

    def test_rebuild_citations_replaces_edges_for_batch(self, mock_conn):
        conn = mock_conn()
        cur = conn.cursor.return_value.__enter__.return_value
        cur.rowcount = 3

        count = _rebuild_citations(conn, [1, 2, 3], release_id="s2-2026-03")

        assert count == 3
        calls = cur.execute.call_args_list
        assert "DELETE FROM solemd.citations" in calls[0].args[0]
        assert "INSERT INTO solemd.citations" in calls[1].args[0]
