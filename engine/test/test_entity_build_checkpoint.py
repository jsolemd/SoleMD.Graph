from app.corpus.entity_build_checkpoint import (
    CHECKPOINT_VERSION,
    checkpoint_paths,
    load_checkpoint_state,
    reset_checkpoint_state,
    update_checkpoint_state,
)


def test_entity_build_checkpoint_roundtrip(tmp_path) -> None:
    paths = checkpoint_paths(root=tmp_path)

    assert load_checkpoint_state(paths) is None

    update_checkpoint_state(
        paths,
        payload={
            "checkpoint_version": CHECKPOINT_VERSION,
            "run_id": "entity-run",
            "completed_stages": ["catalog"],
            "remaining_stages": ["aliases", "presence"],
        },
    )

    state = load_checkpoint_state(paths)

    assert state is not None
    assert state["run_id"] == "entity-run"
    assert state["completed_stages"] == ["catalog"]
    assert state["remaining_stages"] == ["aliases", "presence"]


def test_entity_build_checkpoint_reset(tmp_path) -> None:
    paths = checkpoint_paths(root=tmp_path)

    update_checkpoint_state(
        paths,
        payload={
            "checkpoint_version": CHECKPOINT_VERSION,
            "run_id": "entity-run",
        },
    )
    reset_checkpoint_state(paths)

    assert load_checkpoint_state(paths) is None
