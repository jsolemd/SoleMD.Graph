from __future__ import annotations

import json

from app.rag.parse_contract import ParseSourceSystem
from app.rag.source_grounding import build_grounded_answer_from_plan
from app.rag.source_parsers import parse_biocxml_document, parse_s2orc_row
from app.rag.source_selection import build_grounding_source_plan, profile_parsed_source


def _build_s2orc_source(*, with_blocks: bool = True):
    body_text = (
        "Results\n"
        "Melatonin reduced delirium incidence [1]. Sleep quality improved."
    )
    bibliography_text = "1. Example trial paper."
    annotations = {
        "section_header": json.dumps(
            [
                {
                    "start": 0,
                    "end": len("Results"),
                    "attributes": {"n": "1."},
                }
            ]
        ),
        "bib_ref": json.dumps(
            [
                {
                    "start": 45,
                    "end": 48,
                    "attributes": {
                        "ref_id": "b1",
                        "matched_paper_id": "S2:paper-1",
                    },
                }
            ]
        ),
    }
    if with_blocks:
        annotations["paragraph"] = json.dumps(
            [{"start": 8, "end": len(body_text), "attributes": {}}]
        )
        annotations["sentence"] = json.dumps(
            [
                {"start": 8, "end": 48, "attributes": {}},
                {"start": 49, "end": len(body_text), "attributes": {}},
            ]
        )

    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": annotations,
        },
        "bibliography": {
            "text": bibliography_text,
            "annotations": {
                "bib_entry": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len(bibliography_text),
                            "attributes": {"id": "b1", "matched_paper_id": "S2:paper-1"},
                        }
                    ]
                )
            },
        },
    }
    return parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )


def _build_bioc_source():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>0</offset>
          <text>Results</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>8</offset>
          <text>Melatonin reduced delirium incidence.</text>
          <annotation>
            <infon key="type">Chemical</infon>
            <infon key="identifier">MESH:D008550</infon>
            <location offset="8" length="10" />
            <text>Melatonin</text>
          </annotation>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def _build_bioc_caption_source():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>0</offset>
          <text>Results</text>
        </passage>
        <passage>
          <infon key="type">fig_caption</infon>
          <infon key="section_type">RESULTS</infon>
          <infon key="id">fig1</infon>
          <offset>8</offset>
          <text>Figure 1. Trial flow and enrollment.</text>
        </passage>
      </document>
    </collection>
    """
    return parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )


def test_profile_parsed_source_reports_structural_counts():
    profile = profile_parsed_source(_build_s2orc_source())

    assert profile.source_system == ParseSourceSystem.S2ORC_V2
    assert profile.block_count == 1
    assert profile.sentence_count == 2
    assert profile.citation_count == 1
    assert profile.reference_count == 1


def test_build_grounding_source_plan_prefers_viable_s2orc_and_keeps_bioc_as_annotation_overlay():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_source()])

    assert plan.primary_source.document.source_system == ParseSourceSystem.S2ORC_V2
    assert plan.primary_reason == "preferred_s2orc_viable"
    assert len(plan.annotation_sources) == 1
    assert plan.annotation_sources[0].document.source_system == ParseSourceSystem.BIOCXML


def test_build_grounding_source_plan_keeps_same_corpus_structural_overlay_without_entities():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_caption_source()])

    assert plan.primary_source.document.source_system == ParseSourceSystem.S2ORC_V2
    assert len(plan.annotation_sources) == 1
    assert plan.annotation_sources[0].blocks[0].block_kind == "figure_caption"


def test_build_grounding_source_plan_falls_back_when_s2orc_is_structurally_weaker():
    plan = build_grounding_source_plan([_build_s2orc_source(with_blocks=False), _build_bioc_source()])

    assert plan.primary_source.document.source_system == ParseSourceSystem.BIOCXML
    assert plan.primary_reason == "fallback_structural_best"


def test_build_grounded_answer_from_plan_uses_selected_primary_and_overlay_sources():
    plan = build_grounding_source_plan([_build_s2orc_source(), _build_bioc_source()])

    grounded_answer = build_grounded_answer_from_plan(
        plan,
        segment_texts=["Melatonin was associated with lower delirium incidence."],
        source_citation_keys=["b1"],
    )

    assert grounded_answer.segments[0].citation_anchor_ids == ["anchor:1"]
    assert grounded_answer.cited_spans[0].entity_mentions[0].concept_id == "D008550"
    assert grounded_answer.answer_linked_corpus_ids == [12345]
