"""Tests for affiliation normalization helpers."""

from __future__ import annotations

from app.corpus.affiliations import _build_affiliation_query
from app.corpus.affiliations import _normalize_affiliation_query


def test_normalize_affiliation_query_collapses_whitespace() -> None:
    assert _normalize_affiliation_query("  A  B   C  ") == "a b c"


def test_build_affiliation_query_prefers_richer_raw_affiliation() -> None:
    author = {
        "raw_affiliations": [
            "Department of Psychiatry, University of Somewhere, Seattle, USA"
        ],
        "institution": "University of Somewhere",
        "department": "Department of Psychiatry",
        "city": "Seattle",
        "country": "USA",
    }

    result = _build_affiliation_query(author)

    assert result == "Department of Psychiatry, University of Somewhere, Seattle, USA"


def test_build_affiliation_query_uses_structured_parts_when_raw_missing() -> None:
    author = {
        "raw_affiliations": [],
        "institution": "University of Somewhere",
        "department": "Department of Psychiatry",
        "city": "Seattle",
        "country": "USA",
    }

    result = _build_affiliation_query(author, preferred_institution="University of Somewhere")

    assert result == "University of Somewhere, Department of Psychiatry, Seattle, USA"
