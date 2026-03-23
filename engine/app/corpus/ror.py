"""ROR API client helpers for affiliation normalization."""

from __future__ import annotations

import logging
import random
import time
from typing import Any
from urllib.parse import quote

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

ROR_BASE = "https://api.ror.org/v2"
DEFAULT_TIMEOUT = 15.0
MAX_RETRIES = 2


def _extract_display_name(org: dict[str, Any]) -> str:
    for name_entry in org.get("names") or []:
        if "ror_display" in (name_entry.get("types") or []):
            return str(name_entry.get("value") or "")
    names = org.get("names") or []
    if names:
        return str(names[0].get("value") or "")
    return ""


def _extract_location(org: dict[str, Any]) -> dict[str, Any]:
    locations = org.get("locations") or []
    location = locations[0] if locations else {}
    geo = location.get("geonames_details") or {}
    return {
        "country_code": geo.get("country_code"),
        "country_name": geo.get("country_name"),
        "latitude": geo.get("lat"),
        "longitude": geo.get("lng"),
        "city": geo.get("name"),
        "region": geo.get("country_subdivision_name")
        or geo.get("region")
        or geo.get("admin1_name"),
    }


class RORMatch:
    """Parsed organization match from the ROR v2 API."""

    __slots__ = (
        "ror_id",
        "name",
        "country_code",
        "country_name",
        "latitude",
        "longitude",
        "city",
        "region",
        "institution_type",
        "chosen",
        "score",
    )

    def __init__(
        self,
        *,
        ror_id: str,
        name: str,
        country_code: str | None = None,
        country_name: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        city: str | None = None,
        region: str | None = None,
        institution_type: str | None = None,
        chosen: bool = False,
        score: float = 0.0,
    ) -> None:
        self.ror_id = ror_id
        self.name = name
        self.country_code = country_code
        self.country_name = country_name
        self.latitude = latitude
        self.longitude = longitude
        self.city = city
        self.region = region
        self.institution_type = institution_type
        self.chosen = chosen
        self.score = float(score)

    @classmethod
    def from_affiliation_item(cls, raw: dict[str, Any]) -> RORMatch:
        org = raw.get("organization") or {}
        return cls.from_organization(
            org,
            chosen=bool(raw.get("chosen", False)),
            score=float(raw.get("score", 0.0) or 0.0),
        )

    @classmethod
    def from_organization(
        cls,
        org: dict[str, Any],
        *,
        chosen: bool = True,
        score: float = 1.0,
    ) -> RORMatch:
        types = org.get("types") or []
        location = _extract_location(org)
        return cls(
            ror_id=str(org.get("id") or ""),
            name=_extract_display_name(org),
            country_code=location["country_code"],
            country_name=location["country_name"],
            latitude=location["latitude"],
            longitude=location["longitude"],
            city=location["city"],
            region=location["region"],
            institution_type=types[0] if types else None,
            chosen=chosen,
            score=score,
        )


class RORClient:
    """Sync client for the ROR v2 affiliation and organization endpoints."""

    def __init__(
        self,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        client_id: str | None = None,
    ) -> None:
        self.timeout = timeout
        self.client_id = client_id or settings.ror_client_id

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {}
        if self.client_id:
            headers["Client-Id"] = self.client_id
        return headers

    def match_affiliation(
        self,
        client: httpx.Client,
        affiliation_string: str | None,
    ) -> RORMatch | None:
        if not affiliation_string or not affiliation_string.strip():
            return None

        url = f"{ROR_BASE}/organizations"
        params = {"affiliation": affiliation_string.strip()}

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = client.get(
                    url,
                    params=params,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
                if response.status_code == 404:
                    return None
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
                items = data.get("items") or []
                for item in items:
                    match = RORMatch.from_affiliation_item(item)
                    if match.chosen:
                        return match
                return None
            except httpx.RequestError as exc:
                if attempt < MAX_RETRIES:
                    sleep_time = min(2 ** attempt + random.uniform(0, 1), 60)
                    logger.warning(
                        "ROR request error for %r, retrying in %.1fs (attempt %d/%d): %s",
                        affiliation_string[:80], sleep_time, attempt, MAX_RETRIES, exc,
                    )
                    time.sleep(sleep_time)
                    continue
                logger.warning("ROR affiliation match failed for %r: %s", affiliation_string[:80], exc)
                return None
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "ROR affiliation lookup returned %s for %r",
                    exc.response.status_code if exc.response else "error",
                    affiliation_string[:80],
                )
                return None
        return None

    def get_organization(
        self,
        client: httpx.Client,
        ror_id: str | None,
    ) -> RORMatch | None:
        if not ror_id or not ror_id.strip():
            return None

        encoded_ror_id = quote(ror_id.strip(), safe="")
        url = f"{ROR_BASE}/organizations/{encoded_ror_id}"

        for attempt in range(1, MAX_RETRIES + 1):
            try:
                response = client.get(
                    url,
                    headers=self._headers(),
                    timeout=self.timeout,
                )
                if response.status_code == 404:
                    return None
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
                return RORMatch.from_organization(response.json() or {})
            except httpx.RequestError as exc:
                if attempt < MAX_RETRIES:
                    sleep_time = min(2 ** attempt + random.uniform(0, 1), 60)
                    logger.warning(
                        "ROR request error for %s, retrying in %.1fs (attempt %d/%d): %s",
                        ror_id, sleep_time, attempt, MAX_RETRIES, exc,
                    )
                    time.sleep(sleep_time)
                    continue
                logger.warning("ROR organization lookup failed for %s: %s", ror_id, exc)
                return None
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "ROR organization lookup returned %s for %s",
                    exc.response.status_code if exc.response else "error",
                    ror_id,
                )
                return None
        return None


__all__ = ["RORClient", "RORMatch"]
