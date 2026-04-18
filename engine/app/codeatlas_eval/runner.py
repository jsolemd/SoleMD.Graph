"""Benchmark runner and sync helpers for CodeAtlas dogfooding."""

from __future__ import annotations

import json
from math import ceil, floor
from time import perf_counter
from typing import Any

from app.codeatlas_eval.client import CodeAtlasClient
from app.codeatlas_eval.models import (
    CodeAtlasBenchmark,
    CodeAtlasBenchmarkCase,
    CodeAtlasBenchmarkCaseResult,
    CodeAtlasBenchmarkReport,
    CodeAtlasBenchmarkSummary,
    CodeAtlasBucketSummary,
    CodeAtlasFailureExample,
    CodeAtlasObservation,
    CodeAtlasRequiredDocSyncState,
    RequiredDocLibrary,
    RequiredDocLibrarySyncRecord,
    RequiredDocLibrarySyncReport,
)


def evaluate_benchmark(
    *,
    client: CodeAtlasClient,
    benchmark: CodeAtlasBenchmark,
    required_doc_sync: RequiredDocLibrarySyncReport | None = None,
) -> CodeAtlasBenchmarkReport:
    service_health = client.health()
    tool_cache: dict[str, dict[str, Any]] = {}
    results: list[CodeAtlasBenchmarkCaseResult] = []
    for case in benchmark.cases:
        observation = _observe_case(
            client=client,
            case=case,
            service_health=service_health,
            tool_cache=tool_cache,
        )
        failure_reasons = _evaluate_observation(case=case, observation=observation)
        results.append(
            CodeAtlasBenchmarkCaseResult(
                case_id=case.case_id,
                lane=case.lane,
                surface=case.surface,
                description=case.description,
                tool_name=case.tool_name,
                passed=not failure_reasons,
                failure_reasons=failure_reasons,
                observation=observation,
            )
        )
    return CodeAtlasBenchmarkReport(
        benchmark_key=benchmark.benchmark_key,
        benchmark_source=benchmark.benchmark_source,
        project=client.project,
        base_url=client.base_url,
        service_health=service_health,
        required_doc_sync=required_doc_sync,
        summary=_summarize_results(results),
        cases=results,
    )


def sync_required_doc_libraries(
    *,
    client: CodeAtlasClient,
    libraries: list[RequiredDocLibrary],
) -> RequiredDocLibrarySyncReport:
    service_health = client.health()
    current_libraries = service_health.get("docs", {}).get("libraries", [])
    current_by_id = {
        item["library_id"]: item
        for item in current_libraries
        if isinstance(item, dict) and item.get("library_id")
    }
    current_by_repo = {
        item["repo"]: item
        for item in current_libraries
        if isinstance(item, dict) and item.get("repo")
    }
    records: list[RequiredDocLibrarySyncRecord] = []
    for library in libraries:
        if library.library_id in current_by_id or (
            library.repo is not None and library.repo in current_by_repo
        ):
            records.append(
                RequiredDocLibrarySyncRecord(
                    library_id=library.library_id,
                    name=library.name,
                    repo=library.repo,
                    state=CodeAtlasRequiredDocSyncState.PRESENT,
                )
            )
            continue
        if not library.syncable or not library.repo:
            records.append(
                RequiredDocLibrarySyncRecord(
                    library_id=library.library_id,
                    name=library.name,
                    repo=library.repo,
                    state=CodeAtlasRequiredDocSyncState.MISSING_UNSYNCABLE,
                    message="Missing from registry and not managed from this repo.",
                )
            )
            continue
        arguments: dict[str, Any] = {
            "repo": library.repo,
            "name": library.name,
            "output": "json",
        }
        if library.branch:
            arguments["branch"] = library.branch
        if library.docs_path:
            arguments["docs_path"] = library.docs_path
        if library.description:
            arguments["description"] = library.description
        if library.include_patterns:
            arguments["include_patterns"] = library.include_patterns
        if library.exclude_patterns:
            arguments["exclude_patterns"] = library.exclude_patterns
        try:
            client.call_tool("add_doc_library", arguments)
        except Exception as exc:  # pragma: no cover - depends on live registry state
            records.append(
                RequiredDocLibrarySyncRecord(
                    library_id=library.library_id,
                    name=library.name,
                    repo=library.repo,
                    state=CodeAtlasRequiredDocSyncState.ADD_FAILED,
                    message=str(exc),
                )
            )
            continue
        records.append(
            RequiredDocLibrarySyncRecord(
                library_id=library.library_id,
                name=library.name,
                repo=library.repo,
                state=CodeAtlasRequiredDocSyncState.QUEUED,
                message="Queued for indexing.",
            )
        )
    return RequiredDocLibrarySyncReport(
        total_libraries=len(records),
        present_count=sum(
            1 for record in records if record.state == CodeAtlasRequiredDocSyncState.PRESENT
        ),
        queued_count=sum(
            1 for record in records if record.state == CodeAtlasRequiredDocSyncState.QUEUED
        ),
        missing_unsyncable_count=sum(
            1
            for record in records
            if record.state == CodeAtlasRequiredDocSyncState.MISSING_UNSYNCABLE
        ),
        add_failed_count=sum(
            1 for record in records if record.state == CodeAtlasRequiredDocSyncState.ADD_FAILED
        ),
        records=records,
    )


def _observe_case(
    *,
    client: CodeAtlasClient,
    case: CodeAtlasBenchmarkCase,
    service_health: dict[str, Any],
    tool_cache: dict[str, dict[str, Any]],
) -> CodeAtlasObservation:
    if case.tool_name is None:
        return _observe_health_case(case=case, service_health=service_health)
    cache_key = json.dumps(
        {"tool_name": case.tool_name, "arguments": case.arguments},
        sort_keys=True,
        default=str,
    )
    started = perf_counter()
    if cache_key in tool_cache:
        payload = tool_cache[cache_key]
    else:
        payload = client.call_tool(case.tool_name, case.arguments)
        tool_cache[cache_key] = payload
    latency_ms = (perf_counter() - started) * 1000
    return _extract_tool_observation(payload=payload, latency_ms=latency_ms)


def _observe_health_case(
    *,
    case: CodeAtlasBenchmarkCase,
    service_health: dict[str, Any],
) -> CodeAtlasObservation:
    project_snapshot = service_health.get("projects", {}).get("solemd.graph", {})
    docs_library_ids = [
        item["library_id"]
        for item in service_health.get("docs", {}).get("libraries", [])
        if isinstance(item, dict) and isinstance(item.get("library_id"), str)
    ]
    return CodeAtlasObservation(
        status=project_snapshot.get("status"),
        library_ids=sorted(set(docs_library_ids)),
        indexed_chunks=_coerce_int(project_snapshot.get("indexed_chunks")),
        latency_ms=0.0,
    )


def _extract_tool_observation(
    *,
    payload: dict[str, Any],
    latency_ms: float,
) -> CodeAtlasObservation:
    tool_payload = payload.get("payload", {})
    results = tool_payload.get("results", payload.get("results", []))
    libraries = tool_payload.get("libraries", payload.get("libraries", []))
    total = tool_payload.get("total", payload.get("total"))
    if total is None:
        for key in ("results", "libraries", "chunks", "candidates", "groups"):
            value = tool_payload.get(key)
            if isinstance(value, list):
                total = len(value)
                break
    file_paths = []
    first_result_file: str | None = None
    for result in results:
        if not isinstance(result, dict):
            continue
        file_path = result.get("file") or result.get("file_path")
        if isinstance(file_path, str):
            file_paths.append(file_path)
            if first_result_file is None:
                first_result_file = file_path
    if not file_paths and isinstance(tool_payload.get("file_path"), str):
        file_paths.append(tool_payload["file_path"])
        if first_result_file is None:
            first_result_file = tool_payload["file_path"]
    recommended_start = tool_payload.get("recommended_start")
    recommended_start_file = None
    if isinstance(recommended_start, dict):
        file_value = recommended_start.get("file") or recommended_start.get("file_path")
        if isinstance(file_value, str) and file_value:
            recommended_start_file = file_value
    library_ids = [
        item["library_id"]
        for item in libraries
        if isinstance(item, dict) and isinstance(item.get("library_id"), str)
    ]
    indexed_chunks = _coerce_int(tool_payload.get("indexed_chunks"))
    if indexed_chunks is None:
        indexed_chunks = _coerce_int(tool_payload.get("scope", {}).get("indexed_chunks"))
    drift_signals = [
        str(signal)
        for signal in tool_payload.get("health", {}).get("drift_signals", [])
        if signal is not None
    ]
    note = payload.get("next_action")
    if note is None:
        note = tool_payload.get("health", {}).get("health")
    return CodeAtlasObservation(
        status=payload.get("status"),
        total=_coerce_int(total),
        file_paths=sorted(set(file_paths)),
        recommended_start_file=recommended_start_file,
        first_result_file=first_result_file,
        library_id=tool_payload.get("library_id"),
        library_ids=sorted(set(library_ids)),
        chunk_count=_coerce_int(tool_payload.get("chunk_count")),
        indexed_chunks=indexed_chunks,
        drift_signals=drift_signals,
        latency_ms=latency_ms,
        note=note if isinstance(note, str) else None,
    )


def _evaluate_observation(
    case: CodeAtlasBenchmarkCase,
    observation: CodeAtlasObservation,
) -> list[str]:
    reasons: list[str] = []
    if case.expected_status and observation.status != case.expected_status:
        reasons.append(
            f"expected status={case.expected_status}, observed status={observation.status}"
        )
    if case.min_total is not None and (observation.total or 0) < case.min_total:
        reasons.append(
            f"expected total>={case.min_total}, observed total={observation.total or 0}"
        )
    if case.expected_file_paths:
        observed_paths = set(observation.file_paths)
        expected_paths = set(case.expected_file_paths)
        if case.path_match_mode == "all":
            missing_paths = sorted(expected_paths - observed_paths)
            if missing_paths:
                reasons.append(f"missing expected file paths: {missing_paths}")
        elif not expected_paths & observed_paths:
            reasons.append(
                f"expected any file path in {sorted(expected_paths)}, observed {sorted(observed_paths)}"
            )
    if (
        case.expected_recommended_start_file
        and observation.recommended_start_file != case.expected_recommended_start_file
    ):
        reasons.append(
            "expected recommended_start_file="
            f"{case.expected_recommended_start_file}, observed {observation.recommended_start_file}"
        )
    if case.expected_first_result_file and observation.first_result_file != case.expected_first_result_file:
        reasons.append(
            f"expected first_result_file={case.expected_first_result_file}, "
            f"observed {observation.first_result_file}"
        )
    if case.expected_library_id and observation.library_id != case.expected_library_id:
        reasons.append(
            f"expected library_id={case.expected_library_id}, observed {observation.library_id}"
        )
    if case.expected_library_ids:
        missing_library_ids = sorted(set(case.expected_library_ids) - set(observation.library_ids))
        if missing_library_ids:
            reasons.append(f"missing required library ids: {missing_library_ids}")
    if case.min_chunk_count is not None and (observation.chunk_count or 0) < case.min_chunk_count:
        reasons.append(
            f"expected chunk_count>={case.min_chunk_count}, observed {observation.chunk_count or 0}"
        )
    if case.min_indexed_chunks is not None and (
        observation.indexed_chunks or 0
    ) < case.min_indexed_chunks:
        reasons.append(
            f"expected indexed_chunks>={case.min_indexed_chunks}, observed {observation.indexed_chunks or 0}"
        )
    if case.forbidden_drift_signals:
        present_signals = sorted(set(case.forbidden_drift_signals) & set(observation.drift_signals))
        if present_signals:
            reasons.append(f"forbidden drift signals present: {present_signals}")
    return reasons


def _summarize_results(results: list[CodeAtlasBenchmarkCaseResult]) -> CodeAtlasBenchmarkSummary:
    latencies = [result.observation.latency_ms for result in results]
    by_lane = _bucketize_results(results, key="lane")
    by_surface = _bucketize_results(results, key="surface")
    by_tool = _bucketize_results(results, key="tool_name")
    return CodeAtlasBenchmarkSummary(
        total_cases=len(results),
        passed_cases=sum(1 for result in results if result.passed),
        failed_cases=sum(1 for result in results if not result.passed),
        pass_rate=_ratio(sum(1 for result in results if result.passed), len(results)),
        mean_latency_ms=(sum(latencies) / len(latencies) if latencies else 0.0),
        p50_latency_ms=_percentile(latencies, 0.50),
        p95_latency_ms=_percentile(latencies, 0.95),
        by_lane=by_lane,
        by_surface=by_surface,
        by_tool=by_tool,
        failure_examples=[
            CodeAtlasFailureExample(
                case_id=result.case_id,
                lane=result.lane,
                surface=result.surface,
                tool_name=result.tool_name,
                failure_reasons=result.failure_reasons,
                observed_status=result.observation.status,
            )
            for result in results
            if not result.passed
        ],
    )


def _bucketize_results(
    results: list[CodeAtlasBenchmarkCaseResult],
    *,
    key: str,
) -> dict[str, CodeAtlasBucketSummary]:
    buckets: dict[str, list[CodeAtlasBenchmarkCaseResult]] = {}
    for result in results:
        bucket_key = getattr(result, key)
        if bucket_key is None:
            continue
        bucket_name = str(bucket_key)
        buckets.setdefault(bucket_name, []).append(result)
    return {
        bucket_name: CodeAtlasBucketSummary(
            total_cases=len(bucket_results),
            passed_cases=sum(1 for result in bucket_results if result.passed),
            failed_cases=sum(1 for result in bucket_results if not result.passed),
            pass_rate=_ratio(
                sum(1 for result in bucket_results if result.passed),
                len(bucket_results),
            ),
        )
        for bucket_name, bucket_results in sorted(buckets.items())
    }


def _percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * quantile
    lower = floor(rank)
    upper = ceil(rank)
    if lower == upper:
        return ordered[lower]
    weight = rank - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def _ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None
