# M1 — Canonical views + paperId↔particleIdx mask writer

## Scope

Frontend DuckDB view extensions + the resident-set mask writer
(per Codex round 1 #5). No renderer changes yet.

## Acceptance

- Canonical `current_points_*` view chain LEFT JOINs
  `release_points_3d` and `release_evidence_members` on
  `sourcePointIndex → point_index`. Exposes nullable
  `x3, y3, z3, cluster_id_3d, signalCount, dominantKind,
  earliestSeenAt, lastSeenAt`. NULL on pre-orb bundles.
- Register `release_cluster_centroids` as a first-class table.
- Register `release_paper_activity` and `paper_knn_manifest` when
  present; expose empty placeholders for legacy bundles.
- `current_links_web` exposes `weight` from `universe_links`.
- New runtime view `orb_entity_edges_current` joins entity tables
  under the active scope; emits `(source_point_index,
  target_point_index, weight, source_bitmap)`.
- Bootstrap registers empty placeholder views with same columns
  when optional tables absent (pre-orb bundles).
- Existing 2D queries unchanged.
- **paperId ↔ particleIdx mask writer** wired:
  - Resident set rebuilt on scope change with focus override reserve
    before generic sampling.
  - `paperToParticle: Map<string, number>` and inverse maintained.
  - `selectionMask` and `filterMask` `DataTexture`s written from
    DuckDB queries via the maps.
  - `residentReason` written for focus / result / sampled inclusion.
  - `relationClassTex`, `radialBandTex`, `effectStageTex`, and
    `orbitPhaseTex` writer APIs exist even if M2/M3 are the first
    consumers.

## Files

- `apps/web/features/graph/duckdb/views/orb.ts` (new)
- `apps/web/features/graph/duckdb/views/base-points.ts` (extend)
- `apps/web/features/graph/duckdb/views/active-points.ts` (extend)
- `apps/web/features/graph/duckdb/views/register-all.ts` (extend)
- `apps/web/features/graph/orb/state/resident-set.ts` (new) —
  `paperToParticle` map + `selectionMask` / `filterMask` writers.
- Tests: extend `apps/web/features/graph/duckdb/views/__tests__/*`.

## Verify

- Bootstrap DuckDB against:
  (a) legacy bundle with no evidence or 3D tables;
  (b) orb-capable bundle.
- Both: `DESCRIBE current_points_web` returns nullable orb columns;
  every existing 2D test still passes.
- Orb scope SQL returns non-zero row count on (b), zero on (a).
- Manual: change filter → mask texture data updates within 1 frame
  (verify via console-log on subscriber callback).

## Blocking-on / blocks

- Blocking on: M0 (for orb-capable test fixtures).
- Blocks: M2 (mask writer is required for any physics that reads
  `filterMask` or `selectionMask`).
