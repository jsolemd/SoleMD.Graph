from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
import hashlib
import json
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import Settings
from app.enrichment.http import AsyncRateLimiter, retry_after_seconds


S2_GRAPH_FIELDS = (
    "paperId",
    "externalIds",
    "publicationTypes",
    "fieldsOfStudy",
    "s2FieldsOfStudy",
    "citationCount",
    "influentialCitationCount",
    "openAccessPdf",
    "publicationVenue",
    "journal",
    "isOpenAccess",
    "year",
    "publicationDate",
)


@dataclass(frozen=True, slots=True)
class S2PaperEnrichmentRecord:
    paper_id: str
    response_checksum: str
    citation_count: int
    influential_citation_count: int
    publication_types: tuple[str, ...]
    fields_of_study: tuple[str, ...]
    s2_fields_of_study: tuple[dict[str, object], ...]
    open_access_pdf: dict[str, object]
    open_access_pdf_status: str | None
    publication_venue: dict[str, object]
    publication_venue_type: str | None
    external_ids: dict[str, object]
    journal: dict[str, object]
    is_open_access: bool | None
    year: int | None
    publication_date: date | None
    raw_detail: dict[str, object]


class SemanticScholarGraphClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._rate_limiter = AsyncRateLimiter(
            min(settings.s2_graph_requests_per_second, 1.0)
        )

    async def fetch_papers(
        self,
        paper_ids: Sequence[str],
    ) -> tuple[S2PaperEnrichmentRecord, ...]:
        if not paper_ids:
            return ()
        query = urlencode({"fields": ",".join(S2_GRAPH_FIELDS)})
        url = f"{self._settings.s2_graph_api_base_url.rstrip('/')}/paper/batch?{query}"
        body = json.dumps({"ids": list(paper_ids)}, separators=(",", ":")).encode("utf-8")
        for attempt in range(1, self._settings.s2_graph_max_attempts + 1):
            await self._rate_limiter.wait()
            try:
                payload = await asyncio.to_thread(
                    _post_json,
                    url,
                    body,
                    self._settings.semantic_scholar_api_timeout_seconds,
                    self._settings.semantic_scholar_api_user_agent,
                    self._settings.semantic_scholar_api_key,
                )
                return parse_s2_graph_batch(payload)
            except HTTPError as exc:
                if exc.code not in {429, 500, 502, 503, 504}:
                    raise
                if attempt >= self._settings.s2_graph_max_attempts:
                    raise
                await asyncio.sleep(retry_after_seconds(exc) or min(120.0, 2.0**attempt))
            except (OSError, TimeoutError):
                if attempt >= self._settings.s2_graph_max_attempts:
                    raise
                await asyncio.sleep(min(120.0, 2.0**attempt))
        return ()


def parse_s2_graph_batch(payload: bytes) -> tuple[S2PaperEnrichmentRecord, ...]:
    decoded = json.loads(payload.decode("utf-8"))
    rows = decoded.get("data") if isinstance(decoded, dict) else decoded
    if not isinstance(rows, list):
        return ()
    records = [
        _parse_s2_row(row)
        for row in rows
        if isinstance(row, dict) and row.get("paperId")
    ]
    return tuple(record for record in records if record is not None)


def _parse_s2_row(row: dict[str, object]) -> S2PaperEnrichmentRecord | None:
    paper_id = row.get("paperId")
    if not isinstance(paper_id, str) or not paper_id:
        return None
    open_access_pdf = _dict_or_empty(row.get("openAccessPdf"))
    publication_venue = _dict_or_empty(row.get("publicationVenue"))
    journal = _dict_or_empty(row.get("journal"))
    external_ids = _dict_or_empty(row.get("externalIds"))
    s2_fields = [
        field
        for field in _list_or_empty(row.get("s2FieldsOfStudy"))
        if isinstance(field, dict)
    ]
    fields_of_study = tuple(
        sorted(
            {
                str(field).strip().lower()
                for field in _list_or_empty(row.get("fieldsOfStudy"))
                if str(field).strip()
            }
        )
    )
    publication_types = tuple(
        sorted(
            {
                str(publication_type).strip().lower()
                for publication_type in _list_or_empty(row.get("publicationTypes"))
                if str(publication_type).strip()
            }
        )
    )
    checksum_payload = json.dumps(row, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return S2PaperEnrichmentRecord(
        paper_id=paper_id,
        response_checksum=hashlib.sha256(checksum_payload).hexdigest(),
        citation_count=max(0, _int_or_zero(row.get("citationCount"))),
        influential_citation_count=max(
            0,
            _int_or_zero(row.get("influentialCitationCount")),
        ),
        publication_types=publication_types,
        fields_of_study=fields_of_study,
        s2_fields_of_study=tuple(s2_fields),
        open_access_pdf=open_access_pdf,
        open_access_pdf_status=_string_or_none(open_access_pdf.get("status")),
        publication_venue=publication_venue,
        publication_venue_type=_string_or_none(publication_venue.get("type")),
        external_ids=external_ids,
        journal=journal,
        is_open_access=_bool_or_none(row.get("isOpenAccess")),
        year=_int_or_none(row.get("year")),
        publication_date=_date_or_none(row.get("publicationDate")),
        raw_detail={
            "paperId": paper_id,
            "requested_fields": S2_GRAPH_FIELDS,
        },
    )


def _post_json(
    url: str,
    body: bytes,
    timeout: float,
    user_agent: str,
    api_key: str | None,
) -> bytes:
    headers = {
        "User-Agent": user_agent,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if api_key:
        headers["x-api-key"] = api_key
    request = Request(url, data=body, method="POST", headers=headers)
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _list_or_empty(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _dict_or_empty(value: object) -> dict[str, object]:
    return value if isinstance(value, dict) else {}


def _int_or_zero(value: object) -> int:
    coerced = _int_or_none(value)
    return 0 if coerced is None else coerced


def _int_or_none(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return None
    return None


def _bool_or_none(value: object) -> bool | None:
    return value if isinstance(value, bool) else None


def _string_or_none(value: object) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _date_or_none(value: object) -> date | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
