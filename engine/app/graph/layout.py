"""Embedding preprocessing and 2D layout helpers for corpus graph builds."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
import warnings

from app.graph.neighbors import NeighborGraphResult
from app.graph.neighbors import prune_neighbor_graph
from app.graph._util import require_numpy

if TYPE_CHECKING:
    import numpy


@dataclass(frozen=True, slots=True)
class LayoutConfig:
    backend: str = "auto"
    pca_components: int = 50
    n_neighbors: int = 30
    min_dist: float = 0.08
    spread: float = 1.0
    metric: str = "cosine"
    random_state: int = 42
    mean_center: bool = True
    l2_normalize: bool = True
    copy_embeddings: bool = False
    set_op_mix_ratio: float = 0.25
    repulsion_strength: float = 1.5
    negative_sample_rate: int = 10
    cluster_repulsion_factor: float = 2.0
    cluster_relaxation_neighbors: int = 6
    cluster_relaxation_iterations: int = 6
    cluster_relaxation_gap_scale: float = 1.15
    cluster_relaxation_step: float = 0.35
    outlier_lof_neighbors: int = 20
    outlier_contamination: float = 0.02


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


_cuml_accel_installed = False


def _ensure_cuml_accel():
    global _cuml_accel_installed
    if not _cuml_accel_installed:
        import cuml.accel
        cuml.accel.install()
        _cuml_accel_installed = True


def preprocess_embeddings(embeddings: numpy.ndarray, config: LayoutConfig) -> numpy.ndarray:
    np = require_numpy()
    matrix = embeddings.astype(np.float32, copy=config.copy_embeddings)
    if config.mean_center:
        matrix -= matrix.mean(axis=0, keepdims=True)
    if config.l2_normalize:
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix /= norms
    return matrix


def _enable_layout_backend(config: LayoutConfig) -> str:
    """Enable the configured acceleration backend before sklearn/umap imports.

    We keep the default graph code written against sklearn + umap-learn, then let
    RAPIDS ``cuml.accel`` intercept those estimators when available. This keeps
    the CPU path simple while allowing GPU acceleration for the same code path.
    """

    backend = config.backend.strip().lower()
    if backend not in {"auto", "cpu", "gpu", "cuml_accel"}:
        raise ValueError(f"unsupported layout backend: {config.backend}")

    if backend == "cpu":
        return "cpu"

    try:
        import cuml.accel  # noqa: F401
    except ImportError as exc:
        if backend in {"gpu", "cuml_accel"}:
            raise RuntimeError(
                "GPU layout requested but RAPIDS cuML is not installed. "
                "Install a compatible RAPIDS stack or use backend='cpu'."
            ) from exc
        return "cpu"

    # RAPIDS docs recommend installing cuml.accel before importing sklearn or
    # umap so supported estimators can be proxied onto the GPU.
    _ensure_cuml_accel()
    return "cuml_accel"


def _pca_for_layout(
    embeddings: numpy.ndarray,
    config: LayoutConfig,
) -> numpy.ndarray:
    if embeddings.shape[0] <= 2:
        return embeddings

    try:
        from sklearn.decomposition import PCA
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph layout requires scikit-learn PCA. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    n_components = min(
        config.pca_components,
        embeddings.shape[0] - 1,
        embeddings.shape[1],
    )
    if n_components < 2:
        return embeddings

    reducer = PCA(
        n_components=n_components,
        svd_solver="randomized",
        random_state=config.random_state,
    )
    return reducer.fit_transform(embeddings)


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


def run_layout_from_matrix(
    layout_matrix: numpy.ndarray,
    *,
    config: LayoutConfig | None = None,
    shared_knn: NeighborGraphResult | None = None,
) -> LayoutResult:
    """Project a PCA-space matrix to 2D with optional precomputed neighbors."""
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)

    if layout_matrix.shape[0] <= 2:
        return LayoutResult(
            coordinates=layout_matrix[:, :2],
            backend=backend,
        )

    try:
        from umap import UMAP
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "Graph layout requires umap-learn. Install the graph extra: "
            "`uv sync --extra graph`."
        ) from exc

    precomputed_knn = (None, None, None)
    if shared_knn is not None:
        pruned = prune_neighbor_graph(shared_knn, column_count=config.n_neighbors)
        precomputed_knn = (pruned.indices, pruned.distances)

    reducer = UMAP(
        n_neighbors=min(config.n_neighbors, layout_matrix.shape[0] - 1),
        n_components=2,
        min_dist=config.min_dist,
        spread=config.spread,
        metric=config.metric,
        set_op_mix_ratio=config.set_op_mix_ratio,
        repulsion_strength=config.repulsion_strength,
        negative_sample_rate=config.negative_sample_rate,
        random_state=config.random_state,
        low_memory=True,
        n_jobs=-1 if config.random_state is None else 1,
        precomputed_knn=precomputed_knn,
    )
    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            message=r"precomputed_knn\[2\].*transform will be unavailable\.",
        )
        coordinates = reducer.fit_transform(layout_matrix)
    return LayoutResult(
        coordinates=coordinates,
        backend=backend,
    )


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


def apply_cluster_repulsion(
    coordinates: numpy.ndarray,
    cluster_ids: numpy.ndarray,
    *,
    repulsion_factor: float = 2.0,
    relaxation_neighbors: int = 6,
    relaxation_iterations: int = 6,
    relaxation_gap_scale: float = 1.15,
    relaxation_step: float = 0.35,
) -> numpy.ndarray:
    """Push clusters apart while preserving intra-cluster structure.

    Scales the vector from the global spatial median to each cluster's
    centroid by ``repulsion_factor``. Then runs a small centroid-only
    relaxation pass among nearby clusters so central overlaps gain space.
    All points in a cluster move by the same offset, so relative positions
    within each cluster are unchanged — only inter-cluster spacing increases.
    """
    np = require_numpy()
    if coordinates.shape[0] <= 1:
        return coordinates

    result = coordinates.copy()
    if repulsion_factor > 1.0:
        global_center = np.median(coordinates, axis=0)

        for cid in np.unique(cluster_ids):
            mask = cluster_ids == cid
            centroid = coordinates[mask].mean(axis=0)
            offset = (centroid - global_center) * (repulsion_factor - 1.0)
            result[mask] += offset

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

    cluster_labels, centroids, radii = cluster_stats
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
) -> tuple[numpy.ndarray, numpy.ndarray, numpy.ndarray] | None:
    """Return cluster labels, centroids, and robust radii for non-noise clusters."""
    np = require_numpy()

    labels: list[int] = []
    centroids: list[numpy.ndarray] = []
    radii: list[float] = []
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
        radius = float(np.percentile(distances, 80)) if distances.size > 0 else 0.0
        labels.append(cid)
        centroids.append(centroid)
        radii.append(max(radius, 1e-6))

    if not labels:
        return None

    return (
        np.asarray(labels, dtype=np.int32),
        np.asarray(centroids, dtype=coordinates.dtype),
        np.asarray(radii, dtype=coordinates.dtype),
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
