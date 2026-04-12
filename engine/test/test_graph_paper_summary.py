from app.graph.attachment import GRAPH_POINT_ATTACHMENT_SQL
from app.graph.paper_summary import (
    _create_graph_paper_summary_stage_sql,
    _swap_graph_paper_summary_stage,
)
from app.graph.repository import (
    RESOLVE_PAPER_GRAPH_REFS_SQL,
    RESOLVE_PAPER_NODES_FOR_GRAPH_SQL,
)


def test_graph_paper_summary_stage_sql_builds_from_papers_evidence_and_authors() -> None:
    sql = _create_graph_paper_summary_stage_sql("solemd.graph_paper_summary_next")

    assert "FROM solemd.corpus c" in sql
    assert "JOIN solemd.papers p" in sql
    assert "LEFT JOIN solemd.paper_evidence_summary pes" in sql
    assert "FROM solemd.paper_authors pa" in sql


def test_graph_attachment_sql_reads_graph_paper_summary() -> None:
    assert "JOIN solemd.graph_paper_summary gps" in GRAPH_POINT_ATTACHMENT_SQL
    assert "paper_evidence_summary" not in GRAPH_POINT_ATTACHMENT_SQL


def test_wiki_runtime_queries_use_graph_paper_summary_for_pmid_resolution() -> None:
    assert "FROM solemd.graph_paper_summary gps" in RESOLVE_PAPER_GRAPH_REFS_SQL
    assert "FROM solemd.graph_paper_summary gps" in RESOLVE_PAPER_NODES_FOR_GRAPH_SQL


class _RecordingCursor:
    def __init__(self) -> None:
        self.statements: list[str] = []

    def execute(self, sql: str, params=None) -> None:
        self.statements.append(sql.strip())


def test_graph_paper_summary_swap_renames_stage_constraints_and_indexes() -> None:
    cur = _RecordingCursor()

    _swap_graph_paper_summary_stage(cur)

    joined = "\n".join(cur.statements)
    assert "RENAME TO graph_paper_summary_old" in joined
    assert "RENAME CONSTRAINT graph_paper_summary_pkey" in joined
    assert "ALTER INDEX IF EXISTS solemd.graph_paper_summary_graph_paper_ref_key" in joined
    assert "ALTER INDEX IF EXISTS solemd.idx_graph_paper_summary_pmid" in joined
    assert "ALTER TABLE solemd.graph_paper_summary_next RENAME TO graph_paper_summary" in joined
    assert "RENAME CONSTRAINT graph_paper_summary_next_pkey" in joined
    assert "ALTER INDEX solemd.graph_paper_summary_next_graph_paper_ref_key" in joined
    assert "ALTER INDEX solemd.idx_graph_paper_summary_next_pmid" in joined
