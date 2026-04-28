from __future__ import annotations

from uuid import UUID

import asyncpg

from app.config import Settings
from app.corpus.assets import CuratedCorpusAssets
from app.corpus.errors import (
    CorpusSelectionAlreadyInProgress,
    CorpusSelectionAlreadyPublished,
    SelectorPlanDrift,
    UpstreamReleaseMissing,
    UpstreamReleaseNotPublished,
)
from app.corpus.models import (
    CorpusPlan,
    CorpusSelectionRunRecord,
    StartCorpusSelectionRequest,
)
from app.corpus.policies import build_selection_policy
from app.corpus.runtime_support import (
    CORPUS_SELECTION_STATUS_ASSETS,
    CORPUS_SELECTION_STATUS_CANONICAL_MATERIALIZATION,
    CORPUS_SELECTION_STATUS_CORPUS_ADMISSION,
    CORPUS_SELECTION_STATUS_FAILED,
    CORPUS_SELECTION_STATUS_MAPPED_PROMOTION,
    CORPUS_SELECTION_STATUS_PUBLISHED,
    CORPUS_SELECTION_STATUS_SELECTION_SUMMARY,
    CORPUS_SELECTION_STATUS_STARTED,
    digest_payload,
    utc_now_iso,
)


async def build_selection_plan(
    connection: asyncpg.Connection,
    request: StartCorpusSelectionRequest,
    assets: CuratedCorpusAssets,
    *,
    runtime_settings: Settings,
) -> CorpusPlan:
    s2_source_release_id = await _require_loaded_release(
        connection,
        source_name="s2",
        release_tag=request.s2_release_tag,
    )
    pt3_source_release_id = await _require_loaded_release(
        connection,
        source_name="pt3",
        release_tag=request.pt3_release_tag,
    )
    selection_policy = build_selection_policy(selector_version=request.selector_version)
    base_plan = CorpusPlan(
        s2_release_tag=request.s2_release_tag,
        pt3_release_tag=request.pt3_release_tag,
        s2_source_release_id=s2_source_release_id,
        pt3_source_release_id=pt3_source_release_id,
        selector_version=request.selector_version,
        selection_policy=selection_policy,
        asset_checksums=assets.asset_checksums,
        asset_manifest=assets.asset_manifest,
        journal_name_count=len(assets.journal_names),
        venue_pattern_count=len(assets.venue_patterns),
        entity_rule_count=len(assets.entity_rules),
        relation_rule_count=len(assets.relation_rules),
        materialization_bucket_count=runtime_settings.corpus_materialization_bucket_count,
        plan_checksum="0" * 64,
    )
    checksum = digest_payload(base_plan.model_dump(mode="json", exclude={"plan_checksum"}))
    return base_plan.model_copy(update={"plan_checksum": checksum})


async def acquire_selection_lock(
    connection: asyncpg.Connection,
    request: StartCorpusSelectionRequest,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        f"corpus:{request.s2_release_tag}:{request.pt3_release_tag}:{request.selector_version}",
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise CorpusSelectionAlreadyInProgress(
            "corpus selection is already running for the requested release pair"
        )
    return int(lock_key)


async def open_or_resume_selection_run(
    connection: asyncpg.Connection,
    *,
    request: StartCorpusSelectionRequest,
    plan: CorpusPlan,
    lock_key: int,
) -> CorpusSelectionRunRecord:
    latest = await connection.fetchrow(
        """
        SELECT
            corpus_selection_run_id,
            status,
            phases_completed,
            last_completed_phase,
            plan_checksum,
            plan_manifest
        FROM solemd.corpus_selection_runs
        WHERE s2_source_release_id = $1
          AND pt3_source_release_id = $2
          AND selector_version = $3
        ORDER BY started_at DESC
        LIMIT 1
        """,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        plan.selector_version,
    )
    if latest is not None:
        run = CorpusSelectionRunRecord.model_validate(dict(latest))
        if run.plan_checksum != plan.plan_checksum:
            raise SelectorPlanDrift(
                "corpus selection plan drifted from the persisted run manifest"
            )
        if run.status == CORPUS_SELECTION_STATUS_PUBLISHED and not request.force_new_run:
            raise CorpusSelectionAlreadyPublished(
                "corpus selection already published for the requested release pair"
            )
        if (
            request.force_new_run
            and run.status
            not in (CORPUS_SELECTION_STATUS_PUBLISHED, CORPUS_SELECTION_STATUS_FAILED)
        ):
            raise CorpusSelectionAlreadyInProgress(
                "unfinished corpus selection run must resume before force_new_run is allowed"
            )
        if run.status != CORPUS_SELECTION_STATUS_PUBLISHED and not request.force_new_run:
            await connection.execute(
                """
                UPDATE solemd.corpus_selection_runs
                SET advisory_lock_key = $1,
                    requested_by = $2,
                    trigger = $3,
                    error_message = NULL,
                    completed_at = NULL,
                    plan_checksum = $4,
                    plan_manifest = $5
                WHERE corpus_selection_run_id = $6
                """,
                lock_key,
                request.requested_by,
                request.trigger,
                plan.plan_checksum,
                plan.model_dump(mode="json"),
                run.corpus_selection_run_id,
            )
            return run

    row = await connection.fetchrow(
        """
        INSERT INTO solemd.corpus_selection_runs (
            advisory_lock_key,
            s2_source_release_id,
            pt3_source_release_id,
            selector_version,
            requested_by,
            trigger,
            status,
            plan_checksum,
            plan_manifest,
            phase_started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING
            corpus_selection_run_id,
            status,
            phases_completed,
            last_completed_phase,
            plan_checksum,
            plan_manifest
        """,
        lock_key,
        plan.s2_source_release_id,
        plan.pt3_source_release_id,
        plan.selector_version,
        request.requested_by,
        request.trigger,
        CORPUS_SELECTION_STATUS_STARTED,
        plan.plan_checksum,
        plan.model_dump(mode="json"),
        {"started": utc_now_iso()},
    )
    return CorpusSelectionRunRecord.model_validate(dict(row))


async def set_selection_phase(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    *,
    phase_name: str,
) -> None:
    status_code = {
        "assets": CORPUS_SELECTION_STATUS_ASSETS,
        "corpus_admission": CORPUS_SELECTION_STATUS_CORPUS_ADMISSION,
        "mapped_promotion": CORPUS_SELECTION_STATUS_MAPPED_PROMOTION,
        "corpus_baseline_materialization": CORPUS_SELECTION_STATUS_CANONICAL_MATERIALIZATION,
        "mapped_surface_materialization": CORPUS_SELECTION_STATUS_CANONICAL_MATERIALIZATION,
        "selection_summary": CORPUS_SELECTION_STATUS_SELECTION_SUMMARY,
    }[phase_name]
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_runs
        SET status = $1,
            phase_started_at = phase_started_at || jsonb_build_object($2::TEXT, $3::TEXT)
        WHERE corpus_selection_run_id = $4
        """,
        status_code,
        phase_name,
        utc_now_iso(),
        corpus_selection_run_id,
    )


async def mark_selection_phase_completed(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    phase_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_runs
        SET phases_completed = CASE
                WHEN NOT ($1 = ANY(phases_completed)) THEN array_append(phases_completed, $1)
                ELSE phases_completed
            END,
            last_completed_phase = $1
        WHERE corpus_selection_run_id = $2
        """,
        phase_name,
        corpus_selection_run_id,
    )


async def finalize_selection_published(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_runs
        SET status = $1,
            completed_at = now(),
            error_message = NULL
        WHERE corpus_selection_run_id = $2
        """,
        CORPUS_SELECTION_STATUS_PUBLISHED,
        corpus_selection_run_id,
    )


async def set_selection_terminal_status(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_selection_runs
        SET status = $1,
            completed_at = now(),
            error_message = $2
        WHERE corpus_selection_run_id = $3
        """,
        CORPUS_SELECTION_STATUS_FAILED,
        error_message[:2000],
        corpus_selection_run_id,
    )


async def count_phase_signals(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
    phase_name: str,
) -> int:
    count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.corpus_selection_signals
        WHERE corpus_selection_run_id = $1
          AND phase_name = $2
        """,
        corpus_selection_run_id,
        phase_name,
    )
    return int(count)


async def count_summary_rows(
    connection: asyncpg.Connection,
    corpus_selection_run_id: UUID,
) -> int:
    count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.paper_selection_summary
        WHERE corpus_selection_run_id = $1
        """,
        corpus_selection_run_id,
    )
    return int(count)


async def count_materialized_papers(
    connection: asyncpg.Connection,
    s2_source_release_id: int,
) -> int:
    count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.s2_papers_raw raw
        JOIN solemd.corpus corpus
          ON corpus.corpus_id = raw.corpus_id
        JOIN solemd.papers papers
          ON papers.corpus_id = raw.corpus_id
        WHERE raw.source_release_id = $1
          AND raw.corpus_id IS NOT NULL
          AND corpus.domain_status IN ('corpus', 'mapped')
        """,
        s2_source_release_id,
    )
    return int(count)


async def load_mapped_surface_counts(
    connection: asyncpg.Connection,
    *,
    s2_source_release_id: int,
    pt3_source_release_id: int,
) -> dict[str, int]:
    row = await connection.fetchrow(
        """
        WITH mapped_scope AS (
            SELECT raw.corpus_id
            FROM solemd.s2_papers_raw raw
            JOIN solemd.corpus corpus
              ON corpus.corpus_id = raw.corpus_id
            WHERE raw.source_release_id = $1
              AND raw.corpus_id IS NOT NULL
              AND corpus.domain_status = 'mapped'
        )
        SELECT
            (
                SELECT count(*)::INTEGER
                FROM solemd.paper_authors paper_authors
                JOIN mapped_scope
                  ON mapped_scope.corpus_id = paper_authors.corpus_id
            ) AS paper_authors_count,
            (
                SELECT count(*)::INTEGER
                FROM pubtator.entity_annotations annotations
                JOIN mapped_scope
                  ON mapped_scope.corpus_id = annotations.corpus_id
                WHERE annotations.source_release_id = $2
            ) AS entity_annotations_count,
            (
                SELECT count(*)::INTEGER
                FROM pubtator.relations relations
                JOIN mapped_scope
                  ON mapped_scope.corpus_id = relations.corpus_id
                WHERE relations.source_release_id = $2
            ) AS relations_count
        """,
        s2_source_release_id,
        pt3_source_release_id,
    )
    assert row is not None
    return {
        "paper_authors": int(row["paper_authors_count"] or 0),
        "entity_annotations": int(row["entity_annotations_count"] or 0),
        "relations": int(row["relations_count"] or 0),
    }


async def load_pipeline_stage_counts(
    connection: asyncpg.Connection,
    *,
    corpus_selection_run_id: UUID,
    s2_source_release_id: int,
) -> dict[str, int]:
    row = await connection.fetchrow(
        """
        WITH raw_scope AS (
            SELECT count(*)::INTEGER AS raw_count
            FROM solemd.s2_papers_raw raw
            WHERE raw.source_release_id = $2
        ),
        summary_scope AS (
            SELECT
                count(*) FILTER (
                    WHERE summary.current_status IN ('corpus', 'mapped')
                )::INTEGER AS corpus_count,
                count(*) FILTER (
                    WHERE summary.current_status = 'mapped'
                )::INTEGER AS mapped_count
            FROM solemd.paper_selection_summary summary
            WHERE summary.corpus_selection_run_id = $1
        )
        SELECT
            raw_scope.raw_count,
            coalesce(summary_scope.corpus_count, 0) AS corpus_count,
            coalesce(summary_scope.mapped_count, 0) AS mapped_count
        FROM raw_scope
        CROSS JOIN summary_scope
        """,
        corpus_selection_run_id,
        s2_source_release_id,
    )
    return {
        "raw": int(row["raw_count"]),
        "corpus": int(row["corpus_count"]),
        "mapped": int(row["mapped_count"]),
    }


async def _require_loaded_release(
    connection: asyncpg.Connection,
    *,
    source_name: str,
    release_tag: str,
) -> int:
    row = await connection.fetchrow(
        """
        SELECT source_release_id, release_status
        FROM solemd.source_releases
        WHERE source_name = $1
          AND source_release_key = $2
        """,
        source_name,
        release_tag,
    )
    if row is None:
        raise UpstreamReleaseMissing(f"missing {source_name}:{release_tag}")
    if row["release_status"] != "loaded":
        raise UpstreamReleaseNotPublished(
            f"{source_name}:{release_tag} is not loaded"
        )
    return int(row["source_release_id"])
