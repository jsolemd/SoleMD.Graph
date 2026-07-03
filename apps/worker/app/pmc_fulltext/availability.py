from __future__ import annotations

from urllib.parse import urlencode

from lxml import etree

from app.config import Settings
from app.pmc_fulltext.fetch import PmcFullTextFetcher
from app.pmc_fulltext.license import (
    has_license_provenance,
    normalize_license_text,
    normalize_text,
    normalize_url,
)
from app.pmc_fulltext.models import PmcAvailability, PmcFullTextUnavailable


PMC_OA_ROOT = "https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi"
PMC_OAI_ROOT = "https://www.ncbi.nlm.nih.gov/pmc/oai/oai.cgi"


class PmcAvailabilityResolver:
    def __init__(self, settings: Settings, fetcher: PmcFullTextFetcher) -> None:
        self._settings = settings
        self._fetcher = fetcher

    async def resolve(self, pmcid: str) -> PmcAvailability:
        oa_result = await self._resolve_oa(pmcid)
        if oa_result.available and has_license_provenance(
            license_text=oa_result.license,
            license_url=oa_result.license_url,
        ):
            return oa_result

        oai_result = await self._resolve_oai(pmcid)
        if oai_result.available and has_license_provenance(
            license_text=oai_result.license,
            license_url=oai_result.license_url,
        ):
            return oai_result

        if oa_result.available:
            return PmcAvailability(
                pmcid=pmcid,
                available=False,
                provider=oa_result.provider,
                source_url=oa_result.source_url,
                license=oa_result.license,
                license_url=oa_result.license_url,
                reason="PMC OA result did not include license provenance",
            )
        if oai_result.available:
            return PmcAvailability(
                pmcid=pmcid,
                available=False,
                provider=oai_result.provider,
                source_url=oai_result.source_url,
                license=oai_result.license,
                license_url=oai_result.license_url,
                reason="PMC OAI result did not include license provenance",
            )
        return oa_result if oa_result.reason else oai_result

    async def _resolve_oa(self, pmcid: str) -> PmcAvailability:
        url = build_pmc_oa_url(self._settings, pmcid)
        try:
            payload = await self._fetcher.fetch_bytes(
                url=url,
                provider="pmc_oa",
                accept="application/xml, text/xml;q=0.9",
            )
        except PmcFullTextUnavailable as exc:
            return PmcAvailability(
                pmcid=pmcid,
                available=False,
                provider="pmc_oa",
                source_url=url,
                reason=exc.reason,
            )
        return parse_pmc_oa_response(payload, pmcid=pmcid, source_url=url)

    async def _resolve_oai(self, pmcid: str) -> PmcAvailability:
        url = build_pmc_oai_url(self._settings, pmcid)
        try:
            payload = await self._fetcher.fetch_bytes(
                url=url,
                provider="pmc_oai",
                accept="application/xml, text/xml;q=0.9",
            )
        except PmcFullTextUnavailable as exc:
            return PmcAvailability(
                pmcid=pmcid,
                available=False,
                provider="pmc_oai",
                source_url=url,
                reason=exc.reason,
            )
        return parse_pmc_oai_response(payload, pmcid=pmcid, source_url=url)


def build_pmc_oa_url(settings: Settings, pmcid: str) -> str:
    params = {
        "id": pmcid,
        "tool": settings.ncbi_api_tool,
        "email": settings.ncbi_api_email,
    }
    if settings.ncbi_api_key:
        params["api_key"] = settings.ncbi_api_key
    return f"{PMC_OA_ROOT}?{urlencode(params)}"


def build_pmc_oai_url(settings: Settings, pmcid: str) -> str:
    params = {
        "verb": "GetRecord",
        "identifier": f"oai:pubmedcentral.nih.gov:{pmcid}",
        "metadataPrefix": "pmc",
        "tool": settings.ncbi_api_tool,
        "email": settings.ncbi_api_email,
    }
    if settings.ncbi_api_key:
        params["api_key"] = settings.ncbi_api_key
    return f"{PMC_OAI_ROOT}?{urlencode(params)}"


def parse_pmc_oa_response(payload: bytes, *, pmcid: str, source_url: str) -> PmcAvailability:
    try:
        root = etree.fromstring(payload)
    except etree.XMLSyntaxError as exc:
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oa",
            source_url=source_url,
            reason=f"PMC OA XML parse failed: {exc.__class__.__name__}",
        )
    error_text = _first_text(root, "error")
    if error_text:
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oa",
            source_url=source_url,
            reason=normalize_text(error_text),
        )
    record = _first_element(root, "record")
    if record is None:
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oa",
            source_url=source_url,
            reason="PMC OA response did not include a record",
        )
    license_text = normalize_license_text(
        record.get("license")
        or record.get("license-type")
        or _first_text(record, "license")
        or _first_text(record, "rights")
        or ""
    )
    license_url = _license_url(record)
    return PmcAvailability(
        pmcid=pmcid,
        available=True,
        provider="pmc_oa",
        source_url=source_url,
        license=license_text or None,
        license_url=license_url,
    )


def parse_pmc_oai_response(payload: bytes, *, pmcid: str, source_url: str) -> PmcAvailability:
    try:
        root = etree.fromstring(payload)
    except etree.XMLSyntaxError as exc:
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oai",
            source_url=source_url,
            reason=f"PMC OAI XML parse failed: {exc.__class__.__name__}",
        )
    error = _first_element(root, "error")
    if error is not None:
        code = error.get("code") or "unknown"
        detail = normalize_text(error.text or "")
        reason = f"PMC OAI {code}: {detail}".rstrip(": ")
        return PmcAvailability(
            pmcid=pmcid,
            available=False,
            provider="pmc_oai",
            source_url=source_url,
            reason=reason,
        )
    license_text = normalize_license_text(
        _first_text(root, "license")
        or _first_text(root, "license-p")
        or _first_text(root, "rights")
        or ""
    )
    license_url = _license_url(root)
    return PmcAvailability(
        pmcid=pmcid,
        available=True,
        provider="pmc_oai",
        source_url=source_url,
        license=license_text or license_url,
        license_url=license_url,
    )


def _first_element(root: etree._Element, local_name: str) -> etree._Element | None:
    matches = root.xpath(f".//*[local-name() = '{local_name}']")
    if not matches:
        return None
    return matches[0]


def _first_text(root: etree._Element, local_name: str) -> str | None:
    element = _first_element(root, local_name)
    if element is None:
        return None
    return " ".join("".join(element.itertext()).split())


def _license_url(root: etree._Element) -> str | None:
    for element in root.xpath(".//*[local-name() = 'license']"):
        for key in ("href", "{http://www.w3.org/1999/xlink}href"):
            value = element.get(key)
            if value:
                return normalize_url(value)
    for element in root.xpath(".//*[local-name() = 'link']"):
        href = element.get("href")
        if href and "license" in href.lower():
            return normalize_url(href)
    return None
