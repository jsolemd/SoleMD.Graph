"""Shared utilities for graph operations."""

from __future__ import annotations


def has_native_cuml_layout_stack() -> bool:
    """Return True when native cuML/cupy layout dependencies are available."""
    try:
        import cuml.manifold  # noqa: F401
        import cupy  # noqa: F401
    except ImportError:
        return False
    return True


def resolve_graph_layout_backend(
    requested_backend: str, *, native_available: bool | None = None
) -> str:
    """Resolve the layout backend that will actually run.

    GPU requests fall back to CPU when the native stack is unavailable.
    Use `require_graph_layout_backend()` when you need a strict gate.
    """
    normalized = requested_backend.strip().lower()
    if normalized not in {"auto", "cpu", "gpu", "cuml_native"}:
        raise ValueError(f"unsupported layout backend: {requested_backend}")

    if native_available is None:
        native_available = has_native_cuml_layout_stack()

    if normalized == "cpu":
        return "cpu"

    if normalized in {"gpu", "cuml_native"}:
        return "cuml_native" if native_available else "cpu"

    return "cuml_native" if native_available else "cpu"


def require_graph_layout_backend(
    requested_backend: str, *, native_available: bool | None = None
) -> str:
    """Resolve the backend, but reject strict GPU requests without native support."""
    normalized = requested_backend.strip().lower()
    if normalized not in {"auto", "cpu", "gpu", "cuml_native"}:
        raise ValueError(f"unsupported layout backend: {requested_backend}")

    if native_available is None:
        native_available = has_native_cuml_layout_stack()

    if normalized in {"gpu", "cuml_native"} and not native_available:
        raise RuntimeError(
            "GPU layout requested but native cuML/cupy are not available. "
            "Install a compatible RAPIDS stack or set GRAPH_LAYOUT_BACKEND=cpu."
        )

    return resolve_graph_layout_backend(requested_backend, native_available=native_available)


def require_numpy():
    """Import and return numpy, raising a clear error if not installed."""
    try:
        import numpy as np
    except ImportError as exc:
        raise RuntimeError(
            "Graph operations require numpy. Install with: uv sync --extra graph"
        ) from exc
    return np
