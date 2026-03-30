from __future__ import annotations

from app.rag.migration_contract import MigrationStage, build_rag_migration_bundles


def test_build_rag_migration_bundles_preserves_deferred_stage_order():
    bundles = build_rag_migration_bundles()

    assert [bundle.stage for bundle in bundles] == [
        MigrationStage.CANONICAL_CORE,
        MigrationStage.CANONICAL_SPANS,
        MigrationStage.ALIGNED_MENTIONS,
        MigrationStage.DERIVED_SERVING,
        MigrationStage.SECONDARY_INDEXES,
    ]


def test_migration_bundles_capture_expected_table_groupings():
    bundles = {bundle.stage: bundle for bundle in build_rag_migration_bundles()}

    assert bundles[MigrationStage.CANONICAL_CORE].tables == [
        "paper_documents",
        "paper_document_sources",
        "paper_sections",
        "paper_reference_entries",
    ]
    assert bundles[MigrationStage.CANONICAL_SPANS].tables == [
        "paper_blocks",
        "paper_sentences",
    ]
    assert bundles[MigrationStage.ALIGNED_MENTIONS].tables == [
        "paper_citation_mentions",
        "paper_entity_mentions",
    ]
    assert bundles[MigrationStage.DERIVED_SERVING].tables == [
        "paper_chunk_versions",
        "paper_chunks",
        "paper_chunk_members",
    ]


def test_secondary_index_stage_depends_on_all_prior_stage_groups():
    bundles = {bundle.stage: bundle for bundle in build_rag_migration_bundles()}

    assert bundles[MigrationStage.SECONDARY_INDEXES].tables == []
    assert bundles[MigrationStage.SECONDARY_INDEXES].dependency_stages == [
        MigrationStage.CANONICAL_CORE,
        MigrationStage.CANONICAL_SPANS,
        MigrationStage.ALIGNED_MENTIONS,
        MigrationStage.DERIVED_SERVING,
    ]
