"""Unit tests for the baseline evidence repository."""

from __future__ import annotations

from unittest.mock import MagicMock, call

from app.pgvector_utils import format_vector_literal
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
                "influential_citation_count": 3,
                "reference_count": 11,
                "publication_types": ["ClinicalTrial"],
                "fields_of_study": ["Medicine"],
                "has_rule_evidence": True,
                "has_curated_journal_family": True,
                "journal_family_type": "clinical",
                "entity_rule_families": 2,
                "entity_rule_count": 5,
                "entity_core_families": 1,
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
    assert hits[0].influential_citation_count == 3
    assert hits[0].publication_types == ["ClinicalTrial"]
    assert hits[0].fields_of_study == ["Medicine"]
    assert hits[0].has_rule_evidence is True
    assert hits[0].journal_family_type == "clinical"
    assert hits[0].reference_count == 11
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL,
        (
            "melatonin delirium",
            "melatonin delirium",
            "melatonin delirium",
            True,
            5,
            120,
            120,
            "run-1",
            5,
        ),
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
        (
            "melatonin delirium",
            "melatonin delirium",
            "melatonin delirium",
            True,
            [101, 202],
            5,
            [101, 202],
            5,
        ),
    )


def test_search_papers_can_disable_title_similarity_for_sentence_queries(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo.search_papers(
        "run-1",
        "This is a representative discussion sentence.",
        limit=5,
        use_title_similarity=False,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL,
        (
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            False,
            5,
            120,
            120,
            "run-1",
            5,
        ),
    )


def test_search_chunk_papers_maps_chunk_surface(mock_conn):
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
                "influential_citation_count": 3,
                "reference_count": 11,
                "publication_types": ["ClinicalTrial"],
                "fields_of_study": ["Medicine"],
                "has_rule_evidence": True,
                "has_curated_journal_family": True,
                "journal_family_type": "clinical",
                "entity_rule_families": 2,
                "entity_rule_count": 5,
                "entity_core_families": 1,
                "lexical_score": 0.0,
                "title_similarity": 0.0,
                "chunk_ordinal": 4,
                "chunk_snippet": "Melatonin ... delirium incidence",
                "chunk_lexical_score": 0.91,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn, chunk_version_key="preview-v2")

    hits = repo.search_chunk_papers("run-1", "melatonin delirium incidence", limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-101"
    assert hits[0].chunk_ordinal == 4
    assert hits[0].chunk_snippet == "Melatonin ... delirium incidence"
    assert hits[0].chunk_lexical_score == 0.91
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.CHUNK_SEARCH_SQL,
        (
            "melatonin delirium incidence",
            "melatonin delirium incidence",
            "melatonin delirium incidence",
            "run-1",
            "preview-v2",
            120,
            5,
        ),
    )


def test_search_chunk_papers_can_scope_to_selected_corpus_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn, chunk_version_key="preview-v2")

    repo.search_chunk_papers(
        "run-1",
        "melatonin delirium incidence",
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.CHUNK_SEARCH_IN_SELECTION_SQL,
        (
            "melatonin delirium incidence",
            "melatonin delirium incidence",
            "melatonin delirium incidence",
            "preview-v2",
            [101, 202],
            5,
        ),
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
                "influential_citation_count": 2,
                "reference_count": 11,
                "publication_types": ["ClinicalTrial"],
                "fields_of_study": ["Medicine"],
                "has_rule_evidence": True,
                "has_curated_journal_family": True,
                "journal_family_type": "clinical",
                "entity_rule_families": 3,
                "entity_rule_count": 4,
                "entity_core_families": 2,
                "entity_candidate_score": 0.88,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_entity_papers("run-1", entity_terms=["melatonin"], limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-101"
    assert hits[0].entity_score == 0.88
    assert hits[0].publication_types == ["ClinicalTrial"]
    assert hits[0].fields_of_study == ["Medicine"]
    assert hits[0].has_rule_evidence is True
    assert hits[0].journal_family_type == "clinical"
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
                "influential_citation_count": 1,
                "reference_count": 9,
                "publication_types": ["Review"],
                "fields_of_study": ["Biology"],
                "has_rule_evidence": False,
                "has_curated_journal_family": True,
                "journal_family_type": "review",
                "entity_rule_families": 0,
                "entity_rule_count": 0,
                "entity_core_families": 1,
                "relation_candidate_score": 1.0,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.search_relation_papers("run-1", relation_terms=["treat"], limit=5)

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-202"
    assert hits[0].relation_score == 1.0
    assert hits[0].publication_types == ["Review"]
    assert hits[0].fields_of_study == ["Biology"]
    assert hits[0].has_curated_journal_family is True
    assert hits[0].entity_core_families == 1
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
    assert "    p.doi," not in queries.PAPER_SEARCH_SQL
    assert "    p.doi," not in queries.PAPER_SEARCH_IN_SELECTION_SQL
    assert "    p.doi," not in queries.PAPER_LOOKUP_SQL


def test_paper_search_queries_search_before_joining_runtime_metadata():
    assert "WITH scoped_corpus AS" not in queries.PAPER_SEARCH_SQL
    assert "exact_title_matches AS MATERIALIZED" in queries.PAPER_SEARCH_SQL
    assert "fts_matches AS MATERIALIZED" in queries.PAPER_SEARCH_SQL
    assert "title_matches AS MATERIALIZED" in queries.PAPER_SEARCH_SQL
    assert "NOT EXISTS (SELECT 1 FROM exact_title_matches)" in queries.PAPER_SEARCH_SQL
    assert "UNION ALL" in queries.PAPER_SEARCH_SQL
    assert "FROM matched_papers mp" in queries.PAPER_SEARCH_SQL
    assert "JOIN solemd.corpus c" in queries.PAPER_SEARCH_SQL
    assert "FROM matched_papers mp" in queries.PAPER_SEARCH_IN_SELECTION_SQL
    assert "JOIN solemd.corpus c" in queries.PAPER_SEARCH_IN_SELECTION_SQL


def test_ann_graph_queries_filter_within_candidate_ctes():
    assert "graph_scope AS MATERIALIZED" in queries.DENSE_QUERY_SEARCH_ANN_IN_GRAPH_SQL
    assert "FROM graph_scope gs" in queries.DENSE_QUERY_SEARCH_ANN_IN_GRAPH_SQL
    assert "graph_scope AS MATERIALIZED" in queries.SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL
    assert "FROM graph_scope gs" in queries.SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL


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
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._should_use_broad_scope_ann = MagicMock(return_value=False)
    repo.fetch_paper_embedding_literal = MagicMock(return_value="[0.1,0.2,0.3]")

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [202]
    assert hits[0].score == 0.8
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.SEMANTIC_NEIGHBOR_ANN_IN_GRAPH_SQL,
                ("run-1", "[0.1,0.2,0.3]", 101, "[0.1,0.2,0.3]", 120, 1),
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
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo.fetch_paper_embedding_literal = MagicMock(return_value="[0.1,0.2,0.3]")

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [303]
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call(
                queries.SEMANTIC_NEIGHBOR_SQL,
                ("[0.1,0.2,0.3]", "run-1", 101, "[0.1,0.2,0.3]", 2),
            ),
        ]
    )


def test_search_query_embedding_papers_uses_ann_query_when_hnsw_index_ready():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"index_ready": True}
    cur.fetchall.return_value = [
        {
            "corpus_id": 404,
            "paper_id": "paper-404",
            "title": "Dense query paper",
            "abstract": "Abstract text",
            "tldr": None,
            "journal_name": "Nature",
            "year": 2025,
            "doi": None,
            "pmid": 404,
            "pmcid": None,
            "text_availability": "abstract",
            "is_open_access": False,
            "citation_count": 4,
            "reference_count": 9,
            "distance": 0.09,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._should_use_broad_scope_ann = MagicMock(return_value=False)
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [404]
    assert hits[0].dense_score == 0.91
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.DENSE_QUERY_SEARCH_ANN_IN_GRAPH_SQL,
                (vector_literal, "run-1", 120, 1),
            ),
        ]
    )


def test_fetch_semantic_neighbors_uses_exact_query_for_small_graph_scope():
    conn = MagicMock()
    cur = MagicMock()
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
    repo._should_use_exact_graph_search = MagicMock(return_value=True)
    repo.fetch_paper_embedding_literal = MagicMock(return_value="[0.1,0.2,0.3]")

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [303]
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call(
                queries.SEMANTIC_NEIGHBOR_SQL,
                ("[0.1,0.2,0.3]", "run-1", 101, "[0.1,0.2,0.3]", 2),
            ),
        ]
    )


def test_search_query_embedding_papers_uses_exact_query_for_small_graph_scope():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [
        {
            "corpus_id": 404,
            "paper_id": "paper-404",
            "title": "Dense query paper",
            "abstract": "Abstract text",
            "tldr": None,
            "journal_name": "Nature",
            "year": 2025,
            "doi": None,
            "pmid": 404,
            "pmcid": None,
            "text_availability": "abstract",
            "is_open_access": False,
            "citation_count": 4,
            "reference_count": 9,
            "distance": 0.09,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=True)
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [404]
    assert hits[0].dense_score == 0.91
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_called_once_with(
        queries.DENSE_QUERY_SEARCH_SQL,
        (vector_literal, "run-1", vector_literal, 1),
    )


def test_fetch_semantic_neighbors_uses_broad_scope_ann_for_near_full_graphs():
    conn = MagicMock()
    cur = MagicMock()
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
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._should_use_broad_scope_ann = MagicMock(return_value=True)
    repo._semantic_neighbor_index_ready = True
    repo.fetch_paper_embedding_literal = MagicMock(return_value="[0.1,0.2,0.3]")

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [202]
    cur.execute.assert_has_calls(
        [
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL,
                ("[0.1,0.2,0.3]", 101, "[0.1,0.2,0.3]", 120, "run-1", 1),
            ),
        ]
    )


def test_search_query_embedding_papers_uses_broad_scope_ann_for_near_full_graphs():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [
        {
            "corpus_id": 404,
            "paper_id": "paper-404",
            "title": "Dense query paper",
            "abstract": "Abstract text",
            "tldr": None,
            "journal_name": "Nature",
            "year": 2025,
            "doi": None,
            "pmid": 404,
            "pmcid": None,
            "text_availability": "abstract",
            "is_open_access": False,
            "citation_count": 4,
            "reference_count": 9,
            "distance": 0.09,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._should_use_broad_scope_ann = MagicMock(return_value=True)
    repo._semantic_neighbor_index_ready = True
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [404]
    assert hits[0].dense_score == 0.91
    cur.execute.assert_has_calls(
        [
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                (vector_literal, 120, "run-1", 1),
            ),
        ]
    )


def test_search_query_embedding_papers_can_scope_to_selected_corpus_ids(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.DENSE_QUERY_SEARCH_IN_SELECTION_SQL,
        (vector_literal, [101, 202], vector_literal, 5),
    )
