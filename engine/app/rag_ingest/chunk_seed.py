"""Runtime seeding for the canonical default chunk-version policy row."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Protocol

from pydantic import Field

from app.rag.parse_contract import ParseContractModel
from app.rag.source_selection import GroundingSourcePlan
from app.rag_ingest.chunk_policy import (
    DEFAULT_CHUNK_VERSION_KEY,
    build_default_chunk_version,
    build_default_chunk_version_for_plan,
    build_default_chunk_version_for_sources,
)
from app.rag_ingest.source_parsers import ParsedPaperSource
from app.rag_ingest.write_contract import RagWarehouseWriteBatch
from app.rag_ingest.write_repository import PostgresRagWriteRepository, RagWriteExecutionResult


class ChunkSeedBatchWriter(Protocol):
    def apply_write_batch(self, batch: RagWarehouseWriteBatch) -> RagWriteExecutionResult: ...


class ChunkSeedResult(ParseContractModel):
    chunk_version_key: str
    source_revision_keys: list[str] = Field(default_factory=list)
    batch_total_rows: int
    written_rows: int
    deferred_stage_names: list[str] = Field(default_factory=list)


class RagChunkSeeder:
    """Seed the canonical default chunk-version row through the write repository."""

    def __init__(self, repository: ChunkSeedBatchWriter | None = None):
        self._repository = repository or PostgresRagWriteRepository()

    def seed_default_for_sources(
        self,
        sources: Sequence[ParsedPaperSource],
        *,
        embedding_model: str | None = None,
        chunk_version_key: str | None = None,
    ) -> ChunkSeedResult:
        version = build_default_chunk_version_for_sources(
            sources,
            embedding_model=embedding_model,
            chunk_version_key=chunk_version_key or DEFAULT_CHUNK_VERSION_KEY,
        )
        execution = self._repository.apply_write_batch(
            RagWarehouseWriteBatch(chunk_versions=[version])
        )
        return ChunkSeedResult(
            chunk_version_key=version.chunk_version_key,
            source_revision_keys=list(version.source_revision_keys),
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )

    def seed_default(
        self,
        *,
        source_revision_keys: Sequence[str],
        parser_version: str,
        embedding_model: str | None = None,
        chunk_version_key: str | None = None,
    ) -> ChunkSeedResult:
        version = build_default_chunk_version(
            source_revision_keys=source_revision_keys,
            parser_version=parser_version,
            embedding_model=embedding_model,
            chunk_version_key=chunk_version_key or DEFAULT_CHUNK_VERSION_KEY,
        )
        execution = self._repository.apply_write_batch(
            RagWarehouseWriteBatch(chunk_versions=[version])
        )
        return ChunkSeedResult(
            chunk_version_key=version.chunk_version_key,
            source_revision_keys=list(version.source_revision_keys),
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )

    def seed_default_for_plan(
        self,
        plan: GroundingSourcePlan,
        *,
        embedding_model: str | None = None,
        chunk_version_key: str | None = None,
    ) -> ChunkSeedResult:
        version = build_default_chunk_version_for_plan(
            plan,
            embedding_model=embedding_model,
            chunk_version_key=chunk_version_key or DEFAULT_CHUNK_VERSION_KEY,
        )
        execution = self._repository.apply_write_batch(
            RagWarehouseWriteBatch(chunk_versions=[version])
        )
        return ChunkSeedResult(
            chunk_version_key=version.chunk_version_key,
            source_revision_keys=list(version.source_revision_keys),
            batch_total_rows=execution.total_rows,
            written_rows=execution.written_rows,
            deferred_stage_names=[
                stage.stage for stage in execution.stages if stage.status == "deferred"
            ],
        )
