from __future__ import annotations

from collections.abc import Sequence
import re
from typing import Any

import asyncpg

from app.ingest.writers.base import copy_records


_PAPER_DOCUMENT_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "document_source_kind",
    "source_priority",
    "source_revision",
    "text_hash",
    "is_active",
)

_PAPER_SECTION_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "section_ordinal",
    "parent_section_ordinal",
    "section_role",
    "numbering_token",
    "display_label",
)

_PAPER_BLOCK_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "block_ordinal",
    "section_ordinal",
    "start_offset",
    "end_offset",
    "block_kind",
    "section_role",
    "is_retrieval_default",
    "linked_asset_ref",
    "text",
)

_PAPER_SENTENCE_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "block_ordinal",
    "sentence_ordinal",
    "section_ordinal",
    "start_offset",
    "end_offset",
    "segmentation_source",
    "text",
)


def fallback_sentence_spans(text: str, absolute_start: int) -> list[dict[str, int]]:
    spans: list[dict[str, int]] = []
    for match in re.finditer(r"[^.!?]+[.!?]?", text, flags=re.MULTILINE):
        sentence = match.group(0).strip()
        if not sentence:
            continue
        spans.append(
            {
                "start": absolute_start + match.start(),
                "end": absolute_start + match.end(),
            }
        )
    if not spans and text.strip():
        spans.append({"start": absolute_start, "end": absolute_start + len(text)})
    return spans


async def replace_document_spines(
    connection: asyncpg.Connection,
    documents: Sequence[dict[str, Any]],
    *,
    source_revision: str,
    skip_delete: bool = False,
) -> int:
    if not documents:
        return 0

    corpus_ids = list(dict.fromkeys(int(document["corpus_id"]) for document in documents))
    if not skip_delete:
        await connection.execute(
            """
            WITH corpus_targets AS (
                SELECT unnest($1::bigint[]) AS corpus_id
            ),
            deleted_sentences AS (
                DELETE FROM solemd.paper_sentences
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            ),
            deleted_blocks AS (
                DELETE FROM solemd.paper_blocks
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            ),
            deleted_sections AS (
                DELETE FROM solemd.paper_sections
                WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            )
            DELETE FROM solemd.paper_documents
            WHERE corpus_id IN (SELECT corpus_id FROM corpus_targets)
            """,
            corpus_ids,
        )

    document_rows: list[tuple] = []
    section_rows: list[tuple] = []
    block_rows: list[tuple] = []
    sentence_rows: list[tuple] = []

    for document in documents:
        corpus_id = int(document["corpus_id"])
        document_rows.append(
            (
                corpus_id,
                document["document_source_kind"],
                document["source_priority"],
                source_revision,
                document["text_hash"],
                True,
            )
        )
        for section in document["sections"]:
            section_rows.append(
                (
                    corpus_id,
                    section["section_ordinal"],
                    section["parent_section_ordinal"],
                    section["section_role"],
                    section["numbering_token"],
                    section["display_label"],
                )
            )
        for block in document["blocks"]:
            block_rows.append(
                (
                    corpus_id,
                    block["block_ordinal"],
                    block["section_ordinal"],
                    block["start_offset"],
                    block["end_offset"],
                    block["block_kind"],
                    block["section_role"],
                    block["is_retrieval_default"],
                    block["linked_asset_ref"],
                    block["text"],
                )
            )
        for sentence in document["sentences"]:
            sentence_rows.append(
                (
                    corpus_id,
                    sentence["block_ordinal"],
                    sentence["sentence_ordinal"],
                    sentence["section_ordinal"],
                    sentence["start_offset"],
                    sentence["end_offset"],
                    sentence["segmentation_source"],
                    sentence["text"],
                )
            )

    await copy_records(
        connection,
        table_name="paper_documents",
        schema_name="solemd",
        columns=_PAPER_DOCUMENT_COLUMNS,
        records=document_rows,
    )
    if section_rows:
        await copy_records(
            connection,
            table_name="paper_sections",
            schema_name="solemd",
            columns=_PAPER_SECTION_COLUMNS,
            records=section_rows,
        )
    if block_rows:
        await copy_records(
            connection,
            table_name="paper_blocks",
            schema_name="solemd",
            columns=_PAPER_BLOCK_COLUMNS,
            records=block_rows,
        )
    if sentence_rows:
        await copy_records(
            connection,
            table_name="paper_sentences",
            schema_name="solemd",
            columns=_PAPER_SENTENCE_COLUMNS,
            records=sentence_rows,
        )
    return len(document_rows)
