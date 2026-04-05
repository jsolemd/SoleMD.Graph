"""Graph run publishing, finalization, and corpus membership sync."""

from __future__ import annotations

from psycopg.types.json import Jsonb


from app.langfuse_config import SPAN_GRAPH_BUILD_PUBLISH, observe
from app import db
from app.graph.build_common import GraphBuildResult
from app.graph.build_common import GraphBuildSummary
from app.graph.base_policy import get_active_base_policy_version
from app.graph.base_policy import materialize_base_admission
from app.graph.checkpoints import checkpoint_paths
from app.graph.export_bundle import BUNDLE_VERSION
from app.graph.export_bundle import export_graph_bundle
from app.graph.render_policy import base_point_predicate_sql


def load_graph_build_summary() -> GraphBuildSummary:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE layout_status = 'mapped'")
        total_mapped = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.mapped_papers")
        total_mapped_papers = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_in_current_map = true")
        current_mapped = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_in_current_base = true")
        current_base = cur.fetchone()["n"]
        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE embedding IS NOT NULL) AS ready_for_layout,
                count(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings,
                count(*) FILTER (WHERE text_availability IS NULL) AS missing_text_availability
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.layout_status = 'mapped'
            """
        )
        row = cur.fetchone()

    return GraphBuildSummary(
        total_mapped=total_mapped,
        total_mapped_papers=total_mapped_papers,
        current_mapped=current_mapped,
        current_base=current_base,
        ready_for_layout=row["ready_for_layout"],
        missing_embeddings=row["missing_embeddings"],
        missing_text_availability=row["missing_text_availability"],
    )


def _finalize_graph_run(
    *,
    graph_run_id: str,
    bundle_dir: str | None,
    bundle_checksum: str | None,
    bundle_bytes: int | None,
    bundle_manifest: dict | None,
    publish_current: bool,
    qa_summary: dict,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        if publish_current:
            cur.execute(
                """
                UPDATE solemd.graph_runs
                SET is_current = false
                WHERE graph_name = 'cosmograph'
                  AND node_kind = 'corpus'
                  AND is_current = true
                """
            )
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'completed',
                is_current = %s,
                bundle_uri = COALESCE(%s, bundle_uri),
                bundle_format = COALESCE(%s, bundle_format),
                bundle_version = COALESCE(%s, bundle_version),
                bundle_checksum = COALESCE(%s, bundle_checksum),
                bundle_bytes = COALESCE(%s, bundle_bytes),
                bundle_manifest = COALESCE(%s, bundle_manifest),
                qa_summary = %s,
                updated_at = now(),
                completed_at = now()
            WHERE id = %s
            """,
            (
                publish_current,
                bundle_dir,
                "parquet-manifest" if bundle_dir else None,
                BUNDLE_VERSION if bundle_dir else None,
                bundle_checksum,
                bundle_bytes,
                Jsonb(bundle_manifest) if bundle_manifest else None,
                Jsonb(qa_summary),
                graph_run_id,
            ),
        )
        if publish_current:
            _sync_current_corpus_membership(cur, graph_run_id)
        conn.commit()


def _mark_graph_run_failed(graph_run_id: str, error: Exception) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'failed',
                qa_summary = jsonb_build_object('error', CAST(%s AS TEXT)),
                updated_at = now()
            WHERE id = %s
            """,
            (str(error), graph_run_id),
        )
        conn.commit()


def _sync_current_corpus_membership(cur, graph_run_id: str) -> None:
    base_predicate = base_point_predicate_sql("g")

    # 1. Compute new membership in temp table
    cur.execute(
        f"""
        CREATE TEMP TABLE tmp_new_membership ON COMMIT DROP AS
        SELECT g.corpus_id,
            CASE WHEN ({base_predicate}) THEN true ELSE false END AS new_base
        FROM solemd.graph_points g
        WHERE g.graph_run_id = %s
        """,
        (graph_run_id,),
    )
    cur.execute("CREATE UNIQUE INDEX ON tmp_new_membership (corpus_id)")

    # 2. Set newly-true rows (only the delta)
    cur.execute(
        """
        UPDATE solemd.corpus c SET is_in_current_map = true
        FROM tmp_new_membership m
        WHERE m.corpus_id = c.corpus_id
          AND c.is_in_current_map IS DISTINCT FROM true
        """
    )
    cur.execute(
        """
        UPDATE solemd.corpus c SET is_in_current_base = true
        FROM tmp_new_membership m
        WHERE m.corpus_id = c.corpus_id AND m.new_base = true
          AND c.is_in_current_base IS DISTINCT FROM true
        """
    )

    # 3. Clear rows no longer in set (only the delta)
    cur.execute(
        """
        UPDATE solemd.corpus c SET is_in_current_map = false
        WHERE c.is_in_current_map = true
          AND NOT EXISTS (
              SELECT 1 FROM tmp_new_membership m WHERE m.corpus_id = c.corpus_id
          )
        """
    )
    cur.execute(
        """
        UPDATE solemd.corpus c SET is_in_current_base = false
        WHERE c.is_in_current_base = true
          AND NOT EXISTS (
              SELECT 1 FROM tmp_new_membership m
              WHERE m.corpus_id = c.corpus_id AND m.new_base = true
          )
        """
    )


def sync_current_graph_membership() -> dict[str, str | int]:
    base_policy = get_active_base_policy_version()
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id
            FROM solemd.graph_runs
            WHERE graph_name = 'cosmograph'
              AND node_kind = 'corpus'
              AND status = 'completed'
              AND is_current = true
            ORDER BY completed_at DESC NULLS LAST, updated_at DESC
            LIMIT 1
            """
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError("no current cosmograph corpus graph run found")

        graph_run_id = row["id"]
        _sync_current_corpus_membership(cur, graph_run_id)

        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE is_in_current_map = true)::INTEGER AS current_mapped,
                count(*) FILTER (WHERE is_in_current_base = true)::INTEGER AS current_base
            FROM solemd.corpus
            """
        )
        counts = cur.fetchone()
        conn.commit()

    return {
        "graph_run_id": str(graph_run_id),
        "current_mapped": counts["current_mapped"],
        "current_base": counts["current_base"],
        "base_policy": base_policy,
    }


@observe(name=SPAN_GRAPH_BUILD_PUBLISH)
def publish_existing_graph_run(
    *,
    graph_run_id: str,
    publish_current: bool = False,
    skip_export: bool = False,
) -> GraphBuildResult:
    base_policy = get_active_base_policy_version()
    build_paths = checkpoint_paths(graph_run_id)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT parameters, qa_summary
            FROM solemd.graph_runs
            WHERE id = %s
            """,
            (graph_run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"graph run not found: {graph_run_id}")

        parameters = row["parameters"] or {}
        existing_summary = row["qa_summary"] or {}
        layout_backend = existing_summary.get(
            "layout_backend",
            parameters.get("layout", {}).get("backend", "unknown"),
        )
        cluster_backend = existing_summary.get(
            "cluster_backend",
            parameters.get("clusters", {}).get("backend", "unknown"),
        )

        cur.execute(
            """
            SELECT
                COUNT(*)::INTEGER AS point_count,
                COUNT(*) FILTER (WHERE is_noise)::INTEGER AS noise_point_count
            FROM solemd.graph_points
            WHERE graph_run_id = %s
            """,
            (graph_run_id,),
        )
        point_counts = cur.fetchone()
        point_count = point_counts["point_count"]
        noise_point_count = point_counts["noise_point_count"]
        if point_count == 0:
            raise RuntimeError(
                f"graph run {graph_run_id} has no persisted graph_points to publish"
            )

        cur.execute(
            """
            SELECT COUNT(*)::INTEGER AS cluster_count
            FROM solemd.graph_clusters
            WHERE graph_run_id = %s
            """,
            (graph_run_id,),
        )
        cluster_count = cur.fetchone()["cluster_count"]

    policy_summary = materialize_base_admission(graph_run_id)

    bundle_dir = None
    bundle_checksum = None
    bundle_bytes = None
    bundle_manifest = None
    if not skip_export:
        bundle = export_graph_bundle(
            graph_run_id=graph_run_id,
            bundle_profile="base",
        )
        bundle_dir = bundle.bundle_dir
        bundle_checksum = bundle.bundle_checksum
        bundle_bytes = bundle.bundle_bytes
        bundle_manifest = bundle.bundle_manifest

    _finalize_graph_run(
        graph_run_id=graph_run_id,
        bundle_dir=bundle_dir,
        bundle_checksum=bundle_checksum,
        bundle_bytes=bundle_bytes,
        bundle_manifest=bundle_manifest,
        publish_current=publish_current,
        qa_summary={
            "point_count": point_count,
            "noise_point_count": noise_point_count,
            "cluster_count": cluster_count,
            "base_policy": base_policy,
            "layout_backend": layout_backend,
            "cluster_backend": cluster_backend,
            "checkpoint_dir": str(build_paths.root),
            **policy_summary,
        },
    )
    return GraphBuildResult(
        graph_run_id=graph_run_id,
        selected_papers=point_count,
        cluster_count=cluster_count,
        layout_backend=layout_backend,
        cluster_backend=cluster_backend,
        bundle_dir=bundle_dir,
        bundle_checksum=bundle_checksum,
    )
