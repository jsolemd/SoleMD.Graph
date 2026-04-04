"""Claim decomposition + verification pipeline (RAGChecker 3-stage pattern).

Stages:
  1. Extract: decompose answer text into atomic claims
  2. Check: verify each claim against evidence passages
  3. Aggregate: compute faithfulness = entailed / total

Metrics declare prerequisites via METRIC_REQUIREMENTS. The runner only
executes stages not yet computed (lazy evaluation).
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from typing import Protocol

logger = logging.getLogger(__name__)


@dataclass
class Claim:
    text: str
    source_text: str
    claim_hash: str = ""

    def __post_init__(self):
        if not self.claim_hash:
            self.claim_hash = hashlib.sha256(self.text.encode()).hexdigest()[:12]


@dataclass
class ClaimVerdict:
    claim: Claim
    verdict: str  # "entailed", "contradicted", "not_enough_info", "skip"
    reasoning: str = ""
    success: bool = True


@dataclass
class FaithfulnessScore:
    total_claims: int
    entailed_claims: int
    contradicted_claims: int
    not_enough_info_claims: int
    skipped_claims: int
    score: float  # entailed / total (or 0.0 if no claims)


@dataclass
class VerificationResult:
    claims: list[Claim] = field(default_factory=list)
    verdicts: list[ClaimVerdict] = field(default_factory=list)
    faithfulness: FaithfulnessScore | None = None


class ClaimExtractor(Protocol):
    def extract(self, answer_text: str) -> list[Claim]: ...


class ClaimChecker(Protocol):
    def check(self, question: str, context: str, answer: str) -> object: ...


# --- Stage 1: Claim Extraction ---

class SentenceClaimExtractor:
    """Simple sentence-level claim extraction (no LLM dependency).

    Splits answer text into sentences and treats each as an atomic claim.
    For more sophisticated decomposition, replace with an LLM-based extractor.
    """

    def extract(self, answer_text: str) -> list[Claim]:
        if not answer_text or not answer_text.strip():
            return []
        # Split on sentence boundaries (period + space, or newlines)
        import re
        sentences = re.split(r'(?<=[.!?])\s+|\n+', answer_text.strip())
        claims = []
        for sentence in sentences:
            sentence = sentence.strip()
            if len(sentence) < 10:  # Skip very short fragments
                continue
            claims.append(Claim(text=sentence, source_text=answer_text))
        return claims


# --- Stage 2: Claim Checking ---

def check_claims(
    claims: list[Claim],
    evidence_passages: list[str],
    checker: ClaimChecker,
    question: str,
) -> list[ClaimVerdict]:
    """Verify each claim against evidence passages using the provided checker."""
    context = "\n\n".join(evidence_passages)
    verdicts = []
    for claim in claims:
        try:
            result = checker.check(
                question=question,
                context=context,
                answer=claim.text,
            )
            # Adapt from faithfulness_checker.ClaimVerdict format
            verdict_str = getattr(result, "verdict", "SKIP")
            reasoning = getattr(result, "reasoning", "")
            success = getattr(result, "success", True)
            if verdict_str == "PASS":
                mapped_verdict = "entailed"
            elif verdict_str == "FAIL":
                mapped_verdict = "contradicted"
            elif verdict_str == "SKIP":
                mapped_verdict = "skip"
            else:
                mapped_verdict = "not_enough_info"
            verdicts.append(ClaimVerdict(
                claim=claim,
                verdict=mapped_verdict,
                reasoning=str(reasoning),
                success=success,
            ))
        except Exception as exc:
            logger.debug("Claim check failed for claim '%s': %s", claim.text[:50], exc)
            verdicts.append(ClaimVerdict(
                claim=claim,
                verdict="skip",
                reasoning=f"Check error: {exc}",
                success=False,
            ))
    return verdicts


# --- Stage 3: Aggregation ---

def aggregate_verdicts(verdicts: list[ClaimVerdict]) -> FaithfulnessScore:
    """Compute faithfulness score from claim verdicts."""
    total = len(verdicts)
    entailed = sum(1 for v in verdicts if v.verdict == "entailed")
    contradicted = sum(1 for v in verdicts if v.verdict == "contradicted")
    not_enough = sum(1 for v in verdicts if v.verdict == "not_enough_info")
    skipped = sum(1 for v in verdicts if v.verdict == "skip")
    scoreable = total - skipped
    score = entailed / scoreable if scoreable > 0 else 0.0
    return FaithfulnessScore(
        total_claims=total,
        entailed_claims=entailed,
        contradicted_claims=contradicted,
        not_enough_info_claims=not_enough,
        skipped_claims=skipped,
        score=round(score, 4),
    )


# --- Metric Requirements (RAGChecker pattern) ---

METRIC_REQUIREMENTS: dict[str, list[str]] = {
    "faithfulness": ["extract_claims", "check_claims", "aggregate_verdicts"],
    "claim_recall": ["extract_claims", "check_claims", "aggregate_verdicts"],
    "claim_precision": ["extract_claims", "check_claims", "aggregate_verdicts"],
}


# --- Pipeline Runner ---

def verify_answer(
    *,
    question: str,
    answer_text: str,
    evidence_passages: list[str],
    checker: ClaimChecker,
    extractor: ClaimExtractor | None = None,
    cached_claims: list[Claim] | None = None,
) -> VerificationResult:
    """Run the full 3-stage verification pipeline.

    Supports claim caching: pass cached_claims to skip extraction.
    """
    result = VerificationResult()

    # Stage 1: Extract (or use cache)
    if cached_claims is not None:
        result.claims = cached_claims
    else:
        active_extractor = extractor or SentenceClaimExtractor()
        result.claims = active_extractor.extract(answer_text)

    if not result.claims:
        result.faithfulness = FaithfulnessScore(
            total_claims=0,
            entailed_claims=0,
            contradicted_claims=0,
            not_enough_info_claims=0,
            skipped_claims=0,
            score=0.0,
        )
        return result

    # Stage 2: Check
    result.verdicts = check_claims(
        claims=result.claims,
        evidence_passages=evidence_passages,
        checker=checker,
        question=question,
    )

    # Stage 3: Aggregate
    result.faithfulness = aggregate_verdicts(result.verdicts)

    return result


# --- Eval Metric Integration ---

def faithfulness_eval_score(result: VerificationResult):
    """Convert VerificationResult to an EvalScore for the metric framework."""
    from app.rag_ingest.eval_metrics import EvalScore

    if result.faithfulness is None:
        return EvalScore(value=0.0, success=False, reason="No faithfulness score computed")
    return EvalScore(
        value=result.faithfulness.score,
        breakdown={
            "entailed": result.faithfulness.entailed_claims,
            "contradicted": result.faithfulness.contradicted_claims,
            "not_enough_info": result.faithfulness.not_enough_info_claims,
            "skipped": result.faithfulness.skipped_claims,
            "total": result.faithfulness.total_claims,
        },
        reason=(
            f"{result.faithfulness.entailed_claims}/"
            f"{result.faithfulness.total_claims} claims entailed"
        ),
        success=result.faithfulness.skipped_claims < result.faithfulness.total_claims,
    )
