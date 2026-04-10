"""Profile the live SQL path used by runtime paper title search."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from time import perf_counter
from typing import Any

from app import db
from app.rag import queries
from app.rag.query_enrichment import normalize_title_key
from app.rag.query_plan import plan_hash, plan_index_names, plan_node_names
from app.rag.repository import PostgresRagRepository


def _query_plan(cur: Any, *, sql: str, params: tuple[Any, ...], analyze: bool) -> dict[str, Any]:
    explain_clause = "EXPLAIN (FORMAT JSON)"
    if analyze:
        explain_clause = "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)"
    cur.execute(f"{explain_clause} {sql}", params)
    return cur.fetchone()["QUERY PLAN"][0]["Plan"]


def _plan_summary(plan: dict[str, Any]) -> dict[str, Any]:
    return {
        "plan_hash": plan_hash(plan),
        "node_types": plan_node_names(plan),
        "index_names": plan_index_names(plan),
        "plan": plan,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", required=True, help="Title-like query to profile")
    parser.add_argument(
        "--graph-release-id",
        default="current",
        help="Graph release id or checksum to resolve",
    )
    parser.add_argument("--limit", type=int, default=10, help="Paper search limit")
    parser.add_argument(
        "--analyze",
        action="store_true",
        help="Run EXPLAIN ANALYZE instead of planner-only EXPLAIN",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the JSON profile artifact",
    )
    args = parser.parse_args()

    repo = PostgresRagRepository(connect=db.pooled)
    release = repo.resolve_graph_release(args.graph_release_id)
    normalized_title_query = normalize_title_key(args.query)
    prefix_limit = repo._title_prefix_candidate_limit(args.limit)
    use_exact_graph_search = repo._should_use_exact_graph_search(release.graph_run_id)

    final_sql_spec = repo._paper_search_sql_spec(
        graph_run_id=release.graph_run_id,
        query=args.query,
        normalized_title_query=normalized_title_query,
        limit=args.limit,
        scope_corpus_ids=None,
        use_title_similarity=True,
        use_exact_graph_search=use_exact_graph_search,
    )
    strategy = final_sql_spec.route_name

    candidate_sql = [
        {
            "name": "title_text_exact_candidate",
            "sql": queries.PAPER_TITLE_TEXT_EXACT_CANDIDATE_SQL,
            "params": (
                args.query.lower(),
                args.query.lower(),
                args.query.lower(),
                args.limit,
            ),
        },
        {
            "name": "title_normalized_exact_candidate",
            "sql": queries.PAPER_TITLE_NORMALIZED_EXACT_CANDIDATE_SQL,
            "params": (
                normalized_title_query,
                normalized_title_query,
                normalized_title_query,
                args.limit,
            ),
        },
        {
            "name": "title_text_prefix_candidate",
            "sql": queries.PAPER_TITLE_TEXT_PREFIX_CANDIDATE_SQL,
            "params": (
                args.query.lower(),
                args.query.lower(),
                f"{args.query.lower()}\uffff",
                prefix_limit,
            ),
        },
        {
            "name": "title_normalized_prefix_candidate",
            "sql": queries.PAPER_TITLE_NORMALIZED_PREFIX_CANDIDATE_SQL,
            "params": (
                normalized_title_query,
                normalized_title_query,
                f"{normalized_title_query}\uffff",
                prefix_limit,
            ),
        },
    ]

    try:
        search_started = perf_counter()
        hits = repo.search_papers(
            release.graph_run_id,
            args.query,
            limit=args.limit,
            use_title_similarity=True,
        )
        search_duration_ms = (perf_counter() - search_started) * 1000

        with db.pooled() as conn, conn.cursor() as cur:
            repo._configure_search_session(cur)
            candidate_plans = [
                {
                    "name": item["name"],
                    **_plan_summary(
                        _query_plan(
                            cur,
                            sql=item["sql"],
                            params=item["params"],
                            analyze=args.analyze,
                        )
                    ),
                }
                for item in candidate_sql
            ]
            final_plan = _plan_summary(
                _query_plan(
                    cur,
                    sql=final_sql_spec.sql,
                    params=final_sql_spec.params,
                    analyze=args.analyze,
                )
            )
    finally:
        db.close_pool()

    report = {
        "graph_release_id": args.graph_release_id,
        "graph_run_id": release.graph_run_id,
        "query": args.query,
        "normalized_title_query": normalized_title_query,
        "limit": args.limit,
        "strategy": strategy,
        "use_exact_graph_search": use_exact_graph_search,
        "search_duration_ms": round(search_duration_ms, 3),
        "hit_count": len(hits),
        "top_hits": [
            {
                "corpus_id": hit.corpus_id,
                "title": hit.title,
                "lexical_score": hit.lexical_score,
                "title_similarity": hit.title_similarity,
            }
            for hit in hits[:5]
        ],
        "candidate_plans": candidate_plans,
        "final_plan": final_plan,
    }
    payload = json.dumps(report, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
