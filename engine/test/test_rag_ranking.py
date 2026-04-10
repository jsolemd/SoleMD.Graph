"""Unit tests for baseline evidence ranking."""

from __future__ import annotations

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    PaperEvidenceHit,
    PaperSpeciesProfile,
)
from app.rag.ranking import rank_paper_hits
from app.rag.types import (
    CitationDirection,
    ClinicalQueryIntent,
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


def test_rank_paper_hits_uses_citation_spine_and_grounding_readiness_priors():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Full-text trial with citation spine",
            journal_name="Clinical Evidence",
            year=2024,
            doi=None,
            pmid=101,
            pmcid="PMC1",
            abstract="Randomized study with directly grounded full text.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=12,
            influential_citation_count=4,
            reference_count=24,
            lexical_score=0.35,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Abstract-only candidate",
            journal_name="Clinical Evidence",
            year=2024,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract="Comparable study without full-text or citation-spine support.",
            tldr=None,
            text_availability="abstract",
            is_open_access=False,
            citation_count=12,
            influential_citation_count=0,
            reference_count=0,
            lexical_score=0.35,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={RetrievalChannel.LEXICAL: {1: 1, 2: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].evidence_quality_score > ranked[1].evidence_quality_score
    assert any(
        "Matched evidence-quality priors" in reason
        for reason in ranked[0].match_reasons
    )


def test_rank_paper_hits_keeps_title_lookup_focused_on_title_over_metadata_priors():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Delirium in the intensive care unit",
            journal_name="Critical Care",
            year=2004,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract="Exact title candidate without a heavy citation spine.",
            tldr=None,
            text_availability="abstract",
            is_open_access=False,
            citation_count=5,
            influential_citation_count=0,
            reference_count=4,
            lexical_score=0.75,
            title_similarity=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Delirium management in critical care",
            journal_name="Critical Care",
            year=2021,
            doi=None,
            pmid=202,
            pmcid="PMC2",
            abstract="Near-title candidate with stronger structural metadata.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=30,
            influential_citation_count=6,
            reference_count=45,
            lexical_score=0.72,
            title_similarity=0.74,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="Delirium in the intensive care unit",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        channel_rankings={RetrievalChannel.LEXICAL: {1: 1, 2: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].evidence_quality_score <= ranked[1].evidence_quality_score


def test_rank_paper_hits_uses_metadata_score_for_general_queries():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Different permeability of potassium salts across the blood-brain barrier",
            journal_name="PLoS ONE",
            year=2013,
            doi=None,
            pmid=101,
            pmcid="PMC1",
            abstract="Paper matching author/year/topic metadata.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            lexical_score=0.35,
            metadata_score=1.4,
            metadata_match_fields=["author", "year", "topic"],
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Alternative potassium paper",
            journal_name="PLoS ONE",
            year=2013,
            doi=None,
            pmid=202,
            pmcid="PMC2",
            abstract="Near-topic paper without metadata agreement.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            lexical_score=0.52,
            metadata_score=0.0,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="Breschi 2013 different permeability potassium salts across blood-brain",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        channel_rankings={RetrievalChannel.LEXICAL: {1: 2, 2: 1}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert any(
        "Matched citation-style metadata" in reason
        for reason in ranked[0].match_reasons
    )


def test_rank_paper_hits_prefers_requested_publication_type_matches():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Meta-analysis of BDNF Val66Met",
            journal_name="Biological Psychiatry",
            year=2020,
            doi=None,
            pmid=101,
            pmcid="PMC1",
            abstract="Meta-analysis study.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            lexical_score=0.35,
            publication_types=["MetaAnalysis"],
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Narrative review of BDNF polymorphisms",
            journal_name="Neuroscience Review",
            year=2020,
            doi=None,
            pmid=202,
            pmcid="PMC2",
            abstract="Narrative review paper.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            lexical_score=0.36,
            publication_types=["Review"],
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        requested_publication_types=("MetaAnalysis",),
        query_text="meta-analysis evidence analysis brain derived neurotrophic factor val66met",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        channel_rankings={RetrievalChannel.LEXICAL: {1: 2, 2: 1}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].publication_type_score > ranked[1].publication_type_score


def test_rank_paper_hits_prefers_results_narrative_over_methods_table_for_passage_queries():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Results-backed cohort paper",
            journal_name="Neurology",
            year=2024,
            doi=None,
            pmid=101,
            pmcid="PMC1",
            abstract="Paper with evidence-bearing results text.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=8,
            reference_count=20,
            chunk_lexical_score=0.72,
            chunk_section_role="results",
            chunk_primary_block_kind="narrative_paragraph",
            chunk_snippet="Results showed lower delirium incidence after melatonin.",
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Methods-heavy protocol paper",
            journal_name="Neurology",
            year=2024,
            doi=None,
            pmid=202,
            pmcid="PMC2",
            abstract="Paper with protocol-oriented table text.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=8,
            reference_count=20,
            chunk_lexical_score=0.72,
            chunk_section_role="methods",
            chunk_primary_block_kind="table_caption",
            chunk_snippet="Methods table describing the intervention schedule.",
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="melatonin reduced delirium incidence",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={RetrievalChannel.CHUNK_LEXICAL: {1: 1, 2: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].passage_structure_score > ranked[1].passage_structure_score
    assert any(
        "Matched evidence-bearing section" in reason
        for reason in ranked[0].match_reasons
    )


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


def test_rank_paper_hits_uses_entity_support_as_direct_title_evidence():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="COMT psychosis endophenotype study",
            journal_name=None,
            year=2013,
            doi=None,
            pmid=101,
            pmcid=None,
            abstract="Candidate surfaced by canonical entity matching.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=30,
            reference_count=62,
            entity_score=1.34,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="COMT Val158Met and psychotic experiences",
            journal_name=None,
            year=2018,
            doi=None,
            pmid=202,
            pmcid=None,
            abstract="Lexical near-match with weaker overall evidence.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=20,
            reference_count=40,
            lexical_score=0.031,
            title_similarity=0.56,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="COMT Val158Met polymorphism and psychosis risk",
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        channel_rankings={
            RetrievalChannel.ENTITY_MATCH: {1: 1},
            RetrievalChannel.LEXICAL: {2: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].entity_score == 1.34
    assert ranked[0].fused_score > ranked[1].fused_score
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


def test_rank_paper_hits_does_not_label_dense_channel_without_dense_membership():
    papers = [
        PaperEvidenceHit(
            corpus_id=10,
            paper_id="paper-10",
            semantic_scholar_paper_id="paper-10",
            title="Lexical candidate with stale dense score",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=10,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            lexical_score=0.8,
            dense_score=0.7,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        channel_rankings={RetrievalChannel.LEXICAL: {10: 1}},
    )

    assert ranked[0].corpus_id == 10
    assert RetrievalChannel.LEXICAL in ranked[0].matched_channels
    assert RetrievalChannel.DENSE_QUERY not in ranked[0].matched_channels


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


def test_rank_paper_hits_uses_cited_context_independently_of_selected_context():
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Explicitly cited study",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract="Cited-study abstract",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=4,
            reference_count=8,
            cited_context_score=0.2,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Uncited dense paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract="Competing dense-only hit.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=1,
            reference_count=2,
            dense_score=0.09,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text="clinical comparison query",
        retrieval_profile=QueryRetrievalProfile.GENERAL,
        channel_rankings={RetrievalChannel.DENSE_QUERY: {22: 1}},
    )

    assert ranked[0].corpus_id == 11
    assert "Preserved explicitly cited paper context" in ranked[0].match_reasons


def test_rank_paper_hits_prefers_strong_title_prefix_anchor_in_title_lookup():
    papers = [
        PaperEvidenceHit(
            corpus_id=11857184,
            paper_id="paper-11857184",
            semantic_scholar_paper_id="paper-11857184",
            title=(
                "Designing clinical trials for assessing the effects of cognitive "
                "training and physical activity interventions on cognitive outcomes: "
                "The Seniors Health and Activity Research Program Pilot "
                "(SHARP-P) Study, a randomized controlled trial"
            ),
            journal_name=None,
            year=2015,
            doi=None,
            pmid=11857184,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=119,
            reference_count=48,
            lexical_score=1.7,
            title_similarity=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Related cognitive training review",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=400,
            reference_count=120,
            dense_score=0.98,
            citation_boost=1.6,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text=(
            "Designing clinical trials for assessing the effects of cognitive "
            "training and physical activity interventions on cognitive outcomes: "
            "The Seniors Health and Activity Research Program Pilot "
            "(SHARP-P) Study, a randomized"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        channel_rankings={
            RetrievalChannel.LEXICAL: {11857184: 1},
            RetrievalChannel.DENSE_QUERY: {22: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [11857184, 22]
    assert "Strong title-prefix anchor for the query" in ranked[0].match_reasons


def test_rank_paper_hits_prefers_direct_title_support_over_citation_only_neighbors():
    papers = [
        PaperEvidenceHit(
            corpus_id=24948876,
            paper_id="paper-24948876",
            semantic_scholar_paper_id="paper-24948876",
            title=(
                "EFFECTS OF PRENATAL ETHANOL EXPOSURE ON PHYSICAL GROWTH, "
                "SENSORY REFLEX MATURATION AND BRAIN DEVELOPMENT IN THE RAT"
            ),
            journal_name=None,
            year=1992,
            doi=None,
            pmid=24948876,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=12,
            reference_count=18,
            lexical_score=1.52,
            dense_score=0.74,
            citation_boost=3.8,
        ),
        PaperEvidenceHit(
            corpus_id=2200426,
            paper_id="paper-2200426",
            semantic_scholar_paper_id="paper-2200426",
            title="Related fetal alcohol spectrum disorders paper",
            journal_name=None,
            year=2010,
            doi=None,
            pmid=2200426,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=44,
            reference_count=60,
            citation_boost=5.25,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text=(
            "Effects of prenatal ethanol exposure on physical growths, sensory "
            "reflex maturation and brain development in the rat"
        ),
        retrieval_profile=QueryRetrievalProfile.TITLE_LOOKUP,
        channel_rankings={
            RetrievalChannel.LEXICAL: {24948876: 1},
            RetrievalChannel.DENSE_QUERY: {24948876: 2},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [24948876, 2200426]
    assert RetrievalChannel.LEXICAL in ranked[0].matched_channels


def test_rank_paper_hits_prefers_direct_over_indirect_passage_candidates():
    # The indirect-only fusion penalty was removed — ordering now follows
    # the passage sort key's ``has_direct_retrieval_support`` tiebreaker
    # (direct > indirect) rather than a negative adjustment on the fused
    # score.
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


def test_rank_paper_hits_prefers_chunk_backed_passage_over_alignment_only_dense_review():
    query_text = (
        "Attention-deficit hyperactivity disorder (ADHD) is a multifactorial, "
        "neurodevelopmental disorder that often persists into adolescence and "
        "adulthood and is characterized by inattention, hyperactivity and "
        "impulsiveness."
    )
    papers = [
        PaperEvidenceHit(
            corpus_id=35014340,
            paper_id="paper-35014340",
            semantic_scholar_paper_id="paper-35014340",
            title="Attention-Deficit/Hyperactivity Disorder",
            journal_name=None,
            year=2014,
            doi=None,
            pmid=35014340,
            pmcid=None,
            abstract=(
                "Attention-deficit/hyperactivity disorder (ADHD) is a "
                "neurobiological condition of childhood onset with the "
                "hallmarks of inattention, impulsivity, and hyperactivity."
            ),
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=15,
            reference_count=40,
            dense_score=0.8723,
            biomedical_rerank_score=0.571429,
        ),
        PaperEvidenceHit(
            corpus_id=116587801,
            paper_id="paper-116587801",
            semantic_scholar_paper_id="paper-116587801",
            title=(
                "Meta-analysis of brain-derived neurotrophic factor p.Val66Met "
                "in adult ADHD in four European populations"
            ),
            journal_name=None,
            year=2010,
            doi=None,
            pmid=116587801,
            pmcid=None,
            abstract=query_text,
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=3,
            reference_count=12,
            publication_types=["MetaAnalysis"],
            fields_of_study=["Medicine"],
            chunk_lexical_score=0.461,
            citation_boost=3.0,
            evidence_quality_score=0.18,
            biomedical_rerank_score=0.428571,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text=query_text,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.DENSE_QUERY: {35014340: 1},
            RetrievalChannel.CHUNK_LEXICAL: {116587801: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [116587801, 35014340]
    assert ranked[0].fused_score > ranked[1].fused_score
    assert ranked[0].chunk_lexical_score > 0
    assert ranked[1].passage_alignment_score >= 0.55


def test_rank_paper_hits_prefers_direct_passage_alignment_over_generic_chunk_match():
    query_text = (
        "In this study we investigated whether reduced physical performance and "
        "low handgrip lower limbs strength could predict a higher incidence of "
        "cognitive decline during follow up"
    )
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Generic vascular paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract="Collateral vessel formation may improve outcomes in moyamoya disease.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=18,
            reference_count=42,
            chunk_lexical_score=0.98,
            citation_boost=1.4,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title="Target cognitive decline cohort",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=(
                "Reduced physical performance and low handgrip lower limbs strength "
                "predicted a higher incidence of cognitive decline during follow up."
            ),
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=6,
            reference_count=12,
            chunk_lexical_score=0.9,
            dense_score=0.8,
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
                    context_text="Indirect topical context.",
                    score=1.4,
                )
            ]
        },
        entity_hits={},
        relation_hits={},
        query_text=query_text,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.CHUNK_LEXICAL: {11: 1, 22: 2},
            RetrievalChannel.DENSE_QUERY: {22: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [22, 11]
    assert ranked[0].passage_alignment_score > ranked[1].passage_alignment_score
    assert "Direct paper text closely matches the query" in ranked[0].match_reasons


def test_rank_paper_hits_promotes_near_exact_title_sentence_in_passage_lookup():
    query_text = (
        "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
        "maturation and brain development in the rat"
    )
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Related fetal alcohol exercise paper",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract="Exercise improved outcomes in a rodent fetal alcohol model.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=40,
            reference_count=90,
            citation_boost=1.8,
            dense_score=0.94,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title=(
                "EFFECTS OF PRENATAL ETHANOL EXPOSURE ON PHYSICAL GROWTH, "
                "SENSORY REFLEX MATURATION AND BRAIN DEVELOPMENT IN THE RAT"
            ),
            journal_name=None,
            year=1999,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract="Prenatal ethanol exposure altered physical growth and reflex maturation.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=12,
            reference_count=20,
            lexical_score=0.44,
            title_similarity=0.92,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={
            11: [
                CitationContextHit(
                    corpus_id=11,
                    citation_id=777,
                    neighbor_corpus_id=55,
                    direction=CitationDirection.INCOMING,
                    context_text="Indirect prenatal alcohol context.",
                    score=1.8,
                )
            ]
        },
        entity_hits={},
        relation_hits={},
        query_text=query_text,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.CITATION_CONTEXT: {},
            RetrievalChannel.DENSE_QUERY: {11: 1},
            RetrievalChannel.LEXICAL: {22: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [22, 11]
    assert ranked[0].passage_alignment_score >= 0.65
    assert "Direct paper text closely matches the query" in ranked[0].match_reasons


def test_rank_paper_hits_prefers_title_anchor_over_weak_chunk_noise_in_passage_lookup():
    query_text = (
        "The diagnosis of dementia due to Alzheimer's disease: "
        "Recommendations from the National Institute on Aging-Alzheimer's "
        "Association workgroups on diagnostic guidelines for Alzheimer's disease"
    )
    papers = [
        PaperEvidenceHit(
            corpus_id=3470330,
            paper_id="paper-3470330",
            semantic_scholar_paper_id="paper-3470330",
            title=(
                "The diagnosis of dementia due to Alzheimer's disease: "
                "Recommendations from the National Institute on Aging-"
                "Alzheimer's Association workgroups on diagnostic guidelines "
                "for Alzheimer's disease"
            ),
            journal_name=None,
            year=2011,
            doi=None,
            pmid=3470330,
            pmcid=None,
            abstract=None,
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=40,
            reference_count=120,
            dense_score=0.8467,
            biomedical_rerank_score=1.0,
        ),
        PaperEvidenceHit(
            corpus_id=6787660,
            paper_id="paper-6787660",
            semantic_scholar_paper_id="paper-6787660",
            title="Competing guideline commentary",
            journal_name=None,
            year=2014,
            doi=None,
            pmid=6787660,
            pmcid=None,
            abstract="Indirect guideline commentary with chunk support.",
            tldr=None,
            text_availability="fulltext",
            is_open_access=True,
            citation_count=8,
            reference_count=14,
            publication_types=["Review"],
            fields_of_study=["Medicine"],
            chunk_lexical_score=0.0248,
            citation_boost=8.0,
            evidence_quality_score=0.2,
            biomedical_rerank_score=0.142857,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        query_text=query_text,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        channel_rankings={
            RetrievalChannel.DENSE_QUERY: {3470330: 1},
            RetrievalChannel.CHUNK_LEXICAL: {6787660: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [3470330, 6787660]
    assert ranked[0].title_anchor_score == 1.0
    assert ranked[1].chunk_lexical_score > 0


def test_rank_paper_hits_treats_strong_passage_alignment_as_direct_support():
    query_text = (
        "Does GDNF reduce drug-induced rotational behavior after medial forebrain "
        "bundle transection by increasing striatal dopamine?"
    )
    papers = [
        PaperEvidenceHit(
            corpus_id=11,
            paper_id="paper-11",
            semantic_scholar_paper_id="paper-11",
            title="Indirect basal forebrain background study",
            journal_name=None,
            year=1999,
            doi=None,
            pmid=11,
            pmcid=None,
            abstract="Background citation context without direct answer text.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=30,
            reference_count=50,
            chunk_lexical_score=0.002,
        ),
        PaperEvidenceHit(
            corpus_id=22,
            paper_id="paper-22",
            semantic_scholar_paper_id="paper-22",
            title=(
                "GDNF reduces drug-induced rotational behavior after medial forebrain "
                "bundle transection by a mechanism not involving striatal dopamine"
            ),
            journal_name=None,
            year=2005,
            doi=None,
            pmid=22,
            pmcid=None,
            abstract=(
                "GDNF reduced drug-induced rotational behavior after medial forebrain "
                "bundle transection by a mechanism not involving striatal dopamine."
            ),
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            citation_count=6,
            reference_count=12,
            dense_score=0.83,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={
            11: [
                CitationContextHit(
                    corpus_id=11,
                    citation_id=91,
                    neighbor_corpus_id=44,
                    direction=CitationDirection.INCOMING,
                    context_text="Indirect topical context.",
                    score=3.0,
                )
            ]
        },
        entity_hits={},
        relation_hits={},
        query_text=query_text,
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        evidence_intent=EvidenceIntent.REFUTE,
        channel_rankings={
            RetrievalChannel.CHUNK_LEXICAL: {11: 1},
            RetrievalChannel.DENSE_QUERY: {22: 1},
        },
    )

    assert [paper.corpus_id for paper in ranked] == [22, 11]
    assert ranked[0].passage_alignment_score >= 0.55
    assert "Direct paper text closely matches the query" in ranked[0].match_reasons


def test_rank_paper_hits_applies_clinician_prior_for_treatment_queries():
    papers = [
        PaperEvidenceHit(
            corpus_id=1,
            paper_id="paper-1",
            semantic_scholar_paper_id="paper-1",
            title="Randomized clinical trial in human patients",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=1,
            pmcid=None,
            abstract="Human randomized trial of perioperative delirium prevention.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            publication_types=["RandomizedControlledTrial", "ClinicalTrial"],
            citation_count=10,
            reference_count=12,
            dense_score=0.42,
        ),
        PaperEvidenceHit(
            corpus_id=2,
            paper_id="paper-2",
            semantic_scholar_paper_id="paper-2",
            title="Mouse model of perioperative delirium",
            journal_name=None,
            year=2024,
            doi=None,
            pmid=2,
            pmcid=None,
            abstract="Mechanistic mouse model study.",
            tldr=None,
            text_availability="abstract",
            is_open_access=True,
            publication_types=["Study"],
            citation_count=10,
            reference_count=12,
            dense_score=0.48,
        ),
    ]

    ranked = rank_paper_hits(
        papers,
        citation_hits={},
        entity_hits={},
        relation_hits={},
        species_profiles={
            1: PaperSpeciesProfile(corpus_id=1, human_mentions=5),
            2: PaperSpeciesProfile(
                corpus_id=2,
                nonhuman_mentions=12,
                common_model_mentions=12,
            ),
        },
        query_text="Does melatonin reduce postoperative delirium in surgical patients?",
        retrieval_profile=QueryRetrievalProfile.PASSAGE_LOOKUP,
        clinical_intent=ClinicalQueryIntent.TREATMENT,
        channel_rankings={RetrievalChannel.DENSE_QUERY: {2: 1, 1: 2}},
    )

    assert [paper.corpus_id for paper in ranked] == [1, 2]
    assert ranked[0].clinical_prior_score > 0
    assert ranked[1].clinical_prior_score < 0
    assert any(
        reason.startswith("Matched clinician-facing prior")
        for reason in ranked[0].match_reasons
    )
