from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from time import monotonic
from urllib.error import HTTPError


class AsyncRateLimiter:
    def __init__(self, requests_per_second: float) -> None:
        self._interval_seconds = 1.0 / max(requests_per_second, 0.01)
        self._next_allowed_at = 0.0
        self._lock = asyncio.Lock()

    async def wait(self) -> None:
        async with self._lock:
            now = monotonic()
            sleep_seconds = self._next_allowed_at - now
            if sleep_seconds > 0:
                await asyncio.sleep(sleep_seconds)
                now = monotonic()
            self._next_allowed_at = now + self._interval_seconds


def retry_after_seconds(exc: HTTPError) -> float | None:
    header = exc.headers.get("Retry-After") if exc.headers is not None else None
    if not header:
        return None
    try:
        return max(0.0, float(header))
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(header)
    except (TypeError, ValueError):
        return None
    if retry_at.tzinfo is None:
        retry_at = retry_at.replace(tzinfo=UTC)
    return max(0.0, (retry_at - datetime.now(UTC)).total_seconds())
