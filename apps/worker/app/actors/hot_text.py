from __future__ import annotations

import dramatiq

from app.db import get_pool
from app.hot_text.errors import PaperNotFound, PaperTextUnavailable
from app.hot_text.models import AcquirePaperTextRequest
from app.hot_text.runtime import acquire_paper_text


@dramatiq.actor(
    actor_name="hot_text.acquire_for_paper",
    queue_name="hot_text",
    max_retries=2,
    min_backoff=10_000,
    max_backoff=600_000,
    time_limit=30 * 60 * 1000,
    throws=(PaperNotFound, PaperTextUnavailable),
)
async def acquire_for_paper(**payload: object) -> None:
    request = AcquirePaperTextRequest.model_validate(payload)
    await acquire_paper_text(
        request,
        ingest_pool=get_pool("ingest_write"),
    )

