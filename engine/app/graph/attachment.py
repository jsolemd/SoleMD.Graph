"""Demand-attachment service for narrow graph point rows."""

from __future__ import annotations

from io import BytesIO
from typing import Protocol

import pyarrow as pa
import pyarrow.ipc as pa_ipc
from pydantic import ConfigDict, Field, field_validator

from app import db
from app.graph.point_projection import POINTS_SCHEMA, build_point_projection_select_sql
from app.graph.repository import PostgresGraphRepository
from app.langfuse_config import (
    SPAN_GRAPH_ATTACHMENT,
    observe,
)
from app.langfuse_config import (
    get_langfuse as _get_langfuse,
)
from app.rag.parse_contract import ParseContractModel

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
        gps.paper_id,
        gps.title,
        gps.journal_name,
        gps.year,
        gps.text_availability,
        gps.author_count,
        gps.reference_count,
        gps.entity_count,
        gps.semantic_groups_csv,
        gps.relation_count,
        gps.relation_categories_csv
    FROM requested_points rp
    JOIN solemd.graph_paper_summary gps
      ON gps.corpus_id = rp.corpus_id
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
        self._repository = repository or PostgresGraphRepository()

    @observe(name=SPAN_GRAPH_ATTACHMENT)
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

        try:
            client = _get_langfuse()
            if client is not None:
                client.update_current_span(
                    output={
                        "point_count": len(rows),
                        "corpus_id_count": len(corpus_ids),
                    },
                )
        except Exception:
            pass

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
