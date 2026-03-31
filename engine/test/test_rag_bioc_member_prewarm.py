from __future__ import annotations

from pathlib import Path

from app.rag_ingest.bioc_member_prewarm import run_bioc_archive_member_prewarm
from app.rag_ingest.bioc_target_discovery import RagBioCTargetCandidate, RagBioCTargetDiscoveryReport


class _FakeExistingLoader:
    def __init__(self, existing_ids):
        self._existing_ids = {int(value) for value in existing_ids}

    def load_existing(self, *, corpus_ids):
        return {int(value) for value in corpus_ids if int(value) in self._existing_ids}


class _FakeManifestRepository:
    def __init__(self, skipped_document_ids, archive_name="BioCXML.4.tar.gz"):
        self._skipped_document_ids = {str(value) for value in skipped_document_ids}
        self._archive_name = archive_name

    def fetch_skipped_document_ids(self, *, source_revision, archive_name, document_ids):
        assert source_revision == "2026-03-21"
        assert archive_name == self._archive_name
        return {document_id for document_id in document_ids if document_id in self._skipped_document_ids}


class _FakeMemberResult:
    def __init__(self, document_id, member_name):
        self.document_id = document_id
        self.member_name = member_name


class _FakeFetchReport:
    def model_dump(self, mode="python"):
        return {
            "archive_name": "BioCXML.4.tar.gz",
            "requested_members": 1,
            "fetched_members": 1,
            "cache_hits": 1,
            "archive_reads": 0,
            "missing_document_ids": [],
        }


def test_bioc_member_prewarm_enriches_report_and_filters_existing_and_skipped(monkeypatch, tmp_path: Path):
    discovery_report_path = tmp_path / "discovery.json"
    discovery_report = RagBioCTargetDiscoveryReport(
        archive_name="BioCXML.4.tar.gz",
        candidates=[
            RagBioCTargetCandidate(
                corpus_id=101,
                document_id="doc-101",
                archive_name="BioCXML.4.tar.gz",
                document_ordinal=4,
            ),
            RagBioCTargetCandidate(
                corpus_id=202,
                document_id="doc-202",
                archive_name="BioCXML.4.tar.gz",
                document_ordinal=9,
            ),
            RagBioCTargetCandidate(
                corpus_id=303,
                document_id="doc-303",
                archive_name="BioCXML.4.tar.gz",
                document_ordinal=15,
            ),
        ],
        selected_corpus_ids=[101, 202, 303],
    )
    discovery_report_path.write_text(discovery_report.model_dump_json(indent=2))

    class _FakeSettings:
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_member_prewarm.settings", _FakeSettings())

    captured_requests = []

    def _fetcher(**kwargs):
        captured_requests.extend(kwargs["requests"])
        return [
            _FakeMemberResult("doc-303", "output/BioCXML/303.BioC.XML"),
        ], _FakeFetchReport()

    report = run_bioc_archive_member_prewarm(
        archive_name="BioCXML.4.tar.gz",
        discovery_report_path=discovery_report_path,
        existing_loader=_FakeExistingLoader({202}),
        manifest_repository=_FakeManifestRepository({"doc-101"}),
        archive_member_fetcher=_fetcher,
    )

    assert report.candidate_corpus_ids == [101, 202, 303]
    assert report.selected_corpus_ids == [303]
    assert report.skipped_existing_papers == 1
    assert report.skipped_manifest_document_ids == ["doc-101"]
    assert report.report_enriched is True
    assert [request.document_id for request in captured_requests] == ["doc-303"]

    reloaded = RagBioCTargetDiscoveryReport.model_validate_json(discovery_report_path.read_text())
    assert reloaded.candidates[2].member_name == "output/BioCXML/303.BioC.XML"


def test_bioc_member_prewarm_discovers_when_no_report_path(monkeypatch):
    class _FakeSettings:
        pubtator_release_id = "2026-03-21"

    monkeypatch.setattr("app.rag_ingest.bioc_member_prewarm.settings", _FakeSettings())

    def _discoverer(**kwargs):
        assert kwargs["archive_name"] == "BioCXML.2.tar.gz"
        assert kwargs["start_document_ordinal"] == 1001
        assert kwargs["allowed_corpus_ids"] == [111, 222]
        return RagBioCTargetDiscoveryReport(
            archive_name="BioCXML.2.tar.gz",
            candidates=[
                RagBioCTargetCandidate(
                    corpus_id=111,
                    document_id="doc-111",
                    archive_name="BioCXML.2.tar.gz",
                    document_ordinal=1001,
                    member_name="output/BioCXML/111.BioC.XML",
                ),
            ],
            selected_corpus_ids=[111],
        )

    def _fetcher(**kwargs):
        return [], _FakeFetchReport()

    report = run_bioc_archive_member_prewarm(
        archive_name="BioCXML.2.tar.gz",
        start_document_ordinal=1001,
        corpus_ids=[111, 222],
        archive_target_discoverer=_discoverer,
        existing_loader=_FakeExistingLoader(set()),
        manifest_repository=_FakeManifestRepository(set(), archive_name="BioCXML.2.tar.gz"),
        archive_member_fetcher=_fetcher,
    )

    assert report.requested_corpus_ids == [111, 222]
    assert report.candidate_corpus_ids == [111]
    assert report.selected_corpus_ids == [111]
    assert report.report_enriched is False
