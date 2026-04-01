"""Unit tests for the baseline evidence repository."""

from __future__ import annotations

from unittest.mock import MagicMock, call

from app.rag import queries
from app.rag.repository import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    PostgresRagRepository,
)


def test_search_papers_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "paper_id": "paper-101",
                "title": "Melatonin and delirium",
                "abstract": "Abstract text",
                "tldr": "TLDR text",
                "journal_name": "JAMA",
                "year": 2024,
                "doi": "10.1/example",
                "pmid": 12345,
                "pmcid": "PMC123",
                "text_availability": "fulltext",
                "is_open_access": True,
                "citation_count": 7,
                "reference_count": 11,
                "lexical_score": 0.82,
                "title_similarity": 0.33,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_papers("run-1", "melatonin delirium", limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-101"
    assert hits[0].semantic_scholar_paper_id == "paper-101"
    assert hits[0].journal_name == "JAMA"
    assert hits[0].reference_count == 11
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL,
        ("run-1", "melatonin delirium", "melatonin delirium", 120, 5),
    )


def test_resolve_query_entity_terms_maps_exact_canonical_matches(mock_conn):
    conn = mock_conn(
        rows=[
            {"normalized_term": "melatonin"},
            {"normalized_term": "delirium"},
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    terms = repo.resolve_query_entity_terms(
        query_phrases=["melatonin", "delirium", "melatonin delirium"],
        limit=5,
    )

    assert terms == ["melatonin", "delirium"]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.QUERY_ENTITY_TERM_MATCH_SQL,
        (["melatonin", "delirium", "melatonin delirium"], 5),
    )


def test_resolve_query_entity_terms_preserves_exact_concept_ids(mock_conn):
    conn = mock_conn(rows=[{"normalized_term": "MESH:D008874"}])
    repo = PostgresRagRepository(connect=lambda: conn)

    terms = repo.resolve_query_entity_terms(
        query_phrases=["mesh:d008874", "melatonin"],
        limit=5,
    )

    assert terms == ["MESH:D008874"]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.QUERY_ENTITY_TERM_MATCH_SQL,
        (["mesh:d008874", "melatonin"], 5),
    )


def test_search_papers_can_scope_to_selected_corpus_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo.search_papers(
        "run-1",
        "melatonin delirium",
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_IN_SELECTION_SQL,
        ("melatonin delirium", "melatonin delirium", [101, 202], 0.1, 5),
    )


def test_search_entity_papers_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "paper_id": "paper-101",
                "title": "Melatonin and delirium",
                "abstract": "Abstract text",
                "tldr": "TLDR text",
                "journal_name": "JAMA",
                "year": 2024,
                "doi": "10.1/example",
                "pmid": 12345,
                "pmcid": "PMC123",
                "text_availability": "fulltext",
                "is_open_access": True,
                "citation_count": 7,
                "reference_count": 11,
                "entity_candidate_score": 0.88,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_entity_papers("run-1", entity_terms=["melatonin"], limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-101"
    assert hits[0].entity_score == 0.88
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_ENTITY_SEARCH_SQL,
        (
            ["melatonin"],
            ENTITY_FUZZY_SIMILARITY_THRESHOLD,
            ENTITY_TOP_CONCEPTS_PER_TERM,
            "run-1",
            5,
        ),
    )


def test_search_entity_papers_can_scope_to_selected_corpus_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo.search_entity_papers(
        "run-1",
        entity_terms=["melatonin", "melatonin"],
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL,
        (
            ["melatonin"],
            ENTITY_FUZZY_SIMILARITY_THRESHOLD,
            ENTITY_TOP_CONCEPTS_PER_TERM,
            [101, 202],
            5,
        ),
    )


def test_search_relation_papers_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "paper_id": "paper-202",
                "title": "Melatonin treatment paper",
                "abstract": "Abstract text",
                "tldr": None,
                "journal_name": "Lancet",
                "year": 2025,
                "doi": None,
                "pmid": 22222,
                "pmcid": None,
                "text_availability": "abstract",
                "is_open_access": False,
                "citation_count": 4,
                "reference_count": 9,
                "relation_candidate_score": 1.0,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_relation_papers("run-1", relation_terms=["treat"], limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-202"
    assert hits[0].relation_score == 1.0
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_RELATION_SEARCH_SQL,
        ("run-1", ["treat"], 5),
    )


def test_search_relation_papers_can_scope_to_selected_corpus_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo.search_relation_papers(
        "run-1",
        relation_terms=["positive_correlate", "positive_correlate"],
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_RELATION_SEARCH_IN_SELECTION_SQL,
        (["positive_correlate"], [101, 202], 5),
    )


def test_fetch_papers_by_corpus_ids_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "paper_id": "paper-202",
                "title": "Selected paper semantic neighbor",
                "abstract": "Abstract text",
                "tldr": None,
                "journal_name": "Lancet",
                "year": 2025,
                "doi": None,
                "pmid": 22222,
                "pmcid": None,
                "text_availability": "abstract",
                "is_open_access": False,
                "citation_count": 4,
                "reference_count": 9,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_papers_by_corpus_ids("run-1", [202, 202])

    assert len(hits) == 1
    assert hits[0].corpus_id == 202
    assert hits[0].paper_id == "paper-202"
    assert hits[0].journal_name == "Lancet"
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(queries.PAPER_LOOKUP_SQL, ("run-1", [202]))


def test_fetch_known_scoped_papers_by_corpus_ids_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "paper_id": "paper-202",
                "title": "Selected paper semantic neighbor",
                "abstract": "Abstract text",
                "tldr": None,
                "journal_name": "Lancet",
                "year": 2025,
                "doi": None,
                "pmid": 22222,
                "pmcid": None,
                "text_availability": "abstract",
                "is_open_access": False,
                "citation_count": 4,
                "reference_count": 9,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_known_scoped_papers_by_corpus_ids([202, 202])

    assert len(hits) == 1
    assert hits[0].corpus_id == 202
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(queries.PAPER_LOOKUP_DIRECT_SQL, ([202],))


def test_resolve_scope_corpus_ids_maps_graph_refs(mock_conn):
    conn = mock_conn(rows=[{"corpus_id": 11}, {"corpus_id": 22}])
    repo = PostgresRagRepository(connect=lambda: conn)

    corpus_ids = repo.resolve_scope_corpus_ids(
        graph_run_id="run-1",
        graph_paper_refs=["paper-11", "paper:22", "paper-11"],
    )

    assert corpus_ids == [11, 22]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.SCOPE_CORPUS_LOOKUP_SQL,
        (
            "run-1",
            ["paper-11", "paper:22"],
            ["paper-11", "paper:22"],
            ["paper-11", "paper:22"],
            ["paper-11", "paper:22"],
        ),
    )


def test_resolve_graph_release_targets_current_cosmograph_corpus_run(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {
        "graph_run_id": "run-1",
        "graph_name": "cosmograph",
        "is_current": True,
        "bundle_checksum": "bundle-1",
    }
    repo = PostgresRagRepository(connect=lambda: conn)

    release = repo.resolve_graph_release("bundle-1")

    assert "graph_name = 'cosmograph'" in queries.GRAPH_RELEASE_LOOKUP_SQL
    assert "node_kind = 'corpus'" in queries.GRAPH_RELEASE_LOOKUP_SQL
    cur.execute.assert_called_once_with(
        queries.GRAPH_RELEASE_LOOKUP_SQL,
        ("bundle-1", "bundle-1", "bundle-1"),
    )
    assert release.graph_release_id == "bundle-1"
    assert release.graph_run_id == "run-1"


def test_fetch_entity_matches_normalizes_mentions(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "entity_type": "chemical",
                "concept_id": "MESH:D008874",
                "mentions": "melatonin|Melatonin receptor agonist",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_entity_matches([101], entity_terms=["melatonin"])

    assert 101 in hits
    assert hits[101][0].concept_id == "MESH:D008874"
    assert hits[101][0].matched_terms == ["melatonin"]


def test_paper_queries_source_doi_from_corpus_table():
    assert "c.doi" in queries.PAPER_SEARCH_SQL
    assert "c.doi" in queries.PAPER_SEARCH_IN_SELECTION_SQL
    assert "c.doi" in queries.PAPER_LOOKUP_SQL
    assert "p.doi" not in queries.PAPER_SEARCH_SQL
    assert "p.doi" not in queries.PAPER_SEARCH_IN_SELECTION_SQL
    assert "p.doi" not in queries.PAPER_LOOKUP_SQL


def test_fetch_semantic_neighbors_uses_ann_query_when_hnsw_index_ready():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"index_ready": True}
    cur.fetchall.return_value = [
        {
            "corpus_id": 202,
            "paper_id": "paper-202",
            "distance": 0.2,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [202]
    assert hits[0].score == 0.8
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call(
                queries.SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL,
                (101, 101, 101, 120, "run-1", 1),
            ),
        ]
    )


def test_fetch_semantic_neighbors_falls_back_to_exact_when_index_missing():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"index_ready": False}
    cur.fetchall.return_value = [
        {
            "corpus_id": 303,
            "paper_id": "paper-303",
            "distance": 0.35,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [303]
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call(
                queries.SEMANTIC_NEIGHBOR_SQL,
                (101, "run-1", 101, 2),
            ),
        ]
    )
