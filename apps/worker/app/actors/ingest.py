from __future__ import annotations

import dramatiq

from app.config import settings
from app.db import ensure_worker_pools_open
from app.ingest.errors import (
    IngestAlreadyInProgress,
    IngestAlreadyPublished,
    PlanDrift,
    SourceSchemaDrift,
)
from app.ingest.models import StartReleaseRequest
from app.ingest.runtime import run_release_ingest


@dramatiq.actor(
    actor_name="ingest.start_release",
    queue_name="ingest",
    max_retries=2,
    min_backoff=10_000,
    max_backoff=600_000,
    time_limit=24 * 60 * 60 * 1000,
    throws=(
        IngestAlreadyPublished,
        IngestAlreadyInProgress,
        PlanDrift,
        SourceSchemaDrift,
    ),
)
async def start_release(**payload: object) -> None:
    request = StartReleaseRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_release_ingest(
        request,
        ingest_pool=pools.get("ingest_write"),
    )
