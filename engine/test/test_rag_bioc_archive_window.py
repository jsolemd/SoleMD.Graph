from __future__ import annotations

from pathlib import Path

from app.rag_ingest.bioc_archive_window import run_bioc_archive_window
from app.rag_ingest.bioc_target_discovery import RagBioCTargetCandidate, RagBioCTargetDiscoveryReport


def test_bioc_archive_window_runs_discovery_prewarm_and_ingest(tmp_path: Path):
    def _discoverer(**kwargs):
        assert kwargs["archive_name"] == "BioCXML.7.tar.gz"
        return RagBioCTargetDiscoveryReport(
            archive_name="BioCXML.7.tar.gz",
            start_document_ordinal=kwargs["start_document_ordinal"],
            limit=kwargs["limit"],
            max_documents=kwargs["max_documents"],
            candidates=[
                RagBioCTargetCandidate(
                    corpus_id=101,
                    document_id="doc-101",
                    archive_name="BioCXML.7.tar.gz",
                    document_ordinal=1001,
                    member_name="output/BioCXML/101.BioC.XML",
                )
            ],
            selected_corpus_ids=[101],
        )

    captured_prewarm = {}

    def _prewarm(**kwargs):
        captured_prewarm.update(kwargs)

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "archive_name": kwargs["archive_name"],
                    "selected_corpus_ids": [101],
                    "member_fetch": {"cache_hits": 0, "archive_reads": 1},
                }

        return _Result()

    captured_ingest = {}

    def _ingest(**kwargs):
        captured_ingest.update(kwargs)

        class _Result:
            def model_dump(self, mode="python"):
                return {
                    "run_id": kwargs["run_id"],
                    "archive_name": kwargs["archive_name"],
                    "warehouse_refresh": {
                        "mode": "direct_archive_member_ingest",
                        "member_fetch": {"cache_hits": 1, "archive_reads": 0},
                    },
                }

        return _Result()

    report = run_bioc_archive_window(
        run_id="bioc-window-test",
        parser_version="parser-v2",
        archive_name="BioCXML.7.tar.gz",
        start_document_ordinal=1001,
        limit=5,
        max_documents=200,
        seed_chunk_version=True,
        backfill_chunks=True,
        inspect_quality=True,
        checkpoint_root=tmp_path,
        archive_target_discoverer=_discoverer,
        member_prewarm_runner=_prewarm,
        archive_ingest_runner=_ingest,
    )

    expected_report_path = tmp_path / "bioc-window-test.discovery.json"
    assert expected_report_path.exists()
    assert captured_prewarm["discovery_report_path"] == expected_report_path
    assert captured_ingest["discovery_report_path"] == expected_report_path
    assert captured_ingest["seed_chunk_version"] is True
    assert captured_ingest["backfill_chunks"] is True
    assert captured_ingest["inspect_quality"] is True
    assert report.member_prewarm == {
        "archive_name": "BioCXML.7.tar.gz",
        "selected_corpus_ids": [101],
        "member_fetch": {"cache_hits": 0, "archive_reads": 1},
    }
    assert report.archive_ingest == {
        "run_id": "bioc-window-test",
        "archive_name": "BioCXML.7.tar.gz",
        "warehouse_refresh": {
            "mode": "direct_archive_member_ingest",
            "member_fetch": {"cache_hits": 1, "archive_reads": 0},
        },
    }


def test_bioc_archive_window_can_skip_prewarm(tmp_path: Path):
    def _discoverer(**kwargs):
        return RagBioCTargetDiscoveryReport(
            archive_name="BioCXML.8.tar.gz",
            candidates=[],
            selected_corpus_ids=[],
        )

    def _ingest(**kwargs):
        class _Result:
            def model_dump(self, mode="python"):
                return {"run_id": kwargs["run_id"], "warehouse_refresh": {"skipped_reason": "no_discovered_candidates"}}

        return _Result()

    report = run_bioc_archive_window(
        run_id="bioc-window-no-prewarm",
        parser_version="parser-v2",
        archive_name="BioCXML.8.tar.gz",
        checkpoint_root=tmp_path,
        prewarm_member_cache=False,
        archive_target_discoverer=_discoverer,
        archive_ingest_runner=_ingest,
    )

    assert report.member_prewarm is None
    assert report.archive_ingest["warehouse_refresh"]["skipped_reason"] == "no_discovered_candidates"
