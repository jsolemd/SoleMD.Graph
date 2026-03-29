"""Tests for graph render/base admission predicates."""

from __future__ import annotations

from app.graph.render_policy import base_point_predicate_sql
from app.graph.render_policy import renderable_point_predicate_sql


def test_base_predicate_requires_renderable_and_base_membership():
    alias = "g"

    renderable = renderable_point_predicate_sql(alias)
    base_predicate = base_point_predicate_sql(alias)

    assert renderable == "COALESCE(g.outlier_score, 0) = 0"
    assert "COALESCE(g.is_in_base, false)" in base_predicate
    assert renderable in base_predicate
