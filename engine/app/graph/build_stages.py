"""Checkpointed computation stages: PCA, kNN, UMAP, clustering, scoring."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from langfuse import observe

from app.graph.build_common import _checkpoint_stage_complete
from app.graph.build_common import _mark_graph_run_stage
from app.graph.build_inputs import _first_embedding
from app.graph.build_inputs import _graph_input_count
from app.graph.build_inputs import _parse_embedding
from app.graph.build_inputs import stream_embedding_chunks
from app.graph.checkpoints import GraphBuildCheckpointPaths
from app.graph.checkpoints import load_array
from app.graph.checkpoints import load_checkpoint_metadata
from app.graph.checkpoints import save_array
from app.graph.checkpoints import update_checkpoint_metadata
from app.graph.clusters import ClusterConfig
from app.graph.clusters import run_leiden_from_knn
from app.graph.layout import LayoutConfig
from app.graph.layout import apply_cluster_repulsion
from app.graph.layout import compute_spatial_outlier_scores
from app.graph.layout import run_layout_from_matrix
from app.graph.layout import stream_incremental_pca
from app.graph.layout import stream_random_projection
from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import build_neighbor_graph

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    import numpy


def _shared_neighbor_count(
    layout_config: LayoutConfig,
    cluster_config: ClusterConfig,
) -> int:
    return max(int(layout_config.n_neighbors), int(cluster_config.n_neighbors) + 1)


@observe(name="graph.build.ensureLayoutMatrix")
def _ensure_layout_matrix(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    limit: int,
    layout_config: LayoutConfig,
) -> tuple[numpy.ndarray, str]:
    layout_matrix = load_array(checkpoint_paths_.layout_matrix_path, mmap_mode="r")
    metadata = load_checkpoint_metadata(checkpoint_paths_)
    if layout_matrix is not None:
        return layout_matrix, str(metadata.get("layout_backend", layout_config.backend))

    # Detect embedding dimension
    first_text = _first_embedding()
    if first_text is None:
        raise RuntimeError("no embeddings found in database for layout matrix")

    first_vector = _parse_embedding(first_text)
    embedding_dim = int(first_vector.shape[0])
    total_count = _graph_input_count(limit=limit)

    if total_count == 0:
        raise RuntimeError("graph build cannot prepare layout matrix without input data")

    _mark_graph_run_stage(
        graph_run_id,
        stage="prepare_layout_matrix",
        paths=checkpoint_paths_,
    )

    def chunk_fn():
        return stream_embedding_chunks(limit=limit)

    method = layout_config.pca_method
    logger.info(
        "Layout matrix: method=%s, dim=%d, count=%d",
        method, embedding_dim, total_count,
    )
    if method == "sparse_random_projection":
        layout_matrix, layout_backend = stream_random_projection(
            chunk_fn,
            config=layout_config,
            embedding_dim=embedding_dim,
            total_count=total_count,
        )
    else:
        layout_matrix, layout_backend = stream_incremental_pca(
            chunk_fn,
            config=layout_config,
            embedding_dim=embedding_dim,
            total_count=total_count,
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


@observe(name="graph.build.ensureSharedKnn")
def _ensure_shared_neighbor_graph(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    layout_matrix: numpy.ndarray,
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


@observe(name="graph.build.ensureLayoutCoordinates")
def _ensure_layout_coordinates(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    layout_matrix: numpy.ndarray,
    shared_knn: NeighborGraphResult,
    layout_config: LayoutConfig,
) -> tuple[numpy.ndarray, str]:
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


@observe(name="graph.build.ensureClusterIds")
def _ensure_cluster_ids(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    shared_knn: NeighborGraphResult,
    cluster_config: ClusterConfig,
) -> tuple[numpy.ndarray, str]:
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


@observe(name="graph.build.ensureScoredCoordinates")
def _ensure_scored_coordinates(
    *,
    graph_run_id: str,
    checkpoint_paths_: GraphBuildCheckpointPaths,
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    layout_config: LayoutConfig,
    knn_indices: numpy.ndarray | None = None,
) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray]:
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
        knn_indices=knn_indices,
        repulsion_factor=layout_config.cluster_repulsion_factor,
        overlap_iterations=layout_config.cluster_overlap_iterations,
        overlap_gap_scale=layout_config.cluster_overlap_gap_scale,
        overlap_damping=layout_config.cluster_overlap_damping,
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
