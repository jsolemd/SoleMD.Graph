from app.rag_ingest.benchmark_warehouse_audit import (
    BenchmarkCoverageCase,
    summarize_benchmark_coverage,
)


def test_summarize_benchmark_coverage_counts_sparse_and_covered() -> None:
    report = summarize_benchmark_coverage(
        benchmark_key="benchmark-x",
        graph_release_id="release-x",
        graph_run_id="run-x",
        chunk_version_key="default-structural-v1",
        cases=[
            BenchmarkCoverageCase(
                corpus_id=1,
                query="q1",
                title="t1",
                benchmark_labels=["expert_canonicalization", "bucket_a"],
                warehouse_depth="covered",
                coverage_bucket="covered",
                has_document=True,
                has_chunks=True,
                has_entities=True,
                has_sentences=True,
                chunk_count=3,
                entity_count=5,
                sentence_count=7,
                grounding_ready=True,
                structure_complete=True,
            ),
            BenchmarkCoverageCase(
                corpus_id=2,
                query="q2",
                title="t2",
                benchmark_labels=["expert_canonicalization", "bucket_b"],
                warehouse_depth="sparse",
                coverage_bucket="partial",
                has_document=False,
                has_chunks=False,
                has_entities=False,
                has_sentences=False,
                archive_name="BioCXML.1.tar.gz",
                grounding_ready=False,
                structure_complete=False,
            ),
            BenchmarkCoverageCase(
                corpus_id=3,
                query="q3",
                title="t3",
                benchmark_labels=["expert_canonicalization", "bucket_c"],
                warehouse_depth="chunks_only",
                coverage_bucket="partial",
                has_document=True,
                has_chunks=True,
                has_entities=False,
                has_sentences=True,
                chunk_count=2,
                entity_count=0,
                sentence_count=4,
                grounding_ready=True,
                structure_complete=False,
            ),
        ],
    )

    assert report.total_cases == 3
    assert report.coverage_counts == {
        "chunks_only": 1,
        "covered": 1,
        "sparse": 1,
    }
    assert report.has_document_count == 2
    assert report.has_chunks_count == 2
    assert report.has_entities_count == 1
    assert report.has_sentences_count == 2
    assert report.grounding_ready_count == 2
    assert report.structure_complete_count == 1
    assert report.sparse_manifest_resolved_count == 1
    assert report.sparse_archive_counts == {"BioCXML.1.tar.gz": 1}
    assert len(report.covered_cases) == 2
    assert len(report.sparse_cases) == 1
    assert [case.corpus_id for case in report.entity_thin_cases] == [3]
