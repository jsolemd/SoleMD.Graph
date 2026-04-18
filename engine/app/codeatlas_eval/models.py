"""Shared models for CodeAtlas dogfood evaluation."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import Field

from app.rag.parse_contract import ParseContractModel


class CodeAtlasEvalSurface(StrEnum):
    SERVICE = "service"
    REPO = "repo"
    DOCS = "docs"


class CodeAtlasPathMatchMode(StrEnum):
    ANY = "any"
    ALL = "all"


class CodeAtlasRequiredDocSyncState(StrEnum):
    PRESENT = "present"
    QUEUED = "queued"
    MISSING_UNSYNCABLE = "missing_unsyncable"
    ADD_FAILED = "add_failed"


class RequiredDocLibrary(ParseContractModel):
    library_id: str
    name: str
    repo: str | None = None
    docs_path: str | None = None
    branch: str | None = None
    description: str | None = None
    include_patterns: list[str] = Field(default_factory=list)
    exclude_patterns: list[str] = Field(default_factory=list)
    syncable: bool = False


class CodeAtlasBenchmarkCase(ParseContractModel):
    case_id: str
    lane: str
    surface: CodeAtlasEvalSurface
    description: str
    tool_name: str | None = None
    arguments: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    expected_status: str | None = "success"
    min_total: int | None = None
    expected_file_paths: list[str] = Field(default_factory=list)
    path_match_mode: CodeAtlasPathMatchMode = CodeAtlasPathMatchMode.ANY
    expected_recommended_start_file: str | None = None
    expected_first_result_file: str | None = None
    expected_library_id: str | None = None
    expected_library_ids: list[str] = Field(default_factory=list)
    min_chunk_count: int | None = None
    min_indexed_chunks: int | None = None
    forbidden_drift_signals: list[str] = Field(default_factory=list)


class CodeAtlasBenchmark(ParseContractModel):
    benchmark_key: str
    benchmark_source: str
    cases: list[CodeAtlasBenchmarkCase] = Field(default_factory=list)
    required_doc_libraries: list[RequiredDocLibrary] = Field(default_factory=list)


class CodeAtlasObservation(ParseContractModel):
    status: str | None = None
    total: int | None = None
    file_paths: list[str] = Field(default_factory=list)
    recommended_start_file: str | None = None
    first_result_file: str | None = None
    library_id: str | None = None
    library_ids: list[str] = Field(default_factory=list)
    chunk_count: int | None = None
    indexed_chunks: int | None = None
    drift_signals: list[str] = Field(default_factory=list)
    latency_ms: float = 0.0
    note: str | None = None


class CodeAtlasBenchmarkCaseResult(ParseContractModel):
    case_id: str
    lane: str
    surface: CodeAtlasEvalSurface
    description: str
    tool_name: str | None = None
    passed: bool
    failure_reasons: list[str] = Field(default_factory=list)
    observation: CodeAtlasObservation


class CodeAtlasBucketSummary(ParseContractModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    pass_rate: float = 0.0


class CodeAtlasFailureExample(ParseContractModel):
    case_id: str
    lane: str
    surface: CodeAtlasEvalSurface
    tool_name: str | None = None
    failure_reasons: list[str] = Field(default_factory=list)
    observed_status: str | None = None


class RequiredDocLibrarySyncRecord(ParseContractModel):
    library_id: str
    name: str
    repo: str | None = None
    state: CodeAtlasRequiredDocSyncState
    message: str | None = None


class RequiredDocLibrarySyncReport(ParseContractModel):
    total_libraries: int = 0
    present_count: int = 0
    queued_count: int = 0
    missing_unsyncable_count: int = 0
    add_failed_count: int = 0
    records: list[RequiredDocLibrarySyncRecord] = Field(default_factory=list)


class CodeAtlasBenchmarkSummary(ParseContractModel):
    total_cases: int = 0
    passed_cases: int = 0
    failed_cases: int = 0
    pass_rate: float = 0.0
    mean_latency_ms: float = 0.0
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    by_lane: dict[str, CodeAtlasBucketSummary] = Field(default_factory=dict)
    by_surface: dict[str, CodeAtlasBucketSummary] = Field(default_factory=dict)
    by_tool: dict[str, CodeAtlasBucketSummary] = Field(default_factory=dict)
    failure_examples: list[CodeAtlasFailureExample] = Field(default_factory=list)


class CodeAtlasBenchmarkReport(ParseContractModel):
    benchmark_key: str
    benchmark_source: str
    project: str
    base_url: str
    service_health: dict[str, Any] = Field(default_factory=dict)
    required_doc_sync: RequiredDocLibrarySyncReport | None = None
    summary: CodeAtlasBenchmarkSummary
    cases: list[CodeAtlasBenchmarkCaseResult] = Field(default_factory=list)
