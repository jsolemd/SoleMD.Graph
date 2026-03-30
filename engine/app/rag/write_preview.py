"""Dry-run preview of future RAG warehouse writes."""

from __future__ import annotations

from pydantic import Field

from app.rag.parse_contract import ParseContractModel
from app.rag.write_contract import RagWarehouseWriteBatch
from app.rag.write_repository import PlannedWriteStage, RagWritePlan, plan_write_batch
from app.rag.write_sql_contract import StageSqlTemplateSpec, build_stage_sql_templates


class PlannedWriteStagePreview(ParseContractModel):
    stage: str
    table_name: str
    write_method: str
    stage_order: int
    row_count: int
    all_columns: list[str] = Field(default_factory=list)
    primary_key_columns: list[str] = Field(default_factory=list)
    update_columns: list[str] = Field(default_factory=list)
    staging_table_name: str | None = None
    create_stage_sql: str | None = None
    copy_sql: str | None = None
    merge_sql: str


class RagWritePreview(ParseContractModel):
    total_rows: int
    stages: list[PlannedWriteStagePreview] = Field(default_factory=list)


def _preview_stage(
    planned_stage: PlannedWriteStage,
    template: StageSqlTemplateSpec,
) -> PlannedWriteStagePreview:
    return PlannedWriteStagePreview(
        stage=planned_stage.stage,
        table_name=planned_stage.table_name,
        write_method=planned_stage.write_method,
        stage_order=planned_stage.stage_order,
        row_count=planned_stage.row_count,
        all_columns=template.all_columns,
        primary_key_columns=template.primary_key_columns,
        update_columns=template.update_columns,
        staging_table_name=template.staging_table_name,
        create_stage_sql=template.create_stage_sql,
        copy_sql=template.copy_sql,
        merge_sql=template.merge_sql,
    )


def build_write_preview(batch: RagWarehouseWriteBatch) -> RagWritePreview:
    """Render the deferred future write plan without executing any SQL."""

    plan: RagWritePlan = plan_write_batch(batch)
    template_map = {
        template.stage: template
        for template in build_stage_sql_templates()
    }
    previews = [
        _preview_stage(planned_stage, template_map[planned_stage.stage])
        for planned_stage in plan.stages
    ]
    return RagWritePreview(total_rows=plan.total_rows, stages=previews)
