from __future__ import annotations

from app.rag.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag.cutover_contract import (
    ChunkRuntimeCutoverStepKey,
    build_chunk_runtime_cutover_steps,
)


def test_build_chunk_runtime_cutover_steps_preserves_expected_order():
    steps = build_chunk_runtime_cutover_steps()

    assert [step.step for step in steps] == [
        ChunkRuntimeCutoverStepKey.SEED_CHUNK_VERSION,
        ChunkRuntimeCutoverStepKey.BACKFILL_CHUNKS,
        ChunkRuntimeCutoverStepKey.BACKFILL_CHUNK_MEMBERS,
        ChunkRuntimeCutoverStepKey.VALIDATE_LINEAGE,
        ChunkRuntimeCutoverStepKey.APPLY_POST_LOAD_INDEXES,
        ChunkRuntimeCutoverStepKey.ENABLE_RUNTIME_SERVING,
    ]


def test_enable_runtime_serving_keeps_graph_activation_paper_level():
    steps = {step.step: step for step in build_chunk_runtime_cutover_steps()}

    assert (
        f"default chunk version {DEFAULT_CHUNK_VERSION_KEY} exists"
        in steps[ChunkRuntimeCutoverStepKey.SEED_CHUNK_VERSION].validation_focus
    )
    assert steps[ChunkRuntimeCutoverStepKey.ENABLE_RUNTIME_SERVING].runtime_surfaces == [
        "chunk_retrieval",
        "cited_span_packets",
        "inline_citations",
    ]
    assert (
        "graph selection remains paper-level while cited spans stay evidence-layer data"
        in steps[ChunkRuntimeCutoverStepKey.ENABLE_RUNTIME_SERVING].validation_focus
    )
