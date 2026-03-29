"""Tests for graph layout post-processing helpers."""

from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np

from app.graph.checkpoints import GraphBuildCheckpointPaths
from app.graph.checkpoints import load_array
from app.graph.checkpoints import load_checkpoint_metadata
from app.graph.checkpoints import save_array
from app.graph.checkpoints import update_checkpoint_metadata
from app.graph.layout import LayoutConfig
from app.graph.layout import apply_cluster_repulsion
from app.graph.layout import run_layout_from_matrix
from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import build_neighbor_graph


def _cluster_centroid(coordinates: np.ndarray, cluster_ids: np.ndarray, cid: int) -> np.ndarray:
    return coordinates[cluster_ids == cid].mean(axis=0)


def test_pairwise_centroid_relaxation_separates_central_clusters():
    """Nearby cluster centroids should gain space even without radial repulsion."""
    coordinates = np.asarray(
        [
            [-0.20, 0.0],
            [-0.04, 0.0],
            [-0.08, 0.0],
            [0.08, 0.0],
            [0.04, 0.0],
            [0.20, 0.0],
        ],
        dtype=np.float32,
    )
    cluster_ids = np.asarray([1, 1, 2, 2, 3, 3], dtype=np.int32)

    before = [
        _cluster_centroid(coordinates, cluster_ids, cid)
        for cid in (1, 2, 3)
    ]
    relaxed = apply_cluster_repulsion(
        coordinates,
        cluster_ids,
        repulsion_factor=1.0,
        relaxation_neighbors=2,
        relaxation_iterations=8,
        relaxation_gap_scale=1.15,
        relaxation_step=0.35,
    )
    after = [
        _cluster_centroid(relaxed, cluster_ids, cid)
        for cid in (1, 2, 3)
    ]

    before_min_gap = min(
        np.linalg.norm(before[0] - before[1]),
        np.linalg.norm(before[1] - before[2]),
    )
    after_min_gap = min(
        np.linalg.norm(after[0] - after[1]),
        np.linalg.norm(after[1] - after[2]),
    )

    assert after_min_gap > before_min_gap


def test_pairwise_centroid_relaxation_preserves_cluster_geometry():
    """Clusters move as rigid bodies so local shape is unchanged."""
    coordinates = np.asarray(
        [
            [-0.20, -0.02],
            [-0.04, 0.02],
            [-0.08, -0.01],
            [0.08, 0.01],
            [0.04, -0.02],
            [0.20, 0.02],
        ],
        dtype=np.float32,
    )
    cluster_ids = np.asarray([1, 1, 2, 2, 3, 3], dtype=np.int32)

    relaxed = apply_cluster_repulsion(
        coordinates,
        cluster_ids,
        repulsion_factor=1.0,
        relaxation_neighbors=2,
        relaxation_iterations=8,
        relaxation_gap_scale=1.15,
        relaxation_step=0.35,
    )

    for cid in (1, 2, 3):
        original_members = coordinates[cluster_ids == cid]
        relaxed_members = relaxed[cluster_ids == cid]
        original_delta = original_members[1] - original_members[0]
        relaxed_delta = relaxed_members[1] - relaxed_members[0]
        assert np.allclose(relaxed_delta, original_delta)


def test_build_neighbor_graph_cpu_keeps_self_neighbor_first():
    matrix = np.asarray(
        [
            [0.0, 0.0],
            [1.0, 0.0],
            [0.0, 1.0],
            [1.0, 1.0],
        ],
        dtype=np.float32,
    )

    result = build_neighbor_graph(
        matrix,
        n_neighbors=3,
        metric="euclidean",
        backend="cpu",
    )

    assert result.indices.shape == (4, 3)
    assert np.array_equal(result.indices[:, 0], np.arange(4, dtype=np.int32))
    assert np.allclose(result.distances[:, 0], 0.0)


def test_run_layout_from_matrix_passes_precomputed_knn(monkeypatch):
    captured: dict = {}

    class DummyUMAP:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        def fit_transform(self, matrix):
            return np.asarray(matrix[:, :2], dtype=np.float32)

    monkeypatch.setattr("app.graph.layout._enable_layout_backend", lambda config: "cpu")
    monkeypatch.setitem(sys.modules, "umap", SimpleNamespace(UMAP=DummyUMAP))

    layout_matrix = np.asarray(
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ],
        dtype=np.float32,
    )
    shared_knn = NeighborGraphResult(
        indices=np.asarray(
            [
                [0, 1, 2],
                [1, 0, 2],
                [2, 0, 1],
            ],
            dtype=np.int32,
        ),
        distances=np.asarray(
            [
                [0.0, 1.0, 1.0],
                [0.0, 1.0, np.sqrt(2.0)],
                [0.0, 1.0, np.sqrt(2.0)],
            ],
            dtype=np.float32,
        ),
        backend="sklearn",
        neighbor_count=3,
    )

    result = run_layout_from_matrix(
        layout_matrix,
        config=LayoutConfig(backend="cpu", n_neighbors=3),
        shared_knn=shared_knn,
    )

    assert result.coordinates.shape == (3, 2)
    assert "precomputed_knn" in captured
    knn_indices, knn_distances = captured["precomputed_knn"]
    assert np.array_equal(knn_indices[:, 0], np.arange(3, dtype=np.int32))
    assert np.allclose(knn_distances[:, 0], 0.0)


def test_checkpoint_round_trip(tmp_path: Path):
    paths = GraphBuildCheckpointPaths(
        root=tmp_path,
        metadata_path=tmp_path / "checkpoint.json",
        corpus_ids_path=tmp_path / "corpus_ids.npy",
        citation_counts_path=tmp_path / "citation_counts.npy",
        layout_matrix_path=tmp_path / "layout_matrix.npy",
        knn_indices_path=tmp_path / "knn_indices.npy",
        knn_distances_path=tmp_path / "knn_distances.npy",
        coordinates_path=tmp_path / "coordinates.npy",
        cluster_ids_path=tmp_path / "cluster_ids.npy",
        outlier_scores_path=tmp_path / "outlier_scores.npy",
        is_noise_path=tmp_path / "is_noise.npy",
    )

    update_checkpoint_metadata(
        paths,
        stage="shared_knn",
        payload={"graph_run_id": "test-run"},
    )
    save_array(paths.knn_indices_path, np.asarray([[0, 1], [1, 0]], dtype=np.int32))

    metadata = load_checkpoint_metadata(paths)
    restored = load_array(paths.knn_indices_path)

    assert metadata["stages"]["shared_knn"] is True
    assert metadata["graph_run_id"] == "test-run"
    assert np.array_equal(restored, np.asarray([[0, 1], [1, 0]], dtype=np.int32))
