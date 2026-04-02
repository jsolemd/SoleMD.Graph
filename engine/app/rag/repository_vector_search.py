"""Dense and semantic neighbor search mixins for the PostgreSQL RAG repository."""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

from app.config import settings
from app.pgvector_utils import format_vector_literal
from app.rag import queries
from app.rag.models import GraphSignal, PaperEvidenceHit
from app.rag.repository_support import (
    SEMANTIC_NEIGHBOR_MIN_LIMIT,
    _dense_score_from_distance,
    _SqlSpec,
    _unique_int_ids,
)
from app.rag.types import GraphSignalKind, RetrievalChannel


class _VectorSearchMixin:
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

        sql_spec = self._dense_query_sql_spec(
            graph_run_id=graph_run_id,
            vector_literal=format_vector_literal(query_embedding),
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                if sql_spec.metadata.get("search_mode") == "ann":
                    self._configure_hnsw_session(cur)
                elif sql_spec.metadata.get("search_mode") == "exact":
                    self._configure_exact_vector_session(cur)
                cur.execute(sql_spec.sql, sql_spec.params)
                rows = cur.fetchall()
        return self._hydrate_ranked_dense_hits(
            ranked_rows=rows,
            graph_run_id=graph_run_id,
            use_direct_lookup=bool(scope_corpus_ids),
        )

    def describe_dense_query_route(
        self,
        *,
        graph_run_id: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> dict[str, Any]:
        normalized_limit = self._semantic_neighbor_limit(limit)
        if scope_corpus_ids:
            return {
                "route": "dense_query_in_selection",
                "candidate_limit": normalized_limit,
                "search_mode": "selection",
            }
        if self._should_use_exact_graph_search(graph_run_id):
            return {
                "route": "dense_query_exact_graph",
                "candidate_limit": normalized_limit,
                "search_mode": "exact",
            }
        if self._semantic_neighbor_index_is_ready():
            return {
                "route": "dense_query_ann_broad_scope",
                "candidate_limit": self._dense_query_candidate_limit(
                    graph_run_id=graph_run_id,
                    limit=limit,
                ),
                "search_mode": "ann",
            }
        return {
            "route": "dense_query_exact_graph_fallback",
            "candidate_limit": normalized_limit,
            "search_mode": "exact",
        }

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

    def _candidate_limit(
        self,
        *,
        graph_run_id: str,
        limit: int,
        multiplier: int,
        min_candidates: int,
        max_candidates: int,
    ) -> int:
        normalized_limit = self._semantic_neighbor_limit(limit)
        min_candidates = max(int(min_candidates), 1)
        max_candidates = max(int(max_candidates), min_candidates)
        multiplier = max(int(multiplier), 1)
        coverage = max(self._graph_scope_coverage(graph_run_id), 1e-9)
        target_candidates = max(
            normalized_limit * multiplier,
            math.ceil(normalized_limit / coverage),
        )
        return min(max_candidates, max(min_candidates, target_candidates))

    def _semantic_neighbor_candidate_limit(self, *, graph_run_id: str, limit: int) -> int:
        return self._candidate_limit(
            graph_run_id=graph_run_id,
            limit=limit,
            multiplier=settings.rag_semantic_neighbor_candidate_multiplier,
            min_candidates=settings.rag_semantic_neighbor_min_candidates,
            max_candidates=settings.rag_semantic_neighbor_max_candidates,
        )

    def _dense_query_candidate_limit(self, *, graph_run_id: str, limit: int) -> int:
        return self._candidate_limit(
            graph_run_id=graph_run_id,
            limit=limit,
            multiplier=settings.rag_dense_query_candidate_multiplier,
            min_candidates=settings.rag_dense_query_min_candidates,
            max_candidates=settings.rag_dense_query_max_candidates,
        )

    def _should_use_exact_graph_search(self, graph_run_id: str) -> bool:
        return (
            self._graph_run_paper_count(graph_run_id)
            <= settings.rag_runtime_exact_graph_search_max_papers
        )

    def _configure_hnsw_session(self, cur: Any) -> None:
        cur.execute("SET LOCAL hnsw.iterative_scan = strict_order")
        ef_search = max(int(settings.rag_semantic_neighbor_hnsw_ef_search), 1)
        cur.execute(f"SET LOCAL hnsw.ef_search = {ef_search}")
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
        unique_scope_ids = _unique_int_ids(scope_corpus_ids)
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
        candidate_limit = self._semantic_neighbor_candidate_limit(
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

    def _hydrate_ranked_dense_hits(
        self,
        *,
        ranked_rows: Sequence[dict[str, Any]],
        graph_run_id: str,
        use_direct_lookup: bool,
    ) -> list[PaperEvidenceHit]:
        if not ranked_rows:
            return []

        ranked_ids = _unique_int_ids(int(row["corpus_id"]) for row in ranked_rows)
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
            hit.dense_score = _dense_score_from_distance(row.get("distance"))
            ordered_hits.append(hit)
        return ordered_hits

    def _dense_query_sql_spec(
        self,
        *,
        graph_run_id: str,
        vector_literal: str,
        limit: int,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> _SqlSpec:
        route = self.describe_dense_query_route(
            graph_run_id=graph_run_id,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        )
        candidate_limit = int(route["candidate_limit"])
        if scope_corpus_ids:
            return _SqlSpec(
                route_name=str(route["route"]),
                sql=queries.DENSE_QUERY_SEARCH_IN_SELECTION_SQL,
                params=(
                    vector_literal,
                    _unique_int_ids(scope_corpus_ids),
                    vector_literal,
                    candidate_limit,
                ),
                metadata=route,
            )
        if route["search_mode"] == "ann":
            return _SqlSpec(
                route_name=str(route["route"]),
                sql=queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                params=(
                    vector_literal,
                    vector_literal,
                    candidate_limit,
                    graph_run_id,
                    limit,
                ),
                metadata=route,
            )
        return _SqlSpec(
            route_name=str(route["route"]),
            sql=queries.DENSE_QUERY_SEARCH_SQL,
            params=(
                vector_literal,
                graph_run_id,
                vector_literal,
                candidate_limit,
            ),
            metadata=route,
        )

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
