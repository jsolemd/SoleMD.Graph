---
name: cosmograph
description: SoleMD.Graph browser graph runtime — GraphBundle bootstrap, DuckDB-WASM, OPFS hot-table cache, native Cosmograph 2 rendering, camera, filters, timeline, dispose lifecycle, canvas performance. Make sure to use this skill whenever the user mentions cosmograph, duckdb-wasm, graph runtime, graph bootstrap, read_parquet, graph-bundles, registerFileBuffer, OPFS, useCosmograph, useCosmographInternal, useGraphCamera, useGraphInstance, useGraphExport, Cosmograph React, Cosmograph 2, pointXBy, pointYBy, enableSimulation, pointClusterBy, selection toolbar, fitView, hot-table cache, persistent-cache, bundle-files, sha256 integrity, eh bundle, mvp bundle, or canvas performance. Do NOT use for server-side bundle publication or force-directed layout (use /graph — browser runs enableSimulation=false), CSS variable theming values (use /aesthetic — this skill owns the integration boundary), three.js or shaders (use /threejs), raw WebGPU (use /webgpu), or LLM evaluation (use /langfuse).
allowed-tools: Read Glob Grep Bash mcp__context7__resolve-library-id mcp__context7__query-docs mcp__codeatlas__resolve_library_id mcp__codeatlas__search_docs mcp__codeatlas__read_doc
paths: "apps/web/features/graph/**"
metadata:
  short-description: Browser graph runtime — Cosmograph 2 + DuckDB-WASM + OPFS
---

# Cosmograph - SoleMD.Graph Browser Runtime

## What you own

You own the browser-side path after bundle metadata and asset URLs are already
defined:

- `GraphBundle` bootstrap and same-checksum session reuse
- DuckDB-WASM connection, OPFS hot-table cache, and registered bundle files
- canonical views and query surfaces inside the live session
- native Cosmograph 2 props, callbacks, and camera behavior
- shell loading overlays, first paint, and graph interaction latency
- canvas-vs-widget theming split

Defer to `/graph` when the problem is publication state, checksum aliasing, asset
route serving, force-layout positions, or environment/networking ownership.
Defer to `/aesthetic` for the CSS-variable values that the widget chrome consumes.

After meaningful runtime changes, run `/clean`. If the durable browser-runtime
contract changes, update this skill or the owning graph references in the same
batch and run `solemd skill-sync`.

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| Publication, checksum aliasing, asset route serving, force-layout positions | `/graph` |
| DuckDB-WASM bootstrap, active views, canvas/runtime behavior | `/cosmograph` |
| CSS-variable definitions for `--cosmograph-ui-*` widget chrome | `/aesthetic` |
| Post-change deduplication, modularization, verification | `/clean` |
| Skill contract changed | `/config-sync` |

## Critical Rule: Force Simulation Is OFF

**Cosmograph runs `enableSimulation={false}` in this project.** Point positions
come from DuckDB columns specified by `pointXBy` / `pointYBy` (the SoleMD graph
is a static-positioned graph). Do NOT add force-simulation logic; do NOT call
`start()` or `unpause()`; do NOT flip `enableSimulation` true. If the user asks
about force layout, force-directed layout, or how the layout is computed, that
is the SERVER-side build (owned by `/graph`), not browser runtime.

## Cosmograph 2 Data Contract

Cosmograph 2 requires **six `*By` props** on the renderer:

- `pointIdBy`, `pointIndexBy`
- `linkSourceBy`, `linkSourceIndexBy`, `linkTargetBy`, `linkTargetIndexBy`

Hard rules:

- The `pointIndexBy` / `linkSourceIndexBy` / `linkTargetIndexBy` columns must be
  **sequential `INTEGER` from 0**.
- Multi-target links were removed in v2. Collapse upstream — never emit
  duplicates from the renderer.
- For raw-array inputs, run `prepareCosmographData()` (it creates the index
  columns for you).
- SoleMD uses **external DuckDB connection mode**: pass `points: 'table_name'`
  and `links: 'table_name'` as strings plus `{ duckdb, connection }`. See
  `references/cosmograph-runtime.md`.

## Native-First Principles

1. Use native `@cosmograph/react` props, methods, and widgets before inventing
   local abstractions.
2. Keep all `@cosmograph/*` imports inside `features/graph/cosmograph/**` (or
   the shared `packages/graph/src/cosmograph/**` boundary).
3. Keep DuckDB-specific orchestration inside `features/graph/duckdb/**`.
4. Keep one canonical bundle bootstrap path. Do not add a second "temporary"
   loader, renderer-specific file registration, or ad hoc query session.
5. Prefer SQL/view fixes and adapter-boundary fixes over JS-side mirrors,
   duplicated state, or one-off workaround branches.

## SSR Boundary: Defer The DuckDB Import

`@duckdb/duckdb-wasm`'s browser entry references `Worker` at the top of module.
Next's Turbopack alias resolves the package to that browser entry in both server
and client bundles, so a static `import` crashes during SSR HTML generation
(SSR walks client-component import trees regardless of `'use client'` or
`'client-only'`).

**Rule**: load DuckDB only via `await import('@duckdb/duckdb-wasm')` from inside a
function. Never put `import * as duckdb from '@duckdb/duckdb-wasm'` at module
top level. Do NOT "fix" the dynamic import as a code-smell — it is a correctness
contract. The canonical example lives in `apps/web/features/graph/duckdb/connection.ts`.

## Canvas vs Widget Theming Split

Hard rule — never bridge canvas appearance through CSS:

- **Widget chrome** (timeline, histogram, bars, search, scrollbars) is themed
  through CSS variables: `--cosmograph-ui-*`, `--cosmograph-histogram-*`,
  `--cosmograph-bars-*`, `--cosmograph-timeline-*`, `--cosmograph-scrollbar-*`.
  SoleMD's reference impl lives in
  `features/graph/components/explore/widget-theme.ts`.
- **Canvas appearance** (point/link colors, ring colors, selector strokes) is
  themed through Cosmograph **config props**: `pointDefaultColor`,
  `pointGreyoutColor`, `linkDefaultColor`, `hoveredPointRingColor`,
  `focusedPointRingColor`, `unknownColor`, `polygonalSelectorStrokeColor`,
  `pointLabelColor`.
- Cross-reference `/aesthetic` for the actual CSS-variable values; this skill
  owns the integration boundary, not the token definitions.

## Runtime Bootstrap Flow

This is the working browser pipeline:

1. Server resolves `GraphBundle` metadata and checksum URLs.
2. `DashboardShellClient` calls `useDashboardShellController(bundle)`.
3. `useDashboardShellController()` calls `useGraphBundle(bundle)`.
4. `useGraphBundle()` reuses the active session for the same checksum, registers
   the remote attachment provider, subscribes to progress, and calls
   `loadGraphBundle(bundle)`.
5. `features/graph/duckdb/connection.ts` opens one DuckDB-WASM worker-backed
   connection; OPFS is used when capability is detected.
6. `features/graph/duckdb/bundle-files.ts` **eagerly fetches each bundle parquet,
   verifies its sha256 against `bundle.bundleManifest.tables[t].sha256`, then
   calls `db.registerFileBuffer(...)`** under the logical namespace
   `graph-bundles/<checksum>/<parquet-file>`. The hash check catches
   bundle-serving drift (republish without alias bump, MITM tampering).
7. `features/graph/duckdb/views/relations.ts` materializes hot local tables
   (`base_points`, `base_clusters`); optional large relations stay parquet-backed.
8. `features/graph/duckdb/views/register-all.ts` creates the canonical active
   views and query aliases.
9. `GraphRenderer` binds native Cosmograph props/events and signals first paint
   only after the correct camera state is applied.

## Registered File Contract

This is the critical DuckDB rule that often gets misunderstood.

- DuckDB reads bundle parquet through registered logical file names such as:
  `graph-bundles/<checksum>/base_points.parquet`
- Those strings come from `db.registerFileBuffer(...)` in
  `features/graph/duckdb/bundle-files.ts` (NOT `registerFileURL` — the file is
  fetched up front, hash-verified, then registered as bytes so DuckDB does no
  range-fetching against the network).
- In `features/graph/duckdb/views/relations.ts`,
  `read_parquet('graph-bundles/...')` reads the registered browser file handle,
  not a local disk path.

Implication:

- If DuckDB throws on `read_parquet('graph-bundles/...')`, the root cause may
  still be upstream asset-serving failure — verify the bundle URL returns 200
  before changing SQL.
- If the integrity check throws, the **bundle was republished**: agents must not
  swallow the error or hardcode a workaround; signal `/graph` to republish
  cleanly.

## Hot-Bundle Cache Schema Versioning

`features/graph/duckdb/persistent-cache.ts` invalidates the OPFS hot-bundle
cache on either:

1. `cache_schema_version` bump
2. **Column-set hash mismatch** — projection drift against an unchanged
   `bundleChecksum` (or a mispublished bundle that reuses a checksum)
   invalidates the cache instead of silently serving a stale schema.

Hard rule: do NOT "simplify" the cache surface by removing the column-set hash.
It is the agent's safety net against silent stale-schema reads.

## Canonical Render And Query Boundary

- Cosmograph binds to `current_points_canvas_web` and `current_links_web`.
- `pointIncludeColumns` stays empty unless a native widget genuinely requires
  more.
- `current_points_canvas_web` is the render path; richer query surfaces stay in
  the DuckDB query aliases.
- Overlay mutates membership tables, not copied rich point tables.
- React/Zustand stores hold scalar invalidation state, not the active graph rows.

## Session Rules

- Reuse one live DuckDB session for the active bundle checksum.
- Same-checksum rerenders/remounts must reuse the session instead of rebuilding.
- `base_points` and `base_clusters` are hot local tables, materialized once per
  session; reuse the OPFS cache across full page reloads when capability allows.
- Optional large relations stay lazy; do not eagerly hydrate `universe_points`,
  `universe_links`, or evidence-heavy tables on first paint.
- Hidden panels must not trigger warmup queries on mount.

For SoleMD.Graph frontend performance contract, see
`../graph/references/frontend-performance.md`. That reference is the canonical
performance source — do not duplicate budgets here.

## Dispose Lifecycle

When tearing down a DuckDB session, run **all five steps in order**, swallowing
errors but propagating the first one. Skipping any step leaks DuckDB statements
or workers:

1. `closePreparedStatements(conn)` — flush pooled prepared statements
2. `db.flushFiles()` — flush OPFS writes before close
3. `conn.close()`
4. `db.terminate()`
5. `worker.terminate()`

Canonical implementation: `closeConnection()` in
`features/graph/duckdb/connection.ts`.

## Camera And First-Paint Rules

| Rule | Why |
|------|-----|
| Use `useGraphCamera` from `@solemd/graph/cosmograph` for `fitView`, `fitViewByIndices`, `fitViewByCoordinates`, `zoomToPoint`, `zoomIn`, `zoomOut` | Null-tolerant wrapper around `useCosmographInternal`; works on renderer-clean surfaces |
| Use `useGraphInstance()` (null-tolerant) instead of importing `useCosmograph` directly | Upstream `useCosmograph` throws outside a provider — that crashes renderer-clean surfaces (e.g. 3D OrbSurface) |
| Restore or apply camera state inside the Cosmograph adapter boundary | Avoid parallel app-defined camera models |
| Call `fitView(0, padding)` explicitly after rebuild | Prevent one-frame wrong-zoom flashes |
| Do not rely on `fitViewOnInit` for the flagship initial camera state | It can flash and then snap |
| Keep the hidden-tab visibility retry path | Background tabs suppress the first RAF, so `onGraphRebuilt` never fires |
| Drop the shell loading overlay only after the correct viewport is applied | Prevent exposing the wrong first frame |

## Native Widget Catalog

Production widgets used in SoleMD.Graph and where they live:

| Native widget | App / shared adapter |
|---------------|----------------------|
| `CosmographProvider` | `packages/graph/src/cosmograph/GraphShell.tsx` |
| `CosmographTimeline` | `apps/web/features/graph/cosmograph/widgets/TimelineWidget.tsx` |
| Raw `Histogram` from `@cosmograph/ui` | `apps/web/features/graph/cosmograph/widgets/FilterHistogramWidget.tsx` + `native-histogram-adapter.ts` |
| Raw `Bars` from `@cosmograph/ui` | `apps/web/features/graph/cosmograph/widgets/FilterBarWidget.tsx` + `native-bars-adapter.ts` |
| `CosmographButtonRectangularSelection`, `CosmographButtonPolygonalSelection` | `apps/web/features/graph/cosmograph/widgets/SelectionToolbar.tsx` |
| `CosmographRangeColorLegend`, `CosmographTypeColorLegend` | `packages/graph/src/cosmograph/widgets/ColorLegends.tsx` |
| `CosmographSizeLegend` | `packages/graph/src/cosmograph/widgets/SizeLegend.tsx` |

`CosmographSearch` is referenced as a selection origin tag (`features/graph/lib/layers.ts`, `ScopeIndicator.tsx`) but no widget is currently mounted; treat it as a future surface, not a production widget.

## Failure Triage

When a graph bundle/bootstrap error appears in the browser:

### Step 1: Check whether the URL serves

```bash
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/base_points.parquet
```

- Not `200`: stop. This is `/graph` publication or asset-serving.
- `200`: continue with runtime triage.

### Step 2: Confirm the bundle registration path

Check:

- `features/graph/duckdb/bundle-files.ts`
- `bundle.tableUrls[tableName]`
- `getRegisteredBundleTableFileName(bundle, tableName)`
- `features/graph/duckdb/views/relations.ts`

Do not "fix" a registered-file error by replacing the logical file name with a
filesystem guess or by adding run-id-specific browser logic.

If the integrity check throws, the bundle was republished — escalate to `/graph`.

### Step 3: Confirm session/bootstrap behavior

Check:

- `features/graph/hooks/use-graph-bundle.ts`
- `features/graph/duckdb/connection.ts`
- `features/graph/duckdb/views/register-all.ts`
- `features/graph/components/shell/use-dashboard-shell-controller.ts`

Common real runtime failures:

- session recreated unnecessarily on same checksum
- hot tables rebuilt repeatedly instead of reused
- optional tables attached too early
- loading overlay dropped before camera/first paint settles
- renderer workaround added outside the adapter boundary

## What Not To Do

- Do not import `@cosmograph/react` outside `features/graph/cosmograph/**` or
  `packages/graph/src/cosmograph/**`.
- Do not derive run directories, `bundleUri`, or published filesystem paths in
  the browser.
- Do not add a second loader to bypass the canonical `useGraphBundle()` path.
- Do not re-query hidden panels "just in case".
- Do not move active graph rows into React state.
- Do not widen the render path when a narrow view or native widget solves it.
- Do not call `useCosmograph` directly — use `useGraphInstance` (null-tolerant).
- Do not flip `enableSimulation` to true.

## Preferred Change Strategy

1. Verify whether the issue is really browser runtime, not `/graph` asset
   serving.
2. Prefer fixing the canonical session/view path over adding a side path.
3. Keep changes inside the DuckDB or Cosmograph adapter boundaries.
4. Re-verify with tests plus browser inspection.

## Quick Reference

| What | Where |
|------|-------|
| Client shell entry | `features/graph/components/shell/DashboardShellClient.tsx` |
| Shell controller / loading gate | `features/graph/components/shell/use-dashboard-shell-controller.ts` |
| Bundle load hook | `features/graph/hooks/use-graph-bundle.ts` |
| DuckDB runtime boundary | `features/graph/duckdb/index.ts` |
| DuckDB connection + OPFS open + dispose | `features/graph/duckdb/connection.ts` |
| Registered bundle file names + sha256 verify | `features/graph/duckdb/bundle-files.ts` |
| Hot-table persistence + column-set hash | `features/graph/duckdb/persistent-cache.ts` |
| Initial session/bootstrap views | `features/graph/duckdb/views/register-all.ts` |
| Parquet relation registration | `features/graph/duckdb/views/relations.ts` |
| Native Cosmograph boundary | `features/graph/cosmograph/index.ts` |
| Main renderer | `features/graph/cosmograph/GraphRenderer.tsx` |
| Prop mapping | `features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| Shared `CosmographProvider` shell | `packages/graph/src/cosmograph/GraphShell.tsx` |
| Camera hooks | `packages/graph/src/cosmograph/hooks/use-graph-camera.ts` |
| Null-tolerant instance hook | `packages/graph/src/cosmograph/hooks/use-graph-instance.ts` |
| Widget CSS theme map | `features/graph/components/explore/widget-theme.ts` |
| Label theme | `packages/graph/src/cosmograph/label-appearance.ts` |
| Runtime docs | `docs/map/graph-runtime.md` |
| Performance rules | `../graph/references/frontend-performance.md` |

## References

| Reference | Purpose |
|-----------|---------|
| `references/api-reference.md` | Lookup index — class methods, config, doc-search workflow |
| `references/cosmograph-runtime.md` | v2 contract, props, widgets, camera, theming integration |
| `references/duckdb-wasm.md` | Bundle selection, deferred import, pragmas, dispose lifecycle |
| `references/opfs-cache.md` | OPFS protocol, capability gate, schema + column-set hash, browser support |
| `references/graph-bundle-bootstrap.md` | Registered file contract, hot tables, failure triage |
| `../graph/references/frontend-performance.md` | Canonical performance contract (deferred) |
| `features/graph/duckdb/__tests__/` | Runtime/bootstrap regression coverage |
| `features/graph/cosmograph/__tests__/` | Renderer and shell regression coverage |

## Update This Skill When

- the canonical bootstrap path changes
- the DuckDB session reuse, dispose lifecycle, or active-view contract changes
- first-paint or camera ownership changes
- the Cosmograph 2 data contract changes (props, widget catalog)
- the canvas-vs-widget theming split changes
- the handoff boundary with `/graph` or `/aesthetic` changes
