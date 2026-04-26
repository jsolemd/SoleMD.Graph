from __future__ import annotations

import dramatiq
from uuid import UUID

from app.config import settings
from app.db import ensure_worker_pools_open
from app.ingest.errors import (
    IngestAborted,
    IngestAlreadyInProgress,
    IngestAlreadyPublished,
    PlanDrift,
    SourceSchemaDrift,
)
from app.ingest.models import FilePlan, StartReleaseRequest
from app.ingest.runtime import run_release_ingest
from app.ingest.writers import s2_citations


@dramatiq.actor(
    actor_name="ingest.start_release",
    queue_name="ingest",
    max_retries=2,
    min_backoff=10_000,
    max_backoff=600_000,
    time_limit=24 * 60 * 60 * 1000,
    throws=(
        IngestAborted,
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
        distributed_file_tasks=settings.ingest_distributed_file_tasks_enabled,
    )


@dramatiq.actor(
    actor_name="ingest.s2_citation_file",
    queue_name="ingest_file",
    max_retries=0,
    time_limit=24 * 60 * 60 * 1000,
)
async def load_s2_citation_file(**payload: object) -> None:
    request = StartReleaseRequest.model_validate(payload["request"])
    file_plan = FilePlan.model_validate(payload["file_plan"])
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await s2_citations.load_citation_file_task(
        pools.get("ingest_write"),
        settings,
        request=request,
        source_release_id=int(payload["source_release_id"]),
        ingest_run_id=UUID(str(payload["ingest_run_id"])),
        file_plan=file_plan,
    )
