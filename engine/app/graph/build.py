"""Graph build orchestration and readiness summaries for the first mapped graph."""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import asdict
from dataclasses import dataclass
import json
from pathlib import Path
import uuid

from psycopg.types.json import Jsonb

from app import db
from app.config import settings
from app.graph._util import require_numpy
from app.graph.clusters import ClusterConfig
from app.graph.clusters import run_leiden
from app.graph.export_bundle import BUNDLE_VERSION
from app.graph.export_bundle import export_graph_bundle
from app.graph.labels import build_cluster_labels
from app.graph.labels import load_vocabulary_terms
from app.graph.layout import LayoutConfig
from app.graph.layout import apply_cluster_repulsion
from app.graph.layout import compute_spatial_outlier_scores
from app.graph.layout import preprocess_embeddings
from app.graph.render_policy import DEFAULT_VISIBLE_POLICY
from app.graph.render_policy import default_visible_point_predicate_sql
from app.graph.layout import run_layout


@dataclass(frozen=True, slots=True)
class GraphBuildSummary:
    total_graph: int
    total_graph_papers: int
    mapped_now: int
    default_visible_now: int
    ready_for_layout: int
    missing_embeddings: int
    missing_text_availability: int


@dataclass(frozen=True, slots=True)
class GraphBuildResult:
    graph_run_id: str
    selected_papers: int
    cluster_count: int
    layout_backend: str
    cluster_backend: str
    bundle_dir: str | None
    bundle_checksum: str | None


@dataclass(frozen=True, slots=True)
class GraphInputData:
    corpus_ids: "numpy.ndarray"
    citation_counts: "numpy.ndarray"
    embeddings: "numpy.ndarray"
    embedding_path: str | None


def load_graph_build_summary() -> GraphBuildSummary:
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE corpus_tier = 'graph'")
        total_graph = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.graph_papers")
        total_graph_papers = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_mapped = true")
        mapped_now = cur.fetchone()["n"]
        cur.execute("SELECT count(*) AS n FROM solemd.corpus WHERE is_default_visible = true")
        default_visible_now = cur.fetchone()["n"]
        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE embedding IS NOT NULL) AS ready_for_layout,
                count(*) FILTER (WHERE embedding IS NULL) AS missing_embeddings,
                count(*) FILTER (WHERE text_availability IS NULL) AS missing_text_availability
            FROM solemd.papers p
            JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
            WHERE c.corpus_tier = 'graph'
            """
        )
        row = cur.fetchone()

    return GraphBuildSummary(
        total_graph=total_graph,
        total_graph_papers=total_graph_papers,
        mapped_now=mapped_now,
        default_visible_now=default_visible_now,
        ready_for_layout=row["ready_for_layout"],
        missing_embeddings=row["missing_embeddings"],
        missing_text_availability=row["missing_text_availability"],
    )


def _parse_embedding(text: str) -> "numpy.ndarray":
    np = require_numpy()
    return np.fromstring(text.strip()[1:-1], sep=",", dtype=np.float32)


def _graph_temp_dir() -> Path:
    path = settings.graph_tmp_root_path / "graph_build"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _graph_input_count(limit: int = 0) -> int:
    base_query = """
        SELECT gp.corpus_id
        FROM solemd.graph_papers gp
        JOIN solemd.papers p ON p.corpus_id = gp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY gp.corpus_id
    """
    query = f"SELECT count(*) AS n FROM ({base_query}) t"
    params: tuple[int, ...] | tuple[()] = ()
    if limit > 0:
        query = f"SELECT count(*) AS n FROM ({base_query} LIMIT %s) t"
        params = (limit,)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        return cur.fetchone()["n"]


def _first_embedding() -> str | None:
    query = """
        SELECT p.embedding::TEXT AS embedding_text
        FROM solemd.graph_papers gp
        JOIN solemd.papers p ON p.corpus_id = gp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY gp.corpus_id
        LIMIT 1
    """
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query)
        row = cur.fetchone()
    if not row:
        return None
    return row["embedding_text"]


def _load_graph_inputs(limit: int = 0) -> GraphInputData:
    np = require_numpy()
    count = _graph_input_count(limit=limit)
    if count == 0:
        return GraphInputData(
            corpus_ids=np.empty(shape=(0,), dtype=np.int64),
            citation_counts=np.empty(shape=(0,), dtype=np.int32),
            embeddings=np.empty(shape=(0, 0), dtype=np.float32),
            embedding_path=None,
        )

    first_embedding = _first_embedding()
    if first_embedding is None:
        return GraphInputData(
            corpus_ids=np.empty(shape=(0,), dtype=np.int64),
            citation_counts=np.empty(shape=(0,), dtype=np.int32),
            embeddings=np.empty(shape=(0, 0), dtype=np.float32),
            embedding_path=None,
        )

    first_vector = _parse_embedding(first_embedding)
    dimension = int(first_vector.shape[0])
    embedding_path = _graph_temp_dir() / f"graph_embeddings_{uuid.uuid4().hex}.f32"
    embeddings = np.memmap(
        embedding_path,
        mode="w+",
        dtype=np.float32,
        shape=(count, dimension),
    )
    corpus_ids = np.empty(shape=(count,), dtype=np.int64)
    citation_counts = np.empty(shape=(count,), dtype=np.int32)

    query = """
        SELECT
            gp.corpus_id,
            COALESCE(p.citation_count, 0) AS citation_count,
            p.embedding::TEXT AS embedding_text
        FROM solemd.graph_papers gp
        JOIN solemd.papers p ON p.corpus_id = gp.corpus_id
        WHERE p.embedding IS NOT NULL
        ORDER BY gp.corpus_id
    """
    params: tuple[int, ...] | tuple[()] = ()
    if limit > 0:
        query += " LIMIT %s"
        params = (limit,)

    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(query, params)
        index = 0
        while batch := cur.fetchmany(size=settings.graph_embedding_fetch_batch_size):
            for row in batch:
                corpus_ids[index] = int(row["corpus_id"])
                citation_counts[index] = int(row["citation_count"] or 0)
                embeddings[index] = _parse_embedding(row["embedding_text"])
                index += 1

    if index != count:
        raise RuntimeError(f"graph input load mismatch: expected {count} rows, loaded {index}")

    return GraphInputData(
        corpus_ids=corpus_ids,
        citation_counts=citation_counts,
        embeddings=embeddings,
        embedding_path=str(embedding_path),
    )


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


def _write_graph_points(
    *,
    graph_run_id: str,
    corpus_ids: "numpy.ndarray",
    coordinates: "numpy.ndarray",
    cluster_ids: "numpy.ndarray",
    is_noise: "numpy.ndarray",
    outlier_scores: "numpy.ndarray | None" = None,
) -> None:
    with db.pooled() as conn, conn.cursor() as cur:
        with cur.copy(
            """
            COPY solemd.graph (
                graph_run_id,
                corpus_id,
                point_index,
                x,
                y,
                cluster_id,
                micro_cluster_id,
                cluster_probability,
                outlier_score,
                is_noise
            )
            FROM STDIN
            """
        ) as copy:
            for point_index, (corpus_id, xy, cluster_id, noise_flag) in enumerate(
                zip(corpus_ids.tolist(), coordinates, cluster_ids, is_noise, strict=False)
            ):
                score = (
                    float(outlier_scores[point_index])
                    if outlier_scores is not None
                    else None
                )
                copy.write_row(
                    (
                        graph_run_id,
                        int(corpus_id),
                        point_index,
                        float(xy[0]),
                        float(xy[1]),
                        int(cluster_id),
                        None,
                        None,
                        score,
                        bool(noise_flag),
                    )
                )
        conn.commit()


def _cluster_rows(
    *,
    graph_run_id: str,
    corpus_ids: "numpy.ndarray",
    citation_counts: "numpy.ndarray",
    coordinates: "numpy.ndarray",
    cluster_ids: "numpy.ndarray",
    labels: dict[int, str],
    label_modes: dict[int, str],
    label_sources: dict[int, str],
) -> list[tuple]:
    np = require_numpy()
    grouped: dict[int, list[int]] = defaultdict(list)
    for idx, cluster_id in enumerate(cluster_ids.tolist()):
        grouped[int(cluster_id)].append(idx)

    cluster_rows: list[tuple] = []
    for cluster_id, indices in sorted(grouped.items()):
        coords = coordinates[indices]
        centroid_x = float(coords[:, 0].mean())
        centroid_y = float(coords[:, 1].mean())
        representative_idx = min(
            indices,
            key=lambda i: (
                float((coordinates[i, 0] - centroid_x) ** 2 + (coordinates[i, 1] - centroid_y) ** 2),
                -int(citation_counts[i]),
                int(corpus_ids[i]),
            ),
        )
        cluster_rows.append(
            (
                graph_run_id,
                cluster_id,
                labels.get(cluster_id),
                label_modes.get(cluster_id),
                label_sources.get(cluster_id),
                len(indices),
                len(indices),
                centroid_x,
                centroid_y,
                f"paper:{int(corpus_ids[representative_idx])}",
                "paper",
                len(indices),
                None,
                None,
                False,
            )
        )
    return cluster_rows


def _load_cluster_texts(*, graph_run_id: str, sample_per_cluster: int = 200) -> dict[int, list[str]]:
    cluster_texts: dict[int, list[str]] = defaultdict(list)
    with db.pooled() as conn, conn.cursor() as cur:
        cur.execute(
            """
            WITH ranked AS (
                SELECT
                    g.cluster_id,
                    COALESCE(p.tldr, p.abstract, p.title) AS label_text,
                    row_number() OVER (
                        PARTITION BY g.cluster_id
                        ORDER BY COALESCE(p.citation_count, 0) DESC, g.corpus_id
                    ) AS rn
                FROM solemd.graph g
                JOIN solemd.papers p ON p.corpus_id = g.corpus_id
                WHERE g.graph_run_id = %s
            )
            SELECT cluster_id, label_text
            FROM ranked
            WHERE rn <= %s
            ORDER BY cluster_id, rn
            """,
            (graph_run_id, sample_per_cluster),
        )
        for row in cur.fetchall():
            cluster_texts[int(row["cluster_id"])].append(row["label_text"] or "")
    return cluster_texts


def _write_graph_clusters(cluster_rows: list[tuple]) -> None:
    if not cluster_rows:
        return

    with db.pooled() as conn, conn.cursor() as cur:
        with cur.copy(
            """
            COPY solemd.graph_clusters (
                graph_run_id,
                cluster_id,
                label,
                label_mode,
                label_source,
                member_count,
                paper_count,
                centroid_x,
                centroid_y,
                representative_node_id,
                representative_node_kind,
                candidate_count,
                mean_cluster_probability,
                mean_outlier_score,
                is_noise
            )
            FROM STDIN
            """
        ) as copy:
            for row in cluster_rows:
                copy.write_row(row)
        conn.commit()


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
            _sync_current_corpus_visibility(cur, graph_run_id)
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


def _sync_current_corpus_visibility(cur, graph_run_id: str) -> None:
    default_visible_predicate = default_visible_point_predicate_sql("g")
    cur.execute(
        """
        UPDATE solemd.corpus
        SET is_mapped = false,
            is_default_visible = false
        WHERE is_mapped = true
           OR is_default_visible = true
        """
    )
    cur.execute(
        """
        UPDATE solemd.corpus c
        SET is_mapped = true
        FROM solemd.graph g
        WHERE g.graph_run_id = %s
          AND g.corpus_id = c.corpus_id
          AND c.is_mapped IS DISTINCT FROM true
        """,
        (graph_run_id,),
    )
    cur.execute(
        f"""
        UPDATE solemd.corpus c
        SET is_default_visible = true
        FROM solemd.graph g
        WHERE g.graph_run_id = %s
          AND g.corpus_id = c.corpus_id
          AND {default_visible_predicate}
          AND c.is_default_visible IS DISTINCT FROM true
        """,
        (graph_run_id,),
    )


def sync_current_graph_flags() -> dict[str, str | int]:
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
        _sync_current_corpus_visibility(cur, graph_run_id)

        cur.execute(
            """
            SELECT
                count(*) FILTER (WHERE is_mapped = true)::INTEGER AS mapped_now,
                count(*) FILTER (WHERE is_default_visible = true)::INTEGER AS default_visible_now
            FROM solemd.corpus
            """
        )
        counts = cur.fetchone()
        conn.commit()

    return {
        "graph_run_id": graph_run_id,
        "mapped_now": counts["mapped_now"],
        "default_visible_now": counts["default_visible_now"],
        "default_visible_policy": DEFAULT_VISIBLE_POLICY,
    }


def run_graph_build(
    *,
    limit: int = 0,
    publish_current: bool = False,
    skip_export: bool = False,
) -> GraphBuildResult:
    if limit and publish_current:
        raise ValueError("partial graph builds cannot be published as current")

    graph_run_id = str(uuid.uuid4())
    layout_config = LayoutConfig(backend=settings.graph_layout_backend)
    cluster_config = ClusterConfig(backend=settings.graph_cluster_backend)
    _insert_graph_run(
        graph_run_id=graph_run_id,
        graph_name="cosmograph",
        node_kind="corpus",
        parameters={
            "limit": limit or None,
            "default_visible_policy": DEFAULT_VISIBLE_POLICY,
            "layout": asdict(layout_config),
            "clusters": asdict(cluster_config),
        },
    )

    input_data: GraphInputData | None = None
    try:
        input_data = _load_graph_inputs(limit=limit)
        if input_data.corpus_ids.size == 0:
            raise RuntimeError("no graph papers with embeddings available for graph build")

        embeddings = preprocess_embeddings(input_data.embeddings, layout_config)
        layout_result = run_layout(embeddings, config=layout_config)
        cluster_result = run_leiden(embeddings, config=cluster_config)

        coordinates = apply_cluster_repulsion(
            layout_result.coordinates,
            cluster_result.cluster_ids,
            repulsion_factor=layout_config.cluster_repulsion_factor,
        )

        outlier_result = compute_spatial_outlier_scores(
            coordinates,
            n_neighbors=layout_config.outlier_lof_neighbors,
            contamination=layout_config.outlier_contamination,
        )
        merged_noise = cluster_result.is_noise | outlier_result.is_spatial_outlier

        _write_graph_points(
            graph_run_id=graph_run_id,
            corpus_ids=input_data.corpus_ids,
            coordinates=coordinates,
            cluster_ids=cluster_result.cluster_ids,
            is_noise=merged_noise,
            outlier_scores=outlier_result.outlier_scores,
        )

        cluster_texts = _load_cluster_texts(
            graph_run_id=graph_run_id,
            sample_per_cluster=settings.graph_label_sample_per_cluster,
        )
        vocab_terms = load_vocabulary_terms()
        cluster_labels = build_cluster_labels(cluster_texts, vocab_terms=vocab_terms)
        label_map = {item.cluster_id: item.label for item in cluster_labels}
        label_mode_map = {item.cluster_id: item.label_mode for item in cluster_labels}
        label_source_map = {item.cluster_id: item.label_source for item in cluster_labels}

        cluster_rows = _cluster_rows(
            graph_run_id=graph_run_id,
            corpus_ids=input_data.corpus_ids,
            citation_counts=input_data.citation_counts,
            coordinates=coordinates,
            cluster_ids=cluster_result.cluster_ids,
            labels=label_map,
            label_modes=label_mode_map,
            label_sources=label_source_map,
        )
        _write_graph_clusters(cluster_rows)

        bundle_dir = None
        bundle_checksum = None
        bundle_bytes = None
        bundle_manifest = None
        if not skip_export:
            bundle = export_graph_bundle(
                graph_run_id=graph_run_id,
                bundle_profile="hot",
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
                "point_count": int(input_data.corpus_ids.shape[0]),
                "renderable_point_count": int(input_data.corpus_ids.shape[0] - outlier_result.outlier_count),
                "cluster_count": len(cluster_rows),
                "spatial_outlier_count": outlier_result.outlier_count,
                "spatial_outlier_method": outlier_result.method,
                "default_visible_policy": DEFAULT_VISIBLE_POLICY,
                "limit": limit or None,
                "layout_backend": layout_result.backend,
                "cluster_backend": cluster_result.backend,
            },
        )
        return GraphBuildResult(
            graph_run_id=graph_run_id,
            selected_papers=int(input_data.corpus_ids.shape[0]),
            cluster_count=len(cluster_rows),
            layout_backend=layout_result.backend,
            cluster_backend=cluster_result.backend,
            bundle_dir=bundle_dir,
            bundle_checksum=bundle_checksum,
        )
    except Exception as exc:
        _mark_graph_run_failed(graph_run_id, exc)
        raise
    finally:
        if input_data and input_data.embedding_path:
            Path(input_data.embedding_path).unlink(missing_ok=True)
        db.close_pool()


def main() -> None:
    parser = argparse.ArgumentParser(description="Summarize or run graph builds")
    parser.add_argument("--json", action="store_true", help="Emit JSON only")
    parser.add_argument("--run", action="store_true", help="Run a graph build instead of summary only")
    parser.add_argument(
        "--sync-current-flags",
        action="store_true",
        help="Backfill corpus.is_mapped and corpus.is_default_visible from the current published graph run",
    )
    parser.add_argument("--limit", type=int, default=0, help="Limit papers for a canary graph build")
    parser.add_argument(
        "--publish-current",
        action="store_true",
        help="Mark the completed graph run as current and set corpus.is_mapped",
    )
    parser.add_argument(
        "--skip-export",
        action="store_true",
        help="Build graph tables without exporting a bundle",
    )
    args = parser.parse_args()

    if args.run and args.sync_current_flags:
        raise ValueError("choose either --run or --sync-current-flags")

    if args.run:
        payload = asdict(
            run_graph_build(
                limit=args.limit,
                publish_current=args.publish_current,
                skip_export=args.skip_export,
            )
        )
    elif args.sync_current_flags:
        payload = sync_current_graph_flags()
    else:
        payload = asdict(load_graph_build_summary())

    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
