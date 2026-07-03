from __future__ import annotations

import pytest

from app.pmc_fulltext.models import PmcFullTextParseFailed
from app.pmc_fulltext.parse_bioc import parse_pmc_bioc_fulltext


SAMPLE_BIOC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <source>PMC</source>
  <date>20260511</date>
  <key>test</key>
  <document>
    <id>PMC900001</id>
    <passage>
      <infon key="type">front</infon>
      <offset>0</offset>
      <text>Case report title</text>
    </passage>
    <passage>
      <infon key="type">abstract_title_1</infon>
      <infon key="section_type">ABSTRACT</infon>
      <offset>20</offset>
      <text>Abstract</text>
    </passage>
    <passage>
      <infon key="type">abstract</infon>
      <infon key="section_type">ABSTRACT</infon>
      <offset>30</offset>
      <text>Short abstract text for a case report.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>70</offset>
      <text>Introduction</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>85</offset>
      <text>Body text explains the clinical bridge.</text>
    </passage>
    <passage>
      <infon key="type">title_2</infon>
      <infon key="section_type">METHODS</infon>
      <offset>130</offset>
      <text>Case presentation</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">METHODS</infon>
      <offset>150</offset>
      <text>The patient improved after medication review.</text>
    </passage>
    <passage>
      <infon key="type">fig_caption</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>205</offset>
      <text>Figure 1. Timeline of symptoms.</text>
    </passage>
    <passage>
      <infon key="type">table_caption</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>240</offset>
      <text>Table 1. Laboratory findings.</text>
    </passage>
    <passage>
      <infon key="type">table</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>275</offset>
      <text>Day 1 sodium 132 Day 2 sodium 138</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">REF</infon>
      <offset>320</offset>
      <text>References</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">REF</infon>
      <offset>335</offset>
      <text>1. Reference entry that must not be materialized.</text>
    </passage>
  </document>
</collection>
"""


NO_ABSTRACT_BIOC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <source>PMC</source>
  <date>20260511</date>
  <key>test</key>
  <document>
    <id>PMC900002</id>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">CASE</infon>
      <offset>0</offset>
      <text>Case report</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">CASE</infon>
      <offset>12</offset>
      <text>A letter can still contain usable full text without an abstract.</text>
    </passage>
  </document>
</collection>
"""


CONTENTS_BIOC_XML = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <source>PMC</source>
  <date>20260511</date>
  <key>test</key>
  <document>
    <id>PMC900003</id>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>0</offset>
      <text>Table of Contents</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>20</offset>
      <text>Introduction.........1</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>42</offset>
      <text>Methods.........2</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>60</offset>
      <text>Introduction</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>75</offset>
      <text>This is the first real paragraph after the contents section.</text>
    </passage>
  </document>
</collection>
"""


def test_parse_pmc_bioc_fulltext_normalizes_sections_and_passages() -> None:
    document = parse_pmc_bioc_fulltext(
        SAMPLE_BIOC_XML,
        corpus_id=101,
        pmcid="PMC900001",
    )

    assert [section.section_ordinal_path for section in document.sections] == [
        "0001",
        "0002",
        "0002.0001",
    ]
    assert [section.section_role for section in document.sections] == [
        "abstract",
        "introduction",
        "case_report",
    ]
    assert document.sections[-1].section_role_codes == ("case_report", "methods")
    assert document.sections[-1].section_role_source == "section_type_and_title"
    assert [passage.passage_role for passage in document.passages] == [
        "abstract",
        "body",
        "body",
        "figure_caption",
        "table_caption",
        "table_body",
    ]
    assert document.passages[-1].is_retrievable is True
    assert all("Reference entry" not in passage.text for passage in document.passages)
    assert len({passage.text_checksum for passage in document.passages}) == len(document.passages)

    reparsed = parse_pmc_bioc_fulltext(
        SAMPLE_BIOC_XML,
        corpus_id=101,
        pmcid="PMC900001",
    )
    assert [passage.text_checksum for passage in reparsed.passages] == [
        passage.text_checksum for passage in document.passages
    ]


def test_parse_pmc_bioc_fulltext_accepts_no_abstract_fulltext() -> None:
    document = parse_pmc_bioc_fulltext(
        NO_ABSTRACT_BIOC_XML,
        corpus_id=102,
        pmcid="PMC900002",
    )

    assert document.sections[0].title == "Case report"
    assert document.passages[0].passage_role == "body"
    assert document.retrievable_passage_count == 1


def test_parse_pmc_bioc_fulltext_does_not_overclassify_unheaded_body() -> None:
    payload = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <document>
    <id>PMC900006</id>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>0</offset>
      <text>An unheaded letter body should not become a trusted introduction section.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>80</offset>
      <text>Web resources</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>95</offset>
      <text>ClinVar: https://www.ncbi.nlm.nih.gov/clinvar/</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">INTRO</infon>
      <offset>150</offset>
      <text>A New Classification for Atypia</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">INTRO</infon>
      <offset>185</offset>
      <text>Review article body headings should not inherit introduction by BioC label alone.</text>
    </passage>
  </document>
</collection>
"""

    document = parse_pmc_bioc_fulltext(payload, corpus_id=106, pmcid="PMC900006")

    assert [section.section_role for section in document.sections] == [
        "unknown",
        "supplement",
        "unknown",
    ]
    assert document.sections[0].section_role_source == "unknown"
    assert document.sections[2].section_role_source == "unknown"
    assert [passage.passage_role for passage in document.passages] == ["body", "other", "body"]
    assert [passage.is_retrievable for passage in document.passages] == [True, False, True]


def test_parse_pmc_bioc_fulltext_excludes_table_of_contents() -> None:
    document = parse_pmc_bioc_fulltext(
        CONTENTS_BIOC_XML,
        corpus_id=103,
        pmcid="PMC900003",
    )

    assert [section.title for section in document.sections] == ["Introduction"]
    assert [passage.text for passage in document.passages] == [
        "This is the first real paragraph after the contents section."
    ]


def test_parse_pmc_bioc_fulltext_preserves_section_role_provenance() -> None:
    payload = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <document>
    <id>PMC900005</id>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">materials|methods</infon>
      <offset>0</offset>
      <text>Materials and Methods</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">METHODS</infon>
      <offset>24</offset>
      <text>Methods paragraph remains retrievable.</text>
    </passage>
    <passage>
      <infon key="type">title_2</infon>
      <infon key="section_type"></infon>
      <offset>65</offset>
      <text>Primary endpoint</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type"></infon>
      <offset>82</offset>
      <text>Nested methods content inherits its parent role.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">BACK</infon>
      <offset>130</offset>
      <text>Data Availability Statement</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">BACK</infon>
      <offset>160</offset>
      <text>Data supporting this article are available on request.</text>
    </passage>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">REF</infon>
      <offset>220</offset>
      <text>References</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">REF</infon>
      <offset>240</offset>
      <text>1. This reference should be dropped.</text>
    </passage>
  </document>
</collection>
"""

    document = parse_pmc_bioc_fulltext(payload, corpus_id=105, pmcid="PMC900005")

    assert [section.section_role for section in document.sections] == [
        "methods",
        "methods",
        "data_availability",
    ]
    assert document.sections[0].section_role_codes == ("methods", "materials")
    assert document.sections[0].section_role_confidence >= 0.9
    assert document.sections[1].section_role_source == "parent_propagation"
    assert document.sections[1].section_role_confidence == 0.65
    assert document.sections[2].section_type == "BACK"
    assert document.sections[2].section_role_source == "title_exact"

    assert [passage.text for passage in document.passages] == [
        "Methods paragraph remains retrievable.",
        "Nested methods content inherits its parent role.",
        "Data supporting this article are available on request.",
    ]
    assert [passage.passage_role for passage in document.passages] == ["body", "body", "other"]
    assert [passage.is_retrievable for passage in document.passages] == [True, True, False]


def test_parse_pmc_bioc_fulltext_promotes_untiered_titles_to_sections() -> None:
    payload = b"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <document>
    <id>PMC900007</id>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">SUPPL</infon>
      <offset>0</offset>
      <text>Supplementary information</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">SUPPL</infon>
      <offset>28</offset>
      <text>Publisher note text remains stored as non-retrievable context.</text>
    </passage>
    <passage>
      <infon key="type">title</infon>
      <infon key="section_type">AUTH_CONT</infon>
      <offset>90</offset>
      <text>Author contributions</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">AUTH_CONT</infon>
      <offset>112</offset>
      <text>AB designed the study and CD reviewed the manuscript.</text>
    </passage>
    <passage>
      <infon key="type">title</infon>
      <infon key="section_type">COMP_INT</infon>
      <offset>170</offset>
      <text>Competing interests</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">COMP_INT</infon>
      <offset>192</offset>
      <text>One author reports consulting fees unrelated to this work.</text>
    </passage>
  </document>
</collection>
"""

    document = parse_pmc_bioc_fulltext(payload, corpus_id=107, pmcid="PMC900007")

    assert [section.section_ordinal_path for section in document.sections] == [
        "0001",
        "0001.0001",
        "0001.0002",
    ]
    assert [section.title for section in document.sections] == [
        "Supplementary information",
        "Author contributions",
        "Competing interests",
    ]
    assert [section.section_role for section in document.sections] == [
        "supplement",
        "author_contributions",
        "conflict_of_interest",
    ]
    assert document.sections[1].section_type == "AUTH_CONT"
    assert document.sections[1].section_role_codes == ("author_contributions",)
    assert document.sections[2].section_type == "COMP_INT"
    assert document.sections[2].section_role_codes == ("conflict_of_interest",)
    assert [section.section_role_source for section in document.sections] == [
        "section_type_and_title",
        "section_type_and_title",
        "section_type_and_title",
    ]
    assert [passage.text for passage in document.passages] == [
        "Publisher note text remains stored as non-retrievable context.",
        "AB designed the study and CD reviewed the manuscript.",
        "One author reports consulting fees unrelated to this work.",
    ]
    assert [passage.passage_role for passage in document.passages] == [
        "other",
        "other",
        "other",
    ]
    assert [passage.is_retrievable for passage in document.passages] == [
        False,
        False,
        False,
    ]


def test_parse_pmc_bioc_fulltext_stores_but_does_not_retrieve_huge_tables() -> None:
    huge_table = " ".join(f"cell{i}" for i in range(900))
    payload = f"""<?xml version="1.0" encoding="UTF-8"?>
<collection>
  <document>
    <id>PMC900004</id>
    <passage>
      <infon key="type">title_1</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>0</offset>
      <text>Results</text>
    </passage>
    <passage>
      <infon key="type">paragraph</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>10</offset>
      <text>Small result paragraph.</text>
    </passage>
    <passage>
      <infon key="type">table</infon>
      <infon key="section_type">RESULTS</infon>
      <offset>40</offset>
      <text>{huge_table}</text>
    </passage>
  </document>
</collection>
""".encode()

    document = parse_pmc_bioc_fulltext(payload, corpus_id=104, pmcid="PMC900004")

    assert [passage.passage_role for passage in document.passages] == ["body", "table_body"]
    assert document.passages[-1].is_retrievable is False
    assert document.retrievable_passage_count == 1


def test_parse_pmc_bioc_fulltext_rejects_malformed_xml() -> None:
    with pytest.raises(PmcFullTextParseFailed):
        parse_pmc_bioc_fulltext(b"<collection>", corpus_id=1, pmcid="PMC1")
