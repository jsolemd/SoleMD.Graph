# 14 — Bundle build pipeline (engine work)

## What the publisher emits

Per the data contract ([02-data-contract.md](02-data-contract.md)):
checksum-addressed immutable bundles under `/graph-bundles/<checksum>/`.
The pipeline runs in `apps/worker/` (or whichever engine
rebuilds replaces it under `apps/api/`).

New publisher steps for orb-capable bundles:

### Step 1 — Materialize evidence membership

`solemd.release_evidence_members` aggregates `graph_signals` per
`(graph_release_id, paper_id)` with `signal_count`,
`dominant_kind`, `earliest_seen_at`, `last_seen_at`. Release-
scoped only (no cross-release mixing per canonical correction 2).

### Step 2 — Bake 3D force layout

Inputs:
- Resident set (or full base; depends on bundle profile).
- Citation edges from `universe_links` restricted to in-scope
  papers.
- Shared-entity edges computed via the canonical
  `entity-edge-spec.json`.
- Cluster assignments.

Pipeline:
1. **3D UMAP** on SPECTER2 embeddings → seed positions.
2. **ForceAtlas2 refinement** (`bhargavchippada/forceatlas2`,
   Python Cython, native `dim=3`):
   - `linLogMode=True`
   - cluster-affinity edge-weight bonus (×2 for same-cluster)
   - soft anchor to UMAP seed via weak gravity
   - Barnes-Hut octree
   - 200–400 refinement iters
3. Normalize to unit-sphere extent.

Wall-clock budget: ≤ 30s on non-GPU CI at 10K nodes. Library
alternative: `graph-tool` SFDP (faster, same visual).

### Step 3 — Bake canonical edge weights

Both sources emit `weight FLOAT` already computed via
`α · citation_weight + β · idf_shared_entity_weight` from
`entity-edge-spec.json`. Runtime never re-derives.

### Step 4 — Bake cluster centroids

`release_cluster_centroids.parquet` from the final layout.
Runtime never recomputes at-rest centroids.

### Step 5 — Bake kNN shards

Per [02-data-contract.md](02-data-contract.md):

- `paper_knn_resident.parquet` — top-20 over the resident set
  (immutable per release).
- `paper_knn_<cluster_id>.parquet` — top-20 outgoing neighbors for
  source papers in each cluster. Cross-cluster neighbors stay in the
  source cluster's shard with `target_cluster_id`. Large clusters split
  into subshards by source id range; per-shard byte counts are written
  to manifest metadata.

kNN computed from PostgreSQL pgvector cosine over SPECTER2.
Capped at top-20 per node (exclusive of self), with adaptive lower `k`
allowed for WebGL2/low-power budgets. Weights = cosine similarity;
renormalized to [0, 1] per paper.

### Step 6 — Manifest emits capability + layout params

```
{
  "bundleVersion": "...",
  "checksum": "...",
  "orbCapabilityVersion": 1,
  "tables": {
    "base_points": "base_points.parquet",
    "release_points_3d": "release_points_3d.parquet",
    "release_cluster_centroids": "release_cluster_centroids.parquet",
    "release_evidence_members": "release_evidence_members.parquet",
    "paper_knn_resident": "paper_knn_resident.parquet",
    "paper_knn_clusters": "paper_knn_<cluster_id>.parquet",
    "universe_links": "universe_links.parquet",
    ...
  },
	"layout": {
    "force_iters": 300,
    "force_library": "forceatlas2",
    "umap_seed": 20260424,
    "cluster_bonus_multiplier": 2.0,
    "linlog_mode": true,
    "umap_anchor_strength": 0.05,
	    "entity_edge_spec_hash": "<sha256>",
	    "embedding_model": "specter2",
	    "embedding_revision": "<revision-or-date>",
	    "knn_shard_manifest": "paper_knn_manifest.json"
	  }
	}
```

## Tuning gate (per canonical M0)

Publisher produces three release fixtures at ~5K, ~8K, ~10K
evidence nodes. Plus a full-corpus fixture at 100K.

For each, generate a render sheet: 3 camera angles, points colored
by `cluster_id`, edges Tier-0 (cluster chords) drawn.

Visual criteria, all required:
- Clusters visibly separated; no single dominant blob swallowing
  most nodes.
- Clusters NOT exploding into disconnected islands.
- Linked pairs and same-cluster pairs are materially closer than
  random pairs (mean intra-cluster distance < 0.6 × mean random-pair
  distance; mean linked-pair distance < 0.7 × mean random-pair
  distance).
- Per-cluster outlier gates pass: small clusters are not swallowed by
  large neighbors, no bottom-decile cluster collapses below radius
  floor, and high-cohesion clusters do not become opaque blobs.
- 20-paper exemplar audit: product owner picks 20 papers whose
  semantic neighborhood they know, verifies each paper's 3D
  neighbors match expected topical cluster.

Structural-stability criterion: rerun publish twice on a fixed
seed; after Procrustes alignment, 90th-percentile nearest-neighbor
set overlap ≥ 0.8. (Replaces canonical's earlier
floating-point-epsilon claim, which is unrealistic across CI
runners with different BLAS/Cython builds.)

Sign-off: product owner + graph-runtime owner. Only then are
layout parameters locked into the contract.

## Python deps for the worker

Image size impact ~+300 MB; committed to:

- `umap-learn`
- `numpy`
- `scipy`
- `scikit-learn`
- `bhargavchippada/forceatlas2` (or `fa2-modified`)
- `pyarrow` (Parquet emission)

Alternative lighter path (numpy + scipy MDS seed, no UMAP, no
FA2) if image size becomes a blocker — trade-off is weaker
semantic seeding.

## Files

- `db/migrations/warehouse/<timestamp>_warehouse_graph_orb_release_surfaces.sql`
  — evidence materialized view.
- `apps/worker/app/graph/layout_3d.py` — UMAP seed + FA2
  refinement step; pure Python/Cython, no GPU dependency.
- `apps/worker/app/graph/knn.py` — kNN computation + sharding
  per cluster.
- `apps/worker/app/graph/publish.py` — emit parquets; record
  layout params in manifest.
- `packages/graph/spec/entity-edge-spec.json` — canonical spec.
- `packages/graph/src/types/bundle.ts` — TypeScript types for
  new optional assets + `orbCapabilityVersion`.
- `packages/graph/src/entity-edge-spec.ts` — typed re-export of
  the JSON spec with Zod schema.
- `apps/web/features/graph/lib/fetch/{constants.ts, normalize.ts}`
  — recognize new keys without requiring them.

## Owns / doesn't own

Owns: publish pipeline, layout step, kNN sharding, manifest
shape, tuning gate, Python deps.

Doesn't own:
- Bundle file shape definition → [02-data-contract.md](02-data-contract.md).
- Runtime view extensions → [02-data-contract.md](02-data-contract.md).
- Frontend bundle-load logic → existing
  `apps/web/features/graph/lib/fetch/`.

## Prerequisites

[02-data-contract.md](02-data-contract.md).

## Consumers

[milestones/M0-data-contract.md](milestones/M0-data-contract.md),
all M1-onward (depend on M0 emitting capable bundles).

## Invalidation

- ForceAtlas2 replaced (e.g. graph-tool SFDP at scale; or a
  native-GPU 3D layout) → step 2 swaps out; rest unchanged.
- Embeddings model changes (SPECTER2 → SPECTER3) → kNN +
  cluster centroids change; `orbCapabilityVersion` bumps.
- Bundle profile gains a "universe-3D-included" tier → kNN
  sharding strategy revises.
