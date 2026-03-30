"""DDL preview generation for deferred RAG warehouse migrations."""

from __future__ import annotations

from enum import StrEnum
from types import UnionType
from typing import Any, get_args, get_origin

from pydantic import Field
from pydantic_core import PydanticUndefined

from app.rag.index_contract import IndexBuildPhase, RagIndexSpec, build_index_matrix
from app.rag.migration_contract import MigrationStage, build_rag_migration_bundles
from app.rag.parse_contract import ParseContractModel
from app.rag.rag_schema_contract import (
    IndexKind,
    PaperBlockRow,
    PaperDocumentRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSectionRow,
    PaperSentenceRow,
    PartitionKind,
    WarehouseIndexSpec,
    WarehouseTableSpec,
    build_warehouse_table_specs,
)
from app.rag.serving_contract import (
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
)
from app.rag.warehouse_contract import PaperCitationMentionRow, PaperEntityMentionRow


class DdlStatementKind(StrEnum):
    CREATE_TABLE = "create_table"
    CREATE_INDEX = "create_index"


class DdlStatementPreview(ParseContractModel):
    kind: DdlStatementKind
    identifier: str
    sql: str
    execution_note: str | None = None


class MigrationStageSqlPreview(ParseContractModel):
    stage: MigrationStage
    statements: list[DdlStatementPreview] = Field(default_factory=list)


_ROW_MODEL_BY_NAME = {
    "PaperDocumentRow": PaperDocumentRow,
    "PaperDocumentSourceRow": PaperDocumentSourceRow,
    "PaperSectionRow": PaperSectionRow,
    "PaperBlockRow": PaperBlockRow,
    "PaperSentenceRow": PaperSentenceRow,
    "PaperReferenceEntryRow": PaperReferenceEntryRow,
    "PaperCitationMentionRow": PaperCitationMentionRow,
    "PaperEntityMentionRow": PaperEntityMentionRow,
    "PaperChunkVersionRecord": PaperChunkVersionRecord,
    "PaperChunkRecord": PaperChunkRecord,
    "PaperChunkMemberRecord": PaperChunkMemberRecord,
}


def _unwrap_optional(annotation: Any) -> tuple[Any, bool]:
    origin = get_origin(annotation)
    if origin not in (UnionType, getattr(__import__("typing"), "Union")):
        return annotation, False

    members = [member for member in get_args(annotation) if member is not type(None)]
    if len(members) != 1:
        raise TypeError(f"unsupported union annotation: {annotation!r}")
    return members[0], True


def _is_str_enum(annotation: Any) -> bool:
    return isinstance(annotation, type) and issubclass(annotation, StrEnum)


def _sql_type_for_annotation(annotation: Any) -> str:
    base_annotation, _ = _unwrap_optional(annotation)
    origin = get_origin(base_annotation)

    if origin is list:
        item_type = get_args(base_annotation)[0]
        item_base, _ = _unwrap_optional(item_type)
        if item_base is int:
            return "BIGINT[]"
        if item_base is float:
            return "DOUBLE PRECISION[]"
        if item_base is bool:
            return "BOOLEAN[]"
        if item_base is str or _is_str_enum(item_base):
            return "TEXT[]"
        return "JSONB"

    if origin is dict:
        return "JSONB"

    if base_annotation is int:
        return "BIGINT"
    if base_annotation is float:
        return "DOUBLE PRECISION"
    if base_annotation is bool:
        return "BOOLEAN"
    if base_annotation is str or _is_str_enum(base_annotation):
        return "TEXT"

    raise TypeError(f"unsupported schema annotation: {annotation!r}")


def _sql_literal(value: Any, sql_type: str) -> str:
    if isinstance(value, StrEnum):
        value = value.value
    if isinstance(value, str):
        escaped_value = value.replace("'", "''")
        return f"'{escaped_value}'"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    if value is None:
        return "NULL"
    raise TypeError(f"unsupported SQL literal value: {value!r}")


def _default_sql(field_info: Any, sql_type: str) -> str | None:
    if field_info.default_factory is dict:
        return "DEFAULT '{}'::jsonb"
    if field_info.default_factory is list:
        return f"DEFAULT ARRAY[]::{sql_type}"

    if field_info.default is PydanticUndefined or field_info.default is None:
        return None

    return f"DEFAULT {_sql_literal(field_info.default, sql_type)}"


def _column_sql(column_name: str, field_info: Any) -> str:
    sql_type = _sql_type_for_annotation(field_info.annotation)
    _, is_optional = _unwrap_optional(field_info.annotation)
    column_parts = [column_name, sql_type]
    if not is_optional:
        column_parts.append("NOT NULL")
    default_sql = _default_sql(field_info, sql_type)
    if default_sql:
        column_parts.append(default_sql)
    return " ".join(column_parts)


def _render_index_columns(index_columns: tuple[str, ...]) -> str:
    return ", ".join(index_columns)


def _render_index_sql(
    *,
    table_name: str,
    index_name: str,
    method: str,
    key_sql: str,
    unique: bool = False,
    include_columns: tuple[str, ...] = (),
    where_sql: str | None = None,
    concurrent_if_live: bool = False,
    partitioned_parent: bool = False,
) -> DdlStatementPreview:
    unique_sql = "UNIQUE " if unique else ""
    if concurrent_if_live and not partitioned_parent:
        create_prefix = "CREATE " + unique_sql + "INDEX CONCURRENTLY IF NOT EXISTS"
    else:
        create_prefix = "CREATE " + unique_sql + "INDEX IF NOT EXISTS"

    table_target = f"ONLY solemd.{table_name}" if partitioned_parent and concurrent_if_live else f"solemd.{table_name}"
    sql = f"{create_prefix} {index_name} ON {table_target} USING {method} ({key_sql})"
    if include_columns:
        sql += f" INCLUDE ({', '.join(include_columns)})"
    if where_sql:
        sql += f" WHERE {where_sql}"

    execution_note = None
    if partitioned_parent and concurrent_if_live:
        execution_note = (
            "Partitioned post-load index preview: create the parent index ON ONLY, "
            "then create matching child indexes concurrently on each partition and "
            "attach them before treating the parent index as fully ready."
        )
    return DdlStatementPreview(
        kind=DdlStatementKind.CREATE_INDEX,
        identifier=index_name,
        sql=sql,
        execution_note=execution_note,
    )


def _table_statement_preview(table_spec: WarehouseTableSpec) -> DdlStatementPreview:
    row_model = _ROW_MODEL_BY_NAME[table_spec.row_model_name]
    column_sql = [
        _column_sql(column_name, field_info)
        for column_name, field_info in row_model.model_fields.items()
    ]
    column_sql.append(f"PRIMARY KEY ({', '.join(table_spec.primary_key)})")
    create_sql = (
        f"CREATE TABLE IF NOT EXISTS solemd.{table_spec.table_name} (\n    "
        + ",\n    ".join(column_sql)
        + "\n)"
    )
    if table_spec.partition_kind == PartitionKind.HASH:
        create_sql += f" PARTITION BY HASH ({', '.join(table_spec.partition_key)})"
    return DdlStatementPreview(
        kind=DdlStatementKind.CREATE_TABLE,
        identifier=table_spec.table_name,
        sql=create_sql,
    )


def _initial_index_previews(table_spec: WarehouseTableSpec) -> list[DdlStatementPreview]:
    partitioned_parent = table_spec.partition_kind != PartitionKind.NONE
    previews: list[DdlStatementPreview] = []
    for index_spec in table_spec.indexes:
        previews.append(
            _render_index_sql(
                table_name=table_spec.table_name,
                index_name=index_spec.name,
                method=index_spec.kind.value,
                key_sql=_render_index_columns(index_spec.columns),
                unique=index_spec.unique,
                include_columns=index_spec.include_columns,
                where_sql=index_spec.where_sql,
                partitioned_parent=partitioned_parent,
            )
        )
    return previews


def _secondary_index_previews(
    *,
    table_specs: dict[str, WarehouseTableSpec],
) -> list[DdlStatementPreview]:
    previews: list[DdlStatementPreview] = []
    for index_spec in build_index_matrix():
        if index_spec.build_phase == IndexBuildPhase.INITIAL_SCHEMA:
            continue
        table_spec = table_specs[index_spec.table_name]
        partitioned_parent = table_spec.partition_kind != PartitionKind.NONE
        if index_spec.expression_sql:
            key_sql = f"({index_spec.expression_sql})"
        else:
            key_sql = ", ".join(index_spec.key_columns)
        preview = _render_index_sql(
            table_name=index_spec.table_name,
            index_name=index_spec.name,
            method=str(index_spec.method),
            key_sql=key_sql,
            include_columns=tuple(index_spec.include_columns),
            where_sql=index_spec.predicate_sql,
            concurrent_if_live=index_spec.concurrent_if_live,
            partitioned_parent=partitioned_parent,
        )
        if index_spec.expression_sql:
            note = (
                "Requires the expression target to exist before execution."
                if preview.execution_note is None
                else preview.execution_note + " Requires the expression target to exist before execution."
            )
            preview.execution_note = note
        previews.append(preview)
    return previews


def build_migration_stage_sql_previews() -> list[MigrationStageSqlPreview]:
    table_specs = {
        table_spec.table_name: table_spec
        for table_spec in build_warehouse_table_specs()
    }
    stage_previews: list[MigrationStageSqlPreview] = []
    for bundle in build_rag_migration_bundles():
        statements: list[DdlStatementPreview] = []
        if bundle.stage == MigrationStage.SECONDARY_INDEXES:
            statements.extend(_secondary_index_previews(table_specs=table_specs))
        else:
            for table_name in bundle.tables:
                table_spec = table_specs[table_name]
                statements.append(_table_statement_preview(table_spec))
                statements.extend(_initial_index_previews(table_spec))
        stage_previews.append(
            MigrationStageSqlPreview(
                stage=bundle.stage,
                statements=statements,
            )
        )
    return stage_previews
