# Render Cohort Stabilization

> This is an upstream export/renderability stabilization document.
> Forward-looking runtime work is now tracked in [../design/future.md](../design/future.md).

## Purpose

Keep the graph pipeline aligned with native Cosmograph + DuckDB patterns:

- engine/export owns the renderable cohort
- browser DuckDB stays a thin local read model
- Cosmograph native crossfilter drives the current visible set
- no JS-side point-substrate rebuilds

This document is the working tracker for the current graph stabilization pass.

## Non-Negotiables

- Do not filter spatial outliers in the browser.
- Do not regenerate point indices in the browser.
- Do not remap link indices in the browser.
- Do not build a second JS-only visibility engine.
- Prefer native Cosmograph utilities:
  - external DuckDB tables
  - native filter widgets
  - `onPointsFiltered`
  - table-backed points/links with dense indices

## Completed In First Pass

- [x] Move render-cohort ownership into engine export.
- [x] Build a single `render_points` cohort in `engine/app/graph/export_bundle.py`.
- [x] Regenerate dense browser-facing `point_index` in export.
- [x] Rebuild `universe_links` from the exported render cohort.
- [x] Remove deprecated artifact-name aliases and require canonical `universe_links`.
- [x] Keep the staged frontend load path:
  - canvas/queries first
  - metadata later
- [x] Require the canonical `v4` bundle contract at the frontend boundary.

## Accepted Findings To Carry Forward

### 1. Default-visible policy is now canonical and narrower than renderability

`is_default_visible` is now derived from the exported run itself and also synced onto
`solemd.corpus` by the graph publish path.
Current canonical policy:

- when a graph run is published as current, `is_mapped = true` for that run's points
- `is_default_visible = true` only for renderable points admitted by the
  centralized default-visibility policy
- renderability remains engine-owned via the outlier-filtered export cohort
- renderability and default visibility now have separate canonical helpers,
  shared by export and publish/backfill paths
- the exported bundle no longer depends on mutable global `solemd.corpus` visibility flags
- the same policy can be backfilled onto the current published run via
  `uv run python -m app.graph.build --sync-current-flags`
- graph-db now materializes:
  - `default_visibility_lane`
  - `default_visibility_rank`
  - `graph_visibility_features`
  - cluster rescue/domain metrics

This means the default-visible subset is no longer inert and no longer collapses
to the full published renderable graph. The browser still keeps the broader
renderable cohort local, but first paint begins from the narrower policy-defined
baseline.

Tracking implication:

- the default-visible column is now generated upstream instead of left dead
- `renderable cohort` and `default-visible cohort` are now distinct
- bundle artifacts are canonical per-run outputs, not reflections of whichever run is
  currently marked in `solemd.corpus`
- the remaining product step is policy tuning, not architecture separation

### 2. Cluster export is partially coherent, but label metadata is still raw-backed

`base_clusters` now recomputes centroids, representatives, and `is_noise` against the filtered render cohort.

Still raw-backed today:

- `label`
- `label_mode`
- `label_source`
- `candidate_count`

Tracking implication:

- structural cluster geometry is now aligned with the exported cohort
- semantic cluster metadata still comes from the raw cluster table
- this mixed contract is acceptable for now, but should remain explicit

### 3. `bundleVersion` is now a strict migration gate

The frontend now fails fast unless the bundle is the canonical `v4` shape.

Tracking implication:

- future bundle-shape changes must update the required version deliberately
- deprecated `v1` bundles are no longer a supported frontend path

### 4. `onPointsFiltered` is lighter, but not yet the final visibility-budget path

`CosmographRenderer` now reads only the filtered `index` column from the Cosmograph Arrow table instead of converting the full filtered row set into JS objects.

Tracking implication:

- the interaction path is materially lighter than before
- the real next step is still a dedicated DuckDB-local visibility-budget query

### 5. `outlier_score` has been removed from the base-point artifact

Once export filters to the render cohort, `outlier_score` does not belong in the browser’s primary point substrate.

Tracking implication:

- cluster/detail paths can still surface outlier metrics where they are semantically meaningful
- the base point table is now closer to the intended render/filter contract

### 6. Cosmograph selection is not a free second visibility lane

Cosmograph’s programmatic point selection and user-facing point selection both flow through the same native points-selection crossfilter channel.

Tracking implication:

- the visibility-budget layer should not simply hijack `selectPoints()` and treat it as a separate semantic state
- we likely need a deliberate split between:
  - current visible/emphasized set
  - persistent user/detail selection intent
- the next implementation pass should preserve Cosmograph-native behavior without collapsing those two concepts together

Additional implementation finding:

- the public Cosmograph API exposes only the built-in `pointsSelectionClient` through `selectPoints()`
- if we add a programmatic visibility-budget source, it should be a distinct crossfilter source id
  (for example `budget:*`) rather than reusing persistent point selection
- that budget source should be predicate-driven over base fields/ranking columns when possible,
  not a giant client-side `IN (...)` list of point indices
- the first-pass emphasis lane now uses a dedicated `budget:focus-cluster` source with a
  Mosaic predicate over base `clusterId` / `index`, so search-driven focus does not hijack
  persistent user selection

## Next Stage Order

### Stage 2A: Make default-visible real in the data

- [x] define the current default-visible policy upstream
- [x] populate `is_default_visible` in the publish path
- [x] keep `is_default_visible` as first-paint policy only, not render eligibility
- [x] narrow the default-visible baseline upstream via the centralized
  `core_rescue_bridge_v1` policy
  - successor handoff: `docs/plans/entity-aware-default-visibility.md`

### Stage 2B: Finish render/export coherence

- [x] recompute cluster centroids and representatives against `render_points`
- [x] stop exporting raw cluster `is_noise` as the browser policy signal
- [x] remove deprecated artifact aliases and strict-accept only bundle `v2`
- [ ] decide whether to split raw-cluster vs render-cluster metrics more explicitly in the contract
- [ ] decide whether centroids should be:
  - recomputed on filtered coordinates
  - or preserved as raw-run metrics with explicit naming
- [ ] decide whether representative nodes should be:
  - recomputed against filtered render points
  - or exported separately as raw-run representatives
- [x] replace the compatibility gate with a strict `v4` canonical-bundle gate
- [x] remove `outlier_score` from `base_points`

### Stage 2C: Build the visibility/emphasis layer

- [x] keep using native Cosmograph crossfilter as the base signal
- [x] stop converting the full filtered point table into JS objects on each interaction
- [x] avoid rebuilding points arrays or DuckDB views per interaction
- [x] move query-driven `current` scope off giant `IN (...)` lists where a native point-scope SQL
  predicate is available
  - `currentPointScopeSql` now mirrors native visibility clauses only (`filter:*`,
    `timeline:*`, `budget:*`) for DuckDB queries
  - point index arrays are no longer maintained eagerly for SQL-backed non-geo current scope
  - array-backed current scope remains only where the layer or feature still needs indices
    directly (for example geo or non-SQL-scoped cases)
  - fit-scope now resolves indices on demand from DuckDB when the current scope is SQL-backed
- [x] split visibility/emphasis semantics from persistent selection semantics
- [x] add a native `budget:*` emphasis lane instead of overloading `selectPoints()`
- [x] drive first-pass search focus with a predicate over base `clusterId` / `index`
- [x] define one DuckDB-local visibility-budget query over base points
- [x] keep the first budget payload minimal:
  - seed index
  - optional cluster inclusion
  - local spatial window around the seed
- [x] feed search/timeline/filter intent into that budget query
  - search now uses the DuckDB-local budget query
  - active native `filter:*` / `timeline:*` clauses are converted to a DuckDB scope predicate
    for search-driven budget resolution
  - native filter/timeline updates now recompute the active search-derived budget focus using
    the current focus seed index as the anchor
- [x] shift budget emphasis from "cluster only" to "local neighborhood"
  - the budget query now derives a local spatial window from base `x` / `y` coordinates
  - cluster-wide emphasis is included only when the scoped cluster remains small enough to be
    meaningful
- [x] keep universe/evidence out of the immediate visibility loop
- [x] reserve `budget:*` as a visibility-source prefix alongside `baseline:*`, `filter:*`, and `timeline:*`

## Current Architecture Position

### Renderable cohort

Engine/export responsibility.

### Default-visible cohort

Data/product responsibility.

### Current visible set

Frontend responsibility, but only as a local DuckDB/Cosmograph read-model operation.

This is the key boundary to preserve.

## Current Assessment

- architecturally sound
- code-level stabilization mostly successful
- current upstream policy is explicit and generated in the publish path
- next unresolved step is tuning `core` / `rescue` / `bridge` thresholds and
  families as the mapped corpus evolves
- that policy-design follow-up now lives in:
  - `docs/plans/entity-aware-default-visibility.md`
- canonical bundle boundary is now strict `v4` with no deprecated artifact aliasing
- `current` is now intentionally visibility-scoped; persistent point selection remains a separate
  intent lane
- next implementation layer should be a richer DuckDB-local visibility-budget query on top of
  Cosmograph native crossfilter, building on the current native `budget:*` emphasis lane

## Do Not Jump To Yet

- 14M-point browser map delivery
- pre-canonical `corpus_neighbors` baseline artifact
- browser-side graph expansion logic
- reintroducing `SELECT *` / wide point materialization

Those are separate decisions and should not be mixed into this stabilization pass.
