"""Unit tests for dense retrieval audit helpers."""

from __future__ import annotations

from app.rag.dense_audit import (
    DenseAuditPaper,
    _aggregate_grouped_ranks,
    aggregate_rank_metrics,
    article_parts,
    article_text,
    parse_vector_literal,
)


def test_parse_vector_literal_parses_pgvector_text():
    assert parse_vector_literal("[0.25,-1,3.5]") == [0.25, -1.0, 3.5]
    assert parse_vector_literal(None) is None


def test_article_helpers_keep_title_and_abstract_separate():
    paper = DenseAuditPaper(
        corpus_id=1,
        title="Neural dopamine signaling",
        abstract="Signals reward prediction error.",
        primary_source_system="s2orc_v2",
        stored_embedding=[0.1, 0.2],
    )

    assert article_parts(paper) == [
        "Neural dopamine signaling",
        "Signals reward prediction error.",
    ]
    assert (
        article_text(paper)
        == "Neural dopamine signaling. Signals reward prediction error."
    )


def test_aggregate_rank_metrics_computes_hit_rates_and_mrr():
    metrics = aggregate_rank_metrics([1, 2, 5], k=5)

    assert metrics.cases == 3
    assert metrics.hit_at_1_rate == 0.3333
    assert metrics.hit_at_5_rate == 1.0
    assert metrics.mean_reciprocal_rank == 0.5667
    assert metrics.mean_target_rank == 2.667


def test_aggregate_grouped_ranks_builds_per_slice_metrics():
    grouped = _aggregate_grouped_ranks(
        [
            ("intent:support", 1),
            ("intent:support", 2),
            ("intent:refute", 5),
        ],
        top_k=5,
    )

    assert grouped["intent:support"].cases == 2
    assert grouped["intent:support"].hit_at_1_rate == 0.5
    assert grouped["intent:support"].hit_at_5_rate == 1.0
    assert grouped["intent:refute"].cases == 1
    assert grouped["intent:refute"].mean_target_rank == 5.0
