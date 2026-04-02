"""Unit tests for the baseline evidence service."""

from __future__ import annotations

from contextlib import contextmanager

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
from app.rag.query_embedding import NoopQueryEmbedder, RagQueryEmbedder
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
    _disable_session_jit = True

    def _assert_search_args(
        self,
        *,
        graph_run_id: str,
        query: str,
        limit: int,
        scope_corpus_ids,
    ) -> None:
        assert graph_run_id == "run-1"
        assert isinstance(query, str)
        assert query.strip()
        assert limit > 0
        if scope_corpus_ids is not None:
            assert list(scope_corpus_ids)
            assert all(isinstance(corpus_id, int) for corpus_id in scope_corpus_ids)

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

    def describe_paper_search_route(
        self,
        *,
        graph_run_id: str,
        query: str,
        limit: int,
        scope_corpus_ids=None,
        use_title_similarity: bool = True,
    ) -> str:
        self._assert_search_args(
            graph_run_id=graph_run_id,
            query=query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        )
        assert isinstance(use_title_similarity, bool)
        return "paper_search_global"

    def search_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids=None,
        use_title_similarity=True,
    ) -> list[PaperEvidenceHit]:
        self._assert_search_args(
            graph_run_id=graph_run_id,
            query=query,
            limit=limit,
            scope_corpus_ids=scope_corpus_ids,
        )
        assert isinstance(use_title_similarity, bool)
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

    def search_exact_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert limit > 0
        assert scope_corpus_ids in (None, [11, 22])
        return []

    def search_selected_title_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        selected_corpus_id: int,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert limit > 0
        assert scope_corpus_ids in (None, [11, 22])
        return []

    def search_chunk_papers(
        self,
        graph_run_id: str,
        query: str,
        *,
        limit: int,
        scope_corpus_ids=None,
    ) -> list[PaperEvidenceHit]:
        assert graph_run_id == "run-1"
        assert limit == 6
        assert scope_corpus_ids in (None, [11, 22])
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
        assert corpus_ids in ([11, 22], [11, 22, 33], [22])
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


def test_passage_lookup_bounds_entity_relation_enrichment_to_ranked_shortlist():
    class PassageRepository:
        def __init__(self) -> None:
            self.entity_match_corpus_ids: list[int] | None = None
            self.relation_match_corpus_ids: list[int] | None = None

        def resolve_graph_release(self, graph_release_id: str) -> GraphRelease:
            return GraphRelease(
                graph_release_id="bundle-1",
                graph_run_id="run-1",
                bundle_checksum="bundle-1",
                graph_name="living_graph",
                is_current=True,
            )

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            return []

        def resolve_scope_corpus_ids(self, *, graph_run_id: str, graph_paper_refs):
            return []

        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_selected_title_papers(self, *args, **kwargs):
            return []

        def search_exact_title_papers(self, *args, **kwargs):
            return []

        def search_papers(self, *args, **kwargs):
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ):
            return [
                PaperEvidenceHit(
                    corpus_id=11,
                    paper_id="paper-11",
                    semantic_scholar_paper_id="paper-11",
                    title="Direct passage hit",
                    journal_name="JAMA",
                    year=2024,
                    doi=None,
                    pmid=11,
                    pmcid=None,
                    abstract="Direct chunk support.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=20,
                    reference_count=10,
                    chunk_lexical_score=0.95,
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
            return [
                PaperEvidenceHit(
                    corpus_id=corpus_id,
                    paper_id=f"paper-{corpus_id}",
                    semantic_scholar_paper_id=f"paper-{corpus_id}",
                    title=f"Entity candidate {corpus_id}",
                    journal_name="JAMA",
                    year=2024,
                    doi=None,
                    pmid=corpus_id,
                    pmcid=None,
                    abstract="Entity seeded candidate.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    citation_count=5,
                    reference_count=10,
                    entity_score=0.8 - ((corpus_id - 20) * 0.01),
                )
                for corpus_id in range(20, 34)
            ]

        def search_relation_papers(self, *args, **kwargs):
            return []

        def search_query_embedding_papers(self, *args, **kwargs):
            return []

        def fetch_semantic_neighbors(self, *args, **kwargs):
            return []

        def fetch_known_scoped_papers_by_corpus_ids(self, corpus_ids):
            return []

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids in ([11], [11, 20, 21])
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            self.entity_match_corpus_ids = list(corpus_ids)
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            self.relation_match_corpus_ids = list(corpus_ids)
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    repository = PassageRepository()
    service = RagService(
        repository=repository,
        warehouse_grounder=None,
        query_embedder=NoopQueryEmbedder(),
    )

    response = service.search(
        RagSearchRequest(
            graph_release_id="current",
            query="Melatonin reduced postoperative delirium incidence in surgical patients.",
            entity_terms=["melatonin"],
            k=3,
            rerank_topn=18,
            use_dense_query=False,
            generate_answer=False,
        )
    )

    assert response.meta.duration_ms >= 0
    assert repository.entity_match_corpus_ids is not None
    assert repository.relation_match_corpus_ids is not None
    assert repository.entity_match_corpus_ids == repository.relation_match_corpus_ids
    assert len(repository.entity_match_corpus_ids) == 12
    assert repository.entity_match_corpus_ids[0] == 11


class FakeDenseQueryEmbedder:
    def encode(self, text: str) -> list[float] | None:
        assert text == "melatonin delirium"
        return [0.1, 0.2, 0.3]


class FakeWarmableQueryEmbedder:
    def __init__(self):
        self.initialized = 0

    def initialize(self) -> bool:
        self.initialized += 1
        return True

    def encode(self, text: str) -> list[float] | None:
        return None

    def runtime_status(self) -> dict[str, object]:
        return {
            "enabled": True,
            "ready": self.initialized > 0,
            "backend": "fake",
        }


def _service(
    repository: object,
    *,
    query_embedder: RagQueryEmbedder | None = None,
) -> RagService:
    return RagService(
        repository=repository,
        query_embedder=query_embedder or NoopQueryEmbedder(),
    )


def test_rag_service_warm_and_status_delegate_to_query_embedder():
    embedder = FakeWarmableQueryEmbedder()
    service = _service(FakeRepository(), query_embedder=embedder)

    duration_ms = service.warm()

    assert duration_ms >= 0.0
    assert embedder.initialized == 1
    assert service.query_embedder_status() == {
        "enabled": True,
        "ready": True,
        "backend": "fake",
    }


def test_rag_service_uses_repository_search_session_when_available():
    class SessionRepository(FakeRepository):
        def __init__(self):
            self.session_entries = 0

        @contextmanager
        def search_session(self):
            self.session_entries += 1
            yield

    repository = SessionRepository()
    service = _service(repository)

    service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query="melatonin delirium",
            entity_terms=["melatonin"],
            relation_terms=["treat"],
            selected_layer_key="paper",
            selected_node_id="seed-paper",
            selected_graph_paper_ref="seed-paper",
            k=3,
            rerank_topn=6,
            generate_answer=False,
            use_lexical=True,
            use_dense_query=False,
        )
    )

    assert repository.session_entries == 1


def test_rag_service_search_result_can_include_debug_trace():
    service = _service(FakeRepository())

    result = service.search_result(
        RagSearchRequest(
            graph_release_id="release-1",
            query="melatonin delirium",
            entity_terms=["melatonin"],
            relation_terms=["treat"],
            selected_layer_key="paper",
            selected_node_id="seed-paper",
            selected_graph_paper_ref="seed-paper",
            k=3,
            rerank_topn=6,
            generate_answer=False,
            use_lexical=True,
            use_dense_query=False,
        ),
        include_debug_trace=True,
    )

    assert result.debug_trace["stage_durations_ms"]["resolve_graph_release"] >= 0.0
    assert result.debug_trace["candidate_counts"]["lexical_hits"] == 2
    assert result.debug_trace["candidate_counts"]["top_hits"] == 2
    assert result.debug_trace["session_flags"]["selected_corpus_id_present"] is True
    assert result.debug_trace["session_flags"]["use_dense_query"] is False
    assert result.debug_trace["session_flags"]["session_jit_disabled"] is True
    assert result.debug_trace["session_flags"]["paper_search_route"] == "paper_search_global"
    assert result.debug_trace["session_flags"]["paper_search_query_text"] == "melatonin delirium"
    assert result.debug_trace["session_flags"]["paper_search_use_title_candidate_lookup"] is True


def test_rag_service_skips_runtime_entity_resolution_for_exact_title_anchor():
    class ExactTitleRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("entity resolution should be skipped for exact title anchors")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=11,
                    paper_id="paper-11",
                    semantic_scholar_paper_id="paper-11",
                    title=(
                        "Invasive pulmonary aspergillosis in patients with "
                        "decompensated cirrhosis case series"
                    ),
                    journal_name="JAMA",
                    year=2024,
                    doi="10.1/example",
                    pmid=111,
                    pmcid=None,
                    abstract="Case series abstract.",
                    tldr="Case series abstract.",
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=10,
                    reference_count=22,
                    lexical_score=2.0,
                    title_similarity=1.0,
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [11]
            return {}

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("exact title anchors should not expand the citation frontier")

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title anchors should not run dense retrieval")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    class FailingDenseQueryEmbedder:
        def encode(self, text: str) -> list[float] | None:
            raise AssertionError("exact title anchors should not encode dense queries")

    service = _service(
        ExactTitleRepository(),
        query_embedder=FailingDenseQueryEmbedder(),
    )

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=(
                "Invasive pulmonary aspergillosis in patients with "
                "decompensated cirrhosis: case series"
            ),
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [11]


def test_rag_service_skips_dense_and_frontier_for_strong_title_prefix_anchor():
    class PrefixTitleRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("entity resolution should be skipped for strong title anchors")

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("title lookup requests should not pre-run exact title probes")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=11857184,
                    paper_id="paper-11857184",
                    semantic_scholar_paper_id="paper-11857184",
                    title=(
                        "Designing clinical trials for assessing the effects of "
                        "cognitive training and physical activity interventions on "
                        "cognitive outcomes: The Seniors Health and Activity "
                        "Research Program Pilot (SHARP-P) Study, a randomized "
                        "controlled trial"
                    ),
                    journal_name="JAMA",
                    year=2015,
                    doi="10.1/example",
                    pmid=11857184,
                    pmcid=None,
                    abstract="Trial design abstract.",
                    tldr="Trial design abstract.",
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=119,
                    reference_count=48,
                    lexical_score=1.7,
                    title_similarity=1.0,
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [11857184]
            return {}

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("strong title anchors should not expand the citation frontier")

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("strong title anchors should not run dense retrieval")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    class FailingDenseQueryEmbedder:
        def encode(self, text: str) -> list[float] | None:
            raise AssertionError("strong title anchors should not encode dense queries")

    service = _service(
        PrefixTitleRepository(),
        query_embedder=FailingDenseQueryEmbedder(),
    )

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=(
                "Designing clinical trials for assessing the effects of cognitive "
                "training and physical activity interventions on cognitive outcomes: "
                "The Seniors Health and Activity Research Program Pilot "
                "(SHARP-P) Study, a randomized"
            ),
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [11857184]


def test_rag_service_prefers_selected_title_anchor_before_broad_lookup():
    query = (
        "Designing clinical trials for assessing the effects of cognitive training "
        "and physical activity interventions on cognitive outcomes: The Seniors "
        "Health and Activity Research Program Pilot (SHARP-P) Study, a randomized"
    )

    class SelectedTitleAnchorRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            assert selected_graph_paper_ref == "paper:11857184"
            assert selected_paper_id is None
            assert selected_node_id == "paper:11857184"
            return 11857184

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("selected title anchors should skip runtime entity resolution")

        def search_selected_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            selected_corpus_id: int,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query.startswith("Designing clinical trials")
            assert selected_corpus_id == 11857184
            assert limit == 4
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=11857184,
                    paper_id="paper-11857184",
                    semantic_scholar_paper_id="paper-11857184",
                    title=(
                        "Designing clinical trials for assessing the effects of "
                        "cognitive training and physical activity interventions on "
                        "cognitive outcomes: The Seniors Health and Activity "
                        "Research Program Pilot (SHARP-P) Study, a randomized "
                        "controlled trial"
                    ),
                    journal_name="JAMA",
                    year=2015,
                    doi="10.1/example",
                    pmid=11857184,
                    pmcid=None,
                    abstract="Trial design abstract.",
                    tldr="Trial design abstract.",
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=119,
                    reference_count=48,
                    lexical_score=2.0,
                    title_similarity=1.0,
                )
            ]

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should not pre-run exact title probes")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip broad paper lexical lookup")

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip chunk lexical retrieval")

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip entity recall")

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip relation recall")

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip dense retrieval")

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError("selected title anchors should skip semantic neighbors")

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("selected title anchors should not expand semantic seeds")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [11857184]
            assert query == (
                "Designing clinical trials for assessing the effects of cognitive training "
                "and physical activity interventions on cognitive outcomes: The Seniors "
                "Health and Activity Research Program Pilot (SHARP-P) Study, a randomized"
            )
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11857184]
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11857184]
            assert relation_terms == []
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(SelectedTitleAnchorRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            selected_layer_key="paper",
            selected_node_id="paper:11857184",
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [11857184]
    assert "Preserved explicitly selected paper context" in (
        response.evidence_bundles[0].match_reasons
    )


def test_rag_service_selected_title_anchor_can_promote_overlong_selected_titles():
    query = (
        "A Cuprous Oxide Thin Film Non-Enzymatic Glucose Sensor Using Differential "
        "Pulse Voltammetry and Other Voltammetry Methods and a Comparison to "
        "Different Thin Film Electrodes on the Detection of Glucose in an "
        "Alkaline Solution"
    )

    class OverlongSelectedTitleRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            assert selected_graph_paper_ref == "paper:4443808"
            assert selected_paper_id is None
            assert selected_node_id == "paper:4443808"
            return 4443808

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("selected title anchors should skip runtime entity resolution")

        def search_selected_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            selected_corpus_id: int,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query.startswith("A Cuprous Oxide Thin Film")
            assert selected_corpus_id == 4443808
            assert limit == 4
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=4443808,
                    paper_id="paper-4443808",
                    semantic_scholar_paper_id="paper-4443808",
                    title=query,
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=4443808,
                    pmcid=None,
                    abstract="Selected-paper title match.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    lexical_score=1.8,
                    title_similarity=1.0,
                )
            ]

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("selected title anchors should skip passage chunk retrieval")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [4443808]
            assert query.startswith("A Cuprous Oxide Thin Film")
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [4443808]
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [4443808]
            assert relation_terms == []
            return {}

    service = _service(OverlongSelectedTitleRepository())

    result = service.search_result(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            selected_layer_key="paper",
            selected_node_id="paper:4443808",
            k=2,
            rerank_topn=4,
            generate_answer=False,
        ),
        include_debug_trace=True,
    )

    assert [bundle.paper.corpus_id for bundle in result.bundles][:1] == [4443808]
    assert result.debug_trace["session_flags"]["title_anchor_route"] == "selected_title"
    assert result.debug_trace["session_flags"]["retrieval_profile"] == "title_lookup"


def test_rag_service_disables_title_similarity_for_sentence_queries():
    class SentenceQueryRepository(FakeRepository):
        def __init__(self):
            self.chunk_queries: list[str] = []

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == "this is a representative discussion sentence"
            assert limit == 6
            assert scope_corpus_ids is None
            assert use_title_similarity is False
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert limit == 6
            assert scope_corpus_ids is None
            self.chunk_queries.append(query)
            return []

        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("passage queries should not hit exact-title paper search")

    repository = SentenceQueryRepository()
    service = _service(repository)
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="This is a representative discussion sentence.",
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
    )

    response = service.search(request)

    assert response.evidence_bundles == []
    assert repository.chunk_queries[0] == "this is a representative discussion sentence"


def test_rag_service_keeps_title_candidate_lookup_for_long_title_queries():
    query = (
        "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
        "maturation and brain development in the rat"
    )

    class LongTitleRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def describe_paper_search_route(
            self,
            *,
            graph_run_id: str,
            query: str,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity: bool = True,
            use_title_candidate_lookup: bool | None = None,
        ) -> str:
            assert graph_run_id == "run-1"
            assert query == (
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            )
            assert limit == 6
            assert scope_corpus_ids is None
            assert use_title_similarity is False
            assert use_title_candidate_lookup is True
            return "paper_search_global"

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
            use_title_candidate_lookup: bool | None = None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == (
                "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
                "maturation and brain development in the rat"
            )
            assert limit == 6
            assert scope_corpus_ids is None
            assert use_title_similarity is False
            assert use_title_candidate_lookup is True
            return []

    service = _service(LongTitleRepository(), query_embedder=NoopQueryEmbedder())
    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            k=3,
            rerank_topn=6,
            generate_answer=False,
        )
    )

    assert response.evidence_bundles == []


def test_rag_service_does_not_expand_citation_frontier_for_passage_queries():
    class PassageRepository(FakeRepository):
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError(
                "passage lookups should not hit paper lexical when chunk hits exist"
            )

        def search_chunk_papers(
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
                    title="Exact matched study",
                    journal_name="JAMA",
                    year=2024,
                    doi=None,
                    pmid=111,
                    pmcid=None,
                    abstract="Exact matched study.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=4,
                    reference_count=9,
                    chunk_lexical_score=0.98,
                    chunk_snippet="Directly matched passage.",
                )
            ]

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=77,
                    paper_id="paper-77",
                    semantic_scholar_paper_id="paper-77",
                    title="Indirect dense neighbor",
                    journal_name="BMJ",
                    year=2023,
                    doi=None,
                    pmid=777,
                    pmcid=None,
                    abstract="Indirect dense-only match.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=8,
                    reference_count=12,
                    dense_score=0.96,
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids in ([11], [77])
            return {
                11: [
                    CitationContextHit(
                        corpus_id=11,
                        citation_id=9001,
                        direction=CitationDirection.INCOMING,
                        neighbor_corpus_id=77,
                        neighbor_paper_id="paper-77",
                        context_text="Matched citation context.",
                        intents=["Background"],
                        score=1.6,
                    )
                ]
            }

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("passage lookups should not expand the citation frontier")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    class PassageDenseQueryEmbedder:
        def encode(self, text: str) -> list[float] | None:
            assert (
                text
                == "This representative discussion sentence should use chunk lexical retrieval."
            )
            return [0.1, 0.2, 0.3]

    service = _service(PassageRepository(), query_embedder=PassageDenseQueryEmbedder())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query="This representative discussion sentence should use chunk lexical retrieval.",
            k=2,
            rerank_topn=4,
            generate_answer=True,
        )
    )

    assert response.evidence_bundles[0].paper.corpus_id == 11
    assert response.answer_corpus_ids[0] == 11


def test_rag_service_uses_phrase_fallback_when_full_sentence_chunk_search_misses():
    class PassageFallbackRepository(FakeRepository):
        def __init__(self):
            self.chunk_queries: list[str] = []

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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError(
                "passage fallback should stay on chunk lexical when a phrase match exists"
            )

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            self.chunk_queries.append(query)
            if (
                query
                == "this representative discussion sentence should use chunk lexical retrieval"
            ):
                return []
            if query == "this representative discussion sentence":
                return [
                    PaperEvidenceHit(
                        corpus_id=202,
                        paper_id="paper-202",
                        semantic_scholar_paper_id="paper-202",
                        title="Fallback phrase match",
                        journal_name="Study Journal",
                        year=2024,
                        doi=None,
                        pmid=None,
                        pmcid=None,
                        abstract="Recovered from phrase fallback.",
                        tldr=None,
                        text_availability="fulltext",
                        is_open_access=True,
                        chunk_lexical_score=0.91,
                        chunk_snippet="Recovered chunk snippet.",
                    )
                ]
            raise AssertionError(f"unexpected chunk query {query}")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [202]
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    repository = PassageFallbackRepository()
    service = _service(repository, query_embedder=NoopQueryEmbedder())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query="This representative discussion sentence should use chunk lexical retrieval.",
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert repository.chunk_queries[:2] == [
        "this representative discussion sentence should use chunk lexical retrieval",
        "this representative discussion sentence",
    ]
    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [202]


def test_rag_service_preserves_selected_paper_for_title_lookup_queries():
    class SelectedTitleRepository(FakeRepository):
        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert use_title_similarity is True
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def describe_chunk_search_route(
            self,
            *,
            graph_run_id: str,
            query: str,
            limit: int,
            scope_corpus_ids=None,
        ) -> str:
            assert graph_run_id == "run-1"
            assert limit == 6
            assert scope_corpus_ids in (None, [11, 22])
            return "chunk_search_global"

        def fetch_known_scoped_papers_by_corpus_ids(self, corpus_ids):
            if corpus_ids == [33]:
                return [
                    PaperEvidenceHit(
                        corpus_id=33,
                        paper_id="paper-33",
                        semantic_scholar_paper_id="paper-33",
                        title="Related dense paper",
                        journal_name="BMJ",
                        year=2024,
                        doi=None,
                        pmid=333,
                        pmcid=None,
                        abstract="Related dense paper.",
                        tldr=None,
                        text_availability="abstract",
                        is_open_access=False,
                        citation_count=9,
                        reference_count=20,
                        dense_score=0.98,
                    )
                ]
            if corpus_ids == [11]:
                return [
                    PaperEvidenceHit(
                        corpus_id=11,
                        paper_id="paper-11",
                        semantic_scholar_paper_id="paper-11",
                        title="Selected paper title",
                        journal_name="JAMA",
                        year=2024,
                        doi=None,
                        pmid=111,
                        pmcid=None,
                        abstract="Selected paper abstract.",
                        tldr=None,
                        text_availability="fulltext",
                        is_open_access=True,
                        citation_count=3,
                        reference_count=8,
                    )
                ]
            raise AssertionError(f"unexpected corpus_ids {corpus_ids}")

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            return [
                GraphSignal(
                    corpus_id=33,
                    paper_id="paper-33",
                    signal_kind=GraphSignalKind.SEMANTIC_NEIGHBOR,
                    channel=RetrievalChannel.SEMANTIC_NEIGHBOR,
                    score=0.93,
                    rank=1,
                    reason="Embedding proximity to the selected paper",
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            requested_ids = set(corpus_ids)
            assert requested_ids
            assert requested_ids <= {11, 33}
            hits: dict[int, list[CitationContextHit]] = {}
            if 33 in requested_ids:
                hits[33] = [
                    CitationContextHit(
                        corpus_id=33,
                        citation_id=9002,
                        direction=CitationDirection.INCOMING,
                        neighbor_corpus_id=44,
                        neighbor_paper_id="paper-44",
                        context_text="Related citation context.",
                        intents=["Background"],
                        score=1.5,
                    )
                ]
            return hits

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("selected title lookups should not expand citation frontier")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(SelectedTitleRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query="Selected paper title.",
            selected_layer_key="paper",
            selected_node_id="seed-paper",
            k=2,
            rerank_topn=4,
            generate_answer=True,
        )
    )

    assert response.evidence_bundles[0].paper.corpus_id == 11
    assert response.answer_corpus_ids == [11, 33]


def test_rag_service_allows_terminal_punctuation_for_selected_title_queries():
    class SelectedTitleRepository(FakeRepository):
        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == (
                "Trauma deepens trauma: the consequences of recurrent combat stress reaction."
            )
            assert use_title_similarity is True
            return [
                PaperEvidenceHit(
                    corpus_id=20333404,
                    paper_id="paper-20333404",
                    semantic_scholar_paper_id="paper-20333404",
                    title=(
                        "Trauma deepens trauma: the consequences of recurrent combat stress "
                        "reaction."
                    ),
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Selected-paper title match.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    lexical_score=1.5,
                    title_similarity=1.0,
                )
            ]

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("title lookup should not route through chunk lexical search")

        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return 20333404

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError(
                "selected exact-title lookups should not expand semantic neighbors"
            )

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [20333404]
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(SelectedTitleRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query="Trauma deepens trauma: the consequences of recurrent combat stress reaction.",
            selected_layer_key="paper",
            selected_node_id="paper:20333404",
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [20333404]


def test_rag_service_treats_question_subtitle_titles_as_title_lookups():
    query = (
        "What physical performance measures predict incident cognitive decline among "
        "intact older adults? A 4.4year follow up study."
    )

    class QuestionSubtitleTitleRepository(FakeRepository):
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == (
                "What physical performance measures predict incident cognitive decline "
                "among intact older adults? A 4.4year follow up study."
            )
            assert use_title_similarity is False
            return [
                PaperEvidenceHit(
                    corpus_id=3092150,
                    paper_id="paper-3092150",
                    semantic_scholar_paper_id="paper-3092150",
                    title=query,
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Exact title match for a question-style paper title.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    lexical_score=1.5,
                    title_similarity=1.0,
                )
            ]

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("question-title lookup should not route through chunk lexical")

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title lookups should not seed runtime entity search")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [3092150]
            assert query == (
                "What physical performance measures predict incident cognitive decline "
                "among intact older adults? A 4.4year follow up study."
            )
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(QuestionSubtitleTitleRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [3092150]


def test_rag_service_skips_dense_and_semantic_neighbors_on_selected_direct_chunk_anchor():
    query = (
        "The glucose sensing experiment used differential pulse voltammetry. "
        "Cuprous oxide thin film electrodes were tested in an alkaline solution."
    )

    class SelectedDirectAnchorRepository(FakeRepository):
        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert limit == 6
            return [
                PaperEvidenceHit(
                    corpus_id=11,
                    paper_id="paper-11",
                    semantic_scholar_paper_id="paper-11",
                    title="Selected glucose sensor paper",
                    journal_name="Sensors",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Selected paper has direct chunk support.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=12,
                    reference_count=9,
                    chunk_lexical_score=0.93,
                    chunk_snippet="Selected paper has direct chunk support.",
                )
            ]

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
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
            return []

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError(
                "dense query should be skipped once the selected paper is directly anchored"
            )

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            raise AssertionError(
                "semantic neighbors should be skipped once the selected paper is directly anchored"
            )

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("semantic seed lookup should not run without semantic neighbors")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [11]
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [11]
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [11]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [11]
            return {}

    service = _service(SelectedDirectAnchorRepository(), query_embedder=FakeDenseQueryEmbedder())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            selected_layer_key="paper",
            selected_node_id="seed-paper",
            selected_graph_paper_ref="seed-paper",
            k=3,
            rerank_topn=6,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [11]
    chunk_channel = next(
        channel
        for channel in response.retrieval_channels
        if channel.channel == RetrievalChannel.CHUNK_LEXICAL
    )
    assert [hit.corpus_id for hit in chunk_channel.hits] == [11]


def test_rag_service_promotes_exact_title_hits_before_passage_lookup():
    query = (
        "Abnormalities of mitochondrial dynamics and bioenergetics in neuronal "
        "cells from CDKL5 deficiency disorder"
    )

    class ExactTitlePromotionRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("title-shaped queries should stay on paper lexical lookup")

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("exact title promotion should skip runtime entity resolution")

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title promotion should skip chunk lexical retrieval")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == (
                "Abnormalities of mitochondrial dynamics and bioenergetics in "
                "neuronal cells from CDKL5 deficiency disorder"
            )
            assert limit == 4
            assert scope_corpus_ids is None
            assert use_title_similarity is False
            return [
                PaperEvidenceHit(
                    corpus_id=233428792,
                    paper_id="paper-233428792",
                    semantic_scholar_paper_id="paper-233428792",
                    title=query,
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Exact title lookup abstract.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    citation_count=12,
                    reference_count=20,
                    lexical_score=2.0,
                    title_similarity=1.0,
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
            raise AssertionError("exact title promotion should skip entity recall")

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title promotion should skip relation recall")

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title promotion should skip dense retrieval")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [233428792]
            return {}

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("exact title anchors should not expand the citation frontier")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(ExactTitlePromotionRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [233428792]
    assert response.retrieval_channels[0].channel == RetrievalChannel.LEXICAL
    assert [hit.corpus_id for hit in response.retrieval_channels[0].hits] == [233428792]


def test_rag_service_uses_exact_title_precheck_for_long_passage_shaped_titles():
    query = (
        "A theory-informed qualitative exploration of social and environmental "
        "determinants of physical activity and dietary choices in adolescents with "
        "intellectual disabilities in their final year of school."
    )

    class LongTitleExactPromotionRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == (
                "A theory-informed qualitative exploration of social and environmental "
                "determinants of physical activity and dietary choices in adolescents "
                "with intellectual disabilities in their final year of school."
            )
            assert limit == 4
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=22309903,
                    paper_id="paper-22309903",
                    semantic_scholar_paper_id="paper-22309903",
                    title=query,
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Exact title lookup abstract.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    lexical_score=2.0,
                    title_similarity=1.0,
                )
            ]

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("exact title precheck should skip runtime entity resolution")

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title precheck should skip chunk lexical retrieval")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title precheck should avoid broad paper lexical lookup")

        def search_entity_papers(
            self,
            graph_run_id: str,
            *,
            entity_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title precheck should skip entity recall")

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title precheck should skip relation recall")

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("exact title precheck should skip dense retrieval")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [22309903]
            return {}

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("exact title anchors should not expand the citation frontier")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(LongTitleExactPromotionRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [22309903]
    assert response.retrieval_channels[0].channel == RetrievalChannel.LEXICAL
    assert [hit.corpus_id for hit in response.retrieval_channels[0].hits] == [22309903]


def test_rag_service_skips_citation_frontier_expansion_for_passage_queries():
    class PassagePrecisionRepository(FakeRepository):
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError(
                "passage queries should not hit paper lexical when chunk hits exist"
            )

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=202,
                    paper_id="paper-202",
                    semantic_scholar_paper_id="paper-202",
                    title="Exact matched study",
                    journal_name="Study Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Exact matched sentence abstract.",
                    tldr=None,
                    text_availability="fulltext",
                    is_open_access=True,
                    chunk_lexical_score=0.97,
                    chunk_snippet="Directly matched passage.",
                    chunk_ordinal=3,
                )
            ]

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [202]
            return {}

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            raise AssertionError("passage queries should not expand the citation frontier")

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            return {}

    service = _service(PassagePrecisionRepository())

    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=(
                "This is a representative discussion sentence with a concluding period."
            ),
            k=2,
            rerank_topn=4,
            generate_answer=True,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [202]
    assert response.answer_corpus_ids[0] == 202


def test_rag_service_returns_bundles_graph_signals_and_answer():
    service = _service(FakeRepository())
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
    assert len(response.evidence_bundles) == 2
    assert response.evidence_bundles[0].paper.corpus_id == 11
    assert response.evidence_bundles[0].paper.paper_id == "paper-11"
    assert response.evidence_bundles[0].rank_features["intent_affinity"] > 0
    assert response.evidence_bundles[0].entity_hits[0].concept_id == "MESH:D008874"
    assert response.evidence_bundles[0].relation_hits[0].relation_type == "treat"
    assert response.evidence_bundles[0].citation_contexts[0].neighbor_paper_id == "paper-22"
    assert all(bundle.paper.corpus_id != 33 for bundle in response.evidence_bundles)
    assert any(signal.signal_kind == "answer_support" for signal in response.graph_signals)
    assert [channel.channel for channel in response.retrieval_channels] == [
        "lexical",
        "chunk_lexical",
        "dense_query",
        "entity_match",
        "relation_match",
        "citation_context",
        "semantic_neighbor",
    ]
    dense_channel = next(
        channel for channel in response.retrieval_channels if channel.channel == "dense_query"
    )
    assert dense_channel.hits == []


def test_rag_service_marks_refute_intent_in_answer_and_graph_signals():
    service = _service(FakeRepository())
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert scope_corpus_ids == [11, 22]
            return super().search_papers(
                graph_run_id,
                query,
                limit=limit,
                scope_corpus_ids=scope_corpus_ids,
                use_title_similarity=use_title_similarity,
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
            assert corpus_ids in ([11, 22], [22])
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

    service = _service(SelectionScopeRepository())
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
            assert corpus_ids in ([11, 22], [22])
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

    service = _service(NoSelectionRepository())
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == "melatonin delirium"
            assert limit == 6
            assert scope_corpus_ids is None
            assert use_title_similarity is True
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

    service = _service(EmptyCandidateRepository())
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
        "chunk_lexical",
        "dense_query",
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
            use_title_similarity=True,
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

    service = _service(EntitySeedRepository())
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
            use_title_similarity=True,
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

    service = _service(RelationSeedRepository())
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
            use_title_similarity=True,
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

    service = _service(CitationSeedRepository())
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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query == "melatonin positive correlate delirium"
            assert limit == 6
            assert scope_corpus_ids is None
            assert use_title_similarity is True
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

        def search_chunk_papers(
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
            return []

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

        def fetch_citation_contexts(
            self, corpus_ids, *, query: str, limit_per_paper: int = 3
        ):
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

    service = _service(QueryEnrichmentRepository())
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


def test_rag_service_skips_auto_relation_seeding_for_long_passage_queries():
    query = (
        "This study aims to compare the prevalence of mental health symptoms between "
        "LBC and non-left-behind children and to explore the predictive effect of "
        "bullying victimization on adolescent mental health."
    )

    class LongPassageRelationRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=273920567,
                    paper_id="paper-273920567",
                    semantic_scholar_paper_id="paper-273920567",
                    title="Association between bullying victimization and mental health problems",
                    journal_name="Example Journal",
                    year=2024,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Mental health symptoms among left-behind children.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    chunk_lexical_score=0.9,
                    chunk_ordinal=0,
                    chunk_snippet="compare the prevalence of mental health symptoms",
                )
            ]

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            raise AssertionError("long passage queries should not auto-seed relation recall")

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

    service = _service(LongPassageRelationRepository())
    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            relation_terms=[],
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [273920567]


def test_rag_service_skips_runtime_entity_enrichment_without_entity_surface_signal():
    query = (
        "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
        "maturation and brain development in the rat"
    )

    class GenericTitleLikeRepository(FakeRepository):
        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            return None

        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            raise AssertionError("generic title-like queries should skip runtime entity enrichment")

        def search_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            return [
                PaperEvidenceHit(
                    corpus_id=24948876,
                    paper_id="paper-24948876",
                    semantic_scholar_paper_id="paper-24948876",
                    title=(
                        "EFFECTS OF PRENATAL ETHANOL EXPOSURE ON PHYSICAL GROWTH, "
                        "SENSORY REFLEX MATURATION AND BRAIN DEVELOPMENT IN THE RAT"
                    ),
                    journal_name="Example Journal",
                    year=1985,
                    doi=None,
                    pmid=None,
                    pmcid=None,
                    abstract="Prenatal ethanol exposure alters physical growth in the rat.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=True,
                    lexical_score=0.72,
                    title_similarity=0.61,
                )
            ]

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

    service = _service(GenericTitleLikeRepository())
    response = service.search(
        RagSearchRequest(
            graph_release_id="release-1",
            query=query,
            k=1,
            rerank_topn=4,
            generate_answer=False,
        )
    )

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [24948876]


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
            use_title_similarity=True,
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

    service = _service(QueryEnrichmentRepository())
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


def test_rag_service_uses_high_specificity_auto_enriched_name_terms_for_seeded_entity_recall():
    class QueryEnrichmentRepository(FakeRepository):
        def resolve_query_entity_terms(self, *, query_phrases, limit: int = 5) -> list[str]:
            lowered_phrases = [phrase.lower() for phrase in query_phrases]
            assert "decreased perk1/2 levels in" in lowered_phrases
            return ["pERK1/2"]

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
            use_title_similarity=True,
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
            assert entity_terms == ["pERK1/2"]
            assert limit == 6
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == ["pERK1/2"]
            return {}

    service = _service(QueryEnrichmentRepository())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query=(
            "This suggests decreased pERK1/2 levels in association with attenuated "
            "inhibitory avoidance performance."
        ),
        entity_terms=[],
        relation_terms=[],
        k=3,
        rerank_topn=6,
        generate_answer=False,
    )

    response = service.search(request)

    assert response.query.startswith("This suggests decreased pERK1/2")


def test_rag_service_can_attach_warehouse_grounded_answer_when_available():
    def fake_grounder(*, corpus_ids, segment_texts, segment_corpus_ids=None):
        assert corpus_ids == [11]
        assert segment_texts == [
            "Potentially supporting evidence:",
            (
                "Melatonin for delirium prevention (2024): Melatonin reduced "
                "delirium in selected cohorts."
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
        query_embedder=NoopQueryEmbedder(),
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


def test_rag_service_preserves_answer_corpus_ids_when_grounding_links_subset():
    def fake_grounder(*, corpus_ids, segment_texts, segment_corpus_ids=None):
        assert corpus_ids == [11, 22]
        assert segment_corpus_ids == [None, 11, 22]
        return build_grounded_answer_from_packets(
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

    service = RagService(
        repository=FakeRepository(),
        warehouse_grounder=fake_grounder,
        query_embedder=NoopQueryEmbedder(),
    )
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        entity_terms=["melatonin"],
        relation_terms=["treat"],
        evidence_intent="support",
        k=2,
        rerank_topn=6,
        generate_answer=True,
        selected_layer_key="paper",
        selected_node_id="seed-paper",
    )

    response = service.search(request)

    assert response.answer_corpus_ids == [11, 22]
    assert response.grounded_answer is not None
    assert response.grounded_answer.answer_linked_corpus_ids == [11]


def test_rag_service_preserves_dense_query_candidates_in_final_bundle_pool():
    class DenseOnlyRepository(FakeRepository):
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
            use_title_similarity=True,
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
            return []

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert query_embedding == [0.1, 0.2, 0.3]
            assert limit == 6
            assert scope_corpus_ids is None
            return [
                PaperEvidenceHit(
                    corpus_id=77,
                    paper_id="paper-77",
                    semantic_scholar_paper_id="paper-77",
                    title="Dense-query melatonin paper",
                    journal_name="Nature Medicine",
                    year=2024,
                    doi=None,
                    pmid=777,
                    pmcid=None,
                    abstract="Dense query candidate paper.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=8,
                    reference_count=12,
                    dense_score=0.94,
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
            assert corpus_ids == [77]
            assert query == "melatonin delirium"
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert corpus_ids == [77]
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert corpus_ids == [77]
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [77]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [77]
            return {}

    service = _service(DenseOnlyRepository(), query_embedder=FakeDenseQueryEmbedder())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query="melatonin delirium",
        evidence_intent="support",
        k=3,
        rerank_topn=6,
        generate_answer=False,
    )

    response = service.search(request)

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [77]
    assert response.evidence_bundles[0].rank_features["dense_query"] == 0.94
    dense_channel = next(
        channel for channel in response.retrieval_channels if channel.channel == "dense_query"
    )
    assert [hit.corpus_id for hit in dense_channel.hits] == [77]


def test_rag_service_skips_entity_resolution_for_passage_noise_without_resolution_anchors():
    class PassageNoiseRepository:
        _disable_session_jit = True

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
            raise AssertionError("entity term resolution should be skipped")

        def resolve_selected_corpus_id(
            self,
            *,
            graph_run_id: str,
            selected_graph_paper_ref: str | None,
            selected_paper_id: str | None,
            selected_node_id: str | None,
        ) -> int | None:
            assert graph_run_id == "run-1"
            return None

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
            use_title_similarity=True,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            assert limit == 6
            return []

        def search_exact_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_selected_title_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            selected_corpus_id: int,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def search_chunk_papers(
            self,
            graph_run_id: str,
            query: str,
            *,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            assert graph_run_id == "run-1"
            return [
                PaperEvidenceHit(
                    corpus_id=77,
                    paper_id="paper-77",
                    semantic_scholar_paper_id="paper-77",
                    title="Needle pressure study",
                    journal_name="Neurology",
                    year=2024,
                    doi=None,
                    pmid=777,
                    pmcid=None,
                    abstract="Passage candidate.",
                    tldr=None,
                    text_availability="abstract",
                    is_open_access=False,
                    citation_count=4,
                    reference_count=8,
                    chunk_lexical_score=0.91,
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
            raise AssertionError("entity recall should not run")

        def search_relation_papers(
            self,
            graph_run_id: str,
            *,
            relation_terms,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def fetch_papers_by_corpus_ids(self, graph_run_id: str, corpus_ids):
            return []

        def search_query_embedding_papers(
            self,
            *,
            graph_run_id: str,
            query_embedding,
            limit: int,
            scope_corpus_ids=None,
        ) -> list[PaperEvidenceHit]:
            return []

        def fetch_known_scoped_papers_by_corpus_ids(self, corpus_ids):
            return []

        def fetch_semantic_neighbors(
            self,
            *,
            graph_run_id: str,
            selected_corpus_id: int,
            limit: int = 6,
            scope_corpus_ids=None,
        ):
            return []

        def fetch_citation_contexts(self, corpus_ids, *, query: str, limit_per_paper: int = 3):
            assert corpus_ids == [77]
            return {}

        def fetch_entity_matches(self, corpus_ids, *, entity_terms, limit_per_paper: int = 5):
            assert entity_terms == []
            return {}

        def fetch_relation_matches(self, corpus_ids, *, relation_terms, limit_per_paper: int = 5):
            assert relation_terms == []
            return {}

        def fetch_references(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [77]
            return {}

        def fetch_assets(self, corpus_ids, *, limit_per_paper: int = 3):
            assert corpus_ids == [77]
            return {}

    service = _service(PassageNoiseRepository(), query_embedder=NoopQueryEmbedder())
    request = RagSearchRequest(
        graph_release_id="release-1",
        query=(
            "Mean injection pressure was greater in subepineurium compared with muscle, "
            "geometric ratio 2.29 (1.30 to 4.10), p<0.001; and greater on epineurium "
            "compared with muscle, geometric ratio 1.73 (1.03"
        ),
        k=3,
        rerank_topn=6,
        generate_answer=False,
    )

    response = service.search(request)

    assert [bundle.paper.corpus_id for bundle in response.evidence_bundles] == [77]
