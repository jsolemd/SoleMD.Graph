from __future__ import annotations

from app.rag_ingest.benchmark_case_metadata import (
    derive_benchmark_case_metadata,
    derive_benchmark_case_metadata_from_counts,
    load_live_benchmark_case_coverage,
)


def test_derive_benchmark_case_metadata_marks_covered_when_all_structural_signals_exist():
    metadata = derive_benchmark_case_metadata(
        "Paper Title",
        has_chunks=True,
        has_entities=True,
        has_sentence_seed=True,
    )

    assert metadata.normalized_title_key == "paper title"
    assert metadata.coverage_bucket == "covered"
    assert metadata.warehouse_depth == "chunks_entities_sentence"


def test_derive_benchmark_case_metadata_from_counts_marks_partial_without_sentence_seed():
    metadata = derive_benchmark_case_metadata_from_counts(
        "Paper Title",
        chunk_count=4,
        entity_mention_count=2,
        has_sentence_seed=False,
    )

    assert metadata.has_chunks is True
    assert metadata.has_entities is True
    assert metadata.has_sentence_seed is False
    assert metadata.coverage_bucket == "partial"
    assert metadata.warehouse_depth == "chunks_entities"


def test_derive_benchmark_case_metadata_allows_missing_title():
    metadata = derive_benchmark_case_metadata(
        None,
        has_chunks=False,
        has_entities=False,
        has_sentence_seed=False,
    )

    assert metadata.normalized_title_key is None
    assert metadata.coverage_bucket == "partial"
    assert metadata.warehouse_depth == "sparse"


def test_load_live_benchmark_case_coverage_maps_runtime_signals():
    row = {
        "corpus_id": 42,
        "title": "Test Paper",
        "primary_source_system": "biocxml",
        "text_availability": "fulltext",
        "has_abstract": True,
        "pmid": 12345678,
        "pmc_id": "PMC123456",
        "doi": "10.1000/example",
        "chunk_count": 3,
        "entity_mention_count": 7,
        "has_sentence_seed": True,
    }

    class _Cursor:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def execute(self, sql, params):
            self.sql = sql
            self.params = params

        def fetchall(self):
            return [row]

    class _Conn:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def cursor(self):
            return _Cursor()

    coverage = load_live_benchmark_case_coverage(
        corpus_ids=[42, 42],
        chunk_version_key="default-structural-v1",
        connect=lambda: _Conn(),
    )

    assert list(coverage) == [42]
    assert coverage[42].normalized_title_key == "test paper"
    assert coverage[42].primary_source_system == "biocxml"
    assert coverage[42].text_availability == "fulltext"
    assert coverage[42].has_abstract is True
    assert coverage[42].pmid == 12345678
    assert coverage[42].pmc_id == "PMC123456"
    assert coverage[42].doi == "10.1000/example"
    assert coverage[42].coverage_bucket == "covered"
    assert coverage[42].warehouse_depth == "chunks_entities_sentence"
