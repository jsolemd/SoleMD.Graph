"""Unit tests for the baseline evidence service."""

from __future__ import annotations

from app.rag.models import (
    CitationContextHit,
    EntityMatchedPaperHit,
    GraphRelease,
    GraphSignal,
    PaperAssetRecord,
    PaperEvidenceHit,
    PaperReferenceRecord,
    RelationMatchedPaperHit,
)
from app.rag.schemas import RagSearchRequest
from app.rag.service import RagService
from app.rag.types import (
    CitationDirection,
    GraphSignalKind,
    RetrievalChannel,
)


class FakeRepository:
    def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
        assert graph_release_id == "release-1"
        return GraphRelease(
            graph_release_id="bundle-1",
            graph_run_id="run-1",
            bundle_checksum="bundle-1",
            graph_name="living_graph",
            is_current=True,
        )

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None:
        assert graph_run_id == "run-1"
        assert selected_paper_id == "seed-paper"
        assert selected_node_id == "seed-paper"
        return 11

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert query == "melatonin delirium"
        assert limit == 6
        return [
            PaperEvidenceHit(
                corpus_id=11,
                paper_id="paper-11",
                semantic_scholar_paper_id="paper-11",
                title="Melatonin for delirium prevention",
                journal_name="JAMA",
                year=2024,
                doi="10.1/example",
                pmid=111,
                pmcid=None,
                abstract="Melatonin reduced delirium in selected cohorts.",
                tldr="Melatonin reduced delirium in selected cohorts.",
                text_availability="fulltext",
                is_open_access=True,
                citation_count=10,
                reference_count=22,
                lexical_score=0.8,
                title_similarity=0.2,
            ),
            PaperEvidenceHit(
                corpus_id=22,
                paper_id="paper-22",
                semantic_scholar_paper_id="paper-22",
                title="Sleep and postoperative delirium",
                journal_name="NEJM",
                year=2023,
                doi=None,
                pmid=222,
                pmcid=None,
                abstract="Sleep disruption is associated with delirium risk.",
                tldr=None,
                text_availability="abstract",
                is_open_access=False,
                citation_count=4,
                reference_count=9,
                lexical_score=0.5,
                title_similarity=0.1,
            ),
        ]

    def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
        assert corpus_ids == [11, 22]
        assert query == "melatonin delirium"
        return {
            11: [
                CitationContextHit(
                    corpus_id=11,
                    citation_id=9001,
                    direction=CitationDirection.INCOMING,
                    neighbor_corpus_id=22,
                    neighbor_paper_id="paper-22",
                    context_text="Melatonin was associated with lower delirium incidence.",
                    intents=["Background"],
                    score=1.5,
                )
            ]
        }

    def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
        assert entity_terms == ["melatonin"]
        return {
            11: [
                EntityMatchedPaperHit(
                    corpus_id=11,
                    entity_type="chemical",
                    concept_id="MESH:D008874",
                    matched_terms=["melatonin"],
                    score=0.8,
                )
            ]
        }

    def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
        assert relation_terms == ["treat"]
        return {
            11: [
                RelationMatchedPaperHit(
                    corpus_id=11,
                    relation_type="treat",
                    subject_type="chemical",
                    subject_id="MESH:D008874",
                    object_type="disease",
                    object_id="MESH:D003863",
                    score=0.7,
                )
            ]
        }

    def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
        return {
            11: [
                PaperReferenceRecord(
                    corpus_id=11,
                    reference_id=1,
                    reference_index=0,
                    title="Foundational delirium review",
                    year=2020,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    referenced_paper_id="paper-22",
                    referenced_corpus_id=22,
                )
            ]
        }

    def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
        return {
            11: [
                PaperAssetRecord(
                    corpus_id=11,
                    asset_id=7,
                    asset_kind="pdf",
                    remote_url="https://example.test/melatonin.pdf",
                    storage_path=None,
                    access_status="public",
                    license="cc-by",
                    metadata={},
                )
            ]
        }

    def fetch_semantic_neighbors(
        self,
        *,
        graph_run_id: str,
        selected_corpus_id: int,
        limit: int = 6,
    ):
        assert graph_run_id == "run-1"
        assert selected_corpus_id == 11
        return [
            GraphSignal(
                corpus_id=33,
                paper_id="paper-33",
                signal_kind=GraphSignalKind.SEMANTIC_NEIGHBOR,
                channel=RetrievalChannel.SEMANTIC_NEIGHBOR,
                score=0.91,
                rank=1,
                reason="Embedding proximity to the selected paper",
            )
        ]


def test_rag_service_returns_bundles_graph_signals_and_answer():
    service = RagService(repository=FakeRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=True,
        selected_layer_key="paper",
        selected_node_id="seed-paper",
    )

    response = service.search(request)

    assert response.query == "melatonin delirium"
    assert response.graph_context.graph_release_id == "bundle-1"
    assert response.graph_context.graph_run_id == "run-1"
    assert response.graph_context.bundle_checksum == "bundle-1"
    assert response.graph_context.selected_paper_id == "seed-paper"
    assert response.answer_model == "baseline-extractive-v1"
    assert len(response.evidence_bundles) == 2
    assert response.evidence_bundles[0].paper.corpus_id == 11
    assert response.evidence_bundles[0].paper.paper_id == "paper-11"
    assert response.evidence_bundles[0].entity_hits[0].concept_id == "MESH:D008874"
    assert response.evidence_bundles[0].relation_hits[0].relation_type == "treat"
    assert response.evidence_bundles[0].citation_contexts[0].neighbor_paper_id == "paper-22"
    assert any(signal.signal_kind == "semantic_neighbor" for signal in response.graph_signals)
    assert any(signal.signal_kind == "answer_support" for signal in response.graph_signals)
    assert response.retrieval_channels[0].channel == "lexical"
