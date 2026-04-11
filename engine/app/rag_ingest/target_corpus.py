"""Shared target-corpus metadata loading and parsed-source metadata application."""

from __future__ import annotations

from app import db
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.source_parsers import ParsedPaperSource


class RagTargetCorpusRow(ParseContractModel):
    corpus_id: int
    pmid: int | None = None
    pmc_id: str | None = None
    doi: str | None = None
    paper_title: str | None = None
    paper_abstract: str | None = None
    paper_id: str | None = None
    text_availability: str | None = None


_TARGET_CORPUS_SQL = """
SELECT
    c.corpus_id,
    c.pmid,
    c.pmc_id,
    c.doi,
    p.title AS paper_title,
    p.abstract AS paper_abstract,
    p.paper_id,
    p.text_availability
FROM solemd.corpus c
LEFT JOIN solemd.papers p ON p.corpus_id = c.corpus_id
{where_clause}
ORDER BY c.corpus_id
{limit_clause}
"""


class PostgresTargetCorpusLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load(
        self,
        *,
        corpus_ids: list[int] | None,
        limit: int | None,
    ) -> list[RagTargetCorpusRow]:
        where_clause = ""
        params: list[object] = []
        if corpus_ids:
            where_clause = "WHERE c.corpus_id = ANY(%s)"
            params.append(corpus_ids)
        limit_clause = ""
        if limit is not None and limit > 0:
            limit_clause = "LIMIT %s"
            params.append(limit)
        sql = _TARGET_CORPUS_SQL.format(
            where_clause=where_clause,
            limit_clause=limit_clause,
        )
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            return [RagTargetCorpusRow.model_validate(row) for row in cur.fetchall()]


def has_paper_abstract(target_row: RagTargetCorpusRow | None) -> bool:
    return bool((target_row.paper_abstract or "").strip())


def target_row_by_corpus_id(
    target_rows: list[RagTargetCorpusRow],
) -> dict[int, RagTargetCorpusRow]:
    return {
        int(target_row.corpus_id): target_row
        for target_row in target_rows
    }


def apply_target_metadata_to_parsed_source(
    *,
    parsed: ParsedPaperSource,
    target_row: RagTargetCorpusRow | None,
) -> ParsedPaperSource:
    if target_row is None:
        return parsed
    metadata_title = (target_row.paper_title or "").strip()
    if not metadata_title:
        return parsed
    current_title = (parsed.document.title or "").strip()
    if current_title == metadata_title:
        return parsed
    if current_title:
        parsed.document.raw_attrs_json.setdefault("source_selected_title", current_title)
    parsed.document.raw_attrs_json["corpus_metadata_title"] = metadata_title
    parsed.document.title = metadata_title
    return parsed
