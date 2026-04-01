"""Answer synthesis helpers for the baseline evidence response."""

from __future__ import annotations

import itertools
from dataclasses import dataclass

from app.rag.models import EvidenceBundle
from app.rag.query_enrichment import normalize_title_key
from app.rag.types import DEFAULT_ANSWER_MODEL, EvidenceIntent


@dataclass(frozen=True, slots=True)
class BaselineAnswerPayload:
    text: str | None
    model: str | None
    segment_texts: tuple[str, ...] = ()
    segment_corpus_ids: tuple[int | None, ...] = ()
    grounding_corpus_ids: tuple[int, ...] = ()


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
    query_text: str | None = None,
) -> tuple[str | None, str | None]:
    """Generate a lightweight extractive answer from the top evidence bundles."""

    payload = build_baseline_answer_payload(
        bundles,
        evidence_intent=evidence_intent,
        max_items=max_items,
        query_text=query_text,
    )
    return payload.text, payload.model


def build_baseline_answer_payload(
    bundles: list[EvidenceBundle],
    *,
    evidence_intent: EvidenceIntent | None = None,
    max_items: int = 2,
    query_text: str | None = None,
) -> BaselineAnswerPayload:
    """Return the baseline answer text plus per-bundle grounding segments."""

    grounding_bundles = select_answer_grounding_bundles(
        bundles,
        max_items=max_items,
        query_text=query_text,
    )
    if not grounding_bundles:
        return BaselineAnswerPayload(text=None, model=None)

    heading = _answer_heading(evidence_intent)
    lines: list[str] = []
    segment_corpus_ids: list[int | None] = [None]
    for bundle in grounding_bundles:
        title = bundle.paper.title or f"Paper {bundle.paper.corpus_id}"
        year = f" ({bundle.paper.year})" if bundle.paper.year else ""
        snippet = bundle.snippet or "Relevant paper-level evidence was retrieved."
        lines.append(f"{title}{year}: {snippet}")
        segment_corpus_ids.append(bundle.paper.corpus_id)

    return BaselineAnswerPayload(
        text=f"{heading}\n\n" + "\n\n".join(lines),
        model=DEFAULT_ANSWER_MODEL,
        segment_texts=(heading, *lines),
        segment_corpus_ids=tuple(segment_corpus_ids),
        grounding_corpus_ids=tuple(bundle.paper.corpus_id for bundle in grounding_bundles),
    )


def select_answer_grounding_bundles(
    bundles: list[EvidenceBundle],
    *,
    max_items: int = 2,
    query_text: str | None = None,
) -> list[EvidenceBundle]:
    """Return the paper-level evidence bundles used to ground the baseline answer."""

    if max_items <= 0:
        return []
    if len(bundles) <= max_items:
        return bundles[:max_items]

    selected: list[EvidenceBundle] = [bundles[0]]
    remaining = list(bundles[1:])

    query_anchor = _select_query_anchor_bundle(
        remaining,
        query_text=query_text,
    )
    if query_anchor is not None:
        selected.append(query_anchor)
        remaining = [
            bundle for bundle in remaining if bundle.paper.corpus_id != query_anchor.paper.corpus_id
        ]

    selected.extend(itertools.islice(remaining, max_items - len(selected)))
    return selected[:max_items]


def _select_query_anchor_bundle(
    bundles: list[EvidenceBundle],
    *,
    query_text: str | None,
) -> EvidenceBundle | None:
    query_key = normalize_title_key(query_text)
    if not query_key:
        return None

    exact_title_matches = [
        bundle
        for bundle in bundles
        if normalize_title_key(bundle.paper.title) == query_key
    ]
    if not exact_title_matches:
        return None

    return max(
        exact_title_matches,
        key=lambda bundle: (
            bundle.paper.title_similarity,
            bundle.paper.lexical_score,
            -bundle.rank,
            bundle.score,
        ),
    )
