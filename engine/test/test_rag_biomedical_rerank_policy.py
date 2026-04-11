from __future__ import annotations

from app.config import settings
from app.rag.models import PaperRetrievalQuery
from app.rag.retrieval_policy import biomedical_rerank_window
from app.rag.types import QueryRetrievalProfile


def _query(
    *,
    retrieval_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    rerank_topn: int,
) -> PaperRetrievalQuery:
    return PaperRetrievalQuery(
        graph_release_id="current",
        query="semantic biomedical query",
        normalized_query="semantic biomedical query",
        retrieval_profile=retrieval_profile,
        rerank_topn=rerank_topn,
    )


def test_biomedical_rerank_window_uses_general_cap_for_general_queries():
    previous_general_topn = settings.rag_live_biomedical_reranker_topn
    previous_passage_topn = settings.rag_live_biomedical_reranker_passage_topn
    settings.rag_live_biomedical_reranker_topn = 18
    settings.rag_live_biomedical_reranker_passage_topn = 8
    try:
        assert biomedical_rerank_window(_query(rerank_topn=6)) == 6
        assert biomedical_rerank_window(_query(rerank_topn=18)) == 18
        assert biomedical_rerank_window(_query(rerank_topn=40)) == 18
    finally:
        settings.rag_live_biomedical_reranker_topn = previous_general_topn
        settings.rag_live_biomedical_reranker_passage_topn = previous_passage_topn


def test_biomedical_rerank_window_uses_tighter_cap_for_passage_and_question_queries():
    previous_general_topn = settings.rag_live_biomedical_reranker_topn
    previous_passage_topn = settings.rag_live_biomedical_reranker_passage_topn
    settings.rag_live_biomedical_reranker_topn = 18
    settings.rag_live_biomedical_reranker_passage_topn = 8
    try:
        assert (
            biomedical_rerank_window(
                _query(
                    retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
                    rerank_topn=18,
                )
            )
            == 8
        )
        assert (
            biomedical_rerank_window(
                _query(
                    retrieval_profile=QueryRetrievalProfile.QUESTION_LOOKUP,
                    rerank_topn=40,
                )
            )
            == 8
        )
    finally:
        settings.rag_live_biomedical_reranker_topn = previous_general_topn
        settings.rag_live_biomedical_reranker_passage_topn = previous_passage_topn


def test_biomedical_rerank_window_skips_title_lookup_queries():
    previous_general_topn = settings.rag_live_biomedical_reranker_topn
    previous_passage_topn = settings.rag_live_biomedical_reranker_passage_topn
    settings.rag_live_biomedical_reranker_topn = 18
    settings.rag_live_biomedical_reranker_passage_topn = 8
    try:
        assert (
            biomedical_rerank_window(
                _query(
                    retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
                    rerank_topn=18,
                )
            )
            == 0
        )
    finally:
        settings.rag_live_biomedical_reranker_topn = previous_general_topn
        settings.rag_live_biomedical_reranker_passage_topn = previous_passage_topn
