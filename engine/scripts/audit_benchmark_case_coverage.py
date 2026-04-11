"""Audit live warehouse coverage for a frozen benchmark snapshot."""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

_ENGINE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ENGINE_ROOT))

from app import db
from app.rag_ingest.benchmark_case_metadata import load_live_benchmark_case_coverage
from app.rag_ingest.runtime_eval_models import RagRuntimeEvalBenchmarkReport


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit whether benchmark cases are actually backed by live warehouse "
            "coverage: paper row, document row, chunks, entity mentions, and "
            "sentence seeds."
        )
    )
    parser.add_argument("benchmark_path", type=Path)
    parser.add_argument("--report-path", type=Path, default=None)
    parser.add_argument("--print-limit", type=int, default=20)
    return parser.parse_args(argv)


def _coverage_status(row: dict[str, object]) -> str:
    if row["warehouse_depth"] == "chunks_entities_sentence":
        return "covered"
    if row["primary_source_system"]:
        return "document_backed_partial"
    if row["title"]:
        return "paper_only"
    return "missing_paper"


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    report = RagRuntimeEvalBenchmarkReport.model_validate_json(
        args.benchmark_path.read_text()
    )
    coverage_by_corpus_id = load_live_benchmark_case_coverage(
        corpus_ids=[case.corpus_id for case in report.cases],
        chunk_version_key=report.chunk_version_key,
    )

    rows: list[dict[str, object]] = []
    label_counts: Counter[str] = Counter()
    covered_label_counts: Counter[str] = Counter()
    status_counts: Counter[str] = Counter()
    text_availability_counts: Counter[str] = Counter()
    source_system_counts: Counter[str] = Counter()
    warehouse_depth_counts: Counter[str] = Counter()

    for case in report.cases:
        coverage = coverage_by_corpus_id.get(case.corpus_id)
        row = {
            "corpus_id": case.corpus_id,
            "query": case.query,
            "title": coverage.title if coverage and coverage.title else case.title,
            "benchmark_labels": case.benchmark_labels,
            "primary_source_system": coverage.primary_source_system if coverage else None,
            "text_availability": coverage.text_availability if coverage else None,
            "has_abstract": coverage.has_abstract if coverage else False,
            "pmid": coverage.pmid if coverage else None,
            "pmc_id": coverage.pmc_id if coverage else None,
            "doi": coverage.doi if coverage else None,
            "has_chunks": coverage.has_chunks if coverage else False,
            "has_entities": coverage.has_entities if coverage else False,
            "has_sentence_seed": coverage.has_sentence_seed if coverage else False,
            "coverage_bucket": coverage.coverage_bucket if coverage else None,
            "warehouse_depth": coverage.warehouse_depth if coverage else None,
        }
        row["coverage_status"] = _coverage_status(row)
        rows.append(row)
        status_counts[str(row["coverage_status"])] += 1
        text_availability_counts[str(row["text_availability"])] += 1
        warehouse_depth_counts[str(row["warehouse_depth"])] += 1
        source_system_counts[str(row["primary_source_system"] or "none")] += 1
        label_counts.update(case.benchmark_labels)
        if row["coverage_status"] == "covered":
            covered_label_counts.update(case.benchmark_labels)

    audit_report = {
        "benchmark_key": report.benchmark_key,
        "benchmark_path": str(args.benchmark_path),
        "chunk_version_key": report.chunk_version_key,
        "case_count": len(rows),
        "status_counts": dict(sorted(status_counts.items())),
        "text_availability_counts": dict(sorted(text_availability_counts.items())),
        "source_system_counts": dict(sorted(source_system_counts.items())),
        "warehouse_depth_counts": dict(sorted(warehouse_depth_counts.items())),
        "benchmark_label_counts": dict(sorted(label_counts.items())),
        "covered_label_counts": dict(sorted(covered_label_counts.items())),
        "covered_cases": [row for row in rows if row["coverage_status"] == "covered"],
        "paper_only_cases": [row for row in rows if row["coverage_status"] == "paper_only"],
        "document_partial_cases": [
            row for row in rows if row["coverage_status"] == "document_backed_partial"
        ],
        "missing_paper_cases": [row for row in rows if row["coverage_status"] == "missing_paper"],
    }

    print(f"benchmark={report.benchmark_key} cases={len(rows)}")
    print(f"status_counts={dict(sorted(status_counts.items()))}")
    print(f"warehouse_depth_counts={dict(sorted(warehouse_depth_counts.items()))}")
    print(f"source_system_counts={dict(sorted(source_system_counts.items()))}")
    print("sample_noncovered:")
    noncovered = [
        row for row in rows if row["coverage_status"] != "covered"
    ][: max(0, args.print_limit)]
    for row in noncovered:
        print(
            f"  corpus_id={row['corpus_id']} status={row['coverage_status']} "
            f"source={row['primary_source_system'] or 'none'} "
            f"text={row['text_availability']} pmid={row['pmid']} "
            f"title={row['title']}"
        )

    if args.report_path is not None:
        args.report_path.parent.mkdir(parents=True, exist_ok=True)
        args.report_path.write_text(json.dumps(audit_report, indent=2, sort_keys=True))
    else:
        print(json.dumps(audit_report, indent=2, sort_keys=True))

    db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
