from __future__ import annotations

from pathlib import Path

from app.rag_ingest.source_locator import (
    RagSourceLocatorEntry,
    SidecarRagSourceLocatorRepository,
)


def test_sidecar_source_locator_upserts_and_fetches(monkeypatch, tmp_path: Path):
    locator_path = tmp_path / "s2orc_v2.corpus_locator.sqlite"

    def fake_locator_sidecar_path(*, source_system, source_revision):
        assert str(source_system) == "s2orc_v2"
        assert source_revision == "2026-03-10"
        return locator_path

    monkeypatch.setattr(
        "app.rag_ingest.source_locator.locator_sidecar_path",
        fake_locator_sidecar_path,
    )

    repository = SidecarRagSourceLocatorRepository()
    written = repository.upsert_entries(
        [
            RagSourceLocatorEntry(
                corpus_id=12345,
                source_system="s2orc_v2",
                source_revision="2026-03-10",
                source_kind="s2_shard",
                unit_name="s2orc_v2-001.jsonl.gz",
                unit_ordinal=17,
                source_document_key="12345",
            )
        ]
    )

    assert written == 1
    lookup = repository.fetch_entries(
        corpus_ids=[12345, 67890],
        source_system="s2orc_v2",
        source_revision="2026-03-10",
    )
    assert lookup.covered_corpus_ids == [12345]
    assert lookup.missing_corpus_ids([12345, 67890]) == [67890]
    assert lookup.by_corpus_id[12345].unit_name == "s2orc_v2-001.jsonl.gz"

    repository.upsert_entries(
        [
            RagSourceLocatorEntry(
                corpus_id=12345,
                source_system="s2orc_v2",
                source_revision="2026-03-10",
                source_kind="s2_shard",
                unit_name="s2orc_v2-009.jsonl.gz",
                unit_ordinal=3,
                source_document_key="12345",
            )
        ]
    )

    refreshed = repository.fetch_entries(
        corpus_ids=[12345],
        source_system="s2orc_v2",
        source_revision="2026-03-10",
    )
    assert refreshed.by_corpus_id[12345].unit_name == "s2orc_v2-009.jsonl.gz"
    assert refreshed.by_corpus_id[12345].unit_ordinal == 3


def test_sidecar_source_locator_round_trips_member_name(monkeypatch, tmp_path: Path):
    locator_path = tmp_path / "biocxml.corpus_locator.sqlite"

    def fake_locator_sidecar_path(*, source_system, source_revision):
        assert str(source_system) == "biocxml"
        assert source_revision == "2026-03-21"
        return locator_path

    monkeypatch.setattr(
        "app.rag_ingest.source_locator.locator_sidecar_path",
        fake_locator_sidecar_path,
    )

    repository = SidecarRagSourceLocatorRepository()
    repository.upsert_entries(
        [
            RagSourceLocatorEntry(
                corpus_id=42062427,
                source_system="biocxml",
                source_revision="2026-03-21",
                source_kind="bioc_archive",
                unit_name="BioCXML.3.tar.gz",
                unit_ordinal=1010,
                source_document_key="3100857",
                member_name="output/BioCXML/3100857.BioC.XML",
            )
        ]
    )

    lookup = repository.fetch_entries(
        corpus_ids=[42062427],
        source_system="biocxml",
        source_revision="2026-03-21",
    )

    assert lookup.by_corpus_id[42062427].member_name == "output/BioCXML/3100857.BioC.XML"
