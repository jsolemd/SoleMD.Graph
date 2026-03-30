"""Deferred cutover contract for enabling chunk-backed runtime serving."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag.index_contract import IndexBuildPhase
from app.rag.migration_contract import MigrationStage
from app.rag.parse_contract import ParseContractModel
from app.rag.write_repository import WriteStage


class ChunkRuntimeCutoverStepKey(StrEnum):
    SEED_CHUNK_VERSION = "seed_chunk_version"
    BACKFILL_CHUNKS = "backfill_chunks"
    BACKFILL_CHUNK_MEMBERS = "backfill_chunk_members"
    VALIDATE_LINEAGE = "validate_lineage"
    APPLY_POST_LOAD_INDEXES = "apply_post_load_indexes"
    ENABLE_RUNTIME_SERVING = "enable_runtime_serving"


class ChunkRuntimeCutoverStep(ParseContractModel):
    step: ChunkRuntimeCutoverStepKey
    description: str
    dependency_migration_stages: list[MigrationStage] = Field(default_factory=list)
    dependency_write_stages: list[WriteStage] = Field(default_factory=list)
    runtime_tables: list[str] = Field(default_factory=list)
    runtime_surfaces: list[str] = Field(default_factory=list)
    index_build_phases: list[IndexBuildPhase] = Field(default_factory=list)
    validation_focus: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_step(self) -> "ChunkRuntimeCutoverStep":
        if not self.description:
            raise ValueError("description must not be empty")
        if (
            self.step != ChunkRuntimeCutoverStepKey.APPLY_POST_LOAD_INDEXES
            and not self.runtime_tables
            and not self.runtime_surfaces
        ):
            raise ValueError("cutover steps must define runtime tables or surfaces")
        return self


_CHUNK_RUNTIME_CUTOVER_STEPS: tuple[ChunkRuntimeCutoverStep, ...] = (
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.SEED_CHUNK_VERSION,
        description=(
            "Seed one explicit paper_chunk_versions policy before any derived chunk "
            "rows are written so every downstream record is version-keyed from day one."
        ),
        dependency_migration_stages=[
            MigrationStage.CANONICAL_SPANS,
            MigrationStage.ALIGNED_MENTIONS,
            MigrationStage.DERIVED_SERVING,
        ],
        dependency_write_stages=[WriteStage.CHUNK_VERSIONS],
        runtime_tables=["paper_chunk_versions"],
        validation_focus=[
            f"default chunk version {DEFAULT_CHUNK_VERSION_KEY} exists",
            "chunk policy is immutable and replayable",
        ],
    ),
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.BACKFILL_CHUNKS,
        description=(
            "Backfill paper_chunks from canonical blocks using one seeded chunk "
            "version and without introducing chunk-local grounding semantics."
        ),
        dependency_migration_stages=[MigrationStage.DERIVED_SERVING],
        dependency_write_stages=[WriteStage.CHUNK_VERSIONS, WriteStage.BLOCKS, WriteStage.CHUNKS],
        runtime_tables=["paper_chunks"],
        validation_focus=[
            "retrieval-default block kinds are chunked",
            "chunk text stays derived from canonical members",
        ],
    ),
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.BACKFILL_CHUNK_MEMBERS,
        description=(
            "Backfill paper_chunk_members only after paper_chunks exist so block "
            "and sentence lineage is preserved for future cited-span grounding."
        ),
        dependency_migration_stages=[MigrationStage.DERIVED_SERVING],
        dependency_write_stages=[
            WriteStage.CHUNKS,
            WriteStage.BLOCKS,
            WriteStage.SENTENCES,
            WriteStage.CHUNK_MEMBERS,
        ],
        runtime_tables=["paper_chunk_members"],
        validation_focus=[
            "every chunk member references a known canonical block",
            "sentence-level members only exist when canonical sentence ordinals are known",
        ],
    ),
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.VALIDATE_LINEAGE,
        description=(
            "Validate that chunk lineage is compatible with aligned citation and "
            "entity mentions before the runtime depends on chunk-backed grounding."
        ),
        dependency_migration_stages=[
            MigrationStage.ALIGNED_MENTIONS,
            MigrationStage.DERIVED_SERVING,
        ],
        dependency_write_stages=[
            WriteStage.CITATIONS,
            WriteStage.ENTITIES,
            WriteStage.CHUNK_MEMBERS,
        ],
        runtime_surfaces=["cited_span_packets", "inline_citation_anchors"],
        validation_focus=[
            "cited sentences can map back to chunk membership",
            "entity mentions remain anchored after chunk derivation",
        ],
    ),
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.APPLY_POST_LOAD_INDEXES,
        description=(
            "Apply the heavier post-load lexical and lookup indexes only after the "
            "chunk tables are backfilled and the rebuild-safe window is open."
        ),
        dependency_migration_stages=[MigrationStage.SECONDARY_INDEXES],
        dependency_write_stages=[WriteStage.CHUNK_MEMBERS],
        runtime_tables=["paper_blocks", "paper_chunks", "paper_chunk_members"],
        index_build_phases=[IndexBuildPhase.POST_LOAD, IndexBuildPhase.RETRIEVAL_READY],
        validation_focus=[
            "post-load indexes are built concurrently on live systems",
            "no ANN index is introduced on canonical span tables",
        ],
    ),
    ChunkRuntimeCutoverStep(
        step=ChunkRuntimeCutoverStepKey.ENABLE_RUNTIME_SERVING,
        description=(
            "Enable chunk-backed retrieval and grounded answer serving only after "
            "chunk tables, lineage checks, and post-load indexes are all in place."
        ),
        dependency_migration_stages=[MigrationStage.SECONDARY_INDEXES],
        dependency_write_stages=[WriteStage.CHUNK_MEMBERS],
        runtime_tables=["paper_chunks", "paper_chunk_members"],
        runtime_surfaces=["chunk_retrieval", "cited_span_packets", "inline_citations"],
        validation_focus=[
            "retrieval still returns answer-linked papers for graph activation",
            "graph selection remains paper-level while cited spans stay evidence-layer data",
        ],
    ),
)


def build_chunk_runtime_cutover_steps() -> list[ChunkRuntimeCutoverStep]:
    return list(_CHUNK_RUNTIME_CUTOVER_STEPS)
