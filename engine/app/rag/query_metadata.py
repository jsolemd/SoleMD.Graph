"""Structured metadata hint extraction for citation-like biomedical queries."""

from __future__ import annotations

import re
from dataclasses import dataclass

_WHITESPACE_RE = re.compile(r"\s+")
_YEAR_RE = re.compile(r"\b(19\d{2}|20\d{2})\b")
_MAX_METADATA_PREFIX_TOKENS = 6

_PUBLICATION_TYPE_PREFIXES: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "study evidence",
        (),
    ),
    (
        "randomized controlled trial evidence",
        ("RandomizedControlledTrial", "ClinicalTrial"),
    ),
    (
        "randomized trial evidence",
        ("RandomizedControlledTrial", "ClinicalTrial"),
    ),
    (
        "systematic review evidence",
        ("SystematicReview", "Review"),
    ),
    (
        "clinical trial evidence",
        ("ClinicalTrial", "RandomizedControlledTrial"),
    ),
    (
        "meta-analysis evidence",
        ("MetaAnalysis", "SystematicReview"),
    ),
    (
        "meta analysis evidence",
        ("MetaAnalysis", "SystematicReview"),
    ),
    (
        "cohort study evidence",
        ("CohortStudy",),
    ),
    (
        "case control evidence",
        ("CaseControlStudy",),
    ),
    (
        "review evidence",
        ("Review", "SystematicReview", "MetaAnalysis"),
    ),
)


@dataclass(frozen=True, slots=True)
class QueryMetadataHints:
    """Structured metadata cues extracted from a free-text retrieval query."""

    topic_query: str | None = None
    year_hint: int | None = None
    author_hint: str | None = None
    journal_hint: str | None = None
    requested_publication_types: tuple[str, ...] = ()
    matched_cues: tuple[str, ...] = ()

    @property
    def has_structured_signal(self) -> bool:
        return bool(
            self.year_hint is not None
            or self.author_hint
            or self.journal_hint
            or self.requested_publication_types
            or self.matched_cues
        )

    @property
    def has_searchable_metadata_filters(self) -> bool:
        return bool(
            self.year_hint is not None
            or self.author_hint
            or self.journal_hint
            or self.requested_publication_types
        )

    @property
    def has_precise_citation_filters(self) -> bool:
        return bool(
            self.year_hint is not None
            or self.author_hint
            or self.journal_hint
        )

    @property
    def has_evidence_type_filters(self) -> bool:
        return bool(self.requested_publication_types)


def _normalize_space(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", text).strip()


def _split_metadata_year_prefix(
    text: str,
) -> tuple[str | None, int | None, str]:
    match = _YEAR_RE.search(text)
    if match is None:
        return None, None, text
    prefix = _normalize_space(text[: match.start()].strip(" ,;:-"))
    suffix = _normalize_space(text[match.end() :].strip(" ,;:-"))
    if (
        not prefix
        or not suffix
        or len(prefix.split()) > _MAX_METADATA_PREFIX_TOKENS
    ):
        return None, None, text
    return prefix, int(match.group(1)), suffix


def _publication_type_prompt_hints(text: str) -> tuple[tuple[str, ...], tuple[str, ...], str]:
    lowered = text.casefold()
    for prefix, publication_types in _PUBLICATION_TYPE_PREFIXES:
        if not lowered.startswith(prefix):
            continue
        stripped = _normalize_space(text[len(prefix) :].strip(" ,;:-"))
        return publication_types, (prefix.replace(" ", "_"),), stripped
    return (), (), text


def _author_hint(prefix: str | None) -> str | None:
    if not prefix:
        return None
    tokens = prefix.split()
    if len(tokens) != 1:
        return None
    if not all(any(char.isalpha() for char in token) for token in tokens):
        return None
    return prefix


def _journal_hint(prefix: str | None) -> str | None:
    if not prefix:
        return None
    tokens = prefix.split()
    if len(tokens) >= 2:
        return prefix
    token = tokens[0]
    if token.isupper() and len(token) >= 3:
        return prefix
    return None


def extract_query_metadata_hints(text: str | None) -> QueryMetadataHints:
    """Extract citation-style metadata cues from a query.

    Supported shapes:
    - ``Surname 2018 topic terms``
    - ``Journal Name 2018 topic terms``
    - ``study evidence topic terms``
    - ``clinical trial evidence topic terms``
    - ``meta-analysis evidence topic terms``
    """

    normalized = _normalize_space(text or "")
    if not normalized:
        return QueryMetadataHints()

    requested_publication_types, prefix_cues, working_text = _publication_type_prompt_hints(
        normalized
    )
    prefix_text, year_hint, topic_text = _split_metadata_year_prefix(working_text)
    author_hint = _author_hint(prefix_text)
    journal_hint = _journal_hint(prefix_text)
    topic_query = _normalize_space(topic_text or working_text)
    if not topic_query:
        topic_query = None

    matched_cues = tuple(
        cue
        for cue in (
            *prefix_cues,
            "author" if author_hint else None,
            "journal" if journal_hint else None,
            "year" if year_hint is not None else None,
        )
        if cue
    )

    return QueryMetadataHints(
        topic_query=topic_query,
        year_hint=year_hint,
        author_hint=author_hint,
        journal_hint=journal_hint,
        requested_publication_types=requested_publication_types,
        matched_cues=matched_cues,
    )
