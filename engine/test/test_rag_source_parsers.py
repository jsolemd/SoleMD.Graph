from __future__ import annotations

import json

from app.rag.parse_contract import (
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.source_parsers import (
    extract_biocxml_document_id,
    parse_biocxml_document,
    parse_s2orc_row,
)


def test_parse_s2orc_row_emits_reference_and_citation_bridge_records():
    body_text = (
        "Introduction\n"
        "Patients improved after treatment. No adverse events were observed [1]."
    )
    bibliography_text = "1. Example trial paper."
    paragraph_start = body_text.index("Patients")
    paragraph_end = len(body_text)
    first_sentence_end = body_text.index(".") + 1
    second_sentence_start = body_text.index("No adverse")
    second_sentence_end = body_text.index("].") + 2
    citation_start = body_text.index("[1]")
    citation_end = citation_start + 3

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
                            "end": len("Introduction"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": paragraph_start,
                            "end": paragraph_end,
                            "attributes": {},
                        }
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": paragraph_start,
                            "end": first_sentence_end,
                            "attributes": {},
                        },
                        {
                            "start": second_sentence_start,
                            "end": second_sentence_end,
                            "attributes": {},
                        },
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": citation_start,
                            "end": citation_end,
                            "attributes": {
                                "ref_id": "b0",
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
                            "attributes": {
                                "id": "b0",
                                "matched_paper_id": "S2:paper-1",
                            },
                        }
                    ]
                )
            },
        },
    }

    parsed = parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )

    assert len(parsed.blocks) == 1
    assert len(parsed.sentences) == 2
    assert parsed.blocks[0].block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
    assert parsed.blocks[0].section_role == SectionRole.INTRODUCTION
    assert parsed.references[0].source_reference_key == "b0"
    assert parsed.citations[0].source_citation_key == "b0"
    assert parsed.citations[0].sentence_ordinal == 1
    assert parsed.citations[0].matched_paper_id == "S2:paper-1"
    assert (
        parsed.sentences[0].segmentation_source
        == SentenceSegmentationSource.S2ORC_ANNOTATION
    )


def test_parse_s2orc_row_coerces_numeric_reference_and_match_identifiers_to_strings():
    body_text = "Results\nSignal changed [1]."
    bibliography_text = "1. Example trial paper."
    citation_start = body_text.index("[1]")
    citation_end = citation_start + 3
    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Results"), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [{"start": len("Results\n"), "end": len(body_text), "attributes": {}}]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": len("Results\n"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": citation_start,
                            "end": citation_end,
                            "attributes": {"ref_id": 101, "matched_paper_id": 1149154},
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
                            "attributes": {"id": 101, "matched_paper_id": 1149154},
                        }
                    ]
                )
            },
        },
    }

    parsed = parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )

    assert parsed.references[0].source_reference_key == "101"
    assert parsed.references[0].matched_paper_id == "1149154"
    assert parsed.citations[0].source_citation_key == "101"
    assert parsed.citations[0].matched_paper_id == "1149154"


def test_parse_s2orc_row_coerces_string_annotation_offsets_to_ints():
    body_text = "Results\nSignal changed [1]."
    bibliography_text = "1. Example trial paper."
    citation_start = body_text.index("[1]")
    citation_end = citation_start + 3
    row = {
        "corpusid": 12345,
        "title": "Example trial",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": "0", "end": str(len("Results")), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": str(len("Results\n")),
                            "end": str(len(body_text)),
                            "attributes": {},
                        }
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": str(len("Results\n")),
                            "end": str(len(body_text)),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps(
                    [
                        {
                            "start": str(citation_start),
                            "end": str(citation_end),
                            "attributes": {"ref_id": "b1"},
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
                            "start": "0",
                            "end": str(len(bibliography_text)),
                            "attributes": {"id": "b1"},
                        }
                    ]
                )
            },
        },
    }

    parsed = parse_s2orc_row(
        row, source_revision="2026-03-10", parser_version="parser-v1"
    )

    assert parsed.sections[0].source_start_offset == 0
    assert parsed.blocks[0].source_end_offset == len(body_text)
    assert parsed.citations[0].source_start_offset == citation_start


def test_parse_biocxml_document_emits_entity_concept_fields_from_annotation_id():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">INTRO</infon>
          <offset>0</offset>
          <text>Example title</text>
        </passage>
        <passage>
          <infon key="type">fig_caption</infon>
          <infon key="section_type">RESULTS</infon>
          <infon key="id">fig1</infon>
          <offset>20</offset>
          <text>BRCA1 increased after treatment.</text>
          <annotation>
            <infon key="type">Gene</infon>
            <location offset="20" length="5" />
            <text>BRCA1</text>
            <id>672</id>
          </annotation>
        </passage>
        <passage>
          <infon key="type">ref</infon>
          <infon key="section_type">REF</infon>
          <infon key="id">ref1</infon>
          <offset>80</offset>
          <text>Example reference entry.</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    assert len(parsed.blocks) == 1
    assert parsed.blocks[0].block_kind == PaperBlockKind.FIGURE_CAPTION
    assert parsed.references[0].source_reference_key == "ref1"
    assert len(parsed.entities) == 1
    assert parsed.entities[0].entity_type == "Gene"
    assert parsed.entities[0].source_identifier == "672"
    assert parsed.entities[0].concept_namespace == "ncbi_gene"
    assert parsed.entities[0].concept_id == "672"
    assert parsed.entities[0].block_ordinal == parsed.blocks[0].block_ordinal


def test_extract_biocxml_document_id_reads_source_key_structurally():
    xml_text = """
    <collection>
      <document>
        <id>PMC12345.2</id>
        <passage>
          <infon key="type">title_1</infon>
          <offset>0</offset>
          <text>Example title</text>
        </passage>
      </document>
    </collection>
    """

    assert extract_biocxml_document_id(xml_text) == "PMC12345.2"


def test_parse_biocxml_document_preserves_mesh_identifier_when_namespaced():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">ABSTRACT</infon>
          <offset>0</offset>
          <text>Example title</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">ABSTRACT</infon>
          <offset>20</offset>
          <text>Melatonin reduced postoperative delirium.</text>
          <annotation>
            <infon key="type">Chemical</infon>
            <infon key="identifier">MESH:D008550</infon>
            <location offset="20" length="10" />
            <text>Melatonin</text>
          </annotation>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    assert len(parsed.entities) == 1
    assert parsed.entities[0].source_identifier == "MESH:D008550"
    assert parsed.entities[0].concept_namespace == "mesh"
    assert parsed.entities[0].concept_id == "D008550"


def test_parse_biocxml_document_skips_empty_reference_and_block_passages():
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
          <infon key="type">ref</infon>
          <infon key="section_type">REF</infon>
          <offset>8</offset>
          <text>   </text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>12</offset>
          <text></text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>20</offset>
          <text>Valid content remains.</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    assert len(parsed.references) == 0
    assert len(parsed.blocks) == 1
    assert parsed.blocks[0].text == "Valid content remains."


def test_parse_biocxml_document_uses_resolver_for_noncanonical_document_keys():
    xml_text = """
    <collection>
      <document>
        <id>PMC12345</id>
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
          <text>Resolved through corpus mapping.</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text,
        source_revision="2026-03-21",
        parser_version="parser-v1",
        corpus_id_resolver=lambda document_id: 67890 if document_id == "PMC12345" else None,
    )

    assert parsed.document.corpus_id == 67890
    assert parsed.document.source_document_key == "PMC12345"
