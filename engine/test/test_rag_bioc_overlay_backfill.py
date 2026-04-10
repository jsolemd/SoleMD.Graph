from __future__ import annotations

from types import SimpleNamespace

import app.rag_ingest.bioc_overlay_backfill as overlay_backfill
from app.rag_ingest.bioc_overlay_backfill import (
    PostgresBioCOverlayCandidateLoader,
    run_bioc_overlay_backfill,
)


def test_bioc_backfill_archive_discovery_accepts_any_corpus_paper():
    def _archive_target_discoverer(**kwargs):
        class _Result:
            @property
            def candidates(self):
                class _Candidate:
                    def __init__(self, corpus_id, document_id, document_ordinal):
                        self.corpus_id = corpus_id
                        self.document_id = document_id
                        self.archive_name = kwargs["archive_name"]
                        self.document_ordinal = document_ordinal

                return [
                    _Candidate(11, "111", 3),
                    _Candidate(22, "222", 7),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [11, 22],
                    "scanned_documents": 250,
                    "candidates": [
                        {
                            "corpus_id": 11,
                            "document_id": "111",
                            "archive_name": kwargs["archive_name"],
                            "document_ordinal": 3,
                        },
                        {
                            "corpus_id": 22,
                            "document_id": "222",
                            "archive_name": kwargs["archive_name"],
                            "document_ordinal": 7,
                        },
                    ],
                }

            @property
            def selected_corpus_ids(self):
                return [11, 22]

        assert kwargs["require_existing_documents"] is False
        assert kwargs["require_existing_s2_source"] is False
        assert kwargs["skip_existing_bioc"] is True
        assert kwargs["start_document_ordinal"] == 750
        return _Result()

    def _locator_refresher(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {"bioc_stage": {"located_corpus_ids": kwargs["corpus_ids"]}}

        return _Result()

    def _refresh_runner(**kwargs):
        assert kwargs["seed_chunk_version"] is True
        assert kwargs["backfill_chunks"] is True
        assert kwargs["chunk_backfill_batch_size"] == 17
        assert kwargs["embedding_model"] == "medcpt-chunk-v1"

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": kwargs["corpus_ids"],
                    }
                }

        return _Result()

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    repository = _FakeLocatorRepository()

    report = run_bioc_overlay_backfill(
        run_id="overlay-archive-discovery-test",
        parser_version="parser-v1",
        archive_name="BioCXML.0.tar.gz",
        discovery_start_document_ordinal=750,
        limit=2,
        discovery_max_documents=500,
        archive_target_discoverer=_archive_target_discoverer,
        locator_refresher=_locator_refresher,
        refresh_runner=_refresh_runner,
        locator_repository=repository,
        seed_chunk_version=True,
        backfill_chunks=True,
        chunk_backfill_batch_size=17,
        embedding_model="medcpt-chunk-v1",
    )

    assert report.archive_name == "BioCXML.0.tar.gz"
    assert report.candidate_corpus_ids == [11, 22]
    assert report.discovery_report == {
        "archive_name": "BioCXML.0.tar.gz",
        "selected_corpus_ids": [11, 22],
        "scanned_documents": 250,
        "candidates": [
            {
                "corpus_id": 11,
                "document_id": "111",
                "archive_name": "BioCXML.0.tar.gz",
                "document_ordinal": 3,
            },
            {
                "corpus_id": 22,
                "document_id": "222",
                "archive_name": "BioCXML.0.tar.gz",
                "document_ordinal": 7,
            },
        ],
    }
    assert report.refreshed_corpus_ids == [11, 22]
    assert len(repository.entries) == 2
    assert report.batches[0].locator_refresh["seeded_from_discovery"] is True
    assert report.batches[0].locator_refresh["bioc_stage"]["scanned_documents"] == 0


def test_candidate_loader_keeps_explicit_ids_even_with_existing_bioc_rows():
    class FakeCursor:
        def __init__(self) -> None:
            self.sql = ""
            self.params = ()

        def execute(self, sql, params) -> None:
            self.sql = sql
            self.params = params

        def fetchall(self):
            return [{"corpus_id": 11}, {"corpus_id": 22}]

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> bool:
            return False

    class FakeConnection:
        def __init__(self) -> None:
            self.cursor_instance = FakeCursor()

        def cursor(self):
            return self.cursor_instance

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> bool:
            return False

    fake_connection = FakeConnection()
    loader = PostgresBioCOverlayCandidateLoader(connect=lambda: fake_connection)

    candidate_ids = loader.load_candidate_corpus_ids(corpus_ids=[11, 22], limit=10)

    assert candidate_ids == [11, 22]
    assert "bioc.corpus_id IS NULL" not in fake_connection.cursor_instance.sql
    assert fake_connection.cursor_instance.params == ([11, 22], [11, 22], 10)


def test_manifest_seeded_batches_sort_by_archive_locality(monkeypatch):
    class _CandidateLoader:
        def load_candidate_corpus_ids(self, *, corpus_ids, limit):
            return [22, 11, 33]

    seen_batches = []

    def _refresh_runner(**kwargs):
        seen_batches.append(list(kwargs["corpus_ids"]))

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": kwargs["corpus_ids"],
                    }
                }

        return _Result()

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    repository = _FakeLocatorRepository()

    monkeypatch.setattr(
        overlay_backfill,
        "_resolve_candidates_from_manifest",
        lambda *, corpus_ids, connect=None: {
            11: SimpleNamespace(
                corpus_id=11,
                document_id="111",
                archive_name="BioCXML.9.tar.gz",
                document_ordinal=5,
                member_name=None,
            ),
            22: SimpleNamespace(
                corpus_id=22,
                document_id="222",
                archive_name="BioCXML.1.tar.gz",
                document_ordinal=9,
                member_name=None,
            ),
            33: SimpleNamespace(
                corpus_id=33,
                document_id="333",
                archive_name="BioCXML.1.tar.gz",
                document_ordinal=2,
                member_name=None,
            ),
        },
    )

    report = run_bioc_overlay_backfill(
        run_id="overlay-manifest-order-test",
        parser_version="parser-v5",
        corpus_ids=[22, 11, 33],
        candidate_batch_size=2,
        candidate_loader=_CandidateLoader(),
        refresh_runner=_refresh_runner,
        locator_repository=repository,
    )

    assert report.candidate_corpus_ids == [33, 22, 11]
    assert [batch.requested_corpus_ids for batch in report.batches] == [[33, 22], [11]]
    assert seen_batches == [[33, 22], [11]]
    assert [entry.corpus_id for entry in repository.entries] == [33, 22, 11]
