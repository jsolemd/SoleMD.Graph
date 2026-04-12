"""Tests for canonical base admission materialization."""

from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import MagicMock, patch

from app.graph.base_policy import materialize_base_admission


def _mock_db_connection() -> tuple[MagicMock, MagicMock]:
    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    return conn, cur


def _sql_history(cur: MagicMock) -> str:
    return "\n".join(str(call.args[0]) for call in cur.execute.call_args_list)


def test_materialize_base_admission_reads_summary_not_raw_pubtator():
    conn, cur = _mock_db_connection()
    cur.fetchone.side_effect = [
        {"policy_version": "curated_base_v2", "target_base_count": 1000000},
        {"missing_count": 0},
        {
            "base_count": 11,
            "universe_count": 4,
            "renderable_count": 15,
            "non_renderable_count": 2,
        },
    ]
    cur.fetchall.side_effect = [
        [{"admission_reason": "vocab_entity_match", "paper_count": 7}],
        [{"base_reason": "rule", "paper_count": 9}],
        [{"journal_family_key": "domain_flagship", "paper_count": 5}],
    ]

    with patch(
        "app.graph.base_policy.db.pooled",
        return_value=nullcontext(conn),
    ):
        summary = materialize_base_admission("run-123")

    executed_sql = _sql_history(cur)

    assert "JOIN solemd.paper_evidence_summary pes" in executed_sql
    assert "JOIN solemd.papers p ON p.corpus_id = gp.corpus_id" in executed_sql
    assert "pubtator.entity_annotations" not in executed_sql
    assert "pubtator.relations" not in executed_sql
    assert "base_reason" in executed_sql
    assert "'rule'" in executed_sql
    assert "'flagship'" in executed_sql
    assert "'vocab'" in executed_sql
    assert conn.commit.called
    assert summary["policy_version"] == "curated_base_v2"
    assert summary["base_count"] == 11
    assert summary["counts_by_admission_reason"] == {"vocab_entity_match": 7}
    assert summary["counts_by_base_reason"] == {"rule": 9}
    assert summary["top_journal_families"] == {"domain_flagship": 5}
