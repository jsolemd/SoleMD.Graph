"""Freeze archive-scoped BioC discovery reports from a benchmark warehouse audit.

This bypasses archive discovery for known sparse benchmark targets by turning the
audit's sparse corpus ids into exact `RagBioCTargetDiscoveryReport` payloads
with manifest-backed `member_name` / `document_ordinal` metadata.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from app.rag_ingest.benchmark_warehouse_audit import BenchmarkWarehouseAuditReport
from app.rag_ingest.bioc_overlay_backfill import _resolve_candidates_from_manifest
from app.rag_ingest.bioc_target_discovery import (
    RagBioCTargetCandidate,
    RagBioCTargetDiscoveryReport,
)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Materialize frozen archive-scoped BioC discovery reports from a "
            "benchmark warehouse audit JSON."
        )
    )
    parser.add_argument("--audit-path", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--archive-name", default=None)
    parser.add_argument("--index-path", type=Path, default=None)
    return parser.parse_args(argv)


def _build_discovery_report(
    *,
    archive_name: str,
    candidates: list[RagBioCTargetCandidate],
) -> RagBioCTargetDiscoveryReport:
    ordered = sorted(candidates, key=lambda candidate: (candidate.document_ordinal, candidate.corpus_id))
    start_document_ordinal = min(candidate.document_ordinal for candidate in ordered)
    last_document_ordinal = max(candidate.document_ordinal for candidate in ordered)
    selected_corpus_ids = sorted({int(candidate.corpus_id) for candidate in ordered})
    return RagBioCTargetDiscoveryReport(
        archive_name=archive_name,
        start_document_ordinal=int(start_document_ordinal),
        resolver_batch_size=max(1, len(ordered)),
        limit=len(ordered),
        max_documents=len(ordered),
        scanned_documents=len(ordered),
        last_document_ordinal_scanned=int(last_document_ordinal),
        manifest_entries_used=len(ordered),
        manifest_entries_written=0,
        resolved_corpus_ids=selected_corpus_ids,
        selected_corpus_ids=selected_corpus_ids,
        candidates=ordered,
    )


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    audit = BenchmarkWarehouseAuditReport.model_validate_json(args.audit_path.read_text())
    sparse_ids = [int(case.corpus_id) for case in audit.sparse_cases]
    manifest_candidates = _resolve_candidates_from_manifest(corpus_ids=sparse_ids)

    by_archive: dict[str, list[RagBioCTargetCandidate]] = defaultdict(list)
    for case in audit.sparse_cases:
        candidate = manifest_candidates.get(int(case.corpus_id))
        if candidate is None or not candidate.archive_name:
            continue
        if args.archive_name is not None and candidate.archive_name != args.archive_name:
            continue
        by_archive[candidate.archive_name].append(candidate)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    index_rows: list[dict[str, object]] = []
    for archive_name, candidates in sorted(by_archive.items()):
        report = _build_discovery_report(
            archive_name=archive_name,
            candidates=candidates,
        )
        output_path = args.output_dir / f"{archive_name}.discovery.json"
        output_path.write_text(report.model_dump_json(indent=2))
        corpus_ids_path = args.output_dir / f"{archive_name}.corpus_ids.txt"
        corpus_ids_path.write_text("".join(f"{corpus_id}\n" for corpus_id in report.selected_corpus_ids))
        index_rows.append(
            {
                "archive_name": archive_name,
                "case_count": len(report.candidates),
                "start_document_ordinal": report.start_document_ordinal,
                "last_document_ordinal_scanned": report.last_document_ordinal_scanned,
                "output_path": str(output_path),
                "corpus_ids_path": str(corpus_ids_path),
                "corpus_ids": report.selected_corpus_ids,
            }
        )

    if args.index_path is not None:
        args.index_path.parent.mkdir(parents=True, exist_ok=True)
        args.index_path.write_text(json.dumps(index_rows, indent=2))

    print(json.dumps(index_rows, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
