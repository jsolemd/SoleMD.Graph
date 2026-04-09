"""Semantic Scholar API client with rate limiting and exponential backoff.

Handles the 1 req/sec rate limit, 429/5xx retries, and batch endpoint
(POST /graph/v1/paper/batch, max 500 IDs per request).

Used by enrich.py to pull paper metadata, authors, OA PDF metadata,
abstracts, TLDRs, embeddings, and text availability for domain corpus papers.

API KEY SAFETY IS CRITICAL — losing access blocks the entire project.

Hard rules (violation risks key revocation):
  - 1 req/sec cumulative across all endpoints
  - Exponential backoff mandatory on 429 (wait 2^n seconds, 1s/2s/4s/8s/16s)
  - Never parallelize requests (1 key = 1 req/sec)
  - Max 500 IDs per /paper/batch request
  - Max 10 MB response size
  - Header `x-api-key` is case-sensitive; include on every request
  - Prefer pre-emptive sleep over fire-and-throttle

Usage:
    from app.corpus.s2_client import S2Client

    with S2Client() as client:
        results = client.fetch_batch([123, 456], "abstract,tldr")
        for paper in client.fetch_all(corpus_ids, "abstract,tldr"):
            print(paper)

=============================================================================
S2 API OPERATIONAL CONTRACT (full knowledge base lives here, not in docs)
=============================================================================

This module docstring is the canonical reference for S2 API usage in the
project. `docs/map/ingest.md` contains only a pointer back to this file.

-----------------------------------------------------------------------------
ENDPOINT CATALOG
-----------------------------------------------------------------------------

Graph API (per-paper, live):
  GET   https://api.semanticscholar.org/graph/v1/paper/{id}
  POST  https://api.semanticscholar.org/graph/v1/paper/batch
        body: {"ids": ["CorpusId:123", "CorpusId:456", ...]}
        params: ?fields=paperId,externalIds,abstract,tldr,embedding.specter_v2,...

Datasets API (bulk snapshots, monthly cadence):
  GET   https://api.semanticscholar.org/datasets/v1/release/
        -> ["2026-03-01", "2026-02-01", ...]  (newest first)
  GET   https://api.semanticscholar.org/datasets/v1/release/latest/dataset/{name}
        -> {"name": ..., "files": [pre-signed S3 URL, ...]}
  GET   https://api.semanticscholar.org/datasets/v1/diffs/{from}/to/{to}/{name}
        -> {"update_files": [...], "delete_files": [...]}

Datasets used by this project:
  - paper-ids      (PMID <-> corpus_id mapping, ~8 GB, downloaded in full)
  - papers         (stable metadata, ~45 GB, downloaded in full)
  Everything else (abstracts, embeddings, TLDRs, references) comes via
  the batch API AFTER DuckDB domain filtering — avoids ~1.1 TB of bulk.

-----------------------------------------------------------------------------
BATCH RESPONSE SHAPE
-----------------------------------------------------------------------------

POST /graph/v1/paper/batch returns a LIST the same length as the input ids.
Papers not found in S2 are returned as `null` entries, not omitted. Always
filter for None:

    results = client.fetch_batch(ids, fields)
    found = [p for p in results if p is not None]

Default fields include: paperId, externalIds, abstract, tldr,
embedding.specter_v2 (768-dim vector), textAvailability, publicationVenue,
journal, openAccessPdf, authors.{authorId,name,affiliations,externalIds}.

Nested reference/citation fields supported: references.paperId,
references.corpusId, references.title, references.year, references.externalIds.

Nested fields NOT supported on the paper batch endpoint (as of 2026-04):
  - citations.intents
  - citations.isInfluential
  - references.intents
  - references.isInfluential

If intent/influence becomes mandatory, pull from the dedicated S2 CITATIONS
dataset (not from /paper/batch). See `app.corpus.citations` for the domain
citation edge derivation that uses the references fields above.

-----------------------------------------------------------------------------
TIME ESTIMATES (1 req/sec, 500 IDs per request)
-----------------------------------------------------------------------------

  Corpus Size       Requests    Wall Time
  ----------------- ----------- -----------
  200K papers            400      ~7 min
  500K papers          1,000     ~17 min
  2M papers            4,000     ~67 min
  5M papers           10,000     ~2.8 hr

These are wall-clock minimums. Real runs add latency, retries, and DB write
time. Plan overnight for any corpus >2M.

-----------------------------------------------------------------------------
BULK DOWNLOAD (paper-ids + papers only)
-----------------------------------------------------------------------------

Bulk download of paper-ids + papers datasets uses pre-signed S3 URLs from the
dataset manifest endpoint. Shards are .jsonl.gz files. Use HTTP Range header
for resume support; 416 status means the shard is already complete.

Store release metadata in a sidecar JSON file so monthly diffs know what
the current local release is:

    {"papers": {"release_id": "2026-03-10", "shard_count": 30}, ...}

-----------------------------------------------------------------------------
MONTHLY REFRESH WORKFLOW (via /datasets/v1/diffs)
-----------------------------------------------------------------------------

  1. Read current release_id from local sidecar metadata
  2. Call /release/ to get latest release_id; abort if equal
  3. For each dataset (paper-ids, papers):
       - GET /diffs/{current}/to/{latest}/{dataset}
       - Download each update_file (upserts) and delete_file
  4. Apply diffs to local filtered Parquet
  5. Re-run DuckDB domain filtering -> new corpus id list
  6. Batch API pass for new/changed domain papers (stamp
     s2_full_release_id, s2_references_release_id, s2_embedding_release_id
     on solemd.papers for per-field release tracking)
  7. Derive or refresh domain citation edges (see app.corpus.citations)
  8. UPSERT into PostgreSQL
  9. Incremental UMAP .transform() for new papers between full recomputes
     (full GPU recompute quarterly, or when >20% of corpus is new)
  10. Update sidecar metadata with new release_id

Per-dataset refresh strategy:

  Dataset            Strategy                 Source of truth
  ------------------ ------------------------ ---------------------------
  paper-ids          incremental diff (bulk)  paper-ids dataset
  papers             incremental diff (bulk)  papers dataset
  full metadata      release-aware batch      s2_full_release_id column
  references         release-aware batch      s2_references_release_id col
  embeddings         release-aware batch      s2_embedding_release_id col

-----------------------------------------------------------------------------
LOCAL DIRECTORY LAYOUT
-----------------------------------------------------------------------------

  data/semantic-scholar/
  +-- releases/<release_id>/
  |   +-- paper-ids/         (~10 shards, ~8 GB)
  |   +-- papers/            (~30 shards, ~45 GB)
  |   +-- publication-venues/
  +-- filtered/              (DuckDB-filtered domain corpus id lists)
  |   +-- domain_corpus_ids.parquet
  |   +-- expanded_corpus_ids.parquet
  +-- release_metadata.json  (per-dataset release tracking)

Note: abstracts, embeddings, citations, and TLDRs are NOT stored locally as
intermediate files. They flow directly from the batch API into PostgreSQL
via `app.corpus.enrich`.

-----------------------------------------------------------------------------
INCREMENTAL EXPANSION STRATEGY
-----------------------------------------------------------------------------

Start narrow and expand — each phase reuses the same pipeline:

  Phase 1:  200K psychiatry-core papers        ~7 min API time
  Phase 2:  500K neuro/psych papers            ~17 min API time
  Phase 3:  2M full domain (MeSH-filtered)     ~67 min API time
  Phase 4:  5-10M expanded (+ citation neighbors)

PostgreSQL loading uses UPSERT so new data merges cleanly across phases.

-----------------------------------------------------------------------------
RELATED MODULES
-----------------------------------------------------------------------------

  app.corpus.s2_client   (this file)         — API client + rate limit
  app.corpus.enrich      — top-level enrichment orchestrator, bulk caller
  app.corpus.citations   — derives domain-domain citation edges from
                           the references[] field of batch responses
  app.corpus.filter      — DuckDB domain filtering over bulk shards
  app.corpus.venues      — journal / publication venue normalization

See also: docs/map/ingest.md (points back to this docstring),
docs/map/database.md (solemd.papers column catalog including the
s2_*_release_id stamps).
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
