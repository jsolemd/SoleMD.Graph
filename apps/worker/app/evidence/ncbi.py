from __future__ import annotations

import asyncio
from datetime import UTC, datetime
import hashlib
import json
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import Settings
from app.evidence.errors import PaperTextFetchFailed, PaperTextUnavailable
from app.evidence.models import FetchManifest, PaperMetadata, ResolvedLocator


PMCOA_API_ROOT = "https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi"
PMC_ID_CONVERTER_ROOT = "https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/"
PUBMED_EUTILS_SUMMARY_ROOT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"


async def resolve_locator(
    settings: Settings,
    paper: PaperMetadata,
) -> ResolvedLocator:
    return (await resolve_locators(settings, paper))[0]


async def resolve_locators(
    settings: Settings,
    paper: PaperMetadata,
) -> tuple[ResolvedLocator, ...]:
    candidates: list[ResolvedLocator] = []

    def append_candidate(candidate: ResolvedLocator | None) -> None:
        if candidate is None:
            return
        candidate_key = (candidate.locator_kind, candidate.locator_value)
        if any((item.locator_kind, item.locator_value) == candidate_key for item in candidates):
            return
        candidates.append(candidate)

    pmc_id = _normalize_pmc_id(paper.pmc_id)
    if pmc_id:
        append_candidate(
            ResolvedLocator(
                locator_kind="pmcid",
                locator_value=pmc_id,
                resolver_kind="paper_row_pmcid",
                resolved_pmc_id=pmc_id,
            )
        )

    if paper.pmid is not None:
        resolved = await _resolve_via_id_converter(
            settings,
            identifier=str(paper.pmid),
            id_type="pmid",
        )
        if resolved:
            append_candidate(
                ResolvedLocator(
                    locator_kind="pmcid",
                    locator_value=resolved,
                    resolver_kind="id_converter_pmid",
                    resolved_pmc_id=resolved,
                )
            )
        resolved = await _resolve_via_pubmed_summary(
            settings,
            pmid=str(paper.pmid),
        )
        if resolved:
            append_candidate(
                ResolvedLocator(
                    locator_kind="pmcid",
                    locator_value=resolved,
                    resolver_kind="pubmed_esummary_pmid",
                    resolved_pmc_id=resolved,
                )
            )
        append_candidate(
            ResolvedLocator(
                locator_kind="pmid",
                locator_value=str(paper.pmid),
                resolver_kind="pmid_direct",
            )
        )

    if paper.doi_norm:
        resolved = await _resolve_via_id_converter(
            settings,
            identifier=paper.doi_norm,
            id_type="doi",
        )
        if resolved:
            append_candidate(
                ResolvedLocator(
                    locator_kind="pmcid",
                    locator_value=resolved,
                    resolver_kind="id_converter_doi",
                    resolved_pmc_id=resolved,
                )
            )

    if candidates:
        return tuple(candidates)

    raise PaperTextUnavailable(
        f"paper {paper.corpus_id} has no PMCID/PMID/DOI path for PMC BioC fetch"
    )


async def fetch_pmc_biocxml(
    settings: Settings,
    locator: ResolvedLocator,
) -> tuple[bytes, FetchManifest]:
    url = f"{PMCOA_API_ROOT}/BioC_xml/{locator.locator_value}/unicode"

    try:
        payload = await asyncio.to_thread(
            _fetch_bytes,
            url,
            settings.ncbi_api_timeout_seconds,
            settings.ncbi_api_tool,
            settings.ncbi_api_email,
        )
    except HTTPError as exc:
        if exc.code in {400, 404}:
            raise PaperTextUnavailable(
                f"PMC BioC returned HTTP {exc.code} for {locator.locator_kind}:{locator.locator_value}",
                locator=locator,
            ) from exc
        raise PaperTextFetchFailed(
            f"PMC BioC request failed for {locator.locator_kind}:{locator.locator_value} "
            f"(HTTP {exc.code})",
            locator=locator,
        ) from exc
    except (OSError, TimeoutError) as exc:
        raise PaperTextFetchFailed(
            f"PMC BioC request failed for {locator.locator_kind}:{locator.locator_value}: {exc}",
            locator=locator,
        ) from exc
    normalized_payload = payload.lstrip()
    if not (
        normalized_payload.startswith(b"<?xml")
        or normalized_payload.startswith(b"<collection")
        or normalized_payload.startswith(b"<document")
    ):
        if b"no result can be found" in normalized_payload.lower():
            raise PaperTextUnavailable(
                f"PMC BioC reported no result for {locator.locator_kind}:{locator.locator_value}",
                locator=locator,
            )
        raise PaperTextFetchFailed(
            f"PMC BioC returned a non-XML payload for {locator.locator_kind}:{locator.locator_value}; "
            f"payload preview: {_payload_preview(normalized_payload)}",
            locator=locator,
        )

    manifest = FetchManifest(
        locator_kind=locator.locator_kind,
        locator_value=locator.locator_value,
        resolver_kind=locator.resolver_kind,
        resolved_pmc_id=locator.resolved_pmc_id,
        manifest_uri=url,
        response_checksum=hashlib.sha1(payload).hexdigest(),
        fetched_at=datetime.now(UTC),
    )
    return payload, manifest


async def _resolve_via_id_converter(
    settings: Settings,
    *,
    identifier: str,
    id_type: str,
) -> str | None:
    query = urlencode(
        {
            "ids": identifier,
            "format": "json",
            "tool": settings.ncbi_api_tool,
            "email": settings.ncbi_api_email,
            "idtype": id_type,
        }
    )
    url = f"{PMC_ID_CONVERTER_ROOT}?{query}"
    payload = await asyncio.to_thread(
        _fetch_optional_bytes,
        url,
        settings.ncbi_api_timeout_seconds,
        settings.ncbi_api_tool,
        settings.ncbi_api_email,
    )
    if payload is None:
        return None
    response = json.loads(payload.decode("utf-8"))
    records = response.get("records") or []
    if not records:
        return None
    return _normalize_pmc_id(records[0].get("pmcid"))


async def _resolve_via_pubmed_summary(
    settings: Settings,
    *,
    pmid: str,
) -> str | None:
    query = urlencode(
        {
            "db": "pubmed",
            "id": pmid,
            "retmode": "json",
            "tool": settings.ncbi_api_tool,
            "email": settings.ncbi_api_email,
        }
    )
    url = f"{PUBMED_EUTILS_SUMMARY_ROOT}?{query}"
    payload = await asyncio.to_thread(
        _fetch_optional_bytes,
        url,
        settings.ncbi_api_timeout_seconds,
        settings.ncbi_api_tool,
        settings.ncbi_api_email,
    )
    if payload is None:
        return None
    response = json.loads(payload.decode("utf-8"))
    result = response.get("result") or {}
    summary = result.get(str(pmid)) or {}
    article_ids = summary.get("articleids") or []
    for article_id in article_ids:
        if not isinstance(article_id, dict):
            continue
        id_type = str(article_id.get("idtype") or "").strip().lower()
        value = article_id.get("value")
        if id_type in {"pmc", "pmcid"}:
            normalized = _normalize_pmc_id(_coerce_pmc_article_id(value))
            if normalized:
                return normalized
    return None


def _fetch_bytes(url: str, timeout: float, tool: str, email: str) -> bytes:
    request = Request(
        url,
        headers={
            "User-Agent": f"{tool}/1.0 ({email})",
            "Accept": "application/json, application/xml;q=0.9, text/xml;q=0.9",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _fetch_optional_bytes(url: str, timeout: float, tool: str, email: str) -> bytes | None:
    try:
        return _fetch_bytes(url, timeout, tool, email)
    except HTTPError as exc:
        if exc.code in {400, 404}:
            return None
        raise


def _coerce_pmc_article_id(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if text.lower().startswith("pmc-id:"):
        text = text.split(":", 1)[1].strip()
    return text.strip(" ;")


def _normalize_pmc_id(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip().upper()
    if not text:
        return None
    if not text.startswith("PMC"):
        text = f"PMC{text}"
    suffix = text[3:]
    if not suffix.isdigit():
        return None
    return text


def _payload_preview(payload: bytes, *, limit: int = 120) -> str:
    preview = payload.decode("utf-8", errors="replace")
    preview = " ".join(preview.split())
    if len(preview) <= limit:
        return preview
    return f"{preview[:limit].rstrip()}..."
