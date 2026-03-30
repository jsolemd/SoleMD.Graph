from __future__ import annotations

import json

from app.rag.alignment import align_span_to_canonical_ordinals
from app.rag.grounding_packets import build_cited_span_packet, build_inline_citation_anchors
from app.rag.serving_contract import derive_answer_linked_corpus_ids
from app.rag.source_parsers import parse_biocxml_document, parse_s2orc_row
from app.rag.warehouse_contract import (
    SpanOrigin,
    citation_row_from_parse,
    entity_row_from_parse,
)


def test_grounding_pipeline_flows_from_parse_to_answer_linked_papers():
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
    s2 = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

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
    bioc = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    citation_parse = s2.citations[0]
    citation_alignment = align_span_to_canonical_ordinals(
        start_offset=citation_parse.source_start_offset,
        end_offset=citation_parse.source_end_offset,
        canonical_blocks=s2.blocks,
        canonical_sentences=s2.sentences,
    )
    citation_row = citation_row_from_parse(
        citation_parse,
        span_origin=SpanOrigin.PRIMARY_TEXT,
        alignment_status=citation_alignment.alignment_status,
        alignment_confidence=citation_alignment.alignment_confidence,
        canonical_section_ordinal=citation_alignment.canonical_section_ordinal,
        canonical_block_ordinal=citation_alignment.canonical_block_ordinal,
        canonical_sentence_ordinal=citation_alignment.canonical_sentence_ordinal,
    )

    entity_parse = bioc.entities[0]
    entity_alignment = align_span_to_canonical_ordinals(
        start_offset=entity_parse.source_start_offset,
        end_offset=entity_parse.source_end_offset,
        canonical_blocks=s2.blocks,
        canonical_sentences=s2.sentences,
    )
    entity_row = entity_row_from_parse(
        entity_parse,
        span_origin=SpanOrigin.ANNOTATION_OVERLAY,
        alignment_status=entity_alignment.alignment_status,
        alignment_confidence=entity_alignment.alignment_confidence,
        canonical_section_ordinal=entity_alignment.canonical_section_ordinal,
        canonical_block_ordinal=entity_alignment.canonical_block_ordinal,
        canonical_sentence_ordinal=entity_alignment.canonical_sentence_ordinal,
    )

    packet = build_cited_span_packet(
        block=s2.blocks[0],
        sentence=s2.sentences[0],
        citation_rows=[citation_row],
        entity_rows=[entity_row],
    )
    anchors = build_inline_citation_anchors([packet])

    assert packet.source_reference_keys == ["b1"]
    assert packet.entity_mentions[0].concept_id == "D008550"
    assert packet.canonical_block_ordinal == 0
    assert derive_answer_linked_corpus_ids(
        cited_spans=[packet], inline_citations=anchors
    ) == [12345]
