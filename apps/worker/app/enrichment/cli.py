from __future__ import annotations

from uuid import UUID

from app.actors.enrichment import enrich_pubmed_metadata, enrich_s2_graph
from app.enrichment.models import (
    StartPubMedMetadataEnrichmentRequest,
    StartS2GraphEnrichmentRequest,
)


def parse_pubmed_metadata_enrichment_request(
    *,
    corpus_selection_run_id: UUID,
    requested_by: str | None,
    max_papers: int | None,
    force_refresh: bool,
) -> StartPubMedMetadataEnrichmentRequest:
    return StartPubMedMetadataEnrichmentRequest.model_validate(
        {
            "corpus_selection_run_id": corpus_selection_run_id,
            "requested_by": requested_by,
            "max_papers": max_papers,
            "force_refresh": force_refresh,
        }
    )


def parse_s2_graph_enrichment_request(
    *,
    corpus_selection_run_id: UUID,
    requested_by: str | None,
    max_papers: int | None,
    force_refresh: bool,
) -> StartS2GraphEnrichmentRequest:
    return StartS2GraphEnrichmentRequest.model_validate(
        {
            "corpus_selection_run_id": corpus_selection_run_id,
            "requested_by": requested_by,
            "max_papers": max_papers,
            "force_refresh": force_refresh,
        }
    )


def enqueue_pubmed_metadata_enrichment_request(
    request: StartPubMedMetadataEnrichmentRequest,
) -> None:
    enrich_pubmed_metadata.send(**request.model_dump(mode="json"))


def enqueue_s2_graph_enrichment_request(
    request: StartS2GraphEnrichmentRequest,
) -> None:
    enrich_s2_graph.send(**request.model_dump(mode="json"))
