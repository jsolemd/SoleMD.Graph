"""Unit tests for baseline evidence ranking."""

from __future__ import annotations

from app.rag.models import CitationContextHit, EntityMatchedPaperHit, PaperEvidenceHit
from app.rag.ranking import rank_paper_hits
from app.rag.types import CitationDirection, EvidenceIntent, RetrievalChannel


def test_rank_paper_hits_applies_citation_and_entity_boosts():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Delirium prevention trial",
            journal_name=None,
            year=2023,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=5,
            reference_count=8,
            lexical_score=0.7,
            title_similarity=0.2,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Melatonin and delirium",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=3,
            reference_count=7,
            lexical_score=0.55,
            title_similarity=0.1,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={
            2: [
                CitationContextHit(
                    corpus_id=2,
                    citation_id=10,
                    neighbor_corpus_id=1,
                    direction=CitationDirection.INCOMING,
                    context_text=(
                        "Melatonin lowered delirium incidence in the "
                        "perioperative setting."
                    ),
                    score=2.0,
                )
            ]
        },
        entity_hits={
            2: [
                EntityMatchedPaperHit(
                    corpus_id=2,
                    entity_type="chemical",
                    concept_id="MESH:D008874",
                    matched_terms=["melatonin"],
                    score=0.8,
                )
            ]
        },
        relation_hits={},
    )

    assert [paper.corpus_id for paper in ranked] == [2, 1]
    assert ranked[0].rank == 1
    assert "Matched citation context" in ranked[0].match_reasons
    assert "Matched normalized entity concept" in ranked[0].match_reasons
    assert ranked[0].fused_score > ranked[1].fused_score


def test_rank_paper_hits_preserves_entity_seed_scores_without_enrichment_hits():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Entity-seeded candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract="Candidate seeded from normalized entity lookup.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            entity_score=0.92,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Weak lexical candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            lexical_score=0.15,
            title_similarity=0.05,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={
            RetrievalChannel.ENTITY_MATCH: {1: 1},
            RetrievalChannel.LEXICAL: {2: 1},
        },
    )

    assert ranked[0].corpus_id == 1
    assert ranked[0].entity_score == 0.92
    assert RetrievalChannel.ENTITY_MATCH in ranked[0].matched_channels


def test_rank_paper_hits_preserves_relation_seed_scores_without_enrichment_hits():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Relation-seeded candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract="Candidate seeded from normalized relation lookup.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            relation_score=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Weak lexical candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            lexical_score=0.15,
            title_similarity=0.05,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={
            RetrievalChannel.RELATION_MATCH: {1: 1},
            RetrievalChannel.LEXICAL: {2: 1},
        },
    )

    assert ranked[0].corpus_id == 1
    assert ranked[0].relation_score == 1.0
    assert RetrievalChannel.RELATION_MATCH in ranked[0].matched_channels


def test_rank_paper_hits_preserves_citation_seed_scores_without_direct_hits():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Citation-seeded candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract="Candidate seeded from citation context expansion.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            citation_boost=1.25,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Weak lexical candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=2,
            reference_count=4,
            lexical_score=0.15,
            title_similarity=0.05,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={RetrievalChannel.LEXICAL: {2: 1}},
    )

    assert ranked[0].corpus_id == 1
    assert ranked[0].citation_boost == 1.25
    assert "Matched citation context" in ranked[0].match_reasons


def test_rank_paper_hits_can_promote_semantic_only_candidates():
    papers = [
        PaperEvidenceHit(
            corpus_id=10,
            paper_id="paper-10",
            semantic_scholar_paper_id="paper-10",
            title="Lexical candidate",
            journal_name=None,
            year=2023,
            doi=None,
            pmid=10,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=3,
            reference_count=6,
            lexical_score=0.4,
            title_similarity=0.1,
        ),
        PaperEvidenceHit(
            corpus_id=20,
            paper_id="paper-20",
            semantic_scholar_paper_id="paper-20",
            title="Semantic candidate",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=20,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=8,
            reference_count=10,
            semantic_score=0.91,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={
            RetrievalChannel.LEXICAL: {10: 1},
            RetrievalChannel.SEMANTIC_NEIGHBOR: {20: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [10, 20]
    assert RetrievalChannel.SEMANTIC_NEIGHBOR in ranked[1].matched_channels
    assert "Semantically close to the selected paper" in ranked[1].match_reasons


def test_rank_paper_hits_uses_support_intent_affinity():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Null melatonin trial",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=1,
            pmcid=None,
            abstract="Melatonin did not reduce delirium in this cohort.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=5,
            reference_count=8,
            lexical_score=0.6,
            title_similarity=0.1,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Positive melatonin trial",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=2,
            pmcid=None,
            abstract="Melatonin reduced delirium and improved postoperative sleep.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=5,
            reference_count=8,
            lexical_score=0.6,
            title_similarity=0.1,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        evidence_intent=EvidenceIntent.SUPPORT,
        channel_rankings={RetrievalChannel.LEXICAL: {1: 1, 2: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [2, 1]
    assert ranked[0].intent_score > 0
    assert any(
        reason.startswith("Aligned with support-oriented cue language")
        for reason in ranked[0].match_reasons
    )


def test_rank_paper_hits_uses_refute_intent_affinity():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Null melatonin trial",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=1,
            pmcid=None,
            abstract="Melatonin did not reduce delirium and showed no significant benefit.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=5,
            reference_count=8,
            lexical_score=0.6,
            title_similarity=0.1,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Positive melatonin trial",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=2,
            pmcid=None,
            abstract="Melatonin reduced delirium and improved postoperative sleep.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=5,
            reference_count=8,
            lexical_score=0.6,
            title_similarity=0.1,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        evidence_intent=EvidenceIntent.REFUTE,
        channel_rankings={RetrievalChannel.LEXICAL: {1: 1, 2: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].intent_score > 0
    assert any(
        reason.startswith("Aligned with refute-oriented cue language")
        for reason in ranked[0].match_reasons
    )
