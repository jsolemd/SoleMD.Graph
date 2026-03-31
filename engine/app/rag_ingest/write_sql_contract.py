"""Deferred SQL-template contract for future RAG warehouse write stages."""

from __future__ import annotations

from pydantic import Field, model_validator

from app.rag.parse_contract import ParseContractModel
from app.rag.rag_schema_contract import (
    PaperBlockRow,
    PaperDocumentRow,
    PaperDocumentSourceRow,
    PaperReferenceEntryRow,
    PaperSectionRow,
    PaperSentenceRow,
    build_warehouse_table_specs,
)
from app.rag.serving_contract import (
    PaperChunkMemberRecord,
    PaperChunkRecord,
    PaperChunkVersionRecord,
)
from app.rag.warehouse_contract import PaperCitationMentionRow, PaperEntityMentionRow
from app.rag_ingest.write_repository import (
    WriteMethod,
    WriteStage,
    build_write_stage_specs,
)


class StageSqlTemplateSpec(ParseContractModel):
    stage: WriteStage
    table_name: str
    write_method: WriteMethod
    primary_key_columns: list[str] = Field(default_factory=list)
    all_columns: list[str] = Field(default_factory=list)
    update_columns: list[str] = Field(default_factory=list)
    staging_table_name: str | None = None
    create_stage_sql: str | None = None
    copy_sql: str | None = None
    merge_sql: str

    @property
    def primary_key(self) -> tuple[str, ...]:
        return tuple(self.primary_key_columns)

    @property
    def copy_columns(self) -> tuple[str, ...]:
        return tuple(self.all_columns)

    @model_validator(mode="after")
    def validate_template(self) -> "StageSqlTemplateSpec":
        if not self.primary_key_columns:
            raise ValueError("primary_key_columns must not be empty")
        if not self.all_columns:
            raise ValueError("all_columns must not be empty")
        if self.write_method == WriteMethod.COPY_STAGE_UPSERT:
            if not self.staging_table_name:
                raise ValueError("copy-stage templates require a staging_table_name")
            if not self.create_stage_sql:
                raise ValueError("copy-stage templates require create_stage_sql")
            if not self.copy_sql:
                raise ValueError("copy-stage templates require copy_sql")
        return self


_ROW_MODEL_BY_STAGE = {
    WriteStage.DOCUMENTS: PaperDocumentRow,
    WriteStage.DOCUMENT_SOURCES: PaperDocumentSourceRow,
    WriteStage.SECTIONS: PaperSectionRow,
    WriteStage.BLOCKS: PaperBlockRow,
    WriteStage.SENTENCES: PaperSentenceRow,
    WriteStage.REFERENCES: PaperReferenceEntryRow,
    WriteStage.CITATIONS: PaperCitationMentionRow,
    WriteStage.ENTITIES: PaperEntityMentionRow,
    WriteStage.CHUNK_VERSIONS: PaperChunkVersionRecord,
    WriteStage.CHUNKS: PaperChunkRecord,
    WriteStage.CHUNK_MEMBERS: PaperChunkMemberRecord,
}


def _columns_for_stage(stage: WriteStage) -> list[str]:
    return list(_ROW_MODEL_BY_STAGE[stage].model_fields.keys())


def _build_copy_sql(staging_table_name: str, columns: list[str]) -> str:
    column_sql = ", ".join(columns)
    return f"COPY {staging_table_name} ({column_sql}) FROM STDIN"


def _build_merge_sql(
    *,
    table_name: str,
    staging_table_name: str,
    all_columns: list[str],
    primary_key_columns: list[str],
    update_columns: list[str],
) -> str:
    insert_columns = ", ".join(all_columns)
    select_columns = ", ".join(all_columns)
    conflict_columns = ", ".join(primary_key_columns)
    if update_columns:
        update_sql = ",\n    ".join(
            f"{column} = EXCLUDED.{column}"
            for column in update_columns
        )
        update_guard = " OR ".join(
            f"solemd.{table_name}.{column} IS DISTINCT FROM EXCLUDED.{column}"
            for column in update_columns
        )
        conflict_clause = f"DO UPDATE SET\n    {update_sql}\nWHERE {update_guard}"
    else:
        conflict_clause = "DO NOTHING"
    return (
        f"INSERT INTO solemd.{table_name} ({insert_columns})\n"
        f"SELECT {select_columns} FROM {staging_table_name}\n"
        f"ON CONFLICT ({conflict_columns}) {conflict_clause}"
    )


def _build_upsert_rows_sql(
    *,
    table_name: str,
    all_columns: list[str],
    primary_key_columns: list[str],
    update_columns: list[str],
) -> str:
    insert_columns = ", ".join(all_columns)
    value_sql = ", ".join(f"%({column})s" for column in all_columns)
    conflict_columns = ", ".join(primary_key_columns)
    if update_columns:
        update_sql = ",\n    ".join(
            f"{column} = EXCLUDED.{column}"
            for column in update_columns
        )
        update_guard = " OR ".join(
            f"solemd.{table_name}.{column} IS DISTINCT FROM EXCLUDED.{column}"
            for column in update_columns
        )
        conflict_clause = f"DO UPDATE SET\n    {update_sql}\nWHERE {update_guard}"
    else:
        conflict_clause = "DO NOTHING"
    return (
        f"INSERT INTO solemd.{table_name} ({insert_columns})\n"
        f"VALUES ({value_sql})\n"
        f"ON CONFLICT ({conflict_columns}) {conflict_clause}"
    )


def build_stage_sql_templates() -> list[StageSqlTemplateSpec]:
    """Return the deferred SQL-template spec for each planned write stage."""

    schema_specs = {
        table_spec.table_name: table_spec
        for table_spec in build_warehouse_table_specs()
    }
    templates: list[StageSqlTemplateSpec] = []
    for stage_spec in build_write_stage_specs():
        schema_spec = schema_specs[stage_spec.table_name]
        all_columns = _columns_for_stage(stage_spec.stage)
        primary_key_columns = list(schema_spec.primary_key)
        update_columns = [
            column
            for column in all_columns
            if column not in primary_key_columns
        ]
        staging_table_name = None
        create_stage_sql = None
        copy_sql = None
        if stage_spec.write_method == WriteMethod.COPY_STAGE_UPSERT:
            staging_table_name = f"_stg_{stage_spec.table_name}"
            create_stage_sql = (
                f"CREATE TEMP TABLE {staging_table_name} "
                f"(LIKE solemd.{stage_spec.table_name} INCLUDING DEFAULTS) "
                "ON COMMIT DROP"
            )
            copy_sql = _build_copy_sql(staging_table_name, all_columns)
            merge_sql = _build_merge_sql(
                table_name=stage_spec.table_name,
                staging_table_name=staging_table_name,
                all_columns=all_columns,
                primary_key_columns=primary_key_columns,
                update_columns=update_columns,
            )
        else:
            merge_sql = _build_upsert_rows_sql(
                table_name=stage_spec.table_name,
                all_columns=all_columns,
                primary_key_columns=primary_key_columns,
                update_columns=update_columns,
            )

        templates.append(
            StageSqlTemplateSpec(
                stage=stage_spec.stage,
                table_name=stage_spec.table_name,
                write_method=stage_spec.write_method,
                primary_key_columns=primary_key_columns,
                all_columns=all_columns,
                update_columns=update_columns,
                staging_table_name=staging_table_name,
                create_stage_sql=create_stage_sql,
                copy_sql=copy_sql,
                merge_sql=merge_sql,
            )
        )
    return templates


def build_write_sql_stage_specs() -> list[StageSqlTemplateSpec]:
    return build_stage_sql_templates()


def build_write_sql_stage_spec_map() -> dict[WriteStage, StageSqlTemplateSpec]:
    return {spec.stage: spec for spec in build_stage_sql_templates()}
