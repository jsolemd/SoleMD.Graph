"""Phrase building, surface normalization, and entity surface signal detection."""

from __future__ import annotations

import re
import unicodedata

from app.rag._query_enrichment_const import (
    DEFAULT_QUERY_SYMBOLS,
    ENTITY_QUERY_SYMBOLS,
    MAX_ENTITY_ACRONYM_TOKEN_CHARS,
    MAX_ENTITY_RESOLUTION_PHRASES,
    MAX_QUERY_PHRASE_TOKENS,
    MAX_QUERY_PHRASES,
    MIN_ENTITY_PROPER_NOUN_CHARS,
    STATISTICAL_ANCHOR_PREFIXES,
)
from app.rag.types import QueryRetrievalProfile


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


def should_seed_resolved_entity_term(
    term: str,
    *,
    entity_confidence: str | None = None,
) -> bool:
    """Return True when an auto-resolved entity term is specific enough for recall seeding.

    High-confidence entity_rules terms (from curated vocab) bypass the surface-structure
    specificity check, allowing plain-English domain terms like "delirium" or
    "serotonin syndrome" to seed the entity_match lane.
    """

    stripped = term.strip()
    if not stripped:
        return False
    if entity_confidence == "high":
        return True
    return any(_has_specific_entity_token(token) for token in stripped.split())


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

    Title/general/question lookups keep the broader phrase inventory so generic
    biomedical queries can still resolve missing entity terms. Passage lookups stay
    on the compact anchor-aware lane to avoid spending time on statistical prose.
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


def has_statistical_surface_signal(text: str) -> bool:
    """Return True when the query surface looks like a numeric/statistical excerpt.

    Keep this deliberately narrow for runtime fallback policy. Passage queries with
    multiple numeric/statistical tokens or mixed acronym-plus-stat surfaces tend to
    be weak chunk anchors but can still resolve via cheap paper-level FTS.
    """

    normalized = unicodedata.normalize("NFKC", text or "")
    if not normalized:
        return False

    statistical_tokens = 0
    acronym_tokens = 0
    for token in _surface_tokens(normalized):
        normalized_token = normalize_entity_query_text(token)
        if not normalized_token:
            continue
        if _is_statistical_surface_token(token, normalized_token):
            statistical_tokens += 1
            continue
        if _is_short_upper_acronym(token):
            acronym_tokens += 1

    return statistical_tokens >= 2 or (
        statistical_tokens >= 1 and acronym_tokens >= 1
    )


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
