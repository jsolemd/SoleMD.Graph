"""Frozen runtime benchmark builders and loaders."""

from __future__ import annotations

import json
import re
from collections import Counter
from collections.abc import Callable, Sequence
from pathlib import Path

from app import db
from app.rag.query_enrichment import normalize_title_key
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_models import (
    RagRuntimeEvalBenchmarkReport,
    RuntimeEvalBenchmarkCase,
    RuntimeEvalPaperRecord,
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
)
from app.rag_ingest.runtime_eval_population import (
    build_runtime_eval_query_cases,
    fetch_runtime_eval_population,
    filter_runtime_eval_population,
    select_stratified_sample,
)


def _difficulty_bucket(max_rank: int) -> str:
    if max_rank >= 50:
        return "rank_50_plus"
    if max_rank >= 20:
        return "rank_20_49"
    if max_rank >= 10:
        return "rank_10_19"
    if max_rank >= 5:
        return "rank_5_9"
    return "rank_2_4"


def _normalize_failure_query(text: str) -> str:
    return " ".join(str(text).split()).strip()


def _select_failure_for_hard_benchmark(
    *,
    failure: dict[str, object],
    min_failure_count: int,
    min_max_rank: int,
    high_recurrence_count: int,
    deep_miss_rank: int,
) -> bool:
    failure_count = int(failure["failure_count"])
    max_rank = max(int(rank) for rank in failure["ranks"])
    if max_rank >= deep_miss_rank:
        return True
    if failure_count >= high_recurrence_count:
        return True
    return failure_count >= min_failure_count and max_rank >= min_max_rank


def _aggregate_dense_audit_sentence_failures(
    report_data: dict[str, object],
) -> dict[int, dict[str, object]]:
    aggregated: dict[int, dict[str, object]] = {}
    for report_key in ("lane_reports", "rerank_reports"):
        for lane_report in report_data.get(report_key, []):
            lane_key = str(lane_report.get("lane_key") or "")
            for failure in lane_report.get("failure_examples", []):
                if failure.get("query_family") != RuntimeEvalQueryFamily.SENTENCE_GLOBAL:
                    continue
                corpus_id = int(failure["corpus_id"])
                target_rank = int(failure["target_rank"])
                query = _normalize_failure_query(failure["query"])
                entry = aggregated.setdefault(
                    corpus_id,
                    {
                        "failure_count": 0,
                        "ranks": [],
                        "source_lane_keys": set(),
                        "query": query,
                        "worst_query": query,
                        "worst_rank": target_rank,
                    },
                )
                entry["failure_count"] += 1
                entry["ranks"].append(target_rank)
                entry["source_lane_keys"].add(lane_key)
                if target_rank >= entry["worst_rank"]:
                    entry["worst_rank"] = target_rank
                    entry["worst_query"] = query
    return aggregated


def _build_benchmark_case(
    *,
    benchmark_key: str,
    paper: RuntimeEvalPaperRecord,
    failure: dict[str, object],
    high_recurrence_count: int,
    deep_miss_rank: int,
) -> RuntimeEvalBenchmarkCase:
    max_rank = max(int(rank) for rank in failure["ranks"])
    failure_count = int(failure["failure_count"])
    difficulty = _difficulty_bucket(max_rank)
    labels = [
        "dense_audit_failure",
        "sentence_global",
        difficulty,
        f"failure_count_{failure_count}",
    ]
    if failure_count >= high_recurrence_count:
        labels.append("recurrent")
    if failure_count == 1 and max_rank >= deep_miss_rank:
        labels.append("singleton_deep_miss")
    if max_rank >= deep_miss_rank:
        labels.append("deep_miss")
    elif max_rank >= 10:
        labels.append("material_miss")
    else:
        labels.append("topk_miss")
    return RuntimeEvalBenchmarkCase(
        corpus_id=paper.corpus_id,
        title=paper.title,
        primary_source_system=paper.primary_source_system,
        query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        query=str(failure["worst_query"]),
        stratum_key=(
            f"benchmark:{benchmark_key}|difficulty:{difficulty}|"
            f"source:{paper.primary_source_system}"
        ),
        representative_section_role=paper.representative_section_role,
        benchmark_key=benchmark_key,
        benchmark_labels=labels,
        failure_count=failure_count,
        min_target_rank=min(int(rank) for rank in failure["ranks"]),
        max_target_rank=max_rank,
        mean_target_rank=round(
            sum(int(rank) for rank in failure["ranks"]) / len(failure["ranks"]),
            3,
        ),
        source_lane_keys=sorted(str(item) for item in failure["source_lane_keys"]),
    )


_TITLE_LOOKUP_FAMILIES = frozenset(
    {
        RuntimeEvalQueryFamily.TITLE_GLOBAL,
        RuntimeEvalQueryFamily.TITLE_SELECTED,
    }
)

_TOPIC_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "as",
        "at",
        "by",
        "case",
        "cases",
        "clinical",
        "effect",
        "effects",
        "evidence",
        "for",
        "from",
        "in",
        "is",
        "meta",
        "metaanalysis",
        "meta-analysis",
        "of",
        "on",
        "paper",
        "report",
        "reports",
        "review",
        "study",
        "studies",
        "systematic",
        "the",
        "to",
        "trial",
        "with",
    }
)
_AUTHOR_SUFFIXES = frozenset({"jr", "sr", "ii", "iii", "iv", "md", "phd", "mph"})
_EVIDENCE_TYPE_BUCKETS = (
    ("meta_analysis", "meta-analysis evidence", {"MetaAnalysis"}),
    ("clinical_trial", "clinical trial evidence", {"ClinicalTrial"}),
    ("study", "study evidence", {"Study"}),
    ("review", "review evidence", {"Review"}),
)


def _title_topic_phrase(title: str, *, max_terms: int = 6) -> str:
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]*", title.lower())
    selected: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token.isdigit() or len(token) < 3 or token in _TOPIC_STOPWORDS:
            continue
        if token in seen:
            continue
        seen.add(token)
        selected.append(token)
        if len(selected) >= max_terms:
            break
    if selected:
        return " ".join(selected)
    fallback = [token for token in tokens if token and not token.isdigit()]
    return " ".join(fallback[:max_terms]).strip()


def _author_surname(name: str | None) -> str | None:
    if not name:
        return None
    tokens = [
        token
        for token in re.split(r"[^A-Za-z0-9'-]+", name.strip())
        if token
    ]
    while tokens and tokens[-1].lower().rstrip(".") in _AUTHOR_SUFFIXES:
        tokens.pop()
    return tokens[-1] if tokens else None


def _journal_phrase(name: str | None, *, max_terms: int = 4) -> str:
    if not name:
        return ""
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9'-]*", name)
    return " ".join(tokens[:max_terms]).strip()


def _select_bucket_samples(
    buckets: dict[str, list[RuntimeEvalPaperRecord]],
    *,
    per_bucket: int,
    seed: int,
) -> list[RuntimeEvalPaperRecord]:
    selected: list[RuntimeEvalPaperRecord] = []
    for offset, bucket_key in enumerate(sorted(buckets)):
        bucket_rows = buckets[bucket_key]
        if len(bucket_rows) < per_bucket:
            raise ValueError(
                f"Bucket '{bucket_key}' has only {len(bucket_rows)} eligible papers; "
                f"need {per_bucket}"
            )
        selected.extend(
            select_stratified_sample(
                bucket_rows,
                sample_size=per_bucket,
                seed=seed + offset,
            )[:per_bucket]
        )
    return selected


def _warehouse_depth(paper: RuntimeEvalPaperRecord) -> str:
    if (
        paper.chunk_count > 0
        and paper.entity_mention_count > 0
        and paper.representative_sentence
    ):
        return "chunks_entities_sentence"
    if paper.chunk_count > 0 and paper.entity_mention_count > 0:
        return "chunks_entities"
    if paper.chunk_count > 0:
        return "chunks_only"
    if paper.entity_mention_count > 0:
        return "entities_only"
    return "sparse"


def _coverage_bucket(paper: RuntimeEvalPaperRecord) -> str:
    if _warehouse_depth(paper) == "chunks_entities_sentence":
        return "covered"
    return "partial"


def _base_specialized_labels(
    *,
    benchmark_key: str,
    paper: RuntimeEvalPaperRecord,
    specialization_label: str,
) -> list[str]:
    labels = [
        benchmark_key,
        specialization_label,
        f"source:{paper.primary_source_system}",
        "has_chunks",
        "has_entities",
    ]
    if paper.representative_sentence:
        labels.append("has_sentence_seed")
    if paper.journal_name:
        labels.append("has_journal")
    if paper.year is not None:
        labels.append("has_year")
    if paper.first_author_name:
        labels.append("has_author")
    return labels


def _build_specialized_case(
    *,
    benchmark_key: str,
    paper: RuntimeEvalPaperRecord,
    query: str,
    labels: Sequence[str],
    stratum_key: str,
    expected_retrieval_profile: str | None = "general",
) -> RuntimeEvalBenchmarkCase:
    return RuntimeEvalBenchmarkCase(
        corpus_id=paper.corpus_id,
        title=paper.title,
        normalized_title_key=normalize_title_key(paper.title),
        primary_source_system=paper.primary_source_system,
        query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        query=query,
        stratum_key=stratum_key,
        representative_section_role=paper.representative_section_role,
        benchmark_key=benchmark_key,
        benchmark_labels=sorted(set(labels)),
        expected_retrieval_profile=expected_retrieval_profile,
        has_chunks=paper.chunk_count > 0,
        has_entities=paper.entity_mention_count > 0,
        has_sentence_seed=bool(paper.representative_sentence),
        coverage_bucket=_coverage_bucket(paper),
        warehouse_depth=_warehouse_depth(paper),
        evaluation_partition="specialized",
    )


def _metadata_query_variants(
    paper: RuntimeEvalPaperRecord,
) -> list[tuple[str, str, str]] | None:
    topic_phrase = _title_topic_phrase(paper.title)
    if not topic_phrase or paper.year is None:
        return None
    surname = _author_surname(paper.first_author_name)
    journal_phrase = _journal_phrase(paper.journal_name)
    variants: list[tuple[str, str, str]] = []
    if surname:
        variants.append(
            (
                "author_year",
                f"{surname} {paper.year} {topic_phrase}",
                f"benchmark:biomedical_metadata_retrieval_v1|variant:author_year|source:{paper.primary_source_system}",
            )
        )
    if journal_phrase:
        variants.append(
            (
                "journal_year",
                f"{journal_phrase} {paper.year} {topic_phrase}",
                f"benchmark:biomedical_metadata_retrieval_v1|variant:journal_year|source:{paper.primary_source_system}",
            )
        )
    return variants or None


def _evidence_type_bucket(paper: RuntimeEvalPaperRecord) -> tuple[str, str] | None:
    publication_types = {str(item) for item in paper.publication_types}
    for bucket_key, prompt_prefix, members in _EVIDENCE_TYPE_BUCKETS:
        if publication_types & members:
            return bucket_key, prompt_prefix
    return None


def _has_optimization_title_quality(title: str) -> bool:
    normalized = " ".join(title.split()).strip()
    return (
        len(normalized) >= 25
        and len(normalized.split()) >= 4
        and not normalized.isupper()
    )


def _paper_supports_query_family(
    paper: RuntimeEvalPaperRecord,
    family: RuntimeEvalQueryFamily,
) -> bool:
    if family in _TITLE_LOOKUP_FAMILIES:
        return _has_optimization_title_quality(paper.title)
    if family == RuntimeEvalQueryFamily.SENTENCE_GLOBAL:
        return bool(paper.representative_sentence)
    return True


def _optimization_expected_profile(
    query_family: RuntimeEvalQueryFamily,
) -> str | None:
    if query_family in _TITLE_LOOKUP_FAMILIES:
        return "title_lookup"
    return None


def _optimization_sample_budget(
    *,
    eligible_population: Sequence[RuntimeEvalPaperRecord],
    requested_sample_size: int,
    reserve_holdout_papers: int,
    benchmark_key: str,
) -> int:
    if requested_sample_size <= 0:
        raise ValueError("paper_sample_size must be positive")
    if reserve_holdout_papers <= 0:
        return min(requested_sample_size, len(eligible_population))

    eligible_title_count = len(
        {
            normalize_title_key(paper.title)
            for paper in eligible_population
            if normalize_title_key(paper.title)
        }
    )
    max_optimization_papers = min(
        len(eligible_population),
        eligible_title_count,
    ) - reserve_holdout_papers
    if max_optimization_papers <= 0:
        raise ValueError(
            f"{benchmark_key} cannot reserve {reserve_holdout_papers} disjoint holdout "
            f"papers from eligible_papers={len(eligible_population)} "
            f"eligible_titles={eligible_title_count}"
        )
    return min(requested_sample_size, max_optimization_papers)


def _build_optimization_case(
    *,
    benchmark_key: str,
    paper: RuntimeEvalPaperRecord,
    query_case: RuntimeEvalQueryCase,
) -> RuntimeEvalBenchmarkCase:
    labels = [
        "biomedical_optimization",
        f"family:{query_case.query_family}",
        f"source:{paper.primary_source_system}",
        "has_chunks",
        "has_entities",
        "partition:optimize",
    ]
    if paper.representative_sentence:
        labels.append("has_sentence_seed")
    return RuntimeEvalBenchmarkCase(
        corpus_id=paper.corpus_id,
        title=paper.title,
        normalized_title_key=normalize_title_key(paper.title),
        primary_source_system=paper.primary_source_system,
        query_family=query_case.query_family,
        query=query_case.query,
        stratum_key=f"benchmark:{benchmark_key}|family:{query_case.query_family}|{query_case.stratum_key}",
        representative_section_role=query_case.representative_section_role,
        selected_layer_key=query_case.selected_layer_key,
        selected_node_id=query_case.selected_node_id,
        selection_graph_paper_refs=query_case.selection_graph_paper_refs,
        benchmark_key=benchmark_key,
        benchmark_labels=sorted(set(labels)),
        expected_retrieval_profile=_optimization_expected_profile(
            query_case.query_family
        ),
        has_chunks=paper.chunk_count > 0,
        has_entities=paper.entity_mention_count > 0,
        has_sentence_seed=bool(paper.representative_sentence),
        coverage_bucket=_coverage_bucket(paper),
        warehouse_depth=_warehouse_depth(paper),
        evaluation_partition="optimize",
    )


def build_biomedical_optimization_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "biomedical_optimization_v3",
    paper_sample_size: int = 120,
    reserve_holdout_papers: int = 0,
    sample_seed: int = 7,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
    exclude_corpus_ids: set[int] | None = None,
    min_chunk_count: int = 1,
    min_entity_mentions: int = 1,
    require_sentence_seed: bool = True,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a larger covered benchmark for primary RAG optimization work.

    Samples from the live warehouse population after enforcing structural
    coverage so benchmark movement reflects retrieval quality instead of
    missing ingest state.
    """
    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())
    families = tuple(
        query_families
        or (
            RuntimeEvalQueryFamily.TITLE_GLOBAL,
            RuntimeEvalQueryFamily.TITLE_SELECTED,
            RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        )
    )
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    covered_population = filter_runtime_eval_population(
        population,
        min_chunk_count=min_chunk_count,
        min_entity_mentions=min_entity_mentions,
        require_sentence_seed=require_sentence_seed,
    )
    eligible_population = [
        paper for paper in covered_population if paper.corpus_id not in excluded
    ]
    if not eligible_population:
        raise ValueError(
            f"{benchmark_key} produced 0 eligible covered papers"
        )
    effective_paper_sample_size = _optimization_sample_budget(
        eligible_population=eligible_population,
        requested_sample_size=paper_sample_size,
        reserve_holdout_papers=reserve_holdout_papers,
        benchmark_key=benchmark_key,
    )
    sample = select_stratified_sample(
        eligible_population,
        sample_size=effective_paper_sample_size,
        seed=sample_seed,
    )
    if not sample:
        raise ValueError(
            f"{benchmark_key} produced 0 sampled papers from "
            f"{len(eligible_population)} eligible papers"
        )
    sample_by_corpus_id = {paper.corpus_id: paper for paper in sample}
    query_cases = build_runtime_eval_query_cases(
        sample,
        query_families=families,
    )
    query_cases = [
        query_case
        for query_case in query_cases
        if _paper_supports_query_family(
            sample_by_corpus_id[query_case.corpus_id],
            query_case.query_family,
        )
    ]
    cases = [
        _build_optimization_case(
            benchmark_key=benchmark_key,
            paper=sample_by_corpus_id[query_case.corpus_id],
            query_case=query_case,
        )
        for query_case in query_cases
    ]
    if not cases:
        raise ValueError(
            f"{benchmark_key} produced 0 cases from {len(sample)} sampled papers"
        )
    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    source_counts = Counter(paper.primary_source_system for paper in sample)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=(
            "Covered runtime-eval population sampled from the live warehouse "
            "with canonical paper titles and family-specific title-quality gating. "
            f"eligible_papers={len(eligible_population)} "
            f"requested_papers={paper_sample_size} "
            f"reserved_holdout_papers={reserve_holdout_papers} "
            f"sampled_papers={len(sample)} "
            f"families={','.join(str(family) for family in families)} "
            f"source_mix={dict(sorted(source_counts.items()))}"
        ),
        max_cases=effective_paper_sample_size * len(families),
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_biomedical_holdout_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "biomedical_holdout_v1",
    paper_sample_size: int = 72,
    sample_seed: int = 17,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
    optimize_benchmark_path: Path | None = None,
    exclude_corpus_ids: set[int] | None = None,
    min_chunk_count: int = 1,
    min_entity_mentions: int = 1,
    require_sentence_seed: bool = True,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a held-out covered benchmark with no paper/title overlap.

    Unlike ``biomedical_optimization_v3``, this builder emits at most one case per
    paper and excludes both corpus-id overlap and normalized-title overlap with the
    optimization benchmark snapshot. This makes it a better proof benchmark for
    structural retrieval improvements.
    """

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    families = tuple(
        query_families
        or (
            RuntimeEvalQueryFamily.TITLE_GLOBAL,
            RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        )
    )
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    covered_population = filter_runtime_eval_population(
        population,
        min_chunk_count=min_chunk_count,
        min_entity_mentions=min_entity_mentions,
        require_sentence_seed=require_sentence_seed,
    )

    excluded_corpus_ids: set[int] = set(exclude_corpus_ids or set())
    excluded_title_keys: set[str] = set()
    if optimize_benchmark_path is not None and optimize_benchmark_path.exists():
        optimize_report, _ = load_runtime_eval_benchmark_cases(optimize_benchmark_path)
        excluded_corpus_ids |= {case.corpus_id for case in optimize_report.cases}
        excluded_title_keys = {
            normalize_title_key(case.title) for case in optimize_report.cases if case.title
        }

    eligible_population = [
        paper
        for paper in covered_population
        if paper.corpus_id not in excluded_corpus_ids
        and normalize_title_key(paper.title) not in excluded_title_keys
    ]
    if not eligible_population:
        raise ValueError(
            f"{benchmark_key} produced 0 eligible papers after overlap exclusion; "
            f"covered_population={len(covered_population)} "
            f"excluded_corpus_ids={len(excluded_corpus_ids)} "
            f"excluded_title_keys={len(excluded_title_keys)}"
        )

    sample = select_stratified_sample(
        eligible_population,
        sample_size=paper_sample_size,
        seed=sample_seed,
    )
    if not sample:
        raise ValueError(
            f"{benchmark_key} produced 0 sampled papers from "
            f"{len(eligible_population)} eligible papers"
        )
    cases: list[RuntimeEvalBenchmarkCase] = []
    family_counts = Counter()
    for index, paper in enumerate(sample):
        query_case = None
        for family_offset in range(len(families)):
            family = families[(index + sample_seed + family_offset) % len(families)]
            if not _paper_supports_query_family(paper, family):
                continue
            query_cases = build_runtime_eval_query_cases(
                [paper],
                query_families=[family],
            )
            if query_cases:
                query_case = query_cases[0]
                break
        if query_case is None:
            continue
        labels = [
            "biomedical_holdout",
            "partition:holdout",
            "no_optimize_paper_overlap",
            "no_optimize_title_overlap",
            f"family:{query_case.query_family}",
            f"source:{paper.primary_source_system}",
        ]
        if paper.chunk_count > 0:
            labels.append("has_chunks")
        if paper.entity_mention_count > 0:
            labels.append("has_entities")
        if paper.representative_sentence:
            labels.append("has_sentence_seed")
        cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=paper.corpus_id,
                title=paper.title,
                normalized_title_key=normalize_title_key(paper.title),
                primary_source_system=paper.primary_source_system,
                query_family=query_case.query_family,
                query=query_case.query,
                stratum_key=(
                    f"benchmark:{benchmark_key}|family:{query_case.query_family}|"
                    f"{query_case.stratum_key}"
                ),
                representative_section_role=query_case.representative_section_role,
                selected_layer_key=query_case.selected_layer_key,
                selected_node_id=query_case.selected_node_id,
                selection_graph_paper_refs=query_case.selection_graph_paper_refs,
                benchmark_key=benchmark_key,
                benchmark_labels=sorted(set(labels)),
                expected_retrieval_profile=_optimization_expected_profile(
                    query_case.query_family
                ),
                has_chunks=paper.chunk_count > 0,
                has_entities=paper.entity_mention_count > 0,
                has_sentence_seed=bool(paper.representative_sentence),
                coverage_bucket=_coverage_bucket(paper),
                warehouse_depth=_warehouse_depth(paper),
                evaluation_partition="holdout",
            )
        )
        family_counts[str(query_case.query_family)] += 1
    if not cases:
        raise ValueError(
            f"{benchmark_key} produced 0 cases from {len(sample)} sampled papers"
        )

    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    source_counts = Counter(paper.primary_source_system for paper in sample)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=(
            "Held-out covered runtime-eval population with one case per paper "
            "and no corpus/title overlap with the optimization snapshot, using "
            "family-specific title-quality gating. "
            f"eligible_papers={len(eligible_population)} "
            f"sampled_papers={len(sample)} "
            f"family_mix={dict(sorted(family_counts.items()))} "
            f"source_mix={dict(sorted(source_counts.items()))}"
        ),
        max_cases=paper_sample_size,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_citation_context_benchmark(
    *,
    source_benchmark_path: Path,
    benchmark_key: str = "biomedical_citation_context_v1",
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
    max_cases: int | None = None,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    exclude_corpus_ids: set[int] | None = None,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    """Derive a benchmark that measures explicitly cited-study preservation.

    This keeps the underlying queries unchanged and adds ``cited_corpus_ids``
    pointing at the target paper, so movement reflects the cited-study lane
    rather than prompt rewrites or title memorization.
    """

    _ = graph_release_id, chunk_version_key, connect
    excluded = set(exclude_corpus_ids or set())
    source_report, _ = load_runtime_eval_benchmark_cases(source_benchmark_path)
    families = tuple(query_families or (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,))
    selected_cases: list[RuntimeEvalBenchmarkCase] = []
    for case in source_report.cases:
        if case.query_family not in families:
            continue
        if case.corpus_id in excluded:
            continue
        selected_cases.append(
            RuntimeEvalBenchmarkCase(
                corpus_id=case.corpus_id,
                title=case.title,
                normalized_title_key=case.normalized_title_key,
                primary_source_system=case.primary_source_system,
                query_family=case.query_family,
                query=case.query,
                stratum_key=(
                    f"benchmark:{benchmark_key}|family:{case.query_family}|"
                    f"{case.stratum_key}"
                ),
                evidence_intent=case.evidence_intent,
                representative_section_role=case.representative_section_role,
                selected_layer_key=case.selected_layer_key,
                selected_node_id=case.selected_node_id,
                selection_graph_paper_refs=case.selection_graph_paper_refs,
                cited_corpus_ids=[case.corpus_id],
                benchmark_key=benchmark_key,
                benchmark_labels=sorted(
                    {
                        *case.benchmark_labels,
                        "citation_context",
                        "explicit_cited_study",
                    }
                ),
                failure_count=case.failure_count,
                min_target_rank=case.min_target_rank,
                max_target_rank=case.max_target_rank,
                mean_target_rank=case.mean_target_rank,
                source_lane_keys=case.source_lane_keys,
                expected_retrieval_profile=case.expected_retrieval_profile,
                has_chunks=case.has_chunks,
                has_entities=case.has_entities,
                has_sentence_seed=case.has_sentence_seed,
                coverage_bucket=case.coverage_bucket,
                warehouse_depth=case.warehouse_depth,
                evaluation_partition=case.evaluation_partition,
            )
        )
        if max_cases is not None and len(selected_cases) >= max_cases:
            break

    if not selected_cases:
        raise ValueError(
            f"{benchmark_key} produced 0 citation-context cases from {source_benchmark_path}"
        )

    label_counts = Counter()
    for case in selected_cases:
        label_counts.update(case.benchmark_labels)

    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=source_report.graph_release_id,
        graph_run_id=source_report.graph_run_id,
        bundle_checksum=source_report.bundle_checksum,
        graph_name=source_report.graph_name,
        chunk_version_key=source_report.chunk_version_key,
        benchmark_source=(
            f"Derived from {source_benchmark_path.name}; explicit cited-study context "
            f"added for families={','.join(str(family) for family in families)}"
        ),
        max_cases=max_cases or len(selected_cases),
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(selected_cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=selected_cases,
    )


def build_biomedical_metadata_retrieval_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "biomedical_metadata_retrieval_v1",
    paper_sample_size: int = 18,
    sample_seed: int = 31,
    exclude_corpus_ids: set[int] | None = None,
    min_chunk_count: int = 1,
    min_entity_mentions: int = 1,
    require_sentence_seed: bool = True,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a metadata-heavy retrieval benchmark from covered papers.

    Each sampled paper emits two non-title queries:
    - first-author surname + year + topic phrase
    - journal + year + topic phrase
    """

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    covered_population = filter_runtime_eval_population(
        population,
        min_chunk_count=min_chunk_count,
        min_entity_mentions=min_entity_mentions,
        require_sentence_seed=require_sentence_seed,
    )
    eligible = [
        paper
        for paper in covered_population
        if paper.corpus_id not in excluded and _metadata_query_variants(paper)
    ]
    sample = select_stratified_sample(
        eligible,
        sample_size=paper_sample_size,
        seed=sample_seed,
    )[:paper_sample_size]
    if len(sample) < paper_sample_size:
        raise ValueError(
            f"{benchmark_key} produced only {len(sample)} metadata-ready papers; "
            f"need {paper_sample_size}"
        )

    cases: list[RuntimeEvalBenchmarkCase] = []
    for paper in sample:
        variants = _metadata_query_variants(paper) or []
        if len(variants) < 2:
            continue
        for variant, query, stratum_key in variants[:2]:
            labels = _base_specialized_labels(
                benchmark_key=benchmark_key,
                paper=paper,
                specialization_label="metadata_retrieval",
            )
            labels.append(f"metadata_variant:{variant}")
            cases.append(
                _build_specialized_case(
                    benchmark_key=benchmark_key,
                    paper=paper,
                    query=query,
                    labels=labels,
                    stratum_key=stratum_key,
                )
            )

    expected_case_count = paper_sample_size * 2
    if len(cases) != expected_case_count:
        raise ValueError(
            f"{benchmark_key} produced {len(cases)} cases; expected {expected_case_count}"
        )

    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=(
            "Metadata-aware retrieval benchmark over covered papers with author/year "
            f"and journal/year query variants. sampled_papers={len(sample)} "
            f"expected_cases={expected_case_count}"
        ),
        max_cases=expected_case_count,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_biomedical_evidence_type_benchmark(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "biomedical_evidence_type_v1",
    papers_per_type: int = 4,
    sample_seed: int = 41,
    exclude_corpus_ids: set[int] | None = None,
    min_chunk_count: int = 1,
    min_entity_mentions: int = 1,
    require_sentence_seed: bool = True,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    """Build a study-design-aware retrieval benchmark from covered papers."""

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    excluded = set(exclude_corpus_ids or set())
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    covered_population = filter_runtime_eval_population(
        population,
        min_chunk_count=min_chunk_count,
        min_entity_mentions=min_entity_mentions,
        require_sentence_seed=require_sentence_seed,
    )
    buckets: dict[str, list[RuntimeEvalPaperRecord]] = {
        bucket_key: []
        for bucket_key, _prompt_prefix, _members in _EVIDENCE_TYPE_BUCKETS
    }
    prompt_prefixes = {
        bucket_key: prompt_prefix
        for bucket_key, prompt_prefix, _members in _EVIDENCE_TYPE_BUCKETS
    }
    for paper in covered_population:
        if paper.corpus_id in excluded:
            continue
        bucket = _evidence_type_bucket(paper)
        if bucket is None or not _title_topic_phrase(paper.title):
            continue
        bucket_key, _prompt_prefix = bucket
        buckets[bucket_key].append(paper)

    sample = _select_bucket_samples(
        buckets,
        per_bucket=papers_per_type,
        seed=sample_seed,
    )
    cases: list[RuntimeEvalBenchmarkCase] = []
    for paper in sample:
        bucket = _evidence_type_bucket(paper)
        if bucket is None:
            continue
        bucket_key, _prompt_prefix = bucket
        topic_phrase = _title_topic_phrase(paper.title)
        query = f"{prompt_prefixes[bucket_key]} {topic_phrase}".strip()
        labels = _base_specialized_labels(
            benchmark_key=benchmark_key,
            paper=paper,
            specialization_label="evidence_type",
        )
        labels.append(f"study_type:{bucket_key}")
        cases.append(
            _build_specialized_case(
                benchmark_key=benchmark_key,
                paper=paper,
                query=query,
                labels=labels,
                stratum_key=(
                    f"benchmark:{benchmark_key}|study_type:{bucket_key}|"
                    f"source:{paper.primary_source_system}"
                ),
            )
        )

    expected_case_count = papers_per_type * len(_EVIDENCE_TYPE_BUCKETS)
    if len(cases) != expected_case_count:
        raise ValueError(
            f"{benchmark_key} produced {len(cases)} cases; expected {expected_case_count}"
        )

    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)
    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=(
            "Study-design-aware retrieval benchmark over covered papers using "
            f"{papers_per_type} papers per publication-type bucket"
        ),
        max_cases=expected_case_count,
        min_failure_count=0,
        min_max_rank=0,
        high_recurrence_count=0,
        deep_miss_rank=0,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def build_dense_audit_sentence_hard_benchmark(
    *,
    dense_audit_report_path: Path,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    benchmark_key: str = "sentence_hard_v1",
    max_cases: int = 24,
    min_failure_count: int = 2,
    min_max_rank: int = 4,
    high_recurrence_count: int = 4,
    deep_miss_rank: int = 20,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvalBenchmarkReport:
    dense_audit_report_path = dense_audit_report_path.resolve()
    report_data = json.loads(dense_audit_report_path.read_text())
    aggregated_failures = _aggregate_dense_audit_sentence_failures(report_data)
    selected_failures = {
        corpus_id: failure
        for corpus_id, failure in aggregated_failures.items()
        if _select_failure_for_hard_benchmark(
            failure=failure,
            min_failure_count=min_failure_count,
            min_max_rank=min_max_rank,
            high_recurrence_count=high_recurrence_count,
            deep_miss_rank=deep_miss_rank,
        )
    }
    selected_corpus_ids = [
        corpus_id
        for corpus_id, _failure in sorted(
            selected_failures.items(),
            key=lambda item: (
                -int(item[1]["failure_count"]),
                -max(int(rank) for rank in item[1]["ranks"]),
                -(
                    sum(int(rank) for rank in item[1]["ranks"])
                    / len(item[1]["ranks"])
                ),
                item[0],
            ),
        )[:max_cases]
    ]

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        corpus_ids=selected_corpus_ids,
        connect=connect_fn,
    )
    papers_by_id = {paper.corpus_id: paper for paper in population}
    cases = [
        _build_benchmark_case(
            benchmark_key=benchmark_key,
            paper=papers_by_id[corpus_id],
            failure=selected_failures[corpus_id],
            high_recurrence_count=high_recurrence_count,
            deep_miss_rank=deep_miss_rank,
        )
        for corpus_id in selected_corpus_ids
        if corpus_id in papers_by_id
    ]
    label_counts = Counter()
    for case in cases:
        label_counts.update(case.benchmark_labels)

    return RagRuntimeEvalBenchmarkReport(
        benchmark_key=benchmark_key,
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        benchmark_source=str(dense_audit_report_path),
        max_cases=max_cases,
        min_failure_count=min_failure_count,
        min_max_rank=min_max_rank,
        high_recurrence_count=high_recurrence_count,
        deep_miss_rank=deep_miss_rank,
        selected_count=len(cases),
        selected_by_label=dict(sorted(label_counts.items())),
        cases=cases,
    )


def load_runtime_eval_benchmark_cases(
    benchmark_path: Path,
) -> tuple[RagRuntimeEvalBenchmarkReport, list[RuntimeEvalQueryCase]]:
    benchmark_report = RagRuntimeEvalBenchmarkReport.model_validate_json(
        benchmark_path.read_text()
    )
    cases = [
        RuntimeEvalQueryCase(
            corpus_id=case.corpus_id,
            title=case.title,
            primary_source_system=case.primary_source_system,
            query_family=case.query_family,
            query=case.query,
            stratum_key=case.stratum_key,
            evidence_intent=case.evidence_intent,
            benchmark_labels=case.benchmark_labels,
            representative_section_role=case.representative_section_role,
            selected_layer_key=case.selected_layer_key,
            selected_node_id=case.selected_node_id,
            selection_graph_paper_refs=case.selection_graph_paper_refs,
            cited_corpus_ids=case.cited_corpus_ids,
        )
        for case in benchmark_report.cases
    ]
    return benchmark_report, cases
