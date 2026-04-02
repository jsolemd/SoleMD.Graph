"""Dense retrieval contract and biomedical reranker audit over runtime-eval cohorts."""

from __future__ import annotations

import json
import statistics
from dataclasses import dataclass
from typing import Literal

from app import db
from app.rag.biomedical_models import (
    get_medcpt_article_encoder,
    get_medcpt_query_encoder,
    get_medcpt_reranker,
    get_specter2_proximity_paper_encoder,
)
from app.rag.biomedical_text import (
    article_parts as build_article_parts,
)
from app.rag.biomedical_text import (
    article_text as build_article_text,
)
from app.rag.parse_contract import ParseContractModel
from app.rag.query_embedding import get_query_embedder
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_models import RuntimeEvalQueryCase, RuntimeEvalQueryFamily
from app.rag_ingest.runtime_eval_population import (
    build_runtime_eval_query_cases,
    fetch_runtime_eval_population,
    select_stratified_sample,
)

_DENSE_AUDIT_PAPERS_SQL = """
SELECT
    p.corpus_id,
    COALESCE(NULLIF(trim(p.title), ''), concat('Corpus ', p.corpus_id)) AS title,
    COALESCE(p.abstract, '') AS abstract,
    p.embedding::text AS embedding_text,
    d.primary_source_system
FROM solemd.papers p
LEFT JOIN solemd.paper_documents d
  ON d.corpus_id = p.corpus_id
WHERE p.corpus_id = ANY(%s)
ORDER BY p.corpus_id
"""

_ScoreKind = Literal["cosine", "inner_product"]


class DenseAuditPaper(ParseContractModel):
    corpus_id: int
    title: str
    abstract: str = ""
    primary_source_system: str | None = None
    stored_embedding: list[float] | None = None


class DenseAuditAggregate(ParseContractModel):
    cases: int
    hit_at_1_rate: float
    hit_at_5_rate: float
    mean_reciprocal_rank: float
    mean_target_rank: float


class DenseAuditFailureExample(ParseContractModel):
    corpus_id: int
    query_family: RuntimeEvalQueryFamily
    query: str
    target_rank: int
    top_corpus_ids: list[int]


class DenseAuditLaneReport(ParseContractModel):
    lane_key: str
    query_encoder_backend: str
    paper_encoder_backend: str
    score_kind: _ScoreKind
    overall: DenseAuditAggregate
    by_query_family: dict[str, DenseAuditAggregate]
    failure_examples: list[DenseAuditFailureExample]


class DenseAuditAlignmentReport(ParseContractModel):
    paper_count: int
    mean_self_cosine: float
    p50_self_cosine: float
    min_self_cosine: float
    top1_agreement_rate: float
    mean_top10_overlap_rate: float


class DenseAuditReport(ParseContractModel):
    graph_release_id: str
    graph_run_id: str
    chunk_version_key: str
    sample_size: int
    sampled_papers: int
    dense_candidate_papers: int
    query_case_count: int
    query_families: list[RuntimeEvalQueryFamily]
    dropped_missing_embedding_corpus_ids: list[int]
    query_embedder_status: dict[str, object]
    specter2_proximity_status: dict[str, object]
    medcpt_query_status: dict[str, object]
    medcpt_article_status: dict[str, object]
    medcpt_reranker_status: dict[str, object]
    specter2_alignment: DenseAuditAlignmentReport
    lane_reports: list[DenseAuditLaneReport]
    rerank_reports: list[DenseAuditLaneReport]


@dataclass(frozen=True)
class _LaneSpec:
    lane_key: str
    query_backend: str
    paper_backend: str
    score_kind: _ScoreKind
    paper_matrix: object
    query_vectors: dict[str, list[float]]


@dataclass(frozen=True)
class _LaneCaseResult:
    case: RuntimeEvalQueryCase
    target_rank: int
    ranked_corpus_ids: list[int]


def parse_vector_literal(text: str | None) -> list[float] | None:
    if not text:
        return None
    return [float(value) for value in json.loads(text)]


def article_parts(paper: DenseAuditPaper) -> list[str]:
    return build_article_parts(title=paper.title, abstract=paper.abstract)


def article_text(paper: DenseAuditPaper) -> str:
    return build_article_text(title=paper.title, abstract=paper.abstract)


def aggregate_rank_metrics(ranks: list[int], *, k: int) -> DenseAuditAggregate:
    if not ranks:
        return DenseAuditAggregate(
            cases=0,
            hit_at_1_rate=0.0,
            hit_at_5_rate=0.0,
            mean_reciprocal_rank=0.0,
            mean_target_rank=0.0,
        )
    rank_count = len(ranks)
    return DenseAuditAggregate(
        cases=rank_count,
        hit_at_1_rate=round(sum(rank == 1 for rank in ranks) / rank_count, 4),
        hit_at_5_rate=round(sum(rank <= k for rank in ranks) / rank_count, 4),
        mean_reciprocal_rank=round(sum(1.0 / rank for rank in ranks) / rank_count, 4),
        mean_target_rank=round(sum(ranks) / rank_count, 3),
    )


def _fetch_dense_audit_papers(
    *,
    corpus_ids: list[int],
    connect,
) -> list[DenseAuditPaper]:
    if not corpus_ids:
        return []
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute(_DENSE_AUDIT_PAPERS_SQL, (corpus_ids,))
            rows = cur.fetchall()
    return [
        DenseAuditPaper(
            corpus_id=int(row["corpus_id"]),
            title=row["title"],
            abstract=row.get("abstract") or "",
            primary_source_system=row.get("primary_source_system"),
            stored_embedding=parse_vector_literal(row.get("embedding_text")),
        )
        for row in rows
    ]


def _top10_overlap_rate(left: list[int], right: list[int]) -> float:
    left_top = set(left[:10])
    right_top = set(right[:10])
    if not left_top and not right_top:
        return 1.0
    if not left_top or not right_top:
        return 0.0
    return len(left_top & right_top) / 10.0


def _cosine_scores(query_vector, paper_matrix):
    import torch
    import torch.nn.functional as F

    normalized_query = F.normalize(query_vector.unsqueeze(0), p=2, dim=1)
    normalized_papers = F.normalize(paper_matrix, p=2, dim=1)
    return torch.matmul(normalized_query, normalized_papers.T).squeeze(0)


def _inner_product_scores(query_vector, paper_matrix):
    import torch

    return torch.matmul(query_vector.unsqueeze(0), paper_matrix.T).squeeze(0)


def _evaluate_lane(
    *,
    cases: list[RuntimeEvalQueryCase],
    paper_ids: list[int],
    lane_spec: _LaneSpec,
    top_k: int,
) -> tuple[DenseAuditLaneReport, dict[tuple[int, str, str], _LaneCaseResult]]:
    import torch

    results_by_key: dict[tuple[int, str, str], _LaneCaseResult] = {}
    ranks_by_family: dict[str, list[int]] = {}
    all_ranks: list[int] = []
    failures: list[DenseAuditFailureExample] = []

    for case in cases:
        query_vector = torch.tensor(lane_spec.query_vectors[case.query], dtype=torch.float32)
        if lane_spec.score_kind == "cosine":
            scores = _cosine_scores(query_vector, lane_spec.paper_matrix)
        else:
            scores = _inner_product_scores(query_vector, lane_spec.paper_matrix)
        ranked_indices = torch.argsort(scores, descending=True).tolist()
        ranked_corpus_ids = [paper_ids[index] for index in ranked_indices]
        target_rank = ranked_corpus_ids.index(case.corpus_id) + 1

        key = (case.corpus_id, str(case.query_family), case.query)
        results_by_key[key] = _LaneCaseResult(
            case=case,
            target_rank=target_rank,
            ranked_corpus_ids=ranked_corpus_ids,
        )
        all_ranks.append(target_rank)
        ranks_by_family.setdefault(str(case.query_family), []).append(target_rank)
        if target_rank > 1 and len(failures) < 12:
            failures.append(
                DenseAuditFailureExample(
                    corpus_id=case.corpus_id,
                    query_family=case.query_family,
                    query=case.query,
                    target_rank=target_rank,
                    top_corpus_ids=ranked_corpus_ids[:top_k],
                )
            )

    return (
        DenseAuditLaneReport(
            lane_key=lane_spec.lane_key,
            query_encoder_backend=lane_spec.query_backend,
            paper_encoder_backend=lane_spec.paper_backend,
            score_kind=lane_spec.score_kind,
            overall=aggregate_rank_metrics(all_ranks, k=top_k),
            by_query_family={
                family: aggregate_rank_metrics(ranks, k=top_k)
                for family, ranks in sorted(ranks_by_family.items())
            },
            failure_examples=failures,
        ),
        results_by_key,
    )


def _rerank_lane(
    *,
    base_report: DenseAuditLaneReport,
    base_results: dict[tuple[int, str, str], _LaneCaseResult],
    cases: list[RuntimeEvalQueryCase],
    papers_by_id: dict[int, DenseAuditPaper],
    rerank_topn: int,
    top_k: int,
) -> DenseAuditLaneReport:
    reranker = get_medcpt_reranker()
    all_ranks: list[int] = []
    ranks_by_family: dict[str, list[int]] = {}
    failures: list[DenseAuditFailureExample] = []

    for case in cases:
        key = (case.corpus_id, str(case.query_family), case.query)
        base_case = base_results[key]
        head_ids = base_case.ranked_corpus_ids[:rerank_topn]
        rerank_pairs = [
            [case.query, article_text(papers_by_id[corpus_id])]
            for corpus_id in head_ids
        ]
        rerank_scores = reranker.score_pairs(rerank_pairs)
        reranked_head = [
            corpus_id
            for corpus_id, _ in sorted(
                zip(head_ids, rerank_scores, strict=True),
                key=lambda item: item[1],
                reverse=True,
            )
        ]
        reranked_corpus_ids = reranked_head + [
            corpus_id
            for corpus_id in base_case.ranked_corpus_ids
            if corpus_id not in set(reranked_head)
        ]
        target_rank = reranked_corpus_ids.index(case.corpus_id) + 1
        all_ranks.append(target_rank)
        ranks_by_family.setdefault(str(case.query_family), []).append(target_rank)
        if target_rank > 1 and len(failures) < 12:
            failures.append(
                DenseAuditFailureExample(
                    corpus_id=case.corpus_id,
                    query_family=case.query_family,
                    query=case.query,
                    target_rank=target_rank,
                    top_corpus_ids=reranked_corpus_ids[:top_k],
                )
            )

    return DenseAuditLaneReport(
        lane_key=f"{base_report.lane_key}+medcpt_cross_encoder",
        query_encoder_backend=base_report.query_encoder_backend,
        paper_encoder_backend=f"{base_report.paper_encoder_backend}+medcpt_cross_encoder",
        score_kind=base_report.score_kind,
        overall=aggregate_rank_metrics(all_ranks, k=top_k),
        by_query_family={
            family: aggregate_rank_metrics(ranks, k=top_k)
            for family, ranks in sorted(ranks_by_family.items())
        },
        failure_examples=failures,
    )


def run_dense_contract_audit(
    *,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    sample_size: int = 0,
    seed: int = 7,
    top_k: int = 5,
    rerank_topn: int = 10,
    query_families: list[RuntimeEvalQueryFamily] | None = None,
    connect=None,
) -> DenseAuditReport:
    import torch

    connect_fn = connect or db.pooled
    repository = PostgresRagRepository(
        connect=connect_fn,
        chunk_version_key=chunk_version_key,
    )
    release = repository.resolve_graph_release(graph_release_id)
    population = fetch_runtime_eval_population(
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    initial_sample = (
        select_stratified_sample(population, sample_size=sample_size, seed=seed)
        if sample_size > 0
        else population
    )
    audit_papers = _fetch_dense_audit_papers(
        corpus_ids=[paper.corpus_id for paper in initial_sample],
        connect=connect_fn,
    )
    papers_by_id = {paper.corpus_id: paper for paper in audit_papers}
    missing_embedding_ids = sorted(
        paper.corpus_id
        for paper in audit_papers
        if not paper.stored_embedding
    )
    sample = [
        paper
        for paper in initial_sample
        if paper.corpus_id in papers_by_id
        and paper.corpus_id not in missing_embedding_ids
    ]
    dense_papers = [papers_by_id[paper.corpus_id] for paper in sample]
    paper_ids = [paper.corpus_id for paper in dense_papers]
    paper_lookup = {paper.corpus_id: paper for paper in dense_papers}
    active_families = query_families or [
        RuntimeEvalQueryFamily.TITLE_GLOBAL,
        RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
    ]
    cases = build_runtime_eval_query_cases(sample, query_families=active_families)

    query_texts = list(dict.fromkeys(case.query for case in cases))
    query_embedder = get_query_embedder()
    query_vectors = {
        query: query_embedder.encode(query) or []
        for query in query_texts
    }
    if any(not vector for vector in query_vectors.values()):
        failed = [query for query, vector in query_vectors.items() if not vector]
        raise RuntimeError(f"Failed to encode SPECTER2 queries: {failed[:3]}")

    specter2_proximity = get_specter2_proximity_paper_encoder()
    medcpt_query = get_medcpt_query_encoder()
    medcpt_article = get_medcpt_article_encoder()

    article_pairs = [article_parts(paper) for paper in dense_papers]
    specter2_local_vectors = specter2_proximity.encode_articles(article_pairs)
    medcpt_article_vectors = medcpt_article.encode_articles(article_pairs)
    medcpt_query_vectors = dict(
        zip(
            query_texts,
            medcpt_query.encode_queries(query_texts),
            strict=True,
        )
    )

    stored_matrix = torch.tensor(
        [paper.stored_embedding for paper in dense_papers],  # type: ignore[list-item]
        dtype=torch.float32,
    )
    specter2_local_matrix = torch.tensor(specter2_local_vectors, dtype=torch.float32)
    medcpt_article_matrix = torch.tensor(medcpt_article_vectors, dtype=torch.float32)

    lane_specs = [
        _LaneSpec(
            lane_key="specter2_stored_api",
            query_backend="specter2_adhoc_query",
            paper_backend="s2_api_embedding.specter_v2",
            score_kind="cosine",
            paper_matrix=stored_matrix,
            query_vectors=query_vectors,
        ),
        _LaneSpec(
            lane_key="specter2_local_proximity",
            query_backend="specter2_adhoc_query",
            paper_backend="specter2_proximity_local",
            score_kind="cosine",
            paper_matrix=specter2_local_matrix,
            query_vectors=query_vectors,
        ),
        _LaneSpec(
            lane_key="medcpt_dual_encoder",
            query_backend="medcpt_query",
            paper_backend="medcpt_article",
            score_kind="inner_product",
            paper_matrix=medcpt_article_matrix,
            query_vectors=medcpt_query_vectors,
        ),
    ]

    lane_reports: list[DenseAuditLaneReport] = []
    lane_results: dict[str, dict[tuple[int, str, str], _LaneCaseResult]] = {}
    for lane_spec in lane_specs:
        report, results = _evaluate_lane(
            cases=cases,
            paper_ids=paper_ids,
            lane_spec=lane_spec,
            top_k=top_k,
        )
        lane_reports.append(report)
        lane_results[lane_spec.lane_key] = results

    import torch.nn.functional as F

    normalized_stored = F.normalize(stored_matrix, p=2, dim=1)
    normalized_local = F.normalize(specter2_local_matrix, p=2, dim=1)
    self_cosines = torch.sum(normalized_stored * normalized_local, dim=1).tolist()
    stored_rankings = lane_results["specter2_stored_api"]
    local_rankings = lane_results["specter2_local_proximity"]
    ranking_keys = list(stored_rankings.keys())
    top1_agreement = sum(
        stored_rankings[key].ranked_corpus_ids[0] == local_rankings[key].ranked_corpus_ids[0]
        for key in ranking_keys
    ) / max(len(ranking_keys), 1)
    top10_overlap = [
        _top10_overlap_rate(
            stored_rankings[key].ranked_corpus_ids,
            local_rankings[key].ranked_corpus_ids,
        )
        for key in ranking_keys
    ]
    alignment = DenseAuditAlignmentReport(
        paper_count=len(dense_papers),
        mean_self_cosine=round(sum(self_cosines) / len(self_cosines), 4),
        p50_self_cosine=round(statistics.median(self_cosines), 4),
        min_self_cosine=round(min(self_cosines), 4),
        top1_agreement_rate=round(top1_agreement, 4),
        mean_top10_overlap_rate=round(sum(top10_overlap) / len(top10_overlap), 4),
    )

    rerank_reports = [
        _rerank_lane(
            base_report=report,
            base_results=lane_results[report.lane_key],
            cases=cases,
            papers_by_id=paper_lookup,
            rerank_topn=rerank_topn,
            top_k=top_k,
        )
        for report in lane_reports
    ]

    return DenseAuditReport(
        graph_release_id=release.graph_release_id,
        graph_run_id=release.graph_run_id,
        chunk_version_key=chunk_version_key,
        sample_size=sample_size,
        sampled_papers=len(sample),
        dense_candidate_papers=len(dense_papers),
        query_case_count=len(cases),
        query_families=active_families,
        dropped_missing_embedding_corpus_ids=missing_embedding_ids,
        query_embedder_status=query_embedder.runtime_status(),
        specter2_proximity_status=specter2_proximity.runtime_status(),
        medcpt_query_status=medcpt_query.runtime_status(),
        medcpt_article_status=medcpt_article.runtime_status(),
        medcpt_reranker_status=get_medcpt_reranker().runtime_status(),
        specter2_alignment=alignment,
        lane_reports=lane_reports,
        rerank_reports=rerank_reports,
    )
