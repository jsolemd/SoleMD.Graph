"""Shared chunk-quality thresholds and low-value fragment checks."""

from __future__ import annotations

import re

from app.rag_ingest.section_context import normalize_heading_label

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
_TERMINAL_PUNCTUATION_RE = re.compile(r'[.!?]["\')\]]?$')
_QUOTE_ATTRIBUTION_RE = re.compile(r'[.!?]["\')\]]?\s*[-–—]\s*[A-Za-z][A-Za-z .-]+$')
_REPORTING_OR_METADATA_PREFIXES = (
    "reply",
    "reviewer",
    "conflict of interest",
    "conflicts of interest",
    "competing interests",
    "declaration of competing interest",
    "author biography",
    "lead author biography",
    "supplementary material",
    "supplementary data",
)
_TRUNCATION_ENDINGS = frozenset(
    {
        "appendix",
        "approximately",
        "as",
        "at",
        "by",
        "for",
        "from",
        "in",
        "of",
        "or",
        "the",
        "to",
        "with",
    }
)


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


def is_weak_short_narrative_chunk_text(value: str | None) -> bool:
    if not value:
        return True
    stripped = value.strip()
    if not stripped:
        return True
    if is_low_value_narrative_text(stripped):
        return True

    heading_prefix, body_text = _split_heading_prefix(stripped)
    normalized_prefix = normalize_heading_label(heading_prefix)
    normalized_body = normalize_chunk_quality_text(body_text)
    if normalized_prefix.startswith(_REPORTING_OR_METADATA_PREFIXES):
        return True
    if normalized_body.startswith(
        (
            "we have revised the manuscript",
            "the online version contains supplementary material",
            "authors declare no conflict",
            "author declares no conflict",
        )
    ):
        return True
    if _looks_like_structured_or_table_residue(body_text if heading_prefix else stripped):
        return True
    if _looks_like_complete_sentence(body_text):
        return False
    if normalized_body.split() and normalized_body.split()[-1] in _TRUNCATION_ENDINGS:
        return True
    if any(character.isdigit() for character in body_text.rstrip()[-1:]):
        return not _looks_like_informative_quantitative_statement(normalized_body)
    return True


def _split_heading_prefix(value: str) -> tuple[str, str]:
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    if len(lines) < 2:
        return "", value.strip()
    return lines[0], " ".join(lines[1:]).strip()


def _looks_like_complete_sentence(value: str) -> bool:
    normalized = value.strip()
    if not normalized:
        return False
    return bool(
        _TERMINAL_PUNCTUATION_RE.search(normalized) or _QUOTE_ATTRIBUTION_RE.search(normalized)
    )


def _looks_like_structured_or_table_residue(value: str) -> bool:
    lines = [line.strip() for line in value.splitlines() if line.strip()]
    if len(lines) >= 3:
        return True
    if "\t" in value or "•" in value:
        return True
    if any(line.endswith(":") for line in lines):
        return True
    if lines and any(
        len(line.split()) <= 5
        and any(character.isalpha() for character in line)
        and line.upper() == line
        for line in lines
    ):
        return True
    return False


def _looks_like_informative_quantitative_statement(normalized_value: str) -> bool:
    tokens = normalized_value.split()
    if len(tokens) < 5:
        return False
    alphabetic_tokens = [
        token for token in tokens if any(character.isalpha() for character in token)
    ]
    if len(alphabetic_tokens) < 4:
        return False
    return not all(len(token) <= 2 for token in alphabetic_tokens)
