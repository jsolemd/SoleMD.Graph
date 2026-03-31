"""Structural chunk assembly over canonical block and sentence records."""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field

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
from app.rag_ingest.chunk_quality import (
    MIN_USEFUL_NARRATIVE_TOKENS,
    is_low_value_narrative_text,
)
from app.rag_ingest.tokenization import (
    ChunkTokenBudgeter,
    build_chunk_token_budgeter,
)


@dataclass(slots=True)
class ChunkAssemblyResult:
    chunks: list[PaperChunkRecord] = field(default_factory=list)
    members: list[PaperChunkMemberRecord] = field(default_factory=list)


@dataclass(slots=True)
class _ChunkBlockSlice:
    block: PaperBlockRecord
    text: str
    token_count: int
    sentence_rows: list[PaperSentenceRecord] = field(default_factory=list)
    is_partial_block: bool = False


@dataclass(slots=True)
class _TableTextUnit:
    text: str
    cell_count: int = 0


_TOKEN_RE = re.compile(r"\S+")


def _default_token_counter(text: str) -> int:
    return len([part for part in text.split() if part])


def _split_text_by_count_function(
    text: str,
    *,
    max_tokens: int,
) -> list[str]:
    token_matches = list(_TOKEN_RE.finditer(text))
    if not token_matches:
        return []
    windows: list[str] = []
    for start_index in range(0, len(token_matches), max_tokens):
        end_index = min(start_index + max_tokens, len(token_matches))
        start = token_matches[start_index].start()
        end = token_matches[end_index - 1].end()
        window = text[start:end].strip()
        if window:
            windows.append(window)
    return windows


def _join_nonempty(parts: list[str], *, separator: str = "\n") -> str:
    return separator.join(part for part in parts if part).strip()


class _LegacyFunctionTokenBudgeter:
    """Compat adapter for callers still passing a plain token counter."""

    tokenizer_name = "legacy_function"
    tokenizer_version = None

    def __init__(self, counter: Callable[[str], int]) -> None:
        self._counter = counter

    def count_tokens(self, text: str) -> int:
        return self._counter(text)

    def split_text(self, text: str, *, max_tokens: int) -> list[str]:
        return _split_text_by_count_function(text, max_tokens=max_tokens)


def _merge_block_slices(
    *,
    block: PaperBlockRecord,
    block_slices: list[_ChunkBlockSlice],
) -> _ChunkBlockSlice:
    joiner = "\n" if block.block_kind == PaperBlockKind.TABLE_BODY_TEXT else " "
    text = joiner.join(
        slice_row.text.strip() for slice_row in block_slices if slice_row.text.strip()
    ).strip()
    sentence_rows: list[PaperSentenceRecord] = []
    seen_sentence_keys: set[tuple[int, int]] = set()
    for slice_row in block_slices:
        for sentence in slice_row.sentence_rows:
            key = (sentence.block_ordinal, sentence.sentence_ordinal)
            if key in seen_sentence_keys:
                continue
            seen_sentence_keys.add(key)
            sentence_rows.append(sentence)
    return _ChunkBlockSlice(
        block=block,
        text=text,
        token_count=sum(max(slice_row.token_count, 1) for slice_row in block_slices),
        sentence_rows=sentence_rows,
        is_partial_block=len(block_slices) > 1
        or any(slice_row.is_partial_block for slice_row in block_slices),
    )


def _group_block_slices_with_budget(
    *,
    block: PaperBlockRecord,
    atoms: list[_ChunkBlockSlice],
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    if not atoms:
        return []
    grouped_atoms: list[list[_ChunkBlockSlice]] = []
    current_atoms: list[_ChunkBlockSlice] = []
    current_tokens = 0
    for atom in atoms:
        atom_tokens = max(atom.token_count, 1)
        if not current_atoms:
            current_atoms = [atom]
            current_tokens = atom_tokens
            continue
        merged_tokens = current_tokens + atom_tokens
        if merged_tokens <= target_token_budget and merged_tokens <= hard_max_tokens:
            current_atoms.append(atom)
            current_tokens = merged_tokens
            continue
        grouped_atoms.append(current_atoms)
        current_atoms = [atom]
        current_tokens = atom_tokens
    if current_atoms:
        grouped_atoms.append(current_atoms)
    return [
        merged_slice
        for grouped_atom_rows in grouped_atoms
        if (merged_slice := _merge_block_slices(block=block, block_slices=grouped_atom_rows)).text
    ]


def _rebalance_small_narrative_slices(
    *,
    block: PaperBlockRecord,
    block_slices: list[_ChunkBlockSlice],
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    if len(block_slices) < 2:
        return block_slices

    rebalanced: list[_ChunkBlockSlice] = []
    pending = block_slices[0]
    for current in block_slices[1:]:
        pending_tokens = max(pending.token_count, 1)
        merged_tokens = pending_tokens + max(current.token_count, 1)
        should_force_merge = pending_tokens < MIN_USEFUL_NARRATIVE_TOKENS
        if should_force_merge and merged_tokens <= hard_max_tokens:
            pending = _merge_block_slices(block=block, block_slices=[pending, current])
            continue
        rebalanced.append(pending)
        pending = current

    if rebalanced:
        pending_tokens = max(pending.token_count, 1)
        merged_tokens = max(rebalanced[-1].token_count, 1) + pending_tokens
        if pending_tokens < MIN_USEFUL_NARRATIVE_TOKENS and merged_tokens <= hard_max_tokens:
            rebalanced[-1] = _merge_block_slices(
                block=block,
                block_slices=[rebalanced[-1], pending],
            )
        else:
            rebalanced.append(pending)
    else:
        rebalanced.append(pending)
    return rebalanced


def _is_numeric_like_table_cell(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return False
    digit_count = sum(character.isdigit() for character in stripped)
    alpha_count = sum(character.isalpha() for character in stripped)
    if digit_count == 0:
        return False
    if alpha_count == 0:
        return True
    return digit_count >= alpha_count and len(stripped.split()) <= 4


def _table_text_units(text: str) -> list[_TableTextUnit]:
    line_units = [line.strip() for line in text.splitlines() if line.strip()]
    if len(line_units) > 1:
        return [_TableTextUnit(text=line, cell_count=1) for line in line_units]

    raw_cells = [cell.strip() for cell in text.split("\t")]
    nonempty_cells = [cell for cell in raw_cells if cell]
    if len(nonempty_cells) <= 1:
        return [_TableTextUnit(text=text.strip(), cell_count=1)] if text.strip() else []

    units: list[_TableTextUnit] = []
    current_cells: list[str] = []
    for cell in raw_cells:
        normalized = cell.strip()
        if normalized:
            current_cells.append(normalized)
            continue
        if current_cells:
            units.append(
                _TableTextUnit(
                    text=_join_nonempty(current_cells),
                    cell_count=len(current_cells),
                )
            )
            current_cells = []
    if current_cells:
        units.append(
            _TableTextUnit(
                text=_join_nonempty(current_cells),
                cell_count=len(current_cells),
            )
        )

    if len(units) == 1 and units[0].cell_count == len(nonempty_cells):
        return [_TableTextUnit(text=cell, cell_count=1) for cell in nonempty_cells]

    if units:
        return units
    return [_TableTextUnit(text=cell, cell_count=1) for cell in nonempty_cells]


def _is_contextual_table_unit(unit: _TableTextUnit) -> bool:
    cells = [cell.strip() for cell in unit.text.splitlines() if cell.strip()]
    if not cells:
        return False
    numeric_like_count = sum(_is_numeric_like_table_cell(cell) for cell in cells)
    if numeric_like_count == 0:
        return True
    return numeric_like_count / len(cells) <= 0.2 and unit.cell_count <= 12


def _partition_table_units(
    units: list[_TableTextUnit],
) -> tuple[list[_TableTextUnit], list[_TableTextUnit]]:
    if len(units) <= 1:
        return [], units
    if all(unit.cell_count == 1 for unit in units):
        return [], units

    header_units: list[_TableTextUnit] = []
    for unit in units:
        if not _is_contextual_table_unit(unit):
            break
        header_units.append(unit)
        if len(header_units) >= 3:
            break

    if not header_units:
        return [], units

    body_units = units[len(header_units) :]
    if not body_units:
        return [], units
    return header_units, body_units


def _build_sentence_atoms(
    *,
    block: PaperBlockRecord,
    sentence_rows: list[PaperSentenceRecord],
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    atoms: list[_ChunkBlockSlice] = []
    for sentence in sentence_rows:
        sentence_text = sentence.text.strip()
        if not sentence_text:
            continue
        sentence_tokens = max(token_budgeter.count_tokens(sentence_text), 1)
        if sentence_tokens <= hard_max_tokens:
            atoms.append(
                _ChunkBlockSlice(
                    block=block,
                    text=sentence_text,
                    token_count=sentence_tokens,
                    sentence_rows=[sentence],
                )
            )
            continue
        for fragment in token_budgeter.split_text(
            sentence_text,
            max_tokens=target_token_budget,
        ):
            fragment_tokens = max(token_budgeter.count_tokens(fragment), 1)
            atoms.append(
                _ChunkBlockSlice(
                    block=block,
                    text=fragment,
                    token_count=fragment_tokens,
                    sentence_rows=[sentence],
                    is_partial_block=True,
                )
            )
    return atoms


def _build_block_atoms_without_sentences(
    *,
    block: PaperBlockRecord,
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    block_text = block.text.strip()
    if not block_text:
        return []

    units = (
        _table_text_units(block_text)
        if block.block_kind == PaperBlockKind.TABLE_BODY_TEXT
        else [_TableTextUnit(text=block_text, cell_count=1)]
    )
    atoms: list[_ChunkBlockSlice] = []
    for unit in units:
        unit_tokens = max(token_budgeter.count_tokens(unit.text), 1)
        if unit_tokens <= hard_max_tokens:
            atoms.append(
                _ChunkBlockSlice(
                    block=block,
                    text=unit.text,
                    token_count=unit_tokens,
                )
            )
            continue
        for fragment in token_budgeter.split_text(
            unit.text,
            max_tokens=target_token_budget,
        ):
            fragment_tokens = max(token_budgeter.count_tokens(fragment), 1)
            atoms.append(
                _ChunkBlockSlice(
                    block=block,
                    text=fragment,
                    token_count=fragment_tokens,
                    is_partial_block=True,
                )
            )
    return atoms


def _resolve_primary_block_kind(
    block_slices_for_chunk: list[_ChunkBlockSlice],
) -> PaperBlockKind:
    if any(
        block_slice.block.block_kind == PaperBlockKind.TABLE_BODY_TEXT
        for block_slice in block_slices_for_chunk
    ):
        return PaperBlockKind.TABLE_BODY_TEXT
    if any(
        block_slice.block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
        for block_slice in block_slices_for_chunk
    ):
        return PaperBlockKind.NARRATIVE_PARAGRAPH
    return block_slices_for_chunk[0].block.block_kind


def _slices_token_total(block_slices: list[_ChunkBlockSlice]) -> int:
    return sum(max(block_slice.token_count, 1) for block_slice in block_slices)


def _split_text_for_budget(
    *,
    text: str,
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[str]:
    token_count = max(token_budgeter.count_tokens(text), 1)
    if token_count <= hard_max_tokens:
        return [text]
    split_budget = max(min(target_token_budget, hard_max_tokens), 1)
    fragments = token_budgeter.split_text(text, max_tokens=split_budget)
    if fragments:
        return fragments
    return [text]


def _build_table_chunk_groups(
    *,
    table_block: PaperBlockRecord,
    caption_block: PaperBlockRecord | None,
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> tuple[list[list[_ChunkBlockSlice]], bool]:
    units = _table_text_units(table_block.text.strip())
    if not units:
        return [], False

    header_units, body_units = _partition_table_units(units)
    if not body_units:
        body_units = units
        header_units = []

    header_text = _join_nonempty([unit.text for unit in header_units])
    header_tokens = max(token_budgeter.count_tokens(header_text), 1) if header_text else 0

    table_groups: list[list[_ChunkBlockSlice]] = []
    if header_text and header_tokens >= hard_max_tokens:
        for fragment in _split_text_for_budget(
            text=header_text,
            token_budgeter=token_budgeter,
            target_token_budget=target_token_budget,
            hard_max_tokens=hard_max_tokens,
        ):
            fragment_tokens = max(token_budgeter.count_tokens(fragment), 1)
            table_groups.append(
                [
                    _ChunkBlockSlice(
                        block=table_block,
                        text=fragment,
                        token_count=fragment_tokens,
                        is_partial_block=True,
                    )
                ]
            )
        header_text = ""
        header_tokens = 0

    caption_text = caption_block.text.strip() if caption_block is not None else ""
    caption_tokens = max(token_budgeter.count_tokens(caption_text), 1) if caption_text else 0
    caption_consumed = False

    pending_unit_texts: list[str] = [unit.text for unit in body_units]
    chunk_index = 0
    while pending_unit_texts:
        include_caption = caption_block is not None and chunk_index == 0
        include_header = bool(header_text)

        def rebuild_prefix_state() -> tuple[_ChunkBlockSlice | None, int]:
            caption_slice: _ChunkBlockSlice | None = None
            prefix_tokens = 0
            if include_caption and caption_text:
                caption_slice = _ChunkBlockSlice(
                    block=caption_block,
                    text=caption_text,
                    token_count=caption_tokens,
                    is_partial_block=bool(header_text) or len(body_units) > 0,
                )
                prefix_tokens += caption_tokens
            if include_header and header_text:
                prefix_tokens += header_tokens
            return caption_slice, prefix_tokens

        caption_slice, prefix_tokens = rebuild_prefix_state()
        if include_caption and prefix_tokens >= hard_max_tokens:
            include_caption = False
            caption_slice, prefix_tokens = rebuild_prefix_state()
        if include_header and prefix_tokens >= hard_max_tokens:
            include_header = False
            caption_slice, prefix_tokens = rebuild_prefix_state()

        next_unit_text = pending_unit_texts[0]
        next_unit_tokens = max(token_budgeter.count_tokens(next_unit_text), 1)
        available_hard = max(hard_max_tokens - prefix_tokens, 1)
        if (
            include_header
            and next_unit_tokens <= hard_max_tokens
            and next_unit_tokens > available_hard
        ):
            include_header = False
            caption_slice, prefix_tokens = rebuild_prefix_state()
            available_hard = max(hard_max_tokens - prefix_tokens, 1)
        if (
            include_caption
            and next_unit_tokens <= hard_max_tokens
            and next_unit_tokens > available_hard
        ):
            include_caption = False
            caption_slice, prefix_tokens = rebuild_prefix_state()
            available_hard = max(hard_max_tokens - prefix_tokens, 1)

        available_target = max(target_token_budget - prefix_tokens, 1)
        available_hard = max(hard_max_tokens - prefix_tokens, 1)

        current_body_slices: list[_ChunkBlockSlice] = []
        current_body_tokens = 0
        while pending_unit_texts:
            unit_text = pending_unit_texts[0]
            unit_tokens = max(token_budgeter.count_tokens(unit_text), 1)
            if unit_tokens > available_hard:
                fragments = _split_text_for_budget(
                    text=unit_text,
                    token_budgeter=token_budgeter,
                    target_token_budget=available_target,
                    hard_max_tokens=available_hard,
                )
                pending_unit_texts = fragments + pending_unit_texts[1:]
                continue

            if current_body_slices:
                merged_tokens = current_body_tokens + unit_tokens
                if merged_tokens > available_hard or merged_tokens > available_target:
                    break

            current_body_slices.append(
                _ChunkBlockSlice(
                    block=table_block,
                    text=unit_text,
                    token_count=unit_tokens,
                    is_partial_block=len(body_units) > 1 or include_header,
                )
            )
            current_body_tokens += unit_tokens
            pending_unit_texts.pop(0)

        if not current_body_slices:
            if caption_slice is not None:
                table_groups.append([caption_slice])
                caption_consumed = caption_consumed or include_caption
            break

        table_parts = []
        table_tokens = current_body_tokens
        if include_header and header_text:
            table_parts.append(header_text)
            table_tokens += header_tokens
        table_parts.extend(
            block_slice.text for block_slice in current_body_slices if block_slice.text
        )

        combined_table_slice = _ChunkBlockSlice(
            block=table_block,
            text=_join_nonempty(table_parts),
            token_count=max(table_tokens, 1),
            is_partial_block=len(body_units) > 1 or include_header,
        )
        if caption_slice is not None:
            table_groups.append([caption_slice, combined_table_slice])
        else:
            table_groups.append([combined_table_slice])
        caption_consumed = caption_consumed or include_caption
        chunk_index += 1

    return table_groups, caption_consumed


def assemble_structural_chunks(
    *,
    version: PaperChunkVersionRecord,
    blocks: list[PaperBlockRecord],
    sentences: list[PaperSentenceRecord],
    token_counter: Callable[[str], int] | None = None,
    token_budgeter: ChunkTokenBudgeter | None = None,
) -> ChunkAssemblyResult:
    """Assemble derived retrieval chunks from canonical spans.

    This is intentionally conservative:
    - only included block/section kinds participate
    - narrative stays sentence-derived first
    - tables use structural units plus repeated header context when safe
    - caption and chunk lineage stay rooted in canonical blocks/sentences
    """

    active_token_budgeter = token_budgeter or (
        _LegacyFunctionTokenBudgeter(token_counter)
        if token_counter is not None
        else (
            _LegacyFunctionTokenBudgeter(_default_token_counter)
            if version.tokenizer_name == "simple"
            else build_chunk_token_budgeter(
                tokenizer_name=version.tokenizer_name,
                embedding_model=version.embedding_model,
            )
        )
    )
    sentence_rows_by_block: dict[int, list[PaperSentenceRecord]] = {}
    block_slices_cache: dict[int, list[_ChunkBlockSlice]] = {}
    for sentence in sorted(sentences, key=lambda item: (item.block_ordinal, item.sentence_ordinal)):
        if (
            version.sentence_source_policy
            and sentence.segmentation_source not in version.sentence_source_policy
        ):
            continue
        sentence_rows_by_block.setdefault(sentence.block_ordinal, []).append(sentence)

    def block_sentences(block: PaperBlockRecord) -> list[PaperSentenceRecord]:
        return sentence_rows_by_block.get(block.block_ordinal, [])

    def sentence_retrieval_text(block: PaperBlockRecord) -> str:
        return " ".join(
            sentence.text.strip() for sentence in block_sentences(block) if sentence.text.strip()
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

    def append_chunk(
        *,
        block_slices_for_chunk: list[_ChunkBlockSlice],
        chunk_text: str,
    ) -> None:
        first_block = block_slices_for_chunk[0].block
        if (
            first_block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and len(block_slices_for_chunk) == 1
            and is_low_value_narrative_text(chunk_text)
        ):
            return
        chunk_ordinal = len(result.chunks)
        token_count_estimate = sum(
            max(block_slice.token_count, 1) for block_slice in block_slices_for_chunk
        )
        result.chunks.append(
            PaperChunkRecord(
                chunk_version_key=version.chunk_version_key,
                corpus_id=first_block.corpus_id,
                chunk_ordinal=chunk_ordinal,
                canonical_section_ordinal=first_block.section_ordinal,
                section_role=first_block.section_role,
                primary_block_kind=_resolve_primary_block_kind(block_slices_for_chunk),
                text=chunk_text,
                token_count_estimate=max(token_count_estimate, 1),
                is_retrieval_default=all(
                    block_slice.block.is_retrieval_default for block_slice in block_slices_for_chunk
                ),
            )
        )
        member_ordinal = 0
        seen_sentence_members: set[tuple[int, int]] = set()
        seen_block_members: set[int] = set()
        for block_slice in block_slices_for_chunk:
            block = block_slice.block
            member_sentences = block_slice.sentence_rows or []
            if member_sentences:
                for sentence in member_sentences:
                    sentence_key = (block.block_ordinal, sentence.sentence_ordinal)
                    if sentence_key in seen_sentence_members:
                        continue
                    seen_sentence_members.add(sentence_key)
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
                if block.block_ordinal in seen_block_members:
                    continue
                seen_block_members.add(block.block_ordinal)
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
        sentences_for_block = (
            []
            if block.block_kind == PaperBlockKind.TABLE_BODY_TEXT
            else [sentence for sentence in block_sentences(block) if sentence.text.strip()]
        )
        atoms = (
            _build_sentence_atoms(
                block=block,
                sentence_rows=sentences_for_block,
                token_budgeter=active_token_budgeter,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
            if sentences_for_block
            else _build_block_atoms_without_sentences(
                block=block,
                token_budgeter=active_token_budgeter,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
        )
        block_slices = _group_block_slices_with_budget(
            block=block,
            atoms=atoms,
            target_token_budget=version.target_token_budget,
            hard_max_tokens=version.hard_max_tokens,
        )
        if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH:
            block_slices = _rebalance_small_narrative_slices(
                block=block,
                block_slices=block_slices,
                hard_max_tokens=version.hard_max_tokens,
            )
        block_slices_cache[block.block_ordinal] = block_slices
        return block_slices

    def emit_block_slices_as_chunks(block_slices: list[_ChunkBlockSlice]) -> None:
        if not block_slices:
            return
        chunk_text = "\n\n".join(
            block_slice.text for block_slice in block_slices if block_slice.text
        )
        if not chunk_text:
            return
        append_chunk(block_slices_for_chunk=block_slices, chunk_text=chunk_text)

    def emit_standalone_block(block: PaperBlockRecord) -> None:
        block_slices = build_block_slices(block)
        if len(block_slices) > 1:
            for block_slice in block_slices:
                emit_block_slices_as_chunks([block_slice])
            return
        emit_block_slices_as_chunks(block_slices)

    def can_merge_narrative_group(
        group_blocks: list[PaperBlockRecord],
        next_block: PaperBlockRecord,
    ) -> bool:
        if not group_blocks:
            return False
        previous = group_blocks[-1]
        same_section = previous.section_ordinal == next_block.section_ordinal
        adjacent_blocks = previous.block_ordinal + 1 == next_block.block_ordinal
        both_narrative = (
            previous.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and next_block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
        )
        if not (same_section and adjacent_blocks and both_narrative):
            return False

        group_slices = [
            block_slice
            for group_block in group_blocks
            for block_slice in build_block_slices(group_block)
        ]
        next_slices = build_block_slices(next_block)
        no_partial_blocks = all(
            not block_slice.is_partial_block for block_slice in group_slices
        ) and all(not block_slice.is_partial_block for block_slice in next_slices)
        if not no_partial_blocks:
            return False

        current_group_tokens = _slices_token_total(group_slices)
        next_block_tokens = _slices_token_total(next_slices)
        merged_token_count = current_group_tokens + next_block_tokens
        needs_minimum_merge = (
            current_group_tokens < MIN_USEFUL_NARRATIVE_TOKENS
            or next_block_tokens < MIN_USEFUL_NARRATIVE_TOKENS
        )
        return merged_token_count <= version.hard_max_tokens and (
            merged_token_count <= version.target_token_budget or needs_minimum_merge
        )

    index = 0
    while index < len(eligible_blocks):
        block = eligible_blocks[index]

        if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH:
            narrative_group = [block]
            next_index = index + 1
            while next_index < len(eligible_blocks) and can_merge_narrative_group(
                narrative_group, eligible_blocks[next_index]
            ):
                narrative_group.append(eligible_blocks[next_index])
                next_index += 1

            narrative_group_slices = [
                block_slice
                for group_block in narrative_group
                for block_slice in build_block_slices(group_block)
            ]
            if len(narrative_group) == 1 and len(narrative_group_slices) > 1:
                for block_slice in narrative_group_slices:
                    emit_block_slices_as_chunks([block_slice])
            else:
                emit_block_slices_as_chunks(narrative_group_slices)
            index = next_index
            continue

        if (
            version.caption_merge_policy == CaptionMergePolicy.STRUCTURAL_CONTEXT
            and block.block_kind == PaperBlockKind.TABLE_CAPTION
            and index + 1 < len(eligible_blocks)
        ):
            next_block = eligible_blocks[index + 1]
            if (
                next_block.block_kind == PaperBlockKind.TABLE_BODY_TEXT
                and block.section_ordinal == next_block.section_ordinal
                and block.linked_asset_ref
                and block.linked_asset_ref == next_block.linked_asset_ref
            ):
                table_groups, caption_consumed = _build_table_chunk_groups(
                    table_block=next_block,
                    caption_block=block,
                    token_budgeter=active_token_budgeter,
                    target_token_budget=version.target_token_budget,
                    hard_max_tokens=version.hard_max_tokens,
                )
                if not caption_consumed:
                    emit_standalone_block(block)
                for table_group in table_groups:
                    emit_block_slices_as_chunks(table_group)
                index += 2
                continue

        if block.block_kind == PaperBlockKind.TABLE_BODY_TEXT:
            table_groups, _ = _build_table_chunk_groups(
                table_block=block,
                caption_block=None,
                token_budgeter=active_token_budgeter,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
            for table_group in table_groups:
                emit_block_slices_as_chunks(table_group)
            index += 1
            continue

        emit_standalone_block(block)
        index += 1

    return result
