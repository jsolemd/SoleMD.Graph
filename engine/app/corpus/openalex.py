"""OpenAlex helpers for DOI -> authorship institution hints."""

from __future__ import annotations

import logging
import random
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

OPENALEX_BASE = "https://api.openalex.org"
DEFAULT_TIMEOUT = 30.0
MAX_RETRIES = 3


class OpenAlexAuthorship:
    """Parsed authorship record from the OpenAlex Works API."""

    __slots__ = (
        "author_position",
        "display_name",
        "orcid",
        "institution_display_name",
        "institution_ror",
        "institution_country_code",
        "institution_type",
    )

    def __init__(self, raw: dict[str, Any]) -> None:
        author = raw.get("author") or {}
        self.author_position: str = str(raw.get("author_position") or "")
        self.display_name: str = str(author.get("display_name") or "")
        self.orcid: str | None = author.get("orcid")

        institutions = raw.get("institutions") or []
        inst = next((item for item in institutions if isinstance(item, dict)), {})
        self.institution_display_name: str = str(inst.get("display_name") or "")
        self.institution_ror: str | None = inst.get("ror")
        self.institution_country_code: str | None = inst.get("country_code")
        self.institution_type: str | None = inst.get("type")


class OpenAlexClient:
    """Sync client for the OpenAlex Works API."""

    def __init__(
        self,
        *,
        mailto: str | None = None,
        api_key: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.mailto = mailto or settings.openalex_mailto
        self.api_key = api_key or settings.openalex_api_key
        self.timeout = timeout

    def _params(self) -> dict[str, str]:
        params: dict[str, str] = {}
        if self.mailto:
            params["mailto"] = self.mailto
        if self.api_key:
            params["api_key"] = self.api_key
        return params

    def fetch_work_authorships(
        self,
        client: httpx.Client,
        doi: str,
    ) -> list[OpenAlexAuthorship]:
        """Fetch authorships for a DOI from the OpenAlex Works API."""
        doi_clean = (
            doi.strip()
            .removeprefix("https://doi.org/")
            .removeprefix("http://doi.org/")
            .removeprefix("doi:")
        )
        url = f"{OPENALEX_BASE}/works/doi:{quote(doi_clean, safe='')}"
        params = self._params()
        params["select"] = "authorships"

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = client.get(url, params=params, timeout=self.timeout)
                if response.status_code == 404:
                    logger.debug("OpenAlex DOI not found: %s", doi_clean)
                    return []
                if response.status_code == 429 or response.status_code >= 500:
                    if attempt < MAX_RETRIES:
                        sleep_time = min(2 ** attempt + random.uniform(0, 1), 60)
                        logger.warning(
                            "HTTP %d from %s, retrying in %.1fs (attempt %d/%d)",
                            response.status_code, url, sleep_time, attempt, MAX_RETRIES,
                        )
                        time.sleep(sleep_time)
                        continue
                response.raise_for_status()
                data = response.json() or {}
                return [OpenAlexAuthorship(item) for item in data.get("authorships") or []]
            except httpx.RequestError as exc:
                if attempt < MAX_RETRIES:
                    sleep_time = min(2 ** attempt + random.uniform(0, 1), 60)
                    logger.warning(
                        "OpenAlex request error for %s, retrying in %.1fs (attempt %d/%d): %s",
                        doi_clean, sleep_time, attempt, MAX_RETRIES, exc,
                    )
                    time.sleep(sleep_time)
                    continue
                logger.warning("OpenAlex request failed for %s: %s", doi_clean, exc)
                return []
        return []


__all__ = ["OpenAlexAuthorship", "OpenAlexClient"]
