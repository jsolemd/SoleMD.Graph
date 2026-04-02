"""Centralized runtime retrieval policy helpers."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import build_query_phrases, has_query_entity_surface_signal
from app.rag.search_plan import RetrievalSearchPlan
from app.rag.title_anchor import has_strong_title_anchor
from app.rag.types import QueryRetrievalProfile

MAX_CHUNK_FALLBACK_PHRASES = 8
MIN_CHUNK_FALLBACK_WORDS = 3
MIN_PASSAGE_ENRICHMENT_CANDIDATES = 12
PASSAGE_ENRICHMENT_K_MULTIPLIER = 2


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


def has_strong_lexical_title_anchor(
    *,
    query_text: str,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when lexical retrieval already surfaced a strong title anchor."""

    if not lexical_hits:
        return False
    return has_strong_title_anchor(
        query_text=query_text,
        title_text=lexical_hits[0].title,
    )


def should_skip_runtime_entity_enrichment(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Skip expensive enrichment when an exact title anchor already resolved the query."""

    if query.entity_terms:
        return True
    if has_strong_lexical_title_anchor(
        query_text=query.query,
        lexical_hits=lexical_hits,
    ):
        return True
    if query.relation_terms:
        return False
    return not has_query_entity_surface_signal(query.query)


def should_run_dense_query(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    lexical_hits: Sequence[PaperEvidenceHit],
    selected_direct_anchor: bool = False,
) -> bool:
    """Allow dense query search only when it adds real recall beyond lexical anchors."""

    if not query.use_dense_query:
        return False
    if selected_direct_anchor and search_plan.prefer_precise_grounding:
        return False
    return not (
        search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and has_strong_lexical_title_anchor(
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
    selected_direct_anchor: bool = False,
) -> bool:
    """Allow selected-paper semantic neighbors only when they provide useful expansion."""

    if selected_corpus_id is None:
        return False
    if selected_direct_anchor and search_plan.prefer_precise_grounding:
        return False
    if search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return not has_strong_lexical_title_anchor(
            query_text=query.query,
            lexical_hits=lexical_hits,
        )
    return True


def has_selected_direct_anchor(
    *,
    selected_corpus_id: int | None,
    retrieval_profile: QueryRetrievalProfile,
    paper_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when the selected paper already has direct support from the query."""

    if selected_corpus_id is None:
        return False
    return any(
        hit.corpus_id == selected_corpus_id
        and has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
        for hit in paper_hits
    )


def should_expand_citation_frontier(
    *,
    query_text: str,
    lexical_hits: Sequence[PaperEvidenceHit],
    search_plan: RetrievalSearchPlan,
) -> bool:
    """Keep citation-frontier expansion behind exact-title and profile guards."""

    return search_plan.expand_citation_frontier and not has_strong_lexical_title_anchor(
        query_text=query_text,
        lexical_hits=lexical_hits,
    )


def should_prefetch_citation_contexts(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Skip pre-ranking citation fetch when a strong title anchor already resolved recall."""

    return not (
        query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and has_strong_lexical_title_anchor(
            query_text=query.query,
            lexical_hits=lexical_hits,
        )
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


def entity_relation_candidate_ids(
    *,
    ranked_papers: Sequence[PaperEvidenceHit],
    retrieval_profile: QueryRetrievalProfile,
    k: int,
    rerank_topn: int,
    selected_corpus_id: int | None = None,
) -> list[int]:
    """Bound expensive entity/relation enrichment to the best-ranked candidates."""

    ordered_ids = [hit.corpus_id for hit in ranked_papers]
    if retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return ordered_ids

    shortlist_limit = min(
        len(ordered_ids),
        min(
            rerank_topn,
            max(MIN_PASSAGE_ENRICHMENT_CANDIDATES, k * PASSAGE_ENRICHMENT_K_MULTIPLIER),
        ),
    )
    direct_ids = [
        hit.corpus_id
        for hit in ranked_papers
        if has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
    ]

    prioritized: list[int] = []
    if selected_corpus_id is not None and selected_corpus_id in ordered_ids:
        prioritized.append(selected_corpus_id)
    prioritized.extend(direct_ids)
    prioritized.extend(ordered_ids)

    deduped: list[int] = []
    seen: set[int] = set()
    for corpus_id in prioritized:
        if corpus_id in seen:
            continue
        seen.add(corpus_id)
        deduped.append(corpus_id)
        if len(deduped) >= shortlist_limit:
            break
    return deduped
