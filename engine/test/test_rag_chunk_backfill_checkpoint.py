from __future__ import annotations

from app.rag.chunk_backfill_checkpoint import (
    checkpoint_paths,
    load_checkpoint_state,
    load_checkpoint_paper_reports,
    reset_checkpoint_state,
    save_checkpoint_paper_report_batch,
    save_checkpoint_state,
    list_paper_report_batch_paths,
    ChunkBackfillCheckpointState,
)


def test_chunk_backfill_checkpoint_round_trips_metadata_and_paper_batches(tmp_path):
    paths = checkpoint_paths("demo-run", root=tmp_path)
    assert paths.metadata_path.exists() is False

    save_checkpoint_state(
        paths,
        state=ChunkBackfillCheckpointState(
            run_id="demo-run",
            chunk_version_key="default-structural-v1",
            source_revision_keys=["s2orc_v2:2026-03-10"],
            parser_version="parser-v1",
            corpus_ids=[12345],
        ),
    )
    save_checkpoint_paper_report_batch(
        paths,
        batch_index=0,
        paper_reports=[{"corpus_id": 12345, "written_rows": 2, "executed": True}],
    )
    state = load_checkpoint_state(paths)

    assert state is not None
    assert state.run_id == "demo-run"
    assert state.chunk_version_key == "default-structural-v1"
    assert list_paper_report_batch_paths(paths) == [paths.paper_reports_dir / "batch-00000000.json"]
    assert load_checkpoint_paper_reports(paths) == [
        {"corpus_id": 12345, "written_rows": 2, "executed": True}
    ]

    reset_checkpoint_state(paths)
    assert load_checkpoint_state(paths) is None
    assert load_checkpoint_paper_reports(paths) == []
