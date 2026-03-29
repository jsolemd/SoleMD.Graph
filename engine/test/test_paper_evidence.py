"""Tests for durable paper evidence refresh."""

from __future__ import annotations

from contextlib import nullcontext
from unittest.mock import MagicMock
from unittest.mock import patch

from app.graph.paper_evidence import refresh_paper_evidence_summary


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
        "rule_evidence_count": 80,
        "curated_journal_count": 25,
    }

    with patch(
        "app.graph.paper_evidence.db.pooled",
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
    assert "has_rule_evidence = (" in executed_sql
    assert "src.admission_reason IN ('journal_and_vocab', 'vocab_entity_match')" in executed_sql
    assert conn.commit.called
    assert summary == {
        "paper_count": 100,
        "rule_evidence_count": 80,
        "curated_journal_count": 25,
    }
