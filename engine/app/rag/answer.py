"""Answer synthesis helpers for the baseline evidence response."""

from __future__ import annotations

import itertools
from dataclasses import dataclass

from app.rag.models import EvidenceBundle
from app.rag.query_enrichment import normalize_title_key
from app.rag.types import (
    DEFAULT_ANSWER_MODEL,
    EvidenceIntent,
    QueryRetrievalProfile,
    RetrievalChannel,
)


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
    query_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    selected_corpus_id: int | None = None,
) -> tuple[str | None, str | None]:
    """Generate a lightweight extractive answer from the top evidence bundles."""

    payload = build_baseline_answer_payload(
        bundles,
        evidence_intent=evidence_intent,
        max_items=max_items,
        query_text=query_text,
        query_profile=query_profile,
        selected_corpus_id=selected_corpus_id,
    )
    return payload.text, payload.model


def build_baseline_answer_payload(
    bundles: list[EvidenceBundle],
    *,
    evidence_intent: EvidenceIntent | None = None,
    max_items: int = 2,
    query_text: str | None = None,
    query_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    selected_corpus_id: int | None = None,
) -> BaselineAnswerPayload:
    """Return the baseline answer text plus per-bundle grounding segments."""

    grounding_bundles = select_answer_grounding_bundles(
        bundles,
        max_items=max_items,
        query_text=query_text,
        query_profile=query_profile,
        selected_corpus_id=selected_corpus_id,
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
    query_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    selected_corpus_id: int | None = None,
) -> list[EvidenceBundle]:
    """Return the paper-level evidence bundles used to ground the baseline answer."""

    if max_items <= 0:
        return []
    if len(bundles) <= max_items:
        return bundles[:max_items]

    selected: list[EvidenceBundle] = []
    remaining = list(bundles)

    if query_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        _append_selected_bundle(selected, remaining, _select_chunk_anchor_bundle(remaining))
    elif (
        query_profile == QueryRetrievalProfile.TITLE_LOOKUP
        and selected_corpus_id is not None
    ):
        _append_selected_bundle(
            selected,
            remaining,
            _select_bundle_by_corpus_id(remaining, selected_corpus_id),
        )
    else:
        _append_selected_bundle(selected, remaining, bundles[0])

    if (
        selected_corpus_id is not None
        and query_profile != QueryRetrievalProfile.TITLE_LOOKUP
    ):
        _append_selected_bundle(
            selected,
            remaining,
            _select_bundle_by_corpus_id(remaining, selected_corpus_id),
        )

    query_anchor = _select_query_anchor_bundle(
        remaining,
        query_text=query_text,
    )
    _append_selected_bundle(selected, remaining, query_anchor)

    if query_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        _append_selected_bundle(selected, remaining, _select_chunk_anchor_bundle(remaining))

    selected.extend(itertools.islice(remaining, max_items - len(selected)))
    return selected[:max_items]


def _select_chunk_anchor_bundle(bundles: list[EvidenceBundle]) -> EvidenceBundle | None:
    chunk_supported = [
        bundle
        for bundle in bundles
        if (
            bundle.snippet_channel == RetrievalChannel.CHUNK_LEXICAL
            or RetrievalChannel.CHUNK_LEXICAL in bundle.matched_channels
            or bundle.paper.chunk_lexical_score > 0
        )
    ]
    if not chunk_supported:
        return None

    return max(
        chunk_supported,
        key=lambda bundle: (
            bundle.paper.chunk_lexical_score,
            bundle.paper.lexical_score,
            -bundle.rank,
            bundle.score,
        ),
    )


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


def _select_bundle_by_corpus_id(
    bundles: list[EvidenceBundle],
    corpus_id: int,
) -> EvidenceBundle | None:
    for bundle in bundles:
        if bundle.paper.corpus_id == corpus_id:
            return bundle
    return None


def _append_selected_bundle(
    selected: list[EvidenceBundle],
    remaining: list[EvidenceBundle],
    bundle: EvidenceBundle | None,
) -> None:
    if bundle is None:
        return
    if any(item.paper.corpus_id == bundle.paper.corpus_id for item in selected):
        return
    selected.append(bundle)
    remaining[:] = [
        item for item in remaining if item.paper.corpus_id != bundle.paper.corpus_id
    ]
