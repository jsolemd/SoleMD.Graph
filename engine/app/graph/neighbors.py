"""Shared kNN graph helpers for layout and clustering."""

from __future__ import annotations

from dataclasses import dataclass

from app.graph._util import require_numpy


@dataclass(frozen=True, slots=True)
class NeighborGraphResult:
    indices: "numpy.ndarray"
    distances: "numpy.ndarray"
    backend: str
    neighbor_count: int


def _ensure_self_neighbor(
    indices: "numpy.ndarray",
    distances: "numpy.ndarray",
) -> tuple["numpy.ndarray", "numpy.ndarray"]:
    """Ensure the first neighbor in every row is the point itself."""
    np = require_numpy()
    n_samples, neighbor_count = indices.shape
    row_ids = np.arange(n_samples, dtype=indices.dtype)
    for row in range(n_samples):
        if neighbor_count == 0:
            continue
        if int(indices[row, 0]) == row:
            distances[row, 0] = 0.0
            continue

        match = np.where(indices[row] == row_ids[row])[0]
        if match.size > 0:
            idx = int(match[0])
            indices[row, 0], indices[row, idx] = indices[row, idx], indices[row, 0]
            distances[row, 0], distances[row, idx] = distances[row, idx], distances[row, 0]
            distances[row, 0] = 0.0
            continue

        # If the backend did not return self-neighbors, prepend self and
        # drop the farthest returned neighbor so downstream consumers still
        # receive a fixed-width matrix with the UMAP contract.
        if neighbor_count > 1:
            indices[row, 1:] = indices[row, :-1]
            distances[row, 1:] = distances[row, :-1]
        indices[row, 0] = row_ids[row]
        distances[row, 0] = 0.0

    return indices, distances


def _build_neighbor_graph_cpu(
    matrix: "numpy.ndarray",
    *,
    n_neighbors: int,
    metric: str,
) -> NeighborGraphResult:
    try:
        from sklearn.neighbors import NearestNeighbors
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Shared kNN graph construction requires scikit-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    model = NearestNeighbors(
        metric=metric,
        n_neighbors=n_neighbors,
        n_jobs=-1,
    )
    model.fit(matrix)
    distances, indices = model.kneighbors(matrix)
    np = require_numpy()
    indices = np.asarray(indices, dtype=np.int32)
    distances = np.asarray(distances, dtype=np.float32)
    indices, distances = _ensure_self_neighbor(indices, distances)
    return NeighborGraphResult(
        indices=indices,
        distances=distances,
        backend="sklearn",
        neighbor_count=n_neighbors,
    )


def _build_neighbor_graph_gpu(
    matrix: "numpy.ndarray",
    *,
    n_neighbors: int,
    metric: str,
) -> NeighborGraphResult:
    cp = None
    try:
        import cupy as cp
        from cuml.neighbors import NearestNeighbors
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "GPU shared kNN graph construction requires cupy and cuml. "
            "Use the graph GPU container or set backend='cpu'."
        ) from exc

    try:
        gpu_matrix = cp.asarray(matrix, dtype=cp.float32)
        model = NearestNeighbors(
            metric=metric,
            n_neighbors=n_neighbors,
            output_type="cupy",
        )
        model.fit(gpu_matrix)
        distances, indices = model.kneighbors(gpu_matrix)

        np = require_numpy()
        indices = cp.asnumpy(indices).astype(np.int32, copy=False)
        distances = cp.asnumpy(distances).astype(np.float32, copy=False)
        indices, distances = _ensure_self_neighbor(indices, distances)
        return NeighborGraphResult(
            indices=indices,
            distances=distances,
            backend="cuml",
            neighbor_count=n_neighbors,
        )
    finally:
        if cp is not None:
            cp.get_default_memory_pool().free_all_blocks()


def build_neighbor_graph(
    matrix: "numpy.ndarray",
    *,
    n_neighbors: int,
    metric: str = "cosine",
    backend: str = "auto",
) -> NeighborGraphResult:
    """Build a shared self-inclusive kNN graph for layout and clustering."""
    normalized = backend.strip().lower()
    if normalized not in {"auto", "cpu", "gpu", "cuml_accel", "cugraph"}:
        raise ValueError(f"unsupported neighbor-graph backend: {backend}")

    if n_neighbors <= 0:
        raise ValueError("n_neighbors must be positive")

    if normalized == "cpu":
        return _build_neighbor_graph_cpu(
            matrix,
            n_neighbors=n_neighbors,
            metric=metric,
        )

    if normalized in {"gpu", "cuml_accel", "cugraph"}:
        return _build_neighbor_graph_gpu(
            matrix,
            n_neighbors=n_neighbors,
            metric=metric,
        )

    try:
        return _build_neighbor_graph_gpu(
            matrix,
            n_neighbors=n_neighbors,
            metric=metric,
        )
    except Exception:
        return _build_neighbor_graph_cpu(
            matrix,
            n_neighbors=n_neighbors,
            metric=metric,
        )


def prune_neighbor_graph(
    graph: NeighborGraphResult,
    *,
    column_count: int,
) -> NeighborGraphResult:
    """Return a pruned neighbor graph with a fixed column count."""
    if column_count <= 0:
        raise ValueError("column_count must be positive")
    if graph.indices.shape[1] < column_count:
        raise ValueError(
            "shared neighbor graph has fewer neighbors than requested "
            f"({graph.indices.shape[1]} < {column_count})"
        )
    return NeighborGraphResult(
        indices=graph.indices[:, :column_count],
        distances=graph.distances[:, :column_count],
        backend=graph.backend,
        neighbor_count=column_count,
    )
