"""Prepare curated frozen benchmarks for title, adversarial, and neuropsych suites.

Queries papers from the live graph to resolve corpus_ids and populate benchmark
fixtures. Each suite is paper-disjoint from the others and from the existing
sentence_hard_v1, clinical_actionable_v1, and evidence_intent_v1 benchmarks.

Usage:
    cd engine && uv run python -m scripts.prepare_rag_curated_benchmarks \
        --graph-release-id current \
        --output-dir data/runtime_eval_benchmarks
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

from app import db
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_benchmarks import load_runtime_eval_benchmark_cases
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalQueryFamily,
)

BENCHMARK_DIR = Path(__file__).resolve().parents[1] / "data" / "runtime_eval_benchmarks"

# ---------------------------------------------------------------------------
# Curated query seed definitions
# ---------------------------------------------------------------------------
# Each entry: (query, query_family, evidence_intent, labels, title_pattern)
# title_pattern is a trigram/FTS search pattern used to find the target paper.

TITLE_GLOBAL_SEEDS: list[dict[str, object]] = [
    {
        "title_search": "colon subtitle pattern",
        "query_family": "title_global",
        "labels": ["title_global", "colon_subtitle"],
        "description": "Title with colon-subtitle structure",
    },
    {
        "title_search": "question mark title",
        "query_family": "title_global",
        "labels": ["title_global", "question_title"],
        "description": "Title ending with question mark",
    },
    {
        "title_search": "abbreviation heavy",
        "query_family": "title_global",
        "labels": ["title_global", "abbreviation_heavy"],
        "description": "Title dense with abbreviations",
    },
    {
        "title_search": "greek letter",
        "query_family": "title_global",
        "labels": ["title_global", "greek_letter"],
        "description": "Title containing Greek letter symbols",
    },
]

TITLE_SELECTED_SEEDS: list[dict[str, object]] = [
    {
        "title_search": "selected context",
        "query_family": "title_selected",
        "labels": ["title_selected"],
        "description": "Title lookup with pre-selected paper context",
    },
]

ADVERSARIAL_ROUTER_SEEDS: list[dict[str, object]] = [
    {
        "query": "NMS vs SS differential",
        "search_terms": "neuroleptic malignant syndrome serotonin",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "abbreviation_heavy"],
        "description": "Abbreviation-heavy: neuroleptic malignant syndrome vs serotonin syndrome",
    },
    {
        "query": "treatments that failed to show benefit in TRD",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "negated_query"],
        "description": "Negated formulation targeting treatment-resistant depression",
    },
    {
        "query": "lithium CKD bipolar",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse"],
        "description": "Multi-entity terse query",
    },
    {
        "query": "delirium psychosis",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "ambiguous_differential"],
        "description": "Ambiguous differential without explicit question structure",
    },
    {
        "query": "p<0.001 mortality reduction",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "statistical_fragment"],
        "description": "Statistical fragment that may confuse query router",
    },
    {
        "query": "APOE e4 Alzheimer's risk",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "gene_symbol"],
        "description": "Gene symbol query that may be misrouted as title",
    },
    {
        "query": "SSRI SIADH elderly",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "abbreviation_heavy", "clinical_safety"],
        "description": "Abbreviation cluster in clinical safety context",
    },
    {
        "query": "catatonia NOT caused by psychosis",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "negated_query"],
        "description": "Explicit NOT negation in differential diagnosis",
    },
    {
        "query": "EEG findings autoimmune encephalitis vs viral",
        "search_terms": "autoimmune encephalitis EEG",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse"],
        "description": "Multi-entity differential with diagnostic modality",
    },
    {
        "query": "Positive predictive value amyloid PET",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "statistical_fragment"],
        "description": "Statistical concept + diagnostic test",
    },
    {
        "query": "clozapine agranulocytosis monitoring",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse", "clinical_safety"],
        "description": "Drug-adverse-effect-procedure triple",
    },
    {
        "query": "antipsychotics QTc prolongation torsades",
        "query_family": "sentence_global",
        "labels": ["adversarial_router", "multi_entity_terse", "clinical_safety"],
        "description": "Drug class + ECG finding + arrhythmia cascade",
    },
]

NEUROPSYCH_SAFETY_SEEDS: list[dict[str, object]] = [
    {
        "query": "How is delirium differentiated from primary psychosis in hospitalized patients?",
        "search_terms": "delirium psychosis differential",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "delirium"],
        "description": "Delirium vs primary psychosis differential",
    },
    {
        "query": "What is the recommended workup for suspected catatonia in a psychiatric inpatient?",
        "search_terms": "catatonia workup psychiatric",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "workup", "catatonia"],
        "description": "Catatonia workup protocol",
    },
    {
        "query": "What are the risks and monitoring requirements for lithium use in patients with CKD stage 3?",
        "search_terms": "lithium kidney chronic renal",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "lithium_renal"],
        "description": "Lithium with renal comorbidity",
    },
    {
        "query": "How common is SSRI-induced hyponatremia in elderly patients and what are the risk factors?",
        "search_terms": "hyponatremia SSRI elderly",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "ssri_hyponatremia"],
        "description": "SSRI SIADH in elderly",
    },
    {
        "query": "What clinical features differentiate neuroleptic malignant syndrome from serotonin syndrome?",
        "search_terms": "serotonin syndrome neuroleptic malignant",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "nms_vs_ss"],
        "description": "NMS vs serotonin syndrome differential",
    },
    {
        "query": "What is the current evidence for autoimmune encephalitis presenting as first-episode psychosis?",
        "search_terms": "autoimmune encephalitis psychosis",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "differential_diagnosis", "autoimmune_encephalitis"],
        "description": "Autoimmune encephalitis mimicking psychosis",
    },
    {
        "query": "What are effective pharmacological approaches for behavioral and psychological symptoms of dementia?",
        "search_terms": "dementia behavioral symptoms pharmacological",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "treatment", "dementia_behavioral"],
        "description": "Dementia behavioral symptom management",
    },
    {
        "query": "What is the safety profile of psychotropic medications during pregnancy and lactation?",
        "search_terms": "psychotropic pregnancy lactation",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "pregnancy_psychopharm"],
        "description": "Pregnancy/lactation psychopharmacology",
    },
    {
        "query": "What are the neuropsychiatric manifestations of anti-NMDA receptor encephalitis?",
        "search_terms": "NMDA receptor encephalitis neuropsychiatric",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "clinical_presentation", "anti_nmdar"],
        "description": "Anti-NMDAR encephalitis neuropsych features",
    },
    {
        "query": "What is the evidence for ECT in treatment-resistant catatonia?",
        "search_terms": "electroconvulsive catatonia treatment",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "treatment", "ect_catatonia"],
        "description": "ECT for treatment-resistant catatonia",
    },
    {
        "query": "What medication adjustments are needed for psychotropics in patients with hepatic encephalopathy?",
        "search_terms": "hepatic encephalopathy psychotropic",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "drug_safety", "hepatic_encephalopathy"],
        "description": "Psychotropic dosing in hepatic encephalopathy",
    },
    {
        "query": "What is the role of benzodiazepines versus lorazepam challenge in diagnosing catatonia?",
        "search_terms": "lorazepam catatonia diagnosis",
        "query_family": "sentence_global",
        "labels": ["neuropsych_safety", "diagnosis", "catatonia_lorazepam"],
        "description": "Lorazepam challenge for catatonia diagnosis",
    },
]


def _load_existing_corpus_ids(benchmark_dir: Path) -> set[int]:
    """Load all corpus_ids from checked-in benchmarks to ensure disjointness."""
    existing: set[int] = set()
    for path in sorted(benchmark_dir.glob("*.json")):
        try:
            _report, cases = load_runtime_eval_benchmark_cases(path)
            existing.update(case.corpus_id for case in cases)
        except Exception:
            continue
    return existing


_TITLE_EDGE_CASE_SQL = """
SELECT p.corpus_id, p.title
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND length(p.title) > 20
  AND {title_filter}
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 3
"""

_TITLE_FILTERS = {
    "colon_subtitle": "p.title LIKE '%%: %%'",
    "question_title": "p.title LIKE '%%?%%'",
    "abbreviation_heavy": (
        "length(p.title) - length(regexp_replace(p.title, '[A-Z]{2,}', '', 'g')) >= 6"
    ),
    "greek_letter": (
        "p.title ~ '[\u03b1\u03b2\u03b3\u03b4\u03b5\u03b6\u03b7\u03b8\u03ba\u03bb\u03bc]'"
    ),
    "long_title": "length(p.title) > 120",
    "short_title": "length(p.title) < 50 AND length(p.title) > 20",
}


def _fetch_title_edge_cases(
    *,
    repository,
    graph_run_id: str,
    exclude_corpus_ids: set[int],
    cursor,
    max_per_type: int = 2,
    total_target: int = 12,
) -> list[dict[str, object]]:
    """Fetch diverse title edge cases from the graph."""
    results: list[dict[str, object]] = []
    seen_corpus_ids: set[int] = set(exclude_corpus_ids)

    for filter_name, filter_sql in _TITLE_FILTERS.items():
        sql = _TITLE_EDGE_CASE_SQL.format(title_filter=filter_sql)
        cursor.execute(sql, (graph_run_id, list(seen_corpus_ids)))
        rows = cursor.fetchall()
        for row in rows[:max_per_type]:
            corpus_id = int(row["corpus_id"])
            if corpus_id in seen_corpus_ids:
                continue
            seen_corpus_ids.add(corpus_id)
            results.append(
                {
                    "corpus_id": corpus_id,
                    "title": row["title"],
                    "primary_source_system": "s2orc_v2",
                    "filter_type": filter_name,
                }
            )
            if len(results) >= total_target:
                return results

    return results


_PAPER_FOR_QUERY_WAREHOUSE_SQL = """
SELECT p.corpus_id, p.title
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
JOIN solemd.paper_documents pd ON pd.corpus_id = p.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND (
    to_tsvector('english', p.title || ' ' || COALESCE(p.abstract, ''))
    @@ websearch_to_tsquery('english', %s)
  )
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 1
"""

_PAPER_FOR_QUERY_ANY_SQL = """
SELECT p.corpus_id, p.title
FROM solemd.graph_points grp
JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
WHERE grp.graph_run_id = %s
  AND p.corpus_id != ALL(%s::BIGINT[])
  AND p.title IS NOT NULL
  AND (
    to_tsvector('english', p.title || ' ' || COALESCE(p.abstract, ''))
    @@ websearch_to_tsquery('english', %s)
  )
ORDER BY p.citation_count DESC NULLS LAST
LIMIT 1
"""


def _resolve_paper_for_query(
    *,
    cursor,
    graph_run_id: str,
    query: str,
    exclude_corpus_ids: set[int],
    require_warehouse: bool = False,
) -> dict[str, object] | None:
    """Find the best-matching paper for a curated query.

    Prefers papers with warehouse coverage (structural parsing). Falls back to
    any graph paper if require_warehouse is False and no warehouse paper matches.
    Uses websearch_to_tsquery for flexible multi-term matching.
    """
    # Try warehouse-covered papers first
    cursor.execute(
        _PAPER_FOR_QUERY_WAREHOUSE_SQL,
        (graph_run_id, list(exclude_corpus_ids), query),
    )
    row = cursor.fetchone()
    if row is not None:
        return {
            "corpus_id": int(row["corpus_id"]),
            "title": row["title"],
            "primary_source_system": "s2orc_v2",
            "has_warehouse": True,
        }

    if require_warehouse:
        return None

    # Fall back to any graph paper
    cursor.execute(
        _PAPER_FOR_QUERY_ANY_SQL,
        (graph_run_id, list(exclude_corpus_ids), query),
    )
    row = cursor.fetchone()
    if row is None:
        return None
    return {
        "corpus_id": int(row["corpus_id"]),
        "title": row["title"],
        "primary_source_system": "s2orc_v2",
        "has_warehouse": False,
    }


def _build_curated_benchmark(
    *,
    benchmark_key: str,
    benchmark_source: str,
    release,
    chunk_version_key: str,
    cases: list[RuntimeEvalBenchmarkCase],
) -> RagRuntimeEvalBenchmarkReport:
    label_counts: Counter[str] = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=benchmark_source,
        max_cases=len(cases),
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_title_global_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a title_global benchmark from diverse title edge cases."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = exclude_corpus_ids or set()

    with connect_fn() as conn, conn.cursor() as cur:
        papers = _fetch_title_edge_cases(
            repository=repository,
            graph_run_id=release.graph_run_id,
            exclude_corpus_ids=excluded,
            cursor=cur,
            total_target=12,
        )

    cases = []
    for paper in papers:
        corpus_id = int(paper["corpus_id"])
        title = str(paper["title"])
        filter_type = str(paper.get("filter_type", "general"))
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system=str(paper["primary_source_system"]),
                query_family=RuntimeEvalQueryFamily.TITLE_GLOBAL,
                query=title,
                stratum_key=(
                    f"benchmark:title_global_v1|filter:{filter_type}|"
                    f"source:{paper['primary_source_system']}"
                ),
                benchmark_key="title_global_v1",
                benchmark_labels=["title_global", filter_type],
                failure_count=0,
                min_target_rank=0,
                max_target_rank=0,
                mean_target_rank=0.0,
                source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="title_global_v1",
        benchmark_source="curated title edge-case benchmark from the current graph-backed runtime cohort",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_title_selected_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a title_selected benchmark from graph papers with selection context."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = exclude_corpus_ids or set()

    sql = """
    SELECT p.corpus_id, p.title, p.paper_id
    FROM solemd.graph_points grp
    JOIN solemd.papers p ON p.corpus_id = grp.corpus_id
    WHERE grp.graph_run_id = %s
      AND p.corpus_id != ALL(%s::BIGINT[])
      AND p.title IS NOT NULL
      AND length(p.title) > 30
    ORDER BY p.citation_count DESC NULLS LAST
    LIMIT 10
    """
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(sql, (release.graph_run_id, list(excluded)))
        rows = cur.fetchall()

    cases = []
    for row in rows:
        corpus_id = int(row["corpus_id"])
        title = str(row["title"])
        paper_id = row.get("paper_id")
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=corpus_id,
                title=title,
                primary_source_system="s2orc_v2",
                query_family=RuntimeEvalQueryFamily.TITLE_SELECTED,
                query=title,
                stratum_key="benchmark:title_selected_v1|source:s2orc_v2",
                benchmark_key="title_selected_v1",
                benchmark_labels=["title_selected"],
                failure_count=0,
                min_target_rank=0,
                max_target_rank=0,
                mean_target_rank=0.0,
                source_lane_keys=[],
            )
        )
        excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="title_selected_v1",
        benchmark_source="curated title-selected benchmark from the current graph-backed runtime cohort",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_adversarial_router_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build an adversarial router benchmark from curated edge-case queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in ADVERSARIAL_ROUTER_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            labels.append("adversarial_router")
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:adversarial_router_v1|type:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="adversarial_router_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="adversarial_router_v1",
        benchmark_source="curated adversarial router edge-case benchmark for query classification stress testing",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def build_neuropsych_safety_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect=None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a neuropsychiatry/CL safety benchmark from clinician-shaped queries."""
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn, chunk_version_key=chunk_version_key
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())

    cases = []
    with connect_fn() as conn, conn.cursor() as cur:
        for seed in NEUROPSYCH_SAFETY_SEEDS:
            query = str(seed["query"])
            search_terms = str(seed.get("search_terms", query))
            paper = _resolve_paper_for_query(
                cursor=cur,
                graph_run_id=release.graph_run_id,
                query=search_terms,
                exclude_corpus_ids=excluded,
            )
            if paper is None:
                print(f"  SKIP (no match): {query}")
                continue
            corpus_id = int(paper["corpus_id"])
            labels = list(seed.get("labels", []))
            labels.append("neuropsych_safety")
            cases.append(
                RuntimeEvalBenchmarkCase(
                    corpus_id=corpus_id,
                    title=str(paper["title"]),
                    primary_source_system=str(paper["primary_source_system"]),
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=query,
                    stratum_key=(
                        f"benchmark:neuropsych_safety_v1|theme:{labels[1] if len(labels) > 1 else 'general'}|"
                        f"source:{paper['primary_source_system']}"
                    ),
                    benchmark_key="neuropsych_safety_v1",
                    benchmark_labels=sorted(set(labels)),
                    failure_count=0,
                    min_target_rank=0,
                    max_target_rank=0,
                    mean_target_rank=0.0,
                    source_lane_keys=[],
                )
            )
            excluded.add(corpus_id)

    return _build_curated_benchmark(
        benchmark_key="neuropsych_safety_v1",
        benchmark_source="curated neuropsychiatry/CL safety benchmark for clinician-shaped query coverage",
        release=release,
        chunk_version_key=chunk_version_key,
        cases=cases,
    )


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare curated frozen benchmarks for title, adversarial, and neuropsych suites."
    )
    parser.add_argument("--graph-release-id", default="current")
    parser.add_argument("--chunk-version-key", default=DEFAULT_CHUNK_VERSION_KEY)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=BENCHMARK_DIR,
    )
    parser.add_argument(
        "--suites",
        nargs="*",
        default=["title_global", "title_selected", "adversarial_router", "neuropsych_safety"],
        choices=["title_global", "title_selected", "adversarial_router", "neuropsych_safety"],
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_corpus_ids = _load_existing_corpus_ids(output_dir)
    print(f"Existing corpus_ids across benchmarks: {len(existing_corpus_ids)}")

    excluded = set(existing_corpus_ids)
    connect = db.pooled

    builders = {
        "title_global": (
            build_title_global_benchmark,
            "title_global_v1.json",
        ),
        "title_selected": (
            build_title_selected_benchmark,
            "title_selected_v1.json",
        ),
        "adversarial_router": (
            build_adversarial_router_benchmark,
            "adversarial_router_v1.json",
        ),
        "neuropsych_safety": (
            build_neuropsych_safety_benchmark,
            "neuropsych_safety_v1.json",
        ),
    }

    try:
        for suite_name in args.suites:
            builder_fn, filename = builders[suite_name]
            print(f"\nBuilding {suite_name}...")
            report = builder_fn(
                graph_release_id=args.graph_release_id,
                chunk_version_key=args.chunk_version_key,
                exclude_corpus_ids=excluded,
                connect=connect,
            )
            for case in report.cases:
                excluded.add(case.corpus_id)

            report_json = report.model_dump_json(indent=2)
            out_path = output_dir / filename
            out_path.write_text(report_json)
            print(f"  Wrote {out_path} ({report.selected_count} cases)")
    finally:
        db.close_pool()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
