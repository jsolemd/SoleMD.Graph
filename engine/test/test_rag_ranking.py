"""Unit tests for baseline evidence ranking."""

from __future__ import annotations

from app.rag.models import CitationContextHit, EntityMatchedPaperHit, PaperEvidenceHit
from app.rag.ranking import rank_paper_hits
from app.rag.types import (
    CitationDirection,
    EvidenceIntent,
    QueryRetrievalProfile,
    RetrievalChannel,
)


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


def test_rank_paper_hits_prefers_chunk_precision_for_passage_queries():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Topical review paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=1,
            pmcid=None,
            abstract="Review of related findings.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=12,
            reference_count=30,
            dense_score=0.95,
            citation_boost=1.4,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Exact matched study",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=2,
            pmcid=None,
            abstract="Study with the exact passage match.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=3,
            reference_count=9,
            chunk_lexical_score=0.98,
            lexical_score=0.35,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.DENSE_QUERY: {1: 1},
            RetrievalChannel.CHUNK_LEXICAL: {2: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [2, 1]
    assert RetrievalChannel.CHUNK_LEXICAL in ranked[0].matched_channels


def test_rank_paper_hits_uses_selected_context_for_title_queries():
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Selected paper title",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=4,
            reference_count=8,
            selected_context_score=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Related dense paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=20,
            reference_count=30,
            dense_score=0.98,
            citation_boost=1.3,
            semantic_score=0.9,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="Selected paper title",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        channel_rankings={RetrievalChannel.DENSE_QUERY: {22: 1}},
    )

    assert [paper.corpus_id for paper in ranked] == [11, 22]
    assert "Preserved explicitly selected paper context" in ranked[0].match_reasons


def test_rank_paper_hits_penalizes_indirect_only_passage_candidates():
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Indirect neighbor",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=40,
            reference_count=80,
            dense_score=0.99,
            citation_boost=1.8,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Direct chunk match",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=5,
            reference_count=9,
            chunk_lexical_score=0.92,
            lexical_score=0.21,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={11: [CitationContextHit(
            corpus_id=11,
            citation_id=901,
            neighbor_corpus_id=44,
            direction=CitationDirection.INCOMING,
            context_text="Indirect topical context.",
            score=1.8,
        )]},
        entity_hits={},
        relation_hits={},
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.DENSE_QUERY: {11: 1},
            RetrievalChannel.CHUNK_LEXICAL: {22: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [22, 11]


def test_rank_paper_hits_prefers_higher_fused_score_between_direct_passage_matches():
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Higher chunk but weaker total evidence",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=10,
            reference_count=20,
            chunk_lexical_score=0.20,
            dense_score=1.0,
            citation_boost=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Slightly weaker chunk but stronger total evidence",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=3,
            reference_count=8,
            chunk_lexical_score=0.11,
            dense_score=1.0,
            citation_boost=2.25,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={
            11: [
                CitationContextHit(
                    corpus_id=11,
                    citation_id=901,
                    neighbor_corpus_id=44,
                    direction=CitationDirection.INCOMING,
                    context_text="One supporting context.",
                    score=1.0,
                )
            ],
            22: [
                CitationContextHit(
                    corpus_id=22,
                    citation_id=902,
                    neighbor_corpus_id=55,
                    direction=CitationDirection.INCOMING,
                    context_text="Two stronger supporting contexts.",
                    score=2.25,
                )
            ],
        },
        entity_hits={},
        relation_hits={},
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.CHUNK_LEXICAL: {11: 1, 22: 2},
            RetrievalChannel.DENSE_QUERY: {11: 1, 22: 2},
        },
    )

    assert ranked[0].corpus_id == 22
    assert ranked[0].fused_score > ranked[1].fused_score
