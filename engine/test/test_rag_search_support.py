from __future__ import annotations

from app.rag.schemas import RagSearchRequest
from app.rag.search_support import EVIDENCE_TYPE_RERANK_MIN, build_query


def test_build_query_keeps_default_rerank_window_for_citation_style_metadata():
    query = build_query(
        RagSearchRequest(
            graph_release_id="current",
            query="Neurology 2018 score that predicts 1-year functional status",
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
        )
    )

    assert query.rerank_topn == 10


def test_build_query_expands_rerank_window_for_evidence_type_prompts():
    query = build_query(
        RagSearchRequest(
            graph_release_id="current",
            query="meta-analysis evidence analysis brain derived neurotrophic factor val66met",
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
        )
    )

    assert query.rerank_topn == EVIDENCE_TYPE_RERANK_MIN
