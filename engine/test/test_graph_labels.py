"""Tests for graph cluster labeling helpers."""

from __future__ import annotations

from app.graph.labels import _deduplicate_labels
from app.graph.labels import build_cluster_labels


_SAMPLE_CLUSTER_TEXTS = {
    0: ["noise"],
    1: [
        "Delirium prevalence among hospitalized elderly",
        "Delirium screening with confusion assessment method",
        "Delirium prevention strategies in postoperative settings",
        "Hypoactive delirium underdiagnosis and management",
        "Delirium duration and long-term cognitive decline",
    ],
    2: [
        "Stroke thrombolysis with tissue plasminogen activator",
        "Acute ischemic stroke mechanical thrombectomy outcomes",
        "Stroke rehabilitation motor recovery prediction models",
        "Hemorrhagic stroke surgical intervention timing",
        "Stroke recurrence prevention anticoagulation therapy",
    ],
}


def test_build_cluster_labels_single_term_per_cluster():
    """Each unique cluster gets a single title-cased term."""
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS)
    by_cluster = {label.cluster_id: label for label in labels}

    assert by_cluster[0].label == "Noise"
    assert by_cluster[0].label_mode == "fixed"
    assert by_cluster[0].label_source == "system"

    # Non-noise clusters — no " / " separator
    assert " / " not in by_cluster[1].label
    assert " / " not in by_cluster[2].label

    # All non-noise labels use ctfidf mode and source
    assert by_cluster[1].label_mode == "ctfidf"
    assert by_cluster[1].label_source == "ctfidf"


def test_labels_contain_expected_terms():
    """The top c-TF-IDF term should reflect the dominant topic."""
    labels = build_cluster_labels(_SAMPLE_CLUSTER_TEXTS)
    by_cluster = {label.cluster_id: label for label in labels}

    assert "Delirium" in by_cluster[1].label
    assert "Stroke" in by_cluster[2].label


def test_noise_cluster_always_labeled():
    """Cluster 0 is always 'Noise' regardless of content."""
    texts = {0: ["some actual content here about delirium"]}
    labels = build_cluster_labels(texts)
    assert len(labels) == 1
    assert labels[0].label == "Noise"


def test_single_cluster_gets_label():
    """A single non-noise cluster still gets a label."""
    texts = {
        0: ["noise"],
        1: [
            "Epilepsy seizure management anticonvulsant therapy",
            "Epilepsy surgery temporal lobe resection outcomes",
            "Epileptic seizures electroencephalography monitoring",
        ],
    }
    labels = build_cluster_labels(texts)
    by_cluster = {label.cluster_id: label for label in labels}
    assert by_cluster[1].label_mode == "ctfidf"
    assert " / " not in by_cluster[1].label


# ─── _deduplicate_labels unit tests ─────────────────────────


def test_dedup_unique_labels_unchanged():
    """Unique labels stay as single terms."""
    terms = {1: ["pain", "chronic"], 2: ["stroke", "ischemic"]}
    labels = _deduplicate_labels(terms, set())
    assert labels[1] == "Pain"
    assert labels[2] == "Stroke"


def test_dedup_uses_natural_bigram_compound():
    """When 'term2 term1' is a known bigram, use the natural compound."""
    terms = {
        1: ["pain", "neuropathic", "chronic"],
        2: ["pain", "delirium", "scale"],
    }
    bigrams = {"neuropathic pain", "chronic pain"}
    labels = _deduplicate_labels(terms, bigrams)

    assert labels[1] == "Neuropathic Pain"
    assert labels[2] == "Pain & Delirium"


def test_dedup_ampersand_when_no_bigram():
    """When no natural bigram exists, use 'Term1 & Term2'."""
    terms = {
        1: ["learning", "dopamine", "fear"],
        2: ["learning", "deep", "network"],
    }
    bigrams = {"deep learning"}
    labels = _deduplicate_labels(terms, bigrams)

    assert labels[2] == "Deep Learning"
    assert labels[1] == "Learning & Dopamine"


def test_dedup_fallback_with_cluster_id():
    """When only one term is available, append cluster ID."""
    terms = {1: ["pain"], 2: ["pain"]}
    labels = _deduplicate_labels(terms, set())
    assert labels[1] == "Pain (1)"
    assert labels[2] == "Pain (2)"


def test_dedup_three_way_collision():
    """Three clusters sharing the same top term all get qualified."""
    terms = {
        1: ["cancer", "breast", "tumor"],
        2: ["cancer", "lung", "smoking"],
        3: ["cancer", "prostate", "psa"],
    }
    bigrams = {"breast cancer", "lung cancer", "prostate cancer"}
    labels = _deduplicate_labels(terms, bigrams)

    assert labels[1] == "Breast Cancer"
    assert labels[2] == "Lung Cancer"
    assert labels[3] == "Prostate Cancer"
