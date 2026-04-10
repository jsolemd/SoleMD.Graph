from __future__ import annotations

from app.corpus import citation_context_backfill as backfill
from app.corpus.citation_context_backfill import (
    CitationContextBackfillBatchSummary,
    CitationContextBackfillSummary,
    _load_summary,
    _next_historical_corpus_batch,
    _next_target_corpus_batch,
    _target_refresh_completed,
    _write_summary,
    run_citation_context_backfill,
)


def test_citation_context_backfill_summary_accumulates_and_caps_recent_batches():
    summary = CitationContextBackfillSummary(
        selection_mode="historical_citing",
        after_corpus_id=0,
        last_completed_corpus_id=None,
        max_corpus_id=None,
        batch_size=10,
    )

    for index in range(25):
        summary.append_batch(
            CitationContextBackfillBatchSummary(
                batch_index=index + 1,
                first_corpus_id=index * 10 + 1,
                last_corpus_id=index * 10 + 10,
                corpus_id_count=10,
                citation_edge_count=100,
                context_rows_written=250,
            )
        )

    assert summary.batches_completed == 25
    assert summary.last_completed_corpus_id == 250
    assert summary.corpus_ids_processed == 250
    assert summary.citation_edges_processed == 2500
    assert summary.context_rows_written == 6250
    assert len(summary.recent_batches) == 20
    assert summary.recent_batches[0].batch_index == 6
    assert summary.recent_batches[-1].batch_index == 25


def test_citation_context_backfill_summary_roundtrips_report_file(tmp_path):
    report_path = tmp_path / "citation-context-backfill.json"
    summary = CitationContextBackfillSummary(
        selection_mode="targeted_corpus",
        after_corpus_id=100,
        last_completed_corpus_id=200,
        max_corpus_id=500,
        batch_size=25,
        batches_completed=4,
        corpus_ids_processed=100,
        citation_edges_processed=400,
        context_rows_written=1000,
        completed=False,
        dry_run=True,
        target_corpus_id_count=82,
        recent_batches=[
            CitationContextBackfillBatchSummary(
                batch_index=4,
                first_corpus_id=176,
                last_corpus_id=200,
                corpus_id_count=25,
                citation_edge_count=100,
                context_rows_written=250,
            )
        ],
    )

    _write_summary(report_path, summary)
    loaded = _load_summary(report_path)

    assert loaded is not None
    assert loaded.selection_mode == "targeted_corpus"
    assert loaded.after_corpus_id == 100
    assert loaded.last_completed_corpus_id == 200
    assert loaded.max_corpus_id == 500
    assert loaded.batch_size == 25
    assert loaded.batches_completed == 4
    assert loaded.dry_run is True
    assert loaded.target_corpus_id_count == 82
    assert len(loaded.recent_batches) == 1
    assert loaded.recent_batches[0].last_corpus_id == 200


def test_next_historical_corpus_batch_omits_null_upper_bound():
    class FakeCursor:
        def __init__(self) -> None:
            self.query = ""
            self.params = ()

        def execute(self, query, params) -> None:
            self.query = query
            self.params = params

        def fetchall(self):
            return [{"citing_corpus_id": 11}, {"citing_corpus_id": 17}]

    cur = FakeCursor()

    batch = _next_historical_corpus_batch(
        cur,
        after_corpus_id=10,
        max_corpus_id=None,
        batch_size=25,
    )

    assert batch == [11, 17]
    assert "AND c.citing_corpus_id <= %s" not in cur.query
    assert cur.params == (10, 25)


def test_next_historical_corpus_batch_applies_upper_bound_when_present():
    class FakeCursor:
        def __init__(self) -> None:
            self.query = ""
            self.params = ()

        def execute(self, query, params) -> None:
            self.query = query
            self.params = params

        def fetchall(self):
            return [{"citing_corpus_id": 11}]

    cur = FakeCursor()

    batch = _next_historical_corpus_batch(
        cur,
        after_corpus_id=10,
        max_corpus_id=50,
        batch_size=25,
    )

    assert batch == [11]
    assert "AND c.citing_corpus_id <= %s" in cur.query
    assert cur.params == (10, 50, 25)


def test_next_target_corpus_batch_slices_sorted_corpus_ids():
    batch = _next_target_corpus_batch(
        [11, 13, 17, 29, 31],
        after_corpus_id=13,
        max_corpus_id=None,
        batch_size=2,
    )

    assert batch == [17, 29]


def test_next_target_corpus_batch_respects_upper_bound():
    batch = _next_target_corpus_batch(
        [11, 13, 17, 29, 31],
        after_corpus_id=0,
        max_corpus_id=20,
        batch_size=5,
    )

    assert batch == [11, 13, 17]


def test_target_refresh_completed_detects_last_target():
    assert (
        _target_refresh_completed(
            [11, 13, 17, 29],
            last_completed_corpus_id=29,
            max_corpus_id=None,
        )
        is True
    )
    assert (
        _target_refresh_completed(
            [11, 13, 17, 29],
            last_completed_corpus_id=17,
            max_corpus_id=None,
        )
        is False
    )


def test_run_citation_context_backfill_dry_run_does_not_persist_report(
    tmp_path,
    monkeypatch,
):
    report_path = tmp_path / "citation-context-backfill.json"

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, *_args, **_kwargs):
            return None

    class FakeConnection:
        def __init__(self) -> None:
            self.cursor_obj = FakeCursor()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            raise AssertionError("dry-run should not commit")

    monkeypatch.setattr(backfill.db, "pooled", lambda: FakeConnection())
    monkeypatch.setattr(
        backfill,
        "_next_historical_corpus_batch",
        lambda *_args, **_kwargs: [11, 17],
    )
    monkeypatch.setattr(
        backfill,
        "_batch_counts",
        lambda *_args, **_kwargs: (5, 8),
    )
    monkeypatch.setattr(
        backfill,
        "_refresh_citation_context_batch",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("dry-run should not refresh rows")
        ),
    )

    summary = run_citation_context_backfill(
        batch_size=2,
        limit_batches=1,
        report_path=report_path,
        dry_run=True,
    )

    assert summary.batches_completed == 1
    assert summary.last_completed_corpus_id == 17
    assert summary.context_rows_written == 0
    assert not report_path.exists()


def test_run_citation_context_backfill_actual_ignores_stale_dry_run_report(
    tmp_path,
    monkeypatch,
):
    report_path = tmp_path / "citation-context-backfill.json"
    stale_dry_run = CitationContextBackfillSummary(
        selection_mode="historical_citing",
        after_corpus_id=0,
        last_completed_corpus_id=200,
        max_corpus_id=None,
        batch_size=25,
        batches_completed=4,
        corpus_ids_processed=100,
        citation_edges_processed=400,
        context_rows_written=0,
        completed=False,
        dry_run=True,
        recent_batches=[
            CitationContextBackfillBatchSummary(
                batch_index=4,
                first_corpus_id=176,
                last_corpus_id=200,
                corpus_id_count=25,
                citation_edge_count=100,
                context_rows_written=0,
            )
        ],
    )
    _write_summary(report_path, stale_dry_run)

    captured_after_corpus_ids: list[int] = []

    class FakeCursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, *_args, **_kwargs):
            return None

    class FakeConnection:
        def __init__(self) -> None:
            self.cursor_obj = FakeCursor()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return self.cursor_obj

        def commit(self):
            return None

    def fake_next_batch(*_args, after_corpus_id, **_kwargs):
        captured_after_corpus_ids.append(after_corpus_id)
        return [11, 17]

    monkeypatch.setattr(backfill.db, "pooled", lambda: FakeConnection())
    monkeypatch.setattr(backfill, "_next_historical_corpus_batch", fake_next_batch)
    monkeypatch.setattr(
        backfill,
        "_batch_counts",
        lambda *_args, **_kwargs: (5, 8),
    )
    monkeypatch.setattr(
        backfill,
        "_refresh_citation_context_batch",
        lambda *_args, **_kwargs: 8,
    )

    summary = run_citation_context_backfill(
        batch_size=2,
        limit_batches=1,
        report_path=report_path,
        dry_run=False,
    )
    loaded = _load_summary(report_path)

    assert captured_after_corpus_ids == [0]
    assert summary.batches_completed == 1
    assert summary.last_completed_corpus_id == 17
    assert summary.context_rows_written == 8
    assert loaded is not None
    assert loaded.dry_run is False
    assert loaded.last_completed_corpus_id == 17
