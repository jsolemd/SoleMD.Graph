"""Filesystem checkpoints for resumable chunk backfill runs."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import shutil

from app.config import settings
from app.rag.parse_contract import ParseContractModel


CHECKPOINT_VERSION = 2


@dataclass(frozen=True, slots=True)
class ChunkBackfillCheckpointPaths:
    root: Path
    metadata_path: Path
    paper_reports_dir: Path


class ChunkBackfillCheckpointState(ParseContractModel):
    version: int = CHECKPOINT_VERSION
    run_id: str
    chunk_version_key: str
    source_revision_keys: list[str]
    parser_version: str
    corpus_ids: list[int]


def checkpoint_paths(
    run_id: str,
    *,
    root: Path | None = None,
) -> ChunkBackfillCheckpointPaths:
    candidate_roots = (
        [root]
        if root is not None
        else [
            settings.graph_tmp_root_path / "rag_chunk_backfill",
            settings.project_root_path / ".tmp" / "rag_chunk_backfill",
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
    return ChunkBackfillCheckpointPaths(
        root=run_root,
        metadata_path=run_root / "checkpoint.json",
        paper_reports_dir=run_root / "paper_reports",
    )


def list_paper_report_batch_paths(paths: ChunkBackfillCheckpointPaths) -> list[Path]:
    if not paths.paper_reports_dir.exists():
        return []
    return sorted(paths.paper_reports_dir.glob("batch-*.json"))


def load_checkpoint_state(
    paths: ChunkBackfillCheckpointPaths,
) -> ChunkBackfillCheckpointState | None:
    if not paths.metadata_path.exists():
        return None
    return ChunkBackfillCheckpointState.model_validate_json(paths.metadata_path.read_text())


def load_checkpoint_paper_reports(
    paths: ChunkBackfillCheckpointPaths,
) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for batch_path in list_paper_report_batch_paths(paths):
        batch_payload = json.loads(batch_path.read_text())
        if not isinstance(batch_payload, list):
            raise ValueError(f"invalid checkpoint paper-report batch: {batch_path}")
        for item in batch_payload:
            if not isinstance(item, dict):
                raise ValueError(f"invalid checkpoint paper-report row: {batch_path}")
            payloads.append(item)
    return payloads


def save_checkpoint_state(
    paths: ChunkBackfillCheckpointPaths,
    *,
    state: ChunkBackfillCheckpointState,
) -> ChunkBackfillCheckpointState:
    tmp_path = paths.metadata_path.with_suffix(".tmp")
    tmp_path.write_text(state.model_dump_json(indent=2))
    tmp_path.replace(paths.metadata_path)
    return state


def save_checkpoint_paper_report_batch(
    paths: ChunkBackfillCheckpointPaths,
    *,
    batch_index: int,
    paper_reports: list[dict[str, object]],
) -> Path:
    paths.paper_reports_dir.mkdir(parents=True, exist_ok=True)
    target_path = paths.paper_reports_dir / f"batch-{batch_index:08d}.json"
    tmp_path = target_path.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(paper_reports, indent=2) + "\n")
    tmp_path.replace(target_path)
    return target_path


def reset_checkpoint_state(paths: ChunkBackfillCheckpointPaths) -> None:
    if paths.metadata_path.exists():
        paths.metadata_path.unlink()
    if paths.paper_reports_dir.exists():
        shutil.rmtree(paths.paper_reports_dir)
