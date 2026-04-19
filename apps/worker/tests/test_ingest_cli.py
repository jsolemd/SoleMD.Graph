from __future__ import annotations

from app.ingest.cli import (
    dispatch_manifest_requests,
    enqueue_release_request,
    parse_dispatch_manifest_request,
    parse_manual_release_request,
)


def test_manual_and_manifest_payload_shapes_match(monkeypatch) -> None:
    sent: list[dict] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.ingest.cli.start_release.send", fake_send)

    manual = parse_manual_release_request(
        source_code="s2",
        release_tag="2026-03-10",
        force_new_run=False,
        requested_by="tester",
        family_allowlist=["citations"],
        max_files_per_family=1,
        max_records_per_file=10,
    )
    manifest = parse_dispatch_manifest_request(
        source_code="s2",
        release_tag="2026-03-10",
        requested_by="tester",
        family_allowlist=["citations"],
        max_files_per_family=1,
        max_records_per_file=10,
    )

    manual_payload = manual.model_dump(mode="json")
    manifest_payload = manifest.model_dump(mode="json")
    assert set(manual_payload) == set(manifest_payload)
    assert manual_payload["source_code"] == manifest_payload["source_code"]
    assert manual_payload["release_tag"] == manifest_payload["release_tag"]
    assert manual_payload["family_allowlist"] == manifest_payload["family_allowlist"]

    enqueue_release_request(manual)
    dispatch_manifest_requests((manifest,))

    assert len(sent) == 2
    assert set(sent[0]) == set(sent[1])
    assert sent[0]["trigger"] == "manual"
    assert sent[1]["trigger"] == "manifest"
