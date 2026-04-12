"""Read-only runtime repository for graph release and paper-ref resolution."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from typing import Any, Literal, Protocol

from app import db
from app.rag.models import GraphRelease

GRAPH_RELEASE_LOOKUP_SQL = """
SELECT
    id::TEXT AS graph_run_id,
    bundle_checksum,
    graph_name,
    is_current
FROM solemd.graph_runs
WHERE status = 'completed'
  AND graph_name = 'cosmograph'
  AND node_kind = 'corpus'
  AND (
      (%s = 'current' AND is_current = true)
      OR id::TEXT = %s
      OR bundle_checksum = %s
  )
ORDER BY is_current DESC, created_at DESC
LIMIT 1
"""

CURRENT_GRAPH_RUN_ID_SQL = """
SELECT id::TEXT AS graph_run_id
FROM solemd.graph_runs
WHERE graph_name = 'cosmograph'
  AND node_kind = 'corpus'
  AND status = 'completed'
  AND is_current = true
ORDER BY completed_at DESC NULLS LAST, updated_at DESC
LIMIT 1
"""

GRAPH_RELEASE_PAPER_COUNT_SUMMARY_SQL = """
SELECT COALESCE(NULLIF(qa_summary->>'point_count', '')::BIGINT, 0) AS paper_count
FROM solemd.graph_runs
WHERE id = %s
LIMIT 1
"""

CURRENT_MAP_PAPER_COUNT_ESTIMATE_SQL = """
SELECT COALESCE(c.reltuples::BIGINT, 0) AS paper_count
FROM pg_class c
WHERE c.oid = to_regclass('solemd.idx_corpus_current_map')
"""

GRAPH_POINTS_GRAPH_RUN_ESTIMATE_SQL = """
SELECT
    (
        SELECT reltuples::DOUBLE PRECISION
        FROM pg_class c
        JOIN pg_namespace n
          ON n.oid = c.relnamespace
        WHERE
            n.nspname = 'solemd'
            AND c.relname = 'graph_points'
        LIMIT 1
    ) AS total_rows,
    s.n_distinct::DOUBLE PRECISION AS n_distinct,
    s.most_common_vals::TEXT AS most_common_vals,
    s.most_common_freqs
FROM pg_stats s
WHERE
    s.schemaname = 'solemd'
    AND s.tablename = 'graph_points'
    AND s.attname = 'graph_run_id'
LIMIT 1
"""

SELECTED_CORPUS_LOOKUP_BY_CORPUS_ID_SQL = """
SELECT candidate.corpus_id
FROM unnest(%s::bigint[]) WITH ORDINALITY AS candidate(corpus_id, ordinal)
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = candidate.corpus_id
ORDER BY candidate.ordinal
LIMIT 1
"""

SCOPE_CORPUS_LOOKUP_BY_CORPUS_ID_SQL = """
SELECT gp.corpus_id
FROM solemd.graph_points gp
WHERE
    gp.graph_run_id = %s
    AND gp.corpus_id = ANY(%s::bigint[])
ORDER BY gp.corpus_id
"""

SELECTED_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL = """
SELECT gps.corpus_id
FROM unnest(%s::text[]) WITH ORDINALITY AS candidate(graph_lookup_ref, ordinal)
JOIN solemd.graph_paper_summary gps
  ON gps.graph_paper_ref = candidate.graph_lookup_ref
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = gps.corpus_id
ORDER BY candidate.ordinal
LIMIT 1
"""

SCOPE_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL = """
SELECT gp.corpus_id
FROM solemd.graph_paper_summary gps
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = gps.corpus_id
WHERE gps.graph_paper_ref = ANY(%s::text[])
ORDER BY gp.corpus_id
"""

RESOLVE_PAPER_GRAPH_REFS_SQL = """
SELECT gps.pmid, gps.graph_paper_ref
FROM solemd.graph_paper_summary gps
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = gps.corpus_id
WHERE gps.pmid = ANY(%s::int[])
"""

RESOLVE_PAPER_NODES_FOR_GRAPH_SQL = """
SELECT
    gps.pmid,
    gps.graph_paper_ref,
    gps.title AS paper_title,
    gps.year,
    gps.journal_name AS venue
FROM solemd.graph_paper_summary gps
JOIN solemd.graph_points gp
  ON gp.graph_run_id = %s
 AND gp.corpus_id = gps.corpus_id
WHERE gps.pmid = ANY(%s::int[])
"""


def split_graph_lookup_refs(values: Sequence[str]) -> tuple[list[int], list[str]]:
    corpus_ids: list[int] = []
    graph_paper_refs: list[str] = []
    seen_corpus_ids: set[int] = set()
    seen_graph_paper_refs: set[str] = set()

    for raw_value in values:
        value = raw_value.strip()
        if not value:
            continue

        if value.startswith("paper:"):
            suffix = value.split(":", 1)[1].strip()
            if suffix.isdigit():
                corpus_id = int(suffix)
                if corpus_id not in seen_corpus_ids:
                    seen_corpus_ids.add(corpus_id)
                    corpus_ids.append(corpus_id)
                continue
            value = suffix
        elif value.startswith("corpus:"):
            suffix = value.split(":", 1)[1].strip()
            if suffix.isdigit():
                corpus_id = int(suffix)
                if corpus_id not in seen_corpus_ids:
                    seen_corpus_ids.add(corpus_id)
                    corpus_ids.append(corpus_id)
            continue
        elif value.isdigit():
            corpus_id = int(value)
            if corpus_id not in seen_corpus_ids:
                seen_corpus_ids.add(corpus_id)
                corpus_ids.append(corpus_id)
            continue

        if value and value not in seen_graph_paper_refs:
            seen_graph_paper_refs.add(value)
            graph_paper_refs.append(value)

    return corpus_ids, graph_paper_refs


GraphQueryScopeRoute = Literal["selection", "current_map", "graph_run"]


def _unique_corpus_ids(values: Sequence[int]) -> list[int]:
    return list(dict.fromkeys(int(value) for value in values))


class GraphRuntimeResolver(Protocol):
    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease: ...

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_node_id: str | None,
    ) -> int | None: ...

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]: ...


class PostgresGraphRepository:
    """Graph-owned runtime lookups shared by graph, wiki, and entity services."""

    def __init__(self, connect: Callable[..., object] | None = None) -> None:
        self._connect_factory = connect or db.pooled
        self._graph_release_cache: dict[str, GraphRelease] = {}
        self._current_graph_run_id: str | None = None
        self._current_graph_run_loaded = False
        self._graph_run_paper_counts: dict[str, int] = {}

    def _connect(self):
        return self._connect_factory()

    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        release_key = graph_release_id.strip()
        cached = self._graph_release_cache.get(release_key)
        if cached is not None:
            return cached

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                GRAPH_RELEASE_LOOKUP_SQL,
                (release_key, release_key, release_key),
            )
            row = cur.fetchone()

        if row is None:
            raise LookupError(f"Unknown graph release: {graph_release_id}")

        release = GraphRelease(
            graph_release_id=row.get("bundle_checksum") or row["graph_run_id"],
            graph_run_id=row["graph_run_id"],
            bundle_checksum=row.get("bundle_checksum"),
            graph_name=row["graph_name"],
            is_current=bool(row.get("is_current")),
        )
        self._graph_release_cache[release_key] = release
        if release.is_current:
            self._current_graph_run_id = release.graph_run_id
            self._current_graph_run_loaded = True
        return release

    def resolve_current_graph_run_id(self) -> str | None:
        if self._current_graph_run_loaded:
            return self._current_graph_run_id

        for release in self._graph_release_cache.values():
            if release.is_current:
                self._current_graph_run_id = release.graph_run_id
                self._current_graph_run_loaded = True
                return self._current_graph_run_id

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(CURRENT_GRAPH_RUN_ID_SQL)
            row = cur.fetchone()

        self._current_graph_run_id = None if row is None else row["graph_run_id"]
        self._current_graph_run_loaded = True
        return self._current_graph_run_id

    def is_current_graph_run(self, graph_run_id: str) -> bool:
        current_graph_run_id = self.resolve_current_graph_run_id()
        return bool(current_graph_run_id and graph_run_id == current_graph_run_id)

    def resolve_query_scope(
        self,
        *,
        graph_run_id: str,
        scope_corpus_ids: Sequence[int] | None = None,
    ) -> tuple[GraphQueryScopeRoute, list[int]]:
        unique_scope_ids = _unique_corpus_ids(scope_corpus_ids or ())
        if unique_scope_ids:
            return "selection", unique_scope_ids
        if self.is_current_graph_run(graph_run_id):
            return "current_map", []
        return "graph_run", []

    def estimate_graph_run_paper_count(self, graph_run_id: str) -> int:
        cached = self._graph_run_paper_counts.get(graph_run_id)
        if cached is not None:
            return cached

        paper_count = self._graph_run_paper_count_from_summary(graph_run_id)
        if paper_count <= 0 and self.is_current_graph_run(graph_run_id):
            paper_count = self._current_map_paper_count_estimate()
        if paper_count <= 0:
            paper_count = self._graph_run_paper_count_from_stats(graph_run_id)

        self._graph_run_paper_counts[graph_run_id] = paper_count
        return paper_count

    def _graph_run_paper_count_from_summary(self, graph_run_id: str) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(GRAPH_RELEASE_PAPER_COUNT_SUMMARY_SQL, (graph_run_id,))
            row = cur.fetchone()

        return int((row or {}).get("paper_count") or 0)

    def _current_map_paper_count_estimate(self) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(CURRENT_MAP_PAPER_COUNT_ESTIMATE_SQL)
            row = cur.fetchone()

        return int((row or {}).get("paper_count") or 0)

    def _graph_run_paper_count_from_stats(self, graph_run_id: str) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(GRAPH_POINTS_GRAPH_RUN_ESTIMATE_SQL)
            row = cur.fetchone()

        if not row:
            return 0

        total_rows = float(row.get("total_rows") or 0.0)
        if total_rows <= 0:
            return 0

        estimate = self._estimate_graph_run_rows_from_stats(
            graph_run_id=graph_run_id,
            total_rows=total_rows,
            most_common_vals=row.get("most_common_vals"),
            most_common_freqs=row.get("most_common_freqs"),
            n_distinct=row.get("n_distinct"),
        )
        return max(int(round(estimate)), 0)

    def _estimate_graph_run_rows_from_stats(
        self,
        *,
        graph_run_id: str,
        total_rows: float,
        most_common_vals: Any,
        most_common_freqs: Any,
        n_distinct: Any,
    ) -> float:
        mcv_values = self._graph_run_stat_values(most_common_vals)
        mcv_freqs = self._graph_run_stat_frequencies(most_common_freqs)
        for value, freq in zip(mcv_values, mcv_freqs, strict=False):
            if value == graph_run_id and freq > 0:
                return total_rows * freq

        try:
            distinct_value = float(n_distinct or 0.0)
        except (TypeError, ValueError):
            distinct_value = 0.0

        if distinct_value < 0:
            distinct_count = abs(distinct_value) * total_rows
        else:
            distinct_count = distinct_value
        if distinct_count <= 0:
            return 0.0
        return total_rows / distinct_count

    def _graph_run_stat_values(self, raw_values: Any) -> list[str]:
        if raw_values is None:
            return []
        if isinstance(raw_values, str):
            stripped = raw_values.strip()
            if stripped.startswith("{") and stripped.endswith("}"):
                stripped = stripped[1:-1]
            if not stripped:
                return []
            return [
                part.strip().strip('"')
                for part in stripped.split(",")
                if part.strip()
            ]
        if isinstance(raw_values, Sequence) and not isinstance(
            raw_values, (bytes, bytearray)
        ):
            return [str(value).strip() for value in raw_values if str(value).strip()]
        return []

    def _graph_run_stat_frequencies(self, raw_freqs: Any) -> list[float]:
        if raw_freqs is None:
            return []
        if isinstance(raw_freqs, Sequence) and not isinstance(
            raw_freqs, (str, bytes, bytearray)
        ):
            values: list[float] = []
            for value in raw_freqs:
                try:
                    values.append(float(value))
                except (TypeError, ValueError):
                    continue
            return values
        return []

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_node_id: str | None,
    ) -> int | None:
        candidate_lookup_refs: list[str] = []
        if selected_graph_paper_ref:
            candidate_lookup_refs.append(selected_graph_paper_ref)
        if selected_node_id:
            candidate_lookup_refs.append(selected_node_id)
        if not candidate_lookup_refs:
            return None

        candidate_corpus_ids, candidate_graph_lookup_refs = split_graph_lookup_refs(
            candidate_lookup_refs
        )

        with self._connect() as conn, conn.cursor() as cur:
            if candidate_corpus_ids:
                cur.execute(
                    SELECTED_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
                    (candidate_corpus_ids, graph_run_id),
                )
                row = cur.fetchone()
                if row is not None:
                    return int(row["corpus_id"])

            if candidate_graph_lookup_refs:
                cur.execute(
                    SELECTED_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
                    (candidate_graph_lookup_refs, graph_run_id),
                )
                row = cur.fetchone()
                if row is not None:
                    return int(row["corpus_id"])

        return None

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: Sequence[str],
    ) -> list[int]:
        candidate_corpus_ids, candidate_graph_paper_refs = split_graph_lookup_refs(
            graph_paper_refs
        )
        if not candidate_corpus_ids and not candidate_graph_paper_refs:
            return []

        resolved_corpus_ids: set[int] = set()
        with self._connect() as conn, conn.cursor() as cur:
            if candidate_corpus_ids:
                cur.execute(
                    SCOPE_CORPUS_LOOKUP_BY_CORPUS_ID_SQL,
                    (graph_run_id, candidate_corpus_ids),
                )
                resolved_corpus_ids.update(
                    int(row["corpus_id"]) for row in cur.fetchall()
                )

            if candidate_graph_paper_refs:
                cur.execute(
                    SCOPE_CORPUS_LOOKUP_BY_GRAPH_LOOKUP_REF_SQL,
                    (graph_run_id, candidate_graph_paper_refs),
                )
                resolved_corpus_ids.update(
                    int(row["corpus_id"]) for row in cur.fetchall()
                )

        return sorted(resolved_corpus_ids)

    def resolve_paper_graph_refs(
        self,
        *,
        pmids: Sequence[int],
        graph_run_id: str,
    ) -> dict[int, str]:
        if not pmids:
            return {}

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                RESOLVE_PAPER_GRAPH_REFS_SQL,
                (graph_run_id, list(pmids)),
            )
            rows = cur.fetchall()

        return {int(row["pmid"]): row["graph_paper_ref"] for row in rows}

    def resolve_paper_nodes_for_graph(
        self,
        *,
        pmids: Sequence[int],
        graph_run_id: str,
    ) -> list[dict[str, object]]:
        if not pmids:
            return []

        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                RESOLVE_PAPER_NODES_FOR_GRAPH_SQL,
                (graph_run_id, list(pmids)),
            )
            rows = cur.fetchall()

        return [dict(row) for row in rows]
