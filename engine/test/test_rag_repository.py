"""Unit tests for the baseline evidence repository."""

from __future__ import annotations

from unittest.mock import MagicMock, call

from app.pgvector_utils import format_vector_literal
from app.rag import queries
from app.rag.models import PaperEvidenceHit
from app.rag.query_enrichment import normalize_title_key
from app.rag.repository import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    PostgresRagRepository,
)
from app.rag.title_anchor import prefix_range_upper_bound


def _paper_hit(corpus_id: int) -> PaperEvidenceHit:
    return PaperEvidenceHit(
        corpus_id=corpus_id,
        paper_id=f"paper-{corpus_id}",
        semantic_scholar_paper_id=f"paper-{corpus_id}",
        title=f"Title {corpus_id}",
        journal_name="Journal",
        year=2024,
        doi=None,
        pmid=None,
        pmcid=None,
        abstract="Abstract",
        tldr=None,
        text_availability="fulltext",
        is_open_access=True,
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
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])

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
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    assert repo._search_title_lookup_candidate_papers.call_args_list == [
        call(
            graph_run_id="run-1",
            query="melatonin delirium",
            normalized_title_query=normalize_title_key("melatonin delirium"),
            limit=5,
            prefix=False,
        ),
        call(
            graph_run_id="run-1",
            query="melatonin delirium",
            normalized_title_query=normalize_title_key("melatonin delirium"),
            limit=200,
            prefix=True,
        ),
    ]
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL,
        (
            "melatonin delirium",
            "melatonin delirium",
            "melatonin delirium",
            normalize_title_key("melatonin delirium"),
            False,
            "run-1",
            5,
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_returns_exact_title_candidates_before_broad_title_lookup(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    exact_hit = _paper_hit(101)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[exact_hit])

    hits = repo.search_papers(
        "run-1",
        "melatonin delirium",
        limit=5,
        use_title_similarity=True,
    )

    assert hits == [exact_hit]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_not_called()
    assert repo._search_title_lookup_candidate_papers.call_args_list == [
        call(
            graph_run_id="run-1",
            query="melatonin delirium",
            normalized_title_query=normalize_title_key("melatonin delirium"),
            limit=5,
            prefix=False,
        )
    ]


def test_search_papers_returns_prefix_title_candidates_before_broad_title_lookup(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    prefix_hit = _paper_hit(202)
    repo._search_title_lookup_candidate_papers = MagicMock(
        side_effect=[[], [prefix_hit]]
    )

    hits = repo.search_papers(
        "run-1",
        "melatonin delirium",
        limit=5,
        use_title_similarity=True,
    )

    assert hits == [prefix_hit]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_not_called()
    assert repo._search_title_lookup_candidate_papers.call_args_list == [
        call(
            graph_run_id="run-1",
            query="melatonin delirium",
            normalized_title_query=normalize_title_key("melatonin delirium"),
            limit=5,
            prefix=False,
        ),
        call(
            graph_run_id="run-1",
            query="melatonin delirium",
            normalized_title_query=normalize_title_key("melatonin delirium"),
            limit=200,
            prefix=True,
        ),
    ]


def test_search_exact_title_papers_maps_rows(mock_conn):
    title = (
        "Abnormalities of mitochondrial dynamics and bioenergetics in neuronal "
        "cells from CDKL5 deficiency disorder."
    )
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    exact_hit = _paper_hit(233428792)
    repo._title_lookup_candidate_corpus_ids = MagicMock(return_value=[233428792])
    repo.fetch_papers_by_corpus_ids = MagicMock(return_value=[exact_hit])

    hits = repo.search_exact_title_papers(
        "run-1",
        title,
        limit=5,
    )

    assert len(hits) == 1
    assert hits[0].paper_id == "paper-233428792"
    assert hits[0].lexical_score == 2.0
    assert hits[0].title_similarity == 1.0
    repo._title_lookup_candidate_corpus_ids.assert_called_once_with(
        query=title,
        normalized_title_query=normalize_title_key(title),
        limit=5,
        prefix=False,
    )
    repo.fetch_papers_by_corpus_ids.assert_called_once_with("run-1", [233428792])


def test_search_selected_title_papers_returns_selected_anchor_hit(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    selected_hit = PaperEvidenceHit(
        corpus_id=11857184,
        paper_id="paper-11857184",
        semantic_scholar_paper_id="paper-11857184",
        title=(
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot (SHARP-P) "
            "Study, a randomized controlled trial"
        ),
        journal_name="JAMA",
        year=2015,
        doi=None,
        pmid=11857184,
        pmcid=None,
        abstract="Trial design abstract.",
        tldr=None,
        text_availability="fulltext",
        is_open_access=True,
    )
    repo.fetch_papers_by_corpus_ids = MagicMock(return_value=[selected_hit])

    hits = repo.search_selected_title_papers(
        "run-1",
        (
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot (SHARP-P) "
            "Study, a randomized controlled trial"
        ),
        selected_corpus_id=11857184,
        limit=4,
    )

    assert [hit.corpus_id for hit in hits] == [11857184]
    assert hits[0].lexical_score == 2.0
    assert hits[0].title_similarity == 1.0
    repo.fetch_papers_by_corpus_ids.assert_called_once_with("run-1", [11857184])


def test_search_selected_title_papers_skips_out_of_scope_selected_corpus(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(return_value=[_paper_hit(101)])

    hits = repo.search_selected_title_papers(
        "run-1",
        "melatonin delirium",
        selected_corpus_id=101,
        limit=4,
        scope_corpus_ids=[202, 303],
    )

    assert hits == []
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_not_called()


def test_resolve_graph_release_caches_repeated_release_lookup(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "graph_run_id": "run-1",
                "graph_name": "cosmograph",
                "is_current": True,
                "bundle_checksum": "bundle-1",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    first = repo.resolve_graph_release("current")
    second = repo.resolve_graph_release("current")

    assert first == second
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.GRAPH_RELEASE_LOOKUP_SQL,
        ("current", "current", "current"),
    )


def test_search_session_reuses_one_connection_across_repository_calls(mock_conn):
    conn = mock_conn(rows=[])
    connect = MagicMock(return_value=conn)
    repo = PostgresRagRepository(connect=connect)

    with repo.search_session():
        repo.resolve_scope_corpus_ids(
            graph_run_id="run-1",
            graph_paper_refs=["paper-11", "paper:22"],
        )
        repo.fetch_known_scoped_papers_by_corpus_ids([101, 202])

    assert connect.call_count == 1
    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call("SET LOCAL jit = off"),
        call(
            queries.SCOPE_CORPUS_LOOKUP_SQL,
            (
                "run-1",
                ["paper-11", "paper:22"],
                ["paper-11", "paper:22"],
                ["paper-11", "paper:22"],
                ["paper-11", "paper:22"],
            ),
        ),
        call(queries.PAPER_LOOKUP_DIRECT_SQL, ([101, 202],)),
    ]


def test_search_session_skips_jit_override_when_disabled(mock_conn, monkeypatch):
    conn = mock_conn(rows=[])
    connect = MagicMock(return_value=conn)
    monkeypatch.setattr("app.rag.repository.settings.rag_runtime_disable_jit", False)
    repo = PostgresRagRepository(connect=connect)

    with repo.search_session():
        repo.fetch_known_scoped_papers_by_corpus_ids([101])

    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call(queries.PAPER_LOOKUP_DIRECT_SQL, ([101],)),
    ]


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
            normalize_title_key("melatonin delirium"),
            True,
            [101, 202],
            5,
            [101, 202],
            5,
        ),
    )


def test_search_exact_title_papers_can_scope_to_selected_corpus_ids(mock_conn):
    title = (
        "Abnormalities of mitochondrial dynamics and bioenergetics in neuronal "
        "cells from CDKL5 deficiency disorder."
    )
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._title_lookup_candidate_corpus_ids = MagicMock(return_value=[202, 999, 101])
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(return_value=[])
    repo.search_exact_title_papers(
        "run-1",
        title,
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )
    repo._title_lookup_candidate_corpus_ids.assert_called_once_with(
        query=title,
        normalized_title_query=normalize_title_key(title),
        limit=5,
        prefix=False,
    )
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_called_once_with([202, 101])


def test_title_lookup_exact_candidates_use_btree_range_params(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo._title_lookup_candidate_corpus_ids(
        query="Lung function decline in COPD",
        normalized_title_query=normalize_title_key("Lung function decline in COPD"),
        limit=5,
        prefix=False,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call(
            queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL,
            (
                "lung function decline in copd",
                "lung function decline in copd",
                "lung function decline in copd",
                5,
            ),
        ),
        call(
            queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL,
            (
                normalize_title_key("Lung function decline in COPD"),
                normalize_title_key("Lung function decline in COPD"),
                normalize_title_key("Lung function decline in COPD"),
                5,
            ),
        ),
    ]


def test_title_lookup_prefix_candidates_use_btree_prefix_range_params(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    normalized = normalize_title_key("Lung function decline in COPD")

    repo._title_lookup_candidate_corpus_ids(
        query="Lung function decline in COPD",
        normalized_title_query=normalized,
        limit=5,
        prefix=True,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call(
            queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL,
            (
                "lung function decline in copd",
                "lung function decline in copd",
                prefix_range_upper_bound("lung function decline in copd"),
                5,
            ),
        ),
        call(
            queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL,
            (
                normalized,
                normalized,
                prefix_range_upper_bound(normalized),
                5,
            ),
        ),
    ]


def test_search_papers_can_disable_title_similarity_for_sentence_queries(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)

    repo.search_papers(
        "run-1",
        "This is a representative discussion sentence.",
        limit=5,
        use_title_similarity=False,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL,
        (
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            normalize_title_key("This is a representative discussion sentence."),
            False,
            "run-1",
            5,
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_uses_exact_query_for_small_graph_scope(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=True)

    repo.search_papers(
        "run-1",
        "melatonin delirium",
        limit=5,
        use_title_similarity=False,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_IN_GRAPH_SQL,
        (
            "melatonin delirium",
            "melatonin delirium",
            "melatonin delirium",
            normalize_title_key("melatonin delirium"),
            False,
            "run-1",
            5,
            5,
        ),
    )


def test_search_papers_uses_graph_scoped_title_lookup_for_small_graph_scope(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=True)

    repo.search_papers(
        "run-1",
        "melatonin delirium",
        limit=5,
        use_title_similarity=True,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_called_once_with(
        queries.PAPER_TITLE_LOOKUP_IN_GRAPH_SQL,
        (
            "melatonin delirium",
            normalize_title_key("melatonin delirium"),
            "run-1",
            5,
            5,
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
            "melatonin delirium incidence",
            "preview-v2",
            [101, 202],
            5,
        ),
    )


def test_search_chunk_papers_preserves_biomedical_symbols_for_exact_chunk_matching(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn, chunk_version_key="preview-v2")

    repo.search_chunk_papers(
        "run-1",
        "decreased pERK1/2 + IL-6 signaling",
        limit=5,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args.args[1][3] == "decreased perk1/2 + il-6 signaling"
    assert queries.CHUNK_EXACT_MATCH_NORMALIZATION_REGEX == "[^[:alnum:]:_/+-]+"


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
    repo.resolve_query_entity_terms = MagicMock(return_value=[])

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
    repo.resolve_query_entity_terms = MagicMock(return_value=[])

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


def test_search_entity_papers_prefers_exact_entity_search_when_all_terms_resolve_exactly(mock_conn):
    paper_rows = [
        {
            "corpus_id": 30014021,
            "paper_id": "paper-30014021",
            "title": "GM2 gangliosidosis variant B1 case report",
            "abstract": "Abstract text",
            "tldr": None,
            "journal_name": "Neurology",
            "year": 2024,
            "doi": None,
            "pmid": 30014021,
            "pmcid": None,
            "text_availability": "abstract",
            "is_open_access": True,
            "citation_count": 7,
            "influential_citation_count": 1,
            "reference_count": 11,
            "publication_types": ["CaseReport"],
            "fields_of_study": ["Medicine"],
            "has_rule_evidence": False,
            "has_curated_journal_family": False,
            "journal_family_type": None,
            "entity_rule_families": 0,
            "entity_rule_count": 0,
            "entity_core_families": 1,
            "entity_candidate_score": 0.98,
        }
    ]
    conn = mock_conn(rows=paper_rows)
    repo = PostgresRagRepository(connect=lambda: conn)
    repo.resolve_query_entity_terms = MagicMock(
        return_value=["GM2 gangliosidosis variant B1"]
    )

    hits = repo.search_entity_papers(
        "run-1",
        entity_terms=["GM2 gangliosidosis variant B1"],
        limit=5,
    )

    assert [hit.corpus_id for hit in hits] == [30014021]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL,
        (
            ["GM2 gangliosidosis variant B1"],
            ENTITY_TOP_CONCEPTS_PER_TERM,
            "run-1",
            5,
        ),
    )


def test_ranked_entity_and_relation_queries_project_ranked_alias_columns():
    for sql in (
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL,
        queries.PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL,
        queries.PAPER_ENTITY_SEARCH_SQL,
        queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL,
        queries.PAPER_RELATION_SEARCH_SQL,
        queries.PAPER_RELATION_SEARCH_IN_SELECTION_SQL,
    ):
        assert "FROM ranked_papers rp" in sql
        assert "rp.corpus_id" in sql
        assert "rp.paper_id" in sql


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
        ("run-1", ["treat"], 5, 5),
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
        (["positive_correlate"], [101, 202], 5, 5),
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
                "matched_terms": ["melatonin"],
                "mention_count": 3,
                "structural_span_count": 2,
                "retrieval_default_mention_count": 2,
                "score": 0.75,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_entity_matches([101], entity_terms=["melatonin"])

    assert 101 in hits
    assert hits[101][0].concept_id == "MESH:D008874"
    assert hits[101][0].matched_terms == ["melatonin"]
    assert hits[101][0].mention_count == 3
    assert hits[101][0].structural_span_count == 2
    assert hits[101][0].retrieval_default_mention_count == 2
    assert hits[101][0].score == 0.75
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.ENTITY_MATCH_SQL,
        (["melatonin"], [101], 5),
    )


def test_runtime_entity_queries_use_canonical_entity_mentions():
    assert "JOIN solemd.paper_entity_mentions pem" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "JOIN solemd.paper_entity_mentions pem" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "ranked_papers AS (" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "\n,\n" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "ranked_papers AS (" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "\n,\n" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "FROM solemd.paper_entity_mentions pem" in queries.ENTITY_MATCH_SQL
    assert "pubtator.entity_annotations" not in queries.ENTITY_MATCH_SQL


def test_fetch_citation_contexts_scores_and_limits_hits_in_sql(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "direction": "outgoing",
                "neighbor_corpus_id": 202,
                "neighbor_paper_id": "paper-202",
                "citation_id": 33,
                "context_text": "Melatonin reduced delirium incidence.",
                "intents": [["result"]],
                "score": 1.25,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_citation_contexts(
        [101],
        query="Melatonin reduced delirium incidence.",
    )

    assert 101 in hits
    assert hits[101][0].direction.name == "OUTGOING"
    assert hits[101][0].neighbor_corpus_id == 202
    assert hits[101][0].intents == ["result"]
    assert hits[101][0].score == 1.25
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.CITATION_CONTEXT_SQL,
        (
            ["melatonin", "reduced", "delirium", "incidence"],
            [101],
            [101],
            [101],
            [101],
            3,
        ),
    )


def test_fetch_relation_matches_scores_matches_in_sql(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "relation_type": "positive_correlate",
                "subject_type": "Chemical",
                "subject_id": "MESH:D008874",
                "object_type": "Disease",
                "object_id": "MESH:D003863",
                "score": 0.5,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    hits = repo.fetch_relation_matches([202], relation_terms=["positive_correlate"])

    assert 202 in hits
    assert hits[202][0].relation_type == "positive_correlate"
    assert hits[202][0].score == 0.5
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.RELATION_MATCH_SQL,
        (["positive_correlate"], [202], 5),
    )


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


def test_exact_title_queries_use_native_index_friendly_lookup_shape():
    assert "lower(coalesce(p.title, '')) >= %s" in queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL
    assert "lower(coalesce(p.title, '')) <= %s" in queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL
    assert (
        f"{queries.PAPER_NORMALIZED_TITLE_KEY_SQL} >= %s"
        in queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL
    )
    assert (
        f"{queries.PAPER_NORMALIZED_TITLE_KEY_SQL} <= %s"
        in queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL
    )
    assert "lower(coalesce(p.title, '')) >= %s" in queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL
    assert "lower(coalesce(p.title, '')) < %s" in queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL
    assert (
        f"{queries.PAPER_NORMALIZED_TITLE_KEY_SQL} >= %s"
        in queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL
    )
    assert (
        f"{queries.PAPER_NORMALIZED_TITLE_KEY_SQL} < %s"
        in queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL
    )
    assert (
        "AND lower(coalesce(p.title, '')) >= query_input.lowered_query"
        in queries.PAPER_TITLE_LOOKUP_SQL
    )
    assert (
        f"AND {queries.PAPER_NORMALIZED_TITLE_KEY_SQL} >= "
        "query_input.normalized_title_query"
        in queries.PAPER_TITLE_LOOKUP_SQL
    )


def test_chunk_queries_render_headlines_after_candidate_pruning():
    assert "scored_chunks AS MATERIALIZED" in queries.CHUNK_SEARCH_SQL
    assert "matched_papers AS MATERIALIZED" in queries.CHUNK_SEARCH_SQL
    assert "ts_headline(" in queries.CHUNK_SEARCH_SQL
    assert "FROM matched_papers mp" in queries.CHUNK_SEARCH_SQL
    assert "matched_chunks AS MATERIALIZED" in queries.CHUNK_SEARCH_IN_SELECTION_SQL
    assert "ts_headline(" in queries.CHUNK_SEARCH_IN_SELECTION_SQL
    assert "FROM matched_chunks mc" in queries.CHUNK_SEARCH_IN_SELECTION_SQL


def test_vector_graph_queries_use_direct_distance_ordering():
    assert "ORDER BY p.embedding <=> %s::vector ASC" in queries.DENSE_QUERY_SEARCH_SQL
    assert "ORDER BY p.embedding <=> %s::vector ASC" in queries.SEMANTIC_NEIGHBOR_SQL
    assert "WITH query_vector AS" not in queries.DENSE_QUERY_SEARCH_SQL
    assert "WITH selected_embedding AS" not in queries.SEMANTIC_NEIGHBOR_SQL


def test_fetch_semantic_neighbors_uses_ann_query_when_hnsw_index_ready():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.side_effect = [
        {"embedding_literal": "[0.1,0.2,0.3]"},
        {"index_ready": True},
    ]
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
    repo._graph_scope_coverages["run-1"] = 1.0

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
            call(queries.PAPER_EMBEDDING_LITERAL_SQL, (101,)),
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 100"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL,
                ("[0.1,0.2,0.3]", 101, "[0.1,0.2,0.3]", 120, "run-1", 1),
            ),
        ]
    )


def test_fetch_semantic_neighbors_falls_back_to_exact_when_index_missing():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.side_effect = [
        {"embedding_literal": "[0.1,0.2,0.3]"},
        {"index_ready": False},
    ]
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

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [303]
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.PAPER_EMBEDDING_LITERAL_SQL, (101,)),
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call("SET LOCAL enable_indexscan = off"),
            call("SET LOCAL enable_indexonlyscan = off"),
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
    repo._graph_scope_coverages["run-1"] = 1.0
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
                queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                (vector_literal, vector_literal, 120, "run-1", 1),
            ),
        ]
    )


def test_fetch_semantic_neighbors_uses_exact_query_for_small_graph_scope():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"embedding_literal": "[0.1,0.2,0.3]"}
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

    hits = repo.fetch_semantic_neighbors(
        graph_run_id="run-1",
        selected_corpus_id=101,
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [303]
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.PAPER_EMBEDDING_LITERAL_SQL, (101,)),
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call("SET LOCAL enable_indexscan = off"),
            call("SET LOCAL enable_indexonlyscan = off"),
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
    cur.execute.assert_has_calls(
        [
            call("SET LOCAL max_parallel_workers_per_gather = 4"),
            call("SET LOCAL enable_indexscan = off"),
            call("SET LOCAL enable_indexonlyscan = off"),
            call(
                queries.DENSE_QUERY_SEARCH_SQL,
                (vector_literal, "run-1", vector_literal, 1),
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
