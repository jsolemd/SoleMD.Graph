"""Unit tests for the graph runtime repository."""

from __future__ import annotations

from unittest.mock import call

from app.graph.repository import (
    CURRENT_GRAPH_RUN_ID_SQL,
    GRAPH_RELEASE_LOOKUP_SQL,
    RESOLVE_PAPER_GRAPH_REFS_SQL,
    SCOPE_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
    SCOPE_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
    SELECTED_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
    SELECTED_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
    PostgresGraphRepository,
)


def test_resolve_graph_release_caches_by_release_key(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {
        "graph_run_id": "run-1",
        "bundle_checksum": "bundle-1",
        "graph_name": "cosmograph",
        "is_current": True,
    }
    repo = PostgresGraphRepository(connect=lambda: conn)

    first = repo.resolve_graph_release("bundle-1")
    second = repo.resolve_graph_release("bundle-1")

    assert first.graph_run_id == "run-1"
    assert second.graph_run_id == "run-1"
    cur.execute.assert_called_once_with(
        GRAPH_RELEASE_LOOKUP_SQL,
        ("bundle-1", "bundle-1", "bundle-1"),
    )


def test_resolve_scope_corpus_ids_maps_graph_lookup_refs(mock_conn):
    conn = mock_conn(rows=[])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchall.side_effect = [[{"corpus_id": 22}], [{"corpus_id": 11}]]
    repo = PostgresGraphRepository(connect=lambda: conn)

    corpus_ids = repo.resolve_scope_corpus_ids(
        graph_run_id="run-1",
        graph_paper_refs=["paper-11", "paper:22", "paper-11"],
    )

    assert corpus_ids == [11, 22]
    assert cur.execute.call_args_list == [
        call(
            SCOPE_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
            ("run-1", [22]),
        ),
        call(
            SCOPE_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
            ("run-1", ["paper-11"]),
        ),
    ]


def test_resolve_selected_corpus_id_prefers_graph_membership_for_corpus_ref(mock_conn):
    conn = mock_conn(rows=[])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"corpus_id": 22}
    repo = PostgresGraphRepository(connect=lambda: conn)

    corpus_id = repo.resolve_selected_corpus_id(
        graph_run_id="run-1",
        selected_graph_paper_ref="paper:22",
        selected_node_id=None,
    )

    assert corpus_id == 22
    cur.execute.assert_called_once_with(
        SELECTED_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
        ([22], "run-1"),
    )


def test_resolve_selected_corpus_id_maps_prefixed_graph_lookup_ref(mock_conn):
    conn = mock_conn(rows=[])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"corpus_id": 11}
    repo = PostgresGraphRepository(connect=lambda: conn)

    corpus_id = repo.resolve_selected_corpus_id(
        graph_run_id="run-1",
        selected_graph_paper_ref="paper:paper-11",
        selected_node_id=None,
    )

    assert corpus_id == 11
    cur.execute.assert_called_once_with(
        SELECTED_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
        (["paper-11"], "run-1"),
    )


def test_resolve_current_graph_run_id_uses_cached_current_release(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {
        "graph_run_id": "run-1",
        "bundle_checksum": "bundle-1",
        "graph_name": "cosmograph",
        "is_current": True,
    }
    repo = PostgresGraphRepository(connect=lambda: conn)

    repo.resolve_graph_release("current")

    assert repo.resolve_current_graph_run_id() == "run-1"
    cur.execute.assert_called_once_with(
        GRAPH_RELEASE_LOOKUP_SQL,
        ("current", "current", "current"),
    )


def test_resolve_current_graph_run_id_falls_back_to_current_run_query(mock_conn):
    conn = mock_conn(rows=[])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"graph_run_id": "run-2"}
    repo = PostgresGraphRepository(connect=lambda: conn)

    assert repo.resolve_current_graph_run_id() == "run-2"
    cur.execute.assert_called_once_with(CURRENT_GRAPH_RUN_ID_SQL)


def test_resolve_query_scope_prefers_explicit_selection_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresGraphRepository(connect=lambda: conn)

    route, scope_ids = repo.resolve_query_scope(
        graph_run_id="run-1",
        scope_corpus_ids=[22, 11, 22],
    )

    assert (route, scope_ids) == ("selection", [22, 11])


def test_resolve_query_scope_uses_current_map_for_current_graph(mock_conn):
    conn = mock_conn(rows=[])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"graph_run_id": "run-current"}
    repo = PostgresGraphRepository(connect=lambda: conn)

    assert repo.resolve_query_scope(graph_run_id="run-current") == ("current_map", [])
    assert repo.resolve_query_scope(graph_run_id="run-other") == ("graph_run", [])
    assert cur.execute.call_count == 1
    cur.execute.assert_called_with(CURRENT_GRAPH_RUN_ID_SQL)


def test_resolve_paper_graph_refs_reads_graph_paper_summary(mock_conn):
    conn = mock_conn(rows=[{"pmid": 12345, "graph_paper_ref": "paper-12345"}])
    repo = PostgresGraphRepository(connect=lambda: conn)

    refs = repo.resolve_paper_graph_refs(pmids=[12345], graph_run_id="run-1")

    assert refs == {12345: "paper-12345"}
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        RESOLVE_PAPER_GRAPH_REFS_SQL,
        ("run-1", [12345]),
    )
