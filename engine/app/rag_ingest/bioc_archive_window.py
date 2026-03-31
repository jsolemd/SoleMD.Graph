"""Bounded BioC archive-window runner for discovery, prewarm, and direct ingest."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag_ingest.bioc_archive_ingest import run_bioc_archive_ingest
from app.rag_ingest.bioc_member_prewarm import run_bioc_archive_member_prewarm
from app.rag_ingest.bioc_target_discovery import discover_bioc_archive_targets
from app.rag.parse_contract import ParseContractModel


class RagBioCArchiveWindowReport(ParseContractModel):
    run_id: str
    parser_version: str
    archive_name: str
    discovery_report_path: str
    discovery_report: dict[str, object]
    member_prewarm: dict[str, object] | None = None
    archive_ingest: dict[str, object]


class ArchiveTargetDiscoverer(Protocol):
    def __call__(self, **kwargs): ...


class MemberPrewarmRunner(Protocol):
    def __call__(self, **kwargs): ...


class ArchiveIngestRunner(Protocol):
    def __call__(self, **kwargs): ...


def _default_discovery_report_path(*, run_id: str, checkpoint_root: Path | None) -> Path:
    root = checkpoint_root or (Path.cwd() / ".tmp" / "bioc_archive_window")
    return root / f"{run_id}.discovery.json"


def run_bioc_archive_window(
    *,
    run_id: str,
    parser_version: str,
    archive_name: str,
    discovery_report_path: Path | None = None,
    start_document_ordinal: int = 1,
    limit: int | None = None,
    max_documents: int | None = None,
    seed_chunk_version: bool = False,
    backfill_chunks: bool = False,
    chunk_backfill_batch_size: int = 250,
    embedding_model: str | None = None,
    inspect_quality: bool = False,
    prewarm_member_cache: bool = True,
    checkpoint_root: Path | None = None,
    reset_run: bool = False,
    archive_target_discoverer: ArchiveTargetDiscoverer | None = None,
    member_prewarm_runner: MemberPrewarmRunner | None = None,
    archive_ingest_runner: ArchiveIngestRunner | None = None,
) -> RagBioCArchiveWindowReport:
    active_archive_target_discoverer = archive_target_discoverer or discover_bioc_archive_targets
    active_member_prewarm_runner = member_prewarm_runner or run_bioc_archive_member_prewarm
    active_archive_ingest_runner = archive_ingest_runner or run_bioc_archive_ingest
    effective_report_path = discovery_report_path or _default_discovery_report_path(
        run_id=run_id,
        checkpoint_root=checkpoint_root,
    )
    effective_report_path.parent.mkdir(parents=True, exist_ok=True)

    discovery_report = active_archive_target_discoverer(
        archive_name=archive_name,
        start_document_ordinal=start_document_ordinal,
        limit=limit,
        max_documents=max_documents,
        skip_existing_documents=True,
        skip_existing_bioc=True,
    )
    effective_report_path.write_text(discovery_report.model_dump_json(indent=2))

    member_prewarm_dump: dict[str, object] | None = None
    if prewarm_member_cache:
        member_prewarm_dump = active_member_prewarm_runner(
            archive_name=archive_name,
            discovery_report_path=effective_report_path,
            limit=limit,
        ).model_dump(mode="python")

    ingest_report = active_archive_ingest_runner(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        discovery_report_path=effective_report_path,
        limit=limit,
        seed_chunk_version=seed_chunk_version,
        backfill_chunks=backfill_chunks,
        chunk_backfill_batch_size=chunk_backfill_batch_size,
        embedding_model=embedding_model,
        inspect_quality=inspect_quality,
        checkpoint_root=checkpoint_root,
        reset_run=reset_run,
    )

    return RagBioCArchiveWindowReport(
        run_id=run_id,
        parser_version=parser_version,
        archive_name=archive_name,
        discovery_report_path=str(effective_report_path),
        discovery_report=discovery_report.model_dump(mode="python"),
        member_prewarm=member_prewarm_dump,
        archive_ingest=ingest_report.model_dump(mode="python"),
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run a bounded BioC archive window through discovery, optional prewarm, and direct ingest."
    )
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--parser-version", required=True)
    parser.add_argument("--archive-name", required=True)
    parser.add_argument("--discovery-report-path", type=Path, default=None)
    parser.add_argument("--start-document-ordinal", type=int, default=1)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-documents", type=int, default=None)
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
        report = run_bioc_archive_window(
            run_id=args.run_id,
            parser_version=args.parser_version,
            archive_name=args.archive_name,
            discovery_report_path=args.discovery_report_path,
            start_document_ordinal=args.start_document_ordinal,
            limit=args.limit,
            max_documents=args.max_documents,
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
