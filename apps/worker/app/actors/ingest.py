from __future__ import annotations

import dramatiq

from app.db import get_pool
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
    time_limit=6 * 60 * 60 * 1000,
    throws=(
        IngestAlreadyPublished,
        IngestAlreadyInProgress,
        PlanDrift,
        SourceSchemaDrift,
    ),
)
async def start_release(**payload: object) -> None:
    request = StartReleaseRequest.model_validate(payload)
    await run_release_ingest(
        request,
        ingest_pool=get_pool("ingest_write"),
    )
