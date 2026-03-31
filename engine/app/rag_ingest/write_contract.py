"""Deferred write-batch contract for future warehouse persistence."""

from __future__ import annotations

from pydantic import Field, model_validator

from app.rag.parse_contract import ParseContractModel
from app.rag.rag_schema_contract import (
    PaperBlockRow,
    PaperDocumentRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSectionRow,
    PaperSentenceRow,
)
from app.rag.serving_contract import (
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
)
from app.rag.warehouse_contract import PaperCitationMentionRow, PaperEntityMentionRow


class RagWarehouseWriteBatch(ParseContractModel):
    documents: list[PaperDocumentRow] = Field(default_factory=list)
    document_sources: list[PaperDocumentSourceRow] = Field(default_factory=list)
    sections: list[PaperSectionRow] = Field(default_factory=list)
    blocks: list[PaperBlockRow] = Field(default_factory=list)
    sentences: list[PaperSentenceRow] = Field(default_factory=list)
    references: list[PaperReferenceEntryRow] = Field(default_factory=list)
    citations: list[PaperCitationMentionRow] = Field(default_factory=list)
    entities: list[PaperEntityMentionRow] = Field(default_factory=list)
    chunk_versions: list[PaperChunkVersionRecord] = Field(default_factory=list)
    chunks: list[PaperChunkRecord] = Field(default_factory=list)
    chunk_members: list[PaperChunkMemberRecord] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_batch(self) -> "RagWarehouseWriteBatch":
        document_corpus_ids = {row.corpus_id for row in self.documents}
        section_keys = {(row.corpus_id, row.section_ordinal) for row in self.sections}
        block_keys = {(row.corpus_id, row.block_ordinal) for row in self.blocks}
        sentence_keys = {
            (row.corpus_id, row.block_ordinal, row.sentence_ordinal)
            for row in self.sentences
        }
        reference_keys = {
            (row.corpus_id, row.source_reference_key) for row in self.references
        }
        chunk_keys = {
            (row.chunk_version_key, row.corpus_id, row.chunk_ordinal) for row in self.chunks
        }

        for row in self.document_sources:
            if document_corpus_ids and row.corpus_id not in document_corpus_ids:
                raise ValueError("document_sources must reference a known document corpus_id")
        for row in self.sections:
            if document_corpus_ids and row.corpus_id not in document_corpus_ids:
                raise ValueError("sections must reference a known document corpus_id")
        for row in self.blocks:
            if section_keys and (row.corpus_id, row.section_ordinal) not in section_keys:
                raise ValueError("blocks must reference a known section")
        for row in self.sentences:
            if block_keys and (row.corpus_id, row.block_ordinal) not in block_keys:
                raise ValueError("sentences must reference a known block")
        for row in self.references:
            if document_corpus_ids and row.corpus_id not in document_corpus_ids:
                raise ValueError("references must reference a known document corpus_id")
        for row in self.citations:
            if row.canonical_block_ordinal is not None and block_keys and (
                row.corpus_id,
                row.canonical_block_ordinal,
            ) not in block_keys:
                raise ValueError("citations must reference a known canonical block")
            if row.source_reference_key and reference_keys and (
                row.corpus_id,
                row.source_reference_key,
            ) not in reference_keys:
                raise ValueError("citations must reference a known source reference key")
        for row in self.entities:
            if row.canonical_block_ordinal is not None and block_keys and (
                row.corpus_id,
                row.canonical_block_ordinal,
            ) not in block_keys:
                raise ValueError("entities must reference a known canonical block")
            if row.canonical_sentence_ordinal is not None and sentence_keys and (
                row.corpus_id,
                row.canonical_block_ordinal,
                row.canonical_sentence_ordinal,
            ) not in sentence_keys:
                raise ValueError("entities must reference a known canonical sentence")
        for row in self.chunk_members:
            chunk_key = (row.chunk_version_key, row.corpus_id, row.chunk_ordinal)
            if chunk_keys and chunk_key not in chunk_keys:
                raise ValueError("chunk_members must reference a known chunk")
            if block_keys and (row.corpus_id, row.canonical_block_ordinal) not in block_keys:
                raise ValueError("chunk_members must reference a known canonical block")
            if row.canonical_sentence_ordinal is not None and sentence_keys and (
                row.corpus_id,
                row.canonical_block_ordinal,
                row.canonical_sentence_ordinal,
            ) not in sentence_keys:
                raise ValueError("chunk_members must reference a known canonical sentence")
        return self
