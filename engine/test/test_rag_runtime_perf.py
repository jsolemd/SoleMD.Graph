from __future__ import annotations

import json
from functools import lru_cache

import pytest

from app import db
from app.rag import queries
from app.rag.query_enrichment import normalize_title_key
from app.rag.repository import PostgresRagRepository
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


@lru_cache(maxsize=8)
def _runtime_perf_report_for(
    corpus_ids: tuple[int, ...],
    query_families: tuple[RuntimeEvalQueryFamily, ...],
):
    _require_runtime_db()
    try:
        return run_rag_runtime_evaluation(
            graph_release_id="current",
            chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
            sample_size=len(corpus_ids) or 1,
            seed=7,
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
            corpus_ids=list(corpus_ids),
            query_families=query_families,
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


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_question_style_title_lookup_stays_grounded_and_fast():
    report = _runtime_perf_report_for(
        (3092150,),
        (
            RuntimeEvalQueryFamily.TITLE_GLOBAL,
            RuntimeEvalQueryFamily.TITLE_SELECTED,
        ),
    )

    assert report.summary.overall.error_count == 0

    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)
    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_global.target_in_grounded_answer_rate == 1.0
    assert title_global.p95_service_duration_ms <= 3000.0

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 3000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_long_biomedical_exact_title_global_lookup_stays_grounded_and_fast():
    report = _runtime_perf_report_for(
        (233428792,),
        (RuntimeEvalQueryFamily.TITLE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)

    assert title_global.target_in_grounded_answer_rate == 1.0
    assert title_global.p95_service_duration_ms <= 3000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_selected_title_with_direct_anchor_stays_fast():
    report = _runtime_perf_report_for(
        (4443808,),
        (RuntimeEvalQueryFamily.TITLE_SELECTED,),
    )

    assert report.summary.overall.error_count == 0

    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 5000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_truncated_long_title_selected_lookup_stays_grounded_and_fast():
    report = _runtime_perf_report_for(
        (11857184,),
        (RuntimeEvalQueryFamily.TITLE_SELECTED,),
    )

    assert report.summary.overall.error_count == 0

    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 500.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_with_exact_entity_seed_stays_fast():
    report = _runtime_perf_report_for(
        (30014021,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 5000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_with_exact_relation_seed_stays_fast():
    report = _runtime_perf_report_for(
        (211053997,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 5000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_with_title_like_paper_fallback_stays_fast():
    report = _runtime_perf_report_for(
        (24948876,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 5000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_with_sentence_anchor_bundle_keeps_target_grounded():
    report = _runtime_perf_report_for(
        (3092150,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 5000.0


@pytest.mark.integration
def test_runtime_normalized_title_key_sql_matches_python_contract():
    _require_runtime_db()

    examples = [
        (
            "Senkt Fußballspielen den Blutdruck?",
            "senkt fussballspielen den blutdruck",
        ),
        (
            (
                "Agonistic autoantibodies against ß2-adrenergic receptor influence "
                "retinal microcirculation in glaucoma suspects and patients"
            ),
            (
                "agonistic autoantibodies against ss2 adrenergic receptor influence "
                "retinal microcirculation in glaucoma suspects and patients"
            ),
        ),
        (
            (
                "Down-Regulation of the Na+,Cl- Coupled Creatine Transporter CreaT "
                "(SLC6A8) by Glycogen Synthase Kinase GSK3ß"
            ),
            (
                "down regulation of the na cl coupled creatine transporter creat "
                "slc6a8 by glycogen synthase kinase gsk3ss"
            ),
        ),
    ]

    try:
        with db.pooled() as conn, conn.cursor() as cur:
            for raw_title, expected_key in examples:
                cur.execute(
                    "SELECT solemd.normalize_title_key(%s)",
                    (raw_title,),
                )
                row = cur.fetchone()
                assert row is not None
                normalized_key = row["normalize_title_key"]
                assert normalized_key == expected_key
                assert normalized_key == normalize_title_key(raw_title)
    finally:
        db.close_pool()


@pytest.mark.integration
def test_runtime_exact_title_lookup_matches_unicode_normalized_key():
    _require_runtime_db()

    repo = PostgresRagRepository(connect=db.pooled)
    scope_corpus_id = 202810891
    query = "Senkt Fussballspielen den Blutdruck?"

    try:
        hits = repo.search_exact_title_papers(
            "current",
            query,
            limit=5,
            scope_corpus_ids=[scope_corpus_id],
        )
    finally:
        db.close_pool()

    assert hits
    assert hits[0].corpus_id == scope_corpus_id


def _plan_node_names(plan: dict) -> list[str]:
    names = [str(plan.get("Node Type", ""))]
    for child in plan.get("Plans", []) or []:
        names.extend(_plan_node_names(child))
    return names


def _plan_index_names(plan: dict) -> list[str]:
    names: list[str] = []
    index_name = plan.get("Index Name")
    if index_name:
        names.append(str(index_name))
    for child in plan.get("Plans", []) or []:
        names.extend(_plan_index_names(child))
    return names


def _paper_embedding_literal(corpus_id: int) -> str:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(queries.PAPER_EMBEDDING_LITERAL_SQL, (corpus_id,))
        row = cur.fetchone()
    assert row is not None
    embedding_literal = row["embedding_literal"]
    assert embedding_literal
    return str(embedding_literal)


@pytest.mark.integration
def test_runtime_title_knn_queries_use_gist_indexes():
    _require_runtime_db()

    query = (
        "Designing clinical trials for assessing the effects of cognitive training "
        "and physical activity interventions on cognitive outcomes: The Seniors "
        "Health and Activity Research Program Pilot (SHARP-P) Study, a randomized"
    )

    try:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute(
                """
                EXPLAIN (FORMAT JSON)
                SELECT p.corpus_id
                FROM solemd.papers p
                ORDER BY lower(coalesce(p.title, '')) <-> %s
                LIMIT 40
                """,
                (query,),
            )
            title_plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]

            cur.execute(
                """
                EXPLAIN (FORMAT JSON)
                SELECT p.corpus_id
                FROM solemd.papers p
                ORDER BY %s <<<-> solemd.normalize_title_key(p.title)
                LIMIT 40
                """,
                (normalize_title_key(query),),
            )
            normalized_plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    title_nodes = _plan_node_names(title_plan)
    title_indexes = _plan_index_names(title_plan)
    normalized_nodes = _plan_node_names(normalized_plan)
    normalized_indexes = _plan_index_names(normalized_plan)

    assert "Index Scan" in title_nodes, json.dumps(title_plan)
    assert "idx_papers_title_gist_trgm" in title_indexes, json.dumps(title_plan)
    assert "Seq Scan" not in title_nodes, json.dumps(title_plan)

    assert "Index Scan" in normalized_nodes, json.dumps(normalized_plan)
    assert (
        "idx_papers_normalized_title_key_gist_trgm" in normalized_indexes
    ), json.dumps(normalized_plan)
    assert "Seq Scan" not in normalized_nodes, json.dumps(normalized_plan)


@pytest.mark.integration
def test_runtime_semantic_neighbor_ann_uses_hnsw_index():
    _require_runtime_db()

    repo = PostgresRagRepository(connect=db.pooled)
    selected_corpus_id = 22309903

    try:
        release = repo.resolve_graph_release("current")
        vector_literal = _paper_embedding_literal(selected_corpus_id)
        with db.pooled() as conn, conn.cursor() as cur:
            repo._configure_search_session(cur)
            repo._configure_hnsw_session(cur)
            cur.execute(
                "EXPLAIN (FORMAT JSON) " + queries.SEMANTIC_NEIGHBOR_SQL,
                (
                    vector_literal,
                    release.graph_run_id,
                    selected_corpus_id,
                    vector_literal,
                    10,
                ),
            )
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    nodes = _plan_node_names(plan)
    indexes = _plan_index_names(plan)

    assert "Index Scan" in nodes, json.dumps(plan)
    assert "idx_papers_embedding_hnsw" in indexes, json.dumps(plan)
    assert "Seq Scan" not in nodes, json.dumps(plan)


@pytest.mark.integration
def test_runtime_dense_query_ann_uses_hnsw_index():
    _require_runtime_db()

    repo = PostgresRagRepository(connect=db.pooled)

    try:
        release = repo.resolve_graph_release("current")
        vector_literal = _paper_embedding_literal(22309903)
        with db.pooled() as conn, conn.cursor() as cur:
            repo._configure_search_session(cur)
            repo._configure_hnsw_session(cur)
            cur.execute(
                "EXPLAIN (FORMAT JSON) " + queries.DENSE_QUERY_SEARCH_SQL,
                (
                    vector_literal,
                    release.graph_run_id,
                    vector_literal,
                    10,
                ),
            )
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    nodes = _plan_node_names(plan)
    indexes = _plan_index_names(plan)

    assert "Index Scan" in nodes, json.dumps(plan)
    assert "idx_papers_embedding_hnsw" in indexes, json.dumps(plan)
    assert "Seq Scan" not in nodes, json.dumps(plan)


@pytest.mark.integration
def test_runtime_title_prefix_lookup_uses_title_trgm_index():
    _require_runtime_db()

    query = (
        "Designing clinical trials for assessing the effects of cognitive training "
        "and physical activity interventions on cognitive outcomes: The Seniors "
        "Health and Activity Research Program Pilot (SHARP-P) Study, a randomized"
    )

    try:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute(
                """
                EXPLAIN (FORMAT JSON)
                SELECT p.corpus_id
                FROM solemd.papers p
                WHERE lower(coalesce(p.title, '')) LIKE (%s || '%%')
                ORDER BY coalesce(p.citation_count, 0) DESC, p.corpus_id DESC
                LIMIT 20
                """,
                (query.lower(),),
            )
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    nodes = _plan_node_names(plan)
    indexes = _plan_index_names(plan)

    assert "Bitmap Index Scan" in nodes or "Index Scan" in nodes, json.dumps(plan)
    assert "idx_papers_title_gist_trgm" in indexes, json.dumps(plan)
    assert "Seq Scan" not in nodes, json.dumps(plan)


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_selected_passage_lookup_semantic_neighbor_tail_stays_bounded():
    report = _runtime_perf_report_for(
        (22309903,),
        (RuntimeEvalQueryFamily.TITLE_SELECTED,),
    )

    assert report.summary.overall.error_count == 0

    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)
    case = report.cases[0]

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 3000.0
    assert case.stage_durations_ms.get("fetch_semantic_neighbors", 0.0) <= 1000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_truncated_long_title_global_lookup_stays_grounded_and_fast():
    report = _runtime_perf_report_for(
        (11857184,),
        (RuntimeEvalQueryFamily.TITLE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)

    assert title_global.target_in_grounded_answer_rate == 1.0
    assert title_global.p95_service_duration_ms <= 3000.0
