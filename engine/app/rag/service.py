"""Service orchestration for the baseline evidence and RAG search."""

from __future__ import annotations

from dataclasses import asdict
from datetime import UTC, datetime
from functools import lru_cache
from time import perf_counter
from uuid import uuid4

from app.rag.answer import build_baseline_answer_payload
from app.rag.bundle import assemble_evidence_bundles, merge_graph_signals
from app.rag.grounded_runtime import build_grounded_answer_from_runtime
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
from app.rag.query_enrichment import build_query_phrases, derive_relation_terms
from app.rag.ranking import rank_paper_hits
from app.rag.repository import PostgresRagRepository, RagRepository
from app.rag.schemas import GraphContext, RagSearchRequest, RagSearchResponse, ResponseMeta
from app.rag.types import (
    DEFAULT_RETRIEVAL_VERSION,
    RETRIEVAL_CHANNEL_ORDER,
    RetrievalChannel,
    RetrievalScope,
)


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


def _normalize_relation_terms(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped:
            continue
        canonical = stripped.lower().replace("-", "_").replace(" ", "_")
        if canonical in seen:
            continue
        seen.add(canonical)
        normalized.append(canonical)
    return normalized


def _normalize_refs(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        stripped = value.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        normalized.append(stripped)
    return normalized


def _apply_query_enrichment(
    *,
    repository: RagRepository,
    query: PaperRetrievalQuery,
) -> PaperRetrievalQuery:
    if query.entity_terms and query.relation_terms:
        return query

    query_phrases = build_query_phrases(query.normalized_query)
    if not query_phrases:
        return query

    if not query.entity_terms:
        query.entity_terms = repository.resolve_query_entity_terms(
            query_phrases=query_phrases,
            limit=5,
        )
    if not query.relation_terms:
        query.relation_terms = derive_relation_terms(query.normalized_query)
    return query


def _build_query(request: RagSearchRequest) -> PaperRetrievalQuery:
    selected_graph_paper_ref = request.selected_graph_paper_ref
    if selected_graph_paper_ref is None:
        selected_graph_paper_ref = request.selected_paper_id
    if selected_graph_paper_ref is None and request.selected_layer_key == "paper":
        selected_graph_paper_ref = request.selected_node_id

    selection_graph_paper_refs = _normalize_refs(request.selection_graph_paper_refs)
    if (
        request.scope_mode == RetrievalScope.SELECTION_ONLY
        and not selection_graph_paper_refs
        and selected_graph_paper_ref
    ):
        selection_graph_paper_refs = [selected_graph_paper_ref]

    return PaperRetrievalQuery(
        graph_release_id=request.graph_release_id,
        query=request.query,
        normalized_query=request.query,
        entity_terms=_normalize_terms(request.entity_terms),
        relation_terms=_normalize_relation_terms(request.relation_terms),
        selected_layer_key=request.selected_layer_key,
        selected_node_id=request.selected_node_id,
        selected_graph_paper_ref=selected_graph_paper_ref,
        selected_paper_id=request.selected_paper_id,
        selection_graph_paper_refs=selection_graph_paper_refs,
        selected_cluster_id=request.selected_cluster_id,
        scope_mode=request.scope_mode,
        evidence_intent=request.evidence_intent,
        k=request.k,
        rerank_topn=max(request.k, request.rerank_topn),
        use_lexical=request.use_lexical,
        generate_answer=request.generate_answer,
    )


def _entity_seed_terms_for_recall(
    *,
    explicit_entity_terms: list[str],
    resolved_entity_terms: list[str],
) -> list[str]:
    if explicit_entity_terms:
        return explicit_entity_terms
    return [term for term in resolved_entity_terms if ":" in term]


def _paper_id_for_corpus(corpus_id: int, paper_hits) -> str | None:
    for paper in paper_hits:
        if paper.corpus_id == corpus_id:
            return paper.paper_id
    return None


def _build_channel_rankings(
    *,
    lexical_hits: list[PaperEvidenceHit],
    entity_seed_hits: list[PaperEvidenceHit],
    relation_seed_hits: list[PaperEvidenceHit],
    semantic_neighbors: list[GraphSignal],
) -> dict[RetrievalChannel, dict[int, int]]:
    rankings: dict[RetrievalChannel, dict[int, int]] = {}
    if lexical_hits:
        rankings[RetrievalChannel.LEXICAL] = {
            hit.corpus_id: index
            for index, hit in enumerate(lexical_hits, start=1)
        }
    if entity_seed_hits:
        rankings[RetrievalChannel.ENTITY_MATCH] = {
            hit.corpus_id: index
            for index, hit in enumerate(entity_seed_hits, start=1)
        }
    if relation_seed_hits:
        rankings[RetrievalChannel.RELATION_MATCH] = {
            hit.corpus_id: index
            for index, hit in enumerate(relation_seed_hits, start=1)
        }
    if semantic_neighbors:
        rankings[RetrievalChannel.SEMANTIC_NEIGHBOR] = {
            hit.corpus_id: index
            for index, hit in enumerate(semantic_neighbors, start=1)
        }
    return rankings


def _merge_candidate_papers(
    *,
    lexical_hits: list[PaperEvidenceHit],
    entity_seed_hits: list[PaperEvidenceHit],
    relation_seed_hits: list[PaperEvidenceHit],
    citation_seed_hits: list[PaperEvidenceHit],
    semantic_seed_hits: list[PaperEvidenceHit],
    semantic_neighbors: list[GraphSignal],
) -> list[PaperEvidenceHit]:
    by_corpus_id: dict[int, PaperEvidenceHit] = {
        hit.corpus_id: hit
        for hit in lexical_hits
    }

    for hit in entity_seed_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.entity_score = max(existing.entity_score, hit.entity_score)

    for hit in relation_seed_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.relation_score = max(existing.relation_score, hit.relation_score)

    for hit in citation_seed_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.citation_boost = max(existing.citation_boost, hit.citation_boost)

    for hit in semantic_seed_hits:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.semantic_score = max(existing.semantic_score, hit.semantic_score)

    semantic_scores = {
        signal.corpus_id: signal.score
        for signal in semantic_neighbors
    }
    for corpus_id, score in semantic_scores.items():
        hit = by_corpus_id.get(corpus_id)
        if hit is None:
            continue
        hit.semantic_score = max(hit.semantic_score, score)

    return list(by_corpus_id.values())


def _derive_citation_seed_scores(
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    existing_corpus_ids: set[int],
    allowed_corpus_ids: set[int] | None = None,
    limit: int,
) -> dict[int, float]:
    scores: dict[int, float] = {}
    for hits in citation_hits.values():
        for hit in hits:
            neighbor_corpus_id = hit.neighbor_corpus_id
            if neighbor_corpus_id is None or neighbor_corpus_id in existing_corpus_ids:
                continue
            if allowed_corpus_ids is not None and neighbor_corpus_id not in allowed_corpus_ids:
                continue
            if hit.score < 1.0:
                continue
            scores[neighbor_corpus_id] = max(scores.get(neighbor_corpus_id, 0.0), hit.score)

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:limit]
    return dict(ranked)


def _build_entity_channel_hits(
    *,
    entity_seed_hits: list[PaperEvidenceHit],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    paper_hits: list[PaperEvidenceHit],
    entity_terms: list[str],
) -> list[RetrievalChannelHit]:
    by_corpus_id: dict[int, RetrievalChannelHit] = {}

    default_reasons = entity_terms[:3] or ["Matched normalized entity concept"]
    for hit in entity_seed_hits:
        by_corpus_id[hit.corpus_id] = RetrievalChannelHit(
            corpus_id=hit.corpus_id,
            paper_id=hit.paper_id,
            score=hit.entity_score,
            reasons=default_reasons,
        )

    for hits in entity_hits.values():
        for item in hits:
            current = by_corpus_id.get(item.corpus_id)
            next_reasons = item.matched_terms or [item.concept_id]
            if current is None or item.score > current.score:
                by_corpus_id[item.corpus_id] = RetrievalChannelHit(
                    corpus_id=item.corpus_id,
                    paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                    score=item.score,
                    reasons=next_reasons,
                )
                continue

            merged_reasons = list(
                dict.fromkeys([*current.reasons, *next_reasons])
            )
            current.reasons = merged_reasons

    return sorted(by_corpus_id.values(), key=lambda item: item.score, reverse=True)


def _build_relation_channel_hits(
    *,
    relation_seed_hits: list[PaperEvidenceHit],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    paper_hits: list[PaperEvidenceHit],
    relation_terms: list[str],
) -> list[RetrievalChannelHit]:
    by_corpus_id: dict[int, RetrievalChannelHit] = {}

    default_reasons = relation_terms[:3] or ["Matched normalized relation type"]
    for hit in relation_seed_hits:
        by_corpus_id[hit.corpus_id] = RetrievalChannelHit(
            corpus_id=hit.corpus_id,
            paper_id=hit.paper_id,
            score=hit.relation_score,
            reasons=default_reasons,
        )

    for hits in relation_hits.values():
        for item in hits:
            current = by_corpus_id.get(item.corpus_id)
            next_reasons = [item.relation_type]
            if current is None or item.score > current.score:
                by_corpus_id[item.corpus_id] = RetrievalChannelHit(
                    corpus_id=item.corpus_id,
                    paper_id=_paper_id_for_corpus(item.corpus_id, paper_hits),
                    score=item.score,
                    reasons=next_reasons,
                )
                continue

            merged_reasons = list(
                dict.fromkeys([*current.reasons, *next_reasons])
            )
            current.reasons = merged_reasons

    return sorted(by_corpus_id.values(), key=lambda item: item.score, reverse=True)


def _channel_result(
    channel: RetrievalChannel,
    hits: list[RetrievalChannelHit],
) -> RetrievalChannelResult:
    return RetrievalChannelResult(channel=channel, hits=hits)


def _empty_channel_results() -> list[RetrievalChannelResult]:
    return [_channel_result(channel, []) for channel in RETRIEVAL_CHANNEL_ORDER]


class RagService:
    """Baseline evidence search over the canonical PostgreSQL substrate."""

    def __init__(self, repository: RagRepository | None = None, warehouse_grounder=None):
        self._repository = repository or PostgresRagRepository()
        if warehouse_grounder is not None:
            self._warehouse_grounder = warehouse_grounder
        elif isinstance(self._repository, PostgresRagRepository):
            self._warehouse_grounder = build_grounded_answer_from_runtime
        else:
            self._warehouse_grounder = None

    def search(self, request: RagSearchRequest) -> RagSearchResponse:
        started = perf_counter()
        release = self._repository.resolve_graph_release(request.graph_release_id)
        query = _build_query(request)
        explicit_entity_terms = list(query.entity_terms)
        query = _apply_query_enrichment(
            repository=self._repository,
            query=query,
        )
        entity_seed_terms = _entity_seed_terms_for_recall(
            explicit_entity_terms=explicit_entity_terms,
            resolved_entity_terms=query.entity_terms,
        )
        scope_corpus_ids = (
            self._repository.resolve_scope_corpus_ids(
                graph_run_id=release.graph_run_id,
                graph_paper_refs=query.selection_graph_paper_refs,
            )
            if query.scope_mode == RetrievalScope.SELECTION_ONLY
            else []
        )
        selection_only_without_matches = (
            query.scope_mode == RetrievalScope.SELECTION_ONLY and not scope_corpus_ids
        )

        lexical_hits = (
            self._repository.search_papers(
                release.graph_run_id,
                query.normalized_query,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if query.use_lexical and not selection_only_without_matches
            else []
        )
        entity_seed_hits = (
            self._repository.search_entity_papers(
                release.graph_run_id,
                entity_terms=entity_seed_terms,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if entity_seed_terms and not selection_only_without_matches
            else []
        )
        relation_seed_hits = (
            self._repository.search_relation_papers(
                release.graph_run_id,
                relation_terms=query.relation_terms,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if query.relation_terms and not selection_only_without_matches
            else []
        )
        selected_corpus_id = self._repository.resolve_selected_corpus_id(
            graph_run_id=release.graph_run_id,
            selected_graph_paper_ref=query.selected_graph_paper_ref,
            selected_paper_id=query.selected_paper_id,
            selected_node_id=query.selected_node_id,
        )
        semantic_neighbors = (
            self._repository.fetch_semantic_neighbors(
                graph_run_id=release.graph_run_id,
                selected_corpus_id=selected_corpus_id,
                limit=query.rerank_topn,
                scope_corpus_ids=scope_corpus_ids or None,
            )
            if selected_corpus_id is not None and not selection_only_without_matches
            else []
        )
        semantic_seed_ids = [
            item.corpus_id
            for item in semantic_neighbors
            if item.corpus_id
            not in {
                hit.corpus_id
                for hit in [*lexical_hits, *entity_seed_hits, *relation_seed_hits]
            }
        ]
        semantic_seed_hits = (
            self._repository.fetch_papers_by_corpus_ids(
                release.graph_run_id,
                semantic_seed_ids,
            )
            if semantic_seed_ids
            else []
        )
        initial_paper_hits = _merge_candidate_papers(
            lexical_hits=lexical_hits,
            entity_seed_hits=entity_seed_hits,
            relation_seed_hits=relation_seed_hits,
            citation_seed_hits=[],
            semantic_seed_hits=semantic_seed_hits,
            semantic_neighbors=semantic_neighbors,
        )
        if not initial_paper_hits:
            return serialize_search_result(
                RagSearchResult(
                    request_id=str(uuid4()),
                    generated_at=datetime.now(UTC),
                    duration_ms=(perf_counter() - started) * 1000,
                    retrieval_version=DEFAULT_RETRIEVAL_VERSION,
                    query=query,
                    graph_release=release,
                    bundles=[],
                    graph_signals=[],
                    channels=_empty_channel_results(),
                    answer=None,
                    answer_model=None,
                )
            )
        initial_corpus_ids = [hit.corpus_id for hit in initial_paper_hits]
        citation_hits = self._repository.fetch_citation_contexts(
            initial_corpus_ids,
            query=query.normalized_query,
        )
        allowed_scope_ids = (
            set(scope_corpus_ids)
            if query.scope_mode == RetrievalScope.SELECTION_ONLY
            else None
        )
        citation_seed_scores = _derive_citation_seed_scores(
            citation_hits=citation_hits,
            existing_corpus_ids=set(initial_corpus_ids),
            allowed_corpus_ids=allowed_scope_ids,
            limit=query.rerank_topn,
        )
        citation_seed_hits = (
            self._repository.fetch_papers_by_corpus_ids(
                release.graph_run_id,
                list(citation_seed_scores),
            )
            if citation_seed_scores
            else []
        )
        for hit in citation_seed_hits:
            hit.citation_boost = max(
                hit.citation_boost,
                citation_seed_scores.get(hit.corpus_id, 0.0),
            )
        paper_hits = _merge_candidate_papers(
            lexical_hits=lexical_hits,
            entity_seed_hits=entity_seed_hits,
            relation_seed_hits=relation_seed_hits,
            citation_seed_hits=citation_seed_hits,
            semantic_seed_hits=semantic_seed_hits,
            semantic_neighbors=semantic_neighbors,
        )

        corpus_ids = [hit.corpus_id for hit in paper_hits]
        expanded_citation_hits = (
            self._repository.fetch_citation_contexts(
                [hit.corpus_id for hit in citation_seed_hits],
                query=query.normalized_query,
            )
            if citation_seed_hits
            else {}
        )
        if expanded_citation_hits:
            citation_hits = {
                **citation_hits,
                **expanded_citation_hits,
            }

        entity_hits = self._repository.fetch_entity_matches(
            corpus_ids,
            entity_terms=query.entity_terms,
        )
        relation_hits = self._repository.fetch_relation_matches(
            corpus_ids,
            relation_terms=query.relation_terms,
        )

        ranked_hits = rank_paper_hits(
            paper_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
            evidence_intent=query.evidence_intent,
            channel_rankings=_build_channel_rankings(
                lexical_hits=lexical_hits,
                entity_seed_hits=entity_seed_hits,
                relation_seed_hits=relation_seed_hits,
                semantic_neighbors=semantic_neighbors,
            ),
        )
        top_hits = ranked_hits[: query.k]
        top_corpus_ids = [hit.corpus_id for hit in top_hits]

        references = self._repository.fetch_references(top_corpus_ids)
        assets = self._repository.fetch_assets(top_corpus_ids)

        bundles = assemble_evidence_bundles(
            top_hits,
            citation_hits=citation_hits,
            entity_hits=entity_hits,
            relation_hits=relation_hits,
            references=references,
            assets=assets,
        )
        graph_signals = merge_graph_signals(
            bundles,
            evidence_intent=query.evidence_intent,
            semantic_neighbors=semantic_neighbors,
        )
        answer_payload = (
            build_baseline_answer_payload(
                bundles,
                evidence_intent=query.evidence_intent,
                query_text=query.normalized_query,
            )
            if query.generate_answer
            else None
        )
        answer = answer_payload.text if answer_payload else None
        answer_model = answer_payload.model if answer_payload else None
        answer_corpus_ids = (
            list(answer_payload.grounding_corpus_ids)
            if answer_payload is not None
            else []
        )
        grounded_answer = None
        if self._warehouse_grounder and answer and answer_corpus_ids:
            grounded_answer = self._warehouse_grounder(
                corpus_ids=answer_corpus_ids,
                segment_texts=(
                    list(answer_payload.segment_texts)
                    if answer_payload and answer_payload.segment_texts
                    else [answer]
                ),
                segment_corpus_ids=(
                    list(answer_payload.segment_corpus_ids)
                    if answer_payload and answer_payload.segment_corpus_ids
                    else None
                ),
            )
            if grounded_answer and grounded_answer.answer_linked_corpus_ids:
                answer_corpus_ids = grounded_answer.answer_linked_corpus_ids

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
                    for paper in lexical_hits[: query.k]
                ],
            ),
            _channel_result(
                RetrievalChannel.ENTITY_MATCH,
                _build_entity_channel_hits(
                    entity_seed_hits=entity_seed_hits,
                    entity_hits=entity_hits,
                    paper_hits=paper_hits,
                    entity_terms=query.entity_terms,
                ),
            ),
            _channel_result(
                RetrievalChannel.RELATION_MATCH,
                _build_relation_channel_hits(
                    relation_seed_hits=relation_seed_hits,
                    relation_hits=relation_hits,
                    paper_hits=paper_hits,
                    relation_terms=query.relation_terms,
                ),
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
            graph_release=release,
            bundles=bundles,
            graph_signals=graph_signals,
            channels=channels,
            answer_corpus_ids=answer_corpus_ids,
            answer=answer,
            answer_model=answer_model,
            grounded_answer=grounded_answer,
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
