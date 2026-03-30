"""Inspect live chunk-runtime readiness for grounded answers."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

# Add engine/ to path so app imports work when run directly.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from pydantic import Field

from app import db
from app.rag.chunk_cutover import ChunkCutoverStepKey, build_chunk_cutover_steps
from app.rag.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag.chunk_runtime_contract import (
    ChunkRuntimePhase,
    build_chunk_runtime_cutover_plan,
)
from app.rag.grounded_runtime import (
    GroundedAnswerRuntimeStatus,
    get_grounded_answer_runtime_status,
)
from app.rag.index_contract import IndexBuildPhase, build_index_matrix
from app.rag.parse_contract import ParseContractModel


_COUNT_SQL = """
SELECT
    (SELECT COUNT(*)
     FROM solemd.paper_chunk_versions
     WHERE chunk_version_key = %s) AS chunk_version_rows,
    (SELECT COUNT(*)
     FROM solemd.paper_chunks
     WHERE chunk_version_key = %s
       AND corpus_id = ANY(%s)) AS chunk_rows,
    (SELECT COUNT(*)
     FROM solemd.paper_chunk_members
     WHERE chunk_version_key = %s
       AND corpus_id = ANY(%s)) AS chunk_member_rows,
    (SELECT COUNT(*)
     FROM solemd.paper_citation_mentions
     WHERE corpus_id = ANY(%s)) AS citation_mention_rows,
    (SELECT COUNT(*)
     FROM solemd.paper_entity_mentions
     WHERE corpus_id = ANY(%s)) AS entity_mention_rows,
    (SELECT COUNT(DISTINCT corpus_id)
     FROM solemd.paper_chunks
     WHERE chunk_version_key = %s
       AND corpus_id = ANY(%s)) AS chunk_covered_corpus_ids,
    (SELECT COUNT(DISTINCT corpus_id)
     FROM solemd.paper_chunk_members
     WHERE chunk_version_key = %s
       AND corpus_id = ANY(%s)) AS chunk_member_covered_corpus_ids
"""

_INDEX_STATUS_SQL = """
WITH requested(index_name) AS (
    SELECT unnest(%s::TEXT[])
)
SELECT
    r.index_name,
    EXISTS (
        SELECT 1
        FROM pg_indexes i
        WHERE i.schemaname = 'solemd'
          AND i.indexname = r.index_name
    ) AS is_present
FROM requested r
ORDER BY r.index_name
"""


class ChunkRuntimeCounts(ParseContractModel):
    chunk_version_rows: int = 0
    chunk_rows: int = 0
    chunk_member_rows: int = 0
    citation_mention_rows: int = 0
    entity_mention_rows: int = 0
    chunk_covered_corpus_ids: int = 0
    chunk_member_covered_corpus_ids: int = 0


class ChunkRuntimeInspection(ParseContractModel):
    corpus_ids: list[int] = Field(default_factory=list)
    chunk_version_key: str
    grounded_answer_runtime_ready: bool
    full_cutover_ready: bool
    runtime_status: GroundedAnswerRuntimeStatus
    counts: ChunkRuntimeCounts | None = None
    present_post_load_indexes: list[str] = Field(default_factory=list)
    missing_post_load_indexes: list[str] = Field(default_factory=list)
    pending_runtime_phases: list[ChunkRuntimePhase] = Field(default_factory=list)
    pending_cutover_steps: list[ChunkCutoverStepKey] = Field(default_factory=list)


def _normalize_corpus_ids(corpus_ids: list[int] | tuple[int, ...]) -> list[int]:
    return list(dict.fromkeys(int(corpus_id) for corpus_id in corpus_ids))


def _post_load_index_names() -> list[str]:
    return [
        spec.name
        for spec in build_index_matrix()
        if spec.build_phase == IndexBuildPhase.POST_LOAD
        and spec.table_name in {"paper_chunks", "paper_chunk_members"}
    ]


def _load_counts(
    *,
    cursor,
    corpus_ids: list[int],
    chunk_version_key: str,
) -> ChunkRuntimeCounts:
    cursor.execute(
        _COUNT_SQL,
        (
            chunk_version_key,
            chunk_version_key,
            corpus_ids,
            chunk_version_key,
            corpus_ids,
            corpus_ids,
            corpus_ids,
            chunk_version_key,
            corpus_ids,
            chunk_version_key,
            corpus_ids,
        ),
    )
    row = cursor.fetchone() or {}
    return ChunkRuntimeCounts.model_validate(row)


def _load_post_load_index_presence(*, cursor) -> tuple[list[str], list[str]]:
    requested = _post_load_index_names()
    if not requested:
        return [], []

    cursor.execute(_INDEX_STATUS_SQL, (requested,))
    rows = cursor.fetchall()
    present = [row["index_name"] for row in rows if row["is_present"]]
    missing = [row["index_name"] for row in rows if not row["is_present"]]
    return present, missing


def _pending_runtime_phases(
    *,
    runtime_status: GroundedAnswerRuntimeStatus,
    missing_post_load_indexes: list[str],
) -> list[ChunkRuntimePhase]:
    phases = [spec.phase for spec in build_chunk_runtime_cutover_plan()]
    if runtime_status.missing_tables:
        return phases
    if not runtime_status.has_chunk_version:
        return phases[1:]
    if runtime_status.missing_corpus_ids:
        return phases[3:]
    if missing_post_load_indexes:
        return [ChunkRuntimePhase.APPLY_POST_LOAD_SERVING_INDEXES]
    return []


def _pending_cutover_steps(
    *,
    runtime_status: GroundedAnswerRuntimeStatus,
    missing_post_load_indexes: list[str],
) -> list[ChunkCutoverStepKey]:
    steps = [step.step for step in build_chunk_cutover_steps()]
    if runtime_status.missing_tables:
        return steps
    if not runtime_status.has_chunk_version:
        return steps
    if runtime_status.missing_corpus_ids:
        return [
            ChunkCutoverStepKey.BACKFILL_CHUNKS,
            ChunkCutoverStepKey.BACKFILL_CHUNK_MEMBERS,
            ChunkCutoverStepKey.VALIDATE_LINEAGE,
            ChunkCutoverStepKey.APPLY_POST_LOAD_INDEXES,
            ChunkCutoverStepKey.ENABLE_RUNTIME_SERVING,
        ]
    if missing_post_load_indexes:
        return [ChunkCutoverStepKey.APPLY_POST_LOAD_INDEXES]
    return []


def inspect_chunk_runtime(
    *,
    corpus_ids: list[int] | tuple[int, ...],
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
) -> ChunkRuntimeInspection:
    normalized_corpus_ids = _normalize_corpus_ids(corpus_ids)
    runtime_status = get_grounded_answer_runtime_status(
        corpus_ids=normalized_corpus_ids,
        chunk_version_key=chunk_version_key,
        connect=connect,
    )

    counts = None
    present_indexes: list[str] = []
    missing_indexes: list[str] = []
    if normalized_corpus_ids and not runtime_status.missing_tables:
        connect_fn = connect or db.pooled
        with connect_fn() as conn, conn.cursor() as cur:
            counts = _load_counts(
                cursor=cur,
                corpus_ids=normalized_corpus_ids,
                chunk_version_key=chunk_version_key,
            )
            present_indexes, missing_indexes = _load_post_load_index_presence(cursor=cur)

    pending_runtime_phases = _pending_runtime_phases(
        runtime_status=runtime_status,
        missing_post_load_indexes=missing_indexes,
    )
    pending_cutover_steps = _pending_cutover_steps(
        runtime_status=runtime_status,
        missing_post_load_indexes=missing_indexes,
    )
    full_cutover_ready = runtime_status.enabled and not missing_indexes

    return ChunkRuntimeInspection(
        corpus_ids=normalized_corpus_ids,
        chunk_version_key=chunk_version_key,
        grounded_answer_runtime_ready=runtime_status.enabled,
        full_cutover_ready=full_cutover_ready,
        runtime_status=runtime_status,
        counts=counts,
        present_post_load_indexes=present_indexes,
        missing_post_load_indexes=missing_indexes,
        pending_runtime_phases=pending_runtime_phases,
        pending_cutover_steps=pending_cutover_steps,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Inspect chunk-runtime readiness for grounded answers.",
    )
    parser.add_argument(
        "--corpus-id",
        dest="corpus_ids",
        action="append",
        type=int,
        default=[],
        help="Corpus ID to inspect. Repeat for multiple papers.",
    )
    parser.add_argument(
        "--chunk-version-key",
        default=DEFAULT_CHUNK_VERSION_KEY,
        help="Chunk version key to inspect.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    inspection = inspect_chunk_runtime(
        corpus_ids=args.corpus_ids,
        chunk_version_key=args.chunk_version_key,
    )
    print(inspection.model_dump_json(indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
