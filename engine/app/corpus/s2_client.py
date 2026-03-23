"""Semantic Scholar API client with rate limiting and exponential backoff.

Handles the 1 req/sec rate limit, 429/5xx retries, and batch endpoint
(POST /graph/v1/paper/batch, max 500 IDs per request).

Used by enrich.py to pull paper metadata, authors, OA PDF metadata,
abstracts, TLDRs, embeddings, and text availability for domain corpus papers.

API KEY SAFETY IS CRITICAL — losing access blocks the entire project.

Hard rules (violation risks key revocation):
  - 1 req/sec cumulative across all endpoints
  - Exponential backoff mandatory on 429
  - Never parallelize requests (1 key = 1 req/sec)
  - Max 500 IDs per /paper/batch request
  - Max 10 MB response size

Usage:
    from app.corpus.s2_client import S2Client

    with S2Client() as client:
        results = client.fetch_batch([123, 456], "abstract,tldr")
        for paper in client.fetch_all(corpus_ids, "abstract,tldr"):
            print(paper)
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Batch API hard limits (from S2 docs)
MAX_BATCH_SIZE = 500
MAX_RESPONSE_BYTES = 10_000_000  # 10 MB
MAX_RETRIES = 5

# Default fields for enrichment.
# embedding.specter_v2 returns 768-dim vector.
# textAvailability is the API's native text access signal.
DEFAULT_FIELDS = ",".join(
    [
        "paperId",
        "externalIds",
        "abstract",
        "tldr",
        "embedding.specter_v2",
        "textAvailability",
        "publicationVenue",
        "journal",
        "openAccessPdf",
        "authors.authorId",
        "authors.name",
        "authors.affiliations",
        "authors.externalIds",
    ]
)


class S2Client:
    """Semantic Scholar batch API client with rate limiting.

    Rate limiting uses pre-emptive sleep between requests (not
    fire-and-throttle). This is safer than relying on 429 responses.

    Args:
        api_key: S2 API key. Falls back to settings.s2_api_key.
        rate_limit: Minimum seconds between requests. Default 1.0.
    """

    def __init__(self, api_key: str = "", rate_limit: float = 1.0):
        self._api_key = api_key or settings.s2_api_key
        self._rate_limit = rate_limit
        self._base_url = settings.s2_api_base
        self._last_request_time = 0.0
        self._consecutive_429s = 0
        self._total_requests = 0
        self._total_429s = 0

        headers = {"User-Agent": "SoleMD.Graph/0.1.0"}
        if self._api_key:
            headers["x-api-key"] = self._api_key

        self._client = httpx.Client(
            base_url=self._base_url,
            headers=headers,
            timeout=httpx.Timeout(30.0, connect=10.0),
        )

    def _throttle(self) -> None:
        """Enforce minimum delay between requests."""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < self._rate_limit:
            time.sleep(self._rate_limit - elapsed)
        self._last_request_time = time.monotonic()

    def fetch_batch(self, corpus_ids: list[int], fields: str = DEFAULT_FIELDS) -> list[dict | None]:
        """Fetch a batch of papers from the S2 batch endpoint.

        Args:
            corpus_ids: List of S2 corpus IDs (max 500).
            fields: Comma-separated field names.

        Returns:
            List of paper dicts (or None for unknown papers),
            in the same order as corpus_ids.

        Raises:
            ValueError: If batch exceeds 500 IDs.
            RuntimeError: If max retries exceeded or response too large.
        """
        if len(corpus_ids) > MAX_BATCH_SIZE:
            raise ValueError(f"Batch size {len(corpus_ids)} exceeds max {MAX_BATCH_SIZE}")

        ids = [f"CorpusId:{cid}" for cid in corpus_ids]

        for attempt in range(MAX_RETRIES + 1):
            self._throttle()
            self._total_requests += 1

            try:
                response = self._client.post(
                    "/graph/v1/paper/batch",
                    json={"ids": ids},
                    params={"fields": fields},
                )
            except httpx.TransportError as e:
                wait = min(2**attempt, 60)
                logger.warning(
                    "Transport error: %s — waiting %ds (attempt %d/%d)",
                    e, wait, attempt + 1, MAX_RETRIES,
                )
                time.sleep(wait)
                continue

            if response.status_code == 429:
                self._consecutive_429s += 1
                self._total_429s += 1

                if self._consecutive_429s >= 5:
                    # Aggressive cooldown — something is wrong
                    wait = 300
                    logger.warning(
                        "5+ consecutive 429s — cooling down %ds. Total 429s: %d",
                        wait, self._total_429s,
                    )
                    self._consecutive_429s = 0
                else:
                    wait = min(2**attempt, 60)
                    logger.warning(
                        "429 rate limited — waiting %ds (attempt %d/%d)",
                        wait, attempt + 1, MAX_RETRIES,
                    )

                time.sleep(wait)
                continue

            if response.status_code >= 500:
                wait = min(2**attempt, 60)
                logger.warning(
                    "Server error %d — waiting %ds (attempt %d/%d)",
                    response.status_code, wait, attempt + 1, MAX_RETRIES,
                )
                time.sleep(wait)
                continue

            # Success path
            self._consecutive_429s = 0
            response.raise_for_status()

            content_len = len(response.content)
            if content_len > MAX_RESPONSE_BYTES:
                raise RuntimeError(
                    f"Response size {content_len} exceeds {MAX_RESPONSE_BYTES} limit"
                )

            if content_len > MAX_RESPONSE_BYTES * 0.8:
                logger.warning(
                    "Response size %d bytes (%.0f%% of 10 MB limit) — "
                    "consider reducing batch size if this recurs",
                    content_len, content_len / MAX_RESPONSE_BYTES * 100,
                )

            return response.json()

        raise RuntimeError(
            f"Max retries ({MAX_RETRIES}) exceeded for batch of {len(corpus_ids)} papers"
        )

    def fetch_all(
        self,
        corpus_ids: list[int],
        fields: str = DEFAULT_FIELDS,
        *,
        batch_size: int = MAX_BATCH_SIZE,
        progress_every: int = 10,
    ) -> Iterator[tuple[int, dict]]:
        """Fetch all papers in batches, yielding (corpus_id, result) pairs.

        Skips papers where the API returns null (unknown to S2).

        Args:
            corpus_ids: Full list of corpus IDs to fetch.
            fields: Comma-separated field names.
            batch_size: IDs per batch request (max 500).
            progress_every: Log progress every N batches.

        Yields:
            Tuples of (corpus_id, paper_dict) for non-null results.
        """
        total_batches = (len(corpus_ids) + batch_size - 1) // batch_size
        yielded = 0
        nulls = 0

        for i in range(0, len(corpus_ids), batch_size):
            batch_num = i // batch_size + 1
            batch = corpus_ids[i : i + batch_size]

            results = self.fetch_batch(batch, fields)

            for j, result in enumerate(results):
                if result is not None:
                    yield batch[j], result
                    yielded += 1
                else:
                    nulls += 1

            if batch_num % progress_every == 0 or batch_num == total_batches:
                logger.info(
                    "Batch %d/%d — %d papers fetched, %d null, %d total requests, %d 429s",
                    batch_num,
                    total_batches,
                    yielded,
                    nulls,
                    self._total_requests,
                    self._total_429s,
                )

    @property
    def stats(self) -> dict:
        """Return client statistics for logging/monitoring."""
        return {
            "total_requests": self._total_requests,
            "total_429s": self._total_429s,
            "rate_limit": self._rate_limit,
        }

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> S2Client:
        return self

    def __exit__(self, *args) -> None:
        self.close()
