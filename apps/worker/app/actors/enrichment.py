from __future__ import annotations

import dramatiq

from app.config import settings
from app.db import ensure_worker_pools_open
from app.enrichment.models import (
    StartPubMedMetadataEnrichmentRequest,
    StartS2GraphEnrichmentRequest,
)
from app.enrichment.runtime import (
    run_pubmed_metadata_enrichment,
    run_s2_graph_enrichment,
)


PUBMED_ENRICHMENT_QUEUE = "enrichment_pubmed"
S2_GRAPH_ENRICHMENT_QUEUE = "enrichment_s2"


@dramatiq.actor(
    actor_name="enrichment.pubmed_metadata",
    queue_name=PUBMED_ENRICHMENT_QUEUE,
    max_retries=0,
    time_limit=12 * 60 * 60 * 1000,
)
async def enrich_pubmed_metadata(**payload: object) -> None:
    request = StartPubMedMetadataEnrichmentRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_pubmed_metadata_enrichment(
        request,
        ingest_pool=pools.get("ingest_write"),
    )


@dramatiq.actor(
    actor_name="enrichment.s2_graph",
    queue_name=S2_GRAPH_ENRICHMENT_QUEUE,
    max_retries=0,
    time_limit=6 * 60 * 60 * 1000,
)
async def enrich_s2_graph(**payload: object) -> None:
    request = StartS2GraphEnrichmentRequest.model_validate(payload)
    pools = await ensure_worker_pools_open(settings, names=("ingest_write",))
    await run_s2_graph_enrichment(
        request,
        ingest_pool=pools.get("ingest_write"),
    )
