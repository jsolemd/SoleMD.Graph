"""Calibrate Leiden resolution by sampling embeddings and testing multiple values.

Usage:
    cd engine
    uv run python scripts/calibrate_cluster_resolution.py --sample 100000
"""

from __future__ import annotations

import argparse
import logging
import sys
import time

import numpy as np
from sklearn.neighbors import NearestNeighbors
from sklearn.random_projection import SparseRandomProjection

from app import db

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def sample_embeddings(n: int) -> np.ndarray:
    """Sample n paper embeddings from the current graph run."""
    with db.connect() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT gp.corpus_id
            FROM solemd.graph_points gp
            JOIN solemd.graph_runs gr ON gr.id = gp.graph_run_id AND gr.is_current = true
            ORDER BY hashtext(gp.corpus_id::text)
            LIMIT %s
            """,
            (n,),
        )
        corpus_ids = [r["corpus_id"] for r in cur.fetchall()]

        if not corpus_ids:
            raise RuntimeError("No graph points found in current run")

        logger.info("Loading %d embeddings from DB...", len(corpus_ids))
        cur.execute(
            """
            SELECT corpus_id, embedding
            FROM solemd.papers
            WHERE corpus_id = ANY(%s)
              AND embedding IS NOT NULL
            """,
            (corpus_ids,),
        )
        rows = cur.fetchall()

    logger.info("Parsing %d embeddings...", len(rows))
    id_to_idx = {cid: i for i, cid in enumerate(corpus_ids)}
    dim = None
    vecs = []
    order = []
    for row in rows:
        cid = row["corpus_id"]
        raw = row["embedding"]
        if isinstance(raw, str):
            vec = np.fromstring(raw.strip()[1:-1], sep=",", dtype=np.float32)
        else:
            vec = np.frombuffer(raw, dtype=np.float32)
        if dim is None:
            dim = len(vec)
        vecs.append(vec)
        order.append(id_to_idx[cid])

    mat = np.stack(vecs)
    # Sort back to original order
    sort_idx = np.argsort(order)
    return mat[sort_idx]


def project_and_build_knn(
    embeddings: np.ndarray,
    n_components: int = 50,
    n_neighbors: int = 15,
) -> tuple[np.ndarray, np.ndarray]:
    """L2-normalize, SRP to 50D, build kNN graph."""
    logger.info("L2-normalizing %d embeddings (%dD)...", *embeddings.shape)
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    embeddings = embeddings / norms

    logger.info("SRP projection to %dD...", n_components)
    srp = SparseRandomProjection(n_components=n_components, random_state=42)
    projected = srp.fit_transform(embeddings).astype(np.float32)

    logger.info("Building kNN graph (k=%d)...", n_neighbors)
    nn = NearestNeighbors(metric="cosine", n_neighbors=n_neighbors + 1, n_jobs=-1)
    nn.fit(projected)
    distances, indices = nn.kneighbors(projected)
    return indices, distances


def run_leiden_at_resolution(
    knn_indices: np.ndarray,
    knn_distances: np.ndarray,
    resolution: float,
    n_neighbors: int = 15,
) -> np.ndarray:
    """Run CPU Leiden at given resolution, return cluster_ids."""
    import igraph as ig
    import leidenalg

    neighbor_columns = min(knn_indices.shape[1], n_neighbors + 1)
    n_points = knn_indices.shape[0]
    k = neighbor_columns - 1
    if k <= 0:
        return np.ones(n_points, dtype=np.int32)

    sources = np.repeat(np.arange(n_points, dtype=np.int32), k)
    targets = knn_indices[:, 1:neighbor_columns].ravel().astype(np.int32)
    dists = knn_distances[:, 1:neighbor_columns].ravel().astype(np.float32)

    # Remove self-loops
    valid = sources != targets
    sources, targets, dists = sources[valid], targets[valid], dists[valid]

    # Canonical edge dedup
    lo = np.minimum(sources, targets)
    hi = np.maximum(sources, targets)
    edges_arr = np.empty(len(lo), dtype=[("lo", np.int32), ("hi", np.int32)])
    edges_arr["lo"] = lo
    edges_arr["hi"] = hi
    _, unique_idx = np.unique(edges_arr, return_index=True)
    lo = lo[unique_idx]
    hi = hi[unique_idx]
    weights = np.maximum(0.0, 1.0 - dists[unique_idx]).tolist()

    edge_tuples = list(zip(lo.tolist(), hi.tolist()))
    graph = ig.Graph(n=n_points, edges=edge_tuples, directed=False)
    if weights:
        graph.es["weight"] = weights

    partition = leidenalg.find_partition(
        graph,
        leidenalg.RBConfigurationVertexPartition,
        weights=graph.es["weight"] if weights else None,
        resolution_parameter=resolution,
        seed=42,
    )
    return np.asarray(partition.membership, dtype=np.int32) + 1


def main():
    parser = argparse.ArgumentParser(description="Calibrate Leiden cluster resolution")
    parser.add_argument("--sample", type=int, default=100_000, help="Number of papers to sample")
    parser.add_argument(
        "--resolutions",
        type=float,
        nargs="+",
        default=[3.0, 5.0, 8.0, 10.0, 15.0, 20.0, 30.0, 50.0],
        help="Resolution values to test",
    )
    args = parser.parse_args()

    embeddings = sample_embeddings(args.sample)
    knn_indices, knn_distances = project_and_build_knn(embeddings)

    print(f"\n{'Resolution':>12} {'Clusters':>10} {'Min Size':>10} {'Median':>10} {'Max Size':>10} {'Time (s)':>10}")
    print("-" * 72)

    for res in args.resolutions:
        t0 = time.monotonic()
        cluster_ids = run_leiden_at_resolution(knn_indices, knn_distances, res)
        elapsed = time.monotonic() - t0

        unique, counts = np.unique(cluster_ids, return_counts=True)
        n_clusters = len(unique)
        print(
            f"{res:12.1f} {n_clusters:10d} {counts.min():10d} "
            f"{int(np.median(counts)):10d} {counts.max():10d} {elapsed:10.1f}"
        )

    # Scale estimate for full 2.5M dataset
    scale_factor = 2_500_000 / args.sample
    print(f"\nScale factor to full dataset: {scale_factor:.0f}x")
    print("Note: Leiden cluster count does NOT scale linearly with dataset size.")
    print("Full-dataset builds will produce MORE clusters at the same resolution")
    print("due to the richer kNN graph structure.")


if __name__ == "__main__":
    main()
