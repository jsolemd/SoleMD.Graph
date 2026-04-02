"""Frozen runtime benchmark builders and loaders."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Callable
from pathlib import Path

from app import db
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalPaperRecord,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
)
from app.rag_ingest.runtime_eval_population import fetch_runtime_eval_population


def _difficulty_bucket(max_rank: int) -> str:
    if max_rank >= 50:
        return "rank_50_plus"
    if max_rank >= 20:
        return "rank_20_49"
    if max_rank >= 10:
        return "rank_10_19"
    if max_rank >= 5:
        return "rank_5_9"
    return "rank_2_4"


def _normalize_failure_query(text: str) -> str:
    return " ".join(str(text).split()).strip()


def _select_failure_for_hard_benchmark(
    *,
    failure: dict[str, object],
    min_failure_count: int,
    min_max_rank: int,
    high_recurrence_count: int,
    deep_miss_rank: int,
) -> bool:
    failure_count = int(failure["failure_count"])
    max_rank = max(int(rank) for rank in failure["ranks"])
    if max_rank >= deep_miss_rank:
        return True
    if failure_count >= high_recurrence_count:
        return True
    return failure_count >= min_failure_count and max_rank >= min_max_rank


def _aggregate_dense_audit_sentence_failures(
    report_data: dict[str, object],
) -> dict[int, dict[str, object]]:
    aggregated: dict[int, dict[str, object]] = {}
    for report_key in ("lane_reports", "rerank_reports"):
        for lane_report in report_data.get(report_key, []):
            lane_key = str(lane_report.get("lane_key") or "")
            for failure in lane_report.get("failure_examples", []):
                if failure.get("query_family") != RuntimeEvalQueryFamily.SENTENCE_GLOBAL:
                    continue
                corpus_id = int(failure["corpus_id"])
                target_rank = int(failure["target_rank"])
                query = _normalize_failure_query(failure["query"])
                entry = aggregated.setdefault(
                    corpus_id,
                    {
                        "failure_count": 0,
                        "ranks": [],
                        "source_lane_keys": set(),
                        "query": query,
                        "worst_query": query,
                        "worst_rank": target_rank,
                    },
                )
                entry["failure_count"] += 1
                entry["ranks"].append(target_rank)
                entry["source_lane_keys"].add(lane_key)
                if target_rank >= entry["worst_rank"]:
                    entry["worst_rank"] = target_rank
                    entry["worst_query"] = query
    return aggregated


def _build_benchmark_case(
    *,
    benchmark_key: str,
    paper: RuntimeEvalPaperRecord,
    failure: dict[str, object],
    high_recurrence_count: int,
    deep_miss_rank: int,
) -> RuntimeEvalBenchmarkCase:
    max_rank = max(int(rank) for rank in failure["ranks"])
    failure_count = int(failure["failure_count"])
    difficulty = _difficulty_bucket(max_rank)
    labels = [
        "dense_audit_failure",
        "sentence_global",
        difficulty,
        f"failure_count_{failure_count}",
    ]
    if failure_count >= high_recurrence_count:
        labels.append("recurrent")
    if failure_count == 1 and max_rank >= deep_miss_rank:
        labels.append("singleton_deep_miss")
    if max_rank >= deep_miss_rank:
        labels.append("deep_miss")
    elif max_rank >= 10:
        labels.append("material_miss")
    else:
        labels.append("topk_miss")
    return RuntimeEvalBenchmarkCase(
        corpus_id=paper.corpus_id,
        title=paper.title,
        primary_source_system=paper.primary_source_system,
        query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        query=str(failure["worst_query"]),
        stratum_key=(
            f"benchmark:{benchmark_key}|difficulty:{difficulty}|"
            f"source:{paper.primary_source_system}"
        ),
        representative_section_role=paper.representative_section_role,
        benchmark_key=benchmark_key,
        benchmark_labels=labels,
        failure_count=failure_count,
        min_target_rank=min(int(rank) for rank in failure["ranks"]),
        max_target_rank=max_rank,
        mean_target_rank=round(
            sum(int(rank) for rank in failure["ranks"]) / len(failure["ranks"]),
            3,
        ),
        source_lane_keys=sorted(str(item) for item in failure["source_lane_keys"]),
    )


def build_dense_audit_sentence_hard_benchmark(
    *,
    dense_audit_report_path: Path,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "sentence_hard_v1",
    max_cases: int = 24,
    min_failure_count: int = 2,
    min_max_rank: int = 4,
    high_recurrence_count: int = 4,
    deep_miss_rank: int = 20,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    dense_audit_report_path = dense_audit_report_path.resolve()
    report_data = json.loads(dense_audit_report_path.read_text())
    aggregated_failures = _aggregate_dense_audit_sentence_failures(report_data)
    selected_failures = {
        corpus_id: failure
        for corpus_id, failure in aggregated_failures.items()
        if _select_failure_for_hard_benchmark(
            failure=failure,
            min_failure_count=min_failure_count,
            min_max_rank=min_max_rank,
            high_recurrence_count=high_recurrence_count,
            deep_miss_rank=deep_miss_rank,
        )
    }
    selected_corpus_ids = [
        corpus_id
        for corpus_id, _failure in sorted(
            selected_failures.items(),
            key=lambda item: (
                -int(item[1]["failure_count"]),
                -max(int(rank) for rank in item[1]["ranks"]),
                -(
                    sum(int(rank) for rank in item[1]["ranks"])
                    / len(item[1]["ranks"])
                ),
                item[0],
            ),
        )[:max_cases]
    ]

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        corpus_ids=selected_corpus_ids,
        connect=connect_fn,
    )
    papers_by_id = {paper.corpus_id: paper for paper in population}
    cases = [
        _build_benchmark_case(
            benchmark_key=benchmark_key,
            paper=papers_by_id[corpus_id],
            failure=selected_failures[corpus_id],
            high_recurrence_count=high_recurrence_count,
            deep_miss_rank=deep_miss_rank,
        )
        for corpus_id in selected_corpus_ids
        if corpus_id in papers_by_id
    ]
    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)

    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=str(dense_audit_report_path),
        max_cases=max_cases,
        min_failure_count=min_failure_count,
        min_max_rank=min_max_rank,
        high_recurrence_count=high_recurrence_count,
        deep_miss_rank=deep_miss_rank,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def load_runtime_eval_benchmark_cases(
    benchmark_path: Path,
) -> tuple[RagRuntimeEvalBenchmarkReport, list[RuntimeEvalQueryCase]]:
    benchmark_report = RagRuntimeEvalBenchmarkReport.model_validate_json(
        benchmark_path.read_text()
    )
    cases = [
        RuntimeEvalQueryCase(
            corpus_id=case.corpus_id,
            title=case.title,
            primary_source_system=case.primary_source_system,
            query_family=case.query_family,
            query=case.query,
            stratum_key=case.stratum_key,
            evidence_intent=case.evidence_intent,
            benchmark_labels=case.benchmark_labels,
            representative_section_role=case.representative_section_role,
        )
        for case in benchmark_report.cases
    ]
    return benchmark_report, cases
