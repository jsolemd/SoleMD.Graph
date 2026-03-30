from __future__ import annotations

from unittest.mock import MagicMock

from app.rag.chunk_cutover import ChunkCutoverStepKey
from app.rag.chunk_runtime_contract import ChunkRuntimePhase
from db.scripts.inspect_chunk_runtime import inspect_chunk_runtime


def _mock_connection(*, fetchone_side_effect, fetchall_side_effect=None):
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.fetchone.side_effect = fetchone_side_effect
    cur.fetchall.side_effect = fetchall_side_effect or []
    return conn


def test_inspect_chunk_runtime_reports_missing_tables_and_all_pending_phases():
    conn = _mock_connection(
        fetchone_side_effect=[
            {
                "has_chunk_versions": False,
                "has_chunks": False,
                "has_chunk_members": False,
                "has_citation_mentions": True,
                "has_entity_mentions": True,
            }
        ]
    )

    inspection = inspect_chunk_runtime(
        corpus_ids=[12345],
        connect=lambda: conn,
    )

    assert inspection.grounded_answer_runtime_ready is False
    assert inspection.counts is None
    assert inspection.pending_runtime_phases == [
        ChunkRuntimePhase.MIGRATE_DERIVED_SERVING_TABLES,
        ChunkRuntimePhase.ENABLE_CHUNK_VERSION_WRITES,
        ChunkRuntimePhase.ENABLE_CHUNK_CONTENT_WRITES,
        ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION,
        ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS,
        ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES,
    ]
    assert inspection.pending_cutover_steps[0] == ChunkCutoverStepKey.SEED_CHUNK_VERSION


def test_inspect_chunk_runtime_reports_backfill_gap_and_missing_indexes():
    conn = _mock_connection(
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
            {
                "chunk_version_rows": 1,
                "chunk_rows": 10,
                "chunk_member_rows": 24,
                "citation_mention_rows": 4,
                "entity_mention_rows": 6,
                "chunk_covered_corpus_ids": 0,
                "chunk_member_covered_corpus_ids": 0,
            },
        ],
        fetchall_side_effect=[
            [
                {"index_name": "idx_paper_chunks_search_tsv", "is_present": False},
            ]
        ],
    )

    inspection = inspect_chunk_runtime(
        corpus_ids=[12345],
        connect=lambda: conn,
    )

    assert inspection.grounded_answer_runtime_ready is False
    assert inspection.counts is not None
    assert inspection.counts.chunk_rows == 10
    assert inspection.missing_post_load_indexes == ["idx_paper_chunks_search_tsv"]
    assert inspection.pending_runtime_phases == [
        ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION,
        ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS,
        ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES,
    ]
    assert inspection.pending_cutover_steps == [
        ChunkCutoverStepKey.BACKFILL_CHUNKS,
        ChunkCutoverStepKey.BACKFILL_CHUNK_MEMBERS,
        ChunkCutoverStepKey.VALIDATE_LINEAGE,
        ChunkCutoverStepKey.APPLY_POST_LOAD_INDEXES,
        ChunkCutoverStepKey.ENABLE_RUNTIME_SERVING,
    ]


def test_inspect_chunk_runtime_reports_full_cutover_ready_when_all_signals_present():
    conn = _mock_connection(
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
            {
                "chunk_version_rows": 1,
                "chunk_rows": 10,
                "chunk_member_rows": 24,
                "citation_mention_rows": 4,
                "entity_mention_rows": 6,
                "chunk_covered_corpus_ids": 1,
                "chunk_member_covered_corpus_ids": 1,
            },
        ],
        fetchall_side_effect=[
            [
                {"index_name": "idx_paper_chunks_search_tsv", "is_present": True},
            ]
        ],
    )

    inspection = inspect_chunk_runtime(
        corpus_ids=[12345],
        connect=lambda: conn,
    )

    assert inspection.grounded_answer_runtime_ready is True
    assert inspection.full_cutover_ready is True
    assert inspection.pending_runtime_phases == []
    assert inspection.pending_cutover_steps == []
