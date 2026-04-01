from __future__ import annotations

from functools import lru_cache

import pytest

from app import db
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval import RuntimeEvalQueryFamily, run_rag_runtime_evaluation


def _require_runtime_db() -> None:
    try:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
    except Exception as exc:  # pragma: no cover - depends on local DB availability
        db.close_pool()
        pytest.skip(f"runtime perf tests require a live PostgreSQL runtime DB: {exc}")


@lru_cache(maxsize=1)
def _runtime_perf_report():
    _require_runtime_db()
    try:
        return run_rag_runtime_evaluation(
            graph_release_id="current",
            chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
            sample_size=12,
            seed=7,
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
            query_families=(
                RuntimeEvalQueryFamily.TITLE_GLOBAL,
                RuntimeEvalQueryFamily.TITLE_SELECTED,
                RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
            ),
            connect=db.pooled,
        )
    finally:
        db.close_pool()


def _family(report, family: RuntimeEvalQueryFamily):
    return report.summary.by_query_family[family.value]


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_title_query_families_remain_grounded_and_fast():
    report = _runtime_perf_report()

    assert report.summary.overall.error_count == 0
    assert report.warehouse_quality.flagged_papers == 0

    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)
    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_global.target_in_grounded_answer_rate >= 0.9
    assert title_global.p95_service_duration_ms <= 900.0

    assert title_selected.target_in_grounded_answer_rate >= 0.95
    assert title_selected.p95_service_duration_ms <= 800.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_family_keeps_precision_and_latency_floor():
    report = _runtime_perf_report()
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.error_count == 0
    assert sentence_global.hit_at_k_rate >= 0.65
    assert sentence_global.target_in_grounded_answer_rate >= 0.65
    assert sentence_global.p95_service_duration_ms <= 1500.0
