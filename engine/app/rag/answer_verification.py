"""Serving-path faithfulness gating for LLM-generated answers.

Wraps the eval-path claim_verification pipeline with serving-level
error handling, latency bounds, and graceful extractive fallback.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.rag.answer_generation import GeneratedAnswer
from app.rag.models import EvidenceBundle
from app.rag_ingest.claim_verification import (
    ClaimChecker,
    FaithfulnessScore,
    SentenceClaimExtractor,
    VerificationResult,
    verify_answer,
)

logger = logging.getLogger(__name__)

DEFAULT_FAITHFULNESS_THRESHOLD = 0.85


@dataclass(frozen=True, slots=True)
class VerificationOutcome:
    """Result of serving-path faithfulness gating."""

    passed: bool
    faithfulness: FaithfulnessScore | None
    verification: VerificationResult | None
    duration_ms: float
    fallback_to_extractive: bool
    error: str | None = None


def _extract_evidence_passages(bundles: list[EvidenceBundle]) -> list[str]:
    """Build evidence passage list from bundles for verification context."""

    passages: list[str] = []
    for bundle in bundles:
        snippet = bundle.snippet or bundle.paper.abstract or ""
        if snippet.strip():
            passages.append(snippet.strip()[:1000])
    return passages


def verify_generated_answer(
    answer: GeneratedAnswer,
    bundles: list[EvidenceBundle],
    query: str,
    *,
    checker: ClaimChecker,
    threshold: float = DEFAULT_FAITHFULNESS_THRESHOLD,
) -> VerificationOutcome:
    """Verify a generated answer against evidence bundles.

    Returns a VerificationOutcome indicating whether the answer passed
    faithfulness gating. If faithfulness_score < threshold, the caller
    should fall back to the extractive answer.
    """

    started = time.perf_counter()
    evidence_passages = _extract_evidence_passages(bundles)

    if not evidence_passages:
        return VerificationOutcome(
            passed=False,
            faithfulness=None,
            verification=None,
            duration_ms=0.0,
            fallback_to_extractive=True,
            error="No evidence passages available for verification",
        )

    try:
        result = verify_answer(
            question=query,
            answer_text=answer.text,
            evidence_passages=evidence_passages,
            checker=checker,
            extractor=SentenceClaimExtractor(),
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - started) * 1000
        logger.warning("Faithfulness verification failed: %s", exc)
        return VerificationOutcome(
            passed=False,
            faithfulness=None,
            verification=None,
            duration_ms=duration_ms,
            fallback_to_extractive=True,
            error=str(exc),
        )

    duration_ms = (time.perf_counter() - started) * 1000
    faithfulness = result.faithfulness

    if faithfulness is None:
        return VerificationOutcome(
            passed=False,
            faithfulness=None,
            verification=result,
            duration_ms=duration_ms,
            fallback_to_extractive=True,
            error="No faithfulness score computed",
        )

    passed = faithfulness.score >= threshold
    return VerificationOutcome(
        passed=passed,
        faithfulness=faithfulness,
        verification=result,
        duration_ms=duration_ms,
        fallback_to_extractive=not passed,
    )
