from __future__ import annotations

import json

from app.rag.parse_contract import (
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag_ingest.sentence_segmentation import SyntokSentenceSegmenter
from app.rag_ingest.source_parsers import (
    extract_biocxml_document_id,
    parse_biocxml_document,
    parse_s2orc_row,
)


def test_parse_s2orc_row_emits_reference_and_citation_bridge_records():
    body_text = (
        "Introduction\nPatients improved after treatment. No adverse events were observed [1]."
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

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert len(parsed.blocks) == 1
    assert len(parsed.sentences) == 2
    assert parsed.blocks[0].block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
    assert parsed.blocks[0].section_role == SectionRole.INTRODUCTION
    assert parsed.references[0].source_reference_key == "b0"
    assert parsed.citations[0].source_citation_key == "b0"
    assert parsed.citations[0].sentence_ordinal == 1
    assert parsed.citations[0].matched_paper_id == "S2:paper-1"
    assert parsed.sentences[0].segmentation_source == SentenceSegmentationSource.S2ORC_ANNOTATION


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

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert parsed.references[0].source_reference_key == "101"
    assert parsed.references[0].matched_paper_id == "1149154"
    assert parsed.citations[0].source_citation_key == "101"
    assert parsed.citations[0].matched_paper_id == "1149154"


def test_parse_s2orc_row_adds_implicit_preamble_section_for_preheader_paragraphs():
    body_text = "Keywords: severe dengue.\nIntroduction\nPatients improved after treatment."
    row = {
        "corpusid": 79346632,
        "title": "Preamble example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": body_text.index("Introduction"),
                            "end": body_text.index("Introduction") + len("Introduction"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": body_text.index("\n") + 1,
                            "attributes": {},
                        },
                        {
                            "start": body_text.index("Patients"),
                            "end": len(body_text),
                            "attributes": {},
                        },
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": body_text.index("Patients"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert parsed.sections[0].section_ordinal == 0
    assert parsed.sections[0].display_label == "Preamble"
    assert parsed.blocks[0].section_ordinal == 0
    assert parsed.blocks[0].section_role == SectionRole.OTHER


def test_parse_s2orc_row_maps_background_header_to_introduction():
    body_text = "Background\nPatients improved after treatment."
    row = {
        "corpusid": 12345,
        "title": "Background example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Background"), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": body_text.index("Patients"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": body_text.index("Patients"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert parsed.sections[0].section_role == SectionRole.INTRODUCTION
    assert parsed.blocks[0].section_role == SectionRole.INTRODUCTION


def test_parse_s2orc_row_inherits_contextual_section_role_for_unrecognized_subheaders():
    body_text = (
        "RESULTS\n"
        "Patient characteristics\n"
        "Melatonin reduced delirium incidence.\n"
        "Statistical analysis\n"
        "Adjusted models remained significant."
    )
    row = {
        "corpusid": 1829181,
        "title": "Subclassed sections",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {"start": 0, "end": len("RESULTS"), "attributes": {"n": "1."}},
                        {
                            "start": body_text.index("Patient characteristics"),
                            "end": body_text.index("Patient characteristics")
                            + len("Patient characteristics"),
                            "attributes": {"n": "1.1"},
                        },
                        {
                            "start": body_text.index("Statistical analysis"),
                            "end": body_text.index("Statistical analysis")
                            + len("Statistical analysis"),
                            "attributes": {"n": "1.2"},
                        },
                    ]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": body_text.index("Melatonin"),
                            "end": body_text.index("Melatonin")
                            + len("Melatonin reduced delirium incidence."),
                            "attributes": {},
                        },
                        {
                            "start": body_text.index("Adjusted"),
                            "end": len(body_text),
                            "attributes": {},
                        },
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": body_text.index("Melatonin"),
                            "end": body_text.index("Melatonin")
                            + len("Melatonin reduced delirium incidence."),
                            "attributes": {},
                        },
                        {
                            "start": body_text.index("Adjusted"),
                            "end": len(body_text),
                            "attributes": {},
                        },
                    ]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert parsed.sections[1].section_role == SectionRole.RESULTS
    assert parsed.sections[2].section_role == SectionRole.RESULTS
    assert all(block.section_role == SectionRole.RESULTS for block in parsed.blocks)


def test_parse_s2orc_row_skips_empty_bibliography_entries():
    body_text = "Results\nSignal changed [1]."
    row = {
        "corpusid": 279796856,
        "title": "Empty bibliography span example",
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
                            "start": body_text.index("[1]"),
                            "end": body_text.index("[1]") + 3,
                            "attributes": {"ref_id": "b1", "matched_paper_id": "1714520"},
                        }
                    ]
                ),
            },
        },
        "bibliography": {
            "text": "",
            "annotations": {
                "bib_entry": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": 0,
                            "attributes": {"id": "b1", "matched_paper_id": "1714520"},
                        }
                    ]
                )
            },
        },
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert parsed.references == []


def test_parse_s2orc_row_trims_and_skips_whitespace_only_paragraph_blocks():
    body_text = "Results\n   \nMeaningful finding here."
    paragraph_start = body_text.index("   ")
    row = {
        "corpusid": 319991001,
        "title": "Whitespace paragraph example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Results"), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": paragraph_start,
                            "end": paragraph_start + 4,
                            "attributes": {},
                        },
                        {
                            "start": body_text.index("Meaningful"),
                            "end": len(body_text),
                            "attributes": {},
                        },
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": body_text.index("Meaningful"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

    assert len(parsed.blocks) == 1
    assert parsed.blocks[0].text == "Meaningful finding here."


def test_parse_s2orc_row_marks_author_contributions_as_front_matter_and_not_retrieval_default():
    body_text = "AUTHOR CONTRIBUTIONS\nAlice drafted the manuscript."
    row = {
        "corpusid": 411100001,
        "title": "Author contribution example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [
                        {
                            "start": 0,
                            "end": len("AUTHOR CONTRIBUTIONS"),
                            "attributes": {"n": "1."},
                        }
                    ]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": body_text.index("Alice"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "sentence": json.dumps(
                    [
                        {
                            "start": body_text.index("Alice"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v2")

    assert parsed.sections[0].section_role == SectionRole.FRONT_MATTER
    assert parsed.blocks[0].section_role == SectionRole.FRONT_MATTER
    assert parsed.blocks[0].is_retrieval_default is False


def test_parse_s2orc_row_uses_syntok_fallback_for_et_al_citation_sequences():
    body_text = (
        "Results\n"
        "Chen et al. [6] proposed a time-related susceptibility-infection-recovery model. "
        "Wangping et al. [7] proposed a dynamic extended SIR model."
    )
    row = {
        "corpusid": 260425880,
        "title": "Fallback segmentation example",
        "openaccessinfo": {"license": "CC-BY"},
        "body": {
            "text": body_text,
            "annotations": {
                "section_header": json.dumps(
                    [{"start": 0, "end": len("Results"), "attributes": {"n": "1."}}]
                ),
                "paragraph": json.dumps(
                    [
                        {
                            "start": len("Results\n"),
                            "end": len(body_text),
                            "attributes": {},
                        }
                    ]
                ),
                "sentence": json.dumps([]),
                "bib_ref": json.dumps([]),
            },
        },
        "bibliography": {"text": "", "annotations": {"bib_entry": json.dumps([])}},
    }

    parsed = parse_s2orc_row(
        row,
        source_revision="2026-03-10",
        parser_version="parser-v2",
        sentence_segmenter=SyntokSentenceSegmenter(),
    )

    assert [sentence.text for sentence in parsed.sentences] == [
        "Chen et al. [6] proposed a time-related susceptibility-infection-recovery model.",
        "Wangping et al. [7] proposed a dynamic extended SIR model.",
    ]
    assert all(
        sentence.segmentation_source == SentenceSegmentationSource.SYNTOK
        for sentence in parsed.sentences
    )


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

    parsed = parse_s2orc_row(row, source_revision="2026-03-10", parser_version="parser-v1")

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


def test_parse_biocxml_document_does_not_emit_sentence_rows_for_table_body_blocks():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">TITLE</infon>
          <offset>0</offset>
          <text>Example paper</text>
        </passage>
        <passage>
          <infon key="type">table</infon>
          <infon key="section_type">RESULTS</infon>
          <offset>20</offset>
          <text>Characteristic\tIntervention\tControl\tAge\t52.5\t51.6</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v2"
    )

    assert len(parsed.blocks) == 1
    assert parsed.blocks[0].block_kind == PaperBlockKind.TABLE_BODY_TEXT
    assert parsed.sentences == []


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


def test_parse_biocxml_document_creates_implicit_section_when_title_passage_is_absent():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
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

    assert parsed.document.title is None
    assert len(parsed.sections) == 1
    assert parsed.sections[0].section_role == SectionRole.RESULTS
    assert parsed.blocks[0].section_ordinal == parsed.sections[0].section_ordinal


def test_parse_biocxml_document_uses_first_title_passage_for_document_title():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">ABSTRACT</infon>
          <offset>0</offset>
          <text>Abstract text comes first in the XML.</text>
        </passage>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">ABSTRACT</infon>
          <offset>40</offset>
          <text>Canonical title</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    assert parsed.document.title == "Canonical title"


def test_parse_biocxml_document_does_not_promote_structural_heading_to_document_title():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_2</infon>
          <infon key="section_type">INTRO</infon>
          <offset>0</offset>
          <text>Introduction</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">INTRO</infon>
          <offset>13</offset>
          <text>Substantive narrative content remains available.</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text, source_revision="2026-03-21", parser_version="parser-v1"
    )

    assert parsed.document.title is None
    assert parsed.sections[0].display_label == "Introduction"
    assert parsed.blocks[0].text == "Substantive narrative content remains available."


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


def test_parse_biocxml_document_marks_funding_as_front_matter_and_not_retrieval_default():
    xml_text = """
    <collection>
      <document>
        <id>12345</id>
        <passage>
          <infon key="type">title_1</infon>
          <infon key="section_type">TITLE</infon>
          <offset>0</offset>
          <text>Example paper</text>
        </passage>
        <passage>
          <infon key="type">title_2</infon>
          <infon key="section_type">FUND</infon>
          <offset>20</offset>
          <text>Funding</text>
        </passage>
        <passage>
          <infon key="type">paragraph</infon>
          <infon key="section_type">FUND</infon>
          <offset>28</offset>
          <text>This study was funded by Example Grant.</text>
        </passage>
      </document>
    </collection>
    """

    parsed = parse_biocxml_document(
        xml_text,
        source_revision="2026-03-21",
        parser_version="parser-v2",
        corpus_id=12345,
    )

    assert parsed.sections[-1].section_role == SectionRole.FRONT_MATTER
    assert parsed.blocks[0].section_role == SectionRole.FRONT_MATTER
    assert parsed.blocks[0].is_retrieval_default is False
