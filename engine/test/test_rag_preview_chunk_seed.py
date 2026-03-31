from __future__ import annotations

from db.scripts.preview_chunk_seed import (
    build_default_chunk_version_seed_preview,
)


def test_default_chunk_version_seed_preview_uses_canonical_key_and_upsert_shape():
    preview = build_default_chunk_version_seed_preview(
        source_revision_keys=["biocxml:2026-03-21", "s2orc_v2:2026-03-10"],
        parser_version="parser-v1",
        embedding_model="text-embedding-3-large",
    )

    assert preview.chunk_version_key == "default-structural-v1"
    assert preview.source_revision_keys == [
        "biocxml:2026-03-21",
        "s2orc_v2:2026-03-10",
    ]
    assert "INSERT INTO solemd.paper_chunk_versions" in preview.sql
    assert "ON CONFLICT (chunk_version_key) DO UPDATE SET" in preview.sql
    assert "ARRAY['biocxml:2026-03-21', 's2orc_v2:2026-03-10']::TEXT[]" in preview.sql
    assert "'text-embedding-3-large'" in preview.sql


def test_default_chunk_version_seed_preview_allows_preview_key_override():
    preview = build_default_chunk_version_seed_preview(
        source_revision_keys=["s2orc_v2:2026-03-10"],
        parser_version="mixed:parser-v1,parser-v2",
        chunk_version_key="preview-stanza-hybrid-v1",
    )

    assert preview.chunk_version_key == "preview-stanza-hybrid-v1"
    assert "'preview-stanza-hybrid-v1'" in preview.sql
