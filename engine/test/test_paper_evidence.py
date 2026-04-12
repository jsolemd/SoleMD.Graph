"""Tests for durable paper evidence refresh."""

from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import MagicMock, patch

from app.graph.paper_evidence import (
    _create_paper_evidence_summary_stage_sql,
    _create_paper_relation_evidence_stage_sql,
    refresh_paper_evidence_summary,
)


def _mock_db_connection() -> tuple[MagicMock, MagicMock]:
    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    return conn, cur


def _sql_history(cur: MagicMock) -> str:
    return "\n".join(str(call.args[0]) for call in cur.execute.call_args_list)


def test_refresh_paper_evidence_summary_single_pass():
    conn, cur = _mock_db_connection()
    cur.fetchone.return_value = {
        "paper_count": 100,
        "rule_evidence_count": 80,
        "curated_journal_count": 25,
    }

    autocommit_conn = MagicMock()
    autocommit_cur = MagicMock()
    autocommit_conn.__enter__ = MagicMock(return_value=autocommit_conn)
    autocommit_conn.__exit__ = MagicMock(return_value=False)
    autocommit_conn.cursor.return_value.__enter__.return_value = autocommit_cur
    autocommit_conn.cursor.return_value.__exit__.return_value = False

    with (
        patch(
            "app.graph.paper_evidence.db.pooled",
            return_value=nullcontext(conn),
        ),
        patch(
            "app.graph.paper_evidence.db.connect_autocommit",
            return_value=autocommit_conn,
        ),
        patch(
            "app.graph.paper_evidence.refresh_graph_paper_summary",
            return_value={"paper_count": 100},
        ) as mock_graph_summary_refresh,
    ):
        summary = refresh_paper_evidence_summary()

    executed_sql = _sql_history(cur)

    # Shared staged refresh: source + relation staging + durable stage/swap
    assert "CREATE TEMP TABLE stg_paper_evidence_source" in executed_sql
    assert "CREATE TEMP TABLE stg_paper_relation_base" in executed_sql
    assert "CREATE TEMP TABLE stg_paper_relation_evidence" in executed_sql
    assert "CREATE TEMP TABLE stg_paper_evidence" in executed_sql
    assert _create_paper_evidence_summary_stage_sql(
        "solemd.paper_evidence_summary_next"
    ).strip() in executed_sql
    assert _create_paper_relation_evidence_stage_sql(
        "solemd.paper_relation_evidence_next"
    ).strip() in executed_sql
    assert "DROP TABLE IF EXISTS solemd.paper_evidence_summary_next" in executed_sql
    assert "DROP TABLE IF EXISTS solemd.paper_evidence_summary_old" in executed_sql
    assert "DROP TABLE IF EXISTS solemd.paper_relation_evidence_next" in executed_sql
    assert "DROP TABLE IF EXISTS solemd.paper_relation_evidence_old" in executed_sql
    assert "ADD CONSTRAINT paper_evidence_summary_next_pkey" in executed_sql
    assert "ADD CONSTRAINT paper_evidence_summary_next_corpus_id_fkey" in executed_sql
    assert "RENAME CONSTRAINT paper_evidence_summary_corpus_id_fkey" in executed_sql
    assert "RENAME CONSTRAINT paper_evidence_summary_pkey" in executed_sql
    assert "ALTER INDEX IF EXISTS solemd.idx_paper_evidence_summary_pmid" in executed_sql
    assert "ALTER INDEX IF EXISTS solemd.idx_paper_evidence_summary_rule_evidence" in executed_sql
    assert "ALTER INDEX IF EXISTS solemd.idx_paper_evidence_summary_journal_family" in executed_sql
    assert "CREATE INDEX idx_paper_evidence_summary_next_pmid" in executed_sql
    assert "CREATE INDEX idx_paper_evidence_summary_next_rule_evidence" in executed_sql
    assert "CREATE INDEX idx_paper_evidence_summary_next_journal_family" in executed_sql
    assert "ADD CONSTRAINT paper_relation_evidence_next_pkey" in executed_sql
    assert "ADD CONSTRAINT paper_relation_evidence_next_corpus_id_fkey" in executed_sql
    assert "RENAME CONSTRAINT paper_relation_evidence_corpus_id_fkey" in executed_sql
    assert "RENAME CONSTRAINT paper_relation_evidence_pkey" in executed_sql
    assert "ALTER INDEX IF EXISTS solemd.idx_paper_relation_evidence_type_count" in executed_sql
    assert "CREATE INDEX idx_paper_relation_evidence_next_type_count" in executed_sql
    assert (
        "ALTER TABLE solemd.paper_evidence_summary_next RENAME TO "
        "paper_evidence_summary"
        in executed_sql
    )
    assert (
        "ALTER TABLE solemd.paper_relation_evidence_next RENAME TO "
        "paper_relation_evidence"
        in executed_sql
    )

    # CTE chain computes entity/relation/journal from the shared staging tables
    assert "entity_agg" in executed_sql
    assert "relation_count_agg" in executed_sql
    assert "relation_rule_agg" in executed_sql
    assert "journal_match" in executed_sql
    assert "has_rule_evidence" in executed_sql
    assert "admission_reason IN ('journal_and_vocab', 'vocab_entity_match')" in executed_sql

    # Family diversity columns for continuous scoring
    assert "entity_rule_families" in executed_sql
    assert "entity_rule_count" in executed_sql
    assert "entity_core_families" in executed_sql
    assert "semantic_groups_csv" in executed_sql
    assert "relation_categories_csv" in executed_sql
    assert "ALTER COLUMN journal_score_multiplier SET DEFAULT 1.0" in executed_sql

    # Second-gate confidence filter
    assert "requires_second_gate" in executed_sql

    assert conn.commit.called
    assert summary == {
        "paper_count": 100,
        "rule_evidence_count": 80,
        "curated_journal_count": 25,
    }

    # ANALYZE runs on autocommit connection
    autocommit_sql = "\n".join(
        str(call.args[0]) for call in autocommit_cur.execute.call_args_list
    )
    assert "ANALYZE solemd.paper_evidence_summary" in autocommit_sql
    assert "ANALYZE solemd.paper_relation_evidence" in autocommit_sql
    mock_graph_summary_refresh.assert_called_once_with()
