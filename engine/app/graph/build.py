"""Graph build orchestration and readiness summaries for the first mapped graph."""

from __future__ import annotations

import argparse
from collections import defaultdict
from concurrent.futures import Future
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from dataclasses import dataclass
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import uuid

from psycopg.types.json import Jsonb

from app import db
from app.config import settings
from app.graph._util import require_numpy
from app.graph.checkpoints import GraphBuildCheckpointPaths
from app.graph.checkpoints import checkpoint_paths
from app.graph.checkpoints import load_array
from app.graph.checkpoints import load_checkpoint_metadata
from app.graph.checkpoints import save_array
from app.graph.checkpoints import update_checkpoint_metadata
from app.graph.clusters import ClusterConfig
from app.graph.clusters import run_leiden_from_knn
from app.graph.export_bundle import BUNDLE_VERSION
from app.graph.export_bundle import export_graph_bundle
from app.graph.labels import build_cluster_labels
from app.graph.layout import LayoutConfig
from app.graph.layout import apply_cluster_repulsion
from app.graph.layout import compute_spatial_outlier_scores
from app.graph.layout import prepare_layout_matrix
from app.graph.layout import preprocess_embeddings
from app.graph.render_policy import base_point_predicate_sql
from app.graph.layout import run_layout_from_matrix
from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import build_neighbor_graph
from app.graph.base_policy import get_active_base_policy_version
from app.graph.base_policy import materialize_base_admission
from app.graph.paper_evidence import PAPER_EVIDENCE_STAGES
from app.graph.paper_evidence import refresh_paper_evidence_summary
from app.graph.paper_evidence import refresh_paper_evidence_summary_stage


@dataclass(frozen=True, slots=True)
class GraphBuildSummary:
    total_mapped: int
    total_mapped_papers: int
    current_mapped: int
    current_base: int
    ready_for_layout: int
    missing_embeddings: int
    missing_text_availability: int


@dataclass(frozen=True, slots=True)
class GraphBuildResult:
    graph_run_id: str
    selected_papers: int
    cluster_count: int
    layout_backend: str
    cluster_backend: str
    bundle_dir: str | None
    bundle_checksum: str | None


@dataclass(frozen=True, slots=True)
class GraphInputData:
    corpus_ids: "numpy.ndarray"
    citation_counts: "numpy.ndarray"
    embeddings: "numpy.ndarray"
    embedding_path: str | None


def _checkpoint_stage_complete(
    paths: GraphBuildCheckpointPaths,
    stage: str,
) -> bool:
    metadata = load_checkpoint_metadata(paths)
    return bool(metadata.get("stages", {}).get(stage))


def _mark_graph_run_stage(
    graph_run_id: str,
    *,
    stage: str,
    paths: GraphBuildCheckpointPaths | None = None,
    extra: dict | None = None,
) -> None:
    payload = {
        "stage": stage,
    }
    if paths is not None:
        payload["checkpoint_dir"] = str(paths.root)
    if extra:
        payload.update(extra)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET qa_summary = COALESCE(qa_summary, '{}'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE id = %s
            """,
            (Jsonb(payload), graph_run_id),
        )
        conn.commit()


def load_graph_build_summary() -> GraphBuildSummary:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE layout_status = 'mapped'")
        total_mapped = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.mapped_papers")
        total_mapped_papers = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_in_current_map = true")
        current_mapped = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_in_current_base = true")
        current_base = cur.fetchone()["n"]
        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE embedding IS NOT NULL) AS ready_for_layout,
                count(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings,
                count(*) FILTER (WHERE text_availability IS NULL) AS missing_text_availability
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.layout_status = 'mapped'
            """
        )
        row = cur.fetchone()

    return GraphBuildSummary(
        total_mapped=total_mapped,
        total_mapped_papers=total_mapped_papers,
        current_mapped=current_mapped,
        current_base=current_base,
        ready_for_layout=row["ready_for_layout"],
        missing_embeddings=row["missing_embeddings"],
        missing_text_availability=row["missing_text_availability"],
    )


def _parse_embedding(text: str) -> "numpy.ndarray":
    np = require_numpy()
    return np.fromstring(text.strip()[1:-1], sep=",", dtype=np.float32)


def _graph_temp_dir() -> Path:
    path = settings.graph_tmp_root_path / "graph_build"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _shared_neighbor_count(
    layout_config: LayoutConfig,
    cluster_config: ClusterConfig,
) -> int:
    return max(int(layout_config.n_neighbors), int(cluster_config.n_neighbors) + 1)


def _load_graph_run_record(graph_run_id: str) -> dict:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, status, parameters
            FROM solemd.graph_runs
            WHERE id = %s
            """,
            (graph_run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"graph run not found: {graph_run_id}")
    return row


def _resume_graph_run(
    graph_run_id: str,
) -> tuple[int, str, LayoutConfig, ClusterConfig]:
    row = _load_graph_run_record(graph_run_id)
    parameters = row["parameters"] or {}
    limit = int(parameters.get("limit") or 0)
    base_policy = str(parameters.get("base_policy") or get_active_base_policy_version())
    layout_params = parameters.get("layout") or {}
    cluster_params = parameters.get("clusters") or {}

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'running',
                updated_at = now(),
                qa_summary = COALESCE(qa_summary, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
            """,
            (
                Jsonb(
                    {
                        "stage": "resume",
                        "resumed": True,
                    }
                ),
                graph_run_id,
            ),
        )
        conn.commit()

    return (
        limit,
        base_policy,
        LayoutConfig(**layout_params) if layout_params else LayoutConfig(),
        ClusterConfig(**cluster_params) if cluster_params else ClusterConfig(),
    )


def _graph_run_row_counts(graph_run_id: str) -> tuple[int, int]:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*)::INTEGER FROM solemd.graph_points WHERE graph_run_id = %s) AS point_count,
                (SELECT COUNT(*)::INTEGER FROM solemd.graph_clusters WHERE graph_run_id = %s) AS cluster_count
            """,
            (graph_run_id, graph_run_id),
        )
        row = cur.fetchone()
    return int(row["point_count"]), int(row["cluster_count"])


def _graph_input_count(limit: int = 0) -> int:
    base_query = """
        SELECT mp.corpus_id
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY mp.corpus_id
    """
    query = f"SELECT count(*) AS n FROM ({base_query}) t"
    params: tuple[int, ...] | tuple[()] = ()
    if limit > 0:
        query = f"SELECT count(*) AS n FROM ({base_query} LIMIT %s) t"
        params = (limit,)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()["n"]


def _first_embedding() -> str | None:
    query = """
        SELECT p.embedding::TEXT AS embedding_text
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY mp.corpus_id
        LIMIT 1
    """
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()
    if not row:
        return None
    return row["embedding_text"]


def _load_graph_inputs(limit: int = 0) -> GraphInputData:
    np = require_numpy()
    count = _graph_input_count(limit=limit)
    if count == 0:
        return GraphInputData(
            corpus_ids=np.empty(shape=(0,), dtype=np.int64),
            citation_counts=np.empty(shape=(0,), dtype=np.int32),
            embeddings=np.empty(shape=(0, 0), dtype=np.float32),
            embedding_path=None,
        )

    first_embedding = _first_embedding()
    if first_embedding is None:
        return GraphInputData(
            corpus_ids=np.empty(shape=(0,), dtype=np.int64),
            citation_counts=np.empty(shape=(0,), dtype=np.int32),
            embeddings=np.empty(shape=(0, 0), dtype=np.float32),
            embedding_path=None,
        )

    first_vector = _parse_embedding(first_embedding)
    dimension = int(first_vector.shape[0])
    embedding_path = _graph_temp_dir() / f"graph_embeddings_{uuid.uuid4().hex}.f32"
    embeddings = np.memmap(
        embedding_path,
        mode="w+",
        dtype=np.float32,
        shape=(count, dimension),
    )
    corpus_ids = np.empty(shape=(count,), dtype=np.int64)
    citation_counts = np.empty(shape=(count,), dtype=np.int32)

    query = """
        SELECT
            mp.corpus_id,
            COALESCE(p.citation_count, 0) AS citation_count,
            p.embedding::TEXT AS embedding_text
        FROM solemd.mapped_papers mp
        JOIN solemd.papers p ON p.corpus_id = mp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY mp.corpus_id
    """
    params: tuple[int, ...] | tuple[()] = ()
    if limit > 0:
        query += " LIMIT %s"
        params = (limit,)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        index = 0
        while batch := cur.fetchmany(size=settings.graph_embedding_fetch_batch_size):
            for row in batch:
                corpus_ids[index] = int(row["corpus_id"])
                citation_counts[index] = int(row["citation_count"] or 0)
                embeddings[index] = _parse_embedding(row["embedding_text"])
                index += 1

    if index != count:
        raise RuntimeError(f"graph input load mismatch: expected {count} rows, loaded {index}")

    return GraphInputData(
        corpus_ids=corpus_ids,
        citation_counts=citation_counts,
        embeddings=embeddings,
        embedding_path=str(embedding_path),
    )


def _load_checkpointed_ids(
    paths: GraphBuildCheckpointPaths,
):
    corpus_ids = load_array(paths.corpus_ids_path, mmap_mode="r")
    citation_counts = load_array(paths.citation_counts_path, mmap_mode="r")
    if corpus_ids is None or citation_counts is None:
        return None, None
    return corpus_ids, citation_counts


def _ensure_input_vectors(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    limit: int,
) -> tuple["numpy.ndarray", "numpy.ndarray", GraphInputData | None]:
    corpus_ids, citation_counts = _load_checkpointed_ids(checkpoint_paths_)
    need_input = (
        corpus_ids is None
        or citation_counts is None
        or not checkpoint_paths_.layout_matrix_path.exists()
    )
    if not need_input:
        return corpus_ids, citation_counts, None

    _mark_graph_run_stage(
        graph_run_id,
        stage="load_inputs",
        paths=checkpoint_paths_,
    )
    input_data = _load_graph_inputs(limit=limit)
    if corpus_ids is None:
        save_array(checkpoint_paths_.corpus_ids_path, input_data.corpus_ids)
    if citation_counts is None:
        save_array(checkpoint_paths_.citation_counts_path, input_data.citation_counts)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="inputs",
        payload={"paper_count": int(input_data.corpus_ids.shape[0])},
    )
    return input_data.corpus_ids, input_data.citation_counts, input_data


def _ensure_layout_matrix(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    input_data: GraphInputData | None,
    limit: int,
    layout_config: LayoutConfig,
) -> tuple["numpy.ndarray", str]:
    layout_matrix = load_array(checkpoint_paths_.layout_matrix_path, mmap_mode="r")
    metadata = load_checkpoint_metadata(checkpoint_paths_)
    if layout_matrix is not None:
        return layout_matrix, str(metadata.get("layout_backend", layout_config.backend))

    if input_data is None:
        _, _, input_data = _ensure_input_vectors(
            graph_run_id=graph_run_id,
            checkpoint_paths_=checkpoint_paths_,
            limit=limit,
        )
    if input_data is None:
        raise RuntimeError("graph build cannot prepare layout matrix without input data")

    _mark_graph_run_stage(
        graph_run_id,
        stage="prepare_layout_matrix",
        paths=checkpoint_paths_,
    )
    embeddings = preprocess_embeddings(input_data.embeddings, layout_config)
    layout_matrix, layout_backend = prepare_layout_matrix(
        embeddings,
        config=layout_config,
    )
    save_array(checkpoint_paths_.layout_matrix_path, layout_matrix)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="layout_matrix",
        payload={
            "layout_backend": layout_backend,
            "layout_matrix_shape": list(layout_matrix.shape),
        },
    )
    return layout_matrix, layout_backend


def _ensure_shared_neighbor_graph(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    layout_matrix: "numpy.ndarray",
    layout_config: LayoutConfig,
    cluster_config: ClusterConfig,
) -> NeighborGraphResult:
    knn_indices = load_array(checkpoint_paths_.knn_indices_path, mmap_mode="r")
    knn_distances = load_array(checkpoint_paths_.knn_distances_path, mmap_mode="r")
    metadata = load_checkpoint_metadata(checkpoint_paths_)
    neighbor_count = _shared_neighbor_count(layout_config, cluster_config)
    if knn_indices is not None and knn_distances is not None:
        return NeighborGraphResult(
            indices=knn_indices,
            distances=knn_distances,
            backend=str(metadata.get("neighbor_graph_backend", layout_config.backend)),
            neighbor_count=int(metadata.get("shared_neighbor_count", neighbor_count)),
        )

    _mark_graph_run_stage(
        graph_run_id,
        stage="build_shared_knn",
        paths=checkpoint_paths_,
    )
    shared_knn = build_neighbor_graph(
        layout_matrix,
        n_neighbors=neighbor_count,
        metric=layout_config.metric,
        backend=cluster_config.backend if cluster_config.backend != "auto" else layout_config.backend,
    )
    save_array(checkpoint_paths_.knn_indices_path, shared_knn.indices)
    save_array(checkpoint_paths_.knn_distances_path, shared_knn.distances)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="shared_knn",
        payload={
            "neighbor_graph_backend": shared_knn.backend,
            "shared_neighbor_count": shared_knn.neighbor_count,
        },
    )
    return shared_knn


def _ensure_layout_coordinates(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    layout_matrix: "numpy.ndarray",
    shared_knn: NeighborGraphResult,
    layout_config: LayoutConfig,
) -> tuple["numpy.ndarray", str]:
    coordinates = load_array(checkpoint_paths_.coordinates_path, mmap_mode="r")
    metadata = load_checkpoint_metadata(checkpoint_paths_)
    if coordinates is not None and _checkpoint_stage_complete(checkpoint_paths_, "coordinates"):
        return coordinates, str(metadata.get("layout_backend", layout_config.backend))

    _mark_graph_run_stage(
        graph_run_id,
        stage="run_layout",
        paths=checkpoint_paths_,
    )
    result = run_layout_from_matrix(
        layout_matrix,
        config=layout_config,
        shared_knn=shared_knn,
    )
    save_array(checkpoint_paths_.coordinates_path, result.coordinates)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="coordinates",
        payload={"layout_backend": result.backend},
    )
    return result.coordinates, result.backend


def _ensure_cluster_ids(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    shared_knn: NeighborGraphResult,
    cluster_config: ClusterConfig,
) -> tuple["numpy.ndarray", str]:
    cluster_ids = load_array(checkpoint_paths_.cluster_ids_path, mmap_mode="r")
    metadata = load_checkpoint_metadata(checkpoint_paths_)
    if cluster_ids is not None and _checkpoint_stage_complete(checkpoint_paths_, "clusters"):
        return cluster_ids, str(metadata.get("cluster_backend", cluster_config.backend))

    _mark_graph_run_stage(
        graph_run_id,
        stage="run_clusters",
        paths=checkpoint_paths_,
    )
    result = run_leiden_from_knn(
        shared_knn,
        config=cluster_config,
    )
    save_array(checkpoint_paths_.cluster_ids_path, result.cluster_ids)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="clusters",
        payload={"cluster_backend": result.backend},
    )
    return result.cluster_ids, result.backend


def _ensure_scored_coordinates(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    coordinates: "numpy.ndarray",
    cluster_ids: "numpy.ndarray",
    layout_config: LayoutConfig,
) -> tuple["numpy.ndarray", "numpy.ndarray", "numpy.ndarray"]:
    outlier_scores = load_array(checkpoint_paths_.outlier_scores_path, mmap_mode="r")
    is_noise = load_array(checkpoint_paths_.is_noise_path, mmap_mode="r")
    scored_coordinates = load_array(checkpoint_paths_.coordinates_path, mmap_mode="r")
    if outlier_scores is not None and is_noise is not None and _checkpoint_stage_complete(
        checkpoint_paths_, "scored"
    ):
        if scored_coordinates is None:
            raise RuntimeError("missing scored coordinate checkpoint")
        return scored_coordinates, outlier_scores, is_noise

    _mark_graph_run_stage(
        graph_run_id,
        stage="score_coordinates",
        paths=checkpoint_paths_,
    )
    repulsed = apply_cluster_repulsion(
        coordinates,
        cluster_ids,
        repulsion_factor=layout_config.cluster_repulsion_factor,
        relaxation_neighbors=layout_config.cluster_relaxation_neighbors,
        relaxation_iterations=layout_config.cluster_relaxation_iterations,
        relaxation_gap_scale=layout_config.cluster_relaxation_gap_scale,
        relaxation_step=layout_config.cluster_relaxation_step,
    )
    outlier_result = compute_spatial_outlier_scores(
        repulsed,
        n_neighbors=layout_config.outlier_lof_neighbors,
        contamination=layout_config.outlier_contamination,
    )
    save_array(checkpoint_paths_.coordinates_path, repulsed)
    save_array(checkpoint_paths_.outlier_scores_path, outlier_result.outlier_scores)
    save_array(checkpoint_paths_.is_noise_path, outlier_result.is_spatial_outlier)
    update_checkpoint_metadata(
        checkpoint_paths_,
        stage="scored",
        payload={"outlier_count": outlier_result.outlier_count},
    )
    return repulsed, outlier_result.outlier_scores, outlier_result.is_spatial_outlier


def _insert_graph_run(
    *,
    graph_run_id: str,
    graph_name: str,
    node_kind: str,
    parameters: dict,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO solemd.graph_runs (
                id,
                graph_name,
                node_kind,
                status,
                source_release_id,
                embedding_release_id,
                citations_release_id,
                parameters
            )
            VALUES (%s, %s, %s, 'running', %s, %s, %s, %s)
            """,
            (
                graph_run_id,
                graph_name,
                node_kind,
                settings.s2_release_id or None,
                settings.s2_release_id or None,
                settings.s2_release_id or None,
                Jsonb(parameters),
            ),
        )
        conn.commit()


def _write_graph_points(
    *,
    graph_run_id: str,
    corpus_ids: "numpy.ndarray",
    coordinates: "numpy.ndarray",
    cluster_ids: "numpy.ndarray",
    is_noise: "numpy.ndarray",
    outlier_scores: "numpy.ndarray | None" = None,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        with cur.copy(
            """
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
        ) as copy:
            for point_index, (corpus_id, xy, cluster_id, noise_flag) in enumerate(
                zip(corpus_ids.tolist(), coordinates, cluster_ids, is_noise, strict=False)
            ):
                score = (
                    float(outlier_scores[point_index])
                    if outlier_scores is not None
                    else None
                )
                copy.write_row(
                    (
                        graph_run_id,
                        int(corpus_id),
                        point_index,
                        float(xy[0]),
                        float(xy[1]),
                        int(cluster_id),
                        None,
                        None,
                        score,
                        bool(noise_flag),
                    )
                )
        conn.commit()


def _cluster_rows(
    *,
    graph_run_id: str,
    corpus_ids: "numpy.ndarray",
    citation_counts: "numpy.ndarray",
    coordinates: "numpy.ndarray",
    cluster_ids: "numpy.ndarray",
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


def _finalize_graph_run(
    *,
    graph_run_id: str,
    bundle_dir: str | None,
    bundle_checksum: str | None,
    bundle_bytes: int | None,
    bundle_manifest: dict | None,
    publish_current: bool,
    qa_summary: dict,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        if publish_current:
            cur.execute(
                """
                UPDATE solemd.graph_runs
                SET is_current = false
                WHERE graph_name = 'cosmograph'
                  AND node_kind = 'corpus'
                  AND is_current = true
                """
            )
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'completed',
                is_current = %s,
                bundle_uri = COALESCE(%s, bundle_uri),
                bundle_format = COALESCE(%s, bundle_format),
                bundle_version = COALESCE(%s, bundle_version),
                bundle_checksum = COALESCE(%s, bundle_checksum),
                bundle_bytes = COALESCE(%s, bundle_bytes),
                bundle_manifest = COALESCE(%s, bundle_manifest),
                qa_summary = %s,
                updated_at = now(),
                completed_at = now()
            WHERE id = %s
            """,
            (
                publish_current,
                bundle_dir,
                "parquet-manifest" if bundle_dir else None,
                BUNDLE_VERSION if bundle_dir else None,
                bundle_checksum,
                bundle_bytes,
                Jsonb(bundle_manifest) if bundle_manifest else None,
                Jsonb(qa_summary),
                graph_run_id,
            ),
        )
        if publish_current:
            _sync_current_corpus_membership(cur, graph_run_id)
        conn.commit()


def _mark_graph_run_failed(graph_run_id: str, error: Exception) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'failed',
                qa_summary = jsonb_build_object('error', CAST(%s AS TEXT)),
                updated_at = now()
            WHERE id = %s
            """,
            (str(error), graph_run_id),
        )
        conn.commit()


def _sync_current_corpus_membership(cur, graph_run_id: str) -> None:
    base_predicate = base_point_predicate_sql("g")
    cur.execute(
        """
        UPDATE solemd.corpus
        SET is_in_current_map = false,
            is_in_current_base = false
        WHERE is_in_current_map = true
           OR is_in_current_base = true
        """
    )
    cur.execute(
        """
        UPDATE solemd.corpus c
        SET is_in_current_map = true
        FROM solemd.graph_points g
        WHERE g.graph_run_id = %s
          AND g.corpus_id = c.corpus_id
          AND c.is_in_current_map IS DISTINCT FROM true
        """,
        (graph_run_id,),
    )
    cur.execute(
        f"""
        UPDATE solemd.corpus c
        SET is_in_current_base = true
        FROM solemd.graph_points g
        WHERE g.graph_run_id = %s
          AND g.corpus_id = c.corpus_id
          AND {base_predicate}
          AND c.is_in_current_base IS DISTINCT FROM true
        """,
        (graph_run_id,),
    )


def sync_current_graph_membership() -> dict[str, str | int]:
    base_policy = get_active_base_policy_version()
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM solemd.graph_runs
            WHERE graph_name = 'cosmograph'
              AND node_kind = 'corpus'
              AND status = 'completed'
              AND is_current = true
            ORDER BY completed_at DESC NULLS LAST, updated_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("no current cosmograph corpus graph run found")

        graph_run_id = row["id"]
        _sync_current_corpus_membership(cur, graph_run_id)

        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE is_in_current_map = true)::INTEGER AS current_mapped,
                count(*) FILTER (WHERE is_in_current_base = true)::INTEGER AS current_base
            FROM solemd.corpus
            """
        )
        counts = cur.fetchone()
        conn.commit()

    return {
        "graph_run_id": str(graph_run_id),
        "current_mapped": counts["current_mapped"],
        "current_base": counts["current_base"],
        "base_policy": base_policy,
    }


def publish_existing_graph_run(
    *,
    graph_run_id: str,
    publish_current: bool = False,
    skip_export: bool = False,
) -> GraphBuildResult:
    base_policy = get_active_base_policy_version()
    build_paths = checkpoint_paths(graph_run_id)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT parameters, qa_summary
            FROM solemd.graph_runs
            WHERE id = %s
            """,
            (graph_run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"graph run not found: {graph_run_id}")

        parameters = row["parameters"] or {}
        existing_summary = row["qa_summary"] or {}
        layout_backend = existing_summary.get(
            "layout_backend",
            parameters.get("layout", {}).get("backend", "unknown"),
        )
        cluster_backend = existing_summary.get(
            "cluster_backend",
            parameters.get("clusters", {}).get("backend", "unknown"),
        )

        cur.execute(
            """
            SELECT
                COUNT(*)::INTEGER AS point_count,
                COUNT(*) FILTER (WHERE is_noise)::INTEGER AS noise_point_count
            FROM solemd.graph_points
            WHERE graph_run_id = %s
            """,
            (graph_run_id,),
        )
        point_counts = cur.fetchone()
        point_count = point_counts["point_count"]
        noise_point_count = point_counts["noise_point_count"]
        if point_count == 0:
            raise RuntimeError(
                f"graph run {graph_run_id} has no persisted graph_points to publish"
            )

        cur.execute(
            """
            SELECT COUNT(*)::INTEGER AS cluster_count
            FROM solemd.graph_clusters
            WHERE graph_run_id = %s
            """,
            (graph_run_id,),
        )
        cluster_count = cur.fetchone()["cluster_count"]

    policy_summary = materialize_base_admission(graph_run_id)

    bundle_dir = None
    bundle_checksum = None
    bundle_bytes = None
    bundle_manifest = None
    if not skip_export:
        bundle = export_graph_bundle(
            graph_run_id=graph_run_id,
            bundle_profile="base",
        )
        bundle_dir = bundle.bundle_dir
        bundle_checksum = bundle.bundle_checksum
        bundle_bytes = bundle.bundle_bytes
        bundle_manifest = bundle.bundle_manifest

    _finalize_graph_run(
        graph_run_id=graph_run_id,
        bundle_dir=bundle_dir,
        bundle_checksum=bundle_checksum,
        bundle_bytes=bundle_bytes,
        bundle_manifest=bundle_manifest,
        publish_current=publish_current,
        qa_summary={
            "point_count": point_count,
            "noise_point_count": noise_point_count,
            "cluster_count": cluster_count,
            "base_policy": base_policy,
            "layout_backend": layout_backend,
            "cluster_backend": cluster_backend,
            "checkpoint_dir": str(build_paths.root),
            **policy_summary,
        },
    )
    return GraphBuildResult(
        graph_run_id=graph_run_id,
        selected_papers=point_count,
        cluster_count=cluster_count,
        layout_backend=layout_backend,
        cluster_backend=cluster_backend,
        bundle_dir=bundle_dir,
        bundle_checksum=bundle_checksum,
    )


def run_graph_build(
    *,
    limit: int = 0,
    publish_current: bool = False,
    skip_export: bool = False,
    refresh_evidence_summary: bool = True,
    resume_run_id: str | None = None,
) -> GraphBuildResult:
    if limit and publish_current:
        raise ValueError("partial graph builds cannot be published as current")

    if resume_run_id:
        graph_run_id = resume_run_id
        limit, base_policy, layout_config, cluster_config = _resume_graph_run(graph_run_id)
    else:
        graph_run_id = str(uuid.uuid4())
        base_policy = get_active_base_policy_version()
        layout_config = LayoutConfig(backend=settings.graph_layout_backend)
        cluster_config = ClusterConfig(backend=settings.graph_cluster_backend)
        _insert_graph_run(
            graph_run_id=graph_run_id,
            graph_name="cosmograph",
            node_kind="corpus",
            parameters={
                "limit": limit or None,
                "base_policy": base_policy,
                "layout": asdict(layout_config),
                "clusters": asdict(cluster_config),
            },
        )

    build_paths = checkpoint_paths(graph_run_id)
    update_checkpoint_metadata(
        build_paths,
        payload={
            "base_policy": base_policy,
            "limit": limit or None,
        },
    )
    _mark_graph_run_stage(
        graph_run_id,
        stage="bootstrap",
        paths=build_paths,
        extra={"base_policy": base_policy},
    )

    input_data: GraphInputData | None = None
    evidence_future: Future[dict[str, int]] | None = None
    evidence_executor: ThreadPoolExecutor | None = None
    try:
        corpus_ids, citation_counts, input_data = _ensure_input_vectors(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            limit=limit,
        )
        if corpus_ids.size == 0:
            raise RuntimeError("no graph papers with embeddings available for graph build")

        if refresh_evidence_summary:
            evidence_executor = ThreadPoolExecutor(
                max_workers=1,
                thread_name_prefix="paper-evidence-summary",
            )
            evidence_future = evidence_executor.submit(refresh_paper_evidence_summary)

        layout_matrix, layout_backend = _ensure_layout_matrix(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            input_data=input_data,
            limit=limit,
            layout_config=layout_config,
        )
        shared_knn = _ensure_shared_neighbor_graph(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            layout_matrix=layout_matrix,
            layout_config=layout_config,
            cluster_config=cluster_config,
        )
        coordinates, layout_backend = _ensure_layout_coordinates(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            layout_matrix=layout_matrix,
            shared_knn=shared_knn,
            layout_config=layout_config,
        )
        cluster_ids, cluster_backend = _ensure_cluster_ids(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            shared_knn=shared_knn,
            cluster_config=cluster_config,
        )
        coordinates, outlier_scores, merged_noise = _ensure_scored_coordinates(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            coordinates=coordinates,
            cluster_ids=cluster_ids,
            layout_config=layout_config,
        )

        point_count, cluster_count = _graph_run_row_counts(graph_run_id)
        if point_count == 0:
            _mark_graph_run_stage(
                graph_run_id,
                stage="write_graph_points",
                paths=build_paths,
            )
            _write_graph_points(
                graph_run_id=graph_run_id,
                corpus_ids=corpus_ids,
                coordinates=coordinates,
                cluster_ids=cluster_ids,
                is_noise=merged_noise,
                outlier_scores=outlier_scores,
            )

        if cluster_count == 0:
            _mark_graph_run_stage(
                graph_run_id,
                stage="write_graph_clusters",
                paths=build_paths,
            )
            cluster_texts = _load_cluster_texts(
                graph_run_id=graph_run_id,
                sample_per_cluster=settings.graph_label_sample_per_cluster,
            )
            cluster_labels = build_cluster_labels(cluster_texts)
            label_map = {item.cluster_id: item.label for item in cluster_labels}
            label_mode_map = {item.cluster_id: item.label_mode for item in cluster_labels}
            label_source_map = {item.cluster_id: item.label_source for item in cluster_labels}

            cluster_rows = _cluster_rows(
                graph_run_id=graph_run_id,
                corpus_ids=corpus_ids,
                citation_counts=citation_counts,
                coordinates=coordinates,
                cluster_ids=cluster_ids,
                labels=label_map,
                label_modes=label_mode_map,
                label_sources=label_source_map,
            )
            _write_graph_clusters(cluster_rows)

        if evidence_future is not None:
            evidence_future.result()

        _mark_graph_run_stage(
            graph_run_id,
            stage="publish",
            paths=build_paths,
            extra={
                "layout_backend": layout_backend,
                "cluster_backend": cluster_backend,
            },
        )
        result = publish_existing_graph_run(
            graph_run_id=graph_run_id,
            publish_current=publish_current,
            skip_export=skip_export,
        )
        return GraphBuildResult(
            graph_run_id=result.graph_run_id,
            selected_papers=result.selected_papers,
            cluster_count=result.cluster_count,
            layout_backend=result.layout_backend,
            cluster_backend=result.cluster_backend,
            bundle_dir=result.bundle_dir,
            bundle_checksum=result.bundle_checksum,
        )
    except Exception as exc:
        _mark_graph_run_failed(graph_run_id, exc)
        raise
    finally:
        if input_data and input_data.embedding_path:
            Path(input_data.embedding_path).unlink(missing_ok=True)
        if evidence_executor is not None:
            evidence_executor.shutdown(wait=True)
        db.close_pool()


GPU_CONTAINER = "solemd-graph-graph"
GPU_WORKDIR = "/workspaces/SoleMD.Graph/engine"
GPU_PYTHON = ".venv/bin/python"


def _is_gpu_container() -> bool:
    """Return True if running inside the GPU graph container."""
    return os.environ.get("GRAPH_LAYOUT_BACKEND", "").lower() == "gpu"


def _gpu_container_running() -> bool:
    """Return True if the GPU graph container is running."""
    docker = shutil.which("docker")
    if not docker:
        return False
    result = subprocess.run(
        [docker, "inspect", "-f", "{{.State.Running}}", GPU_CONTAINER],
        capture_output=True, text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "true"


def _dispatch_to_gpu(argv: list[str]) -> int:
    """Re-exec the same command inside the GPU container, streaming output."""
    cmd = [
        "docker", "exec", "-w", GPU_WORKDIR, GPU_CONTAINER,
        GPU_PYTHON, "-m", "app.graph.build", *argv,
    ]
    print(f"[dispatch] Running graph build in GPU container ({GPU_CONTAINER})")
    result = subprocess.run(cmd)
    return result.returncode


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize or run graph builds")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--run", action="store_true", help="Run a graph build instead of summary only")
    parser.add_argument(
        "--refresh-evidence",
        action="store_true",
        help="Refresh solemd.paper_evidence_summary without running layout or export",
    )
    parser.add_argument(
        "--evidence-stage",
        choices=("all", *PAPER_EVIDENCE_STAGES),
        default="all",
        help="Run one committed paper-evidence-summary stage so failed refreshes can resume from the last completed stage",
    )
    parser.add_argument(
        "--publish-run",
        type=str,
        help="Publish a graph run that already has persisted graph_points and graph_clusters",
    )
    parser.add_argument(
        "--sync-current",
        action="store_true",
        help="Backfill corpus.is_in_current_map and corpus.is_in_current_base from the current published graph run",
    )
    parser.add_argument("--limit", type=int, default=0, help="Limit papers for a canary graph build")
    parser.add_argument(
        "--resume-run",
        type=str,
        help="Resume a failed or interrupted graph build from its durable checkpoint directory",
    )
    parser.add_argument(
        "--publish-current",
        action="store_true",
        help="Mark the completed graph run as current and sync current map/base membership on corpus",
    )
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="Build graph tables without exporting a bundle",
    )
    parser.add_argument(
        "--reuse-evidence",
        action="store_true",
        help="Reuse the existing paper_evidence_summary during --run instead of recomputing it",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Force local execution (skip GPU container dispatch)",
    )
    args = parser.parse_args()

    selected_modes = [
        args.run,
        args.sync_current,
        args.refresh_evidence,
        bool(args.publish_run),
    ]
    if sum(1 for selected in selected_modes if selected) > 1:
        raise ValueError(
            "choose only one of --run, --sync-current, --refresh-evidence, or --publish-run"
        )
    if args.resume_run and not args.run:
        raise ValueError("--resume-run can only be used with --run")
    if args.resume_run and args.limit:
        raise ValueError("--resume-run cannot be combined with --limit")

    # For --run builds, dispatch to GPU container unless --local or already inside it
    if args.run and not args.local and not _is_gpu_container():
        if _gpu_container_running():
            # Rebuild argv without --local, forwarding all other flags
            forward = [a for a in sys.argv[1:] if a != "--local"]
            rc = _dispatch_to_gpu(forward)
            sys.exit(rc)
        else:
            print(
                f"[warning] GPU container '{GPU_CONTAINER}' is not running. "
                "Falling back to local CPU build. Use --local to suppress this warning.",
                file=sys.stderr,
            )

    if args.run:
        payload = asdict(
            run_graph_build(
                limit=args.limit,
                publish_current=args.publish_current,
                skip_export=args.skip_export,
                refresh_evidence_summary=not args.reuse_evidence,
                resume_run_id=args.resume_run,
            )
        )
    elif args.refresh_evidence:
        if args.evidence_stage == "all":
            payload = refresh_paper_evidence_summary()
        else:
            payload = refresh_paper_evidence_summary_stage(args.evidence_stage)
    elif args.publish_run:
        payload = asdict(
            publish_existing_graph_run(
                graph_run_id=args.publish_run,
                publish_current=args.publish_current,
                skip_export=args.skip_export,
            )
        )
    elif args.sync_current:
        payload = sync_current_graph_membership()
    else:
        payload = asdict(load_graph_build_summary())

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
