from __future__ import annotations

from app.rag_ingest.source_locator_refresh import refresh_rag_source_locator
from app.rag_ingest.target_corpus import RagTargetCorpusRow


class _FakeTargetLoader:
    def __init__(self, rows):
        self._rows = rows

    def load(self, *, corpus_ids, limit):
        return list(self._rows)


class _FakeRepository:
    def __init__(self):
        self.entries: dict[tuple[int, str, str], dict[str, object]] = {}

    def upsert_entries(self, entries):
        for entry in entries:
            payload = (
                entry.model_dump(mode="python")
                if hasattr(entry, "model_dump")
                else dict(entry)
            )
            self.entries[
                (
                    int(payload["corpus_id"]),
                    str(payload["source_system"]),
                    str(payload["source_revision"]),
                )
            ] = payload
        return len(entries)

    def fetch_entries(self, *, corpus_ids, source_system, source_revision):
        from app.rag_ingest.source_locator import RagSourceLocatorLookup

        rows = [
            row
            for (corpus_id, row_source_system, row_source_revision), row in self.entries.items()
            if corpus_id in {int(value) for value in corpus_ids}
            and row_source_system == str(source_system)
            and row_source_revision == source_revision
        ]
        return RagSourceLocatorLookup.model_validate({"entries": rows})


def test_refresh_rag_source_locator_reuses_existing_sidecar_coverage(monkeypatch, tmp_path):
    repository = _FakeRepository()
    repository.upsert_entries(
        [
            {
                "corpus_id": 12345,
                "source_system": "s2orc_v2",
                "source_revision": "2026-03-10",
                "source_kind": "s2_shard",
                "unit_name": "s2orc_v2-001.jsonl.gz",
                "unit_ordinal": 10,
                "source_document_key": "12345",
            },
            {
                "corpus_id": 12345,
                "source_system": "biocxml",
                "source_revision": "2026-03-21",
                "source_kind": "bioc_archive",
                "unit_name": "BioCXML.0.tar.gz",
                "unit_ordinal": 4,
                "source_document_key": "12345",
            },
        ]
    )

    monkeypatch.setattr(
        "app.rag_ingest.source_locator_refresh.PostgresTargetCorpusLoader",
        lambda: _FakeTargetLoader([RagTargetCorpusRow(corpus_id=12345, pmid=12345)]),
    )

    scan_calls = {"s2": 0, "bioc": 0}

    def _iter_s2_rows(_shard_path):
        scan_calls["s2"] += 1
        yield from ()

    def _iter_bioc_documents(_archive_path):
        scan_calls["bioc"] += 1
        yield from ()

    monkeypatch.setattr("app.rag_ingest.source_locator_refresh._iter_s2_rows", _iter_s2_rows)
    monkeypatch.setattr(
        "app.rag_ingest.source_locator_refresh._iter_bioc_documents",
        _iter_bioc_documents,
    )

    report = refresh_rag_source_locator(
        run_id="locator-refresh-existing-coverage",
        corpus_ids=[12345],
        checkpoint_root=tmp_path,
        repository=repository,
    )

    assert scan_calls == {"s2": 0, "bioc": 0}
    assert report.s2_stage.located_corpus_ids == [12345]
    assert report.bioc_stage.located_corpus_ids == [12345]
    assert report.s2_stage.written_entries == 0
    assert report.bioc_stage.written_entries == 0
