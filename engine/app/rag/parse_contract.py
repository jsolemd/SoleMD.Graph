"""Provisional parser-output contract for the future evidence warehouse."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ParseContractModel(BaseModel):
    """Shared Pydantic configuration for parser-output records."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True)


class ParseSourceSystem(StrEnum):
    S2ORC_V2 = "s2orc_v2"
    BIOCXML = "biocxml"


class SourcePlane(StrEnum):
    BODY = "body"
    BIBLIOGRAPHY = "bibliography"
    PASSAGE = "passage"
    FRONT_MATTER = "front_matter"
    TABLE_XML = "table_xml"


class SectionRole(StrEnum):
    ABSTRACT = "abstract"
    INTRODUCTION = "introduction"
    METHODS = "methods"
    RESULTS = "results"
    DISCUSSION = "discussion"
    CONCLUSION = "conclusion"
    SUPPLEMENT = "supplement"
    REFERENCE = "reference"
    FRONT_MATTER = "front_matter"
    OTHER = "other"


class PaperBlockKind(StrEnum):
    NARRATIVE_PARAGRAPH = "narrative_paragraph"
    FIGURE_CAPTION = "figure_caption"
    TABLE_CAPTION = "table_caption"
    TABLE_FOOTNOTE = "table_footnote"
    TABLE_BODY_TEXT = "table_body_text"


class SentenceSegmentationSource(StrEnum):
    S2ORC_ANNOTATION = "s2orc_annotation"
    STANZA_BIOMEDICAL = "stanza_biomedical"
    SYNTOK = "syntok"
    DETERMINISTIC_FALLBACK = "deterministic_fallback"


class ParseRecordBase(ParseContractModel):
    corpus_id: int
    source_system: ParseSourceSystem
    source_revision: str
    source_document_key: str
    source_plane: SourcePlane
    parser_version: str
    raw_attrs_json: dict[str, Any] = Field(default_factory=dict)


class TextParseRecord(ParseRecordBase):
    source_start_offset: int
    source_end_offset: int
    text: str

    @model_validator(mode="after")
    def validate_offsets(self) -> "TextParseRecord":
        if self.source_start_offset < 0:
            raise ValueError("source_start_offset must be non-negative")
        if self.source_end_offset < self.source_start_offset:
            raise ValueError("source_end_offset must be >= source_start_offset")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class PaperDocumentRecord(ParseRecordBase):
    title: str | None = None
    license_text: str | None = None
    language: str | None = None
    source_availability: str | None = None


class PaperSectionRecord(TextParseRecord):
    section_ordinal: int
    parent_section_ordinal: int | None = None
    section_role: SectionRole
    display_label: str | None = None
    numbering_token: str | None = None

    @model_validator(mode="after")
    def validate_section_ordinals(self) -> "PaperSectionRecord":
        if self.section_ordinal < 0:
            raise ValueError("section_ordinal must be non-negative")
        if (
            self.parent_section_ordinal is not None
            and self.parent_section_ordinal >= self.section_ordinal
        ):
            raise ValueError(
                "parent_section_ordinal must be less than section_ordinal"
            )
        return self


class PaperBlockRecord(TextParseRecord):
    block_ordinal: int
    section_ordinal: int
    block_kind: PaperBlockKind
    section_role: SectionRole
    is_retrieval_default: bool = True
    linked_asset_ref: str | None = None

    @model_validator(mode="after")
    def validate_block_ordinals(self) -> "PaperBlockRecord":
        if self.block_ordinal < 0:
            raise ValueError("block_ordinal must be non-negative")
        if self.section_ordinal < 0:
            raise ValueError("section_ordinal must be non-negative")
        return self


class PaperSentenceRecord(TextParseRecord):
    sentence_ordinal: int
    block_ordinal: int
    section_ordinal: int
    segmentation_source: SentenceSegmentationSource

    @model_validator(mode="after")
    def validate_sentence_ordinals(self) -> "PaperSentenceRecord":
        if self.sentence_ordinal < 0:
            raise ValueError("sentence_ordinal must be non-negative")
        if self.block_ordinal < 0 or self.section_ordinal < 0:
            raise ValueError("block_ordinal and section_ordinal must be non-negative")
        return self


class PaperReferenceEntryRecord(TextParseRecord):
    source_reference_key: str
    reference_ordinal: int
    matched_paper_id: str | None = None
    matched_corpus_id: int | None = None

    @model_validator(mode="after")
    def validate_reference(self) -> "PaperReferenceEntryRecord":
        if self.reference_ordinal < 0:
            raise ValueError("reference_ordinal must be non-negative")
        if not self.source_reference_key:
            raise ValueError("source_reference_key must not be empty")
        return self


class PaperCitationMentionRecord(TextParseRecord):
    source_citation_key: str
    block_ordinal: int
    section_ordinal: int
    sentence_ordinal: int | None = None
    matched_paper_id: str | None = None
    matched_corpus_id: int | None = None

    @model_validator(mode="after")
    def validate_citation_mention(self) -> "PaperCitationMentionRecord":
        if not self.source_citation_key:
            raise ValueError("source_citation_key must not be empty")
        if self.block_ordinal < 0 or self.section_ordinal < 0:
            raise ValueError("block_ordinal and section_ordinal must be non-negative")
        if self.sentence_ordinal is not None and self.sentence_ordinal < 0:
            raise ValueError("sentence_ordinal must be non-negative when present")
        return self


class PaperEntityMentionRecord(TextParseRecord):
    entity_type: str
    source_identifier: str | None = None
    concept_id: str | None = None
    concept_namespace: str | None = None
    block_ordinal: int | None = None
    section_ordinal: int | None = None
    sentence_ordinal: int | None = None

    @model_validator(mode="after")
    def validate_entity_mention(self) -> "PaperEntityMentionRecord":
        if not self.entity_type:
            raise ValueError("entity_type must not be empty")
        if self.concept_namespace and not self.concept_id:
            raise ValueError("concept_id must be present when concept_namespace is set")
        for field_name in ("block_ordinal", "section_ordinal", "sentence_ordinal"):
            value = getattr(self, field_name)
            if value is not None and value < 0:
                raise ValueError(f"{field_name} must be non-negative when present")
        return self
