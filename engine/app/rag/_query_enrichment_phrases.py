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
    PROSE_CLAUSE_TOKENS,
    RUNTIME_ENTITY_NOISE_TOKENS,
    STATISTICAL_ANCHOR_PREFIXES,
)
from app.rag.types import QueryRetrievalProfile


_DISCONTINUATION_CUE_PHRASES: tuple[str, ...] = (
    "after stopping",
    "coming off",
    "came off",
    "stopping",
    "stopped",
    "discontinuation",
    "withdrawal",
    "withdraw",
    "withdrawn",
)
_ANTIDEPRESSANT_CUE_PHRASES: tuple[str, ...] = (
    "antidepressant",
    "antidepressants",
    "ssri",
    "ssris",
    "snri",
    "snris",
)
_ANTIPSYCHOTIC_CUE_PHRASES: tuple[str, ...] = (
    "antipsychotic",
    "antipsychotics",
    "neuroleptic",
    "neuroleptics",
)
_RESTLESSNESS_CUE_PHRASES: tuple[str, ...] = (
    "sit still",
    "restless",
    "restlessness",
    "urge to move",
    "inner restlessness",
)
_CORTICOSTEROID_CUE_PHRASES: tuple[str, ...] = (
    "steroid",
    "steroids",
    "corticosteroid",
    "corticosteroids",
    "dexamethasone",
    "prednisone",
    "prednisolone",
    "methylprednisolone",
    "dex",
)
_NEUROPSYCH_CUE_PHRASES: tuple[str, ...] = (
    "mania",
    "manic",
    "psychosis",
    "psychotic",
    "psychiatric",
    "neuropsychiatric",
)


def _contains_any_phrase(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text for phrase in phrases)


def _merge_unique_resolution_phrases(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for phrase in group:
            normalized = normalize_entity_query_text(phrase)
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            merged.append(normalized)
            if len(merged) >= MAX_ENTITY_RESOLUTION_PHRASES:
                return merged
    return merged


def _composite_entity_resolution_phrases(
    text: str,
    *,
    normalized_query: str | None = None,
) -> list[str]:
    normalized = normalize_query_text(normalized_query or text)
    if not normalized:
        return []

    derived: list[str] = []

    has_discontinuation_cue = _contains_any_phrase(normalized, _DISCONTINUATION_CUE_PHRASES)
    has_antidepressant_cue = _contains_any_phrase(normalized, _ANTIDEPRESSANT_CUE_PHRASES)
    if has_discontinuation_cue and has_antidepressant_cue:
        derived.extend(
            [
                "antidepressant discontinuation syndrome",
                "withdrawal syndrome",
            ]
        )

    has_antipsychotic_cue = _contains_any_phrase(normalized, _ANTIPSYCHOTIC_CUE_PHRASES)
    has_restlessness_cue = _contains_any_phrase(normalized, _RESTLESSNESS_CUE_PHRASES)
    if has_antipsychotic_cue and has_restlessness_cue:
        derived.extend(
            [
                "drug induced akathisia",
                "akathisia",
                "antipsychotics",
            ]
        )

    has_corticosteroid_cue = _contains_any_phrase(normalized, _CORTICOSTEROID_CUE_PHRASES)
    has_neuropsych_cue = _contains_any_phrase(normalized, _NEUROPSYCH_CUE_PHRASES)
    if has_corticosteroid_cue and has_neuropsych_cue:
        derived.extend(
            [
                "corticosteroid psychiatric effects",
                "steroid psychosis",
            ]
        )
        if "dexamethasone" in normalized or " dex" in f" {normalized} ":
            derived.append("dexamethasone psychiatric effects")

    return _merge_unique_resolution_phrases(derived)


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
    return bool(_acronym_surface_tokens(token))


def _is_canonical_short_upper_acronym(token: str) -> bool:
    stripped = token.strip()
    return (
        2 <= len(stripped) <= MAX_ENTITY_ACRONYM_TOKEN_CHARS
        and stripped.isupper()
        and any(char.isalpha() for char in stripped)
        and all(char.isalnum() or char in "/+-" for char in stripped)
    )


def _acronym_surface_tokens(token: str) -> tuple[str, ...]:
    stripped = token.strip()
    variants: list[str] = []
    if _is_canonical_short_upper_acronym(stripped):
        variants.append(normalize_entity_query_text(stripped))

    if stripped.endswith("s") and len(stripped) >= 3:
        singular = stripped[:-1]
        if stripped[:-1].isupper() and _is_canonical_short_upper_acronym(singular):
            variants.append(normalize_entity_query_text(stripped))
            variants.append(normalize_entity_query_text(singular))

    return tuple(dict.fromkeys(variant for variant in variants if variant))


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


def should_enrich_resolved_entity_term(
    term: str,
    *,
    entity_confidence: str | None = None,
) -> bool:
    """Return True when an auto-resolved term is specific enough for top-hit enrichment.

    Enrichment can be broader than recall seeding because it only runs against the
    shortlisted papers, but it still needs to exclude query scaffolding such as
    stopwords and generic title nouns ("diagnosis", "management") that add latency
    without improving disambiguation.
    """

    normalized = normalize_entity_query_text(term)
    if not normalized:
        return False
    if entity_confidence == "high":
        return True

    tokens = [token for token in normalized.split() if token]
    if not tokens:
        return False

    informative_tokens = [
        token for token in tokens if token not in RUNTIME_ENTITY_NOISE_TOKENS
    ]
    if not informative_tokens:
        return False
    if any(_has_specific_entity_token(token) for token in informative_tokens):
        return True
    if len(informative_tokens) >= 2:
        return True
    token = informative_tokens[0]
    return len(token) >= 4 and token not in PROSE_CLAUSE_TOKENS


def _entity_surface_anchor_tokens(text: str) -> list[str]:
    anchors: list[str] = []
    seen: set[str] = set()
    for token in _surface_tokens(text):
        acronym_variants = _acronym_surface_tokens(token)
        if acronym_variants:
            for variant in acronym_variants:
                if variant in seen:
                    continue
                seen.add(variant)
                anchors.append(variant)
            continue
        normalized = normalize_entity_query_text(token)
        if not normalized or normalized in seen:
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


def _is_runtime_entity_noise_phrase(phrase: str) -> bool:
    tokens = [token for token in phrase.split() if token]
    return bool(tokens) and all(token in RUNTIME_ENTITY_NOISE_TOKENS for token in tokens)


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
    for anchor in anchors:
        if anchor in seen or len(anchor) < 3:
            continue
        if _is_runtime_entity_noise_phrase(anchor):
            continue
        seen.add(anchor)
        filtered.append(anchor)
        if len(filtered) >= MAX_ENTITY_RESOLUTION_PHRASES:
            return filtered

    for phrase in build_entity_query_phrases(text):
        if phrase in seen:
            continue
        if _is_runtime_entity_noise_phrase(phrase):
            continue
        if any(_phrase_contains_anchor(phrase, anchor) for anchor in anchors):
            seen.add(phrase)
            filtered.append(phrase)
        if len(filtered) >= MAX_ENTITY_RESOLUTION_PHRASES:
            break
    return filtered


def _bounded_entity_resolution_phrase_inventory(
    text: str,
    *,
    normalized_query: str | None = None,
) -> list[str]:
    phrases: list[str] = []
    seen: set[str] = set()
    for phrase in dict.fromkeys(
        [
            *build_entity_query_phrases(text),
            *build_query_phrases(normalized_query or text),
        ]
    ):
        if phrase in seen or _is_runtime_entity_noise_phrase(phrase):
            continue
        phrase_tokens = [token for token in phrase.split() if token]
        if len(phrase_tokens) == 1:
            token = phrase_tokens[0]
            if token in PROSE_CLAUSE_TOKENS:
                continue
            if len(token) < 4 and not _has_specific_entity_token(token):
                continue
        seen.add(phrase)
        phrases.append(phrase)
    return phrases


def build_runtime_entity_resolution_phrases(
    text: str,
    *,
    retrieval_profile: QueryRetrievalProfile,
    normalized_query: str | None = None,
) -> list[str]:
    """Build query phrases for runtime entity resolution without widening passage noise.

    Title/general/question lookups keep the broader phrase inventory so generic
    biomedical queries can still resolve missing entity terms. Passage lookups prefer
    the compact anchor-aware lane, but short expert prompts fall back to the same
    bounded inventory when no anchor phrases survive and the surface does not look
    like statistical prose.

    Composite clinical-event phrases are prepended when the query surface carries a
    strong medication/class + effect/discontinuation schema. Those phrases still flow
    through the existing ontology-backed resolver rather than bypassing it.
    """

    composite_phrases = _composite_entity_resolution_phrases(
        text,
        normalized_query=normalized_query,
    )

    if retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        anchored_phrases = build_query_entity_resolution_phrases(text)
        if anchored_phrases:
            if not composite_phrases:
                return anchored_phrases
            return _merge_unique_resolution_phrases(composite_phrases, anchored_phrases)
        if has_statistical_surface_signal(text):
            return composite_phrases
        bounded_inventory = _bounded_entity_resolution_phrase_inventory(
            text,
            normalized_query=normalized_query,
        )
        if not composite_phrases:
            return bounded_inventory
        return _merge_unique_resolution_phrases(
            composite_phrases,
            bounded_inventory,
        )

    bounded_inventory = _bounded_entity_resolution_phrase_inventory(
        text,
        normalized_query=normalized_query,
    )
    if not composite_phrases:
        return bounded_inventory
    return _merge_unique_resolution_phrases(
        composite_phrases,
        bounded_inventory,
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
