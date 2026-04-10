"""Provisional warehouse-row contract for citation and entity grounding."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.parse_contract import (
    PaperCitationMentionRecord,
    PaperEntityMentionRecord,
    ParseContractModel,
    ParseSourceSystem,
    SourcePlane,
)


class SpanOrigin(StrEnum):
    PRIMARY_TEXT = "primary_text"
    ANNOTATION_OVERLAY = "annotation_overlay"


class AlignmentStatus(StrEnum):
    EXACT = "exact"
    BOUNDED = "bounded"
    SOURCE_LOCAL_ONLY = "source_local_only"


class WarehouseRowBase(ParseContractModel):
    corpus_id: int
    source_system: ParseSourceSystem
    source_revision: str
    source_document_key: str
    source_plane: SourcePlane
    parser_version: str
    raw_attrs_json: dict[str, object] = Field(default_factory=dict)


class WarehouseAlignedSpanRow(WarehouseRowBase):
    span_origin: SpanOrigin
    alignment_status: AlignmentStatus
    alignment_confidence: float | None = None
    source_start_offset: int
    source_end_offset: int
    text: str
    canonical_section_ordinal: int | None = None
    canonical_block_ordinal: int | None = None
    canonical_sentence_ordinal: int | None = None

    @model_validator(mode="after")
    def validate_alignment(self) -> WarehouseAlignedSpanRow:
        if self.source_start_offset < 0:
            raise ValueError("source_start_offset must be non-negative")
        if self.source_end_offset < self.source_start_offset:
            raise ValueError("source_end_offset must be >= source_start_offset")
        if not self.text:
            raise ValueError("text must not be empty")
        if self.alignment_confidence is not None and not 0.0 <= self.alignment_confidence <= 1.0:
            raise ValueError("alignment_confidence must be between 0.0 and 1.0")
        if self.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY:
            if self.canonical_section_ordinal is not None:
                raise ValueError(
                    "canonical ordinals must be omitted for source-local-only rows"
                )
            if self.canonical_block_ordinal is not None:
                raise ValueError(
                    "canonical ordinals must be omitted for source-local-only rows"
                )
            if self.canonical_sentence_ordinal is not None:
                raise ValueError(
                    "canonical ordinals must be omitted for source-local-only rows"
                )
        return self


class PaperCitationMentionRow(WarehouseAlignedSpanRow):
    source_citation_key: str
    source_reference_key: str | None = None
    matched_paper_id: str | None = None
    matched_corpus_id: int | None = None


class PaperEntityMentionRow(WarehouseAlignedSpanRow):
    entity_type: str
    source_identifier: str | None = None
    concept_namespace: str | None = None
    concept_id: str | None = None

    @model_validator(mode="after")
    def validate_entity(self) -> PaperEntityMentionRow:
        if not self.entity_type:
            raise ValueError("entity_type must not be empty")
        if self.concept_namespace and not self.concept_id:
            raise ValueError("concept_id must be present when concept_namespace is set")
        return self


def citation_row_from_parse(
    record: PaperCitationMentionRecord,
    *,
    span_origin: SpanOrigin,
    alignment_status: AlignmentStatus,
    alignment_confidence: float | None = None,
    canonical_section_ordinal: int | None = None,
    canonical_block_ordinal: int | None = None,
    canonical_sentence_ordinal: int | None = None,
) -> PaperCitationMentionRow:
    return PaperCitationMentionRow(
        corpus_id=record.corpus_id,
        source_system=record.source_system,
        source_revision=record.source_revision,
        source_document_key=record.source_document_key,
        source_plane=record.source_plane,
        parser_version=record.parser_version,
        raw_attrs_json=record.raw_attrs_json,
        span_origin=span_origin,
        alignment_status=alignment_status,
        alignment_confidence=alignment_confidence,
        source_start_offset=record.source_start_offset,
        source_end_offset=record.source_end_offset,
        text=record.text,
        canonical_section_ordinal=canonical_section_ordinal,
        canonical_block_ordinal=canonical_block_ordinal,
        canonical_sentence_ordinal=canonical_sentence_ordinal,
        source_citation_key=record.source_citation_key,
        source_reference_key=record.source_citation_key,
        matched_paper_id=record.matched_paper_id,
        matched_corpus_id=record.matched_corpus_id,
    )


def entity_row_from_parse(
    record: PaperEntityMentionRecord,
    *,
    span_origin: SpanOrigin,
    alignment_status: AlignmentStatus,
    alignment_confidence: float | None = None,
    canonical_section_ordinal: int | None = None,
    canonical_block_ordinal: int | None = None,
    canonical_sentence_ordinal: int | None = None,
) -> PaperEntityMentionRow:
    return PaperEntityMentionRow(
        corpus_id=record.corpus_id,
        source_system=record.source_system,
        source_revision=record.source_revision,
        source_document_key=record.source_document_key,
        source_plane=record.source_plane,
        parser_version=record.parser_version,
        raw_attrs_json=record.raw_attrs_json,
        span_origin=span_origin,
        alignment_status=alignment_status,
        alignment_confidence=alignment_confidence,
        source_start_offset=record.source_start_offset,
        source_end_offset=record.source_end_offset,
        text=record.text,
        canonical_section_ordinal=canonical_section_ordinal,
        canonical_block_ordinal=canonical_block_ordinal,
        canonical_sentence_ordinal=canonical_sentence_ordinal,
        entity_type=record.entity_type,
        source_identifier=record.source_identifier,
        concept_namespace=record.concept_namespace,
        concept_id=record.concept_id,
    )
