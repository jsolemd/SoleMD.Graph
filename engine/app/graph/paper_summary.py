"""Dedicated graph-facing paper summary serving projection."""

from __future__ import annotations

from app import db
from app.graph.build_settings import apply_build_session_settings

GRAPH_PAPER_SUMMARY_TABLE = "solemd.graph_paper_summary"
_GRAPH_PAPER_SUMMARY_STAGE_TABLE = "solemd.graph_paper_summary_next"
_GRAPH_PAPER_SUMMARY_OLD_TABLE = "solemd.graph_paper_summary_old"
_GRAPH_PAPER_SUMMARY_PKEY = "graph_paper_summary_pkey"
_GRAPH_PAPER_SUMMARY_OLD_PKEY = "graph_paper_summary_old_pkey"
_GRAPH_PAPER_SUMMARY_GRAPH_PAPER_REF_KEY = "graph_paper_summary_graph_paper_ref_key"
_GRAPH_PAPER_SUMMARY_OLD_GRAPH_PAPER_REF_KEY = (
    "graph_paper_summary_old_graph_paper_ref_key"
)
_GRAPH_PAPER_SUMMARY_PMID_INDEX = "idx_graph_paper_summary_pmid"
_GRAPH_PAPER_SUMMARY_OLD_PMID_INDEX = "idx_graph_paper_summary_old_pmid"

_DROP_GRAPH_PAPER_SUMMARY_STAGE_SQL = f"DROP TABLE IF EXISTS {_GRAPH_PAPER_SUMMARY_STAGE_TABLE}"
_DROP_GRAPH_PAPER_SUMMARY_OLD_SQL = f"DROP TABLE IF EXISTS {_GRAPH_PAPER_SUMMARY_OLD_TABLE}"
_COUNT_GRAPH_PAPER_SUMMARY_STAGE_SQL = (
    f"SELECT COUNT(*) AS cnt FROM {_GRAPH_PAPER_SUMMARY_STAGE_TABLE}"
)

_GRAPH_PAPER_SUMMARY_SELECT_SQL = """
WITH author_rollup AS MATERIALIZED (
    SELECT
        pa.corpus_id,
        COUNT(*)::INTEGER AS author_count
    FROM solemd.paper_authors pa
    GROUP BY pa.corpus_id
)
SELECT
    c.corpus_id,
    c.pmid,
    COALESCE(p.paper_id, 'corpus:' || c.corpus_id::TEXT) AS graph_paper_ref,
    p.paper_id,
    COALESCE(p.title, '') AS title,
    COALESCE(p.journal_name, p.venue, '') AS journal_name,
    p.year,
    p.text_availability,
    COALESCE(p.reference_count, 0)::INTEGER AS reference_count,
    COALESCE(p.citation_count, 0)::INTEGER AS citation_count,
    COALESCE(ar.author_count, 0)::INTEGER AS author_count,
    COALESCE(pes.paper_entity_count, 0)::INTEGER AS entity_count,
    pes.semantic_groups_csv,
    COALESCE(pes.paper_relation_count, 0)::INTEGER AS relation_count,
    pes.relation_categories_csv,
    now()::TIMESTAMPTZ AS created_at,
    now()::TIMESTAMPTZ AS updated_at
FROM solemd.corpus c
JOIN solemd.papers p
  ON p.corpus_id = c.corpus_id
LEFT JOIN solemd.paper_evidence_summary pes
  ON pes.corpus_id = c.corpus_id
LEFT JOIN author_rollup ar
  ON ar.corpus_id = c.corpus_id
"""


def _create_graph_paper_summary_stage_sql(target_table: str) -> str:
    return f"""
CREATE TABLE {target_table} AS
{_GRAPH_PAPER_SUMMARY_SELECT_SQL}
"""


def _finalize_graph_paper_summary_stage(cur) -> int:
    cur.execute(_create_graph_paper_summary_stage_sql(_GRAPH_PAPER_SUMMARY_STAGE_TABLE))
    cur.execute(
        f"""
        ALTER TABLE {_GRAPH_PAPER_SUMMARY_STAGE_TABLE}
            ALTER COLUMN corpus_id SET NOT NULL,
            ALTER COLUMN graph_paper_ref SET NOT NULL,
            ALTER COLUMN title SET NOT NULL,
            ALTER COLUMN journal_name SET NOT NULL,
            ALTER COLUMN reference_count SET NOT NULL,
            ALTER COLUMN reference_count SET DEFAULT 0,
            ALTER COLUMN citation_count SET NOT NULL,
            ALTER COLUMN citation_count SET DEFAULT 0,
            ALTER COLUMN author_count SET NOT NULL,
            ALTER COLUMN author_count SET DEFAULT 0,
            ALTER COLUMN entity_count SET NOT NULL,
            ALTER COLUMN entity_count SET DEFAULT 0,
            ALTER COLUMN relation_count SET NOT NULL,
            ALTER COLUMN relation_count SET DEFAULT 0,
            ALTER COLUMN created_at SET NOT NULL,
            ALTER COLUMN created_at SET DEFAULT now(),
            ALTER COLUMN updated_at SET NOT NULL,
            ALTER COLUMN updated_at SET DEFAULT now()
        """
    )
    cur.execute(
        f"""
        COMMENT ON TABLE {_GRAPH_PAPER_SUMMARY_STAGE_TABLE} IS
            'Canonical graph-facing paper summary serving table keyed by corpus_id.
             Frontend/runtime graph attachment and wiki paper-card lookups should read
             this surface instead of depending on internal evidence-build tables.'
        """
    )
    cur.execute(
        f"""
        ALTER TABLE {_GRAPH_PAPER_SUMMARY_STAGE_TABLE}
            ADD CONSTRAINT graph_paper_summary_next_pkey
            PRIMARY KEY (corpus_id)
        """
    )
    cur.execute(
        f"""
        CREATE UNIQUE INDEX graph_paper_summary_next_graph_paper_ref_key
            ON {_GRAPH_PAPER_SUMMARY_STAGE_TABLE} (graph_paper_ref)
        """
    )
    cur.execute(
        f"""
        CREATE INDEX idx_graph_paper_summary_next_pmid
            ON {_GRAPH_PAPER_SUMMARY_STAGE_TABLE} (pmid)
            WHERE pmid IS NOT NULL
        """
    )
    cur.execute(_COUNT_GRAPH_PAPER_SUMMARY_STAGE_SQL)
    return cur.fetchone()["cnt"]


def _swap_graph_paper_summary_stage(cur) -> None:
    cur.execute("SET LOCAL lock_timeout = '10s'")
    cur.execute(_DROP_GRAPH_PAPER_SUMMARY_OLD_SQL)
    cur.execute(
        f"ALTER TABLE IF EXISTS {GRAPH_PAPER_SUMMARY_TABLE} "
        f"RENAME TO {_GRAPH_PAPER_SUMMARY_OLD_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE IF EXISTS {_GRAPH_PAPER_SUMMARY_OLD_TABLE}
            RENAME CONSTRAINT {_GRAPH_PAPER_SUMMARY_PKEY}
            TO {_GRAPH_PAPER_SUMMARY_OLD_PKEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_GRAPH_PAPER_SUMMARY_GRAPH_PAPER_REF_KEY}
            RENAME TO {_GRAPH_PAPER_SUMMARY_OLD_GRAPH_PAPER_REF_KEY}
        """
    )
    cur.execute(
        f"""
        ALTER INDEX IF EXISTS solemd.{_GRAPH_PAPER_SUMMARY_PMID_INDEX}
            RENAME TO {_GRAPH_PAPER_SUMMARY_OLD_PMID_INDEX}
        """
    )
    cur.execute(
        f"ALTER TABLE {_GRAPH_PAPER_SUMMARY_STAGE_TABLE} "
        f"RENAME TO {GRAPH_PAPER_SUMMARY_TABLE.split('.')[-1]}"
    )
    cur.execute(
        f"""
        ALTER TABLE {GRAPH_PAPER_SUMMARY_TABLE}
            RENAME CONSTRAINT graph_paper_summary_next_pkey
            TO {_GRAPH_PAPER_SUMMARY_PKEY}
        """
    )
    cur.execute(
        """
        ALTER INDEX solemd.graph_paper_summary_next_graph_paper_ref_key
            RENAME TO graph_paper_summary_graph_paper_ref_key
        """
    )
    cur.execute(
        """
        ALTER INDEX solemd.idx_graph_paper_summary_next_pmid
            RENAME TO idx_graph_paper_summary_pmid
        """
    )
    cur.execute(_DROP_GRAPH_PAPER_SUMMARY_OLD_SQL)


def refresh_graph_paper_summary() -> dict[str, int]:
    with db.pooled() as conn, conn.cursor() as cur:
        apply_build_session_settings(cur)
        cur.execute(_DROP_GRAPH_PAPER_SUMMARY_STAGE_SQL)
        cur.execute(_DROP_GRAPH_PAPER_SUMMARY_OLD_SQL)
        total = _finalize_graph_paper_summary_stage(cur)
        _swap_graph_paper_summary_stage(cur)
        conn.commit()

    with db.connect_autocommit() as conn, conn.cursor() as cur:
        cur.execute(f"ANALYZE {GRAPH_PAPER_SUMMARY_TABLE}")

    return {"paper_count": total}
