"""Structural chunk assembly over canonical block and sentence records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable

from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperSentenceRecord,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    ChunkMemberKind,
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
)


@dataclass(slots=True)
class ChunkAssemblyResult:
    chunks: list[PaperChunkRecord] = field(default_factory=list)
    members: list[PaperChunkMemberRecord] = field(default_factory=list)


@dataclass(slots=True)
class _ChunkBlockSlice:
    block: PaperBlockRecord
    text: str
    sentence_rows: list[PaperSentenceRecord] = field(default_factory=list)
    is_partial_block: bool = False


def _default_token_counter(text: str) -> int:
    return len([part for part in text.split() if part])


def assemble_structural_chunks(
    *,
    version: PaperChunkVersionRecord,
    blocks: list[PaperBlockRecord],
    sentences: list[PaperSentenceRecord],
    token_counter: Callable[[str], int] | None = None,
) -> ChunkAssemblyResult:
    """Assemble derived retrieval chunks from canonical spans.

    This is intentionally conservative:
    - only included block/section kinds participate
    - captions stay standalone by default
    - only adjacent narrative blocks in the same section can merge
    """

    count_tokens = token_counter or _default_token_counter
    sentence_rows_by_block: dict[int, list[PaperSentenceRecord]] = {}
    block_slices_cache: dict[int, list[_ChunkBlockSlice]] = {}
    for sentence in sorted(sentences, key=lambda item: (item.block_ordinal, item.sentence_ordinal)):
        if version.sentence_source_policy and sentence.segmentation_source not in version.sentence_source_policy:
            continue
        sentence_rows_by_block.setdefault(sentence.block_ordinal, []).append(sentence)

    def block_sentences(block: PaperBlockRecord) -> list[PaperSentenceRecord]:
        return sentence_rows_by_block.get(block.block_ordinal, [])

    def sentence_retrieval_text(block: PaperBlockRecord) -> str:
        return " ".join(
            sentence.text.strip()
            for sentence in block_sentences(block)
            if sentence.text.strip()
        ).strip()

    def block_retrieval_text(block: PaperBlockRecord) -> str:
        sentence_text = sentence_retrieval_text(block)
        if sentence_text:
            return sentence_text
        return block.text.strip()

    eligible_blocks = []
    for block in sorted(blocks, key=lambda item: (item.section_ordinal, item.block_ordinal)):
        if block.section_role not in version.included_section_roles:
            continue
        if block.block_kind not in version.included_block_kinds:
            continue
        if version.retrieval_default_only and not block.is_retrieval_default:
            continue
        if not block_retrieval_text(block):
            continue
        eligible_blocks.append(block)

    result = ChunkAssemblyResult()
    current_group: list[PaperBlockRecord] = []

    def append_chunk(
        *,
        block_slices_for_chunk: list[_ChunkBlockSlice],
        chunk_text: str,
    ) -> None:
        chunk_ordinal = len(result.chunks)
        token_count_estimate = count_tokens(chunk_text)
        first_block = block_slices_for_chunk[0].block
        result.chunks.append(
            PaperChunkRecord(
                chunk_version_key=version.chunk_version_key,
                corpus_id=first_block.corpus_id,
                chunk_ordinal=chunk_ordinal,
                canonical_section_ordinal=first_block.section_ordinal,
                section_role=first_block.section_role,
                primary_block_kind=first_block.block_kind,
                text=chunk_text,
                token_count_estimate=max(token_count_estimate, 1),
                is_retrieval_default=all(
                    block_slice.block.is_retrieval_default
                    for block_slice in block_slices_for_chunk
                ),
            )
        )
        member_ordinal = 0
        for block_slice in block_slices_for_chunk:
            block = block_slice.block
            member_sentences = block_slice.sentence_rows or []
            if member_sentences:
                for sentence in member_sentences:
                    result.members.append(
                        PaperChunkMemberRecord(
                            chunk_version_key=version.chunk_version_key,
                            corpus_id=block.corpus_id,
                            chunk_ordinal=chunk_ordinal,
                            member_ordinal=member_ordinal,
                            member_kind=ChunkMemberKind.SENTENCE,
                            canonical_block_ordinal=block.block_ordinal,
                            canonical_sentence_ordinal=sentence.sentence_ordinal,
                        )
                    )
                    member_ordinal += 1
            elif block_slice.text.strip():
                result.members.append(
                    PaperChunkMemberRecord(
                        chunk_version_key=version.chunk_version_key,
                        corpus_id=block.corpus_id,
                        chunk_ordinal=chunk_ordinal,
                        member_ordinal=member_ordinal,
                        member_kind=ChunkMemberKind.BLOCK,
                        canonical_block_ordinal=block.block_ordinal,
                    )
                )
                member_ordinal += 1

    def build_block_slices(block: PaperBlockRecord) -> list[_ChunkBlockSlice]:
        cached = block_slices_cache.get(block.block_ordinal)
        if cached is not None:
            return cached
        sentences_for_block = [
            sentence
            for sentence in block_sentences(block)
            if sentence.text.strip()
        ]
        if not sentences_for_block:
            block_text = block.text.strip()
            block_slices = [
                _ChunkBlockSlice(block=block, text=block_text)
            ] if block_text else []
            block_slices_cache[block.block_ordinal] = block_slices
            return block_slices

        full_sentence_text = " ".join(
            sentence.text.strip() for sentence in sentences_for_block
        ).strip()
        if count_tokens(full_sentence_text) <= version.target_token_budget:
            block_slices = [
                _ChunkBlockSlice(
                    block=block,
                    text=full_sentence_text,
                    sentence_rows=sentences_for_block,
                )
            ]
            block_slices_cache[block.block_ordinal] = block_slices
            return block_slices

        sentence_groups: list[list[PaperSentenceRecord]] = []
        current_sentences: list[PaperSentenceRecord] = []
        current_tokens = 0
        for sentence in sentences_for_block:
            sentence_tokens = max(count_tokens(sentence.text.strip()), 1)
            if not current_sentences:
                current_sentences = [sentence]
                current_tokens = sentence_tokens
                continue

            merged_tokens = current_tokens + sentence_tokens
            if (
                merged_tokens <= version.target_token_budget
                and merged_tokens <= version.hard_max_tokens
            ):
                current_sentences.append(sentence)
                current_tokens = merged_tokens
                continue

            sentence_groups.append(current_sentences)
            current_sentences = [sentence]
            current_tokens = sentence_tokens

        if current_sentences:
            sentence_groups.append(current_sentences)

        block_slices: list[_ChunkBlockSlice] = []
        for sentence_group in sentence_groups:
            chunk_text = " ".join(sentence.text.strip() for sentence in sentence_group).strip()
            if not chunk_text:
                continue
            block_slices.append(
                _ChunkBlockSlice(
                    block=block,
                    text=chunk_text,
                    sentence_rows=sentence_group,
                    is_partial_block=len(sentence_groups) > 1,
                )
            )
        block_slices_cache[block.block_ordinal] = block_slices
        return block_slices

    def flush_group() -> None:
        if not current_group:
            return
        block_slices = []
        for block in current_group:
            block_slices.extend(build_block_slices(block))
        if len(current_group) == 1 and any(
            block_slice.is_partial_block for block_slice in block_slices
        ):
            for block_slice in block_slices:
                append_chunk(
                    block_slices_for_chunk=[block_slice],
                    chunk_text=block_slice.text,
                )
            current_group.clear()
            return
        chunk_text = "\n\n".join(
            block_slice.text
            for block_slice in block_slices
            if block_slice.text
        )
        if not chunk_text:
            current_group.clear()
            return
        append_chunk(block_slices_for_chunk=block_slices, chunk_text=chunk_text)
        current_group.clear()

    for block in eligible_blocks:
        block_tokens = count_tokens(block_retrieval_text(block))
        is_standalone_caption = (
            version.caption_merge_policy == CaptionMergePolicy.STANDALONE
            and block.block_kind != PaperBlockKind.NARRATIVE_PARAGRAPH
        )
        if not current_group:
            current_group.append(block)
            if is_standalone_caption:
                flush_group()
            continue

        previous = current_group[-1]
        same_section = previous.section_ordinal == block.section_ordinal
        adjacent_blocks = previous.block_ordinal + 1 == block.block_ordinal
        both_narrative = (
            previous.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
        )
        no_partial_blocks = True
        if len(current_group) == 1:
            first_group_slices = build_block_slices(current_group[0])
            no_partial_blocks = all(not block_slice.is_partial_block for block_slice in first_group_slices)
        current_block_slices = build_block_slices(block)
        if any(block_slice.is_partial_block for block_slice in current_block_slices):
            no_partial_blocks = False
        current_text = "\n\n".join(
            text
            for item in current_group
            if (text := block_retrieval_text(item))
        )
        merged_token_count = count_tokens(current_text) + block_tokens
        can_merge = (
            same_section
            and adjacent_blocks
            and both_narrative
            and no_partial_blocks
            and merged_token_count <= version.target_token_budget
            and merged_token_count <= version.hard_max_tokens
        )

        if can_merge:
            current_group.append(block)
            continue

        flush_group()
        current_group.append(block)
        if is_standalone_caption:
            flush_group()

    flush_group()
    return result
