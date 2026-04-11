from __future__ import annotations

import time
from types import SimpleNamespace

from app.langfuse_config import (
    SCORE_GROUNDED_ANSWER_RATE,
    SCORE_HIT_AT_1,
    SCORE_HIT_AT_K,
    SCORE_ROUTING_MATCH,
    SCORE_TARGET_IN_CORPUS,
)
from app.rag_ingest.langfuse_run_review import review_experiment_result


def _item_result(
    *,
    query_family: str,
    corpus_id: int,
    title: str,
    query: str,
    hit_at_1: float,
    hit_at_k: float,
    grounded_answer_rate: float,
    target_in_answer_corpus: float,
    routing_match: float | None,
    output: dict,
    trace_id: str = "trace-1",
):
    evaluations = [
        SimpleNamespace(name=SCORE_HIT_AT_1, value=hit_at_1),
        SimpleNamespace(name=SCORE_HIT_AT_K, value=hit_at_k),
        SimpleNamespace(name=SCORE_GROUNDED_ANSWER_RATE, value=grounded_answer_rate),
        SimpleNamespace(name=SCORE_TARGET_IN_CORPUS, value=target_in_answer_corpus),
    ]
    if routing_match is not None:
        evaluations.append(SimpleNamespace(name=SCORE_ROUTING_MATCH, value=routing_match))
    return SimpleNamespace(
        item=SimpleNamespace(
            input={"query_family": query_family, "query": query},
            expected_output={
                "corpus_id": corpus_id,
                "title": title,
                "normalized_title_key": title.casefold().replace(" ", "-"),
                "primary_source_system": "biocxml",
                "coverage_bucket": "covered",
                "warehouse_depth": "chunks_entities_sentence",
                "evaluation_partition": "optimize",
            },
        ),
        evaluations=evaluations,
        output=output,
        trace_id=trace_id,
    )


def test_review_experiment_result_groups_families_and_classifies_misses():
    result = SimpleNamespace(
        dataset_run_url="http://localhost/run",
        item_results=[
            _item_result(
                query_family="title_global",
                corpus_id=11,
                title="Paper 11",
                query="Paper 11",
                hit_at_1=0.0,
                hit_at_k=0.0,
                grounded_answer_rate=0.0,
                target_in_answer_corpus=0.0,
                routing_match=1.0,
                output={
                    "duration_ms": 120.0,
                    "retrieval_profile": "title_lookup",
                    "warehouse_depth": "none",
                    "route_signature": "sig-a",
                    "display_author_coverage": 0.0,
                    "display_journal_coverage": 0.0,
                    "display_year_coverage": 0.0,
                    "display_study_metadata_coverage": 0.0,
                    "top_corpus_ids": [1, 2, 3],
                    "hit_rank": None,
                    "target_signals": {"cited_context_score": 0.0},
                },
            ),
            _item_result(
                query_family="title_selected",
                corpus_id=22,
                title="Paper 22",
                query="Paper 22",
                hit_at_1=1.0,
                hit_at_k=1.0,
                grounded_answer_rate=1.0,
                target_in_answer_corpus=1.0,
                routing_match=1.0,
                output={
                    "duration_ms": 80.0,
                    "retrieval_profile": "title_lookup",
                    "warehouse_depth": "fulltext",
                    "route_signature": "sig-b",
                    "display_author_coverage": 1.0,
                    "display_journal_coverage": 1.0,
                    "display_year_coverage": 1.0,
                    "display_study_metadata_coverage": 1.0,
                    "top_corpus_ids": [22, 1, 2],
                    "hit_rank": 1,
                    "target_signals": {"lane_count": 2.0, "cited_context_score": 0.2},
                },
                trace_id="trace-2",
            ),
        ],
    )

    review = review_experiment_result(
        result,
        max_miss_examples=5,
        fetch_trace_urls=False,
    )

    assert review["cases"] == 2
    assert review["hit_at_1"] == 0.5
    assert review["target_cited_context_rate"] == 0.5
    assert review["display_author_coverage"] == 0.5
    assert review["display_journal_coverage"] == 0.5
    assert review["display_year_coverage"] == 0.5
    assert review["display_study_metadata_coverage"] == 0.5
    assert review["distinct_papers"] == 2
    assert review["distinct_corpus_ids"] == 2
    assert review["distinct_titles"] == 2
    assert review["distinct_title_keys"] == 2
    assert review["repeated_paper_cases"] == 0
    assert review["repeated_title_cases"] == 0
    assert review["max_cases_per_paper"] == 1
    assert review["max_cases_per_title"] == 1
    assert review["max_cases_per_corpus"] == 1
    assert review["max_cases_per_title_key"] == 1
    assert review["partition_bucket_count"] == 1
    assert review["focus_bucket_count"] == 2
    assert review["source_bucket_count"] == 1
    assert review["coverage_bucket_count"] == 1
    assert review["title_cases"] == 2
    assert review["title_hit_at_1"] == 0.5
    assert review["title_display_study_metadata_coverage"] == 0.5
    assert review["non_title_cases"] == 0
    assert review["non_title_hit_at_1"] == 0.0
    assert review["non_title_display_study_metadata_coverage"] == 0.0
    assert review["by_family"]["title_global"]["cases"] == 1
    assert review["by_focus"]["title_queries"]["cases"] == 2
    assert review["by_focus"]["non_title_queries"]["cases"] == 0
    assert review["by_partition"]["optimize"]["cases"] == 2
    assert review["by_source"]["biocxml"]["cases"] == 2
    assert review["by_coverage"]["covered"]["cases"] == 2
    assert review["by_family"]["title_global"]["miss_category_counts"] == {"no_target_signal": 1}
    assert review["by_family"]["title_selected"]["hit_at_1"] == 1.0
    assert review["by_family"]["title_selected"]["routing_match"] == 1.0
    assert review["miss_examples"][0]["query_family"] == "title_global"
    assert review["miss_examples"][0]["miss_category"] == "no_target_signal"
    assert review["slow_examples"][0]["corpus_id"] == 11


def test_review_experiment_result_scales_to_200_items_within_budget():
    """review_experiment_result must complete 200 items in under 200ms (no I/O, pure compute)."""
    query_families = ["title_global", "title_selected", "sentence_global", "unknown"]
    items = [
        _item_result(
            query_family=query_families[i % len(query_families)],
            corpus_id=100 + i,
            title=f"Paper {100 + i}",
            query=f"Query for paper {100 + i}",
            hit_at_1=float(i % 2),
            hit_at_k=float(i % 2),
            grounded_answer_rate=float(i % 2),
            target_in_answer_corpus=float(i % 2),
            routing_match=1.0 if i % 3 != 0 else None,
            output={
                "duration_ms": float(50 + (i % 500)),
                "retrieval_profile": "title_lookup" if i % 2 else "passage_lookup",
                "warehouse_depth": "fulltext" if i % 3 else "none",
                "route_signature": f"sig-{i % 10}",
                "display_author_coverage": 1.0 if i % 2 else 0.0,
                "display_journal_coverage": 1.0 if i % 3 else 0.0,
                "display_year_coverage": 1.0 if i % 5 else 0.0,
                "display_study_metadata_coverage": (
                    (1.0 if i % 2 else 0.0) + (1.0 if i % 3 else 0.0) + (1.0 if i % 5 else 0.0)
                )
                / 3.0,
                "top_corpus_ids": [100 + i, 101 + i, 102 + i] if i % 4 else [],
                "hit_rank": 1 if i % 2 else None,
                "target_signals": {
                    "lane_count": float(i % 3),
                    "cited_context_score": 0.2 if i % 5 == 0 else 0.0,
                },
                "error": None,
            },
            trace_id=f"trace-{i}",
        )
        for i in range(200)
    ]
    result = SimpleNamespace(dataset_run_url="http://localhost/run", item_results=items)

    start = time.perf_counter()
    review = review_experiment_result(result, max_miss_examples=10, fetch_trace_urls=False)
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert elapsed_ms < 200, (
        f"review_experiment_result took {elapsed_ms:.1f}ms for 200 items (budget: 200ms)"
    )
    assert review["cases"] == 200
    assert review["distinct_papers"] == 200
    assert len(review["by_family"]) == len(query_families)
    assert review["focus_bucket_count"] == 2
    assert review["title_cases"] == 100
    assert review["non_title_cases"] == 100
    assert review["display_study_metadata_coverage"] >= 0.0
    assert review["distinct_corpus_ids"] == 200
    assert len(review["miss_examples"]) <= 10
    assert len(review["slow_examples"]) <= 10


def test_review_experiment_result_can_filter_to_structure_complete_scope():
    result = SimpleNamespace(
        dataset_run_url="http://localhost/run",
        item_results=[
            _item_result(
                query_family="sentence_global",
                corpus_id=11,
                title="Paper 11",
                query="query 11",
                hit_at_1=1.0,
                hit_at_k=1.0,
                grounded_answer_rate=1.0,
                target_in_answer_corpus=1.0,
                routing_match=1.0,
                output={
                    "duration_ms": 100.0,
                    "retrieval_profile": "passage_lookup",
                    "warehouse_depth": "fulltext",
                    "route_signature": "sig-a",
                    "display_author_coverage": 1.0,
                    "display_journal_coverage": 1.0,
                    "display_year_coverage": 1.0,
                    "display_study_metadata_coverage": 1.0,
                    "top_corpus_ids": [11],
                    "hit_rank": 1,
                    "target_signals": {"lane_count": 2.0, "cited_context_score": 0.2},
                },
                trace_id="trace-11",
            ),
            _item_result(
                query_family="sentence_global",
                corpus_id=22,
                title="Paper 22",
                query="query 22",
                hit_at_1=0.0,
                hit_at_k=0.0,
                grounded_answer_rate=0.0,
                target_in_answer_corpus=0.0,
                routing_match=1.0,
                output={
                    "duration_ms": 150.0,
                    "retrieval_profile": "passage_lookup",
                    "warehouse_depth": "none",
                    "route_signature": "sig-b",
                    "display_author_coverage": 0.0,
                    "display_journal_coverage": 0.0,
                    "display_year_coverage": 0.0,
                    "display_study_metadata_coverage": 0.0,
                    "top_corpus_ids": [99],
                    "hit_rank": None,
                    "target_signals": {"lane_count": 0.0, "cited_context_score": 0.0},
                },
                trace_id="trace-22",
            ),
        ],
    )

    review = review_experiment_result(
        result,
        max_miss_examples=5,
        fetch_trace_urls=False,
        include_warehouse_depths={"chunks_entities_sentence"},
    )

    assert review["raw_cases"] == 2
    assert review["cases"] == 2
    assert review["excluded_cases"] == 0
    assert review["scope_filter"] == {
        "warehouse_depths": ["chunks_entities_sentence"]
    }
    assert review["hit_at_1"] == 0.5
    assert review["by_family"]["sentence_global"]["cases"] == 2
