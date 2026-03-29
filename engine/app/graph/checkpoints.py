"""Durable filesystem checkpoints for graph builds."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from app.config import settings
from app.graph._util import require_numpy


CHECKPOINT_VERSION = 1


@dataclass(frozen=True, slots=True)
class GraphBuildCheckpointPaths:
    root: Path
    metadata_path: Path
    corpus_ids_path: Path
    citation_counts_path: Path
    layout_matrix_path: Path
    knn_indices_path: Path
    knn_distances_path: Path
    coordinates_path: Path
    cluster_ids_path: Path
    outlier_scores_path: Path
    is_noise_path: Path


def checkpoint_paths(graph_run_id: str) -> GraphBuildCheckpointPaths:
    root = settings.graph_tmp_root_path / "graph_build" / graph_run_id
    root.mkdir(parents=True, exist_ok=True)
    return GraphBuildCheckpointPaths(
        root=root,
        metadata_path=root / "checkpoint.json",
        corpus_ids_path=root / "corpus_ids.npy",
        citation_counts_path=root / "citation_counts.npy",
        layout_matrix_path=root / "layout_matrix.npy",
        knn_indices_path=root / "knn_indices.npy",
        knn_distances_path=root / "knn_distances.npy",
        coordinates_path=root / "coordinates.npy",
        cluster_ids_path=root / "cluster_ids.npy",
        outlier_scores_path=root / "outlier_scores.npy",
        is_noise_path=root / "is_noise.npy",
    )


def load_checkpoint_metadata(paths: GraphBuildCheckpointPaths) -> dict:
    if not paths.metadata_path.exists():
        return {"version": CHECKPOINT_VERSION, "stages": {}}
    return json.loads(paths.metadata_path.read_text())


def update_checkpoint_metadata(
    paths: GraphBuildCheckpointPaths,
    *,
    stage: str | None = None,
    payload: dict | None = None,
) -> dict:
    data = load_checkpoint_metadata(paths)
    data["version"] = CHECKPOINT_VERSION
    data["graph_run_id"] = paths.root.name
    if stage is not None:
        stages = data.setdefault("stages", {})
        stages[stage] = True
    if payload:
        data.update(payload)
    tmp_path = paths.metadata_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(data, indent=2, sort_keys=True))
    tmp_path.replace(paths.metadata_path)
    return data


def save_array(path: Path, array) -> None:
    np = require_numpy()
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    with tmp_path.open("wb") as handle:
        np.save(handle, array, allow_pickle=False)
    tmp_path.replace(path)


def load_array(path: Path, *, mmap_mode: str | None = None):
    np = require_numpy()
    if not path.exists():
        return None
    return np.load(path, mmap_mode=mmap_mode, allow_pickle=False)
