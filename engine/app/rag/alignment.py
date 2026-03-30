"""Conservative alignment helpers for canonical warehouse spans."""

from __future__ import annotations

from pydantic import model_validator

from app.rag.parse_contract import (
    ParseContractModel,
    PaperBlockRecord,
    PaperSentenceRecord,
)
from app.rag.warehouse_contract import AlignmentStatus


class SpanAlignmentResult(ParseContractModel):
    alignment_status: AlignmentStatus
    alignment_confidence: float | None = None
    canonical_section_ordinal: int | None = None
    canonical_block_ordinal: int | None = None
    canonical_sentence_ordinal: int | None = None

    @model_validator(mode="after")
    def validate_result(self) -> "SpanAlignmentResult":
        if self.alignment_confidence is not None and not 0.0 <= self.alignment_confidence <= 1.0:
            raise ValueError("alignment_confidence must be between 0.0 and 1.0")
        if self.alignment_status == AlignmentStatus.SOURCE_LOCAL_ONLY:
            if any(
                value is not None
                for value in (
                    self.canonical_section_ordinal,
                    self.canonical_block_ordinal,
                    self.canonical_sentence_ordinal,
                )
            ):
                raise ValueError(
                    "canonical ordinals must be omitted for source-local-only alignment"
                )
        return self


def align_span_to_canonical_ordinals(
    *,
    start_offset: int,
    end_offset: int,
    canonical_blocks: list[PaperBlockRecord],
    canonical_sentences: list[PaperSentenceRecord],
) -> SpanAlignmentResult:
    """Align one source span to canonical block/sentence ordinals conservatively.

    This helper is intentionally strict. It only returns canonical ordinals when
    the provided canonical spans clearly contain the source span in the same
    offset space. Cross-source alignment remains a higher-level concern.
    """

    containing_blocks = [
        block
        for block in canonical_blocks
        if block.source_start_offset <= start_offset and end_offset <= block.source_end_offset
    ]
    if not containing_blocks:
        return SpanAlignmentResult(
            alignment_status=AlignmentStatus.SOURCE_LOCAL_ONLY,
            alignment_confidence=0.0,
        )

    block = min(
        containing_blocks,
        key=lambda item: item.source_end_offset - item.source_start_offset,
    )
    block_sentences = [
        sentence
        for sentence in canonical_sentences
        if sentence.block_ordinal == block.block_ordinal
    ]
    containing_sentences = [
        sentence
        for sentence in block_sentences
        if sentence.source_start_offset <= start_offset
        and end_offset <= sentence.source_end_offset
    ]
    if containing_sentences:
        sentence = min(
            containing_sentences,
            key=lambda item: item.source_end_offset - item.source_start_offset,
        )
        return SpanAlignmentResult(
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            canonical_section_ordinal=block.section_ordinal,
            canonical_block_ordinal=block.block_ordinal,
            canonical_sentence_ordinal=sentence.sentence_ordinal,
        )

    if not block_sentences:
        return SpanAlignmentResult(
            alignment_status=AlignmentStatus.EXACT,
            alignment_confidence=1.0,
            canonical_section_ordinal=block.section_ordinal,
            canonical_block_ordinal=block.block_ordinal,
        )

    return SpanAlignmentResult(
        alignment_status=AlignmentStatus.BOUNDED,
        alignment_confidence=0.7,
        canonical_section_ordinal=block.section_ordinal,
        canonical_block_ordinal=block.block_ordinal,
    )
