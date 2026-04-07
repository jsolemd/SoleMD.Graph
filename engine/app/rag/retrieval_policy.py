"""Centralized runtime retrieval policy helpers."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import (
    build_query_phrases,
    has_query_entity_surface_signal,
    has_statistical_surface_signal,
)
from app.rag.search_plan import RetrievalSearchPlan
from app.rag.title_anchor import has_strong_title_anchor
from app.rag.types import ClinicalQueryIntent, QueryRetrievalProfile, RetrievalScope

MAX_CHUNK_FALLBACK_PHRASES = 8
MIN_CHUNK_FALLBACK_WORDS = 3
MIN_PASSAGE_ENRICHMENT_CANDIDATES = 12
PASSAGE_ENRICHMENT_K_MULTIPLIER = 2
MIN_BIOMEDICAL_RERANK_CANDIDATES = 3
MIN_DIRECT_PASSAGE_ALIGNMENT = 0.55
MAX_WEAK_PASSAGE_CHUNK_HITS = 2
MAX_WEAK_PASSAGE_TOP_CHUNK_SCORE = 0.0014
CHUNK_FALLBACK_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "by",
        "can",
        "do",
        "does",
        "for",
        "from",
        "in",
        "is",
        "of",
        "on",
        "or",
        "than",
        "the",
        "to",
        "vs",
        "with",
    }
)
CHUNK_FALLBACK_BONUS_TOKENS = frozenset(
    {
        "compared",
        "differentiate",
        "distinguish",
        "effective",
        "improve",
        "improved",
        "monotherapy",
        "predict",
        "predicts",
        "safe",
        "safety",
        "versus",
    }
)


def _chunk_fallback_sort_key(phrase: str, original_index: int) -> tuple[int, int, int]:
    tokens = phrase.split()
    informative_tokens = [
        token for token in tokens if token not in CHUNK_FALLBACK_STOPWORDS
    ]
    bonus_score = sum(token in CHUNK_FALLBACK_BONUS_TOKENS for token in tokens)
    long_token_score = sum(len(token) >= 8 for token in informative_tokens)
    specificity_score = (
        (len(informative_tokens) * 4)
        + (long_token_score * 2)
        + (bonus_score * 3)
        - (2 if tokens and tokens[0] in CHUNK_FALLBACK_STOPWORDS else 0)
    )
    return (-specificity_score, -len(tokens), original_index)


def chunk_search_queries(query: PaperRetrievalQuery) -> list[str]:
    """Build bounded passage-search fallbacks when the full sentence misses."""

    raw_query = query.query.strip()
    primary_query = query.normalized_query or raw_query
    if not primary_query and not raw_query:
        return []
    if query.retrieval_profile not in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        return [primary_query]

    candidates: list[str] = []
    seen: set[str] = set()
    if raw_query and has_statistical_surface_signal(raw_query):
        candidates.append(raw_query)
        seen.add(raw_query)
    if primary_query and primary_query not in seen:
        candidates.append(primary_query)
        seen.add(primary_query)
    fallback_phrases: list[tuple[int, str]] = []
    for index, phrase in enumerate(build_query_phrases(primary_query)):
        if len(phrase.split()) < MIN_CHUNK_FALLBACK_WORDS or phrase in seen:
            continue
        seen.add(phrase)
        fallback_phrases.append((index, phrase))
    for original_index, phrase in sorted(
        fallback_phrases,
        key=lambda item: _chunk_fallback_sort_key(item[1], item[0]),
    ):
        _ = original_index
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
) -> bool:
    """Decide whether runtime entity enrichment should be skipped.

    Entity enrichment runs alongside lexical retrieval whenever the query
    has entity surface signal or explicit relation terms. We no longer
    gate it behind the "strong lexical title anchor" check — lexical-first
    ranking was burying entity-rich candidates even when they carried
    direct surface signal worth pursuing.
    """
    if query.entity_terms:
        return True
    if query.relation_terms:
        return False
    return not has_query_entity_surface_signal(query.query)


def should_run_dense_query(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    selected_direct_anchor: bool = False,
) -> bool:
    """Allow dense query search unless a selected-context anchor already resolved the query.

    The previous TITLE_LOOKUP-specific early return was suppressing the
    dense channel on legitimate title lookups where dense recall would
    have helped paraphrased or near-title queries. We now skip dense only
    when a selected-context direct anchor already pinned the target and
    the plan explicitly prefers precise grounding.
    """
    if not query.use_dense_query:
        return False
    if selected_direct_anchor and search_plan.prefer_precise_grounding:
        return False
    return True


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


def has_weak_passage_anchor(
    *,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when chunk retrieval found only a weak direct passage anchor."""

    if lexical_hits or not chunk_lexical_hits:
        return False
    if len(chunk_lexical_hits) > MAX_WEAK_PASSAGE_CHUNK_HITS:
        return False
    strongest_chunk_score = max(
        hit.chunk_lexical_score for hit in chunk_lexical_hits
    )
    return strongest_chunk_score < MAX_WEAK_PASSAGE_TOP_CHUNK_SCORE


def should_run_paper_lexical_fallback(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when passage queries should fall through to cheap paper-level FTS.

    The default passage path should stay chunk-first. Only open the paper FTS lane
    when chunk retrieval is empty or so weak that it is likely to trap the query in
    citation/dense noise. Keep the weak-anchor fallback limited to clinician-facing
    or numeric/statistical passage surfaces to avoid broad latency expansion.
    """

    if not query.use_lexical:
        return False
    if search_plan.retrieval_profile not in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        return search_plan.use_paper_lexical
    if not search_plan.fallback_to_paper_lexical_on_empty_chunk:
        return False
    if not chunk_lexical_hits:
        return True
    if not has_weak_passage_anchor(
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    ):
        return False
    return (
        query.clinical_intent != ClinicalQueryIntent.GENERAL
        or has_statistical_surface_signal(query.query)
    )


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


def should_run_biomedical_reranker(
    *,
    query: PaperRetrievalQuery,
    selected_corpus_id: int | None,
    ranked_papers: Sequence[PaperEvidenceHit],
    enabled: bool,
) -> bool:
    """Run the live biomedical reranker on global, corpus-unrestricted queries.

    Previously gated on PASSAGE/QUESTION profiles and clinician intent.
    The reranker now runs wherever it has enough candidates to rerank —
    the TITLE lane is excluded by the GENERAL/PASSAGE/QUESTION sort keys
    (only GENERAL and PASSAGE/QUESTION profile weights include
    ``biomedical_rerank_score`` today), so this check stays cheap. Adding
    TITLE reranker influence is intentionally deferred until we see
    GENERAL data.
    """
    if not enabled:
        return False
    if selected_corpus_id is not None:
        return False
    if query.scope_mode != RetrievalScope.GLOBAL:
        return False
    return len(ranked_papers) >= MIN_BIOMEDICAL_RERANK_CANDIDATES


def has_direct_retrieval_support(
    *,
    paper: PaperEvidenceHit,
    retrieval_profile: QueryRetrievalProfile,
) -> bool:
    """Return True when a paper has direct query support for the current profile."""

    if retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        return (
            paper.chunk_lexical_score > 0
            or paper.lexical_score > 0
            or paper.passage_alignment_score >= MIN_DIRECT_PASSAGE_ALIGNMENT
        )
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

    if retrieval_profile not in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
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
    if retrieval_profile not in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
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
