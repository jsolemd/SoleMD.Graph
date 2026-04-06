"""Embedding preprocessing and 2D layout helpers for corpus graph builds."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING
import warnings


from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import prune_neighbor_graph
from app.graph._util import require_numpy
from app.langfuse_config import (
    get_langfuse as _get_langfuse,
    SPAN_GRAPH_LAYOUT_PREPROCESS,
    SPAN_GRAPH_LAYOUT_PCA,
    SPAN_GRAPH_LAYOUT_RUN,
    observe,
)

if TYPE_CHECKING:
    import numpy

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class LayoutConfig:
    backend: str = "auto"
    pca_method: str = "sparse_random_projection"
    pca_components: int = 50
    pca_batch_size: int = 10_000
    n_neighbors: int = 30
    min_dist: float = 0.1
    spread: float = 1.0
    metric: str = "cosine"
    random_state: int = 42
    mean_center: bool = True
    l2_normalize: bool = True
    copy_embeddings: bool = False
    set_op_mix_ratio: float = 0.25
    repulsion_strength: float = 1.2
    negative_sample_rate: int = 10
    cluster_repulsion_factor: float = 1.0
    cluster_overlap_iterations: int = 15
    cluster_overlap_gap_scale: float = 0.65
    cluster_overlap_damping: float = 0.3
    cluster_relaxation_neighbors: int = 6
    cluster_relaxation_iterations: int = 12
    cluster_relaxation_gap_scale: float = 1.45
    cluster_relaxation_step: float = 0.35
    subsample_size: int = 500_000       # 0 = disabled (fit_transform all)
    transform_batch_size: int = 200_000
    subsample_n_epochs: int = 500       # explicit epochs for transform accuracy
    outlier_lof_neighbors: int = 20
    outlier_contamination: float = 0.02
    outlier_radial_percentile: float = 99.0


@dataclass(frozen=True, slots=True)
class SpatialOutlierResult:
    outlier_scores: numpy.ndarray
    is_spatial_outlier: numpy.ndarray
    method: str
    outlier_count: int
    total_count: int


@dataclass(frozen=True, slots=True)
class LayoutResult:
    coordinates: numpy.ndarray
    backend: str


def _gpu_available() -> bool:
    """Check if native cuML is available (no cuml.accel proxy)."""
    try:
        import cuml.manifold  # noqa: F401
        import cupy  # noqa: F401
        return True
    except ImportError:
        return False


@observe(name=SPAN_GRAPH_LAYOUT_PREPROCESS, capture_input=False, capture_output=False)
def preprocess_embeddings(embeddings: numpy.ndarray, config: LayoutConfig) -> numpy.ndarray:
    np = require_numpy()
    matrix = embeddings.astype(np.float32, copy=config.copy_embeddings)
    if config.mean_center:
        matrix -= matrix.mean(axis=0, keepdims=True)
    if config.l2_normalize:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix /= norms

    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(
                output={
                    "input_shape": list(embeddings.shape),
                    "output_shape": list(matrix.shape),
                    "mean_center": config.mean_center,
                    "l2_normalize": config.l2_normalize,
                },
            )
    except Exception:
        pass

    return matrix


def _enable_layout_backend(config: LayoutConfig) -> str:
    """Detect GPU availability for UMAP and kNN.

    Uses native cuML directly with cupy arrays (data lives in VRAM).
    Falls back to CPU umap-learn when cuML is not installed.
    """
    backend = config.backend.strip().lower()
    if backend not in {"auto", "cpu", "gpu", "cuml_native"}:
        raise ValueError(f"unsupported layout backend: {config.backend}")

    if backend == "cpu":
        return "cpu"

    if _gpu_available():
        return "cuml_native"

    if backend in {"gpu", "cuml_native"}:
        raise RuntimeError(
            "GPU layout requested but RAPIDS cuML is not installed. "
            "Install a compatible RAPIDS stack or use backend='cpu'."
        )
    return "cpu"


@observe(name=SPAN_GRAPH_LAYOUT_PCA, capture_input=False, capture_output=False)
def _pca_for_layout(
    embeddings: numpy.ndarray,
    config: LayoutConfig,
) -> numpy.ndarray:
    """Reduce embedding dimensions with IncrementalPCA (batched SVD).

    Full PCA copies the entire input (~7 GB at 2.5M × 768) for its SVD,
    peaking at ~15 GB and OOM-killing 40 GB systems.  IncrementalPCA
    processes ``batch_size`` rows at a time, capping peak memory at ~120 MB
    regardless of dataset size.  The approximation error is ~0.002 vs full
    PCA — negligible for UMAP preprocessing.  This is also the only viable
    approach for the 200M+ universe scale.
    """
    np = require_numpy()
    if embeddings.shape[0] <= 2:
        return embeddings

    try:
        from sklearn.decomposition import IncrementalPCA
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph layout requires scikit-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    n_components = min(
        config.pca_components,
        embeddings.shape[0] - 1,
        embeddings.shape[1],
    )
    if n_components < 2:
        return embeddings

    batch_size = max(n_components + 1, min(config.pca_batch_size, embeddings.shape[0]))

    reducer = IncrementalPCA(n_components=n_components, batch_size=batch_size)
    reducer.fit(embeddings)

    # Transform in chunks to avoid a full-dataset temporary from
    # np.dot(X - mean, components.T) which would recreate the OOM.
    n = embeddings.shape[0]
    result = np.empty((n, n_components), dtype=np.float32)
    for start in range(0, n, batch_size):
        end = min(start + batch_size, n)
        result[start:end] = reducer.transform(embeddings[start:end]).astype(np.float32)

    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(
                output={
                    "input_shape": list(embeddings.shape),
                    "output_shape": list(result.shape),
                    "pca_method": "incremental_pca",
                    "n_components": n_components,
                    "batch_size": batch_size,
                },
            )
    except Exception:
        pass

    return result


def prepare_layout_matrix(
    preprocessed_embeddings: numpy.ndarray,
    *,
    config: LayoutConfig | None = None,
) -> tuple[numpy.ndarray, str]:
    """Return the PCA-space matrix used for both layout and clustering."""
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)
    layout_matrix = _pca_for_layout(preprocessed_embeddings, config)
    return layout_matrix, backend


def _prefetch(generator):
    """Wrap a generator with a 1-item lookahead buffer on a background thread.

    Overlaps the DB read for chunk N+1 with the CPU processing of chunk N.
    At 100K rows/chunk this saves ~2-3 seconds per chunk (DB round-trip +
    binary parsing) that would otherwise be dead time.  Peak memory increases
    by one chunk (~300 MB) — acceptable given the 24 GB headroom.
    """
    import queue
    import threading

    _SENTINEL = object()
    buf: queue.Queue = queue.Queue(maxsize=1)
    error_event = threading.Event()
    error: list[BaseException] = []

    def _reader():
        try:
            for item in generator:
                buf.put(item)
        except BaseException as exc:
            logger.error("Prefetch thread failed: %s", exc, exc_info=True)
            error.append(exc)
            error_event.set()
        finally:
            buf.put(_SENTINEL)

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()
    try:
        while True:
            # Check for reader errors between chunks
            if error_event.is_set():
                break
            item = buf.get()
            if item is _SENTINEL:
                break
            yield item
    finally:
        thread.join(timeout=30)
    if error:
        raise error[0]


def stream_incremental_pca(
    chunk_fn,
    *,
    config: LayoutConfig | None = None,
    embedding_dim: int,
    total_count: int,
) -> tuple[numpy.ndarray, str]:
    """Two-pass streaming PCA that never materializes the full embedding matrix.

    Pass 1 (fit): Streams chunks from ``chunk_fn()``, preprocesses each, and
    calls ``IncrementalPCA.partial_fit()``. Each chunk is discarded after fitting.

    Pass 2 (transform): Streams chunks again, transforms each through the
    fitted PCA, and accumulates results into the output array.

    A background prefetch thread reads the next DB chunk while the main thread
    runs PCA on the current one, overlapping I/O with compute.

    Peak memory: ~600 MB (2 chunks in flight) + 500 MB output array,
    regardless of dataset size. This is the only viable approach at 200M+ scale.

    Args:
        chunk_fn: Callable returning a generator of (corpus_ids, citation_counts,
            embeddings) tuples. Called twice (fit pass + transform pass).
        config: Layout configuration.
        embedding_dim: Dimensionality of the embedding vectors.
        total_count: Total number of rows (for pre-allocating the output array).

    Returns:
        (layout_matrix, backend) tuple.
    """
    np = require_numpy()
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)

    if total_count <= 2:
        # Degenerate case: just collect everything
        chunks = []
        for _ids, _cites, emb in chunk_fn():
            chunks.append(emb)
        if not chunks:
            return np.empty((0, embedding_dim), dtype=np.float32), backend
        all_emb = np.concatenate(chunks, axis=0)
        return all_emb[:, :min(config.pca_components, all_emb.shape[1])], backend

    try:
        from sklearn.decomposition import IncrementalPCA
    except ImportError as exc:
        raise RuntimeError(
            "Graph layout requires scikit-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    n_components = min(config.pca_components, total_count - 1, embedding_dim)
    if n_components < 2:
        # Not enough data for meaningful PCA — collect raw
        chunks = []
        for _ids, _cites, emb in chunk_fn():
            chunks.append(emb)
        return np.concatenate(chunks, axis=0) if chunks else np.empty((0, embedding_dim), dtype=np.float32), backend

    batch_size = max(n_components + 1, min(config.pca_batch_size, total_count))
    reducer = IncrementalPCA(n_components=n_components, batch_size=batch_size)

    # Pass 1: fit — prefetch overlaps DB read with partial_fit SVD
    for _ids, _cites, embeddings_chunk in _prefetch(chunk_fn()):
        preprocessed = _preprocess_chunk(embeddings_chunk, config)
        if preprocessed.shape[0] > 1:
            reducer.partial_fit(preprocessed)

    # Pass 2: transform — prefetch overlaps DB read with matrix multiply
    result = np.empty((total_count, n_components), dtype=np.float32)
    offset = 0
    for _ids, _cites, embeddings_chunk in _prefetch(chunk_fn()):
        preprocessed = _preprocess_chunk(embeddings_chunk, config)
        n = preprocessed.shape[0]
        result[offset:offset + n] = reducer.transform(preprocessed).astype(np.float32)
        offset += n

    if offset != total_count:
        result = result[:offset]

    return result, backend


def stream_random_projection(
    chunk_fn,
    *,
    config: LayoutConfig | None = None,
    embedding_dim: int,
    total_count: int,
) -> tuple[numpy.ndarray, str]:
    """Single-pass streaming dimensionality reduction via SparseRandomProjection.

    Unlike IncrementalPCA (two passes — fit then transform), random projection
    is data-independent: the sparse projection matrix depends only on the
    input/output dimensions and a random seed. This eliminates the fit pass
    entirely, halving DB reads.

    Quality justification: A 2025 benchmarking study (PMC11838541) found
    SparseRandomProjection produces equal or better clustering quality than
    PCA for UMAP preprocessing on biomedical datasets. The Johnson-Lindenstrauss
    lemma guarantees pairwise distance preservation within (1±ε), which is
    exactly what UMAP's kNN graph construction needs.

    Peak memory: ~300 MB (one chunk) + 500 MB output array.

    Args:
        chunk_fn: Callable returning a generator of (corpus_ids, citation_counts,
            embeddings) tuples. Called once (single pass).
        config: Layout configuration.
        embedding_dim: Dimensionality of the embedding vectors.
        total_count: Total number of rows.

    Returns:
        (layout_matrix, backend) tuple.
    """
    np = require_numpy()
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)

    if total_count <= 2:
        chunks = []
        for _ids, _cites, emb in chunk_fn():
            chunks.append(emb)
        if not chunks:
            return np.empty((0, embedding_dim), dtype=np.float32), backend
        all_emb = np.concatenate(chunks, axis=0)
        return all_emb[:, :min(config.pca_components, all_emb.shape[1])], backend

    try:
        from sklearn.random_projection import SparseRandomProjection
    except ImportError as exc:
        raise RuntimeError(
            "Graph layout requires scikit-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    n_components = min(config.pca_components, total_count - 1, embedding_dim)
    if n_components < 2:
        chunks = []
        for _ids, _cites, emb in chunk_fn():
            chunks.append(emb)
        return np.concatenate(chunks, axis=0) if chunks else np.empty((0, embedding_dim), dtype=np.float32), backend

    # Fit on dummy data — SRP only needs dimensions, not data statistics
    reducer = SparseRandomProjection(
        n_components=n_components,
        density="auto",
        random_state=config.random_state,
    )
    reducer.fit(np.zeros((1, embedding_dim), dtype=np.float32))

    # Single pass: stream → preprocess → transform → accumulate
    result = np.empty((total_count, n_components), dtype=np.float32)
    offset = 0
    for _ids, _cites, embeddings_chunk in _prefetch(chunk_fn()):
        preprocessed = _preprocess_chunk(embeddings_chunk, config)
        n = preprocessed.shape[0]
        result[offset:offset + n] = reducer.transform(preprocessed).astype(np.float32)
        offset += n

    if offset != total_count:
        result = result[:offset]

    return result, backend


def _preprocess_chunk(embeddings: numpy.ndarray, config: LayoutConfig) -> numpy.ndarray:
    """Preprocess a single chunk of embeddings (L2 normalize, no mean centering).

    Per-chunk preprocessing is correct because:
    - L2 normalization is per-row (independent of other rows)
    - IncrementalPCA handles centering internally (tracks running mean)
    - SparseRandomProjection preserves distances regardless of centering
    """
    np = require_numpy()
    # Single copy: avoid double-copy when dtype already matches (binary COPY
    # delivers float32 natively, so astype would be a no-op copy on top of
    # the copy we need for in-place normalization).
    matrix = embeddings.copy() if embeddings.dtype == np.float32 else embeddings.astype(np.float32)
    if config.l2_normalize:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix /= norms
    return matrix


def _random_subsample(
    n_total: int,
    target_size: int,
    random_state: int = 42,
) -> "numpy.ndarray":
    """Select a random subsample of indices."""
    np = require_numpy()
    rng = np.random.default_rng(random_state)
    return rng.choice(n_total, size=target_size, replace=False)


def _use_subsample(config: LayoutConfig, n_points: int) -> bool:
    """Whether to use subsample fit + batched transform."""
    return config.subsample_size > 0 and n_points > config.subsample_size


@observe(name=SPAN_GRAPH_LAYOUT_RUN, capture_input=False, capture_output=False)
def run_layout_from_matrix(
    layout_matrix: "numpy.ndarray",
    *,
    config: LayoutConfig | None = None,
    shared_knn: NeighborGraphResult | None = None,
) -> LayoutResult:
    """Project a PCA-space matrix to 2D.

    GPU path uses native cuML with cupy arrays (data lives in VRAM).
    CPU path uses umap-learn with numpy arrays.

    When ``config.subsample_size > 0`` and the dataset exceeds that size,
    fits UMAP on a random subsample then transforms the rest in batches.
    """
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)
    np = require_numpy()

    if layout_matrix.shape[0] <= 2:
        return LayoutResult(coordinates=layout_matrix[:, :2], backend=backend)

    n_points = layout_matrix.shape[0]
    n_neighbors = min(config.n_neighbors, n_points - 1)
    use_subsample = _use_subsample(config, n_points)

    if backend == "cuml_native":
        if use_subsample:
            coordinates = _fit_transform_subsample_gpu(
                layout_matrix, config=config, n_neighbors=n_neighbors,
            )
        else:
            coordinates = _fit_transform_full_gpu(
                layout_matrix, config=config, shared_knn=shared_knn,
                n_neighbors=n_neighbors,
            )
    else:
        coordinates = _fit_transform_cpu(
            layout_matrix, config=config, shared_knn=shared_knn,
            n_neighbors=n_neighbors,
        )

    if np.any(np.isnan(coordinates)) or np.any(np.isinf(coordinates)):
        raise RuntimeError(
            "UMAP produced NaN/Inf coordinates — likely divergence. "
            "Check input embeddings for NaN values."
        )

    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(
                output={
                    "input_shape": list(layout_matrix.shape),
                    "output_shape": list(coordinates.shape),
                    "backend": backend,
                    "n_neighbors": n_neighbors,
                    "subsample": use_subsample,
                    "subsample_size": config.subsample_size if use_subsample else 0,
                },
            )
    except Exception:
        pass

    return LayoutResult(coordinates=coordinates, backend=backend)


# ---------------------------------------------------------------------------
# GPU paths — native cuML with cupy arrays (data in VRAM)
# ---------------------------------------------------------------------------

def _fit_transform_full_gpu(
    layout_matrix: "numpy.ndarray",
    *,
    config: LayoutConfig,
    shared_knn: NeighborGraphResult | None,
    n_neighbors: int,
) -> "numpy.ndarray":
    """Single-pass GPU fit_transform with optional precomputed kNN in VRAM."""
    import cupy as cp
    from cuml.manifold import UMAP

    X_gpu = cp.asarray(layout_matrix)

    kwargs: dict = dict(
        n_neighbors=n_neighbors,
        n_components=2,
        min_dist=config.min_dist,
        spread=config.spread,
        metric=config.metric,
        random_state=config.random_state,
    )

    if shared_knn is not None:
        pruned = prune_neighbor_graph(shared_knn, column_count=config.n_neighbors)
        kwargs["precomputed_knn"] = (
            cp.asarray(pruned.indices),
            cp.asarray(pruned.distances),
        )

    reducer = UMAP(**kwargs)
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=r"precomputed_knn")
        coords_gpu = reducer.fit_transform(X_gpu)

    coordinates = coords_gpu.get()
    del X_gpu, coords_gpu
    if "precomputed_knn" in kwargs:
        del kwargs["precomputed_knn"]
    return coordinates


def _fit_transform_subsample_gpu(
    layout_matrix: "numpy.ndarray",
    *,
    config: LayoutConfig,
    n_neighbors: int,
) -> "numpy.ndarray":
    """Fit UMAP on a subsample in VRAM, transform the rest in batches.

    No precomputed_knn — uses ``metric="cosine"`` so ``.transform()``
    can compute neighbors for new points. ``n_epochs`` is set explicitly
    because the default auto-calculation yields too few epochs for
    accurate transform (cuML issue #3864).
    """
    import cupy as cp
    from cuml.manifold import UMAP

    np = require_numpy()
    n_total = layout_matrix.shape[0]
    subsample_idx = _random_subsample(n_total, config.subsample_size, config.random_state)
    subsample_idx.sort()

    rest_mask = np.ones(n_total, dtype=bool)
    rest_mask[subsample_idx] = False
    rest_idx = np.where(rest_mask)[0]

    logger.info(
        "Subsample UMAP (GPU): fit on %d, transform %d in batches of %d",
        len(subsample_idx), len(rest_idx), config.transform_batch_size,
    )

    X_sub_gpu = cp.asarray(layout_matrix[subsample_idx])
    reducer = UMAP(
        n_neighbors=n_neighbors,
        n_components=2,
        n_epochs=config.subsample_n_epochs,
        min_dist=config.min_dist,
        spread=config.spread,
        metric=config.metric,
        random_state=config.random_state,
    )
    coords_sub_gpu = reducer.fit_transform(X_sub_gpu)

    coordinates = np.empty((n_total, 2), dtype=np.float32)
    coordinates[subsample_idx] = coords_sub_gpu.get()
    del X_sub_gpu, coords_sub_gpu

    logger.info("Subsample fit complete, transforming remaining %d points", len(rest_idx))
    batch_size = config.transform_batch_size
    for start in range(0, len(rest_idx), batch_size):
        end = min(start + batch_size, len(rest_idx))
        batch_gpu = cp.asarray(layout_matrix[rest_idx[start:end]])
        coords_batch = reducer.transform(batch_gpu)
        coordinates[rest_idx[start:end]] = coords_batch.get()
        del batch_gpu, coords_batch
        logger.info("Transform batch %d-%d / %d", start, end, len(rest_idx))

    return coordinates


# ---------------------------------------------------------------------------
# CPU fallback — umap-learn with numpy arrays
# ---------------------------------------------------------------------------

def _fit_transform_cpu(
    layout_matrix: "numpy.ndarray",
    *,
    config: LayoutConfig,
    shared_knn: NeighborGraphResult | None,
    n_neighbors: int,
) -> "numpy.ndarray":
    """CPU fallback using umap-learn with optional precomputed kNN."""
    try:
        from umap import UMAP
    except ImportError as exc:
        raise RuntimeError(
            "Graph layout requires umap-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    precomputed_knn = (None, None, None)
    if shared_knn is not None:
        pruned = prune_neighbor_graph(shared_knn, column_count=config.n_neighbors)
        precomputed_knn = (pruned.indices, pruned.distances)

    reducer = UMAP(
        n_neighbors=n_neighbors,
        n_components=2,
        min_dist=config.min_dist,
        spread=config.spread,
        metric=config.metric,
        set_op_mix_ratio=config.set_op_mix_ratio,
        repulsion_strength=config.repulsion_strength,
        negative_sample_rate=config.negative_sample_rate,
        random_state=config.random_state,
        low_memory=True,
        n_jobs=-1,
        precomputed_knn=precomputed_knn,
    )
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"precomputed_knn\[2\].*transform will be unavailable\.",
        )
        return reducer.fit_transform(layout_matrix)


def run_layout(
    preprocessed_embeddings: numpy.ndarray,
    *,
    config: LayoutConfig | None = None,
) -> LayoutResult:
    """Project preprocessed embeddings to 2D with PCA + UMAP."""
    layout_matrix, _ = prepare_layout_matrix(
        preprocessed_embeddings,
        config=config,
    )
    return run_layout_from_matrix(layout_matrix, config=config)


def _compute_cluster_affinity(
    cluster_ids: numpy.ndarray,
    knn_indices: numpy.ndarray,
    cluster_labels: numpy.ndarray,
    sizes: numpy.ndarray,
) -> numpy.ndarray:
    """Build a C×C inter-cluster affinity matrix from the shared kNN graph.

    Fully vectorized: maps every kNN edge to its (source_cluster, dest_cluster)
    pair in one pass, then accumulates counts with ``np.add.at``.  The result
    is normalized by ``2 * min(size_i, size_j)`` and clamped to [0, 1].
    """
    np = require_numpy()
    n_points, k = knn_indices.shape
    c = len(cluster_labels)

    # Map raw cluster ids → dense 0..C-1 indices for the affinity matrix.
    max_cid = int(cluster_ids.max()) + 1
    cid_to_idx = np.full(max_cid + 1, -1, dtype=np.int32)
    for idx, cid in enumerate(cluster_labels):
        cid_to_idx[cid] = idx

    # Flatten kNN indices; look up cluster labels for source and dest.
    src_cids = np.repeat(cluster_ids, k)              # N*K
    dst_cids = cluster_ids[knn_indices.ravel()]        # N*K
    cross_mask = src_cids != dst_cids                  # only cross-cluster edges

    src_idx = cid_to_idx[src_cids[cross_mask]]
    dst_idx = cid_to_idx[dst_cids[cross_mask]]

    # Drop edges involving noise (cid ≤ 0 → idx == -1).
    valid = (src_idx >= 0) & (dst_idx >= 0)
    src_idx = src_idx[valid]
    dst_idx = dst_idx[valid]

    affinity = np.zeros((c, c), dtype=np.float64)
    np.add.at(affinity, (src_idx, dst_idx), 1.0)
    # Symmetrize (each edge counted from both endpoints).
    affinity = (affinity + affinity.T) * 0.5

    # Normalize by 2 * min(size_i, size_j).
    min_sizes = np.minimum(sizes[:, None], sizes[None, :]).astype(np.float64)
    denom = 2.0 * np.maximum(min_sizes, 1.0)
    affinity /= denom
    np.clip(affinity, 0.0, 1.0, out=affinity)
    np.fill_diagonal(affinity, 0.0)
    return affinity.astype(np.float32)


def _pairwise_cluster_repulsion(
    centroids: numpy.ndarray,
    radii: numpy.ndarray,
    sizes: numpy.ndarray,
    affinity: numpy.ndarray | None,
    *,
    iterations: int,
    gap_scale_base: float,
    damping: float,
) -> numpy.ndarray:
    """Size/density/topology-aware pairwise overlap resolution.

    All-pairs distance computation is O(C²) per iteration where C is the
    number of clusters (typically 50-200), so the simulation completes in
    microseconds even at 25 iterations.
    """
    np = require_numpy()
    c = centroids.shape[0]
    if c <= 1:
        return centroids.copy()

    current = centroids.copy().astype(np.float64)
    radii_f = radii.astype(np.float64)
    sizes_f = sizes.astype(np.float64)
    total_sizes = sizes_f[:, None] + sizes_f[None, :]
    # Size weights: how much each cluster moves (inverse of its size).
    # w_i = size_j / (size_i + size_j)
    weight_matrix = sizes_f[None, :] / np.maximum(total_sizes, 1.0)  # C×C: weight_matrix[i,j] = size_j/(size_i+size_j)

    # Precompute density: count of other centroids within 2× median distance.
    dists_all = np.linalg.norm(
        current[:, None, :] - current[None, :, :], axis=2
    )
    np.fill_diagonal(dists_all, np.inf)
    median_dist = float(np.median(dists_all[dists_all < np.inf]))
    if median_dist < 1e-9:
        median_dist = 1.0
    density_radius = 2.0 * median_dist
    np.fill_diagonal(dists_all, np.inf)
    local_density = np.sum(dists_all < density_radius, axis=1).astype(np.float64)
    local_density = np.maximum(local_density, 1.0)
    median_density = float(np.median(local_density))
    if median_density < 1.0:
        median_density = 1.0

    # Radii sum matrix and topology factor.
    radii_sum = radii_f[:, None] + radii_f[None, :]
    if affinity is not None:
        topo_factor = 1.0 - 0.5 * affinity.astype(np.float64)
    else:
        topo_factor = np.ones((c, c), dtype=np.float64)

    epsilon = 1e-9

    for _ in range(iterations):
        deltas = current[:, None, :] - current[None, :, :]  # C×C×2
        dists = np.linalg.norm(deltas, axis=2)               # C×C
        np.fill_diagonal(dists, np.inf)

        # Density-adaptive gap per pair: use max local density of the pair.
        # Dense regions (pair_density > median) → gap shrinks below base.
        # Sparse regions → gap stays at base (clamped, never amplified).
        pair_density = np.maximum(local_density[:, None], local_density[None, :])
        density_ratio = pair_density / median_density
        gap_scale_local = np.where(
            density_ratio >= 1.0,
            gap_scale_base / np.sqrt(density_ratio),
            gap_scale_base,
        )

        target_gap = radii_sum * gap_scale_local * topo_factor
        overlap = target_gap - dists  # positive where overlapping

        # Only process overlapping pairs (upper triangle).
        overlap_mask = np.triu(overlap > 0, k=1)
        if not np.any(overlap_mask):
            break

        # Direction vectors (normalized).
        direction = deltas / np.maximum(dists[:, :, None], epsilon)

        # Forces: overlap * size_weight * 0.5 * direction
        # For pair (i,j): force on i = +direction[i,j] * overlap[i,j] * w_i * 0.5
        forces = np.zeros_like(current)
        overlap_vals = np.where(overlap_mask, overlap, 0.0)

        # Force contribution from i<j pairs.
        force_mag_i = overlap_vals * weight_matrix * 0.5       # weight_matrix[i,j] = size_j/(si+sj) → weight for i
        force_mag_j = overlap_vals * weight_matrix.T * 0.5     # weight_matrix[j,i] = size_i/(si+sj) → weight for j

        # Sum forces along axis 1 for each cluster.
        forces += np.sum(force_mag_i[:, :, None] * direction * overlap_mask[:, :, None], axis=1)
        # Subtract for the j side (direction[j,i] = -direction[i,j]).
        forces -= np.sum(
            (force_mag_j[:, :, None] * direction * overlap_mask[:, :, None]),
            axis=0,
        )

        force_norms = np.linalg.norm(forces, axis=1)
        max_force = float(np.max(force_norms))
        if max_force < 0.01:
            break

        # Cap per-cluster displacement to median radius — prevents runaway
        # accumulation when a central cluster overlaps many neighbors.
        step = forces * damping
        step_norms = np.linalg.norm(step, axis=1, keepdims=True)
        max_step = float(np.median(radii_f))
        excess = step_norms > max_step
        if np.any(excess):
            step = np.where(excess, step * (max_step / np.maximum(step_norms, epsilon)), step)

        current += step

    return current.astype(centroids.dtype)


def apply_cluster_repulsion(
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    *,
    knn_indices: numpy.ndarray | None = None,
    repulsion_factor: float = 1.0,
    overlap_iterations: int = 25,
    overlap_gap_scale: float = 1.3,
    overlap_damping: float = 0.8,
    relaxation_neighbors: int = 6,
    relaxation_iterations: int = 6,
    relaxation_gap_scale: float = 1.15,
    relaxation_step: float = 0.35,
) -> numpy.ndarray:
    """Push clusters apart while preserving intra-cluster structure.

    **Phase 1 — Pairwise overlap resolution** (default, topology+density aware):
    Runs a force simulation that only acts on overlapping cluster pairs.
    Large clusters move less (size-aware), crowded regions accept tighter
    packing (density-adaptive), and semantically related clusters (many
    shared kNN edges) keep shorter ideal distances (topology-aware).

    **Legacy radial push** (``repulsion_factor > 1.0``): Scales each cluster's
    centroid-to-global-center vector.  Disabled by default (factor=1.0).

    **Phase 2 — Local relaxation** (secondary pass): Small pairwise centroid
    relaxation among nearby non-noise clusters.

    All points in a cluster move by the same offset — intra-cluster geometry
    is preserved exactly.
    """
    np = require_numpy()
    if coordinates.shape[0] <= 1:
        return coordinates

    result = coordinates.copy()

    # Legacy radial push (disabled at default factor=1.0).
    if repulsion_factor > 1.0:
        global_center = np.median(coordinates, axis=0)
        for cid in np.unique(cluster_ids):
            mask = cluster_ids == cid
            centroid = coordinates[mask].mean(axis=0)
            offset = (centroid - global_center) * (repulsion_factor - 1.0)
            result[mask] += offset

    # Phase 1: Topology + density aware pairwise overlap resolution.
    phase1_ran = False
    if overlap_iterations > 0 and overlap_gap_scale > 0:
        cluster_stats = _summarize_clusters_for_relaxation(result, cluster_ids)
        if cluster_stats is not None:
            cluster_labels, centroids, radii, sizes = cluster_stats

            affinity = None
            if knn_indices is not None:
                affinity = _compute_cluster_affinity(
                    cluster_ids, knn_indices, cluster_labels, sizes,
                )

            new_centroids = _pairwise_cluster_repulsion(
                centroids,
                radii,
                sizes,
                affinity,
                iterations=overlap_iterations,
                gap_scale_base=overlap_gap_scale,
                damping=overlap_damping,
            )

            offsets = new_centroids - centroids
            for idx, cid in enumerate(cluster_labels):
                mask = cluster_ids == cid
                result[mask] += offsets[idx]
            phase1_ran = True

    # Phase 2: Local relaxation — only if Phase 1 did not run (avoids
    # double-pushing that scatters clusters into empty space).
    if phase1_ran:
        return result

    if (
        relaxation_iterations <= 0
        or relaxation_neighbors <= 0
        or relaxation_gap_scale <= 0
        or relaxation_step <= 0
    ):
        return result

    cluster_stats = _summarize_clusters_for_relaxation(result, cluster_ids)
    if cluster_stats is None:
        return result

    cluster_labels, centroids, radii, _sizes = cluster_stats
    relaxed_centroids = _relax_cluster_centroids(
        centroids,
        radii,
        neighbors=relaxation_neighbors,
        iterations=relaxation_iterations,
        gap_scale=relaxation_gap_scale,
        step=relaxation_step,
    )

    centroid_offsets = relaxed_centroids - centroids
    for idx, cid in enumerate(cluster_labels):
        mask = cluster_ids == cid
        result[mask] += centroid_offsets[idx]

    return result


def _summarize_clusters_for_relaxation(
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray, numpy.ndarray] | None:
    """Return cluster labels, centroids, robust radii, and member counts."""
    np = require_numpy()

    labels: list[int] = []
    centroids: list[numpy.ndarray] = []
    radii: list[float] = []
    sizes: list[int] = []
    for raw_cid in np.unique(cluster_ids):
        cid = int(raw_cid)
        if cid <= 0:
            continue

        mask = cluster_ids == raw_cid
        if not np.any(mask):
            continue

        members = coordinates[mask]
        centroid = members.mean(axis=0)
        distances = np.linalg.norm(members - centroid, axis=1)
        if distances.size > 0:
            p92 = float(np.percentile(distances, 92))
            median_dist = float(np.median(distances))
            radius = max(p92, median_dist * 1.5)
        else:
            radius = 0.0
        labels.append(cid)
        centroids.append(centroid)
        radii.append(max(radius, 1e-6))
        sizes.append(int(members.shape[0]))

    if not labels:
        return None

    return (
        np.asarray(labels, dtype=np.int32),
        np.asarray(centroids, dtype=coordinates.dtype),
        np.asarray(radii, dtype=coordinates.dtype),
        np.asarray(sizes, dtype=np.int64),
    )


def _relax_cluster_centroids(
    centroids: numpy.ndarray,
    radii: numpy.ndarray,
    *,
    neighbors: int,
    iterations: int,
    gap_scale: float,
    step: float,
) -> numpy.ndarray:
    """Separate nearby cluster centroids without distorting cluster interiors."""
    np = require_numpy()
    cluster_count = centroids.shape[0]
    if cluster_count <= 1:
        return centroids

    current = centroids.copy()
    neighbor_count = min(max(int(neighbors), 1), cluster_count - 1)
    epsilon = np.asarray(1e-6, dtype=current.dtype)

    for _ in range(int(iterations)):
        deltas = current[:, None, :] - current[None, :, :]
        distances_sq = np.sum(deltas * deltas, axis=2)
        np.fill_diagonal(distances_sq, np.inf)
        nearest = np.argpartition(distances_sq, kth=neighbor_count - 1, axis=1)[
            :, :neighbor_count
        ]

        offsets = np.zeros_like(current)
        touches = np.zeros(cluster_count, dtype=np.int32)
        seen_pairs: set[tuple[int, int]] = set()

        for i in range(cluster_count):
            for raw_j in nearest[i]:
                j = int(raw_j)
                pair = (i, j) if i < j else (j, i)
                if pair[0] == pair[1] or pair in seen_pairs:
                    continue
                seen_pairs.add(pair)

                a, b = pair
                vector = current[a] - current[b]
                distance = float(np.sqrt(distances_sq[a, b]))
                target_gap = float((radii[a] + radii[b]) * gap_scale)
                if distance >= target_gap:
                    continue

                if distance <= float(epsilon):
                    vector = np.asarray([1.0, 0.0], dtype=current.dtype)
                    distance = 1.0

                direction = vector / distance
                shift = direction * ((target_gap - distance) * step * 0.5)
                offsets[a] += shift
                offsets[b] -= shift
                touches[a] += 1
                touches[b] += 1

        if not np.any(touches):
            break

        normalizer = np.maximum(touches, 1).astype(current.dtype, copy=False)[:, None]
        current = current + offsets / normalizer

    return current


def compute_spatial_outlier_scores(
    coordinates: numpy.ndarray,
    *,
    cluster_ids: numpy.ndarray | None = None,
    n_neighbors: int = 20,
    contamination: float = 0.02,
    radial_percentile: float = 99.0,
) -> SpatialOutlierResult:
    """Two-pass spatial outlier detection on 2D UMAP coordinates.

    **Pass 1 — LOF (local)**: scikit-learn's Local Outlier Factor, the
    method explicitly recommended by the UMAP documentation.  Catches
    individual points in sparse regions that axis-aligned methods miss.

    **Pass 2 — Radial distance (global)**: flags points whose Euclidean
    distance from the spatial median exceeds the ``radial_percentile``
    threshold.  This catches *dense satellite clusters* that LOF misses
    because they're locally packed but globally far from the core — e.g.,
    editorial columns that UMAP correctly places far from research papers.

    The final outlier mask is the union of both passes.

    ``n_neighbors`` controls the LOF neighborhood size (default 20).
    ``contamination`` sets the LOF expected outlier fraction (default 2 %).
    ``radial_percentile`` sets the radial distance cutoff (default 99th).
    """
    np = require_numpy()
    n = coordinates.shape[0]
    if n <= max(n_neighbors, 3):
        return SpatialOutlierResult(
            outlier_scores=np.zeros(n, dtype=np.float32),
            is_spatial_outlier=np.zeros(n, dtype=bool),
            method="lof+radial",
            outlier_count=0,
            total_count=n,
        )

    try:
        from sklearn.neighbors import LocalOutlierFactor
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Spatial outlier detection requires scikit-learn. Install the "
            "graph extra: `uv sync --extra graph`."
        ) from exc

    # Pass 1: LOF — catches locally sparse individual points
    lof = LocalOutlierFactor(
        n_neighbors=min(n_neighbors, n - 1),
        contamination=contamination,
        metric="euclidean",
        n_jobs=-1,
    )
    lof_labels = lof.fit_predict(coordinates)
    lof_raw = -lof.negative_outlier_factor_
    is_lof_outlier = lof_labels == -1

    # Pass 2: Radial distance — catches dense-but-distant satellite clusters
    median = np.median(coordinates, axis=0)
    distances = np.sqrt(np.sum((coordinates - median) ** 2, axis=1))
    radial_threshold = np.percentile(distances, radial_percentile)
    is_radial_outlier = distances > radial_threshold

    # Exempt points belonging to real clusters from the radial pass.
    # Leiden assigns cluster_id >= 1 to community members; only noise
    # points (cluster_id <= 0) remain eligible for radial filtering.
    if cluster_ids is not None:
        is_radial_outlier = is_radial_outlier & (cluster_ids < 1)

    # Union of both passes
    is_spatial_outlier = is_lof_outlier | is_radial_outlier

    # Composite score: max of LOF score and normalized radial overshoot
    radial_overshoot = np.where(
        is_radial_outlier,
        (distances - radial_threshold) / max(float(radial_threshold), 1e-6),
        0.0,
    )
    lof_scores = np.where(is_lof_outlier, lof_raw, 0.0)
    outlier_scores = np.maximum(lof_scores, radial_overshoot).astype(np.float32)

    return SpatialOutlierResult(
        outlier_scores=outlier_scores,
        is_spatial_outlier=is_spatial_outlier,
        method="lof+radial",
        outlier_count=int(is_spatial_outlier.sum()),
        total_count=n,
    )
