"""Serialize internal RAG search results into API responses."""

from __future__ import annotations

from dataclasses import asdict

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    EvidenceBundle,
    GraphSignal,
    PaperEvidenceHit,
    PaperReferenceRecord,
    RagSearchResult,
    RelationMatchedPaperHit,
    RetrievalChannelResult,
)
from app.rag.schemas import GraphContext, RagSearchResponse, ResponseMeta


def serialize_search_result(result: RagSearchResult) -> RagSearchResponse:
    """Convert the internal result object into the API response schema."""

    return RagSearchResponse.model_validate(
        {
            "meta": ResponseMeta(
                request_id=result.request_id,
                generated_at=result.generated_at,
                duration_ms=round(result.duration_ms),
                retrieval_version=result.retrieval_version,
            ).model_dump(),
            "graph_context": GraphContext(
                graph_release_id=result.graph_release.graph_release_id,
                graph_run_id=result.graph_release.graph_run_id,
                bundle_checksum=result.graph_release.bundle_checksum,
                graph_name=result.graph_release.graph_name,
                is_current=result.graph_release.is_current,
                selected_layer_key=result.query.selected_layer_key,
                selected_node_id=result.query.selected_node_id,
                selected_graph_paper_ref=result.query.selected_graph_paper_ref,
                selected_paper_id=result.query.selected_paper_id,
                selection_graph_paper_refs=result.query.selection_graph_paper_refs,
                selected_cluster_id=result.query.selected_cluster_id,
                scope_mode=result.query.scope_mode,
            ).model_dump(),
            "query": result.query.query,
            "answer": result.answer,
            "answer_state": result.answer_state,
            "answer_model": result.answer_model,
            "answer_corpus_ids": result.answer_corpus_ids,
            "grounded_answer": (
                result.grounded_answer.model_dump()
                if result.grounded_answer is not None
                else None
            ),
            "evidence_bundles": [_serialize_bundle(bundle) for bundle in result.bundles],
            "graph_signals": [_serialize_graph_signal(signal) for signal in result.graph_signals],
            "retrieval_channels": [
                _serialize_channel_result(channel) for channel in result.channels
            ],
        }
    )


def _serialize_paper_hit(paper: PaperEvidenceHit) -> dict[str, object]:
    return {
        "corpus_id": paper.corpus_id,
        "paper_id": paper.paper_id,
        "semantic_scholar_paper_id": paper.semantic_scholar_paper_id,
        "title": paper.title,
        "journal_name": paper.journal_name,
        "year": paper.year,
        "doi": paper.doi,
        "pmid": paper.pmid,
        "pmcid": paper.pmcid,
        "abstract": paper.abstract,
        "tldr": paper.tldr,
        "text_availability": paper.text_availability,
        "is_open_access": paper.is_open_access,
        "citation_count": paper.citation_count,
        "reference_count": paper.reference_count,
    }


def _serialize_citation_hit(hit: CitationContextHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "citation_id": hit.citation_id,
        "direction": hit.direction,
        "neighbor_corpus_id": hit.neighbor_corpus_id,
        "neighbor_paper_id": hit.neighbor_paper_id,
        "context_text": hit.context_text,
        "intents": hit.intents,
        "score": hit.score,
    }


def _serialize_entity_hit(hit: EntityMatchedPaperHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "entity_type": hit.entity_type,
        "concept_id": hit.concept_id,
        "matched_terms": hit.matched_terms,
        "mention_count": hit.mention_count,
        "structural_span_count": hit.structural_span_count,
        "retrieval_default_mention_count": hit.retrieval_default_mention_count,
        "score": hit.score,
    }


def _serialize_relation_hit(hit: RelationMatchedPaperHit) -> dict[str, object]:
    return {
        "corpus_id": hit.corpus_id,
        "relation_type": hit.relation_type,
        "subject_type": hit.subject_type,
        "subject_id": hit.subject_id,
        "object_type": hit.object_type,
        "object_id": hit.object_id,
        "score": hit.score,
    }


def _serialize_reference(reference: PaperReferenceRecord) -> dict[str, object]:
    return asdict(reference)


def _serialize_graph_signal(signal: GraphSignal) -> dict[str, object]:
    return {
        "corpus_id": signal.corpus_id,
        "paper_id": signal.paper_id,
        "signal_kind": signal.signal_kind,
        "channel": signal.channel,
        "score": signal.score,
        "rank": signal.rank,
        "reason": signal.reason,
        "matched_terms": signal.matched_terms,
    }


def _serialize_channel_result(channel: RetrievalChannelResult) -> dict[str, object]:
    return {
        "channel": channel.channel,
        "hits": [asdict(hit) for hit in channel.hits],
    }


def _serialize_bundle(bundle: EvidenceBundle) -> dict[str, object]:
    return {
        "paper": _serialize_paper_hit(bundle.paper),
        "score": bundle.score,
        "rank": bundle.rank,
        "snippet": bundle.snippet,
        "matched_channels": bundle.matched_channels,
        "match_reasons": bundle.match_reasons,
        "rank_features": bundle.rank_features,
        "citation_contexts": [
            _serialize_citation_hit(hit) for hit in bundle.citation_contexts
        ],
        "entity_hits": [_serialize_entity_hit(hit) for hit in bundle.entity_hits],
        "relation_hits": [
            _serialize_relation_hit(hit) for hit in bundle.relation_hits
        ],
        "references": [_serialize_reference(reference) for reference in bundle.references],
        "assets": [asdict(asset) for asset in bundle.assets],
    }
