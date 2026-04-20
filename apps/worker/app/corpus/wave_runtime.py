from __future__ import annotations

from time import perf_counter
from uuid import UUID

import asyncpg

from app.broker import configure_broker
from app.config import Settings, settings
from app.corpus.errors import (
    CorpusWaveAlreadyInProgress,
    CorpusWaveAlreadyPublished,
    SelectionRunNotPublished,
    SelectorPlanDrift,
    UnsupportedWavePolicy,
)
from app.corpus.models import (
    CORPUS_WAVE_PHASES,
    CorpusWavePlan,
    CorpusWaveRunRecord,
    DispatchEvidenceWaveRequest,
)
from app.corpus.policies import build_evidence_policy
from app.corpus.runtime_support import (
    CORPUS_SELECTION_STATUS_PUBLISHED,
    CORPUS_WAVE_STATUS_ENQUEUE,
    CORPUS_WAVE_STATUS_FAILED,
    CORPUS_WAVE_STATUS_MEMBER_SELECTION,
    CORPUS_WAVE_STATUS_PUBLISHED,
    CORPUS_WAVE_STATUS_STARTED,
    digest_payload,
    emit_event,
    utc_now_iso,
)
from app.telemetry.metrics import (
    record_corpus_evidence_policy_count,
    observe_corpus_wave_phase,
    record_corpus_wave_enqueue_count,
    record_corpus_wave_failure,
    record_corpus_wave_member_count,
    record_corpus_wave_run,
    track_corpus_wave_lock_age,
)


async def dispatch_evidence_wave(
    request: DispatchEvidenceWaveRequest,
    *,
    ingest_pool: asyncpg.Pool,
    runtime_settings: Settings = settings,
) -> str:
    if request.wave_policy_key != "evidence_missing_pmc_bioc":
        raise UnsupportedWavePolicy(
            f"unsupported wave policy: {request.wave_policy_key}"
        )
    cycle_started = perf_counter()
    async with ingest_pool.acquire() as connection:
        selection_row = await _load_published_selection_run(connection, request)
        plan = _build_wave_plan(
            request,
            corpus_selection_run_id=selection_row["corpus_selection_run_id"],
        )
        lock_key = await _acquire_wave_lock(connection, request)
        run_id: UUID | None = None
        completed_phases: set[str] = set()
        active_phase_name: str | None = None
        active_phase_started: float | None = None
        async with track_corpus_wave_lock_age(
            wave_policy_key=request.wave_policy_key,
            selector_version=request.selector_version,
        ):
            try:
                run = await _open_or_resume_wave_run(
                    connection,
                    request=request,
                    plan=plan,
                    lock_key=lock_key,
                )
                run_id = run.corpus_wave_run_id
                completed_phases = set(run.phases_completed)
                emit_event(
                    "corpus.evidence_wave.started",
                    corpus_wave_run_id=run_id,
                    corpus_selection_run_id=plan.corpus_selection_run_id,
                    wave_policy_key=request.wave_policy_key,
                    plan=plan.model_dump(mode="json"),
                )
                for phase_name in CORPUS_WAVE_PHASES:
                    if phase_name in completed_phases:
                        continue
                    active_phase_name = phase_name
                    active_phase_started = perf_counter()
                    await _set_wave_phase(connection, run_id, phase_name=phase_name)
                    if phase_name == "member_selection":
                        async with connection.transaction():
                            await _refresh_wave_members(connection, run_id, plan)
                        member_count = await _count_wave_members(connection, run_id)
                        evidence_policy_counts = await _load_evidence_policy_counts(
                            connection,
                            corpus_wave_run_id=run_id,
                            plan=plan,
                        )
                        record_corpus_wave_member_count(
                            wave_policy_key=request.wave_policy_key,
                            selector_version=request.selector_version,
                            member_count=member_count,
                        )
                        for stage_name, paper_count in evidence_policy_counts.items():
                            record_corpus_evidence_policy_count(
                                wave_policy_key=request.wave_policy_key,
                                selector_version=request.selector_version,
                                s2_release_tag=request.s2_release_tag,
                                pt3_release_tag=request.pt3_release_tag,
                                stage=stage_name,
                                paper_count=paper_count,
                            )
                        emit_event(
                            "corpus.evidence_wave.members.completed",
                            corpus_wave_run_id=run_id,
                            member_count=member_count,
                            evidence_policy_counts=evidence_policy_counts,
                        )
                    else:
                        await _enqueue_wave_members(
                            connection,
                            run_id,
                            requested_by=request.requested_by,
                            batch_size=runtime_settings.corpus_wave_enqueue_batch_size,
                            runtime_settings=runtime_settings,
                        )
                        enqueued_count = await _count_enqueued_members(connection, run_id)
                        evidence_policy_counts = await _load_evidence_policy_counts(
                            connection,
                            corpus_wave_run_id=run_id,
                            plan=plan,
                        )
                        record_corpus_wave_enqueue_count(
                            wave_policy_key=request.wave_policy_key,
                            selector_version=request.selector_version,
                            enqueue_count=enqueued_count,
                        )
                        for stage_name, paper_count in evidence_policy_counts.items():
                            record_corpus_evidence_policy_count(
                                wave_policy_key=request.wave_policy_key,
                                selector_version=request.selector_version,
                                s2_release_tag=request.s2_release_tag,
                                pt3_release_tag=request.pt3_release_tag,
                                stage=stage_name,
                                paper_count=paper_count,
                            )
                        emit_event(
                            "corpus.evidence_wave.enqueue.completed",
                            corpus_wave_run_id=run_id,
                            enqueued_count=enqueued_count,
                            evidence_policy_counts=evidence_policy_counts,
                        )
                    observe_corpus_wave_phase(
                        wave_policy_key=request.wave_policy_key,
                        selector_version=request.selector_version,
                        phase=phase_name,
                        duration_seconds=perf_counter() - active_phase_started,
                    )
                    await _mark_wave_phase_completed(connection, run_id, phase_name)
                    completed_phases.add(phase_name)
                    active_phase_name = None
                    active_phase_started = None

                await _finalize_wave_published(connection, run_id)
                record_corpus_wave_run(
                    wave_policy_key=request.wave_policy_key,
                    selector_version=request.selector_version,
                    outcome="published",
                )
                emit_event(
                    "corpus.evidence_wave.published",
                    corpus_wave_run_id=run_id,
                    published_phases=sorted(completed_phases),
                    total_duration_s=perf_counter() - cycle_started,
                )
                return str(run_id)
            except (CorpusWaveAlreadyPublished, CorpusWaveAlreadyInProgress):
                raise
            except Exception as exc:
                if active_phase_name is not None and active_phase_started is not None:
                    observe_corpus_wave_phase(
                        wave_policy_key=request.wave_policy_key,
                        selector_version=request.selector_version,
                        phase=active_phase_name,
                        duration_seconds=perf_counter() - active_phase_started,
                    )
                if run_id is not None:
                    await _set_wave_terminal_status(connection, run_id, str(exc))
                    record_corpus_wave_run(
                        wave_policy_key=request.wave_policy_key,
                        selector_version=request.selector_version,
                        outcome="failed",
                    )
                    record_corpus_wave_failure(
                        wave_policy_key=request.wave_policy_key,
                        selector_version=request.selector_version,
                        phase=active_phase_name or "start",
                        failure_class=type(exc).__name__,
                    )
                    emit_event(
                        "corpus.evidence_wave.failed",
                        corpus_wave_run_id=run_id,
                        error_class=type(exc).__name__,
                        error_message=str(exc),
                        total_duration_s=perf_counter() - cycle_started,
                    )
                raise
            finally:
                await connection.execute("SELECT pg_advisory_unlock($1)", lock_key)


def _build_wave_plan(
    request: DispatchEvidenceWaveRequest,
    *,
    corpus_selection_run_id: UUID,
) -> CorpusWavePlan:
    evidence_policy = build_evidence_policy(wave_policy_key=request.wave_policy_key)
    base_plan = CorpusWavePlan(
        corpus_selection_run_id=corpus_selection_run_id,
        s2_release_tag=request.s2_release_tag,
        pt3_release_tag=request.pt3_release_tag,
        selector_version=request.selector_version,
        wave_policy_key=request.wave_policy_key,
        max_papers=request.max_papers,
        evidence_policy=evidence_policy,
        plan_checksum="0" * 64,
    )
    checksum = digest_payload(base_plan.model_dump(mode="json", exclude={"plan_checksum"}))
    return base_plan.model_copy(update={"plan_checksum": checksum})


async def _acquire_wave_lock(
    connection: asyncpg.Connection,
    request: DispatchEvidenceWaveRequest,
) -> int:
    lock_key = await connection.fetchval(
        "SELECT hashtextextended($1, 0)::bigint",
        (
            f"corpus_wave:{request.s2_release_tag}:{request.pt3_release_tag}:"
            f"{request.selector_version}:{request.wave_policy_key}"
        ),
    )
    acquired = await connection.fetchval("SELECT pg_try_advisory_lock($1)", lock_key)
    if not acquired:
        raise CorpusWaveAlreadyInProgress(
            "corpus evidence-wave dispatch is already running for the requested plan"
        )
    return int(lock_key)


async def _open_or_resume_wave_run(
    connection: asyncpg.Connection,
    *,
    request: DispatchEvidenceWaveRequest,
    plan: CorpusWavePlan,
    lock_key: int,
) -> CorpusWaveRunRecord:
    latest = await connection.fetchrow(
        """
        SELECT
            corpus_wave_run_id,
            status,
            phases_completed,
            last_completed_phase,
            plan_checksum,
            plan_manifest
        FROM solemd.corpus_wave_runs
        WHERE corpus_selection_run_id = $1
          AND wave_policy_key = $2
        ORDER BY started_at DESC
        LIMIT 1
        """,
        plan.corpus_selection_run_id,
        plan.wave_policy_key,
    )
    if latest is not None:
        run = CorpusWaveRunRecord.model_validate(dict(latest))
        if run.plan_checksum != plan.plan_checksum:
            raise SelectorPlanDrift(
                "corpus wave plan drifted from the persisted run manifest"
            )
        if run.status == CORPUS_WAVE_STATUS_PUBLISHED and not request.force_new_run:
            raise CorpusWaveAlreadyPublished(
                "corpus wave already published for the requested plan"
            )
        if (
            request.force_new_run
            and run.status not in (CORPUS_WAVE_STATUS_PUBLISHED, CORPUS_WAVE_STATUS_FAILED)
        ):
            raise CorpusWaveAlreadyInProgress(
                "unfinished corpus wave run must resume before force_new_run is allowed"
            )
        if run.status != CORPUS_WAVE_STATUS_PUBLISHED and not request.force_new_run:
            await connection.execute(
                """
                UPDATE solemd.corpus_wave_runs
                SET advisory_lock_key = $1,
                    requested_by = $2,
                    error_message = NULL,
                    plan_checksum = $3,
                    plan_manifest = $4
                WHERE corpus_wave_run_id = $5
                """,
                lock_key,
                request.requested_by,
                plan.plan_checksum,
                plan.model_dump(mode="json"),
                run.corpus_wave_run_id,
            )
            return run

    row = await connection.fetchrow(
        """
        INSERT INTO solemd.corpus_wave_runs (
            advisory_lock_key,
            corpus_selection_run_id,
            wave_policy_key,
            requested_by,
            status,
            plan_checksum,
            plan_manifest,
            phase_started_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
            corpus_wave_run_id,
            status,
            phases_completed,
            last_completed_phase,
            plan_checksum,
            plan_manifest
        """,
        lock_key,
        plan.corpus_selection_run_id,
        plan.wave_policy_key,
        request.requested_by,
        CORPUS_WAVE_STATUS_STARTED,
        plan.plan_checksum,
        plan.model_dump(mode="json"),
        {"started": utc_now_iso()},
    )
    return CorpusWaveRunRecord.model_validate(dict(row))


async def _load_published_selection_run(
    connection: asyncpg.Connection,
    request: DispatchEvidenceWaveRequest,
) -> asyncpg.Record:
    row = await connection.fetchrow(
        """
        SELECT corpus_selection_run_id
        FROM solemd.corpus_selection_runs
        WHERE status = $1
          AND selector_version = $2
          AND s2_source_release_id = (
                SELECT source_release_id
                FROM solemd.source_releases
                WHERE source_name = 's2'
                  AND source_release_key = $3
            )
          AND pt3_source_release_id = (
                SELECT source_release_id
                FROM solemd.source_releases
                WHERE source_name = 'pt3'
                  AND source_release_key = $4
            )
        ORDER BY started_at DESC
        LIMIT 1
        """,
        CORPUS_SELECTION_STATUS_PUBLISHED,
        request.selector_version,
        request.s2_release_tag,
        request.pt3_release_tag,
    )
    if row is None:
        raise SelectionRunNotPublished(
            "no published corpus selection exists for the requested release pair"
        )
    return row


async def _refresh_wave_members(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
    plan: CorpusWavePlan,
) -> None:
    await connection.execute(
        """
        DELETE FROM solemd.corpus_wave_members
        WHERE corpus_wave_run_id = $1
        """,
        corpus_wave_run_id,
    )
    await connection.execute(
        """
        INSERT INTO solemd.corpus_wave_members (
            corpus_wave_run_id,
            corpus_id,
            member_ordinal,
            priority_score,
            selection_detail
        )
        WITH ranked_candidates AS (
            SELECT
                summary.corpus_id,
                summary.evidence_priority_score AS priority_score,
                jsonb_build_object(
                    'publication_year', summary.publication_year,
                    'publication_year_floor', $2::SMALLINT,
                    'minimum_evidence_priority_score', $3::INTEGER,
                    'mapped_priority_score', summary.mapped_priority_score,
                    'evidence_priority_score', summary.evidence_priority_score,
                    'entity_annotation_count', summary.entity_annotation_count,
                    'relation_count', summary.relation_count,
                    'mapped_family_keys', summary.mapped_family_keys,
                    'has_open_access', summary.has_open_access,
                    'has_pmc_id', summary.has_pmc_id,
                    'has_locator_candidate', summary.has_locator_candidate
                ) AS selection_detail,
                row_number() OVER (
                    ORDER BY
                        summary.evidence_priority_score DESC,
                        summary.mapped_priority_score DESC,
                        summary.mapped_relation_signal_count DESC,
                        summary.mapped_entity_signal_count DESC,
                        summary.vocab_entity_signal_count DESC,
                        summary.entity_annotation_count DESC,
                        summary.reference_out_count DESC,
                        summary.corpus_id
                ) AS member_ordinal
            FROM solemd.paper_selection_summary summary
            LEFT JOIN solemd.paper_documents documents
              ON documents.corpus_id = summary.corpus_id
             AND documents.document_source_kind = $4
            WHERE summary.corpus_selection_run_id = $1
              AND summary.current_status = 'mapped'
              AND documents.corpus_id IS NULL
              AND (
                    summary.publication_year IS NULL
                    OR summary.publication_year >= $2::SMALLINT
                  )
              AND summary.evidence_priority_score >= $3::INTEGER
              AND (
                    NOT $5::BOOLEAN
                    OR summary.has_locator_candidate
                  )
        )
        SELECT
            $6,
            ranked_candidates.corpus_id,
            ranked_candidates.member_ordinal,
            ranked_candidates.priority_score,
            ranked_candidates.selection_detail
        FROM ranked_candidates
        WHERE $7::INTEGER IS NULL
           OR ranked_candidates.member_ordinal <= $7::INTEGER
        """,
        plan.corpus_selection_run_id,
        plan.evidence_policy.publication_year_floor,
        plan.evidence_policy.min_evidence_priority_score,
        plan.evidence_policy.missing_document_source_kind,
        plan.evidence_policy.require_locator_candidate,
        corpus_wave_run_id,
        plan.max_papers,
    )


async def _enqueue_wave_members(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
    *,
    requested_by: str | None,
    batch_size: int,
    runtime_settings: Settings,
) -> None:
    configure_broker(runtime_settings, pool_names=("ingest_write",))
    while True:
        rows = await connection.fetch(
            """
            SELECT corpus_id
            FROM solemd.corpus_wave_members
            WHERE corpus_wave_run_id = $1
              AND enqueued_at IS NULL
            ORDER BY member_ordinal
            LIMIT $2
            """,
            corpus_wave_run_id,
            batch_size,
        )
        if not rows:
            return
        sent_corpus_ids: list[int] = []
        for row in rows:
            corpus_id = int(row["corpus_id"])
            _send_evidence_enqueue(corpus_id=corpus_id, requested_by=requested_by)
            sent_corpus_ids.append(corpus_id)
        await connection.execute(
            """
            UPDATE solemd.corpus_wave_members
            SET enqueued_at = now()
            WHERE corpus_wave_run_id = $1
              AND corpus_id = ANY($2::BIGINT[])
            """,
            corpus_wave_run_id,
            sent_corpus_ids,
        )


def _send_evidence_enqueue(*, corpus_id: int, requested_by: str | None) -> None:
    from app.actors.evidence import acquire_for_paper

    acquire_for_paper.send(
        corpus_id=corpus_id,
        force_refresh=False,
        requested_by=requested_by,
    )


async def _set_wave_phase(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
    *,
    phase_name: str,
) -> None:
    status_code = {
        "member_selection": CORPUS_WAVE_STATUS_MEMBER_SELECTION,
        "enqueue": CORPUS_WAVE_STATUS_ENQUEUE,
    }[phase_name]
    await connection.execute(
        """
        UPDATE solemd.corpus_wave_runs
        SET status = $1,
            phase_started_at = phase_started_at || jsonb_build_object($2::TEXT, $3::TEXT)
        WHERE corpus_wave_run_id = $4
        """,
        status_code,
        phase_name,
        utc_now_iso(),
        corpus_wave_run_id,
    )


async def _mark_wave_phase_completed(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
    phase_name: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_wave_runs
        SET phases_completed = CASE
                WHEN NOT ($1 = ANY(phases_completed)) THEN array_append(phases_completed, $1)
                ELSE phases_completed
            END,
            last_completed_phase = $1
        WHERE corpus_wave_run_id = $2
        """,
        phase_name,
        corpus_wave_run_id,
    )


async def _finalize_wave_published(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_wave_runs
        SET status = $1,
            completed_at = now(),
            error_message = NULL
        WHERE corpus_wave_run_id = $2
        """,
        CORPUS_WAVE_STATUS_PUBLISHED,
        corpus_wave_run_id,
    )


async def _set_wave_terminal_status(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
    error_message: str,
) -> None:
    await connection.execute(
        """
        UPDATE solemd.corpus_wave_runs
        SET status = $1,
            completed_at = now(),
            error_message = $2
        WHERE corpus_wave_run_id = $3
        """,
        CORPUS_WAVE_STATUS_FAILED,
        error_message[:2000],
        corpus_wave_run_id,
    )


async def _count_wave_members(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
) -> int:
    count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.corpus_wave_members
        WHERE corpus_wave_run_id = $1
        """,
        corpus_wave_run_id,
    )
    return int(count)


async def _count_enqueued_members(
    connection: asyncpg.Connection,
    corpus_wave_run_id: UUID,
) -> int:
    count = await connection.fetchval(
        """
        SELECT count(*)
        FROM solemd.corpus_wave_members
        WHERE corpus_wave_run_id = $1
          AND enqueued_at IS NOT NULL
        """,
        corpus_wave_run_id,
    )
    return int(count)


async def _load_evidence_policy_counts(
    connection: asyncpg.Connection,
    *,
    corpus_wave_run_id: UUID,
    plan: CorpusWavePlan,
) -> dict[str, int]:
    row = await connection.fetchrow(
        """
        WITH evidence_cohort AS (
            SELECT summary.corpus_id
            FROM solemd.paper_selection_summary summary
            WHERE summary.corpus_selection_run_id = $1
              AND summary.current_status = 'mapped'
              AND (
                    summary.publication_year IS NULL
                    OR summary.publication_year >= $2::SMALLINT
                  )
              AND summary.evidence_priority_score >= $3::INTEGER
              AND (
                    NOT $4::BOOLEAN
                    OR summary.has_locator_candidate
                  )
        ),
        satisfied AS (
            SELECT count(*)::INTEGER AS satisfied_count
            FROM evidence_cohort cohort
            JOIN solemd.paper_documents documents
              ON documents.corpus_id = cohort.corpus_id
             AND documents.document_source_kind = $5
        ),
        backlog AS (
            SELECT count(*)::INTEGER AS backlog_count
            FROM evidence_cohort cohort
            LEFT JOIN solemd.paper_documents documents
              ON documents.corpus_id = cohort.corpus_id
             AND documents.document_source_kind = $5
            WHERE documents.corpus_id IS NULL
        ),
        selected AS (
            SELECT count(*)::INTEGER AS selected_count
            FROM solemd.corpus_wave_members members
            WHERE members.corpus_wave_run_id = $6
        )
        SELECT
            (SELECT count(*)::INTEGER FROM evidence_cohort) AS evidence_cohort_count,
            coalesce((SELECT satisfied_count FROM satisfied), 0) AS evidence_satisfied_count,
            coalesce((SELECT backlog_count FROM backlog), 0) AS evidence_backlog_count,
            coalesce((SELECT selected_count FROM selected), 0) AS evidence_selected_count
        """,
        plan.corpus_selection_run_id,
        plan.evidence_policy.publication_year_floor,
        plan.evidence_policy.min_evidence_priority_score,
        plan.evidence_policy.require_locator_candidate,
        plan.evidence_policy.missing_document_source_kind,
        corpus_wave_run_id,
    )
    return {
        "evidence_cohort": int(row["evidence_cohort_count"]),
        "evidence_satisfied": int(row["evidence_satisfied_count"]),
        "evidence_backlog": int(row["evidence_backlog_count"]),
        "evidence_selected": int(row["evidence_selected_count"]),
    }
