"""Runtime gate for chunk-backed grounded answers."""

from __future__ import annotations

from collections.abc import Sequence

from pydantic import Field

from app import db
from app.rag.chunk_grounding import fetch_chunk_grounding_rows
from app.rag.parse_contract import ParseContractModel
from app.rag.serving_contract import GroundedAnswerRecord
from app.rag.warehouse_grounding import build_grounded_answer_from_warehouse_rows
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY

_RUNTIME_TABLES_SQL = """
SELECT
    to_regclass('solemd.paper_chunk_versions') IS NOT NULL AS has_chunk_versions,
    to_regclass('solemd.paper_chunks') IS NOT NULL AS has_chunks,
    to_regclass('solemd.paper_chunk_members') IS NOT NULL AS has_chunk_members,
    to_regclass('solemd.paper_citation_mentions') IS NOT NULL AS has_citation_mentions,
    to_regclass('solemd.paper_entity_mentions') IS NOT NULL AS has_entity_mentions
"""

_RUNTIME_BACKFILL_SQL = """
WITH requested(corpus_id) AS (
    SELECT DISTINCT unnest(%s::BIGINT[])
),
covered AS (
    SELECT r.corpus_id
    FROM requested r
    WHERE EXISTS (
        SELECT 1
        FROM solemd.paper_chunks c
        WHERE c.chunk_version_key = %s
          AND c.corpus_id = r.corpus_id
    )
      AND EXISTS (
        SELECT 1
        FROM solemd.paper_chunk_members m
        WHERE m.chunk_version_key = %s
          AND m.corpus_id = r.corpus_id
    )
)
SELECT
    EXISTS (
        SELECT 1
        FROM solemd.paper_chunk_versions v
        WHERE v.chunk_version_key = %s
    ) AS has_chunk_version,
    COALESCE(ARRAY(
        SELECT corpus_id
        FROM covered
        ORDER BY corpus_id
    ), ARRAY[]::BIGINT[]) AS covered_corpus_ids,
    COALESCE(ARRAY(
        SELECT corpus_id
        FROM requested
        EXCEPT
        SELECT corpus_id
        FROM covered
        ORDER BY corpus_id
    ), ARRAY[]::BIGINT[]) AS missing_corpus_ids
"""


class GroundedAnswerRuntimeStatus(ParseContractModel):
    enabled: bool
    chunk_version_key: str
    missing_tables: list[str] = Field(default_factory=list)
    has_chunk_version: bool = False
    covered_corpus_ids: list[int] = Field(default_factory=list)
    missing_corpus_ids: list[int] = Field(default_factory=list)


def _normalize_corpus_ids(corpus_ids: Sequence[int]) -> list[int]:
    return list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))


def get_grounded_answer_runtime_status(
    *,
    corpus_ids: Sequence[int],
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
) -> GroundedAnswerRuntimeStatus:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return GroundedAnswerRuntimeStatus(
            enabled=False,
            chunk_version_key=chunk_version_key,
        )

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        return _get_runtime_status_with_cursor(
            cursor=cur,
            corpus_ids=normalized_corpus_ids,
            chunk_version_key=chunk_version_key,
        )


def _get_runtime_status_with_cursor(
    *,
    cursor,
    corpus_ids: Sequence[int],
    chunk_version_key: str,
) -> GroundedAnswerRuntimeStatus:
    cursor.execute(_RUNTIME_TABLES_SQL)
    table_row = cursor.fetchone() or {}
    missing_tables = [
        table_name
        for table_name, column_name in (
            ("paper_chunk_versions", "has_chunk_versions"),
            ("paper_chunks", "has_chunks"),
            ("paper_chunk_members", "has_chunk_members"),
            ("paper_citation_mentions", "has_citation_mentions"),
            ("paper_entity_mentions", "has_entity_mentions"),
        )
        if not bool(table_row.get(column_name))
    ]
    if missing_tables:
        return GroundedAnswerRuntimeStatus(
            enabled=False,
            chunk_version_key=chunk_version_key,
            missing_tables=missing_tables,
        )

    cursor.execute(
        _RUNTIME_BACKFILL_SQL,
        (
            list(corpus_ids),
            chunk_version_key,
            chunk_version_key,
            chunk_version_key,
        ),
    )
    backfill_row = cursor.fetchone() or {}
    has_chunk_version = bool(backfill_row.get("has_chunk_version"))
    covered_corpus_ids = [
        int(corpus_id) for corpus_id in backfill_row.get("covered_corpus_ids") or []
    ]
    missing_corpus_ids = [
        int(corpus_id) for corpus_id in backfill_row.get("missing_corpus_ids") or []
    ]
    return GroundedAnswerRuntimeStatus(
        enabled=has_chunk_version and not missing_corpus_ids,
        chunk_version_key=chunk_version_key,
        has_chunk_version=has_chunk_version,
        covered_corpus_ids=covered_corpus_ids,
        missing_corpus_ids=missing_corpus_ids,
    )


def build_grounded_answer_from_runtime(
    *,
    corpus_ids: Sequence[int],
    segment_texts: Sequence[str],
    segment_corpus_ids: Sequence[int | None] | None = None,
    limit_per_paper: int = 1,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
) -> GroundedAnswerRecord | None:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    if not normalized_corpus_ids:
        return None

    connect_fn = connect or db.pooled
    with connect_fn() as conn, conn.cursor() as cur:
        runtime_status = _get_runtime_status_with_cursor(
            cursor=cur,
            corpus_ids=normalized_corpus_ids,
            chunk_version_key=chunk_version_key,
        )
        if runtime_status.missing_tables or not runtime_status.has_chunk_version:
            return None
        if not runtime_status.covered_corpus_ids:
            return None
        citation_rows, entity_rows = fetch_chunk_grounding_rows(
            corpus_ids=runtime_status.covered_corpus_ids,
            cursor=cur,
            chunk_version_key=chunk_version_key,
            limit_per_paper=limit_per_paper,
        )

    return build_grounded_answer_from_warehouse_rows(
        citation_rows=citation_rows,
        entity_rows=entity_rows,
        segment_texts=segment_texts,
        segment_corpus_ids=segment_corpus_ids,
        corpus_order=runtime_status.covered_corpus_ids,
    )
