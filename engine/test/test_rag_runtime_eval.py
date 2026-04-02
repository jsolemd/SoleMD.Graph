from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.rag.types import EvidenceIntent
from app.rag_ingest.runtime_eval import (
    RuntimeEvalCaseResult,
    _aggregate_case_results,
    _build_runtime_eval_request,
    build_runtime_eval_query_cases,
    evaluate_runtime_query_cases,
    summarize_runtime_results,
)
from app.rag_ingest.runtime_eval_execution import attach_slow_case_plan_profiles
from app.rag_ingest.runtime_eval_models import (
    RuntimeEvalCohortCandidate,
    RuntimeEvalPaperRecord,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
)
from app.rag_ingest.runtime_eval_population import (
    fetch_runtime_eval_population,
    population_summary,
    runtime_eval_cohort_stratum_key,
    runtime_eval_stratum_key,
    select_runtime_eval_cohort_sample,
    select_stratified_sample,
)


def _paper(
    corpus_id: int,
    *,
    source: str,
    title: str,
    chunk_count: int,
    table_block_count: int,
    sentence: str | None = None,
) -> RuntimeEvalPaperRecord:
    return RuntimeEvalPaperRecord(
        corpus_id=corpus_id,
        title=title,
        primary_source_system=source,
        section_count=4,
        table_block_count=table_block_count,
        narrative_block_count=8,
        chunk_count=chunk_count,
        avg_chunk_tokens=120.0,
        entity_mention_count=6,
        citation_mention_count=4,
        representative_section_role="discussion",
        representative_sentence=sentence,
    )


def _candidate(
    corpus_id: int,
    *,
    citation_bucket: str,
    bioc_profile: str,
    text_profile: str,
) -> RuntimeEvalCohortCandidate:
    return RuntimeEvalCohortCandidate(
        corpus_id=corpus_id,
        title=f"Paper {corpus_id}",
        paper_id=f"S2-{corpus_id}",
        citation_count=24,
        reference_count=10,
        text_availability="fulltext" if text_profile == "fulltext" else "abstract",
        pmid=corpus_id,
        pmc_id=f"PMC{corpus_id}" if bioc_profile == "pmc_present" else None,
        doi=None,
        missing_document=True,
        citation_bucket=citation_bucket,
        bioc_profile=bioc_profile,
        text_profile=text_profile,
        stratum_key=f"{bioc_profile}|{text_profile}|{citation_bucket}",
        stratum_population_count=2,
        candidate_population_size=4,
    )


def test_runtime_eval_stratum_key_uses_structural_profiles():
    paper = _paper(
        1,
        source="s2orc_v2",
        title="Alpha",
        chunk_count=18,
        table_block_count=4,
    )

    assert (
        runtime_eval_stratum_key(paper)
        == "s2orc_v2|table_heavy|long|entity_present|citation_sparse|sentence_unseeded"
    )


def test_select_stratified_sample_round_robins_across_strata():
    papers = [
        _paper(1, source="s2orc_v2", title="A", chunk_count=20, table_block_count=0),
        _paper(2, source="s2orc_v2", title="B", chunk_count=20, table_block_count=0),
        _paper(3, source="biocxml", title="C", chunk_count=2, table_block_count=0),
        _paper(4, source="biocxml", title="D", chunk_count=2, table_block_count=0),
    ]

    sample = select_stratified_sample(papers, sample_size=2, seed=13)

    assert len(sample) == 2
    assert {paper.primary_source_system for paper in sample} == {"s2orc_v2", "biocxml"}


def test_runtime_eval_cohort_stratum_key_uses_candidate_stratum():
    candidate = _candidate(
        11,
        citation_bucket="citations_20_99",
        bioc_profile="pmc_present",
        text_profile="fulltext",
    )

    assert (
        runtime_eval_cohort_stratum_key(candidate)
        == "pmc_present|fulltext|citations_20_99"
    )


def test_select_runtime_eval_cohort_sample_round_robins_across_candidate_strata():
    candidates = [
        _candidate(
            1,
            citation_bucket="citations_20_99",
            bioc_profile="pmc_present",
            text_profile="fulltext",
        ),
        _candidate(
            2,
            citation_bucket="citations_20_99",
            bioc_profile="pmc_present",
            text_profile="fulltext",
        ),
        _candidate(
            3,
            citation_bucket="citations_5_19",
            bioc_profile="pmid_only",
            text_profile="abstract",
        ),
        _candidate(
            4,
            citation_bucket="citations_5_19",
            bioc_profile="pmid_only",
            text_profile="abstract",
        ),
    ]

    sample = select_runtime_eval_cohort_sample(candidates, sample_size=2, seed=13)

    assert len(sample) == 2
    assert {candidate.stratum_key for candidate in sample} == {
        "pmc_present|fulltext|citations_20_99",
        "pmid_only|abstract|citations_5_19",
    }


def test_fetch_runtime_eval_population_pushes_corpus_filter_into_sql():
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.fetchall.return_value = [
        {
            "corpus_id": 111,
            "title": "Filtered paper",
            "primary_source_system": "s2orc_v2",
            "section_count": 1,
            "table_block_count": 0,
            "narrative_block_count": 1,
            "chunk_count": 1,
            "avg_chunk_tokens": 42.0,
            "entity_mention_count": 0,
            "citation_mention_count": 0,
            "representative_section_role": "abstract",
            "representative_sentence": "Filtered paper sentence for evaluation.",
        }
    ]

    rows = fetch_runtime_eval_population(
        graph_run_id="graph-run-id",
        chunk_version_key="default-structural-v1",
        corpus_ids=[111, 222, 111],
        connect=lambda: conn,
    )

    assert [row.corpus_id for row in rows] == [111]
    execute_args = cur.execute.call_args.args
    assert execute_args[1][0] == "graph-run-id"
    assert execute_args[1][1] == [111, 222]
    assert execute_args[1][2] == [111, 222]
    assert execute_args[1][3] == "default-structural-v1"


def test_build_runtime_eval_query_cases_skips_missing_sentence_seed():
    with_sentence = _paper(
        1,
        source="s2orc_v2",
        title="Evidence title",
        chunk_count=8,
        table_block_count=0,
        sentence="This is a representative discussion sentence that is long enough to use.",
    )
    without_sentence = _paper(
        2,
        source="biocxml",
        title="Another title",
        chunk_count=3,
        table_block_count=0,
        sentence=None,
    )

    cases = build_runtime_eval_query_cases([with_sentence, without_sentence])

    by_family = {(case.corpus_id, case.query_family) for case in cases}
    assert (1, RuntimeEvalQueryFamily.TITLE_GLOBAL) in by_family
    assert (1, RuntimeEvalQueryFamily.TITLE_SELECTED) in by_family
    assert (1, RuntimeEvalQueryFamily.SENTENCE_GLOBAL) in by_family
    assert (2, RuntimeEvalQueryFamily.TITLE_GLOBAL) in by_family
    assert (2, RuntimeEvalQueryFamily.TITLE_SELECTED) in by_family
    assert (2, RuntimeEvalQueryFamily.SENTENCE_GLOBAL) not in by_family


@dataclass
class _FakeBundlePaper:
    corpus_id: int
    title: str


@dataclass
class _FakeBundle:
    paper: _FakeBundlePaper
    rank: int
    score: float
    matched_channels: list[str]
    match_reasons: list[str] = field(default_factory=list)
    rank_features: dict[str, float] = field(default_factory=dict)


@dataclass
class _FakeRetrievalChannel:
    channel: str
    hits: list[int]


class _FakeService:
    def __init__(self) -> None:
        self.requests = []

    def search(self, request):
        self.requests.append(request)
        return SimpleNamespace(
            evidence_bundles=[
                _FakeBundle(
                    paper=_FakeBundlePaper(corpus_id=1, title="Evidence title"),
                    rank=1,
                    score=1.0,
                    matched_channels=["lexical"],
                    match_reasons=["Matched title/abstract query terms"],
                    rank_features={"lexical": 1.0},
                )
            ],
            answer="Answer text",
            answer_corpus_ids=[1],
            grounded_answer=None,
            retrieval_channels=[_FakeRetrievalChannel(channel="lexical", hits=[1])],
            meta=SimpleNamespace(duration_ms=25.0),
        )


def test_evaluate_runtime_query_cases_warms_service_before_measuring():
    service = _FakeService()
    cases = build_runtime_eval_query_cases(
        [
            _paper(
                1,
                source="s2orc_v2",
                title="Evidence title",
                chunk_count=8,
                table_block_count=0,
                sentence=(
                    "This is a representative discussion sentence that is long enough "
                    "to use."
                ),
            )
        ]
    )

    cases = [
        case.model_copy(
            update={
                "evidence_intent": EvidenceIntent.SUPPORT,
                "benchmark_labels": ["frozen_benchmark", "support"],
            }
        )
        for case in cases
    ]

    results = evaluate_runtime_query_cases(
        graph_release_id="current",
        chunk_version_key="default-structural-v1",
        cases=cases[:1],
        service=service,
    )

    assert len(results) == 1
    assert len(service.requests) == 2
    assert service.requests[0].query == service.requests[1].query
    assert service.requests[1].evidence_intent == EvidenceIntent.SUPPORT
    assert results[0].benchmark_labels == ["frozen_benchmark", "support"]
    assert results[0].top_hits[0].match_reasons == ["Matched title/abstract query terms"]
    assert results[0].top_hits[0].rank_features == {"lexical": 1.0}


def test_summarize_runtime_results_counts_failures_and_rates():
    results = [
        RuntimeEvalCaseResult(
            corpus_id=1,
            title="Paper one",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
            query="Paper one",
            stratum_key="s2orc_v2|table_absent|medium",
            evidence_bundle_count=5,
            top_corpus_ids=[1, 2],
            hit_rank=1,
            answer_present=True,
            answer_corpus_ids=[1],
            target_in_answer_corpus=True,
            grounded_answer_present=True,
            grounded_answer_linked_corpus_ids=[1],
            target_in_grounded_answer=True,
            cited_span_count=2,
            inline_citation_count=2,
            answer_segment_count=1,
            retrieval_channel_hit_counts={"lexical": 5, "semantic_neighbor": 0},
            stage_durations_ms={
                "resolve_graph_release": 3.0,
                "fetch_semantic_neighbors": 18.0,
            },
            candidate_counts={"semantic_neighbor_hits": 2, "top_hits": 2},
            session_flags={
                "retrieval_profile": "title_lookup",
                "paper_search_route": "paper_search_global",
                "paper_search_use_title_similarity": True,
                "paper_search_use_title_candidate_lookup": True,
                "session_jit_disabled": True,
            },
            duration_ms=45.0,
            service_duration_ms=40.0,
            overhead_duration_ms=5.0,
        ),
        RuntimeEvalCaseResult(
            corpus_id=2,
            title="Paper two",
            primary_source_system="biocxml",
            query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            query="Representative evidence sentence",
            stratum_key="biocxml|table_absent|short",
            evidence_bundle_count=2,
            top_corpus_ids=[9, 10],
            hit_rank=None,
            answer_present=True,
            answer_corpus_ids=[9],
            target_in_answer_corpus=False,
            grounded_answer_present=False,
            grounded_answer_linked_corpus_ids=[],
            target_in_grounded_answer=False,
            cited_span_count=0,
            inline_citation_count=0,
            answer_segment_count=0,
            retrieval_channel_hit_counts={"lexical": 2, "semantic_neighbor": 1},
            stage_durations_ms={
                "resolve_graph_release": 4.0,
                "fetch_semantic_neighbors": 110.0,
                "ground_answer": 22.0,
            },
            candidate_counts={"semantic_neighbor_hits": 7, "top_hits": 2},
            session_flags={
                "retrieval_profile": "passage_lookup",
                "chunk_search_route": "chunk_search_global",
                "dense_query_route": "dense_query_ann_broad_scope",
                "session_jit_disabled": True,
            },
            duration_ms=155.0,
            service_duration_ms=145.0,
            overhead_duration_ms=10.0,
        ),
    ]

    summary = summarize_runtime_results(results, failure_example_limit=5)

    assert summary.overall.cases == 2
    assert summary.overall.hit_at_1_rate == 0.5
    assert summary.overall.hit_at_k_rate == 0.5
    assert summary.overall.grounded_answer_rate == 0.5
    assert summary.overall.target_in_answer_corpus_rate == 0.5
    assert summary.overall.mean_duration_ms == 100.0
    assert summary.overall.p50_duration_ms == 45.0
    assert summary.overall.p95_duration_ms == 155.0
    assert summary.overall.p99_duration_ms == 155.0
    assert summary.overall.max_duration_ms == 155.0
    assert summary.overall.mean_service_duration_ms == 92.5
    assert summary.overall.p50_service_duration_ms == 40.0
    assert summary.overall.p95_service_duration_ms == 145.0
    assert summary.overall.p99_service_duration_ms == 145.0
    assert summary.overall.max_service_duration_ms == 145.0
    assert summary.overall.mean_overhead_duration_ms == 7.5
    assert summary.overall.over_1000ms_count == 0
    assert summary.failure_theme_counts["sentence_global:target_miss"] == 1
    assert summary.failure_theme_counts["sentence_global:answer_missing_target"] == 1
    assert summary.failure_theme_counts["sentence_global:ungrounded_answer"] == 1
    assert summary.by_stratum_key["s2orc_v2|table_absent|medium"].cases == 1
    assert summary.by_stratum_key["biocxml|table_absent|short"].cases == 1
    assert len(summary.failure_examples) == 1
    assert summary.latency.stage_profiles_ms["fetch_semantic_neighbors"].cases == 2
    assert summary.latency.stage_profiles_ms["fetch_semantic_neighbors"].max == 110.0
    assert summary.latency.candidate_profiles["semantic_neighbor_hits"].p95 == 7.0
    assert (
        summary.latency.route_profiles_ms[
            "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global|dense_query_route=dense_query_ann_broad_scope"
        ].max
        == 145.0
    )
    assert summary.latency.slow_cases[0].corpus_id == 2
    assert summary.latency.slow_cases[0].top_stages[0].stage == "fetch_semantic_neighbors"
    expected_route = (
        "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global|"
        "dense_query_route=dense_query_ann_broad_scope"
    )
    assert summary.latency.slow_route_counts == {
        expected_route: 1,
        (
            "retrieval_profile=title_lookup|paper_search_route=paper_search_global|"
            "paper_search_use_title_similarity=True|"
            "paper_search_use_title_candidate_lookup=True"
        ): 1,
    }
    assert summary.latency.slow_stage_hotspots[0].stage == "fetch_semantic_neighbors"
    assert summary.latency.slow_stage_hotspots[0].dominant_cases == 2
    assert summary.latency.slow_cases[0].route_signature == expected_route
    assert summary.latency.slow_cases[0].session_flags["session_jit_disabled"] is True


def test_build_runtime_eval_request_propagates_retrieval_toggles():
    case = RuntimeEvalQueryCase(
        corpus_id=11,
        title="Melatonin and delirium",
        primary_source_system="s2orc_v2",
        query_family=RuntimeEvalQueryFamily.TITLE_SELECTED,
        query="Melatonin and delirium",
        stratum_key="benchmark:polarity_conflict_v1|intent:support|theme:treatment|source:s2orc_v2",
        evidence_intent=EvidenceIntent.SUPPORT,
        selected_layer_key="paper",
        selected_node_id="paper:11",
    )

    request = _build_runtime_eval_request(
        graph_release_id="current",
        case=case,
        k=5,
        rerank_topn=10,
        use_lexical=False,
        use_dense_query=True,
    )

    assert request.graph_release_id == "current"
    assert request.query == "Melatonin and delirium"
    assert request.selected_layer_key == "paper"
    assert request.selected_node_id == "paper:11"
    assert request.use_lexical is False
    assert request.use_dense_query is True
    assert request.evidence_intent == EvidenceIntent.SUPPORT


def test_summarize_runtime_results_flags_intent_target_not_top():
    summary = summarize_runtime_results(
        [
            RuntimeEvalCaseResult(
                corpus_id=7,
                title="Null trial",
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query="Does treatment X improve outcome Y?",
                stratum_key=(
                    "benchmark:conflict_polarity_v1|intent:refute|theme:treatment|"
                    "source:s2orc_v2"
                ),
                evidence_intent=EvidenceIntent.REFUTE,
                benchmark_labels=["conflict_polarity", "refute"],
                top_corpus_ids=[99, 7],
                hit_rank=2,
                answer_present=True,
                answer_corpus_ids=[99],
                target_in_answer_corpus=False,
                grounded_answer_present=True,
                grounded_answer_linked_corpus_ids=[99],
                target_in_grounded_answer=False,
                service_duration_ms=80.0,
                duration_ms=85.0,
                overhead_duration_ms=5.0,
            )
        ]
    )

    assert summary.failure_theme_counts["sentence_global:intent_target_not_top"] == 1
    assert summary.failure_examples[0].evidence_intent == EvidenceIntent.REFUTE
    assert summary.failure_examples[0].benchmark_labels == [
        "conflict_polarity",
        "refute",
    ]


def test_aggregate_case_results_preserves_error_durations():
    aggregate = _aggregate_case_results(
        [
            RuntimeEvalCaseResult(
                corpus_id=1,
                title="Paper one",
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query="Paper one",
                stratum_key="s2orc_v2|table_absent|medium",
                duration_ms=321.0,
                error="boom",
            )
        ]
    )

    assert aggregate.error_count == 1
    assert aggregate.mean_duration_ms == 321.0
    assert aggregate.p50_duration_ms == 321.0
    assert aggregate.p95_duration_ms == 321.0
    assert aggregate.p99_duration_ms == 321.0
    assert aggregate.max_duration_ms == 321.0


def test_evaluate_runtime_query_cases_records_service_and_overhead_durations():
    case = build_runtime_eval_query_cases(
        [
            _paper(
                11,
                source="s2orc_v2",
                title="Melatonin and delirium",
                chunk_count=8,
                table_block_count=0,
            )
        ],
        query_families=[RuntimeEvalQueryFamily.TITLE_GLOBAL],
    )[0]

    class FakeResponse:
        class Meta:
            duration_ms = 120.0

        meta = Meta()
        answer = "answer"
        answer_corpus_ids = [11]
        grounded_answer = None
        retrieval_channels = []
        evidence_bundles = []

    class FakeService:
        def search(self, request):
            assert request.query == "Melatonin and delirium"
            return FakeResponse()

    [result] = evaluate_runtime_query_cases(
        graph_release_id="release-1",
        chunk_version_key="default-structural-v1",
        cases=[case],
        service=FakeService(),
    )

    assert result.duration_ms >= 0.0
    assert result.service_duration_ms == 120.0
    assert result.overhead_duration_ms >= 0.0


def test_aggregate_case_results_counts_slow_service_thresholds():
    aggregate = _aggregate_case_results(
        [
            RuntimeEvalCaseResult(
                corpus_id=1,
                title="Paper one",
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query="Paper one",
                stratum_key="s2orc_v2|table_absent|medium",
                duration_ms=1200.0,
                service_duration_ms=1200.0,
            ),
            RuntimeEvalCaseResult(
                corpus_id=2,
                title="Paper two",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query="Paper two",
                stratum_key="biocxml|table_absent|short",
                duration_ms=6000.0,
                service_duration_ms=6000.0,
            ),
            RuntimeEvalCaseResult(
                corpus_id=3,
                title="Paper three",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query="Paper three",
                stratum_key="biocxml|table_absent|short",
                duration_ms=31000.0,
                service_duration_ms=31000.0,
            ),
        ]
    )

    assert aggregate.over_1000ms_count == 3
    assert aggregate.over_5000ms_count == 2
    assert aggregate.over_30000ms_count == 1


def test_summarize_runtime_results_collects_compact_latency_profiles():
    results = [
        RuntimeEvalCaseResult(
            corpus_id=11,
            title="Fast paper",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
            query="Fast paper",
            stratum_key="s2orc_v2|table_absent|medium",
            stage_durations_ms={
                "resolve_graph_release": 2.0,
                "fetch_semantic_neighbors": 11.0,
            },
            candidate_counts={"semantic_neighbor_hits": 4, "top_hits": 3},
            session_flags={
                "session_jit_disabled": True,
                "dense_scope": "graph",
                "retrieval_profile": "title_lookup",
                "paper_search_route": "paper_search_global",
            },
            service_duration_ms=40.0,
            duration_ms=43.0,
            overhead_duration_ms=3.0,
        ),
        RuntimeEvalCaseResult(
            corpus_id=22,
            title="Slow paper",
            primary_source_system="biocxml",
            query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            query="Slow paper sentence",
            stratum_key="biocxml|table_absent|short",
            stage_durations_ms={
                "resolve_graph_release": 3.0,
                "fetch_semantic_neighbors": 125.0,
                "ground_answer": 48.0,
            },
            candidate_counts={"semantic_neighbor_hits": 17, "top_hits": 5},
            session_flags={
                "session_jit_disabled": True,
                "dense_scope": "graph",
                "retrieval_profile": "passage_lookup",
                "chunk_search_route": "chunk_search_global",
            },
            service_duration_ms=190.0,
            duration_ms=205.0,
            overhead_duration_ms=15.0,
        ),
    ]

    summary = summarize_runtime_results(results)

    assert summary.latency.stage_profiles_ms["fetch_semantic_neighbors"].cases == 2
    assert summary.latency.stage_profiles_ms["fetch_semantic_neighbors"].mean == 68.0
    assert summary.latency.stage_profiles_ms["ground_answer"].cases == 1
    assert summary.latency.candidate_profiles["semantic_neighbor_hits"].max == 17.0
    assert (
        summary.latency.route_profiles_ms[
            "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global"
        ].max
        == 190.0
    )
    assert len(summary.latency.slow_cases) == 2
    assert summary.latency.slow_cases[0].corpus_id == 22
    assert (
        summary.latency.slow_cases[0].route_signature
        == "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global"
    )
    assert summary.latency.slow_route_counts == {
        "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global": 1,
        "retrieval_profile=title_lookup|paper_search_route=paper_search_global": 1,
    }
    assert summary.latency.slow_stage_hotspots[0].stage == "fetch_semantic_neighbors"
    assert summary.latency.slow_stage_hotspots[0].cases == 2
    assert summary.latency.slow_stage_hotspots[0].dominant_cases == 2
    assert summary.latency.slow_cases[0].candidate_counts == {
        "semantic_neighbor_hits": 17,
        "top_hits": 5,
    }
    assert summary.latency.slow_cases[0].top_stages[0].stage == "fetch_semantic_neighbors"


def test_attach_slow_case_plan_profiles_adds_planner_metadata():
    results = [
        RuntimeEvalCaseResult(
            corpus_id=22,
            title="Slow title-like paper",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
            query="Slow title-like paper",
            stratum_key="s2orc_v2|table_absent|medium",
            stage_durations_ms={"search_papers": 180.0, "build_grounded_answer": 20.0},
            session_flags={
                "retrieval_profile": "title_lookup",
                "paper_search_route": "paper_search_global",
                "paper_search_query_text": "Slow title-like paper",
                "paper_search_use_title_similarity": True,
            },
            service_duration_ms=190.0,
            duration_ms=205.0,
            overhead_duration_ms=15.0,
        )
    ]
    summary = summarize_runtime_results(results)
    cases = [
        RuntimeEvalQueryCase(
            corpus_id=22,
            title="Slow title-like paper",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
            query="Slow title-like paper",
            stratum_key="s2orc_v2|table_absent|medium",
        )
    ]
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.fetchone.return_value = {
        "QUERY PLAN": [
            {
                "Plan": {
                    "Node Type": "Bitmap Heap Scan",
                    "Index Name": "idx_papers_title_abstract_fts",
                    "Plans": [],
                }
            }
        ]
    }

    class FakeRepository:
        def _connect(self):
            return conn

        def _configure_search_session(self, cur):
            return None

        def _should_use_exact_graph_search(self, graph_run_id: str) -> bool:
            assert graph_run_id == "run-1"
            return False

        def _paper_search_sql_spec(
            self,
            *,
            graph_run_id: str,
            query: str,
            normalized_title_query: str,
            limit: int,
            scope_corpus_ids,
            use_title_similarity: bool,
            use_exact_graph_search: bool,
        ):
            assert graph_run_id == "run-1"
            assert query == "Slow title-like paper"
            assert normalized_title_query == "slow title like paper"
            assert limit == 10
            assert scope_corpus_ids is None
            assert use_title_similarity is True
            assert use_exact_graph_search is False
            return SimpleNamespace(
                route_name="paper_search_global",
                sql="SELECT 1",
                params=("Slow title-like paper",),
            )

    updated = attach_slow_case_plan_profiles(
        summary=summary,
        cases=cases,
        results=results,
        repository=FakeRepository(),
        graph_run_id="run-1",
        rerank_topn=10,
    )

    assert updated.latency.slow_cases[0].plan_profiles[0].stage == "search_papers"
    assert updated.latency.slow_cases[0].plan_profiles[0].route == "paper_search_global"
    assert updated.latency.slow_cases[0].plan_profiles[0].sql_fingerprint
    assert updated.latency.slow_cases[0].plan_profiles[0].node_types == ["Bitmap Heap Scan"]
    assert updated.latency.slow_cases[0].plan_profiles[0].index_names == [
        "idx_papers_title_abstract_fts"
    ]


def test_attach_slow_case_plan_profiles_can_profile_dense_query_stage():
    results = [
        RuntimeEvalCaseResult(
            corpus_id=33,
            title="Dense case",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            query="dense sentence query",
            stratum_key="s2orc_v2|table_absent|medium",
            stage_durations_ms={
                "search_query_embedding_papers": 220.0,
                "build_grounded_answer": 20.0,
            },
            session_flags={
                "retrieval_profile": "passage_lookup",
                "dense_query_route": "dense_query_ann_broad_scope",
            },
            service_duration_ms=245.0,
            duration_ms=250.0,
            overhead_duration_ms=5.0,
        )
    ]
    summary = summarize_runtime_results(results)
    cases = [
        RuntimeEvalQueryCase(
            corpus_id=33,
            title="Dense case",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            query="dense sentence query",
            stratum_key="s2orc_v2|table_absent|medium",
        )
    ]
    conn = MagicMock()
    cur = MagicMock()
    conn.__enter__.return_value = conn
    conn.__exit__.return_value = False
    conn.cursor.return_value.__enter__.return_value = cur
    conn.cursor.return_value.__exit__.return_value = False
    cur.fetchone.return_value = {
        "QUERY PLAN": [
            {
                "Plan": {
                    "Node Type": "Index Scan",
                    "Index Name": "idx_papers_embedding_hnsw",
                    "Plans": [],
                }
            }
        ]
    }

    class FakeRepository:
        def _connect(self):
            return conn

        def _configure_search_session(self, cur):
            return None

        def _dense_query_sql_spec(
            self,
            *,
            graph_run_id: str,
            vector_literal: str,
            limit: int,
            scope_corpus_ids,
        ):
            assert graph_run_id == "run-1"
            assert vector_literal == "[0.1,0.2,0.3]"
            assert limit == 10
            assert scope_corpus_ids is None
            return SimpleNamespace(
                route_name="dense_query_ann_broad_scope",
                sql="SELECT 1",
                params=("[0.1,0.2,0.3]",),
            )

    class FakeQueryEmbedder:
        def encode(self, text: str) -> list[float]:
            assert text == "dense sentence query"
            return [0.1, 0.2, 0.3]

    updated = attach_slow_case_plan_profiles(
        summary=summary,
        cases=cases,
        results=results,
        repository=FakeRepository(),
        graph_run_id="run-1",
        rerank_topn=10,
        query_embedder=FakeQueryEmbedder(),
    )

    assert updated.latency.slow_cases[0].plan_profiles[0].stage == "search_query_embedding_papers"
    assert updated.latency.slow_cases[0].plan_profiles[0].route == "dense_query_ann_broad_scope"
    assert updated.latency.slow_cases[0].plan_profiles[0].sql_fingerprint
    assert updated.latency.slow_cases[0].plan_profiles[0].node_types == ["Index Scan"]
    assert updated.latency.slow_cases[0].plan_profiles[0].index_names == [
        "idx_papers_embedding_hnsw"
    ]


def test_population_summary_tracks_sentence_seed_presence():
    population = [
        _paper(
            1,
            source="s2orc_v2",
            title="A",
            chunk_count=8,
            table_block_count=0,
            sentence="Representative evaluation sentence for paper A.",
        ),
        _paper(
            2,
            source="biocxml",
            title="B",
            chunk_count=8,
            table_block_count=1,
            sentence=None,
        ),
    ]

    summary = population_summary(population=population, sample=population)

    assert summary.population_papers == 2
    assert summary.sampled_papers == 2
    assert summary.sentence_seed_papers == 1
    assert summary.sampled_by_source_system == {"biocxml": 1, "s2orc_v2": 1}


def test_population_summary_tracks_missing_requested_ids():
    sample = [
        _paper(
            1,
            source="s2orc_v2",
            title="A",
            chunk_count=8,
            table_block_count=0,
            sentence="Representative evaluation sentence for paper A.",
        )
    ]

    summary = population_summary(
        population=sample,
        sample=sample,
        requested_ids=[1, 2],
        missing_requested_ids=[2],
    )

    assert summary.requested_papers == 2
    assert summary.missing_requested_corpus_ids == [2]
