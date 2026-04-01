"""Pure ranking helpers for the evidence baseline."""

from __future__ import annotations

import re
from collections.abc import Mapping

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    RelationMatchedPaperHit,
)
from app.rag.query_enrichment import normalize_title_key
from app.rag.types import EvidenceIntent, RetrievalChannel

RRF_K = 60
RRF_WEIGHTS: Mapping[RetrievalChannel, float] = {
    RetrievalChannel.LEXICAL: 1.0,
    RetrievalChannel.DENSE_QUERY: 0.98,
    RetrievalChannel.ENTITY_MATCH: 0.95,
    RetrievalChannel.RELATION_MATCH: 0.9,
    RetrievalChannel.SEMANTIC_NEIGHBOR: 0.85,
}
INTENT_WEIGHT = 0.14
TITLE_ANCHOR_WEIGHT = 0.32
CITATION_INTENT_WEIGHT = 0.08
PUBLICATION_TYPE_WEIGHT = 0.06
EVIDENCE_QUALITY_WEIGHT = 0.08

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

HIGH_VALUE_PUBLICATION_TYPES = frozenset(
    {
        "clinicaltrial",
        "metaanalysis",
        "randomizedcontrolledtrial",
        "review",
        "study",
        "systematicreview",
    }
)
LOW_VALUE_PUBLICATION_TYPES = frozenset({"editorial", "lettersandcomments", "news"})
BIOMEDICAL_FIELDS = frozenset({"biology", "chemistry", "medicine", "psychology"})
HIGH_SIGNAL_CITATION_INTENTS = {
    "background": 0.03,
    "compareorcontrast": 0.1,
    "method": 0.08,
    "result": 0.1,
}

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


def _normalize_label(text: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize_text(text))


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


def _citation_intent_affinity(
    citation_hits: list[CitationContextHit],
) -> tuple[float, list[str]]:
    matched: list[str] = []
    best_score = 0.0
    for hit in citation_hits:
        for intent in hit.intents:
            normalized = _normalize_label(intent)
            score = HIGH_SIGNAL_CITATION_INTENTS.get(normalized)
            if score is None:
                continue
            matched.append(intent)
            best_score = max(best_score, score)
    return best_score, list(dict.fromkeys(matched))


def _publication_type_affinity(paper: PaperEvidenceHit) -> tuple[float, list[str]]:
    normalized = {_normalize_label(value) for value in paper.publication_types}
    if normalized & LOW_VALUE_PUBLICATION_TYPES:
        return -0.08, sorted(paper.publication_types)

    high_value = normalized & HIGH_VALUE_PUBLICATION_TYPES
    if high_value:
        return min(0.14, 0.05 + (0.03 * len(high_value))), sorted(paper.publication_types)

    return 0.0, []


def _evidence_quality_affinity(paper: PaperEvidenceHit) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []
    if paper.has_rule_evidence:
        score += 0.08
        reasons.append("rule_evidence")
    if paper.has_curated_journal_family:
        score += 0.04
        reasons.append("curated_journal_family")
    if paper.entity_core_families > 0:
        score += min(0.08, 0.02 * paper.entity_core_families)
        reasons.append("entity_core_families")
    biomedical_fields = {
        _normalize_label(value)
        for value in paper.fields_of_study
        if _normalize_label(value) in BIOMEDICAL_FIELDS
    }
    if biomedical_fields:
        score += min(0.03, 0.01 * len(biomedical_fields))
        reasons.append("biomedical_field")
    return min(score, 0.2), reasons


def _title_anchor_affinity(*, query_text: str | None, paper: PaperEvidenceHit) -> float:
    query_key = normalize_title_key(query_text)
    if not query_key:
        return 0.0
    if normalize_title_key(paper.title) != query_key:
        return 0.0
    return 1.0


def rank_paper_hits(
    paper_hits: list[PaperEvidenceHit],
    *,
    citation_hits: dict[int, list[CitationContextHit]],
    entity_hits: dict[int, list[EntityMatchedPaperHit]],
    relation_hits: dict[int, list[RelationMatchedPaperHit]],
    evidence_intent: EvidenceIntent | None = None,
    channel_rankings: Mapping[RetrievalChannel, Mapping[int, int]] | None = None,
    query_text: str | None = None,
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
        hit.citation_intent_score, matched_citation_intents = _citation_intent_affinity(
            citation_hits.get(hit.corpus_id, [])
        )
        hit.publication_type_score, matched_publication_types = _publication_type_affinity(hit)
        hit.evidence_quality_score, evidence_quality_reasons = _evidence_quality_affinity(hit)
        hit.title_anchor_score = _title_anchor_affinity(
            query_text=query_text,
            paper=hit,
        )

        lexical_rank = channel_rankings.get(RetrievalChannel.LEXICAL, {}).get(hit.corpus_id)
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
                weight=RRF_WEIGHTS[RetrievalChannel.LEXICAL],
            )
            + _rrf_score(
                dense_rank,
                weight=RRF_WEIGHTS[RetrievalChannel.DENSE_QUERY],
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
            + (hit.title_anchor_score * TITLE_ANCHOR_WEIGHT)
            + (hit.citation_boost * 0.18)
            + (hit.citation_intent_score * CITATION_INTENT_WEIGHT)
            + (hit.entity_score * 0.24)
            + (hit.relation_score * 0.16)
            + (hit.dense_score * 0.16)
            + (hit.publication_type_score * PUBLICATION_TYPE_WEIGHT)
            + (hit.evidence_quality_score * EVIDENCE_QUALITY_WEIGHT)
            + (hit.intent_score * INTENT_WEIGHT)
        )

        channels: list[RetrievalChannel] = []
        reasons: list[str] = []
        if lexical_rank is not None or hit.lexical_score > 0:
            channels.append(RetrievalChannel.LEXICAL)
            reasons.append("Matched title/abstract query terms")
        if dense_rank is not None or hit.dense_score > 0:
            channels.append(RetrievalChannel.DENSE_QUERY)
            reasons.append("Matched SPECTER2 dense-query similarity")
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
        if hit.title_anchor_score > 0:
            reasons.append("Exact title anchor for the query")
        if hit.citation_intent_score > 0 and matched_citation_intents:
            reasons.append(
                "Matched citation intent context"
                + f": {', '.join(matched_citation_intents[:3])}"
            )
        if hit.publication_type_score > 0 and matched_publication_types:
            reasons.append(
                "High-value publication type"
                + f": {', '.join(matched_publication_types[:2])}"
            )
        if hit.evidence_quality_score > 0 and evidence_quality_reasons:
            reasons.append(
                "Matched evidence-quality priors"
                + f": {', '.join(evidence_quality_reasons[:3])}"
            )
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
