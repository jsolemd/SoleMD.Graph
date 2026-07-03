from __future__ import annotations

from app.corpus.runtime_support import corpus_selection_run_label, corpus_wave_run_label


def test_corpus_run_labels_use_release_identity_not_uuid() -> None:
    selection_label = corpus_selection_run_label(
        selector_version="selector-v1",
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
    )
    wave_label = corpus_wave_run_label(
        wave_policy_key="evidence_missing_pmc_bioc",
        selector_version="selector-v1",
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
    )

    assert selection_label == "selector-v1:s2-2026-04-01:pt3-2026-04-01"
    assert wave_label == (
        "evidence_missing_pmc_bioc:"
        "selector-v1:s2-2026-04-01:pt3-2026-04-01"
    )
    assert not _has_uuid_shaped_segment(selection_label)
    assert not _has_uuid_shaped_segment(wave_label)


def _has_uuid_shaped_segment(value: str) -> bool:
    return any(part.count("-") >= 4 and len(part) >= 32 for part in value.split(":"))
