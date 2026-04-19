from __future__ import annotations

from app.hot_text.cli import enqueue_paper_text_request, parse_paper_text_request


def test_hot_text_cli_payload_shape_matches_actor_payload(monkeypatch) -> None:
    sent: list[dict[str, object]] = []

    def fake_send(**payload: object) -> None:
        sent.append(payload)

    monkeypatch.setattr("app.hot_text.cli.acquire_for_paper.send", fake_send)

    request = parse_paper_text_request(
        corpus_id=123,
        force_refresh=True,
        requested_by="tester",
    )
    payload = request.model_dump(mode="json")

    assert payload == {
        "corpus_id": 123,
        "force_refresh": True,
        "requested_by": "tester",
    }

    enqueue_paper_text_request(request)

    assert sent == [payload]
