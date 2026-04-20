from __future__ import annotations

import dramatiq

from app.config import settings
from app.corpus.errors import (
    CorpusSelectionAlreadyInProgress,
    CorpusSelectionAlreadyPublished,
    CorpusWaveAlreadyInProgress,
    CorpusWaveAlreadyPublished,
    MissingCuratedAssets,
    SelectionRunNotPublished,
    SelectorPlanDrift,
    UnsupportedWavePolicy,
    UpstreamReleaseMissing,
    UpstreamReleaseNotPublished,
)
from app.corpus.models import DispatchEvidenceWaveRequest, StartCorpusSelectionRequest
from app.corpus.runtime import (
    dispatch_evidence_wave as run_evidence_wave_dispatch,
    run_corpus_selection,
)
from app.db import ensure_worker_pools_open


async def _dispatch_evidence_wave_payload(payload: dict[str, object]) -> None:
    request = DispatchEvidenceWaveRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_evidence_wave_dispatch(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


@dramatiq.actor(
    actor_name="corpus.start_selection",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    time_limit=30 * 60 * 1000,
    throws=(
        CorpusSelectionAlreadyPublished,
        CorpusSelectionAlreadyInProgress,
        MissingCuratedAssets,
        SelectorPlanDrift,
        UpstreamReleaseMissing,
        UpstreamReleaseNotPublished,
    ),
)
async def start_selection(**payload: object) -> None:
    request = StartCorpusSelectionRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_corpus_selection(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


@dramatiq.actor(
    actor_name="corpus.dispatch_evidence_wave",
    queue_name="corpus",
    max_retries=1,
    min_backoff=10_000,
    max_backoff=120_000,
    time_limit=30 * 60 * 1000,
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
dispatch_evidence_wave = dispatch_evidence_wave_actor
