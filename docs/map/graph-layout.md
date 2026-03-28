# Graph Layout Pipeline

How 2.4M paper embeddings become a 2D scatter plot with distinct clusters.

## Pipeline stages

```
Embeddings (768-dim)
  → preprocess_embeddings()    mean-center + L2-normalize
  → PCA (50 dims)              reduce before UMAP
  → UMAP (2D)                  nonlinear projection
  → Leiden clustering          community detection on kNN graph
  → apply_cluster_repulsion()  push clusters apart (post-UMAP)
  → compute_spatial_outlier_scores()  LOF + radial distance
  → export: render_points CTE  filter outliers, dense reindex
```

All layout code lives in `engine/app/graph/layout.py`.
Build orchestration in `engine/app/graph/build.py`.
Export/filtering in `engine/app/graph/export_bundle.py`.

## Tuning levers

### UMAP parameters (`LayoutConfig`)

| Parameter | Current | Effect |
|-----------|---------|--------|
| `n_neighbors` | 30 | Higher = smoother clusters, lower = more micro-structure. UMAP docs recommend 30 for clustering. |
| `min_dist` | 0.0 | 0 = max packing within clusters. Higher values spread points more evenly (blobby). |
| `spread` | 1.0 | Scales the overall embedding. Higher = more spread out but less contrast. |
| `set_op_mix_ratio` | 0.25 | Lower = sharper cluster edges, outliers stay separated. 1.0 (default) pulls outliers in. |
| `repulsion_strength` | 1.5 | Amplifies push between non-neighbors. Default is 1.0. |
| `negative_sample_rate` | 10 | More negative samples = stronger repulsion. Default is 5. |

**Key tradeoff**: The UMAP author says you cannot simultaneously maximize both cluster separation AND intra-cluster substructure at 2M+ scale. The current settings favor separation. If you need more internal detail within clusters, increase `min_dist` toward 0.1-0.2.

### Cluster repulsion (`apply_cluster_repulsion`)

Post-UMAP step that pushes clusters apart without changing internal structure.

| Parameter | Current | Effect |
|-----------|---------|--------|
| `cluster_repulsion_factor` | 2.0 | Multiplier for centroid-to-global-center vector. 1.0 = no effect, 2.0 = double gap, 3.0 = triple. |

This is the biggest visual lever for inter-cluster spacing. Intra-cluster structure is perfectly preserved (all points in a cluster move by the same offset).

### Outlier detection (`compute_spatial_outlier_scores`)

Two-pass detection (LOF + radial distance):

| Parameter | Current | Effect |
|-----------|---------|--------|
| `outlier_lof_neighbors` | 20 | LOF neighborhood size. |
| `outlier_contamination` | 0.02 | Expected outlier fraction for LOF (~2%). |
| `radial_percentile` | 99.0 | Points beyond this distance percentile from the median are flagged. Catches dense distant clusters that LOF misses. |

### Cluster labels (`labels.py`)

Uses c-TF-IDF (class-based TF-IDF) — the BERTopic standard. Terms are weighted by distinctiveness to each cluster vs the corpus, not raw frequency. Uses sklearn's 318-word English stopword list + biomedical extensions + `max_df=0.80` automatic filtering.

## Rebuild command

```bash
docker exec -w /workspaces/SoleMD.Graph/engine <container> \
  uv run python -m app.graph.build --run --publish-current
```

Add `--limit 500` for a fast canary build. Add `--skip-export` to build graph tables without Parquet export.

## Research references

- [UMAP parameters docs](https://umap-learn.readthedocs.io/en/latest/parameters.html)
- [UMAP clustering docs](https://umap-learn.readthedocs.io/en/latest/clustering.html) — recommends `min_dist=0`, `n_neighbors=30`
- [UMAP outlier detection](https://umap-learn.readthedocs.io/en/latest/outliers.html) — recommends LOF on 2D coordinates
- [c-TF-IDF (BERTopic)](https://maartengr.github.io/BERTopic/getting_started/ctfidf/ctfidf.html)
- [Centroid repulsion / HD-SDR](https://journals.sagepub.com/doi/full/10.1177/14738716221086589) — sharpened dimensionality reduction
