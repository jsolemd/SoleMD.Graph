"""Shared normalized text-alignment helpers for runtime selection and grounding."""

from __future__ import annotations

from dataclasses import dataclass
from difflib import SequenceMatcher

from app.rag.query_enrichment import normalize_query_text


@dataclass(frozen=True, slots=True)
class TextAlignmentScore:
    normalized_candidate: str
    normalized_query: str
    containment: int = 0
    token_overlap: int = 0
    query_coverage: float = 0.0
    candidate_focus: float = 0.0
    longest_common_span: int = 0


def score_text_alignment(
    candidate_text: str | None,
    query_text: str | None,
) -> TextAlignmentScore:
    """Score normalized alignment between a candidate text surface and a query surface."""

    normalized_candidate = normalize_query_text(candidate_text or "")
    normalized_query = normalize_query_text(query_text or "")
    if not normalized_candidate or not normalized_query:
        return TextAlignmentScore(
            normalized_candidate=normalized_candidate,
            normalized_query=normalized_query,
        )

    candidate_tokens = normalized_candidate.split()
    query_tokens = normalized_query.split()
    if not candidate_tokens or not query_tokens:
        return TextAlignmentScore(
            normalized_candidate=normalized_candidate,
            normalized_query=normalized_query,
        )

    candidate_terms = set(candidate_tokens)
    query_terms = set(query_tokens)
    token_overlap = len(candidate_terms & query_terms)
    if token_overlap <= 0:
        return TextAlignmentScore(
            normalized_candidate=normalized_candidate,
            normalized_query=normalized_query,
        )

    containment = int(
        normalized_query in normalized_candidate or normalized_candidate in normalized_query
    )
    longest_common_span = SequenceMatcher(
        a=query_tokens,
        b=candidate_tokens,
        autojunk=False,
    ).find_longest_match(
        0,
        len(query_tokens),
        0,
        len(candidate_tokens),
    ).size

    return TextAlignmentScore(
        normalized_candidate=normalized_candidate,
        normalized_query=normalized_query,
        containment=containment,
        token_overlap=token_overlap,
        query_coverage=token_overlap / max(len(query_terms), 1),
        candidate_focus=token_overlap / max(len(candidate_terms), 1),
        longest_common_span=longest_common_span,
    )
