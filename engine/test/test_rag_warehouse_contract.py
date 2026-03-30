from __future__ import annotations

import pytest

from app.rag.parse_contract import (
    PaperCitationMentionRecord,
    PaperEntityMentionRecord,
    ParseSourceSystem,
    SourcePlane,
)
from app.rag.warehouse_contract import (
    AlignmentStatus,
    SpanOrigin,
    citation_row_from_parse,
    entity_row_from_parse,
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


def test_citation_row_from_parse_supports_exact_alignment(
    common_identity: dict[str, object],
):
    record = PaperCitationMentionRecord(
        **common_identity,
        source_start_offset=100,
        source_end_offset=103,
        text="[1]",
        source_citation_key="b1",
        block_ordinal=2,
        section_ordinal=1,
        sentence_ordinal=4,
        matched_paper_id="S2:paper-1",
        matched_corpus_id=67890,
    )

    row = citation_row_from_parse(
        record,
        span_origin=SpanOrigin.PRIMARY_TEXT,
        alignment_status=AlignmentStatus.EXACT,
        alignment_confidence=1.0,
        canonical_section_ordinal=1,
        canonical_block_ordinal=2,
        canonical_sentence_ordinal=4,
    )

    assert row.source_citation_key == "b1"
    assert row.source_reference_key == "b1"
    assert row.alignment_status == AlignmentStatus.EXACT
    assert row.canonical_block_ordinal == 2


def test_entity_row_from_parse_supports_source_local_overlay_mentions(
    common_identity: dict[str, object],
):
    overlay_identity = {
        **common_identity,
        "source_system": ParseSourceSystem.BIOCXML,
        "source_plane": SourcePlane.PASSAGE,
    }
    record = PaperEntityMentionRecord(
        **overlay_identity,
        source_start_offset=20,
        source_end_offset=25,
        text="BRCA1",
        entity_type="Gene",
        source_identifier="672",
        concept_namespace="ncbi_gene",
        concept_id="672",
        block_ordinal=0,
        section_ordinal=1,
        sentence_ordinal=0,
    )

    row = entity_row_from_parse(
        record,
        span_origin=SpanOrigin.ANNOTATION_OVERLAY,
        alignment_status=AlignmentStatus.SOURCE_LOCAL_ONLY,
    )

    assert row.source_identifier == "672"
    assert row.concept_namespace == "ncbi_gene"
    assert row.canonical_block_ordinal is None
    assert row.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY


def test_source_local_rows_reject_canonical_ordinals(common_identity: dict[str, object]):
    record = PaperEntityMentionRecord(
        **common_identity,
        source_start_offset=10,
        source_end_offset=20,
        text="melatonin",
        entity_type="Chemical",
        source_identifier="MESH:D008550",
        concept_namespace="mesh",
        concept_id="D008550",
        block_ordinal=0,
        section_ordinal=0,
        sentence_ordinal=0,
    )

    with pytest.raises(
        ValueError, match="canonical ordinals must be omitted for source-local-only rows"
    ):
        entity_row_from_parse(
            record,
            span_origin=SpanOrigin.ANNOTATION_OVERLAY,
            alignment_status=AlignmentStatus.SOURCE_LOCAL_ONLY,
            canonical_block_ordinal=0,
        )
