from __future__ import annotations

from app.rag.models import PaperRetrievalQuery
from app.rag.query_metadata import QueryMetadataHints
from app.rag.search_plan import build_search_plan
from app.rag.types import QueryRetrievalProfile


def _query(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    selected_graph_paper_ref: str | None = None,
    cited_corpus_ids: list[int] | None = None,
    metadata_hints: QueryMetadataHints | None = None,
) -> PaperRetrievalQuery:
    return PaperRetrievalQuery(
        graph_release_id="release-1",
        query=text,
        normalized_query=text.lower(),
        retrieval_profile=retrieval_profile,
        selected_graph_paper_ref=selected_graph_paper_ref,
        cited_corpus_ids=cited_corpus_ids or [],
        metadata_hints=metadata_hints or QueryMetadataHints(),
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
    assert plan.allow_exact_title_matches is True
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
    assert plan.allow_exact_title_matches is True
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
    assert plan.allow_exact_title_matches is True
    assert plan.use_paper_lexical is True
    assert plan.use_chunk_lexical is False
    assert plan.expand_citation_frontier is True


def test_build_search_plan_assigns_cited_context_bonus_when_user_supplies_citations():
    plan = build_search_plan(
        _query(
            "melatonin delirium",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
            cited_corpus_ids=[12345],
        )
    )

    assert plan.cited_context_bonus > 0


def test_build_search_plan_keeps_metadata_queries_precise():
    plan = build_search_plan(
        _query(
            "Neurology 2018 score that predicts 1-year functional status",
            retrieval_profile=QueryRetrievalProfile.GENERAL,
            metadata_hints=QueryMetadataHints(
                topic_query="score that predicts 1-year functional status",
                year_hint=2018,
                author_hint="Neurology",
                journal_hint="Neurology",
                matched_cues=("author", "journal", "year"),
            ),
        )
    )

    assert plan.use_paper_lexical is True
    assert plan.use_chunk_lexical is False
    assert plan.expand_citation_frontier is False
    assert plan.prefer_precise_grounding is True


def test_build_search_plan_keeps_title_lookup_cited_prior_disabled():
    plan = build_search_plan(
        _query(
            "Selected Paper Title",
            retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
            cited_corpus_ids=[12345],
        )
    )

    assert plan.cited_context_bonus == 0.0
