from __future__ import annotations

import pytest

from app.actors.corpus import dispatch_selection_phases_actor, run_selection_phase
from app.corpus.cli import (
    enqueue_corpus_selection_phase_requests,
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


def test_corpus_selection_phase_dispatch_payload_shape_matches_actor_payload(
    monkeypatch,
) -> None:
    sent: list[dict[str, object]] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.corpus.cli.dispatch_selection_phases.send", fake_send)

    request = parse_corpus_selection_request(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        force_new_run=True,
        trigger="dispatch",
        requested_by="tester",
        phase_allowlist=None,
    )
    payload = request.model_dump(mode="json")

    enqueue_corpus_selection_phase_requests(request)

    assert sent == [payload]


@pytest.mark.asyncio
async def test_corpus_phase_dispatch_actor_enqueues_first_phase(monkeypatch) -> None:
    sent: list[dict[str, object]] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.actors.corpus.run_selection_phase.send", fake_send)

    await dispatch_selection_phases_actor.fn.__wrapped__(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        force_new_run=True,
        trigger="dispatch",
        requested_by="tester",
        phase_allowlist=None,
    )

    assert sent[0]["phase_name"] == "assets"
    assert sent[0]["phase_allowlist"] == ["assets"]
    assert sent[0]["phase_sequence"] == [
        "assets",
        "corpus_admission",
        "mapped_promotion",
        "corpus_baseline_materialization",
        "mapped_surface_materialization",
        "selection_summary",
    ]


@pytest.mark.asyncio
async def test_corpus_phase_actor_runs_one_phase_and_chains_next(monkeypatch) -> None:
    phase_calls: list[tuple[str, ...] | None] = []
    sent: list[dict[str, object]] = []

    class FakePools:
        def get(self, name: str) -> object:
            assert name == "ingest_write"
            return object()

    async def fake_ensure_worker_pools_open(*args, **kwargs) -> FakePools:
        return FakePools()

    async def fake_run_corpus_selection(request, *, ingest_pool) -> str:
        assert ingest_pool is not None
        phase_calls.append(request.phase_allowlist)
        return "00000000-0000-0000-0000-000000000001"

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr(
        "app.actors.corpus.ensure_worker_pools_open",
        fake_ensure_worker_pools_open,
    )
    monkeypatch.setattr("app.actors.corpus.run_corpus_selection", fake_run_corpus_selection)
    monkeypatch.setattr("app.actors.corpus.run_selection_phase.send", fake_send)

    await run_selection_phase.fn.__wrapped__(
        s2_release_tag="s2-2026-04-01",
        pt3_release_tag="pt3-2026-04-01",
        selector_version="selector-v1",
        force_new_run=True,
        trigger="dispatch",
        requested_by="tester",
        phase_allowlist=["assets"],
        phase_name="assets",
        phase_sequence=["assets", "corpus_admission"],
    )

    assert phase_calls == [("assets",)]
    assert sent[0]["phase_name"] == "corpus_admission"
    assert sent[0]["phase_allowlist"] == ["corpus_admission"]
    assert sent[0]["force_new_run"] is False


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
