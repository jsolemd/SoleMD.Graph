from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from app.rag.grounded_runtime import GroundedAnswerRuntimeStatus
from app.rag.types import EvidenceIntent
from app.rag_ingest import runtime_eval
from app.rag_ingest.runtime_eval_benchmarks import (
    build_biomedical_optimization_benchmark,
    build_dense_audit_sentence_hard_benchmark,
    load_runtime_eval_benchmark_cases,
)
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalCaseResult,
    RuntimeEvalPaperRecord,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
)


def _paper(corpus_id: int, *, title: str) -> RuntimeEvalPaperRecord:
    return RuntimeEvalPaperRecord(
        corpus_id=corpus_id,
        title=title,
        primary_source_system="s2orc_v2",
        section_count=4,
        table_block_count=0,
        narrative_block_count=8,
        chunk_count=8,
        avg_chunk_tokens=120.0,
        entity_mention_count=6,
        citation_mention_count=4,
        representative_section_role="discussion",
        representative_sentence=f"Representative sentence for {title}.",
    )


def test_build_dense_audit_sentence_hard_benchmark_selects_recurrent_failures(
    tmp_path: Path,
    monkeypatch,
):
    dense_audit_report = {
        "lane_reports": [
            {
                "lane_key": "specter2_stored_api",
                "failure_examples": [
                    {
                        "corpus_id": 11,
                        "query_family": "sentence_global",
                        "query": "Hard sentence query one",
                        "target_rank": 12,
                        "top_corpus_ids": [1, 2, 3],
                    },
                    {
                        "corpus_id": 22,
                        "query_family": "sentence_global",
                        "query": "Near miss sentence query two",
                        "target_rank": 3,
                        "top_corpus_ids": [4, 5, 6],
                    },
                ],
            },
            {
                "lane_key": "medcpt_dual_encoder",
                "failure_examples": [
                    {
                        "corpus_id": 11,
                        "query_family": "sentence_global",
                        "query": "Hard sentence query one",
                        "target_rank": 62,
                        "top_corpus_ids": [1, 2, 3],
                    },
                    {
                        "corpus_id": 33,
                        "query_family": "sentence_global",
                        "query": "Too easy sentence query three",
                        "target_rank": 2,
                        "top_corpus_ids": [7, 8, 9],
                    },
                ],
            },
        ],
        "rerank_reports": [
            {
                "lane_key": "specter2_stored_api+medcpt_cross_encoder",
                "failure_examples": [
                    {
                        "corpus_id": 11,
                        "query_family": "sentence_global",
                        "query": "Hard sentence query one",
                        "target_rank": 18,
                        "top_corpus_ids": [1, 2, 3],
                    },
                    {
                        "corpus_id": 22,
                        "query_family": "sentence_global",
                        "query": "Near miss sentence query two",
                        "target_rank": 5,
                        "top_corpus_ids": [4, 5, 6],
                    },
                ],
            }
        ],
    }
    report_path = tmp_path / "dense-audit.json"
    report_path.write_text(__import__("json").dumps(dense_audit_report))

    class FakeRepository:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def resolve_graph_release(self, graph_release_id: str):
            assert graph_release_id == "current"
            return SimpleNamespace(
                graph_release_id="current",
                graph_run_id="run-1",
                bundle_checksum="checksum",
                graph_name="Current Graph",
            )

    monkeypatch.setattr(
        "app.rag_ingest.runtime_eval_benchmarks.PostgresRagRepository",
        FakeRepository,
    )
    monkeypatch.setattr(
        "app.rag_ingest.runtime_eval_benchmarks.fetch_runtime_eval_population",
        lambda **kwargs: [
            _paper(11, title="Hard paper"),
            _paper(22, title="Near miss paper"),
            _paper(33, title="Easy paper"),
        ],
    )

    report = build_dense_audit_sentence_hard_benchmark(
        dense_audit_report_path=report_path,
        graph_release_id="current",
        max_cases=8,
        min_failure_count=2,
        min_max_rank=4,
        high_recurrence_count=3,
        deep_miss_rank=20,
        connect=lambda: None,
    )

    assert report.selected_count == 2
    assert [case.corpus_id for case in report.cases] == [11, 22]
    assert report.cases[0].query == "Hard sentence query one"
    assert report.cases[0].max_target_rank == 62
    assert "recurrent" in report.cases[0].benchmark_labels
    assert "deep_miss" in report.cases[0].benchmark_labels
    assert report.cases[1].query == "Near miss sentence query two"
    assert report.cases[1].max_target_rank == 5
    assert "rank_5_9" in report.cases[1].benchmark_labels
    assert report.deep_miss_rank == 20


def test_build_biomedical_optimization_benchmark_samples_only_covered_papers(
    monkeypatch,
):
    class FakeRepository:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def resolve_graph_release(self, graph_release_id: str):
            assert graph_release_id == "current"
            return SimpleNamespace(
                graph_release_id="current",
                graph_run_id="run-1",
                bundle_checksum="checksum",
                graph_name="Current Graph",
            )

    covered_paper = _paper(
        11,
        title="Covered biomedical benchmark paper",
    )
    covered_paper.primary_source_system = "biocxml"
    sparse_entity_paper = _paper(
        22,
        title="Sparse entity biomedical paper",
    )
    sparse_entity_paper.entity_mention_count = 0
    no_sentence_seed = _paper(
        33,
        title="No sentence seed biomedical paper",
    )
    no_sentence_seed.representative_sentence = None
    second_covered = _paper(
        44,
        title="Second covered biomedical paper",
    )

    monkeypatch.setattr(
        "app.rag_ingest.runtime_eval_benchmarks.PostgresRagRepository",
        FakeRepository,
    )
    monkeypatch.setattr(
        "app.rag_ingest.runtime_eval_benchmarks.fetch_runtime_eval_population",
        lambda **kwargs: [
            covered_paper,
            sparse_entity_paper,
            no_sentence_seed,
            second_covered,
        ],
    )

    report = build_biomedical_optimization_benchmark(
        graph_release_id="current",
        paper_sample_size=8,
        exclude_corpus_ids={44},
        connect=lambda: None,
    )

    assert report.selected_count == 3
    assert {case.corpus_id for case in report.cases} == {11}
    by_family = {case.query_family: case for case in report.cases}
    assert set(by_family) == {
        RuntimeEvalQueryFamily.TITLE_GLOBAL,
        RuntimeEvalQueryFamily.TITLE_SELECTED,
        RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
    }
    assert (
        by_family[RuntimeEvalQueryFamily.TITLE_GLOBAL].expected_retrieval_profile
        == "title_lookup"
    )
    assert by_family[RuntimeEvalQueryFamily.TITLE_SELECTED].selected_layer_key == "paper"
    assert by_family[RuntimeEvalQueryFamily.TITLE_SELECTED].selected_node_id == "paper:11"
    assert by_family[RuntimeEvalQueryFamily.SENTENCE_GLOBAL].expected_retrieval_profile is None
    assert (
        "biomedical_optimization"
        in by_family[RuntimeEvalQueryFamily.SENTENCE_GLOBAL].benchmark_labels
    )
    assert "has_entities" in by_family[RuntimeEvalQueryFamily.SENTENCE_GLOBAL].benchmark_labels


def test_load_runtime_eval_benchmark_cases_preserves_explicit_queries(tmp_path: Path):
    benchmark_report = RagRuntimeEvalBenchmarkReport(
        benchmark_key="sentence_hard_v1",
        graph_release_id="current",
        graph_run_id="run-1",
        bundle_checksum="checksum",
        graph_name="Current Graph",
        chunk_version_key="default-structural-v1",
        benchmark_source="/tmp/dense-audit.json",
        max_cases=24,
        min_failure_count=2,
        min_max_rank=4,
        high_recurrence_count=4,
        deep_miss_rank=20,
        selected_count=1,
        selected_by_label={"dense_audit_failure": 1},
        cases=[
            RuntimeEvalBenchmarkCase(
                corpus_id=11,
                title="Hard paper",
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query="Frozen benchmark query",
                stratum_key="benchmark:sentence_hard_v1|difficulty:rank_20_49|source:s2orc_v2",
                evidence_intent=EvidenceIntent.REFUTE,
                representative_section_role="discussion",
                selected_layer_key="paper",
                selected_node_id="paper:11",
                selection_graph_paper_refs=["paper:11"],
                benchmark_key="sentence_hard_v1",
                benchmark_labels=["dense_audit_failure", "deep_miss"],
                failure_count=3,
                min_target_rank=2,
                max_target_rank=22,
                mean_target_rank=10.0,
                source_lane_keys=["specter2_stored_api"],
            )
        ],
    )
    benchmark_path = tmp_path / "benchmark.json"
    benchmark_path.write_text(benchmark_report.model_dump_json(indent=2))

    loaded_report, cases = load_runtime_eval_benchmark_cases(benchmark_path)

    assert loaded_report.benchmark_key == "sentence_hard_v1"
    assert len(cases) == 1
    assert cases[0] == RuntimeEvalQueryCase(
        corpus_id=11,
        title="Hard paper",
        primary_source_system="s2orc_v2",
        query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        query="Frozen benchmark query",
        stratum_key="benchmark:sentence_hard_v1|difficulty:rank_20_49|source:s2orc_v2",
        evidence_intent=EvidenceIntent.REFUTE,
        benchmark_labels=["dense_audit_failure", "deep_miss"],
        representative_section_role="discussion",
        selected_layer_key="paper",
        selected_node_id="paper:11",
        selection_graph_paper_refs=["paper:11"],
    )


def test_checked_in_runtime_benchmarks_validate_and_load():
    benchmark_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_eval_benchmarks"
    benchmark_paths = sorted(benchmark_dir.glob("*.json"))

    assert benchmark_paths

    for benchmark_path in benchmark_paths:
        report = RagRuntimeEvalBenchmarkReport.model_validate_json(
            benchmark_path.read_text()
        )
        loaded_report, cases = load_runtime_eval_benchmark_cases(benchmark_path)

        assert loaded_report.benchmark_key == report.benchmark_key
        assert len(cases) == len(report.cases)


def test_run_rag_runtime_case_evaluation_uses_explicit_cases(monkeypatch):
    cases = [
        RuntimeEvalQueryCase(
            corpus_id=11,
            title="Hard paper",
            primary_source_system="s2orc_v2",
            query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            query="Frozen benchmark query",
            stratum_key="benchmark:sentence_hard_v1|difficulty:rank_20_49|source:s2orc_v2",
            representative_section_role="discussion",
        )
    ]

    class FakeRepository:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def resolve_graph_release(self, graph_release_id: str):
            assert graph_release_id == "current"
            return SimpleNamespace(
                graph_release_id="current",
                graph_run_id="run-1",
                bundle_checksum="checksum",
                graph_name="Current Graph",
            )

    class FakeService:
        query_embedder = None

        def warm(self) -> float:
            return 3.0

        def query_embedder_status(self) -> dict[str, object]:
            return {"enabled": False, "ready": True, "backend": "noop"}

    monkeypatch.setattr(runtime_eval, "PostgresRagRepository", FakeRepository)
    monkeypatch.setattr(
        runtime_eval,
        "fetch_runtime_eval_population",
        lambda **kwargs: [_paper(11, title="Hard paper")],
    )
    monkeypatch.setattr(
        runtime_eval,
        "inspect_rag_warehouse_quality",
        lambda **kwargs: SimpleNamespace(papers=[], flagged_corpus_ids=[]),
    )
    monkeypatch.setattr(
        runtime_eval,
        "get_grounded_answer_runtime_status",
        lambda **kwargs: GroundedAnswerRuntimeStatus(
            fully_covered=True,
            chunk_version_key="default-structural-v1",
            covered_corpus_ids=[11],
        ),
    )
    monkeypatch.setattr(runtime_eval, "_build_runtime_service", lambda **kwargs: FakeService())
    monkeypatch.setattr(
        runtime_eval,
        "evaluate_runtime_query_cases",
        lambda **kwargs: [
            RuntimeEvalCaseResult(
                corpus_id=11,
                title="Hard paper",
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query=kwargs["cases"][0].query,
                stratum_key=kwargs["cases"][0].stratum_key,
                hit_rank=1,
                answer_present=True,
                answer_corpus_ids=[11],
                target_in_answer_corpus=True,
                grounded_answer_present=True,
                grounded_answer_linked_corpus_ids=[11],
                target_in_grounded_answer=True,
                duration_ms=42.0,
                service_duration_ms=40.0,
                overhead_duration_ms=2.0,
            )
        ],
    )
    monkeypatch.setattr(
        runtime_eval,
        "attach_slow_case_plan_profiles",
        lambda **kwargs: kwargs["summary"],
    )

    report = runtime_eval.run_rag_runtime_case_evaluation(
        cases=cases,
        graph_release_id="current",
        connect=lambda: None,
    )

    assert report.population.requested_papers == 1
    assert report.population.sampled_papers == 1
    assert report.query_families == [RuntimeEvalQueryFamily.SENTENCE_GLOBAL]
    assert report.cases[0].query == "Frozen benchmark query"
    assert report.summary.overall.hit_at_1_rate == 1.0


def test_benchmark_paper_disjointness():
    """Verify no corpus_id appears in multiple benchmark files (overfit guard).

    Legacy benchmarks (sentence_hard_v1, clinical_actionable_v1, evidence_intent_v1) were
    built independently from the same graph corpus before the disjointness policy. Their
    overlaps are documented. New benchmarks (title_global, adversarial_router, neuropsych_safety,
    title_selected) MUST be disjoint from all others.
    """
    benchmark_dir = Path(__file__).resolve().parents[1] / "data" / "runtime_eval_benchmarks"
    benchmark_paths = sorted(benchmark_dir.glob("*.json"))
    assert benchmark_paths, "No benchmark files found"

    # Legacy benchmarks that predate the disjointness policy — overlap is documented.
    _LEGACY_OVERLAP_ALLOWED = frozenset({
        "sentence_hard_v1",
        "clinical_actionable_v1",
        "evidence_intent_v1",
    })
    _REPLACEMENT_OVERLAP_ALLOWED = frozenset({
        "biomedical_optimization_v2",
        "biomedical_optimization_v3",
    })

    corpus_to_benchmarks: dict[int, list[str]] = {}
    for path in benchmark_paths:
        report = RagRuntimeEvalBenchmarkReport.model_validate_json(path.read_text())
        report_keys = {case.corpus_id for case in report.cases}
        for corpus_id in report_keys:
            corpus_to_benchmarks.setdefault(corpus_id, []).append(report.benchmark_key)

    # Filter: only flag overlaps that involve at least one non-legacy benchmark
    violations = {}
    for cid, keys in corpus_to_benchmarks.items():
        if len(keys) <= 1:
            continue
        key_set = set(keys)
        if key_set <= _LEGACY_OVERLAP_ALLOWED:
            continue  # All-legacy overlap is documented, not a violation
        if key_set <= _REPLACEMENT_OVERLAP_ALLOWED:
            continue  # v3 intentionally supersedes the invalid v2 benchmark
        violations[cid] = keys

    assert not violations, (
        f"Paper-disjointness violated: {len(violations)} corpus_ids appear in multiple benchmarks "
        f"(including non-legacy): "
        + ", ".join(
            f"{cid} in [{', '.join(keys)}]" for cid, keys in sorted(violations.items())
        )
    )
