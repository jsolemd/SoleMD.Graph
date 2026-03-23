"""Shared utilities for graph operations."""


def require_numpy():
    """Import and return numpy, raising a clear error if not installed."""
    try:
        import numpy as np
    except ImportError as exc:
        raise RuntimeError(
            "Graph operations require numpy. Install with: uv sync --extra graph"
        ) from exc
    return np
