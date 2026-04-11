from __future__ import annotations

from app.rag_ingest.chunk_quality import is_weak_short_narrative_chunk_text
from app.rag_ingest.warehouse_quality import inspect_rag_warehouse_quality


class _FakeLoader:
    def load_quality_rows(self, *, corpus_ids, chunk_version_key=None):
        assert corpus_ids == [1, 2, 3, 4, 5]
        assert chunk_version_key == "preview-stanza-hybrid-v1"
        return [
            {
                "corpus_id": 1,
                "document_count": 1,
                "title": "Example paper",
                "section_count": 2,
                "block_count": 4,
                "retrieval_default_block_count": 3,
                "front_matter_block_count": 1,
                "reference_block_count": 0,
                "caption_or_table_block_count": 1,
                "narrative_block_count": 3,
                "sentence_count": 12,
                "reference_count": 4,
                "chunk_count": 2,
                "oversize_chunk_count": 0,
                "oversize_table_chunk_count": 0,
                "tiny_narrative_chunk_count": 0,
                "low_value_narrative_chunk_count": 0,
                "chunk_member_count": 12,
                "max_repeated_nonstructural_section_label_count": 0,
            },
            {
                "corpus_id": 2,
                "document_count": 1,
                "title": "Introduction",
                "section_count": 1,
                "block_count": 2,
                "retrieval_default_block_count": 0,
                "front_matter_block_count": 2,
                "reference_block_count": 0,
                "caption_or_table_block_count": 0,
                "narrative_block_count": 0,
                "sentence_count": 0,
                "reference_count": 0,
                "chunk_count": 0,
                "oversize_chunk_count": 0,
                "oversize_table_chunk_count": 0,
                "tiny_narrative_chunk_count": 0,
                "low_value_narrative_chunk_count": 0,
                "chunk_member_count": 0,
                "max_repeated_nonstructural_section_label_count": 0,
            },
            {
                "corpus_id": 3,
                "document_count": 0,
                "title": None,
                "section_count": 0,
                "block_count": 0,
                "retrieval_default_block_count": 0,
                "front_matter_block_count": 0,
                "reference_block_count": 0,
                "caption_or_table_block_count": 0,
                "narrative_block_count": 0,
                "sentence_count": 0,
                "reference_count": 0,
                "chunk_count": 0,
                "oversize_chunk_count": 0,
                "oversize_table_chunk_count": 0,
                "tiny_narrative_chunk_count": 0,
                "low_value_narrative_chunk_count": 0,
                "chunk_member_count": 0,
                "max_repeated_nonstructural_section_label_count": 0,
            },
            {
                "corpus_id": 4,
                "document_count": 1,
                "title": "Chemistry article",
                "section_count": 8,
                "block_count": 12,
                "retrieval_default_block_count": 10,
                "front_matter_block_count": 1,
                "reference_block_count": 1,
                "caption_or_table_block_count": 2,
                "narrative_block_count": 9,
                "sentence_count": 28,
                "reference_count": 12,
                "chunk_count": 6,
                "oversize_chunk_count": 1,
                "oversize_table_chunk_count": 1,
                "tiny_narrative_chunk_count": 2,
                "low_value_narrative_chunk_count": 1,
                "chunk_member_count": 24,
                "max_repeated_nonstructural_section_label_count": 6,
            },
            {
                "corpus_id": 5,
                "document_count": 1,
                "title": "Publisher's note",
                "section_count": 6,
                "block_count": 8,
                "retrieval_default_block_count": 7,
                "front_matter_block_count": 1,
                "reference_block_count": 1,
                "caption_or_table_block_count": 0,
                "narrative_block_count": 6,
                "sentence_count": 22,
                "reference_count": 6,
                "chunk_count": 4,
                "oversize_chunk_count": 0,
                "oversize_table_chunk_count": 0,
                "tiny_narrative_chunk_count": 0,
                "low_value_narrative_chunk_count": 0,
                "chunk_member_count": 14,
                "max_repeated_nonstructural_section_label_count": 0,
            },
        ]


def test_inspect_rag_warehouse_quality_flags_structural_anomalies():
    report = inspect_rag_warehouse_quality(
        corpus_ids=[1, 2, 3, 4, 5],
        chunk_version_key="preview-stanza-hybrid-v1",
        loader=_FakeLoader(),
    )

    assert report.requested_corpus_ids == [1, 2, 3, 4, 5]
    assert report.chunk_version_key == "preview-stanza-hybrid-v1"
    assert report.flagged_corpus_ids == [2, 3, 4, 5]
    assert report.papers[0].flags == []
    assert report.papers[1].flags == [
        "no_sentences",
        "no_retrieval_default_blocks",
        "front_matter_only",
        "no_narrative_blocks",
        "suspicious_structural_title",
    ]
    assert report.papers[2].flags == [
        "missing_document",
        "no_sections",
        "no_blocks",
        "no_sentences",
    ]
    assert report.papers[3].flags == [
        "oversize_chunks",
        "oversize_table_chunks",
        "tiny_narrative_chunks",
        "low_value_narrative_chunks",
        "repeated_nonstructural_section_labels",
    ]
    assert report.papers[4].flags == [
        "suspicious_boilerplate_title",
    ]


def test_is_weak_short_narrative_chunk_text_distinguishes_complete_sentence_from_truncation():
    assert not is_weak_short_narrative_chunk_text(
        "Study design\nSingle-center cross-sectional study."
    )
    assert not is_weak_short_narrative_chunk_text(
        "Results\nPhysical Activity Patterns\nParticipants on average engaged in 477. 64"
    )
    assert not is_weak_short_narrative_chunk_text(
        'Intraoperative considerations\n"Before anything else, preparation is the key to '
        'success."-Alexander Graham Bell'
    )
    assert is_weak_short_narrative_chunk_text(
        "PREVENT-AD cohort\nTwo hundred and ninety-two cognitively normal participants from the"
    )
    assert is_weak_short_narrative_chunk_text(
        "Diagnosis\nAortic valve area (AVA):\nDiameter of the LVOT"
    )
