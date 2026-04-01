"""Shared section-label normalization and chunk contextualization helpers."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from app.rag.parse_contract import SectionRole


class SectionLike(Protocol):
    section_ordinal: int
    parent_section_ordinal: int | None
    display_label: str | None
    section_role: object


REPEATED_NONSTRUCTURAL_SECTION_LABEL_THRESHOLD = 3
_ROMAN_NUMERAL_TOKENS = frozenset(
    {
        "i",
        "ii",
        "iii",
        "iv",
        "v",
        "vi",
        "vii",
        "viii",
        "ix",
        "x",
    }
)
_STRUCTURAL_HEADING_LABELS = frozenset(
    {
        "abstract",
        "background",
        "introduction",
        "intro",
        "methods",
        "materials and methods",
        "materials methods",
        "results",
        "results and discussion",
        "discussion",
        "conclusion",
        "conclusions",
        "supplement",
        "supplementary material",
        "supplementary materials",
        "reference",
        "references",
        "acknowledgement",
        "acknowledgements",
        "acknowledgment",
        "acknowledgments",
        "author contribution",
        "author contributions",
        "contributors",
        "contributor",
        "funding",
        "data availability",
        "availability of data",
        "ethics",
        "ethical consideration",
        "ethical considerations",
        "conflict of interest",
        "conflicts of interest",
        "competing interest",
        "competing interests",
        "abbreviation",
        "abbreviations",
        "keyword",
        "keywords",
        "experimental section",
    }
)
_NONCONTEXTUAL_LABELS = frozenset(
    {
        "fig",
        "figure",
        "table",
        "figure caption",
        "table caption",
        "associated content",
        "supporting information",
        "lead author biography",
        "author biography",
        "abbr",
    }
)
_MEDIA_SCAFFOLD_LABELS = frozenset(
    {
        "fig",
        "figure",
        "table",
        "figure caption",
        "table caption",
    }
)
_NOISY_REPEATED_LABELS = frozenset(
    {
        "author biography",
        "clinical data policy information about clinical studies",
        "clinical trial registration",
        "correction",
        "data access links",
        "data deposition",
        "ethics oversight",
        "files in database submission",
        "lead author biography",
        "nature portfolio reporting summary",
        "novel plant genotypes",
        "software",
        "specify in tesla",
    }
)


@dataclass(frozen=True, slots=True)
class SectionContext:
    heading_path: tuple[str, ...] = ()


def normalize_label_tokens(value: str | None) -> list[str]:
    if not value:
        return []
    lowered = value.lower()
    cleaned = "".join(ch if ch.isalnum() or ch.isspace() else " " for ch in lowered)
    return cleaned.split()


def normalize_label_text(value: str | None) -> str:
    return " ".join(normalize_label_tokens(value))


def _strip_leading_enumerator_tokens(normalized_value: str) -> str:
    tokens = normalized_value.split()
    while tokens and (tokens[0].isdigit() or tokens[0] in _ROMAN_NUMERAL_TOKENS):
        tokens = tokens[1:]
    return " ".join(tokens)


def normalize_heading_label(value: str | None) -> str:
    normalized = normalize_label_text(value)
    if not normalized:
        return ""
    return _strip_leading_enumerator_tokens(normalized)


def looks_like_structural_heading(value: str | None) -> bool:
    return normalize_heading_label(value) in _STRUCTURAL_HEADING_LABELS


def looks_like_noncontextual_section_label(value: str | None) -> bool:
    normalized = normalize_heading_label(value)
    if not normalized:
        return False
    if normalized in _NONCONTEXTUAL_LABELS:
        return True
    if normalized.endswith("cohort") and len(normalized.split()) <= 3:
        return True
    return (
        normalized.startswith("journal of ")
        or normalized.startswith("fig ")
        or normalized.startswith("figure ")
        or normalized.startswith("table ")
        or normalized.endswith(" biography")
    )


def looks_like_media_scaffold_label(value: str | None) -> bool:
    normalized = normalize_heading_label(value)
    if not normalized:
        return False
    return (
        normalized in _MEDIA_SCAFFOLD_LABELS
        or normalized.startswith("fig ")
        or normalized.startswith("figure ")
        or normalized.startswith("table ")
    )


def looks_like_noisy_repeated_section_label(value: str | None) -> bool:
    raw_value = (value or "").strip()
    normalized = normalize_heading_label(value)
    if not normalized:
        return False
    if raw_value.startswith("."):
        return True
    return (
        normalized.startswith("journal of ")
        or normalized.endswith(" biography")
        or normalized in _NOISY_REPEATED_LABELS
        or normalized in {"lead author biography", "author biography"}
    )


def repeated_nonstructural_section_label_counts(
    sections: Sequence[SectionLike],
    *,
    threshold: int = REPEATED_NONSTRUCTURAL_SECTION_LABEL_THRESHOLD,
) -> dict[str, int]:
    sections_by_label: dict[str, list[SectionLike]] = {}
    for section in sections:
        normalized = normalize_heading_label(section.display_label)
        if not normalized:
            continue
        sections_by_label.setdefault(normalized, []).append(section)

    counts: dict[str, int] = {}
    for normalized, occurrences in sections_by_label.items():
        occurrence_count = len(occurrences)
        if occurrence_count < threshold:
            continue
        if looks_like_structural_heading(normalized):
            continue
        if looks_like_media_scaffold_label(normalized):
            continue
        if not _should_flag_repeated_nonstructural_label(
            normalized,
            occurrences=occurrences,
        ):
            continue
        counts[normalized] = occurrence_count
    return counts


def _should_flag_repeated_nonstructural_label(
    normalized_label: str,
    *,
    occurrences: Sequence[SectionLike],
) -> bool:
    if all(
        str(getattr(section, "section_role", "")).lower() == str(SectionRole.FRONT_MATTER)
        for section in occurrences
    ):
        return False
    if looks_like_noisy_repeated_section_label(normalized_label):
        return True
    if any(
        looks_like_noisy_repeated_section_label(section.display_label)
        for section in occurrences
    ):
        return True
    return False


def repeated_nonstructural_section_labels(
    sections: Sequence[SectionLike],
    *,
    threshold: int = REPEATED_NONSTRUCTURAL_SECTION_LABEL_THRESHOLD,
) -> set[str]:
    return set(
        repeated_nonstructural_section_label_counts(
            sections,
            threshold=threshold,
        )
    )


def is_contextual_section_label(
    value: str | None,
    *,
    repeated_nonstructural_labels: set[str] | None = None,
) -> bool:
    normalized = normalize_heading_label(value)
    if not normalized:
        return False
    if normalized in _ROMAN_NUMERAL_TOKENS:
        return False
    if len(normalized) == 1 and normalized.isalpha():
        return False
    if not any(ch.isalpha() for ch in normalized):
        return False
    if looks_like_noncontextual_section_label(normalized):
        return False
    return normalized not in (repeated_nonstructural_labels or set())


def build_section_contexts(sections: Sequence[SectionLike]) -> dict[int, SectionContext]:
    by_ordinal = {section.section_ordinal: section for section in sections}
    repeated_labels = repeated_nonstructural_section_labels(sections)
    contexts: dict[int, SectionContext] = {}
    previous_contextual_path: tuple[str, ...] = ()

    for section in sorted(sections, key=lambda item: item.section_ordinal):
        ancestry: list[SectionLike] = []
        seen_ordinals: set[int] = set()
        current: SectionLike | None = section
        while current is not None and current.section_ordinal not in seen_ordinals:
            ancestry.append(current)
            seen_ordinals.add(current.section_ordinal)
            parent_ordinal = current.parent_section_ordinal
            current = by_ordinal.get(parent_ordinal) if parent_ordinal is not None else None

        heading_path: list[str] = []
        previous_normalized: str | None = None
        for ancestor in reversed(ancestry):
            label = (ancestor.display_label or "").strip()
            normalized = normalize_label_text(label)
            if not is_contextual_section_label(
                label,
                repeated_nonstructural_labels=repeated_labels,
            ):
                continue
            if normalized == previous_normalized:
                continue
            heading_path.append(label)
            previous_normalized = normalized

        if not heading_path and previous_contextual_path:
            normalized_label = normalize_heading_label(section.display_label)
            has_alpha = any(ch.isalpha() for ch in normalized_label)
            is_enumerator_label = normalized_label in _ROMAN_NUMERAL_TOKENS or (
                len(normalized_label) == 1 and normalized_label.isalpha()
            )
            if (
                not has_alpha
                or is_enumerator_label
                or looks_like_noncontextual_section_label(section.display_label)
            ):
                heading_path = list(previous_contextual_path)

        contexts[section.section_ordinal] = SectionContext(
            heading_path=tuple(heading_path),
        )
        if heading_path:
            previous_contextual_path = tuple(heading_path)

    return contexts
