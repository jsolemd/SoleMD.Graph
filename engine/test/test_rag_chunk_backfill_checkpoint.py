from __future__ import annotations

from db.scripts.chunk_backfill_checkpoint import (
    checkpoint_paths,
    load_checkpoint_state,
    reset_checkpoint_state,
    save_checkpoint_state,
)


def test_chunk_backfill_checkpoint_round_trips_report_json(tmp_path):
    paths = checkpoint_paths("demo-run", root=tmp_path)
    assert paths.metadata_path.exists() is False

    save_checkpoint_state(
        paths,
        run_id="demo-run",
        report_json={
            "chunk_version_key": "default-structural-v1",
            "source_revision_keys": ["s2orc_v2:2026-03-10"],
            "parser_version": "parser-v1",
            "corpus_ids": [12345],
            "papers": [],
        },
    )
    state = load_checkpoint_state(paths)

    assert state is not None
    assert state.run_id == "demo-run"
    assert state.report_json["chunk_version_key"] == "default-structural-v1"

    reset_checkpoint_state(paths)
    assert load_checkpoint_state(paths) is None
