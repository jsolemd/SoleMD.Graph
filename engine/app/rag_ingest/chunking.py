"""Structural chunk assembly over canonical block and sentence records."""

from __future__ import annotations

import re
from collections.abc import Callable, Sequence
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
    is_weak_short_narrative_chunk_text,
)
from app.rag_ingest.narrative_structure import (
    NarrativeBlockClass,
    classify_narrative_block,
    structured_unit_texts,
)
from app.rag_ingest.section_context import (
    SectionContext,
    SectionLike,
    build_section_contexts,
    normalize_heading_label,
)
from app.rag_ingest.tokenization import (
    ChunkTokenBudgeter,
    build_chunk_token_budgeter,
    split_text_semantically,
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


@dataclass(frozen=True, slots=True)
class _NarrativeChunkContext:
    heading_path: tuple[str, ...] = ()
    prefix_text: str = ""
    prefix_token_count: int = 0


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


def _raw_chunk_text(block_slices: list[_ChunkBlockSlice]) -> str:
    return "\n\n".join(block_slice.text for block_slice in block_slices if block_slice.text).strip()


def _group_run_slices_with_budget(
    *,
    block_slices: list[_ChunkBlockSlice],
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[list[_ChunkBlockSlice]]:
    if not block_slices:
        return []

    groups: list[list[_ChunkBlockSlice]] = []
    current_group: list[_ChunkBlockSlice] = []
    current_tokens = 0
    for block_slice in block_slices:
        slice_tokens = max(block_slice.token_count, 1)
        if not current_group:
            current_group = [block_slice]
            current_tokens = slice_tokens
            continue
        merged_tokens = current_tokens + slice_tokens
        if merged_tokens <= hard_max_tokens and (
            merged_tokens <= target_token_budget or current_tokens < MIN_USEFUL_NARRATIVE_TOKENS
        ):
            current_group.append(block_slice)
            current_tokens = merged_tokens
            continue
        groups.append(current_group)
        current_group = [block_slice]
        current_tokens = slice_tokens
    if current_group:
        groups.append(current_group)

    if len(groups) > 1:
        if (
            sum(max(block_slice.token_count, 1) for block_slice in groups[0])
            < MIN_USEFUL_NARRATIVE_TOKENS
        ):
            merged_tokens = sum(
                max(block_slice.token_count, 1) for block_slice in groups[0] + groups[1]
            )
            if merged_tokens <= hard_max_tokens:
                groups = [groups[0] + groups[1], *groups[2:]]
        if len(groups) > 1 and sum(
            max(block_slice.token_count, 1) for block_slice in groups[-1]
        ) < MIN_USEFUL_NARRATIVE_TOKENS:
            merged_tokens = sum(
                max(block_slice.token_count, 1) for block_slice in groups[-2] + groups[-1]
            )
            if merged_tokens <= hard_max_tokens:
                groups = [*groups[:-2], groups[-2] + groups[-1]]
    return groups


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


def _coalesce_weak_narrative_atoms(
    *,
    block: PaperBlockRecord,
    atoms: list[_ChunkBlockSlice],
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    if len(atoms) < 2:
        return atoms

    coalesced: list[_ChunkBlockSlice] = []
    index = 0
    while index < len(atoms):
        atom = atoms[index]
        atom_is_weak = (
            max(atom.token_count, 1) < MIN_USEFUL_NARRATIVE_TOKENS
            and is_weak_short_narrative_chunk_text(atom.text)
        )
        if atom_is_weak and index + 1 < len(atoms):
            next_atom = atoms[index + 1]
            merged_tokens = max(atom.token_count, 1) + max(next_atom.token_count, 1)
            if merged_tokens <= hard_max_tokens:
                coalesced.append(
                    _merge_block_slices(block=block, block_slices=[atom, next_atom])
                )
                index += 2
                continue
        if coalesced:
            previous_atom = coalesced[-1]
            previous_is_weak = (
                max(previous_atom.token_count, 1) < MIN_USEFUL_NARRATIVE_TOKENS
                and is_weak_short_narrative_chunk_text(previous_atom.text)
            )
            merged_tokens = max(previous_atom.token_count, 1) + max(atom.token_count, 1)
            if (atom_is_weak or previous_is_weak) and merged_tokens <= hard_max_tokens:
                coalesced[-1] = _merge_block_slices(
                    block=block,
                    block_slices=[previous_atom, atom],
                )
                index += 1
                continue
        coalesced.append(atom)
        index += 1
    return coalesced


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
        for fragment in _split_text_for_budget(
            text=sentence_text,
            token_budgeter=token_budgeter,
            target_token_budget=target_token_budget,
            hard_max_tokens=hard_max_tokens,
            semantic_split=True,
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
    return _coalesce_weak_narrative_atoms(
        block=block,
        atoms=atoms,
        hard_max_tokens=hard_max_tokens,
    )


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
        for fragment in _split_text_for_budget(
            text=unit.text,
            token_budgeter=token_budgeter,
            target_token_budget=target_token_budget,
            hard_max_tokens=hard_max_tokens,
            semantic_split=block.block_kind != PaperBlockKind.TABLE_BODY_TEXT,
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


def _build_structured_narrative_atoms(
    *,
    block: PaperBlockRecord,
    block_class: NarrativeBlockClass,
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> list[_ChunkBlockSlice]:
    block_text = block.text.strip()
    if not block_text:
        return []

    unit_texts = (
        [unit.text for unit in _table_text_units(block_text)]
        if block_class == NarrativeBlockClass.TABLE_LIKE
        else structured_unit_texts(block_text)
    )
    if not unit_texts:
        unit_texts = [block_text]
    atoms: list[_ChunkBlockSlice] = []
    for unit_text in unit_texts:
        unit_tokens = max(token_budgeter.count_tokens(unit_text), 1)
        if unit_tokens <= hard_max_tokens:
            atoms.append(
                _ChunkBlockSlice(
                    block=block,
                    text=unit_text,
                    token_count=unit_tokens,
                    is_partial_block=len(unit_texts) > 1,
                )
            )
            continue
        for fragment in _split_text_for_budget(
            text=unit_text,
            token_budgeter=token_budgeter,
            target_token_budget=target_token_budget,
            hard_max_tokens=hard_max_tokens,
            semantic_split=block_class != NarrativeBlockClass.TABLE_LIKE,
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
    *,
    classify_block: Callable[[PaperBlockRecord], NarrativeBlockClass] | None = None,
) -> PaperBlockKind:
    if any(
        block_slice.block.block_kind == PaperBlockKind.TABLE_BODY_TEXT
        for block_slice in block_slices_for_chunk
    ):
        return PaperBlockKind.TABLE_BODY_TEXT
    if classify_block is not None and any(
        block_slice.block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
        and classify_block(block_slice.block) == NarrativeBlockClass.TABLE_LIKE
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
    semantic_split: bool = False,
) -> list[str]:
    token_count = max(token_budgeter.count_tokens(text), 1)
    if token_count <= hard_max_tokens:
        return [text]
    split_budget = max(min(target_token_budget, hard_max_tokens), 1)
    fragments = (
        split_text_semantically(
            text,
            max_tokens=split_budget,
            token_counter=token_budgeter.count_tokens,
            fallback_splitter=lambda value, limit: token_budgeter.split_text(
                value,
                max_tokens=limit,
            ),
        )
        if semantic_split
        else token_budgeter.split_text(text, max_tokens=split_budget)
    )
    if fragments:
        return fragments
    return [text]


def _resolve_narrative_chunk_context(
    *,
    section_ordinal: int,
    section_contexts: dict[int, SectionContext],
    token_budgeter: ChunkTokenBudgeter,
    target_token_budget: int,
    hard_max_tokens: int,
) -> _NarrativeChunkContext:
    section_context = section_contexts.get(section_ordinal)
    if section_context is None or not section_context.heading_path:
        return _NarrativeChunkContext()

    full_path = tuple(label.strip() for label in section_context.heading_path if label.strip())
    if not full_path:
        return _NarrativeChunkContext()

    prefix_budget_limit = max(min(target_token_budget, hard_max_tokens) - 1, 0)
    if prefix_budget_limit <= 0:
        return _NarrativeChunkContext()

    candidate_paths = [full_path]
    if len(full_path) > 1:
        candidate_paths.append((full_path[-1],))
    candidate_paths.append(())

    for heading_path in candidate_paths:
        prefix_text = "\n".join(heading_path).strip()
        if not prefix_text:
            return _NarrativeChunkContext()
        prefix_tokens = max(token_budgeter.count_tokens(prefix_text), 1)
        if prefix_tokens <= prefix_budget_limit:
            return _NarrativeChunkContext(
                heading_path=heading_path,
                prefix_text=prefix_text,
                prefix_token_count=prefix_tokens,
            )
    return _NarrativeChunkContext()


def _contextualize_narrative_text(
    *,
    text: str,
    narrative_context: _NarrativeChunkContext,
) -> str:
    if not narrative_context.prefix_text:
        return text
    return _join_nonempty([narrative_context.prefix_text, text], separator="\n")


def _serialize_chunk_text(
    *,
    block_slices_for_chunk: list[_ChunkBlockSlice],
    token_budgeter: ChunkTokenBudgeter,
    section_contexts: dict[int, SectionContext],
    target_token_budget: int,
    hard_max_tokens: int,
    ) -> str:
    raw_text = _raw_chunk_text(block_slices_for_chunk)
    if not raw_text:
        return ""
    if _resolve_primary_block_kind(block_slices_for_chunk) != PaperBlockKind.NARRATIVE_PARAGRAPH:
        return raw_text
    narrative_context = _resolve_narrative_chunk_context(
        section_ordinal=block_slices_for_chunk[0].block.section_ordinal,
        section_contexts=section_contexts,
        token_budgeter=token_budgeter,
        target_token_budget=target_token_budget,
        hard_max_tokens=hard_max_tokens,
    )
    return _contextualize_narrative_text(
        text=raw_text,
        narrative_context=narrative_context,
    )


def _narrative_context_signature(
    *,
    block: PaperBlockRecord,
    section_contexts: dict[int, SectionContext],
) -> tuple[object, ...]:
    section_context = section_contexts.get(block.section_ordinal)
    if section_context is not None and section_context.heading_path:
        return (block.section_role, *section_context.heading_path)
    return (block.section_role, f"section:{block.section_ordinal}")


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


def _collect_narrative_run(
    *,
    blocks: list[PaperBlockRecord],
    start_index: int,
    section_contexts: dict[int, SectionContext],
    classify_block: Callable[[PaperBlockRecord], NarrativeBlockClass],
) -> tuple[list[PaperBlockRecord], int]:
    run = [blocks[start_index]]
    next_index = start_index + 1
    while next_index < len(blocks):
        current = blocks[next_index - 1]
        candidate = blocks[next_index]
        if candidate.block_kind != PaperBlockKind.NARRATIVE_PARAGRAPH:
            break
        if current.block_ordinal + 1 != candidate.block_ordinal:
            break
        current_class = classify_block(current)
        candidate_class = classify_block(candidate)
        if (
            current_class != NarrativeBlockClass.PROSE
            and candidate_class != NarrativeBlockClass.PROSE
            and current.section_role == candidate.section_role
        ):
            run.append(candidate)
            next_index += 1
            continue
        if _narrative_context_signature(
            block=current,
            section_contexts=section_contexts,
        ) != _narrative_context_signature(
            block=candidate,
            section_contexts=section_contexts,
        ):
            break
        run.append(candidate)
        next_index += 1
    return run, next_index


def _should_route_structured_narrative_run(
    *,
    blocks: list[PaperBlockRecord],
    token_budgeter: ChunkTokenBudgeter,
    classify_block: Callable[[PaperBlockRecord], NarrativeBlockClass],
) -> bool:
    block_classes = [classify_block(block) for block in blocks]
    if any(block_class != NarrativeBlockClass.PROSE for block_class in block_classes):
        return True
    if len(blocks) < 2:
        return False
    structured_count = 0
    placeholder_count = 0
    tiny_count = 0
    for block in blocks:
        if classify_block(block) in {
            NarrativeBlockClass.STRUCTURED,
            NarrativeBlockClass.TABLE_LIKE,
            NarrativeBlockClass.METADATA,
            NarrativeBlockClass.PLACEHOLDER,
        }:
            structured_count += 1
        if classify_block(block) in {
            NarrativeBlockClass.METADATA,
            NarrativeBlockClass.PLACEHOLDER,
        }:
            placeholder_count += 1
        if token_budgeter.count_tokens(block.text.strip()) < MIN_USEFUL_NARRATIVE_TOKENS:
            tiny_count += 1
    return placeholder_count > 0 or tiny_count >= 2 or structured_count >= 2


def assemble_structural_chunks(
    *,
    version: PaperChunkVersionRecord,
    blocks: list[PaperBlockRecord],
    sentences: list[PaperSentenceRecord],
    sections: Sequence[SectionLike] | None = None,
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
    section_rows = list(sections or [])
    section_contexts = build_section_contexts(section_rows)
    section_rows_by_ordinal = {section.section_ordinal: section for section in section_rows}
    block_class_cache: dict[int, NarrativeBlockClass] = {}

    def section_label(section_ordinal: int) -> str:
        section_row = section_rows_by_ordinal.get(section_ordinal)
        return (section_row.display_label or "").strip() if section_row is not None else ""

    def narrative_block_class(block: PaperBlockRecord) -> NarrativeBlockClass:
        cached = block_class_cache.get(block.block_ordinal)
        if cached is not None:
            return cached
        if not block.text.strip() and block_sentences(block):
            block_class_cache[block.block_ordinal] = NarrativeBlockClass.PROSE
            return NarrativeBlockClass.PROSE
        block_class = classify_narrative_block(
            block=block,
            section_context=section_contexts.get(block.section_ordinal),
            token_budgeter=active_token_budgeter,
        )
        block_class_cache[block.block_ordinal] = block_class
        return block_class

    def can_bridge_weak_narrative_context(
        previous_block: PaperBlockRecord,
        next_block: PaperBlockRecord,
        *,
        group_slices: list[_ChunkBlockSlice],
        next_slices: list[_ChunkBlockSlice],
    ) -> bool:
        if not group_slices or not next_slices:
            return False
        trailing_slice = group_slices[-1]
        leading_slice = next_slices[0]
        weak_trailing = (
            not trailing_slice.is_partial_block
            and max(trailing_slice.token_count, 1) < MIN_USEFUL_NARRATIVE_TOKENS
            and is_weak_short_narrative_chunk_text(trailing_slice.text)
        )
        weak_leading = (
            not leading_slice.is_partial_block
            and max(leading_slice.token_count, 1) < MIN_USEFUL_NARRATIVE_TOKENS
            and is_weak_short_narrative_chunk_text(leading_slice.text)
        )
        if not (weak_trailing or weak_leading):
            return False

        previous_label = normalize_heading_label(section_label(previous_block.section_ordinal))
        next_label = normalize_heading_label(section_label(next_block.section_ordinal))
        next_block_text = next_block.text.lower()
        if weak_leading and previous_label and next_label and next_label in previous_label:
            return True
        if (
            weak_trailing
            and previous_label.endswith("cohort")
            and "cohort" in next_block_text
        ):
            return True
        if (
            weak_trailing
            and previous_label
            and next_label
            and len(previous_label.split()) <= 2
            and previous_label not in next_label
        ):
            return True
        return False

    def append_chunk(
        *,
        block_slices_for_chunk: list[_ChunkBlockSlice],
    ) -> None:
        first_block = block_slices_for_chunk[0].block
        primary_block_kind = _resolve_primary_block_kind(
            block_slices_for_chunk,
            classify_block=narrative_block_class,
        )
        block_classes = [
            narrative_block_class(block_slice.block)
            if block_slice.block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            else NarrativeBlockClass.PROSE
            for block_slice in block_slices_for_chunk
        ]
        raw_chunk_text = _raw_chunk_text(block_slices_for_chunk)
        if (
            first_block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and len(block_slices_for_chunk) == 1
            and is_low_value_narrative_text(raw_chunk_text)
        ):
            return
        if (
            primary_block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and len(block_slices_for_chunk) == 1
            and max(block_slices_for_chunk[0].token_count, 1) < MIN_USEFUL_NARRATIVE_TOKENS
            and is_weak_short_narrative_chunk_text(raw_chunk_text)
            and block_classes[0] in {NarrativeBlockClass.METADATA, NarrativeBlockClass.PLACEHOLDER}
        ):
            return
        chunk_text = (
            raw_chunk_text
            if primary_block_kind != PaperBlockKind.NARRATIVE_PARAGRAPH
            else _serialize_chunk_text(
                block_slices_for_chunk=block_slices_for_chunk,
                token_budgeter=active_token_budgeter,
                section_contexts=section_contexts,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
        )
        if not chunk_text:
            return
        chunk_ordinal = len(result.chunks)
        token_count_estimate = max(active_token_budgeter.count_tokens(chunk_text), 1)
        result.chunks.append(
            PaperChunkRecord(
                chunk_version_key=version.chunk_version_key,
                corpus_id=first_block.corpus_id,
                chunk_ordinal=chunk_ordinal,
                canonical_section_ordinal=first_block.section_ordinal,
                section_role=first_block.section_role,
                primary_block_kind=primary_block_kind,
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
        block_class = (
            narrative_block_class(block)
            if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            else NarrativeBlockClass.PROSE
        )
        narrative_context = (
            _resolve_narrative_chunk_context(
                section_ordinal=block.section_ordinal,
                section_contexts=section_contexts,
                token_budgeter=active_token_budgeter,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
            if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            else _NarrativeChunkContext()
        )
        target_token_budget = max(
            version.target_token_budget - narrative_context.prefix_token_count,
            1,
        )
        hard_max_tokens = max(
            version.hard_max_tokens - narrative_context.prefix_token_count,
            1,
        )
        if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH and block_class in {
            NarrativeBlockClass.METADATA,
            NarrativeBlockClass.PLACEHOLDER,
        }:
            block_slices_cache[block.block_ordinal] = []
            return []
        if block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH and block_class in {
            NarrativeBlockClass.STRUCTURED,
            NarrativeBlockClass.TABLE_LIKE,
        }:
            atoms = _build_structured_narrative_atoms(
                block=block,
                block_class=block_class,
                token_budgeter=active_token_budgeter,
                target_token_budget=target_token_budget,
                hard_max_tokens=hard_max_tokens,
            )
        else:
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
                    target_token_budget=target_token_budget,
                    hard_max_tokens=hard_max_tokens,
                )
                if sentences_for_block
                else _build_block_atoms_without_sentences(
                    block=block,
                    token_budgeter=active_token_budgeter,
                    target_token_budget=target_token_budget,
                    hard_max_tokens=hard_max_tokens,
                )
            )
        block_slices = _group_block_slices_with_budget(
            block=block,
            atoms=atoms,
            target_token_budget=target_token_budget,
            hard_max_tokens=hard_max_tokens,
        )
        if (
            block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and block_class == NarrativeBlockClass.PROSE
        ):
            block_slices = _rebalance_small_narrative_slices(
                block=block,
                block_slices=block_slices,
                hard_max_tokens=hard_max_tokens,
            )
        block_slices_cache[block.block_ordinal] = block_slices
        return block_slices

    def emit_block_slices_as_chunks(block_slices: list[_ChunkBlockSlice]) -> None:
        if not block_slices:
            return
        append_chunk(block_slices_for_chunk=block_slices)

    def emit_standalone_block(block: PaperBlockRecord) -> None:
        block_slices = build_block_slices(block)
        if len(block_slices) > 1:
            for block_slice in block_slices:
                emit_block_slices_as_chunks([block_slice])
            return
        emit_block_slices_as_chunks(block_slices)

    def build_structured_narrative_groups(
        group_blocks: list[PaperBlockRecord],
    ) -> list[list[_ChunkBlockSlice]]:
        block_slices: list[_ChunkBlockSlice] = []
        for group_block in group_blocks:
            # Mixed narrative runs can contain prose beside admin/list/table-like residue.
            # Preserve the canonical slice strategy for each block so prose keeps
            # sentence lineage and prefix-adjusted budgets even when the run itself
            # is routed through the structured grouping lane.
            block_slices.extend(build_block_slices(group_block))
        return _group_run_slices_with_budget(
            block_slices=block_slices,
            target_token_budget=version.target_token_budget,
            hard_max_tokens=version.hard_max_tokens,
        )

    def can_merge_narrative_group(
        group_blocks: list[PaperBlockRecord],
        next_block: PaperBlockRecord,
    ) -> bool:
        if not group_blocks:
            return False
        previous = group_blocks[-1]
        adjacent_blocks = previous.block_ordinal + 1 == next_block.block_ordinal
        both_narrative = (
            previous.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
            and next_block.block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH
        )
        same_context = _narrative_context_signature(
            block=previous,
            section_contexts=section_contexts,
        ) == _narrative_context_signature(
            block=next_block,
            section_contexts=section_contexts,
        )
        if not (adjacent_blocks and both_narrative):
            return False

        group_slices = [
            block_slice
            for group_block in group_blocks
            for block_slice in build_block_slices(group_block)
        ]
        next_slices = build_block_slices(next_block)
        if not same_context and not can_bridge_weak_narrative_context(
            previous,
            next_block,
            group_slices=group_slices,
            next_slices=next_slices,
        ):
            return False
        no_partial_blocks = all(
            not block_slice.is_partial_block for block_slice in group_slices
        ) and all(not block_slice.is_partial_block for block_slice in next_slices)
        if not no_partial_blocks:
            return False

        current_group_tokens = active_token_budgeter.count_tokens(
            _serialize_chunk_text(
                block_slices_for_chunk=group_slices,
                token_budgeter=active_token_budgeter,
                section_contexts=section_contexts,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
        )
        next_block_tokens = active_token_budgeter.count_tokens(
            _serialize_chunk_text(
                block_slices_for_chunk=next_slices,
                token_budgeter=active_token_budgeter,
                section_contexts=section_contexts,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
        )
        merged_token_count = active_token_budgeter.count_tokens(
            _serialize_chunk_text(
                block_slices_for_chunk=[*group_slices, *next_slices],
                token_budgeter=active_token_budgeter,
                section_contexts=section_contexts,
                target_token_budget=version.target_token_budget,
                hard_max_tokens=version.hard_max_tokens,
            )
        )
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
            narrative_run, next_index = _collect_narrative_run(
                blocks=eligible_blocks,
                start_index=index,
                section_contexts=section_contexts,
                classify_block=narrative_block_class,
            )
            if _should_route_structured_narrative_run(
                blocks=narrative_run,
                token_budgeter=active_token_budgeter,
                classify_block=narrative_block_class,
            ):
                for structured_group in build_structured_narrative_groups(narrative_run):
                    emit_block_slices_as_chunks(structured_group)
                index = next_index
                continue

            narrative_group = [block]
            subgroup_index = index + 1
            while subgroup_index < next_index and can_merge_narrative_group(
                narrative_group, eligible_blocks[subgroup_index]
            ):
                narrative_group.append(eligible_blocks[subgroup_index])
                subgroup_index += 1

            if len(narrative_group) == 1 and subgroup_index < next_index:
                current_slices = build_block_slices(block)
                next_block = eligible_blocks[subgroup_index]
                next_slices = build_block_slices(next_block)
                if (
                    len(current_slices) == 1
                    and current_slices[0].token_count < MIN_USEFUL_NARRATIVE_TOKENS
                    and next_slices
                ):
                    merged_prefix_text = _serialize_chunk_text(
                        block_slices_for_chunk=[current_slices[0], next_slices[0]],
                        token_budgeter=active_token_budgeter,
                        section_contexts=section_contexts,
                        target_token_budget=version.target_token_budget,
                        hard_max_tokens=version.hard_max_tokens,
                    )
                    if (
                        active_token_budgeter.count_tokens(merged_prefix_text)
                        <= version.hard_max_tokens
                    ):
                        emit_block_slices_as_chunks([current_slices[0], next_slices[0]])
                        for block_slice in next_slices[1:]:
                            emit_block_slices_as_chunks([block_slice])
                        index = subgroup_index + 1
                        continue

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
            index = subgroup_index
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
