"""Concept-bridge helpers for runtime search retrieval.

Keeps expert-language canonicalization logic separate from the main retrieval
orchestration so the retrieval stage can stay focused on lane execution.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.entities.alias_keys import normalize_alias_key
from app.rag.biomedical_concept_normalizer import (
    VocabConceptMatch,
    vocab_concept_enrichment_terms,
    vocab_concept_seed_matches,
    vocab_concept_seed_terms,
)
from app.rag.models import PaperRetrievalQuery
from app.rag.query_enrichment import (
    should_enrich_resolved_entity_term,
    should_seed_resolved_entity_term,
)
from app.rag.repository_support import ResolvedEntityConcept

MAX_CONCEPT_QUERY_EXPANSION_TERMS = 4
MAX_CONCEPT_RESCUE_QUERIES = 2
MIN_CONCEPT_RESCUE_QUERY_TOKENS = 2


def _merge_unique_terms(*groups: Sequence[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for term in group:
            stripped = term.strip()
            if not stripped:
                continue
            key = stripped.casefold()
            if key in seen:
                continue
            seen.add(key)
            merged.append(stripped)
    return merged


def concept_query_expansion_terms(
    query: PaperRetrievalQuery,
    *,
    max_terms: int = MAX_CONCEPT_QUERY_EXPANSION_TERMS,
) -> list[str]:
    source_text = query.focused_query or query.query
    source_key = normalize_alias_key(source_text)
    source_tokens = set(source_key.split())
    ranked_terms: dict[str, tuple[int, int, int, str]] = {}

    def register(term: str, *, priority: int, quality_score: int = 0) -> None:
        stripped = term.strip()
        if not stripped:
            return
        key = normalize_alias_key(stripped)
        if not key or key == source_key:
            return
        key_tokens = set(key.split())
        if key_tokens and key_tokens <= source_tokens:
            return
        candidate = (
            priority,
            -int(quality_score or 0),
            -len(key.split()),
            stripped,
        )
        previous = ranked_terms.get(key)
        if previous is None or candidate < previous:
            ranked_terms[key] = candidate

    for match in query.vocab_concept_matches:
        if match.confidence not in {"high", "medium"}:
            continue
        register(
            match.preferred_term,
            priority=0 if match.confidence == "high" else 1,
            quality_score=match.quality_score or 0,
        )

    for concept in query.resolved_entity_concepts:
        if not concept.resolved_term.strip():
            continue
        if concept.has_entity_rule:
            priority = 0
        elif (concept.rule_confidence or "").casefold() == "high":
            priority = 1
        elif (concept.rule_confidence or "").casefold() == "medium":
            priority = 2
        else:
            continue
        register(
            concept.resolved_term,
            priority=priority,
            quality_score=concept.vocab_quality_score or 0,
        )

    ordered = [
        term
        for _key, (_priority, _neg_quality, _neg_tokens, term) in sorted(
            ranked_terms.items(),
            key=lambda item: item[1],
        )
    ]
    return ordered[:max_terms]


def dense_query_text(query: PaperRetrievalQuery) -> str:
    base_query = query.focused_query or query.query
    expansion_terms = concept_query_expansion_terms(query)
    if not expansion_terms:
        return base_query
    return "; ".join([base_query, *expansion_terms])


def _compose_contextual_concept_query(
    *,
    source_query: str,
    expansion_term: str,
) -> str | None:
    source = source_query.strip()
    term = expansion_term.strip()
    if not source or not term:
        return None
    source_key = normalize_alias_key(source)
    term_key = normalize_alias_key(term)
    if not source_key or not term_key or term_key in source_key:
        return None
    return f"{term} {source}"


def concept_paper_rescue_queries(query: PaperRetrievalQuery) -> list[str]:
    source_query = query.focused_query or query.query
    expansion_terms = concept_query_expansion_terms(query)
    if not expansion_terms:
        return []

    ordered_queries: list[str] = []
    seen: set[str] = set()

    def register(candidate: str | None) -> None:
        if not candidate:
            return
        candidate_key = normalize_alias_key(candidate)
        if not candidate_key or candidate_key in seen:
            return
        if len(candidate_key.split()) < MIN_CONCEPT_RESCUE_QUERY_TOKENS:
            return
        seen.add(candidate_key)
        ordered_queries.append(candidate)

    for term in expansion_terms:
        register(
            _compose_contextual_concept_query(
                source_query=source_query,
                expansion_term=term,
            )
        )
    for term in expansion_terms:
        register(term)

    return ordered_queries[:MAX_CONCEPT_RESCUE_QUERIES]


def entity_seed_terms_for_recall(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
    high_confidence_entity_terms: set[str] | None = None,
    vocab_concept_matches: Sequence[VocabConceptMatch] = (),
) -> list[str]:
    if explicit_entity_terms:
        return explicit_entity_terms
    high_conf = high_confidence_entity_terms or set()
    resolved_seed_terms = [
        term
        for term in resolved_entity_terms
        if should_seed_resolved_entity_term(
            term,
            entity_confidence="high" if term in high_conf else None,
        )
    ]
    return _merge_unique_terms(
        resolved_seed_terms,
        vocab_concept_seed_terms(vocab_concept_matches),
    )


def entity_terms_for_enrichment(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
    high_confidence_entity_terms: set[str] | None = None,
    vocab_concept_matches: Sequence[VocabConceptMatch] = (),
) -> list[str]:
    if explicit_entity_terms:
        return explicit_entity_terms
    high_conf = high_confidence_entity_terms or set()
    resolved_enrichment_terms = [
        term
        for term in resolved_entity_terms
        if should_enrich_resolved_entity_term(
            term,
            entity_confidence="high" if term in high_conf else None,
        )
    ]
    return _merge_unique_terms(
        resolved_enrichment_terms,
        vocab_concept_enrichment_terms(vocab_concept_matches),
    )


def _vocab_seed_concepts_for_recall(
    matches: Sequence[VocabConceptMatch],
) -> tuple[ResolvedEntityConcept, ...]:
    concepts: list[ResolvedEntityConcept] = []
    seen: set[tuple[str, str, str]] = set()
    for match in vocab_concept_seed_matches(matches):
        if not match.mesh_id or not match.entity_type or not match.preferred_term:
            continue
        concept_key = (
            match.mesh_id,
            match.entity_type,
            match.preferred_term.casefold(),
        )
        if concept_key in seen:
            continue
        seen.add(concept_key)
        concepts.append(
            ResolvedEntityConcept(
                raw_term=match.raw_query_phrase,
                resolved_term=match.preferred_term,
                entity_type=match.entity_type,
                concept_namespace="mesh",
                concept_id=match.mesh_id,
                has_entity_rule=match.provenance == "combined",
                source_surface=match.source_surface,
                vocab_term_id=match.term_id,
                vocab_alias_key=normalize_alias_key(match.matched_alias),
                vocab_alias_type=match.alias_type,
                vocab_quality_score=match.quality_score,
                vocab_is_preferred=match.is_preferred,
                vocab_umls_cui=match.umls_cui,
                vocab_mesh_id=match.mesh_id,
                vocab_category=match.category,
            )
        )
    return tuple(concepts)


def entity_seed_concepts_for_recall(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
    resolved_entity_concepts: tuple[ResolvedEntityConcept, ...],
    vocab_concept_matches: Sequence[VocabConceptMatch] = (),
) -> tuple[ResolvedEntityConcept, ...]:
    if explicit_entity_terms:
        return ()

    seeded_term_keys = {
        term.casefold()
        for term in resolved_entity_terms
        if term.strip()
    }
    concepts: list[ResolvedEntityConcept] = [
        concept
        for concept in resolved_entity_concepts
        if concept.resolved_term.strip()
        and concept.resolved_term.casefold() in seeded_term_keys
    ]
    if not concepts and not seeded_term_keys:
        concepts.extend(
            concept
            for concept in resolved_entity_concepts
            if concept.resolved_term.strip() and concept.concept_id.strip()
        )
    concepts.extend(_vocab_seed_concepts_for_recall(vocab_concept_matches))

    deduped: list[ResolvedEntityConcept] = []
    seen: set[tuple[str, str, str | None, str, str | None]] = set()
    for concept in concepts:
        key = (
            concept.raw_term.lower(),
            concept.entity_type,
            concept.concept_namespace,
            concept.concept_id,
            concept.source_surface,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(concept)
    return tuple(deduped)


def entity_concepts_for_enrichment(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_concepts: tuple[ResolvedEntityConcept, ...],
    vocab_concept_matches: Sequence[VocabConceptMatch] = (),
) -> tuple[ResolvedEntityConcept, ...]:
    if explicit_entity_terms:
        return ()

    concepts: list[ResolvedEntityConcept] = [
        concept
        for concept in resolved_entity_concepts
        if concept.resolved_term.strip()
        and concept.concept_id.strip()
    ]
    concepts.extend(_vocab_seed_concepts_for_recall(vocab_concept_matches))

    deduped: list[ResolvedEntityConcept] = []
    seen: set[tuple[str, str, str | None, str, str | None]] = set()
    for concept in concepts:
        key = (
            concept.raw_term.lower(),
            concept.entity_type,
            concept.concept_namespace,
            concept.concept_id,
            concept.source_surface,
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(concept)
    return tuple(deduped)
