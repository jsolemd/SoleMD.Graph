"""Shared section-label normalization and chunk contextualization helpers."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class SectionLike(Protocol):
    section_ordinal: int
    parent_section_ordinal: int | None
    display_label: str | None


REPEATED_NONSTRUCTURAL_SECTION_LABEL_THRESHOLD = 3


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


def looks_like_structural_heading(value: str | None) -> bool:
    tokens = normalize_label_tokens(value)
    token_text = " ".join(tokens)
    return (
        "abstract" in tokens
        or "background" in tokens
        or "introduction" in tokens
        or token_text == "intro"
        or "method" in token_text
        or "materials and methods" in token_text
        or "result" in token_text
        or "discussion" in token_text
        or "discuss" in token_text
        or "conclusion" in token_text
        or "conclusions" in token_text
        or "supplement" in token_text
        or "reference" in token_text
        or "references" in token_text
        or "acknowledg" in token_text
        or "author contribution" in token_text
        or "author contributions" in token_text
        or token_text == "contributors"
        or "contributor" in token_text
        or "funding" in token_text
        or "data availability" in token_text
        or "availability of data" in token_text
        or "ethics" in token_text
        or "ethical consideration" in token_text
        or "ethical considerations" in token_text
        or "conflict" in token_text
        or "competing interest" in token_text
        or "competing interests" in token_text
        or "abbreviation" in token_text
        or "abbreviations" in token_text
        or "keyword" in token_text
        or "keywords" in token_text
        or token_text == "experimental section"
    )


def repeated_nonstructural_section_labels(
    sections: Sequence[SectionLike],
    *,
    threshold: int = REPEATED_NONSTRUCTURAL_SECTION_LABEL_THRESHOLD,
) -> set[str]:
    counts = Counter(
        normalized
        for section in sections
        if (normalized := normalize_label_text(section.display_label))
    )
    return {
        normalized
        for normalized, count in counts.items()
        if count >= threshold and not looks_like_structural_heading(normalized)
    }


def is_contextual_section_label(
    value: str | None,
    *,
    repeated_nonstructural_labels: set[str] | None = None,
) -> bool:
    normalized = normalize_label_text(value)
    if not normalized:
        return False
    if not any(ch.isalpha() for ch in normalized):
        return False
    return normalized not in (repeated_nonstructural_labels or set())


def build_section_contexts(sections: Sequence[SectionLike]) -> dict[int, SectionContext]:
    by_ordinal = {section.section_ordinal: section for section in sections}
    repeated_labels = repeated_nonstructural_section_labels(sections)
    contexts: dict[int, SectionContext] = {}

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

        contexts[section.section_ordinal] = SectionContext(
            heading_path=tuple(heading_path),
        )

    return contexts
