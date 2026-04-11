"""Audit benchmark case coverage against the live RAG warehouse."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from pydantic import Field

from app import db
from app.rag.parse_contract import ParseContractModel
from app.rag_ingest.benchmark_case_metadata import (
    derive_coverage_bucket,
    derive_warehouse_depth,
)
from app.rag_ingest.bioc_overlay_backfill import _resolve_candidates_from_manifest
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY


class BenchmarkCoverageCase(ParseContractModel):
    corpus_id: int
    query: str
    title: str
    benchmark_labels: list[str] = Field(default_factory=list)
    primary_source_system: str | None = None
    expected_retrieval_profile: str | None = None
    text_availability: str | None = None
    pmid: int | None = None
    pmc_id: str | None = None
    doi: str | None = None
    has_document: bool = False
    has_chunks: bool = False
    has_entities: bool = False
    has_sentences: bool = False
    chunk_count: int = 0
    entity_count: int = 0
    sentence_count: int = 0
    grounding_ready: bool = False
    structure_complete: bool = False
    warehouse_depth: str
    coverage_bucket: str
    archive_name: str | None = None
    archive_document_ordinal: int | None = None
    archive_document_id: str | None = None


class BenchmarkWarehouseAuditReport(ParseContractModel):
    benchmark_key: str
    graph_release_id: str | None = None
    graph_run_id: str | None = None
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY
    total_cases: int
    coverage_counts: dict[str, int] = Field(default_factory=dict)
    label_coverage_counts: dict[str, dict[str, int]] = Field(default_factory=dict)
    has_document_count: int = 0
    has_chunks_count: int = 0
    has_entities_count: int = 0
    has_sentences_count: int = 0
    grounding_ready_count: int = 0
    structure_complete_count: int = 0
    sparse_cases: list[BenchmarkCoverageCase] = Field(default_factory=list)
    covered_cases: list[BenchmarkCoverageCase] = Field(default_factory=list)
    entity_thin_cases: list[BenchmarkCoverageCase] = Field(default_factory=list)
    sparse_archive_counts: dict[str, int] = Field(default_factory=dict)
    sparse_manifest_resolved_count: int = 0


_AUDIT_SQL = """
WITH ids AS (
    SELECT unnest(%s::BIGINT[]) AS corpus_id
)
SELECT
    ids.corpus_id,
    p.title,
    p.text_availability,
    c.pmid,
    c.pmc_id,
    c.doi,
    EXISTS(
        SELECT 1
        FROM solemd.paper_documents pd
        WHERE pd.corpus_id = ids.corpus_id
    ) AS has_document,
    EXISTS(
        SELECT 1
        FROM solemd.paper_chunks pc
        WHERE pc.corpus_id = ids.corpus_id
          AND pc.chunk_version_key = %s
    ) AS has_chunks,
    EXISTS(
        SELECT 1
        FROM solemd.paper_entity_mentions em
        WHERE em.corpus_id = ids.corpus_id
    ) AS has_entities,
    EXISTS(
        SELECT 1
        FROM solemd.paper_sentences ps
        WHERE ps.corpus_id = ids.corpus_id
    ) AS has_sentences,
    COALESCE((
        SELECT COUNT(*)
        FROM solemd.paper_chunks pc
        WHERE pc.corpus_id = ids.corpus_id
          AND pc.chunk_version_key = %s
    ), 0)::INT AS chunk_count,
    COALESCE((
        SELECT COUNT(*)
        FROM solemd.paper_entity_mentions em
        WHERE em.corpus_id = ids.corpus_id
    ), 0)::INT AS entity_count,
    COALESCE((
        SELECT COUNT(*)
        FROM solemd.paper_sentences ps
        WHERE ps.corpus_id = ids.corpus_id
    ), 0)::INT AS sentence_count
FROM ids
LEFT JOIN solemd.papers p
  ON p.corpus_id = ids.corpus_id
LEFT JOIN solemd.corpus c
  ON c.corpus_id = ids.corpus_id
ORDER BY ids.corpus_id
"""


def _load_benchmark_cases(path: Path) -> tuple[dict[str, Any], dict[int, dict[str, Any]]]:
    payload = json.loads(path.read_text())
    cases = {
        int(case["corpus_id"]): case
        for case in payload.get("cases", [])
        if case.get("corpus_id") is not None
    }
    return payload, cases


def summarize_benchmark_coverage(
    *,
    benchmark_key: str,
    graph_release_id: str | None,
    graph_run_id: str | None,
    chunk_version_key: str,
    cases: list[BenchmarkCoverageCase],
) -> BenchmarkWarehouseAuditReport:
    coverage_counts = Counter(case.warehouse_depth for case in cases)
    label_counts: dict[str, Counter[str]] = defaultdict(Counter)
    sparse_archive_counts = Counter(
        case.archive_name for case in cases if case.warehouse_depth == "sparse" and case.archive_name
    )
    for case in cases:
        for label in case.benchmark_labels:
            label_counts[label][case.warehouse_depth] += 1

    sparse_cases = [case for case in cases if case.warehouse_depth == "sparse"]
    covered_cases = [case for case in cases if case.warehouse_depth != "sparse"]
    entity_thin_cases = [
        case
        for case in cases
        if case.grounding_ready and not case.structure_complete
    ]
    return BenchmarkWarehouseAuditReport(
        benchmark_key=benchmark_key,
        graph_release_id=graph_release_id,
        graph_run_id=graph_run_id,
        chunk_version_key=chunk_version_key,
        total_cases=len(cases),
        coverage_counts=dict(sorted(coverage_counts.items())),
        label_coverage_counts={
            label: dict(sorted(counts.items())) for label, counts in sorted(label_counts.items())
        },
        has_document_count=sum(1 for case in cases if case.has_document),
        has_chunks_count=sum(1 for case in cases if case.has_chunks),
        has_entities_count=sum(1 for case in cases if case.has_entities),
        has_sentences_count=sum(1 for case in cases if case.has_sentences),
        grounding_ready_count=sum(1 for case in cases if case.grounding_ready),
        structure_complete_count=sum(1 for case in cases if case.structure_complete),
        sparse_cases=sparse_cases,
        covered_cases=covered_cases,
        entity_thin_cases=entity_thin_cases,
        sparse_archive_counts=dict(sorted(sparse_archive_counts.items())),
        sparse_manifest_resolved_count=sum(1 for case in sparse_cases if case.archive_name),
    )


def audit_benchmark_warehouse_coverage(
    benchmark_path: Path,
    *,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect=None,
) -> BenchmarkWarehouseAuditReport:
    payload, case_payloads = _load_benchmark_cases(benchmark_path)
    corpus_ids = list(case_payloads)
    if not corpus_ids:
        raise ValueError(f"No benchmark cases found in {benchmark_path}")

    connect_fn = connect or db.connect
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(_AUDIT_SQL, (corpus_ids, chunk_version_key, chunk_version_key))
        rows = cur.fetchall()

    sparse_ids = [
        int(row["corpus_id"])
        for row in rows
        if not row["has_document"]
        and not row["has_chunks"]
        and not row["has_entities"]
        and not row["has_sentences"]
    ]
    manifest_candidates = _resolve_candidates_from_manifest(corpus_ids=sparse_ids)

    audited_cases: list[BenchmarkCoverageCase] = []
    for row in rows:
        corpus_id = int(row["corpus_id"])
        case_payload = case_payloads[corpus_id]
        warehouse_depth = derive_warehouse_depth(
            has_chunks=bool(row["has_chunks"]),
            has_entities=bool(row["has_entities"]),
            has_sentence_seed=bool(row["has_sentences"]),
        )
        grounding_ready = (
            bool(row["has_document"])
            and bool(row["has_chunks"])
            and bool(row["has_sentences"])
        )
        structure_complete = grounding_ready and bool(row["has_entities"])
        candidate = manifest_candidates.get(corpus_id)
        audited_cases.append(
            BenchmarkCoverageCase(
                corpus_id=corpus_id,
                query=str(case_payload.get("query") or ""),
                title=str(case_payload.get("title") or row.get("title") or ""),
                benchmark_labels=list(case_payload.get("benchmark_labels") or []),
                primary_source_system=case_payload.get("primary_source_system"),
                expected_retrieval_profile=case_payload.get("expected_retrieval_profile"),
                text_availability=row.get("text_availability"),
                pmid=int(row["pmid"]) if row.get("pmid") is not None else None,
                pmc_id=row.get("pmc_id"),
                doi=row.get("doi"),
                has_document=bool(row["has_document"]),
                has_chunks=bool(row["has_chunks"]),
                has_entities=bool(row["has_entities"]),
                has_sentences=bool(row["has_sentences"]),
                chunk_count=int(row["chunk_count"] or 0),
                entity_count=int(row["entity_count"] or 0),
                sentence_count=int(row["sentence_count"] or 0),
                grounding_ready=grounding_ready,
                structure_complete=structure_complete,
                warehouse_depth=warehouse_depth,
                coverage_bucket=derive_coverage_bucket(warehouse_depth=warehouse_depth),
                archive_name=candidate.archive_name if candidate else None,
                archive_document_ordinal=(
                    int(candidate.document_ordinal) if candidate and candidate.document_ordinal else None
                ),
                archive_document_id=candidate.document_id if candidate else None,
            )
        )

    return summarize_benchmark_coverage(
        benchmark_key=str(payload.get("benchmark_key") or benchmark_path.stem),
        graph_release_id=payload.get("graph_release_id"),
        graph_run_id=payload.get("graph_run_id"),
        chunk_version_key=chunk_version_key,
        cases=audited_cases,
    )
