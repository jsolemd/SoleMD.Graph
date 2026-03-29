"""Tests for app.corpus.filter — domain filtering logic."""

from __future__ import annotations

import pytest

from app.corpus.filter import (
    COLUMNS,
    VENUE_PATTERNS,
    _build_filter_query,
    _get_shards,
    _pattern_sql,
    _read_expr,
)


# ── _read_expr ─────────────────────────────────────────────────


class TestReadExpr:
    """Tests that _read_expr delegates to _etl.read_expr with filter COLUMNS."""

    def test_includes_all_columns(self):
        result = _read_expr("data/papers-0.jsonl.gz")
        for col in COLUMNS:
            assert col in result

    def test_includes_source_path(self):
        result = _read_expr("data/papers-0.jsonl.gz")
        assert "data/papers-0.jsonl.gz" in result

    def test_escapes_quotes_in_source(self):
        result = _read_expr("data/it's.jsonl.gz")
        assert "it''s" in result


# ── VENUE_PATTERNS ─────────────────────────────────────────────


class TestVenuePatterns:
    """Tests for the venue pattern constants."""

    def test_is_nonempty_list(self):
        assert isinstance(VENUE_PATTERNS, list)
        assert len(VENUE_PATTERNS) > 0

    def test_all_lowercase(self):
        for p in VENUE_PATTERNS:
            assert p == p.lower(), f"Pattern should be lowercase: {p}"

    def test_most_contain_wildcard(self):
        """Most patterns use SQL LIKE wildcards (%). Exact matches are also valid."""
        wildcarded = [p for p in VENUE_PATTERNS if "%" in p]
        assert len(wildcarded) > len(VENUE_PATTERNS) // 2, "Most patterns should use wildcards"

    def test_covers_known_journals(self):
        """Verify patterns cover expected domain journals."""
        expected_stems = [
            "frontiers in neuro",
            "brain research",
            "neuropharmacol",
            "psychopharmacol",
            "neuropsychiatr",
        ]
        for stem in expected_stems:
            found = any(stem in p for p in VENUE_PATTERNS)
            assert found, f"No pattern covers '{stem}'"


# ── _pattern_sql ───────────────────────────────────────────────


class TestPatternSql:
    """Tests for the SQL LIKE clause builder."""

    def test_returns_parenthesized_expression(self):
        result = _pattern_sql("cv")
        assert result.startswith("(")
        assert result.endswith(")")

    def test_uses_or_clauses(self):
        result = _pattern_sql("cv")
        assert " OR " in result

    def test_uses_like_operator(self):
        result = _pattern_sql("cv")
        assert "LIKE" in result

    def test_uses_given_alias(self):
        result = _pattern_sql("my_col")
        assert "my_col LIKE" in result

    def test_one_clause_per_pattern(self):
        result = _pattern_sql("cv")
        like_count = result.count("LIKE")
        assert like_count == len(VENUE_PATTERNS)

    def test_all_patterns_represented(self):
        result = _pattern_sql("x")
        for p in VENUE_PATTERNS:
            assert f"'{p}'" in result


# ── _build_filter_query ───────────────────────────────────────


class TestBuildFilterQuery:
    """Tests for the main filter SQL query builder."""

    def test_returns_valid_sql_structure(self):
        query = _build_filter_query("data/test.jsonl.gz")
        assert "WITH base AS" in query
        assert "FROM base b" in query
        assert "LEFT JOIN nlm_venues" in query
        assert "LEFT JOIN vocab_pmids" in query

    def test_includes_admission_reason_case(self):
        query = _build_filter_query("data/test.jsonl.gz")
        assert "journal_and_vocab" in query
        assert "journal_match" in query
        assert "pattern_match" in query
        assert "vocab_entity_match" in query

    def test_source_embedded_in_query(self):
        query = _build_filter_query("data/papers-42.jsonl.gz")
        assert "papers-42" in query

    def test_requires_pmid_and_corpusid(self):
        query = _build_filter_query("data/test.jsonl.gz")
        assert "IS NOT NULL" in query


# ── COLUMNS ────────────────────────────────────────────────────


class TestColumns:
    """Tests for the DuckDB column spec."""

    def test_required_columns_present(self):
        required = {"corpusid", "externalids", "title", "year", "venue", "citationcount"}
        assert required.issubset(set(COLUMNS.keys()))

    def test_column_types_are_strings(self):
        for col, dtype in COLUMNS.items():
            assert isinstance(dtype, str), f"Column {col} type should be str"
