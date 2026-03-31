"""Shared chunk-quality thresholds and low-value fragment checks."""

from __future__ import annotations

import re


MIN_USEFUL_NARRATIVE_TOKENS = 15

LOW_VALUE_NARRATIVE_TEXTS = frozenset(
    {
        "not applicable",
        "n a",
        "na",
    }
)
LOW_VALUE_SINGLE_TOKEN_TEXTS = frozenset(
    {
        "a",
        "an",
        "our",
        "the",
    }
)
_NORMALIZE_TEXT_RE = re.compile(r"[^a-z0-9]+")


def normalize_chunk_quality_text(value: str | None) -> str:
    if not value:
        return ""
    normalized = _NORMALIZE_TEXT_RE.sub(" ", value.lower()).strip()
    return " ".join(normalized.split())


def is_low_value_narrative_text(value: str | None) -> bool:
    normalized = normalize_chunk_quality_text(value)
    if not normalized:
        return True
    if normalized in LOW_VALUE_NARRATIVE_TEXTS:
        return True
    tokens = normalized.split()
    return len(tokens) == 1 and tokens[0] in LOW_VALUE_SINGLE_TOKEN_TEXTS
