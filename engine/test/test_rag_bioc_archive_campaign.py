from __future__ import annotations

from pathlib import Path

from app.rag_ingest.bioc_archive_campaign import run_bioc_archive_campaign
from app.rag_ingest.bioc_archive_window import RagBioCArchiveWindowReport


def test_bioc_archive_campaign_aggregates_window_metrics(tmp_path: Path):
    def _window_runner(**kwargs):
        window_number = int(str(kwargs["run_id"]).split("-w")[-1])
        discovery_report_path = tmp_path / f"{kwargs['run_id']}.discovery.json"
        discovery_report_path.write_text("{}")
        return RagBioCArchiveWindowReport(
            run_id=kwargs["run_id"],
            parser_version=kwargs["parser_version"],
            archive_name=kwargs["archive_name"],
            discovery_report_path=str(discovery_report_path),
            discovery_report={
                "scanned_documents": 50 * window_number,
                "selected_corpus_ids": list(range(window_number)),
            },
            member_prewarm={
                "member_fetch": {
                    "cache_hits": window_number - 1,
                    "archive_reads": window_number,
                }
            },
            archive_ingest={
                "warehouse_refresh": {
                    "member_fetch": {
                        "cache_hits": window_number,
                        "archive_reads": 0,
                    },
                    "bioc_fallback_stage": {
                        "ingested_corpus_ids": list(range(window_number + 1)),
                        "skipped_low_value_papers": 1,
                        "written_rows": 100 * window_number,
                    },
                    "chunk_backfill": {
                        "total_chunk_rows": 10 * window_number,
                        "total_chunk_member_rows": 20 * window_number,
                    },
                },
                "quality_report": {
                    "flagged_corpus_ids": [999] if window_number == 2 else [],
                },
            },
        )

    report = run_bioc_archive_campaign(
        run_id="bioc-campaign-test",
        parser_version="parser-v2",
        archive_name="BioCXML.9.tar.gz",
        start_document_ordinal=1001,
        window_count=2,
        max_documents_per_window=120,
        limit_per_window=3,
        checkpoint_root=tmp_path,
        archive_window_runner=_window_runner,
    )

    assert [window.window_index for window in report.window_reports] == [1, 2]
    assert [window.start_document_ordinal for window in report.window_reports] == [1001, 1121]
    assert report.total_scanned_documents == 150
    assert report.total_selected_candidates == 3
    assert report.total_prewarm_cache_hits == 1
    assert report.total_prewarm_archive_reads == 3
    assert report.total_ingest_cache_hits == 3
    assert report.total_ingest_archive_reads == 0
    assert report.total_ingested_papers == 5
    assert report.total_skipped_low_value_papers == 2
    assert report.total_written_rows == 300
    assert report.total_chunk_rows == 30
    assert report.total_chunk_member_rows == 60
    assert report.total_quality_flagged_papers == 1
