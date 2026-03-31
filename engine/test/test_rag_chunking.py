from __future__ import annotations

from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    PaperSentenceRecord,
    ParseSourceSystem,
    SectionRole,
    SentenceSegmentationSource,
    SourcePlane,
)
from app.rag.serving_contract import (
    CaptionMergePolicy,
    ChunkMemberKind,
    PaperChunkVersionRecord,
    SentenceOverlapPolicy,
)
from app.rag_ingest.chunking import assemble_structural_chunks


def _common_identity() -> dict[str, object]:
    return {
        "corpus_id": 12345,
        "source_system": ParseSourceSystem.S2ORC_V2,
        "source_revision": "2026-03-10",
        "source_document_key": "12345",
        "source_plane": SourcePlane.BODY,
        "parser_version": "parser-v1",
        "raw_attrs_json": {},
    }


def _chunk_version() -> PaperChunkVersionRecord:
    return PaperChunkVersionRecord(
        chunk_version_key="v1",
        source_revision_keys=["s2orc:2026-03-10"],
        parser_version="parser-v1",
        text_normalization_version="norm-v1",
        sentence_source_policy=[
            SentenceSegmentationSource.S2ORC_ANNOTATION,
            SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ],
        included_section_roles=[SectionRole.ABSTRACT, SectionRole.RESULTS],
        included_block_kinds=[
            PaperBlockKind.NARRATIVE_PARAGRAPH,
            PaperBlockKind.FIGURE_CAPTION,
        ],
        caption_merge_policy=CaptionMergePolicy.STANDALONE,
        tokenizer_name="simple",
        target_token_budget=12,
        hard_max_tokens=16,
        sentence_overlap_policy=SentenceOverlapPolicy.NONE,
    )


def test_assemble_structural_chunks_skips_low_value_single_fragment_narrative_block():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=3,
            text="Our",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        blocks=blocks,
        sentences=[],
    )

    assert result.chunks == []
    assert result.members == []


def test_assemble_structural_chunks_merges_adjacent_narrative_blocks_within_budget():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=22,
            text="Melatonin reduced delirium.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=23,
            source_end_offset=51,
            text="Sleep quality also improved.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=28,
            text="Melatonin reduced delirium.",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=23,
            source_end_offset=51,
            text="Sleep quality also improved.",
            sentence_ordinal=0,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(), blocks=blocks, sentences=sentences
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].canonical_section_ordinal == 1
    assert len(result.members) == 2


def test_assemble_structural_chunks_force_merges_small_adjacent_narrative_blocks_under_hard_max():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=17,
            text="Our findings",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=18,
            source_end_offset=63,
            text="reduced postoperative delirium in older adults.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    version = _chunk_version().model_copy(update={"target_token_budget": 4, "hard_max_tokens": 8})

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert (
        result.chunks[0].text == "Our findings\n\nreduced postoperative delirium in older adults."
    )
    assert result.chunks[0].token_count_estimate == 8
    assert len(result.members) == 2


def test_assemble_structural_chunks_keeps_captions_standalone():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=20,
            text="Figure 1. Trial flow.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.FIGURE_CAPTION,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=21,
            source_end_offset=45,
            text="Melatonin reduced delirium.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(version=_chunk_version(), blocks=blocks, sentences=[])

    assert len(result.chunks) == 2
    assert result.chunks[0].primary_block_kind == PaperBlockKind.FIGURE_CAPTION
    assert result.chunks[1].primary_block_kind == PaperBlockKind.NARRATIVE_PARAGRAPH


def test_assemble_structural_chunks_respects_section_boundaries():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=22,
            text="Abstract finding here.",
            block_ordinal=0,
            section_ordinal=0,
            section_role=SectionRole.ABSTRACT,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=23,
            source_end_offset=50,
            text="Results finding here.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(version=_chunk_version(), blocks=blocks, sentences=[])

    assert len(result.chunks) == 2
    assert [chunk.canonical_section_ordinal for chunk in result.chunks] == [0, 1]


def test_assemble_structural_chunks_filters_members_by_sentence_source_policy():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=30,
            text="Melatonin reduced delirium.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=15,
            text="Melatonin reduced",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=16,
            source_end_offset=30,
            text="delirium.",
            sentence_ordinal=1,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ),
    ]
    version = _chunk_version().model_copy(
        update={"sentence_source_policy": [SentenceSegmentationSource.S2ORC_ANNOTATION]}
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].text == "Melatonin reduced"
    assert len(result.members) == 1
    assert result.members[0].canonical_sentence_ordinal == 0


def test_assemble_structural_chunks_splits_oversized_narrative_block_on_sentence_boundaries():
    common = _common_identity()
    block_text = (
        "Melatonin reduced delirium incidence in older adults. "
        "Sleep quality improved across follow-up visits. "
        "No serious adverse events were attributed to treatment."
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(block_text),
            text=block_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=len(block_text) + 1,
            source_end_offset=len(block_text) + 1 + len("Follow-up remained complete."),
            text="Follow-up remained complete.",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    first = "Melatonin reduced delirium incidence in older adults."
    second = "Sleep quality improved across follow-up visits."
    third = "No serious adverse events were attributed to treatment."
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(first),
            text=first,
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(first) + 1,
            source_end_offset=len(first) + 1 + len(second),
            text=second,
            sentence_ordinal=1,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(first) + len(second) + 2,
            source_end_offset=len(first) + len(second) + 2 + len(third),
            text=third,
            sentence_ordinal=2,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]
    version = _chunk_version().model_copy(update={"target_token_budget": 10, "hard_max_tokens": 12})

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) == 4
    assert result.chunks[0].text == first
    assert result.chunks[1].text == second
    assert result.chunks[2].text == third
    assert result.chunks[3].text == "Follow-up remained complete."
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)
    assert [member.canonical_sentence_ordinal for member in result.members] == [0, 1, 2, None]


def test_assemble_structural_chunks_uses_sentence_text_when_block_text_is_blank():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=3,
            text=" \n ",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=28,
            text="Melatonin reduced delirium.",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].text == "Melatonin reduced delirium."
    assert len(result.members) == 1
    assert result.members[0].member_kind == ChunkMemberKind.SENTENCE


def test_assemble_structural_chunks_skips_blocks_without_any_retrievable_text():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=3,
            text=" \n ",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        blocks=blocks,
        sentences=[],
    )

    assert result.chunks == []
    assert result.members == []


def test_assemble_structural_chunks_splits_oversized_single_block_by_sentences():
    common = _common_identity()
    block_text = "Sentence one. Sentence two. Sentence three. Sentence four."
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(block_text),
            text=block_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=13,
            text="Sentence one.",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=14,
            source_end_offset=27,
            text="Sentence two.",
            sentence_ordinal=1,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=28,
            source_end_offset=43,
            text="Sentence three.",
            sentence_ordinal=2,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=44,
            source_end_offset=len(block_text),
            text="Sentence four.",
            sentence_ordinal=3,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]
    version = _chunk_version().model_copy(update={"target_token_budget": 4, "hard_max_tokens": 6})

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) == 2
    assert [chunk.text for chunk in result.chunks] == [
        "Sentence one. Sentence two.",
        "Sentence three. Sentence four.",
    ]
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)
    assert [member.canonical_sentence_ordinal for member in result.members] == [0, 1, 2, 3]


def test_assemble_structural_chunks_splits_oversized_table_body_block_on_structural_units():
    common = _common_identity()
    table_text = (
        "Characteristic\tIntervention\tControl\t"
        "Mean age years\t52.5\t51.6\t"
        "Body mass index\t26.2\t25.4"
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(table_text),
            text=table_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_BODY_TEXT,
        ),
    ]
    version = _chunk_version().model_copy(
        update={
            "included_block_kinds": [PaperBlockKind.TABLE_BODY_TEXT],
            "target_token_budget": 5,
            "hard_max_tokens": 6,
        }
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 3
    assert [chunk.text for chunk in result.chunks] == [
        "Characteristic\nIntervention\nControl",
        "Mean age years\n52.5\n51.6",
        "Body mass index\n26.2\n25.4",
    ]
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)
    assert all(member.member_kind == ChunkMemberKind.BLOCK for member in result.members)
    assert all(member.canonical_block_ordinal == 0 for member in result.members)


def test_assemble_structural_chunks_ignores_table_sentence_rows_and_chunks_from_block_units():
    common = _common_identity()
    table_text = "Outcome\tIntervention\tControl\tAnxiety\t4.2\t5.1\tDepression\t3.1\t4.4"
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(table_text),
            text=table_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_BODY_TEXT,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(table_text),
            text=table_text,
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.DETERMINISTIC_FALLBACK,
        ),
    ]
    version = _chunk_version().model_copy(
        update={
            "included_block_kinds": [PaperBlockKind.TABLE_BODY_TEXT],
            "target_token_budget": 5,
            "hard_max_tokens": 6,
        }
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) >= 2
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)
    assert all(member.member_kind == ChunkMemberKind.BLOCK for member in result.members)
    assert all(member.canonical_sentence_ordinal is None for member in result.members)


def test_assemble_structural_chunks_repeats_table_header_across_split_table_chunks():
    common = _common_identity()
    table_text = "Characteristic\tIntervention\tControl\t \tAge\t52\t51\t \tBMI\t26\t25"
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(table_text),
            text=table_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_BODY_TEXT,
        ),
    ]
    version = _chunk_version().model_copy(
        update={
            "included_block_kinds": [PaperBlockKind.TABLE_BODY_TEXT],
            "target_token_budget": 6,
            "hard_max_tokens": 6,
        }
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert [chunk.text for chunk in result.chunks] == [
        "Characteristic\nIntervention\nControl\nAge\n52\n51",
        "Characteristic\nIntervention\nControl\nBMI\n26\n25",
    ]
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)


def test_assemble_structural_chunks_omits_repeated_table_header_on_overflow():
    common = _common_identity()
    table_text = "Outcome label\tIntervention group\tControl\t \tAge\t52\t51\t \tBMI\t26\t25"
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(table_text),
            text=table_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_BODY_TEXT,
        ),
    ]
    version = _chunk_version().model_copy(
        update={
            "included_block_kinds": [PaperBlockKind.TABLE_BODY_TEXT],
            "target_token_budget": 5,
            "hard_max_tokens": 6,
        }
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert [chunk.text for chunk in result.chunks] == [
        "Age\n52\n51",
        "BMI\n26\n25",
    ]
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)


def test_assemble_structural_chunks_merges_table_caption_with_linked_table_body_context():
    common = _common_identity()
    caption_text = "Table 1. Baseline characteristics"
    table_text = "Characteristic\tIntervention\tControl\t \tAge\t52\t51"
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(caption_text),
            text=caption_text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_CAPTION,
            linked_asset_ref="Tab1",
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=len(caption_text) + 1,
            source_end_offset=len(caption_text) + 1 + len(table_text),
            text=table_text,
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.TABLE_BODY_TEXT,
            linked_asset_ref="Tab1",
        ),
    ]
    version = _chunk_version().model_copy(
        update={
            "included_block_kinds": [PaperBlockKind.TABLE_CAPTION, PaperBlockKind.TABLE_BODY_TEXT],
            "caption_merge_policy": CaptionMergePolicy.STRUCTURAL_CONTEXT,
            "target_token_budget": 12,
            "hard_max_tokens": 16,
        }
    )

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].primary_block_kind == PaperBlockKind.TABLE_BODY_TEXT
    assert result.chunks[0].text.startswith("Table 1. Baseline characteristics")
    assert "Characteristic\nIntervention\nControl" in result.chunks[0].text
    assert [member.canonical_block_ordinal for member in result.members] == [0, 1]
