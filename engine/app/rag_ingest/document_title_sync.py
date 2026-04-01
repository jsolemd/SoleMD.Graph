"""Synchronize warehouse document titles from canonical paper metadata."""

from __future__ import annotations

from pydantic import Field

from app import db
from app.rag.parse_contract import ParseContractModel


class RagDocumentTitleMismatch(ParseContractModel):
    corpus_id: int
    warehouse_title: str | None = None
    canonical_title: str


class RagDocumentTitleSyncReport(ParseContractModel):
    requested_corpus_ids: list[int] = Field(default_factory=list)
    mismatches_before: list[RagDocumentTitleMismatch] = Field(default_factory=list)
    updated_corpus_ids: list[int] = Field(default_factory=list)
    remaining_mismatches: list[RagDocumentTitleMismatch] = Field(default_factory=list)

    @property
    def mismatched_before_count(self) -> int:
        return len(self.mismatches_before)

    @property
    def updated_count(self) -> int:
        return len(self.updated_corpus_ids)

    @property
    def remaining_mismatch_count(self) -> int:
        return len(self.remaining_mismatches)


def _normalized_corpus_ids(corpus_ids: list[int] | None) -> list[int]:
    return list(dict.fromkeys(int(corpus_id) for corpus_id in (corpus_ids or [])))


def _select_title_mismatches(*, corpus_ids: list[int], connect=None) -> list[RagDocumentTitleMismatch]:
    scope_clause = ""
    params: list[object] = []
    if corpus_ids:
        scope_clause = "AND d.corpus_id = ANY(%s)"
        params.append(corpus_ids)
    sql = f"""
        SELECT
            d.corpus_id,
            d.title AS warehouse_title,
            p.title AS canonical_title
        FROM solemd.paper_documents d
        JOIN solemd.papers p ON p.corpus_id = d.corpus_id
        WHERE p.title IS NOT NULL
          AND NULLIF(btrim(p.title), '') IS NOT NULL
          {scope_clause}
          AND d.title IS DISTINCT FROM p.title
        ORDER BY d.corpus_id
    """
    active_connect = connect or db.pooled
    with active_connect() as conn, conn.cursor() as cur:
        cur.execute(sql, tuple(params))
        return [
            RagDocumentTitleMismatch.model_validate(row)
            for row in cur.fetchall()
        ]


def sync_rag_document_titles(
    *,
    corpus_ids: list[int] | None = None,
    connect=None,
) -> RagDocumentTitleSyncReport:
    normalized_corpus_ids = _normalized_corpus_ids(corpus_ids)
    active_connect = connect or db.pooled
    mismatches_before = _select_title_mismatches(
        corpus_ids=normalized_corpus_ids,
        connect=active_connect,
    )
    updated_corpus_ids: list[int] = []
    if mismatches_before:
        scope_clause = ""
        params: list[object] = []
        if normalized_corpus_ids:
            scope_clause = "AND d.corpus_id = ANY(%s)"
            params.append(normalized_corpus_ids)
        sql = f"""
            UPDATE solemd.paper_documents d
            SET title = p.title
            FROM solemd.papers p
            WHERE p.corpus_id = d.corpus_id
              AND p.title IS NOT NULL
              AND NULLIF(btrim(p.title), '') IS NOT NULL
              {scope_clause}
              AND d.title IS DISTINCT FROM p.title
            RETURNING d.corpus_id
        """
        with active_connect() as conn, conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            updated_corpus_ids = [
                int(row["corpus_id"])
                for row in cur.fetchall()
            ]
        updated_corpus_ids.sort()
    remaining_mismatches = _select_title_mismatches(
        corpus_ids=normalized_corpus_ids,
        connect=active_connect,
    )
    return RagDocumentTitleSyncReport(
        requested_corpus_ids=normalized_corpus_ids,
        mismatches_before=mismatches_before,
        updated_corpus_ids=updated_corpus_ids,
        remaining_mismatches=remaining_mismatches,
    )
