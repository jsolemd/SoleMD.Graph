"""Tests for app.corpus.vocab — vocabulary alias loading and PubTator3 streaming."""

from __future__ import annotations

import gzip
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.corpus.vocab import _MATCH_TYPES, _MIN_ALIAS_LEN, load_vocab_aliases, stream_pubtator_matches


# ── Constants ──────────────────────────────────────────────────


class TestConstants:
    def test_match_types_contains_expected(self):
        assert "Disease" in _MATCH_TYPES
        assert "Chemical" in _MATCH_TYPES
        assert "Gene" in _MATCH_TYPES

    def test_match_types_excludes_noisy(self):
        assert "Species" not in _MATCH_TYPES
        assert "Variant" not in _MATCH_TYPES
        assert "CellLine" not in _MATCH_TYPES

    def test_min_alias_len(self):
        assert _MIN_ALIAS_LEN == 4


# ── load_vocab_aliases ─────────────────────────────────────────


class TestLoadVocabAliases:
    def test_loads_from_tsv(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\nC001\tdopamine\nC002\tGABA\nC003\t5HT\n")

        result = load_vocab_aliases(tsv)

        assert isinstance(result, set)
        assert "dopamine" in result
        assert "gaba" in result  # lowercased
        assert "5ht" not in result  # len 3 < MIN_ALIAS_LEN

    def test_deduplication(self, tmp_path: Path):
        """Duplicate aliases with different casing collapse to one entry."""
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\nC001\tDopamine\nC002\tdopamine\nC003\tDOPAMINE\n")

        result = load_vocab_aliases(tsv)

        assert len(result) == 1
        assert "dopamine" in result

    def test_strips_whitespace(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\nC001\t  serotonin  \n")

        result = load_vocab_aliases(tsv)

        assert "serotonin" in result

    def test_min_alias_length_boundary(self, tmp_path: Path):
        """Aliases of exactly _MIN_ALIAS_LEN should be included."""
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\nC001\tGABA\nC002\tMAO\n")

        result = load_vocab_aliases(tsv)

        assert "gaba" in result  # len 4 == _MIN_ALIAS_LEN
        assert "mao" not in result  # len 3 < _MIN_ALIAS_LEN

    def test_empty_file(self, tmp_path: Path):
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\n")

        result = load_vocab_aliases(tsv)

        assert result == set()

    def test_empty_alias_values_skipped(self, tmp_path: Path):
        """Rows with empty or whitespace-only aliases should be skipped."""
        tsv = tmp_path / "vocab_aliases.tsv"
        tsv.write_text("concept_id\talias\nC001\t\nC002\t   \nC003\tdopamine\n")

        result = load_vocab_aliases(tsv)

        assert "dopamine" in result
        assert "" not in result
        assert len(result) == 1


# ── stream_pubtator_matches ────────────────────────────────────


class TestStreamPubtatorMatches:
    def _make_pubtator_gz(self, tmp_path: Path, lines: list[str]) -> Path:
        """Create a gzipped PubTator3 file from tab-delimited lines."""
        gz_path = tmp_path / "bioconcepts2pubtator3.gz"
        with gzip.open(gz_path, "wt", encoding="utf-8") as f:
            for line in lines:
                f.write(line + "\n")
        return gz_path

    def test_matches_disease_mention(self, tmp_path: Path):
        gz = self._make_pubtator_gz(tmp_path, [
            "12345\tDisease\tMESH:D003866\tdepression|major depression\tPubTator3",
        ])
        aliases = {"depression", "major depression"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert 12345 in result

    def test_ignores_species(self, tmp_path: Path):
        gz = self._make_pubtator_gz(tmp_path, [
            "12345\tSpecies\t9606\thuman\tPubTator3",
        ])
        aliases = {"human"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert len(result) == 0

    def test_case_insensitive_matching(self, tmp_path: Path):
        gz = self._make_pubtator_gz(tmp_path, [
            "99999\tChemical\tMESH:D004298\tDopamine\tPubTator3",
        ])
        aliases = {"dopamine"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert 99999 in result

    def test_pipe_delimited_mentions(self, tmp_path: Path):
        """Any mention in the pipe-delimited list matching an alias counts."""
        gz = self._make_pubtator_gz(tmp_path, [
            "11111\tGene\t1234\tBDNF|brain-derived neurotrophic factor\tPubTator3",
        ])
        aliases = {"brain-derived neurotrophic factor"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert 11111 in result

    def test_max_lines_limit(self, tmp_path: Path):
        lines = [f"{i}\tDisease\tD001\tdepression\tPubTator3" for i in range(100)]
        gz = self._make_pubtator_gz(tmp_path, lines)
        aliases = {"depression"}

        result = stream_pubtator_matches(gz, aliases=aliases, max_lines=10)

        # Should stop before processing all 100 lines
        assert len(result) <= 10

    def test_malformed_lines_skipped(self, tmp_path: Path):
        gz = self._make_pubtator_gz(tmp_path, [
            "malformed line",
            "12345\tDisease\tD001\tdepression\tPubTator3",
            "bad\tline",
        ])
        aliases = {"depression"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert 12345 in result
        assert len(result) == 1

    def test_invalid_pmid_skipped(self, tmp_path: Path):
        gz = self._make_pubtator_gz(tmp_path, [
            "not_a_number\tDisease\tD001\tdepression\tPubTator3",
        ])
        aliases = {"depression"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert len(result) == 0

    def test_unique_pmids(self, tmp_path: Path):
        """Multiple matching lines for same PMID produce one entry."""
        gz = self._make_pubtator_gz(tmp_path, [
            "12345\tDisease\tD001\tdepression\tPubTator3",
            "12345\tChemical\tD002\tserotonin\tPubTator3",
        ])
        aliases = {"depression", "serotonin"}

        result = stream_pubtator_matches(gz, aliases=aliases)

        assert result == {12345}
