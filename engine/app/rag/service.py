"""Service orchestration for the baseline evidence and RAG search."""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
from functools import lru_cache
from time import perf_counter
from uuid import uuid4

from app.rag.answer import generate_baseline_answer
from app.rag.bundle import assemble_evidence_bundles, merge_graph_signals
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    EvidenceBundle,
    GraphSignal,
    PaperEvidenceHit,
    PaperReferenceRecord,
    PaperRetrievalQuery,
    RagSearchResult,
    RelationMatchedPaperHit,
    RetrievalChannelHit,
    RetrievalChannelResult,
)
from app.rag.ranking import rank_paper_hits
from app.rag.repository import PostgresRagRepository, RagRepository
from app.rag.schemas import GraphContext, RagSearchRequest, RagSearchResponse, ResponseMeta
from app.rag.types import DEFAULT_RETRIEVAL_VERSION, RetrievalChannel


def _normalize_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        lowered = stripped.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(stripped)
    return normalized


def _build_query(request: RagSearchRequest) -> PaperRetrievalQuery:
    selected_paper_id = request.selected_paper_id
    if selected_paper_id is None and request.selected_layer_key == "paper":
        selected_paper_id = request.selected_node_id

    return PaperRetrievalQuery(
        graph_release_id=request.graph_release_id,
        query=request.query,
        normalized_query=request.query,
        entity_terms=_normalize_terms(request.entity_terms),
        relation_terms=_normalize_terms(request.relation_terms),
        selected_layer_key=request.selected_layer_key,
        selected_node_id=request.selected_node_id,
        selected_paper_id=selected_paper_id,
        selected_cluster_id=request.selected_cluster_id,
        evidence_intent=request.evidence_intent,
        k=request.k,
        rerank_topn=max(request.k, request.rerank_topn),
        use_lexical=request.use_lexical,
        generate_answer=request.generate_answer,
    )


def _paper_id_for_corpus(corpus_id: int, paper_hits) -> str | None:
    for paper in paper_hits:
        if paper.corpus_id == corpus_id:
            return paper.paper_id
    return None


def _channel_result(
    channel: RetrievalChannel,
    hits: list[RetrievalChannelHit],
) -> RetrievalChannelResult:
    return RetrievalChannelResult(channel=channel, hits=hits)


class RagService:
    """Baseline evidence search over the canonical PostgreSQL substrate."""

    def __init__(self, repository: RagRepository | None = None):
        self._repository = repository or PostgresRagRepository()

    def search(self, request: RagSearchRequest) -> RagSearchResponse:
        started = perf_counter()
        query = _build_query(request)

        paper_hits = (
            self._repository.search_papers(query.normalized_query, limit=query.rerank_topn)
            if query.use_lexical
            else []
        )
        corpus_ids = [hit.corpus_id for hit in paper_hits]

        entity_hits = self._repository.fetch_entity_matches(
            corpus_ids,
            entity_terms=query.entity_terms,
        )
        relation_hits = self._repository.fetch_relation_matches(
            corpus_ids,
            relation_terms=query.relation_terms,
        )
        citation_hits = self._repository.fetch_citation_contexts(
            corpus_ids,
            query=query.normalized_query,
        )

        ranked_hits = rank_paper_hits(
            paper_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
        )
        top_hits = ranked_hits[: query.k]
        top_corpus_ids = [hit.corpus_id for hit in top_hits]

        references = self._repository.fetch_references(top_corpus_ids)
        assets = self._repository.fetch_assets(top_corpus_ids)
        semantic_neighbors = (
            self._repository.fetch_semantic_neighbors(
                selected_paper_id=query.selected_paper_id,
                limit=query.k,
            )
            if query.selected_paper_id
            else []
        )

        for hit in top_hits:
            hit.semantic_score = max(
                (
                    signal.score
                    for signal in semantic_neighbors
                    if signal.corpus_id == hit.corpus_id
                ),
                default=0.0,
            )
            if (
                hit.semantic_score > 0
                and RetrievalChannel.SEMANTIC_NEIGHBOR not in hit.matched_channels
            ):
                hit.matched_channels.append(RetrievalChannel.SEMANTIC_NEIGHBOR)

        bundles = assemble_evidence_bundles(
            top_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
            references=references,
            assets=assets,
        )
        graph_signals = merge_graph_signals(bundles, semantic_neighbors=semantic_neighbors)
        answer, answer_model = (
            generate_baseline_answer(bundles)
            if query.generate_answer
            else (None, None)
        )

        channels = [
            _channel_result(
                RetrievalChannel.LEXICAL,
                [
                    RetrievalChannelHit(
                        corpus_id=paper.corpus_id,
                        paper_id=paper.paper_id,
                        score=paper.lexical_score,
                        reasons=["Matched title/abstract query terms"],
                    )
                    for paper in paper_hits[: query.k]
                ],
            ),
            _channel_result(
                RetrievalChannel.ENTITY_MATCH,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                        score=item.score,
                        reasons=item.matched_terms,
                    )
                    for hits in entity_hits.values()
                    for item in hits
                ],
            ),
            _channel_result(
                RetrievalChannel.RELATION_MATCH,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                        score=item.score,
                        reasons=[item.relation_type],
                    )
                    for hits in relation_hits.values()
                    for item in hits
                ],
            ),
            _channel_result(
                RetrievalChannel.CITATION_CONTEXT,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                        score=item.score,
                        reasons=[item.context_text[:120]],
                    )
                    for hits in citation_hits.values()
                    for item in hits
                ],
            ),
            _channel_result(
                RetrievalChannel.SEMANTIC_NEIGHBOR,
                [
                    RetrievalChannelHit(
                        corpus_id=item.corpus_id,
                        paper_id=item.paper_id,
                        score=item.score,
                        reasons=[item.reason or "Semantic neighbor"],
                    )
                    for item in semantic_neighbors
                ],
            ),
        ]

        result = RagSearchResult(
            request_id=str(uuid4()),
            generated_at=datetime.now(UTC),
            duration_ms=(perf_counter() - started) * 1000,
            retrieval_version=DEFAULT_RETRIEVAL_VERSION,
            query=query,
            bundles=bundles,
            graph_signals=graph_signals,
            channels=channels,
            answer=answer,
            answer_model=answer_model,
        )
        return serialize_search_result(result)


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
                graph_release_id=result.query.graph_release_id,
                selected_layer_key=result.query.selected_layer_key,
                selected_node_id=result.query.selected_node_id,
                selected_paper_id=result.query.selected_paper_id,
                selected_cluster_id=result.query.selected_cluster_id,
            ).model_dump(),
            "query": result.query.query,
            "answer": result.answer,
            "answer_model": result.answer_model,
            "evidence_bundles": [_serialize_bundle(bundle) for bundle in result.bundles],
            "graph_signals": [_serialize_graph_signal(signal) for signal in result.graph_signals],
            "retrieval_channels": [
                _serialize_channel_result(channel) for channel in result.channels
            ],
        }
    )


@lru_cache(maxsize=1)
def get_rag_service() -> RagService:
    """Dependency factory for the evidence service."""
    return RagService()


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
