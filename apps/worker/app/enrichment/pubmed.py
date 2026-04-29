from __future__ import annotations

import asyncio
from collections.abc import Sequence
from dataclasses import dataclass
import hashlib
import json
import xml.etree.ElementTree as ET
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.config import Settings
from app.enrichment.http import AsyncRateLimiter, retry_after_seconds


PUBMED_EFETCH_ROOT = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


@dataclass(frozen=True, slots=True)
class PubMedMetadataRecord:
    pmid: int
    response_checksum: str
    article_title: str | None
    abstract_text: str | None
    abstract_hash: str | None
    language_codes: tuple[str, ...]
    publication_types: tuple[str, ...]
    citation_subsets: tuple[str, ...]
    mesh_headings: tuple[dict[str, object], ...]
    mesh_major_terms: tuple[str, ...]
    keywords: tuple[str, ...]
    grant_count: int
    has_grant: bool
    chemicals: tuple[dict[str, object], ...]
    comments_corrections: tuple[dict[str, object], ...]
    has_retraction: bool
    has_erratum: bool
    publication_status: str | None
    structured_abstract: tuple[dict[str, str | None], ...]
    raw_detail: dict[str, object]


class PubMedEfetchClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        allowed_rate = settings.pubmed_metadata_requests_per_second
        if settings.ncbi_api_key:
            allowed_rate = min(allowed_rate, 9.0)
        else:
            allowed_rate = min(allowed_rate, 2.5)
        self._rate_limiter = AsyncRateLimiter(allowed_rate)

    async def fetch(self, pmids: Sequence[int]) -> tuple[PubMedMetadataRecord, ...]:
        if not pmids:
            return ()
        payload = {
            "db": "pubmed",
            "id": ",".join(str(pmid) for pmid in pmids),
            "retmode": "xml",
            "tool": self._settings.ncbi_api_tool,
            "email": self._settings.ncbi_api_email,
        }
        if self._settings.ncbi_api_key:
            payload["api_key"] = self._settings.ncbi_api_key
        body = urlencode(payload).encode("utf-8")
        for attempt in range(1, self._settings.pubmed_metadata_max_attempts + 1):
            await self._rate_limiter.wait()
            try:
                xml_payload = await asyncio.to_thread(
                    _post_bytes,
                    PUBMED_EFETCH_ROOT,
                    body,
                    self._settings.ncbi_api_timeout_seconds,
                    self._settings.ncbi_api_tool,
                    self._settings.ncbi_api_email,
                )
                return parse_pubmed_efetch_xml(xml_payload)
            except HTTPError as exc:
                if exc.code not in {429, 500, 502, 503, 504}:
                    raise
                if attempt >= self._settings.pubmed_metadata_max_attempts:
                    raise
                await asyncio.sleep(retry_after_seconds(exc) or min(60.0, 2.0**attempt))
            except (OSError, TimeoutError):
                if attempt >= self._settings.pubmed_metadata_max_attempts:
                    raise
                await asyncio.sleep(min(60.0, 2.0**attempt))
        return ()


def parse_pubmed_efetch_xml(payload: bytes) -> tuple[PubMedMetadataRecord, ...]:
    root = ET.fromstring(payload)
    records: list[PubMedMetadataRecord] = []
    for article in root.findall("./PubmedArticle"):
        record = _parse_pubmed_article(article)
        if record is not None:
            records.append(record)
    return tuple(records)


def _parse_pubmed_article(article: ET.Element) -> PubMedMetadataRecord | None:
    pmid_text = _text(article.find("./MedlineCitation/PMID"))
    if not pmid_text:
        return None
    try:
        pmid = int(pmid_text)
    except ValueError:
        return None

    title = _text(article.find("./MedlineCitation/Article/ArticleTitle"))
    abstract_sections = []
    abstract_parts = []
    for node in article.findall("./MedlineCitation/Article/Abstract/AbstractText"):
        section_text = _text(node)
        if not section_text:
            continue
        abstract_parts.append(section_text)
        abstract_sections.append(
            {
                "label": node.attrib.get("Label"),
                "nlm_category": node.attrib.get("NlmCategory"),
                "text": section_text,
            }
        )
    abstract_text = "\n".join(abstract_parts) if abstract_parts else None
    abstract_hash = (
        hashlib.sha256(abstract_text.encode("utf-8")).hexdigest()
        if abstract_text is not None
        else None
    )

    mesh_headings: list[dict[str, object]] = []
    mesh_major_terms: list[str] = []
    for mesh in article.findall("./MedlineCitation/MeshHeadingList/MeshHeading"):
        descriptor = mesh.find("./DescriptorName")
        if descriptor is None:
            continue
        descriptor_name = _text(descriptor)
        if not descriptor_name:
            continue
        is_major = descriptor.attrib.get("MajorTopicYN") == "Y"
        if is_major:
            mesh_major_terms.append(descriptor_name)
        qualifiers = [
            {
                "name": _text(qualifier),
                "ui": qualifier.attrib.get("UI"),
                "major": qualifier.attrib.get("MajorTopicYN") == "Y",
            }
            for qualifier in mesh.findall("./QualifierName")
            if _text(qualifier)
        ]
        mesh_headings.append(
            {
                "descriptor": descriptor_name,
                "ui": descriptor.attrib.get("UI"),
                "major": is_major,
                "qualifiers": qualifiers,
            }
        )

    comments = []
    for correction in article.findall("./MedlineCitation/CommentsCorrectionsList/CommentsCorrections"):
        comments.append(
            {
                "ref_type": correction.attrib.get("RefType"),
                "pmid": _text(correction.find("./PMID")),
                "note": _text(correction.find("./Note")),
            }
        )
    ref_types = {
        str(comment.get("ref_type") or "").lower()
        for comment in comments
    }

    chemicals = []
    for chemical in article.findall("./MedlineCitation/ChemicalList/Chemical"):
        chemicals.append(
            {
                "registry_number": _text(chemical.find("./RegistryNumber")),
                "name": _text(chemical.find("./NameOfSubstance")),
                "ui": (
                    chemical.find("./NameOfSubstance").attrib.get("UI")
                    if chemical.find("./NameOfSubstance") is not None
                    else None
                ),
            }
        )

    grant_count = len(article.findall("./MedlineCitation/Article/GrantList/Grant"))
    raw_detail = {
        "pmid": pmid,
        "publication_model": article.find("./MedlineCitation/Article").attrib.get("PubModel")
        if article.find("./MedlineCitation/Article") is not None
        else None,
        "medline_status": article.find("./MedlineCitation").attrib.get("Status")
        if article.find("./MedlineCitation") is not None
        else None,
    }
    checksum_payload = json.dumps(
        {
            "pmid": pmid,
            "title": title,
            "abstract": abstract_text,
            "mesh": mesh_headings,
            "publication_types": _texts(
                article.findall("./MedlineCitation/Article/PublicationTypeList/PublicationType")
            ),
        },
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")

    return PubMedMetadataRecord(
        pmid=pmid,
        response_checksum=hashlib.sha256(checksum_payload).hexdigest(),
        article_title=title,
        abstract_text=abstract_text,
        abstract_hash=abstract_hash,
        language_codes=_texts(article.findall("./MedlineCitation/Article/Language")),
        publication_types=_texts(
            article.findall("./MedlineCitation/Article/PublicationTypeList/PublicationType")
        ),
        citation_subsets=_texts(article.findall("./MedlineCitation/CitationSubset")),
        mesh_headings=tuple(mesh_headings),
        mesh_major_terms=tuple(sorted(set(mesh_major_terms))),
        keywords=_texts(article.findall("./MedlineCitation/KeywordList/Keyword")),
        grant_count=grant_count,
        has_grant=grant_count > 0,
        chemicals=tuple(chemicals),
        comments_corrections=tuple(comments),
        has_retraction=any("retract" in ref_type for ref_type in ref_types),
        has_erratum=any("erratum" in ref_type for ref_type in ref_types),
        publication_status=_text(article.find("./PubmedData/PublicationStatus")),
        structured_abstract=tuple(abstract_sections),
        raw_detail=raw_detail,
    )


def _post_bytes(url: str, body: bytes, timeout: float, tool: str, email: str) -> bytes:
    request = Request(
        url,
        data=body,
        method="POST",
        headers={
            "User-Agent": f"{tool}/1.0 ({email})",
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/xml, text/xml",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def _text(node: ET.Element | None) -> str | None:
    if node is None:
        return None
    value = "".join(node.itertext()).strip()
    return value or None


def _texts(nodes: Sequence[ET.Element]) -> tuple[str, ...]:
    values = {
        value
        for node in nodes
        if (value := _text(node)) is not None
    }
    return tuple(sorted(values))
