"""Tests for PubTator3 entity and relation line parsing."""

from __future__ import annotations

from app.corpus.pubtator import _KNOWN_ENTITY_TYPES, _parse_entity_line, _parse_relation_line


# ── Constants ──────────────────────────────────────────────────


class TestConstants:
    def test_known_entity_types_contains_core_types(self):
        assert "disease" in _KNOWN_ENTITY_TYPES
        assert "chemical" in _KNOWN_ENTITY_TYPES
        assert "gene" in _KNOWN_ENTITY_TYPES
        assert "species" in _KNOWN_ENTITY_TYPES
        assert "mutation" in _KNOWN_ENTITY_TYPES

    def test_known_entity_types_is_frozenset(self):
        assert isinstance(_KNOWN_ENTITY_TYPES, frozenset)


# ── _parse_entity_line ─────────────────────────────────────────


class TestParseEntityLine:
    def test_valid_entity(self):
        line = "12345\tDisease\tMESH:D003866\tdepression|major depression\tPubTator3"

        result = _parse_entity_line(line)

        assert result is not None
        pmid, entity_type, concept_id, mentions, resource = result
        assert pmid == 12345
        assert entity_type == "disease"  # lowercased
        assert concept_id == "MESH:D003866"
        assert mentions == "depression|major depression"
        assert resource == "PubTator3"

    def test_valid_entity_with_newline(self):
        line = "12345\tChemical\tMESH:D004298\tDopamine\tPubTator3\n"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[0] == 12345
        assert result[1] == "chemical"

    def test_malformed_line_too_few_fields(self):
        assert _parse_entity_line("12345\tDisease\tD001") is None
        assert _parse_entity_line("only_one_field") is None
        assert _parse_entity_line("") is None

    def test_non_numeric_pmid(self):
        line = "not_a_number\tDisease\tD001\tdepression\tPubTator3"

        assert _parse_entity_line(line) is None

    def test_empty_concept_id(self):
        line = "12345\tGene\t\tBDNF\tPubTator3"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[2] == ""

    def test_missing_resource_defaults(self):
        """Lines with only 4 fields should default resource to PubTator3."""
        line = "12345\tDisease\tD001\tdepression"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[4] == "PubTator3"

    def test_backslash_stripped_from_mentions(self):
        line = "12345\tDisease\tD001\tdepression\\\tPubTator3"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[3] == "depression"
        assert not result[3].endswith("\\")

    def test_unknown_entity_type_still_parses(self):
        """Unknown entity types should parse successfully (with a warning logged)."""
        line = "12345\tNovelType\tX001\tsome mention\tPubTator3"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[1] == "noveltype"

    def test_entity_type_lowercased(self):
        line = "12345\tCELLLINE\tCLO:123\tHeLa\tPubTator3"

        result = _parse_entity_line(line)

        assert result is not None
        assert result[1] == "cellline"


# ── _parse_relation_line ───────────────────────────────────────


class TestParseRelationLine:
    def test_valid_relation(self):
        line = "12345\tAssociation\tGene|1234\tDisease|MESH:D003866"

        result = _parse_relation_line(line)

        assert result is not None
        pmid, rel_type, subj_type, subj_id, obj_type, obj_id = result
        assert pmid == 12345
        assert rel_type == "Association"
        assert subj_type == "gene"  # lowercased
        assert subj_id == "1234"
        assert obj_type == "disease"  # lowercased
        assert obj_id == "MESH:D003866"

    def test_valid_relation_with_newline(self):
        line = "99999\tPositive_Correlation\tChemical|MESH:D012701\tGene|5678\n"

        result = _parse_relation_line(line)

        assert result is not None
        assert result[0] == 99999
        assert result[1] == "Positive_Correlation"

    def test_malformed_line_too_few_fields(self):
        assert _parse_relation_line("12345\tAssociation\tGene|1234") is None
        assert _parse_relation_line("short") is None
        assert _parse_relation_line("") is None

    def test_non_numeric_pmid(self):
        line = "bad\tAssociation\tGene|1234\tDisease|D001"

        assert _parse_relation_line(line) is None

    def test_entity_without_pipe_separator(self):
        """Entity fields without pipe delimiter should return None."""
        line = "12345\tAssociation\tGene1234\tDisease|D001"

        assert _parse_relation_line(line) is None

    def test_both_entities_without_pipe(self):
        line = "12345\tAssociation\tGene1234\tDiseaseD001"

        assert _parse_relation_line(line) is None

    def test_entity_types_lowercased(self):
        line = "12345\tAssociation\tGENE|1234\tDISEASE|D001"

        result = _parse_relation_line(line)

        assert result is not None
        assert result[2] == "gene"
        assert result[4] == "disease"

    def test_pipe_in_entity_id(self):
        """Only the first pipe should split type from ID."""
        line = "12345\tAssociation\tGene|1234|extra\tDisease|D001"

        result = _parse_relation_line(line)

        assert result is not None
        assert result[3] == "1234|extra"  # ID includes rest after first pipe
