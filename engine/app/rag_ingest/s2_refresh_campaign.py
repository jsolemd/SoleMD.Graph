"""Sequential bounded source-driven S2 refresh campaign runner."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.orchestrator import RagRefreshReport, run_rag_refresh


class RefreshRunner(Protocol):
    def __call__(self, **kwargs) -> RagRefreshReport: ...


class RagS2RefreshCampaignRunSummary(ParseContractModel):
    run_index: int
    run_id: str
    requested_limit: int | None = None
    selected_target_count: int = 0
    skipped_existing_papers: int = 0
    ingested_papers: int = 0
    written_rows: int = 0
    write_batches_executed: int = 0
    max_batch_total_rows: int = 0
    max_batch_estimated_bytes: int = 0
    chunk_rows: int = 0
    chunk_member_rows: int = 0
    quality_flagged_papers: int = 0


class RagS2RefreshCampaignReport(ParseContractModel):
    run_id: str
    parser_version: str
    run_count: int
    limit_per_run: int | None = None
    batch_size: int = 100
    max_s2_shards: int | None = None
    stage_row_budget: int | None = None
    stage_byte_budget: int | None = None
    run_reports: list[RagS2RefreshCampaignRunSummary] = Field(default_factory=list)
    total_selected_targets: int = 0
    total_skipped_existing_papers: int = 0
    total_ingested_papers: int = 0
    total_written_rows: int = 0
    total_write_batches_executed: int = 0
    total_chunk_rows: int = 0
    total_chunk_member_rows: int = 0
    total_quality_flagged_papers: int = 0


def run_s2_refresh_campaign(
    *,
    run_id: str,
    parser_version: str,
    run_count: int = 1,
    limit_per_run: int | None = None,
    batch_size: int = 100,
    stage_row_budget: int | None = None,
    stage_byte_budget: int | None = None,
    max_s2_shards: int | None = None,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    inspect_quality: bool = False,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    refresh_runner: RefreshRunner | None = None,
) -> RagS2RefreshCampaignReport:
    if run_count <= 0:
        raise ValueError("run_count must be positive")

    active_refresh_runner = refresh_runner or run_rag_refresh
    run_reports: list[RagS2RefreshCampaignRunSummary] = []
    for run_index in range(run_count):
        child_run_id = f"{run_id}-r{run_index + 1:02d}"
        refresh_report = active_refresh_runner(
            parser_version=parser_version,
            run_id=child_run_id,
            limit=limit_per_run,
            batch_size=batch_size,
            stage_row_budget=stage_row_budget,
            stage_byte_budget=stage_byte_budget,
            max_s2_shards=max_s2_shards,
            skip_bioc_fallback=True,
            seed_chunk_version=seed_chunk_version,
            backfill_chunks=backfill_chunks,
            chunk_backfill_batch_size=chunk_backfill_batch_size,
            embedding_model=embedding_model,
            inspect_quality=inspect_quality,
            checkpoint_root=checkpoint_root,
            reset_run=reset_run,
        )
        chunk_backfill = dict(refresh_report.chunk_backfill or {})
        quality_report = dict(refresh_report.quality_report or {})
        run_reports.append(
            RagS2RefreshCampaignRunSummary(
                run_index=run_index + 1,
                run_id=child_run_id,
                requested_limit=refresh_report.requested_limit,
                selected_target_count=refresh_report.selected_target_count,
                skipped_existing_papers=refresh_report.s2_stage.skipped_existing_papers,
                ingested_papers=refresh_report.s2_stage.ingested_papers,
                written_rows=refresh_report.s2_stage.written_rows,
                write_batches_executed=refresh_report.s2_stage.write_batches_executed,
                max_batch_total_rows=refresh_report.s2_stage.max_batch_total_rows,
                max_batch_estimated_bytes=refresh_report.s2_stage.max_batch_estimated_bytes,
                chunk_rows=int(chunk_backfill.get("total_chunk_rows", 0) or 0),
                chunk_member_rows=int(chunk_backfill.get("total_chunk_member_rows", 0) or 0),
                quality_flagged_papers=len(quality_report.get("flagged_corpus_ids", [])),
            )
        )

    return RagS2RefreshCampaignReport(
        run_id=run_id,
        parser_version=parser_version,
        run_count=run_count,
        limit_per_run=limit_per_run,
        batch_size=batch_size,
        max_s2_shards=max_s2_shards,
        stage_row_budget=stage_row_budget,
        stage_byte_budget=stage_byte_budget,
        run_reports=run_reports,
        total_selected_targets=sum(summary.selected_target_count for summary in run_reports),
        total_skipped_existing_papers=sum(summary.skipped_existing_papers for summary in run_reports),
        total_ingested_papers=sum(summary.ingested_papers for summary in run_reports),
        total_written_rows=sum(summary.written_rows for summary in run_reports),
        total_write_batches_executed=sum(summary.write_batches_executed for summary in run_reports),
        total_chunk_rows=sum(summary.chunk_rows for summary in run_reports),
        total_chunk_member_rows=sum(summary.chunk_member_rows for summary in run_reports),
        total_quality_flagged_papers=sum(summary.quality_flagged_papers for summary in run_reports),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run multiple bounded source-driven S2 refreshes sequentially."
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--run-count", type=int, default=1)
    parser.add_argument("--limit-per-run", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--stage-row-budget", type=int, default=None)
    parser.add_argument("--stage-byte-budget", type=int, default=None)
    parser.add_argument("--max-s2-shards", type=int, default=None)
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--inspect-quality", action="store_true")
    parser.add_argument("--checkpoint-root", type=Path, default=None)
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = run_s2_refresh_campaign(
            run_id=args.run_id,
            parser_version=args.parser_version,
            run_count=args.run_count,
            limit_per_run=args.limit_per_run,
            batch_size=args.batch_size,
            stage_row_budget=args.stage_row_budget,
            stage_byte_budget=args.stage_byte_budget,
            max_s2_shards=args.max_s2_shards,
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
            inspect_quality=args.inspect_quality,
            checkpoint_root=args.checkpoint_root,
            reset_run=args.reset_run,
        )
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report.model_dump_json(indent=2))
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
