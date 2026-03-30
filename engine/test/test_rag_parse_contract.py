from __future__ import annotations

import pytest

from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperCitationMentionRecord,
    PaperDocumentRecord,
    PaperEntityMentionRecord,
    PaperReferenceEntryRecord,
    PaperSectionRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)


@pytest.fixture
def common_identity() -> dict[str, object]:
    return {
        "corpus_id": 12345,
        "source_system": ParseSourceSystem.S2ORC_V2,
        "source_revision": "2026-03-10",
        "source_document_key": "12345",
        "source_plane": SourcePlane.BODY,
        "parser_version": "parser-v1",
        "raw_attrs_json": {},
    }


def test_document_record_accepts_document_level_metadata(common_identity: dict[str, object]):
    record = PaperDocumentRecord(
        **common_identity,
        title="Example Paper",
        license_text="CC-BY",
        language="en",
        source_availability="full_text",
    )

    assert record.title == "Example Paper"
    assert record.source_system == ParseSourceSystem.S2ORC_V2


def test_section_role_and_block_kind_are_distinct_axes(common_identity: dict[str, object]):
    section = PaperSectionRecord(
        **common_identity,
        source_start_offset=120,
        source_end_offset=138,
        text="Materials and Methods",
        section_ordinal=1,
        section_role=SectionRole.METHODS,
        display_label="Materials and Methods",
        numbering_token="2.",
    )
    block = PaperBlockRecord(
        **common_identity,
        source_start_offset=139,
        source_end_offset=260,
        text="Patients were recruited from...",
        block_ordinal=0,
        section_ordinal=1,
        section_role=SectionRole.METHODS,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
    )

    assert section.section_role == SectionRole.METHODS
    assert block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH


def test_sentence_record_supports_deterministic_fallback(common_identity: dict[str, object]):
    record = PaperSentenceRecord(
        **common_identity,
        source_start_offset=139,
        source_end_offset=172,
        text="Patients were recruited from clinic.",
        sentence_ordinal=0,
        block_ordinal=0,
        section_ordinal=1,
        segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
    )

    assert (
        record.segmentation_source
        == SentenceSegmentationSource.DETERMINISTIC_FALLBACK
    )


def test_reference_and_citation_bridge_keys_are_first_class(common_identity: dict[str, object]):
    bibliography_identity = {**common_identity, "source_plane": SourcePlane.BIBLIOGRAPHY}
    reference = PaperReferenceEntryRecord(
        **bibliography_identity,
        source_start_offset=2000,
        source_end_offset=2100,
        text="Example reference entry.",
        source_reference_key="b12",
        reference_ordinal=12,
        matched_paper_id="S2:abc",
        matched_corpus_id=67890,
    )
    citation = PaperCitationMentionRecord(
        **common_identity,
        source_start_offset=420,
        source_end_offset=423,
        text="[12]",
        source_citation_key="b12",
        block_ordinal=3,
        section_ordinal=1,
        sentence_ordinal=6,
        matched_paper_id="S2:abc",
        matched_corpus_id=67890,
    )

    assert reference.source_reference_key == citation.source_citation_key
    assert citation.matched_corpus_id == 67890


def test_invalid_offsets_are_rejected(common_identity: dict[str, object]):
    with pytest.raises(ValueError, match="source_end_offset must be >="):
        PaperBlockRecord(
            **common_identity,
            source_start_offset=50,
            source_end_offset=10,
            text="bad span",
            block_ordinal=0,
            section_ordinal=0,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.FIGURE_CAPTION,
        )


def test_empty_reference_key_is_rejected(common_identity: dict[str, object]):
    bibliography_identity = {**common_identity, "source_plane": SourcePlane.BIBLIOGRAPHY}
    with pytest.raises(ValueError, match="source_reference_key must not be empty"):
        PaperReferenceEntryRecord(
            **bibliography_identity,
            source_start_offset=100,
            source_end_offset=140,
            text="Ref text",
            source_reference_key="",
            reference_ordinal=0,
        )


def test_entity_mentions_can_carry_concept_namespace_and_id(
    common_identity: dict[str, object],
):
    record = PaperEntityMentionRecord(
        **common_identity,
        source_start_offset=10,
        source_end_offset=15,
        text="BRCA1",
        entity_type="Gene",
        source_identifier="672",
        concept_namespace="ncbi_gene",
        concept_id="672",
        block_ordinal=0,
        section_ordinal=0,
        sentence_ordinal=0,
    )

    assert record.source_identifier == "672"
    assert record.concept_namespace == "ncbi_gene"
    assert record.concept_id == "672"


def test_entity_mentions_require_concept_id_when_namespace_is_set(
    common_identity: dict[str, object],
):
    with pytest.raises(
        ValueError, match="concept_id must be present when concept_namespace is set"
    ):
        PaperEntityMentionRecord(
            **common_identity,
            source_start_offset=10,
            source_end_offset=18,
            text="melatonin",
            entity_type="Chemical",
            concept_namespace="mesh",
        )
