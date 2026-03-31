from __future__ import annotations

from app.rag.chunk_runtime_contract import (
    ChunkRuntimePhase,
    build_chunk_runtime_cutover_plan,
)
from app.rag.index_contract import IndexBuildPhase
from app.rag.migration_contract import MigrationStage
from app.rag_ingest.write_repository import WriteStage


def test_chunk_runtime_cutover_plan_preserves_expected_phase_order():
    phases = [spec.phase for spec in build_chunk_runtime_cutover_plan()]

    assert phases == [
        ChunkRuntimePhase.MIGRATE_DERIVED_SERVING_TABLES,
        ChunkRuntimePhase.ENABLE_CHUNK_VERSION_WRITES,
        ChunkRuntimePhase.ENABLE_CHUNK_CONTENT_WRITES,
        ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION,
        ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS,
        ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES,
    ]


def test_chunk_runtime_cutover_plan_gates_chunk_reads_on_backfill_and_mentions():
    specs = {spec.phase: spec for spec in build_chunk_runtime_cutover_plan()}

    migrate = specs[ChunkRuntimePhase.MIGRATE_DERIVED_SERVING_TABLES]
    assert migrate.required_migration_stages == [MigrationStage.DERIVED_SERVING]
    assert migrate.required_tables == [
        "paper_chunk_versions",
        "paper_chunks",
        "paper_chunk_members",
    ]

    version_writes = specs[ChunkRuntimePhase.ENABLE_CHUNK_VERSION_WRITES]
    assert version_writes.required_write_stages == [WriteStage.CHUNK_VERSIONS]

    content_writes = specs[ChunkRuntimePhase.ENABLE_CHUNK_CONTENT_WRITES]
    assert content_writes.required_write_stages == [
        WriteStage.CHUNKS,
        WriteStage.CHUNK_MEMBERS,
    ]

    grounded_reads = specs[ChunkRuntimePhase.ENABLE_GROUNDED_PACKET_READS]
    assert grounded_reads.dependency_phases == [
        ChunkRuntimePhase.BACKFILL_DEFAULT_CHUNK_VERSION
    ]
    assert grounded_reads.required_tables == [
        "paper_chunks",
        "paper_chunk_members",
        "paper_citation_mentions",
        "paper_entity_mentions",
    ]

    post_load = specs[ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES]
    assert post_load.required_index_phases == [IndexBuildPhase.POST_LOAD]
