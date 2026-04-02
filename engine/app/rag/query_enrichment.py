"""Backend-owned query enrichment for the paper-level evidence baseline."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.rag.types import QueryRetrievalProfile

MAX_QUERY_PHRASE_TOKENS = 4
MAX_QUERY_PHRASES = 48
MAX_ENTITY_RESOLUTION_PHRASES = 12
MIN_EXACT_TITLE_PRECHECK_CHARS = 96
MIN_EXACT_TITLE_PRECHECK_WORDS = 12
MAX_TITLE_LIKE_QUERY_CHARS = 220
MAX_TITLE_LIKE_QUERY_WORDS = 24
MAX_EXTENDED_TITLE_LIKE_QUERY_WORDS = 40
MAX_TITLE_SUBTITLE_WORDS = 10
MAX_AUTO_RELATION_QUERY_WORDS = 12
MIN_CHUNK_LEXICAL_QUERY_WORDS = 4
MIN_EXTENDED_TITLE_LIKE_QUERY_CHARS = 120
MAX_ENTITY_ACRONYM_TOKEN_CHARS = 8
MIN_ENTITY_PROPER_NOUN_CHARS = 4
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
SENTENCE_OPENING_PREFIXES = frozenset(
    {
        ("this",),
        ("these",),
        ("those",),
        ("we",),
        ("our",),
        ("here",),
        ("in", "this"),
        ("this", "is"),
        ("this", "study"),
        ("we", "show"),
        ("we", "investigated"),
        ("our", "results"),
    }
)
STATISTICAL_ANCHOR_PREFIXES = frozenset({"p", "n", "r"})

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


def _entity_surface_anchor_tokens(text: str) -> list[str]:
    anchors: list[str] = []
    seen: set[str] = set()
    for token in _surface_tokens(text):
        normalized = normalize_entity_query_text(token)
        if not normalized or normalized in seen:
            continue
        if _is_short_upper_acronym(token):
            seen.add(normalized)
            anchors.append(normalized)
            continue
        if _has_specific_entity_surface_token(token, normalized):
            seen.add(normalized)
            anchors.append(normalized)
    return anchors


def _phrase_contains_anchor(phrase: str, anchor: str) -> bool:
    phrase_tokens = phrase.split()
    anchor_tokens = anchor.split()
    if not phrase_tokens or not anchor_tokens:
        return False
    if len(anchor_tokens) == 1:
        return anchor_tokens[0] in phrase_tokens
    return any(
        phrase_tokens[index : index + len(anchor_tokens)] == anchor_tokens
        for index in range(0, len(phrase_tokens) - len(anchor_tokens) + 1)
    )


def build_query_entity_resolution_phrases(text: str) -> list[str]:
    """Build a compact, anchor-aware phrase set for runtime entity resolution.

    Runtime entity enrichment is intentionally high-precision. Keep only phrase
    windows that actually contain a raw surface anchor such as an acronym,
    concept-id-like token, or biomedical symbol token.
    """

    anchors = _entity_surface_anchor_tokens(text)
    if not anchors:
        return []

    filtered: list[str] = []
    seen: set[str] = set()
    for phrase in build_entity_query_phrases(text):
        if phrase in seen:
            continue
        if any(_phrase_contains_anchor(phrase, anchor) for anchor in anchors):
            seen.add(phrase)
            filtered.append(phrase)
        if len(filtered) >= MAX_ENTITY_RESOLUTION_PHRASES:
            break
    return filtered


def build_runtime_entity_resolution_phrases(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    normalized_query: str | None = None,
) -> list[str]:
    """Build query phrases for runtime entity resolution without widening passage noise.

    Title/general lookups keep the broader phrase inventory so generic biomedical
    queries can still resolve missing entity terms. Passage lookups stay on the
    compact anchor-aware lane to avoid spending time on statistical prose.
    """

    if retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        return build_query_entity_resolution_phrases(text)

    return list(
        dict.fromkeys(
            [
                *build_entity_query_phrases(text),
                *build_query_phrases(normalized_query or text),
            ]
        )
    )


def _is_statistical_surface_token(raw_token: str, normalized_token: str) -> bool:
    raw = raw_token.strip().casefold()
    normalized_parts = normalized_token.split()
    if not raw or not normalized_parts:
        return False
    if len(normalized_parts) > 1 and normalized_parts[0] in STATISTICAL_ANCHOR_PREFIXES:
        if all(part.isdigit() for part in normalized_parts[1:]):
            return True
    return bool(re.fullmatch(r"[<>~=]?\d+(?:\.\d+)?%?", raw))


def _has_specific_entity_surface_token(raw_token: str, normalized_token: str) -> bool:
    stripped = raw_token.strip()
    if not stripped or _is_statistical_surface_token(raw_token, normalized_token):
        return False

    alpha_count = sum(char.isalpha() for char in stripped)
    digit_count = sum(char.isdigit() for char in stripped)
    has_connector = any(char in {":", "/", "+", "-"} for char in stripped)

    if has_connector and alpha_count >= 2:
        return True
    if alpha_count >= 2 and digit_count >= 1:
        return True
    return False


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


def _surface_tokens(text: str) -> list[str]:
    normalized = unicodedata.normalize("NFKC", text or "")
    return [
        token.strip("()[]{}.,;:!?\"'")
        for token in normalized.split()
        if token.strip("()[]{}.,;:!?\"'")
    ]


def _is_short_upper_acronym(token: str) -> bool:
    stripped = token.strip()
    return (
        2 <= len(stripped) <= MAX_ENTITY_ACRONYM_TOKEN_CHARS
        and stripped.isupper()
        and any(char.isalpha() for char in stripped)
        and all(char.isalnum() or char in "/+-" for char in stripped)
    )


def _has_mid_sentence_proper_noun(tokens: list[str]) -> bool:
    for token in tokens[1:]:
        if len(token) < MIN_ENTITY_PROPER_NOUN_CHARS:
            continue
        if token[0].isupper() and token[1:].islower():
            return True
    return False


def has_query_entity_surface_signal(text: str) -> bool:
    """Return True when the query text carries a high-precision entity-like surface signal."""

    normalized = unicodedata.normalize("NFKC", text or "")
    if not normalized:
        return False
    if re.search(r"\(([A-Z][A-Z0-9/+:-]{1,7})\)", normalized):
        return True

    tokens = _surface_tokens(normalized)
    for token in tokens:
        normalized_token = normalize_entity_query_text(token)
        if normalized_token and _has_specific_entity_token(normalized_token):
            return True
        if _is_short_upper_acronym(token):
            return True
    return _has_mid_sentence_proper_noun(tokens)


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


def _has_obvious_sentence_opening(text: str) -> bool:
    tokens = normalize_query_text(text).split()
    if not tokens:
        return False
    return any(tuple(tokens[: len(prefix)]) == prefix for prefix in SENTENCE_OPENING_PREFIXES)


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
    if _has_prose_clause_signal(normalized, token_count=token_count):
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
