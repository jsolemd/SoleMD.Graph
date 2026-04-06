"""Graph build orchestration and readiness summaries for the first mapped graph.

This is the thin orchestrator that coordinates submodules:
  - build_common:   shared types and helpers
  - build_inputs:   database loading and embedding memmap
  - build_stages:   checkpointed PCA/kNN/UMAP/clustering/scoring
  - build_writes:   bulk DB writes for graph_points and graph_clusters
  - build_publish:  publishing, finalization, corpus sync
  - build_dispatch: GPU container detection and dispatch
"""

from __future__ import annotations

import argparse
from concurrent.futures import Future
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
import json
import shutil
import sys
import time
import uuid

from psycopg.types.json import Jsonb

import logging as _logging

from app.langfuse_config import (
    SPAN_GRAPH_BUILD_RUN,
    get_langfuse as _get_langfuse,
    get_trace_context as _get_trace_context,
    apply_trace_context as _apply_trace_context,
    observe,
)

logger = _logging.getLogger(__name__)

from app import db
from app.config import settings
from app.graph.checkpoints import checkpoint_paths
from app.graph.checkpoints import update_checkpoint_metadata
from app.graph.clusters import ClusterConfig
from app.graph.layout import LayoutConfig
from app.graph.base_policy import get_active_base_policy_version
from app.graph.labels import build_cluster_labels
from app.graph.paper_evidence import PAPER_EVIDENCE_STAGES
from app.graph.paper_evidence import refresh_paper_evidence_summary
from app.graph.paper_evidence import refresh_paper_evidence_summary_stage

# --- Re-exports from submodules (backwards compatibility) ---
from app.graph.build_common import GraphBuildResult  # noqa: F401
from app.graph.build_common import GraphBuildSummary  # noqa: F401
from app.graph.build_common import GraphInputData  # noqa: F401
from app.graph.build_common import _checkpoint_stage_complete  # noqa: F401
from app.graph.build_common import _graph_temp_dir
from app.graph.build_common import _mark_graph_run_stage
from app.graph.build_inputs import _ensure_input_vectors
from app.graph.build_stages import _ensure_cluster_ids
from app.graph.build_stages import _ensure_layout_coordinates
from app.graph.build_stages import _ensure_layout_matrix
from app.graph.build_stages import _ensure_scored_coordinates
from app.graph.build_stages import _ensure_shared_neighbor_graph
from app.graph.build_writes import _cluster_rows
from app.graph.build_writes import _load_cluster_texts  # noqa: F401 - used by labels.py
from app.graph.build_writes import _write_graph_clusters
from app.graph.build_writes import _write_graph_points
from app.graph.build_publish import _mark_graph_run_failed
from app.graph.build_publish import load_graph_build_summary  # noqa: F401
from app.graph.build_publish import publish_existing_graph_run
from app.graph.build_publish import sync_current_graph_membership
from app.graph.build_dispatch import GPU_CONTAINER
from app.graph.build_dispatch import _dispatch_to_gpu
from app.graph.build_dispatch import _gpu_container_running
from app.graph.build_dispatch import _is_gpu_container


def _check_memory_pressure() -> None:
    """Abort early if memory or disk conditions will cause a crash.

    Three checks:
    1. Swap pressure — stale swap from prior OOM kills cascades into
       subsequent failures.
    2. Available RAM — need ≥4 GB headroom for streaming build process.
    3. Disk space — need ≥10 GB for checkpoints (layout_matrix, kNN arrays).
    """
    try:
        with open("/proc/meminfo") as f:
            info = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    info[parts[0].rstrip(":")] = int(parts[1])  # kB

        swap_total = info.get("SwapTotal", 0)
        swap_free = info.get("SwapFree", 0)
        mem_available = info.get("MemAvailable", 0)

        if swap_total > 0:
            swap_used_pct = (swap_total - swap_free) / swap_total
            if swap_used_pct > 0.80 and mem_available < 10 * 1024 * 1024:  # <10 GB
                raise RuntimeError(
                    f"Memory pressure too high for graph build: "
                    f"swap {swap_used_pct:.0%} used, "
                    f"{mem_available // (1024*1024):.0f} GB RAM available. "
                    f"Run 'sudo swapoff -a && sudo swapon -a' or restart WSL2 "
                    f"('wsl --shutdown' from PowerShell) to clear stale swap."
                )

        # Check available RAM headroom
        if mem_available > 0 and mem_available < 4 * 1024 * 1024:  # <4 GB
            raise RuntimeError(
                f"Insufficient memory for graph build: "
                f"{mem_available // (1024*1024):.0f} GB available, need ≥4 GB. "
                f"Close other applications or restart WSL2."
            )
    except (OSError, KeyError, ZeroDivisionError):
        pass  # Non-Linux or can't read — skip check

    # Check disk space for checkpoints
    try:
        disk = shutil.disk_usage(settings.graph_tmp_root_path)
        if disk.free < 10 * 1024**3:  # <10 GB
            raise RuntimeError(
                f"Insufficient disk space for graph build checkpoints: "
                f"{disk.free // (1024**3):.0f} GB free on {settings.graph_tmp_root_path}. "
                f"Need ≥10 GB for layout matrix + kNN checkpoints."
            )
    except (OSError, TypeError):
        pass  # Can't stat — skip check


def _cleanup_stale_build_artifacts(keep_run_ids: set[str] | None = None) -> None:
    """Remove stale build data from both database and filesystem.

    Called at the start of each build to prevent accumulation of old
    graph_points rows (2.5M per run) and checkpoint files that bloat
    Postgres shared memory and disk.

    Keeps only the currently published run plus any explicitly kept IDs
    (e.g. a resume target). Everything else is deleted.
    """
    keep_run_ids = keep_run_ids or set()

    # --- Database cleanup: delete graph data from old runs ---
    try:
        with db.pooled() as conn, conn.cursor() as cur:
            # Find the current published run (if any)
            cur.execute(
                "SELECT id FROM solemd.graph_runs WHERE status = 'published' "
                "ORDER BY updated_at DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                keep_run_ids = keep_run_ids | {row["id"]}

            if keep_run_ids:
                placeholders = ",".join(["%s"] * len(keep_run_ids))
                keep_list = list(keep_run_ids)
                # Delete in dependency order
                for table in [
                    "solemd.graph_base_points",
                    "solemd.graph_base_features",
                    "solemd.graph_clusters",
                    "solemd.graph_points",
                ]:
                    cur.execute(
                        f"DELETE FROM {table} WHERE graph_run_id NOT IN ({placeholders})",
                        keep_list,
                    )
                cur.execute(
                    f"DELETE FROM solemd.graph_runs WHERE id NOT IN ({placeholders})",
                    keep_list,
                )
            conn.commit()
            logger.info("Cleaned stale graph runs from database (keeping %s)", keep_run_ids)
    except Exception:
        logger.warning("Failed to clean stale DB runs", exc_info=True)

    # --- Filesystem cleanup: stale checkpoint dirs and embedding files ---
    build_dir = _graph_temp_dir()

    for f in build_dir.glob("graph_embeddings_*.f32"):
        try:
            f.unlink()
        except OSError:
            pass

    for d in build_dir.iterdir():
        if not d.is_dir() or d.name in keep_run_ids:
            continue
        meta_path = d / "checkpoint.json"
        if not meta_path.exists():
            shutil.rmtree(d, ignore_errors=True)
            continue
        try:
            meta = json.loads(meta_path.read_text())
            stages = meta.get("stages", {})
            if not any(stages.values()):
                shutil.rmtree(d, ignore_errors=True)
        except (json.JSONDecodeError, OSError):
            pass


def _load_graph_run_record(graph_run_id: str) -> dict:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, status, parameters
            FROM solemd.graph_runs
            WHERE id = %s
            """,
            (graph_run_id,),
        )
        row = cur.fetchone()
        if not row:
            raise RuntimeError(f"graph run not found: {graph_run_id}")
    return row


def _resume_graph_run(
    graph_run_id: str,
) -> tuple[int, str, LayoutConfig, ClusterConfig]:
    row = _load_graph_run_record(graph_run_id)
    parameters = row["parameters"] or {}
    limit = int(parameters.get("limit") or 0)
    base_policy = str(parameters.get("base_policy") or get_active_base_policy_version())
    layout_params = parameters.get("layout") or {}
    cluster_params = parameters.get("clusters") or {}

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE solemd.graph_runs
            SET status = 'running',
                updated_at = now(),
                qa_summary = COALESCE(qa_summary, '{}'::jsonb) || %s::jsonb
            WHERE id = %s
            """,
            (
                Jsonb(
                    {
                        "stage": "resume",
                        "resumed": True,
                    }
                ),
                graph_run_id,
            ),
        )
        conn.commit()

    return (
        limit,
        base_policy,
        LayoutConfig(**layout_params) if layout_params else LayoutConfig(),
        ClusterConfig(**cluster_params) if cluster_params else ClusterConfig(),
    )


def _graph_run_row_counts(graph_run_id: str) -> tuple[int, int]:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                (SELECT COUNT(*)::INTEGER FROM solemd.graph_points WHERE graph_run_id = %s) AS point_count,
                (SELECT COUNT(*)::INTEGER FROM solemd.graph_clusters WHERE graph_run_id = %s) AS cluster_count
            """,
            (graph_run_id, graph_run_id),
        )
        row = cur.fetchone()
    return int(row["point_count"]), int(row["cluster_count"])


def _insert_graph_run(
    *,
    graph_run_id: str,
    graph_name: str,
    node_kind: str,
    parameters: dict,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO solemd.graph_runs (
                id,
                graph_name,
                node_kind,
                status,
                source_release_id,
                embedding_release_id,
                citations_release_id,
                parameters
            )
            VALUES (%s, %s, %s, 'running', %s, %s, %s, %s)
            """,
            (
                graph_run_id,
                graph_name,
                node_kind,
                settings.s2_release_id or None,
                settings.s2_release_id or None,
                settings.s2_release_id or None,
                Jsonb(parameters),
            ),
        )
        conn.commit()


@observe(name=SPAN_GRAPH_BUILD_RUN, capture_input=False, capture_output=False)
def run_graph_build(
    *,
    limit: int = 0,
    publish_current: bool = False,
    skip_export: bool = False,
    refresh_evidence_summary: bool = True,
    resume_run_id: str | None = None,
    cluster_resolution: float | None = None,
    llm_labels: bool = False,
) -> GraphBuildResult:
    if limit and publish_current:
        raise ValueError("partial graph builds cannot be published as current")

    # Name the trace explicitly so it's not "Unnamed trace" in Langfuse
    try:
        client = _get_langfuse()
        if client is not None:
            client.update_current_span(
                name=SPAN_GRAPH_BUILD_RUN,
                input={
                    "limit": limit,
                    "publish_current": publish_current,
                    "resume_run_id": resume_run_id,
                    "cluster_resolution": cluster_resolution,
                    "llm_labels": llm_labels,
                },
            )
    except Exception:
        pass

    _check_memory_pressure()
    _cleanup_stale_build_artifacts(
        keep_run_ids={resume_run_id} if resume_run_id else None,
    )

    if resume_run_id:
        graph_run_id = resume_run_id
        limit, base_policy, layout_config, cluster_config = _resume_graph_run(graph_run_id)
    else:
        graph_run_id = str(uuid.uuid4())
        base_policy = get_active_base_policy_version()
        layout_config = LayoutConfig(
            backend=settings.graph_layout_backend,
            pca_method=settings.graph_pca_method,
        )
        cluster_kwargs: dict = {
            "backend": settings.graph_cluster_backend,
            "resolution": cluster_resolution if cluster_resolution is not None else settings.graph_cluster_resolution,
        }
        cluster_config = ClusterConfig(**cluster_kwargs)
        _insert_graph_run(
            graph_run_id=graph_run_id,
            graph_name="cosmograph",
            node_kind="corpus",
            parameters={
                "limit": limit or None,
                "base_policy": base_policy,
                "layout": asdict(layout_config),
                "clusters": asdict(cluster_config),
            },
        )

    build_paths = checkpoint_paths(graph_run_id)
    update_checkpoint_metadata(
        build_paths,
        payload={
            "base_policy": base_policy,
            "limit": limit or None,
        },
    )
    _mark_graph_run_stage(
        graph_run_id,
        stage="bootstrap",
        paths=build_paths,
        extra={"base_policy": base_policy},
    )

    evidence_future: Future[dict[str, int]] | None = None
    evidence_executor: ThreadPoolExecutor | None = None
    try:
        build_t0 = time.monotonic()
        t0 = build_t0
        corpus_ids, citation_counts, _needs_layout = _ensure_input_vectors(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            limit=limit,
        )
        logger.info("Stage input_vectors: %.1fs, %d papers", time.monotonic() - t0, corpus_ids.size)
        if corpus_ids.size == 0:
            raise RuntimeError("no graph papers with embeddings available for graph build")

        if refresh_evidence_summary:
            # Capture Langfuse trace context so the background thread
            # can attach its spans to the same trace tree.
            _trace_id, _obs_id = _get_trace_context()

            def _evidence_with_trace():
                _apply_trace_context(_trace_id, _obs_id)
                return refresh_paper_evidence_summary()

            evidence_executor = ThreadPoolExecutor(
                max_workers=1,
                thread_name_prefix="paper-evidence-summary",
            )
            evidence_future = evidence_executor.submit(_evidence_with_trace)

        t0 = time.monotonic()
        layout_matrix, layout_backend = _ensure_layout_matrix(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            limit=limit,
            layout_config=layout_config,
        )
        logger.info(
            "Stage layout_matrix: %.1fs, shape=%s, backend=%s",
            time.monotonic() - t0, layout_matrix.shape, layout_backend,
        )

        t0 = time.monotonic()
        shared_knn = _ensure_shared_neighbor_graph(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            layout_matrix=layout_matrix,
            layout_config=layout_config,
            cluster_config=cluster_config,
        )
        logger.info("Stage shared_knn: %.1fs", time.monotonic() - t0)

        t0 = time.monotonic()
        coordinates, layout_backend = _ensure_layout_coordinates(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            layout_matrix=layout_matrix,
            shared_knn=shared_knn,
            layout_config=layout_config,
        )
        logger.info("Stage layout_coordinates: %.1fs", time.monotonic() - t0)
        del layout_matrix  # free ~490 MB before clustering

        t0 = time.monotonic()
        cluster_ids, cluster_backend = _ensure_cluster_ids(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            shared_knn=shared_knn,
            cluster_config=cluster_config,
        )
        logger.info("Stage cluster_ids: %.1fs, backend=%s", time.monotonic() - t0, cluster_backend)

        knn_indices = shared_knn.indices  # keep for scored_coordinates
        del shared_knn  # free distances array ~294 MB

        t0 = time.monotonic()
        coordinates, outlier_scores, merged_noise = _ensure_scored_coordinates(
            graph_run_id=graph_run_id,
            checkpoint_paths_=build_paths,
            coordinates=coordinates,
            cluster_ids=cluster_ids,
            layout_config=layout_config,
            knn_indices=knn_indices,
        )
        logger.info("Stage scored_coordinates: %.1fs", time.monotonic() - t0)

        point_count, cluster_count = _graph_run_row_counts(graph_run_id)
        if point_count == 0:
            _mark_graph_run_stage(
                graph_run_id,
                stage="write_graph_points",
                paths=build_paths,
            )
            _write_graph_points(
                graph_run_id=graph_run_id,
                corpus_ids=corpus_ids,
                coordinates=coordinates,
                cluster_ids=cluster_ids,
                is_noise=merged_noise,
                outlier_scores=outlier_scores,
            )

        if cluster_count == 0:
            _mark_graph_run_stage(
                graph_run_id,
                stage="write_graph_clusters",
                paths=build_paths,
            )
            cluster_texts = _load_cluster_texts(
                graph_run_id=graph_run_id,
                sample_per_cluster=settings.graph_label_sample_per_cluster,
            )
            cluster_labels = build_cluster_labels(cluster_texts)
            label_map = {item.cluster_id: item.label for item in cluster_labels}
            label_mode_map = {item.cluster_id: item.label_mode for item in cluster_labels}
            label_source_map = {item.cluster_id: item.label_source for item in cluster_labels}

            cluster_rows = _cluster_rows(
                graph_run_id=graph_run_id,
                corpus_ids=corpus_ids,
                citation_counts=citation_counts,
                coordinates=coordinates,
                cluster_ids=cluster_ids,
                labels=label_map,
                label_modes=label_mode_map,
                label_sources=label_source_map,
            )
            _write_graph_clusters(cluster_rows)

        if llm_labels:
            _mark_graph_run_stage(
                graph_run_id,
                stage="llm_labels",
                paths=build_paths,
            )
            from app.graph.llm_labels import relabel_graph_run

            relabel_graph_run(graph_run_id)

        if evidence_future is not None:
            evidence_future.result()

        _mark_graph_run_stage(
            graph_run_id,
            stage="publish",
            paths=build_paths,
            extra={
                "layout_backend": layout_backend,
                "cluster_backend": cluster_backend,
            },
        )
        result = publish_existing_graph_run(
            graph_run_id=graph_run_id,
            publish_current=publish_current,
            skip_export=skip_export,
        )

        build_duration_s = round(time.monotonic() - build_t0, 1)
        try:
            client = _get_langfuse()
            if client is not None:
                client.update_current_span(
                    output={
                        "graph_run_id": result.graph_run_id,
                        "point_count": result.selected_papers,
                        "cluster_count": result.cluster_count,
                        "layout_backend": result.layout_backend,
                        "cluster_backend": result.cluster_backend,
                        "bundle_checksum": result.bundle_checksum,
                        "build_duration_s": build_duration_s,
                    },
                )
        except Exception:
            pass

        return GraphBuildResult(
            graph_run_id=result.graph_run_id,
            selected_papers=result.selected_papers,
            cluster_count=result.cluster_count,
            layout_backend=result.layout_backend,
            cluster_backend=result.cluster_backend,
            bundle_dir=result.bundle_dir,
            bundle_checksum=result.bundle_checksum,
        )
    except Exception as exc:
        _mark_graph_run_failed(graph_run_id, exc)
        raise
    finally:
        if evidence_executor is not None:
            evidence_executor.shutdown(wait=True)
        from app.langfuse_config import flush as _flush_langfuse
        _flush_langfuse()
        db.close_pool()


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize or run graph builds")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--run", action="store_true", help="Run a graph build instead of summary only")
    parser.add_argument(
        "--refresh-evidence",
        action="store_true",
        help="Refresh solemd.paper_evidence_summary without running layout or export",
    )
    parser.add_argument(
        "--evidence-stage",
        choices=("all", *PAPER_EVIDENCE_STAGES),
        default="all",
        help="Retained for compatibility; always triggers a full single-pass rebuild regardless of stage",
    )
    parser.add_argument(
        "--publish-run",
        type=str,
        help="Publish a graph run that already has persisted graph_points and graph_clusters",
    )
    parser.add_argument(
        "--sync-current",
        action="store_true",
        help="Backfill corpus.is_in_current_map and corpus.is_in_current_base from the current published graph run",
    )
    parser.add_argument("--limit", type=int, default=0, help="Limit papers for a canary graph build")
    parser.add_argument(
        "--resume-run",
        type=str,
        help="Resume a failed or interrupted graph build from its durable checkpoint directory",
    )
    parser.add_argument(
        "--publish-current",
        action="store_true",
        help="Mark the completed graph run as current and sync current map/base membership on corpus",
    )
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="Build graph tables without exporting a bundle",
    )
    parser.add_argument(
        "--reuse-evidence",
        action="store_true",
        help="Reuse the existing paper_evidence_summary during --run instead of recomputing it",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Force local execution (skip GPU container dispatch)",
    )
    parser.add_argument(
        "--cluster-resolution",
        type=float,
        default=None,
        help="Override cluster resolution (default: GRAPH_CLUSTER_RESOLUTION from config)",
    )
    parser.add_argument(
        "--llm-labels",
        action="store_true",
        help=(
            "Standalone: relabel current graph run's clusters with LLM. "
            "With --run: also relabel after c-TF-IDF generation."
        ),
    )
    parser.add_argument(
        "--re-export",
        action="store_true",
        help="Re-export the current graph run's Parquet bundle (picks up label changes, evidence updates, etc.)",
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete stale graph runs from DB and filesystem, keep only current published run",
    )
    args = parser.parse_args()

    # --llm-labels is standalone OR a modifier on --run
    llm_labels_standalone = args.llm_labels and not args.run
    selected_modes = [
        args.run,
        args.sync_current,
        args.refresh_evidence,
        bool(args.publish_run),
        args.cleanup,
        args.re_export,
        llm_labels_standalone,
    ]
    if sum(1 for selected in selected_modes if selected) > 1:
        raise ValueError(
            "choose only one of --run, --sync-current, --refresh-evidence, "
            "--publish-run, --re-export, --cleanup, or --llm-labels (standalone)"
        )
    if args.resume_run and not args.run:
        raise ValueError("--resume-run can only be used with --run")
    if args.resume_run and args.limit:
        raise ValueError("--resume-run cannot be combined with --limit")

    # Dispatch to GPU container for operations that touch bundle/checkpoint files.
    # These operations run as root inside the container to avoid permission issues
    # on /mnt/solemd-graph/bundles (owned by root from previous container runs).
    #
    # DB-only operations stay local:
    #   --sync-current, --refresh-evidence, --llm-labels
    #
    # Bundle-writing operations dispatch to GPU container:
    #   --run, --publish-run, --re-export, --cleanup
    writes_bundles = args.run or bool(args.publish_run) or args.re_export or args.cleanup
    needs_gpu_dispatch = writes_bundles and not args.local and not _is_gpu_container()

    if needs_gpu_dispatch:
        if _gpu_container_running():
            forward = [a for a in sys.argv[1:] if a != "--local"]
            rc = _dispatch_to_gpu(forward)
            sys.exit(rc)
        elif args.local:
            pass  # user explicitly forced local
        else:
            raise RuntimeError(
                f"GPU container '{GPU_CONTAINER}' is not running.\n"
                f"Bundle operations require the container for correct file ownership.\n"
                f"Start it: docker compose -f docker/compose.yaml --profile gpu up -d graph\n"
                f"Or use --local to force local execution (may hit permission issues)."
            )

    try:
        if args.cleanup:
            _cleanup_stale_build_artifacts()
            payload = {"cleaned": True}
        elif args.run:
            payload = asdict(
                run_graph_build(
                    limit=args.limit,
                    publish_current=args.publish_current,
                    skip_export=args.skip_export,
                    refresh_evidence_summary=not args.reuse_evidence,
                    resume_run_id=args.resume_run,
                    cluster_resolution=args.cluster_resolution,
                    llm_labels=args.llm_labels,
                )
            )
        elif args.refresh_evidence:
            if args.evidence_stage == "all":
                payload = refresh_paper_evidence_summary()
            else:
                payload = refresh_paper_evidence_summary_stage(args.evidence_stage)
        elif args.publish_run:
            payload = asdict(
                publish_existing_graph_run(
                    graph_run_id=args.publish_run,
                    publish_current=args.publish_current,
                    skip_export=args.skip_export,
                )
            )
        elif args.re_export:
            with db.connect() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM solemd.graph_runs "
                    "WHERE is_current = true LIMIT 1"
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("No current graph run found")
                current_run_id = str(row["id"])
            payload = asdict(
                publish_existing_graph_run(
                    graph_run_id=current_run_id,
                    publish_current=True,
                    skip_export=False,
                )
            )
        elif args.sync_current:
            payload = sync_current_graph_membership()
        elif llm_labels_standalone:
            from app.graph.llm_labels import relabel_graph_run

            with db.connect() as conn, conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM solemd.graph_runs "
                    "WHERE is_current = true LIMIT 1"
                )
                row = cur.fetchone()
                if not row:
                    raise RuntimeError("No current graph run found")
                current_run_id = str(row["id"])
            payload = relabel_graph_run(current_run_id)
            logger.info(
                "Labels updated in DB. To export the Parquet bundle:\n"
                "  uv run python -m app.graph.build --re-export --local"
            )
        else:
            payload = asdict(load_graph_build_summary())

        print(json.dumps(payload, indent=2))
    finally:
        from app.langfuse_config import flush as _flush_langfuse
        _flush_langfuse()
        db.close_pool()


if __name__ == "__main__":
    main()
