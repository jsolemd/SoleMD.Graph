"""Entity and relation seed-search mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

from collections.abc import Sequence

from app.rag import queries
from app.rag.models import PaperEvidenceHit
from app.rag.query_enrichment import normalize_entity_query_text
from app.rag.repository_support import (
    ENTITY_FUZZY_SIMILARITY_THRESHOLD,
    ENTITY_TOP_CONCEPTS_PER_TERM,
    _unique_int_ids,
    _unique_stripped,
)


class _SeedSearchMixin:
    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> tuple[list[str], set[str]]:
        """Resolve entity terms, returning (all_terms, high_confidence_terms)."""

        normalized_phrases = _unique_stripped(query_phrases)
        if not normalized_phrases:
            return [], set()

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.QUERY_ENTITY_TERM_MATCH_SQL,
                    (normalized_phrases, limit),
                )
                rows = cur.fetchall()

        terms = [str(row["normalized_term"]) for row in rows if row.get("normalized_term")]
        high_confidence = {
            str(row["normalized_term"])
            for row in rows
            if row.get("normalized_term") and row.get("rule_confidence") == "high"
        }
        return terms, high_confidence

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

        exact_terms = self.resolve_query_entity_terms(
            query_phrases=normalized_terms,
            limit=len(normalized_terms),
        )
        if exact_terms:
            exact_term_keys = {
                normalize_entity_query_text(term)
                for term in exact_terms
                if term and term.strip()
            }
            normalized_term_keys = {
                normalize_entity_query_text(term)
                for term in normalized_terms
            }
            if exact_term_keys and exact_term_keys == normalized_term_keys:
                exact_hits = self._search_exact_entity_papers(
                    graph_run_id=graph_run_id,
                    entity_terms=exact_terms,
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
        entity_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        exact_terms = _unique_stripped(entity_terms)
        if not exact_terms:
            return []

        if scope_corpus_ids:
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL
            params = (
                exact_terms,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                _unique_int_ids(scope_corpus_ids),
                limit,
            )
        else:
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_SQL
            params = (
                exact_terms,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                graph_run_id,
                limit,
            )

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]
