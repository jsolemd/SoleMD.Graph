"""Tests for persistent paper evidence summary and base admission materialization."""

from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import MagicMock
from unittest.mock import patch

from app.graph.visibility_policy import materialize_base_policy
from app.graph.visibility_policy import refresh_paper_evidence_summary


def _mock_db_connection() -> tuple[MagicMock, MagicMock]:
    conn = MagicMock()
    cur = MagicMock()
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    return conn, cur


def _sql_history(cur: MagicMock) -> str:
    return "\n".join(str(call.args[0]) for call in cur.execute.call_args_list)


def test_refresh_paper_evidence_summary_persists_durable_summary():
    conn, cur = _mock_db_connection()
    cur.fetchone.return_value = {
        "paper_count": 100,
        "direct_evidence_count": 80,
        "journal_base_count": 25,
    }

    with patch(
        "app.graph.visibility_policy.db.pooled",
        return_value=nullcontext(conn),
    ):
        summary = refresh_paper_evidence_summary()

    executed_sql = _sql_history(cur)

    assert "CREATE TEMP TABLE tmp_paper_evidence_source" in executed_sql
    assert "JOIN solemd.corpus c ON c.pmid = ea.pmid" in executed_sql
    assert "JOIN solemd.corpus c ON c.pmid = r.pmid" in executed_sql
    assert "JOIN tmp_paper_evidence_source src ON src.pmid = ea.pmid" not in executed_sql
    assert "JOIN tmp_paper_evidence_source src ON src.pmid = r.pmid" not in executed_sql
    assert "INSERT INTO solemd.paper_evidence_summary" in executed_sql
    assert "DELETE FROM solemd.paper_evidence_summary" in executed_sql
    assert conn.commit.called
    assert summary == {
        "paper_count": 100,
        "direct_evidence_count": 80,
        "journal_base_count": 25,
    }


def test_materialize_base_policy_reads_summary_not_raw_pubtator():
    conn, cur = _mock_db_connection()
    cur.fetchone.side_effect = [
        {"policy_version": "domain_rich_base_v1", "target_base_count": 1160000},
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
        [{"base_source": "direct", "paper_count": 9}],
        [{"journal_family_key": "domain_flagship", "paper_count": 5}],
    ]

    with patch(
        "app.graph.visibility_policy.db.pooled",
        return_value=nullcontext(conn),
    ):
        summary = materialize_base_policy("run-123")

    executed_sql = _sql_history(cur)

    assert "JOIN solemd.paper_evidence_summary pes" in executed_sql
    assert "pubtator.entity_annotations" not in executed_sql
    assert "pubtator.relations" not in executed_sql
    assert "SET is_in_base = false" not in executed_sql
    assert conn.commit.called
    assert summary["policy_version"] == "domain_rich_base_v1"
    assert summary["base_count"] == 11
    assert summary["counts_by_admission_reason"] == {"vocab_entity_match": 7}
    assert summary["counts_by_base_source"] == {"direct": 9}
    assert summary["top_journal_families"] == {"domain_flagship": 5}
