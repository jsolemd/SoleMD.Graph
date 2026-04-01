"""Centralized runtime retrieval policy helpers."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import build_query_phrases, is_title_like_query, normalize_title_key
from app.rag.search_plan import RetrievalSearchPlan
from app.rag.types import QueryRetrievalProfile

MAX_CHUNK_FALLBACK_PHRASES = 8
MIN_CHUNK_FALLBACK_WORDS = 3


def chunk_search_queries(query: PaperRetrievalQuery) -> list[str]:
    """Build bounded passage-search fallbacks when the full sentence misses."""

    primary_query = query.normalized_query or query.query.strip()
    if not primary_query:
        return []
    if query.retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return [primary_query]

    candidates = [primary_query]
    seen = {primary_query}
    for phrase in build_query_phrases(primary_query):
        if len(phrase.split()) < MIN_CHUNK_FALLBACK_WORDS or phrase in seen:
            continue
        seen.add(phrase)
        candidates.append(phrase)
        if len(candidates) >= MAX_CHUNK_FALLBACK_PHRASES + 1:
            break
    return candidates


def has_exact_lexical_title_anchor(
    *,
    query_text: str,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when lexical retrieval already surfaced the exact title target."""

    if not lexical_hits or not is_title_like_query(
        query_text,
        allow_terminal_punctuation=True,
    ):
        return False
    query_key = normalize_title_key(query_text)
    if not query_key:
        return False
    return normalize_title_key(lexical_hits[0].title) == query_key


def should_skip_runtime_entity_enrichment(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Skip expensive enrichment when an exact title anchor already resolved the query."""

    return not query.entity_terms and has_exact_lexical_title_anchor(
        query_text=query.query,
        lexical_hits=lexical_hits,
    )


def should_run_dense_query(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Allow dense query search only when it adds real recall beyond lexical anchors."""

    if not query.use_dense_query:
        return False
    return not (
        search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and has_exact_lexical_title_anchor(
            query_text=query.query,
            lexical_hits=lexical_hits,
        )
    )


def should_fetch_semantic_neighbors(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    selected_corpus_id: int | None,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Allow selected-paper semantic neighbors only when they provide useful expansion."""

    if selected_corpus_id is None:
        return False
    if search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return not has_exact_lexical_title_anchor(
            query_text=query.query,
            lexical_hits=lexical_hits,
        )
    return True


def should_expand_citation_frontier(
    *,
    query_text: str,
    lexical_hits: Sequence[PaperEvidenceHit],
    search_plan: RetrievalSearchPlan,
) -> bool:
    """Keep citation-frontier expansion behind exact-title and profile guards."""

    return search_plan.expand_citation_frontier and not has_exact_lexical_title_anchor(
        query_text=query_text,
        lexical_hits=lexical_hits,
    )


def has_direct_retrieval_support(
    *,
    paper: PaperEvidenceHit,
    retrieval_profile: QueryRetrievalProfile,
) -> bool:
    """Return True when a paper has direct query support for the current profile."""

    if retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        return paper.chunk_lexical_score > 0 or paper.lexical_score > 0
    if retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return (
            paper.lexical_score > 0
            or paper.title_anchor_score > 0
            or paper.selected_context_score > 0
        )
    return any(
        score > 0
        for score in (
            paper.lexical_score,
            paper.chunk_lexical_score,
            paper.dense_score,
            paper.entity_score,
            paper.relation_score,
        )
    )


def citation_context_candidate_ids(
    *,
    paper_hits: Sequence[PaperEvidenceHit],
    retrieval_profile: QueryRetrievalProfile,
) -> list[int]:
    """Limit citation-context scoring to candidates that already have direct evidence."""

    if retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return [hit.corpus_id for hit in paper_hits]

    return [
        hit.corpus_id
        for hit in paper_hits
        if has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
    ]
