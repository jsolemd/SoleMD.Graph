"""Shared types and helpers for the graph build pipeline.

Extracted from build.py to break circular imports between the orchestrator
and its submodules (build_inputs, build_stages, build_writes, build_publish,
build_dispatch).
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from psycopg.types.json import Jsonb

from app import db
from app.config import settings
from app.graph.checkpoints import GraphBuildCheckpointPaths
from app.graph.checkpoints import load_checkpoint_metadata

if TYPE_CHECKING:
    import numpy


@dataclass(frozen=True, slots=True)
class GraphBuildSummary:
    total_mapped: int
    total_mapped_papers: int
    current_mapped: int
    current_base: int
    ready_for_layout: int
    missing_embeddings: int
    missing_text_availability: int


@dataclass(frozen=True, slots=True)
class GraphBuildResult:
    graph_run_id: str
    selected_papers: int
    cluster_count: int
    layout_backend: str
    cluster_backend: str
    bundle_dir: str | None
    bundle_checksum: str | None


@dataclass(frozen=True, slots=True)
class GraphInputData:
    corpus_ids: numpy.ndarray
    citation_counts: numpy.ndarray


def _checkpoint_stage_complete(
    paths: GraphBuildCheckpointPaths,
    stage: str,
) -> bool:
    metadata = load_checkpoint_metadata(paths)
    return bool(metadata.get("stages", {}).get(stage))


def _mark_graph_run_stage(
    graph_run_id: str,
    *,
    stage: str,
    paths: GraphBuildCheckpointPaths | None = None,
    extra: dict | None = None,
) -> None:
    payload = {
        "stage": stage,
    }
    if paths is not None:
        payload["checkpoint_dir"] = str(paths.root)
    if extra:
        payload.update(extra)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET qa_summary = COALESCE(qa_summary, '{}'::jsonb) || %s::jsonb,
                updated_at = now()
            WHERE id = %s
            """,
            (Jsonb(payload), graph_run_id),
        )
        conn.commit()


def _graph_temp_dir() -> Path:
    path = settings.graph_tmp_root_path / "graph_build"
    path.mkdir(parents=True, exist_ok=True)
    return path
