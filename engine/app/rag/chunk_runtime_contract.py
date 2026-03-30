"""Deferred cutover contract for enabling chunk-backed runtime reads and writes."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.index_contract import IndexBuildPhase
from app.rag.migration_contract import MigrationStage
from app.rag.parse_contract import ParseContractModel
from app.rag.write_repository import WriteStage


class ChunkRuntimePhase(StrEnum):
    MIGRATE_DERIVED_SERVING_TABLES = "migrate_derived_serving_tables"
    ENABLE_CHUNK_VERSION_WRITES = "enable_chunk_version_writes"
    ENABLE_CHUNK_CONTENT_WRITES = "enable_chunk_content_writes"
    BACKFILL_DEFAULT_CHUNK_VERSION = "backfill_default_chunk_version"
    ENABLE_GROUNDED_PACKET_READS = "enable_grounded_packet_reads"
    APPLY_POST_LOAD_SERVING_INDEXES = "apply_post_load_serving_indexes"


class ChunkRuntimeCutoverSpec(ParseContractModel):
    phase: ChunkRuntimePhase
    description: str
    dependency_phases: list[ChunkRuntimePhase] = Field(default_factory=list)
    required_migration_stages: list[MigrationStage] = Field(default_factory=list)
    required_write_stages: list[WriteStage] = Field(default_factory=list)
    required_tables: list[str] = Field(default_factory=list)
    required_index_phases: list[IndexBuildPhase] = Field(default_factory=list)
    completion_signal: str

    @model_validator(mode="after")
    def validate_spec(self) -> "ChunkRuntimeCutoverSpec":
        if not self.description:
            raise ValueError("description must not be empty")
        if not self.completion_signal:
            raise ValueError("completion_signal must not be empty")
        return self


_CHUNK_RUNTIME_CUTOVER_PLAN: tuple[ChunkRuntimeCutoverSpec, ...] = (
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.MIGRATE_DERIVED_SERVING_TABLES,
        description=(
            "Create the derived serving tables in PostgreSQL before any chunk-aware writer "
            "or reader path is enabled."
        ),
        required_migration_stages=[MigrationStage.DERIVED_SERVING],
        required_tables=[
            "paper_chunk_versions",
            "paper_chunks",
            "paper_chunk_members",
        ],
        completion_signal=(
            "Derived serving tables exist in PostgreSQL and match the deferred schema contract."
        ),
    ),
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.ENABLE_CHUNK_VERSION_WRITES,
        description=(
            "Enable the small policy-table write lane first so chunk version keys are explicit "
            "before any row-heavy chunk content is persisted."
        ),
        dependency_phases=[ChunkRuntimePhase.MIGRATE_DERIVED_SERVING_TABLES],
        required_write_stages=[WriteStage.CHUNK_VERSIONS],
        required_tables=["paper_chunk_versions"],
        completion_signal=(
            "Chunk version rows can be written deterministically without enabling chunk content writes."
        ),
    ),
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.ENABLE_CHUNK_CONTENT_WRITES,
        description=(
            "Enable staged COPY/upsert writes for chunk rows and chunk members only after the "
            "version policy table is live."
        ),
        dependency_phases=[ChunkRuntimePhase.ENABLE_CHUNK_VERSION_WRITES],
        required_write_stages=[WriteStage.CHUNKS, WriteStage.CHUNK_MEMBERS],
        required_tables=["paper_chunks", "paper_chunk_members"],
        completion_signal=(
            "Chunk text and lineage rows can be written in one staged batch without ad hoc SQL."
        ),
    ),
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION,
        description=(
            "Backfill the first default chunk version for papers that already have canonical "
            "blocks and sentences before any chunk-backed read path is exposed."
        ),
        dependency_phases=[ChunkRuntimePhase.ENABLE_CHUNK_CONTENT_WRITES],
        required_tables=[
            "paper_chunk_versions",
            "paper_chunks",
            "paper_chunk_members",
        ],
        completion_signal=(
            "The default chunk version is backfilled for the targeted papers and lineage is complete."
        ),
    ),
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS,
        description=(
            "Switch grounded-answer assembly from paper-level fallback toward chunk/span-backed "
            "packet assembly only after derived chunk rows exist."
        ),
        dependency_phases=[ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION],
        required_tables=[
            "paper_chunks",
            "paper_chunk_members",
            "paper_citation_mentions",
            "paper_entity_mentions",
        ],
        completion_signal=(
            "Grounded answer packets can resolve cited spans through chunk lineage without falling back to raw source joins."
        ),
    ),
    ChunkRuntimeCutoverSpec(
        phase=ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES,
        description=(
            "Apply the heavier retrieval-serving lexical indexes only after chunk rows are "
            "populated and the rebuild-safe window is open."
        ),
        dependency_phases=[ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS],
        required_index_phases=[IndexBuildPhase.POST_LOAD],
        completion_signal=(
            "Post-load serving indexes are applied and analyzed after the chunk backfill is stable."
        ),
    ),
)


def build_chunk_runtime_cutover_plan() -> list[ChunkRuntimeCutoverSpec]:
    return list(_CHUNK_RUNTIME_CUTOVER_PLAN)
