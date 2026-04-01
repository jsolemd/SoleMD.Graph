from __future__ import annotations

from app.rag.parse_contract import (
    PaperBlockKind,
    PaperBlockRecord,
    ParseSourceSystem,
    SectionRole,
    SourcePlane,
)
from app.rag.rag_schema_contract import PaperSectionRow
from app.rag_ingest.narrative_structure import (
    NarrativeBlockClass,
    classify_narrative_block,
)
from app.rag_ingest.section_context import build_section_contexts
from app.rag_ingest.tokenization import RegexFallbackChunkTokenBudgeter


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


def _block(*, text: str, section_ordinal: int = 1, section_role: SectionRole = SectionRole.OTHER):
    return PaperBlockRecord(
        **_common_identity(),
        source_start_offset=0,
        source_end_offset=max(len(text), 1),
        text=text,
        block_ordinal=0,
        section_ordinal=section_ordinal,
        section_role=section_role,
        block_kind=PaperBlockKind.NARRATIVE_PARAGRAPH,
    )


def _section_context(label: str, *, section_role: SectionRole = SectionRole.OTHER):
    contexts = build_section_contexts(
        [
            PaperSectionRow(
                corpus_id=12345,
                section_ordinal=1,
                parent_section_ordinal=None,
                section_role=section_role,
                display_label=label,
                numbering_token=None,
                text=label,
            )
        ]
    )
    return contexts[1]


def test_classify_narrative_block_marks_heading_scaffolds_as_placeholder():
    block = _block(text=". Methods", section_role=SectionRole.INTRODUCTION)

    result = classify_narrative_block(
        block=block,
        section_context=_section_context(". Introduction", section_role=SectionRole.INTRODUCTION),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.PLACEHOLDER


def test_classify_narrative_block_marks_orphan_variable_header_as_placeholder():
    block = _block(text="Mean ± SD n/%")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Variable"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.PLACEHOLDER


def test_classify_narrative_block_marks_competing_interest_notice_as_metadata():
    block = _block(text="The authors declare that they have no competing interests.")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Declaration of competing interest"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_publisher_notice_as_metadata():
    block = _block(text="At BMC, research is always in progress.")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Conclusions"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_reviewer_reply_as_metadata():
    block = _block(
        text="Reply 9:\nWe have revised the manuscript carefully to correct misspelling."
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Results"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_reviewer_reply_heading_as_metadata():
    block = _block(text="We have revised the manuscript carefully to correct misspelling.")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Reply 9:"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_ocr_split_disclosure_as_metadata():
    block = _block(
        text="CONFLI CT OF INTEREST\nAuthors declare no conflict of interests for this article."
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Results"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_ocr_split_disclosure_heading_as_metadata():
    block = _block(text="Authors declare no conflict of interests for this article.")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("CONFLI CT OF INTEREST"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_reporting_template_prompts_as_metadata():
    block = _block(
        text=(
            "Describe the data collection procedure, including who recorded the data and how."
        )
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Life sciences study design"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_clinical_trial_reporting_prompts_as_metadata():
    block = _block(
        text=(
            "Provide the trial registration number from ClinicalTrials.gov or an "
            "equivalent agency."
        )
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Clinical trial registration"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_publisher_heading_banner_as_metadata():
    block = _block(text="BSA ELICITS ADIPOSE EOSINOPHILIA")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("ImmunoHorizons"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_abbreviation_glossary_as_metadata():
    block = _block(text="CBC\nComplete blood count\nCTA\nComputed tomography angiography")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Abbreviations"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_numeric_plot_residue_as_table_like():
    block = _block(text="Ruda07 Pere08 0.1 1 2 5 0.2 10 0.5")

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Discussion", section_role=SectionRole.DISCUSSION),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.TABLE_LIKE


def test_classify_narrative_block_marks_truncated_appendix_cross_reference_as_metadata():
    block = _block(
        text="The CHEC quality assessment was performed for each included study (see Appendix",
        section_role=SectionRole.RESULTS,
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("Results", section_role=SectionRole.RESULTS),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.METADATA


def test_classify_narrative_block_marks_hyphen_truncated_fragment_as_placeholder():
    block = _block(
        text="In the unadjusted model RNT was associated with global A (stan-",
        section_role=SectionRole.OTHER,
    )

    result = classify_narrative_block(
        block=block,
        section_context=_section_context("PREVENT-AD"),
        token_budgeter=RegexFallbackChunkTokenBudgeter(),
    )

    assert result == NarrativeBlockClass.PLACEHOLDER
