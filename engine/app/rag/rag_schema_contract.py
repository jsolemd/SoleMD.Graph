"""Deferred RAG warehouse schema contract derived from parser/serving models."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.parse_contract import (
    ParseContractModel,
    ParseSourceSystem,
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)


class PartitionKind(StrEnum):
    NONE = "none"
    HASH = "hash"


class IndexKind(StrEnum):
    BTREE = "btree"
    GIN = "gin"


@dataclass(slots=True)
class WarehouseIndexSpec:
    name: str
    kind: IndexKind
    columns: tuple[str, ...]
    unique: bool = False
    where_sql: str | None = None
    include_columns: tuple[str, ...] = ()


@dataclass(slots=True)
class WarehouseTableSpec:
    table_name: str
    row_model_name: str
    primary_key: tuple[str, ...]
    partition_kind: PartitionKind = PartitionKind.NONE
    partition_key: tuple[str, ...] = ()
    indexes: list[WarehouseIndexSpec] = field(default_factory=list)


class PaperDocumentRow(ParseContractModel):
    corpus_id: int
    title: str | None = None
    language: str | None = None
    source_availability: str | None = None
    primary_source_system: ParseSourceSystem | None = None


class PaperDocumentSourceRow(ParseContractModel):
    corpus_id: int
    document_source_ordinal: int
    source_system: ParseSourceSystem
    source_revision: str
    source_document_key: str
    source_plane: SourcePlane
    parser_version: str
    is_primary_text_source: bool = False
    raw_attrs_json: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_row(self) -> "PaperDocumentSourceRow":
        if self.document_source_ordinal < 0:
            raise ValueError("document_source_ordinal must be non-negative")
        if not self.source_revision:
            raise ValueError("source_revision must not be empty")
        if not self.source_document_key:
            raise ValueError("source_document_key must not be empty")
        return self


class PaperSectionRow(ParseContractModel):
    corpus_id: int
    section_ordinal: int
    parent_section_ordinal: int | None = None
    section_role: SectionRole
    display_label: str | None = None
    numbering_token: str | None = None
    text: str

    @model_validator(mode="after")
    def validate_row(self) -> "PaperSectionRow":
        if self.section_ordinal < 0:
            raise ValueError("section_ordinal must be non-negative")
        if self.parent_section_ordinal is not None and self.parent_section_ordinal >= self.section_ordinal:
            raise ValueError("parent_section_ordinal must be less than section_ordinal")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class PaperBlockRow(ParseContractModel):
    corpus_id: int
    block_ordinal: int
    section_ordinal: int
    section_role: SectionRole
    block_kind: PaperBlockKind
    text: str
    is_retrieval_default: bool = True
    linked_asset_ref: str | None = None

    @model_validator(mode="after")
    def validate_row(self) -> "PaperBlockRow":
        if self.block_ordinal < 0 or self.section_ordinal < 0:
            raise ValueError("block_ordinal and section_ordinal must be non-negative")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class PaperSentenceRow(ParseContractModel):
    corpus_id: int
    block_ordinal: int
    sentence_ordinal: int
    section_ordinal: int
    segmentation_source: SentenceSegmentationSource
    text: str

    @model_validator(mode="after")
    def validate_row(self) -> "PaperSentenceRow":
        if self.block_ordinal < 0 or self.sentence_ordinal < 0 or self.section_ordinal < 0:
            raise ValueError(
                "block_ordinal, sentence_ordinal, and section_ordinal must be non-negative"
            )
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class PaperReferenceEntryRow(ParseContractModel):
    corpus_id: int
    reference_ordinal: int
    source_reference_key: str
    text: str
    matched_paper_id: str | None = None
    matched_corpus_id: int | None = None

    @model_validator(mode="after")
    def validate_row(self) -> "PaperReferenceEntryRow":
        if self.reference_ordinal < 0:
            raise ValueError("reference_ordinal must be non-negative")
        if not self.source_reference_key:
            raise ValueError("source_reference_key must not be empty")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


def build_warehouse_table_specs() -> list[WarehouseTableSpec]:
    return [
        WarehouseTableSpec(
            table_name="paper_documents",
            row_model_name="PaperDocumentRow",
            primary_key=("corpus_id",),
        ),
        WarehouseTableSpec(
            table_name="paper_document_sources",
            row_model_name="PaperDocumentSourceRow",
            primary_key=("corpus_id", "document_source_ordinal"),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_document_sources_source_identity",
                    kind=IndexKind.BTREE,
                    columns=(
                        "source_system",
                        "source_revision",
                        "source_document_key",
                        "source_plane",
                    ),
                    unique=True,
                )
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_sections",
            row_model_name="PaperSectionRow",
            primary_key=("corpus_id", "section_ordinal"),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_sections_parent",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "parent_section_ordinal"),
                )
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_blocks",
            row_model_name="PaperBlockRow",
            primary_key=("corpus_id", "block_ordinal"),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_blocks_section",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "section_ordinal", "block_ordinal"),
                ),
                WarehouseIndexSpec(
                    name="idx_paper_blocks_retrieval_default",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "section_role", "block_kind"),
                    where_sql="is_retrieval_default",
                ),
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_sentences",
            row_model_name="PaperSentenceRow",
            primary_key=("corpus_id", "block_ordinal", "sentence_ordinal"),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_sentences_block",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "block_ordinal", "sentence_ordinal"),
                )
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_reference_entries",
            row_model_name="PaperReferenceEntryRow",
            primary_key=("corpus_id", "reference_ordinal"),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_reference_entries_source_key",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "source_reference_key"),
                    unique=True,
                ),
                WarehouseIndexSpec(
                    name="idx_paper_reference_entries_matched_corpus",
                    kind=IndexKind.BTREE,
                    columns=("matched_corpus_id",),
                    where_sql="matched_corpus_id IS NOT NULL",
                ),
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_citation_mentions",
            row_model_name="PaperCitationMentionRow",
            primary_key=(
                "corpus_id",
                "source_system",
                "source_revision",
                "source_citation_key",
                "source_start_offset",
            ),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_citation_mentions_canonical_span",
                    kind=IndexKind.BTREE,
                    columns=(
                        "corpus_id",
                        "canonical_block_ordinal",
                        "canonical_sentence_ordinal",
                    ),
                    where_sql="canonical_block_ordinal IS NOT NULL",
                ),
                WarehouseIndexSpec(
                    name="idx_paper_citation_mentions_source_key",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "source_citation_key"),
                ),
                WarehouseIndexSpec(
                    name="idx_paper_citation_mentions_matched_corpus",
                    kind=IndexKind.BTREE,
                    columns=("matched_corpus_id",),
                    where_sql="matched_corpus_id IS NOT NULL",
                ),
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_entity_mentions",
            row_model_name="PaperEntityMentionRow",
            primary_key=(
                "corpus_id",
                "source_system",
                "source_revision",
                "source_start_offset",
                "source_end_offset",
            ),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_entity_mentions_concept",
                    kind=IndexKind.BTREE,
                    columns=("concept_namespace", "concept_id", "corpus_id"),
                    where_sql="concept_namespace IS NOT NULL AND concept_id IS NOT NULL",
                ),
                WarehouseIndexSpec(
                    name="idx_paper_entity_mentions_canonical_span",
                    kind=IndexKind.BTREE,
                    columns=(
                        "corpus_id",
                        "canonical_block_ordinal",
                        "canonical_sentence_ordinal",
                    ),
                    where_sql="canonical_block_ordinal IS NOT NULL",
                ),
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_chunk_versions",
            row_model_name="PaperChunkVersionRecord",
            primary_key=("chunk_version_key",),
        ),
        WarehouseTableSpec(
            table_name="paper_chunks",
            row_model_name="PaperChunkRecord",
            primary_key=("chunk_version_key", "corpus_id", "chunk_ordinal"),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_chunks_lookup",
                    kind=IndexKind.BTREE,
                    columns=("chunk_version_key", "corpus_id"),
                )
            ],
        ),
        WarehouseTableSpec(
            table_name="paper_chunk_members",
            row_model_name="PaperChunkMemberRecord",
            primary_key=("chunk_version_key", "corpus_id", "chunk_ordinal", "member_ordinal"),
            partition_kind=PartitionKind.HASH,
            partition_key=("corpus_id",),
            indexes=[
                WarehouseIndexSpec(
                    name="idx_paper_chunk_members_block",
                    kind=IndexKind.BTREE,
                    columns=("corpus_id", "canonical_block_ordinal"),
                ),
                WarehouseIndexSpec(
                    name="idx_paper_chunk_members_sentence",
                    kind=IndexKind.BTREE,
                    columns=(
                        "corpus_id",
                        "canonical_block_ordinal",
                        "canonical_sentence_ordinal",
                    ),
                    where_sql="canonical_sentence_ordinal IS NOT NULL",
                ),
            ],
        ),
    ]
