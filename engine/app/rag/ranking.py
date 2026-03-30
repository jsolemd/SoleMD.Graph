"""Pure ranking helpers for the evidence baseline."""

from __future__ import annotations

from collections.abc import Mapping
import re

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    RelationMatchedPaperHit,
)
from app.rag.types import EvidenceIntent, RetrievalChannel

RRF_K = 60
RRF_WEIGHTS: Mapping[RetrievalChannel, float] = {
    RetrievalChannel.LEXICAL: 1.0,
    RetrievalChannel.ENTITY_MATCH: 0.95,
    RetrievalChannel.RELATION_MATCH: 0.9,
    RetrievalChannel.SEMANTIC_NEIGHBOR: 0.85,
}
INTENT_WEIGHT = 0.14

SUPPORT_CUES = (
    "reduced",
    "lower",
    "improved",
    "benefit",
    "beneficial",
    "effective",
    "prevented",
    "protective",
    "decrease",
    "associated with lower",
)

REFUTE_CUES = (
    "no significant",
    "not associated",
    "did not",
    "failed to",
    "null",
    "inconsistent",
    "mixed",
    "contrary",
    "worse",
    "not effective",
    "lack of benefit",
)


def _rrf_score(rank: int | None, *, weight: float) -> float:
    if rank is None or rank <= 0:
        return 0.0
    return weight / (RRF_K + rank)


def _normalize_text(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.strip().lower())


def _intent_affinity(
    *,
    evidence_intent: EvidenceIntent | None,
    paper: PaperEvidenceHit,
    citation_hits: list[CitationContextHit],
) -> tuple[float, list[str]]:
    if evidence_intent not in (EvidenceIntent.SUPPORT, EvidenceIntent.REFUTE):
        return 0.0, []

    cues = SUPPORT_CUES if evidence_intent == EvidenceIntent.SUPPORT else REFUTE_CUES
    texts = [
        *[item.context_text for item in citation_hits],
        paper.tldr,
        paper.abstract,
        paper.title,
    ]
    matched_cues: list[str] = []
    for cue in cues:
        if any(cue in _normalize_text(text) for text in texts):
            matched_cues.append(cue)

    if not matched_cues:
        return 0.0, []

    score = min(1.0, 0.25 + (0.15 * len(matched_cues)))
    return score, matched_cues


def rank_paper_hits(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    evidence_intent: EvidenceIntent | None = None,
    channel_rankings: Mapping[RetrievalChannel, Mapping[int, int]] | None = None,
) -> list[PaperEvidenceHit]:
    """Fuse baseline channel signals into a final paper rank."""

    channel_rankings = channel_rankings or {}
    ranked: list[PaperEvidenceHit] = []
    for hit in paper_hits:
        hit.citation_boost = max(
            hit.citation_boost,
            max(
                (item.score for item in citation_hits.get(hit.corpus_id, [])),
                default=0.0,
            ),
        )
        hit.entity_score = max(
            hit.entity_score,
            max(
                (item.score for item in entity_hits.get(hit.corpus_id, [])),
                default=0.0,
            ),
        )
        hit.relation_score = max(
            hit.relation_score,
            max(
                (item.score for item in relation_hits.get(hit.corpus_id, [])),
                default=0.0,
            ),
        )
        hit.intent_score, matched_intent_cues = _intent_affinity(
            evidence_intent=evidence_intent,
            paper=hit,
            citation_hits=citation_hits.get(hit.corpus_id, []),
        )

        lexical_rank = channel_rankings.get(RetrievalChannel.LEXICAL, {}).get(hit.corpus_id)
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
                weight=RRF_WEIGHTS[RetrievalChannel.LEXICAL],
            )
            + _rrf_score(
                entity_rank,
                weight=RRF_WEIGHTS[RetrievalChannel.ENTITY_MATCH],
            )
            + _rrf_score(
                relation_rank,
                weight=RRF_WEIGHTS[RetrievalChannel.RELATION_MATCH],
            )
            + _rrf_score(
                semantic_rank,
                weight=RRF_WEIGHTS[RetrievalChannel.SEMANTIC_NEIGHBOR],
            )
        )
        hit.fused_score = (
            channel_fusion_score
            + (hit.title_similarity * 0.05)
            + (hit.citation_boost * 0.18)
            + (hit.entity_score * 0.24)
            + (hit.relation_score * 0.16)
            + (hit.intent_score * INTENT_WEIGHT)
        )

        channels: list[RetrievalChannel] = []
        reasons: list[str] = []
        if lexical_rank is not None or hit.lexical_score > 0:
            channels.append(RetrievalChannel.LEXICAL)
            reasons.append("Matched title/abstract query terms")
        if entity_rank is not None or hit.entity_score > 0:
            channels.append(RetrievalChannel.ENTITY_MATCH)
            reasons.append("Matched normalized entity concept")
        if relation_rank is not None or hit.relation_score > 0:
            channels.append(RetrievalChannel.RELATION_MATCH)
            reasons.append("Matched normalized relation type")
        if semantic_rank is not None or hit.semantic_score > 0:
            channels.append(RetrievalChannel.SEMANTIC_NEIGHBOR)
            reasons.append("Semantically close to the selected paper")
        if hit.citation_boost > 0:
            channels.append(RetrievalChannel.CITATION_CONTEXT)
            reasons.append("Matched citation context")
        if hit.intent_score > 0:
            if evidence_intent == EvidenceIntent.SUPPORT:
                reasons.append(
                    "Aligned with support-oriented cue language"
                    + (f": {', '.join(matched_intent_cues[:3])}" if matched_intent_cues else "")
                )
            elif evidence_intent == EvidenceIntent.REFUTE:
                reasons.append(
                    "Aligned with refute-oriented cue language"
                    + (f": {', '.join(matched_intent_cues[:3])}" if matched_intent_cues else "")
                )

        hit.matched_channels = channels
        hit.match_reasons = reasons or ["Matched baseline paper retrieval"]
        ranked.append(hit)

    ranked.sort(
        key=lambda item: (
            item.fused_score,
            item.semantic_score,
            item.lexical_score,
            item.citation_count or 0,
            item.corpus_id,
        ),
        reverse=True,
    )
    for index, hit in enumerate(ranked, start=1):
        hit.rank = index
    return ranked
