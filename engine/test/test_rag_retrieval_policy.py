from __future__ import annotations

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import normalize_query_text
from app.rag.retrieval_policy import (
    chunk_search_queries,
    citation_context_candidate_ids,
    entity_relation_candidate_ids,
    has_direct_retrieval_support,
    has_selected_direct_anchor,
    has_strong_lexical_title_anchor,
    should_fetch_semantic_neighbors,
    should_run_biomedical_reranker,
    should_run_dense_query,
    should_skip_runtime_entity_enrichment,
)
from app.rag.search_plan import build_search_plan
from app.rag.types import QueryRetrievalProfile, RetrievalScope


def _paper_hit(
    corpus_id: int,
    *,
    title: str = "Example title",
    lexical_score: float = 0.0,
    chunk_lexical_score: float = 0.0,
    passage_alignment_score: float = 0.0,
    selected_context_score: float = 0.0,
) -> PaperEvidenceHit:
    return PaperEvidenceHit(
        corpus_id=corpus_id,
        paper_id=f"paper-{corpus_id}",
        semantic_scholar_paper_id=f"paper-{corpus_id}",
        title=title,
        journal_name="Example Journal",
        year=2024,
        doi=None,
        pmid=None,
        pmcid=None,
        abstract=None,
        tldr=None,
        text_availability="abstract",
        is_open_access=True,
        lexical_score=lexical_score,
        chunk_lexical_score=chunk_lexical_score,
        passage_alignment_score=passage_alignment_score,
        selected_context_score=selected_context_score,
    )


def _query(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    selected_node_id: str | None = None,
) -> PaperRetrievalQuery:
    return PaperRetrievalQuery(
        graph_release_id="current",
        query=text,
        normalized_query=normalize_query_text(text),
        selected_node_id=selected_node_id,
        retrieval_profile=retrieval_profile,
        scope_mode=RetrievalScope.GLOBAL,
    )


def test_has_strong_lexical_title_anchor_normalizes_terminal_punctuation():
    lexical_hits = [
        _paper_hit(
            11,
            title="Selected paper title",
            lexical_score=1.0,
        )
    ]

    assert has_strong_lexical_title_anchor(
        query_text="Selected paper title.",
        lexical_hits=lexical_hits,
    )


def test_has_strong_lexical_title_anchor_accepts_long_title_prefix():
    lexical_hits = [
        _paper_hit(
            11857184,
            title=(
                "Designing clinical trials for assessing the effects of cognitive "
                "training and physical activity interventions on cognitive outcomes: "
                "The Seniors Health and Activity Research Program Pilot "
                "(SHARP-P) Study, a randomized controlled trial"
            ),
            lexical_score=1.7,
        )
    ]

    assert has_strong_lexical_title_anchor(
        query_text=(
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot "
            "(SHARP-P) Study, a randomized"
        ),
        lexical_hits=lexical_hits,
    )


def test_should_run_dense_query_skips_exact_title_anchor_lookups():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    search_plan = build_search_plan(query)
    lexical_hits = [_paper_hit(11, title="Selected paper title", lexical_score=1.0)]

    assert not should_run_dense_query(
        query=query,
        search_plan=search_plan,
        lexical_hits=lexical_hits,
    )


def test_should_run_dense_query_skips_strong_title_prefix_anchor_lookups():
    query = _query(
        (
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot "
            "(SHARP-P) Study, a randomized"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )
    search_plan = build_search_plan(query)
    lexical_hits = [
        _paper_hit(
            11857184,
            title=(
                "Designing clinical trials for assessing the effects of cognitive "
                "training and physical activity interventions on cognitive outcomes: "
                "The Seniors Health and Activity Research Program Pilot "
                "(SHARP-P) Study, a randomized controlled trial"
            ),
            lexical_score=1.7,
        )
    ]

    assert not should_run_dense_query(
        query=query,
        search_plan=search_plan,
        lexical_hits=lexical_hits,
    )


def test_should_run_dense_query_skips_selected_direct_anchor_when_precision_is_preferred():
    query = _query(
        "Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )
    search_plan = build_search_plan(query)

    assert not should_run_dense_query(
        query=query,
        search_plan=search_plan,
        lexical_hits=[],
        selected_direct_anchor=True,
    )


def test_should_skip_runtime_entity_enrichment_skips_generic_passage_without_entity_signal():
    query = _query(
        (
            "This study aims to compare the prevalence of mental health symptoms "
            "between left-behind and non-left-behind children."
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert should_skip_runtime_entity_enrichment(
        query=query,
        lexical_hits=[],
    )


def test_should_skip_runtime_entity_enrichment_keeps_entity_like_queries_enabled():
    query = _query(
        "Neuropeptide Y (NPY) signaling in the cerebellum of Myotis lucifugus",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert not should_skip_runtime_entity_enrichment(
        query=query,
        lexical_hits=[],
    )


def test_should_fetch_semantic_neighbors_skips_selected_title_when_exact_anchor_exists():
    query = _query(
        "Selected paper title.",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )
    search_plan = build_search_plan(query)
    lexical_hits = [_paper_hit(11, title="Selected paper title", lexical_score=1.0)]

    assert not should_fetch_semantic_neighbors(
        query=query,
        search_plan=search_plan,
        selected_corpus_id=11,
        lexical_hits=lexical_hits,
    )


def test_should_fetch_semantic_neighbors_skips_selected_direct_anchor():
    query = _query(
        "Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        selected_node_id="paper:11",
    )
    search_plan = build_search_plan(query)

    assert not should_fetch_semantic_neighbors(
        query=query,
        search_plan=search_plan,
        selected_corpus_id=11,
        lexical_hits=[],
        selected_direct_anchor=True,
    )


def test_should_run_biomedical_reranker_only_for_global_passage_queries():
    query = _query(
        "Melatonin reduced postoperative delirium incidence in surgical patients.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    assert should_run_biomedical_reranker(
        query=query,
        selected_corpus_id=None,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
            _paper_hit(33, chunk_lexical_score=0.7),
        ],
        enabled=True,
    )


def test_should_run_biomedical_reranker_skips_selected_or_nonpassage_queries():
    title_query = _query(
        "Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )

    assert not should_run_biomedical_reranker(
        query=title_query,
        selected_corpus_id=None,
        ranked_papers=[_paper_hit(11, lexical_score=1.0) for _ in range(3)],
        enabled=True,
    )
    assert not should_run_biomedical_reranker(
        query=_query(
            "Melatonin reduced postoperative delirium incidence in surgical patients.",
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
            selected_node_id="paper:11",
        ),
        selected_corpus_id=11,
        ranked_papers=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
            _paper_hit(33, chunk_lexical_score=0.7),
        ],
        enabled=True,
    )


def test_citation_context_candidate_ids_only_include_direct_passage_support():
    direct = _paper_hit(11, chunk_lexical_score=0.95)
    indirect = _paper_hit(22)

    assert citation_context_candidate_ids(
        paper_hits=[direct, indirect],
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    ) == [11]


def test_entity_relation_candidate_ids_bounds_passage_enrichment_to_direct_candidates():
    ranked = [
        _paper_hit(11, chunk_lexical_score=0.95),
        _paper_hit(22, chunk_lexical_score=0.7),
        _paper_hit(33),
        _paper_hit(44),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        k=1,
        rerank_topn=4,
        selected_corpus_id=22,
    ) == [22, 11, 33, 44]


def test_entity_relation_candidate_ids_keeps_full_rank_order_for_non_passage_queries():
    ranked = [
        _paper_hit(11, lexical_score=0.95),
        _paper_hit(22, lexical_score=0.7),
        _paper_hit(33),
    ]

    assert entity_relation_candidate_ids(
        ranked_papers=ranked,
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        k=1,
        rerank_topn=3,
    ) == [11, 22, 33]


def test_has_direct_retrieval_support_uses_selected_context_for_title_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, selected_context_score=1.0),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
    )


def test_has_direct_retrieval_support_uses_passage_alignment_for_passage_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, passage_alignment_score=0.7),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )


def test_has_selected_direct_anchor_matches_selected_hit_with_direct_support():
    assert has_selected_direct_anchor(
        selected_corpus_id=11,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        paper_hits=[
            _paper_hit(11, chunk_lexical_score=0.9),
            _paper_hit(22, chunk_lexical_score=0.8),
        ],
    )


def test_chunk_search_queries_adds_bounded_phrase_fallbacks_for_passages():
    query = _query(
        "This representative discussion sentence should use chunk lexical retrieval.",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert (
        candidates[0]
        == "this representative discussion sentence should use chunk lexical retrieval"
    )
    assert len(candidates) > 1
    assert all(len(candidate.split()) >= 3 for candidate in candidates[1:])


def test_chunk_search_queries_prioritizes_specific_clinical_comparator_phrases():
    query = _query(
        (
            "In adults with active rheumatoid arthritis, is sarilumab monotherapy "
            "more effective and safe than adalimumab monotherapy?"
        ),
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    )

    candidates = chunk_search_queries(query)

    assert candidates[0] == (
        "in adults with active rheumatoid arthritis is sarilumab monotherapy more "
        "effective and safe than adalimumab monotherapy"
    )
    assert "sarilumab monotherapy more effective" in candidates
    assert any(
        "rheumatoid arthritis" in candidate or "sarilumab monotherapy" in candidate
        for candidate in candidates[1:4]
    )
    assert "in adults with active" not in candidates[1:]
