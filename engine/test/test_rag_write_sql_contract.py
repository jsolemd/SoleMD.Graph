from __future__ import annotations

from app.rag_ingest.write_repository import WriteMethod, WriteStage
from app.rag_ingest.write_sql_contract import build_stage_sql_templates


def test_build_stage_sql_templates_tracks_all_planned_stages():
    templates = {template.stage: template for template in build_stage_sql_templates()}

    assert set(templates) == {
        WriteStage.DOCUMENTS,
        WriteStage.DOCUMENT_SOURCES,
        WriteStage.SECTIONS,
        WriteStage.BLOCKS,
        WriteStage.SENTENCES,
        WriteStage.REFERENCES,
        WriteStage.CITATIONS,
        WriteStage.ENTITIES,
        WriteStage.CHUNK_VERSIONS,
        WriteStage.CHUNKS,
        WriteStage.CHUNK_MEMBERS,
    }


def test_copy_stage_templates_define_staging_sql_and_merge_sql():
    templates = {template.stage: template for template in build_stage_sql_templates()}
    citations = templates[WriteStage.CITATIONS]

    assert citations.write_method == WriteMethod.COPY_STAGE_UPSERT
    assert citations.staging_table_name == "_stg_paper_citation_mentions"
    assert citations.create_stage_sql == (
        "CREATE TEMP TABLE _stg_paper_citation_mentions "
        "(LIKE solemd.paper_citation_mentions INCLUDING DEFAULTS) ON COMMIT DROP"
    )
    assert citations.copy_sql is not None
    assert citations.copy_sql.startswith("COPY _stg_paper_citation_mentions (")
    assert citations.copy_sql.endswith(") FROM STDIN")
    assert "ON CONFLICT (corpus_id, source_system, source_revision, source_citation_key, source_start_offset)" in citations.merge_sql
    assert "alignment_status = EXCLUDED.alignment_status" in citations.merge_sql
    assert "IS DISTINCT FROM EXCLUDED.alignment_status" in citations.merge_sql


def test_upsert_rows_template_uses_named_placeholders_without_staging():
    templates = {template.stage: template for template in build_stage_sql_templates()}
    chunk_versions = templates[WriteStage.CHUNK_VERSIONS]

    assert chunk_versions.write_method == WriteMethod.UPSERT_ROWS
    assert chunk_versions.staging_table_name is None
    assert chunk_versions.create_stage_sql is None
    assert chunk_versions.copy_sql is None
    assert "%(chunk_version_key)s" in chunk_versions.merge_sql
    assert "ON CONFLICT (chunk_version_key)" in chunk_versions.merge_sql


def test_merge_sql_uses_non_primary_columns_for_updates():
    templates = {template.stage: template for template in build_stage_sql_templates()}
    documents = templates[WriteStage.DOCUMENTS]

    assert documents.primary_key_columns == ["corpus_id"]
    assert "corpus_id = EXCLUDED.corpus_id" not in documents.merge_sql
    assert "title = EXCLUDED.title" in documents.merge_sql
    assert "solemd.paper_documents.title IS DISTINCT FROM EXCLUDED.title" in documents.merge_sql
