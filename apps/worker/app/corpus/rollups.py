from __future__ import annotations

from time import perf_counter
from uuid import UUID

import asyncpg

from app.corpus.artifacts import (
    ENTITY_AGGREGATE,
    MAPPED_ENTITY_DETAIL,
    MAPPED_RELATION_DETAIL,
    PAPER_SCOPE,
    RELATION_AGGREGATE,
    ScratchTableRef,
    artifact_complete,
    artifact_ref,
    drop_artifact_table,
    load_required_artifact_refs,
    mark_artifact_building,
    mark_artifact_complete,
    mark_artifact_failed,
)
from app.corpus.assets import CuratedCorpusAssets, prepare_selector_temp_tables
from app.corpus.models import CorpusPlan
from app.corpus.rollup_builders import (
    allocate_candidate_corpus_ids,
    build_entity_aggregate,
    build_mapped_entity_detail,
    build_mapped_relation_detail,
    build_paper_scope,
    build_relation_aggregate,
)


SELECTION_ROLLUP_KINDS = (PAPER_SCOPE, ENTITY_AGGREGATE, RELATION_AGGREGATE)
MAPPED_DETAIL_ROLLUP_KINDS = (MAPPED_ENTITY_DETAIL, MAPPED_RELATION_DETAIL)


async def ensure_selection_rollups(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    assets: CuratedCorpusAssets,
    bucket_count: int,
) -> dict[str, ScratchTableRef]:
    await prepare_selector_temp_tables(connection, assets)
    await _ensure_artifact(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="corpus_admission",
        artifact_kind=PAPER_SCOPE,
        build=lambda: build_paper_scope(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            bucket_count=bucket_count,
        ),
    )
    await _ensure_artifact(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="corpus_admission",
        artifact_kind=ENTITY_AGGREGATE,
        build=lambda: build_entity_aggregate(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
        ),
    )
    await allocate_candidate_corpus_ids(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        bucket_count=bucket_count,
    )
    await _ensure_artifact(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="mapped_promotion",
        artifact_kind=RELATION_AGGREGATE,
        build=lambda: build_relation_aggregate(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
        ),
    )
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=SELECTION_ROLLUP_KINDS,
    )


async def ensure_mapped_detail_rollups(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
) -> dict[str, ScratchTableRef]:
    await _ensure_artifact(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="mapped_surface_materialization",
        artifact_kind=MAPPED_ENTITY_DETAIL,
        build=lambda: build_mapped_entity_detail(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
        ),
    )
    await _ensure_artifact(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="mapped_surface_materialization",
        artifact_kind=MAPPED_RELATION_DETAIL,
        build=lambda: build_mapped_relation_detail(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
        ),
    )
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=MAPPED_DETAIL_ROLLUP_KINDS,
    )


async def selection_rollup_refs(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> dict[str, ScratchTableRef]:
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=SELECTION_ROLLUP_KINDS,
    )


async def mapped_detail_rollup_refs(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> dict[str, ScratchTableRef]:
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=MAPPED_DETAIL_ROLLUP_KINDS,
    )


async def _ensure_artifact(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    phase_name: str,
    artifact_kind: str,
    build,
) -> None:
    if await artifact_complete(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kind=artifact_kind,
        plan_checksum=plan.plan_checksum,
    ):
        return
    ref = artifact_ref(corpus_selection_run_id, artifact_kind)
    await mark_artifact_building(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name=phase_name,
        artifact_kind=artifact_kind,
        ref=ref,
    )
    await drop_artifact_table(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kind=artifact_kind,
    )
    try:
        build_started = perf_counter()
        row_count = await build()
        build_seconds = perf_counter() - build_started
        grant_started = perf_counter()
        await connection.execute(
            f"GRANT SELECT ON TABLE {ref.qualified_name} TO engine_warehouse_read"
        )
        grant_seconds = perf_counter() - grant_started
        analyze_started = perf_counter()
        await connection.execute(f"ANALYZE {ref.qualified_name}")
        analyze_seconds = perf_counter() - analyze_started
        await mark_artifact_complete(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kind=artifact_kind,
            row_count=row_count,
            detail={
                "build_and_index_seconds": round(build_seconds, 6),
                "grant_seconds": round(grant_seconds, 6),
                "analyze_seconds": round(analyze_seconds, 6),
            },
        )
    except Exception as exc:
        await mark_artifact_failed(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kind=artifact_kind,
            error_message=str(exc),
        )
        raise
