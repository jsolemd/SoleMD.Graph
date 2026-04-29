from __future__ import annotations

import asyncio
from time import perf_counter
from uuid import UUID

import asyncpg

from app.corpus.artifacts import (
    MAPPED_ENTITY_DETAIL,
    MAPPED_RELATION_DETAIL,
    PAPER_SCOPE,
    PAPER_SCOPE_IDENTITY_RECONCILIATION,
    RELATION_AGGREGATE,
    ScratchTableRef,
    artifact_complete,
    artifact_ref,
    drop_artifact_table,
    logged_checkpoint_complete,
    load_required_artifact_refs,
    mark_artifact_building,
    mark_artifact_complete,
    mark_artifact_failed,
    mark_logged_checkpoint_building,
    mark_logged_checkpoint_complete,
    mark_logged_checkpoint_failed,
)
from app.corpus.assets import CuratedCorpusAssets, prepare_selector_temp_tables
from app.corpus.entity_signals import ensure_paper_entity_signals
from app.corpus.models import CorpusPlan
from app.corpus.rollup_builders import (
    allocate_candidate_corpus_ids,
    build_mapped_entity_detail,
    build_mapped_relation_detail,
    build_paper_scope,
    build_relation_aggregate,
    reconcile_paper_scope_identity_corpus_ids,
)


SELECTION_ROLLUP_KINDS = (PAPER_SCOPE,)
RELATION_ROLLUP_KINDS = (RELATION_AGGREGATE,)
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
    paper_ref = artifact_ref(corpus_selection_run_id, PAPER_SCOPE)
    entity_signal_checksum = await ensure_paper_entity_signals(
        connection,
        plan=plan,
        paper_scope_ref=paper_ref,
    )
    identity_reconciled = await _paper_scope_identity_reconciliation_complete(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        entity_signal_checksum=entity_signal_checksum,
    )
    if await _phase_signals_exist(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        phase_name="corpus_admission",
    ):
        if not identity_reconciled:
            await _ensure_paper_scope_identity_reconciliation(
                connection,
                corpus_selection_run_id=corpus_selection_run_id,
                plan=plan,
                bucket_count=bucket_count,
                entity_signal_checksum=entity_signal_checksum,
            )
        return await load_required_artifact_refs(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kinds=SELECTION_ROLLUP_KINDS,
        )
    if not identity_reconciled:
        await reconcile_paper_scope_identity_corpus_ids(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            bucket_count=bucket_count,
            entity_signal_checksum=entity_signal_checksum,
        )
    await allocate_candidate_corpus_ids(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        bucket_count=bucket_count,
        entity_signal_checksum=entity_signal_checksum,
    )
    await _ensure_paper_scope_identity_reconciliation(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        bucket_count=bucket_count,
        entity_signal_checksum=entity_signal_checksum,
    )
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=SELECTION_ROLLUP_KINDS,
    )


async def ensure_relation_rollup(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    assets: CuratedCorpusAssets,
    bucket_count: int,
) -> dict[str, ScratchTableRef]:
    await ensure_selection_rollups(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        assets=assets,
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
        artifact_kinds=RELATION_ROLLUP_KINDS,
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


async def relation_rollup_refs(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
) -> dict[str, ScratchTableRef]:
    return await load_required_artifact_refs(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kinds=RELATION_ROLLUP_KINDS,
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


async def _phase_signals_exist(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    phase_name: str,
) -> bool:
    return bool(
        await connection.fetchval(
            """
            SELECT EXISTS (
                SELECT 1
                FROM solemd.corpus_selection_signals
                WHERE corpus_selection_run_id = $1
                  AND phase_name = $2
            )
            """,
            corpus_selection_run_id,
            phase_name,
        )
    )


async def _paper_scope_identity_reconciliation_complete(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    entity_signal_checksum: str,
) -> bool:
    return await logged_checkpoint_complete(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kind=PAPER_SCOPE_IDENTITY_RECONCILIATION,
        plan_checksum=plan.plan_checksum,
        detail_key="entity_signal_checksum",
        detail_value=entity_signal_checksum,
    )


async def _ensure_paper_scope_identity_reconciliation(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    plan: CorpusPlan,
    bucket_count: int,
    entity_signal_checksum: str,
) -> None:
    if await logged_checkpoint_complete(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kind=PAPER_SCOPE_IDENTITY_RECONCILIATION,
        plan_checksum=plan.plan_checksum,
        detail_key="entity_signal_checksum",
        detail_value=entity_signal_checksum,
    ):
        return
    await mark_logged_checkpoint_building(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        plan=plan,
        phase_name="corpus_admission",
        artifact_kind=PAPER_SCOPE_IDENTITY_RECONCILIATION,
        detail={"entity_signal_checksum": entity_signal_checksum},
    )
    try:
        rewritten_count = await reconcile_paper_scope_identity_corpus_ids(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            plan=plan,
            bucket_count=bucket_count,
            entity_signal_checksum=entity_signal_checksum,
        )
    except Exception as exc:
        await mark_logged_checkpoint_failed(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kind=PAPER_SCOPE_IDENTITY_RECONCILIATION,
            error_message=str(exc),
        )
        raise
    await mark_logged_checkpoint_complete(
        connection,
        corpus_selection_run_id=corpus_selection_run_id,
        artifact_kind=PAPER_SCOPE_IDENTITY_RECONCILIATION,
        row_count=rewritten_count,
        detail={"entity_signal_checksum": entity_signal_checksum},
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
    except asyncio.CancelledError:
        await mark_artifact_failed(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kind=artifact_kind,
            error_message="cancelled",
        )
        raise
    except Exception as exc:
        await mark_artifact_failed(
            connection,
            corpus_selection_run_id=corpus_selection_run_id,
            artifact_kind=artifact_kind,
            error_message=str(exc),
        )
        raise
