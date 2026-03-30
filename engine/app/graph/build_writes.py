"""Bulk database writes for graph_points and graph_clusters."""

from __future__ import annotations

from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
import io
from typing import TYPE_CHECKING

from langfuse import observe

from app import db
from app.graph._util import require_numpy

if TYPE_CHECKING:
    import numpy

COPY_WORKERS = 6
COPY_CHUNK_SIZE = 2_000_000

_GRAPH_POINTS_COPY_SQL = """
    COPY solemd.graph_points (
        graph_run_id,
        corpus_id,
        point_index,
        x,
        y,
        cluster_id,
        micro_cluster_id,
        cluster_probability,
        outlier_score,
        is_noise
    )
    FROM STDIN
"""

_GRAPH_POINTS_DEFERRED_INDEXES = [
    (
        "CREATE UNIQUE INDEX idx_graph_points_point_index "
        "ON solemd.graph_points (graph_run_id, point_index) "
        "WHERE point_index IS NOT NULL"
    ),
    (
        "CREATE INDEX idx_graph_points_run_cluster_id "
        "ON solemd.graph_points (graph_run_id, cluster_id) "
        "WHERE cluster_id IS NOT NULL"
    ),
    (
        "CREATE INDEX idx_graph_points_run_micro_cluster_id "
        "ON solemd.graph_points (graph_run_id, micro_cluster_id) "
        "WHERE micro_cluster_id IS NOT NULL"
    ),
]


def _build_copy_chunks(
    graph_run_id: str,
    corpus_ids: numpy.ndarray,
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    is_noise: numpy.ndarray,
    outlier_scores: numpy.ndarray | None,
):
    """Yield TSV byte buffers in chunks. Lazy to keep peak memory ~1GB."""
    n = len(corpus_ids)
    rid = str(graph_run_id)
    for start in range(0, n, COPY_CHUNK_SIZE):
        end = min(start + COPY_CHUNK_SIZE, n)
        buf = io.BytesIO()
        for i in range(start, end):
            score = f"{outlier_scores[i]:.7g}" if outlier_scores is not None else "\\N"
            buf.write(
                f"{rid}\t{corpus_ids[i]}\t{i}\t"
                f"{coordinates[i, 0]:.7g}\t{coordinates[i, 1]:.7g}\t"
                f"{cluster_ids[i]}\t\\N\t\\N\t{score}\t"
                f"{'t' if is_noise[i] else 'f'}\n".encode()
            )
        yield buf.getvalue()


def _copy_chunk(chunk_data: bytes) -> None:
    with db.connect() as conn, conn.cursor() as cur:
        with cur.copy(_GRAPH_POINTS_COPY_SQL) as copy:
            copy.write(chunk_data)
        conn.commit()


@observe(name="graph.build.writeGraphPoints")
def _write_graph_points(
    *,
    graph_run_id: str,
    corpus_ids: numpy.ndarray,
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    is_noise: numpy.ndarray,
    outlier_scores: numpy.ndarray | None = None,
) -> None:
    with db.connect_autocommit() as conn, conn.cursor() as cur:
        cur.execute("DROP INDEX IF EXISTS solemd.idx_graph_points_point_index")
        cur.execute("DROP INDEX IF EXISTS solemd.idx_graph_points_run_cluster_id")
        cur.execute("DROP INDEX IF EXISTS solemd.idx_graph_points_run_micro_cluster_id")

    try:
        chunks = _build_copy_chunks(
            graph_run_id, corpus_ids, coordinates, cluster_ids, is_noise, outlier_scores,
        )
        with ThreadPoolExecutor(max_workers=COPY_WORKERS) as pool:
            list(pool.map(_copy_chunk, chunks))
    finally:
        with db.connect_autocommit() as conn, conn.cursor() as cur:
            for ddl in _GRAPH_POINTS_DEFERRED_INDEXES:
                cur.execute(ddl)
            cur.execute("ANALYZE solemd.graph_points")


def _cluster_rows(
    *,
    graph_run_id: str,
    corpus_ids: numpy.ndarray,
    citation_counts: numpy.ndarray,
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    labels: dict[int, str],
    label_modes: dict[int, str],
    label_sources: dict[int, str],
) -> list[tuple]:
    np = require_numpy()
    grouped: dict[int, list[int]] = defaultdict(list)
    for idx, cluster_id in enumerate(cluster_ids.tolist()):
        grouped[int(cluster_id)].append(idx)

    cluster_rows: list[tuple] = []
    for cluster_id, indices in sorted(grouped.items()):
        coords = coordinates[indices]
        centroid_x = float(coords[:, 0].mean())
        centroid_y = float(coords[:, 1].mean())
        representative_idx = min(
            indices,
            key=lambda i: (
                float((coordinates[i, 0] - centroid_x) ** 2 + (coordinates[i, 1] - centroid_y) ** 2),
                -int(citation_counts[i]),
                int(corpus_ids[i]),
            ),
        )
        cluster_rows.append(
            (
                graph_run_id,
                cluster_id,
                labels.get(cluster_id),
                label_modes.get(cluster_id),
                label_sources.get(cluster_id),
                len(indices),
                len(indices),
                centroid_x,
                centroid_y,
                f"paper:{int(corpus_ids[representative_idx])}",
                "paper",
                len(indices),
                None,
                None,
                False,
            )
        )
    return cluster_rows


def _load_cluster_texts(*, graph_run_id: str, sample_per_cluster: int = 200) -> dict[int, list[str]]:
    cluster_texts: dict[int, list[str]] = defaultdict(list)
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    g.cluster_id,
                    COALESCE(p.tldr, p.abstract, p.title) AS label_text,
                    row_number() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COALESCE(p.citation_count, 0) DESC, g.corpus_id
                    ) AS rn
                FROM solemd.graph_points g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
            )
            SELECT cluster_id, label_text
            FROM ranked
            WHERE rn <= %s
            ORDER BY cluster_id, rn
            """,
            (graph_run_id, sample_per_cluster),
        )
        for row in cur.fetchall():
            cluster_texts[int(row["cluster_id"])].append(row["label_text"] or "")
    return cluster_texts


@observe(name="graph.build.writeGraphClusters")
def _write_graph_clusters(cluster_rows: list[tuple]) -> None:
    if not cluster_rows:
        return

    with db.pooled() as conn, conn.cursor() as cur:
        with cur.copy(
            """
            COPY solemd.graph_clusters (
                graph_run_id,
                cluster_id,
                label,
                label_mode,
                label_source,
                member_count,
                paper_count,
                centroid_x,
                centroid_y,
                representative_node_id,
                representative_node_kind,
                candidate_count,
                mean_cluster_probability,
                mean_outlier_score,
                is_noise
            )
            FROM STDIN
            """
        ) as copy:
            for row in cluster_rows:
                copy.write_row(row)
        conn.commit()
