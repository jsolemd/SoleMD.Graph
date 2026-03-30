"""Orchestration layer for applying parsed/grounded sources to the RAG warehouse."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from pydantic import Field

from app.rag.parse_contract import ParseContractModel
from app.rag.serving_contract import PaperChunkVersionRecord
from app.rag.source_parsers import ParsedPaperSource
from app.rag.source_selection import GroundingSourcePlan, build_grounding_source_plan
from app.rag.write_batch_builder import build_write_batch_from_grounding_plan
from app.rag.write_contract import RagWarehouseWriteBatch
from app.rag.write_repository import PostgresRagWriteRepository, RagWriteExecutionResult


class RagWarehouseBatchWriter(Protocol):
    def apply_write_batch(self, batch: RagWarehouseWriteBatch) -> RagWriteExecutionResult: ...


class RagWarehouseIngestResult(ParseContractModel):
    corpus_id: int
    primary_source_system: str
    primary_reason: str
    annotation_source_systems: list[str] = Field(default_factory=list)
    batch_total_rows: int
    written_rows: int
    deferred_stage_names: list[str] = Field(default_factory=list)


class RagWarehouseWriter:
    """Build and persist canonical warehouse rows from parsed source inputs."""

    def __init__(self, repository: RagWarehouseBatchWriter | None = None):
        self._repository = repository or PostgresRagWriteRepository()

    def ingest_sources(
        self,
        sources: Sequence[ParsedPaperSource],
        *,
        source_citation_keys: Sequence[str] | None = None,
        chunk_version: PaperChunkVersionRecord | None = None,
    ) -> RagWarehouseIngestResult:
        plan = build_grounding_source_plan(sources)
        return self.ingest_grounding_plan(
            plan,
            source_citation_keys=source_citation_keys,
            chunk_version=chunk_version,
        )

    def ingest_grounding_plan(
        self,
        plan: GroundingSourcePlan,
        *,
        source_citation_keys: Sequence[str] | None = None,
        chunk_version: PaperChunkVersionRecord | None = None,
    ) -> RagWarehouseIngestResult:
        batch = build_write_batch_from_grounding_plan(
            plan,
            source_citation_keys=source_citation_keys,
            chunk_version=chunk_version,
        )
        execution = self._repository.apply_write_batch(batch)
        return RagWarehouseIngestResult(
            corpus_id=plan.primary_source.document.corpus_id,
            primary_source_system=plan.primary_source.document.source_system,
            primary_reason=plan.primary_reason,
            annotation_source_systems=[
                source.document.source_system for source in plan.annotation_sources
            ],
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )
