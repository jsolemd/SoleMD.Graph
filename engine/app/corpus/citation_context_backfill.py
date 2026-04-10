"""Resumable materialization for the citation-context runtime serving table."""

from __future__ import annotations

import json
from bisect import bisect_right
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path

from app import db

_SELECTION_MODE_HISTORICAL = "historical_citing"
_SELECTION_MODE_TARGETED = "targeted_corpus"

_HISTORICAL_BATCH_COUNTS_SQL = """
SELECT
    COUNT(*)::INT AS citation_edge_count,
    COALESCE(SUM(context_count), 0)::INT AS context_count
FROM solemd.citations
WHERE
    context_count > 0
    AND citing_corpus_id = ANY(%s)
"""

_TARGETED_BATCH_COUNTS_SQL = """
SELECT
    COUNT(*)::INT AS citation_edge_count,
    COALESCE(SUM(context_count), 0)::INT AS context_count
FROM solemd.citations
WHERE
    context_count > 0
    AND (
        citing_corpus_id = ANY(%s)
        OR cited_corpus_id = ANY(%s)
    )
"""

_HISTORICAL_DELETE_BATCH_SQL = """
DELETE FROM solemd.citation_contexts
WHERE citing_corpus_id = ANY(%s)
"""

_TARGETED_DELETE_BATCH_SQL = """
DELETE FROM solemd.citation_contexts
WHERE
    citing_corpus_id = ANY(%s)
    OR cited_corpus_id = ANY(%s)
"""

_INSERT_BATCH_SQL_TEMPLATE = """
INSERT INTO solemd.citation_contexts (
    citing_corpus_id,
    cited_corpus_id,
    context_ordinal,
    citation_id,
    context_text,
    intents,
    is_influential,
    source,
    source_release_id,
    updated_at
)
SELECT
    c.citing_corpus_id,
    c.cited_corpus_id,
    context_items.context_ordinal - 1,
    c.citation_id,
    parsed.context_text,
    COALESCE(c.intents, '[]'::jsonb),
    c.is_influential,
    c.source,
    c.source_release_id,
    now()
FROM solemd.citations c
CROSS JOIN LATERAL jsonb_array_elements(c.contexts)
    WITH ORDINALITY AS context_items(context_item, context_ordinal)
CROSS JOIN LATERAL (
    SELECT
        CASE
            WHEN jsonb_typeof(context_items.context_item) = 'string' THEN
                trim(both '"' from context_items.context_item::text)
            WHEN jsonb_typeof(context_items.context_item) = 'object' THEN
                COALESCE(context_items.context_item ->> 'text', '')
            ELSE ''
        END AS context_text
) AS parsed
WHERE
    {scope_sql}
    AND c.context_count > 0
    AND parsed.context_text <> ''
ON CONFLICT (citing_corpus_id, cited_corpus_id, context_ordinal)
DO UPDATE
SET citation_id = EXCLUDED.citation_id,
    context_text = EXCLUDED.context_text,
    intents = EXCLUDED.intents,
    is_influential = EXCLUDED.is_influential,
    source = EXCLUDED.source,
    source_release_id = EXCLUDED.source_release_id,
    updated_at = now()
"""

_HISTORICAL_INSERT_BATCH_SQL = _INSERT_BATCH_SQL_TEMPLATE.format(
    scope_sql="c.citing_corpus_id = ANY(%s)"
)
_TARGETED_INSERT_BATCH_SQL = _INSERT_BATCH_SQL_TEMPLATE.format(
    scope_sql="(c.citing_corpus_id = ANY(%s) OR c.cited_corpus_id = ANY(%s))"
)


@dataclass(slots=True)
class CitationContextBackfillBatchSummary:
    batch_index: int
    first_corpus_id: int
    last_corpus_id: int
    corpus_id_count: int
    citation_edge_count: int
    context_rows_written: int


@dataclass(slots=True)
class CitationContextBackfillSummary:
    selection_mode: str
    after_corpus_id: int
    last_completed_corpus_id: int | None
    max_corpus_id: int | None
    batch_size: int
    batches_completed: int = 0
    corpus_ids_processed: int = 0
    citation_edges_processed: int = 0
    context_rows_written: int = 0
    completed: bool = False
    dry_run: bool = False
    target_corpus_id_count: int | None = None
    recent_batches: list[CitationContextBackfillBatchSummary] = field(
        default_factory=list
    )

    def append_batch(self, batch: CitationContextBackfillBatchSummary) -> None:
        self.batches_completed += 1
        self.last_completed_corpus_id = batch.last_corpus_id
        self.corpus_ids_processed += batch.corpus_id_count
        self.citation_edges_processed += batch.citation_edge_count
        self.context_rows_written += batch.context_rows_written
        self.recent_batches.append(batch)
        self.recent_batches = self.recent_batches[-20:]


def _load_summary(report_path: Path) -> CitationContextBackfillSummary | None:
    if not report_path.exists():
        return None
    payload = json.loads(report_path.read_text())
    recent_batches = [
        CitationContextBackfillBatchSummary(**batch)
        for batch in payload.pop("recent_batches", [])
    ]
    summary = CitationContextBackfillSummary(**payload)
    summary.recent_batches = recent_batches
    return summary


def _copy_summary(summary: CitationContextBackfillSummary) -> CitationContextBackfillSummary:
    copied = CitationContextBackfillSummary(
        selection_mode=summary.selection_mode,
        after_corpus_id=summary.after_corpus_id,
        last_completed_corpus_id=summary.last_completed_corpus_id,
        max_corpus_id=summary.max_corpus_id,
        batch_size=summary.batch_size,
        batches_completed=summary.batches_completed,
        corpus_ids_processed=summary.corpus_ids_processed,
        citation_edges_processed=summary.citation_edges_processed,
        context_rows_written=summary.context_rows_written,
        completed=summary.completed,
        dry_run=summary.dry_run,
        target_corpus_id_count=summary.target_corpus_id_count,
        recent_batches=[
            CitationContextBackfillBatchSummary(**asdict(batch))
            for batch in summary.recent_batches
        ],
    )
    return copied


def _write_summary(
    report_path: Path | None,
    summary: CitationContextBackfillSummary,
) -> None:
    if report_path is None:
        return
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(
            {
                **asdict(summary),
                "recent_batches": [asdict(batch) for batch in summary.recent_batches],
            },
            indent=2,
            sort_keys=True,
        )
        + "\n"
    )


def _next_historical_corpus_batch(
    cur,
    *,
    after_corpus_id: int,
    max_corpus_id: int | None,
    batch_size: int,
) -> list[int]:
    query = """
        SELECT DISTINCT c.citing_corpus_id
        FROM solemd.citations c
        WHERE
            c.context_count > 0
            AND c.citing_corpus_id > %s
    """
    params: list[int] = [after_corpus_id]
    if max_corpus_id is not None:
        query += "\n            AND c.citing_corpus_id <= %s"
        params.append(max_corpus_id)
    query += """
        ORDER BY c.citing_corpus_id
        LIMIT %s
    """
    params.append(batch_size)
    cur.execute(query, tuple(params))
    return [int(row["citing_corpus_id"]) for row in cur.fetchall()]


def _normalize_target_corpus_ids(corpus_ids: Sequence[int]) -> list[int]:
    return sorted({int(corpus_id) for corpus_id in corpus_ids if int(corpus_id) > 0})


def _next_target_corpus_batch(
    target_corpus_ids: Sequence[int],
    *,
    after_corpus_id: int,
    max_corpus_id: int | None,
    batch_size: int,
) -> list[int]:
    start_index = bisect_right(target_corpus_ids, after_corpus_id)
    batch: list[int] = []
    for corpus_id in target_corpus_ids[start_index:]:
        if max_corpus_id is not None and corpus_id > max_corpus_id:
            break
        batch.append(corpus_id)
        if len(batch) >= batch_size:
            break
    return batch


def _target_refresh_completed(
    target_corpus_ids: Sequence[int],
    *,
    last_completed_corpus_id: int,
    max_corpus_id: int | None,
) -> bool:
    eligible_corpus_ids = [
        corpus_id
        for corpus_id in target_corpus_ids
        if max_corpus_id is None or corpus_id <= max_corpus_id
    ]
    if not eligible_corpus_ids:
        return True
    return last_completed_corpus_id >= eligible_corpus_ids[-1]


def _batch_counts(
    cur,
    *,
    corpus_ids: list[int],
    selection_mode: str,
) -> tuple[int, int]:
    if selection_mode == _SELECTION_MODE_TARGETED:
        cur.execute(_TARGETED_BATCH_COUNTS_SQL, (corpus_ids, corpus_ids))
    else:
        cur.execute(_HISTORICAL_BATCH_COUNTS_SQL, (corpus_ids,))
    row = cur.fetchone()
    return int(row["citation_edge_count"]), int(row["context_count"])


def _refresh_citation_context_batch(
    cur,
    *,
    corpus_ids: list[int],
    selection_mode: str,
) -> int:
    if selection_mode == _SELECTION_MODE_TARGETED:
        cur.execute(_TARGETED_DELETE_BATCH_SQL, (corpus_ids, corpus_ids))
        cur.execute(_TARGETED_INSERT_BATCH_SQL, (corpus_ids, corpus_ids))
    else:
        cur.execute(_HISTORICAL_DELETE_BATCH_SQL, (corpus_ids,))
        cur.execute(_HISTORICAL_INSERT_BATCH_SQL, (corpus_ids,))
    return max(cur.rowcount, 0)


def _run_citation_context_batches(
    *,
    selection_mode: str,
    after_corpus_id: int = 0,
    max_corpus_id: int | None = None,
    batch_size: int = 1000,
    limit_batches: int | None = None,
    report_path: Path | None = None,
    reset_report: bool = False,
    dry_run: bool = False,
    target_corpus_ids: Sequence[int] | None = None,
) -> CitationContextBackfillSummary:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    if limit_batches is not None and limit_batches <= 0:
        raise ValueError("limit_batches must be positive when provided")

    normalized_target_corpus_ids: list[int] = []
    if selection_mode == _SELECTION_MODE_TARGETED:
        normalized_target_corpus_ids = _normalize_target_corpus_ids(
            target_corpus_ids or []
        )
        if not normalized_target_corpus_ids:
            raise ValueError(
                "target_corpus_ids are required for targeted citation refresh"
            )

    summary = CitationContextBackfillSummary(
        selection_mode=selection_mode,
        after_corpus_id=after_corpus_id,
        last_completed_corpus_id=None,
        max_corpus_id=max_corpus_id,
        batch_size=batch_size,
        dry_run=dry_run,
        target_corpus_id_count=(
            len(normalized_target_corpus_ids)
            if selection_mode == _SELECTION_MODE_TARGETED
            else None
        ),
    )
    if report_path is not None and not reset_report:
        existing = _load_summary(report_path)
        if existing is not None:
            if existing.selection_mode != selection_mode:
                raise ValueError(
                    "existing report selection_mode does not match requested mode"
                )
            if dry_run:
                summary = _copy_summary(existing)
            elif not existing.dry_run:
                summary = existing
            summary.after_corpus_id = max(summary.after_corpus_id, after_corpus_id)
            if max_corpus_id is not None:
                summary.max_corpus_id = max_corpus_id
            summary.batch_size = batch_size
            summary.dry_run = dry_run
            if selection_mode == _SELECTION_MODE_TARGETED:
                summary.target_corpus_id_count = len(normalized_target_corpus_ids)

    current_after_corpus_id = max(
        summary.after_corpus_id,
        summary.last_completed_corpus_id or 0,
    )

    batches_run = 0
    while limit_batches is None or batches_run < limit_batches:
        if selection_mode == _SELECTION_MODE_TARGETED:
            corpus_ids = _next_target_corpus_batch(
                normalized_target_corpus_ids,
                after_corpus_id=current_after_corpus_id,
                max_corpus_id=summary.max_corpus_id,
                batch_size=batch_size,
            )
            if not corpus_ids:
                summary.completed = True
                if not dry_run:
                    _write_summary(report_path, summary)
                return summary
            with db.pooled() as conn, conn.cursor() as cur:
                citation_edge_count, _ = _batch_counts(
                    cur,
                    corpus_ids=corpus_ids,
                    selection_mode=selection_mode,
                )
                context_rows_written = 0
                if not dry_run:
                    context_rows_written = _refresh_citation_context_batch(
                        cur,
                        corpus_ids=corpus_ids,
                        selection_mode=selection_mode,
                    )
                    conn.commit()
        else:
            with db.pooled() as conn, conn.cursor() as cur:
                corpus_ids = _next_historical_corpus_batch(
                    cur,
                    after_corpus_id=current_after_corpus_id,
                    max_corpus_id=summary.max_corpus_id,
                    batch_size=batch_size,
                )
                if not corpus_ids:
                    summary.completed = True
                    if not dry_run:
                        _write_summary(report_path, summary)
                    return summary
                citation_edge_count, _ = _batch_counts(
                    cur,
                    corpus_ids=corpus_ids,
                    selection_mode=selection_mode,
                )
                context_rows_written = 0
                if not dry_run:
                    context_rows_written = _refresh_citation_context_batch(
                        cur,
                        corpus_ids=corpus_ids,
                        selection_mode=selection_mode,
                    )
                    conn.commit()

        batches_run += 1
        batch_summary = CitationContextBackfillBatchSummary(
            batch_index=summary.batches_completed + 1,
            first_corpus_id=corpus_ids[0],
            last_corpus_id=corpus_ids[-1],
            corpus_id_count=len(corpus_ids),
            citation_edge_count=citation_edge_count,
            context_rows_written=context_rows_written,
        )
        summary.append_batch(batch_summary)
        current_after_corpus_id = corpus_ids[-1]
        if selection_mode == _SELECTION_MODE_TARGETED:
            summary.completed = _target_refresh_completed(
                normalized_target_corpus_ids,
                last_completed_corpus_id=current_after_corpus_id,
                max_corpus_id=summary.max_corpus_id,
            )
        if not dry_run:
            _write_summary(report_path, summary)

    if not dry_run and summary.batches_completed > 0:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute("ANALYZE solemd.citation_contexts")
            conn.commit()
    if not dry_run:
        _write_summary(report_path, summary)
    return summary


def run_citation_context_backfill(
    *,
    after_corpus_id: int = 0,
    max_corpus_id: int | None = None,
    batch_size: int = 1000,
    limit_batches: int | None = None,
    report_path: Path | None = None,
    reset_report: bool = False,
    dry_run: bool = False,
) -> CitationContextBackfillSummary:
    return _run_citation_context_batches(
        selection_mode=_SELECTION_MODE_HISTORICAL,
        after_corpus_id=after_corpus_id,
        max_corpus_id=max_corpus_id,
        batch_size=batch_size,
        limit_batches=limit_batches,
        report_path=report_path,
        reset_report=reset_report,
        dry_run=dry_run,
    )


def run_citation_context_target_refresh(
    *,
    corpus_ids: Sequence[int],
    after_corpus_id: int = 0,
    max_corpus_id: int | None = None,
    batch_size: int = 1000,
    limit_batches: int | None = None,
    report_path: Path | None = None,
    reset_report: bool = False,
    dry_run: bool = False,
) -> CitationContextBackfillSummary:
    return _run_citation_context_batches(
        selection_mode=_SELECTION_MODE_TARGETED,
        after_corpus_id=after_corpus_id,
        max_corpus_id=max_corpus_id,
        batch_size=batch_size,
        limit_batches=limit_batches,
        report_path=report_path,
        reset_report=reset_report,
        dry_run=dry_run,
        target_corpus_ids=corpus_ids,
    )
