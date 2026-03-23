"""Tests for graph cluster labeling helpers."""

from __future__ import annotations

from app.graph.labels import build_cluster_labels


def test_build_cluster_labels_generates_lexical_labels():
    labels = build_cluster_labels(
        {
            1: ["Delirium in intensive care patients", "ICU delirium and encephalopathy"],
            0: ["noise"],
        }
    )

    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[0].label == "Noise"
    assert by_cluster[1].label_mode == "lexical"
    assert "Delirium" in by_cluster[1].label
