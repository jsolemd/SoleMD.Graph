from __future__ import annotations

import json
from contextlib import nullcontext

from app.rag_ingest.experiment import (
    _build_request_from_item,
    _make_task_function,
    structural_evaluator,
)
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalQueryFamily,
)
from scripts.prepare_rag_curated_benchmarks import (
    _load_existing_corpus_ids,
    _push_report_to_langfuse,
)


def test_build_request_from_item_preserves_selected_context():
    request = _build_request_from_item(
        {
            "query": "Melatonin and delirium",
            "selected_layer_key": "paper",
            "selected_node_id": "paper:11",
            "selection_graph_paper_refs": ["paper:11"],
            "evidence_intent": None,
        },
        graph_release_id="current",
        k=5,
        rerank_topn=10,
        use_lexical=True,
        use_dense_query=False,
    )

    assert request.selected_layer_key == "paper"
    assert request.selected_node_id == "paper:11"
    assert request.selection_graph_paper_refs == ["paper:11"]
    assert request.use_lexical is True
    assert request.use_dense_query is False


def test_build_request_from_item_preserves_cited_context():
    request = _build_request_from_item(
        {
            "query": "Does the cited study support melatonin use?",
            "cited_corpus_ids": [11, 22],
        },
        graph_release_id="current",
        k=5,
        rerank_topn=10,
        use_lexical=True,
        use_dense_query=False,
    )

    assert request.cited_corpus_ids == [11, 22]


def test_make_task_function_warms_service_once(monkeypatch):
    class FakeService:
        def __init__(self) -> None:
            self.warm_calls = 0

        def warm(self) -> float:
            self.warm_calls += 1
            return 1.0

    fake_service = FakeService()
    monkeypatch.setattr(
        "app.rag_ingest.experiment.build_runtime_service",
        lambda **kwargs: fake_service,
    )
    monkeypatch.setattr(
        "langfuse.propagate_attributes",
        lambda **kwargs: nullcontext(),
    )

    _make_task_function(
        graph_release_id="current",
        chunk_version_key="default-structural-v1",
        k=5,
        rerank_topn=10,
        use_lexical=True,
        use_dense_query=True,
    )

    assert fake_service.warm_calls == 1


def test_structural_evaluator_emits_display_metadata_scores():
    evaluations = structural_evaluator(
        input={"query": "Melatonin delirium"},
        output={
            "hit_rank": 1,
            "grounded_answer_present": True,
            "target_in_grounded_answer": True,
            "target_in_answer_corpus": True,
            "duration_ms": 42.0,
            "evidence_bundle_count": 3,
            "display_author_coverage": 1.0,
            "display_journal_coverage": 0.667,
            "display_year_coverage": 1.0,
            "display_study_metadata_coverage": 0.889,
        },
        expected_output={"corpus_id": 11},
    )

    score_map = {evaluation.name: evaluation.value for evaluation in evaluations}
    assert score_map["display_author_coverage"] == 1.0
    assert score_map["display_journal_coverage"] == 0.667
    assert score_map["display_year_coverage"] == 1.0
    assert score_map["display_study_metadata_coverage"] == 0.889


def test_push_report_to_langfuse_uses_unique_ids_for_duplicate_corpus_ids(monkeypatch):
    class FakeDatasetItemsApi:
        def __init__(self) -> None:
            self.deleted_ids: list[str] = []
            self.existing_items = [
                type("DatasetItem", (), {"id": "biomedical_optimization_v3:stale:title_global"})()
            ]

        def list(self, *, dataset_name: str, page: int, limit: int):
            assert dataset_name == "benchmark-biomedical_optimization_v3"
            assert limit == 100
            if page > 1:
                return []
            return type("Page", (), {"data": list(self.existing_items)})()

        def delete(self, *, id: str) -> None:
            self.deleted_ids.append(id)

    class FakeClient:
        def __init__(self) -> None:
            self.created_dataset_kwargs: dict[str, object] | None = None
            self.item_ids: list[str] = []
            self.item_metadatas: list[dict[str, object]] = []
            self.item_inputs: list[dict[str, object]] = []
            self.item_expected_outputs: list[dict[str, object]] = []
            self.api = type("Api", (), {"dataset_items": FakeDatasetItemsApi()})()

        def create_dataset(self, **kwargs) -> None:
            self.created_dataset_kwargs = kwargs

        def create_dataset_item(self, **kwargs) -> None:
            self.item_ids.append(kwargs["id"])
            self.item_metadatas.append(kwargs["metadata"])
            self.item_inputs.append(kwargs["input"])
            self.item_expected_outputs.append(kwargs["expected_output"])

        def flush(self) -> None:
            return None

    client = FakeClient()
    monkeypatch.setattr("app.langfuse_config.get_langfuse", lambda: client)

    report = RagRuntimeEvalBenchmarkReport(
        benchmark_key="biomedical_optimization_v3",
        graph_release_id="current",
        graph_run_id="run-1",
        bundle_checksum="checksum",
        graph_name="Current Graph",
        chunk_version_key="default-structural-v1",
        benchmark_source="unit test",
        max_cases=6,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=3,
        cases=[
            RuntimeEvalBenchmarkCase(
                corpus_id=11,
                title="Paper 11",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query="Paper 11",
                stratum_key="benchmark:biomedical_optimization_v3|family:title_global|biocxml",
                benchmark_key="biomedical_optimization_v3",
                benchmark_labels=["biomedical_optimization"],
            ),
            RuntimeEvalBenchmarkCase(
                corpus_id=11,
                title="Paper 11",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.TITLE_SELECTED,
                query="Paper 11",
                stratum_key="benchmark:biomedical_optimization_v3|family:title_selected|biocxml",
                selected_layer_key="paper",
                selected_node_id="paper:11",
                benchmark_key="biomedical_optimization_v3",
                benchmark_labels=["biomedical_optimization"],
            ),
            RuntimeEvalBenchmarkCase(
                corpus_id=11,
                title="Paper 11",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                query="Representative sentence for Paper 11.",
                stratum_key="benchmark:biomedical_optimization_v3|family:sentence_global|biocxml",
                cited_corpus_ids=[11],
                benchmark_key="biomedical_optimization_v3",
                benchmark_labels=["biomedical_optimization"],
            ),
        ],
    )

    assert _push_report_to_langfuse(report) is True
    assert len(client.item_ids) == 3
    assert len(set(client.item_ids)) == 3
    assert set(client.item_ids) == {
        "biomedical_optimization_v3:11:title_global",
        "biomedical_optimization_v3:11:title_selected",
        "biomedical_optimization_v3:11:sentence_global",
    }
    assert client.item_metadatas
    assert set(client.item_metadatas[0]) == {
        "qf",
        "src",
        "cov",
        "wd",
        "part",
    }
    assert client.created_dataset_kwargs is not None
    dataset_metadata = client.created_dataset_kwargs["metadata"]
    assert dataset_metadata["benchmark_key"] == "biomedical_optimization_v3"
    assert dataset_metadata["selected_count"] == 3
    assert dataset_metadata["target_case_count"] == 297
    assert dataset_metadata["suite_family"] == "optimization"
    assert dataset_metadata["gate_mode"] == "required"
    assert "quality_gate_lower_bounds" in dataset_metadata
    assert "quality_gate_upper_bounds" in dataset_metadata
    assert client.item_expected_outputs
    assert client.item_expected_outputs[0]["benchmark_key"] == "biomedical_optimization_v3"
    assert client.item_expected_outputs[0]["benchmark_labels"] == ["biomedical_optimization"]
    assert "stratum_key" in client.item_expected_outputs[0]
    assert client.item_expected_outputs[0]["title"] == "Paper 11"
    assert any(item_input.get("cited_corpus_ids") == [11] for item_input in client.item_inputs)
    assert len(json.dumps(client.item_metadatas[0], sort_keys=True)) < 200
    assert client.api.dataset_items.deleted_ids == ["biomedical_optimization_v3:stale:title_global"]


def test_load_existing_corpus_ids_skips_rebuilt_suite(tmp_path):
    report = RagRuntimeEvalBenchmarkReport(
        benchmark_key="biomedical_optimization_v3",
        graph_release_id="current",
        graph_run_id="run-1",
        bundle_checksum="checksum",
        graph_name="Current Graph",
        chunk_version_key="default-structural-v1",
        benchmark_source="unit test",
        max_cases=3,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=1,
        cases=[
            RuntimeEvalBenchmarkCase(
                corpus_id=11,
                title="Paper 11",
                primary_source_system="biocxml",
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query="Paper 11",
                stratum_key="benchmark:biomedical_optimization_v3|family:title_global|biocxml",
                benchmark_key="biomedical_optimization_v3",
                benchmark_labels=["biomedical_optimization"],
            )
        ],
    )
    snapshot_path = tmp_path / "biomedical_optimization_v3.json"
    snapshot_path.write_text(report.model_dump_json(indent=2))

    assert _load_existing_corpus_ids(tmp_path) == {11}
    assert (
        _load_existing_corpus_ids(
            tmp_path,
            exclude_benchmark_keys={"biomedical_optimization_v3"},
        )
        == set()
    )


def test_push_report_to_langfuse_skips_empty_reports(monkeypatch):
    monkeypatch.setattr(
        "app.langfuse_config.get_langfuse",
        lambda: (_ for _ in ()).throw(AssertionError("should not construct client")),
    )

    report = RagRuntimeEvalBenchmarkReport(
        benchmark_key="biomedical_holdout_v1",
        graph_release_id="current",
        graph_run_id="run-1",
        bundle_checksum="checksum",
        graph_name="Current Graph",
        chunk_version_key="default-structural-v1",
        benchmark_source="unit test",
        max_cases=1,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=0,
        cases=[],
    )

    assert _push_report_to_langfuse(report) is False
