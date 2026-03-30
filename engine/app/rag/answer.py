"""Answer synthesis helpers for the baseline evidence response."""

from __future__ import annotations

from app.rag.models import EvidenceBundle
from app.rag.types import DEFAULT_ANSWER_MODEL, EvidenceIntent


def _answer_heading(evidence_intent: EvidenceIntent | None) -> str:
    if evidence_intent == EvidenceIntent.SUPPORT:
        return "Potentially supporting evidence:"
    if evidence_intent == EvidenceIntent.REFUTE:
        return "Potentially refuting evidence:"
    return "Potentially relevant evidence:"


def generate_baseline_answer(
    bundles: list[EvidenceBundle],
    *,
    evidence_intent: EvidenceIntent | None = None,
    max_items: int = 2,
) -> tuple[str | None, str | None]:
    """Generate a lightweight extractive answer from the top evidence bundles."""

    grounding_bundles = select_answer_grounding_bundles(bundles, max_items=max_items)
    if not grounding_bundles:
        return None, None

    lines: list[str] = []
    for bundle in grounding_bundles:
        title = bundle.paper.title or f"Paper {bundle.paper.corpus_id}"
        year = f" ({bundle.paper.year})" if bundle.paper.year else ""
        snippet = bundle.snippet or "Relevant paper-level evidence was retrieved."
        lines.append(f"{title}{year}: {snippet}")

    return f"{_answer_heading(evidence_intent)}\n\n" + "\n\n".join(lines), DEFAULT_ANSWER_MODEL


def select_answer_grounding_bundles(
    bundles: list[EvidenceBundle],
    *,
    max_items: int = 2,
) -> list[EvidenceBundle]:
    """Return the paper-level evidence bundles used to ground the baseline answer."""

    if max_items <= 0:
        return []
    return bundles[:max_items]
