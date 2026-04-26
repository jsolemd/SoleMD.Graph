# M3c — Extended force vocabulary

## Scope

Remaining force effects: `clusterFocus`, `entityFocus`,
`pulseImpulse`, formal `tug`. M2 shipped a draft `tug` for
verification; M3c finalizes it with the three-layer composition.

## Acceptance

- `clusterFocus(clusterId)` — Layer 2 spatial mode:
  - Trigger: double-click cluster centroid OR cluster filter chip.
  - Members attract to baked centroid (read from
    `release_cluster_centroids.parquet`).
  - Cohesion/signal strength controls gravity-well tightness and
    ambient breath at rest.
  - Non-members release anchor + drift outward + alpha fade.
- `entityFocus(entityId)` — Layer 2 spatial mode:
  - Trigger: hover entity chip in panel OR entity-search result.
  - Entity-sharing papers magnetize via overlay-state table of
    pairs + IDF weights, then briefly align along an entity axis so
    the shape says "these papers cluster because of this entity."
  - On-demand load of relevant `paper_knn_<cluster>.parquet`
    shards if entity spans multiple clusters.
- `pulseImpulse(set, impulse)` — Layer 2 transient one-shot:
  - Trigger: expand-cluster action.
  - One-tick velocity write; sim returns to equilibrium.
- `tug` — direct manipulation:
  - Drag a node; neighbors ripple via the same anchor / scope /
    mode forces.
  - Release clears `fx, fy, fz`.
  - Compatible with active spatial-mode (overrides locally; the
    rest of the spatial mode keeps working).
  - Cluster tidal tug is optional later: dragging near a centroid can
    move members coherently while preserving internal structure.
- All effects no-op motion under reduced-motion / Pause-motion /
  low-power.
- All effects compose with `evidenceMark` (Layer 3) overlay.

## Files

- `apps/web/features/graph/orb/sim/force-effects.ts` (extend)
- `apps/web/features/graph/orb/sim/effect-bindings.ts` (extend)
- `apps/web/features/graph/orb/sim/cluster-shards.ts` (new) —
  on-demand `paper_knn_<cluster>.parquet` loader + OPFS cache.
- `apps/web/features/graph/orb/interact/cluster-interactions.ts`
  (new) — double-click cluster, expand cluster.
- `apps/web/features/graph/orb/interact/entity-interactions.ts`
  (new) — entity-chip hover bindings.

## Verify

- Double-click cluster centroid: members attract, non-members
  disperse, dismiss restores.
- Hover entity chip: entity-sharing papers magnetize; mouseout
  restores.
- Composition rules:
  - clusterFocus + RAG arrival → retarget via generation; refuters
    marked.
  - entityFocus + tug → tug overrides locally on the dragged node;
    rest of entity-set holds magnetism.
  - All Layer 2 effects: only one active at a time (verify by
    interleaving dispatches).
- Cluster-shard load latency: ≤ 200 ms at typical cluster sizes;
  OPFS-cached on second access.
- Reduced-motion: no positional motion for any extended effect.

## Blocking-on / blocks

- Blocking on: M3b.
- Blocks: M4 (edges) — though M4 can ship in parallel after
  M3a/M3b if `clusterFocus`/`entityFocus` aren't strictly
  required for edge-tier verification.
