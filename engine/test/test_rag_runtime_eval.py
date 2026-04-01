from __future__ import annotations

from app.rag_ingest.runtime_eval import (
    RuntimeEvalCaseResult,
    RuntimeEvalPaperRecord,
    RuntimeEvalQueryFamily,
    _aggregate_case_results,
    _build_runtime_eval_request,
    build_runtime_eval_query_cases,
    evaluate_runtime_query_cases,
    runtime_eval_stratum_key,
    select_stratified_sample,
    summarize_runtime_results,
)


def _paper(
    corpus_id: int,
    *,
    source: str,
    title: str,
    chunk_count: int,
    table_block_count: int,
    sentence: str | None = None,
):
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


def test_runtime_eval_stratum_key_uses_structural_profiles():
    paper = _paper(
        1,
        source="s2orc_v2",
        title="Alpha",
        chunk_count=18,
        table_block_count=4,
    )

    assert runtime_eval_stratum_key(paper) == "s2orc_v2|table_heavy|long"


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
    assert summary.overall.p95_duration_ms == 155.0
    assert summary.overall.mean_service_duration_ms == 92.5
    assert summary.overall.p95_service_duration_ms == 145.0
    assert summary.overall.mean_overhead_duration_ms == 7.5
    assert summary.failure_theme_counts["sentence_global:target_miss"] == 1
    assert summary.failure_theme_counts["sentence_global:answer_missing_target"] == 1
    assert summary.failure_theme_counts["sentence_global:ungrounded_answer"] == 1
    assert len(summary.failure_examples) == 1


def test_build_runtime_eval_request_propagates_retrieval_toggles():
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
        query_families=[RuntimeEvalQueryFamily.TITLE_SELECTED],
    )[0]

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
    assert aggregate.p95_duration_ms == 321.0


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
