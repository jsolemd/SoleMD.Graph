from __future__ import annotations

from app.rag.migration_contract import MigrationStage
from db.previews.rag_migration_sql_preview import build_migration_stage_sql_previews


def test_build_migration_stage_sql_previews_preserves_stage_order():
    previews = build_migration_stage_sql_previews()

    assert [preview.stage for preview in previews] == [
        MigrationStage.CANONICAL_CORE,
        MigrationStage.CANONICAL_SPANS,
        MigrationStage.ALIGNED_MENTIONS,
        MigrationStage.DERIVED_SERVING,
        MigrationStage.SECONDARY_INDEXES,
    ]


def test_canonical_core_stage_renders_table_and_initial_indexes():
    preview_by_stage = {
        preview.stage: preview for preview in build_migration_stage_sql_previews()
    }
    core_statements = preview_by_stage[MigrationStage.CANONICAL_CORE].statements
    statement_by_id = {statement.identifier: statement for statement in core_statements}

    assert "paper_documents" in statement_by_id
    assert "paper_document_sources" in statement_by_id
    assert "idx_paper_document_sources_source_identity" in statement_by_id
    assert (
        statement_by_id["paper_document_sources"].sql.startswith(
            "CREATE TABLE IF NOT EXISTS solemd.paper_document_sources"
        )
    )
    assert "raw_attrs_json JSONB NOT NULL DEFAULT '{}'::jsonb" in statement_by_id[
        "paper_document_sources"
    ].sql


def test_partitioned_table_preview_keeps_hash_partitioning_and_defaults():
    preview_by_stage = {
        preview.stage: preview for preview in build_migration_stage_sql_previews()
    }
    spans = preview_by_stage[MigrationStage.CANONICAL_SPANS].statements
    blocks_statement = next(
        statement for statement in spans if statement.identifier == "paper_blocks"
    )

    assert "linked_asset_ref TEXT" in blocks_statement.sql
    assert "is_retrieval_default BOOLEAN NOT NULL DEFAULT TRUE" in blocks_statement.sql
    assert blocks_statement.sql.endswith("PARTITION BY HASH (corpus_id)")


def test_secondary_index_previews_note_partitioned_parent_and_expression_targets():
    preview_by_stage = {
        preview.stage: preview for preview in build_migration_stage_sql_previews()
    }
    secondary = {
        statement.identifier: statement
        for statement in preview_by_stage[MigrationStage.SECONDARY_INDEXES].statements
    }

    blocks_fts = secondary["idx_paper_blocks_search_tsv"]
    reverse_lookup = secondary["idx_paper_citation_mentions_matched_corpus_lookup"]

    assert "CREATE INDEX IF NOT EXISTS idx_paper_blocks_search_tsv ON ONLY solemd.paper_blocks USING gin ((search_tsv))" in blocks_fts.sql
    assert blocks_fts.execution_note is not None
    assert "Partitioned post-load index preview" in blocks_fts.execution_note
    assert "expression target" in blocks_fts.execution_note

    assert "CREATE INDEX IF NOT EXISTS idx_paper_citation_mentions_matched_corpus_lookup ON ONLY solemd.paper_citation_mentions USING btree (matched_corpus_id, corpus_id)" in reverse_lookup.sql
    assert reverse_lookup.execution_note is not None
    assert "Partitioned post-load index preview" in reverse_lookup.execution_note
