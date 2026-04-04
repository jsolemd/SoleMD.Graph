"""RAGAS context metrics for RAG evaluation.

Computes context_precision and context_recall on benchmark results,
pushed as Langfuse scores. Non-LLM variants used by default to avoid
API costs.

Requires: pip install solemd-graph-engine[eval]
Skips gracefully if ragas is not installed.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class RagasContextScore:
    context_precision: float | None = None
    context_recall: float | None = None
    error: str | None = None


def compute_context_metrics(
    *,
    question: str,
    answer: str,
    contexts: list[str],
    ground_truth: str | None = None,
) -> RagasContextScore:
    """Compute RAGAS context precision and recall.

    Uses non-LLM variants (NonLLMContextPrecisionWithReference,
    NonLLMContextRecall) when ground_truth is provided.
    Falls back gracefully if ragas is not installed.
    """
    try:
        from ragas.dataset_schema import SingleTurnSample
        from ragas.metrics import NonLLMContextPrecisionWithReference, NonLLMContextRecall
    except ImportError:
        logger.debug("ragas not installed — install with: pip install solemd-graph-engine[eval]")
        return RagasContextScore(error="ragas not installed")

    if not ground_truth:
        return RagasContextScore(error="ground_truth required for non-LLM context metrics")

    try:
        sample = SingleTurnSample(
            user_input=question,
            response=answer,
            retrieved_contexts=contexts,
            reference=ground_truth,
        )

        precision_metric = NonLLMContextPrecisionWithReference()
        recall_metric = NonLLMContextRecall()

        precision_score = precision_metric.single_turn_score(sample)
        recall_score = recall_metric.single_turn_score(sample)

        return RagasContextScore(
            context_precision=round(float(precision_score), 4),
            context_recall=round(float(recall_score), 4),
        )
    except Exception as exc:
        logger.debug("RAGAS context metric computation failed: %s", exc)
        return RagasContextScore(error=str(exc))


def push_ragas_scores_to_langfuse(
    trace_name: str,
    scores: RagasContextScore,
) -> None:
    """Push RAGAS context scores to Langfuse."""
    from app.rag_ingest.eval_langfuse import push_scores_to_langfuse
    from app.rag_ingest.eval_metrics import EvalScore

    eval_scores: dict[str, EvalScore] = {}
    if scores.context_precision is not None:
        eval_scores["context_precision"] = EvalScore(value=scores.context_precision)
    if scores.context_recall is not None:
        eval_scores["context_recall"] = EvalScore(value=scores.context_recall)

    if eval_scores:
        push_scores_to_langfuse(eval_scores, trace_name=trace_name)
