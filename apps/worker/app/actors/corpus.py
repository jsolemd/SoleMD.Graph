from __future__ import annotations

import dramatiq

from app.config import settings
from app.corpus.errors import (
    CorpusQualityAuditAlreadyInProgress,
    CorpusSelectionAlreadyInProgress,
    CorpusSelectionAlreadyPublished,
    CorpusWaveAlreadyInProgress,
    CorpusWaveAlreadyPublished,
    MissingCuratedAssets,
    SelectionRunNotPublished,
    SelectionSummaryRefreshAlreadyInProgress,
    SelectionSummaryRefreshPrerequisiteMissing,
    SelectorPlanDrift,
    UnsupportedWavePolicy,
    UpstreamReleaseMissing,
    UpstreamReleaseNotPublished,
)
from app.corpus.models import (
    CORPUS_SELECTION_PHASES,
    CorpusSelectionPhase,
    DispatchEvidenceWaveRequest,
    StartCorpusQualityAuditRequest,
    StartCorpusSelectionRequest,
    StartSelectionSummaryRefreshRequest,
)
from app.corpus.quality_audit import (
    run_corpus_quality_audit as run_corpus_quality_audit_operation,
)
from app.corpus.runtime import (
    dispatch_evidence_wave as run_evidence_wave_dispatch,
    run_corpus_selection,
)
from app.corpus.summary_refresh import (
    run_selection_summary_refresh as run_selection_summary_refresh_operation,
)
from app.db import ensure_worker_pools_open


SELECTION_PHASE_ACTOR_THROWS = (
    CorpusSelectionAlreadyPublished,
    CorpusSelectionAlreadyInProgress,
    MissingCuratedAssets,
    SelectorPlanDrift,
    UpstreamReleaseMissing,
    UpstreamReleaseNotPublished,
)
CORPUS_SELECTION_ACTOR_TIME_LIMIT_MS = 6 * 60 * 60 * 1000
CORPUS_WAVE_ACTOR_TIME_LIMIT_MS = 6 * 60 * 60 * 1000
SUMMARY_REFRESH_ACTOR_THROWS = (
    SelectionRunNotPublished,
    SelectionSummaryRefreshAlreadyInProgress,
    SelectionSummaryRefreshPrerequisiteMissing,
    SelectorPlanDrift,
)
QUALITY_AUDIT_ACTOR_THROWS = (
    CorpusQualityAuditAlreadyInProgress,
    SelectionRunNotPublished,
    SelectorPlanDrift,
)


async def _dispatch_evidence_wave_payload(payload: dict[str, object]) -> None:
    request = DispatchEvidenceWaveRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_evidence_wave_dispatch(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


def _selection_phase_payload(
    request: StartCorpusSelectionRequest,
    *,
    phase_name: str,
    phase_sequence: tuple[str, ...],
) -> dict[str, object]:
    payload = request.model_dump(mode="json")
    payload["phase_allowlist"] = [phase_name]
    payload["phase_name"] = phase_name
    payload["phase_sequence"] = list(phase_sequence)
    return payload


def _next_phase_name(
    *,
    phase_name: str,
    phase_sequence: tuple[str, ...],
) -> str | None:
    try:
        current_index = phase_sequence.index(phase_name)
    except ValueError as exc:
        raise ValueError(f"unsupported corpus selection phase: {phase_name}") from exc
    next_index = current_index + 1
    if next_index >= len(phase_sequence):
        return None
    return phase_sequence[next_index]


@dramatiq.actor(
    actor_name="corpus.start_selection",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    time_limit=CORPUS_SELECTION_ACTOR_TIME_LIMIT_MS,
    throws=SELECTION_PHASE_ACTOR_THROWS,
)
async def start_selection(**payload: object) -> None:
    request = StartCorpusSelectionRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_corpus_selection(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


@dramatiq.actor(
    actor_name="corpus.dispatch_selection_phases",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    throws=SELECTION_PHASE_ACTOR_THROWS,
)
async def dispatch_selection_phases_actor(**payload: object) -> None:
    request = StartCorpusSelectionRequest.model_validate(payload)
    phase_sequence: tuple[CorpusSelectionPhase, ...] = (
        request.phase_allowlist or CORPUS_SELECTION_PHASES
    )
    first_phase = phase_sequence[0]
    run_selection_phase.send(
        **_selection_phase_payload(
            request,
            phase_name=first_phase,
            phase_sequence=phase_sequence,
        )
    )


@dramatiq.actor(
    actor_name="corpus.run_selection_phase",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    time_limit=CORPUS_SELECTION_ACTOR_TIME_LIMIT_MS,
    throws=SELECTION_PHASE_ACTOR_THROWS,
)
async def run_selection_phase(**payload: object) -> None:
    phase_name = str(payload.pop("phase_name"))
    raw_phase_sequence = payload.pop("phase_sequence", CORPUS_SELECTION_PHASES)
    phase_sequence = tuple(str(phase) for phase in raw_phase_sequence)
    request_payload = dict(payload)
    request_payload["phase_allowlist"] = [phase_name]
    request = StartCorpusSelectionRequest.model_validate(request_payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_corpus_selection(
        request,
        ingest_pool=pools.get("ingest_write"),
    )

    next_phase = _next_phase_name(
        phase_name=phase_name,
        phase_sequence=phase_sequence,
    )
    if next_phase is None:
        return
    next_request = request.model_copy(
        update={
            "force_new_run": False,
            "phase_allowlist": (next_phase,),
        }
    )
    run_selection_phase.send(
        **_selection_phase_payload(
            next_request,
            phase_name=next_phase,
            phase_sequence=phase_sequence,
        )
    )


@dramatiq.actor(
    actor_name="corpus.dispatch_evidence_wave",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    time_limit=CORPUS_WAVE_ACTOR_TIME_LIMIT_MS,
    throws=(
        CorpusWaveAlreadyPublished,
        CorpusWaveAlreadyInProgress,
        SelectionRunNotPublished,
        SelectorPlanDrift,
        UnsupportedWavePolicy,
    ),
)
async def dispatch_evidence_wave_actor(**payload: object) -> None:
    await _dispatch_evidence_wave_payload(dict(payload))


@dramatiq.actor(
    actor_name="corpus.refresh_selection_summary",
    queue_name="corpus",
    max_retries=0,
    time_limit=CORPUS_SELECTION_ACTOR_TIME_LIMIT_MS,
    throws=SUMMARY_REFRESH_ACTOR_THROWS,
)
async def refresh_selection_summary_actor(**payload: object) -> None:
    request = StartSelectionSummaryRefreshRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_selection_summary_refresh_operation(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


@dramatiq.actor(
    actor_name="corpus.run_quality_audit",
    queue_name="corpus",
    max_retries=0,
    time_limit=CORPUS_SELECTION_ACTOR_TIME_LIMIT_MS,
    throws=QUALITY_AUDIT_ACTOR_THROWS,
)
async def run_quality_audit_actor(**payload: object) -> None:
    request = StartCorpusQualityAuditRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_corpus_quality_audit_operation(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


dispatch_evidence_wave = dispatch_evidence_wave_actor
dispatch_selection_phases = dispatch_selection_phases_actor
refresh_selection_summary = refresh_selection_summary_actor
run_quality_audit = run_quality_audit_actor
