---
name: cosmograph
description: |
  SoleMD.Graph browser graph runtime: GraphBundle bootstrap, DuckDB-WASM, OPFS hot-table
  cache, active views, and native Cosmograph rendering. Use for graph loading,
  read_parquet or graph-bundles issues after asset URLs resolve, camera, clusters,
  filters, timeline, and canvas performance.

  Triggers: cosmograph, duckdb-wasm, graph runtime, graph bootstrap, read_parquet,
  graph-bundles, OPFS, active views, camera, filters, timeline, canvas performance.

  Do NOT use for: engine publish ownership, backend asset-serving, or general styling.
version: 4.2.0
allowed-tools:
  - mcp__doc-search__resolve-library-id
  - mcp__doc-search__query-docs
  - mcp__doc-search__read-doc
  - Read
  - Grep
  - Glob
  - Bash
metadata:
  short-description: SoleMD.Graph browser runtime, DuckDB-WASM bootstrap, and native Cosmograph
---

# Cosmograph - SoleMD.Graph Browser Runtime

## What /cosmograph owns

Use `/cosmograph` for the browser-side path after bundle metadata and asset URLs are
already defined:

- `GraphBundle` bootstrap and session reuse
- DuckDB-WASM connection, OPFS cache, and registered bundle files
- canonical views and query surfaces
- native Cosmograph props, callbacks, and camera behavior
- shell loading overlays, first paint, and graph interaction latency

Use `/graph` when the problem is publication state, checksum aliasing, asset route
serving, or environment/networking ownership.

Use `/clean` after meaningful runtime changes. If the durable browser-runtime
contract changes, update this skill or the owning graph references in the same
batch and run `solemd skill-sync`.

## Companion Skill Chain

| Situation | Skill |
|-----------|-------|
| Publication, checksum aliasing, asset route serving, local networking | `/graph` |
| DuckDB-WASM bootstrap, active views, canvas/runtime behavior | `/cosmograph` |
| Visual polish or token-level styling | `/aesthetic` |
| Post-change deduplication, modularization, verification, contract close-out | `/clean` |
| Skill contract changed | `/config-sync` |

## Quick Reference

| What | Where |
|------|-------|
| Client shell entry | `features/graph/components/shell/DashboardShellClient.tsx` |
| Shell controller / loading gate | `features/graph/components/shell/use-dashboard-shell-controller.ts` |
| Bundle load hook | `features/graph/hooks/use-graph-bundle.ts` |
| DuckDB runtime boundary | `features/graph/duckdb/index.ts` |
| DuckDB connection + OPFS open | `features/graph/duckdb/connection.ts` |
| Registered bundle file names | `features/graph/duckdb/bundle-files.ts` |
| Hot-table persistence | `features/graph/duckdb/persistent-cache.ts` |
| Initial session/bootstrap views | `features/graph/duckdb/views/register-all.ts` |
| Parquet relation registration | `features/graph/duckdb/views/relations.ts` |
| Native Cosmograph boundary | `features/graph/cosmograph/index.ts` |
| Main renderer | `features/graph/cosmograph/GraphRenderer.tsx` |
| Prop mapping | `features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| Runtime docs | `docs/map/graph-runtime.md` |
| Performance rules | `../graph/references/frontend-performance.md` |

## Native-First Principles

1. Use native `@cosmograph/react` props, methods, and widgets before inventing
   local abstractions.
2. Keep all `@cosmograph/*` imports inside `features/graph/cosmograph/**`.
3. Keep DuckDB-specific orchestration inside `features/graph/duckdb/**`.
4. Keep one canonical bundle bootstrap path. Do not add a second "temporary"
   loader, renderer-specific file registration, or ad hoc query session.
5. Prefer SQL/view fixes and adapter-boundary fixes over JS-side mirrors,
   duplicated state, or one-off workaround branches.

## Runtime Bootstrap Flow

This is the working browser pipeline:

1. Server resolves `GraphBundle` metadata and checksum URLs.
2. `DashboardShellClient` calls `useDashboardShellController(bundle)`.
3. `useDashboardShellController()` calls `useGraphBundle(bundle)`.
4. `useGraphBundle()` reuses the active session for the same checksum, registers
   the remote attachment provider, subscribes to progress, and calls
   `loadGraphBundle(bundle)`.
5. `features/graph/duckdb/connection.ts` opens one DuckDB-WASM worker-backed
   connection and uses OPFS when available.
6. `features/graph/duckdb/bundle-files.ts` registers each table URL under the
   logical namespace `graph-bundles/<checksum>/<parquet-file>`.
7. `features/graph/duckdb/views/relations.ts` materializes hot local tables
   (`base_points`, `base_clusters`) and leaves optional large relations parquet-backed.
8. `features/graph/duckdb/views/register-all.ts` creates the canonical active
   views and query aliases.
9. `GraphRenderer` binds native Cosmograph props/events and signals first paint
   only after the correct camera state is applied.

## Registered File Contract

This is the critical DuckDB rule that often gets misunderstood.

- DuckDB reads bundle parquet through registered logical file names such as:
  `graph-bundles/<checksum>/base_points.parquet`
- Those strings come from `db.registerFileURL(...)` in
  `features/graph/duckdb/bundle-files.ts`.
- In `features/graph/duckdb/views/relations.ts`, `read_parquet('graph-bundles/...')`
  is reading the registered browser file handle, not directly opening a local disk
  path in the repo.

Implication:

- If DuckDB throws an error mentioning `read_parquet('graph-bundles/...')`, the
  root cause may still be upstream asset-serving failure.
- Before changing DuckDB SQL, verify that the underlying bundle URL itself
  returns `200`.

## Canonical Render And Query Boundary

Hard rules from the runtime docs:

- Cosmograph binds to `current_points_canvas_web` and `current_links_web`.
- `pointIncludeColumns` stays empty unless a native widget genuinely requires more.
- `current_points_canvas_web` is the render path; richer query surfaces stay in
  the DuckDB query aliases.
- Overlay mutates membership tables, not copied rich point tables.
- React/Zustand stores hold scalar invalidation state, not the active graph rows.

## Session And Performance Rules

These are non-negotiable `/clean` expectations for browser runtime work:

- Reuse one live DuckDB session for the active bundle checksum.
- Same-checksum rerenders/remounts must reuse the session instead of rebuilding it.
- `base_points` and `base_clusters` are hot local tables and should be materialized
  once per session.
- When OPFS is available, reuse the hot-table cache across full page reloads.
- Optional large relations stay lazy; do not eagerly hydrate `universe_points`,
  `universe_links`, or evidence-heavy tables on first paint.
- Hidden panels must not trigger warmup queries on mount.
- Changes to bootstrap, query orchestration, or repeated interaction latency must
  add or update regression tests.

## Camera And First-Paint Rules

Preserve these unless an upstream native fix makes them unnecessary:

| Rule | Why |
|------|-----|
| Restore or apply camera state inside the Cosmograph adapter boundary | Avoid parallel app-defined camera models |
| Use explicit fit/restore after rebuild | Prevent one-frame wrong-zoom flashes |
| Do not rely on `fitViewOnInit` for the flagship initial camera state | It can flash and then snap |
| Keep the hidden-tab retry path | Background tabs can suppress the first RAF |
| Drop the shell loading overlay only after the correct viewport is applied | Prevent exposing the wrong first frame |

## Failure Triage

When a graph bundle/bootstrap error appears in the browser:

### Step 1: Check whether the URL serves

From the browser or shell, test the exact asset URL:

```bash
curl -I http://127.0.0.1:3000/graph-bundles/<checksum>/base_points.parquet
```

- If it is not `200`, stop. This is a `/graph` publication or asset-serving issue.
- If it is `200`, continue with runtime triage below.

### Step 2: Confirm the bundle registration path

Check:

- `features/graph/duckdb/bundle-files.ts`
- `bundle.tableUrls[tableName]`
- `getRegisteredBundleTableFileName(bundle, tableName)`
- `features/graph/duckdb/views/relations.ts`

Do not "fix" a registered-file error by replacing the logical file name with a
filesystem guess or by adding run-id-specific browser logic.

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

- Do not import `@cosmograph/react` outside `features/graph/cosmograph/**`.
- Do not derive run directories, `bundleUri`, or published filesystem paths in the browser.
- Do not add a second loader to bypass the canonical `useGraphBundle()` path.
- Do not re-query hidden panels "just in case".
- Do not move active graph rows into React state.
- Do not widen the render path when a narrow view or native widget solves it.

## Preferred Change Strategy

1. Verify whether the issue is really browser runtime, not `/graph` asset serving.
2. Prefer fixing the canonical session/view path over adding a side path.
3. Keep changes inside the DuckDB or Cosmograph adapter boundaries.
4. Re-verify with tests plus browser inspection.

## References

| Reference | Purpose |
|-----------|---------|
| `docs/map/graph-runtime.md` | Bundle contract, active views, DuckDB runtime rules |
| `../graph/references/frontend-performance.md` | Performance and canonical implementation rules |
| `references/api-reference.md` | Native Cosmograph API notes and runtime reference |
| `features/graph/duckdb/__tests__/` | Runtime/bootstrap regression coverage |
| `features/graph/cosmograph/__tests__/` | Renderer and shell regression coverage |

## Update This Skill When

- the canonical bootstrap path changes
- the DuckDB session reuse or active-view contract changes
- first-paint or camera ownership changes
- the handoff boundary with `/graph` changes
