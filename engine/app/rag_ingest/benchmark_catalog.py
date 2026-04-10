"""Benchmark suite catalog and acceptance gates for Langfuse RAG evaluation."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field

from app.rag.parse_contract import ParseContractModel


class BenchmarkGateDirection(StrEnum):
    MIN = "min"
    MAX = "max"


class BenchmarkSuiteGateMode(StrEnum):
    REQUIRED = "required"
    GUARDRAIL = "guardrail"
    SHADOW = "shadow"


class BenchmarkQualityGate(ParseContractModel):
    metric: str
    threshold: float
    direction: BenchmarkGateDirection = BenchmarkGateDirection.MIN
    description: str | None = None


class BenchmarkSuiteSpec(ParseContractModel):
    benchmark_key: str
    suite_family: str
    target_case_count: int
    gate_mode: BenchmarkSuiteGateMode = BenchmarkSuiteGateMode.REQUIRED
    acceptance_focus: str
    description: str
    gates: list[BenchmarkQualityGate] = Field(default_factory=list)

    @property
    def dataset_name(self) -> str:
        return f"benchmark-{self.benchmark_key}"


_BENCHMARK_SUITE_SPECS = {
    "biomedical_optimization_v3": BenchmarkSuiteSpec(
        benchmark_key="biomedical_optimization_v3",
        suite_family="optimization",
        target_case_count=297,
        gate_mode=BenchmarkSuiteGateMode.REQUIRED,
        acceptance_focus=(
            "Primary covered-paper optimization gate for title, selected-context, "
            "and non-title sentence retrieval."
        ),
        description=(
            "Main covered biomedical benchmark. Future RAG changes must not regress "
            "overall hit@1, grounded answers, or non-title retrieval quality."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.99),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.99),
            BenchmarkQualityGate(metric="target_in_answer_corpus", threshold=0.99),
            BenchmarkQualityGate(metric="non_title_hit_at_1", threshold=0.99),
            BenchmarkQualityGate(metric="title_hit_at_1", threshold=1.0),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=125.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
    "biomedical_holdout_v1": BenchmarkSuiteSpec(
        benchmark_key="biomedical_holdout_v1",
        suite_family="holdout",
        target_case_count=48,
        gate_mode=BenchmarkSuiteGateMode.REQUIRED,
        acceptance_focus=(
            "Paper- and title-disjoint anti-overfitting benchmark for unseen title "
            "and sentence retrieval."
        ),
        description=(
            "Held-out proof benchmark. Changes are not accepted if optimize improves "
            "but holdout quality or latency regresses materially."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.97),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.99),
            BenchmarkQualityGate(metric="non_title_hit_at_1", threshold=0.97),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=150.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
    "biomedical_citation_context_v1": BenchmarkSuiteSpec(
        benchmark_key="biomedical_citation_context_v1",
        suite_family="citation_context",
        target_case_count=24,
        gate_mode=BenchmarkSuiteGateMode.REQUIRED,
        acceptance_focus=(
            "Explicit cited-study preservation. The cited target must survive retrieval "
            "and grounding when the user prompt carries study context."
        ),
        description=(
            "Cited-context gate for OpenEvidence-style use: the system must honor the "
            "study signal supplied in the prompt instead of drifting to adjacent papers."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.99),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.99),
            BenchmarkQualityGate(metric="target_cited_context_rate", threshold=0.99),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=150.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
    "biomedical_narrative_v1": BenchmarkSuiteSpec(
        benchmark_key="biomedical_narrative_v1",
        suite_family="narrative_qa",
        target_case_count=36,
        gate_mode=BenchmarkSuiteGateMode.SHADOW,
        acceptance_focus=(
            "Narrative clinician-style and patient-facing biomedical questions that "
            "should yield a grounded study-backed discussion, not just a title match."
        ),
        description=(
            "General clinical narrative QA benchmark. This is the closest current "
            "benchmark to prompts like 'tell me about prednisone neuropsychiatric "
            "symptoms', but it remains a shadow suite until narrative coverage and "
            "answer scoring are mature enough to make it a release blocker."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.92),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.98),
            BenchmarkQualityGate(metric="target_in_answer_corpus", threshold=0.92),
            BenchmarkQualityGate(metric="non_title_hit_at_1", threshold=0.92),
            BenchmarkQualityGate(metric="display_study_metadata_coverage", threshold=0.9),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=250.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
    "biomedical_metadata_retrieval_v1": BenchmarkSuiteSpec(
        benchmark_key="biomedical_metadata_retrieval_v1",
        suite_family="metadata_retrieval",
        target_case_count=36,
        gate_mode=BenchmarkSuiteGateMode.GUARDRAIL,
        acceptance_focus=(
            "Queries that lean on author, journal, and publication year rather than "
            "exact paper titles."
        ),
        description=(
            "Metadata-aware retrieval benchmark. Future changes must preserve field-aware "
            "paper retrieval and surfaced study metadata."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.95),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.98),
            BenchmarkQualityGate(metric="non_title_hit_at_1", threshold=0.95),
            BenchmarkQualityGate(metric="display_study_metadata_coverage", threshold=0.95),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=250.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
    "biomedical_evidence_type_v1": BenchmarkSuiteSpec(
        benchmark_key="biomedical_evidence_type_v1",
        suite_family="evidence_type_preference",
        target_case_count=16,
        gate_mode=BenchmarkSuiteGateMode.GUARDRAIL,
        acceptance_focus=(
            "Study-design-aware retrieval for review, meta-analysis, clinical trial, "
            "and general study-design prompts."
        ),
        description=(
            "Evidence-type preference benchmark over the currently covered paper pool. "
            "v1 is balanced to four cases per available study-design bucket; expand the "
            "suite only after covered clinical-trial and meta-analysis depth increases."
        ),
        gates=[
            BenchmarkQualityGate(metric="hit_at_1", threshold=0.9),
            BenchmarkQualityGate(metric="grounded_answer_rate", threshold=0.98),
            BenchmarkQualityGate(metric="non_title_hit_at_1", threshold=0.9),
            BenchmarkQualityGate(metric="display_study_metadata_coverage", threshold=0.95),
            BenchmarkQualityGate(
                metric="p95_duration_ms",
                threshold=250.0,
                direction=BenchmarkGateDirection.MAX,
            ),
        ],
    ),
}


def list_benchmark_suite_specs() -> list[BenchmarkSuiteSpec]:
    return list(_BENCHMARK_SUITE_SPECS.values())


def get_benchmark_suite_spec(dataset_name_or_key: str) -> BenchmarkSuiteSpec | None:
    key = dataset_name_or_key.removeprefix("benchmark-")
    return _BENCHMARK_SUITE_SPECS.get(key)


def benchmark_suite_gate_maps(
    dataset_name_or_key: str,
) -> tuple[dict[str, float], dict[str, float]]:
    spec = get_benchmark_suite_spec(dataset_name_or_key)
    if spec is None:
        return {}, {}
    lower_bounds: dict[str, float] = {}
    upper_bounds: dict[str, float] = {}
    for gate in spec.gates:
        if gate.direction == BenchmarkGateDirection.MAX:
            upper_bounds[gate.metric] = gate.threshold
        else:
            lower_bounds[gate.metric] = gate.threshold
    return lower_bounds, upper_bounds
