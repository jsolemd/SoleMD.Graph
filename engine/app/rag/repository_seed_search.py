"""Entity and relation seed-search mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag import queries
from app.rag.models import PaperEvidenceHit
from app.rag.query_enrichment import normalize_entity_query_text
from app.rag.repository_support import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    ResolvedEntityConcept,
    _resolved_entity_concept_arrays,
    _unique_int_ids,
    _unique_resolved_entity_concepts,
    _unique_stripped,
)


class _SeedSearchMixin:
    def _resolve_query_entity_concepts(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[ResolvedEntityConcept]:
        normalized_phrases = _unique_stripped(query_phrases)
        if not normalized_phrases:
            return []

        cache = None
        if hasattr(self, "_resolved_entity_concepts_by_phrase"):
            cache = self._resolved_entity_concepts_by_phrase.get()

        if cache is not None and all(phrase.casefold() in cache for phrase in normalized_phrases):
            resolved: list[ResolvedEntityConcept] = []
            seen: set[tuple[str, str, str | None, str]] = set()
            for phrase in normalized_phrases:
                for concept in cache.get(phrase.casefold(), ()):
                    key = (
                        concept.raw_term.casefold(),
                        concept.entity_type,
                        concept.concept_namespace,
                        concept.concept_id,
                    )
                    if key in seen:
                        continue
                    seen.add(key)
                    resolved.append(concept)
            return resolved

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.QUERY_ENTITY_TERM_MATCH_SQL,
                    (
                        normalized_phrases,
                        min(limit, len(normalized_phrases)),
                    ),
                )
                rows = cur.fetchall()

        resolved: list[ResolvedEntityConcept] = []
        seen: set[tuple[str, str, str | None, str]] = set()
        for row in rows:
            query_term = str(row.get("query_term") or "").strip()
            normalized_term = str(row.get("normalized_term") or "").strip()
            entity_type = str(row.get("entity_type") or "").strip()
            concept_id = str(row.get("concept_id") or "").strip()
            concept_namespace = (
                str(row["concept_namespace"]).strip()
                if row.get("concept_namespace") is not None
                else None
            )
            if not query_term or not normalized_term or not entity_type or not concept_id:
                continue
            concept = ResolvedEntityConcept(
                raw_term=query_term,
                resolved_term=normalized_term,
                entity_type=entity_type,
                concept_namespace=concept_namespace,
                concept_id=concept_id,
                rule_confidence=(
                    str(row["rule_confidence"])
                    if row.get("rule_confidence") is not None
                    else None
                ),
            )
            key = (
                concept.raw_term.casefold(),
                concept.entity_type,
                concept.concept_namespace,
                concept.concept_id,
            )
            if key in seen:
                continue
            seen.add(key)
            resolved.append(concept)

        if cache is not None:
            grouped_cache_entries: dict[str, list[ResolvedEntityConcept]] = {}
            for concept in resolved:
                cache_keys = {
                    concept.raw_term.casefold(),
                    concept.resolved_term.casefold(),
                }
                for term_key in cache_keys:
                    if not term_key:
                        continue
                    grouped_cache_entries.setdefault(term_key, []).append(concept)
            for key, concepts in grouped_cache_entries.items():
                cache[key] = tuple(_unique_resolved_entity_concepts(concepts))

        return resolved

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> tuple[list[str], set[str]]:
        """Resolve entity terms, returning (all_terms, high_confidence_terms)."""

        concepts = self._resolve_query_entity_concepts(
            query_phrases=query_phrases,
            limit=limit,
        )
        ordered_terms: list[str] = []
        term_by_key: dict[str, str] = {}
        high_confidence_keys: set[str] = set()
        for concept in concepts:
            term = concept.resolved_term.strip()
            if not term:
                continue
            term_key = term.casefold()
            if term_key not in term_by_key:
                term_by_key[term_key] = term
                ordered_terms.append(term)
            if concept.rule_confidence == "high":
                high_confidence_keys.add(term_key)
        high_confidence = {
            term_by_key[term_key]
            for term_key in high_confidence_keys
            if term_key in term_by_key
        }
        return ordered_terms, high_confidence

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = _unique_stripped(relation_terms)
        if not normalized_terms:
            return []

        if scope_corpus_ids:
            sql = queries.PAPER_RELATION_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                _unique_int_ids(scope_corpus_ids),
                limit,
                limit,
            )
        elif self._is_current_graph_run(graph_run_id):
            sql = queries.PAPER_RELATION_SEARCH_CURRENT_MAP_SQL
            params = (normalized_terms, limit, limit)
        else:
            sql = queries.PAPER_RELATION_SEARCH_SQL
            params = (graph_run_id, normalized_terms, limit, limit)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def search_entity_papers(
        self,
        graph_run_id: str,
        *,
        entity_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = _unique_stripped(entity_terms)
        if not normalized_terms:
            return []

        resolved_concepts = self._resolve_query_entity_concepts(
            query_phrases=normalized_terms,
            limit=len(normalized_terms),
        )
        if resolved_concepts:
            exact_term_keys = {
                normalize_entity_query_text(concept.raw_term)
                for concept in resolved_concepts
                if concept.raw_term and concept.raw_term.strip()
            }
            normalized_term_keys = {
                normalize_entity_query_text(term)
                for term in normalized_terms
            }
            if exact_term_keys and exact_term_keys == normalized_term_keys:
                exact_hits = self._search_exact_entity_papers(
                    graph_run_id=graph_run_id,
                    resolved_concepts=resolved_concepts,
                    limit=limit,
                    scope_corpus_ids=scope_corpus_ids,
                )
                if exact_hits:
                    return exact_hits

        if scope_corpus_ids:
            sql = queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                _unique_int_ids(scope_corpus_ids),
                limit,
            )
        elif self._is_current_graph_run(graph_run_id):
            sql = queries.PAPER_ENTITY_SEARCH_CURRENT_MAP_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                limit,
            )
        else:
            sql = queries.PAPER_ENTITY_SEARCH_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                graph_run_id,
                limit,
            )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def _search_exact_entity_papers(
        self,
        *,
        graph_run_id: str,
        resolved_concepts: Sequence[ResolvedEntityConcept],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        (
            raw_terms,
            entity_types,
            concept_namespaces,
            concept_ids,
        ) = _resolved_entity_concept_arrays(resolved_concepts)
        if not raw_terms:
            return []

        if scope_corpus_ids:
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL
            params = (
                raw_terms,
                entity_types,
                concept_namespaces,
                concept_ids,
                _unique_int_ids(scope_corpus_ids),
                limit,
            )
        elif self._is_current_graph_run(graph_run_id):
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_CURRENT_MAP_SQL
            params = (
                raw_terms,
                entity_types,
                concept_namespaces,
                concept_ids,
                limit,
            )
        else:
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_SQL
            params = (
                raw_terms,
                entity_types,
                concept_namespaces,
                concept_ids,
                graph_run_id,
                limit,
            )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]
