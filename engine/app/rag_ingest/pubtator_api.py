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

from app.rag_ingest.source_parsers import (
    BioCXMLDocumentPayload,
    split_biocxml_collection,
)

_PUBTATOR3_BIOCXML_URL = (
    "https://www.ncbi.nlm.nih.gov/research/pubtator3-api/publications/export/biocxml"
)


def fetch_biocxml_batch(
    pmids: list[int],
    *,
    timeout_seconds: float = 30.0,
) -> list[BioCXMLDocumentPayload]:
    """Fetch BioCXML documents for a batch of PMIDs from the PubTator3 API.

    Returns one ``BioCXMLDocumentPayload`` per document found.  PMIDs not in
    PubTator are silently omitted (the API returns only documents it has).
    """
    if not pmids:
        return []
    pmid_param = ",".join(str(p) for p in pmids)
    url = f"{_PUBTATOR3_BIOCXML_URL}?pmids={pmid_param}&full=true"
    request = urllib.request.Request(url)
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        body = response.read().decode("utf-8")
    return split_biocxml_collection(body)


def fetch_biocxml_documents(
    pmids: list[int],
    *,
    batch_size: int = 100,
    rate_limit: float = 3.0,
    timeout_seconds: float = 30.0,
) -> list[BioCXMLDocumentPayload]:
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
    List of ``BioCXMLDocumentPayload`` records with ``(document_id, xml_text)``.
    """
    if not pmids:
        return []

    unique_pmids = list(dict.fromkeys(pmids))
    results: list[BioCXMLDocumentPayload] = []
    delay = 1.0 / rate_limit if rate_limit > 0 else 0.0

    for batch_start in range(0, len(unique_pmids), batch_size):
        if batch_start > 0 and delay > 0:
            time.sleep(delay)
        batch = unique_pmids[batch_start : batch_start + batch_size]
        results.extend(fetch_biocxml_batch(batch, timeout_seconds=timeout_seconds))

    return results
