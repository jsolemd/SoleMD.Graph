"""Bounded quality inspection over canonical warehouse rows."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pydantic import Field

from app import db
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.chunk_policy import DEFAULT_HARD_MAX_TOKENS
from app.rag_ingest.chunk_quality import (
    LOW_VALUE_NARRATIVE_TEXTS,
    LOW_VALUE_SINGLE_TOKEN_TEXTS,
    MIN_USEFUL_NARRATIVE_TOKENS,
    is_weak_short_narrative_chunk_text,
)
from app.rag_ingest.corpus_ids import (
    resolve_corpus_ids,
)
from app.rag_ingest.corpus_ids import (
    unique_corpus_ids as _unique_ints,
)
from app.rag_ingest.section_context import (
    looks_like_structural_heading,
    repeated_nonstructural_section_label_counts,
)

_WAREHOUSE_QUALITY_SQL = """
WITH requested AS (
    SELECT UNNEST(%s::BIGINT[]) AS corpus_id
),
document_counts AS (
    SELECT
        corpus_id,
        COUNT(*)::BIGINT AS document_count,
        MAX(title) AS title
    FROM solemd.paper_documents
    WHERE corpus_id = ANY(%s)
    GROUP BY corpus_id
),
section_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS section_count
    FROM solemd.paper_sections
    WHERE corpus_id = ANY(%s)
    GROUP BY corpus_id
),
block_counts AS (
    SELECT
        corpus_id,
        COUNT(*)::BIGINT AS block_count,
        COUNT(*) FILTER (WHERE is_retrieval_default)::BIGINT AS retrieval_default_block_count,
        COUNT(*) FILTER (WHERE section_role = 'front_matter')::BIGINT AS front_matter_block_count,
        COUNT(*) FILTER (WHERE section_role = 'reference')::BIGINT AS reference_block_count,
        COUNT(*) FILTER (
            WHERE block_kind IN (
                'figure_caption',
                'table_caption',
                'table_footnote',
                'table_body_text'
            )
        )::BIGINT AS caption_or_table_block_count,
        COUNT(*) FILTER (WHERE block_kind = 'narrative_paragraph')::BIGINT AS narrative_block_count
    FROM solemd.paper_blocks
    WHERE corpus_id = ANY(%s)
    GROUP BY corpus_id
),
sentence_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS sentence_count
    FROM solemd.paper_sentences
    WHERE corpus_id = ANY(%s)
    GROUP BY corpus_id
),
reference_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS reference_count
    FROM solemd.paper_references
    WHERE corpus_id = ANY(%s)
    GROUP BY corpus_id
),
chunk_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS chunk_count
    FROM solemd.paper_chunks
    WHERE corpus_id = ANY(%s)
      AND (%s::TEXT IS NULL OR chunk_version_key = %s)
    GROUP BY corpus_id
),
chunk_quality_counts AS (
    SELECT
        corpus_id,
        COUNT(*) FILTER (WHERE token_count_estimate > %s)::BIGINT AS oversize_chunk_count,
        COUNT(*) FILTER (
            WHERE primary_block_kind = 'table_body_text'
              AND token_count_estimate > %s
        )::BIGINT AS oversize_table_chunk_count,
        COUNT(*) FILTER (
            WHERE primary_block_kind = 'narrative_paragraph'
              AND token_count_estimate < %s
        )::BIGINT AS tiny_narrative_chunk_count,
        COUNT(*) FILTER (
            WHERE primary_block_kind = 'narrative_paragraph'
              AND token_count_estimate < %s
              AND lower(regexp_replace(trim(text), '[^a-z0-9]+', ' ', 'g')) = ANY(%s::TEXT[])
        )::BIGINT AS low_value_narrative_chunk_count
    FROM solemd.paper_chunks
    WHERE corpus_id = ANY(%s)
      AND (%s::TEXT IS NULL OR chunk_version_key = %s)
    GROUP BY corpus_id
),
chunk_member_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS chunk_member_count
    FROM solemd.paper_chunk_members
    WHERE corpus_id = ANY(%s)
      AND (%s::TEXT IS NULL OR chunk_version_key = %s)
    GROUP BY corpus_id
),
repeated_section_label_counts AS (
    SELECT
        corpus_id,
        COALESCE(MAX(repeat_count), 0)::BIGINT AS max_repeated_nonstructural_section_label_count
    FROM (
        SELECT
            corpus_id,
            regexp_replace(
                lower(trim(coalesce(display_label, text, ''))),
                '[^a-z0-9]+',
                ' ',
                'g'
            ) AS normalized_label,
            COUNT(*)::BIGINT AS repeat_count
        FROM solemd.paper_sections
        WHERE corpus_id = ANY(%s)
          AND trim(coalesce(display_label, text, '')) <> ''
        GROUP BY corpus_id, normalized_label
    ) repeated_labels
    WHERE normalized_label <> ''
      AND normalized_label NOT IN (
          'abstract',
          'background',
          'introduction',
          'intro',
          'materials and methods',
          'materials methods',
          'methods',
          'results',
          'results and discussion',
          'discussion',
          'conclusion',
          'conclusions',
          'supplement',
          'reference',
          'references',
          'acknowledgement',
          'acknowledgements',
          'acknowledgment',
          'acknowledgments',
          'author contribution',
          'author contributions',
          'contributors',
          'contributor',
          'funding',
          'data availability',
          'availability of data',
          'ethics',
          'ethical consideration',
          'ethical considerations',
          'conflict of interest',
          'conflicts of interest',
          'competing interest',
          'competing interests',
          'abbreviation',
          'abbreviations',
          'keyword',
          'keywords',
          'experimental section'
      )
    GROUP BY corpus_id
)
SELECT
    requested.corpus_id,
    COALESCE(document_counts.document_count, 0) AS document_count,
    document_counts.title AS title,
    COALESCE(section_counts.section_count, 0) AS section_count,
    COALESCE(block_counts.block_count, 0) AS block_count,
    COALESCE(block_counts.retrieval_default_block_count, 0) AS retrieval_default_block_count,
    COALESCE(block_counts.front_matter_block_count, 0) AS front_matter_block_count,
    COALESCE(block_counts.reference_block_count, 0) AS reference_block_count,
    COALESCE(block_counts.caption_or_table_block_count, 0) AS caption_or_table_block_count,
    COALESCE(block_counts.narrative_block_count, 0) AS narrative_block_count,
    COALESCE(sentence_counts.sentence_count, 0) AS sentence_count,
    COALESCE(reference_counts.reference_count, 0) AS reference_count,
    COALESCE(chunk_counts.chunk_count, 0) AS chunk_count,
    COALESCE(chunk_quality_counts.oversize_chunk_count, 0) AS oversize_chunk_count,
    COALESCE(chunk_quality_counts.oversize_table_chunk_count, 0) AS oversize_table_chunk_count,
    COALESCE(chunk_quality_counts.tiny_narrative_chunk_count, 0) AS tiny_narrative_chunk_count,
    COALESCE(
        chunk_quality_counts.low_value_narrative_chunk_count,
        0
    ) AS low_value_narrative_chunk_count,
    COALESCE(chunk_member_counts.chunk_member_count, 0) AS chunk_member_count,
    COALESCE(
        repeated_section_label_counts.max_repeated_nonstructural_section_label_count,
        0
    ) AS max_repeated_nonstructural_section_label_count
FROM requested
LEFT JOIN document_counts USING (corpus_id)
LEFT JOIN section_counts USING (corpus_id)
LEFT JOIN block_counts USING (corpus_id)
LEFT JOIN sentence_counts USING (corpus_id)
LEFT JOIN reference_counts USING (corpus_id)
LEFT JOIN chunk_counts USING (corpus_id)
LEFT JOIN chunk_quality_counts USING (corpus_id)
LEFT JOIN chunk_member_counts USING (corpus_id)
LEFT JOIN repeated_section_label_counts USING (corpus_id)
ORDER BY requested.corpus_id
"""

_SECTION_LABEL_ROWS_SQL = """
SELECT
    corpus_id,
    section_ordinal,
    parent_section_ordinal,
    section_role,
    display_label
FROM solemd.paper_sections
WHERE corpus_id = ANY(%s)
ORDER BY corpus_id, section_ordinal
"""

_SHORT_NARRATIVE_CHUNK_ROWS_SQL = """
SELECT
    corpus_id,
    text
FROM solemd.paper_chunks
WHERE corpus_id = ANY(%s)
  AND (%s::TEXT IS NULL OR chunk_version_key = %s)
  AND primary_block_kind = 'narrative_paragraph'
  AND token_count_estimate < %s
ORDER BY corpus_id, chunk_ordinal
"""


@dataclass(frozen=True, slots=True)
class _SectionQualityRow:
    corpus_id: int
    section_ordinal: int
    parent_section_ordinal: int | None
    section_role: str
    display_label: str | None


class RagWarehouseQualityPaperReport(ParseContractModel):
    corpus_id: int
    document_count: int = 0
    title: str | None = None
    section_count: int = 0
    block_count: int = 0
    retrieval_default_block_count: int = 0
    front_matter_block_count: int = 0
    reference_block_count: int = 0
    caption_or_table_block_count: int = 0
    narrative_block_count: int = 0
    sentence_count: int = 0
    reference_count: int = 0
    chunk_count: int = 0
    oversize_chunk_count: int = 0
    oversize_table_chunk_count: int = 0
    tiny_narrative_chunk_count: int = 0
    low_value_narrative_chunk_count: int = 0
    chunk_member_count: int = 0
    max_repeated_nonstructural_section_label_count: int = 0
    flags: list[str] = Field(default_factory=list)


class RagWarehouseQualityReport(ParseContractModel):
    requested_corpus_ids: list[int] = Field(default_factory=list)
    chunk_version_key: str | None = None
    flagged_corpus_ids: list[int] = Field(default_factory=list)
    papers: list[RagWarehouseQualityPaperReport] = Field(default_factory=list)


class WarehouseQualityLoader(Protocol):
    def load_quality_rows(
        self,
        *,
        corpus_ids: list[int],
        chunk_version_key: str | None = None,
    ) -> list[dict[str, object]]: ...


class PostgresWarehouseQualityLoader:
    def __init__(self, connect=None):
        self._connect = connect or db.pooled

    def load_quality_rows(
        self,
        *,
        corpus_ids: list[int],
        chunk_version_key: str | None = None,
    ) -> list[dict[str, object]]:
        normalized_ids = _unique_ints(corpus_ids)
        if not normalized_ids:
            return []
        low_value_narrative_texts = sorted(LOW_VALUE_NARRATIVE_TEXTS | LOW_VALUE_SINGLE_TOKEN_TEXTS)
        with self._connect() as conn, conn.cursor() as cur:
            cur.execute(
                _WAREHOUSE_QUALITY_SQL,
                (
                    normalized_ids,
                    normalized_ids,
                    normalized_ids,
                    normalized_ids,
                    normalized_ids,
                    normalized_ids,
                    normalized_ids,
                    chunk_version_key,
                    chunk_version_key,
                    DEFAULT_HARD_MAX_TOKENS,
                    DEFAULT_HARD_MAX_TOKENS,
                    MIN_USEFUL_NARRATIVE_TOKENS,
                    MIN_USEFUL_NARRATIVE_TOKENS,
                    low_value_narrative_texts,
                    normalized_ids,
                    chunk_version_key,
                    chunk_version_key,
                    normalized_ids,
                    chunk_version_key,
                    chunk_version_key,
                    normalized_ids,
                ),
            )
            rows = [dict(row) for row in cur.fetchall()]
            repeated_label_counts = self._load_repeated_section_label_counts(
                cur,
                corpus_ids=normalized_ids,
            )
            weak_short_narrative_counts = self._load_weak_short_narrative_chunk_counts(
                cur,
                corpus_ids=normalized_ids,
                chunk_version_key=chunk_version_key,
            )
            for row in rows:
                corpus_id = int(row["corpus_id"])
                row["max_repeated_nonstructural_section_label_count"] = (
                    repeated_label_counts.get(corpus_id, 0)
                )
                row["tiny_narrative_chunk_count"] = weak_short_narrative_counts.get(corpus_id, 0)
            return rows

    def _load_repeated_section_label_counts(
        self,
        cur,
        *,
        corpus_ids: list[int],
    ) -> dict[int, int]:
        cur.execute(_SECTION_LABEL_ROWS_SQL, (corpus_ids,))
        sections_by_corpus_id: dict[int, list[_SectionQualityRow]] = {}
        for row in cur.fetchall():
            section = _SectionQualityRow(**dict(row))
            sections_by_corpus_id.setdefault(section.corpus_id, []).append(section)

        counts_by_corpus_id: dict[int, int] = {}
        for corpus_id, sections in sections_by_corpus_id.items():
            repeated_counts = repeated_nonstructural_section_label_counts(sections)
            counts_by_corpus_id[corpus_id] = max(repeated_counts.values(), default=0)
        return counts_by_corpus_id

    def _load_weak_short_narrative_chunk_counts(
        self,
        cur,
        *,
        corpus_ids: list[int],
        chunk_version_key: str | None,
    ) -> dict[int, int]:
        cur.execute(
            _SHORT_NARRATIVE_CHUNK_ROWS_SQL,
            (
                corpus_ids,
                chunk_version_key,
                chunk_version_key,
                MIN_USEFUL_NARRATIVE_TOKENS,
            ),
        )
        counts_by_corpus_id: dict[int, int] = {}
        for row in cur.fetchall():
            corpus_id = int(row["corpus_id"])
            if not is_weak_short_narrative_chunk_text(row["text"]):
                continue
            counts_by_corpus_id[corpus_id] = counts_by_corpus_id.get(corpus_id, 0) + 1
        return counts_by_corpus_id


def _derive_flags(row: dict[str, object]) -> list[str]:
    flags: list[str] = []
    title = (row.get("title") or "").strip()
    if int(row["document_count"]) == 0:
        flags.append("missing_document")
    if int(row["document_count"]) > 0 and not title:
        flags.append("missing_title")
    if int(row["section_count"]) == 0:
        flags.append("no_sections")
    if int(row["block_count"]) == 0:
        flags.append("no_blocks")
    if int(row["sentence_count"]) == 0:
        flags.append("no_sentences")
    if int(row["block_count"]) > 0 and int(row["retrieval_default_block_count"]) == 0:
        flags.append("no_retrieval_default_blocks")
    if int(row["block_count"]) > 0 and int(row["front_matter_block_count"]) == int(
        row["block_count"]
    ):
        flags.append("front_matter_only")
    if int(row["block_count"]) > 0 and int(row["caption_or_table_block_count"]) == int(
        row["block_count"]
    ):
        flags.append("caption_or_table_only")
    if int(row["block_count"]) > 0 and int(row["narrative_block_count"]) == 0:
        flags.append("no_narrative_blocks")
    if int(row["sentence_count"]) > 0 and int(row["chunk_count"]) == 0:
        flags.append("no_chunks")
    if int(row["chunk_count"]) > 0 and int(row["chunk_member_count"]) == 0:
        flags.append("no_chunk_members")
    if int(row["oversize_chunk_count"]) > 0:
        flags.append("oversize_chunks")
    if int(row["oversize_table_chunk_count"]) > 0:
        flags.append("oversize_table_chunks")
    if int(row["tiny_narrative_chunk_count"]) > 0:
        flags.append("tiny_narrative_chunks")
    if int(row["low_value_narrative_chunk_count"]) > 0:
        flags.append("low_value_narrative_chunks")
    if int(row["max_repeated_nonstructural_section_label_count"]) >= 3:
        flags.append("repeated_nonstructural_section_labels")
    if title and looks_like_structural_heading(title):
        flags.append("suspicious_structural_title")
    return flags


def inspect_rag_warehouse_quality(
    *,
    corpus_ids: list[int],
    chunk_version_key: str | None = None,
    loader: WarehouseQualityLoader | None = None,
) -> RagWarehouseQualityReport:
    normalized_ids = _unique_ints(corpus_ids)
    active_loader = loader or PostgresWarehouseQualityLoader()
    papers: list[RagWarehouseQualityPaperReport] = []
    for row in active_loader.load_quality_rows(
        corpus_ids=normalized_ids,
        chunk_version_key=chunk_version_key,
    ):
        paper = RagWarehouseQualityPaperReport(
            **row,
            flags=_derive_flags(row),
        )
        papers.append(paper)
    return RagWarehouseQualityReport(
        requested_corpus_ids=normalized_ids,
        chunk_version_key=chunk_version_key,
        flagged_corpus_ids=[paper.corpus_id for paper in papers if paper.flags],
        papers=papers,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect bounded canonical warehouse quality for selected corpus ids."
    )
    parser.add_argument("--corpus-id", dest="corpus_ids", action="append", type=int, default=None)
    parser.add_argument("--corpus-ids-file", dest="corpus_ids_file", type=Path, default=None)
    parser.add_argument("--chunk-version-key", default=None)
    parser.add_argument("--report-path", type=Path, default=None)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    corpus_ids = resolve_corpus_ids(
        corpus_ids=args.corpus_ids,
        corpus_ids_file=args.corpus_ids_file,
    )
    try:
        report = inspect_rag_warehouse_quality(
            corpus_ids=corpus_ids,
            chunk_version_key=args.chunk_version_key,
        )
        if args.report_path is not None:
            args.report_path.parent.mkdir(parents=True, exist_ok=True)
            args.report_path.write_text(report.model_dump_json(indent=2))
        print(report.model_dump_json(indent=2))
    finally:
        db.close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
