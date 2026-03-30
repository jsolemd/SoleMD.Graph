"""Structured preview of the deferred chunk-runtime cutover plan."""

from __future__ import annotations

from pydantic import Field

from app.rag.cutover_contract import build_chunk_runtime_cutover_steps
from app.rag.index_contract import IndexBuildPhase, RagIndexSpec, build_index_matrix
from app.rag.parse_contract import ParseContractModel


class ChunkRuntimeCutoverPreview(ParseContractModel):
    step: str
    description: str
    runtime_tables: list[str] = Field(default_factory=list)
    runtime_surfaces: list[str] = Field(default_factory=list)
    dependency_migration_stages: list[str] = Field(default_factory=list)
    dependency_write_stages: list[str] = Field(default_factory=list)
    post_load_indexes: list[str] = Field(default_factory=list)
    validation_focus: list[str] = Field(default_factory=list)


def _relevant_index_names(
    *,
    runtime_tables: list[str],
    index_specs: list[RagIndexSpec],
) -> list[str]:
    relevant_phases = {
        IndexBuildPhase.POST_LOAD.value,
        IndexBuildPhase.RETRIEVAL_READY.value,
    }
    return [
        index_spec.name
        for index_spec in index_specs
        if index_spec.table_name in runtime_tables
        and str(index_spec.build_phase) in relevant_phases
    ]


def build_chunk_runtime_cutover_previews() -> list[ChunkRuntimeCutoverPreview]:
    index_specs = build_index_matrix()

    previews: list[ChunkRuntimeCutoverPreview] = []
    for step in build_chunk_runtime_cutover_steps():
        previews.append(
            ChunkRuntimeCutoverPreview(
                step=step.step,
                description=step.description,
                runtime_tables=step.runtime_tables,
                runtime_surfaces=step.runtime_surfaces,
                dependency_migration_stages=step.dependency_migration_stages,
                dependency_write_stages=step.dependency_write_stages,
                post_load_indexes=_relevant_index_names(
                    runtime_tables=step.runtime_tables,
                    index_specs=index_specs,
                ),
                validation_focus=step.validation_focus,
            )
        )

    return previews
