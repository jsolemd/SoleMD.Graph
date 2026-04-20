from __future__ import annotations

from app.corpus.cli import (
    enqueue_corpus_selection_request,
    enqueue_evidence_wave_request,
    parse_corpus_selection_request,
    parse_evidence_wave_request,
)


def test_corpus_selection_cli_payload_shape_matches_actor_payload(monkeypatch) -> None:
    sent: list[dict[str, object]] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.corpus.cli.start_selection.send", fake_send)

    request = parse_corpus_selection_request(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        force_new_run=True,
        trigger="manual",
        requested_by="tester",
        phase_allowlist=["assets", "selection_summary"],
    )
    payload = request.model_dump(mode="json")

    assert payload == {
        "s2_release_tag": "s2-2026-04-01",
        "pt3_release_tag": "pt3-2026-04-01",
        "selector_version": "selector-v1",
        "force_new_run": True,
        "trigger": "manual",
        "requested_by": "tester",
        "phase_allowlist": ["assets", "selection_summary"],
    }

    enqueue_corpus_selection_request(request)

    assert sent == [payload]


def test_evidence_wave_cli_payload_shape_matches_actor_payload(monkeypatch) -> None:
    sent: list[dict[str, object]] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.corpus.cli.dispatch_evidence_wave.send", fake_send)

    request = parse_evidence_wave_request(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        wave_policy_key="evidence_missing_pmc_bioc",
        force_new_run=False,
        requested_by="tester",
        max_papers=25,
    )
    payload = request.model_dump(mode="json")

    assert payload == {
        "s2_release_tag": "s2-2026-04-01",
        "pt3_release_tag": "pt3-2026-04-01",
        "selector_version": "selector-v1",
        "wave_policy_key": "evidence_missing_pmc_bioc",
        "force_new_run": False,
        "requested_by": "tester",
        "max_papers": 25,
    }

    enqueue_evidence_wave_request(request)

    assert sent == [payload]
