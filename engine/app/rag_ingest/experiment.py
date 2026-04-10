"""Langfuse-native experiment runner for RAG benchmark evaluation.

Uses Langfuse's ``dataset.run_experiment()`` API.  Benchmarks live as
Langfuse Datasets; each run creates a dataset run visible in the Langfuse
UI with automatic trace linking, structural per-item scores, and aggregate
run-level metrics.

Qualitative judgment (faithfulness, relevance) is done by the agent
reading trace outputs directly — not by automated LLM-as-judge calls.

Usage (from scripts/rag_benchmark.py)::

    from app.rag_ingest.experiment import run_benchmark

    result = run_benchmark(
        dataset_name="benchmark-adversarial_router_v1",
        run_name="baseline-2026-04-05",
    )
    print(result.format())
    print(result.dataset_run_url)
"""

from __future__ import annotations

import logging
import threading
from typing import Any

from app import db
from app.langfuse_config import (
    SCORE_DISPLAY_AUTHOR_COVERAGE,
    SCORE_DISPLAY_JOURNAL_COVERAGE,
    SCORE_DISPLAY_STUDY_METADATA_COVERAGE,
    SCORE_DISPLAY_YEAR_COVERAGE,
    SCORE_DURATION_MS,
    SCORE_EVIDENCE_BUNDLE_COUNT,
    SCORE_GROUNDED_ANSWER_RATE,
    SCORE_HIT_AT_1,
    SCORE_HIT_AT_K,
    SCORE_MRR,
    SCORE_TARGET_IN_CORPUS,
    SCORE_TARGET_IN_GROUNDED,
)
from app.langfuse_config import (
    langfuse_api as _langfuse_api,
)
from app.rag.response_serialization import serialize_search_result
from app.rag.schemas import RagSearchRequest
from app.rag.types import EvidenceIntent
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval_execution import build_runtime_service
from app.rag_ingest.runtime_eval_summary import _route_signature

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Task function — wraps RagService.search_result()
# ---------------------------------------------------------------------------


def _build_request_from_item(
    item_input: dict[str, Any],
    *,
    graph_release_id: str,
    k: int,
    rerank_topn: int,
    use_lexical: bool,
    use_dense_query: bool,
) -> RagSearchRequest:
    """Map Langfuse DatasetItem input to a RagSearchRequest."""
    evidence_intent = item_input.get("evidence_intent")
    if evidence_intent and isinstance(evidence_intent, str) and evidence_intent != "None":
        evidence_intent = EvidenceIntent(evidence_intent)
    else:
        evidence_intent = None

    return RagSearchRequest(
        graph_release_id=graph_release_id,
        query=item_input["query"],
        selected_layer_key=item_input.get("selected_layer_key"),
        selected_node_id=item_input.get("selected_node_id"),
        selection_graph_paper_refs=list(item_input.get("selection_graph_paper_refs") or []),
        cited_corpus_ids=list(item_input.get("cited_corpus_ids") or []),
        evidence_intent=evidence_intent,
        k=k,
        rerank_topn=max(k, rerank_topn),
        generate_answer=True,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
    )


_SIGNAL_FIELDS = [
    "lexical_score",
    "chunk_lexical_score",
    "dense_score",
    "entity_score",
    "relation_score",
    "citation_boost",
    "citation_intent_score",
    "title_anchor_score",
    "passage_alignment_score",
    "selected_context_score",
    "cited_context_score",
    "intent_score",
    "publication_type_score",
    "evidence_quality_score",
    "clinical_prior_score",
    "biomedical_rerank_score",
    "fused_score",
]


def _extract_signal_scores(hit) -> dict[str, float]:
    """Extract all ranking signal scores from a PaperEvidenceHit."""
    scores = {}
    for field in _SIGNAL_FIELDS:
        scores[field] = float(getattr(hit, field, 0.0))
    scores["lane_count"] = float(getattr(hit, "lane_count", 0))
    channels = getattr(hit, "matched_channels", [])
    scores["matched_channels"] = [str(c) for c in channels] if channels else []
    return scores


def _display_metadata_coverage(response, *, limit: int = 3) -> dict[str, float]:
    """Measure how citeable the displayed evidence set is.

    Coverage is computed across the first ``limit`` evidence bundles because that is
    the study set the UI and answer prompts expose most prominently.
    """
    bundles = list(response.evidence_bundles[: max(limit, 0)])
    if not bundles:
        return {
            "display_author_coverage": 0.0,
            "display_journal_coverage": 0.0,
            "display_year_coverage": 0.0,
            "display_study_metadata_coverage": 0.0,
        }

    def _bundle_has_author(bundle) -> bool:
        return any(
            str(getattr(author, "name", "") or "").strip()
            for author in getattr(bundle, "authors", [])
        )

    def _bundle_has_journal(bundle) -> bool:
        return bool(str(getattr(bundle.paper, "journal_name", "") or "").strip())

    def _bundle_has_year(bundle) -> bool:
        year = getattr(bundle.paper, "year", None)
        return isinstance(year, int) and year > 0

    bundle_count = float(len(bundles))
    author_coverage = sum(1.0 for bundle in bundles if _bundle_has_author(bundle)) / bundle_count
    journal_coverage = sum(1.0 for bundle in bundles if _bundle_has_journal(bundle)) / bundle_count
    year_coverage = sum(1.0 for bundle in bundles if _bundle_has_year(bundle)) / bundle_count
    return {
        "display_author_coverage": round(author_coverage, 4),
        "display_journal_coverage": round(journal_coverage, 4),
        "display_year_coverage": round(year_coverage, 4),
        "display_study_metadata_coverage": round(
            (author_coverage + journal_coverage + year_coverage) / 3.0,
            4,
        ),
    }


def _serialize_task_output(
    internal_result,
    expected_output: dict[str, Any] | None,
) -> dict[str, Any]:
    """Convert a RuntimeSearchResult into the dict passed to evaluators."""
    response = serialize_search_result(internal_result)
    debug_trace = internal_result.debug_trace or {}
    session_flags = debug_trace.get("session_flags", {})

    target_corpus_id = (expected_output or {}).get("corpus_id")
    top_corpus_ids = [b.paper.corpus_id for b in response.evidence_bundles]

    hit_rank = None
    if target_corpus_id is not None:
        for rank, cid in enumerate(top_corpus_ids, start=1):
            if cid == target_corpus_id:
                hit_rank = rank
                break

    grounded = response.grounded_answer
    grounded_ids = grounded.answer_linked_corpus_ids if grounded else []

    # Build context string for trace output (readable evidence summary)
    context_parts = []
    for i, b in enumerate(response.evidence_bundles[:5]):
        title = b.paper.title or "Unknown"
        snippet = b.snippet or ""
        context_parts.append(f"[{i + 1}] (ID: {b.paper.corpus_id}) {title}\n    {snippet}")
    context_str = "\n\n".join(context_parts) if context_parts else "(no evidence retrieved)"

    source_system = (expected_output or {}).get("primary_source_system")

    # Signal decomposition: extract per-signal scores from raw EvidenceBundle hits
    # Target paper signals (for understanding why it ranked where it did)
    target_signals: dict[str, Any] = {}
    top1_signals: dict[str, Any] = {}
    fused_score_gap = 0.0
    display_metadata = _display_metadata_coverage(response)

    raw_bundles = internal_result.bundles or []
    if raw_bundles:
        # Top-1 paper signals (what won the ranking)
        top1_signals = _extract_signal_scores(raw_bundles[0].paper)

        # Target paper signals (if found in results)
        if target_corpus_id is not None:
            target_bundle = next(
                (b for b in raw_bundles if b.paper.corpus_id == target_corpus_id),
                None,
            )
            if target_bundle:
                target_signals = _extract_signal_scores(target_bundle.paper)
                fused_score_gap = top1_signals.get("fused_score", 0.0) - target_signals.get(
                    "fused_score", 0.0
                )
            else:
                # Target not in results — report zeros
                target_signals = {f: 0.0 for f in _SIGNAL_FIELDS}
                target_signals["lane_count"] = 0.0
                target_signals["matched_channels"] = []
                fused_score_gap = top1_signals.get("fused_score", 0.0)

    return {
        "hit_rank": hit_rank,
        "top_corpus_ids": top_corpus_ids,
        "target_corpus_id": target_corpus_id,
        "source_system": source_system,
        "answer": response.answer or "",
        "answer_corpus_ids": response.answer_corpus_ids,
        "target_in_answer_corpus": (
            target_corpus_id in response.answer_corpus_ids if target_corpus_id else False
        ),
        "grounded_answer_present": grounded is not None,
        "grounded_answer_linked_corpus_ids": grounded_ids,
        "target_in_grounded_answer": (
            target_corpus_id in grounded_ids if target_corpus_id else False
        ),
        "evidence_bundle_count": len(response.evidence_bundles),
        "cited_span_count": len(grounded.cited_spans) if grounded else 0,
        "duration_ms": float(internal_result.duration_ms),
        "route_signature": _route_signature(session_flags),
        "retrieval_profile": session_flags.get("retrieval_profile"),
        "warehouse_depth": (
            "fulltext"
            if (grounded and len(grounded.cited_spans) > 0)
            else "abstract"
            if grounded is not None
            else "none"
        ),
        "context": context_str,
        "error": None,
        # Signal decomposition for Langfuse-native analysis
        "target_signals": target_signals,
        "top1_signals": top1_signals,
        "fused_score_gap": fused_score_gap,
        **display_metadata,
    }


def _make_task_function(
    *,
    graph_release_id: str,
    chunk_version_key: str,
    k: int,
    rerank_topn: int,
    use_lexical: bool,
    use_dense_query: bool,
    tags: list[str] | None = None,
    session_id: str | None = None,
    user_id: str = "solemd.dev",
    connect=None,
):
    """Create a closure over the RAG service for use as a Langfuse task function.

    Uses a closure factory instead of functools.partial to avoid keyword
    collision with the ``**kwargs`` passthrough in the TaskFunction protocol.
    """
    connect_fn = connect or db.pooled
    service = build_runtime_service(
        chunk_version_key=chunk_version_key,
        connect=connect_fn,
    )
    warm = getattr(service, "warm", None)
    if callable(warm):
        try:
            warm()
        except Exception:  # pragma: no cover - benchmark warmup failure falls back to measured path
            logger.debug("rag_benchmark_service_warm_failed", exc_info=True)
    trace_tags = tags or []

    def task(*, item, **kwargs) -> dict[str, Any]:
        item_input = item.input if hasattr(item, "input") else item.get("input", {})
        expected = (
            item.expected_output
            if hasattr(item, "expected_output")
            else item.get("expected_output")
        )
        request = _build_request_from_item(
            item_input,
            graph_release_id=graph_release_id,
            k=k,
            rerank_topn=rerank_topn,
            use_lexical=use_lexical,
            use_dense_query=use_dense_query,
        )

        def _run():
            try:
                internal_result = service.search_result(request, include_debug_trace=True)
                return _serialize_task_output(internal_result, expected)
            except Exception as exc:
                logger.error("Task failed for query=%s: %s", item_input.get("query", "?"), exc)
                return {
                    "hit_rank": None,
                    "top_corpus_ids": [],
                    "target_corpus_id": (expected or {}).get("corpus_id"),
                    "source_system": (expected or {}).get("primary_source_system"),
                    "answer": "",
                    "answer_corpus_ids": [],
                    "target_in_answer_corpus": False,
                    "grounded_answer_present": False,
                    "grounded_answer_linked_corpus_ids": [],
                    "target_in_grounded_answer": False,
                    "evidence_bundle_count": 0,
                    "cited_span_count": 0,
                    "duration_ms": 0.0,
                    "route_signature": None,
                    "retrieval_profile": None,
                    "warehouse_depth": "none",
                    "context": "",
                    "error": str(exc),
                }

        # Apply trace metadata via propagate_attributes (v4 SDK)
        from langfuse import propagate_attributes

        propagate_kwargs: dict[str, Any] = {"trace_name": "experiment-item-run"}
        if trace_tags:
            propagate_kwargs["tags"] = trace_tags
        if user_id:
            propagate_kwargs["user_id"] = user_id
        if session_id:
            propagate_kwargs["session_id"] = session_id

        with propagate_attributes(**propagate_kwargs):
            return _run()

    return task


# ---------------------------------------------------------------------------
# 2. Item-level evaluators
# ---------------------------------------------------------------------------


def structural_evaluator(*, input, output, expected_output=None, metadata=None, **kwargs):
    """Return structural retrieval and grounding scores for a single item.

    Returns a list of Evaluation objects covering all retrieval dimensions.
    """
    from langfuse import Evaluation

    hit_rank = output.get("hit_rank")
    evals = [
        Evaluation(
            name=SCORE_HIT_AT_1,
            value=1.0 if hit_rank == 1 else 0.0,
            comment=f"rank={hit_rank}" if hit_rank else "not found",
        ),
        Evaluation(
            name=SCORE_HIT_AT_K,
            value=1.0 if hit_rank is not None else 0.0,
            comment=f"rank={hit_rank}" if hit_rank else "not in top-k",
        ),
        Evaluation(
            name=SCORE_MRR,
            value=1.0 / hit_rank if hit_rank else 0.0,
            comment=f"1/{hit_rank}" if hit_rank else "0",
        ),
        Evaluation(
            name=SCORE_GROUNDED_ANSWER_RATE,
            value=1.0 if output.get("grounded_answer_present") else 0.0,
        ),
        Evaluation(
            name=SCORE_TARGET_IN_GROUNDED,
            value=1.0 if output.get("target_in_grounded_answer") else 0.0,
        ),
        Evaluation(
            name=SCORE_TARGET_IN_CORPUS,
            value=1.0 if output.get("target_in_answer_corpus") else 0.0,
        ),
        Evaluation(
            name=SCORE_DURATION_MS,
            value=output.get("duration_ms", 0.0),
        ),
        Evaluation(
            name=SCORE_EVIDENCE_BUNDLE_COUNT,
            value=float(output.get("evidence_bundle_count", 0)),
        ),
        Evaluation(
            name=SCORE_DISPLAY_AUTHOR_COVERAGE,
            value=float(output.get("display_author_coverage", 0.0)),
        ),
        Evaluation(
            name=SCORE_DISPLAY_JOURNAL_COVERAGE,
            value=float(output.get("display_journal_coverage", 0.0)),
        ),
        Evaluation(
            name=SCORE_DISPLAY_YEAR_COVERAGE,
            value=float(output.get("display_year_coverage", 0.0)),
        ),
        Evaluation(
            name=SCORE_DISPLAY_STUDY_METADATA_COVERAGE,
            value=float(output.get("display_study_metadata_coverage", 0.0)),
        ),
    ]

    # Categorical scores
    # route_signature is intentionally NOT emitted as a score — it's a
    # high-cardinality arbitrary string that can't fit a categorical config.
    # The full signature lives in ``output["route_signature"]`` and in
    # observation metadata (``session_flags``) for diagnosis.
    warehouse_depth = output.get("warehouse_depth")
    if warehouse_depth:
        evals.append(
            Evaluation(
                name="warehouse_depth",
                value=warehouse_depth,
                data_type="CATEGORICAL",
            )
        )

    source_system = output.get("source_system")
    if source_system:
        evals.append(
            Evaluation(
                name="source_system",
                value=source_system,
                data_type="CATEGORICAL",
            )
        )

    retrieval_profile = output.get("retrieval_profile")
    if retrieval_profile:
        evals.append(
            Evaluation(
                name="retrieval_profile",
                value=str(retrieval_profile),
                data_type="CATEGORICAL",
            )
        )

    # Signal decomposition: per-signal scores for the TARGET paper
    target_signals = output.get("target_signals", {})
    if target_signals:
        for signal_name in _SIGNAL_FIELDS:
            val = target_signals.get(signal_name, 0.0)
            if isinstance(val, (int, float)):
                evals.append(
                    Evaluation(
                        name=f"target_{signal_name}",
                        value=round(float(val), 4),
                    )
                )

        # Channel contribution booleans
        evals.append(
            Evaluation(
                name="channel_lexical",
                value=(1.0 if target_signals.get("lexical_score", 0) > 0 else 0.0),
            )
        )
        evals.append(
            Evaluation(
                name="channel_chunk",
                value=(1.0 if target_signals.get("chunk_lexical_score", 0) > 0 else 0.0),
            )
        )
        evals.append(
            Evaluation(
                name="channel_dense",
                value=1.0 if target_signals.get("dense_score", 0) > 0 else 0.0,
            )
        )
        evals.append(
            Evaluation(
                name="channel_entity",
                value=1.0 if target_signals.get("entity_score", 0) > 0 else 0.0,
            )
        )
        evals.append(
            Evaluation(
                name="channel_relation",
                value=(1.0 if target_signals.get("relation_score", 0) > 0 else 0.0),
            )
        )
        evals.append(
            Evaluation(
                name="channel_citation",
                value=(1.0 if target_signals.get("citation_boost", 0) > 0 else 0.0),
            )
        )
        evals.append(
            Evaluation(
                name="target_lane_count",
                value=float(target_signals.get("lane_count", 0)),
            )
        )

    # Fused score gap (target vs #1 — what to optimize)
    fused_gap = output.get("fused_score_gap", 0.0)
    if isinstance(fused_gap, (int, float)):
        evals.append(
            Evaluation(
                name="fused_score_gap",
                value=round(float(fused_gap), 4),
                comment="gap between #1 and target fused_score",
            )
        )

    return evals


def routing_evaluator(*, output, expected_output=None, **kwargs):
    """Emit ``routing_match`` when the frozen case carries an expected profile.

    The dataset item sets ``expected_retrieval_profile`` on cases that the
    benchmark author expects to route a specific way (e.g. ``title_lookup``
    for title_retrieval_v2). Emits 1.0 on match, 0.0 on mismatch. Items
    without an expectation return no evaluations — the score simply won't
    appear in their trace, which is the correct "n/a" behavior.
    """
    from langfuse import Evaluation

    expected = (expected_output or {}).get("expected_retrieval_profile")
    if not expected:
        return []
    actual = (output or {}).get("retrieval_profile")
    matched = 1.0 if actual == expected else 0.0
    return [
        Evaluation(
            name="routing_match",
            value=matched,
            comment=f"expected={expected} actual={actual}",
        )
    ]


# ---------------------------------------------------------------------------
# 3. Run-level evaluators (aggregates)
# ---------------------------------------------------------------------------


def _extract_score(item_results, score_name: str) -> list[float]:
    """Extract numeric score values from experiment item results."""
    return [
        e.value
        for r in item_results
        for e in r.evaluations
        if e.name == score_name and isinstance(e.value, (int, float))
    ]


def avg_hit_at_1(*, item_results, **kwargs):
    from langfuse import Evaluation

    scores = _extract_score(item_results, SCORE_HIT_AT_1)
    avg = sum(scores) / len(scores) if scores else 0.0
    return Evaluation(name="avg_hit_at_1", value=avg, comment=f"{avg:.2%} ({len(scores)} items)")


def avg_hit_at_k(*, item_results, **kwargs):
    from langfuse import Evaluation

    scores = _extract_score(item_results, SCORE_HIT_AT_K)
    avg = sum(scores) / len(scores) if scores else 0.0
    return Evaluation(name="avg_hit_at_k", value=avg, comment=f"{avg:.2%} ({len(scores)} items)")


def avg_grounded_answer_rate(*, item_results, **kwargs):
    from langfuse import Evaluation

    scores = _extract_score(item_results, SCORE_GROUNDED_ANSWER_RATE)
    avg = sum(scores) / len(scores) if scores else 0.0
    return Evaluation(
        name="avg_grounded_answer_rate",
        value=avg,
        comment=f"{avg:.2%} ({len(scores)} items)",
    )


def latency_summary(*, item_results, **kwargs):
    from langfuse import Evaluation

    durations = _extract_score(item_results, SCORE_DURATION_MS)
    if not durations:
        return Evaluation(name="p50_duration_ms", value=0.0)
    durations_sorted = sorted(durations)
    n = len(durations_sorted)
    p50 = durations_sorted[int(n * 0.5)]
    p95 = durations_sorted[min(int(n * 0.95), n - 1)]
    p99 = durations_sorted[min(int(n * 0.99), n - 1)]
    return [
        Evaluation(name="p50_duration_ms", value=round(p50, 1)),
        Evaluation(name="p95_duration_ms", value=round(p95, 1)),
        Evaluation(name="p99_duration_ms", value=round(p99, 1)),
    ]


def error_rate(*, item_results, **kwargs):
    from langfuse import Evaluation

    errors = sum(1 for r in item_results if r.output and r.output.get("error"))
    total = len(item_results) or 1
    return Evaluation(name="error_rate", value=errors / total, comment=f"{errors}/{total}")


# ---------------------------------------------------------------------------
# 4. Annotation queue helpers
# ---------------------------------------------------------------------------

_ANNOTATION_QUEUE_NAME = "rag-failure-review"


def ensure_annotation_queue() -> str | None:
    """Ensure the rag-failure-review annotation queue exists. Returns queue ID.

    Auto-discovers the ``hit_at_1`` score config ID from the API so the queue
    is always created with a valid reference.
    """
    # Check if queue already exists
    queues = _langfuse_api("GET", "/annotation-queues")
    if queues and "data" in queues:
        for q in queues["data"]:
            if q.get("name") == _ANNOTATION_QUEUE_NAME:
                return q["id"]

    # Find the hit_at_1 score config ID (required by the API)
    score_config_ids: list[str] = []
    configs = _langfuse_api("GET", "/score-configs")
    if configs and "data" in configs:
        for cfg in configs["data"]:
            if cfg.get("name") == SCORE_HIT_AT_1 and not cfg.get("isArchived"):
                score_config_ids.append(cfg["id"])
                break

    result = _langfuse_api(
        "POST",
        "/annotation-queues",
        {
            "name": _ANNOTATION_QUEUE_NAME,
            "description": "Hit@1=0 cases requiring domain expert review of retrieval failures",
            "scoreConfigIds": score_config_ids,
        },
    )
    if result:
        logger.info("Created annotation queue '%s'", _ANNOTATION_QUEUE_NAME)
        return result.get("id")
    return None


def enqueue_failures(result, queue_id: str) -> int:
    """Add hit@1=0 trace IDs from an experiment result to the annotation queue.

    Returns the number of items enqueued.
    """
    enqueued = 0
    for r in result.item_results:
        hit_at_1 = next(
            (e.value for e in r.evaluations if e.name == SCORE_HIT_AT_1),
            None,
        )
        trace_id = getattr(r, "trace_id", None)
        if hit_at_1 == 0.0 and trace_id:
            resp = _langfuse_api(
                "POST",
                f"/annotation-queues/{queue_id}/items",
                {"objectId": trace_id, "objectType": "TRACE"},
            )
            if resp is not None:
                enqueued += 1
    return enqueued


ALL_BENCHMARK_DATASETS = [
    "benchmark-biomedical_optimization_v3",
    "benchmark-biomedical_holdout_v1",
    "benchmark-biomedical_citation_context_v1",
    "benchmark-biomedical_narrative_v1",
    "benchmark-biomedical_metadata_retrieval_v1",
    "benchmark-biomedical_evidence_type_v1",
    "benchmark-title_retrieval_v2",
    "benchmark-clinical_evidence_v2",
    "benchmark-passage_retrieval_v2",
    "benchmark-adversarial_routing_v2",
    "benchmark-keyword_search_v2",
    "benchmark-abstract_stratum_v2",
    "benchmark-question_evidence_v2",
    "benchmark-semantic_recall_v2",
    "benchmark-entity_relation_v2",
]


# ---------------------------------------------------------------------------
# 5. Experiment diagnosis
# ---------------------------------------------------------------------------


def _recommend_actions(failures: list[dict]) -> list[str]:
    """Generate actionable recommendations from failure patterns.

    Each recommendation maps a (route, depth, score) pattern to a specific
    code location or config change the agent can directly execute.
    """
    from collections import Counter

    recommendations: list[str] = []
    seen: set[str] = set()

    route_counts = Counter(f.get("route") for f in failures)
    depth_counts = Counter(f.get("depth") for f in failures)

    def _add(key: str, msg: str) -> None:
        if key not in seen:
            seen.add(key)
            recommendations.append(msg)

    # Route-based recommendations
    for route, count in route_counts.most_common():
        if not route:
            continue
        if "title_lookup" in str(route):
            _add(
                "title_lookup",
                f"[{count} failures] title_lookup route miss → "
                "check is_title_like_query() thresholds in query_enrichment.py",
            )
        if "question_lookup" in str(route):
            _add(
                "question_lookup",
                f"[{count} failures] question_lookup route miss → "
                "consider enabling MedCPT reranker (rag_live_biomedical_reranker_enabled)",
            )

    # Depth-based recommendations
    none_count = depth_counts.get("none", 0)
    if none_count > 0:
        _add(
            "depth_none",
            f"[{none_count} failures] depth=none → "
            "ingest gap — paper needs BioCXML/API backfill, not a code fix",
        )
    abstract_count = depth_counts.get("abstract", 0)
    if abstract_count > 0:
        _add(
            "depth_abstract",
            f"[{abstract_count} failures] depth=abstract → "
            "enable dense query search (rag_dense_query_enabled) for embedding retrieval",
        )

    # Error-based recommendations
    error_failures = [f for f in failures if f.get("error")]
    if error_failures:
        _add(
            "errors",
            f"[{len(error_failures)} failures] error_rate > 0 → "
            "debug traceback — usually DB connection or model loading",
        )

    # Zero-bundle recommendation
    zero_bundle = [f for f in failures if f.get("bundles", 0) == 0]
    if zero_bundle:
        _add(
            "zero_bundles",
            f"[{len(zero_bundle)} failures] 0 evidence bundles → "
            "check routing in retrieval_policy.py — query may be misclassified",
        )

    return recommendations


def diagnose_experiment(result) -> str:
    """Analyze an ExperimentResult for failure patterns.

    Groups failures by route_signature, warehouse_depth, and source_system
    to identify systematic retrieval issues. Includes actionable
    recommendations that map score patterns to specific code fixes.
    Returns a formatted report.
    """
    from collections import Counter

    lines: list[str] = []
    failures: list[dict] = []

    for r in result.item_results:
        hit_at_1 = next(
            (e.value for e in r.evaluations if e.name == SCORE_HIT_AT_1),
            None,
        )
        if hit_at_1 == 0.0:
            output = r.output or {}
            item_input = r.item.input if hasattr(r.item, "input") else {}
            failures.append(
                {
                    "query": item_input.get("query", "?")[:80],
                    "route": output.get("route_signature"),
                    "depth": output.get("warehouse_depth"),
                    "source": output.get("source_system"),
                    "profile": output.get("retrieval_profile"),
                    "bundles": output.get("evidence_bundle_count", 0),
                    "error": output.get("error"),
                    "trace_id": getattr(r, "trace_id", None),
                }
            )

    total = len(result.item_results)
    lines.append(f"Failures: {len(failures)}/{total} ({len(failures) / max(total, 1):.0%})")

    if not failures:
        lines.append("All items passed hit@1.")
        return "\n".join(lines)

    # Group by route_signature
    route_counts = Counter(f.get("route") for f in failures)
    lines.append("\nBy route_signature:")
    for route, count in route_counts.most_common():
        lines.append(f"  {route}: {count}")

    # Group by warehouse_depth
    depth_counts = Counter(f.get("depth") for f in failures)
    lines.append("\nBy warehouse_depth:")
    for depth, count in depth_counts.most_common():
        lines.append(f"  {depth}: {count}")

    # Group by source_system
    source_counts = Counter(f.get("source") for f in failures)
    lines.append("\nBy source_system:")
    for source, count in source_counts.most_common():
        lines.append(f"  {source}: {count}")

    # Actionable recommendations
    recommendations = _recommend_actions(failures)
    if recommendations:
        lines.append("\nActionable recommendations:")
        for rec in recommendations:
            lines.append(f"  → {rec}")

    # Individual failures
    lines.append("\nIndividual misses:")
    for f in failures:
        parts = [
            f"  MISS: query={f['query']}",
            f"  route={f['route']}  depth={f['depth']}  source={f['source']}",
            f"  bundles={f['bundles']}",
        ]
        if f.get("error"):
            parts.append(f"  error={f['error'][:100]}")
        lines.append("".join(parts))
        if f.get("trace_id"):
            lines.append(f"    trace_id: {f['trace_id']}")

    return "\n".join(lines)


_FLUSH_TIMEOUT_S = 15


def _patch_flush_timeout(client) -> None:
    """Monkey-patch the Langfuse client's flush() to be timeout-aware.

    The SDK's flush() (client.py:2660) calls three blocking operations with no
    timeout: tracer_provider.force_flush(), score_queue.join(), media_queue.join().
    When the backend ingestion is slow or consumer threads die, flush blocks forever.

    This is a known upstream bug:
    - langfuse/langfuse#11104 — flush() hangs when consumer threads die
    - langfuse/langfuse#8573  — scoring + flush infinite hang
    - open-telemetry/opentelemetry-python#4623 — force_flush timeout not configurable

    We replace flush() with a version that runs in a daemon thread with a timeout.
    If flush doesn't complete in time, we log a warning and continue — the data
    is already queued and will be ingested eventually.
    """
    original_flush = client.flush

    def _timeout_flush():
        t = threading.Thread(target=original_flush, daemon=True)
        t.start()
        t.join(timeout=_FLUSH_TIMEOUT_S)
        if t.is_alive():
            logger.warning(
                "Langfuse flush() did not complete in %ds — continuing "
                "(data queued, will be ingested eventually). "
                "See langfuse/langfuse#11104",
                _FLUSH_TIMEOUT_S,
            )

    client.flush = _timeout_flush


def _strip_dataset_item_metadata(dataset):
    """Return dataset items with benchmark metadata cleared.

    Benchmark tasks consume only ``input`` and ``expected_output``. Langfuse's
    experiment runner propagates ``item.metadata`` into child-span attributes,
    which is redundant for these benchmarks and can overflow attribute limits on
    large suites. Langfuse SDK dataset items are frozen models, so the stripped
    items must be copied rather than mutated in place.
    """

    stripped_items = []
    for item in getattr(dataset, "items", []) or []:
        if isinstance(item, dict):
            stripped_item = dict(item)
            stripped_item["metadata"] = None
            stripped_items.append(stripped_item)
            continue
        if hasattr(item, "model_copy"):
            stripped_items.append(item.model_copy(update={"metadata": None}))
            continue
        if hasattr(item, "metadata"):
            try:
                item.metadata = None
                stripped_items.append(item)
            except Exception:  # pragma: no cover - defensive for SDK shape drift
                logger.debug("could_not_clear_dataset_item_metadata", exc_info=True)
                stripped_items.append(item)
            continue
        stripped_items.append(item)

    if hasattr(dataset, "items"):
        try:
            dataset.items = stripped_items
        except Exception:  # pragma: no cover - defensive for SDK shape drift
            logger.debug("could_not_replace_dataset_items", exc_info=True)

    return stripped_items


def run_benchmark(
    *,
    dataset_name: str,
    run_name: str,
    graph_release_id: str = "current",
    chunk_version_key: str = DEFAULT_CHUNK_VERSION_KEY,
    k: int = 5,
    rerank_topn: int = 10,
    use_lexical: bool = True,
    use_dense_query: bool = True,
    max_concurrency: int = 4,
    connect=None,
):
    """Run a Langfuse dataset benchmark against the RAG service.

    Fetches the dataset from Langfuse, runs the RAG search task for each item,
    scores with structural evaluators, and computes aggregate run-level metrics.

    Returns an ``ExperimentResult`` with ``dataset_run_url`` for the Langfuse UI.
    """
    from app.langfuse_config import get_langfuse

    langfuse = get_langfuse()

    # Patch flush() to be timeout-aware BEFORE run_experiment calls it internally.
    _patch_flush_timeout(langfuse)

    dataset = langfuse.get_dataset(dataset_name)
    stripped_items = _strip_dataset_item_metadata(dataset)

    task = _make_task_function(
        graph_release_id=graph_release_id,
        chunk_version_key=chunk_version_key,
        k=k,
        rerank_topn=rerank_topn,
        use_lexical=use_lexical,
        use_dense_query=use_dense_query,
        tags=["benchmark", dataset_name, run_name],
        session_id=run_name,
        user_id="solemd.dev",
        connect=connect,
    )

    return langfuse.run_experiment(
        name=run_name,
        run_name=run_name,
        data=stripped_items,
        task=task,
        evaluators=[structural_evaluator, routing_evaluator],
        run_evaluators=[
            avg_hit_at_1,
            avg_hit_at_k,
            avg_grounded_answer_rate,
            latency_summary,
            error_rate,
        ],
        max_concurrency=max_concurrency,
        metadata={
            "graph_release_id": graph_release_id,
            "chunk_version_key": chunk_version_key,
            "k": k,
            "rerank_topn": rerank_topn,
            "use_lexical": use_lexical,
            "use_dense_query": use_dense_query,
        },
        _dataset_version=getattr(dataset, "version", None),
    )


def iter_all_benchmarks(
    *,
    run_name: str,
    **kwargs,
):
    """Yield (dataset_name, result) for each benchmark dataset as it completes.

    Datasets run sequentially (each one uses ``max_concurrency`` parallel
    tasks internally via the Langfuse SDK). Yields results immediately so
    callers can print/process without waiting for all datasets.

    Skips datasets that don't exist in Langfuse or have zero items.
    """
    from app.langfuse_config import get_langfuse

    langfuse = get_langfuse()

    for dataset_name in ALL_BENCHMARK_DATASETS:
        try:
            ds = langfuse.get_dataset(dataset_name)
            if hasattr(ds, "items") and len(ds.items) == 0:
                logger.info("Dataset %s has 0 items, skipping", dataset_name)
                continue
        except Exception:
            logger.warning("Dataset %s not found, skipping", dataset_name)
            continue

        logger.info("Running %s (%d items)", dataset_name, len(ds.items))
        result = run_benchmark(
            dataset_name=dataset_name,
            run_name=run_name,
            **kwargs,
        )
        yield dataset_name, result
