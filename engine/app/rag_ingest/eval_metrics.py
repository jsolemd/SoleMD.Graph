"""Evaluation metric framework adapted from RAGAS/DeepEval/TruLens patterns."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

from app.rag_ingest.runtime_eval_models import RuntimeEvalCaseResult


@dataclass
class EvalScore:
    value: float
    breakdown: dict[str, float] | None = None
    reason: str | None = None
    cost: float = 0.0
    success: bool = True


@dataclass
class EvalCase:
    corpus_id: int
    hit_rank: int | None
    top_corpus_ids: list[int] = field(default_factory=list)
    answer_present: bool = False
    target_in_answer_corpus: bool = False
    grounded_answer_present: bool = False
    target_in_grounded_answer: bool = False
    evidence_bundle_count: int = 0
    cited_span_count: int = 0
    duration_ms: float = 0.0
    service_duration_ms: float = 0.0
    route_signature: str | None = None
    evidence_intent: str | None = None
    benchmark_labels: list[str] = field(default_factory=list)
    warehouse_depth: str = "unknown"  # "fulltext", "front_matter_only", "none", "unknown"


@runtime_checkable
class BaseEvalMetric(Protocol):
    name: str
    required_fields: tuple[str, ...]
    threshold: float

    def score(self, case: EvalCase) -> EvalScore: ...


class HitAt1:
    name = "hit_at_1"
    required_fields = ("hit_rank",)
    threshold = 0.90

    def score(self, case: EvalCase) -> EvalScore:
        return EvalScore(value=1.0 if case.hit_rank == 1 else 0.0)


class HitAtK:
    name = "hit_at_k"
    required_fields = ("hit_rank",)
    threshold = 0.90

    def score(self, case: EvalCase) -> EvalScore:
        return EvalScore(value=1.0 if case.hit_rank is not None else 0.0)


class MRR:
    name = "mrr"
    required_fields = ("hit_rank",)
    threshold = 0.50

    def score(self, case: EvalCase) -> EvalScore:
        if case.hit_rank is not None:
            return EvalScore(value=1.0 / case.hit_rank)
        return EvalScore(value=0.0)


class NDCG:
    name = "ndcg"
    required_fields = ("hit_rank",)
    threshold = 0.50

    def score(self, case: EvalCase) -> EvalScore:
        if case.hit_rank is not None:
            return EvalScore(value=1.0 / math.log2(case.hit_rank + 1))
        return EvalScore(value=0.0)


class GroundedAnswerRate:
    name = "grounded_answer_rate"
    required_fields = ("grounded_answer_present",)
    threshold = 0.85

    def score(self, case: EvalCase) -> EvalScore:
        return EvalScore(value=1.0 if case.grounded_answer_present else 0.0)


class TargetInGroundedAnswer:
    name = "target_in_grounded_answer"
    required_fields = ("target_in_grounded_answer",)
    threshold = 0.85

    def score(self, case: EvalCase) -> EvalScore:
        return EvalScore(value=1.0 if case.target_in_grounded_answer else 0.0)


class TargetInAnswerCorpus:
    name = "target_in_answer_corpus"
    required_fields = ("target_in_answer_corpus",)
    threshold = 0.85

    def score(self, case: EvalCase) -> EvalScore:
        return EvalScore(value=1.0 if case.target_in_answer_corpus else 0.0)


def score_case(
    case: EvalCase, metrics: Sequence[BaseEvalMetric]
) -> dict[str, EvalScore]:
    return {metric.name: metric.score(case) for metric in metrics}


def eval_case_from_runtime_result(result: RuntimeEvalCaseResult) -> EvalCase:
    # Derive grounding depth from result signals
    if result.cited_span_count > 0:
        warehouse_depth = "fulltext"
    elif result.grounded_answer_present:
        warehouse_depth = "abstract"
    elif result.answer_present:
        warehouse_depth = "none"
    else:
        warehouse_depth = "unknown"

    return EvalCase(
        corpus_id=result.corpus_id,
        hit_rank=result.hit_rank,
        top_corpus_ids=list(result.top_corpus_ids),
        answer_present=result.answer_present,
        target_in_answer_corpus=result.target_in_answer_corpus,
        grounded_answer_present=result.grounded_answer_present,
        target_in_grounded_answer=result.target_in_grounded_answer,
        evidence_bundle_count=result.evidence_bundle_count,
        cited_span_count=result.cited_span_count,
        duration_ms=result.duration_ms,
        service_duration_ms=result.service_duration_ms,
        route_signature=result.route_signature,
        evidence_intent=result.evidence_intent.value if result.evidence_intent else None,
        benchmark_labels=list(result.benchmark_labels),
        warehouse_depth=warehouse_depth,
    )
