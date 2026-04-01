from __future__ import annotations

from app.rag_ingest.document_title_sync import sync_rag_document_titles


class _FakeCursor:
    def __init__(self, responses, executed):
        self._responses = responses
        self._executed = executed
        self._rows = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def execute(self, sql, params=()):
        self._executed.append((sql, params))
        self._rows = self._responses.pop(0)

    def fetchall(self):
        return list(self._rows)


class _FakeConnection:
    def __init__(self, responses, executed):
        self._responses = responses
        self._executed = executed

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def cursor(self):
        return _FakeCursor(self._responses, self._executed)


def test_sync_rag_document_titles_updates_requested_mismatches():
    executed: list[tuple[str, tuple[object, ...]]] = []
    responses = [
        [
            {
                "corpus_id": 22,
                "warehouse_title": "Results",
                "canonical_title": "Canonical Title 22",
            },
            {
                "corpus_id": 11,
                "warehouse_title": "Methods",
                "canonical_title": "Canonical Title 11",
            },
        ],
        [
            {"corpus_id": 22},
            {"corpus_id": 11},
        ],
        [],
    ]

    def fake_connect():
        return _FakeConnection(responses, executed)

    report = sync_rag_document_titles(
        corpus_ids=[22, 11, 22],
        connect=fake_connect,
    )

    assert report.requested_corpus_ids == [22, 11]
    assert report.mismatched_before_count == 2
    assert report.updated_corpus_ids == [11, 22]
    assert report.remaining_mismatch_count == 0
    assert len(executed) == 3
    assert executed[0][1] == ([22, 11],)
    assert executed[1][1] == ([22, 11],)
    assert executed[2][1] == ([22, 11],)
