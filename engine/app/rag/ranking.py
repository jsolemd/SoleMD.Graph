"""Pure ranking helpers for the evidence baseline."""

from __future__ import annotations

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    RelationMatchedPaperHit,
)
from app.rag.types import RetrievalChannel


def rank_paper_hits(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
) -> list[PaperEvidenceHit]:
    """Fuse baseline channel signals into a final paper rank."""

    ranked: list[PaperEvidenceHit] = []
    for hit in paper_hits:
        hit.citation_boost = max(
            (item.score for item in citation_hits.get(hit.corpus_id, [])),
            default=0.0,
        )
        hit.entity_score = max(
            (item.score for item in entity_hits.get(hit.corpus_id, [])),
            default=0.0,
        )
        hit.relation_score = max(
            (item.score for item in relation_hits.get(hit.corpus_id, [])),
            default=0.0,
        )

        hit.fused_score = (
            hit.lexical_score
            + (hit.title_similarity * 0.15)
            + (hit.citation_boost * 0.35)
            + (hit.entity_score * 0.4)
            + (hit.relation_score * 0.25)
        )

        channels: list[RetrievalChannel] = []
        reasons: list[str] = []
        if hit.lexical_score > 0:
            channels.append(RetrievalChannel.LEXICAL)
            reasons.append("Matched title/abstract query terms")
        if hit.citation_boost > 0:
            channels.append(RetrievalChannel.CITATION_CONTEXT)
            reasons.append("Matched citation context")
        if hit.entity_score > 0:
            channels.append(RetrievalChannel.ENTITY_MATCH)
            reasons.append("Matched entity filter")
        if hit.relation_score > 0:
            channels.append(RetrievalChannel.RELATION_MATCH)
            reasons.append("Matched relation filter")

        hit.matched_channels = channels
        hit.match_reasons = reasons or ["Matched baseline paper retrieval"]
        ranked.append(hit)

    ranked.sort(
        key=lambda item: (
            item.fused_score,
            item.lexical_score,
            item.citation_count or 0,
            item.corpus_id,
        ),
        reverse=True,
    )
    for index, hit in enumerate(ranked, start=1):
        hit.rank = index
    return ranked
