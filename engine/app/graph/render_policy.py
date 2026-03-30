"""Canonical render/base admission helpers for graph export and publish."""

from __future__ import annotations


def renderable_point_predicate_sql(alias: str) -> str:
    """Return the canonical SQL predicate for browser-renderable graph points."""
    return f"COALESCE({alias}.outlier_score, 0) = 0"


def base_point_predicate_sql(alias: str) -> str:
    """Return the canonical SQL predicate for base_points admission."""
    return (
        f"({renderable_point_predicate_sql(alias)})"
        f" AND EXISTS ("
        f"SELECT 1 FROM solemd.graph_base_points bp"
        f" WHERE bp.graph_run_id = {alias}.graph_run_id"
        f" AND bp.corpus_id = {alias}.corpus_id"
        f")"
    )
