"""Unit tests for ``app.ingest.sources.pubtator`` parsing helpers.

These tests exercise the streaming iterators in isolation — no database, no
testcontainers, no network. They lock in two data-correctness contracts:

1. ``_stream_bioconcepts`` must not synthesize fake character offsets from
   line numbers. The PubTator3 ``bioconcepts2pubtator3.gz`` feed is
   document-level (PMID, Type, ConceptID, Mentions, Resource) and has no
   character offsets. Using the line index as a fake ``start_offset`` silently
   corrupts the stage-table unique key.

2. ``_stream_relations`` (TSV) and ``_stream_biocxml`` → ``_relation_row_from_biocxml``
   must produce identical ``(subject_entity_id, object_entity_id)`` orientation
   for the same logical relation. The canonical rule: TSV column 3 == BioCXML
   ``role1`` == subject; TSV column 4 == BioCXML ``role2`` == object.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.ingest.sources import pubtator

from helpers import write_tar_gz, write_tsv_gz


def _write_tsv_gz(path: Path, lines: list[str]) -> None:
    write_tsv_gz(path, lines)


def _write_biocxml_tar_gz(path: Path, xml_bodies: dict[str, str]) -> None:
    """Write a ``.tar.gz`` archive containing one or more BioC XML members."""
    write_tar_gz(path, members=xml_bodies)


# ---------------------------------------------------------------------------
# Task 1 — bioconcepts offsets must not encode line numbers
# ---------------------------------------------------------------------------


def test_bioconcepts_yields_zero_offsets_not_line_numbers(tmp_path: Path) -> None:
    """The aggregated bioconcepts feed has no character offsets; we must emit
    a constant sentinel rather than ``(index, index + 1)``."""
    bioconcepts_path = tmp_path / "bioconcepts2pubtator3.gz"
    _write_tsv_gz(
        bioconcepts_path,
        [
            "40808120\tDisease\tMESH:D009369\tcancer\tMESH",
            "40808120\tChemical\tMESH:D000001\tAspirin\tMESH",
            "40808121\tGene\tNCBIGene:672\tBRCA1\tNCBI",
        ],
    )
    rows = list(pubtator.stream_family("bioconcepts", bioconcepts_path))
    assert len(rows) == 3
    for row in rows:
        assert row["start_offset"] == 0, f"expected 0 sentinel, got {row['start_offset']}"
        assert row["end_offset"] == 0, f"expected 0 sentinel, got {row['end_offset']}"
        assert row["resource"] == pubtator.ENTITY_RESOURCE_BIOCONCEPTS
    # Spot-check semantic fields are still parsed correctly.
    assert rows[0]["pmid"] == 40808120
    assert rows[0]["concept_id_raw"] == "MESH:D009369"
    assert rows[0]["mention_text"] == "cancer"
    assert rows[0]["entity_type"] == pubtator.ENTITY_TYPE_CODES["Disease"]


def test_bioconcepts_same_type_duplicates_share_stage_unique_key(tmp_path: Path) -> None:
    """Because bioconcepts is document-level, repeating (pmid, type, concept) rows in
    the TSV collapse under the stage unique key. The iterator itself yields
    every row, but with identical sentinel offsets, so the downstream
    ``ON CONFLICT`` absorbs them deterministically. We assert the yield shape
    so the writer's ``DISTINCT ON`` + ``ON CONFLICT`` has the keys it expects.
    """
    bioconcepts_path = tmp_path / "bioconcepts2pubtator3.gz"
    _write_tsv_gz(
        bioconcepts_path,
        [
            "40808120\tDisease\tMESH:D009369\tcancer\tMESH",
            # Duplicate (pmid, type, concept) pair — different mention spelling.
            "40808120\tDisease\tMESH:D009369\tCancers\tMESH",
        ],
    )
    rows = list(pubtator.stream_family("bioconcepts", bioconcepts_path))
    assert len(rows) == 2
    key_a = (
        rows[0]["pmid"],
        rows[0]["start_offset"],
        rows[0]["end_offset"],
        rows[0]["entity_type"],
        rows[0]["concept_id_raw"],
    )
    key_b = (
        rows[1]["pmid"],
        rows[1]["start_offset"],
        rows[1]["end_offset"],
        rows[1]["entity_type"],
        rows[1]["concept_id_raw"],
    )
    assert key_a == key_b, "expected duplicates to share the stage unique-key grain"


def test_bioconcepts_cross_type_collisions_stay_distinct(tmp_path: Path) -> None:
    """The live PubTator feed can reuse one raw identifier across entity types
    within the same paper. Sentinel offsets must therefore preserve
    ``entity_type`` in the downstream unique key."""
    bioconcepts_path = tmp_path / "bioconcepts2pubtator3.gz"
    _write_tsv_gz(
        bioconcepts_path,
        [
            "41457071\tGene\t3906\talpha-lactalbumin\tPubTator3",
            "41457071\tSpecies\t3906\tFaba bean|faba beans|Vicia faba L.|faba bean\tPubTator3",
        ],
    )
    rows = list(pubtator.stream_family("bioconcepts", bioconcepts_path))

    assert len(rows) == 2
    assert rows[0]["pmid"] == rows[1]["pmid"] == 41457071
    assert rows[0]["concept_id_raw"] == rows[1]["concept_id_raw"] == "3906"
    assert (rows[0]["start_offset"], rows[0]["end_offset"]) == (0, 0)
    assert (rows[1]["start_offset"], rows[1]["end_offset"]) == (0, 0)
    assert rows[0]["entity_type"] != rows[1]["entity_type"]


def test_bioconcepts_offsets_do_not_shift_with_line_position(tmp_path: Path) -> None:
    """Regression guard: the same logical record must yield the same
    ``(start_offset, end_offset)`` regardless of where it appears in the file.
    Under the previous buggy implementation, moving a record from line 0 to
    line 17 changed its offsets and (silently) its stage unique key."""
    file_a = tmp_path / "a" / "bioconcepts2pubtator3.gz"
    file_b = tmp_path / "b" / "bioconcepts2pubtator3.gz"
    target = "40808120\tDisease\tMESH:D009369\tcancer\tMESH"
    _write_tsv_gz(file_a, [target])
    padding = ["99999999\tDisease\tMESH:D000000\tfiller\tMESH"] * 17
    _write_tsv_gz(file_b, padding + [target])

    rows_a = list(pubtator.stream_family("bioconcepts", file_a))
    rows_b_all = list(pubtator.stream_family("bioconcepts", file_b))
    rows_b = [r for r in rows_b_all if r["pmid"] == 40808120]

    assert rows_a[0]["start_offset"] == rows_b[0]["start_offset"]
    assert rows_a[0]["end_offset"] == rows_b[0]["end_offset"]


# ---------------------------------------------------------------------------
# Task 2 — BioCXML and TSV must agree on subject/object orientation
# ---------------------------------------------------------------------------


_BIOCXML_SAMPLE = """<?xml version='1.0' encoding='UTF-8'?>
<collection>
  <source>PubTator</source>
  <document>
    <id>35378878</id>
    <passage>
      <offset>0</offset>
      <text>Aspirin treats cancer in model systems.</text>
      <annotation id="A1">
        <infon key="identifier">MESH:D003911</infon>
        <infon key="type">Chemical</infon>
        <location offset="0" length="7"/>
        <text>Aspirin</text>
      </annotation>
      <annotation id="A2">
        <infon key="identifier">MESH:D005334</infon>
        <infon key="type">Disease</infon>
        <location offset="15" length="6"/>
        <text>cancer</text>
      </annotation>
      <relation id="R1">
        <infon key="score">0.99</infon>
        <infon key="role1">Chemical|MESH:D003911</infon>
        <infon key="role2">Disease|MESH:D005334</infon>
        <infon key="type">Association</infon>
      </relation>
    </passage>
  </document>
</collection>
""".strip()


def test_biocxml_relation_orientation_matches_tsv(tmp_path: Path) -> None:
    """Same logical relation, two ingress formats → identical subject/object."""
    # TSV form.
    tsv_path = tmp_path / "relation2pubtator3.gz"
    _write_tsv_gz(
        tsv_path,
        ["35378878\tassociate\tChemical|MESH:D003911\tDisease|MESH:D005334"],
    )
    # BioCXML form.
    biocxml_path = tmp_path / "biocxml" / "BioCXML.0.tar.gz"
    _write_biocxml_tar_gz(biocxml_path, {"sample.BioC.XML": _BIOCXML_SAMPLE})

    tsv_rows = list(pubtator.stream_family("relations", tsv_path))
    biocxml_rows = [
        row
        for row in pubtator.stream_family("biocxml", biocxml_path)
        if row.get("row_kind") == "relation"
    ]

    assert len(tsv_rows) == 1
    assert len(biocxml_rows) == 1
    tsv_row = tsv_rows[0]
    xml_row = biocxml_rows[0]

    assert tsv_row["pmid"] == xml_row["pmid"] == 35378878
    assert tsv_row["relation_type"] == xml_row["relation_type"] == pubtator.RELATION_TYPE_CODES["associate"]
    assert tsv_row["subject_entity_id"] == xml_row["subject_entity_id"] == "Chemical|MESH:D003911"
    assert tsv_row["object_entity_id"] == xml_row["object_entity_id"] == "Disease|MESH:D005334"
    # relation_source codes must differ so downstream can tell the feeds apart
    # but the logical edge must be oriented the same way.
    assert tsv_row["relation_source"] == pubtator.RELATION_SOURCE_TSV
    assert xml_row["relation_source"] == pubtator.RELATION_SOURCE_BIOCXML


def test_biocxml_node_style_relation_orientation(tmp_path: Path) -> None:
    """Legacy ``<node refid=… role="subject"/>`` shape must also resolve to the
    canonical (subject, object) orientation. This exercises the Shape B
    fallback in ``_relation_row_from_biocxml``."""
    legacy_xml = """<?xml version='1.0' encoding='UTF-8'?>
<collection>
  <document>
    <id>99999</id>
    <passage>
      <offset>0</offset>
      <text>X upregulates Y.</text>
      <annotation id="A1">
        <infon key="identifier">NCBIGene:1</infon>
        <infon key="type">Gene</infon>
        <location offset="0" length="1"/>
        <text>X</text>
      </annotation>
      <annotation id="A2">
        <infon key="identifier">NCBIGene:2</infon>
        <infon key="type">Gene</infon>
        <location offset="14" length="1"/>
        <text>Y</text>
      </annotation>
      <relation id="R1">
        <infon key="type">positive_correlate</infon>
        <node refid="A1" role="subject"/>
        <node refid="A2" role="object"/>
      </relation>
    </passage>
  </document>
</collection>
""".strip()
    path = tmp_path / "biocxml" / "BioCXML.0.tar.gz"
    _write_biocxml_tar_gz(path, {"legacy.BioC.XML": legacy_xml})
    rows = [
        row
        for row in pubtator.stream_family("biocxml", path)
        if row.get("row_kind") == "relation"
    ]
    assert len(rows) == 1
    row = rows[0]
    assert row["subject_entity_id"] == "NCBIGene:1"
    assert row["object_entity_id"] == "NCBIGene:2"
    assert row["relation_type"] == pubtator.RELATION_TYPE_CODES["positive_correlate"]


def test_biocxml_entity_offsets_come_from_location_not_line(tmp_path: Path) -> None:
    """BioCXML entities keep real character offsets from ``<location offset="…"/>``.
    This guards against a future regression where someone "fixes" the bioconcepts
    sentinel offsets by also zeroing out the BioCXML path."""
    path = tmp_path / "biocxml" / "BioCXML.0.tar.gz"
    _write_biocxml_tar_gz(path, {"sample.BioC.XML": _BIOCXML_SAMPLE})
    entities = [
        row
        for row in pubtator.stream_family("biocxml", path)
        if row.get("row_kind") == "entity"
    ]
    assert len(entities) == 2
    aspirin = next(r for r in entities if r["concept_id_raw"] == "MESH:D003911")
    cancer = next(r for r in entities if r["concept_id_raw"] == "MESH:D005334")
    assert (aspirin["start_offset"], aspirin["end_offset"]) == (0, 7)
    assert (cancer["start_offset"], cancer["end_offset"]) == (15, 21)
    # Explicitly assert offsets are not sentinel zero: this path must carry real spans.
    assert aspirin["end_offset"] > aspirin["start_offset"]


def test_biocxml_same_text_distinct_offsets_are_both_emitted(tmp_path: Path) -> None:
    """Two mentions of the same entity at different character offsets must both
    survive the iterator — they are distinct under the stage unique key."""
    xml = """<?xml version='1.0' encoding='UTF-8'?>
<collection>
  <document>
    <id>77777</id>
    <passage>
      <offset>0</offset>
      <text>Aspirin relieved pain. Aspirin worked again.</text>
      <annotation id="A1">
        <infon key="identifier">MESH:D000001</infon>
        <infon key="type">Chemical</infon>
        <location offset="0" length="7"/>
        <text>Aspirin</text>
      </annotation>
      <annotation id="A2">
        <infon key="identifier">MESH:D000001</infon>
        <infon key="type">Chemical</infon>
        <location offset="22" length="7"/>
        <text>Aspirin</text>
      </annotation>
    </passage>
  </document>
</collection>
""".strip()
    path = tmp_path / "biocxml" / "BioCXML.0.tar.gz"
    _write_biocxml_tar_gz(path, {"sample.BioC.XML": xml})
    entities = [
        row
        for row in pubtator.stream_family("biocxml", path)
        if row.get("row_kind") == "entity"
    ]
    assert len(entities) == 2
    spans = sorted((r["start_offset"], r["end_offset"]) for r in entities)
    assert spans == [(0, 7), (22, 29)]


# ---------------------------------------------------------------------------
# Cross-reference: inspect_module exposes expected constants
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "code_name, expected",
    [
        ("RELATION_SOURCE_BIOCXML", 1),
        ("RELATION_SOURCE_TSV", 2),
        ("ENTITY_RESOURCE_BIOCXML", 1),
        ("ENTITY_RESOURCE_BIOCONCEPTS", 2),
    ],
)
def test_resource_codes_are_stable(code_name: str, expected: int) -> None:
    """Downstream promotion and the damage-audit views hard-code these codes;
    a silent change would break both."""
    assert getattr(pubtator, code_name) == expected
