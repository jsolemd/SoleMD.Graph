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
from app.rag.rag_schema_contract import PaperSectionRow
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


def test_assemble_structural_chunks_relabels_table_like_narrative_block_as_table_chunk():
    common = _common_identity()
    text = "Island I  Island II  Island III  Island IV  Island V   LD-Y  LD-Z"
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(text),
            text=text,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Genotype",
            numbering_token=None,
            text="Genotype",
        )
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        blocks=blocks,
        sentences=[],
        sections=sections,
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].primary_block_kind == PaperBlockKind.TABLE_BODY_TEXT
    assert result.chunks[0].text == text


def test_assemble_structural_chunks_skips_placeholder_truncated_fragment_block():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=61,
            text="In the unadjusted model RNT was associated with global A (stan-",
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
        sections=[
            PaperSectionRow(
                corpus_id=12345,
                section_ordinal=1,
                parent_section_ordinal=None,
                section_role=SectionRole.RESULTS,
                display_label="PREVENT-AD",
                numbering_token=None,
                text="PREVENT-AD",
            )
        ],
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


def test_assemble_structural_chunks_prefixes_informative_section_heading_when_sections_provided():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=55,
            text="The patient had a history of Miller Fisher syndrome.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="PAST MEDICAL HISTORY",
            numbering_token=None,
            text="PAST MEDICAL HISTORY",
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        sections=sections,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].text.startswith("PAST MEDICAL HISTORY\n")
    assert result.chunks[0].text.endswith("The patient had a history of Miller Fisher syndrome.")


def test_assemble_structural_chunks_skips_repeated_nonstructural_section_prefixes():
    common = _common_identity()
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=28,
            text="Melatonin reduced delirium.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
    ]

    result = assemble_structural_chunks(
        version=_chunk_version(),
        sections=sections,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].text == "Melatonin reduced delirium."


def test_structured_other_sections_do_not_emit_standalone_admin_fragments():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [SectionRole.OTHER],
            "target_token_budget": 16,
            "hard_max_tokens": 20,
        }
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=45,
            text="Are the main outcomes clearly described?",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=46,
            source_end_offset=47,
            text="7",
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=48,
            source_end_offset=56,
            text="Removed.",
            block_ordinal=2,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=57,
            source_end_offset=115,
            text="Were the statistical tests used to assess the main outcomes appropriate?",
            block_ordinal=3,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert result.chunks
    assert all(chunk.text != "7" for chunk in result.chunks)
    assert all("Removed." not in chunk.text for chunk in result.chunks)
    assert any("Were the statistical tests used" in chunk.text for chunk in result.chunks)
    assert all(member.member_kind == ChunkMemberKind.BLOCK for member in result.members)


def test_structural_chunks_carry_context_across_numeric_sections_and_skip_placeholders():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [SectionRole.OTHER, SectionRole.METHODS],
            "target_token_budget": 18,
            "hard_max_tokens": 24,
        }
    )
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.METHODS,
            display_label="Critical Appraisal",
            numbering_token=None,
            text="Critical Appraisal",
        ),
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="5",
            numbering_token=None,
            text="5",
        ),
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="a",
            numbering_token=None,
            text="a",
        ),
    ]
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=44,
            text="Are the main outcomes clearly described?",
            block_ordinal=0,
            section_ordinal=2,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=45,
            source_end_offset=53,
            text="Removed.",
            block_ordinal=1,
            section_ordinal=3,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=54,
            source_end_offset=124,
            text="Were the statistical tests used to assess the main outcomes appropriate?",
            block_ordinal=2,
            section_ordinal=3,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        sections=sections,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].text.startswith("Critical Appraisal\n")
    assert "Removed." not in result.chunks[0].text
    assert len(result.members) == 2


def test_assemble_structural_chunks_suppresses_short_metadata_placeholder_blocks():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={"included_section_roles": [SectionRole.METHODS]}
    )
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.METHODS,
            display_label="Patient and public involvement",
            numbering_token=None,
            text="Patient and public involvement",
        ),
    ]
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=5,
            text="None.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.METHODS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        sections=sections,
        blocks=blocks,
        sentences=[],
    )

    assert result.chunks == []
    assert result.members == []


def test_assemble_structural_chunks_absorbs_tiny_prefix_block_into_following_split_block():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [SectionRole.OTHER],
            "target_token_budget": 7,
            "hard_max_tokens": 10,
        }
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=13,
            text="Biomass data.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=14,
            source_end_offset=120,
            text=(
                "Collected across protected sites with a standardized protocol over multiple "
                "sampling years."
            ),
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) >= 2
    assert all(chunk.text != "Biomass data." for chunk in result.chunks)
    assert result.chunks[0].text.startswith("Biomass data.")


def test_structured_narrative_run_preserves_sentence_lineage_for_prose_blocks():
    common = _common_identity()
    title = "Study"
    author_line = "T.S. SATHYANARAYANA RAO 1 AND K. KURUVILIA 2 ."
    first = (
        "The impact of alcoholism on marital-family functioning is challenging for clinicians."
    )
    second = "Stress and psychosocial models both explain the wives' coping experience."
    third = "Family adjustment often requires reorganization when alcohol misuse persists."
    block_text = " ".join((first, second, third))
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [
                SectionRole.ABSTRACT,
                SectionRole.RESULTS,
                SectionRole.OTHER,
            ],
            "target_token_budget": 24,
            "hard_max_tokens": 30,
        }
    )
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label=title,
            numbering_token=None,
            text=title,
        ),
    ]
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(author_line),
            text=author_line,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=len(author_line) + 1,
            source_end_offset=len(author_line) + 1 + len(block_text),
            text=block_text,
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=len(author_line) + 1,
            source_end_offset=len(author_line) + 1 + len(first),
            text=first,
            sentence_ordinal=0,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(author_line) + 2 + len(first),
            source_end_offset=len(author_line) + 2 + len(first) + len(second),
            text=second,
            sentence_ordinal=1,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(author_line) + 3 + len(first) + len(second),
            source_end_offset=len(author_line) + 3 + len(first) + len(second) + len(third),
            text=third,
            sentence_ordinal=2,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        sections=sections,
        blocks=blocks,
        sentences=sentences,
    )

    prose_members = [member for member in result.members if member.canonical_block_ordinal == 1]
    prose_chunk_ordinals = {
        member.chunk_ordinal
        for member in prose_members
        if member.member_kind == ChunkMemberKind.SENTENCE
    }

    assert len(result.chunks) >= 2
    assert len(prose_chunk_ordinals) >= 2
    assert any(member.member_kind == ChunkMemberKind.SENTENCE for member in prose_members)
    assert all(member.member_kind != ChunkMemberKind.BLOCK for member in prose_members)


def test_assemble_structural_chunks_merges_table_like_narrative_headers_with_following_rows():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [SectionRole.OTHER],
            "target_token_budget": 20,
            "hard_max_tokens": 24,
        }
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=30,
            text="Compound\nSource Key Findings Ref.",
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=31,
            source_end_offset=56,
            text="Saccharopolyspora erythraea",
            block_ordinal=1,
            section_ordinal=2,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=57,
            source_end_offset=140,
            text="Overexpression of SACE_7301 in wild-type strains enhanced erythromycin yields.",
            block_ordinal=2,
            section_ordinal=2,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert "Compound" in result.chunks[0].text
    assert "Source Key Findings Ref." in result.chunks[0].text
    assert "Saccharopolyspora erythraea" in result.chunks[0].text
    assert "enhanced erythromycin yields" in result.chunks[0].text


def test_assemble_structural_chunks_merges_weak_sentence_fragment_with_previous_sentence():
    common = _common_identity()
    block_text = "Participants on average engaged in 477. 64"
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
            source_end_offset=36,
            text="Participants on average engaged in 477.",
            sentence_ordinal=0,
            block_ordinal=0,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=37,
            source_end_offset=len(block_text),
            text="64",
            sentence_ordinal=1,
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
    assert "Participants on average engaged in 477." in result.chunks[0].text
    assert result.chunks[0].token_count_estimate >= 6


def test_assemble_structural_chunks_merges_weak_alias_section_into_previous_context():
    common = _common_identity()
    version = _chunk_version().model_copy(
        update={
            "included_section_roles": [SectionRole.OTHER],
            "target_token_budget": 40,
            "hard_max_tokens": 48,
        }
    )
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=92,
            text=(
                "We found evidence of a positive relationship between repetitive negative "
                "thinking and amyloid burden."
            ),
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=93,
            source_end_offset=150,
            text="In the unadjusted model RNT was associated with global A (stan-",
            block_ordinal=1,
            section_ordinal=2,
            section_role=SectionRole.OTHER,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="Amyloid: PREVENT-AD and IMAP+",
            numbering_token=None,
            text="Amyloid: PREVENT-AD and IMAP+",
        ),
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="PREVENT-AD",
            numbering_token=None,
            text="PREVENT-AD",
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        sections=sections,
        blocks=blocks,
        sentences=[],
    )

    assert len(result.chunks) == 1
    assert "repetitive negative thinking" in result.chunks[0].text
    assert "In the unadjusted model RNT was associated" not in result.chunks[0].text


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


def test_assemble_structural_chunks_keeps_sentence_lineage_for_prose_inside_mixed_run():
    common = _common_identity()
    version = _chunk_version().model_copy(update={"target_token_budget": 12, "hard_max_tokens": 16})
    sections = [
        PaperSectionRow(
            corpus_id=12345,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Results",
            numbering_token=None,
            text="Results",
        ),
    ]
    lead = "Checklist item?"
    first = "Alpha beta gamma delta."
    second = "Epsilon zeta eta theta."
    third = "Iota kappa lambda mu."
    fourth = "Nu xi omicron pi."
    prose_text = " ".join([first, second, third, fourth])
    blocks = [
        PaperBlockRecord(
            **common,
            source_start_offset=0,
            source_end_offset=len(lead),
            text=lead,
            block_ordinal=0,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
        PaperBlockRecord(
            **common,
            source_start_offset=len(lead) + 1,
            source_end_offset=len(lead) + 1 + len(prose_text),
            text=prose_text,
            block_ordinal=1,
            section_ordinal=1,
            section_role=SectionRole.RESULTS,
            block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
        ),
    ]
    sentences = [
        PaperSentenceRecord(
            **common,
            source_start_offset=len(lead) + 1,
            source_end_offset=len(lead) + 1 + len(first),
            text=first,
            sentence_ordinal=0,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(lead) + 2 + len(first),
            source_end_offset=len(lead) + 2 + len(first) + len(second),
            text=second,
            sentence_ordinal=1,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(lead) + 3 + len(first) + len(second),
            source_end_offset=len(lead) + 3 + len(first) + len(second) + len(third),
            text=third,
            sentence_ordinal=2,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
        PaperSentenceRecord(
            **common,
            source_start_offset=len(lead) + 4 + len(first) + len(second) + len(third),
            source_end_offset=(
                len(lead) + 4 + len(first) + len(second) + len(third) + len(fourth)
            ),
            text=fourth,
            sentence_ordinal=3,
            block_ordinal=1,
            section_ordinal=1,
            segmentation_source=SentenceSegmentationSource.S2ORC_ANNOTATION,
        ),
    ]

    result = assemble_structural_chunks(
        version=version,
        sections=sections,
        blocks=blocks,
        sentences=sentences,
    )

    assert len(result.chunks) >= 2
    assert all(chunk.token_count_estimate <= version.hard_max_tokens for chunk in result.chunks)
    block_members = [member for member in result.members if member.canonical_block_ordinal == 1]
    assert block_members
    assert all(member.member_kind == ChunkMemberKind.SENTENCE for member in block_members)
    assert {member.canonical_sentence_ordinal for member in block_members} == {0, 1, 2, 3}


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
