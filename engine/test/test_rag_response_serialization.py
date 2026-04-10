from __future__ import annotations

from datetime import UTC, datetime

from app.rag.models import (
    EvidenceBundle,
    GraphRelease,
    PaperAuthorRecord,
    PaperEvidenceHit,
    PaperRetrievalQuery,
    RagSearchResult,
)
from app.rag.response_serialization import serialize_search_result


def test_serialize_search_result_preserves_structural_paper_metadata():
    result = RagSearchResult(
        request_id="req-1",
        generated_at=datetime.now(UTC),
        duration_ms=12.5,
        retrieval_version="rag-v1",
        query=PaperRetrievalQuery(
            graph_release_id="current",
            query="melatonin delirium trial",
            normalized_query="melatonin delirium trial",
            cited_corpus_ids=[101],
        ),
        graph_release=GraphRelease(
            graph_release_id="current",
            graph_run_id="current",
            bundle_checksum=None,
            graph_name="canonical",
            is_current=True,
        ),
        bundles=[
            EvidenceBundle(
                paper=PaperEvidenceHit(
                    corpus_id=101,
                    paper_id="paper-101",
                    semantic_scholar_paper_id="ss-101",
                    title="Melatonin for postoperative delirium",
                    journal_name="JAMA",
                    year=2024,
                    doi="10.1000/example",
                    pmid=123456,
                    pmcid="PMC123456",
                    abstract="Study abstract.",
                    tldr="Study TLDR.",
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=25,
                    influential_citation_count=7,
                    reference_count=41,
                    publication_types=["Randomized Controlled Trial"],
                    fields_of_study=["Medicine"],
                    has_curated_journal_family=True,
                    journal_family_type="clinical",
                ),
                score=0.9,
                rank=1,
                snippet="Melatonin reduced postoperative delirium incidence.",
                authors=[
                    PaperAuthorRecord(
                        corpus_id=101,
                        author_position=1,
                        author_id="author-1",
                        name="Jane Doe",
                    )
                ],
            )
        ],
        graph_signals=[],
        channels=[],
    )

    response = serialize_search_result(result)
    paper = response.evidence_bundles[0].paper

    assert paper.influential_citation_count == 7
    assert paper.publication_types == ["Randomized Controlled Trial"]
    assert paper.fields_of_study == ["Medicine"]
    assert paper.has_curated_journal_family is True
    assert paper.journal_family_type == "clinical"
    assert paper.chunk_section_role is None
    assert paper.chunk_primary_block_kind is None
    assert response.evidence_bundles[0].authors[0].name == "Jane Doe"
    assert response.graph_context.cited_corpus_ids == [101]
