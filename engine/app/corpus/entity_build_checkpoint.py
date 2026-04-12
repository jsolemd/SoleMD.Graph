"""Durable checkpoint metadata for resumable entity projection rebuilds."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from app.config import settings

CHECKPOINT_VERSION = 1


@dataclass(frozen=True, slots=True)
class EntityBuildCheckpointPaths:
    root: Path
    metadata_path: Path


def checkpoint_paths(*, root: Path | None = None) -> EntityBuildCheckpointPaths:
    checkpoint_root = root or (settings.graph_tmp_root_path / "entity_build")
    checkpoint_root.mkdir(parents=True, exist_ok=True)
    return EntityBuildCheckpointPaths(
        root=checkpoint_root,
        metadata_path=checkpoint_root / "checkpoint.json",
    )


def load_checkpoint_state(paths: EntityBuildCheckpointPaths) -> dict | None:
    if not paths.metadata_path.exists():
        return None
    state = json.loads(paths.metadata_path.read_text())
    if state.get("checkpoint_version") != CHECKPOINT_VERSION:
        return None
    return state


def update_checkpoint_state(
    paths: EntityBuildCheckpointPaths,
    *,
    payload: dict,
) -> dict:
    state = load_checkpoint_state(paths) or {"checkpoint_version": CHECKPOINT_VERSION}
    state["checkpoint_version"] = CHECKPOINT_VERSION
    state.update(payload)
    tmp_path = paths.metadata_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(state, indent=2, sort_keys=True))
    tmp_path.replace(paths.metadata_path)
    return state


def reset_checkpoint_state(paths: EntityBuildCheckpointPaths) -> None:
    if paths.metadata_path.exists():
        paths.metadata_path.unlink()
