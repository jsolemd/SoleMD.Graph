"""Filesystem checkpoints for resumable RAG warehouse refresh runs."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

from app.config import settings
from app.rag.parse_contract import ParseContractModel


CHECKPOINT_VERSION = 1


@dataclass(frozen=True, slots=True)
class RagRefreshCheckpointPaths:
    root: Path
    metadata_path: Path


class RagRefreshCheckpointState(ParseContractModel):
    version: int = CHECKPOINT_VERSION
    run_id: str
    parser_version: str
    refresh_existing: bool = False
    explicit_corpus_ids: list[int] = []
    limit: int | None = None
    completed_s2_shards: list[str] = []
    completed_bioc_archives: list[str] = []
    report_json: dict[str, object]


def checkpoint_paths(
    run_id: str,
    *,
    root: Path | None = None,
) -> RagRefreshCheckpointPaths:
    candidate_roots = (
        [root]
        if root is not None
        else [
            settings.graph_tmp_root_path / "rag_refresh",
            settings.project_root_path / ".tmp" / "rag_refresh",
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
    return RagRefreshCheckpointPaths(
        root=run_root,
        metadata_path=run_root / "checkpoint.json",
    )


def load_checkpoint_state(
    paths: RagRefreshCheckpointPaths,
) -> RagRefreshCheckpointState | None:
    if not paths.metadata_path.exists():
        return None
    return RagRefreshCheckpointState.model_validate_json(paths.metadata_path.read_text())


def save_checkpoint_state(
    paths: RagRefreshCheckpointPaths,
    *,
    state: RagRefreshCheckpointState,
) -> RagRefreshCheckpointState:
    tmp_path = paths.metadata_path.with_suffix(".tmp")
    tmp_path.write_text(state.model_dump_json(indent=2))
    tmp_path.replace(paths.metadata_path)
    return state


def reset_checkpoint_state(paths: RagRefreshCheckpointPaths) -> None:
    if paths.metadata_path.exists():
        paths.metadata_path.unlink()
