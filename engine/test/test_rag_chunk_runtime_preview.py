from __future__ import annotations

from db.previews.rag_chunk_runtime_preview import build_chunk_runtime_cutover_previews


def test_chunk_runtime_preview_carries_post_load_chunk_indexes():
    previews = {preview.step: preview for preview in build_chunk_runtime_cutover_previews()}

    enable_runtime = previews["enable_runtime_serving"]
    assert enable_runtime.runtime_tables == ["paper_chunks", "paper_chunk_members"]

    apply_indexes = previews["apply_post_load_indexes"]
    assert "idx_paper_chunks_search_tsv" in apply_indexes.post_load_indexes
