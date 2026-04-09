"""Backend-owned query enrichment for the paper-level evidence baseline.

Modular layout:
- ``_query_enrichment_const`` — pure constants, vocab sets, and the
  ``QueryEnrichmentTerms`` dataclass. No sibling-rag imports.
- ``_query_enrichment_phrases`` — pure surface normalization, phrase
  builders, and entity-shape detectors. Imports only from
  ``_query_enrichment_const`` and ``app.rag.types``.
- This file — title-shape classification and retrieval profile selection.
  Composes the helpers above and is the public surface every external
  caller imports from.

All symbols defined in the helper modules are re-exported here so the
historical ``from app.rag.query_enrichment import …`` import paths keep
working without churn.
"""

from __future__ import annotations

import unicodedata

from app.rag._query_enrichment_const import (
    COMPARISON_PREFIXES,
    DEFAULT_QUERY_SYMBOLS,
    ENTITY_QUERY_SYMBOLS,
    INTERROGATIVE_OPENERS,
    MAX_AUTO_RELATION_QUERY_WORDS,
    MAX_ENTITY_ACRONYM_TOKEN_CHARS,
    MAX_ENTITY_RESOLUTION_PHRASES,
    MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS,
    MAX_PARAPHRASE_QUERY_TOKENS,
    MAX_QUERY_PHRASE_TOKENS,
    MAX_QUERY_PHRASES,
    MAX_SHORT_KEYWORD_TOKENS,
    MAX_TITLE_LIKE_QUERY_CHARS,
    MAX_TITLE_LIKE_QUERY_WORDS,
    MAX_TITLE_SUBTITLE_WORDS,
    MIN_CHUNK_LEXICAL_QUERY_WORDS,
    MIN_ENTITY_PROPER_NOUN_CHARS,
    MIN_EXACT_TITLE_PRECHECK_CHARS,
    MIN_EXACT_TITLE_PRECHECK_WORDS,
    MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS,
    NEGATION_SIGNALS,
    PARAPHRASE_MARKER_TOKENS,
    PARAPHRASE_TITLE_PUNCT,
    PASSAGE_VERB_TOKENS,
    PROSE_CLAUSE_TOKENS,
    QueryEnrichmentTerms,
    SENTENCE_OPENING_PREFIXES,
    SHORT_KEYWORD_TITLE_PUNCT,
    STATISTICAL_ANCHOR_PREFIXES,
    SUPPORTED_RELATION_TYPES,
)
from app.rag._query_enrichment_phrases import (
    build_entity_query_phrases,
    build_query_entity_resolution_phrases,
    build_query_phrases,
    build_runtime_entity_resolution_phrases,
    has_query_entity_surface_signal,
    has_statistical_surface_signal,
    normalize_entity_query_text,
    normalize_query_text,
    normalize_title_key,
    should_seed_resolved_entity_term,
)
from app.rag.types import QueryRetrievalProfile

__all__ = [
    # Constants & dataclass (re-exported from _query_enrichment_const)
    "COMPARISON_PREFIXES",
    "DEFAULT_QUERY_SYMBOLS",
    "ENTITY_QUERY_SYMBOLS",
    "INTERROGATIVE_OPENERS",
    "MAX_AUTO_RELATION_QUERY_WORDS",
    "MAX_ENTITY_ACRONYM_TOKEN_CHARS",
    "MAX_ENTITY_RESOLUTION_PHRASES",
    "MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS",
    "MAX_PARAPHRASE_QUERY_TOKENS",
    "MAX_QUERY_PHRASE_TOKENS",
    "MAX_QUERY_PHRASES",
    "MAX_SHORT_KEYWORD_TOKENS",
    "MAX_TITLE_LIKE_QUERY_CHARS",
    "MAX_TITLE_LIKE_QUERY_WORDS",
    "MAX_TITLE_SUBTITLE_WORDS",
    "MIN_CHUNK_LEXICAL_QUERY_WORDS",
    "MIN_ENTITY_PROPER_NOUN_CHARS",
    "MIN_EXACT_TITLE_PRECHECK_CHARS",
    "MIN_EXACT_TITLE_PRECHECK_WORDS",
    "MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS",
    "NEGATION_SIGNALS",
    "PARAPHRASE_MARKER_TOKENS",
    "PARAPHRASE_TITLE_PUNCT",
    "PASSAGE_VERB_TOKENS",
    "PROSE_CLAUSE_TOKENS",
    "QueryEnrichmentTerms",
    "SENTENCE_OPENING_PREFIXES",
    "SHORT_KEYWORD_TITLE_PUNCT",
    "STATISTICAL_ANCHOR_PREFIXES",
    "SUPPORTED_RELATION_TYPES",
    # Phrase / surface helpers (re-exported from _query_enrichment_phrases)
    "build_entity_query_phrases",
    "build_query_entity_resolution_phrases",
    "build_query_phrases",
    "build_runtime_entity_resolution_phrases",
    "has_query_entity_surface_signal",
    "has_statistical_surface_signal",
    "normalize_entity_query_text",
    "normalize_query_text",
    "normalize_title_key",
    "should_seed_resolved_entity_term",
    # Title classification (defined in this file)
    "derive_relation_terms",
    "determine_query_retrieval_profile",
    "is_title_like_query",
    "should_use_chunk_lexical_query",
    "should_use_exact_title_precheck",
    "should_use_title_similarity",
]


def _has_inline_sentence_boundary(text: str) -> bool:
    lowered = text.casefold()
    return any(boundary in lowered for boundary in (". ", "? ", "! "))


def _token_count(text: str) -> int:
    return len(normalize_query_text(text).split())


def _split_question_subtitle_segments(text: str) -> list[str] | None:
    stripped = text.strip().rstrip(".?! ")
    if "? " not in stripped:
        return None
    segments = [segment.strip() for segment in stripped.split("? ") if segment.strip()]
    if len(segments) != 2:
        return None
    return segments


def _is_title_with_question_subtitle(text: str) -> bool:
    segments = _split_question_subtitle_segments(text)
    if not segments:
        return False
    lead, subtitle = segments
    if _has_inline_sentence_boundary(lead) or _has_inline_sentence_boundary(subtitle):
        return False
    lead_tokens = _token_count(lead)
    subtitle_tokens = _token_count(subtitle)
    return (
        lead_tokens >= 4
        and subtitle_tokens > 0
        and subtitle_tokens <= MAX_TITLE_SUBTITLE_WORDS
        and (lead_tokens + subtitle_tokens) <= MAX_TITLE_LIKE_QUERY_WORDS
    )


def _is_extended_structured_title(text: str, *, token_count: int) -> bool:
    if len(text) < MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS:
        return False
    if token_count <= MAX_TITLE_LIKE_QUERY_WORDS:
        return False
    if token_count > MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS:
        return False
    if _has_inline_sentence_boundary(text):
        return False
    return any(marker in text for marker in (":", " - ", " – ", "; "))


def _has_prose_clause_signal(text: str) -> bool:
    """Detect prose-shape tokens that don't appear inside legitimate titles.

    The prose-clause tokens (auxiliaries ``is``/``are``/``was``/``were``,
    connectors ``that``/``which``/``because``, paraphrase markers
    ``from``/``against``, temporal ``before``/``during``/``after``) are
    narrow enough to apply at any length — they rarely appear inside real
    paper titles, so seeing one is a strong signal the query is a
    sentence-shaped paraphrase rather than a title lookup.
    """
    tokens = normalize_query_text(text).split()
    return any(token in PROSE_CLAUSE_TOKENS for token in tokens)


def _has_leading_section_label(text: str) -> bool:
    prefix, separator, suffix = text.partition(":")
    if not separator or not suffix.strip():
        return False
    prefix_tokens = prefix.split()
    if not 1 <= len(prefix_tokens) <= 6:
        return False
    normalized_prefix = normalize_query_text(prefix)
    if not normalized_prefix:
        return False
    return prefix == prefix.upper() and all(
        token.isalpha() for token in normalized_prefix.split()
    )


def _has_obvious_sentence_opening(text: str) -> bool:
    tokens = normalize_query_text(text).split()
    if not tokens:
        return False
    return any(tuple(tokens[: len(prefix)]) == prefix for prefix in SENTENCE_OPENING_PREFIXES)


def _should_demote_title_to_general(
    text: str,
    *,
    in_title_friendly_context: bool = False,
) -> bool:
    """Return True for title-shaped queries that are actually clinical/comparison prompts.

    Terse acronym-heavy queries, negated phrasing, and statistical/comparison shapes
    perform better with multi-lane GENERAL retrieval than the narrow title lane.

    ``in_title_friendly_context`` mirrors the runtime's
    ``allow_terminal_title_punctuation`` flag. When the caller has
    explicitly opted into title-friendly routing (for example the UI
    selected-paper flow), the short-keyword demotion is skipped so users
    who type a brief noun-phrase query while a paper is selected still
    get title candidate lookup. Structural demotions (negation,
    comparison, acronym-heavy) fire regardless — those are always wrong
    for the title lane.
    """

    normalized = normalize_query_text(text)
    if not normalized:
        return False
    tokens = normalized.split()
    if not tokens:
        return False

    # Queries with negation signals → GENERAL
    if NEGATION_SIGNALS & set(tokens):
        return True

    # Queries matching comparison/statistical phrasing → GENERAL
    if any(normalized.startswith(prefix) for prefix in COMPARISON_PREFIXES):
        return True

    # Short, mostly-uppercase-token queries (acronym-heavy) → GENERAL
    if len(tokens) < 6:
        upper_tokens = sum(1 for t in tokens if t == t.upper() and len(t) >= 2)
        if upper_tokens > len(tokens) * 0.5:
            return True

    # Short, lowercase-dominant biomedical keyword queries → GENERAL.
    # Catches terse lookups like "tardive dyskinesia", "Wilson disease",
    # "normal pressure hydrocephalus" that currently get trapped in the
    # TITLE_LOOKUP lane because they are noun-phrase shaped. Real short
    # titles almost always carry title-shape punctuation (colon, em dash,
    # period) or multiple capitalized tokens. One capitalized eponym is
    # permitted so that "Wilson disease" / "Wernicke encephalopathy" still
    # demote cleanly. Skipped in title-friendly UI contexts so a
    # selected-paper browse that types a brief noun phrase still uses
    # title candidate lookup.
    if not in_title_friendly_context and len(tokens) <= MAX_SHORT_KEYWORD_TOKENS:
        stripped = text.strip()
        if not any(ch in stripped for ch in SHORT_KEYWORD_TITLE_PUNCT):
            raw_tokens = stripped.split()
            if raw_tokens:
                lowercase_tokens = sum(1 for t in raw_tokens if t == t.lower())
                if lowercase_tokens >= len(raw_tokens) - 1:
                    return True

    return False


def _is_interrogative_query(text: str) -> bool:
    """Return True when the query opens with an interrogative word or ends with '?'."""

    stripped = text.strip()
    if stripped.endswith("?"):
        return True
    tokens = normalize_query_text(stripped).split()
    if tokens and tokens[0] in INTERROGATIVE_OPENERS:
        return True
    return False


def _is_paraphrase_marker_query(text: str, tokens: list[str]) -> bool:
    """Return True for colloquial paraphrase queries that belong in GENERAL.

    Targets lay-speak noun-phrase queries with ``from``/``against`` that
    Phase 0.4 correctly pulled out of the title lane but which then fell
    through to PASSAGE_LOOKUP by default. These queries have no passage
    anchor to chunk against; they belong in the broad GENERAL fusion.

    Gates are conservative:
      - Must be short (``<= MAX_PARAPHRASE_QUERY_TOKENS``) — real
        paraphrases are brief lay descriptions; long clinical sentences
        are passage claims even when their verb vocabulary is unusual
      - Must contain ``from`` or ``against`` (the narrow Phase 0.4 markers)
      - Must NOT contain title-shape punctuation (colon/semicolon/dash) —
        protects legitimate titles like "Soluble protein oligomers in
        neurodegeneration: lessons from the Alzheimer's amyloid β-peptide"
      - Must NOT contain any curated passage verb — second-line defense
        for short queries that still read as passage claims
      - Must NOT be interrogative — preserved by calling this AFTER the
        question check in ``determine_query_retrieval_profile``, but
        double-gated here for defense in depth
    """

    if not tokens or len(tokens) > MAX_PARAPHRASE_QUERY_TOKENS:
        return False
    if not any(t in PARAPHRASE_MARKER_TOKENS for t in tokens):
        return False
    stripped = text.strip()
    if any(ch in stripped for ch in PARAPHRASE_TITLE_PUNCT):
        return False
    if any(t in PASSAGE_VERB_TOKENS for t in tokens):
        return False
    if _is_interrogative_query(stripped):
        return False
    return True


def is_title_like_query(
    text: str | None,
    *,
    allow_terminal_punctuation: bool = False,
) -> bool:
    """Return True when a query is title-shaped enough for title-similarity scoring."""

    normalized = unicodedata.normalize("NFKC", text or "").strip()
    if not normalized:
        return False
    if len(normalized) > MAX_TITLE_LIKE_QUERY_CHARS:
        return False
    if _has_leading_section_label(normalized):
        return False

    token_count = _token_count(normalized)
    if token_count == 0 or token_count > MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS:
        return False

    allows_question_subtitle = _is_title_with_question_subtitle(normalized)
    allows_extended_structured_title = _is_extended_structured_title(
        normalized,
        token_count=token_count,
    )

    if _has_inline_sentence_boundary(normalized) and not allows_question_subtitle:
        return False

    if (
        token_count > MAX_TITLE_LIKE_QUERY_WORDS
        and not allows_question_subtitle
        and not allows_extended_structured_title
    ):
        return False
    if _has_prose_clause_signal(normalized) and not allows_question_subtitle:
        return False

    if (
        normalized.endswith((".", "?", "!"))
        and not allow_terminal_punctuation
        and not allows_question_subtitle
    ):
        return False
    return True


def determine_query_retrieval_profile(
    text: str | None,
    *,
    allow_terminal_title_punctuation: bool = False,
) -> QueryRetrievalProfile:
    """Classify the query shape for runtime retrieval planning."""

    if is_title_like_query(
        text,
        allow_terminal_punctuation=allow_terminal_title_punctuation,
    ):
        if _should_demote_title_to_general(
            text or "",
            in_title_friendly_context=allow_terminal_title_punctuation,
        ):
            return QueryRetrievalProfile.GENERAL
        return QueryRetrievalProfile.TITLE_LOOKUP

    normalized = normalize_query_text(text or "")
    tokens = normalized.split()
    if not tokens:
        return QueryRetrievalProfile.GENERAL

    # Interrogative queries get dual-lane paper+chunk retrieval
    if len(tokens) >= MIN_CHUNK_LEXICAL_QUERY_WORDS and _is_interrogative_query(text or ""):
        return QueryRetrievalProfile.QUESTION_LOOKUP

    # Paraphrased noun-phrase queries with "from"/"against" but no passage
    # verb anchor belong in GENERAL fusion, not the chunk-anchored passage
    # lane. See ``_is_paraphrase_marker_query`` for the full gate.
    if _is_paraphrase_marker_query(text or "", tokens):
        return QueryRetrievalProfile.GENERAL

    if len(tokens) >= MIN_CHUNK_LEXICAL_QUERY_WORDS:
        return QueryRetrievalProfile.PASSAGE_LOOKUP
    return QueryRetrievalProfile.GENERAL


def should_use_exact_title_precheck(text: str | None) -> bool:
    """Return True when a long passage-shaped query deserves exact-title rescue.

    This is intentionally narrower than the title classifier. The precheck exists
    to recover long full-paper titles that fall into the passage lane because of
    terminal punctuation, not to run on ordinary sentence queries.
    """

    normalized = unicodedata.normalize("NFKC", text or "").strip()
    if not normalized or is_title_like_query(normalized):
        return False

    token_count = _token_count(normalized)
    if token_count == 0 or token_count > MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS:
        return False
    if _has_inline_sentence_boundary(normalized):
        return False
    if _has_leading_section_label(normalized):
        return False
    if _has_obvious_sentence_opening(normalized):
        return False

    if is_title_like_query(normalized, allow_terminal_punctuation=True):
        return True

    if not normalized.endswith((".", "?", "!")):
        return False
    if len(normalized) < MIN_EXACT_TITLE_PRECHECK_CHARS:
        return False
    if token_count < MIN_EXACT_TITLE_PRECHECK_WORDS:
        return False
    if _has_prose_clause_signal(normalized):
        return False
    return True


def should_use_title_similarity(
    text: str | None,
    *,
    retrieval_profile: QueryRetrievalProfile,
) -> bool:
    """Return True when broad title similarity is worth the runtime cost.

    Title-shaped queries still keep exact/prefix candidate rescue even when this
    returns False. This gate only controls the broader trigram-style title
    similarity lane that becomes pathological on very long exact titles.
    """

    if retrieval_profile != QueryRetrievalProfile.TITLE_LOOKUP:
        return False

    normalized = unicodedata.normalize("NFKC", text or "").strip()
    if not normalized:
        return False

    token_count = _token_count(normalized)
    return not (
        len(normalized) >= MIN_EXACT_TITLE_PRECHECK_CHARS
        and token_count >= MIN_EXACT_TITLE_PRECHECK_WORDS
    )


def should_use_chunk_lexical_query(text: str | None) -> bool:
    """Route longer free-text queries through chunk lexical search."""

    return determine_query_retrieval_profile(text) in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    )


def derive_relation_terms(text: str) -> list[str]:
    """Extract exact canonical relation labels from the normalized query."""

    tokens = normalize_query_text(text).split()
    if not tokens:
        return []
    if len(tokens) > MAX_AUTO_RELATION_QUERY_WORDS:
        return []

    relation_terms: list[str] = []
    seen: set[str] = set()
    accepted_spans: list[tuple[int, int]] = []
    max_tokens = min(MAX_QUERY_PHRASE_TOKENS, len(tokens))
    for size in range(max_tokens, 0, -1):
        for start in range(0, len(tokens) - size + 1):
            end = start + size
            candidate = "_".join(tokens[start:end]).replace("-", "_")
            if candidate not in SUPPORTED_RELATION_TYPES or candidate in seen:
                continue
            if any(
                start < accepted_end and end > accepted_start
                for accepted_start, accepted_end in accepted_spans
            ):
                continue
            seen.add(candidate)
            accepted_spans.append((start, end))
            relation_terms.append(candidate)
    return relation_terms
