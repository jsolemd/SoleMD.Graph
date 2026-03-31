"""Sequential bounded BioC archive-window campaign runner."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag_ingest.bioc_archive_window import RagBioCArchiveWindowReport, run_bioc_archive_window
from app.rag.parse_contract import ParseContractModel


class ArchiveWindowRunner(Protocol):
    def __call__(self, **kwargs) -> RagBioCArchiveWindowReport: ...


class RagBioCArchiveCampaignWindowSummary(ParseContractModel):
    window_index: int
    start_document_ordinal: int
    run_id: str
    discovery_report_path: str
    scanned_documents: int = 0
    selected_candidates: int = 0
    prewarm_cache_hits: int = 0
    prewarm_archive_reads: int = 0
    ingest_cache_hits: int = 0
    ingest_archive_reads: int = 0
    ingested_papers: int = 0
    skipped_low_value_papers: int = 0
    written_rows: int = 0
    chunk_rows: int = 0
    chunk_member_rows: int = 0
    quality_flagged_papers: int = 0


class RagBioCArchiveCampaignReport(ParseContractModel):
    run_id: str
    parser_version: str
    archive_name: str
    start_document_ordinal: int
    window_count: int
    max_documents_per_window: int
    limit_per_window: int | None = None
    window_reports: list[RagBioCArchiveCampaignWindowSummary] = Field(default_factory=list)
    total_scanned_documents: int = 0
    total_selected_candidates: int = 0
    total_prewarm_cache_hits: int = 0
    total_prewarm_archive_reads: int = 0
    total_ingest_cache_hits: int = 0
    total_ingest_archive_reads: int = 0
    total_ingested_papers: int = 0
    total_skipped_low_value_papers: int = 0
    total_written_rows: int = 0
    total_chunk_rows: int = 0
    total_chunk_member_rows: int = 0
    total_quality_flagged_papers: int = 0


def _default_report_root(*, run_id: str, checkpoint_root: Path | None) -> Path:
    root = checkpoint_root or (Path.cwd() / ".tmp" / "bioc_archive_campaign")
    return root / run_id


def run_bioc_archive_campaign(
    *,
    run_id: str,
    parser_version: str,
    archive_name: str,
    start_document_ordinal: int = 1,
    window_count: int = 1,
    max_documents_per_window: int = 200,
    limit_per_window: int | None = None,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    inspect_quality: bool = False,
    prewarm_member_cache: bool = True,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    archive_window_runner: ArchiveWindowRunner | None = None,
) -> RagBioCArchiveCampaignReport:
    if window_count <= 0:
        raise ValueError("window_count must be positive")
    if max_documents_per_window <= 0:
        raise ValueError("max_documents_per_window must be positive")

    active_archive_window_runner = archive_window_runner or run_bioc_archive_window
    report_root = _default_report_root(run_id=run_id, checkpoint_root=checkpoint_root)
    report_root.mkdir(parents=True, exist_ok=True)

    window_summaries: list[RagBioCArchiveCampaignWindowSummary] = []
    for window_index in range(window_count):
        window_start_document_ordinal = start_document_ordinal + (
            window_index * max_documents_per_window
        )
        window_run_id = f"{run_id}-w{window_index + 1:02d}"
        window_report = active_archive_window_runner(
            run_id=window_run_id,
            parser_version=parser_version,
            archive_name=archive_name,
            start_document_ordinal=window_start_document_ordinal,
            limit=limit_per_window,
            max_documents=max_documents_per_window,
            seed_chunk_version=seed_chunk_version,
            backfill_chunks=backfill_chunks,
            chunk_backfill_batch_size=chunk_backfill_batch_size,
            embedding_model=embedding_model,
            inspect_quality=inspect_quality,
            prewarm_member_cache=prewarm_member_cache,
            checkpoint_root=report_root,
            reset_run=reset_run,
        )
        prewarm = window_report.member_prewarm or {}
        archive_ingest = window_report.archive_ingest
        warehouse_refresh = dict(archive_ingest.get("warehouse_refresh", {}))
        bioc_stage = dict(warehouse_refresh.get("bioc_fallback_stage", {}))
        chunk_backfill = dict(warehouse_refresh.get("chunk_backfill", {}))
        quality_report = dict(archive_ingest.get("quality_report") or {})
        window_summaries.append(
            RagBioCArchiveCampaignWindowSummary(
                window_index=window_index + 1,
                start_document_ordinal=window_start_document_ordinal,
                run_id=window_run_id,
                discovery_report_path=str(window_report.discovery_report_path),
                scanned_documents=int(window_report.discovery_report.get("scanned_documents", 0) or 0),
                selected_candidates=len(window_report.discovery_report.get("selected_corpus_ids", [])),
                prewarm_cache_hits=int(prewarm.get("member_fetch", {}).get("cache_hits", 0) or 0),
                prewarm_archive_reads=int(
                    prewarm.get("member_fetch", {}).get("archive_reads", 0) or 0
                ),
                ingest_cache_hits=int(
                    warehouse_refresh.get("member_fetch", {}).get("cache_hits", 0) or 0
                ),
                ingest_archive_reads=int(
                    warehouse_refresh.get("member_fetch", {}).get("archive_reads", 0) or 0
                ),
                ingested_papers=len(bioc_stage.get("ingested_corpus_ids", [])),
                skipped_low_value_papers=int(
                    bioc_stage.get("skipped_low_value_papers", 0) or 0
                ),
                written_rows=int(bioc_stage.get("written_rows", 0) or 0),
                chunk_rows=int(chunk_backfill.get("total_chunk_rows", 0) or 0),
                chunk_member_rows=int(chunk_backfill.get("total_chunk_member_rows", 0) or 0),
                quality_flagged_papers=len(quality_report.get("flagged_corpus_ids", [])),
            )
        )

    return RagBioCArchiveCampaignReport(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        start_document_ordinal=start_document_ordinal,
        window_count=window_count,
        max_documents_per_window=max_documents_per_window,
        limit_per_window=limit_per_window,
        window_reports=window_summaries,
        total_scanned_documents=sum(summary.scanned_documents for summary in window_summaries),
        total_selected_candidates=sum(summary.selected_candidates for summary in window_summaries),
        total_prewarm_cache_hits=sum(summary.prewarm_cache_hits for summary in window_summaries),
        total_prewarm_archive_reads=sum(summary.prewarm_archive_reads for summary in window_summaries),
        total_ingest_cache_hits=sum(summary.ingest_cache_hits for summary in window_summaries),
        total_ingest_archive_reads=sum(summary.ingest_archive_reads for summary in window_summaries),
        total_ingested_papers=sum(summary.ingested_papers for summary in window_summaries),
        total_skipped_low_value_papers=sum(
            summary.skipped_low_value_papers for summary in window_summaries
        ),
        total_written_rows=sum(summary.written_rows for summary in window_summaries),
        total_chunk_rows=sum(summary.chunk_rows for summary in window_summaries),
        total_chunk_member_rows=sum(summary.chunk_member_rows for summary in window_summaries),
        total_quality_flagged_papers=sum(
            summary.quality_flagged_papers for summary in window_summaries
        ),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run multiple bounded BioC archive windows sequentially with aggregate quality/efficiency reporting."
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--start-document-ordinal", type=int, default=1)
    parser.add_argument("--window-count", type=int, default=1)
    parser.add_argument("--max-documents-per-window", type=int, default=200)
    parser.add_argument("--limit-per-window", type=int, default=None)
    parser.add_argument("--seed-chunk-version", action="store_true")
    parser.add_argument("--backfill-chunks", action="store_true")
    parser.add_argument("--chunk-backfill-batch-size", type=int, default=250)
    parser.add_argument("--embedding-model", default=None)
    parser.add_argument("--inspect-quality", action="store_true")
    parser.add_argument("--disable-prewarm-member-cache", action="store_true")
    parser.add_argument("--checkpoint-root", type=Path, default=None)
    parser.add_argument("--reset-run", action="store_true")
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    try:
        report = run_bioc_archive_campaign(
            run_id=args.run_id,
            parser_version=args.parser_version,
            archive_name=args.archive_name,
            start_document_ordinal=args.start_document_ordinal,
            window_count=args.window_count,
            max_documents_per_window=args.max_documents_per_window,
            limit_per_window=args.limit_per_window,
            seed_chunk_version=args.seed_chunk_version,
            backfill_chunks=args.backfill_chunks,
            chunk_backfill_batch_size=args.chunk_backfill_batch_size,
            embedding_model=args.embedding_model,
            inspect_quality=args.inspect_quality,
            prewarm_member_cache=not args.disable_prewarm_member_cache,
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
