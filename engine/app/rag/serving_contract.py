"""Derived serving-layer contract for chunks and cited-answer packets."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.parse_contract import (
    ParseContractModel,
    PaperBlockKind,
    SectionRole,
    SentenceSegmentationSource,
)
from app.rag.warehouse_contract import AlignmentStatus, SpanOrigin


class CaptionMergePolicy(StrEnum):
    STANDALONE = "standalone"
    NARRATIVE_ONLY_ADJACENT = "narrative_only_adjacent"


class SentenceOverlapPolicy(StrEnum):
    NONE = "none"
    EDGE_SENTENCE = "edge_sentence"


class ChunkMemberKind(StrEnum):
    BLOCK = "block"
    SENTENCE = "sentence"


class PaperChunkVersionRecord(ParseContractModel):
    chunk_version_key: str
    source_revision_keys: list[str] = Field(default_factory=list)
    parser_version: str
    text_normalization_version: str
    sentence_source_policy: list[SentenceSegmentationSource] = Field(default_factory=list)
    included_section_roles: list[SectionRole] = Field(default_factory=list)
    included_block_kinds: list[PaperBlockKind] = Field(default_factory=list)
    caption_merge_policy: CaptionMergePolicy
    tokenizer_name: str
    tokenizer_version: str | None = None
    target_token_budget: int
    hard_max_tokens: int
    sentence_overlap_policy: SentenceOverlapPolicy
    embedding_model: str | None = None
    lexical_normalization_flags: list[str] = Field(default_factory=list)
    retrieval_default_only: bool = True

    @model_validator(mode="after")
    def validate_chunk_version(self) -> "PaperChunkVersionRecord":
        if not self.chunk_version_key:
            raise ValueError("chunk_version_key must not be empty")
        if self.target_token_budget <= 0:
            raise ValueError("target_token_budget must be positive")
        if self.hard_max_tokens < self.target_token_budget:
            raise ValueError("hard_max_tokens must be >= target_token_budget")
        return self


class PaperChunkRecord(ParseContractModel):
    chunk_version_key: str
    corpus_id: int
    chunk_ordinal: int
    canonical_section_ordinal: int
    section_role: SectionRole
    primary_block_kind: PaperBlockKind
    text: str
    token_count_estimate: int
    is_retrieval_default: bool = True

    @model_validator(mode="after")
    def validate_chunk(self) -> "PaperChunkRecord":
        if not self.chunk_version_key:
            raise ValueError("chunk_version_key must not be empty")
        if self.chunk_ordinal < 0:
            raise ValueError("chunk_ordinal must be non-negative")
        if self.canonical_section_ordinal < 0:
            raise ValueError("canonical_section_ordinal must be non-negative")
        if self.token_count_estimate <= 0:
            raise ValueError("token_count_estimate must be positive")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class PaperChunkMemberRecord(ParseContractModel):
    chunk_version_key: str
    corpus_id: int
    chunk_ordinal: int
    member_ordinal: int
    member_kind: ChunkMemberKind
    canonical_block_ordinal: int
    canonical_sentence_ordinal: int | None = None
    is_overlap_member: bool = False

    @model_validator(mode="after")
    def validate_member(self) -> "PaperChunkMemberRecord":
        if not self.chunk_version_key:
            raise ValueError("chunk_version_key must not be empty")
        if self.chunk_ordinal < 0 or self.member_ordinal < 0:
            raise ValueError("chunk_ordinal and member_ordinal must be non-negative")
        if self.canonical_block_ordinal < 0:
            raise ValueError("canonical_block_ordinal must be non-negative")
        if self.member_kind == ChunkMemberKind.SENTENCE and self.canonical_sentence_ordinal is None:
            raise ValueError(
                "canonical_sentence_ordinal must be present for sentence chunk members"
            )
        if self.member_kind == ChunkMemberKind.BLOCK and self.canonical_sentence_ordinal is not None:
            raise ValueError(
                "canonical_sentence_ordinal must be omitted for block chunk members"
            )
        if self.canonical_sentence_ordinal is not None and self.canonical_sentence_ordinal < 0:
            raise ValueError("canonical_sentence_ordinal must be non-negative")
        return self


class CitedEntityPacket(ParseContractModel):
    entity_type: str
    text: str
    concept_namespace: str | None = None
    concept_id: str | None = None
    source_identifier: str | None = None


class CitedSpanPacket(ParseContractModel):
    packet_id: str
    corpus_id: int
    canonical_section_ordinal: int
    canonical_block_ordinal: int
    canonical_sentence_ordinal: int | None = None
    section_role: SectionRole
    block_kind: PaperBlockKind
    span_origin: SpanOrigin
    alignment_status: AlignmentStatus
    alignment_confidence: float | None = None
    text: str
    quote_text: str | None = None
    source_citation_keys: list[str] = Field(default_factory=list)
    source_reference_keys: list[str] = Field(default_factory=list)
    entity_mentions: list[CitedEntityPacket] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_packet(self) -> "CitedSpanPacket":
        if not self.packet_id:
            raise ValueError("packet_id must not be empty")
        if self.canonical_section_ordinal < 0 or self.canonical_block_ordinal < 0:
            raise ValueError("canonical section/block ordinals must be non-negative")
        if self.canonical_sentence_ordinal is not None and self.canonical_sentence_ordinal < 0:
            raise ValueError("canonical_sentence_ordinal must be non-negative")
        if self.alignment_confidence is not None and not 0.0 <= self.alignment_confidence <= 1.0:
            raise ValueError("alignment_confidence must be between 0.0 and 1.0")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class InlineCitationAnchor(ParseContractModel):
    anchor_id: str
    label: str
    cited_span_ids: list[str] = Field(default_factory=list)
    cited_corpus_ids: list[int] = Field(default_factory=list)
    short_evidence_label: str | None = None

    @model_validator(mode="after")
    def validate_anchor(self) -> "InlineCitationAnchor":
        if not self.anchor_id:
            raise ValueError("anchor_id must not be empty")
        if not self.label:
            raise ValueError("label must not be empty")
        if not self.cited_span_ids:
            raise ValueError("cited_span_ids must not be empty")
        return self


class AnswerSegment(ParseContractModel):
    segment_ordinal: int
    text: str
    citation_anchor_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_segment(self) -> "AnswerSegment":
        if self.segment_ordinal < 0:
            raise ValueError("segment_ordinal must be non-negative")
        if not self.text:
            raise ValueError("text must not be empty")
        return self


class GroundedAnswerRecord(ParseContractModel):
    segments: list[AnswerSegment] = Field(default_factory=list)
    inline_citations: list[InlineCitationAnchor] = Field(default_factory=list)
    cited_spans: list[CitedSpanPacket] = Field(default_factory=list)
    answer_linked_corpus_ids: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_grounded_answer(self) -> "GroundedAnswerRecord":
        anchor_ids = {anchor.anchor_id for anchor in self.inline_citations}
        for segment in self.segments:
            missing = [anchor_id for anchor_id in segment.citation_anchor_ids if anchor_id not in anchor_ids]
            if missing:
                raise ValueError(
                    "citation_anchor_ids must reference defined inline citations"
                )

        span_ids = {packet.packet_id for packet in self.cited_spans}
        for anchor in self.inline_citations:
            missing = [span_id for span_id in anchor.cited_span_ids if span_id not in span_ids]
            if missing:
                raise ValueError("inline citations must reference defined cited spans")
        return self


def derive_answer_linked_corpus_ids(
    *,
    cited_spans: list[CitedSpanPacket],
    inline_citations: list[InlineCitationAnchor],
) -> list[int]:
    span_to_corpus = {packet.packet_id: packet.corpus_id for packet in cited_spans}
    linked: set[int] = set()
    for anchor in inline_citations:
        linked.update(anchor.cited_corpus_ids)
        for span_id in anchor.cited_span_ids:
            corpus_id = span_to_corpus.get(span_id)
            if corpus_id is not None:
                linked.add(corpus_id)
    return sorted(linked)
