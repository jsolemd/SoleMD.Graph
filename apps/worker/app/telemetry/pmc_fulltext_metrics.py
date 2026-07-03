from __future__ import annotations

from prometheus_client import Counter, Histogram


PMC_FULLTEXT_API_REQUESTS_TOTAL = Counter(
    "pmc_fulltext_api_requests_total",
    "PMC full-text lane API requests by provider and outcome.",
    ["provider", "outcome"],
)
PMC_FULLTEXT_FETCH_LATENCY_SECONDS = Histogram(
    "pmc_fulltext_fetch_latency_seconds",
    "PMC full-text lane API request latency.",
    ["provider"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, float("inf")),
)
PMC_FULLTEXT_BYTES_FETCHED_TOTAL = Counter(
    "pmc_fulltext_bytes_fetched_total",
    "PMC full-text lane payload bytes fetched by provider.",
    ["provider"],
)
PMC_FULLTEXT_PARSE_FAILURES_TOTAL = Counter(
    "pmc_fulltext_parse_failures_total",
    "PMC full-text parser failures by provider and reason.",
    ["provider", "reason"],
)
PMC_FULLTEXT_DOCUMENTS_TOTAL = Counter(
    "pmc_fulltext_documents_total",
    "PMC full-text document materialization outcomes.",
    ["status", "provider"],
)
PMC_FULLTEXT_PASSAGES_TOTAL = Counter(
    "pmc_fulltext_passages_total",
    "PMC full-text passages materialized by role and provider.",
    ["role", "provider"],
)
PMC_FULLTEXT_PROMOTIONS_TOTAL = Counter(
    "pmc_fulltext_promotions_total",
    "PMC full-text promotion outcomes.",
    ["outcome"],
)


def record_pmc_fulltext_api_request(*, provider: str, outcome: str) -> None:
    PMC_FULLTEXT_API_REQUESTS_TOTAL.labels(provider, outcome).inc()


def observe_pmc_fulltext_fetch_latency(
    *,
    provider: str,
    duration_seconds: float,
) -> None:
    PMC_FULLTEXT_FETCH_LATENCY_SECONDS.labels(provider).observe(duration_seconds)


def record_pmc_fulltext_bytes_fetched(*, provider: str, byte_count: int) -> None:
    PMC_FULLTEXT_BYTES_FETCHED_TOTAL.labels(provider).inc(max(0, byte_count))


def record_pmc_fulltext_parse_failure(*, provider: str, reason: str) -> None:
    PMC_FULLTEXT_PARSE_FAILURES_TOTAL.labels(provider, reason).inc()


def record_pmc_fulltext_document(*, status: str, provider: str) -> None:
    PMC_FULLTEXT_DOCUMENTS_TOTAL.labels(status, provider).inc()


def record_pmc_fulltext_passages(*, role: str, provider: str, count: int) -> None:
    PMC_FULLTEXT_PASSAGES_TOTAL.labels(role, provider).inc(max(0, count))


def record_pmc_fulltext_promotion(*, outcome: str) -> None:
    PMC_FULLTEXT_PROMOTIONS_TOTAL.labels(outcome).inc()
