# Graph Build

> How the Python engine turns DB rows into the Parquet bundle the browser
> loads.

This is the server-side build pipeline: take ~2.5M paper embeddings from
`solemd.papers`, produce 2D coordinates, clusters, cluster labels, base
admission, and a Parquet bundle. Full rebuild: ~15 minutes on GPU.

See also: [`ingest.md`](ingest.md) for the upstream corpus filter,
[`database.md`](database.md) for the tables read and written, and
[`graph-runtime.md`](graph-runtime.md) for what the browser does with the
bundle this step produces.

---

## Pipeline flow

```
  solemd.papers (embeddings via pgvector binary COPY)
    |  binary wire format, no text parsing (~40x faster than TEXT COPY)
    v
  Stream 100K-row chunks --------------- prefetch thread overlaps I/O
    |  L2-normalize per chunk             with compute
    v
  SparseRandomProjection (768D -> 50D) -- single-pass JL-lemma projection
    |  GPU: cuML SRP + cupy (VRAM)         ~800 MB -> ~50 MB per chunk
    |  CPU fallback: sklearn SRP
    v
  Shared kNN graph (k=30) ---------------- one neighbor graph, reused twice
    |  GPU: cuML NearestNeighbors
    |  CPU fallback: sklearn NN
    |
    +----------------+
    v                v
  UMAP (2D)        Leiden clustering
    |  cuML UMAP      cugraph / igraph
    |  subsample 500K fit
    |  batched transform
    v                v
  Coordinates <-----+
    |
    v
  apply_cluster_repulsion() -------------- topology+density+size aware
    |  rigid translation, gap_scale=0.65    (35% edge overlap accepted)
    v
  compute_spatial_outlier_scores() ------- LOF + radial distance
    |  two-pass, 2% contamination
    v
  Base admission ------------------------- continuous domain_score
    |  top target_base_count -> base        see base_policy.py
    |  rest -> universe
    v
  Export bundle: base_points.parquet
                 base_clusters.parquet
                 universe_points.parquet
                 manifest.json (checksums for frontend cache invalidation)
```

---

## Streaming architecture

```
   PREFETCH THREAD                  MAIN THREAD
   ---------------                  -----------

   +-----------------+
   | Binary COPY     |
   | chunk N+1       |---+
   | (100K rows,     |   |
   |  ~300 MB)       |   |   +--------------------------+
   +-----------------+   |   | L2-norm + SRP chunk N    |
                         +-->| (CPU-bound, vectorized)  |
   +-----------------+   |   | -> append to memmap      |
   | Binary COPY     |   |   +--------------------------+
   | chunk N+2       |---+
   +-----------------+       DB I/O and compute overlap.
                              Peak memory ~2 GB regardless of size.
                              Embeddings stream through and are
                              discarded per-chunk. Only the 50D
                              projected matrix persists (as memmap).
```

---

## Memory budget (2.5M papers)

| Component | Size | Where |
|---|---|---|
| Raw embeddings (768D f32) | 0 GB | Streamed to VRAM, discarded per-chunk |
| Projected matrix (50D f32) | 477 MB | Host memmap |
| kNN indices (30 neighbors) | 286 MB | Host checkpoint |
| kNN distances | 286 MB | Host checkpoint |
| UMAP coordinates (2D f32) | 19 MB | Host |
| Cluster IDs (int32) | 10 MB | Host |
| Outlier scores (f32) | 10 MB | Host |

| Total | Value |
|---|---|
| Container host RAM peak | ~4 GB |
| GPU VRAM peak | ~8-12 GB (SRP + kNN + UMAP + Leiden) |

GPU stages use native cuML (not `cuml.accel` proxy):
- **SRP**: `cuML SparseRandomProjection` -- chunks stream DB -> cupy -> VRAM -> project
- **kNN**: `cuML NearestNeighbors` -- full matrix in VRAM, results back to host for checkpoint
- **UMAP**: `cuML UMAP` -- subsample 500K fit in VRAM, transform rest in 200K batches
- **Leiden**: `cugraph` -- kNN loaded to VRAM, edge list built on GPU

Memory is freed between stages: `del layout_matrix` after UMAP, `del shared_knn`
after Leiden.

---

## Tuning levers

### UMAP parameters (`LayoutConfig`)

| Parameter | Default | Effect |
|---|---|---|
| `n_neighbors` | 30 | Higher = smoother clusters |
| `min_dist` | 0.1 | Tighter clusters for visual distinction |
| `spread` | 1.0 | Overall embedding scale |
| `set_op_mix_ratio` | 0.25 | Lower = sharper cluster edges |
| `repulsion_strength` | 1.2 | Push between non-neighbors |
| `negative_sample_rate` | 10 | More negatives = stronger repulsion |
| `subsample_size` | 500,000 | Fit on subsample, transform rest |
| `transform_batch_size` | 200,000 | VRAM per batch |
| `subsample_n_epochs` | 500 | Explicit epochs (critical for transform accuracy) |

Tradeoff: you cannot simultaneously maximize cluster separation AND
intra-cluster substructure at 2M+ scale. Current settings favor tight, distinct
clusters.

### Cluster overlap resolution (`apply_cluster_repulsion`)

Post-UMAP step. Keeps intra-cluster structure rigid while resolving overlaps
via rigid translation only.

Three awareness signals modulate the force simulation:
- **Size**: large clusters move less than small ones
- **Density**: crowded center accepts tighter packing, sparse periphery gets more room
- **Topology**: high inter-cluster affinity -> shorter ideal distance

| Parameter | Default | Effect |
|---|---|---|
| `cluster_overlap_iterations` | 15 | Max force simulation iterations |
| `cluster_overlap_gap_scale` | 0.65 | Base gap = (r_a + r_b) x scale |
| `cluster_overlap_damping` | 0.3 | Force damping (0-1) |
| `cluster_relaxation_neighbors` | 6 | Nearby centroids per iteration |
| `cluster_relaxation_iterations` | 12 | Centroid-only relaxation passes |
| `cluster_relaxation_gap_scale` | 1.45 | Target gap multiple |
| `cluster_relaxation_step` | 0.35 | Overlap resolved per iteration |

O(C^2) per iteration where C = cluster count (~50-200). Completes in ms.

### Outlier detection (`compute_spatial_outlier_scores`)

| Parameter | Default | Effect |
|---|---|---|
| `outlier_lof_neighbors` | 20 | LOF neighborhood size |
| `outlier_contamination` | 0.02 | Expected outlier fraction |
| `radial_percentile` | 99.0 | Points beyond this are flagged |

### Cluster labels

c-TF-IDF (BERTopic standard) via `labels.py` produces initial labels. Terms
weighted by distinctiveness to each cluster vs corpus.

`--llm-labels` runs a Gemini 2.5 Flash pass (`llm_labels.py`) that relabels
non-noise clusters with 2-4 word clinical labels and 15-25 word descriptions.
Prompt managed in Langfuse (`graph-cluster-label`, production label) with
local fallback.

| Setting | Value |
|---|---|
| Batch size | 10 clusters |
| Rate limit | 10 RPM with exponential backoff |
| Persistence | Per-batch DB writes (partial runs survive interruption) |
| Resume | Skips clusters already `label_mode='llm'` |
| Observability | Per-batch Langfuse span + flush + `graph_cluster_*` scores |

Label rules: 1-4 words title case, acronyms ALL CAPS (PTSD, ADHD, TBI), no
generic filler, established subspecialty names allowed, differentiate by
research approach not just disease.

### Leiden resolution

Calibrated via 100K-point sample:

| Resolution | Clusters (100K) | Est. full scale (2.5M) |
|---|---|---|
| 3.0 | 47 | ~79 |
| 15.0 | 289 | ~400-500 |
| 20.0 | 428 | ~600-900 |
| **25.0 (default)** | -- | -- |

Override: `GRAPH_CLUSTER_RESOLUTION` config var or `--cluster-resolution` CLI.

---

## Base admission

Every mapped paper receives a continuous `domain_score` (not a binary tier).

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
    * journal_score_multiplier                     -- data-driven
    + 200 if journal_score_multiplier > 1.0        -- flagship venue floor
```

Journal multiplier is **data-driven**: stored in
`base_journal_family.score_multiplier`, populated into
`paper_evidence_summary.journal_score_multiplier` during evidence refresh.

| Tier | Multiplier | Notes |
|---|---|---|
| Flagship | 1.5x | Only with domain signal |
| Penalized | 0.3x | Predatory / off-domain |
| Default | 1.0x | Everything else |

Top `target_base_count` papers enter base; rest stay in universe. The active
target is read from `solemd.base_policy` -- not hardcoded. Score computed in
SQL against `paper_evidence_summary` during the publish stage.

### Admission pipeline (upstream feeders)

```
  solemd.entity_rule         572 domain rules from vocab_terms
  solemd.relation_rule       103 relation rules
  solemd.base_journal_family curated journal families
  solemd.journal_rule        venue -> family mappings
           |
           v
  paper_evidence.py  --computes-->  solemd.paper_evidence_summary
           |
           v
  base_policy.py     --scores-->    solemd.graph_base_points
                                    (base_reason, base_rank)
```

Exported bundle flags (`is_in_base`, `base_rank`) are derived from
`graph_base_points`, not stored on `graph_points`.

Broad medical entities (hypertension, diabetes, nausea) are NOT entity rules.
Papers mentioning only those stay in universe.

---

## CLI reference

All commands run from `engine/`:

```bash
cd engine
```

### Canonical commands

```bash
# Full production rebuild
uv run python -m app.graph.build --run --publish-current --reuse-evidence

# Resume a failed build
uv run python -m app.graph.build --run --resume-run <id> --publish-current --reuse-evidence

# Canary build (small subset)
uv run python -m app.graph.build --run --limit 500 --local

# LLM cluster relabeling (DB-only, then re-export)
uv run python -m app.graph.build --llm-labels
uv run python -m app.graph.build --re-export

# Publish an already-persisted run
uv run python -m app.graph.build --publish-run <id> --publish-current

# Evidence summary only
uv run python -m app.graph.build --refresh-evidence

# Cleanup stale runs
uv run python -m app.graph.build --cleanup

# Sync current graph membership
uv run python -m app.graph.build --sync-current

# Summary only
uv run python -m app.graph.build --json
```

### Flag reference

| Flag | Effect |
|---|---|
| `--run` | Execute a full graph build |
| `--limit N` | Canary build (incompatible with `--publish-current`) |
| `--resume-run ID` | Resume from checkpoint (requires `--run`) |
| `--publish-current` | Mark as current, sync corpus membership |
| `--skip-export` | Build graph tables without writing Parquet |
| `--reuse-evidence` | Skip evidence summary recomputation |
| `--refresh-evidence` | Rebuild evidence summary without layout |
| `--publish-run ID` | Publish a completed run |
| `--sync-current` | Backfill corpus membership from current published run |
| `--cleanup` | Delete stale runs from DB + filesystem |
| `--local` | Force local execution (skip GPU container dispatch) |
| `--cluster-resolution F` | Override cluster resolution |
| `--llm-labels` | Run LLM relabeling (standalone or with `--run`) |
| `--re-export` | Re-export current run's Parquet (auto-dispatches GPU) |
| `--json` | JSON summary only |

### GPU container dispatch

Bundle-writing operations (`--run`, `--publish-run`, `--re-export`, `--cleanup`)
auto-dispatch to the GPU container when it is running. The container runs as
root to match ownership of `/mnt/solemd-graph/bundles/`.

DB-only operations (`--llm-labels`, `--sync-current`, `--refresh-evidence`)
always run locally -- they don't touch bundle files.

If the GPU container is not running and a bundle-writing operation is attempted
without `--local`, the CLI fails with instructions to start the container.

---

## Checkpoint + recovery

Each graph run gets its own checkpoint directory:

```
  graph/tmp/graph_build/<graph_run_id>/
    +-- checkpoint.json        stage completion flags + metadata
    +-- corpus_ids.npy         paper IDs in build order
    +-- citation_counts.npy
    +-- layout_matrix.npy      50D projected embeddings (memmap)
    +-- knn_indices.npy
    +-- knn_distances.npy
    +-- coordinates.npy        2D UMAP
    +-- cluster_ids.npy        Leiden assignments
    +-- outlier_scores.npy
    +-- is_noise.npy
```

Resume: `--resume-run <id>` reads `checkpoint.json` and skips stages whose
artifacts already exist.

Memmap: the 50D layout matrix is `numpy.memmap` from disk -- the OS virtual
memory subsystem pages it in as needed.

---

## Automatic cleanup

At the start of every `--run` (and via `--cleanup`),
`_cleanup_stale_build_artifacts()` runs:

| Target | Action |
|---|---|
| DB: `graph_base_points`, `graph_base_features`, `graph_clusters`, `graph_points`, `graph_runs` | Delete rows for all non-published runs (except `--resume-run` target) |
| FS: checkpoint dirs under `graph/tmp/graph_build/` | Delete stale |
| FS: orphaned memmap files (`graph_embeddings_*.f32`) | Delete |

Kept: the currently published run + the resume target.

Why: each run writes ~2.5M `graph_points` rows. Without cleanup, old runs
bloat PG shared memory and consume tens of GB of checkpoint files.

---

## Monthly rebuild runbook

```
   1. Verify prerequisites
      - GPU container running: solemd compose --profile gpu up -d graph
      - Memory: >=4 GB RAM available, swap <80%
      - Disk: >=10 GB free on graph_tmp_root_path

   2. Refresh evidence (if new PubTator data)
      uv run python -m app.graph.build --refresh-evidence

   3. Full build + publish
      uv run python -m app.graph.build --run --publish-current --reuse-evidence

   4. Verify
      uv run python -m app.graph.build --json
      (check: selected_papers > 0, cluster_count > 0, bundle_dir set)

   5. Cleanup (auto-runs at build start; manual via --cleanup)

   Recovery:
      uv run python -m app.graph.build --run --resume-run <id> \
        --publish-current --reuse-evidence
```

---

## Dimensionality reduction

Default is `SparseRandomProjection` (single-pass, data-independent fit).
`IncrementalPCA` available as `GRAPH_PCA_METHOD=incremental_pca` (two-pass,
variance-ordered). SRP matches or exceeds PCA clustering quality for UMAP
preprocessing on biomedical data (PMC11838541, 2025).

---

## Module map

```
engine/app/graph/
  build.py             Thin orchestrator + CLI entry (main at line 580)
  build_common.py      Shared types and helpers
  build_inputs.py      Binary COPY streaming from PG
  build_stages.py      Checkpointed PCA/kNN/UMAP/clustering/scoring
  build_writes.py      Bulk DB writes for graph_points/clusters
  build_publish.py     Publishing, finalization, corpus sync
  build_dispatch.py    GPU container detection and dispatch
  layout.py            LayoutConfig, UMAP preprocessing
  clusters.py          ClusterConfig, Leiden clustering
  neighbors.py         Shared kNN graph computation
  checkpoints.py       Checkpoint paths, save/load arrays
  labels.py            c-TF-IDF cluster labels
  llm_labels.py        LLM-based cluster relabeling (Gemini)
  paper_evidence.py    Per-paper evidence -> paper_evidence_summary
  base_policy.py       Continuous domain-density scoring
  attachment.py        Point attachment / evidence queries (lazy bundle)
  export.py            Parquet bundle export
  export_bundle.py     Bundle manifest generation
  point_projection.py  Point projection utilities
  render_policy.py     Render-time point policy
  verify.py            Post-build verification
```

---

_Last verified against code: 2026-04-08_
