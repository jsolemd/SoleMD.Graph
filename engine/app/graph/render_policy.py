"""Canonical render/default-visible policy helpers for graph export and publish."""

from __future__ import annotations

DEFAULT_VISIBLE_POLICY = "renderable_current_run"


def renderable_point_predicate_sql(alias: str) -> str:
    """Return the canonical SQL predicate for browser-renderable graph points."""
    return f"COALESCE({alias}.outlier_score, 0) = 0"


def default_visible_point_predicate_sql(alias: str) -> str:
    """Return the canonical SQL predicate for default-visible graph points."""
    return renderable_point_predicate_sql(alias)
