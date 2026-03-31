from __future__ import annotations

from app.rag.bioc_archive_ingest import run_bioc_archive_ingest


def test_bioc_archive_ingest_seeds_locators_and_refreshes():
    def _archive_target_discoverer(**kwargs):
        class _Candidate:
            def __init__(self, corpus_id, document_id, ordinal):
                self.corpus_id = corpus_id
                self.document_id = document_id
                self.archive_name = kwargs["archive_name"]
                self.document_ordinal = ordinal

        class _Result:
            @property
            def selected_corpus_ids(self):
                return [101, 202]

            @property
            def candidates(self):
                return [
                    _Candidate(101, "doc-101", 4),
                    _Candidate(202, "doc-202", 9),
                ]

            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101, 202],
                    "scanned_documents": 321,
                }

        assert kwargs["skip_existing_documents"] is True
        assert kwargs["skip_existing_bioc"] is True
        return _Result()

    class _FakeLocatorRepository:
        def __init__(self):
            self.entries = []

        def upsert_entries(self, entries):
            self.entries.extend(entries)
            return len(entries)

    def _refresh_runner(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "requested_corpus_ids": kwargs["corpus_ids"],
                    "skip_s2_primary": kwargs["skip_s2_primary"],
                }

        return _Result()

    repository = _FakeLocatorRepository()
    report = run_bioc_archive_ingest(
        run_id="bioc-archive-ingest-test",
        parser_version="parser-v1",
        archive_name="BioCXML.1.tar.gz",
        limit=2,
        archive_target_discoverer=_archive_target_discoverer,
        locator_repository=repository,
        refresh_runner=_refresh_runner,
    )

    assert report.seeded_locator_entries == 2
    assert len(repository.entries) == 2
    assert report.discovery_report == {
        "archive_name": "BioCXML.1.tar.gz",
        "selected_corpus_ids": [101, 202],
        "scanned_documents": 321,
    }
    assert report.warehouse_refresh == {
        "requested_corpus_ids": [101, 202],
        "skip_s2_primary": True,
    }
