"""Shared runtime evaluation models."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from app.rag.grounded_runtime import GroundedAnswerRuntimeStatus
from app.rag.parse_contract import ParseContractModel
from app.rag.types import EvidenceIntent


class RuntimeEvalQueryFamily(StrEnum):
    TITLE_GLOBAL = "title_global"
    TITLE_SELECTED = "title_selected"
    SENTENCE_GLOBAL = "sentence_global"


class RuntimeEvalPaperRecord(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    section_count: int = 0
    table_block_count: int = 0
    narrative_block_count: int = 0
    chunk_count: int = 0
    avg_chunk_tokens: float = 0.0
    entity_mention_count: int = 0
    citation_mention_count: int = 0
    representative_section_role: str | None = None
    representative_sentence: str | None = None


class RuntimeEvalPopulationSummary(ParseContractModel):
    population_papers: int
    sampled_papers: int
    sentence_seed_papers: int = 0
    requested_papers: int = 0
    missing_requested_corpus_ids: list[int] = Field(default_factory=list)
    sampled_by_source_system: dict[str, int] = Field(default_factory=dict)
    sampled_by_stratum: dict[str, int] = Field(default_factory=dict)


class WarehouseQualitySummary(ParseContractModel):
    papers: int
    flagged_papers: int
    flag_counts: dict[str, int] = Field(default_factory=dict)


class RuntimeEvalQueryCase(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    evidence_intent: EvidenceIntent | None = None
    benchmark_labels: list[str] = Field(default_factory=list)
    representative_section_role: str | None = None
    selected_layer_key: str | None = None
    selected_node_id: str | None = None


class RuntimeEvalBenchmarkCase(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    evidence_intent: EvidenceIntent | None = None
    representative_section_role: str | None = None
    benchmark_key: str
    benchmark_labels: list[str] = Field(default_factory=list)
    failure_count: int = 0
    min_target_rank: int = 0
    max_target_rank: int = 0
    mean_target_rank: float = 0.0
    source_lane_keys: list[str] = Field(default_factory=list)


class RuntimeEvalTopHit(ParseContractModel):
    corpus_id: int
    title: str | None = None
    rank: int
    score: float | None = None
    matched_channels: list[str] = Field(default_factory=list)
    match_reasons: list[str] = Field(default_factory=list)
    rank_features: dict[str, float] = Field(default_factory=dict)


class RuntimeEvalCaseResult(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    evidence_intent: EvidenceIntent | None = None
    benchmark_labels: list[str] = Field(default_factory=list)
    representative_section_role: str | None = None
    evidence_bundle_count: int = 0
    top_corpus_ids: list[int] = Field(default_factory=list)
    hit_rank: int | None = None
    answer_present: bool = False
    answer_corpus_ids: list[int] = Field(default_factory=list)
    target_in_answer_corpus: bool = False
    grounded_answer_present: bool = False
    grounded_answer_linked_corpus_ids: list[int] = Field(default_factory=list)
    target_in_grounded_answer: bool = False
    cited_span_count: int = 0
    inline_citation_count: int = 0
    answer_segment_count: int = 0
    retrieval_channel_hit_counts: dict[str, int] = Field(default_factory=dict)
    top_hits: list[RuntimeEvalTopHit] = Field(default_factory=list)
    stage_durations_ms: dict[str, float] = Field(default_factory=dict)
    stage_call_counts: dict[str, int] = Field(default_factory=dict)
    candidate_counts: dict[str, int] = Field(default_factory=dict)
    session_flags: dict[str, object] = Field(default_factory=dict)
    route_signature: str | None = None
    duration_ms: float = 0.0
    service_duration_ms: float = 0.0
    overhead_duration_ms: float = 0.0
    error: str | None = None


class RuntimeEvalAggregate(ParseContractModel):
    cases: int = 0
    hit_at_1_rate: float = 0.0
    hit_at_k_rate: float = 0.0
    answer_present_rate: float = 0.0
    target_in_answer_corpus_rate: float = 0.0
    grounded_answer_rate: float = 0.0
    target_in_grounded_answer_rate: float = 0.0
    mean_bundle_count: float = 0.0
    mean_cited_span_count: float = 0.0
    mean_duration_ms: float = 0.0
    p50_duration_ms: float = 0.0
    p95_duration_ms: float = 0.0
    p99_duration_ms: float = 0.0
    max_duration_ms: float = 0.0
    mean_service_duration_ms: float = 0.0
    p50_service_duration_ms: float = 0.0
    p95_service_duration_ms: float = 0.0
    p99_service_duration_ms: float = 0.0
    max_service_duration_ms: float = 0.0
    mean_overhead_duration_ms: float = 0.0
    over_250ms_count: int = 0
    over_500ms_count: int = 0
    over_1000ms_count: int = 0
    over_5000ms_count: int = 0
    over_30000ms_count: int = 0
    error_count: int = 0
    retrieval_channel_presence_rates: dict[str, float] = Field(default_factory=dict)


class RuntimeEvalNumericProfile(ParseContractModel):
    cases: int = 0
    mean: float = 0.0
    p50: float = 0.0
    p95: float = 0.0
    p99: float = 0.0
    max: float = 0.0


class RuntimeEvalSlowStage(ParseContractModel):
    stage: str
    duration_ms: float
    call_count: int = 1


class RuntimeEvalSqlPlanProfile(ParseContractModel):
    stage: str
    route: str
    plan_hash: str
    sql_fingerprint: str
    node_types: list[str] = Field(default_factory=list)
    index_names: list[str] = Field(default_factory=list)


class RuntimeEvalSlowCase(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    evidence_intent: EvidenceIntent | None = None
    benchmark_labels: list[str] = Field(default_factory=list)
    service_duration_ms: float = 0.0
    duration_ms: float = 0.0
    overhead_duration_ms: float = 0.0
    hit_rank: int | None = None
    grounded_answer_present: bool = False
    target_in_grounded_answer: bool = False
    top_stages: list[RuntimeEvalSlowStage] = Field(default_factory=list)
    candidate_counts: dict[str, int] = Field(default_factory=dict)
    session_flags: dict[str, object] = Field(default_factory=dict)
    route_signature: str | None = None
    plan_profiles: list[RuntimeEvalSqlPlanProfile] = Field(default_factory=list)
    top_hits: list[RuntimeEvalTopHit] = Field(default_factory=list)


class RuntimeEvalFailureExample(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    evidence_intent: EvidenceIntent | None = None
    benchmark_labels: list[str] = Field(default_factory=list)
    failure_reasons: list[str] = Field(default_factory=list)
    top_hits: list[RuntimeEvalTopHit] = Field(default_factory=list)


class RuntimeEvalStageHotspot(ParseContractModel):
    stage: str
    cases: int = 0
    dominant_cases: int = 0
    total_duration_ms: float = 0.0
    mean_duration_ms: float = 0.0
    max_duration_ms: float = 0.0


class RuntimeEvalLatencySummary(ParseContractModel):
    phase_profiles_ms: dict[str, RuntimeEvalNumericProfile] = Field(default_factory=dict)
    stage_profiles_ms: dict[str, RuntimeEvalNumericProfile] = Field(default_factory=dict)
    stage_call_profiles: dict[str, RuntimeEvalNumericProfile] = Field(default_factory=dict)
    candidate_profiles: dict[str, RuntimeEvalNumericProfile] = Field(default_factory=dict)
    route_profiles_ms: dict[str, RuntimeEvalNumericProfile] = Field(default_factory=dict)
    slow_route_counts: dict[str, int] = Field(default_factory=dict)
    slow_stage_hotspots: list[RuntimeEvalStageHotspot] = Field(default_factory=list)
    slow_cases: list[RuntimeEvalSlowCase] = Field(default_factory=list)


class RuntimeEvalSummary(ParseContractModel):
    overall: RuntimeEvalAggregate
    by_query_family: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    by_source_system: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    by_stratum_key: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    by_evidence_intent: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    by_benchmark_label: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    failure_theme_counts: dict[str, int] = Field(default_factory=dict)
    failure_examples: list[RuntimeEvalFailureExample] = Field(default_factory=list)
    latency: RuntimeEvalLatencySummary = Field(default_factory=RuntimeEvalLatencySummary)


class RagRuntimeEvaluationReport(ParseContractModel):
    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None = None
    graph_name: str
    chunk_version_key: str
    use_lexical: bool = True
    use_dense_query: bool = True
    query_families: list[RuntimeEvalQueryFamily] = Field(default_factory=list)
    population: RuntimeEvalPopulationSummary
    warehouse_quality: WarehouseQualitySummary
    grounding_runtime_status: GroundedAnswerRuntimeStatus
    warmup_duration_ms: float = 0.0
    query_embedder_status: dict[str, object] = Field(default_factory=dict)
    summary: RuntimeEvalSummary
    cases: list[RuntimeEvalCaseResult] = Field(default_factory=list)


class RagRuntimeEvalBenchmarkReport(ParseContractModel):
    benchmark_key: str
    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None = None
    graph_name: str
    chunk_version_key: str
    benchmark_source: str
    max_cases: int
    min_failure_count: int
    min_max_rank: int
    high_recurrence_count: int
    deep_miss_rank: int
    selected_count: int = 0
    selected_by_label: dict[str, int] = Field(default_factory=dict)
    cases: list[RuntimeEvalBenchmarkCase] = Field(default_factory=list)


class RuntimeEvalCohortCandidate(ParseContractModel):
    corpus_id: int
    title: str
    paper_id: str | None = None
    citation_count: int = 0
    reference_count: int = 0
    text_availability: str | None = None
    pmid: int | None = None
    pmc_id: str | None = None
    doi: str | None = None
    missing_document: bool = True
    citation_bucket: str
    bioc_profile: str
    text_profile: str
    stratum_key: str
    stratum_population_count: int = 0
    candidate_population_size: int = 0


class RagRuntimeEvalCohortReport(ParseContractModel):
    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None = None
    graph_name: str
    requested_sample_size: int
    seed: int
    missing_documents_only: bool = True
    min_citation_count: int = 0
    allowed_text_profiles: list[str] = Field(default_factory=list)
    candidate_population_size: int = 0
    selected_count: int = 0
    selected_by_stratum: dict[str, int] = Field(default_factory=dict)
    candidate_population_by_stratum: dict[str, int] = Field(default_factory=dict)
    candidates: list[RuntimeEvalCohortCandidate] = Field(default_factory=list)
