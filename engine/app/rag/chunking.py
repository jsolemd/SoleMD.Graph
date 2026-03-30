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
    eligible_blocks = [
        block
        for block in sorted(blocks, key=lambda item: (item.section_ordinal, item.block_ordinal))
        if block.section_role in version.included_section_roles
        and block.block_kind in version.included_block_kinds
        and (not version.retrieval_default_only or block.is_retrieval_default)
    ]

    result = ChunkAssemblyResult()
    current_group: list[PaperBlockRecord] = []

    def flush_group() -> None:
        if not current_group:
            return
        chunk_ordinal = len(result.chunks)
        chunk_text = "\n\n".join(block.text.strip() for block in current_group if block.text.strip())
        token_count_estimate = count_tokens(chunk_text)
        first_block = current_group[0]
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
                is_retrieval_default=all(block.is_retrieval_default for block in current_group),
            )
        )
        member_ordinal = 0
        for block in current_group:
            block_sentences = sorted(
                [sentence for sentence in sentences if sentence.block_ordinal == block.block_ordinal],
                key=lambda item: item.sentence_ordinal,
            )
            if block_sentences:
                for sentence in block_sentences:
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
            else:
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
        current_group.clear()

    for block in eligible_blocks:
        block_tokens = count_tokens(block.text)
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
        current_text = "\n\n".join(item.text.strip() for item in current_group if item.text.strip())
        merged_token_count = count_tokens(current_text) + block_tokens
        can_merge = (
            same_section
            and adjacent_blocks
            and both_narrative
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
