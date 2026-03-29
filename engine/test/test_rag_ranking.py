"""Unit tests for baseline evidence ranking."""

from __future__ import annotations

from app.rag.models import CitationContextHit, EntityMatchedPaperHit, PaperEvidenceHit
from app.rag.ranking import rank_paper_hits
from app.rag.types import CitationDirection


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
    assert "Matched entity filter" in ranked[0].match_reasons
    assert ranked[0].fused_score > ranked[1].fused_score
