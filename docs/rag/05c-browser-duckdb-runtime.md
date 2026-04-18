# 05c — Browser DuckDB Runtime

> **Status**: locked for the browser-side DuckDB-Wasm + OPFS posture, the
> one-session-per-checksum rule, the hot-path `base_points` / `base_clusters`
> contract, the lazy-attach universe/overlay contract, the canonical active-view
> names consumed by Cosmograph, and the "no second JS-owned graph dataset"
> boundary. **Provisional**: exact OPFS file naming, sample-build performance
> budgets, and any optional worker/thread variant choice that depends on the
> deployment envelope. **Deferred**: a serve-side DuckDB cache layer, offline
> authoring of browser-local graph edits, and any browser-visible fallback route
> that weakens the checksum-addressed asset contract.
>
> **Date**: 2026-04-17
>
> **Scope**: the browser/runtime lane that consumes the immutable graph bundle
> from `05b`, opens it through DuckDB-Wasm, materializes the active graph views,
> and presents them to Cosmograph. This doc is the browser-side sibling of
> `05b-graph-bundles.md`: `05b` owns export/publish/asset-serving, while this
> doc owns bundle consumption, OPFS persistence, local active views, and the
> render/query boundary inside the browser.
>
> **Authority**: this document is authority for the browser DuckDB runtime
> contract in the rebuild. Existing `features/graph/**` code, old runtime store
> wiring, and prior bootstraps are inventory only. If old runtime code disagrees
> with this document, the runtime code is rewritten.

## Purpose

The graph-bundle story is incomplete if it stops at parquet export. The runtime
that actually makes the bundle useful is the browser DuckDB session: it is the
place where immutable Parquet becomes hot first-paint tables, lazy universe
attachments, id-only overlay promotion, canonical active views, and finally a
Cosmograph render surface.

The reason to write this as a separate cutover document is straightforward:

1. `05b` fixes the export/publish boundary, but it intentionally does not own
   browser runtime orchestration.
2. The browser DuckDB lane is not a generic "frontend cache." It is the local
   analytic runtime for the graph product, and it has its own hot path, warm
   path, and invalidation rules.
3. Official library posture supports this split: DuckDB-Wasm documents remote
   file registration and direct Parquet/HTTP querying in the browser, while
   Cosmograph documents an external DuckDB connection plus preindexed point/link
   tables as a first-class integration path.

## §0 Conventions delta from `05b` / `graph-runtime.md`

This doc inherits the bundle identity and asset-serving rules from `05b`, and
the layer model from `docs/map/graph-runtime.md`. It adds the browser-runtime
rules below:

| Concern | This doc adds |
|---|---|
| **One live session per checksum** | A checksummed bundle opens exactly one canonical DuckDB-Wasm session in the browser. Remounts, rerenders, and panel churn reuse that session instead of reopening the database or rereading the same base parquet files. |
| **DuckDB is the local graph state authority** | Base, overlay membership, active views, and selection materialization live in DuckDB-local tables/views. React/Zustand mirror only scalar invalidation and UI state, not the full graph dataset. |
| **Hot-path tables stay local and fixed** | `base_points` and `base_clusters` are the hot first-paint tables. They load once per active checksum and, when OPFS is available, may persist in one browser-local DuckDB file for fast reloads. |
| **Warm path stays lazy** | `universe_points`, large link relations, and evidence-heavy tables remain detached until an explicit producer path needs them. OPFS persistence of hot tables is not permission to hydrate the entire universe at startup. |
| **Cosmograph binds to canonical active views only** | The render path consumes the preindexed active views (`current_points_canvas_web`, `current_links_web`, related aliases) through one external DuckDB connection. No second render dataset is maintained in JS objects. |

## §1 Runtime boundary

The runtime contract is:

```text
checksum-addressed bundle URLs
    -> DuckDB-Wasm file registration / direct HTTP parquet access
    -> browser-local base tables
    -> lazy universe attach
    -> id-only overlay membership
    -> canonical active views
    -> Cosmograph render + local analytics widgets
```

What this boundary explicitly excludes:

- no browser-visible run-directory paths
- no frontend-generated alternate bundle URLs
- no duplicated "current graph" truth in React stores
- no eager copy of base or universe rows into JS arrays for the main graph page
- no second selection or scope implementation outside the shared query/runtime layer

## §2 Bundle bootstrap contract

DuckDB-Wasm officially supports two compatible patterns that matter here:

- registering remote files into the local DuckDB file system
- directly querying remote Parquet/HTTP paths from SQL

Our runtime keeps one canonical pattern: resolve checksum-addressed asset URLs
through the backend, register them under stable bundle-local names, and treat
those names as the only file handles the runtime queries against. That keeps the
runtime deterministic even if the backend later changes hosting details.

Locked rules:

1. The browser resolves `manifest.json` first, then the listed parquet files.
2. The runtime registers bundle files under checksum-scoped names rather than
   letting ad hoc SQL strings proliferate through the app.
3. The runtime never derives file paths from `graph_run_id` or filesystem
   layout; the checksum-addressed URL is the only browser-visible asset identity.
4. Remote parquet reads assume correct CORS and range-request support on the
   asset route. The browser runtime does not compensate for a broken asset host.

## §3 Hot path

The hot path is the minimum graph lane required for fast first paint:

- `base_points.parquet`
- `base_clusters.parquet`
- the narrow canvas/query aliases derived from them

This is the permanent runtime posture:

1. Base files load once per active checksum.
2. Base files define first paint. We do not invent a slimmer implicit dataset in
   the frontend to make startup look faster.
3. When OPFS is available, the runtime may reopen one persistent local DuckDB
   file and reuse the already-materialized hot tables on reload.
4. OPFS is an optimization, not a correctness dependency. The runtime still
   works without it.

Why OPFS is the correct cache layer here:

- official browser guidance says OPFS is origin-private, quota-bound, and
  worker-friendly
- OPFS supports fast local file access and synchronous access handles inside web
  workers
- clearing site storage clears the cache, which is exactly the invalidation
  behavior wanted for a checksum-keyed hot-table cache

Operational implication: the OPFS cache key stays the bundle checksum, not the
`graph_run_id`. Equal bytes should hit the same local cache.

## §4 Warm path

The warm path begins where first paint ends.

`universe_points.parquet` and the richer link/evidence surfaces are not part of
startup. They attach only when a producer path requires them, for example:

- page-level graph activation from wiki evidence refs
- entity or prompt-driven overlay promotion
- cluster drill-in
- scoped graph exploration that needs mapped papers outside the base scaffold

The local mutation model is locked:

- overlay membership tables are id-only
- promoted rows resolve from the attached universe tables
- active render views are rebuilt from base + overlay membership, not by copying
  rich overlay rows into a parallel mutable point table

This keeps the warm path additive rather than duplicative.

## §5 Canonical local tables and views

The canonical local shape matches the graph-runtime contract already documented
in `docs/map/graph-runtime.md` and `docs/map/database.md`.

Hot/local tables and views:

- `base_points_web`
- `base_points_canvas_web`
- `base_links_web`
- `current_points_web`
- `current_points_canvas_web`
- `current_links_web`
- `selected_point_indices`

Warm/lazy/local tables and views:

- `universe_points_web`
- `universe_points_canvas_web`
- `overlay_point_ids_by_producer`
- `overlay_point_ids`
- `overlay_points_web`
- `active_point_index_lookup_web`
- `active_points_web`
- `active_points_canvas_web`
- `active_paper_points_web`
- `active_links_web`

Locked rule: the render surface binds to the canonical `current_*` aliases, not
to whatever intermediate table happened to be touched most recently.

## §6 Cosmograph integration contract

Official Cosmograph library docs support an external DuckDB connection plus
table-name input, and the library's performance guidance is explicit that
preindexed points and links are the fast path.

That yields the rebuild contract:

1. Cosmograph receives one external DuckDB-Wasm connection from the graph
   runtime.
2. The `points` and `links` inputs are stable table/view names, not large JS
   arrays generated on every invalidation.
3. Points must expose unique IDs and unique sequential indices.
4. Links must expose source/target IDs and their corresponding point indices.
5. Camera operations use the library's explicit methods (`fitView`,
   `fitViewByIndices`, point-focus helpers) rather than bespoke viewport logic
   that drifts from the graph runtime.

This is the reason the runtime keeps dense active indices even when overlay
membership changes: it matches the engine the product is actually using.

## §7 State, invalidation, and selection

The invalidation discipline is locked:

- DuckDB owns point/link membership and selection materialization
- React/Zustand own dock state, panel state, and scalar invalidation only
- selection/scope controllers emit SQL or point-index intents into the shared
  query/runtime layer

Allowed mirrored scalars include:

- selected point count
- scope revision
- selection revision
- current point-scope SQL

Forbidden:

- copying the full active point set into React state
- panel-local selection logic
- page-local graph overlays that bypass the shared overlay producers

## §8 Relationship to `05b`

`05b` and this doc are intentionally adjacent because they solve different
halves of one lane:

- `05b` owns export, manifest, checksum identity, publish, retention, and asset
  serving
- `05c` owns browser import, OPFS reuse, active-view materialization, and the
  Cosmograph-facing runtime contract

If the bundle contract changes, both docs must move together.

## §9 What remains provisional

The following stay measurement-owned:

- exact OPFS filename/layout conventions
- sample-build startup budgets
- any threaded-worker variant choice that depends on deployment headers and
  browser isolation posture
- whether any server-side DuckDB helper materially improves export wall-clock
  enough to become the default export engine in `05b`

The implementation rule is the same as elsewhere in the series: do not promote
these from provisional to locked without sample-build evidence.
