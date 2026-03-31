"""Filesystem checkpoints for resumable source-locator refresh runs."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import settings
from app.rag.parse_contract import ParseContractModel
from pydantic import Field


CHECKPOINT_VERSION = 1


@dataclass(frozen=True, slots=True)
class RagSourceLocatorCheckpointPaths:
    root: Path
    metadata_path: Path


class RagSourceLocatorProgress(ParseContractModel):
    completed_units: list[str] = Field(default_factory=list)
    unit_ordinals: dict[str, int] = Field(default_factory=dict)


class RagSourceLocatorCheckpointState(ParseContractModel):
    version: int = CHECKPOINT_VERSION
    run_id: str
    requested_corpus_ids: list[int] = Field(default_factory=list)
    limit: int | None = None
    max_s2_shards: int | None = None
    max_bioc_archives: int | None = None
    skip_s2: bool = False
    skip_bioc: bool = False
    s2_progress: RagSourceLocatorProgress
    bioc_progress: RagSourceLocatorProgress
    report_json: dict[str, object]


def checkpoint_paths(
    run_id: str,
    *,
    root: Path | None = None,
) -> RagSourceLocatorCheckpointPaths:
    candidate_roots = (
        [root]
        if root is not None
        else [
            settings.graph_tmp_root_path / "rag_source_locator",
            settings.project_root_path / ".tmp" / "rag_source_locator",
        ]
    )
    run_root: Path | None = None
    last_error: OSError | None = None
    for candidate_root in candidate_roots:
        try:
            candidate_run_root = candidate_root / run_id
            candidate_run_root.mkdir(parents=True, exist_ok=True)
            run_root = candidate_run_root
            break
        except OSError as exc:
            last_error = exc
    if run_root is None:
        assert last_error is not None
        raise last_error
    return RagSourceLocatorCheckpointPaths(
        root=run_root,
        metadata_path=run_root / "checkpoint.json",
    )


def load_checkpoint_state(
    paths: RagSourceLocatorCheckpointPaths,
) -> RagSourceLocatorCheckpointState | None:
    if not paths.metadata_path.exists():
        return None
    return RagSourceLocatorCheckpointState.model_validate_json(paths.metadata_path.read_text())


def save_checkpoint_state(
    paths: RagSourceLocatorCheckpointPaths,
    *,
    state: RagSourceLocatorCheckpointState,
) -> RagSourceLocatorCheckpointState:
    tmp_path = paths.metadata_path.with_suffix(".tmp")
    tmp_path.write_text(state.model_dump_json(indent=2))
    tmp_path.replace(paths.metadata_path)
    return state


def reset_checkpoint_state(paths: RagSourceLocatorCheckpointPaths) -> None:
    if paths.metadata_path.exists():
        paths.metadata_path.unlink()
