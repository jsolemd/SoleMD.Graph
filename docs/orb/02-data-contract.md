# 02 — Data contract (bundle schema + capability versioning)

## Bundle layout

Bundles are checksum-addressed and immutable under
`/graph-bundles/<checksum>/`. The full schema is at
`packages/graph/src/types/bundle.ts:19`. Today it ships
`base_points`, `base_clusters`, `universe_points`,
`paper_documents`, `cluster_exemplars`, `universe_links`. Orb-mode
adds the following optional assets, gated by `orbCapabilityVersion`:

### New mandatory at orb-capable bundles

| Asset | Columns | Size estimate (16K / 100K / 500K) | Notes |
|---|---|---|---|
| `release_points_3d.parquet` | `point_index UINT32, paper_id VARCHAR, x3 FLOAT, y3 FLOAT, z3 FLOAT, cluster_id UINT32` | ~640 KB / 4 MB / 20 MB | UMAP-seeded ForceAtlas2-3D output. Release-deterministic. |
| `release_cluster_centroids.parquet` | `cluster_id UINT32, centroid_x FLOAT, centroid_y FLOAT, centroid_z FLOAT, member_count UINT32, cohesion FLOAT, signal_strength FLOAT` | <few KB | Baked at publish from final layout. Cohesion drives cluster gravity wells. |
| `release_evidence_members.parquet` | `point_index UINT32, signal_count UINT16, dominant_kind VARCHAR, earliest_seen_at TIMESTAMP, last_seen_at TIMESTAMP` | small at evidence scale | Aggregates `graph_signals` per release. |
| `release_paper_activity.parquet` | `point_index UINT32, citation_percentile FLOAT, recency_percentile FLOAT, first_seen_release_id VARCHAR` | small | Drives restrained pulsar/supernova ambient cues. |

### Existing extended

| Asset | Change |
|---|---|
| `universe_links.parquet` | Add `weight FLOAT`, `link_kind`, `source_cluster_id`, `target_cluster_id`, and optional `is_mutual` columns. Existing 2D consumers continue to ignore what they do not need. |
| `manifest.json` | Add `orbCapabilityVersion: u8`. Add layout params, `entity_edge_spec_hash`, `embedding_model`, `embedding_revision`, and `knn_shard_manifest` for debug + reproducibility. |

### Sharded / lazy

| Asset | Sharding | Trigger |
|---|---|---|
| `paper_knn_<cluster_id>.parquet` | source-cluster-owned; large clusters may split into subshards | Loaded on focus / cluster-focus / entity-focus reaching that cluster. OPFS-cached. Rows own outgoing neighbors for source papers in that cluster, including cross-cluster targets. |
| `paper_knn_resident.parquet` | per-bundle, resident-set only | Loaded once per orb mount, refreshed on scope change. ≤ 1.3 MB at 16K × top-20. |
| `scope_embeddings_<shard>.parquet` | per-scope, opt-in | Loaded only when scope narrows below threshold AND is stable. SPECTER2 int8 768-d ≈ 768 bytes/paper. |

The old "one cluster shard is always <= 1 MB" assumption is not a
contract. A 20K-paper cluster with top-20 directed neighbors is
hundreds of thousands of rows before compression. The publisher must
emit per-shard byte counts and split large source clusters so the
runtime never guesses.

### Server-side fallback (FastAPI when it lands)

For force layout that needs farther reaches than the resident set
(rare; only when a force effect explicitly requires it):

- `GET /api/graph/knn?papers=<id_list>&k=20` → top-K via
  PostgreSQL pgvector cosine.
- `GET /api/graph/edges?source=<id>&type=citation|entity&k=N` →
  on-demand edge expansion.

Both gated behind a runtime feature flag; default off until backend
rebuild lands (`apps/api/`).

## Capability versioning

Per canonical correction 21: bundle is orb-capable iff
`orbCapabilityVersion >= MINIMUM_CLIENT_VERSION`. Increments when
**any** of these change:

- `release_points_3d.parquet` schema.
- `release_evidence_members.parquet` schema.
- `release_cluster_centroids.parquet` schema.
- `entity-edge-spec.json` SHA hash.
- Edge weight formula coefficients.
- Resident-LOD sampling algorithm (so positions are stable across
  bundle releases for the same scope).
- Relation-class / effect-lane encoding used by the runtime
  (`radialBand`, `relationClass`, `residentReason`, etc.).
- Embedding model or embedding revision used to compute kNN shards.

Shallow gating on "manifest has `releasePoints3d`" is unsafe — a
bundle with an older spec would render with the current client's
view of edge weights and produce incoherent positions.

## Canonical specs

`packages/graph/spec/entity-edge-spec.json` (canonical plan M0):

```json
{
  "entity_type_allowlist": ["drug", "disease", "receptor", "mechanism", "pathway", "chemical"],
  "min_shared_entity_count": 2,
  "max_neighbors_per_node": 30,
  "weight_formula": {
    "alpha_citation": 1.0,
    "beta_idf_entity": 1.0,
    "idf_base": "log(N_papers / entity_frequency)"
  },
  "thresholds": {
    "edge_min_weight": 0.05
  }
}
```

CI check: `sha256(canonical_json(spec))` is committed and asserted
in both the TypeScript build and the Python publisher build before
producing artifacts. The TypeScript file
`packages/graph/src/entity-edge-spec.ts` is a typed re-export with
a Zod or `satisfies` schema; the JSON is the source of truth.

## DuckDB views — orb extensions

Per canonical M1 (refined here): canonical `current_points_*` view
chain LEFT JOINs `release_points_3d` and
`release_evidence_members` on `sourcePointIndex → point_index`,
exposing nullable `x3`, `y3`, `z3`, `cluster_id_3d`,
`signalCount`, `dominantKind`, `earliestSeenAt`, `lastSeenAt`.
NULL when tables absent (pre-orb bundles).

Register `release_cluster_centroids` as a first-class table; runtime
reads centroids via `SELECT * FROM release_cluster_centroids`. No
client-side centroid computation at rest.

`current_links_web` continues to expose `weight`. New runtime view
`orb_entity_edges_current` joins entity tables under the active
scope, emits `(source_point_index, target_point_index, weight,
source_bitmap)`. Same `weight` column shape as citation edges; per
the canonical spec, **never re-derived at any consumer** — read the
column.

Bootstrap registers empty placeholder views with the same columns
when optional tables are missing, so downstream SQL stays valid on
pre-orb bundles.

## Resident-set construction

DuckDB SQL pseudocode:

```sql
WITH scope AS (
  SELECT * FROM current_points_web WHERE <scope_predicate>
), focus_reserve AS (
  -- selected paper, 1-hop citation neighbors, top kNN neighbors,
  -- active RAG/search hits, and pinned wiki references
  SELECT *, 'focus' AS resident_reason FROM scope WHERE <focus_override>
), ranked AS (
  SELECT *,
    NTILE(10) OVER (ORDER BY paperReferenceCount DESC) AS quantile
  FROM scope
  WHERE id NOT IN (SELECT id FROM focus_reserve)
), fill AS (
  SELECT *, 'sampled' AS resident_reason
  FROM ranked
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY cluster_id_3d, quantile ORDER BY id
  ) <= <per_cluster_quantile_budget>
)
SELECT * FROM focus_reserve
UNION ALL
SELECT * FROM fill
ORDER BY id;  -- stable particleIdx assignment
```

The `paperId → particleIdx` mapping is written into a
`<paperId, particleIdx>` map alongside the resident-set ROW_NUMBER
assignment. See [milestones/M1-canonical-views-and-mask-writer.md](milestones/M1-canonical-views-and-mask-writer.md).

The runtime also writes a `residentReason` lane so verification can
prove focused neighborhoods were included before generic sampling.

## OPFS shard cache

OPFS keeps lazy kNN shards across sessions, but it is quota-bound and
not authoritative. The runtime cache manifest stores:

- `bundleChecksum`, `orbCapabilityVersion`, `embedding_revision`.
- `assetName`, `sha256`, `byteSize`, `rowCount`.
- `lastAccessMs`, `createdMs`, `sourceClusterId`, optional subshard id.

Eviction is LRU under an explicit cap, runs before writes, and handles
`QuotaExceededError` by deleting cold shards and retrying once. Missing
or evicted shards re-fetch from checksum-addressed bundle URLs.

## Owns / doesn't own

Owns: the bundle file shape, capability versioning, canonical
specs, DuckDB view extensions, resident-set construction.

Doesn't own:
- The publish pipeline that emits these files →
  [14-bundle-build-pipeline.md](14-bundle-build-pipeline.md).
- How the runtime consumes them →
  [04-renderer.md](04-renderer.md), [08-filter-and-timeline.md](08-filter-and-timeline.md).

## Prerequisites

[00-product-framing.md](00-product-framing.md), [01-architecture.md](01-architecture.md).

## Consumers

[03 Physics model](03-physics-model.md), [04 Renderer](04-renderer.md),
[08 Filter+timeline](08-filter-and-timeline.md), [14 Bundle build](14-bundle-build-pipeline.md),
all milestone docs.

## Invalidation

- New schema additions or weight formula tweaks → bump
  `orbCapabilityVersion`. CI-asserted spec hash protects against
  silent drift.
- Bundle scale shifts (e.g. universe overlay becomes mandatory) →
  resident-LOD sampling needs revision.
