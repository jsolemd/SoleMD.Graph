"""Centralized runtime retrieval policy helpers."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag.models import PaperEvidenceHit, PaperRetrievalQuery
from app.rag.query_enrichment import (
    MIN_CHUNK_LEXICAL_QUERY_WORDS,
    build_query_phrases,
    has_query_entity_surface_signal,
    has_statistical_surface_signal,
    normalize_query_text,
    should_use_exact_title_precheck,
)
from app.rag.search_plan import RetrievalSearchPlan
from app.rag.title_anchor import has_strong_title_anchor
from app.rag.types import ClinicalQueryIntent, QueryRetrievalProfile, RetrievalScope

MAX_CHUNK_FALLBACK_PHRASES = 8
MIN_CHUNK_FALLBACK_WORDS = 3
MIN_CHUNK_PRIMARY_WORDS_FOR_FALLBACK_PRIORITIZATION = 12
MAX_EXACT_TITLE_RESCUE_TOKENS_FOR_FALLBACK_SUPPRESSION = 20
MIN_PASSAGE_ENRICHMENT_CANDIDATES = 12
PASSAGE_ENRICHMENT_K_MULTIPLIER = 2
TITLE_ENRICHMENT_SHORTLIST_LIMIT = 1
TITLE_AMBIGUITY_SHORTLIST_BUFFER = 2
MIN_BIOMEDICAL_RERANK_CANDIDATES = 3
MIN_DIRECT_PASSAGE_ALIGNMENT = 0.55
MIN_STRONG_PASSAGE_SURFACE_SCORE = 0.01
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
CHUNK_FALLBACK_DISCOURSE_TOKENS = frozenset(
    {
        "aim",
        "aimed",
        "conclude",
        "concluded",
        "conclusion",
        "conclusions",
        "demonstrate",
        "demonstrated",
        "demonstrates",
        "describe",
        "described",
        "describes",
        "evaluate",
        "evaluated",
        "examined",
        "finding",
        "findings",
        "herein",
        "indicate",
        "indicated",
        "indicates",
        "investigate",
        "investigated",
        "mechanism",
        "mechanisms",
        "other",
        "present",
        "presented",
        "presents",
        "reported",
        "results",
        "review",
        "show",
        "showed",
        "shown",
        "shows",
        "study",
        "studies",
        "suggest",
        "suggested",
        "suggests",
        "these",
        "this",
        "we",
    }
)
CHUNK_FALLBACK_TRAILING_WEAK_TOKENS = frozenset(
    {
        "are",
        "be",
        "been",
        "being",
        "can",
        "could",
        "did",
        "do",
        "does",
        "had",
        "has",
        "have",
        "is",
        "may",
        "might",
        "must",
        "should",
        "to",
        "was",
        "were",
        "will",
        "would",
    }
)


def _chunk_fallback_sort_key(phrase: str, original_index: int) -> tuple[int, int, int]:
    tokens = phrase.split()
    informative_tokens = [
        token for token in tokens if token not in CHUNK_FALLBACK_STOPWORDS
    ]
    bonus_score = sum(token in CHUNK_FALLBACK_BONUS_TOKENS for token in tokens)
    long_token_score = sum(len(token) >= 8 for token in informative_tokens)
    discourse_penalty = sum(
        token in CHUNK_FALLBACK_DISCOURSE_TOKENS for token in tokens
    )
    trailing_noise_penalty = (
        3
        if tokens and tokens[-1] in CHUNK_FALLBACK_STOPWORDS
        else 0
    )
    trailing_weak_token_penalty = (
        4
        if tokens and tokens[-1] in CHUNK_FALLBACK_TRAILING_WEAK_TOKENS
        else 0
    )
    left_anchor_bonus = 2 if original_index == 0 else 0
    specificity_score = (
        (len(informative_tokens) * 4)
        + (long_token_score * 2)
        + (bonus_score * 3)
        + left_anchor_bonus
        - (discourse_penalty * 4)
        - (2 if tokens and tokens[0] in CHUNK_FALLBACK_STOPWORDS else 0)
        - trailing_noise_penalty
        - trailing_weak_token_penalty
    )
    return (-specificity_score, -len(tokens), original_index)


def _should_prioritize_chunk_fallback_before_primary(
    *,
    query: PaperRetrievalQuery,
    primary_query: str,
    sorted_fallback_phrases: Sequence[str],
    has_statistical_raw_query: bool,
) -> bool:
    if has_statistical_raw_query or not sorted_fallback_phrases:
        return False
    normalized_tokens = primary_query.split()
    if (
        len(normalized_tokens)
        <= MAX_EXACT_TITLE_RESCUE_TOKENS_FOR_FALLBACK_SUPPRESSION
        and should_use_exact_title_precheck(
            query.query,
            metadata_hints=query.metadata_hints,
        )
    ):
        return False
    single_char_run = 0
    for token in normalized_tokens:
        if len(token) == 1:
            single_char_run += 1
            if single_char_run >= 3:
                return False
            continue
        single_char_run = 0
    return (
        len(normalized_tokens)
        >= MIN_CHUNK_PRIMARY_WORDS_FOR_FALLBACK_PRIORITIZATION
    )


def _should_skip_chunk_fallback_phrase(phrase: str) -> bool:
    tokens = [token for token in phrase.split() if token]
    fragmented_acronym_tokens = sum(
        len(token) == 1 and token.isalpha()
        for token in tokens
    )
    return fragmented_acronym_tokens >= 3


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
    has_statistical_raw_query = bool(
        raw_query and has_statistical_surface_signal(raw_query)
    )
    if has_statistical_raw_query:
        candidates.append(raw_query)
        seen.add(raw_query)
    fallback_phrases: list[tuple[int, str]] = []
    for index, phrase in enumerate(build_query_phrases(primary_query)):
        if (
            len(phrase.split()) < MIN_CHUNK_FALLBACK_WORDS
            or phrase in seen
            or _should_skip_chunk_fallback_phrase(phrase)
        ):
            continue
        seen.add(phrase)
        fallback_phrases.append((index, phrase))
    sorted_fallback_phrases = [
        phrase
        for _, phrase in sorted(
            fallback_phrases,
            key=lambda item: _chunk_fallback_sort_key(item[1], item[0]),
        )
    ]
    if _should_prioritize_chunk_fallback_before_primary(
        query=query,
        primary_query=primary_query,
        sorted_fallback_phrases=sorted_fallback_phrases,
        has_statistical_raw_query=has_statistical_raw_query,
    ):
        prioritized_phrase = sorted_fallback_phrases.pop(0)
        candidates.append(prioritized_phrase)
    if primary_query and primary_query not in seen:
        candidates.append(primary_query)
        seen.add(primary_query)
    for phrase in sorted_fallback_phrases:
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

    return bool(
        title_anchor_candidate_ids(
            query_text=query_text,
            lexical_hits=lexical_hits,
        )
    )


def title_anchor_candidate_ids(
    *,
    query_text: str,
    lexical_hits: Sequence[PaperEvidenceHit],
) -> list[int]:
    """Return direct lexical candidates that are exact/strong-prefix title anchors.

    `lexical_hits` may include paper-level lexical hits and chunk lexical hits;
    both carry the paper title needed for anchor detection.
    """

    candidate_ids: list[int] = []
    seen: set[int] = set()
    for hit in lexical_hits:
        if not has_strong_title_anchor(
            query_text=query_text,
            title_text=hit.title,
        ):
            continue
        if hit.corpus_id in seen:
            continue
        seen.add(hit.corpus_id)
        candidate_ids.append(hit.corpus_id)
    return candidate_ids


def has_precise_title_resolution(
    *,
    query_text: str,
    retrieval_profile: QueryRetrievalProfile,
    lexical_hits: Sequence[PaperEvidenceHit],
    selected_direct_anchor: bool = False,
) -> bool:
    """Return True when title retrieval already pinned the target precisely."""

    if retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return False
    if selected_direct_anchor:
        return True
    return (
        len(
            title_anchor_candidate_ids(
                query_text=query_text,
                lexical_hits=lexical_hits,
            )
        )
        == 1
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
    if query.metadata_hints.has_searchable_metadata_filters:
        return True
    return not has_query_entity_surface_signal(query.focused_query or query.query)


def should_run_seeded_channel_search(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit] = (),
    selected_direct_anchor: bool = False,
) -> bool:
    """Skip seeded recall lanes once precise title grounding has already landed."""

    if selected_direct_anchor:
        return False
    if has_stable_title_chunk_rescue_frontier(
        query=query,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    ):
        return False
    if query.metadata_hints.has_searchable_metadata_filters and lexical_hits:
        return False
    if query.retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return True
    return not title_anchor_candidate_ids(
        query_text=query.focused_query or query.query,
        lexical_hits=[*lexical_hits, *chunk_lexical_hits],
    )


def should_run_dense_query(
    *,
    query: PaperRetrievalQuery,
    selected_direct_anchor: bool = False,
    lexical_hits: Sequence[PaperEvidenceHit] = (),
    chunk_lexical_hits: Sequence[PaperEvidenceHit] = (),
) -> bool:
    return dense_query_decision(
        query=query,
        selected_direct_anchor=selected_direct_anchor,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    )[0]


def dense_query_decision(
    *,
    query: PaperRetrievalQuery,
    selected_direct_anchor: bool = False,
    lexical_hits: Sequence[PaperEvidenceHit] = (),
    chunk_lexical_hits: Sequence[PaperEvidenceHit] = (),
) -> tuple[bool, str]:
    """Allow dense search unless precise title grounding already resolved recall.

    Dense recall still runs on paraphrased title lookups; the skip only
    applies once lexical title matching or a selected direct anchor has
    already pinned the target with high confidence.
    """
    if not query.use_dense_query:
        return False, "disabled"
    if selected_direct_anchor:
        return False, "selected_anchor"
    if query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP and title_anchor_candidate_ids(
        query_text=query.focused_query or query.query,
        lexical_hits=[*lexical_hits, *chunk_lexical_hits],
    ):
        return False, "precise_title_anchor"
    if has_stable_title_chunk_rescue_frontier(
        query=query,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    ):
        return False, "stable_direct_passage_leader"
    if query.retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ) and has_stable_direct_passage_frontier([*lexical_hits, *chunk_lexical_hits]):
        return False, "stable_direct_passage_leader"
    if query.metadata_hints.has_searchable_metadata_filters and lexical_hits:
        return False, "metadata_lexical_leader"
    return True, "candidate_recovery"


def direct_passage_support_corpus_ids(
    paper_hits: Sequence[PaperEvidenceHit],
) -> list[int]:
    """Return unique corpus ids with tier-2 direct passage support."""

    candidate_ids: list[int] = []
    seen: set[int] = set()
    for hit in paper_hits:
        if passage_direct_support_tier(hit) < 2:
            continue
        if hit.corpus_id in seen:
            continue
        seen.add(hit.corpus_id)
        candidate_ids.append(hit.corpus_id)
    return candidate_ids


def has_stable_direct_passage_frontier(
    paper_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when cheap passage retrieval already surfaced one clear paper."""

    return len(direct_passage_support_corpus_ids(paper_hits)) == 1


def has_stable_title_chunk_rescue_frontier(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit],
    selected_direct_anchor: bool = False,
) -> bool:
    """Return True when title lookup already recovered via one chunk-backed leader.

    This covers the misclassified-fragment case: the query entered the title lane,
    but title/paper lexical retrieval did not resolve it while chunk lexical search
    surfaced one clear direct-support paper. Once that happens, the remaining
    recovery lanes are redundant work.
    """

    if query.retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return False
    if selected_direct_anchor or lexical_hits or not chunk_lexical_hits:
        return False
    if title_anchor_candidate_ids(
        query_text=query.focused_query or query.query,
        lexical_hits=chunk_lexical_hits,
    ):
        return False
    return has_stable_direct_passage_frontier(chunk_lexical_hits)


def should_fetch_semantic_neighbors(
    *,
    query: PaperRetrievalQuery,
    search_plan: RetrievalSearchPlan,
    selected_corpus_id: int | None,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit] = (),
    selected_direct_anchor: bool = False,
) -> bool:
    """Allow selected-paper semantic neighbors only when they provide useful expansion."""

    if selected_corpus_id is None:
        return False
    if selected_direct_anchor and search_plan.prefer_precise_grounding:
        return False
    if search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        if has_stable_title_chunk_rescue_frontier(
            query=query,
            lexical_hits=lexical_hits,
            chunk_lexical_hits=chunk_lexical_hits,
            selected_direct_anchor=selected_direct_anchor,
        ):
            return False
        return not has_strong_lexical_title_anchor(
            query_text=query.focused_query or query.query,
            lexical_hits=[*lexical_hits, *chunk_lexical_hits],
        )
    return True


def should_run_title_chunk_rescue(
    *,
    query: PaperRetrievalQuery,
    exact_title_hits: Sequence[PaperEvidenceHit],
    lexical_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Retry failed long title lookups with bounded chunk lexical search.

    This is a lane-correction guard, not a title classifier rewrite. It only
    fires after title-paper retrieval has already failed and only for the
    long-title regime where broad title similarity was intentionally disabled.
    """

    if query.retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return False
    if not query.use_lexical:
        return False
    if query.use_title_similarity or not query.use_title_candidate_lookup:
        return False
    if exact_title_hits or lexical_hits:
        return False
    return len(normalize_query_text(query.query).split()) >= MIN_CHUNK_LEXICAL_QUERY_WORDS


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

    if search_plan.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return False
    return search_plan.expand_citation_frontier and not has_strong_lexical_title_anchor(
        query_text=query_text,
        lexical_hits=lexical_hits,
    )


def should_prefetch_citation_contexts(
    *,
    query: PaperRetrievalQuery,
    lexical_hits: Sequence[PaperEvidenceHit],
    chunk_lexical_hits: Sequence[PaperEvidenceHit] = (),
) -> bool:
    """Skip pre-ranking citation fetch when a strong title anchor already resolved recall."""

    direct_support_hits = [*lexical_hits, *chunk_lexical_hits]
    if (
        query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and has_strong_lexical_title_anchor(
            query_text=query.focused_query or query.query,
            lexical_hits=direct_support_hits,
        )
    ):
        return False
    if has_stable_title_chunk_rescue_frontier(
        query=query,
        lexical_hits=lexical_hits,
        chunk_lexical_hits=chunk_lexical_hits,
    ):
        return False
    return not (
        query.retrieval_profile
        in (
            QueryRetrievalProfile.PASSAGE_LOOKUP,
            QueryRetrievalProfile.QUESTION_LOOKUP,
        )
        and not lexical_hits
        and len(chunk_lexical_hits) == 1
        and passage_direct_support_tier(chunk_lexical_hits[0]) == 2
    )


def should_fetch_missing_citation_contexts(
    *,
    retrieval_profile: QueryRetrievalProfile,
    precise_title_resolution: bool,
    top_hits: Sequence[PaperEvidenceHit],
) -> bool:
    """Skip post-rank citation fetch for precise title hits that already have preview text.

    Exact/precise title resolution already grounds the target paper directly. When
    the shortlisted title hits carry chunk/abstract/TLDR text, post-rank citation
    lookups only replace an existing preview surface with a slower citation snippet.
    Keep the citation fetch for ambiguous titles and for sparse title hits that lack
    their own preview text.
    """

    if len(top_hits) == 1 and passage_direct_support_tier(top_hits[0]) == 2:
        return False
    if retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return True
    if not precise_title_resolution:
        return True
    return any(
        not (paper.chunk_snippet or paper.tldr or paper.abstract)
        for paper in top_hits
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
    The reranker now runs wherever its score is actually consumed by the
    final sort key — only GENERAL and PASSAGE/QUESTION profile weights
    include ``biomedical_rerank_score`` today. TITLE_LOOKUP is skipped
    explicitly because ``TITLE_RANKING_PROFILE.biomedical_rerank_weight``
    is ``0.0``; running the ~800 ms MedCPT pass on title queries only to
    multiply its output by zero at fusion was the entire title latency
    regression. Adding TITLE reranker influence is intentionally deferred
    until we see GENERAL data that justifies paying the cost.
    """
    return biomedical_rerank_decision(
        query=query,
        selected_corpus_id=selected_corpus_id,
        ranked_papers=ranked_papers,
        enabled=enabled,
    )[0]


def biomedical_rerank_decision(
    *,
    query: PaperRetrievalQuery,
    selected_corpus_id: int | None,
    ranked_papers: Sequence[PaperEvidenceHit],
    enabled: bool,
) -> tuple[bool, str]:
    """Return whether reranking should run and the decision reason.

    Passage/question queries only pay the MedCPT cross-encoder cost when the
    top shortlist remains ambiguous. Once a single chunk- or lexical-backed
    leader has emerged and the nearest contenders are weaker dense/alignment
    candidates, reranking is redundant work.
    """

    if not enabled:
        return False, "disabled"
    if selected_corpus_id is not None:
        return False, "selected_anchor"
    if query.scope_mode != RetrievalScope.GLOBAL:
        return False, "non_global_scope"
    if query.retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return False, "title_lookup"
    if len(ranked_papers) < MIN_BIOMEDICAL_RERANK_CANDIDATES:
        return False, "insufficient_candidates"
    if query.retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ) and has_stable_direct_passage_leader(ranked_papers):
        return False, "stable_direct_passage_leader"
    return True, "candidate_ambiguity"


def has_stable_direct_passage_leader(
    ranked_papers: Sequence[PaperEvidenceHit],
) -> bool:
    """Return True when one direct passage winner has already separated itself.

    The reranker is only useful when multiple shortlist papers still carry
    strong direct-support surfaces. If the leader is the only top-3 paper with
    tier-2 passage support, cross-encoder reranking mostly re-scores an already
    resolved lexical outcome.
    """

    if not ranked_papers:
        return False
    leader = ranked_papers[0]
    if passage_direct_support_tier(leader) < 2:
        return False
    top_window = ranked_papers[:MIN_BIOMEDICAL_RERANK_CANDIDATES]
    direct_ids = direct_passage_support_corpus_ids(top_window)
    return len(direct_ids) == 1 and direct_ids[0] == leader.corpus_id


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
            or paper.entity_score > 0
            or paper.relation_score > 0
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


def passage_direct_support_tier(paper: PaperEvidenceHit) -> int:
    """Return the passage direct-support tier used by passage/question ranking.

    Tier 2 is a true lexical or chunk-backed surface hit. Tier 1 is weaker
    text alignment from abstract/title/TLDR without lexical evidence. Tier 0
    has no direct passage support.
    """

    if (
        paper.chunk_lexical_score >= MIN_STRONG_PASSAGE_SURFACE_SCORE
        or paper.lexical_score >= MIN_STRONG_PASSAGE_SURFACE_SCORE
    ):
        return 2
    if paper.passage_alignment_score >= MIN_DIRECT_PASSAGE_ALIGNMENT:
        return 1
    return 0


def citation_context_candidate_ids(
    *,
    paper_hits: Sequence[PaperEvidenceHit],
    retrieval_profile: QueryRetrievalProfile,
    rerank_topn: int | None = None,
    query_text: str | None = None,
    lexical_hits: Sequence[PaperEvidenceHit] = (),
    cited_corpus_ids: Sequence[int] = (),
    selected_direct_anchor: bool = False,
) -> list[int]:
    """Limit citation-context scoring to candidates that already have direct evidence."""

    ordered_ids = [hit.corpus_id for hit in paper_hits]
    prioritized_ids = [*cited_corpus_ids, *ordered_ids]
    if retrieval_profile not in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        if (
            retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP
            and not selected_direct_anchor
            and not title_anchor_candidate_ids(
                query_text=query_text or "",
                lexical_hits=lexical_hits,
            )
        ):
            shortlist_limit = (
                max(1, rerank_topn + TITLE_AMBIGUITY_SHORTLIST_BUFFER)
                if rerank_topn is not None
                else 1
            )
            return _limit_prioritized_candidate_ids(
                prioritized_ids=prioritized_ids,
                limit=min(len(ordered_ids), shortlist_limit),
            )
        return _limit_prioritized_candidate_ids(
            prioritized_ids=prioritized_ids,
            limit=len(ordered_ids),
        )

    direct_ids = [
        hit.corpus_id
        for hit in paper_hits
        if has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
    ]
    return _limit_prioritized_candidate_ids(
        prioritized_ids=[*cited_corpus_ids, *direct_ids],
        limit=len(direct_ids) + len(cited_corpus_ids),
    )


def _limit_prioritized_candidate_ids(
    *,
    prioritized_ids: Sequence[int],
    limit: int,
) -> list[int]:
    deduped: list[int] = []
    seen: set[int] = set()
    for corpus_id in prioritized_ids:
        if corpus_id in seen:
            continue
        seen.add(corpus_id)
        deduped.append(corpus_id)
        if len(deduped) >= limit:
            break
    return deduped


def entity_relation_candidate_ids(
    *,
    ranked_papers: Sequence[PaperEvidenceHit],
    retrieval_profile: QueryRetrievalProfile,
    k: int,
    rerank_topn: int,
    query_text: str | None = None,
    lexical_hits: Sequence[PaperEvidenceHit] = (),
    cited_corpus_ids: Sequence[int] = (),
    selected_corpus_id: int | None = None,
    selected_direct_anchor: bool = False,
) -> list[int]:
    """Bound expensive entity/relation enrichment to the best-ranked candidates."""

    ordered_ids = [hit.corpus_id for hit in ranked_papers]
    direct_ids = [
        hit.corpus_id
        for hit in ranked_papers
        if has_direct_retrieval_support(
            paper=hit,
            retrieval_profile=retrieval_profile,
        )
    ]
    title_anchor_ids = (
        title_anchor_candidate_ids(
            query_text=query_text,
            lexical_hits=lexical_hits,
        )
        if query_text
        else []
    )
    prioritized: list[int] = []
    if selected_corpus_id is not None and selected_corpus_id in ordered_ids:
        prioritized.append(selected_corpus_id)
    prioritized.extend(cited_corpus_ids)
    prioritized.extend(title_anchor_ids)
    prioritized.extend(direct_ids)
    prioritized.extend(ordered_ids)

    if selected_direct_anchor:
        return _limit_prioritized_candidate_ids(
            prioritized_ids=prioritized,
            limit=min(len(ordered_ids), TITLE_ENRICHMENT_SHORTLIST_LIMIT),
        )
    if title_anchor_ids and retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return _limit_prioritized_candidate_ids(
            prioritized_ids=prioritized,
            limit=min(
                len(ordered_ids),
                len(title_anchor_ids)
                if len(title_anchor_ids) > 1
                else TITLE_ENRICHMENT_SHORTLIST_LIMIT,
            ),
        )
    if retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return _limit_prioritized_candidate_ids(
            prioritized_ids=prioritized,
            limit=min(
                len(ordered_ids),
                max(k, rerank_topn + TITLE_AMBIGUITY_SHORTLIST_BUFFER),
            ),
        )

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
    return _limit_prioritized_candidate_ids(
        prioritized_ids=prioritized,
        limit=shortlist_limit,
    )
