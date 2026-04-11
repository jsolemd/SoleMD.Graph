"""Shared helpers for the PostgreSQL RAG repository."""

from __future__ import annotations

import json
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.rag import queries
from app.rag.biomedical_concept_normalizer import VocabConceptMatch

ENTITY_FUZZY_SIMILARITY_THRESHOLD = queries.ENTITY_FUZZY_SIMILARITY_THRESHOLD
ENTITY_TOP_CONCEPTS_PER_TERM = queries.ENTITY_TOP_CONCEPTS_PER_TERM
SEMANTIC_NEIGHBOR_MIN_LIMIT = 1


def _dense_score_from_distance(distance: Any | None) -> float:
    """Map ANN distance values to a normalized dense score."""

    if distance is None:
        return 0.0
    return max(0.0, 1.0 - float(distance))


class _PinnedConnectionContext:
    """No-op context wrapper for a connection already owned by the caller."""

    def __init__(self, conn: Any):
        self._conn = conn

    def __enter__(self) -> Any:
        return self._conn

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


@dataclass(frozen=True, slots=True)
class _SqlSpec:
    """Internal SQL execution spec shared by runtime execution and profiling."""

    route_name: str
    sql: str
    params: tuple[Any, ...]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ResolvedEntityConcept:
    """Canonical exact entity resolution used across seeded search and finalize."""

    raw_term: str
    resolved_term: str
    entity_type: str
    concept_namespace: str | None
    concept_id: str
    rule_confidence: str | None = None
    has_entity_rule: bool = False
    source_surface: str | None = None
    vocab_term_id: str | None = None
    vocab_alias_key: str | None = None
    vocab_alias_type: str | None = None
    vocab_quality_score: int | None = None
    vocab_is_preferred: bool | None = None
    vocab_umls_cui: str | None = None
    vocab_mesh_id: str | None = None
    vocab_category: str | None = None


@dataclass(frozen=True, slots=True)
class ResolvedQueryEntityTerms:
    """Resolved query entity terms plus typed vocab concept matches."""

    all_terms: list[str]
    high_confidence_terms: set[str]
    resolved_concepts: tuple[ResolvedEntityConcept, ...] = field(default_factory=tuple)
    vocab_concept_matches: list[VocabConceptMatch] = field(default_factory=list)


def _normalize_json_strings(raw_values: Any) -> list[str]:
    if raw_values is None:
        return []
    if isinstance(raw_values, str):
        text = raw_values.strip()
        if not text:
            return []
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            return [text]
        return _normalize_json_strings(parsed)
    if not isinstance(raw_values, list):
        return []

    normalized: list[str] = []
    for value in raw_values:
        if isinstance(value, str):
            stripped = value.strip()
            if stripped:
                normalized.append(stripped)
            continue
        if isinstance(value, list):
            normalized.extend(_normalize_json_strings(value))
            continue
        if isinstance(value, dict):
            text = value.get("text")
            if isinstance(text, str) and text.strip():
                normalized.append(text.strip())
    return normalized


def _unique_int_ids(values: Sequence[int]) -> list[int]:
    return list(dict.fromkeys(int(value) for value in values))


def _unique_stripped(values: Sequence[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


def _unique_resolved_entity_concepts(
    values: Sequence[ResolvedEntityConcept],
) -> list[ResolvedEntityConcept]:
    unique: list[ResolvedEntityConcept] = []
    seen: set[tuple[str, str, str | None, str, str | None]] = set()
    for value in values:
        key = (
            value.raw_term.lower(),
            value.entity_type,
            value.concept_namespace,
            value.concept_id,
            value.source_surface,
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(value)
    return unique


def _resolved_entity_concept_arrays(
    values: Sequence[ResolvedEntityConcept],
) -> tuple[list[str], list[str], list[str | None], list[str]]:
    unique = _unique_resolved_entity_concepts(values)
    raw_terms: list[str] = []
    entity_types: list[str] = []
    concept_namespaces: list[str | None] = []
    concept_ids: list[str] = []
    for value in unique:
        raw_terms.append(value.raw_term)
        entity_types.append(value.entity_type)
        concept_namespaces.append(value.concept_namespace)
        concept_ids.append(value.concept_id)
    return (
        raw_terms,
        entity_types,
        concept_namespaces,
        concept_ids,
    )
