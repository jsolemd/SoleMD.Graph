"""Demand-attachment service for narrow graph point rows."""

from __future__ import annotations

from io import BytesIO
from typing import Protocol

import pyarrow as pa
import pyarrow.ipc as pa_ipc
from pydantic import ConfigDict, Field, field_validator

from app import db
from app.graph.point_projection import POINTS_SCHEMA, build_point_projection_select_sql
from app.rag.parse_contract import ParseContractModel
from app.rag.repository import PostgresRagRepository, RagRepository

GRAPH_POINT_ATTACHMENT_MEDIA_TYPE = "application/vnd.apache.arrow.stream"
GRAPH_POINT_ATTACHMENT_SQL = (
    """
WITH requested_corpus AS (
    SELECT DISTINCT unnest(%s::bigint[])::bigint AS corpus_id
),
requested_points AS (
    SELECT
        g.corpus_id,
        g.point_index,
        g.x,
        g.y,
        g.cluster_id,
        g.cluster_probability,
        COALESCE(bp.corpus_id IS NOT NULL, false) AS is_in_base,
        COALESCE(bp.base_rank, 0)::REAL AS base_rank,
        gc.label AS cluster_label
    FROM solemd.graph_points g
    JOIN requested_corpus rc
      ON rc.corpus_id = g.corpus_id
    LEFT JOIN solemd.graph_base_points bp
      ON bp.graph_run_id = g.graph_run_id
     AND bp.corpus_id = g.corpus_id
    LEFT JOIN solemd.graph_clusters gc
      ON gc.graph_run_id = g.graph_run_id
     AND gc.cluster_id = g.cluster_id
    WHERE g.graph_run_id = %s
),
corpus_base AS (
    SELECT
        c.corpus_id,
        c.pmid
    FROM solemd.corpus c
    JOIN requested_corpus rc
      ON rc.corpus_id = c.corpus_id
),
author_rollup AS (
    SELECT
        pa.corpus_id,
        count(*)::INTEGER AS author_count
    FROM solemd.paper_authors pa
    JOIN requested_corpus rc
      ON rc.corpus_id = pa.corpus_id
    GROUP BY pa.corpus_id
),
entity_rollup AS (
    SELECT
        ranked.corpus_id,
        sum(ranked.hit_count)::INTEGER AS entity_count,
        string_agg(DISTINCT ranked.entity_type, ', ' ORDER BY ranked.entity_type) AS semantic_groups_csv
    FROM (
        SELECT
            cb.corpus_id,
            ea.entity_type,
            count(*)::INTEGER AS hit_count
        FROM corpus_base cb
        JOIN pubtator.entity_annotations ea
          ON ea.pmid = cb.pmid
        GROUP BY cb.corpus_id, ea.entity_type
    ) AS ranked
    GROUP BY ranked.corpus_id
),
relation_rollup AS (
    SELECT
        ranked.corpus_id,
        sum(ranked.hit_count)::INTEGER AS relation_count,
        string_agg(ranked.relation_type, ', ' ORDER BY ranked.hit_count DESC, ranked.relation_type)
            FILTER (WHERE ranked.rank <= 5) AS relation_categories_csv
    FROM (
        SELECT
            cb.corpus_id,
            r.relation_type,
            count(*)::INTEGER AS hit_count,
            row_number() OVER (
                PARTITION BY cb.corpus_id
                ORDER BY count(*) DESC, r.relation_type
            ) AS rank
        FROM corpus_base cb
        JOIN pubtator.relations r
          ON r.pmid = cb.pmid
        GROUP BY cb.corpus_id, r.relation_type
    ) AS ranked
    GROUP BY ranked.corpus_id
),
point_base AS (
    SELECT
        rp.point_index,
        rp.corpus_id,
        rp.x,
        rp.y,
        rp.cluster_id,
        rp.cluster_label,
        rp.cluster_probability,
        rp.is_in_base,
        rp.base_rank,
        p.paper_id,
        p.title,
        COALESCE(p.journal_name, p.venue) AS journal_name,
        p.year,
        p.text_availability,
        COALESCE(ar.author_count, 0) AS author_count,
        COALESCE(p.reference_count, 0) AS reference_count,
        COALESCE(er.entity_count, 0) AS entity_count,
        er.semantic_groups_csv,
        COALESCE(rr.relation_count, 0) AS relation_count,
        rr.relation_categories_csv
    FROM requested_points rp
    JOIN solemd.papers p
      ON p.corpus_id = rp.corpus_id
    LEFT JOIN author_rollup ar
      ON ar.corpus_id = rp.corpus_id
    LEFT JOIN entity_rollup er
      ON er.corpus_id = rp.corpus_id
    LEFT JOIN relation_rollup rr
      ON rr.corpus_id = rp.corpus_id
)
"""
    + build_point_projection_select_sql(
        "point_base",
        where="TRUE",
        order_by="point_index",
    )
)


class GraphPointAttachmentRequest(ParseContractModel):
    model_config = ConfigDict(extra="forbid")

    graph_release_id: str
    graph_paper_refs: list[str] = Field(default_factory=list)

    @field_validator("graph_release_id")
    @classmethod
    def validate_graph_release_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("graph_release_id must not be empty")
        return stripped

    @field_validator("graph_paper_refs", mode="before")
    @classmethod
    def normalize_graph_paper_refs(cls, value: list[str] | None) -> list[str]:
        if value is None:
            return []
        return value

    @field_validator("graph_paper_refs")
    @classmethod
    def validate_graph_paper_refs(cls, value: list[str]) -> list[str]:
        normalized = list(dict.fromkeys(ref.strip() for ref in value if ref and ref.strip()))
        if len(normalized) > 1000:
            raise ValueError("graph_paper_refs must not contain more than 1000 items")
        return normalized


class GraphPointAttachmentRepository(Protocol):
    def resolve_graph_release(self, graph_release_id: str): ...

    def resolve_scope_corpus_ids(
        self,
        *,
        graph_run_id: str,
        graph_paper_refs: list[str],
    ) -> list[int]: ...


class GraphPointAttachmentService:
    """Resolve graph paper refs into Arrow IPC point rows for browser attachment."""

    def __init__(
        self,
        *,
        repository: GraphPointAttachmentRepository | None = None,
    ) -> None:
        self._repository = repository or PostgresRagRepository()

    def attach_points(self, request: GraphPointAttachmentRequest) -> bytes:
        release = self._repository.resolve_graph_release(request.graph_release_id)
        corpus_ids = self._repository.resolve_scope_corpus_ids(
            graph_run_id=release.graph_run_id,
            graph_paper_refs=request.graph_paper_refs,
        )
        if not corpus_ids:
            return encode_point_rows_arrow_ipc([])
        rows = self._fetch_point_rows(
            graph_run_id=release.graph_run_id,
            corpus_ids=corpus_ids,
        )
        return encode_point_rows_arrow_ipc(rows)

    def _fetch_point_rows(
        self,
        *,
        graph_run_id: str,
        corpus_ids: list[int],
    ) -> list[dict[str, object]]:
        if not corpus_ids:
            return []

        with db.pooled() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    GRAPH_POINT_ATTACHMENT_SQL,
                    (corpus_ids, graph_run_id),
                )
                rows = cur.fetchall()

        return [dict(row) for row in rows]


def encode_point_rows_arrow_ipc(rows: list[dict[str, object]]) -> bytes:
    table = pa.Table.from_pylist(rows, schema=POINTS_SCHEMA)
    sink = BytesIO()
    with pa_ipc.new_stream(sink, POINTS_SCHEMA) as writer:
        writer.write_table(table)
    return sink.getvalue()


_graph_point_attachment_service: GraphPointAttachmentService | None = None


def get_graph_point_attachment_service() -> GraphPointAttachmentService:
    global _graph_point_attachment_service
    if _graph_point_attachment_service is None:
        _graph_point_attachment_service = GraphPointAttachmentService()
    return _graph_point_attachment_service
