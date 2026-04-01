"""Runtime evaluation harness for the ingest-backed RAG warehouse."""

from __future__ import annotations

import sys
from collections import Counter
from collections.abc import Callable, Sequence
from enum import StrEnum
from functools import partial
from math import ceil
from random import Random
from time import perf_counter

from pydantic import Field

from app import db
from app.rag.grounded_runtime import (
    GroundedAnswerRuntimeStatus,
    build_grounded_answer_from_runtime,
    get_grounded_answer_runtime_status,
)
from app.rag.parse_contract import ParseContractModel
from app.rag.repository import PostgresRagRepository
from app.rag.schemas import RagSearchRequest
from app.rag.service import RagService
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.warehouse_quality import (
    PostgresWarehouseQualityLoader,
    RagWarehouseQualityReport,
    inspect_rag_warehouse_quality,
)

_EVAL_POPULATION_SQL = """
WITH requested_docs AS (
    SELECT DISTINCT
        d.corpus_id,
        d.title,
        d.primary_source_system
    FROM solemd.paper_documents d
    JOIN solemd.graph_points gp
      ON gp.corpus_id = d.corpus_id
    WHERE gp.graph_run_id::text = %s
),
section_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS section_count
    FROM solemd.paper_sections
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
block_counts AS (
    SELECT
        corpus_id,
        COUNT(*) FILTER (WHERE block_kind = 'table_body_text')::BIGINT AS table_block_count,
        COUNT(*) FILTER (WHERE block_kind = 'narrative_paragraph')::BIGINT AS narrative_block_count
    FROM solemd.paper_blocks
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
chunk_counts AS (
    SELECT
        corpus_id,
        COUNT(*)::BIGINT AS chunk_count,
        AVG(token_count_estimate)::DOUBLE PRECISION AS avg_chunk_tokens
    FROM solemd.paper_chunks
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
      AND chunk_version_key = %s
    GROUP BY corpus_id
),
entity_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS entity_mention_count
    FROM solemd.paper_entity_mentions
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
citation_counts AS (
    SELECT corpus_id, COUNT(*)::BIGINT AS citation_mention_count
    FROM solemd.paper_citation_mentions
    WHERE corpus_id IN (SELECT corpus_id FROM requested_docs)
    GROUP BY corpus_id
),
sentence_seeds AS (
    SELECT DISTINCT ON (s.corpus_id)
        s.corpus_id,
        COALESCE(sec.section_role, b.section_role) AS representative_section_role,
        trim(s.text) AS representative_sentence
    FROM solemd.paper_sentences s
    JOIN solemd.paper_blocks b
      ON b.corpus_id = s.corpus_id
     AND b.block_ordinal = s.block_ordinal
    LEFT JOIN solemd.paper_sections sec
      ON sec.corpus_id = s.corpus_id
     AND sec.section_ordinal = s.section_ordinal
    WHERE s.corpus_id IN (SELECT corpus_id FROM requested_docs)
      AND b.block_kind = 'narrative_paragraph'
      AND b.is_retrieval_default = true
      AND char_length(trim(s.text)) BETWEEN 60 AND 220
    ORDER BY
        s.corpus_id,
        CASE COALESCE(sec.section_role, b.section_role)
            WHEN 'abstract' THEN 0
            WHEN 'result' THEN 1
            WHEN 'discussion' THEN 2
            WHEN 'introduction' THEN 3
            WHEN 'conclusion' THEN 4
            ELSE 10
        END,
        char_length(trim(s.text)) DESC,
        s.block_ordinal,
        s.sentence_ordinal
)
SELECT
    d.corpus_id,
    d.title,
    d.primary_source_system,
    COALESCE(sc.section_count, 0) AS section_count,
    COALESCE(bc.table_block_count, 0) AS table_block_count,
    COALESCE(bc.narrative_block_count, 0) AS narrative_block_count,
    COALESCE(cc.chunk_count, 0) AS chunk_count,
    COALESCE(cc.avg_chunk_tokens, 0.0) AS avg_chunk_tokens,
    COALESCE(ec.entity_mention_count, 0) AS entity_mention_count,
    COALESCE(cic.citation_mention_count, 0) AS citation_mention_count,
    ss.representative_section_role,
    ss.representative_sentence
FROM requested_docs d
LEFT JOIN section_counts sc USING (corpus_id)
LEFT JOIN block_counts bc USING (corpus_id)
LEFT JOIN chunk_counts cc USING (corpus_id)
LEFT JOIN entity_counts ec USING (corpus_id)
LEFT JOIN citation_counts cic USING (corpus_id)
LEFT JOIN sentence_seeds ss USING (corpus_id)
ORDER BY d.corpus_id
"""

_TITLE_MAX_CHARS = 220
_SENTENCE_MAX_CHARS = 220
_SENTENCE_MAX_WORDS = 28


class RuntimeEvalQueryFamily(StrEnum):
    TITLE_GLOBAL = "title_global"
    TITLE_SELECTED = "title_selected"
    SENTENCE_GLOBAL = "sentence_global"


class RuntimeEvalPaperRecord(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    section_count: int = 0
    table_block_count: int = 0
    narrative_block_count: int = 0
    chunk_count: int = 0
    avg_chunk_tokens: float = 0.0
    entity_mention_count: int = 0
    citation_mention_count: int = 0
    representative_section_role: str | None = None
    representative_sentence: str | None = None


class RuntimeEvalPopulationSummary(ParseContractModel):
    population_papers: int
    sampled_papers: int
    sentence_seed_papers: int = 0
    sampled_by_source_system: dict[str, int] = Field(default_factory=dict)
    sampled_by_stratum: dict[str, int] = Field(default_factory=dict)


class WarehouseQualitySummary(ParseContractModel):
    papers: int
    flagged_papers: int
    flag_counts: dict[str, int] = Field(default_factory=dict)


class RuntimeEvalQueryCase(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    representative_section_role: str | None = None
    selected_layer_key: str | None = None
    selected_node_id: str | None = None


class RuntimeEvalTopHit(ParseContractModel):
    corpus_id: int
    title: str | None = None
    rank: int
    score: float | None = None
    matched_channels: list[str] = Field(default_factory=list)


class RuntimeEvalCaseResult(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    representative_section_role: str | None = None
    evidence_bundle_count: int = 0
    top_corpus_ids: list[int] = Field(default_factory=list)
    hit_rank: int | None = None
    answer_present: bool = False
    answer_corpus_ids: list[int] = Field(default_factory=list)
    target_in_answer_corpus: bool = False
    grounded_answer_present: bool = False
    grounded_answer_linked_corpus_ids: list[int] = Field(default_factory=list)
    target_in_grounded_answer: bool = False
    cited_span_count: int = 0
    inline_citation_count: int = 0
    answer_segment_count: int = 0
    retrieval_channel_hit_counts: dict[str, int] = Field(default_factory=dict)
    top_hits: list[RuntimeEvalTopHit] = Field(default_factory=list)
    duration_ms: float = 0.0
    error: str | None = None


class RuntimeEvalAggregate(ParseContractModel):
    cases: int = 0
    hit_at_1_rate: float = 0.0
    hit_at_k_rate: float = 0.0
    answer_present_rate: float = 0.0
    target_in_answer_corpus_rate: float = 0.0
    grounded_answer_rate: float = 0.0
    target_in_grounded_answer_rate: float = 0.0
    mean_bundle_count: float = 0.0
    mean_cited_span_count: float = 0.0
    mean_duration_ms: float = 0.0
    p95_duration_ms: float = 0.0
    error_count: int = 0
    retrieval_channel_presence_rates: dict[str, float] = Field(default_factory=dict)


class RuntimeEvalFailureExample(ParseContractModel):
    corpus_id: int
    title: str
    primary_source_system: str
    query_family: RuntimeEvalQueryFamily
    query: str
    stratum_key: str
    failure_reasons: list[str] = Field(default_factory=list)
    top_hits: list[RuntimeEvalTopHit] = Field(default_factory=list)


class RuntimeEvalSummary(ParseContractModel):
    overall: RuntimeEvalAggregate
    by_query_family: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    by_source_system: dict[str, RuntimeEvalAggregate] = Field(default_factory=dict)
    failure_theme_counts: dict[str, int] = Field(default_factory=dict)
    failure_examples: list[RuntimeEvalFailureExample] = Field(default_factory=list)


class RagRuntimeEvaluationReport(ParseContractModel):
    graph_release_id: str
    graph_run_id: str
    bundle_checksum: str | None = None
    graph_name: str
    chunk_version_key: str
    query_families: list[RuntimeEvalQueryFamily] = Field(default_factory=list)
    population: RuntimeEvalPopulationSummary
    warehouse_quality: WarehouseQualitySummary
    grounding_runtime_status: GroundedAnswerRuntimeStatus
    summary: RuntimeEvalSummary
    cases: list[RuntimeEvalCaseResult] = Field(default_factory=list)


def _normalize_query_text(
    text: str,
    *,
    max_chars: int,
    max_words: int | None = None,
) -> str:
    normalized = " ".join(text.split()).strip()
    if max_words is not None:
        normalized = " ".join(normalized.split()[:max_words]).strip()
    if len(normalized) <= max_chars:
        return normalized
    truncated = normalized[:max_chars].rsplit(" ", 1)[0].strip()
    return truncated or normalized[:max_chars].strip()


def _table_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.table_block_count >= 3:
        return "table_heavy"
    if paper.table_block_count >= 1:
        return "table_present"
    return "table_absent"


def _size_profile(paper: RuntimeEvalPaperRecord) -> str:
    if paper.chunk_count >= 16:
        return "long"
    if paper.chunk_count >= 6:
        return "medium"
    return "short"


def runtime_eval_stratum_key(paper: RuntimeEvalPaperRecord) -> str:
    return "|".join(
        (
            paper.primary_source_system or "unknown",
            _table_profile(paper),
            _size_profile(paper),
        )
    )


def fetch_runtime_eval_population(
    *,
    graph_run_id: str,
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    connect: Callable[..., object] | None = None,
) -> list[RuntimeEvalPaperRecord]:
    connect_fn = connect or db.connect
    with connect_fn() as conn, conn.cursor() as cur:
        cur.execute(_EVAL_POPULATION_SQL, (graph_run_id, chunk_version_key))
        return [
            RuntimeEvalPaperRecord.model_validate(dict(row))
            for row in cur.fetchall()
        ]


def select_stratified_sample(
    papers: Sequence[RuntimeEvalPaperRecord],
    *,
    sample_size: int,
    seed: int = 7,
) -> list[RuntimeEvalPaperRecord]:
    if sample_size <= 0 or sample_size >= len(papers):
        return list(sorted(papers, key=lambda paper: paper.corpus_id))

    rng = Random(seed)
    grouped: dict[str, list[RuntimeEvalPaperRecord]] = {}
    for paper in papers:
        grouped.setdefault(runtime_eval_stratum_key(paper), []).append(paper)
    for rows in grouped.values():
        rng.shuffle(rows)

    selected: list[RuntimeEvalPaperRecord] = []
    ordered_keys = sorted(grouped)
    while len(selected) < sample_size and any(grouped.values()):
        for key in ordered_keys:
            rows = grouped[key]
            if not rows:
                continue
            selected.append(rows.pop())
            if len(selected) >= sample_size:
                break
    return sorted(selected, key=lambda paper: paper.corpus_id)


def build_runtime_eval_query_cases(
    papers: Sequence[RuntimeEvalPaperRecord],
    *,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
) -> list[RuntimeEvalQueryCase]:
    active_families = list(
        query_families
        or (
            RuntimeEvalQueryFamily.TITLE_GLOBAL,
            RuntimeEvalQueryFamily.TITLE_SELECTED,
            RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
        )
    )
    cases: list[RuntimeEvalQueryCase] = []
    for paper in papers:
        stratum_key = runtime_eval_stratum_key(paper)
        title_query = _normalize_query_text(
            paper.title,
            max_chars=_TITLE_MAX_CHARS,
        )
        sentence_query = (
            _normalize_query_text(
                paper.representative_sentence,
                max_chars=_SENTENCE_MAX_CHARS,
                max_words=_SENTENCE_MAX_WORDS,
            )
            if paper.representative_sentence
            else ""
        )
        for family in active_families:
            if family == RuntimeEvalQueryFamily.TITLE_GLOBAL and title_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=title_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                    )
                )
            elif family == RuntimeEvalQueryFamily.TITLE_SELECTED and title_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=title_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                        selected_layer_key="paper",
                        selected_node_id=f"paper:{paper.corpus_id}",
                    )
                )
            elif family == RuntimeEvalQueryFamily.SENTENCE_GLOBAL and sentence_query:
                cases.append(
                    RuntimeEvalQueryCase(
                        corpus_id=paper.corpus_id,
                        title=paper.title,
                        primary_source_system=paper.primary_source_system,
                        query_family=family,
                        query=sentence_query,
                        stratum_key=stratum_key,
                        representative_section_role=paper.representative_section_role,
                    )
                )
    return cases


def _build_runtime_service(
    *,
    chunk_version_key: str,
    connect: Callable[..., object] | None = None,
) -> RagService:
    connect_fn = connect or db.connect
    repository = PostgresRagRepository(connect=connect_fn)
    warehouse_grounder = partial(
        build_grounded_answer_from_runtime,
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    return RagService(repository=repository, warehouse_grounder=warehouse_grounder)


def evaluate_runtime_query_cases(
    *,
    graph_release_id: str,
    chunk_version_key: str,
    cases: Sequence[RuntimeEvalQueryCase],
    k: int = 5,
    rerank_topn: int = 10,
    connect: Callable[..., object] | None = None,
) -> list[RuntimeEvalCaseResult]:
    service = _build_runtime_service(
        chunk_version_key=chunk_version_key,
        connect=connect,
    )
    results: list[RuntimeEvalCaseResult] = []
    total_cases = len(cases)
    for index, case in enumerate(cases, start=1):
        if index % 25 == 0 or index == total_cases:
            print(
                f"[runtime-eval] evaluated {index}/{total_cases} cases",
                file=sys.stderr,
                flush=True,
            )
        try:
            started = perf_counter()
            response = service.search(
                RagSearchRequest(
                    graph_release_id=graph_release_id,
                    query=case.query,
                    selected_layer_key=case.selected_layer_key,
                    selected_node_id=case.selected_node_id,
                    k=k,
                    rerank_topn=max(k, rerank_topn),
                    generate_answer=True,
                )
            )
            duration_ms = (perf_counter() - started) * 1000
        except Exception as exc:  # pragma: no cover - exercised in integration runs
            results.append(
                RuntimeEvalCaseResult(
                    corpus_id=case.corpus_id,
                    title=case.title,
                    primary_source_system=case.primary_source_system,
                    query_family=case.query_family,
                    query=case.query,
                    stratum_key=case.stratum_key,
                    representative_section_role=case.representative_section_role,
                    duration_ms=0.0,
                    error=str(exc),
                )
            )
            continue

        top_corpus_ids = [bundle.paper.corpus_id for bundle in response.evidence_bundles]
        hit_rank = None
        for rank, corpus_id in enumerate(top_corpus_ids, start=1):
            if corpus_id == case.corpus_id:
                hit_rank = rank
                break
        grounded_answer = response.grounded_answer
        grounded_ids = (
            grounded_answer.answer_linked_corpus_ids
            if grounded_answer is not None
            else []
        )
        results.append(
            RuntimeEvalCaseResult(
                corpus_id=case.corpus_id,
                title=case.title,
                primary_source_system=case.primary_source_system,
                query_family=case.query_family,
                query=case.query,
                stratum_key=case.stratum_key,
                representative_section_role=case.representative_section_role,
                evidence_bundle_count=len(response.evidence_bundles),
                top_corpus_ids=top_corpus_ids,
                hit_rank=hit_rank,
                answer_present=bool(response.answer),
                answer_corpus_ids=response.answer_corpus_ids,
                target_in_answer_corpus=case.corpus_id in response.answer_corpus_ids,
                grounded_answer_present=grounded_answer is not None,
                grounded_answer_linked_corpus_ids=grounded_ids,
                target_in_grounded_answer=case.corpus_id in grounded_ids,
                cited_span_count=(len(grounded_answer.cited_spans) if grounded_answer else 0),
                inline_citation_count=(
                    len(grounded_answer.inline_citations) if grounded_answer else 0
                ),
                answer_segment_count=(len(grounded_answer.segments) if grounded_answer else 0),
                retrieval_channel_hit_counts={
                    channel.channel: len(channel.hits)
                    for channel in response.retrieval_channels
                },
                duration_ms=duration_ms,
                top_hits=[
                    RuntimeEvalTopHit(
                        corpus_id=bundle.paper.corpus_id,
                        title=bundle.paper.title,
                        rank=bundle.rank,
                        score=bundle.score,
                        matched_channels=[str(channel) for channel in bundle.matched_channels],
                    )
                    for bundle in response.evidence_bundles[:3]
                ],
            )
        )
    return results


def summarize_warehouse_quality(
    report: RagWarehouseQualityReport,
) -> WarehouseQualitySummary:
    flag_counts = Counter()
    for paper in report.papers:
        flag_counts.update(paper.flags)
    return WarehouseQualitySummary(
        papers=len(report.papers),
        flagged_papers=len(report.flagged_corpus_ids),
        flag_counts=dict(sorted(flag_counts.items())),
    )


def _round_rate(value: float) -> float:
    return round(value, 4)


def _aggregate_case_results(results: Sequence[RuntimeEvalCaseResult]) -> RuntimeEvalAggregate:
    if not results:
        return RuntimeEvalAggregate()
    cases = len(results)
    channel_presence: Counter[str] = Counter()
    bundle_count_total = 0
    cited_span_total = 0
    hit_at_1 = 0
    hit_at_k = 0
    answer_present = 0
    answer_target = 0
    grounded = 0
    grounded_target = 0
    errors = 0
    durations: list[float] = []
    for result in results:
        if result.error:
            errors += 1
        if result.hit_rank == 1:
            hit_at_1 += 1
        if result.hit_rank is not None:
            hit_at_k += 1
        if result.answer_present:
            answer_present += 1
        if result.target_in_answer_corpus:
            answer_target += 1
        if result.grounded_answer_present:
            grounded += 1
        if result.target_in_grounded_answer:
            grounded_target += 1
        bundle_count_total += result.evidence_bundle_count
        cited_span_total += result.cited_span_count
        durations.append(result.duration_ms)
        for channel_name, hit_count in result.retrieval_channel_hit_counts.items():
            if hit_count > 0:
                channel_presence[channel_name] += 1
    sorted_durations = sorted(durations)
    p95_index = max(ceil(len(sorted_durations) * 0.95) - 1, 0)
    return RuntimeEvalAggregate(
        cases=cases,
        hit_at_1_rate=_round_rate(hit_at_1 / cases),
        hit_at_k_rate=_round_rate(hit_at_k / cases),
        answer_present_rate=_round_rate(answer_present / cases),
        target_in_answer_corpus_rate=_round_rate(answer_target / cases),
        grounded_answer_rate=_round_rate(grounded / cases),
        target_in_grounded_answer_rate=_round_rate(grounded_target / cases),
        mean_bundle_count=round(bundle_count_total / cases, 3),
        mean_cited_span_count=round(cited_span_total / cases, 3),
        mean_duration_ms=round(sum(durations) / cases, 3),
        p95_duration_ms=round(sorted_durations[p95_index], 3),
        error_count=errors,
        retrieval_channel_presence_rates={
            channel_name: _round_rate(count / cases)
            for channel_name, count in sorted(channel_presence.items())
        },
    )


def _failure_reasons(result: RuntimeEvalCaseResult) -> list[str]:
    reasons: list[str] = []
    if result.error:
        reasons.append("error")
        return reasons
    if result.hit_rank is None:
        reasons.append("target_miss")
    if result.answer_present and not result.target_in_answer_corpus:
        reasons.append("answer_missing_target")
    if not result.grounded_answer_present:
        reasons.append("ungrounded_answer")
    elif not result.target_in_grounded_answer:
        reasons.append("grounded_answer_missing_target")
    return reasons


def summarize_runtime_results(
    results: Sequence[RuntimeEvalCaseResult],
    *,
    failure_example_limit: int = 20,
) -> RuntimeEvalSummary:
    overall = _aggregate_case_results(results)
    by_query_family: dict[str, RuntimeEvalAggregate] = {}
    by_source_system: dict[str, RuntimeEvalAggregate] = {}
    failure_theme_counts: Counter[str] = Counter()
    failure_examples: list[RuntimeEvalFailureExample] = []

    family_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    source_groups: dict[str, list[RuntimeEvalCaseResult]] = {}
    for result in results:
        family_groups.setdefault(str(result.query_family), []).append(result)
        source_groups.setdefault(result.primary_source_system, []).append(result)
        reasons = _failure_reasons(result)
        for reason in reasons:
            failure_theme_counts[f"{result.query_family}:{reason}"] += 1
        if reasons and len(failure_examples) < failure_example_limit:
            failure_examples.append(
                RuntimeEvalFailureExample(
                    corpus_id=result.corpus_id,
                    title=result.title,
                    primary_source_system=result.primary_source_system,
                    query_family=result.query_family,
                    query=result.query,
                    stratum_key=result.stratum_key,
                    failure_reasons=reasons,
                    top_hits=result.top_hits,
                )
            )

    for key, grouped in family_groups.items():
        by_query_family[key] = _aggregate_case_results(grouped)
    for key, grouped in source_groups.items():
        by_source_system[key] = _aggregate_case_results(grouped)

    return RuntimeEvalSummary(
        overall=overall,
        by_query_family=by_query_family,
        by_source_system=by_source_system,
        failure_theme_counts=dict(failure_theme_counts.most_common()),
        failure_examples=failure_examples,
    )


def _population_summary(
    *,
    population: Sequence[RuntimeEvalPaperRecord],
    sample: Sequence[RuntimeEvalPaperRecord],
) -> RuntimeEvalPopulationSummary:
    source_counts = Counter(paper.primary_source_system for paper in sample)
    stratum_counts = Counter(runtime_eval_stratum_key(paper) for paper in sample)
    sentence_seed_papers = sum(1 for paper in sample if paper.representative_sentence)
    return RuntimeEvalPopulationSummary(
        population_papers=len(population),
        sampled_papers=len(sample),
        sentence_seed_papers=sentence_seed_papers,
        sampled_by_source_system=dict(sorted(source_counts.items())),
        sampled_by_stratum=dict(sorted(stratum_counts.items())),
    )


def run_rag_runtime_evaluation(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    sample_size: int = 96,
    seed: int = 7,
    k: int = 5,
    rerank_topn: int = 10,
    corpus_ids: Sequence[int] | None = None,
    query_families: Sequence[RuntimeEvalQueryFamily] | None = None,
    connect: Callable[..., object] | None = None,
) -> RagRuntimeEvaluationReport:
    connect_fn = connect or db.connect
    repository = PostgresRagRepository(connect=connect_fn)
    release = repository.resolve_graph_release(graph_release_id)
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    if corpus_ids:
        requested_ids = {int(corpus_id) for corpus_id in corpus_ids}
        sample = [paper for paper in population if paper.corpus_id in requested_ids]
    else:
        sample = select_stratified_sample(
            population,
            sample_size=sample_size,
            seed=seed,
        )
    sample_corpus_ids = [paper.corpus_id for paper in sample]
    warehouse_quality = inspect_rag_warehouse_quality(
        corpus_ids=sample_corpus_ids,
        chunk_version_key=chunk_version_key,
        loader=PostgresWarehouseQualityLoader(connect=connect_fn),
    )
    runtime_status = get_grounded_answer_runtime_status(
        corpus_ids=sample_corpus_ids,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    cases = build_runtime_eval_query_cases(
        sample,
        query_families=query_families,
    )
    results = evaluate_runtime_query_cases(
        graph_release_id=release.graph_release_id,
        chunk_version_key=chunk_version_key,
        cases=cases,
        k=k,
        rerank_topn=rerank_topn,
        connect=connect_fn,
    )
    return RagRuntimeEvaluationReport(
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        bundle_checksum=release.bundle_checksum,
        graph_name=release.graph_name,
        chunk_version_key=chunk_version_key,
        query_families=list(
            query_families
            or (
                RuntimeEvalQueryFamily.TITLE_GLOBAL,
                RuntimeEvalQueryFamily.TITLE_SELECTED,
                RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            )
        ),
        population=_population_summary(population=population, sample=sample),
        warehouse_quality=summarize_warehouse_quality(warehouse_quality),
        grounding_runtime_status=runtime_status,
        summary=summarize_runtime_results(results),
        cases=results,
    )
