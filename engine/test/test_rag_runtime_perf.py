from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

import pytest

from app import db
from app.config import settings
from app.rag import queries
from app.rag.biomedical_reranking import get_runtime_biomedical_reranker
from app.rag.query_enrichment import normalize_title_key
from app.rag.query_plan import plan_index_names, plan_node_names
from app.rag.repository import PostgresRagRepository
from app.rag_ingest.chunk_policy import DEFAULT_CHUNK_VERSION_KEY
from app.rag_ingest.runtime_eval import (
    RuntimeEvalQueryCase,
    RuntimeEvalQueryFamily,
    run_rag_runtime_case_evaluation,
    run_rag_runtime_evaluation,
)
from app.rag_ingest.runtime_eval_benchmarks import load_runtime_eval_benchmark_cases


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
            sample_size=24,
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


@lru_cache(maxsize=4)
def _runtime_benchmark_report(benchmark_key: str):
    _require_runtime_db()
    benchmark_path = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "runtime_eval_benchmarks"
        / f"{benchmark_key}.json"
    )
    try:
        _benchmark_report, benchmark_cases = load_runtime_eval_benchmark_cases(
            benchmark_path
        )
        return run_rag_runtime_case_evaluation(
            graph_release_id="current",
            chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
            cases=benchmark_cases,
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
            connect=db.pooled,
        )
    finally:
        db.close_pool()


@lru_cache(maxsize=16)
def _runtime_benchmark_case_report(benchmark_key: str, corpus_id: int):
    _require_runtime_db()
    benchmark_path = (
        Path(__file__).resolve().parents[1]
        / "data"
        / "runtime_eval_benchmarks"
        / f"{benchmark_key}.json"
    )
    try:
        _benchmark_report, benchmark_cases = load_runtime_eval_benchmark_cases(
            benchmark_path
        )
        selected_cases = [
            case for case in benchmark_cases if case.corpus_id == corpus_id
        ]
        assert selected_cases, f"missing benchmark case for corpus_id={corpus_id}"
        return run_rag_runtime_case_evaluation(
            graph_release_id="current",
            chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
            cases=selected_cases,
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
            connect=db.pooled,
        )
    finally:
        db.close_pool()


def _family(report, family: RuntimeEvalQueryFamily):
    return report.summary.by_query_family[family.value]


def _case(report, family: RuntimeEvalQueryFamily):
    return next(result for result in report.cases if result.query_family == family)


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_title_query_families_remain_grounded_and_fast():
    report = _runtime_perf_report()

    overall = report.summary.overall

    assert overall.error_count == 0
    assert overall.over_1000ms_count == 0
    assert overall.p95_service_duration_ms <= 250.0
    assert overall.p99_service_duration_ms <= 500.0
    assert report.warehouse_quality.flagged_papers == 0
    assert all(case.route_signature for case in report.cases)

    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)
    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_global.target_in_grounded_answer_rate >= 0.95
    assert title_global.p95_service_duration_ms <= 150.0

    assert title_selected.target_in_grounded_answer_rate >= 0.95
    assert title_selected.p95_service_duration_ms <= 120.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_family_keeps_precision_and_latency_floor():
    report = _runtime_perf_report()
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.error_count == 0
    assert sentence_global.hit_at_k_rate >= 0.9
    assert sentence_global.target_in_grounded_answer_rate >= 0.95
    assert sentence_global.over_1000ms_count == 0
    assert sentence_global.p95_service_duration_ms <= 400.0
    assert sentence_global.p99_service_duration_ms <= 750.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_hard_benchmark_remains_grounded_and_bounded():
    report = _runtime_benchmark_report("sentence_hard_v1")
    overall = report.summary.overall

    assert overall.error_count == 0
    assert overall.hit_at_k_rate >= 0.9
    assert overall.grounded_answer_rate == 1.0
    assert overall.target_in_grounded_answer_rate >= 0.9
    assert overall.over_1000ms_count == 0
    assert overall.p95_service_duration_ms <= 700.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_clinical_actionable_benchmark_remains_grounded_and_bounded():
    report = _runtime_benchmark_report("clinical_actionable_v1")
    overall = report.summary.overall

    assert overall.error_count == 0
    assert overall.hit_at_k_rate >= 0.9
    assert overall.grounded_answer_rate == 1.0
    assert overall.target_in_grounded_answer_rate >= 0.9
    assert overall.over_1000ms_count == 0
    assert overall.p95_service_duration_ms <= 500.0


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
    assert title_global.p95_service_duration_ms <= 500.0

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 500.0


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
    assert title_global.p95_service_duration_ms <= 500.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_selected_title_with_direct_anchor_stays_fast():
    report = _runtime_perf_report_for(
        (4443808,),
        (RuntimeEvalQueryFamily.TITLE_SELECTED,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.TITLE_SELECTED)
    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 750.0
    assert (
        case.route_signature
        == "retrieval_profile=title_lookup|title_anchor_route=selected_title"
    )


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
    assert sentence_global.p95_service_duration_ms <= 1000.0


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
    assert sentence_global.p95_service_duration_ms <= 1000.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_entity_dense_grounded_answer_fetch_stays_bounded():
    report = _runtime_perf_report_for(
        (277023583,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 250.0
    assert case.stage_durations_ms.get("grounded_answer_fetch_chunk_packets", 0.0) <= 100.0
    assert case.candidate_counts.get("grounded_answer_entity_rows", 0) <= 25


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_citation_context_tail_stays_bounded():
    report = _runtime_perf_report_for(
        (3130320,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 150.0
    assert case.stage_durations_ms.get("fetch_citation_contexts_initial", 0.0) <= 20.0
    assert case.stage_durations_ms.get("fetch_citation_contexts_missing_top_hits", 0.0) <= 60.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_clinical_treatment_query_applies_bounded_species_prior():
    _require_runtime_db()
    previous_enabled = settings.rag_live_clinical_priors_enabled
    settings.rag_live_clinical_priors_enabled = True
    try:
        report = run_rag_runtime_case_evaluation(
            graph_release_id="current",
            chunk_version_key=DEFAULT_CHUNK_VERSION_KEY,
            cases=[
                RuntimeEvalQueryCase(
                    corpus_id=213192049,
                    title=(
                        "Ramosetron versus Palonosetron in Combination with "
                        "Aprepitant and Dexamethasone for the Control of "
                        "Highly-Emetogenic Chemotherapy-Induced Nausea and Vomiting"
                    ),
                    primary_source_system="s2orc_v2",
                    query_family=RuntimeEvalQueryFamily.SENTENCE_GLOBAL,
                    query=(
                        "Is ramosetron as effective as palonosetron for preventing "
                        "highly emetogenic chemotherapy induced nausea and vomiting?"
                    ),
                    stratum_key="benchmark:clinical_treatment_v1|source:s2orc_v2",
                    representative_section_role="abstract",
                )
            ],
            k=5,
            rerank_topn=10,
            use_lexical=True,
            use_dense_query=True,
            connect=db.pooled,
        )
    finally:
        settings.rag_live_clinical_priors_enabled = previous_enabled
        db.close_pool()

    assert report.summary.overall.error_count == 0
    case = report.cases[0]

    assert case.target_in_grounded_answer is True
    assert case.session_flags["clinical_query_intent"] == "treatment"
    assert case.session_flags["clinical_prior_requested"] is True
    assert case.stage_durations_ms.get("fetch_species_profiles", 0.0) <= 25.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_query_with_title_like_paper_fallback_stays_fast():
    report = _runtime_perf_report_for(
        (24948876,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 150.0
    assert (
        case.route_signature
        == "retrieval_profile=title_lookup|"
        "paper_search_route=paper_search_global_fts_only|"
        "paper_search_use_title_similarity=False|"
        "paper_search_use_title_candidate_lookup=True|"
        "dense_query_route=dense_query_ann_broad_scope"
    )
    assert case.stage_durations_ms.get("search_papers", 0.0) <= 75.0


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
    assert sentence_global.p95_service_duration_ms <= 1000.0


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

    title_nodes = plan_node_names(title_plan)
    title_indexes = plan_index_names(title_plan)
    normalized_nodes = plan_node_names(normalized_plan)
    normalized_indexes = plan_index_names(normalized_plan)

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

    nodes = plan_node_names(plan)
    indexes = plan_index_names(plan)

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
                "EXPLAIN (FORMAT JSON) " + queries.DENSE_QUERY_SEARCH_ANN_BROAD_SCOPE_SQL,
                (
                    vector_literal,
                    vector_literal,
                    120,
                    release.graph_run_id,
                    10,
                ),
            )
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    nodes = plan_node_names(plan)
    indexes = plan_index_names(plan)

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

    nodes = plan_node_names(plan)
    indexes = plan_index_names(plan)

    assert "Bitmap Index Scan" in nodes or "Index Scan" in nodes, json.dumps(plan)
    assert "idx_papers_title_gist_trgm" in indexes, json.dumps(plan)
    assert "Seq Scan" not in nodes, json.dumps(plan)


@pytest.mark.integration
def test_runtime_title_phrase_candidate_lookup_uses_title_fts_index():
    _require_runtime_db()

    query = (
        "Effects of prenatal ethanol exposure on physical growths, sensory reflex "
        "maturation and brain development in the rat"
    )

    try:
        with db.pooled() as conn, conn.cursor() as cur:
            cur.execute(
                "EXPLAIN (FORMAT JSON) " + queries.PAPER_TITLE_FTS_CANDIDATE_SQL,
                (query, query, 20),
            )
            plan = cur.fetchone()["QUERY PLAN"][0]["Plan"]
    finally:
        db.close_pool()

    nodes = plan_node_names(plan)
    indexes = plan_index_names(plan)

    assert "Bitmap Index Scan" in nodes or "Index Scan" in nodes, json.dumps(plan)
    assert "idx_papers_title_fts" in indexes, json.dumps(plan)
    assert "Seq Scan" not in nodes, json.dumps(plan)


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_selected_passage_lookup_semantic_neighbor_tail_stays_bounded():
    report = _runtime_perf_report_for(
        (22309903,),
        (RuntimeEvalQueryFamily.TITLE_SELECTED,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.TITLE_SELECTED)
    title_selected = _family(report, RuntimeEvalQueryFamily.TITLE_SELECTED)

    assert title_selected.target_in_grounded_answer_rate == 1.0
    assert title_selected.p95_service_duration_ms <= 500.0
    assert case.stage_durations_ms.get("fetch_semantic_neighbors", 0.0) <= 100.0


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
    assert title_global.p95_service_duration_ms <= 750.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_dense_query_title_global_tail_stays_bounded():
    report = _runtime_perf_report_for(
        (2230194,),
        (RuntimeEvalQueryFamily.TITLE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)
    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)

    assert title_global.target_in_grounded_answer_rate == 1.0
    assert title_global.p95_service_duration_ms <= 750.0
    assert case.stage_durations_ms.get("search_query_embedding_papers", 0.0) <= 250.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_long_title_global_query_uses_exact_title_precheck():
    report = _runtime_perf_report_for(
        (22309903,),
        (RuntimeEvalQueryFamily.TITLE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)
    title_global = _family(report, RuntimeEvalQueryFamily.TITLE_GLOBAL)

    assert title_global.target_in_grounded_answer_rate == 1.0
    assert title_global.p95_service_duration_ms <= 300.0
    assert case.candidate_counts.get("exact_title_hits", 0) == 1
    assert case.stage_durations_ms.get("search_query_embedding_papers", 0.0) <= 1.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_dense_query_sentence_global_tail_stays_bounded():
    report = _runtime_perf_report_for(
        (138129,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 750.0
    assert case.stage_durations_ms.get("search_query_embedding_papers", 0.0) <= 250.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_global_skips_incidental_relation_lane():
    report = _runtime_perf_report_for(
        (273920567,),
        (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
    )

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 300.0
    assert case.candidate_counts.get("relation_seed_hits", 0) == 0
    assert case.stage_durations_ms.get("search_relation_papers", 0.0) <= 1.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_sentence_global_general_query_skips_biomedical_reranker():
    _require_runtime_db()

    previous_enabled = settings.rag_live_biomedical_reranker_enabled
    _runtime_perf_report_for.cache_clear()
    get_runtime_biomedical_reranker.cache_clear()
    settings.rag_live_biomedical_reranker_enabled = True
    try:
        report = _runtime_perf_report_for(
            (138129,),
            (RuntimeEvalQueryFamily.SENTENCE_GLOBAL,),
        )
    finally:
        settings.rag_live_biomedical_reranker_enabled = previous_enabled
        _runtime_perf_report_for.cache_clear()
        get_runtime_biomedical_reranker.cache_clear()
        db.close_pool()

    assert report.summary.overall.error_count == 0

    case = _case(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)
    sentence_global = _family(report, RuntimeEvalQueryFamily.SENTENCE_GLOBAL)

    assert sentence_global.target_in_grounded_answer_rate == 1.0
    assert sentence_global.p95_service_duration_ms <= 300.0
    assert (
        case.route_signature
        == "retrieval_profile=passage_lookup|chunk_search_route=chunk_search_global|"
        "dense_query_route=dense_query_ann_broad_scope"
    )
    assert case.session_flags.get("biomedical_reranker_enabled") is True
    assert case.session_flags.get("biomedical_rerank_requested") is False
    assert case.session_flags.get("biomedical_reranker_backend") == "medcpt_cross_encoder"
    assert case.candidate_counts.get("biomedical_rerank_candidates", 0) == 0
    assert case.candidate_counts.get("biomedical_rerank_promotions", 0) == 0
    assert case.stage_durations_ms.get("biomedical_rerank", 0.0) == 0.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_clinical_actionable_live_biomedical_reranker_stays_bounded_and_grounded():
    _require_runtime_db()

    previous_enabled = settings.rag_live_biomedical_reranker_enabled
    _runtime_benchmark_case_report.cache_clear()
    get_runtime_biomedical_reranker.cache_clear()
    settings.rag_live_biomedical_reranker_enabled = True
    try:
        report = _runtime_benchmark_case_report("clinical_actionable_v1", 277023583)
    finally:
        settings.rag_live_biomedical_reranker_enabled = previous_enabled
        _runtime_benchmark_case_report.cache_clear()
        get_runtime_biomedical_reranker.cache_clear()
        db.close_pool()

    overall = report.summary.overall
    case = report.cases[0]

    assert overall.error_count == 0
    assert overall.target_in_grounded_answer_rate == 1.0
    assert overall.p95_service_duration_ms <= 200.0
    assert case.session_flags.get("biomedical_reranker_enabled") is True
    assert case.session_flags.get("biomedical_rerank_requested") is True
    assert case.session_flags.get("biomedical_rerank_applied") is True
    assert case.session_flags.get("biomedical_reranker_backend") == "medcpt_cross_encoder"
    assert case.session_flags.get("biomedical_reranker_device") == "cuda"
    assert case.candidate_counts.get("biomedical_rerank_candidates", 0) == 8
    assert case.candidate_counts.get("biomedical_rerank_promotions", 0) >= 1
    assert case.stage_durations_ms.get("biomedical_rerank", 0.0) <= 75.0
    assert case.stage_durations_ms.get("rank_preliminary_hits_biomedical", 0.0) <= 10.0


@pytest.mark.integration
@pytest.mark.slow
def test_runtime_clinical_actionable_sparse_passage_fallback_route_is_explicit():
    report = _runtime_benchmark_case_report("clinical_actionable_v1", 229929738)

    overall = report.summary.overall
    case = report.cases[0]

    assert overall.error_count == 0
    assert overall.target_in_grounded_answer_rate == 1.0
    assert overall.p95_service_duration_ms <= 300.0
    assert case.session_flags.get("paper_search_sparse_passage_fallback") is True
    assert (
        case.route_signature
        == "retrieval_profile=passage_lookup|"
        "paper_search_route=paper_search_global_fts_only|"
        "paper_search_sparse_passage_fallback=True|"
        "paper_search_use_title_similarity=False|"
        "paper_search_use_title_candidate_lookup=False|"
        "chunk_search_route=chunk_search_global|"
        "dense_query_route=dense_query_ann_broad_scope"
    )



@pytest.mark.integration
@pytest.mark.slow
def test_runtime_neuropsychiatry_hard_benchmark_remains_grounded_and_bounded():
    report = _runtime_benchmark_report("neuropsychiatry_v1")
    overall = report.summary.overall

    assert overall.error_count == 0
    assert overall.hit_at_k_rate >= 0.8
    assert overall.grounded_answer_rate >= 0.8
    assert overall.target_in_grounded_answer_rate >= 0.8
    assert overall.over_1000ms_count == 0
    assert overall.p95_service_duration_ms <= 800.0

@pytest.mark.integration
@pytest.mark.slow
def test_runtime_neuropsychiatry_hard_benchmark_excludes_retracted():
    report = _runtime_benchmark_report("neuropsychiatry_v1")
    for case in report.cases:
        assert case.session_flags.get("exclude_retracted") is not False
