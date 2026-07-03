from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import hashlib
from time import perf_counter
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import Settings
from app.enrichment.http import AsyncRateLimiter, is_retryable_http_error, retry_after_seconds
from app.pmc_fulltext.models import (
    FetchedPmcPayload,
    PmcAvailability,
    PmcFullTextFetchFailed,
    PmcFullTextSourceProvider,
    PmcFullTextUnavailable,
)
from app.telemetry.pmc_fulltext_metrics import (
    observe_pmc_fulltext_fetch_latency,
    record_pmc_fulltext_api_request,
    record_pmc_fulltext_bytes_fetched,
)


PMC_BIOC_API_ROOT = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi"


class PmcFullTextFetcher:
    def __init__(
        self,
        settings: Settings,
        *,
        requests_per_second: float,
        max_attempts: int = 3,
    ) -> None:
        self._settings = settings
        self._limiter = AsyncRateLimiter(requests_per_second)
        self._max_attempts = max(1, max_attempts)

    async def fetch_bytes(
        self,
        *,
        url: str,
        provider: PmcFullTextSourceProvider,
        accept: str,
    ) -> bytes:
        last_error: BaseException | None = None
        for attempt in range(1, self._max_attempts + 1):
            await self._limiter.wait()
            started = perf_counter()
            try:
                payload = await asyncio.to_thread(
                    _fetch_bytes,
                    url,
                    self._settings.ncbi_api_timeout_seconds,
                    self._settings.ncbi_api_tool,
                    self._settings.ncbi_api_email,
                    accept,
                )
            except HTTPError as exc:
                observe_pmc_fulltext_fetch_latency(
                    provider=provider,
                    duration_seconds=perf_counter() - started,
                )
                outcome = "unavailable" if exc.code in {400, 404} else "failed"
                record_pmc_fulltext_api_request(provider=provider, outcome=outcome)
                if exc.code in {400, 404}:
                    raise PmcFullTextUnavailable(
                        f"{provider} returned HTTP {exc.code}",
                        provider=provider,
                    ) from exc
                last_error = exc
                if attempt < self._max_attempts and is_retryable_http_error(exc):
                    delay = retry_after_seconds(exc) or min(2.0 * attempt, 10.0)
                    await asyncio.sleep(delay)
                    continue
                raise PmcFullTextFetchFailed(
                    f"{provider} request failed with HTTP {exc.code}",
                    provider=provider,
                ) from exc
            except (OSError, TimeoutError) as exc:
                observe_pmc_fulltext_fetch_latency(
                    provider=provider,
                    duration_seconds=perf_counter() - started,
                )
                record_pmc_fulltext_api_request(provider=provider, outcome="failed")
                last_error = exc
                if attempt < self._max_attempts:
                    await asyncio.sleep(min(2.0 * attempt, 10.0))
                    continue
                raise PmcFullTextFetchFailed(
                    f"{provider} request failed: {exc}",
                    provider=provider,
                ) from exc

            observe_pmc_fulltext_fetch_latency(
                provider=provider,
                duration_seconds=perf_counter() - started,
            )
            record_pmc_fulltext_api_request(provider=provider, outcome="success")
            record_pmc_fulltext_bytes_fetched(provider=provider, byte_count=len(payload))
            return payload

        raise PmcFullTextFetchFailed(
            f"{provider} request failed: {last_error}",
            provider=provider,
        )

    async def fetch_bioc_payload(self, availability: PmcAvailability) -> FetchedPmcPayload:
        if not availability.available:
            raise PmcFullTextUnavailable(
                availability.reason or "PMC full text unavailable",
                provider=availability.provider,
            )
        payload = await self.fetch_bytes(
            url=build_pmc_bioc_url(self._settings, availability.pmcid),
            provider="pmc_bioc",
            accept="application/xml, text/xml;q=0.9",
        )
        normalized_payload = payload.lstrip()
        if not (
            normalized_payload.startswith(b"<?xml")
            or normalized_payload.startswith(b"<collection")
            or normalized_payload.startswith(b"<document")
        ):
            if b"no result can be found" in normalized_payload.lower():
                raise PmcFullTextUnavailable(
                    f"BioC-PMC reported no result for {availability.pmcid}",
                    provider="pmc_bioc",
                )
            raise PmcFullTextFetchFailed(
                f"BioC-PMC returned non-XML payload for {availability.pmcid}",
                provider="pmc_bioc",
            )
        return FetchedPmcPayload(
            pmcid=availability.pmcid,
            provider="pmc_bioc",
            source_url=build_pmc_bioc_url(self._settings, availability.pmcid),
            payload=payload,
            checksum=hashlib.sha256(payload).hexdigest(),
            fetched_at=datetime.now(UTC),
            license=availability.license,
            license_url=availability.license_url,
            license_source_provider=availability.provider,
        )


def build_pmc_bioc_url(settings: Settings, pmcid: str) -> str:
    url = f"{PMC_BIOC_API_ROOT}/BioC_xml/{pmcid}/unicode"
    if settings.ncbi_api_key:
        url = f"{url}?{urlencode({'api_key': settings.ncbi_api_key})}"
    return url


def _fetch_bytes(url: str, timeout: float, tool: str, email: str, accept: str) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": f"{tool}/1.0 ({email})",
            "Accept": accept,
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read()
