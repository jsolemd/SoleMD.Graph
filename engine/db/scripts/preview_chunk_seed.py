"""One-off preview helpers for seeding the canonical default chunk version."""

from __future__ import annotations

from collections.abc import Sequence

from pydantic import Field

from app.rag.parse_contract import ParseContractModel
from app.rag.serving_contract import PaperChunkVersionRecord
from app.rag_ingest.chunk_policy import (
    DEFAULT_CHUNK_VERSION_KEY,
    build_default_chunk_version,
)


class ChunkVersionSeedPreview(ParseContractModel):
    chunk_version_key: str
    source_revision_keys: list[str] = Field(default_factory=list)
    sql: str


def build_default_chunk_version_seed_preview(
    *,
    source_revision_keys: Sequence[str],
    parser_version: str,
    embedding_model: str | None = None,
    chunk_version_key: str | None = None,
) -> ChunkVersionSeedPreview:
    version = build_default_chunk_version(
        source_revision_keys=source_revision_keys,
        parser_version=parser_version,
        embedding_model=embedding_model,
        chunk_version_key=chunk_version_key or DEFAULT_CHUNK_VERSION_KEY,
    )
    return ChunkVersionSeedPreview(
        chunk_version_key=version.chunk_version_key,
        source_revision_keys=list(version.source_revision_keys),
        sql=_build_upsert_sql(version),
    )


def _build_upsert_sql(version: PaperChunkVersionRecord) -> str:
    columns = [
        "chunk_version_key",
        "source_revision_keys",
        "parser_version",
        "text_normalization_version",
        "sentence_source_policy",
        "included_section_roles",
        "included_block_kinds",
        "caption_merge_policy",
        "tokenizer_name",
        "tokenizer_version",
        "target_token_budget",
        "hard_max_tokens",
        "sentence_overlap_policy",
        "embedding_model",
        "lexical_normalization_flags",
        "retrieval_default_only",
    ]
    values = [
        _sql_literal(version.chunk_version_key),
        _sql_text_array(version.source_revision_keys),
        _sql_literal(version.parser_version),
        _sql_literal(version.text_normalization_version),
        _sql_text_array(version.sentence_source_policy),
        _sql_text_array(version.included_section_roles),
        _sql_text_array(version.included_block_kinds),
        _sql_literal(version.caption_merge_policy),
        _sql_literal(version.tokenizer_name),
        _sql_literal(version.tokenizer_version),
        str(version.target_token_budget),
        str(version.hard_max_tokens),
        _sql_literal(version.sentence_overlap_policy),
        _sql_literal(version.embedding_model),
        _sql_text_array(version.lexical_normalization_flags),
        "TRUE" if version.retrieval_default_only else "FALSE",
    ]
    update_columns = [
        "source_revision_keys",
        "parser_version",
        "text_normalization_version",
        "sentence_source_policy",
        "included_section_roles",
        "included_block_kinds",
        "caption_merge_policy",
        "tokenizer_name",
        "tokenizer_version",
        "target_token_budget",
        "hard_max_tokens",
        "sentence_overlap_policy",
        "embedding_model",
        "lexical_normalization_flags",
        "retrieval_default_only",
        "updated_at",
    ]
    update_sql = ",\n    ".join(
        [f"{column} = EXCLUDED.{column}" for column in update_columns[:-1]] + ["updated_at = now()"]
    )
    return (
        "INSERT INTO solemd.paper_chunk_versions (\n    "
        + ",\n    ".join(columns)
        + "\n)\nVALUES (\n    "
        + ",\n    ".join(values)
        + "\n)\nON CONFLICT (chunk_version_key) DO UPDATE SET\n    "
        + update_sql
    )


def _sql_literal(value: object | None) -> str:
    if value is None:
        return "NULL"
    if hasattr(value, "value"):
        value = getattr(value, "value")
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    raise TypeError(f"unsupported SQL literal value: {value!r}")


def _sql_text_array(values: Sequence[object]) -> str:
    rendered = ", ".join(_sql_literal(value) for value in values)
    return f"ARRAY[{rendered}]::TEXT[]"
