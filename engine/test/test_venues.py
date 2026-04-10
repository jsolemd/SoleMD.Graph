"""Tests for app.corpus.venues — NLM journal list and DuckDB helpers."""

from __future__ import annotations

import re
from unittest.mock import MagicMock, patch

import pytest

from app.corpus.venues import (
    _VALID_TABLE_NAME,
    _clean_venue,
    is_domain_venue,
    load_nlm_venues,
    register_duckdb_helpers,
)


# ── _clean_venue ───────────────────────────────────────────────


class TestCleanVenue:
    """Tests for venue name normalization."""

    def test_lowercase(self):
        assert _clean_venue("Nature Neuroscience") == "nature neuroscience"

    def test_strip_whitespace(self):
        assert _clean_venue("  some journal  ") == "some journal"

    def test_strip_trailing_dot(self):
        assert _clean_venue("J Neurosci.") == "j neurosci"

    def test_strip_leading_the(self):
        assert _clean_venue("The Lancet Psychiatry") == "lancet psychiatry"

    def test_strip_subtitle_after_colon(self):
        assert _clean_venue("Brain: A Journal of Neurology") == "brain"

    def test_strip_parenthetical(self):
        assert _clean_venue("Neurology (Minneap)") == "neurology"

    def test_strip_accents(self):
        assert _clean_venue("Revista de Saúde Pública") == "revista de saude publica"

    def test_combined_normalization(self):
        assert _clean_venue("The Journal of Neuroscience: Official Publication.") == (
            "journal of neuroscience"
        )

    def test_empty_string(self):
        assert _clean_venue("") == ""

    def test_already_clean(self):
        assert _clean_venue("brain research") == "brain research"


# ── _VALID_TABLE_NAME ──────────────────────────────────────────


class TestValidTableName:
    """Tests for the table name validation regex."""

    @pytest.mark.parametrize(
        "name",
        ["nlm_venues", "my_table", "_private", "a", "table123", "t_1_2"],
    )
    def test_valid_names(self, name: str):
        assert _VALID_TABLE_NAME.match(name) is not None

    @pytest.mark.parametrize(
        "name",
        [
            "123table",      # starts with digit
            "NLM_VENUES",    # uppercase
            "my-table",      # hyphen
            "table name",    # space
            "drop;--",       # SQL injection attempt
            "",              # empty
            "my.table",      # dot
            "table$1",       # special char
        ],
    )
    def test_invalid_names(self, name: str):
        assert _VALID_TABLE_NAME.match(name) is None


# ── load_nlm_venues ───────────────────────────────────────────


class TestLoadNlmVenues:
    """Tests for NLM journal loading."""

    def test_returns_set_of_strings(self):
        """Mock the JSON file to verify return structure."""
        mock_journals = [
            {"title": "Brain Research", "medline_abbr": "Brain Res"},
            {"title": "Neurology", "medline_abbr": "Neurology"},
        ]
        # Clear lru_cache before and after this test
        load_nlm_venues.cache_clear()
        with patch("builtins.open", create=True) as mock_open:
            import json as _json

            mock_open.return_value.__enter__ = MagicMock(
                return_value=MagicMock(read=MagicMock(return_value=_json.dumps(mock_journals)))
            )
            mock_open.return_value.__exit__ = MagicMock(return_value=False)
            with patch("app.corpus.venues.json.load", return_value=mock_journals):
                result = load_nlm_venues()

        assert isinstance(result, set)
        assert "brain research" in result
        assert "brain res" in result
        assert "neurology" in result
        load_nlm_venues.cache_clear()

    def test_filters_short_abbreviations(self):
        """Abbreviations with len <= 2 should be excluded."""
        mock_journals = [
            {"title": "JN", "medline_abbr": "JN"},  # too short
            {"title": "Brain Research", "medline_abbr": "Brain Res"},
        ]
        load_nlm_venues.cache_clear()
        with patch("builtins.open", create=True):
            with patch("app.corpus.venues.json.load", return_value=mock_journals):
                result = load_nlm_venues()

        assert "jn" not in result
        assert "brain research" in result
        load_nlm_venues.cache_clear()

    def test_handles_missing_fields(self):
        """Journals with missing title or medline_abbr should not crash."""
        mock_journals = [
            {"title": None, "medline_abbr": "Neurology"},
            {"title": "Brain", "medline_abbr": None},
            {},
        ]
        load_nlm_venues.cache_clear()
        with patch("builtins.open", create=True):
            with patch("app.corpus.venues.json.load", return_value=mock_journals):
                result = load_nlm_venues()

        assert "neurology" in result
        assert "brain" in result  # len("brain") == 5 > 2, so included
        load_nlm_venues.cache_clear()


# ── register_duckdb_helpers ────────────────────────────────────


class TestRegisterDuckdbHelpers:
    """Tests for DuckDB venue registration."""

    def test_rejects_invalid_table_name(self):
        mock_con = MagicMock()
        with pytest.raises(ValueError, match="Invalid table_name"):
            register_duckdb_helpers(mock_con, table_name="DROP TABLE; --")

    def test_rejects_uppercase_table_name(self):
        mock_con = MagicMock()
        with pytest.raises(ValueError, match="Invalid table_name"):
            register_duckdb_helpers(mock_con, table_name="NLM_Venues")

    def test_creates_macro_and_table(self):
        """Verify that register_duckdb_helpers creates the clean_venue macro and table."""
        mock_con = MagicMock()
        mock_venues = {"brain research", "neurology"}

        with patch("app.corpus.venues.load_nlm_venues", return_value=mock_venues):
            register_duckdb_helpers(mock_con, table_name="nlm_venues")

        # Should have called execute at least twice: macro + table creation
        assert mock_con.execute.call_count >= 2
        macro_sql = mock_con.execute.call_args_list[0].args[0]
        assert "strip_accents" in macro_sql
        # executemany should insert the venues
        mock_con.executemany.assert_called_once()
        insert_sql, rows = mock_con.executemany.call_args.args
        assert "INSERT INTO nlm_venues" in insert_sql
        assert len(rows) == 2
