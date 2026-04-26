# M0 — Data contract (engine work)

## Scope

Publisher emits orb-capable bundles. Engine work, runs in
`apps/worker/`. Largest single deliverable; gates M1+.

## Acceptance

- `packages/graph/spec/entity-edge-spec.json` lives as canonical
  JSON. SHA committed. Both TS + Python builds assert SHA equality.
- `solemd.release_evidence_members` materialized view aggregates
  `graph_signals` per `(graph_release_id, paper_id)`.
- Publisher emits:
	  - `release_evidence_members.parquet`
	  - `release_points_3d.parquet` (UMAP-seeded ForceAtlas2-3D output)
	  - `release_cluster_centroids.parquet` with cohesion/signal columns
	  - `release_paper_activity.parquet`
	  - `paper_knn_resident.parquet`
	  - `paper_knn_<cluster_id>.parquet` or split source-cluster
	    subshards, plus `paper_knn_manifest.json`
	  - extends `universe_links.parquet` with `weight FLOAT`,
	    `link_kind`, `source_cluster_id`, `target_cluster_id`, optional
	    `is_mutual`
	- Manifest carries `orbCapabilityVersion: u8`, layout params,
	  embedding model/revision, and kNN shard metadata.
	- Publisher emits enough relation metadata for v1 shapes:
	  citation direction, source-owned kNN, cluster cohesion, paper
	  activity percentiles.
- Tuning gate passes (per
  [`14-bundle-build-pipeline.md`](../14-bundle-build-pipeline.md)
  § Tuning gate, [`18-verification-and-rollout.md`](../18-verification-and-rollout.md)
  § M0 tuning gate).
- Sign-off: product owner + graph-runtime owner.

## Files

- `db/migrations/warehouse/<timestamp>_warehouse_graph_orb_release_surfaces.sql`
- `apps/worker/app/graph/layout_3d.py` (new)
- `apps/worker/app/graph/knn.py` (new)
- `apps/worker/app/graph/publish.py` (extend)
- `packages/graph/spec/entity-edge-spec.json` (new)
- `packages/graph/src/entity-edge-spec.ts` (new typed re-export)
- `packages/graph/src/types/bundle.ts` (extend)
- `apps/web/features/graph/lib/fetch/{constants.ts, normalize.ts}`
  (recognize new optional keys without requiring them)

## Verify

- `read_parquet` against generated artifacts matches contract.
- Two back-to-back publisher runs produce structurally stable
  layouts (Procrustes 90th-pct NN-set overlap ≥ 0.8).
- Render sheet artifacts saved alongside the bundle for audit.
- Pre-orb bundles still load (manifest gracefully handles missing
  optional keys).

## Blocking-on / blocks

- Blocking on: nothing in the orb track. Independent engine work.
- Blocks: M1+ for bundles that require 3D coordinates / kNN.

## Dependencies external to this milestone

- Python deps added: `umap-learn`, `numpy`, `scipy`,
  `scikit-learn`, `bhargavchippada/forceatlas2`, `pyarrow`. Image
  size +~300 MB.
