from __future__ import annotations

from app.rag_ingest.orchestrator import RagRefreshReport, RagSourceStageReport
from app.rag_ingest.s2_refresh_campaign import run_s2_refresh_campaign


def test_s2_refresh_campaign_aggregates_run_metrics():
    def _refresh_runner(**kwargs):
        run_number = int(str(kwargs["run_id"]).split("-r")[-1])
        assert kwargs["skip_bioc_fallback"] is True
        return RagRefreshReport(
            run_id=kwargs["run_id"],
            parser_version=kwargs["parser_version"],
            source_driven=True,
            requested_limit=kwargs["limit"],
            selected_target_count=run_number,
            s2_stage=RagSourceStageReport(
                stage_name="s2_primary",
                skipped_existing_papers=10 * run_number,
                ingested_papers=run_number + 1,
                written_rows=100 * run_number,
                write_batches_executed=run_number,
                max_batch_total_rows=20 * run_number,
                max_batch_estimated_bytes=200 * run_number,
            ),
            bioc_fallback_stage=RagSourceStageReport(stage_name="bioc_fallback_primary"),
            chunk_backfill={
                "total_chunk_rows": 5 * run_number,
                "total_chunk_member_rows": 7 * run_number,
            },
            quality_report={
                "flagged_corpus_ids": [999] if run_number == 2 else [],
            },
        )

    report = run_s2_refresh_campaign(
        run_id="s2-campaign-test",
        parser_version="parser-v1",
        run_count=2,
        limit_per_run=4,
        refresh_runner=_refresh_runner,
    )

    assert [run.run_index for run in report.run_reports] == [1, 2]
    assert [run.run_id for run in report.run_reports] == [
        "s2-campaign-test-r01",
        "s2-campaign-test-r02",
    ]
    assert report.total_selected_targets == 3
    assert report.total_skipped_existing_papers == 30
    assert report.total_ingested_papers == 5
    assert report.total_written_rows == 300
    assert report.total_write_batches_executed == 3
    assert report.total_chunk_rows == 15
    assert report.total_chunk_member_rows == 21
    assert report.total_quality_flagged_papers == 1
