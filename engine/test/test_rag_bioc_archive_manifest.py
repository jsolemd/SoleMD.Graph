from __future__ import annotations

from pathlib import Path

from app.rag_ingest.bioc_archive_manifest import (
    RagBioCArchiveManifestEntry,
    RagBioCArchiveManifestSkip,
    SidecarBioCArchiveManifestRepository,
)


def test_sidecar_bioc_archive_manifest_upserts_and_fetches(monkeypatch, tmp_path: Path):
    manifest_path = tmp_path / "biocxml.archive_manifest.sqlite"

    monkeypatch.setattr(
        "app.rag_ingest.bioc_archive_manifest.bioc_archive_manifest_sidecar_path",
        lambda *, source_revision: manifest_path,
    )

    repository = SidecarBioCArchiveManifestRepository()
    written = repository.upsert_entries(
        [
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.2.tar.gz",
                document_ordinal=1001,
                member_name="output/BioCXML/3084310.BioC.XML",
                document_id="3084310",
            ),
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.2.tar.gz",
                document_ordinal=1002,
                member_name="output/BioCXML/3084311.BioC.XML",
                document_id="3084311",
            ),
        ]
    )

    assert written == 2
    assert repository.max_document_ordinal(
        source_revision="2026-03-21",
        archive_name="BioCXML.2.tar.gz",
    ) == 1002

    lookup = repository.fetch_window(
        source_revision="2026-03-21",
        archive_name="BioCXML.2.tar.gz",
        start_document_ordinal=1001,
        limit=2,
    )
    assert [entry.document_id for entry in lookup.entries] == ["3084310", "3084311"]

    repository.upsert_entries(
        [
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.2.tar.gz",
                document_ordinal=1002,
                member_name="output/BioCXML/updated.BioC.XML",
                document_id="updated-id",
            )
        ]
    )
    refreshed = repository.fetch_window(
        source_revision="2026-03-21",
        archive_name="BioCXML.2.tar.gz",
        start_document_ordinal=1002,
        limit=1,
    )
    assert refreshed.entries[0].member_name == "output/BioCXML/updated.BioC.XML"
    assert refreshed.entries[0].document_id == "updated-id"

    marked = repository.mark_skipped(
        [
            RagBioCArchiveManifestSkip(
                source_revision="2026-03-21",
                archive_name="BioCXML.2.tar.gz",
                document_ordinal=1002,
                document_id="updated-id",
                skip_reason="low_value_shell_document",
            )
        ]
    )
    assert marked == 1

    filtered = repository.fetch_window(
        source_revision="2026-03-21",
        archive_name="BioCXML.2.tar.gz",
        start_document_ordinal=1001,
        limit=2,
    )
    assert [entry.document_id for entry in filtered.entries] == ["3084310"]

    repository.upsert_entries(
        [
            RagBioCArchiveManifestEntry(
                source_revision="2026-03-21",
                archive_name="BioCXML.2.tar.gz",
                document_ordinal=1002,
                member_name="output/BioCXML/revisit.BioC.XML",
                document_id="updated-id",
            )
        ]
    )
    filtered_again = repository.fetch_window(
        source_revision="2026-03-21",
        archive_name="BioCXML.2.tar.gz",
        start_document_ordinal=1001,
        limit=2,
    )
    assert [entry.document_id for entry in filtered_again.entries] == ["3084310"]
