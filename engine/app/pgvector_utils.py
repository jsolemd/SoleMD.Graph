"""Shared pgvector helpers used across ingest, graph, and runtime RAG paths."""

from __future__ import annotations

from collections.abc import Sequence


def format_vector_literal(vector: Sequence[float]) -> str:
    """Format a Python vector into pgvector's text literal form."""

    return "[" + ",".join(str(float(value)) for value in vector) + "]"
