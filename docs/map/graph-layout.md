# Graph Layout Pipeline

Production pipeline that turns ~2.6M paper embeddings into a 2D scatter plot
with distinct research-community clusters. Full rebuild: ~15 minutes on GPU.

---

## Pipeline Flow

```
  DB (pgvector binary COPY)
    │  binary wire format, no text parsing
    │  40x faster than TEXT COPY
    │
    ▼
  Stream 100K-row chunks ──────────────────── prefetch thread overlaps I/O
    │  L2-normalize per chunk                  with compute (see below)
    │  per-row, independent of other chunks
    │
    ▼
  SparseRandomProjection (768D → 50D) ─────── single-pass JL-lemma projection
    │  data-independent fit, no second DB scan  ~800 MB → ~50 MB per chunk
    │  vectorized dedup: 3x less RAM than set
    │
    ▼
  Shared kNN graph (k=30) ──────────────────── one neighbor graph, reused twice
    │  NNDescent (CPU) or cuML (GPU)            avoids double kNN computation
    │  n_jobs=-1: all CPU cores
    │
    ├───────────────────────┐
    ▼                       ▼
  UMAP (2D)               Leiden clustering
    │  precomputed_knn       │  GPU cugraph or CPU igraph
    │  n_jobs=-1             │  resolution from config (default 3.0)
    │                        │
    ▼                        │
  Coordinates ◄──────────────┘
    │
    ▼
  apply_cluster_repulsion() ────────────────── pairwise overlap resolution
    │  topology + density + size awareness      (rigid translation only)
    │  gap_scale=0.65: accepts 35% edge overlap
    │
    ▼
  compute_spatial_outlier_scores() ─────────── LOF + radial distance
    │  two-pass detection, 2% contamination
    │
    ▼
  Base admission ───────────────────────────── continuous domain_score
    │  top target_base_count (from base_policy) → base  family diversity² + bonuses
    │  rest → universe                          see base_policy.py
    │
    ▼
  Export: base_points.parquet + base_clusters.parquet + universe_points.parquet
          manifest.json with checksums (drives frontend cache invalidation)
```

---

## Streaming Architecture

```
  ┌─────────────────────────────────────────────────────────────┐
  │  PREFETCH THREAD                  MAIN THREAD               │
  │                                                             │
  │  ┌──────────────────┐                                      │
  │  │ Binary COPY      │                                      │
  │  │ chunk N+1        │──┐                                   │
  │  │ (100K rows,      │  │                                   │
  │  │  ~300 MB)        │  │   ┌──────────────────────────┐   │
  │  └──────────────────┘  │   │ L2-norm + SRP chunk N    │   │
  │                        ├──▶│ (CPU-bound, vectorized)  │   │
  │  ┌──────────────────┐  │   │ → append to memmap       │   │
  │  │ Binary COPY      │  │   └──────────────────────────┘   │
  │  │ chunk N+2        │──┘                                   │
  │  └──────────────────┘      DB I/O and compute overlap:     │
  │                            while main thread normalizes    │
  │                            chunk N, prefetch thread is     │
  │                            already pulling chunk N+1       │
  │                                                             │
  │  Peak memory: ~2 GB regardless of dataset size.            │
  │  Embeddings stream through and are discarded per-chunk.    │
  │  Only the 50D projected matrix persists (as memmap).       │
  └─────────────────────────────────────────────────────────────┘
```

---

## Memory Budget (2.5M papers)

```
  Component                   Before optimization    After (current)
  ──────────────────────────  ────────────────────    ───────────────
  Raw embeddings (768D f32)   7.2 GB in-memory       0 GB (streamed)
  Projected matrix (50D f32)  477 MB (memmap)         477 MB (memmap)
  kNN indices (30 neighbors)  286 MB                  286 MB
  kNN distances               286 MB                  286 MB
  UMAP coordinates (2D f32)   19 MB                   19 MB
  Cluster IDs (int32)         10 MB                   10 MB
  Outlier scores (f32)        10 MB                   10 MB
  ──────────────────────────  ────────────────────    ───────────────
  Python process peak         ~12 GB                  ~2 GB
  GPU VRAM (if GPU)           n/a                     ~4 GB (UMAP+Leiden)
```

---

## Tuning Levers

### UMAP parameters (`LayoutConfig`)

| Parameter | Default | Effect |
|-----------|---------|--------|
| `n_neighbors` | 30 | Higher = smoother clusters, lower = more micro-structure |
| `min_dist` | 0.1 | Tighter clusters for visual distinction at 300-500 cluster scale |
| `spread` | 1.0 | Scales the overall embedding. Higher = more spread, less contrast |
| `set_op_mix_ratio` | 0.25 | Lower = sharper cluster edges, outliers stay separated |
| `repulsion_strength` | 1.2 | Push between non-neighbors. Lower = clusters sit closer |
| `negative_sample_rate` | 10 | More negative samples = stronger repulsion (default is 5) |

**Key tradeoff**: The UMAP author says you cannot simultaneously maximize both
cluster separation AND intra-cluster substructure at 2M+ scale. Current settings
favor tight, distinct clusters: `min_dist=0.1` packs points within clusters tightly
while `repulsion_strength=1.2` lets clusters sit slightly closer together. The
post-UMAP overlap resolution (`gap_scale=0.65`) accepts 35% edge overlap, packing
clusters tighter while preserving clear boundaries.

### Cluster overlap resolution (`apply_cluster_repulsion`)

Post-UMAP step that keeps intra-cluster structure rigid while resolving overlaps.
Three phases, each preserving member-point geometry (rigid translation only):

**Phase 1 — Pairwise overlap resolution** (topology + density + size aware):
A force simulation that only pushes clusters whose robust radii actually overlap.
Three awareness signals modulate the force:

- **Size**: Large clusters (5000 papers) move less than small ones (200 papers).
  `weight_i = size_j / (size_i + size_j)`.
- **Density**: Local density = number of other centroids within 2x median inter-
  cluster distance. Gap target scales inversely: `gap_scale / sqrt(local_density
  / median_density)`. Crowded center accepts tighter packing; sparse periphery
  gets more room.
- **Topology**: Inter-cluster affinity from shared kNN edges. High affinity
  (many cross-edges, e.g. schizophrenia <-> antipsychotics) → shorter ideal
  distance (`gap *= 1 - 0.5 * affinity`). Zero affinity → standard gap.

The simulation is O(C^2) per iteration where C = cluster count (~50-200),
completing in milliseconds.

| Parameter | Default | Effect |
|-----------|---------|--------|
| `cluster_overlap_iterations` | 15 | Max force simulation iterations. Converges early if max force < 0.01 |
| `cluster_overlap_gap_scale` | 0.65 | Base gap = (r_a + r_b) x scale. Below 1.0 accepts edge overlap |
| `cluster_overlap_damping` | 0.3 | Force damping (0-1). Per-step displacement capped at median radius |

**Legacy radial push** (disabled by default):

| Parameter | Default | Effect |
|-----------|---------|--------|
| `cluster_repulsion_factor` | 1.0 | Disabled. Set >1.0 to re-enable the old uniform radial push |

**Phase 2 — Local relaxation** (secondary pass):

| Parameter | Default | Effect |
|-----------|---------|--------|
| `cluster_relaxation_neighbors` | 6 | Number of nearby cluster centroids considered per iteration |
| `cluster_relaxation_iterations` | 12 | Small fixed number of centroid-only relaxation passes |
| `cluster_relaxation_gap_scale` | 1.45 | Target gap as multiple of sum of two robust cluster radii |
| `cluster_relaxation_step` | 0.35 | Fraction of remaining overlap resolved per iteration |

### Outlier detection (`compute_spatial_outlier_scores`)

Two-pass detection (LOF + radial distance):

| Parameter | Default | Effect |
|-----------|---------|--------|
| `outlier_lof_neighbors` | 20 | LOF neighborhood size |
| `outlier_contamination` | 0.02 | Expected outlier fraction for LOF (~2%) |
| `radial_percentile` | 99.0 | Points beyond this distance percentile from median are flagged |

### Cluster labels (`labels.py`)

Uses c-TF-IDF (class-based TF-IDF) — the BERTopic standard. Terms are weighted by
distinctiveness to each cluster vs the corpus, not raw frequency. Uses sklearn's
318-word English stopword list + biomedical extensions + `max_df=0.80` automatic
filtering. Optional LLM relabeling via `--llm-labels`.

### LLM cluster labeling (`llm_labels.py`)

Gemini 2.5 Flash relabels all non-noise clusters with 2-4 word clinical labels and
15-25 word descriptions. The prompt is managed in Langfuse Prompt Management
(`graph-cluster-label`, production label) with a local fallback.

**Pipeline**: Batches of 10 clusters. Each batch sends top journals, stratified
titles (5 landmark, 5 recent, 10 random), entity families, and top entities to
Gemini. Rate-limited to 10 RPM with exponential backoff. Per-batch DB writes so
partial runs survive interruption. Resume support — skips clusters already labeled
`label_mode='llm'`.

**Prompt rules**: 1-4 words title case, acronyms ALL CAPS (PTSD, ADHD, TBI, etc.),
no generic filler ("Research", "Studies"), established subspecialty names allowed
("Forensic Psychiatry"), differentiate by research approach not just disease.

**Langfuse observability**: Each batch is a generation span with full prompt, full
response, model name, and token usage. Trace-level scores: `graph_cluster_labeled_count`,
`graph_cluster_error_count`, `graph_cluster_total`. Per-batch flush for real-time
visibility.

**Quality review workflow**: After labeling, review labels agentically — check for
duplicate labels across clusters, lowercase acronyms, redundant qualifiers, vague
labels, near-duplicate differentiation, and clinical precision. Fix targeted clusters
directly in DB, then re-export the bundle.

**Frontend mapping**: Cosmograph colors by `clusterLabel` via the categorical palette
(20-color palette cycled by `cluster_id MOD 20`). Labels show `clusterLabel` (leaf
cluster names, LLM-generated).

**Parquet columns**: Both `base_points.parquet` and `universe_points.parquet` carry
`cluster_id` and `cluster_label` per point. `base_clusters.parquet` carries
`cluster_id`, `label`, `description`.

### Leiden resolution calibration

Resolution controls cluster granularity. Calibrated via 100K-point sample:

| Resolution | Clusters (100K) | Est. full scale (2.5M) |
|-----------|----------------|----------------------|
| 3.0 | 47 | ~79 |
| 15.0 | 289 | ~400-500 |
| 20.0 | 428 | ~600-900 |

**Current default**: 25.0 (`GRAPH_CLUSTER_RESOLUTION` in config). Override with
`--cluster-resolution` CLI flag.

---

## CLI Reference

All commands run from `engine/`:

```bash
cd engine
```

### Full production rebuild

```bash
uv run python -m app.graph.build --run --publish-current --reuse-evidence
```

### Resume a failed build

```bash
uv run python -m app.graph.build --run --resume-run <graph_run_id> --publish-current --reuse-evidence
```

### Canary build (small subset)

```bash
uv run python -m app.graph.build --run --limit 500 --local
```

### LLM relabeling + bundle export

```bash
# Step 1: Relabel clusters (DB-only, runs locally, ~12 min for 715 clusters)
uv run python -m app.graph.build --llm-labels

# Step 2: Re-export Parquet bundle (auto-dispatches to GPU container)
uv run python -m app.graph.build --re-export
```

### Publish an already-persisted run

```bash
uv run python -m app.graph.build --publish-run <graph_run_id> --publish-current
```

### Refresh evidence summary only

```bash
uv run python -m app.graph.build --refresh-evidence
```

### Standalone cleanup (purge stale runs)

```bash
uv run python -m app.graph.build --cleanup
```

### Sync current graph membership

```bash
uv run python -m app.graph.build --sync-current
```

### Summary (no build)

```bash
uv run python -m app.graph.build --json
```

### Flag Reference

| Flag | Effect |
|------|--------|
| `--run` | Execute a full graph build |
| `--limit N` | Limit papers for canary build (incompatible with `--publish-current`) |
| `--resume-run ID` | Resume from checkpoint (requires `--run`) |
| `--publish-current` | Mark run as current, sync corpus membership |
| `--skip-export` | Build graph tables without writing Parquet bundle |
| `--reuse-evidence` | Skip evidence summary recomputation during `--run` |
| `--refresh-evidence` | Rebuild evidence summary without running layout |
| `--evidence-stage STAGE` | Retained for compatibility; triggers full rebuild |
| `--publish-run ID` | Publish a completed run with existing graph_points |
| `--sync-current` | Backfill corpus membership from current published run |
| `--cleanup` | Delete stale runs from DB + filesystem, keep published |
| `--local` | Force local execution (skip GPU container dispatch — may cause permission errors on bundle writes) |
| `--cluster-resolution F` | Override cluster resolution (default: config) |
| `--llm-labels` | Run LLM relabeling (standalone or with `--run`). Prints `--re-export` reminder when done |
| `--re-export` | Re-export current run's Parquet bundle (picks up label/evidence changes). Auto-dispatches to GPU container |
| `--json` | Emit JSON summary only |

### GPU container dispatch

Bundle-writing operations (`--run`, `--publish-run`, `--re-export`, `--cleanup`)
auto-dispatch to the GPU container (`solemd-graph-graph`) when it's running. The
container runs as root, matching the ownership of `/mnt/solemd-graph/bundles/`.

DB-only operations (`--llm-labels`, `--sync-current`, `--refresh-evidence`) always
run locally — they don't touch bundle files.

If the GPU container is not running and a bundle-writing operation is attempted
without `--local`, the CLI fails with a clear error and instructions to start the
container. `--local` bypasses dispatch but may hit permission errors on bundle
files created by previous container runs.

---

## Checkpoint & Recovery

Each graph run gets a checkpoint directory:

```
  graph/tmp/graph_build/
  └── <graph_run_id>/
      ├── checkpoint.json        ← stage completion flags + metadata
      ├── corpus_ids.npy         ← paper IDs in build order
      ├── citation_counts.npy    ← citation counts per paper
      ├── layout_matrix.npy      ← 50D projected embeddings (memmap)
      ├── knn_indices.npy        ← shared kNN neighbor indices
      ├── knn_distances.npy      ← shared kNN distances
      ├── coordinates.npy        ← 2D UMAP coordinates
      ├── cluster_ids.npy        ← Leiden cluster assignments
      ├── outlier_scores.npy     ← spatial outlier scores
      └── is_noise.npy           ← merged noise mask
```

**Resume flow**: A failed run retains its checkpoint directory. Pass
`--resume-run <id>` to pick up from the last completed stage. The orchestrator
reads `checkpoint.json` and skips stages whose artifacts already exist on disk.

**Embedding memmap**: The 50D layout matrix is memory-mapped from disk
(`numpy.memmap`), so the OS virtual-memory subsystem pages it in as needed
instead of loading the full ~477 MB into resident memory.

---

## Base Admission

Continuous domain-density scoring replaces the old binary tier system.
Every mapped paper receives a `domain_score`:

```
  domain_score =
    (
      family_diversity^2 * min(rule_count, 20)    -- capped at 2000
    + core_families * 200                          -- psych/neuro/NT/med/symptom
    + 500 if has_relation_rule_hit                 -- PubTator relation
    + ln(1 + citations) * 40                       -- citation impact
    + ln(1 + entity_count) * 10                    -- annotation density
    + ln(1 + relation_count) * 15
    + recency_bonus (30/20/10/5/0 by decade)
    )
    * journal_score_multiplier                     -- data-driven from base_journal_family
    + 200 if journal_score_multiplier > 1.0        -- flagship venue floor
```

The journal multiplier is **data-driven**: stored in
`base_journal_family.score_multiplier` and populated into
`paper_evidence_summary.journal_score_multiplier` during evidence refresh.
Current tiers: flagship=1.5x (only with domain signal), penalized=0.3x,
default=1.0x. Adding a new penalty or boost is an INSERT into
`base_journal_family` — no Python code changes needed.

The top `target_base_count` papers enter base; the rest stay in universe. The
active target comes from `solemd.base_policy` and should be read from the
database rather than hardcoded in docs or code. The score is computed in SQL
against `paper_evidence_summary` during the publish stage.

---

## Automatic Cleanup

At the start of every `--run` build, `_cleanup_stale_build_artifacts()` runs
automatically. It also runs standalone via `--cleanup`.

**What gets deleted**:
- Database: `graph_base_points`, `graph_base_features`, `graph_clusters`,
  `graph_points`, and `graph_runs` rows for all runs except the currently
  published one (and the resume target, if any)
- Filesystem: stale checkpoint directories under `graph/tmp/graph_build/`
- Filesystem: orphaned embedding memmap files (`graph_embeddings_*.f32`)

**What's kept**:
- The currently published run (status = `'published'`)
- The resume target run (if `--resume-run` is active)

**Why it matters**: Each run writes ~2.5M `graph_points` rows. Without cleanup,
old runs bloat Postgres shared memory and consume tens of GB of disk in
checkpoint files.

---

## Production Runbook (Monthly Rebuild)

```
  Step 1: Verify prerequisites
  ────────────────────────────
  □ GPU container running:
    solemd compose --profile gpu up -d graph

  □ Memory check: ≥4 GB RAM available, swap <80%
  □ Disk check: ≥10 GB free on graph_tmp_root_path

  Step 2: Refresh evidence (if new PubTator data)
  ────────────────────────────────────────────────
  cd engine
  uv run python -m app.graph.build --refresh-evidence

  Step 3: Full build + publish
  ────────────────────────────
  uv run python -m app.graph.build --run --publish-current --reuse-evidence

  Step 4: Verify
  ──────────────
  uv run python -m app.graph.build --json
  # Check: selected_papers > 0, cluster_count > 0, bundle_dir set

  Step 5: Cleanup (optional, auto-runs at build start)
  ────────────────────────────────────────────────────
  uv run python -m app.graph.build --cleanup

  Recovery: if build fails mid-run
  ─────────────────────────────────
  uv run python -m app.graph.build --run --resume-run <id> --publish-current --reuse-evidence
  # <id> = graph_run_id from the failed run's log output
```

---

## Dimensionality Reduction

Default is SparseRandomProjection (single-pass, data-independent fit).
IncrementalPCA available as `GRAPH_PCA_METHOD=incremental_pca` (two-pass,
variance-ordered). A 2025 benchmarking study (PMC11838541) found SRP produces
equal or better clustering quality than PCA for UMAP preprocessing.

---

## Implementation Files

| File | Role |
|------|------|
| `engine/app/graph/build.py` | Thin orchestrator + CLI |
| `engine/app/graph/build_common.py` | Shared types and helpers |
| `engine/app/graph/build_inputs.py` | Database loading, streaming binary COPY |
| `engine/app/graph/build_stages.py` | Checkpointed PCA/kNN/UMAP/clustering/scoring |
| `engine/app/graph/build_writes.py` | Bulk DB writes for graph_points/clusters |
| `engine/app/graph/build_publish.py` | Publishing, finalization, corpus sync |
| `engine/app/graph/build_dispatch.py` | GPU container detection and dispatch |
| `engine/app/graph/layout.py` | LayoutConfig, UMAP preprocessing |
| `engine/app/graph/clusters.py` | ClusterConfig, Leiden clustering |
| `engine/app/graph/neighbors.py` | Shared kNN graph computation |
| `engine/app/graph/checkpoints.py` | Checkpoint paths, save/load arrays |
| `engine/app/graph/labels.py` | c-TF-IDF cluster labels |
| `engine/app/graph/llm_labels.py` | LLM-based cluster relabeling |
| `engine/app/graph/base_policy.py` | Continuous domain-density scoring |
| `engine/app/graph/export.py` | Parquet bundle export |
| `engine/app/graph/export_bundle.py` | Bundle manifest generation |

---

## Research References

- [Random Projections vs PCA for UMAP preprocessing (PMC11838541, 2025)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11838541/) — SRP matches/exceeds PCA clustering quality on biomedical data
- [UMAP parameters docs](https://umap-learn.readthedocs.io/en/latest/parameters.html)
- [UMAP clustering docs](https://umap-learn.readthedocs.io/en/latest/clustering.html) — recommends `min_dist=0`, `n_neighbors=30`
- [UMAP FAQ](https://umap-learn.readthedocs.io/en/latest/faq.html) — multicore behavior and GPU guidance
- [UMAP outlier detection](https://umap-learn.readthedocs.io/en/latest/outliers.html) — recommends LOF on 2D coordinates
- [RAPIDS cuml.accel FAQ](https://docs.rapids.ai/api/cuml/legacy/cuml-accel/faq/) — zero-code-change acceleration notes
- [cuGraph API docs](https://docs.rapids.ai/api/cugraph/stable/api_docs/cugraph/) — GPU Leiden support
- [c-TF-IDF (BERTopic)](https://maartengr.github.io/BERTopic/getting_started/ctfidf/ctfidf.html)
- [Centroid repulsion / HD-SDR](https://journals.sagepub.com/doi/full/10.1177/14738716221086589) — sharpened dimensionality reduction
- [Johnson-Lindenstrauss lemma](https://en.wikipedia.org/wiki/Johnson%E2%80%93Lindenstrauss_lemma) — pairwise distance preservation guarantee for random projection
