from __future__ import annotations

from app.rag.parse_contract import SectionRole
from app.rag.rag_schema_contract import PaperSectionRow
from app.rag_ingest.section_context import (
    build_section_contexts,
    looks_like_noncontextual_section_label,
    looks_like_structural_heading,
    repeated_nonstructural_section_label_counts,
)


def test_build_section_contexts_builds_deduplicated_heading_path():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Results",
            numbering_token=None,
            text="Results",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=1,
            section_role=SectionRole.RESULTS,
            display_label="Clinical outcomes",
            numbering_token="2.1",
            text="Clinical outcomes",
        ),
    ]

    contexts = build_section_contexts(sections)

    assert contexts[1].heading_path == ("Results",)
    assert contexts[2].heading_path == ("Results", "Clinical outcomes")


def test_build_section_contexts_skips_repeated_nonstructural_labels():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
    ]

    contexts = build_section_contexts(sections)

    assert contexts[1].heading_path == ()
    assert contexts[2].heading_path == ()
    assert contexts[3].heading_path == ()


def test_looks_like_structural_heading_requires_heading_like_exact_match():
    assert looks_like_structural_heading("Introduction")
    assert looks_like_structural_heading("1. Introduction")
    assert not looks_like_structural_heading(
        "Results of an innovative methodology"
    )
    assert not looks_like_structural_heading("Background and terms of reference")


def test_build_section_contexts_skips_noncontextual_media_labels():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="Fig. 2",
            numbering_token=None,
            text="Fig. 2",
        ),
    ]

    contexts = build_section_contexts(sections)

    assert contexts[1].heading_path == ()
    assert looks_like_noncontextual_section_label("Journal of Medicinal Chemistry")


def test_build_section_contexts_carries_forward_last_contextual_heading_for_numeric_subsections():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.METHODS,
            display_label="Critical Appraisal",
            numbering_token=None,
            text="Critical Appraisal",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="5",
            numbering_token=None,
            text="5",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="a",
            numbering_token=None,
            text="a",
        ),
    ]

    contexts = build_section_contexts(sections)

    assert contexts[1].heading_path == ("Critical Appraisal",)
    assert contexts[2].heading_path == ("Critical Appraisal",)
    assert contexts[3].heading_path == ("Critical Appraisal",)


def test_build_section_contexts_carries_forward_context_for_numeric_intro_subsections():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.INTRODUCTION,
            display_label="Diagnosis",
            numbering_token=None,
            text="Diagnosis",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.INTRODUCTION,
            display_label="2.",
            numbering_token=None,
            text="2.",
        ),
    ]

    contexts = build_section_contexts(sections)

    assert contexts[1].heading_path == ("Diagnosis",)
    assert contexts[2].heading_path == ("Diagnosis",)


def test_repeated_nonstructural_section_label_counts_ignores_media_and_child_subsections():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Results",
            numbering_token=None,
            text="Results",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=1,
            section_role=SectionRole.OTHER,
            display_label="Thermal Stability Investigations",
            numbering_token=None,
            text="Thermal Stability Investigations",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=1,
            section_role=SectionRole.OTHER,
            display_label="Thermal Stability Investigations",
            numbering_token=None,
            text="Thermal Stability Investigations",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=4,
            parent_section_ordinal=1,
            section_role=SectionRole.OTHER,
            display_label="Thermal Stability Investigations",
            numbering_token=None,
            text="Thermal Stability Investigations",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=5,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Fig. 2",
            numbering_token=None,
            text="Fig. 2",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=6,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Fig. 3",
            numbering_token=None,
            text="Fig. 3",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=7,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Fig. 4",
            numbering_token=None,
            text="Fig. 4",
        ),
    ]

    assert repeated_nonstructural_section_label_counts(sections) == {}


def test_repeated_nonstructural_section_label_counts_flags_top_level_journal_noise():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.RESULTS,
            display_label="Journal of Medicinal Chemistry",
            numbering_token=None,
            text="Journal of Medicinal Chemistry",
        ),
    ]

    assert repeated_nonstructural_section_label_counts(sections) == {
        "journal of medicinal chemistry": 3
    }


def test_repeated_nonstructural_section_label_counts_ignores_repeated_cohort_aliases():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="PREVENT-AD",
            numbering_token=None,
            text="PREVENT-AD",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="PREVENT-AD",
            numbering_token=None,
            text="PREVENT-AD",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label="PREVENT-AD",
            numbering_token=None,
            text="PREVENT-AD",
        ),
    ]

    assert repeated_nonstructural_section_label_counts(sections) == {}


def test_repeated_nonstructural_section_label_counts_flags_repeated_outline_noise():
    sections = [
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=1,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label=". . Protein structure prediction",
            numbering_token=None,
            text=". . Protein structure prediction",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=2,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label=". . Protein structure prediction",
            numbering_token=None,
            text=". . Protein structure prediction",
        ),
        PaperSectionRow(
            corpus_id=1,
            section_ordinal=3,
            parent_section_ordinal=None,
            section_role=SectionRole.OTHER,
            display_label=". . Protein structure prediction",
            numbering_token=None,
            text=". . Protein structure prediction",
        ),
    ]

    assert repeated_nonstructural_section_label_counts(sections) == {
        "protein structure prediction": 3
    }
