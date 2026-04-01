from __future__ import annotations

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import normalize_query_text
from app.rag.retrieval_policy import (
    chunk_search_queries,
    citation_context_candidate_ids,
    has_direct_retrieval_support,
    has_exact_lexical_title_anchor,
    should_fetch_semantic_neighbors,
    should_run_dense_query,
)
from app.rag.search_plan import build_search_plan
from app.rag.types import QueryRetrievalProfile, RetrievalScope


def _paper_hit(
    corpus_id: int,
    *,
    title: str = "Example title",
    lexical_score: float = 0.0,
    chunk_lexical_score: float = 0.0,
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


def test_has_exact_lexical_title_anchor_normalizes_terminal_punctuation():
    lexical_hits = [
        _paper_hit(
            11,
            title="Selected paper title",
            lexical_score=1.0,
        )
    ]

    assert has_exact_lexical_title_anchor(
        query_text="Selected paper title.",
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


def test_citation_context_candidate_ids_only_include_direct_passage_support():
    direct = _paper_hit(11, chunk_lexical_score=0.95)
    indirect = _paper_hit(22)

    assert citation_context_candidate_ids(
        paper_hits=[direct, indirect],
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
    ) == [11]


def test_has_direct_retrieval_support_uses_selected_context_for_title_queries():
    assert has_direct_retrieval_support(
        paper=_paper_hit(11, selected_context_score=1.0),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
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
