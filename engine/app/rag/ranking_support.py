"""Shared scoring helpers and profile definitions for runtime ranking."""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    RelationMatchedPaperHit,
)
from app.rag.retrieval_policy import MIN_DIRECT_PASSAGE_ALIGNMENT
from app.rag.text_alignment import score_text_alignment
from app.rag.types import (
    EvidenceIntent,
    QueryRetrievalProfile,
    RetrievalChannel,
)

RRF_K = 60
GENERAL_RRF_WEIGHTS: Mapping[RetrievalChannel, float] = {
    RetrievalChannel.LEXICAL: 1.0,
    RetrievalChannel.CHUNK_LEXICAL: 1.04,
    RetrievalChannel.DENSE_QUERY: 0.98,
    RetrievalChannel.ENTITY_MATCH: 0.95,
    RetrievalChannel.RELATION_MATCH: 0.9,
    RetrievalChannel.SEMANTIC_NEIGHBOR: 0.85,
}
TITLE_RRF_WEIGHTS: Mapping[RetrievalChannel, float] = {
    RetrievalChannel.LEXICAL: 1.12,
    RetrievalChannel.CHUNK_LEXICAL: 0.92,
    RetrievalChannel.DENSE_QUERY: 0.88,
    RetrievalChannel.ENTITY_MATCH: 0.9,
    RetrievalChannel.RELATION_MATCH: 0.86,
    RetrievalChannel.SEMANTIC_NEIGHBOR: 0.72,
}
PASSAGE_RRF_WEIGHTS: Mapping[RetrievalChannel, float] = {
    RetrievalChannel.LEXICAL: 0.94,
    RetrievalChannel.CHUNK_LEXICAL: 1.18,
    RetrievalChannel.DENSE_QUERY: 0.82,
    RetrievalChannel.ENTITY_MATCH: 0.9,
    RetrievalChannel.RELATION_MATCH: 0.88,
    RetrievalChannel.SEMANTIC_NEIGHBOR: 0.68,
}
INTENT_WEIGHT = 0.14
TITLE_ANCHOR_WEIGHT = 0.32
CITATION_INTENT_WEIGHT = 0.08
PUBLICATION_TYPE_WEIGHT = 0.06
EVIDENCE_QUALITY_WEIGHT = 0.08
CLINICAL_PRIOR_WEIGHT = 0.1
PASSAGE_ALIGNMENT_REASON_THRESHOLD = MIN_DIRECT_PASSAGE_ALIGNMENT

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


@dataclass(frozen=True, slots=True)
class RankingScoreProfile:
    channel_rrf_weights: Mapping[RetrievalChannel, float]
    title_similarity_weight: float
    chunk_lexical_weight: float
    title_anchor_weight: float
    citation_weight: float
    citation_intent_weight: float
    entity_weight: float
    relation_weight: float
    dense_weight: float
    publication_type_weight: float
    evidence_quality_weight: float
    clinical_prior_weight: float
    intent_weight: float
    biomedical_rerank_weight: float = 0.0
    passage_alignment_weight: float = 0.0
    selected_context_weight: float = 0.0
    direct_match_bonus_weight: float = 0.0
    indirect_only_penalty_weight: float = 0.0


GENERAL_RANKING_PROFILE = RankingScoreProfile(
    channel_rrf_weights=GENERAL_RRF_WEIGHTS,
    title_similarity_weight=0.05,
    chunk_lexical_weight=0.18,
    title_anchor_weight=TITLE_ANCHOR_WEIGHT,
    citation_weight=0.18,
    citation_intent_weight=CITATION_INTENT_WEIGHT,
    entity_weight=0.24,
    relation_weight=0.16,
    dense_weight=0.16,
    publication_type_weight=PUBLICATION_TYPE_WEIGHT,
    evidence_quality_weight=EVIDENCE_QUALITY_WEIGHT,
    clinical_prior_weight=CLINICAL_PRIOR_WEIGHT,
    intent_weight=INTENT_WEIGHT,
)
TITLE_RANKING_PROFILE = RankingScoreProfile(
    channel_rrf_weights=TITLE_RRF_WEIGHTS,
    title_similarity_weight=0.09,
    chunk_lexical_weight=0.12,
    title_anchor_weight=0.46,
    citation_weight=0.1,
    citation_intent_weight=0.05,
    entity_weight=0.18,
    relation_weight=0.12,
    dense_weight=0.1,
    publication_type_weight=PUBLICATION_TYPE_WEIGHT,
    evidence_quality_weight=EVIDENCE_QUALITY_WEIGHT,
    clinical_prior_weight=CLINICAL_PRIOR_WEIGHT,
    intent_weight=INTENT_WEIGHT,
    selected_context_weight=0.24,
)
PASSAGE_RANKING_PROFILE = RankingScoreProfile(
    channel_rrf_weights=PASSAGE_RRF_WEIGHTS,
    title_similarity_weight=0.02,
    chunk_lexical_weight=0.34,
    title_anchor_weight=0.08,
    citation_weight=0.06,
    citation_intent_weight=0.04,
    entity_weight=0.2,
    relation_weight=0.14,
    dense_weight=0.08,
    publication_type_weight=PUBLICATION_TYPE_WEIGHT,
    evidence_quality_weight=EVIDENCE_QUALITY_WEIGHT,
    clinical_prior_weight=CLINICAL_PRIOR_WEIGHT,
    intent_weight=INTENT_WEIGHT,
    biomedical_rerank_weight=0.24,
    passage_alignment_weight=0.22,
    selected_context_weight=0.1,
    direct_match_bonus_weight=0.18,
    indirect_only_penalty_weight=0.14,
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


def _ranking_profile(
    retrieval_profile: QueryRetrievalProfile,
) -> RankingScoreProfile:
    if retrieval_profile == QueryRetrievalProfile.TITLE_LOOKUP:
        return TITLE_RANKING_PROFILE
    if retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP:
        return PASSAGE_RANKING_PROFILE
    return GENERAL_RANKING_PROFILE


def _direct_match_adjustment(
    *,
    paper: PaperEvidenceHit,
    retrieval_profile: QueryRetrievalProfile,
    score_profile: RankingScoreProfile,
) -> float:
    if retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return 0.0

    direct_match_score = max(
        paper.chunk_lexical_score,
        paper.lexical_score,
        paper.passage_alignment_score,
    )
    if direct_match_score > 0:
        return direct_match_score * score_profile.direct_match_bonus_weight

    if paper.dense_score > 0 or paper.citation_boost > 0:
        return -score_profile.indirect_only_penalty_weight
    return 0.0


def _direct_alignment_value(candidate_text: str | None, *, query_text: str | None) -> float:
    alignment = score_text_alignment(candidate_text, query_text)
    if alignment.token_overlap <= 0:
        return 0.0
    span_score = min(1.0, alignment.longest_common_span / 8.0)
    return max(
        float(alignment.containment),
        (alignment.query_coverage * 0.5)
        + (alignment.candidate_focus * 0.2)
        + (span_score * 0.3),
    )


def _passage_alignment_affinity(
    paper: PaperEvidenceHit,
    *,
    query_text: str | None,
    retrieval_profile: QueryRetrievalProfile,
) -> float:
    if retrieval_profile != QueryRetrievalProfile.PASSAGE_LOOKUP:
        return 0.0
    if not query_text:
        return 0.0

    candidates = (
        (paper.chunk_snippet, 1.0),
        (paper.abstract, 0.88),
        (paper.tldr, 0.84),
        (paper.title, 0.72),
    )
    best_score = 0.0
    for candidate_text, source_weight in candidates:
        best_score = max(
            best_score,
            _direct_alignment_value(candidate_text, query_text=query_text) * source_weight,
        )
    return min(best_score, 1.0)


def _channel_annotation(
    *,
    hit: PaperEvidenceHit,
    retrieval_profile: QueryRetrievalProfile,
    passage_alignment_score: float,
    lexical_rank: int | None,
    chunk_lexical_rank: int | None,
    dense_rank: int | None,
    entity_rank: int | None,
    relation_rank: int | None,
    semantic_rank: int | None,
    paper_citation_hits: list[CitationContextHit],
    paper_entity_hits: list[EntityMatchedPaperHit],
    paper_relation_hits: list[RelationMatchedPaperHit],
    matched_citation_intents: list[str],
    matched_publication_types: list[str],
    evidence_quality_reasons: list[str],
    clinical_prior_reasons: list[str],
    matched_intent_cues: list[str],
    evidence_intent: EvidenceIntent | None,
) -> tuple[list[RetrievalChannel], list[str]]:
    channels: list[RetrievalChannel] = []
    reasons: list[str] = []
    if lexical_rank is not None or hit.lexical_score > 0:
        channels.append(RetrievalChannel.LEXICAL)
        reasons.append("Matched title/abstract query terms")
    if chunk_lexical_rank is not None or hit.chunk_lexical_score > 0:
        channels.append(RetrievalChannel.CHUNK_LEXICAL)
        reasons.append("Matched retrieval-default chunk text")
    if dense_rank is not None:
        channels.append(RetrievalChannel.DENSE_QUERY)
        reasons.append("Matched SPECTER2 dense-query similarity")
    if entity_rank is not None or paper_entity_hits:
        channels.append(RetrievalChannel.ENTITY_MATCH)
        reasons.append("Matched normalized entity concept")
    if relation_rank is not None or paper_relation_hits:
        channels.append(RetrievalChannel.RELATION_MATCH)
        reasons.append("Matched normalized relation type")
    if semantic_rank is not None:
        channels.append(RetrievalChannel.SEMANTIC_NEIGHBOR)
        reasons.append("Semantically close to the selected paper")
    if paper_citation_hits or hit.citation_boost > 0:
        channels.append(RetrievalChannel.CITATION_CONTEXT)
        reasons.append("Matched citation context")
    if hit.title_anchor_score >= 1.0:
        reasons.append("Exact title anchor for the query")
    elif hit.title_anchor_score > 0:
        reasons.append("Strong title-prefix anchor for the query")
    if (
        retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
        and passage_alignment_score >= PASSAGE_ALIGNMENT_REASON_THRESHOLD
    ):
        reasons.append("Direct paper text closely matches the query")
    if (
        retrieval_profile == QueryRetrievalProfile.PASSAGE_LOOKUP
        and hit.biomedical_rerank_score >= 0.5
    ):
        reasons.append("Promoted by biomedical article-level reranking")
    if hit.selected_context_score > 0:
        reasons.append("Preserved explicitly selected paper context")
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
    if hit.clinical_prior_score != 0 and clinical_prior_reasons:
        reasons.append(
            "Matched clinician-facing prior"
            + f": {', '.join(clinical_prior_reasons[:3])}"
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
    return channels, reasons or ["Matched baseline paper retrieval"]
