"""Embedding preprocessing and 2D layout helpers for corpus graph builds."""

from __future__ import annotations

from dataclasses import dataclass

from app.graph._util import require_numpy


@dataclass(frozen=True, slots=True)
class LayoutConfig:
    backend: str = "auto"
    pca_components: int = 50
    n_neighbors: int = 15
    min_dist: float = 0.25
    metric: str = "cosine"
    random_state: int = 42
    mean_center: bool = True
    l2_normalize: bool = True
    copy_embeddings: bool = False


@dataclass(frozen=True, slots=True)
class LayoutResult:
    coordinates: "numpy.ndarray"
    backend: str


_cuml_accel_installed = False


def _ensure_cuml_accel():
    global _cuml_accel_installed
    if not _cuml_accel_installed:
        import cuml.accel
        cuml.accel.install()
        _cuml_accel_installed = True


def preprocess_embeddings(embeddings: "numpy.ndarray", config: LayoutConfig) -> "numpy.ndarray":
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
    embeddings: "numpy.ndarray",
    config: LayoutConfig,
) -> "numpy.ndarray":
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


def run_layout(
    preprocessed_embeddings: "numpy.ndarray",
    *,
    config: LayoutConfig | None = None,
) -> LayoutResult:
    """Project preprocessed embeddings to 2D with PCA + UMAP."""
    config = config or LayoutConfig()
    backend = _enable_layout_backend(config)
    layout_matrix = _pca_for_layout(preprocessed_embeddings, config)

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

    reducer = UMAP(
        n_neighbors=min(config.n_neighbors, layout_matrix.shape[0] - 1),
        n_components=2,
        min_dist=config.min_dist,
        metric=config.metric,
        random_state=config.random_state,
        low_memory=True,
    )
    coordinates = reducer.fit_transform(layout_matrix)
    return LayoutResult(
        coordinates=coordinates,
        backend=backend,
    )
