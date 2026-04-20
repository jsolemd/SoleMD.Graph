from __future__ import annotations

import dramatiq

from app.config import settings
from app.db import ensure_worker_pools_open
from app.evidence.errors import PaperNotFound, PaperTextUnavailable
from app.evidence.models import AcquirePaperTextRequest
from app.evidence.runtime import acquire_paper_text


@dramatiq.actor(
    actor_name="evidence.acquire_for_paper",
    queue_name="evidence",
    max_retries=2,
    min_backoff=10_000,
    max_backoff=600_000,
    time_limit=30 * 60 * 1000,
    throws=(PaperNotFound, PaperTextUnavailable),
)
async def acquire_for_paper(**payload: object) -> None:
    request = AcquirePaperTextRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await acquire_paper_text(
        request,
        ingest_pool=pools.get("ingest_write"),
    )
