"""Answer synthesis helpers for the baseline evidence response."""

from __future__ import annotations

from app.rag.models import EvidenceBundle
from app.rag.types import DEFAULT_ANSWER_MODEL


def generate_baseline_answer(
    bundles: list[EvidenceBundle],
    *,
    max_items: int = 2,
) -> tuple[str | None, str | None]:
    """Generate a lightweight extractive answer from the top evidence bundles."""

    if not bundles:
        return None, None

    lines: list[str] = []
    for bundle in bundles[:max_items]:
        title = bundle.paper.title or f"Paper {bundle.paper.corpus_id}"
        year = f" ({bundle.paper.year})" if bundle.paper.year else ""
        snippet = bundle.snippet or "Relevant paper-level evidence was retrieved."
        lines.append(f"{title}{year}: {snippet}")

    return "\n\n".join(lines), DEFAULT_ANSWER_MODEL
