"""Pure helpers for merging retrieval candidates and channel output surfaces."""

from __future__ import annotations

from collections.abc import Iterable

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphSignal,
    PaperEvidenceHit,
    RelationMatchedPaperHit,
    RetrievalChannelHit,
)
from app.rag.types import RetrievalChannel


def build_channel_rankings(
    *,
    lexical_hits: list[PaperEvidenceHit],
    entity_seed_hits: list[PaperEvidenceHit],
    relation_seed_hits: list[PaperEvidenceHit],
    semantic_neighbors: list[GraphSignal],
    dense_query_hits: list[PaperEvidenceHit] | None = None,
) -> dict[RetrievalChannel, dict[int, int]]:
    rankings: dict[RetrievalChannel, dict[int, int]] = {}
    if lexical_hits:
        rankings[RetrievalChannel.LEXICAL] = {
            hit.corpus_id: index for index, hit in enumerate(lexical_hits, start=1)
        }
    if entity_seed_hits:
        rankings[RetrievalChannel.ENTITY_MATCH] = {
            hit.corpus_id: index for index, hit in enumerate(entity_seed_hits, start=1)
        }
    if relation_seed_hits:
        rankings[RetrievalChannel.RELATION_MATCH] = {
            hit.corpus_id: index for index, hit in enumerate(relation_seed_hits, start=1)
        }
    if semantic_neighbors:
        rankings[RetrievalChannel.SEMANTIC_NEIGHBOR] = {
            hit.corpus_id: index for index, hit in enumerate(semantic_neighbors, start=1)
        }
    if dense_query_hits:
        rankings[RetrievalChannel.DENSE_QUERY] = {
            hit.corpus_id: index for index, hit in enumerate(dense_query_hits, start=1)
        }
    return rankings


def merge_candidate_papers(
    *,
    lexical_hits: list[PaperEvidenceHit],
    entity_seed_hits: list[PaperEvidenceHit],
    relation_seed_hits: list[PaperEvidenceHit],
    citation_seed_hits: list[PaperEvidenceHit],
    semantic_seed_hits: list[PaperEvidenceHit],
    semantic_neighbors: list[GraphSignal],
    dense_query_hits: list[PaperEvidenceHit] | None = None,
) -> list[PaperEvidenceHit]:
    by_corpus_id: dict[int, PaperEvidenceHit] = {hit.corpus_id: hit for hit in lexical_hits}

    for hit in dense_query_hits or []:
        existing = by_corpus_id.get(hit.corpus_id)
        if existing is None:
            by_corpus_id[hit.corpus_id] = hit
            continue
        existing.dense_score = max(existing.dense_score, hit.dense_score)

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

    semantic_scores = {signal.corpus_id: signal.score for signal in semantic_neighbors}
    for corpus_id, score in semantic_scores.items():
        hit = by_corpus_id.get(corpus_id)
        if hit is None:
            continue
        hit.semantic_score = max(hit.semantic_score, score)

    return list(by_corpus_id.values())


def derive_citation_seed_scores(
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


def build_entity_channel_hits(
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
            current.reasons = list(dict.fromkeys([*current.reasons, *next_reasons]))

    return sorted(by_corpus_id.values(), key=lambda item: item.score, reverse=True)


def build_relation_channel_hits(
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
            current.reasons = list(dict.fromkeys([*current.reasons, *next_reasons]))

    return sorted(by_corpus_id.values(), key=lambda item: item.score, reverse=True)


def _paper_id_for_corpus(corpus_id: int, paper_hits: Iterable[PaperEvidenceHit]) -> str | None:
    for paper in paper_hits:
        if paper.corpus_id == corpus_id:
            return paper.paper_id
    return None
