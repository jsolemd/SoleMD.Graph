"""Write-stage planner plus the first runtime repository for RAG warehouse writes."""

from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Any, Protocol, Sequence

from psycopg.types.json import Jsonb

from app import db
from pydantic import Field, model_validator

from app.rag.parse_contract import ParseContractModel
from app.rag.rag_schema_contract import build_warehouse_table_specs
from app.rag.write_contract import RagWarehouseWriteBatch

if TYPE_CHECKING:
    from app.rag.write_sql_contract import StageSqlTemplateSpec


class WriteMethod(StrEnum):
    """Preferred write path for a future warehouse stage."""

    COPY_STAGE_UPSERT = "copy_stage_upsert"
    UPSERT_ROWS = "upsert_rows"


class WriteStage(StrEnum):
    DOCUMENTS = "documents"
    DOCUMENT_SOURCES = "document_sources"
    SECTIONS = "sections"
    BLOCKS = "blocks"
    SENTENCES = "sentences"
    REFERENCES = "references"
    CITATIONS = "citations"
    ENTITIES = "entities"
    CHUNK_VERSIONS = "chunk_versions"
    CHUNKS = "chunks"
    CHUNK_MEMBERS = "chunk_members"


class WriteStageSpec(ParseContractModel):
    stage: WriteStage
    table_name: str
    write_method: WriteMethod
    logical_dependencies: list[WriteStage] = Field(default_factory=list)


class PlannedWriteStage(WriteStageSpec):
    stage_order: int
    row_count: int

    @model_validator(mode="after")
    def validate_stage(self) -> "PlannedWriteStage":
        if self.stage_order <= 0:
            raise ValueError("stage_order must be positive")
        if self.row_count <= 0:
            raise ValueError("row_count must be positive")
        return self


class RagWritePlan(ParseContractModel):
    stages: list[PlannedWriteStage] = Field(default_factory=list)
    total_rows: int = 0

    @model_validator(mode="after")
    def validate_plan(self) -> "RagWritePlan":
        expected_total = sum(stage.row_count for stage in self.stages)
        if self.total_rows in (0, expected_total):
            self.total_rows = expected_total
        else:
            raise ValueError("total_rows must match the sum of planned stage row counts")

        if not self.stages:
            return self

        planned_stage_set = {stage.stage for stage in self.stages}
        seen_stage_order: dict[WriteStage, int] = {}
        for expected_order, stage in enumerate(self.stages, start=1):
            if stage.stage_order != expected_order:
                raise ValueError("stage_order must be contiguous and start at 1")
            for dependency in stage.logical_dependencies:
                if dependency in planned_stage_set and dependency not in seen_stage_order:
                    raise ValueError(
                        f"{stage.stage} depends on {dependency}, which must appear earlier in the plan"
                    )
            seen_stage_order[stage.stage] = stage.stage_order
        return self


class RagWriteRepository(Protocol):
    """Future repository seam for applying planned warehouse write stages."""

    def execute_stage(
        self,
        *,
        stage: PlannedWriteStage,
        rows: Sequence[object],
        ) -> int:
        """Persist one planned stage and return the number of written rows."""


class RuntimeWriteStatus(StrEnum):
    EXECUTED = "executed"
    DEFERRED = "deferred"


class RuntimeWriteStageResult(ParseContractModel):
    stage: WriteStage
    logical_table_name: str
    physical_table_name: str | None = None
    status: RuntimeWriteStatus
    row_count: int
    reason: str | None = None


class RagWriteExecutionResult(ParseContractModel):
    total_rows: int
    written_rows: int
    stages: list[RuntimeWriteStageResult] = Field(default_factory=list)


class RuntimeWriteStageSupport(ParseContractModel):
    stage: WriteStage
    logical_table_name: str
    physical_table_name: str
    write_method: WriteMethod


_RUNTIME_SUPPORTED_STAGE_TABLES: dict[WriteStage, str] = {
    WriteStage.DOCUMENTS: "paper_documents",
    WriteStage.DOCUMENT_SOURCES: "paper_document_sources",
    WriteStage.SECTIONS: "paper_sections",
    WriteStage.BLOCKS: "paper_blocks",
    WriteStage.SENTENCES: "paper_sentences",
    WriteStage.REFERENCES: "paper_references",
    WriteStage.CITATIONS: "paper_citation_mentions",
    WriteStage.ENTITIES: "paper_entity_mentions",
}

_RUNTIME_CONDITIONAL_STAGE_TABLES: dict[WriteStage, str] = {
    WriteStage.CHUNK_VERSIONS: "paper_chunk_versions",
    WriteStage.CHUNKS: "paper_chunks",
    WriteStage.CHUNK_MEMBERS: "paper_chunk_members",
}

_RUNTIME_DEFERRED_STAGE_REASONS: dict[WriteStage, str] = {
    WriteStage.CHUNK_VERSIONS: (
        "Chunk-version writes stay deferred until paper_chunk_versions exists in the live schema."
    ),
    WriteStage.CHUNKS: "Chunk writes stay deferred until paper_chunks exists in the live schema.",
    WriteStage.CHUNK_MEMBERS: (
        "Chunk-member writes stay deferred until paper_chunk_members exists in the live schema."
    ),
}


_STAGE_TO_TABLE_NAME: dict[WriteStage, str] = {
    WriteStage.DOCUMENTS: "paper_documents",
    WriteStage.DOCUMENT_SOURCES: "paper_document_sources",
    WriteStage.SECTIONS: "paper_sections",
    WriteStage.BLOCKS: "paper_blocks",
    WriteStage.SENTENCES: "paper_sentences",
    WriteStage.REFERENCES: "paper_reference_entries",
    WriteStage.CITATIONS: "paper_citation_mentions",
    WriteStage.ENTITIES: "paper_entity_mentions",
    WriteStage.CHUNK_VERSIONS: "paper_chunk_versions",
    WriteStage.CHUNKS: "paper_chunks",
    WriteStage.CHUNK_MEMBERS: "paper_chunk_members",
}

_WRITE_STAGE_SPECS: tuple[WriteStageSpec, ...] = (
    WriteStageSpec(
        stage=WriteStage.DOCUMENTS,
        table_name="paper_documents",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
    ),
    WriteStageSpec(
        stage=WriteStage.DOCUMENT_SOURCES,
        table_name="paper_document_sources",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.DOCUMENTS],
    ),
    WriteStageSpec(
        stage=WriteStage.SECTIONS,
        table_name="paper_sections",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.DOCUMENTS],
    ),
    WriteStageSpec(
        stage=WriteStage.BLOCKS,
        table_name="paper_blocks",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.SECTIONS],
    ),
    WriteStageSpec(
        stage=WriteStage.SENTENCES,
        table_name="paper_sentences",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.BLOCKS],
    ),
    WriteStageSpec(
        stage=WriteStage.REFERENCES,
        table_name="paper_reference_entries",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.DOCUMENTS],
    ),
    WriteStageSpec(
        stage=WriteStage.CITATIONS,
        table_name="paper_citation_mentions",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.BLOCKS, WriteStage.REFERENCES],
    ),
    WriteStageSpec(
        stage=WriteStage.ENTITIES,
        table_name="paper_entity_mentions",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.BLOCKS, WriteStage.SENTENCES],
    ),
    WriteStageSpec(
        stage=WriteStage.CHUNK_VERSIONS,
        table_name="paper_chunk_versions",
        write_method=WriteMethod.UPSERT_ROWS,
    ),
    WriteStageSpec(
        stage=WriteStage.CHUNKS,
        table_name="paper_chunks",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.CHUNK_VERSIONS, WriteStage.BLOCKS],
    ),
    WriteStageSpec(
        stage=WriteStage.CHUNK_MEMBERS,
        table_name="paper_chunk_members",
        write_method=WriteMethod.COPY_STAGE_UPSERT,
        logical_dependencies=[WriteStage.CHUNKS, WriteStage.BLOCKS, WriteStage.SENTENCES],
    ),
)


def build_write_stage_specs() -> list[WriteStageSpec]:
    """Return the canonical deferred write-stage specification list."""

    schema_table_names = {
        spec.table_name
        for spec in build_warehouse_table_specs()
    }
    for stage_spec in _WRITE_STAGE_SPECS:
        if stage_spec.table_name not in schema_table_names:
            raise ValueError(
                f"write stage {stage_spec.stage} references unknown schema table {stage_spec.table_name}"
            )
    return list(_WRITE_STAGE_SPECS)


def stage_rows(batch: RagWarehouseWriteBatch, stage: WriteStage | str) -> list[object]:
    """Return the row list for a logical write stage from a validated batch."""

    stage_name = stage.value if isinstance(stage, WriteStage) else str(stage)
    return list(getattr(batch, stage_name))


def plan_write_batch(batch: RagWarehouseWriteBatch) -> RagWritePlan:
    """Build the future persistence plan for the non-empty parts of a write batch."""

    planned_stages: list[PlannedWriteStage] = []
    for stage_spec in build_write_stage_specs():
        rows = stage_rows(batch, stage_spec.stage)
        if not rows:
            continue
        planned_stages.append(
            PlannedWriteStage(
                stage=stage_spec.stage,
                table_name=stage_spec.table_name,
                write_method=stage_spec.write_method,
                logical_dependencies=stage_spec.logical_dependencies,
                stage_order=len(planned_stages) + 1,
                row_count=len(rows),
            )
        )
    return RagWritePlan(stages=planned_stages)


def build_runtime_write_stage_support() -> list[RuntimeWriteStageSupport]:
    """Return the live write-stage support map for physical warehouse tables."""

    stage_specs = {spec.stage: spec for spec in build_write_stage_specs()}
    return [
        RuntimeWriteStageSupport(
            stage=stage,
            logical_table_name=stage_specs[stage].table_name,
            physical_table_name=physical_table_name,
            write_method=stage_specs[stage].write_method,
        )
        for stage, physical_table_name in _RUNTIME_SUPPORTED_STAGE_TABLES.items()
    ]


def build_runtime_write_stage_support_map() -> dict[WriteStage, RuntimeWriteStageSupport]:
    return {spec.stage: spec for spec in build_runtime_write_stage_support()}


def _table_exists_with_cursor(cur: Any, schema_name: str, table_name: str) -> bool:
    cur.execute("SELECT to_regclass(%s)", (f"{schema_name}.{table_name}",))
    row = cur.fetchone()
    if row is None:
        return False
    if isinstance(row, dict):
        return row.get("to_regclass") is not None
    if hasattr(row, "keys") and "to_regclass" in row.keys():
        return row["to_regclass"] is not None
    if isinstance(row, (tuple, list)):
        return bool(row) and row[0] is not None
    return False


def _serialize_stage_value(value):
    if isinstance(value, dict):
        return Jsonb(value)
    if isinstance(value, StrEnum):
        return value.value
    return value


def _stage_row_as_copy_tuple(row: object, columns: Sequence[str]) -> tuple[object, ...]:
    if hasattr(row, "model_dump"):
        data = row.model_dump(mode="python")
    elif isinstance(row, dict):
        data = row
    else:
        raise TypeError(f"Unsupported row payload type: {type(row)!r}")
    return tuple(_serialize_stage_value(data[column]) for column in columns)


_REFERENCE_ADAPTER_STAGING_TABLE = "_stg_paper_references_adapter"
_REFERENCE_ADAPTER_COLUMNS: tuple[str, ...] = (
    "corpus_id",
    "reference_index",
    "referenced_paper_id",
    "referenced_corpus_id",
    "title",
    "year",
    "external_ids",
    "doi",
    "pmid",
    "pmcid",
    "arxiv_id",
    "acl_id",
    "dblp_id",
    "mag_id",
    "source",
    "source_release_id",
)
_REFERENCE_ADAPTER_CREATE_STAGE_SQL = (
    f"CREATE TEMP TABLE {_REFERENCE_ADAPTER_STAGING_TABLE} "
    "(LIKE solemd.paper_references INCLUDING DEFAULTS) ON COMMIT DROP"
)
_REFERENCE_ADAPTER_COPY_SQL = (
    f"COPY {_REFERENCE_ADAPTER_STAGING_TABLE} ({', '.join(_REFERENCE_ADAPTER_COLUMNS)}) "
    "FROM STDIN"
)
_REFERENCE_ADAPTER_DELETE_SQL = (
    "DELETE FROM solemd.paper_references "
    "WHERE corpus_id = ANY(%s)"
)
_REFERENCE_ADAPTER_INSERT_SQL = (
    "INSERT INTO solemd.paper_references "
    f"({', '.join(_REFERENCE_ADAPTER_COLUMNS)}) "
    f"SELECT {', '.join(_REFERENCE_ADAPTER_COLUMNS)} "
    f"FROM {_REFERENCE_ADAPTER_STAGING_TABLE}"
)

_REPLACE_EXISTING_DELETE_TABLES: tuple[str, ...] = (
    "paper_chunk_members",
    "paper_chunks",
    "paper_citation_mentions",
    "paper_entity_mentions",
    "paper_sentences",
    "paper_blocks",
    "paper_sections",
    "paper_document_sources",
    "paper_references",
    "paper_documents",
)


def _reference_stage_row_as_copy_tuple(row: object) -> tuple[object, ...]:
    if hasattr(row, "model_dump"):
        data = row.model_dump(mode="python")
    elif isinstance(row, dict):
        data = row
    else:
        raise TypeError(f"Unsupported reference row payload type: {type(row)!r}")

    external_ids = Jsonb(
        {
            "source_reference_key": data["source_reference_key"],
            "reference_text": data["text"],
            "adapter_version": "rag_paper_references_v1",
        }
    )
    return (
        int(data["corpus_id"]),
        int(data["reference_ordinal"]) + 1,
        data.get("matched_paper_id"),
        data.get("matched_corpus_id"),
        data.get("text"),
        None,
        external_ids,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
        "rag_warehouse_adapter",
        None,
    )


class PostgresRagWriteRepository:
    """Runtime writer for the live canonical RAG warehouse tables."""

    def __init__(self, connect=None, table_exists_probe=None):
        self._connect = connect or db.pooled
        from app.rag.write_sql_contract import build_write_sql_stage_spec_map

        self._template_map = build_write_sql_stage_spec_map()
        self._stage_specs = {spec.stage: spec for spec in build_write_stage_specs()}
        self._runtime_support = build_runtime_write_stage_support_map()
        self._table_exists_probe = table_exists_probe or _table_exists_with_cursor

    def execute_stage(
        self,
        *,
        stage: PlannedWriteStage,
        rows: Sequence[object],
    ) -> int:
        with self._connect() as conn, conn.cursor() as cur:
            runtime_support = self._build_runtime_support_with_cursor(cur).get(stage.stage)
            if runtime_support is None:
                raise NotImplementedError(
                    _RUNTIME_DEFERRED_STAGE_REASONS.get(
                        stage.stage,
                        f"Stage {stage.stage} is not executable against the live warehouse yet.",
                    )
                )
            if stage.stage == WriteStage.REFERENCES:
                written = self._execute_reference_adapter_stage_with_cursor(
                    cur=cur,
                    rows=rows,
                )
            else:
                written = self._execute_stage_with_cursor(
                    cur=cur,
                    stage=stage,
                    rows=rows,
                    template=self._template_map[stage.stage],
                )
            conn.commit()
        return written

    def apply_write_batch(
        self,
        batch: RagWarehouseWriteBatch,
        *,
        replace_existing: bool = False,
    ) -> RagWriteExecutionResult:
        plan = plan_write_batch(batch)
        if not plan.stages:
            return RagWriteExecutionResult(total_rows=0, written_rows=0, stages=[])

        stage_results: list[RuntimeWriteStageResult] = []
        written_rows = 0

        with self._connect() as conn, conn.cursor() as cur:
            if replace_existing:
                self._replace_existing_rows_with_cursor(cur=cur, batch=batch)
            runtime_support_map = self._build_runtime_support_with_cursor(cur)
            for planned_stage in plan.stages:
                rows = stage_rows(batch, planned_stage.stage)
                runtime_support = runtime_support_map.get(planned_stage.stage)
                if runtime_support is None:
                    stage_results.append(
                        RuntimeWriteStageResult(
                            stage=planned_stage.stage,
                            logical_table_name=planned_stage.table_name,
                            status=RuntimeWriteStatus.DEFERRED,
                            row_count=len(rows),
                            reason=_RUNTIME_DEFERRED_STAGE_REASONS.get(
                                planned_stage.stage,
                                "Stage is not executable against the live warehouse yet.",
                            ),
                        )
                    )
                    continue

                if planned_stage.stage == WriteStage.REFERENCES:
                    written = self._execute_reference_adapter_stage_with_cursor(
                        cur=cur,
                        rows=rows,
                    )
                else:
                    written = self._execute_stage_with_cursor(
                        cur=cur,
                        stage=planned_stage,
                        rows=rows,
                        template=self._template_map[planned_stage.stage],
                    )
                written_rows += written
                stage_results.append(
                    RuntimeWriteStageResult(
                        stage=planned_stage.stage,
                        logical_table_name=planned_stage.table_name,
                        physical_table_name=runtime_support.physical_table_name,
                        status=RuntimeWriteStatus.EXECUTED,
                        row_count=written,
                    )
                )
            conn.commit()

        return RagWriteExecutionResult(
            total_rows=plan.total_rows,
            written_rows=written_rows,
            stages=stage_results,
        )

    def _replace_existing_rows_with_cursor(self, *, cur, batch: RagWarehouseWriteBatch) -> None:
        corpus_ids = sorted({int(row.corpus_id) for row in batch.documents})
        if not corpus_ids:
            return
        for table_name in _REPLACE_EXISTING_DELETE_TABLES:
            if not self._table_exists_probe(cur, "solemd", table_name):
                continue
            cur.execute(
                f"DELETE FROM solemd.{table_name} WHERE corpus_id = ANY(%s)",
                (corpus_ids,),
            )

    def _build_runtime_support_with_cursor(
        self,
        cur,
    ) -> dict[WriteStage, RuntimeWriteStageSupport]:
        support = dict(self._runtime_support)
        for stage, table_name in _RUNTIME_CONDITIONAL_STAGE_TABLES.items():
            if not self._table_exists_probe(cur, "solemd", table_name):
                continue
            stage_spec = self._stage_specs[stage]
            support[stage] = RuntimeWriteStageSupport(
                stage=stage,
                logical_table_name=stage_spec.table_name,
                physical_table_name=table_name,
                write_method=stage_spec.write_method,
            )
        return support

    def _execute_stage_with_cursor(
        self,
        *,
        cur,
        stage: PlannedWriteStage,
        rows: Sequence[object],
        template: "StageSqlTemplateSpec",
    ) -> int:
        if not rows:
            return 0

        if template.write_method == WriteMethod.COPY_STAGE_UPSERT:
            assert template.create_stage_sql is not None
            assert template.copy_sql is not None
            cur.execute(template.create_stage_sql)
            with cur.copy(template.copy_sql) as copy:
                for row in rows:
                    copy.write_row(_stage_row_as_copy_tuple(row, template.all_columns))
            cur.execute(template.merge_sql)
            return len(rows)

        payloads = [
            {
                column: _serialize_stage_value(value)
                for column, value in zip(
                    template.all_columns,
                    _stage_row_as_copy_tuple(row, template.all_columns),
                    strict=True,
                )
            }
            for row in rows
        ]
        cur.executemany(template.merge_sql, payloads)
        return len(rows)

    def _execute_reference_adapter_stage_with_cursor(
        self,
        *,
        cur,
        rows: Sequence[object],
    ) -> int:
        if not rows:
            return 0

        corpus_ids = sorted(
            {
                int(row.model_dump(mode="python")["corpus_id"])
                if hasattr(row, "model_dump")
                else int(row["corpus_id"])
                for row in rows
            }
        )
        cur.execute(_REFERENCE_ADAPTER_DELETE_SQL, (corpus_ids,))
        cur.execute(_REFERENCE_ADAPTER_CREATE_STAGE_SQL)
        with cur.copy(_REFERENCE_ADAPTER_COPY_SQL) as copy:
            for row in rows:
                copy.write_row(_reference_stage_row_as_copy_tuple(row))
        cur.execute(_REFERENCE_ADAPTER_INSERT_SQL)
        return len(rows)
