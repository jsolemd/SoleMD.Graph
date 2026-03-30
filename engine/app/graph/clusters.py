"""Cluster graph papers offline from high-dimensional embeddings."""

from __future__ import annotations

import logging
from importlib.util import find_spec
from collections.abc import Iterable
from dataclasses import dataclass

from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import prune_neighbor_graph
from app.graph._util import require_numpy

logger = logging.getLogger(__name__)


def _gpu_clustering_available() -> bool:
    return all(find_spec(module) is not None for module in ("cupy", "cugraph", "cudf"))


@dataclass(frozen=True, slots=True)
class ClusterConfig:
    backend: str = "auto"
    n_neighbors: int = 15
    metric: str = "cosine"
    resolution: float = 1.0
    random_seed: int = 42


@dataclass(frozen=True, slots=True)
class ClusterResult:
    cluster_ids: "numpy.ndarray"
    is_noise: "numpy.ndarray"
    backend: str


def _vectorized_edge_dedup(
    sources: "numpy.ndarray",
    targets: "numpy.ndarray",
    dists: "numpy.ndarray",
) -> tuple[list[tuple[int, int]], list[float]]:
    """Deduplicate undirected edges using numpy structured arrays.

    Replaces a Python set of tuples (~1.9 GB at 37.5M edges) with numpy
    vectorized canonicalization + np.unique (~600 MB). ~10x faster.
    """
    np = require_numpy()

    # Remove self-loops
    valid = sources != targets
    sources, targets, dists = sources[valid], targets[valid], dists[valid]

    # Canonical ordering: (min, max) for undirected dedup
    lo = np.minimum(sources, targets)
    hi = np.maximum(sources, targets)

    # Structured array for composite key dedup
    edges_arr = np.empty(len(lo), dtype=[("lo", np.int32), ("hi", np.int32)])
    edges_arr["lo"] = lo
    edges_arr["hi"] = hi
    _, unique_idx = np.unique(edges_arr, return_index=True)

    lo = lo[unique_idx]
    hi = hi[unique_idx]
    weights = np.maximum(np.float32(0.0), np.float32(1.0) - dists[unique_idx])

    edge_tuples = list(zip(lo.tolist(), hi.tolist()))
    return edge_tuples, weights.tolist()


def _edge_list(
    embeddings: "numpy.ndarray",
    config: ClusterConfig,
) -> tuple[Iterable[tuple[int, int]], list[float]]:
    np = require_numpy()
    try:
        from sklearn.neighbors import NearestNeighbors
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph clustering requires scikit-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    neighbor_count = min(config.n_neighbors + 1, embeddings.shape[0])
    model = NearestNeighbors(metric=config.metric, n_neighbors=neighbor_count, n_jobs=-1)
    model.fit(embeddings)
    distances, indices = model.kneighbors(embeddings)

    n_points = embeddings.shape[0]
    k = neighbor_count - 1  # skip self-neighbor at column 0
    if k <= 0:
        return [], []

    sources = np.repeat(np.arange(n_points, dtype=np.int32), k)
    targets = indices[:, 1:].ravel().astype(np.int32)
    dists = distances[:, 1:].ravel().astype(np.float32)

    return _vectorized_edge_dedup(sources, targets, dists)


def _edge_list_from_knn(
    knn_indices: "numpy.ndarray",
    knn_distances: "numpy.ndarray",
    config: ClusterConfig,
) -> tuple[Iterable[tuple[int, int]], list[float]]:
    np = require_numpy()
    neighbor_columns = min(knn_indices.shape[1], config.n_neighbors + 1)
    n_points = knn_indices.shape[0]
    k = neighbor_columns - 1  # skip self-neighbor at column 0
    if k <= 0:
        return [], []

    sources = np.repeat(np.arange(n_points, dtype=np.int32), k)
    targets = knn_indices[:, 1:neighbor_columns].ravel().astype(np.int32)
    dists = knn_distances[:, 1:neighbor_columns].ravel().astype(np.float32)

    return _vectorized_edge_dedup(sources, targets, dists)


def _run_leiden_gpu(
    embeddings: "numpy.ndarray",
    config: ClusterConfig,
) -> ClusterResult:
    np = require_numpy()
    cp = None

    try:
        import cudf
        import cugraph
        import cupy as cp
        from cuml.neighbors import NearestNeighbors
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "GPU clustering requires cudf, cugraph, cupy, and cuml. "
            "Use the graph GPU container or set backend='cpu'."
        ) from exc

    try:
        neighbor_count = min(config.n_neighbors + 1, embeddings.shape[0])
        gpu_embeddings = cp.asarray(embeddings, dtype=cp.float32)
        model = NearestNeighbors(
            metric=config.metric,
            n_neighbors=neighbor_count,
            output_type="cupy",
        )
        model.fit(gpu_embeddings)
        distances, indices = model.kneighbors(gpu_embeddings)
        distances = cp.asarray(distances, dtype=cp.float32)
        indices = cp.asarray(indices, dtype=cp.int32)

        if neighbor_count <= 1:
            cluster_ids = np.ones(shape=(embeddings.shape[0],), dtype=np.int32)
            is_noise = np.zeros(shape=(embeddings.shape[0],), dtype=bool)
            return ClusterResult(
                cluster_ids=cluster_ids,
                is_noise=is_noise,
                backend="cugraph_leiden",
            )

        source = cp.repeat(cp.arange(embeddings.shape[0], dtype=cp.int32), neighbor_count - 1)
        target = cp.asarray(indices[:, 1:].reshape(-1), dtype=cp.int32)
        distance = cp.asarray(distances[:, 1:].reshape(-1), dtype=cp.float32)

        valid = source != target
        source = source[valid]
        target = target[valid]
        distance = distance[valid]

        undirected_source = cp.minimum(source, target)
        undirected_target = cp.maximum(source, target)
        weight = cp.maximum(cp.float32(0.0), cp.float32(1.0) - distance)

        edge_df = cudf.DataFrame(
            {
                "src": undirected_source,
                "dst": undirected_target,
                "weight": weight,
            }
        )
        edge_df = edge_df.groupby(["src", "dst"], as_index=False).agg({"weight": "max"})

        graph = cugraph.Graph(directed=False)
        graph.from_cudf_edgelist(
            edge_df,
            source="src",
            destination="dst",
            edge_attr="weight",
            renumber=False,
        )

        partitions, _ = cugraph.leiden(
            graph,
            resolution=config.resolution,
            random_state=config.random_seed,
        )
        partitions = partitions.sort_values("vertex")
        cluster_ids = cp.asnumpy(partitions["partition"].to_cupy()).astype(np.int32) + 1
        is_noise = np.zeros(shape=(cluster_ids.shape[0],), dtype=bool)
        return ClusterResult(
            cluster_ids=cluster_ids,
            is_noise=is_noise,
            backend="cugraph_leiden",
        )
    finally:
        # Free GPU memory explicitly — GC may not run before next allocation
        if cp is not None:
            cp.get_default_memory_pool().free_all_blocks()


def _run_leiden_gpu_from_knn(
    knn_indices: "numpy.ndarray",
    knn_distances: "numpy.ndarray",
    config: ClusterConfig,
) -> ClusterResult:
    np = require_numpy()
    cp = None

    try:
        import cudf
        import cugraph
        import cupy as cp
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "GPU clustering requires cudf, cugraph, and cupy. "
            "Use the graph GPU container or set backend='cpu'."
        ) from exc

    try:
        neighbor_columns = min(knn_indices.shape[1], config.n_neighbors + 1)
        gpu_indices = cp.asarray(knn_indices[:, :neighbor_columns], dtype=cp.int32)
        gpu_distances = cp.asarray(knn_distances[:, :neighbor_columns], dtype=cp.float32)

        if neighbor_columns <= 1:
            cluster_ids = np.ones(shape=(knn_indices.shape[0],), dtype=np.int32)
            is_noise = np.zeros(shape=(knn_indices.shape[0],), dtype=bool)
            return ClusterResult(
                cluster_ids=cluster_ids,
                is_noise=is_noise,
                backend="cugraph_leiden",
            )

        source = cp.repeat(cp.arange(knn_indices.shape[0], dtype=cp.int32), neighbor_columns - 1)
        target = cp.asarray(gpu_indices[:, 1:].reshape(-1), dtype=cp.int32)
        distance = cp.asarray(gpu_distances[:, 1:].reshape(-1), dtype=cp.float32)

        valid = source != target
        source = source[valid]
        target = target[valid]
        distance = distance[valid]

        undirected_source = cp.minimum(source, target)
        undirected_target = cp.maximum(source, target)
        weight = cp.maximum(cp.float32(0.0), cp.float32(1.0) - distance)

        edge_df = cudf.DataFrame(
            {
                "src": undirected_source,
                "dst": undirected_target,
                "weight": weight,
            }
        )
        edge_df = edge_df.groupby(["src", "dst"], as_index=False).agg({"weight": "max"})

        graph = cugraph.Graph(directed=False)
        graph.from_cudf_edgelist(
            edge_df,
            source="src",
            destination="dst",
            edge_attr="weight",
            renumber=False,
        )

        partitions, _ = cugraph.leiden(
            graph,
            resolution=config.resolution,
            random_state=config.random_seed,
        )
        partitions = partitions.sort_values("vertex")
        cluster_ids = cp.asnumpy(partitions["partition"].to_cupy()).astype(np.int32) + 1
        is_noise = np.zeros(shape=(cluster_ids.shape[0],), dtype=bool)
        return ClusterResult(
            cluster_ids=cluster_ids,
            is_noise=is_noise,
            backend="cugraph_leiden",
        )
    finally:
        if cp is not None:
            cp.get_default_memory_pool().free_all_blocks()


def _run_leiden_cpu(
    embeddings: "numpy.ndarray",
    config: ClusterConfig,
) -> ClusterResult:
    np = require_numpy()

    try:
        import igraph as ig
        import leidenalg
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph clustering requires python-igraph and leidenalg. "
            "Install the graph extra: `uv sync --extra graph`."
        ) from exc

    edges, weights = _edge_list(embeddings, config)
    graph = ig.Graph(n=embeddings.shape[0], edges=list(edges), directed=False)
    if weights:
        graph.es["weight"] = weights
    partition = leidenalg.find_partition(
        graph,
        leidenalg.RBConfigurationVertexPartition,
        weights=graph.es["weight"] if weights else None,
        resolution_parameter=config.resolution,
        seed=config.random_seed,
    )
    cluster_ids = np.asarray(partition.membership, dtype=np.int32) + 1
    is_noise = np.zeros(shape=(cluster_ids.shape[0],), dtype=bool)
    return ClusterResult(
        cluster_ids=cluster_ids,
        is_noise=is_noise,
        backend="python_igraph",
    )


def _run_leiden_cpu_from_knn(
    knn_indices: "numpy.ndarray",
    knn_distances: "numpy.ndarray",
    config: ClusterConfig,
) -> ClusterResult:
    np = require_numpy()

    try:
        import igraph as ig
        import leidenalg
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph clustering requires python-igraph and leidenalg. "
            "Install the graph extra: `uv sync --extra graph`."
        ) from exc

    edges, weights = _edge_list_from_knn(knn_indices, knn_distances, config)
    graph = ig.Graph(n=knn_indices.shape[0], edges=list(edges), directed=False)
    if weights:
        graph.es["weight"] = weights
    partition = leidenalg.find_partition(
        graph,
        leidenalg.RBConfigurationVertexPartition,
        weights=graph.es["weight"] if weights else None,
        resolution_parameter=config.resolution,
        seed=config.random_seed,
    )
    cluster_ids = np.asarray(partition.membership, dtype=np.int32) + 1
    is_noise = np.zeros(shape=(cluster_ids.shape[0],), dtype=bool)
    return ClusterResult(
        cluster_ids=cluster_ids,
        is_noise=is_noise,
        backend="python_igraph",
    )


def run_leiden(
    embeddings: "numpy.ndarray",
    *,
    config: ClusterConfig | None = None,
) -> ClusterResult:
    """Run Leiden clustering on an undirected kNN graph."""
    np = require_numpy()
    config = config or ClusterConfig()
    backend = config.backend.strip().lower()
    if backend not in {"auto", "gpu", "cugraph", "cpu", "python_igraph"}:
        raise ValueError(f"unsupported cluster backend: {config.backend}")

    if embeddings.shape[0] == 0:
        return ClusterResult(
            cluster_ids=np.empty(shape=(0,), dtype=np.int32),
            is_noise=np.empty(shape=(0,), dtype=bool),
            backend="python_igraph",
        )
    if embeddings.shape[0] == 1:
        return ClusterResult(
            cluster_ids=np.array([1], dtype=np.int32),
            is_noise=np.array([False], dtype=bool),
            backend="python_igraph",
        )

    if backend in {"gpu", "cugraph"}:
        return _run_leiden_gpu(embeddings, config)

    if backend in {"cpu", "python_igraph"}:
        return _run_leiden_cpu(embeddings, config)

    if not _gpu_clustering_available():
        return _run_leiden_cpu(embeddings, config)

    try:
        return _run_leiden_gpu(embeddings, config)
    except Exception:
        logger.warning("GPU Leiden clustering failed, falling back to CPU", exc_info=True)
        return _run_leiden_cpu(embeddings, config)


def run_leiden_from_knn(
    shared_knn: NeighborGraphResult,
    *,
    config: ClusterConfig | None = None,
) -> ClusterResult:
    """Run Leiden clustering from a shared self-inclusive kNN graph."""
    np = require_numpy()
    config = config or ClusterConfig()
    backend = config.backend.strip().lower()
    if backend not in {"auto", "gpu", "cugraph", "cpu", "python_igraph"}:
        raise ValueError(f"unsupported cluster backend: {config.backend}")

    pruned = prune_neighbor_graph(shared_knn, column_count=config.n_neighbors + 1)
    point_count = pruned.indices.shape[0]
    if point_count == 0:
        return ClusterResult(
            cluster_ids=np.empty(shape=(0,), dtype=np.int32),
            is_noise=np.empty(shape=(0,), dtype=bool),
            backend="python_igraph",
        )
    if point_count == 1:
        return ClusterResult(
            cluster_ids=np.array([1], dtype=np.int32),
            is_noise=np.array([False], dtype=bool),
            backend="python_igraph",
        )

    if backend in {"gpu", "cugraph"}:
        return _run_leiden_gpu_from_knn(pruned.indices, pruned.distances, config)

    if backend in {"cpu", "python_igraph"}:
        return _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)

    if not _gpu_clustering_available():
        return _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)

    try:
        return _run_leiden_gpu_from_knn(pruned.indices, pruned.distances, config)
    except Exception:
        logger.warning(
            "GPU Leiden clustering from shared kNN failed, falling back to CPU",
            exc_info=True,
        )
        return _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)
