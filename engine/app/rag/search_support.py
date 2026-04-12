"""Shared support helpers for runtime search execution."""

from __future__ import annotations

from contextlib import nullcontext
from inspect import Parameter, signature

from app.rag.clinical_priors import infer_clinical_query_intent
from app.rag.models import PaperRetrievalQuery
from app.rag.query_enrichment import (
    determine_query_retrieval_profile,
    extract_query_metadata_hints,
    normalize_query_text,
    should_use_title_similarity,
)
from app.rag.repository import RagRepository
from app.rag.schemas import RagSearchRequest
from app.rag.types import QueryRetrievalProfile, RetrievalScope

EVIDENCE_TYPE_RERANK_MIN = 20


def _normalize_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(stripped)
    return normalized


def _normalize_relation_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        canonical = stripped.lower().replace("-", "_").replace(" ", "_")
        if canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(canonical)
    return normalized


def _normalize_refs(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        normalized.append(stripped)
    return normalized


def callable_supports_kwarg(func: object, kwarg: str) -> bool:
    try:
        params = signature(func).parameters.values()
    except (TypeError, ValueError):
        return False
    return any(param.kind == Parameter.VAR_KEYWORD for param in params) or any(
        param.name == kwarg for param in params
    )


def build_query(request: RagSearchRequest) -> PaperRetrievalQuery:
    selected_graph_paper_ref = request.selected_graph_paper_ref
    if selected_graph_paper_ref is None and request.selected_layer_key == "paper":
        selected_graph_paper_ref = request.selected_node_id

    selection_graph_paper_refs = _normalize_refs(request.selection_graph_paper_refs)
    if (
        request.scope_mode == RetrievalScope.SELECTION_ONLY
        and not selection_graph_paper_refs
        and selected_graph_paper_ref
    ):
        selection_graph_paper_refs = [selected_graph_paper_ref]

    metadata_hints = extract_query_metadata_hints(request.query)
    focused_query = metadata_hints.topic_query or request.query
    rerank_topn = max(request.k, request.rerank_topn)
    if metadata_hints.has_evidence_type_filters:
        rerank_topn = max(rerank_topn, EVIDENCE_TYPE_RERANK_MIN)
    retrieval_profile = determine_query_retrieval_profile(
        request.query,
        allow_terminal_title_punctuation=bool(selected_graph_paper_ref)
        or request.selected_layer_key == "paper",
        metadata_hints=metadata_hints,
    )

    return PaperRetrievalQuery(
        graph_release_id=request.graph_release_id,
        query=request.query,
        focused_query=focused_query,
        normalized_query=normalize_query_text(focused_query),
        metadata_hints=metadata_hints,
        entity_terms=_normalize_terms(request.entity_terms),
        relation_terms=_normalize_relation_terms(request.relation_terms),
        cited_corpus_ids=list(request.cited_corpus_ids),
        selected_layer_key=request.selected_layer_key,
        selected_node_id=request.selected_node_id,
        selected_graph_paper_ref=selected_graph_paper_ref,
        selection_graph_paper_refs=selection_graph_paper_refs,
        selected_cluster_id=request.selected_cluster_id,
        scope_mode=request.scope_mode,
        retrieval_profile=retrieval_profile,
        clinical_intent=infer_clinical_query_intent(focused_query),
        evidence_intent=request.evidence_intent,
        k=request.k,
        rerank_topn=rerank_topn,
        use_lexical=request.use_lexical,
        use_title_candidate_lookup=retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP,
        use_title_similarity=should_use_title_similarity(
            request.query,
            retrieval_profile=retrieval_profile,
        ),
        use_dense_query=request.use_dense_query,
        generate_answer=request.generate_answer,
    )


def repository_search_session(repository: RagRepository):
    session_factory = getattr(repository, "search_session", None)
    if callable(session_factory):
        return session_factory()
    return nullcontext()
