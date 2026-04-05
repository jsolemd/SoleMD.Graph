"""PubTator3 REST API client for on-demand BioCXML document retrieval.

Fetches BioCXML documents by PMID from the PubTator3 API.  Returns the same
XML format that ``parse_biocxml_document()`` already accepts, so the result
can be piped directly into the existing warehouse parser/writer pipeline.

Rate limit: 3 req/s.  Batch size: up to ~100 PMIDs per request.
"""

from __future__ import annotations

import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass

_PUBTATOR3_BIOCXML_URL = (
    "https://www.ncbi.nlm.nih.gov/research/pubtator3-api/publications/export/biocxml"
)


@dataclass(slots=True)
class BioCXMLFetchResult:
    """One fetched BioCXML document with its source identifier."""

    document_id: str
    xml_text: str


def _split_biocxml_collection(collection_xml: str) -> list[BioCXMLFetchResult]:
    """Split a PubTator3 ``<collection>`` response into per-document XML strings.

    The API returns a single ``<collection>`` element containing one or more
    ``<document>`` children.  Each ``<document>`` is wrapped back into a
    standalone ``<collection>`` so that ``parse_biocxml_document()`` can consume
    it without modification.
    """
    root = ET.fromstring(collection_xml)
    results: list[BioCXMLFetchResult] = []

    source_elem = root.find("source")
    source_text = source_elem.text if source_elem is not None and source_elem.text else "PubTator"
    key_elem = root.find("key")
    key_text = key_elem.text if key_elem is not None and key_elem.text else ""
    date_elem = root.find("date")
    date_text = date_elem.text if date_elem is not None and date_elem.text else ""

    for document_elem in root.findall(".//document"):
        doc_id_elem = document_elem.find("id")
        document_id = (doc_id_elem.text or "").strip() if doc_id_elem is not None else ""
        if not document_id:
            continue

        wrapper = ET.Element("collection")
        ET.SubElement(wrapper, "source").text = source_text
        if date_text:
            ET.SubElement(wrapper, "date").text = date_text
        if key_text:
            ET.SubElement(wrapper, "key").text = key_text
        wrapper.append(document_elem)

        xml_text = ET.tostring(wrapper, encoding="unicode", xml_declaration=False)
        results.append(BioCXMLFetchResult(document_id=document_id, xml_text=xml_text))

    return results


def fetch_biocxml_batch(
    pmids: list[int],
    *,
    timeout_seconds: float = 30.0,
) -> list[BioCXMLFetchResult]:
    """Fetch BioCXML documents for a batch of PMIDs from the PubTator3 API.

    Returns one ``BioCXMLFetchResult`` per document found.  PMIDs not in
    PubTator are silently omitted (the API returns only documents it has).
    """
    if not pmids:
        return []
    pmid_param = ",".join(str(p) for p in pmids)
    url = f"{_PUBTATOR3_BIOCXML_URL}?pmids={pmid_param}&full=true"
    request = urllib.request.Request(url)
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        body = response.read().decode("utf-8")
    return _split_biocxml_collection(body)


def fetch_biocxml_documents(
    pmids: list[int],
    *,
    batch_size: int = 100,
    rate_limit: float = 3.0,
    timeout_seconds: float = 30.0,
) -> list[BioCXMLFetchResult]:
    """Fetch BioCXML documents for an arbitrary number of PMIDs.

    Batches requests to stay under the API batch-size limit and sleeps between
    batches to respect the rate limit.

    Parameters
    ----------
    pmids:
        PubMed IDs to fetch.
    batch_size:
        Maximum PMIDs per HTTP request (API limit ~100).
    rate_limit:
        Maximum requests per second.
    timeout_seconds:
        HTTP timeout per request.

    Returns
    -------
    List of ``BioCXMLFetchResult`` tuples with ``(document_id, xml_text)``.
    """
    if not pmids:
        return []

    unique_pmids = list(dict.fromkeys(pmids))
    results: list[BioCXMLFetchResult] = []
    delay = 1.0 / rate_limit if rate_limit > 0 else 0.0

    for batch_start in range(0, len(unique_pmids), batch_size):
        if batch_start > 0 and delay > 0:
            time.sleep(delay)
        batch = unique_pmids[batch_start : batch_start + batch_size]
        results.extend(fetch_biocxml_batch(batch, timeout_seconds=timeout_seconds))

    return results
