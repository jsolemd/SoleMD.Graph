"""Backend-owned query enrichment for the paper-level evidence baseline."""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from app.rag.types import QueryRetrievalProfile

MAX_QUERY_PHRASE_TOKENS = 4
MAX_QUERY_PHRASES = 48
MAX_TITLE_LIKE_QUERY_CHARS = 220
MAX_TITLE_LIKE_QUERY_WORDS = 24
MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS = 40
MAX_TITLE_SUBTITLE_WORDS = 10
MAX_AUTO_RELATION_QUERY_WORDS = 12
MIN_CHUNK_LEXICAL_QUERY_WORDS = 4
MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS = 120
DEFAULT_QUERY_SYMBOLS = frozenset({":", "-", "_"})
ENTITY_QUERY_SYMBOLS = frozenset({":", "-", "_", "/", "+"})
PROSE_CLAUSE_TOKENS = frozenset(
    {
        "aimed",
        "before",
        "during",
        "after",
        "because",
        "emerged",
        "measured",
        "proposed",
        "that",
        "which",
        "were",
        "was",
        "is",
        "are",
        "had",
        "has",
        "have",
    }
)

# Canonical PubTator relation labels currently exercised in the live dataset.
SUPPORTED_RELATION_TYPES = frozenset(
    {
        "associate",
        "cause",
        "compare",
        "cotreat",
        "drug_interact",
        "inhibit",
        "interact",
        "negative_correlate",
        "positive_correlate",
        "prevent",
        "stimulate",
        "treat",
    }
)


@dataclass(frozen=True, slots=True)
class QueryEnrichmentTerms:
    entity_terms: list[str]
    relation_terms: list[str]


def _normalize_query_text_with_symbols(
    text: str,
    *,
    allowed_symbols: frozenset[str],
) -> str:
    normalized = unicodedata.normalize("NFKC", text or "")
    chars: list[str] = []
    for char in normalized:
        if char.isalnum() or char in allowed_symbols:
            chars.append(char.lower())
            continue
        chars.append(" ")
    return " ".join("".join(chars).split())


def normalize_query_text(text: str) -> str:
    """Normalize free-text queries into a conservative token surface."""

    return _normalize_query_text_with_symbols(
        text,
        allowed_symbols=DEFAULT_QUERY_SYMBOLS,
    )


def normalize_entity_query_text(text: str) -> str:
    """Normalize entity-oriented phrases while preserving biomedical symbol tokens."""

    return _normalize_query_text_with_symbols(
        text,
        allowed_symbols=ENTITY_QUERY_SYMBOLS,
    )


def _build_query_phrases_from_tokens(tokens: list[str]) -> list[str]:
    if not tokens:
        return []

    phrases: list[str] = []
    seen: set[str] = set()
    max_tokens = min(MAX_QUERY_PHRASE_TOKENS, len(tokens))
    for size in range(max_tokens, 0, -1):
        for start in range(0, len(tokens) - size + 1):
            phrase = " ".join(tokens[start : start + size]).strip()
            if len(phrase) < 3 or phrase in seen:
                continue
            seen.add(phrase)
            phrases.append(phrase)
            if len(phrases) >= MAX_QUERY_PHRASES:
                return phrases
    return phrases


def build_query_phrases(text: str) -> list[str]:
    """Build bounded contiguous query phrases without frontend heuristics."""

    return _build_query_phrases_from_tokens(normalize_query_text(text).split())


def build_entity_query_phrases(text: str) -> list[str]:
    """Build bounded entity-oriented phrases without stripping biomedical symbols."""

    return _build_query_phrases_from_tokens(normalize_entity_query_text(text).split())


def _has_specific_entity_token(token: str) -> bool:
    stripped = token.strip()
    if not stripped:
        return False
    if ":" in stripped:
        return True
    has_alpha = any(char.isalpha() for char in stripped)
    has_digit = any(char.isdigit() for char in stripped)
    has_symbol = any(char in ENTITY_QUERY_SYMBOLS - DEFAULT_QUERY_SYMBOLS for char in stripped)
    return (has_alpha and has_digit) or has_symbol


def should_seed_resolved_entity_term(term: str) -> bool:
    """Return True when an auto-resolved entity term is specific enough for recall seeding."""

    stripped = term.strip()
    if not stripped:
        return False
    return any(_has_specific_entity_token(token) for token in stripped.split())


def normalize_title_key(text: str | None) -> str:
    """Normalize a title-like string into a stable lexical comparison key.

    Keep this aligned with the PostgreSQL helper `solemd.normalize_title_key`
    used by the runtime retrieval indexes and exact-title search path.
    """

    normalized = unicodedata.normalize("NFKC", text or "")
    tokens: list[str] = []
    current: list[str] = []
    for char in normalized.casefold():
        if char.isalnum():
            current.append(char)
            continue
        if current:
            tokens.append("".join(current))
            current = []
    if current:
        tokens.append("".join(current))
    return " ".join(tokens)


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


def _has_prose_clause_signal(text: str, *, token_count: int) -> bool:
    if token_count <= MAX_TITLE_LIKE_QUERY_WORDS:
        return False
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
    if (
        _has_prose_clause_signal(normalized, token_count=token_count)
        and not allows_question_subtitle
    ):
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
        return QueryRetrievalProfile.TITLE_LOOKUP

    normalized = normalize_query_text(text or "")
    if normalized and len(normalized.split()) >= MIN_CHUNK_LEXICAL_QUERY_WORDS:
        return QueryRetrievalProfile.PASSAGE_LOOKUP
    return QueryRetrievalProfile.GENERAL


def should_use_chunk_lexical_query(text: str | None) -> bool:
    """Route longer free-text queries through chunk lexical search."""

    return (
        determine_query_retrieval_profile(text)
        == QueryRetrievalProfile.PASSAGE_LOOKUP
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
