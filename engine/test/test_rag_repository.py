"""Unit tests for the baseline evidence repository."""

from __future__ import annotations

from unittest.mock import MagicMock, call

from app.pgvector_utils import format_vector_literal
from app.rag import queries
from app.rag.models import PaperEvidenceHit
from app.rag.biomedical_concept_normalizer import _VocabConceptRow
from app.rag.query_enrichment import normalize_title_key
from app.rag.query_metadata import QueryMetadataHints
from app.rag.repository import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    PostgresRagRepository,
)
from app.rag.repository_support import ResolvedEntityConcept
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
            "run-1",
            5,
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


def test_search_papers_can_keep_title_candidate_lookup_while_disabling_similarity(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    exact_hit = _paper_hit(303)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[exact_hit])

    hits = repo.search_papers(
        "run-1",
        (
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat"
        ),
        limit=5,
        use_title_similarity=False,
        use_title_candidate_lookup=True,
    )

    assert hits == [exact_hit]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_not_called()
    repo._search_title_lookup_candidate_papers.assert_called_once()


def test_search_papers_falls_back_to_global_fts_only_when_title_similarity_is_disabled(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._search_title_lookup_candidate_papers = MagicMock(side_effect=[[], [], []])

    repo.search_papers(
        "run-1",
        (
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat"
        ),
        limit=5,
        use_title_similarity=False,
        use_title_candidate_lookup=True,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    assert repo._search_title_lookup_candidate_papers.call_args_list == [
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=5,
            prefix=False,
        ),
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=200,
            prefix=True,
        ),
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=120,
            prefix=False,
            fts_phrase=True,
        ),
    ]
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL_NO_TITLE_SIMILARITY,
        (
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat",
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat",
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat",
            normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            "run-1",
            5,
            120,
            5,
        ),
    )


def test_search_papers_returns_phrase_title_candidates_before_global_fts_only(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    phrase_hit = _paper_hit(24948876)
    repo._search_title_lookup_candidate_papers = MagicMock(
        side_effect=[[], [], [phrase_hit]]
    )

    hits = repo.search_papers(
        "run-1",
        (
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat"
        ),
        limit=5,
        use_title_similarity=False,
        use_title_candidate_lookup=True,
    )

    assert hits == [phrase_hit]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_not_called()
    assert repo._search_title_lookup_candidate_papers.call_args_list == [
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=5,
            prefix=False,
        ),
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=200,
            prefix=True,
        ),
        call(
            graph_run_id="run-1",
            query=(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            normalized_title_query=normalize_title_key(
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            ),
            limit=120,
            prefix=False,
            fts_phrase=True,
        ),
    ]


def test_paper_metadata_search_sql_includes_graph_input_cte():
    assert "graph_input AS NOT MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL


def test_paper_metadata_search_current_map_sql_uses_current_map_scope():
    assert "is_in_current_map IS TRUE" in queries.PAPER_METADATA_SEARCH_CURRENT_MAP_SQL
    assert "graph_input AS NOT MATERIALIZED" not in queries.PAPER_METADATA_SEARCH_CURRENT_MAP_SQL


def test_paper_metadata_search_sql_materializes_metadata_and_topic_candidates():
    assert "author_matches AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "journal_matches AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "publication_type_matches AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "filter_candidate_corpus_ids AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "topic_candidates AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "topic_matches AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "topic_year_matches AS MATERIALIZED" in queries.PAPER_METADATA_SEARCH_SQL
    assert "lower(pa.name) = query_input.author_query" in queries.PAPER_METADATA_SEARCH_SQL
    assert "to_tsvector('simple', COALESCE(pa.name, '')) @@ query_input.author_ts_query" in (
        queries.PAPER_METADATA_SEARCH_SQL
    )
    assert "normalized_topic_ts_query" in queries.PAPER_METADATA_SEARCH_SQL
    assert "solemd.normalize_title_key(COALESCE(p.title, ''))" in queries.PAPER_METADATA_SEARCH_SQL
    assert "query_input.journal_query <> ''" in queries.PAPER_METADATA_SEARCH_SQL


def test_search_papers_uses_author_year_route_and_skips_title_probe(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._is_current_graph_run = MagicMock(return_value=False)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="different permeability potassium salts across blood-brain",
        year_hint=2013,
        author_hint="Breschi",
        matched_cues=("author", "year"),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-1",
        query="different permeability potassium salts across blood-brain",
        limit=5,
        query_metadata_hints=hints,
    )
    repo.search_papers(
        "run-1",
        "different permeability potassium salts across blood-brain",
        limit=5,
        query_metadata_hints=hints,
    )

    assert route_name == "paper_search_author_year_global"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_AUTHOR_YEAR_SEARCH_SQL,
        (
            "different permeability potassium salts across blood-brain",
            "different permeability potassium salts across blood-brain",
            "different permeability potassium salts across blood-brain",
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            "Breschi",
            "Breschi",
            "Breschi",
            "",
            "",
            "",
            2013,
            [],
            "run-1",
            120,
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_uses_publication_type_route_in_selection(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="risk factors incident delirium among older",
        requested_publication_types=("MetaAnalysis", "SystematicReview"),
        matched_cues=("meta-analysis_evidence",),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-1",
        query="risk factors incident delirium among older",
        limit=5,
        scope_corpus_ids=[101, 202],
        query_metadata_hints=hints,
    )
    repo.search_papers(
        "run-1",
        "risk factors incident delirium among older",
        limit=5,
        scope_corpus_ids=[101, 202],
        query_metadata_hints=hints,
    )

    assert route_name == "paper_search_publication_type_in_selection"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_IN_SELECTION_SQL,
        (
            "risk factors incident delirium among older",
            "risk factors incident delirium among older",
            "risk factors incident delirium among older",
            "risk factors incident delirium among older",
            "risk factors incident delirium among older",
            "risk factors incident delirium among older",
            "",
            "",
            "",
            "",
            "",
            "",
            None,
            ["MetaAnalysis", "SystematicReview"],
            [101, 202],
            120,
            5,
        ),
    )


def test_search_papers_uses_current_map_author_year_route_for_current_graph(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._is_current_graph_run = MagicMock(return_value=True)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="different permeability potassium salts across blood-brain",
        year_hint=2013,
        author_hint="Breschi",
        matched_cues=("author", "year"),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-current",
        query="different permeability potassium salts across blood-brain",
        limit=5,
        query_metadata_hints=hints,
    )
    repo.search_papers(
        "run-current",
        "different permeability potassium salts across blood-brain",
        limit=5,
        query_metadata_hints=hints,
    )

    assert route_name == "paper_search_author_year_current_map"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_AUTHOR_YEAR_SEARCH_CURRENT_MAP_SQL,
        (
            "different permeability potassium salts across blood-brain",
            "different permeability potassium salts across blood-brain",
            "different permeability potassium salts across blood-brain",
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            normalize_title_key(
                "different permeability potassium salts across blood-brain"
            ),
            "Breschi",
            "Breschi",
            "Breschi",
            "",
            "",
            "",
            2013,
            [],
            120,
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_uses_current_map_publication_type_route(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._is_current_graph_run = MagicMock(return_value=True)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="predictors treatment response first episode schizophrenia",
        requested_publication_types=("ClinicalTrial", "RandomizedControlledTrial"),
        matched_cues=("clinical_trial_evidence",),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-current",
        query="predictors treatment response first episode schizophrenia",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    repo.search_papers(
        "run-current",
        "predictors treatment response first episode schizophrenia",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )

    assert route_name == "paper_search_publication_type_current_map"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_PUBLICATION_TYPE_TOPIC_SEARCH_CURRENT_MAP_SQL,
        (
            "predictors treatment response first episode schizophrenia",
            "predictors treatment response first episode schizophrenia",
            "predictors treatment response first episode schizophrenia",
            "predictors treatment response first episode schizophrenia",
            "predictors treatment response first episode schizophrenia",
            "predictors treatment response first episode schizophrenia",
            "",
            "",
            "",
            "",
            "",
            "",
            None,
            ["ClinicalTrial", "RandomizedControlledTrial"],
            120,
            5,
        ),
    )


def test_search_papers_uses_current_map_journal_year_route(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._is_current_graph_run = MagicMock(return_value=True)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="score that predicts 1-year functional status",
        year_hint=2018,
        journal_hint="Neurology",
        matched_cues=("journal", "year"),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-current",
        query="Neurology 2018 score that predicts 1-year functional status",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    repo.search_papers(
        "run-current",
        "Neurology 2018 score that predicts 1-year functional status",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )

    assert route_name == "paper_search_journal_year_current_map"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_JOURNAL_YEAR_SEARCH_CURRENT_MAP_SQL,
        (
            "score that predicts 1-year functional status",
            "score that predicts 1-year functional status",
            "score that predicts 1-year functional status",
            normalize_title_key("score that predicts 1-year functional status"),
            normalize_title_key("score that predicts 1-year functional status"),
            normalize_title_key("score that predicts 1-year functional status"),
            "",
            "",
            "",
            "Neurology",
            "Neurology",
            "Neurology",
            2018,
            [],
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_routes_single_token_prefix_queries_through_author_year_path(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._is_current_graph_run = MagicMock(return_value=True)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="score that predicts 1-year functional status",
        year_hint=2018,
        author_hint="Neurology",
        matched_cues=("author", "year"),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-current",
        query="Neurology 2018 score that predicts 1-year functional status",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    repo.search_papers(
        "run-current",
        "Neurology 2018 score that predicts 1-year functional status",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )

    assert route_name == "paper_search_author_year_current_map"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_AUTHOR_YEAR_SEARCH_CURRENT_MAP_SQL,
        (
            "score that predicts 1-year functional status",
            "score that predicts 1-year functional status",
            "score that predicts 1-year functional status",
            normalize_title_key("score that predicts 1-year functional status"),
            normalize_title_key("score that predicts 1-year functional status"),
            normalize_title_key("score that predicts 1-year functional status"),
            "Neurology",
            "Neurology",
            "Neurology",
            "",
            "",
            "",
            2018,
            [],
            120,
            120,
            120,
            120,
            5,
        ),
    )


def test_search_papers_uses_general_route_for_generic_study_evidence_prompts(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._search_title_lookup_candidate_papers = MagicMock(return_value=[])
    hints = QueryMetadataHints(
        topic_query="association dopamine transporter gene parkinson's disease",
        matched_cues=("study_evidence",),
    )

    route_name = repo.describe_paper_search_route(
        graph_run_id="run-1",
        query="association dopamine transporter gene parkinson's disease",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )
    repo.search_papers(
        "run-1",
        "association dopamine transporter gene parkinson's disease",
        limit=5,
        query_metadata_hints=hints,
        use_title_similarity=False,
        use_title_candidate_lookup=False,
    )

    assert route_name == "paper_search_global_fts_only"
    repo._search_title_lookup_candidate_papers.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_SEARCH_SQL_NO_TITLE_SIMILARITY,
        (
            "association dopamine transporter gene parkinson's disease",
            "association dopamine transporter gene parkinson's disease",
            "association dopamine transporter gene parkinson's disease",
            normalize_title_key("association dopamine transporter gene parkinson's disease"),
            "run-1",
            5,
            120,
            5,
        ),
    )


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


def test_is_current_graph_run_caches_lazy_current_graph_lookup(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"id": "run-current"}
    repo = PostgresRagRepository(connect=lambda: conn)

    assert repo._is_current_graph_run("run-current") is True
    assert repo._is_current_graph_run("run-other") is False

    assert cur.execute.call_count == 1
    assert "FROM solemd.graph_runs" in cur.execute.call_args.args[0]


def test_graph_run_paper_count_prefers_graph_run_summary(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"paper_count": 2452643}
    repo = PostgresRagRepository(connect=lambda: conn)

    count = repo._graph_run_paper_count("run-1")

    assert count == 2452643
    cur.execute.assert_called_once_with(
        queries.GRAPH_RELEASE_PAPER_COUNT_SUMMARY_SQL,
        ("run-1",),
    )


def test_graph_run_paper_count_falls_back_to_current_map_estimate(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.side_effect = [
        {"paper_count": 0},
        {"paper_count": 2439428},
    ]
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._is_current_graph_run = MagicMock(return_value=True)

    count = repo._graph_run_paper_count("run-current")

    assert count == 2439428
    cur.execute.assert_has_calls(
        [
            call(queries.GRAPH_RELEASE_PAPER_COUNT_SUMMARY_SQL, ("run-current",)),
            call(queries.CURRENT_MAP_PAPER_COUNT_ESTIMATE_SQL),
        ]
    )


def test_graph_run_paper_count_falls_back_to_stats_estimate(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.side_effect = [
        {"paper_count": 0},
        {
            "total_rows": 4902922.0,
            "n_distinct": 2.0,
            "most_common_vals": "{run-other,run-1}",
            "most_common_freqs": [0.5, 0.5],
        },
    ]
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._is_current_graph_run = MagicMock(return_value=False)

    count = repo._graph_run_paper_count("run-1")

    assert count == 2451461
    cur.execute.assert_has_calls(
        [
            call(queries.GRAPH_RELEASE_PAPER_COUNT_SUMMARY_SQL, ("run-1",)),
            call(queries.GRAPH_POINTS_GRAPH_RUN_ESTIMATE_SQL),
        ]
    )


def test_embedded_paper_count_uses_embedding_index_estimate(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = {"paper_count": 2489328}
    repo = PostgresRagRepository(connect=lambda: conn)

    count = repo._embedded_paper_count_value()

    assert count == 2489328
    cur.execute.assert_called_once_with(queries.EMBEDDED_PAPER_COUNT_ESTIMATE_SQL)


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
            {
                "query_term": "melatonin",
                "normalized_term": "melatonin",
                "entity_type": "chemical",
                "concept_namespace": "mesh",
                "concept_id": "D008550",
                "rule_confidence": None,
            },
            {
                "query_term": "delirium",
                "normalized_term": "delirium",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D003693",
                "rule_confidence": None,
            },
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["melatonin", "delirium", "melatonin delirium"],
        limit=5,
    )

    assert resolved.all_terms == ["melatonin", "delirium"]
    assert resolved.high_confidence_terms == set()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.QUERY_ENTITY_TERM_MATCH_SQL,
        (["melatonin", "delirium", "melatonin delirium"], 3),
    )


def test_resolve_query_entity_terms_preserves_exact_concept_ids(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "query_term": "mesh:d008874",
                "normalized_term": "MESH:D008874",
                "entity_type": "chemical",
                "concept_namespace": "mesh",
                "concept_id": "D008874",
                "rule_confidence": "high",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["mesh:d008874", "melatonin"],
        limit=5,
    )

    assert resolved.all_terms == ["MESH:D008874"]
    assert resolved.high_confidence_terms == {"MESH:D008874"}
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.QUERY_ENTITY_TERM_MATCH_SQL,
        (["mesh:d008874", "melatonin"], 2),
    )


def test_resolve_query_entity_terms_dedupes_casefolded_terms(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="slc6a4",
                resolved_term="slc6a4",
                entity_type="gene",
                concept_namespace="ncbi_gene",
                concept_id="101173962",
            ),
            ResolvedEntityConcept(
                raw_term="SLC6A4",
                resolved_term="SLC6A4",
                entity_type="gene",
                concept_namespace="ncbi_gene",
                concept_id="6532",
                rule_confidence="high",
            ),
            ResolvedEntityConcept(
                raw_term="Slc6a4",
                resolved_term="Slc6a4",
                entity_type="gene",
                concept_namespace="ncbi_gene",
                concept_id="15567",
            ),
        ]
    )

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["SLC6A4"],
        limit=5,
    )

    assert resolved.all_terms == ["slc6a4"]
    assert resolved.high_confidence_terms == {"slc6a4"}


def test_resolve_query_entity_terms_adds_supplemental_vocab_matches_for_uncovered_composite_phrases(
    mock_conn,
):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="steroid psychosis",
                resolved_term="psychosis",
                entity_type="disease",
                concept_namespace="mesh",
                concept_id="D011618",
                rule_confidence="high",
                has_entity_rule=True,
                source_surface="entity_alias",
            )
        ]
    )
    repo._resolve_vocab_concept_rows = MagicMock(
        return_value=[
            _VocabConceptRow(
                alias_key="steroid psychosis",
                preferred_term="Steroid Psychosis",
                matched_alias="steroid psychosis",
                alias_type="exact",
                quality_score=100,
                is_preferred=True,
                umls_cui="C0038454",
                term_id="term-1",
                category="disease",
                mesh_id=None,
                entity_type="disease",
                source_surface="vocab_alias",
            )
        ]
    )

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["steroid psychosis", "mania after high-dose dex"],
        limit=5,
    )

    assert resolved.all_terms == ["psychosis"]
    assert [match.preferred_term for match in resolved.vocab_concept_matches] == [
        "Steroid Psychosis"
    ]
    repo._resolve_vocab_concept_rows.assert_called_once_with(
        query_phrases=["steroid psychosis", "mania after high-dose dex"],
        limit=5,
    )


def test_resolve_query_entity_terms_skips_supplemental_vocab_lookup_when_vocab_alias_is_already_present(
    mock_conn,
):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="akathisia",
                resolved_term="Akathisia",
                entity_type="disease",
                concept_namespace="mesh",
                concept_id="D011595",
                rule_confidence="high",
                has_entity_rule=True,
                source_surface="vocab_alias",
                vocab_term_id="term-2",
                vocab_alias_key="akathisia",
                vocab_alias_type="exact",
                vocab_quality_score=100,
                vocab_is_preferred=True,
                vocab_umls_cui="C0002063",
                vocab_mesh_id="D011595",
                vocab_category="disease",
            )
        ]
    )
    repo._resolve_vocab_concept_rows = MagicMock(return_value=[])

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["akathisia"],
        limit=5,
    )

    assert resolved.all_terms == ["Akathisia"]
    assert [match.preferred_term for match in resolved.vocab_concept_matches] == [
        "Akathisia"
    ]
    repo._resolve_vocab_concept_rows.assert_not_called()


def test_resolve_query_entity_terms_filters_untrusted_single_token_alias_expansions(mock_conn):
    conn = mock_conn()
    cur = conn.cursor.return_value.__enter__.return_value
    cur.fetchall.side_effect = [
        [
            {
                "query_term": "ssri",
                "normalized_term": "Serotonin syndrome",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D020230",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            }
        ],
        [
            {
                "query_term": "ssri",
                "preferred_term": "Selective Serotonin Reuptake Inhibitor (SSRI)",
                "matched_alias": "SSRI",
                "alias_key": "ssri",
                "alias_type": "derived_acronym",
                "quality_score": 100,
                "is_preferred": True,
                "umls_cui": "C4552594",
                "term_id": "ab61a6fc-6b40-42de-ae3d-640d6f5500c2",
                "category": "intervention.pharmacologic.class",
                "mesh_id": None,
                "entity_type": "chemical",
                "source_surface": "vocab_alias",
            }
        ],
    ]
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["ssri"],
        limit=5,
    )

    assert resolved.all_terms == []
    assert resolved.high_confidence_terms == set()
    assert resolved.resolved_concepts == ()
    assert len(resolved.vocab_concept_matches) == 1
    assert resolved.vocab_concept_matches[0].preferred_term == (
        "Selective Serotonin Reuptake Inhibitor (SSRI)"
    )
    assert resolved.vocab_concept_matches[0].confidence == "medium"
    assert cur.execute.call_args_list == [
        call(
            queries.QUERY_ENTITY_TERM_MATCH_SQL,
            (["ssri"], 1),
        ),
        call(
            queries.QUERY_VOCAB_CONCEPT_MATCH_SQL,
            (["ssri"], 5),
        ),
    ]


def test_resolve_query_entity_terms_keeps_rule_backed_multi_token_alias_expansions(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "query_term": "parkinson disease",
                "normalized_term": "Parkinson's disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D010300",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["parkinson disease"],
        limit=5,
    )

    assert resolved.all_terms == ["Parkinson's disease"]
    assert resolved.high_confidence_terms == {"Parkinson's disease"}
    assert [concept.concept_id for concept in resolved.resolved_concepts] == ["D010300"]


def test_resolve_query_entity_terms_prefers_overlap_preserving_alias_concepts_for_same_raw_phrase(
    mock_conn,
):
    conn = mock_conn(
        rows=[
            {
                "query_term": "chest pain",
                "normalized_term": "chest pain",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D002637",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            },
            {
                "query_term": "chest pain",
                "normalized_term": "chronic obstructive pulmonary disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D029424",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            },
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["chest pain"],
        limit=5,
    )

    assert resolved.all_terms == ["chest pain"]
    assert [concept.concept_id for concept in resolved.resolved_concepts] == ["D002637"]


def test_resolve_query_entity_terms_keeps_zero_overlap_alias_when_no_better_match_exists(
    mock_conn,
):
    conn = mock_conn(
        rows=[
            {
                "query_term": "brain fog",
                "normalized_term": "Cognitive impairment",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D003072",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["brain fog"],
        limit=5,
    )

    assert resolved.all_terms == ["Cognitive impairment"]
    assert [concept.concept_id for concept in resolved.resolved_concepts] == ["D003072"]


def test_resolve_query_entity_terms_prunes_shorter_contained_alias_phrases(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "query_term": "in parkinson disease",
                "normalized_term": "Parkinson's disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D010300",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            },
            {
                "query_term": "parkinson disease",
                "normalized_term": "Parkinson's disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D010300",
                "rule_confidence": "high",
                "has_entity_rule": True,
                "source_surface": "entity_alias",
            },
            {
                "query_term": "disease",
                "normalized_term": "disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D004194",
                "rule_confidence": "high",
                "has_entity_rule": False,
                "source_surface": "entity_alias",
            },
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    resolved = repo.resolve_query_entity_terms(
        query_phrases=["in parkinson disease", "parkinson disease", "disease"],
        limit=5,
    )

    assert resolved.all_terms == ["Parkinson's disease"]
    assert [concept.raw_term for concept in resolved.resolved_concepts] == [
        "parkinson disease",
    ]


def test_resolve_query_entity_terms_reuses_request_scoped_cache(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "query_term": "melatonin",
                "normalized_term": "melatonin",
                "entity_type": "chemical",
                "concept_namespace": "mesh",
                "concept_id": "D008550",
                "rule_confidence": None,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    with repo.search_session():
        first_terms = repo.resolve_query_entity_terms(
            query_phrases=["melatonin"],
            limit=5,
        ).all_terms
        second_terms = repo.resolve_query_entity_terms(
            query_phrases=["melatonin"],
            limit=5,
        ).all_terms

    assert first_terms == ["melatonin"]
    assert second_terms == ["melatonin"]
    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call("SET LOCAL jit = off"),
        call(
            queries.QUERY_ENTITY_TERM_MATCH_SQL,
            (["melatonin"], 1),
        ),
    ]


def test_resolve_query_entity_concepts_reuses_request_scoped_cache_for_resolved_terms(
    mock_conn,
):
    conn = mock_conn(
        rows=[
            {
                "query_term": "abeta",
                "normalized_term": "Alzheimer disease",
                "entity_type": "disease",
                "concept_namespace": "mesh",
                "concept_id": "D000544",
                "rule_confidence": "high",
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    with repo.search_session():
        first = repo._resolve_query_entity_concepts(
            query_phrases=["abeta"],
            limit=1,
        )
        second = repo._resolve_query_entity_concepts(
            query_phrases=["Alzheimer disease"],
            limit=1,
        )

    assert [concept.concept_id for concept in first] == ["D000544"]
    assert [concept.concept_id for concept in second] == ["D000544"]
    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list == [
        call("SET LOCAL jit = off"),
        call(
            queries.QUERY_ENTITY_TERM_MATCH_SQL,
            (["abeta"], 1),
        ),
    ]


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
        queries.PAPER_SEARCH_SQL_NO_TITLE_SIMILARITY,
        (
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            "This is a representative discussion sentence.",
            normalize_title_key("This is a representative discussion sentence."),
            "run-1",
            5,
            120,
            5,
        ),
    )


def test_describe_paper_search_route_surfaces_global_fts_only_path(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)

    route = repo.describe_paper_search_route(
        graph_run_id="run-1",
        query=(
            "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
            "maturation and brain development in the rat"
        ),
        limit=5,
        use_title_similarity=False,
        use_title_candidate_lookup=True,
    )

    assert route == "paper_search_global_fts_only"


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
            200,
            120,
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
    repo._resolve_query_entity_concepts = MagicMock(return_value=[])
    repo._is_current_graph_run = MagicMock(return_value=False)

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
    repo._resolve_query_entity_concepts = MagicMock(return_value=[])

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


def test_search_entity_papers_uses_current_map_sql_for_current_graph(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(return_value=[])
    repo._is_current_graph_run = MagicMock(return_value=True)

    repo.search_entity_papers(
        "run-current",
        entity_terms=["melatonin"],
        limit=5,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_ENTITY_SEARCH_CURRENT_MAP_SQL,
        (
            ["melatonin"],
            ENTITY_FUZZY_SIMILARITY_THRESHOLD,
            ENTITY_TOP_CONCEPTS_PER_TERM,
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
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="GM2 gangliosidosis variant B1",
                resolved_term="GM2 gangliosidosis variant B1",
                entity_type="disease",
                concept_namespace="mesh",
                concept_id="D005776",
                rule_confidence="high",
            )
        ]
    )
    repo._is_current_graph_run = MagicMock(return_value=False)

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
            ["disease"],
            ["mesh"],
            ["D005776"],
            "run-1",
            5,
        ),
    )


def test_ranked_entity_and_relation_queries_project_ranked_alias_columns():
    for sql in (
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL,
        queries.PAPER_ENTITY_EXACT_SEARCH_CURRENT_MAP_SQL,
        queries.PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL,
        queries.PAPER_ENTITY_SEARCH_SQL,
        queries.PAPER_ENTITY_SEARCH_CURRENT_MAP_SQL,
        queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL,
        queries.PAPER_RELATION_SEARCH_SQL,
        queries.PAPER_RELATION_SEARCH_CURRENT_MAP_SQL,
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
    repo._is_current_graph_run = MagicMock(return_value=False)

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


def test_search_relation_papers_uses_current_map_sql_for_current_graph(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._is_current_graph_run = MagicMock(return_value=True)

    repo.search_relation_papers(
        "run-current",
        relation_terms=["positive_correlate"],
        limit=5,
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.PAPER_RELATION_SEARCH_CURRENT_MAP_SQL,
        (["positive_correlate"], 5, 5),
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
    assert hits[0].dense_score == 0.0
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
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="melatonin",
                resolved_term="melatonin",
                entity_type="chemical",
                concept_namespace="mesh",
                concept_id="D008874",
                rule_confidence=None,
            )
        ]
    )

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
        (
            ["melatonin"],
            ["chemical"],
            ["mesh"],
            ["D008874"],
            [101],
            [101],
            5,
        ),
    )


def test_runtime_entity_queries_use_canonical_entity_mentions():
    assert "JOIN solemd.paper_entity_mentions pem" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "JOIN solemd.paper_entity_mentions pem" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "ranked_papers AS (" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "\n,\n" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "ranked_papers AS (" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "\n,\n" in queries.PAPER_ENTITY_SEARCH_SQL


def test_fetch_entity_matches_uses_provided_resolved_concepts_without_reresolving_terms():
    conn = MagicMock()
    conn.__enter__.return_value = conn
    conn.cursor.return_value.__enter__.return_value.fetchall.return_value = [
        {
            "corpus_id": 101,
            "entity_type": "chemical",
            "concept_id": "MESH:D005947",
            "matched_terms": ["fluoxetine"],
            "mention_count": 2,
            "structural_span_count": 1,
            "retrieval_default_mention_count": 1,
            "score": 0.61,
        }
    ]
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(
        side_effect=AssertionError("resolved concepts should be forwarded directly")
    )
    resolved_concept = ResolvedEntityConcept(
        raw_term="Prozac",
        resolved_term="fluoxetine",
        entity_type="chemical",
        concept_namespace="mesh",
        concept_id="D005947",
    )

    hits = repo.fetch_entity_matches(
        [101],
        entity_terms=["fluoxetine"],
        resolved_concepts=[resolved_concept],
    )

    assert 101 in hits
    assert hits[101][0].concept_id == "MESH:D005947"
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.ENTITY_MATCH_SQL,
        (
            ["Prozac"],
            ["chemical"],
            ["mesh"],
            ["D005947"],
            [101],
            [101],
            5,
        ),
    )
    assert "FROM top_concepts tc" in queries.ENTITY_MATCH_SQL
    assert "JOIN solemd.paper_entity_mentions pem" in queries.ENTITY_MATCH_SQL
    assert "POSITION(" not in queries.ENTITY_MATCH_SQL
    assert "JOIN solemd.entity_aliases ea" in queries.QUERY_ENTITY_TERM_MATCH_SQL
    assert "JOIN solemd.entity_aliases ea" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "JOIN solemd.paper_entity_mentions pem" not in queries.QUERY_ENTITY_TERM_MATCH_SQL
    assert "lower(e.canonical_name)" not in queries.QUERY_ENTITY_TERM_MATCH_SQL
    assert "('MESH:' || qt.raw_term)" in queries.QUERY_ENTITY_TERM_MATCH_SQL
    assert "AS resolved(raw_term, entity_type, concept_namespace, concept_id)" in (
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    )
    assert "JOIN solemd.entities e" not in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "pem.runtime_concept_namespace_key" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "pem.runtime_concept_id_key" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "pem.runtime_entity_type_key" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "concept_namespace IS NOT NULL" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "concept_namespace IS NULL" in queries.PAPER_ENTITY_EXACT_SEARCH_SQL
    assert "dnamutation" in queries.PAPER_ENTITY_SEARCH_SQL
    assert "pubtator.entity_annotations" not in queries.ENTITY_MATCH_SQL


def test_search_entity_papers_keeps_raw_alias_terms_for_exact_fast_path(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "paper_id": "paper-202",
                "title": "Fluoxetine treatment paper",
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
                "has_curated_journal_family": False,
                "journal_family_type": None,
                "entity_rule_families": 0,
                "entity_rule_count": 0,
                "entity_core_families": 1,
                "entity_candidate_score": 1.0,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock(
        return_value=[
            ResolvedEntityConcept(
                raw_term="Prozac",
                resolved_term="fluoxetine",
                entity_type="chemical",
                concept_namespace="mesh",
                concept_id="D005947",
                rule_confidence=None,
            )
        ]
    )
    repo._is_current_graph_run = MagicMock(return_value=False)

    hits = repo.search_entity_papers(
        "run-1",
        entity_terms=["Prozac"],
        limit=5,
    )

    assert [hit.corpus_id for hit in hits] == [202]
    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list[0] == call(
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL,
        (
            ["Prozac"],
            ["chemical"],
            ["mesh"],
            ["D005947"],
            "run-1",
            5,
        ),
    )


def test_search_entity_papers_uses_provided_resolved_concepts_for_exact_fast_path(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "paper_id": "paper-202",
                "title": "Fluoxetine treatment paper",
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
                "has_curated_journal_family": False,
                "journal_family_type": None,
                "entity_rule_families": 0,
                "entity_rule_count": 0,
                "entity_core_families": 1,
                "entity_candidate_score": 1.0,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._resolve_query_entity_concepts = MagicMock()
    repo._is_current_graph_run = MagicMock(return_value=False)

    hits = repo.search_entity_papers(
        "run-1",
        entity_terms=["fluoxetine"],
        resolved_concepts=[
            ResolvedEntityConcept(
                raw_term="Prozac",
                resolved_term="fluoxetine",
                entity_type="chemical",
                concept_namespace="mesh",
                concept_id="D005947",
                rule_confidence="high",
                source_surface="vocab_alias",
            )
        ],
        limit=5,
    )

    assert [hit.corpus_id for hit in hits] == [202]
    repo._resolve_query_entity_concepts.assert_not_called()
    cur = conn.cursor.return_value.__enter__.return_value
    assert cur.execute.call_args_list[0] == call(
        queries.PAPER_ENTITY_EXACT_SEARCH_SQL,
        (
            ["Prozac"],
            ["chemical"],
            ["mesh"],
            ["D005947"],
            "run-1",
            5,
        ),
    )


def test_fetch_species_profiles_maps_rows(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 202,
                "human_mentions": 4,
                "nonhuman_mentions": 0,
                "common_model_mentions": 0,
            }
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    profiles = repo.fetch_species_profiles([202, 202])

    assert list(profiles) == [202]
    assert profiles[202].human_mentions == 4
    assert profiles[202].nonhuman_mentions == 0
    assert profiles[202].common_model_mentions == 0
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.SPECIES_PROFILE_SQL,
        (
            "9606",
            "9606",
            ["10090", "10116", "9615", "9031", "7955", "7227", "6239"],
            [202],
        ),
    )


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


def test_fetch_citation_contexts_caps_query_terms_to_high_information_subset(mock_conn):
    conn = mock_conn(rows=[])
    repo = PostgresRagRepository(connect=lambda: conn)

    repo.fetch_citation_contexts(
        [13035531],
        query=(
            'Nineteen individual items generate seven "component" scores: '
            "subjective sleep quality, sleep latency, sleep duration, habitual "
            "sleep efficiency, sleep disturbances, use of sleeping medication, "
            "and daytime dysfunction."
        ),
    )

    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.CITATION_CONTEXT_SQL,
        (
            [
                "nineteen",
                "individual",
                "component",
                "subjective",
                "efficiency",
                "disturbances",
                "medication",
                "dysfunction",
            ],
            [13035531],
            [13035531],
            [13035531],
            [13035531],
            3,
        ),
    )


def test_fetch_authors_returns_ordered_top_authors(mock_conn):
    conn = mock_conn(
        rows=[
            {
                "corpus_id": 101,
                "author_position": 1,
                "author_id": "author-1",
                "name": "Jane Doe",
            },
            {
                "corpus_id": 101,
                "author_position": 2,
                "author_id": "author-2",
                "name": "John Smith",
            },
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)

    authors = repo.fetch_authors([101, 101], limit_per_paper=2)

    assert list(authors) == [101]
    assert [author.name for author in authors[101]] == ["Jane Doe", "John Smith"]
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.AUTHOR_LOOKUP_SQL,
        ([101], 2),
    )


def test_runtime_sql_uses_materialized_citation_contexts_and_runtime_entity_keys():
    assert "FROM solemd.citation_contexts cc" in queries.CITATION_CONTEXT_SQL
    assert "WHERE\n        AND (" not in queries.CITATION_CONTEXT_SQL
    assert "pem.runtime_concept_namespace_key" in queries.ENTITY_MATCH_SQL
    assert "pem.runtime_concept_id_key" in queries.ENTITY_MATCH_SQL
    assert "pem.runtime_entity_type_key" in queries.PAPER_ENTITY_SEARCH_SQL


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
    assert "phraseto_tsquery('english', %s)" in queries.PAPER_TITLE_FTS_CANDIDATE_SQL
    assert (
        "to_tsvector('english', coalesce(p.title, '')) @@"
        in queries.PAPER_TITLE_FTS_CANDIDATE_SQL
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
            call("SET LOCAL hnsw.ef_search = 60"),
            call("SET LOCAL hnsw.max_scan_tuples = 20000"),
            call(
                queries.SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL,
                ("[0.1,0.2,0.3]", 101, "[0.1,0.2,0.3]", 40, "run-1", 1),
            ),
        ]
    )


def test_describe_dense_query_route_reports_dense_specific_ann_settings():
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"index_ready": True}
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=False)
    repo._graph_scope_coverages["run-1"] = 1.0

    route = repo.describe_dense_query_route(graph_run_id="run-1", limit=2)

    assert route == {
        "route": "dense_query_ann_broad_scope",
        "candidate_limit": 10,
        "search_mode": "ann",
        "hnsw_ef_search": 32,
        "hnsw_max_scan_tuples": 8000,
    }


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
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(return_value=[_paper_hit(404)])
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [404]
    assert hits[0].dense_score == 0.91
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_called_once_with([404])
    repo._should_use_exact_graph_search.assert_called_once_with("run-1")
    cur.execute.assert_has_calls(
        [
            call(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL),
            call("SET LOCAL hnsw.iterative_scan = strict_order"),
            call("SET LOCAL hnsw.ef_search = 32"),
            call("SET LOCAL hnsw.max_scan_tuples = 8000"),
            call(
                queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                (vector_literal, vector_literal, 10, "run-1", 1),
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
            "distance": 0.09,
        }
    ]
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False

    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=True)
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(return_value=[_paper_hit(404)])
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=1,
    )

    assert [hit.corpus_id for hit in hits] == [404]
    assert hits[0].dense_score == 0.91
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_called_once_with([404])
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
    conn = mock_conn(rows=[{"corpus_id": 202, "distance": 0.11}])
    repo = PostgresRagRepository(connect=lambda: conn)
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(return_value=[_paper_hit(202)])
    query_embedding = [0.1, 0.2, 0.3]
    vector_literal = format_vector_literal(query_embedding)

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=query_embedding,
        limit=5,
        scope_corpus_ids=[101, 202, 101],
    )

    assert [hit.corpus_id for hit in hits] == [202]
    assert hits[0].dense_score == 0.89
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_called_once_with([202])
    cur = conn.cursor.return_value.__enter__.return_value
    cur.execute.assert_called_once_with(
        queries.DENSE_QUERY_SEARCH_IN_SELECTION_SQL,
        (vector_literal, [101, 202], vector_literal, 5),
    )


def test_search_query_embedding_papers_preserves_rank_order_after_hydration(mock_conn):
    conn = mock_conn(
        rows=[
            {"corpus_id": 404, "distance": 0.15},
            {"corpus_id": 303, "distance": 0.22},
        ]
    )
    repo = PostgresRagRepository(connect=lambda: conn)
    repo._should_use_exact_graph_search = MagicMock(return_value=True)
    repo.fetch_known_scoped_papers_by_corpus_ids = MagicMock(
        return_value=[_paper_hit(303), _paper_hit(404)]
    )

    hits = repo.search_query_embedding_papers(
        graph_run_id="run-1",
        query_embedding=[0.1, 0.2, 0.3],
        limit=2,
    )

    assert [hit.corpus_id for hit in hits] == [404, 303]
    assert [hit.dense_score for hit in hits] == [0.85, 0.78]
    repo.fetch_known_scoped_papers_by_corpus_ids.assert_called_once_with([404, 303])
