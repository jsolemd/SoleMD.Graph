"""Pure ranking helpers for the evidence baseline."""

from __future__ import annotations

from collections.abc import Mapping

from app.rag.clinical_priors import score_clinical_prior
from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    PaperSpeciesProfile,
    RelationMatchedPaperHit,
)
from app.rag.ranking_support import (
    _channel_annotation,
    _citation_intent_affinity,
    _direct_match_adjustment,
    _evidence_quality_affinity,
    _intent_affinity,
    _passage_alignment_affinity,
    _publication_type_affinity,
    _ranking_profile,
    _rrf_score,
)
from app.rag.retrieval_policy import has_direct_retrieval_support
from app.rag.title_anchor import compute_title_anchor_score
from app.rag.types import (
    ClinicalQueryIntent,
    EvidenceIntent,
    QueryRetrievalProfile,
    RetrievalChannel,
)


def rank_paper_hits(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    species_profiles: Mapping[int, PaperSpeciesProfile] | None = None,
    evidence_intent: EvidenceIntent | None = None,
    channel_rankings: Mapping[RetrievalChannel, Mapping[int, int]] | None = None,
    query_text: str | None = None,
    retrieval_profile: QueryRetrievalProfile = QueryRetrievalProfile.GENERAL,
    clinical_intent: ClinicalQueryIntent = ClinicalQueryIntent.GENERAL,
) -> list[PaperEvidenceHit]:
    """Fuse baseline channel signals into a final paper rank."""

    channel_rankings = channel_rankings or {}
    species_profiles = species_profiles or {}
    score_profile = _ranking_profile(retrieval_profile)
    ranked: list[PaperEvidenceHit] = []
    for hit in paper_hits:
        paper_citation_hits = citation_hits.get(hit.corpus_id, [])
        paper_entity_hits = entity_hits.get(hit.corpus_id, [])
        paper_relation_hits = relation_hits.get(hit.corpus_id, [])
        hit.citation_boost = max(
            hit.citation_boost,
            max(
                (item.score for item in paper_citation_hits),
                default=0.0,
            ),
        )
        hit.entity_score = max(
            hit.entity_score,
            max(
                (item.score for item in paper_entity_hits),
                default=0.0,
            ),
        )
        hit.relation_score = max(
            hit.relation_score,
            max(
                (item.score for item in paper_relation_hits),
                default=0.0,
            ),
        )
        hit.intent_score, matched_intent_cues = _intent_affinity(
            evidence_intent=evidence_intent,
            paper=hit,
            citation_hits=paper_citation_hits,
        )
        hit.citation_intent_score, matched_citation_intents = _citation_intent_affinity(
            paper_citation_hits
        )
        hit.publication_type_score, matched_publication_types = _publication_type_affinity(hit)
        hit.evidence_quality_score, evidence_quality_reasons = _evidence_quality_affinity(hit)
        hit.clinical_prior_score, clinical_prior_reasons = score_clinical_prior(
            query_intent=clinical_intent,
            paper=hit,
            species_profile=species_profiles.get(hit.corpus_id),
        )
        hit.title_anchor_score = compute_title_anchor_score(
            query_text=query_text,
            title_text=hit.title,
        )
        hit.passage_alignment_score = _passage_alignment_affinity(
            hit,
            query_text=query_text,
            retrieval_profile=retrieval_profile,
        )

        lexical_rank = channel_rankings.get(RetrievalChannel.LEXICAL, {}).get(hit.corpus_id)
        chunk_lexical_rank = channel_rankings.get(
            RetrievalChannel.CHUNK_LEXICAL, {}
        ).get(hit.corpus_id)
        dense_rank = channel_rankings.get(RetrievalChannel.DENSE_QUERY, {}).get(hit.corpus_id)
        entity_rank = channel_rankings.get(RetrievalChannel.ENTITY_MATCH, {}).get(
            hit.corpus_id
        )
        relation_rank = channel_rankings.get(RetrievalChannel.RELATION_MATCH, {}).get(
            hit.corpus_id
        )
        semantic_rank = channel_rankings.get(RetrievalChannel.SEMANTIC_NEIGHBOR, {}).get(
            hit.corpus_id
        )
        channel_fusion_score = (
            _rrf_score(
                lexical_rank,
                weight=score_profile.channel_rrf_weights[RetrievalChannel.LEXICAL],
            )
            + _rrf_score(
                chunk_lexical_rank,
                weight=score_profile.channel_rrf_weights[
                    RetrievalChannel.CHUNK_LEXICAL
                ],
            )
            + _rrf_score(
                dense_rank,
                weight=score_profile.channel_rrf_weights[RetrievalChannel.DENSE_QUERY],
            )
            + _rrf_score(
                entity_rank,
                weight=score_profile.channel_rrf_weights[RetrievalChannel.ENTITY_MATCH],
            )
            + _rrf_score(
                relation_rank,
                weight=score_profile.channel_rrf_weights[
                    RetrievalChannel.RELATION_MATCH
                ],
            )
            + _rrf_score(
                semantic_rank,
                weight=score_profile.channel_rrf_weights[
                    RetrievalChannel.SEMANTIC_NEIGHBOR
                ],
            )
        )
        hit.fused_score = (
            channel_fusion_score
            + (hit.title_similarity * score_profile.title_similarity_weight)
            + (hit.chunk_lexical_score * score_profile.chunk_lexical_weight)
            + (hit.title_anchor_score * score_profile.title_anchor_weight)
            + (hit.selected_context_score * score_profile.selected_context_weight)
            + (hit.citation_boost * score_profile.citation_weight)
            + (hit.citation_intent_score * score_profile.citation_intent_weight)
            + (hit.entity_score * score_profile.entity_weight)
            + (hit.relation_score * score_profile.relation_weight)
            + (hit.dense_score * score_profile.dense_weight)
            + (hit.publication_type_score * score_profile.publication_type_weight)
            + (hit.evidence_quality_score * score_profile.evidence_quality_weight)
            + (hit.clinical_prior_score * score_profile.clinical_prior_weight)
            + (hit.intent_score * score_profile.intent_weight)
            + (hit.biomedical_rerank_score * score_profile.biomedical_rerank_weight)
            + (hit.passage_alignment_score * score_profile.passage_alignment_weight)
            + _direct_match_adjustment(
                paper=hit,
                retrieval_profile=retrieval_profile,
                score_profile=score_profile,
            )
        )

        hit.matched_channels, hit.match_reasons = _channel_annotation(
            hit=hit,
            retrieval_profile=retrieval_profile,
            passage_alignment_score=hit.passage_alignment_score,
            lexical_rank=lexical_rank,
            chunk_lexical_rank=chunk_lexical_rank,
            dense_rank=dense_rank,
            entity_rank=entity_rank,
            relation_rank=relation_rank,
            semantic_rank=semantic_rank,
            paper_citation_hits=paper_citation_hits,
            paper_entity_hits=paper_entity_hits,
            paper_relation_hits=paper_relation_hits,
            matched_citation_intents=matched_citation_intents,
            matched_publication_types=matched_publication_types,
            evidence_quality_reasons=evidence_quality_reasons,
            clinical_prior_reasons=clinical_prior_reasons,
            matched_intent_cues=matched_intent_cues,
            evidence_intent=evidence_intent,
        )
        ranked.append(hit)

    ranked.sort(key=lambda item: _rank_sort_key(item, retrieval_profile), reverse=True)
    for index, hit in enumerate(ranked, start=1):
        hit.rank = index
    return ranked


def _rank_sort_key(
    item: PaperEvidenceHit,
    retrieval_profile: QueryRetrievalProfile,
) -> tuple[float, ...]:
    if retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return (
            1.0
            if has_direct_retrieval_support(
                paper=item,
                retrieval_profile=retrieval_profile,
            )
            else 0.0,
            item.title_anchor_score,
            item.selected_context_score,
            item.fused_score,
            item.lexical_score,
            item.title_similarity,
            item.citation_count or 0,
            item.corpus_id,
        )
    if retrieval_profile in (
        QueryRetrievalProfile.PASSAGE_LOOKUP,
        QueryRetrievalProfile.QUESTION_LOOKUP,
    ):
        return (
            1.0
            if has_direct_retrieval_support(
                paper=item,
                retrieval_profile=retrieval_profile,
            )
            else 0.0,
            item.biomedical_rerank_score,
            item.passage_alignment_score,
            item.fused_score,
            item.chunk_lexical_score,
            item.lexical_score,
            item.selected_context_score,
            item.citation_count or 0,
            item.corpus_id,
        )
    # GENERAL profile: cross-encoder rerank score breaks ties after
    # fused_score. Title lane is unaffected — its sort key does not use
    # ``biomedical_rerank_score`` and adding TITLE reranker influence is
    # deferred pending GENERAL observability data.
    return (
        item.fused_score,
        item.biomedical_rerank_score,
        item.chunk_lexical_score,
        item.semantic_score,
        item.lexical_score,
        item.selected_context_score,
        item.citation_count or 0,
        item.corpus_id,
    )
