# Graph Layout Pipeline

How ~2.6M paper embeddings become a 2D scatter plot with distinct clusters,
without recomputing the same neighborhood graph twice.

## Pipeline stages

```
Embeddings (768-dim)
  → preprocess_embeddings()      mean-center + L2-normalize
  → PCA layout matrix (50 dims)  shared substrate for layout + clustering
  → shared kNN graph             one neighbor graph, reused twice
  → UMAP (2D)                    nonlinear projection using precomputed_knn
  → Leiden clustering            community detection from the same kNN graph
  → apply_cluster_repulsion()    radial push + local centroid relaxation
  → compute_spatial_outlier_scores()  LOF + radial distance
  → export: base_points / universe_points
```

Key implementation files:

- `engine/app/graph/layout.py`
- `engine/app/graph/clusters.py`
- `engine/app/graph/neighbors.py`
- `engine/app/graph/checkpoints.py`
- `engine/app/graph/build.py`

## Tuning levers

### UMAP parameters (`LayoutConfig`)

| Parameter | Current | Effect |
|-----------|---------|--------|
| `n_neighbors` | 30 | Higher = smoother clusters, lower = more micro-structure. UMAP docs recommend 30 for clustering. |
| `min_dist` | 0.08 | Small positive value to keep dense neighborhoods from fully collapsing into a single pile. |
| `spread` | 1.0 | Scales the overall embedding. Higher = more spread out but less contrast. |
| `set_op_mix_ratio` | 0.25 | Lower = sharper cluster edges, outliers stay separated. 1.0 (default) pulls outliers in. |
| `repulsion_strength` | 1.5 | Amplifies push between non-neighbors. Default is 1.0. |
| `negative_sample_rate` | 10 | More negative samples = stronger repulsion. Default is 5. |

**Key tradeoff**: The UMAP author says you cannot simultaneously maximize both cluster separation AND intra-cluster substructure at 2M+ scale. The current settings still favor separation, but with a small amount of breathing room inside dense regions. If you need more internal detail within clusters, increase `min_dist` toward 0.1-0.2.

### Cluster repulsion (`apply_cluster_repulsion`)

Post-UMAP step that keeps intra-cluster structure rigid while improving spacing in two passes:

1. Radial centroid push away from the global center.
2. Small pairwise centroid relaxation among nearby non-noise clusters when their
   robust radii still overlap.

| Parameter | Current | Effect |
|-----------|---------|--------|
| `cluster_repulsion_factor` | 2.0 | Multiplier for centroid-to-global-center vector. 1.0 = no effect, 2.0 = double gap, 3.0 = triple. |
| `cluster_relaxation_neighbors` | 6 | Number of nearby cluster centroids considered per iteration. |
| `cluster_relaxation_iterations` | 6 | Small fixed number of centroid-only relaxation passes. |
| `cluster_relaxation_gap_scale` | 1.15 | Target gap as a multiple of the sum of two robust cluster radii. |
| `cluster_relaxation_step` | 0.35 | Fraction of the remaining overlap resolved per iteration. |

`cluster_repulsion_factor` remains the biggest lever for satellite spacing. The
relaxation pass is aimed at the crowded center, where pure radial repulsion has
little effect because many centroids already sit near the global median.

### Outlier detection (`compute_spatial_outlier_scores`)

Two-pass detection (LOF + radial distance):

| Parameter | Current | Effect |
|-----------|---------|--------|
| `outlier_lof_neighbors` | 20 | LOF neighborhood size. |
| `outlier_contamination` | 0.02 | Expected outlier fraction for LOF (~2%). |
| `radial_percentile` | 99.0 | Points beyond this distance percentile from the median are flagged. Catches dense distant clusters that LOF misses. |

### Cluster labels (`labels.py`)

Uses c-TF-IDF (class-based TF-IDF) — the BERTopic standard. Terms are weighted by distinctiveness to each cluster vs the corpus, not raw frequency. Uses sklearn's 318-word English stopword list + biomedical extensions + `max_df=0.80` automatic filtering.

## Canonical Build Stages

The canonical graph build is now split into two durable layers:

1. database-side evidence summary
2. filesystem-side layout checkpoints

### Database-side evidence summary

These stages populate `solemd.paper_evidence_summary` and can be resumed one
stage at a time:

```bash
cd engine
uv run python -m app.graph.build --refresh-evidence --evidence-stage source
uv run python -m app.graph.build --refresh-evidence --evidence-stage entity
uv run python -m app.graph.build --refresh-evidence --evidence-stage relation
uv run python -m app.graph.build --refresh-evidence --evidence-stage journal
uv run python -m app.graph.build --refresh-evidence --evidence-stage finalize
```

### Filesystem-side layout checkpoints

Each graph run gets a checkpoint directory under:

- `graph/tmp/graph_build/<graph_run_id>/`

Persisted artifacts currently include:

- `corpus_ids.npy`
- `citation_counts.npy`
- `layout_matrix.npy`
- `knn_indices.npy`
- `knn_distances.npy`
- `coordinates.npy`
- `cluster_ids.npy`
- `outlier_scores.npy`
- `is_noise.npy`
- `checkpoint.json`

That means a failed run can resume from the last completed artifact instead of
reloading raw PubTator evidence or recomputing the shared kNN graph.

## Canonical Commands

```bash
cd engine
uv run python -m app.graph.build --run --publish-current --reuse-evidence
```

Resume a failed layout/clustering build:

```bash
cd engine
uv run python -m app.graph.build --run --resume-run <graph_run_id> --publish-current --reuse-evidence
```

Publish an already-persisted run later:

```bash
cd engine
uv run python -m app.graph.build --publish-run <graph_run_id> --publish-current
```

Add `--limit 500` for a canary build. Add `--skip-export` to build graph tables
without writing the bundle.

## Research references

- [UMAP parameters docs](https://umap-learn.readthedocs.io/en/latest/parameters.html)
- [UMAP clustering docs](https://umap-learn.readthedocs.io/en/latest/clustering.html) — recommends `min_dist=0`, `n_neighbors=30`
- [UMAP FAQ](https://umap-learn.readthedocs.io/en/latest/faq.html) — multicore behavior and GPU guidance
- [UMAP outlier detection](https://umap-learn.readthedocs.io/en/latest/outliers.html) — recommends LOF on 2D coordinates
- [RAPIDS cuml.accel FAQ](https://docs.rapids.ai/api/cuml/legacy/cuml-accel/faq/) — zero-code-change acceleration notes
- [cuGraph API docs](https://docs.rapids.ai/api/cugraph/stable/api_docs/cugraph/) — GPU Leiden support
- [c-TF-IDF (BERTopic)](https://maartengr.github.io/BERTopic/getting_started/ctfidf/ctfidf.html)
- [Centroid repulsion / HD-SDR](https://journals.sagepub.com/doi/full/10.1177/14738716221086589) — sharpened dimensionality reduction
