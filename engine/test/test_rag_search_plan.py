from __future__ import annotations

from app.rag.models import PaperRetrievalQuery
from app.rag.search_plan import build_search_plan
from app.rag.types import QueryRetrievalProfile


def _query(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    selected_graph_paper_ref: str | None = None,
) -> PaperRetrievalQuery:
    return PaperRetrievalQuery(
        graph_release_id="release-1",
        query=text,
        normalized_query=text.lower(),
        retrieval_profile=retrieval_profile,
        selected_graph_paper_ref=selected_graph_paper_ref,
    )


def test_build_search_plan_preserves_selected_title_queries():
    plan = build_search_plan(
        _query(
            "Selected Paper Title",
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
            selected_graph_paper_ref="paper:11",
        )
    )

    assert plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
    assert plan.use_paper_lexical is True
    assert plan.expand_citation_frontier is False
    assert plan.preserve_selected_candidate is True
    assert plan.selected_context_bonus > 0


def test_build_search_plan_prefers_precision_for_passage_queries():
    plan = build_search_plan(
        _query(
            "This representative discussion sentence should use chunk lexical retrieval",
            retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        )
    )

    assert plan.retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
    assert plan.use_paper_lexical is False
    assert plan.use_chunk_lexical is True
    assert plan.fallback_to_paper_lexical_on_empty_chunk is True
    assert plan.expand_citation_frontier is False
    assert plan.prefer_precise_grounding is True


def test_build_search_plan_leaves_general_queries_exploratory():
    plan = build_search_plan(
        _query(
            "melatonin delirium",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
        )
    )

    assert plan.retrieval_profile == QueryRetrievalProfile.GENERAL
    assert plan.use_paper_lexical is True
    assert plan.use_chunk_lexical is False
    assert plan.expand_citation_frontier is True
