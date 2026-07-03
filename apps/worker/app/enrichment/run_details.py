from __future__ import annotations

from typing import Any

from app.config import Settings
from app.enrichment.models import (
    StartPubMedMetadataEnrichmentRequest,
    StartS2GraphEnrichmentRequest,
)
from app.enrichment.pubmed import (
    PUBMED_EFETCH_ROOT,
    PUBMED_PROVIDER_NAME,
    effective_pubmed_request_rate,
    pubmed_contact_email_configured,
    pubmed_is_large_job,
    pubmed_provider_limit,
    pubmed_rate_window,
)
from app.enrichment.s2_graph import (
    S2_GRAPH_API_KEY_REQUESTS_PER_SECOND_LIMIT,
    S2_GRAPH_FIELDS,
    S2_GRAPH_PROVIDER_NAME,
    effective_s2_graph_request_rate,
)


def pubmed_run_detail(
    request: StartPubMedMetadataEnrichmentRequest,
    settings: Settings,
) -> dict[str, Any]:
    return {
        "force_refresh": request.force_refresh,
        "provider": PUBMED_PROVIDER_NAME,
        "endpoint": PUBMED_EFETCH_ROOT,
        "batch_size": settings.pubmed_metadata_batch_size,
        "configured_requests_per_second": settings.pubmed_metadata_requests_per_second,
        "peak_requests_per_second": settings.pubmed_metadata_peak_requests_per_second,
        "effective_requests_per_second": effective_pubmed_request_rate(settings),
        "rate_window": pubmed_rate_window(),
        "provider_requests_per_second_limit": pubmed_provider_limit(settings),
        "api_key_present": bool(settings.ncbi_api_key),
        "contact_email_configured": pubmed_contact_email_configured(settings),
        "tool": settings.ncbi_api_tool,
        "timeout_seconds": settings.ncbi_api_timeout_seconds,
        "max_attempts": settings.pubmed_metadata_max_attempts,
        "stale_after_seconds": settings.pubmed_metadata_stale_after_seconds,
        "large_job_threshold": settings.pubmed_metadata_large_job_threshold,
        "is_large_job": pubmed_is_large_job(
            max_papers=request.max_papers,
            settings=settings,
        ),
        "large_job_window": "weekends_or_21_00_to_05_00_eastern",
    }


def s2_graph_run_detail(
    request: StartS2GraphEnrichmentRequest,
    settings: Settings,
) -> dict[str, Any]:
    return {
        "force_refresh": request.force_refresh,
        "provider": S2_GRAPH_PROVIDER_NAME,
        "endpoint": f"{settings.s2_graph_api_base_url.rstrip('/')}/paper/batch",
        "batch_size": settings.s2_graph_batch_size,
        "configured_requests_per_second": settings.s2_graph_requests_per_second,
        "effective_requests_per_second": effective_s2_graph_request_rate(settings),
        "provider_requests_per_second_limit": S2_GRAPH_API_KEY_REQUESTS_PER_SECOND_LIMIT,
        "api_key_present": bool(settings.semantic_scholar_api_key),
        "user_agent": settings.semantic_scholar_api_user_agent,
        "timeout_seconds": settings.semantic_scholar_api_timeout_seconds,
        "max_attempts": settings.s2_graph_max_attempts,
        "stale_after_seconds": settings.s2_graph_stale_after_seconds,
        "requested_fields": list(S2_GRAPH_FIELDS),
    }
