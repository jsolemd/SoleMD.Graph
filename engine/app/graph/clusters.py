"""Cluster graph papers offline from high-dimensional embeddings."""

from __future__ import annotations

import logging
from importlib.util import find_spec
from collections.abc import Iterable
from dataclasses import dataclass


from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import prune_neighbor_graph
from app.graph._util import require_numpy
from app.langfuse_config import (
    get_langfuse as _get_langfuse,
    SPAN_GRAPH_CLUSTERS_LEIDEN,
    SPAN_GRAPH_CLUSTERS_CUGRAPH,
    SPAN_GRAPH_CLUSTERS_GPU_KNN,
    observe,
)

logger = logging.getLogger(__name__)


def _gpu_clustering_available() -> bool:
    return all(find_spec(module) is not None for module in ("cupy", "cugraph", "cudf"))


@dataclass(frozen=True, slots=True)
class ClusterConfig:
    backend: str = "auto"
    n_neighbors: int = 15
    metric: str = "cosine"
    resolution: float = 15.0
    random_seed: int = 42
    weight_sigma: float = 0.05  # Gaussian kernel bandwidth for edge weights


@dataclass(frozen=True, slots=True)
class ClusterResult:
    cluster_ids: "numpy.ndarray"
    is_noise: "numpy.ndarray"
    backend: str


def _vectorized_edge_dedup(
    sources: "numpy.ndarray",
    targets: "numpy.ndarray",
    dists: "numpy.ndarray",
    weight_sigma: float = 0.05,
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
    weights = np.exp(-dists[unique_idx] / np.float32(weight_sigma))

    edge_tuples = list(zip(lo.tolist(), hi.tolist()))
    return edge_tuples, weights.tolist()


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

    return _vectorized_edge_dedup(sources, targets, dists, config.weight_sigma)


# ---------------------------------------------------------------------------
# GPU Leiden (cugraph)
# ---------------------------------------------------------------------------

@observe(name=SPAN_GRAPH_CLUSTERS_CUGRAPH)
def _run_cugraph_leiden(
    sources: "cupy.ndarray",
    targets: "cupy.ndarray",
    distances: "cupy.ndarray",
    n_points: int,
    config: ClusterConfig,
) -> ClusterResult:
    """Shared GPU Leiden: build cugraph Graph from edge arrays, run Leiden."""
    np = require_numpy()
    import cudf
    import cugraph
    import cupy as cp

    # Remove self-loops
    valid = sources != targets
    sources, targets, distances = sources[valid], targets[valid], distances[valid]

    undirected_source = cp.minimum(sources, targets)
    undirected_target = cp.maximum(sources, targets)
    # Gaussian kernel: exp(-d/sigma) spreads weights across [0,1] instead of
    # the compressed [0.84,0.99] range that 1-d produces on dense kNN graphs.
    weight = cp.exp(-distances / cp.float32(config.weight_sigma))

    edge_df = cudf.DataFrame(
        {"src": undirected_source, "dst": undirected_target, "weight": weight}
    )
    edge_df = edge_df.groupby(["src", "dst"], as_index=False).agg({"weight": "max"})

    graph = cugraph.Graph(directed=False)
    graph.from_cudf_edgelist(
        edge_df, source="src", destination="dst",
        edge_attr="weight", renumber=False,
    )

    partitions, _ = cugraph.leiden(
        graph, resolution=config.resolution, random_state=config.random_seed,
    )
    partitions = partitions.sort_values("vertex")
    cluster_ids = cp.asnumpy(partitions["partition"].to_cupy()).astype(np.int32) + 1
    return ClusterResult(
        cluster_ids=cluster_ids,
        is_noise=np.zeros(n_points, dtype=bool),
        backend="cugraph_leiden",
    )


@observe(name=SPAN_GRAPH_CLUSTERS_GPU_KNN)
def _run_leiden_gpu_from_knn(
    knn_indices: "numpy.ndarray",
    knn_distances: "numpy.ndarray",
    config: ClusterConfig,
) -> ClusterResult:
    np = require_numpy()
    cp = None

    try:
        import cupy as cp
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "GPU clustering requires cupy, cudf, and cugraph. "
            "Use the graph GPU container or set backend='cpu'."
        ) from exc

    try:
        neighbor_columns = min(knn_indices.shape[1], config.n_neighbors + 1)
        n_points = knn_indices.shape[0]

        if neighbor_columns <= 1:
            return ClusterResult(
                cluster_ids=np.ones(n_points, dtype=np.int32),
                is_noise=np.zeros(n_points, dtype=bool),
                backend="cugraph_leiden",
            )

        gpu_indices = cp.asarray(knn_indices[:, :neighbor_columns], dtype=cp.int32)
        gpu_distances = cp.asarray(knn_distances[:, :neighbor_columns], dtype=cp.float32)

        source = cp.repeat(cp.arange(n_points, dtype=cp.int32), neighbor_columns - 1)
        target = gpu_indices[:, 1:].reshape(-1).astype(cp.int32)
        distance = gpu_distances[:, 1:].reshape(-1).astype(cp.float32)

        return _run_cugraph_leiden(source, target, distance, n_points, config)
    finally:
        if cp is not None:
            cp.get_default_memory_pool().free_all_blocks()


# ---------------------------------------------------------------------------
# CPU Leiden (leidenalg)
# ---------------------------------------------------------------------------

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
    return ClusterResult(
        cluster_ids=cluster_ids,
        is_noise=np.zeros(knn_indices.shape[0], dtype=bool),
        backend="python_igraph",
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

@observe(name=SPAN_GRAPH_CLUSTERS_LEIDEN)
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
        result = _run_leiden_gpu_from_knn(pruned.indices, pruned.distances, config)
    elif backend in {"cpu", "python_igraph"}:
        result = _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)
    elif not _gpu_clustering_available():
        result = _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)
    else:
        try:
            result = _run_leiden_gpu_from_knn(pruned.indices, pruned.distances, config)
        except Exception:
            logger.warning(
                "GPU Leiden clustering from shared kNN failed, falling back to CPU",
                exc_info=True,
            )
            result = _run_leiden_cpu_from_knn(pruned.indices, pruned.distances, config)

    cluster_count = int(np.unique(result.cluster_ids[result.cluster_ids > 0]).size)
    noise_count = int(result.is_noise.sum())
    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(
                output={
                    "point_count": point_count,
                    "cluster_count": cluster_count,
                    "noise_count": noise_count,
                    "resolution": config.resolution,
                    "backend": result.backend,
                },
            )
    except Exception:
        pass

    return result
