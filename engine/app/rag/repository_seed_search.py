"""Entity and relation seed-search mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag import queries
from app.entities.alias_keys import normalize_alias_key
from app.rag._query_enrichment_const import RUNTIME_ENTITY_NOISE_TOKENS
from app.rag.biomedical_concept_normalizer import (
    _VocabConceptRow,
    build_vocab_concept_matches,
)
from app.rag.models import PaperEvidenceHit
from app.rag.query_enrichment import normalize_entity_query_text
from app.rag.repository_support import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    ResolvedEntityConcept,
    ResolvedQueryEntityTerms,
    _resolved_entity_concept_arrays,
    _unique_int_ids,
    _unique_resolved_entity_concepts,
    _unique_stripped,
)


class _SeedSearchMixin:
    def _trim_query_resolution_raw_term(self, raw_term: str) -> str:
        tokens = [
            token
            for token in normalize_entity_query_text(raw_term).split()
            if token.strip()
        ]
        while tokens and tokens[0] in RUNTIME_ENTITY_NOISE_TOKENS:
            tokens.pop(0)
        while tokens and tokens[-1] in RUNTIME_ENTITY_NOISE_TOKENS:
            tokens.pop()
        return " ".join(tokens)

    def _raw_term_contains(
        self,
        longer_raw_term: str,
        shorter_raw_term: str,
    ) -> bool:
        longer_tokens = [token for token in longer_raw_term.split() if token]
        shorter_tokens = [token for token in shorter_raw_term.split() if token]
        if not longer_tokens or not shorter_tokens:
            return False
        if len(shorter_tokens) >= len(longer_tokens):
            return False
        return any(
            longer_tokens[index : index + len(shorter_tokens)] == shorter_tokens
            for index in range(0, len(longer_tokens) - len(shorter_tokens) + 1)
        )

    def _query_resolution_term_overlap(
        self,
        *,
        raw_term: str,
        resolved_term: str,
    ) -> int:
        raw_tokens = {
            token
            for token in normalize_entity_query_text(raw_term).split()
            if token.strip()
        }
        resolved_tokens = {
            token
            for token in normalize_entity_query_text(resolved_term).split()
            if token.strip()
        }
        if not raw_tokens or not resolved_tokens:
            return 0
        return len(raw_tokens & resolved_tokens)

    def _should_query_supplemental_vocab_rows(
        self,
        concepts: Sequence[ResolvedEntityConcept],
    ) -> bool:
        if not concepts:
            return True
        for concept in concepts:
            raw_term = self._trim_query_resolution_raw_term(concept.raw_term)
            resolved_term = normalize_entity_query_text(concept.resolved_term)
            if not raw_term or not resolved_term:
                continue
            raw_tokens = [token for token in normalize_entity_query_text(raw_term).split() if token]
            if not raw_tokens:
                continue
            overlap = self._query_resolution_term_overlap(
                raw_term=raw_term,
                resolved_term=resolved_term,
            )
            if overlap < len(set(raw_tokens)):
                return True
        return False

    def _is_trusted_query_resolution_concept(
        self,
        concept: ResolvedEntityConcept,
    ) -> bool:
        raw_term = self._trim_query_resolution_raw_term(concept.raw_term)
        resolved_term = normalize_entity_query_text(concept.resolved_term)
        if not raw_term or not resolved_term:
            return False
        if concept.source_surface == "vocab_alias":
            return True
        if raw_term == resolved_term:
            return True
        raw_token_count = len([token for token in raw_term.split() if token])
        return raw_token_count >= 2 and concept.has_entity_rule

    def _trusted_query_resolution_concepts(
        self,
        concepts: Sequence[ResolvedEntityConcept],
    ) -> list[ResolvedEntityConcept]:
        trusted = [
            concept
            for concept in _unique_resolved_entity_concepts(concepts)
            if self._is_trusted_query_resolution_concept(concept)
        ]
        if len(trusted) <= 1:
            return trusted

        deduped_by_trimmed_key: dict[
            tuple[str, str, str | None, str],
            ResolvedEntityConcept,
        ] = {}
        pruned: list[ResolvedEntityConcept] = []
        trimmed_raw_terms = {
            id(concept): self._trim_query_resolution_raw_term(concept.raw_term)
            for concept in trusted
        }
        for concept in trusted:
            trimmed_raw_term = trimmed_raw_terms[id(concept)]
            if not trimmed_raw_term:
                continue
            trimmed_key = (
                trimmed_raw_term,
                concept.entity_type,
                concept.concept_namespace,
                concept.concept_id,
            )
            existing = deduped_by_trimmed_key.get(trimmed_key)
            if existing is None:
                deduped_by_trimmed_key[trimmed_key] = concept
                continue
            existing_source_rank = 0 if existing.source_surface == "vocab_alias" else 1
            concept_source_rank = 0 if concept.source_surface == "vocab_alias" else 1
            existing_token_count = len(
                normalize_entity_query_text(existing.raw_term).split()
            )
            concept_token_count = len(
                normalize_entity_query_text(concept.raw_term).split()
            )
            if (
                concept_source_rank,
                concept_token_count,
                len(concept.raw_term),
            ) < (
                existing_source_rank,
                existing_token_count,
                len(existing.raw_term),
            ):
                deduped_by_trimmed_key[trimmed_key] = concept

        deduped_trusted = list(deduped_by_trimmed_key.values())
        trimmed_raw_terms = {
            id(concept): self._trim_query_resolution_raw_term(concept.raw_term)
            for concept in deduped_trusted
        }
        concepts_by_trimmed_raw_term: dict[str, list[ResolvedEntityConcept]] = {}
        for concept in deduped_trusted:
            trimmed_raw_term = trimmed_raw_terms[id(concept)]
            if not trimmed_raw_term:
                continue
            concepts_by_trimmed_raw_term.setdefault(trimmed_raw_term, []).append(concept)

        retained_concepts: list[ResolvedEntityConcept] = []
        for trimmed_raw_term, grouped_concepts in concepts_by_trimmed_raw_term.items():
            if len(grouped_concepts) == 1:
                retained_concepts.extend(grouped_concepts)
                continue
            overlap_by_concept = {
                id(concept): self._query_resolution_term_overlap(
                    raw_term=trimmed_raw_term,
                    resolved_term=concept.resolved_term,
                )
                for concept in grouped_concepts
            }
            max_overlap = max(overlap_by_concept.values(), default=0)
            if max_overlap > 0:
                retained_concepts.extend(
                    concept
                    for concept in grouped_concepts
                    if overlap_by_concept[id(concept)] == max_overlap
                )
                continue
            retained_concepts.extend(grouped_concepts)

        for concept in retained_concepts:
            trimmed_raw_term = trimmed_raw_terms[id(concept)]
            if not trimmed_raw_term:
                continue
            if any(
                other is not concept
                and self._raw_term_contains(
                    trimmed_raw_terms[id(other)],
                    trimmed_raw_term,
                )
                for other in retained_concepts
            ):
                continue
            pruned.append(concept)
        return pruned or retained_concepts or deduped_trusted

    def _build_vocab_concept_matches(
        self,
        *,
        query_phrases: Sequence[str],
        concepts: Sequence[ResolvedEntityConcept],
        supplemental_vocab_rows: Sequence[_VocabConceptRow] = (),
    ):
        vocab_rows: list[_VocabConceptRow] = []
        entity_rule_concept_ids = frozenset(
            concept.concept_id
            for concept in concepts
            if concept.has_entity_rule and concept.concept_id
        )
        for concept in concepts:
            if concept.source_surface != "vocab_alias":
                continue
            if not concept.vocab_term_id:
                continue
            vocab_rows.append(
                _VocabConceptRow(
                    alias_key=concept.vocab_alias_key or normalize_entity_query_text(concept.raw_term),
                    preferred_term=concept.resolved_term,
                    matched_alias=concept.vocab_alias_key or concept.raw_term,
                    alias_type=concept.vocab_alias_type,
                    quality_score=concept.vocab_quality_score,
                    is_preferred=bool(concept.vocab_is_preferred),
                    umls_cui=concept.vocab_umls_cui,
                    term_id=concept.vocab_term_id,
                    category=concept.vocab_category,
                    mesh_id=concept.vocab_mesh_id,
                    entity_type=concept.entity_type,
                    source_surface=concept.source_surface or "vocab_alias",
                )
            )
        vocab_rows.extend(supplemental_vocab_rows)
        if not vocab_rows:
            return []
        return build_vocab_concept_matches(
            raw_phrases=query_phrases,
            vocab_concepts=vocab_rows,
            entity_rule_concept_ids=entity_rule_concept_ids,
        )

    def _supplemental_vocab_query_phrases(
        self,
        *,
        query_phrases: Sequence[str],
        concepts: Sequence[ResolvedEntityConcept],
    ) -> list[str]:
        normalized_phrases = _unique_stripped(query_phrases)
        if not normalized_phrases:
            return []

        covered_alias_keys = {
            normalize_alias_key(concept.raw_term)
            for concept in concepts
            if concept.source_surface == "vocab_alias" and concept.raw_term.strip()
        }
        resolved_token_union: set[str] = set()
        for concept in concepts:
            resolved_alias_key = normalize_alias_key(concept.resolved_term)
            if not resolved_alias_key:
                continue
            resolved_token_union.update(
                token for token in resolved_alias_key.split() if token
            )

        supplemental: list[str] = []
        seen_alias_keys: set[str] = set()
        for phrase in normalized_phrases:
            alias_key = normalize_alias_key(phrase)
            if not alias_key or alias_key in covered_alias_keys or alias_key in seen_alias_keys:
                continue
            phrase_tokens = {token for token in alias_key.split() if token}
            if phrase_tokens and phrase_tokens.issubset(resolved_token_union):
                continue
            seen_alias_keys.add(alias_key)
            supplemental.append(phrase)
        return supplemental

    def _resolve_vocab_concept_rows(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[_VocabConceptRow]:
        normalized_phrases = _unique_stripped(query_phrases)
        if not normalized_phrases:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.QUERY_VOCAB_CONCEPT_MATCH_SQL,
                    (
                        normalized_phrases,
                        max(limit, 1),
                    ),
                )
                rows = cur.fetchall()

        vocab_rows: list[_VocabConceptRow] = []
        seen: set[tuple[str, str, str]] = set()
        for row in rows:
            alias_key = str(row.get("alias_key") or "").strip()
            preferred_term = str(row.get("preferred_term") or "").strip()
            term_id = str(row.get("term_id") or "").strip()
            if not alias_key or not preferred_term or not term_id:
                continue
            key = (alias_key, preferred_term.casefold(), term_id)
            if key in seen:
                continue
            seen.add(key)
            vocab_rows.append(
                _VocabConceptRow(
                    alias_key=alias_key,
                    preferred_term=preferred_term,
                    matched_alias=str(row.get("matched_alias") or alias_key).strip(),
                    alias_type=(
                        str(row["alias_type"]).strip()
                        if row.get("alias_type") is not None
                        else None
                    ),
                    quality_score=(
                        int(row["quality_score"])
                        if row.get("quality_score") is not None
                        else None
                    ),
                    is_preferred=bool(row.get("is_preferred")),
                    umls_cui=(
                        str(row["umls_cui"]).strip()
                        if row.get("umls_cui") is not None
                        else None
                    ),
                    term_id=term_id,
                    category=(
                        str(row["category"]).strip()
                        if row.get("category") is not None
                        else None
                    ),
                    mesh_id=(
                        str(row["mesh_id"]).strip()
                        if row.get("mesh_id") is not None
                        else None
                    ),
                    entity_type=(
                        str(row["entity_type"]).strip()
                        if row.get("entity_type") is not None
                        else None
                    ),
                    source_surface=(
                        str(row["source_surface"]).strip()
                        if row.get("source_surface") is not None
                        else "vocab_alias"
                    ),
                )
            )
        return vocab_rows

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
            seen: set[tuple[str, str, str | None, str, str | None]] = set()
            for phrase in normalized_phrases:
                for concept in cache.get(phrase.casefold(), ()):
                    key = (
                        concept.raw_term.casefold(),
                        concept.entity_type,
                        concept.concept_namespace,
                        concept.concept_id,
                        concept.source_surface,
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
        seen: set[tuple[str, str, str | None, str, str | None]] = set()
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
            source_surface = (
                str(row["source_surface"]).strip()
                if row.get("source_surface") is not None
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
                has_entity_rule=bool(row.get("has_entity_rule")),
                source_surface=source_surface,
                vocab_term_id=(
                    str(row["vocab_term_id"]).strip()
                    if row.get("vocab_term_id") is not None
                    else None
                ),
                vocab_alias_key=(
                    str(row["vocab_alias_key"]).strip()
                    if row.get("vocab_alias_key") is not None
                    else None
                ),
                vocab_alias_type=(
                    str(row["vocab_alias_type"]).strip()
                    if row.get("vocab_alias_type") is not None
                    else None
                ),
                vocab_quality_score=(
                    int(row["vocab_quality_score"])
                    if row.get("vocab_quality_score") is not None
                    else None
                ),
                vocab_is_preferred=(
                    bool(row["vocab_is_preferred"])
                    if row.get("vocab_is_preferred") is not None
                    else None
                ),
                vocab_umls_cui=(
                    str(row["vocab_umls_cui"]).strip()
                    if row.get("vocab_umls_cui") is not None
                    else None
                ),
                vocab_mesh_id=(
                    str(row["vocab_mesh_id"]).strip()
                    if row.get("vocab_mesh_id") is not None
                    else None
                ),
                vocab_category=(
                    str(row["vocab_category"]).strip()
                    if row.get("vocab_category") is not None
                    else None
                ),
            )
            key = (
                concept.raw_term.casefold(),
                concept.entity_type,
                concept.concept_namespace,
                concept.concept_id,
                concept.source_surface,
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
    ) -> ResolvedQueryEntityTerms:
        """Resolve entity terms plus typed vocab concept matches."""

        concepts = self._resolve_query_entity_concepts(
            query_phrases=query_phrases,
            limit=limit,
        )
        trusted_concepts = self._trusted_query_resolution_concepts(concepts)
        supplemental_query_phrases = (
            self._supplemental_vocab_query_phrases(
                query_phrases=query_phrases,
                concepts=trusted_concepts,
            )
            if self._should_query_supplemental_vocab_rows(trusted_concepts)
            else []
        )
        supplemental_vocab_rows = (
            self._resolve_vocab_concept_rows(
                query_phrases=supplemental_query_phrases,
                limit=limit,
            )
            if supplemental_query_phrases
            else []
        )
        vocab_concept_matches = self._build_vocab_concept_matches(
            query_phrases=query_phrases,
            concepts=concepts,
            supplemental_vocab_rows=supplemental_vocab_rows,
        )
        high_confidence_vocab_terms = {
            match.preferred_term.casefold()
            for match in vocab_concept_matches
            if match.confidence == "high"
        }
        ordered_terms: list[str] = []
        term_by_key: dict[str, str] = {}
        high_confidence_keys: set[str] = set()
        for concept in trusted_concepts:
            term = concept.resolved_term.strip()
            if not term:
                continue
            term_key = term.casefold()
            if term_key not in term_by_key:
                term_by_key[term_key] = term
                ordered_terms.append(term)
            if concept.rule_confidence == "high" or term_key in high_confidence_vocab_terms:
                high_confidence_keys.add(term_key)
        high_confidence = {
            term_by_key[term_key]
            for term_key in high_confidence_keys
            if term_key in term_by_key
        }
        return ResolvedQueryEntityTerms(
            all_terms=ordered_terms,
            high_confidence_terms=high_confidence,
            resolved_concepts=tuple(trusted_concepts),
            vocab_concept_matches=vocab_concept_matches,
        )

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
        resolved_concepts: Sequence[ResolvedEntityConcept] | None = None,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = _unique_stripped(entity_terms)
        provided_resolved_concepts = _unique_resolved_entity_concepts(
            list(resolved_concepts or ())
        )
        if not normalized_terms and not provided_resolved_concepts:
            return []

        exact_resolved_concepts = provided_resolved_concepts or self._resolve_query_entity_concepts(
            query_phrases=normalized_terms,
            limit=len(normalized_terms),
        )
        if not normalized_terms and provided_resolved_concepts:
            normalized_terms = _unique_stripped(
                [concept.resolved_term for concept in provided_resolved_concepts]
            )
        if exact_resolved_concepts:
            resolved_term_keys = {
                normalize_entity_query_text(concept.raw_term)
                for concept in exact_resolved_concepts
                if concept.raw_term and concept.raw_term.strip()
            }
            resolved_term_keys.update(
                normalize_entity_query_text(concept.resolved_term)
                for concept in exact_resolved_concepts
                if concept.resolved_term and concept.resolved_term.strip()
            )
            normalized_term_keys = {
                normalize_entity_query_text(term)
                for term in normalized_terms
            }
            if normalized_term_keys and normalized_term_keys.issubset(resolved_term_keys):
                exact_hits = self._search_exact_entity_papers(
                    graph_run_id=graph_run_id,
                    resolved_concepts=exact_resolved_concepts,
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
