from __future__ import annotations

from unittest.mock import MagicMock

from app.rag.grounded_runtime import (
    build_grounded_answer_from_runtime,
    get_grounded_answer_runtime_status,
)


def _mock_connection(*, fetchone_side_effect, fetchall_side_effect=None):
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.fetchone.side_effect = fetchone_side_effect
    cur.fetchall.side_effect = fetchall_side_effect or []
    return conn, cur


def test_grounded_runtime_status_reports_missing_tables():
    conn, _ = _mock_connection(
        fetchone_side_effect=[
            {
                "has_chunk_versions": False,
                "has_chunks": True,
                "has_chunk_members": False,
                "has_citation_mentions": True,
                "has_entity_mentions": True,
            }
        ]
    )

    status = get_grounded_answer_runtime_status(
        corpus_ids=[12345],
        connect=lambda: conn,
    )

    assert status.enabled is False
    assert status.has_chunk_version is False
    assert status.missing_tables == ["paper_chunk_versions", "paper_chunk_members"]


def test_grounded_runtime_returns_none_until_chunk_backfill_exists():
    conn, cur = _mock_connection(
        fetchone_side_effect=[
            {
                "has_chunk_versions": True,
                "has_chunks": True,
                "has_chunk_members": True,
                "has_citation_mentions": True,
                "has_entity_mentions": True,
            },
            {
                "has_chunk_version": True,
                "missing_corpus_ids": [12345],
            },
        ]
    )

    grounded = build_grounded_answer_from_runtime(
        corpus_ids=[12345],
        segment_texts=["Melatonin lowered delirium incidence."],
        connect=lambda: conn,
    )

    assert grounded is None
    assert cur.fetchall.call_count == 0


def test_grounded_runtime_builds_answer_when_chunk_runtime_is_ready():
    conn, _ = _mock_connection(
        fetchone_side_effect=[
            {
                "has_chunk_versions": True,
                "has_chunks": True,
                "has_chunk_members": True,
                "has_citation_mentions": True,
                "has_entity_mentions": True,
            },
            {
                "has_chunk_version": True,
                "missing_corpus_ids": [],
            },
        ],
        fetchall_side_effect=[
            [
                {
                    "corpus_id": 12345,
                    "source_system": "s2orc_v2",
                    "source_revision": "2026-03-10",
                    "source_document_key": "12345",
                    "source_plane": "body",
                    "parser_version": "parser-v1",
                    "raw_attrs_json": {},
                    "span_origin": "primary_text",
                    "alignment_status": "exact",
                    "alignment_confidence": 1.0,
                    "source_start_offset": 45,
                    "source_end_offset": 48,
                    "text": "[1]",
                    "canonical_section_ordinal": 1,
                    "canonical_block_ordinal": 0,
                    "canonical_sentence_ordinal": 0,
                    "source_citation_key": "b1",
                    "source_reference_key": "b1",
                    "matched_paper_id": "S2:paper-1",
                    "matched_corpus_id": 999,
                    "block_section_ordinal": 1,
                    "block_section_role": "results",
                    "block_kind": "narrative_paragraph",
                    "block_text": "Melatonin reduced delirium incidence [1].",
                    "block_is_retrieval_default": True,
                    "block_linked_asset_ref": None,
                    "sentence_section_ordinal": 1,
                    "sentence_segmentation_source": "s2orc_annotation",
                    "sentence_text": "Melatonin reduced delirium incidence [1].",
                }
            ],
            [
                {
                    "corpus_id": 12345,
                    "source_system": "biocxml",
                    "source_revision": "2026-03-21",
                    "source_document_key": "12345",
                    "source_plane": "passage",
                    "parser_version": "parser-v1",
                    "raw_attrs_json": {},
                    "span_origin": "annotation_overlay",
                    "alignment_status": "exact",
                    "alignment_confidence": 1.0,
                    "source_start_offset": 8,
                    "source_end_offset": 18,
                    "text": "Melatonin",
                    "canonical_section_ordinal": 1,
                    "canonical_block_ordinal": 0,
                    "canonical_sentence_ordinal": 0,
                    "entity_type": "chemical",
                    "source_identifier": "MESH:D008550",
                    "concept_namespace": "mesh",
                    "concept_id": "D008550",
                }
            ],
        ],
    )

    grounded = build_grounded_answer_from_runtime(
        corpus_ids=[12345],
        segment_texts=["Melatonin lowered delirium incidence."],
        connect=lambda: conn,
    )

    assert grounded is not None
    assert grounded.answer_linked_corpus_ids == [12345]
    assert grounded.segments[0].citation_anchor_ids == ["anchor:1"]
    assert grounded.cited_spans[0].entity_mentions[0].concept_id == "D008550"
