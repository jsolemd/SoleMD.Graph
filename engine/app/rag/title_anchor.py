"""Shared title-anchor scoring for exact and strong prefix title matches."""

from __future__ import annotations

from app.rag.query_enrichment import normalize_title_key

MIN_PREFIX_ANCHOR_CHARS = 48
MIN_PREFIX_ANCHOR_COVERAGE = 0.6
PREFIX_ANCHOR_BASE_SCORE = 0.9
PREFIX_ANCHOR_MAX_SCORE = 0.96
PREFIX_RANGE_SENTINEL = "\uffff"


def prefix_range_upper_bound(prefix: str | None) -> str:
    """Return an inclusive-high upper bound for btree-friendly text prefix scans."""

    normalized_prefix = prefix or ""
    if not normalized_prefix:
        return ""
    return f"{normalized_prefix}{PREFIX_RANGE_SENTINEL}"


def compute_title_anchor_score(
    *,
    query_text: str | None,
    title_text: str | None,
) -> float:
    """Return a strong title-anchor score for exact or long left-prefix matches."""

    query_key = normalize_title_key(query_text)
    title_key = normalize_title_key(title_text)
    if not query_key or not title_key:
        return 0.0
    if title_key == query_key:
        return 1.0
    if len(query_key) < MIN_PREFIX_ANCHOR_CHARS:
        return 0.0
    if not title_key.startswith(query_key):
        return 0.0

    remainder = title_key[len(query_key) :]
    if remainder and not remainder.startswith(" "):
        return 0.0

    coverage = len(query_key) / len(title_key)
    if coverage < MIN_PREFIX_ANCHOR_COVERAGE:
        return 0.0

    coverage_delta = min(
        1.0,
        (coverage - MIN_PREFIX_ANCHOR_COVERAGE) / (1.0 - MIN_PREFIX_ANCHOR_COVERAGE),
    )
    return PREFIX_ANCHOR_BASE_SCORE + (
        (PREFIX_ANCHOR_MAX_SCORE - PREFIX_ANCHOR_BASE_SCORE) * coverage_delta
    )


def has_strong_title_anchor(
    *,
    query_text: str | None,
    title_text: str | None,
) -> bool:
    """Return True when the query strongly anchors to the provided title."""

    return compute_title_anchor_score(query_text=query_text, title_text=title_text) > 0.0
