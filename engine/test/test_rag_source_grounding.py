from __future__ import annotations

import json

from app.rag.source_grounding import (
    build_cited_span_packets_from_sources,
    build_grounded_answer_from_packets,
)
from app.rag.source_parsers import parse_biocxml_document, parse_s2orc_row


def _build_s2orc_source():
    body_text = (
        "Results\n"
        "Melatonin reduced delirium incidence [1]. Sleep quality improved."
    )
    bibliography_text = "1. Example trial paper."
    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len("Results"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps(
                    [{"start": 8, "end": len(body_text), "attributes": {}}]
                ),
                "sentence": json.dumps(
                    [
                        {"start": 8, "end": 48, "attributes": {}},
                        {"start": 49, "end": len(body_text), "attributes": {}},
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
            },
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


def _build_bioc_overlay():
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


def test_build_cited_span_packets_from_sources_aligns_primary_citations_and_overlay_entities():
    s2orc = _build_s2orc_source()
    bioc = _build_bioc_overlay()

    packets = build_cited_span_packets_from_sources(
        primary_source=s2orc,
        annotation_sources=[bioc],
        source_citation_keys=["b1"],
    )

    assert len(packets) == 1
    assert packets[0].source_citation_keys == ["b1"]
    assert packets[0].canonical_sentence_ordinal == 0
    assert packets[0].entity_mentions[0].concept_namespace == "mesh"
    assert packets[0].entity_mentions[0].concept_id == "D008550"


def test_build_grounded_answer_from_packets_derives_segments_anchors_and_answer_linked_ids():
    packets = build_cited_span_packets_from_sources(
        primary_source=_build_s2orc_source(),
        annotation_sources=[_build_bioc_overlay()],
        source_citation_keys=["b1"],
    )

    grounded_answer = build_grounded_answer_from_packets(
        segment_texts=["Melatonin was associated with lower delirium incidence."],
        packets=packets,
    )

    assert len(grounded_answer.segments) == 1
    assert grounded_answer.segments[0].citation_anchor_ids == ["anchor:1"]
    assert grounded_answer.inline_citations[0].cited_span_ids == [packets[0].packet_id]
    assert grounded_answer.answer_linked_corpus_ids == [12345]


def test_build_cited_span_packets_from_sources_does_not_emit_entity_only_packets():
    packets = build_cited_span_packets_from_sources(
        primary_source=_build_bioc_overlay(),
        annotation_sources=[],
    )

    assert packets == []
