"""Deferred migration-sequencing contract for the future RAG warehouse."""

from __future__ import annotations

from enum import StrEnum

from pydantic import Field, model_validator

from app.rag.parse_contract import ParseContractModel


class MigrationStage(StrEnum):
    CANONICAL_CORE = "canonical_core"
    CANONICAL_SPANS = "canonical_spans"
    ALIGNED_MENTIONS = "aligned_mentions"
    DERIVED_SERVING = "derived_serving"
    SECONDARY_INDEXES = "secondary_indexes"


class RagMigrationBundleSpec(ParseContractModel):
    stage: MigrationStage
    description: str
    tables: list[str] = Field(default_factory=list)
    dependency_stages: list[MigrationStage] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_bundle(self) -> "RagMigrationBundleSpec":
        if not self.description:
            raise ValueError("description must not be empty")
        if self.stage != MigrationStage.SECONDARY_INDEXES and not self.tables:
            raise ValueError("non-index migration stages must define tables")
        return self


_MIGRATION_BUNDLES: tuple[RagMigrationBundleSpec, ...] = (
    RagMigrationBundleSpec(
        stage=MigrationStage.CANONICAL_CORE,
        description="Create low-fanout canonical document, source, section, and reference tables first.",
        tables=[
            "paper_documents",
            "paper_document_sources",
            "paper_sections",
            "paper_reference_entries",
        ],
    ),
    RagMigrationBundleSpec(
        stage=MigrationStage.CANONICAL_SPANS,
        description="Create the high-volume canonical block and sentence spine after the core document tables exist.",
        tables=[
            "paper_blocks",
            "paper_sentences",
        ],
        dependency_stages=[MigrationStage.CANONICAL_CORE],
    ),
    RagMigrationBundleSpec(
        stage=MigrationStage.ALIGNED_MENTIONS,
        description="Add aligned citation and entity mention tables only after canonical span targets exist.",
        tables=[
            "paper_citation_mentions",
            "paper_entity_mentions",
        ],
        dependency_stages=[MigrationStage.CANONICAL_SPANS],
    ),
    RagMigrationBundleSpec(
        stage=MigrationStage.DERIVED_SERVING,
        description="Create derived chunk version, chunk, and chunk-member serving tables after canonical spans and mentions are stable.",
        tables=[
            "paper_chunk_versions",
            "paper_chunks",
            "paper_chunk_members",
        ],
        dependency_stages=[MigrationStage.CANONICAL_SPANS, MigrationStage.ALIGNED_MENTIONS],
    ),
    RagMigrationBundleSpec(
        stage=MigrationStage.SECONDARY_INDEXES,
        description="Apply heavier secondary indexes and any retrieval-serving DDL only after the base tables are live and the rebuild-safe window is open.",
        dependency_stages=[
            MigrationStage.CANONICAL_CORE,
            MigrationStage.CANONICAL_SPANS,
            MigrationStage.ALIGNED_MENTIONS,
            MigrationStage.DERIVED_SERVING,
        ],
    ),
)


def build_rag_migration_bundles() -> list[RagMigrationBundleSpec]:
    return list(_MIGRATION_BUNDLES)
