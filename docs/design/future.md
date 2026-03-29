# Future Work

This document is the forward-looking home for the living-graph runtime after
the `base / universe / overlay / active / evidence` refactor.

Historical implementation notes are archived in:

- [../archive/plans/living-graph-active-universe-plan.md](../archive/plans/living-graph-active-universe-plan.md)
- [../archive/plans/living-graph-runtime-refactor.md](../archive/plans/living-graph-runtime-refactor.md)
- [../archive/plans/base-universe-overlay-architecture.md](../archive/plans/base-universe-overlay-architecture.md)

## Current State

The canonical runtime is now:

- `base_points`
  - the stable first-paint scaffold
- `universe_points`
  - the broader premapped coordinate universe
- `selected_point_indices`
  - the DuckDB-local persistent selection relation
- `overlay_point_ids_by_producer -> overlay_point_ids -> active_points_web`
  - the local DuckDB activation surface for living-graph expansion
- versioned `active_*` alias views
  - the runtime-owned canvas tables that let Cosmograph receive in-place active-graph
    updates without JS point hydration
- `active_links_web`
  - links remapped against the active canvas
- `evidence_api`
  - backend-heavy retrieval for evidence content

The important constraints now in force are:

- no compatibility aliases in the live runtime
- no chunk/paper first-paint JS hydration
- Cosmograph reads DuckDB tables directly
- base and universe stay Parquet-backed in the browser instead of being copied
  into full local temp point tables
- point payloads stay compact and render-driven
- heavy evidence stays off the browser base path by default

We are treating this as prerequisite work, not optional cleanup. Additional
layers and richer behaviors should wait until this corpus-only foundation is
stable, fast, and well understood.

The first live overlay path is also now present:

- explicit `cluster-neighborhood` overlay activation from the info panel
- `overlay_point_ids` mutates inside DuckDB, not in JS point arrays
- only the promoted overlay rows are materialized locally; the base scaffold is
  reused directly from the projected base views
- the session publishes updated canvas snapshots to the renderer
- Cosmograph consumes runtime-owned active table names, not hardcoded layer constants

## Next Steps

### 1. Expand the Trigger Family

The first explicit trigger is now implemented. Expand beyond cluster-neighborhood
activation while keeping the same overlay contract.

Recommended order:

1. citation-neighborhood expansion
2. entity / relation-driven expansion
3. semantic / RAG-associated expansion
4. backend-ranked mixed expansion

### 2. In-Place Overlay Validation

Validate the living-graph behavior in the browser with real overlay promotion:

- no remount
- no camera reset
- no disruptive flicker
- stable spatial memory for base points

The runtime now uses versioned active alias views plus
`preservePointPositionsOnDataUpdate`; what remains is browser validation and
tuning rather than more architectural rewiring.

### 3. Visual Emphasis Policy

Define how active overlay material should change the canvas visually:

- brighten overlay points
- slightly enlarge or otherwise emphasize overlay points
- dim unrelated base regions rather than hard-removing them by default
- keep orientation and spatial continuity intact

This likely needs a small style/state contract, but should stay DuckDB-first and
avoid a JS point data plane.

### 4. Backend Ranking Path for Overlay Candidates

Build the backend selection path that returns the small candidate set to promote
from the premapped universe. This is the real bridge between `universe_points`
and `evidence_api`.

This ranking path should support:

- graph-neighbor retrieval
- cluster-context retrieval
- citation-based candidate expansion
- entity/relation-matched candidate expansion
- later semantic/RAG-driven candidate expansion

### 5. Universe-Scale Summaries

Decide which summaries remain local to `active_points` and which should become
universe-aware via backend or remote DuckDB aggregation.

Likely split:

- local: current active canvas widgets and crossfilter
- remote/backend: universe-wide previews, expansion estimates, and global counts

### 6. Universe Detail Storage Choice

Keep Parquet-first for wide point tables. Revisit remote read-only `.duckdb`
attach only if universe detail tables become numerous enough that a structured
read-only database is cleaner than many individual Parquet artifacts.

### 7. Release-Scale Build Split

Do not keep the full graph publish path monolithic once the mapped universe
expands further. The intended release cadence is:

1. `paper_evidence_summary`
2. `universe_layout`
3. `base_admission`
4. `publish`

The schema-level rationale and table responsibilities for that split live in
[database.md](../map/database.md#rebuild-strategy-at-scale).

Important implementation note:

- keep the heavy PubTator entity/relation scans tied to permanent mapped-paper
  tables during summary refresh so PostgreSQL can actually use parallel query
- use temporary tables only for the smaller downstream staging steps
- keep the summary refresh resumable by stage (`source`, `entity`, `relation`,
  `journal`, `finalize`) instead of one giant all-or-nothing transaction
- keep layout resumable by durable filesystem checkpoints:
  `layout_matrix`, shared `knn`, `coordinates`, `cluster_ids`, outlier/noise
- reuse one PCA-space kNN graph for both UMAP and Leiden so future universe
  builds do not pay the neighbor-search cost twice

## Not Planned

The browser should not own the full universe as hydrated JS objects.

That means:

- no return to `Record<string, unknown>[]` point hydration for chunk/paper layers
- no full-universe first-paint payload
- no browser-side reinvention of visibility or ranking policy
