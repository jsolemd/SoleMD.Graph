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
from app.rag.serving_contract import CitedSpanPacket
from app.rag.source_grounding import build_grounded_answer_from_packets
from app.rag.types import (
    CitationDirection,
    GraphSignalKind,
    RetrievalChannel,
    RetrievalScope,
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

    def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
        assert limit == 5
        return []

    def resolve_selected_corpus_id(
        self,
        *,
        graph_run_id: str,
        selected_graph_paper_ref: str | None,
        selected_paper_id: str | None,
        selected_node_id: str | None,
    ) -> int | None:
        assert graph_run_id == "run-1"
        assert selected_graph_paper_ref == "seed-paper"
        assert selected_paper_id is None
        assert selected_node_id == "seed-paper"
        return 11

    def resolve_scope_corpus_ids(self, *, graph_run_id: str, graph_paper_refs):
        assert graph_run_id == "run-1"
        assert graph_paper_refs == []
        return []

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert query == "melatonin delirium"
        assert limit == 6
        assert scope_corpus_ids in (None, [11, 22])
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

    def search_entity_papers(
        self,
        graph_run_id: str,
        *,
        entity_terms,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert entity_terms == ["melatonin"]
        assert limit == 6
        assert scope_corpus_ids in (None, [11, 22])
        return []

    def search_relation_papers(
        self,
        graph_run_id: str,
        *,
        relation_terms,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert relation_terms == ["treat"]
        assert limit == 6
        assert scope_corpus_ids in (None, [11, 22])
        return []

    def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
        assert graph_run_id == "run-1"
        assert corpus_ids == [33]
        return [
            PaperEvidenceHit(
                corpus_id=33,
                paper_id="paper-33",
                semantic_scholar_paper_id="paper-33",
                title="Neighboring melatonin paper",
                journal_name="BMJ",
                year=2022,
                doi=None,
                pmid=333,
                pmcid=None,
                abstract="Semantically similar paper.",
                tldr=None,
                text_availability="abstract",
                is_open_access=False,
                citation_count=2,
                reference_count=5,
            )
        ]

    def fetch_known_scoped_papers_by_corpus_ids(self, corpus_ids):
        return self.fetch_papers_by_corpus_ids("run-1", corpus_ids)

    def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
        assert corpus_ids == [11, 22, 33]
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
        scope_corpus_ids=None,
    ):
        assert graph_run_id == "run-1"
        assert selected_corpus_id == 11
        assert scope_corpus_ids is None
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
    assert response.graph_context.selected_graph_paper_ref == "seed-paper"
    assert response.graph_context.selected_paper_id is None
    assert response.answer_model == "baseline-extractive-v1"
    assert response.answer is not None
    assert response.answer.startswith("Potentially supporting evidence:")
    assert response.answer_corpus_ids == [11, 22]
    assert len(response.evidence_bundles) == 3
    assert response.evidence_bundles[0].paper.corpus_id == 11
    assert response.evidence_bundles[0].paper.paper_id == "paper-11"
    assert response.evidence_bundles[0].rank_features["intent_affinity"] > 0
    assert response.evidence_bundles[0].entity_hits[0].concept_id == "MESH:D008874"
    assert response.evidence_bundles[0].relation_hits[0].relation_type == "treat"
    assert response.evidence_bundles[0].citation_contexts[0].neighbor_paper_id == "paper-22"
    assert any(bundle.paper.corpus_id == 33 for bundle in response.evidence_bundles)
    assert any(signal.signal_kind == "semantic_neighbor" for signal in response.graph_signals)
    assert any(signal.signal_kind == "answer_support" for signal in response.graph_signals)
    assert response.retrieval_channels[1].channel == "entity_match"
    assert response.retrieval_channels[0].channel == "lexical"


def test_rag_service_marks_refute_intent_in_answer_and_graph_signals():
    service = RagService(repository=FakeRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="refute",
        k=3,
        rerank_topn=6,
        generate_answer=True,
        selected_layer_key="paper",
        selected_node_id="seed-paper",
    )

    response = service.search(request)

    assert response.answer is not None
    assert response.answer.startswith("Potentially refuting evidence:")
    assert response.answer_corpus_ids == [11, 22]
    assert any(signal.signal_kind == "answer_refute" for signal in response.graph_signals)
    assert all(signal.signal_kind != "answer_support" for signal in response.graph_signals)


def test_rag_service_can_scope_to_selected_graph_papers_only():
    class SelectionScopeRepository(FakeRepository):
        def resolve_scope_corpus_ids(self, *, graph_run_id: str, graph_paper_refs):
            assert graph_run_id == "run-1"
            assert graph_paper_refs == ["paper-11", "paper-22"]
            return [11, 22]

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert scope_corpus_ids == [11, 22]
            return super().search_papers(
                graph_run_id,
                query,
                limit=limit,
                scope_corpus_ids=scope_corpus_ids,
            )

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            assert scope_corpus_ids == [11, 22]
            return [
                GraphSignal(
                    corpus_id=22,
                    paper_id="paper-22",
                    signal_kind=GraphSignalKind.SEMANTIC_NEIGHBOR,
                    channel=RetrievalChannel.SEMANTIC_NEIGHBOR,
                    score=0.61,
                    rank=1,
                    reason="Embedding proximity to the selected paper",
                )
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

    service = RagService(repository=SelectionScopeRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        selection_graph_paper_refs=["paper-11", "paper-22"],
        scope_mode=RetrievalScope.SELECTION_ONLY,
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key="paper",
        selected_node_id="seed-paper",
    )

    response = service.search(request)

    assert response.graph_context.scope_mode == "selection_only"
    assert response.graph_context.selection_graph_paper_refs == ["paper-11", "paper-22"]
    assert {bundle.paper.corpus_id for bundle in response.evidence_bundles} == {11, 22}
    assert all(bundle.paper.corpus_id != 33 for bundle in response.evidence_bundles)


def test_rag_service_skips_semantic_candidate_expansion_without_selected_paper():
    class NoSelectionRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            assert selected_graph_paper_ref is None
            assert selected_paper_id is None
            assert selected_node_id is None
            return None

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError(
                "semantic neighbors should not be fetched without a selected paper"
            )

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("semantic seed lookup should not run without semantic neighbors")

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

    service = RagService(repository=NoSelectionRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key=None,
        selected_node_id=None,
    )

    response = service.search(request)

    assert len(response.evidence_bundles) == 2
    assert response.graph_context.selected_graph_paper_ref is None
    assert response.graph_context.selected_paper_id is None


def test_rag_service_returns_early_when_no_candidates_are_found():
    class EmptyCandidateRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == "melatonin delirium"
            assert limit == 6
            assert scope_corpus_ids is None
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            raise AssertionError("citation enrichment should not run without candidates")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            raise AssertionError("entity enrichment should not run without candidates")

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            raise AssertionError("relation enrichment should not run without candidates")

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            raise AssertionError("reference lookup should not run without candidates")

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            raise AssertionError("asset lookup should not run without candidates")

    service = RagService(repository=EmptyCandidateRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=True,
        selected_layer_key="paper",
        selected_node_id=None,
    )

    response = service.search(request)

    assert response.answer is None
    assert response.answer_model is None
    assert response.answer_corpus_ids == []
    assert response.evidence_bundles == []
    assert response.graph_signals == []
    assert [channel.channel for channel in response.retrieval_channels] == [
        "lexical",
        "entity_match",
        "relation_match",
        "citation_context",
        "semantic_neighbor",
    ]
    assert all(channel.hits == [] for channel in response.retrieval_channels)


def test_rag_service_can_seed_candidates_from_entity_normalization():
    class EntitySeedRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert entity_terms == ["melatonin"]
            assert limit == 6
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=44,
                    paper_id="paper-44",
                    semantic_scholar_paper_id="paper-44",
                    title="Melatonin concept-seeded paper",
                    journal_name="JAMA",
                    year=2021,
                    doi=None,
                    pmid=444,
                    pmcid=None,
                    abstract="Entity-seeded candidate paper.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=12,
                    reference_count=17,
                    entity_score=0.92,
                )
            ]

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError("semantic neighbors should not run without a selected paper")

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("semantic seed lookup should not run without semantic neighbors")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [44]
            assert query == "melatonin delirium"
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [44]
            assert entity_terms == ["melatonin"]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [44]
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [44]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [44]
            return {}

    service = RagService(repository=EntitySeedRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key=None,
        selected_node_id=None,
    )

    response = service.search(request)

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [44]
    assert response.evidence_bundles[0].rank_features["entity_match"] == 0.92
    entity_channel = next(
        channel for channel in response.retrieval_channels if channel.channel == "entity_match"
    )
    assert entity_channel.hits[0].corpus_id == 44
    assert entity_channel.hits[0].reasons == ["melatonin"]


def test_rag_service_can_seed_candidates_from_relation_normalization():
    class RelationSeedRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert relation_terms == ["positive_correlate"]
            assert limit == 6
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=55,
                    paper_id="paper-55",
                    semantic_scholar_paper_id="paper-55",
                    title="Correlation-seeded paper",
                    journal_name="Nature",
                    year=2020,
                    doi=None,
                    pmid=555,
                    pmcid=None,
                    abstract="Relation-seeded candidate paper.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=5,
                    reference_count=9,
                    relation_score=1.0,
                )
            ]

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError("semantic neighbors should not run without a selected paper")

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("semantic seed lookup should not run without semantic neighbors")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [55]
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [55]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [55]
            assert relation_terms == ["positive_correlate"]
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [55]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [55]
            return {}

    service = RagService(repository=RelationSeedRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin positive correlation",
        entity_terms=[],
        relation_terms=["positive correlate"],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key=None,
        selected_node_id=None,
    )

    response = service.search(request)

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [55]
    assert response.evidence_bundles[0].rank_features["relation_match"] == 1.0
    relation_channel = next(
        channel for channel in response.retrieval_channels if channel.channel == "relation_match"
    )
    assert relation_channel.hits[0].corpus_id == 55
    assert relation_channel.hits[0].reasons == ["positive_correlate"]


def test_rag_service_can_expand_candidates_from_citation_neighbors():
    class CitationSeedRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=11,
                    paper_id="paper-11",
                    semantic_scholar_paper_id="paper-11",
                    title="Seed paper",
                    journal_name="JAMA",
                    year=2024,
                    doi=None,
                    pmid=111,
                    pmcid=None,
                    abstract="Initial lexical candidate.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    citation_count=10,
                    reference_count=22,
                    lexical_score=0.8,
                    title_similarity=0.2,
                )
            ]

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError("semantic neighbors should not run without a selected paper")

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            assert graph_run_id == "run-1"
            assert corpus_ids == [22]
            return [
                PaperEvidenceHit(
                    corpus_id=22,
                    paper_id="paper-22",
                    semantic_scholar_paper_id="paper-22",
                    title="Citation neighbor paper",
                    journal_name="NEJM",
                    year=2023,
                    doi=None,
                    pmid=222,
                    pmcid=None,
                    abstract="Added via citation context expansion.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=6,
                    reference_count=11,
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            if corpus_ids == [11]:
                return {
                    11: [
                        CitationContextHit(
                            corpus_id=11,
                            citation_id=9001,
                            direction=CitationDirection.OUTGOING,
                            neighbor_corpus_id=22,
                            neighbor_paper_id="paper-22",
                            context_text=(
                                "Melatonin lowered delirium incidence "
                                "in postoperative patients."
                            ),
                            intents=["Background"],
                            score=1.25,
                        )
                    ]
                }
            if corpus_ids == [22]:
                return {
                    22: [
                        CitationContextHit(
                            corpus_id=22,
                            citation_id=9001,
                            direction=CitationDirection.INCOMING,
                            neighbor_corpus_id=11,
                            neighbor_paper_id="paper-11",
                            context_text=(
                                "Melatonin lowered delirium incidence "
                                "in postoperative patients."
                            ),
                            intents=["Background"],
                            score=1.25,
                        )
                    ]
                }
            raise AssertionError(f"unexpected citation lookup for {corpus_ids}")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11, 22]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11, 22]
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [11, 22]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [11, 22]
            return {}

    service = RagService(repository=CitationSeedRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=[],
        relation_terms=[],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key=None,
        selected_node_id=None,
    )

    response = service.search(request)

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [11, 22]
    assert response.evidence_bundles[1].rank_features["citation_context"] == 1.25
    citation_channel = next(
        channel for channel in response.retrieval_channels if channel.channel == "citation_context"
    )
    assert any(hit.corpus_id == 22 for hit in citation_channel.hits)


def test_rag_service_can_enrich_missing_entity_and_relation_terms_from_query_text():
    class QueryEnrichmentRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            assert selected_graph_paper_ref is None
            assert selected_paper_id is None
            assert selected_node_id is None
            return None

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            assert limit == 5
            assert "melatonin" in query_phrases
            assert "delirium" in query_phrases
            assert "positive correlate" in query_phrases
            return ["melatonin", "delirium"]

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == "melatonin positive correlate delirium"
            assert limit == 6
            assert scope_corpus_ids is None
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

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("auto-enriched name terms should not trigger seeded entity recall")

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert relation_terms == ["positive_correlate"]
            assert limit == 6
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [11, 22]
            assert query == "melatonin positive correlate delirium"
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11, 22]
            assert entity_terms == ["melatonin", "delirium"]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11, 22]
            assert relation_terms == ["positive_correlate"]
            return {}

    service = RagService(repository=QueryEnrichmentRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin positive correlate delirium",
        entity_terms=[],
        relation_terms=[],
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
        selected_layer_key=None,
        selected_node_id=None,
    )

    response = service.search(request)

    assert response.query == "melatonin positive correlate delirium"
    assert len(response.evidence_bundles) == 2


def test_rag_service_uses_auto_enriched_concept_ids_for_seeded_entity_recall():
    class QueryEnrichmentRepository(FakeRepository):
        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            assert "mesh:d008550" in [phrase.lower() for phrase in query_phrases]
            return ["MESH:D008550"]

        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            assert selected_graph_paper_ref is None
            assert selected_paper_id is None
            assert selected_node_id is None
            return None

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert entity_terms == ["MESH:D008550"]
            assert limit == 6
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == ["MESH:D008550"]
            return {}

    service = RagService(repository=QueryEnrichmentRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="MESH:D008550 delirium",
        entity_terms=[],
        relation_terms=[],
        k=3,
        rerank_topn=6,
        generate_answer=False,
    )

    response = service.search(request)

    assert response.query == "MESH:D008550 delirium"


def test_rag_service_can_attach_warehouse_grounded_answer_when_available():
    def fake_grounder(*, corpus_ids, segment_texts, segment_corpus_ids=None):
        assert corpus_ids == [11]
        assert segment_texts == [
            "Potentially supporting evidence:",
            (
                "Melatonin for delirium prevention (2024): Melatonin was associated "
                "with lower delirium incidence."
            ),
        ]
        assert segment_corpus_ids == [None, 11]
        grounded = build_grounded_answer_from_packets(
            segment_texts=segment_texts,
            segment_corpus_ids=segment_corpus_ids,
            packets=[
                CitedSpanPacket(
                    packet_id="span:11:b0:s0",
                    corpus_id=11,
                    canonical_section_ordinal=1,
                    canonical_block_ordinal=0,
                    canonical_sentence_ordinal=0,
                    section_role="results",
                    block_kind="narrative_paragraph",
                    span_origin="primary_text",
                    alignment_status="exact",
                    alignment_confidence=1.0,
                    text="Melatonin reduced delirium incidence.",
                    quote_text="Melatonin reduced delirium incidence.",
                )
            ],
        )
        return grounded

    service = RagService(
        repository=FakeRepository(),
        warehouse_grounder=fake_grounder,
    )
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=1,
        rerank_topn=6,
        generate_answer=True,
        selected_layer_key="paper",
        selected_node_id="seed-paper",
    )

    response = service.search(request)

    assert response.grounded_answer is not None
    assert response.answer_corpus_ids == [11]
    assert response.grounded_answer.answer_linked_corpus_ids == [11]
