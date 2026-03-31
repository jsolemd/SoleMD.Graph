from __future__ import annotations

from app.rag.parse_contract import SectionRole
from app.rag.rag_schema_contract import PaperSectionRow
from app.rag_ingest.section_context import build_section_contexts


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
