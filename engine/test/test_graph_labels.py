"""Tests for graph cluster labeling helpers."""

from __future__ import annotations

from app.graph.labels import _match_vocab_term
from app.graph.labels import build_cluster_labels


_SAMPLE_CLUSTER_TEXTS = {
    0: ["noise"],
    1: [
        "Delirium in intensive care patients",
        "ICU delirium and encephalopathy",
        "Delirium assessment tools for critical care",
    ],
    2: [
        "Stroke thrombolysis with tissue plasminogen activator",
        "Acute ischemic stroke mechanical thrombectomy",
        "Stroke rehabilitation and motor recovery prediction",
    ],
}


def test_build_cluster_labels_generates_ctfidf_labels():
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS)

    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[0].label == "Noise"
    assert by_cluster[1].label_mode == "ctfidf"
    assert "Delirium" in by_cluster[1].label
    assert "Stroke" in by_cluster[2].label


def test_build_cluster_labels_without_vocab_unchanged():
    """Without vocab_terms, labels and label_source are unchanged."""
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS, vocab_terms=None)
    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[1].label_source == "title_terms"
    assert by_cluster[2].label_source == "title_terms"


def test_build_cluster_labels_with_vocab_boosts_entity_terms():
    """Vocab-matched terms are boosted in ranking and use canonical form."""
    vocab = {
        "delirium": "Delirium",
        "stroke": "Stroke",
        "encephalopathy": "Encephalopathy",
    }
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS, vocab_terms=vocab)
    by_cluster = {label.cluster_id: label for label in labels}

    # Cluster 1: "delirium" and "encephalopathy" are entities — should be boosted
    assert "Delirium" in by_cluster[1].label
    assert by_cluster[1].label_source == "ctfidf+vocab"

    # Cluster 2: "stroke" is an entity — should be boosted
    assert "Stroke" in by_cluster[2].label
    assert by_cluster[2].label_source == "ctfidf+vocab"


def test_build_cluster_labels_with_empty_vocab_no_change():
    """Empty vocab dict has no effect on labels."""
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS, vocab_terms={})
    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[1].label_source == "title_terms"


def test_build_cluster_labels_with_nonmatching_vocab():
    """Vocab with no matching terms leaves label_source as title_terms."""
    vocab = {"lithium": "Lithium", "clozapine": "Clozapine"}
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS, vocab_terms=vocab)
    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[1].label_source == "title_terms"
    assert by_cluster[2].label_source == "title_terms"


def test_vocab_boost_promotes_entity_over_generic_term():
    """An entity term gets boosted so it ranks higher than generic words."""
    # Two clusters so c-TF-IDF can contrast them.
    # Cluster 1 mentions "delirium" (an entity) alongside generic words.
    # Cluster 2 is unrelated so "delirium" is distinctive to cluster 1.
    texts = {
        0: ["noise"],
        1: [
            "advanced neuroimaging techniques for delirium detection",
            "novel neuroimaging approaches in delirium assessment",
            "neuroimaging protocols delirium evaluation critical care",
        ],
        2: [
            "cardiac arrhythmia management pharmacotherapy",
            "antiarrhythmic drug selection cardiac electrophysiology",
            "cardiac rhythm monitoring implantable devices",
        ],
    }

    # With vocab: "delirium" gets boosted and should appear in cluster 1's label
    vocab = {"delirium": "Delirium"}
    labels_vocab = build_cluster_labels(texts, vocab_terms=vocab)
    by_cluster = {l.cluster_id: l for l in labels_vocab}
    assert "Delirium" in by_cluster[1].label
    assert by_cluster[1].label_source == "ctfidf+vocab"


# ─── _match_vocab_term unit tests ───────────────────────────

def test_match_vocab_term_exact():
    vocab = {"delirium": "Delirium", "serotonin syndrome": "Serotonin Syndrome"}
    assert _match_vocab_term("delirium", vocab) == "Delirium"
    assert _match_vocab_term("serotonin syndrome", vocab) == "Serotonin Syndrome"


def test_match_vocab_term_case_insensitive():
    vocab = {"delirium": "Delirium"}
    assert _match_vocab_term("Delirium", vocab) == "Delirium"
    assert _match_vocab_term("DELIRIUM", vocab) == "Delirium"


def test_match_vocab_term_no_match():
    vocab = {"delirium": "Delirium"}
    assert _match_vocab_term("stroke", vocab) is None


def test_match_vocab_term_partial_match():
    """A unigram term should match if it's a component of a canonical name."""
    vocab = {"serotonin syndrome": "Serotonin Syndrome"}
    assert _match_vocab_term("serotonin", vocab) == "Serotonin Syndrome"


def test_match_vocab_term_short_term_no_partial():
    """Short terms (< 5 chars) should not partial-match to avoid noise."""
    vocab = {"qt prolongation": "QT Prolongation"}
    assert _match_vocab_term("qt", vocab) is None
