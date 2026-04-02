"""Repository helpers for the current-table evidence baseline."""

from __future__ import annotations

import json
import math
from collections import defaultdict
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Protocol

from app import db
from app.config import settings
from app.pgvector_utils import format_vector_literal
from app.rag import queries
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphRelease,
    GraphSignal,
    PaperAssetRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    RelationMatchedPaperHit,
)
from app.rag.query_enrichment import (
    normalize_entity_query_text,
    normalize_query_text,
    normalize_title_key,
)
from app.rag.title_anchor import compute_title_anchor_score, prefix_range_upper_bound
from app.rag.types import CitationDirection, GraphSignalKind, RetrievalChannel
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY

ENTITY_FUZZY_SIMILARITY_THRESHOLD = queries.ENTITY_FUZZY_SIMILARITY_THRESHOLD
ENTITY_TOP_CONCEPTS_PER_TERM = queries.ENTITY_TOP_CONCEPTS_PER_TERM
SEMANTIC_NEIGHBOR_MIN_LIMIT = 1


class _PinnedConnectionContext:
    """No-op context wrapper for a connection already owned by the caller."""

    def __init__(self, conn: Any):
        self._conn = conn

    def __enter__(self) -> Any:
        return self._conn

    def __exit__(self, exc_type, exc, tb) -> bool:
        return False


class RagRepository(Protocol):
    """Read-only repository contract used by the service."""

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease: ...

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[str]: ...

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None: ...

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]: ...

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
        use_title_similarity: bool = True,
    ) -> list[PaperEvidenceHit]: ...

    def search_exact_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_selected_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_chunk_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def search_entity_papers(
        self,
        graph_run_id: str,
        *,
        entity_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]: ...

    def search_query_embedding_papers(
        self,
        *,
        graph_run_id: str,
        query_embedding: Sequence[float],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_known_scoped_papers_by_corpus_ids(
        self,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]: ...

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]: ...

    def fetch_citation_contexts(
        self,
        corpus_ids: Sequence[int],
        *,
        query: str,
        limit_per_paper: int = 3,
    ) -> dict[int, list[CitationContextHit]]: ...

    def fetch_entity_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        entity_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]: ...

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]: ...

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]: ...

    def fetch_assets(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAssetRecord]]: ...

    def fetch_semantic_neighbors(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int = 6,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[GraphSignal]: ...


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

class PostgresRagRepository:
    """Read-only PostgreSQL repository for the baseline evidence service."""

    def __init__(
        self,
        connect: Callable[..., object] | None = None,
        *,
        chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    ):
        self._connect_factory = connect or db.pooled
        self._chunk_version_key = chunk_version_key
        self._disable_session_jit = settings.rag_runtime_disable_jit
        self._graph_release_cache: dict[str, GraphRelease] = {}
        self._semantic_neighbor_index_ready: bool | None = None
        self._graph_scope_paper_counts: dict[str, int] = {}
        self._graph_scope_coverages: dict[str, float] = {}
        self._embedded_paper_count: int | None = None
        self._bound_connection: ContextVar[Any | None] = ContextVar(
            f"rag_repository_connection_{id(self)}",
            default=None,
        )

    def _connect(self):
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            return _PinnedConnectionContext(active_connection)
        return self._connect_factory()

    def _configure_search_session(self, cur: Any) -> None:
        if self._disable_session_jit:
            cur.execute("SET LOCAL jit = off")

    @contextmanager
    def search_session(self) -> Iterator[None]:
        active_connection = self._bound_connection.get()
        if active_connection is not None:
            yield
            return

        with self._connect_factory() as conn:
            with conn.cursor() as cur:
                self._configure_search_session(cur)
            token = self._bound_connection.set(conn)
            try:
                yield
            finally:
                self._bound_connection.reset(token)

    def _paper_hit_from_row(self, row: dict[str, Any]) -> PaperEvidenceHit:
        return PaperEvidenceHit(
            corpus_id=int(row["corpus_id"]),
            paper_id=row.get("paper_id"),
            semantic_scholar_paper_id=row.get("semantic_scholar_paper_id")
            or row.get("paper_id"),
            title=row.get("title"),
            journal_name=row.get("journal_name"),
            year=row.get("year"),
            doi=row.get("doi"),
            pmid=row.get("pmid"),
            pmcid=row.get("pmcid"),
            abstract=row.get("abstract"),
            tldr=row.get("tldr"),
            text_availability=row.get("text_availability"),
            is_open_access=row.get("is_open_access"),
            citation_count=row.get("citation_count"),
            influential_citation_count=row.get("influential_citation_count"),
            reference_count=row.get("reference_count"),
            publication_types=list(row.get("publication_types") or []),
            fields_of_study=list(row.get("fields_of_study") or []),
            has_rule_evidence=bool(row.get("has_rule_evidence")),
            has_curated_journal_family=bool(row.get("has_curated_journal_family")),
            journal_family_type=row.get("journal_family_type"),
            entity_rule_families=int(row.get("entity_rule_families") or 0),
            entity_rule_count=int(row.get("entity_rule_count") or 0),
            entity_core_families=int(row.get("entity_core_families") or 0),
            lexical_score=float(row.get("lexical_score") or 0.0),
            chunk_lexical_score=float(row.get("chunk_lexical_score") or 0.0),
            title_similarity=float(row.get("title_similarity") or 0.0),
            entity_score=float(row.get("entity_candidate_score") or 0.0),
            relation_score=float(row.get("relation_candidate_score") or 0.0),
            dense_score=max(0.0, 1.0 - float(row.get("distance") or 0.0)),
            chunk_ordinal=row.get("chunk_ordinal"),
            chunk_snippet=row.get("chunk_snippet"),
        )

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        release_key = graph_release_id.strip()
        cached = self._graph_release_cache.get(release_key)
        if cached is not None:
            return cached
        params = (release_key, release_key, release_key)

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.GRAPH_RELEASE_LOOKUP_SQL, params)
                row = cur.fetchone()

        if not row:
            raise LookupError(f"Unknown graph release: {graph_release_id}")

        release = GraphRelease(
            graph_release_id=row.get("bundle_checksum") or row["graph_run_id"],
            graph_run_id=row["graph_run_id"],
            bundle_checksum=row.get("bundle_checksum"),
            graph_name=row["graph_name"],
            is_current=bool(row.get("is_current")),
        )
        self._graph_release_cache[release_key] = release
        return release

    def resolve_query_entity_terms(
        self,
        *,
        query_phrases: Sequence[str],
        limit: int = 5,
    ) -> list[str]:
        normalized_phrases = list(
            dict.fromkeys(phrase.strip() for phrase in query_phrases if phrase and phrase.strip())
        )
        if not normalized_phrases:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.QUERY_ENTITY_TERM_MATCH_SQL,
                    (normalized_phrases, limit),
                )
                rows = cur.fetchall()

        return [str(row["normalized_term"]) for row in rows if row.get("normalized_term")]

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None:
        selected_lookup_ref = selected_graph_paper_ref or selected_paper_id

        if selected_lookup_ref:
            for prefix in ("paper:", "corpus:"):
                if selected_lookup_ref.startswith(prefix):
                    suffix = selected_lookup_ref.split(":", 1)[1]
                    if suffix.isdigit():
                        return int(suffix)

        if selected_node_id:
            for prefix in ("paper:", "corpus:"):
                if selected_node_id.startswith(prefix):
                    suffix = selected_node_id.split(":", 1)[1]
                    if suffix.isdigit():
                        return int(suffix)

            if selected_node_id.isdigit():
                return int(selected_node_id)

        if not selected_lookup_ref:
            return None

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SELECTED_CORPUS_LOOKUP_SQL,
                    (
                        graph_run_id,
                        selected_lookup_ref,
                        selected_lookup_ref,
                        selected_lookup_ref,
                        selected_lookup_ref,
                    ),
                )
                row = cur.fetchone()

        return int(row["corpus_id"]) if row else None

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]:
        normalized_refs = list(
            dict.fromkeys(ref.strip() for ref in graph_paper_refs if ref and ref.strip())
        )
        if not normalized_refs:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SCOPE_CORPUS_LOOKUP_SQL,
                    (
                        graph_run_id,
                        normalized_refs,
                        normalized_refs,
                        normalized_refs,
                        normalized_refs,
                    ),
                )
                rows = cur.fetchall()

        return [int(row["corpus_id"]) for row in rows]

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
        use_title_similarity: bool = True,
    ) -> list[PaperEvidenceHit]:
        normalized_title_query = normalize_title_key(query)
        use_exact_graph_search = (
            self._should_use_exact_graph_search(graph_run_id)
            if not scope_corpus_ids
            else False
        )
        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_SEARCH_IN_SELECTION_SQL
            params = (
                query,
                query,
                query,
                normalized_title_query,
                use_title_similarity,
                unique_scope_ids,
                limit,
                unique_scope_ids,
                limit,
            )
        elif use_title_similarity and use_exact_graph_search:
            sql = queries.PAPER_TITLE_LOOKUP_IN_GRAPH_SQL
            params = (
                query,
                normalized_title_query,
                graph_run_id,
                limit,
                limit,
                limit,
            )
        elif not use_title_similarity and use_exact_graph_search:
            sql = queries.PAPER_SEARCH_IN_GRAPH_SQL
            params = (
                query,
                query,
                query,
                normalized_title_query,
                use_title_similarity,
                graph_run_id,
                limit,
                limit,
            )
        elif use_title_similarity:
            exact_title_hits = self._search_title_lookup_candidate_papers(
                graph_run_id=graph_run_id,
                query=query,
                normalized_title_query=normalized_title_query,
                limit=limit,
                prefix=False,
            )
            if exact_title_hits:
                return exact_title_hits
            candidate_limit = max(limit * 40, 200)
            prefix_title_hits = self._search_title_lookup_candidate_papers(
                graph_run_id=graph_run_id,
                query=query,
                normalized_title_query=normalized_title_query,
                limit=candidate_limit,
                prefix=True,
            )
            if prefix_title_hits:
                return prefix_title_hits[:limit]
            candidate_limit = max(limit * 20, 120)
            sql = queries.PAPER_SEARCH_SQL
            params = (
                query,
                query,
                query,
                normalized_title_query,
                False,
                graph_run_id,
                limit,
                candidate_limit,
                candidate_limit,
                candidate_limit,
                limit,
            )
        else:
            candidate_limit = max(limit * 20, 120)
            sql = queries.PAPER_SEARCH_SQL
            params = (
                query,
                query,
                query,
                normalized_title_query,
                use_title_similarity,
                graph_run_id,
                limit,
                candidate_limit,
                candidate_limit,
                candidate_limit,
                limit,
            )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def _search_title_lookup_candidate_papers(
        self,
        *,
        graph_run_id: str,
        query: str,
        normalized_title_query: str,
        limit: int,
        prefix: bool,
    ) -> list[PaperEvidenceHit]:
        candidate_corpus_ids = self._title_lookup_candidate_corpus_ids(
            query=query,
            normalized_title_query=normalized_title_query,
            limit=limit,
            prefix=prefix,
        )
        if not candidate_corpus_ids:
            return []

        scoped_hits = self.fetch_papers_by_corpus_ids(graph_run_id, candidate_corpus_ids)
        if not scoped_hits:
            return []

        hits_by_corpus_id = {hit.corpus_id: hit for hit in scoped_hits}
        ordered_hits = [
            hits_by_corpus_id[corpus_id]
            for corpus_id in candidate_corpus_ids
            if corpus_id in hits_by_corpus_id
        ]
        if not ordered_hits:
            return []

        for hit in ordered_hits:
            if prefix:
                hit.lexical_score = max(hit.lexical_score, 1.7)
                hit.title_similarity = max(
                    hit.title_similarity,
                    compute_title_anchor_score(
                        query_text=query,
                        title_text=hit.title,
                    ),
                )
            else:
                hit.lexical_score = max(hit.lexical_score, 2.0)
                hit.title_similarity = 1.0
        return ordered_hits

    def _title_lookup_candidate_corpus_ids(
        self,
        *,
        query: str,
        normalized_title_query: str,
        limit: int,
        prefix: bool,
    ) -> list[int]:
        title_query = query.lower()
        normalized_prefix_upper = prefix_range_upper_bound(normalized_title_query)
        title_prefix_upper = prefix_range_upper_bound(title_query)
        sql_specs = (
            (
                queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL,
                (title_query, title_query, title_prefix_upper, limit),
            ),
            (
                queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL,
                (
                    normalized_title_query,
                    normalized_title_query,
                    normalized_prefix_upper,
                    limit,
                ),
            ),
        ) if prefix else (
            (
                queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL,
                (title_query, title_query, title_query, limit),
            ),
            (
                queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL,
                (
                    normalized_title_query,
                    normalized_title_query,
                    normalized_title_query,
                    limit,
                ),
            ),
        )

        candidate_scores: dict[int, tuple[int, int]] = {}
        with self._connect() as conn:
            with conn.cursor() as cur:
                for sql, params in sql_specs:
                    cur.execute(sql, params)
                    for row in cur.fetchall():
                        corpus_id = int(row["corpus_id"])
                        citation_count = int(row.get("citation_count") or 0)
                        best = candidate_scores.get(corpus_id)
                        score = (citation_count, corpus_id)
                        if best is None or score > best:
                            candidate_scores[corpus_id] = score

        return [
            corpus_id
            for corpus_id, _score in sorted(
                candidate_scores.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ][:limit]

    def search_exact_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        normalized_title_query = normalize_title_key(normalized_query)

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            scope_set = set(unique_scope_ids)
            candidate_corpus_ids = [
                corpus_id
                for corpus_id in self._title_lookup_candidate_corpus_ids(
                    query=normalized_query,
                    normalized_title_query=normalized_title_query,
                    limit=limit,
                    prefix=False,
                )
                if corpus_id in scope_set
            ][:limit]
            if not candidate_corpus_ids:
                return []
            scoped_hits = self.fetch_known_scoped_papers_by_corpus_ids(candidate_corpus_ids)
            hits_by_corpus_id = {hit.corpus_id: hit for hit in scoped_hits}
            ordered_hits = [
                hits_by_corpus_id[corpus_id]
                for corpus_id in candidate_corpus_ids
                if corpus_id in hits_by_corpus_id
            ]
        else:
            ordered_hits = self._search_title_lookup_candidate_papers(
                graph_run_id=graph_run_id,
                query=normalized_query,
                normalized_title_query=normalized_title_query,
                limit=limit,
                prefix=False,
            )

        for hit in ordered_hits:
            hit.lexical_score = max(hit.lexical_score, 2.0)
            hit.title_similarity = max(hit.title_similarity, 1.0)

        return ordered_hits[:limit]

    def search_selected_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        if limit <= 0:
            return []

        if scope_corpus_ids is not None:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            if selected_corpus_id not in set(unique_scope_ids):
                return []
            selected_hits = self.fetch_known_scoped_papers_by_corpus_ids([selected_corpus_id])
        else:
            selected_hits = self.fetch_papers_by_corpus_ids(graph_run_id, [selected_corpus_id])
        if not selected_hits:
            return []

        selected_hit = selected_hits[0]
        title_anchor_score = compute_title_anchor_score(
            query_text=query,
            title_text=selected_hit.title,
        )
        if title_anchor_score <= 0:
            return []

        selected_hit.lexical_score = max(
            selected_hit.lexical_score,
            2.0 if title_anchor_score >= 1.0 else 1.85,
        )
        selected_hit.title_similarity = max(
            selected_hit.title_similarity,
            title_anchor_score,
        )
        return [selected_hit]

    def search_chunk_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        normalized_exact_query = normalize_entity_query_text(normalized_query)

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.CHUNK_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_query,
                normalized_query,
                normalized_query,
                normalized_exact_query,
                self._chunk_version_key,
                unique_scope_ids,
                limit,
            )
        else:
            candidate_limit = max(limit * 24, 120)
            sql = queries.CHUNK_SEARCH_SQL
            params = (
                normalized_query,
                normalized_query,
                normalized_query,
                normalized_exact_query,
                graph_run_id,
                self._chunk_version_key,
                candidate_limit,
                limit,
            )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def fetch_papers_by_corpus_ids(
        self,
        graph_run_id: str,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]:
        if not corpus_ids:
            return []

        unique_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_LOOKUP_SQL, (graph_run_id, unique_ids))
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def fetch_known_scoped_papers_by_corpus_ids(
        self,
        corpus_ids: Sequence[int],
    ) -> list[PaperEvidenceHit]:
        if not corpus_ids:
            return []

        unique_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_LOOKUP_DIRECT_SQL, (unique_ids,))
                rows = cur.fetchall()

        return [self._paper_hit_from_row(row) for row in rows]

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms: Sequence[str],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        normalized_terms = list(
            dict.fromkeys(term.strip() for term in relation_terms if term and term.strip())
        )
        if not normalized_terms:
            return []

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_RELATION_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                unique_scope_ids,
                limit,
                limit,
            )
        else:
            sql = queries.PAPER_RELATION_SEARCH_SQL
            params = (
                graph_run_id,
                normalized_terms,
                limit,
                limit,
            )

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
        normalized_terms = list(
            dict.fromkeys(term.strip() for term in entity_terms if term and term.strip())
        )
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
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_ENTITY_SEARCH_IN_SELECTION_SQL
            params = (
                normalized_terms,
                ENTITY_FUZZY_SIMILARITY_THRESHOLD,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                unique_scope_ids,
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
        exact_terms = list(
            dict.fromkeys(term.strip() for term in entity_terms if term and term.strip())
        )
        if not exact_terms:
            return []

        if scope_corpus_ids:
            unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
            sql = queries.PAPER_ENTITY_EXACT_SEARCH_IN_SELECTION_SQL
            params = (
                exact_terms,
                ENTITY_TOP_CONCEPTS_PER_TERM,
                unique_scope_ids,
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

    def search_query_embedding_papers(
        self,
        *,
        graph_run_id: str,
        query_embedding: Sequence[float],
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[PaperEvidenceHit]:
        if not query_embedding:
            return []

        if scope_corpus_ids:
            rows = self._search_query_embedding_in_selection(
                query_embedding=query_embedding,
                limit=limit,
                scope_corpus_ids=scope_corpus_ids,
            )
        else:
            rows = self._search_query_embedding_in_graph(
                graph_run_id=graph_run_id,
                query_embedding=query_embedding,
                limit=limit,
            )
        return self._hydrate_ranked_dense_hits(
            ranked_rows=rows,
            graph_run_id=graph_run_id,
            use_direct_lookup=bool(scope_corpus_ids),
        )

    def fetch_citation_contexts(
        self,
        corpus_ids: Sequence[int],
        *,
        query: str,
        limit_per_paper: int = 3,
    ) -> dict[int, list[CitationContextHit]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[CitationContextHit]] = defaultdict(list)
        query_terms = [part for part in normalize_query_text(query).split() if len(part) >= 4]

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.CITATION_CONTEXT_SQL,
                    (
                        query_terms,
                        list(corpus_ids),
                        list(corpus_ids),
                        list(corpus_ids),
                        list(corpus_ids),
                        limit_per_paper,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            direction = (
                CitationDirection.OUTGOING
                if row.get("direction") == "outgoing"
                else CitationDirection.INCOMING
            )
            citation_id = row.get("citation_id")
            grouped[int(row["corpus_id"])].append(
                CitationContextHit(
                    corpus_id=int(row["corpus_id"]),
                    citation_id=int(citation_id) if citation_id is not None else None,
                    direction=direction,
                    neighbor_corpus_id=(
                        int(row["neighbor_corpus_id"])
                        if row.get("neighbor_corpus_id") is not None
                        else None
                    ),
                    neighbor_paper_id=row.get("neighbor_paper_id"),
                    context_text=row.get("context_text") or "",
                    intents=_normalize_json_strings(row.get("intents")),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def fetch_entity_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        entity_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[EntityMatchedPaperHit]]:
        if not corpus_ids or not entity_terms:
            return {}

        normalized_terms = list(
            dict.fromkeys(term.strip() for term in entity_terms if term and term.strip())
        )
        if not normalized_terms:
            return {}

        grouped: dict[int, list[EntityMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.ENTITY_MATCH_SQL,
                    (
                        normalized_terms,
                        list(corpus_ids),
                        limit_per_paper,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            grouped[int(row["corpus_id"])].append(
                EntityMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    entity_type=row.get("entity_type") or "unknown",
                    concept_id=row.get("concept_id") or "",
                    matched_terms=list(row.get("matched_terms") or []),
                    mention_count=int(row.get("mention_count") or 0),
                    structural_span_count=int(row.get("structural_span_count") or 0),
                    retrieval_default_mention_count=int(
                        row.get("retrieval_default_mention_count") or 0
                    ),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def fetch_relation_matches(
        self,
        corpus_ids: Sequence[int],
        *,
        relation_terms: Sequence[str],
        limit_per_paper: int = 5,
    ) -> dict[int, list[RelationMatchedPaperHit]]:
        if not corpus_ids or not relation_terms:
            return {}

        normalized_terms = list(
            dict.fromkeys(term.strip() for term in relation_terms if term and term.strip())
        )
        if not normalized_terms:
            return {}

        grouped: dict[int, list[RelationMatchedPaperHit]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.RELATION_MATCH_SQL,
                    (
                        normalized_terms,
                        list(corpus_ids),
                        limit_per_paper,
                    ),
                )
                rows = cur.fetchall()

        for row in rows:
            grouped[int(row["corpus_id"])].append(
                RelationMatchedPaperHit(
                    corpus_id=int(row["corpus_id"]),
                    relation_type=str(row.get("relation_type") or "relation"),
                    subject_type=str(row.get("subject_type") or ""),
                    subject_id=str(row.get("subject_id") or ""),
                    object_type=str(row.get("object_type") or ""),
                    object_id=str(row.get("object_id") or ""),
                    score=float(row.get("score") or 0.0),
                )
            )
        return dict(grouped)

    def fetch_references(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperReferenceRecord]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[PaperReferenceRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.REFERENCE_LOOKUP_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            if len(grouped[corpus_id]) >= limit_per_paper:
                continue
            grouped[corpus_id].append(
                PaperReferenceRecord(
                    corpus_id=corpus_id,
                    reference_id=int(row["reference_id"]),
                    reference_index=int(row["reference_index"]),
                    title=row.get("title"),
                    year=row.get("year"),
                    doi=row.get("doi"),
                    pmid=row.get("pmid"),
                    pmcid=row.get("pmcid"),
                    referenced_paper_id=row.get("referenced_paper_id"),
                    referenced_corpus_id=row.get("referenced_corpus_id"),
                )
            )
        return dict(grouped)

    def fetch_assets(
        self,
        corpus_ids: Sequence[int],
        *,
        limit_per_paper: int = 3,
    ) -> dict[int, list[PaperAssetRecord]]:
        if not corpus_ids:
            return {}

        grouped: dict[int, list[PaperAssetRecord]] = defaultdict(list)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.ASSET_LOOKUP_SQL, (list(corpus_ids),))
                rows = cur.fetchall()

        for row in rows:
            corpus_id = int(row["corpus_id"])
            if len(grouped[corpus_id]) >= limit_per_paper:
                continue
            grouped[corpus_id].append(
                PaperAssetRecord(
                    corpus_id=corpus_id,
                    asset_id=int(row["asset_id"]),
                    asset_kind=row.get("asset_kind") or "asset",
                    remote_url=row.get("remote_url"),
                    storage_path=row.get("storage_path"),
                    access_status=row.get("access_status"),
                    license=row.get("license"),
                    metadata=row.get("metadata") or {},
                )
            )
        return dict(grouped)

    def fetch_semantic_neighbors(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int = 6,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> list[GraphSignal]:
        if selected_corpus_id <= 0:
            return []

        if scope_corpus_ids:
            rows = self._fetch_semantic_neighbors_in_selection(
                selected_corpus_id=selected_corpus_id,
                limit=limit,
                scope_corpus_ids=scope_corpus_ids,
            )
        else:
            rows = self._fetch_semantic_neighbors_in_graph(
                graph_run_id=graph_run_id,
                selected_corpus_id=selected_corpus_id,
                limit=limit,
            )

        signals: list[GraphSignal] = []
        for index, row in enumerate(rows, start=1):
            distance = float(row.get("distance") or 0.0)
            signals.append(
                GraphSignal(
                    corpus_id=int(row["corpus_id"]),
                    paper_id=row.get("paper_id"),
                    signal_kind=GraphSignalKind.SEMANTIC_NEIGHBOR,
                    channel=RetrievalChannel.SEMANTIC_NEIGHBOR,
                    score=max(0.0, 1.0 - distance),
                    rank=index,
                    reason="Embedding proximity to the selected paper",
                )
            )
        return signals

    def _semantic_neighbor_limit(self, limit: int) -> int:
        return max(int(limit), SEMANTIC_NEIGHBOR_MIN_LIMIT)

    def _graph_run_paper_count(self, graph_run_id: str) -> int:
        cached = self._graph_scope_paper_counts.get(graph_run_id)
        if cached is not None:
            return cached

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.GRAPH_RELEASE_PAPER_COUNT_SQL, (graph_run_id,))
                row = cur.fetchone()

        paper_count = int((row or {}).get("paper_count") or 0)
        self._graph_scope_paper_counts[graph_run_id] = paper_count
        return paper_count

    def _embedded_paper_count_value(self) -> int:
        if self._embedded_paper_count is not None:
            return self._embedded_paper_count

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.EMBEDDED_PAPER_COUNT_SQL)
                row = cur.fetchone()

        self._embedded_paper_count = int((row or {}).get("paper_count") or 0)
        return self._embedded_paper_count

    def _graph_scope_coverage(self, graph_run_id: str) -> float:
        cached = self._graph_scope_coverages.get(graph_run_id)
        if cached is not None:
            return cached

        embedded_paper_count = self._embedded_paper_count_value()
        if embedded_paper_count <= 0:
            coverage = 1.0
        else:
            coverage = min(
                1.0,
                self._graph_run_paper_count(graph_run_id) / embedded_paper_count,
            )
        self._graph_scope_coverages[graph_run_id] = coverage
        return coverage

    def _ann_candidate_limit(self, *, graph_run_id: str, limit: int) -> int:
        normalized_limit = self._semantic_neighbor_limit(limit)
        min_candidates = max(int(settings.rag_semantic_neighbor_min_candidates), 1)
        max_candidates = max(int(settings.rag_semantic_neighbor_max_candidates), min_candidates)
        multiplier = max(int(settings.rag_semantic_neighbor_candidate_multiplier), 1)
        coverage = max(self._graph_scope_coverage(graph_run_id), 1e-9)
        target_candidates = max(
            normalized_limit * multiplier,
            math.ceil(normalized_limit / coverage),
        )
        return min(max_candidates, max(min_candidates, target_candidates))

    def _should_use_exact_graph_search(self, graph_run_id: str) -> bool:
        return (
            self._graph_run_paper_count(graph_run_id)
            <= settings.rag_runtime_exact_graph_search_max_papers
        )

    def _configure_hnsw_session(self, cur: Any) -> None:
        cur.execute("SET LOCAL hnsw.iterative_scan = strict_order")
        ef_search = max(int(settings.rag_semantic_neighbor_hnsw_ef_search), 1)
        cur.execute(
            f"SET LOCAL hnsw.ef_search = {ef_search}"
        )
        cur.execute(
            "SET LOCAL hnsw.max_scan_tuples = "
            f"{max(int(settings.rag_semantic_neighbor_hnsw_max_scan_tuples), 1)}"
        )

    def _configure_exact_vector_session(self, cur: Any) -> None:
        parallel_workers = max(int(settings.rag_semantic_neighbor_exact_parallel_workers), 0)
        cur.execute(f"SET LOCAL max_parallel_workers_per_gather = {parallel_workers}")
        cur.execute("SET LOCAL enable_indexscan = off")
        cur.execute("SET LOCAL enable_indexonlyscan = off")

    def _semantic_neighbor_index_is_ready(self) -> bool:
        if not settings.rag_semantic_neighbor_ann_enabled:
            return False
        if self._semantic_neighbor_index_ready is not None:
            return self._semantic_neighbor_index_ready

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.SEMANTIC_NEIGHBOR_INDEX_LOOKUP_SQL)
                row = cur.fetchone()

        self._semantic_neighbor_index_ready = bool(row and row.get("index_ready"))
        return self._semantic_neighbor_index_ready

    def _fetch_semantic_neighbors_in_selection(
        self,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids: Sequence[int],
    ) -> list[dict[str, Any]]:
        unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
        if not unique_scope_ids:
            return []
        vector_literal = self._selected_embedding_literal(selected_corpus_id)
        if not vector_literal:
            return []

        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.SEMANTIC_NEIGHBOR_IN_SELECTION_SQL,
                    (
                        vector_literal,
                        unique_scope_ids,
                        selected_corpus_id,
                        vector_literal,
                        self._semantic_neighbor_limit(limit),
                    ),
                )
                return cur.fetchall()

    def _fetch_semantic_neighbors_in_graph(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        normalized_limit = self._semantic_neighbor_limit(limit)
        vector_literal = self._selected_embedding_literal(selected_corpus_id)
        if not vector_literal:
            return []
        if self._should_use_exact_graph_search(graph_run_id):
            return self._fetch_semantic_neighbors_exact(
                graph_run_id=graph_run_id,
                selected_corpus_id=selected_corpus_id,
                vector_literal=vector_literal,
                limit=normalized_limit,
            )
        if self._semantic_neighbor_index_is_ready():
            rows = self._fetch_semantic_neighbors_ann_broad_scope(
                graph_run_id=graph_run_id,
                selected_corpus_id=selected_corpus_id,
                vector_literal=vector_literal,
                limit=normalized_limit,
            )
            if rows:
                return rows

        return self._fetch_semantic_neighbors_exact(
            graph_run_id=graph_run_id,
            selected_corpus_id=selected_corpus_id,
            vector_literal=vector_literal,
            limit=normalized_limit,
        )

    def _selected_embedding_literal(self, corpus_id: int) -> str | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(queries.PAPER_EMBEDDING_LITERAL_SQL, (corpus_id,))
                row = cur.fetchone()
        embedding_literal = (row or {}).get("embedding_literal")
        return str(embedding_literal) if embedding_literal else None

    def _fetch_semantic_neighbors_ann_broad_scope(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        vector_literal: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        candidate_limit = self._ann_candidate_limit(
            graph_run_id=graph_run_id,
            limit=limit,
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._configure_hnsw_session(cur)
                cur.execute(
                    queries.SEMANTIC_NEIGHBOR_ANN_BROAD_SCOPE_SQL,
                    (
                        vector_literal,
                        selected_corpus_id,
                        vector_literal,
                        candidate_limit,
                        graph_run_id,
                        limit,
                    ),
                )
                return cur.fetchall()

    def _search_query_embedding_in_selection(
        self,
        *,
        query_embedding: Sequence[float],
        limit: int,
        scope_corpus_ids: Sequence[int],
    ) -> list[dict[str, Any]]:
        unique_scope_ids = list(dict.fromkeys(int(corpus_id) for corpus_id in scope_corpus_ids))
        if not unique_scope_ids:
            return []

        vector_literal = format_vector_literal(query_embedding)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    queries.DENSE_QUERY_SEARCH_IN_SELECTION_SQL,
                    (
                        vector_literal,
                        unique_scope_ids,
                        vector_literal,
                        self._semantic_neighbor_limit(limit),
                    ),
                )
                return cur.fetchall()

    def _hydrate_ranked_dense_hits(
        self,
        *,
        ranked_rows: Sequence[dict[str, Any]],
        graph_run_id: str,
        use_direct_lookup: bool,
    ) -> list[PaperEvidenceHit]:
        if not ranked_rows:
            return []

        ranked_ids = list(dict.fromkeys(int(row["corpus_id"]) for row in ranked_rows))
        if use_direct_lookup:
            hydrated_hits = self.fetch_known_scoped_papers_by_corpus_ids(ranked_ids)
        else:
            hydrated_hits = self.fetch_papers_by_corpus_ids(graph_run_id, ranked_ids)

        hits_by_corpus_id = {hit.corpus_id: hit for hit in hydrated_hits}
        ordered_hits: list[PaperEvidenceHit] = []
        for row in ranked_rows:
            corpus_id = int(row["corpus_id"])
            hit = hits_by_corpus_id.get(corpus_id)
            if hit is None:
                continue
            hit.dense_score = max(0.0, 1.0 - float(row.get("distance") or 0.0))
            ordered_hits.append(hit)
        return ordered_hits

    def _search_query_embedding_in_graph(
        self,
        *,
        graph_run_id: str,
        query_embedding: Sequence[float],
        limit: int,
    ) -> list[dict[str, Any]]:
        normalized_limit = self._semantic_neighbor_limit(limit)
        vector_literal = format_vector_literal(query_embedding)
        if self._should_use_exact_graph_search(graph_run_id):
            return self._search_query_embedding_exact(
                graph_run_id=graph_run_id,
                vector_literal=vector_literal,
                limit=normalized_limit,
            )
        if self._semantic_neighbor_index_is_ready():
            rows = self._search_query_embedding_ann_broad_scope(
                graph_run_id=graph_run_id,
                vector_literal=vector_literal,
                limit=normalized_limit,
            )
            if rows:
                return rows

        return self._search_query_embedding_exact(
            graph_run_id=graph_run_id,
            vector_literal=vector_literal,
            limit=normalized_limit,
        )

    def _search_query_embedding_exact(
        self,
        *,
        graph_run_id: str,
        vector_literal: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._configure_exact_vector_session(cur)
                cur.execute(
                    queries.DENSE_QUERY_SEARCH_SQL,
                    (
                        vector_literal,
                        graph_run_id,
                        vector_literal,
                        limit,
                    ),
                )
                return cur.fetchall()

    def _search_query_embedding_ann_broad_scope(
        self,
        *,
        graph_run_id: str,
        vector_literal: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        candidate_limit = self._ann_candidate_limit(
            graph_run_id=graph_run_id,
            limit=limit,
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._configure_hnsw_session(cur)
                cur.execute(
                    queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                    (
                        vector_literal,
                        vector_literal,
                        candidate_limit,
                        graph_run_id,
                        limit,
                    ),
                )
                return cur.fetchall()

    def _fetch_semantic_neighbors_exact(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        vector_literal: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                self._configure_exact_vector_session(cur)
                cur.execute(
                    queries.SEMANTIC_NEIGHBOR_SQL,
                    (
                        vector_literal,
                        graph_run_id,
                        selected_corpus_id,
                        vector_literal,
                        limit,
                    ),
                )
                return cur.fetchall()
