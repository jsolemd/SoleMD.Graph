from __future__ import annotations

from app.rag_ingest.experiment import _build_request_from_item
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


def test_push_report_to_langfuse_uses_unique_ids_for_duplicate_corpus_ids(monkeypatch):
    class FakeClient:
        def __init__(self) -> None:
            self.item_ids: list[str] = []

        def create_dataset(self, **kwargs) -> None:
            return None

        def create_dataset_item(self, **kwargs) -> None:
            self.item_ids.append(kwargs["id"])

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
