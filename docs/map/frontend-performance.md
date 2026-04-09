# Frontend Performance Requirements

These are canonical requirements for SoleMD.Graph frontend and graph-runtime work.
Any agent or contributor touching `features/graph/**`, shell/panel orchestration,
DuckDB-Wasm session code, or graph-loading paths must follow them.

## Core Requirements

1. Native-first runtime

- Prefer built-in platform capabilities before custom orchestration.
- Use DuckDB SQL and DuckDB-Wasm configuration directly before adding JS-side workarounds.
- Use Next.js lazy loading, route conventions, and client/server boundaries directly.
- Keep Cosmograph usage behind `features/graph/cosmograph/**` adapters.

2. One canonical query/state path

- Selection, current-scope, and table/info query intent must resolve through one shared layer.
- Do not rebuild selection/scope resolution independently in multiple panels.
- If a query needs scope-aware behavior, extend the shared resolver instead of adding a new local branch.

3. Zero redundant DuckDB work

- Hot bundle tables used for repeated interaction must be loaded once per DuckDB session.
- First paint may start from canonical attached bundle views if eager temp-table materialization would delay render.
- When a local temp/runtime table is the right steady-state for interaction, promote into it once on the first interactive need instead of during hidden startup work.
- Hidden panels and non-visible chrome must not trigger warmup queries on first paint.
- Avoid duplicate counts, duplicate summary fetches, and repeated request-key recomputation across panels.

4. Reuse one live DuckDB session

- Reuse the session/connection for the active bundle instead of reconnecting per panel or per query.
- Preserve DuckDB-local caches and metadata for the lifetime of the active bundle session.
- Any change that would re-open DuckDB or rebuild hot tables must be justified with measured benefit.

5. Local-first hot data

- Treat `base_points`, `base_clusters`, and other interaction-critical graph tables as hot-path assets.
- Prefer local temp/materialized tables for hot-path data that powers repeated faceting, table paging, search, and high-frequency interactions once the interactive path is active.
- Keep one canonical bootstrap path: first-paint views may stay attached to remote bundle tables, but interactive views must converge onto one shared promoted runtime table when that promotion reduces repeated work.
- When Chrome traces show repeated remote Parquet metadata probes on first render, move render-critical base canvas tables onto one local bootstrap runtime before Cosmograph mounts instead of leaving the canvas on HTTP-backed `read_parquet(...)` views.
- Once the canvas is on a local bootstrap runtime, later interactive-query promotion must update query views only. Do not repoint the live canvas table during idle prewarm.
- When no overlay is active, bootstrap `active_*` graph views as thin aliases over base views. Do not eagerly materialize overlay runtime tables or active index remaps during no-overlay startup.
- Optional or evidence-heavy relations may stay lazy, but only if they are not on the first-paint or high-frequency path.

6. No hidden hydration/runtime penalties

- Keep `"use client"` boundaries as small as possible.
- Lazy-load heavy chrome, controls, legends, and noncritical panels.
- Do not import graph-only controls into always-visible brand/header surfaces unless they are split behind a lazy boundary.
- Avoid effect cascades that cause a second fetch/render immediately after first paint.

7. Centralize performance-sensitive contracts

- Canonical table/view names, selection-query semantics, and scope-resolution rules must live in shared modules.
- If two panels need the same derived query inputs, extract that derivation into a shared hook or library module.
- If two DuckDB consumers need the same projection, predicate, or cache key, centralize it.

8. Overlay runtime is materialized once per revision

- `overlay_point_ids_by_producer` is the mutable source of truth for overlay membership.
- When overlay membership changes, rebuild the overlay runtime tables and active index lookup once in DuckDB.
- Do not leave `overlay_points_*` or active index remapping as non-materialized filter/window work on the hot read path.
- Keep the final active union thin; do not duplicate the full base dataset into another million-row temp table just to expose `active_points_*`.
- Point-only overlay mutations must not attach `universe_links` just to keep link views structurally available.

9. Measure before and after

- Use Chrome DevTools MCP and/or browser-network inspection for frontend latency changes.
- For DuckDB/runtime changes, verify whether requests, `HEAD` probes, or remote Parquet reads were reduced.
- For bundle asset transport changes, verify that repeated immutable asset probes no longer repeat database lookups or filesystem resolution on the server path.
- Prefer structural fixes over debounce-only masking.

10. Performance regressions require tests

- Changes affecting shell startup, DuckDB bootstrap, selection/query orchestration, or repeated interaction latency must add or update regression tests.
- Tests should verify the canonical behavior directly:
  - hot-path tables are materialized once
  - hidden panels do not prefetch
  - selection/scope resolution stays shared
  - repeated queries use caches where intended
  - overlay reads hit materialized runtime tables instead of rebuilding unions/windows

11. Large live overlays use one contract, not ad hoc paths

- Keep one public browser-side entry for graph-paper availability and attachment.
- Reduce round trips by batching through that contract; do not create one-off fetch paths per panel or prompt mode.
- The current narrow row-attachment contract is for demand-attached points, not the final transport for million-point overlays. If the live graph must extend toward million-scale visible overlays, evolve the canonical contract toward cohort or membership transport instead of hydrating every point row through JS arrays.

## Anti-Patterns

- Rebuilding selection or scope logic inside each panel.
- Querying hidden panels on mount “just in case”.
- Remote `read_parquet(...)` relations left on hot first-paint paths.
- Reopening DuckDB to work around invalidation or cache issues.
- Local one-off fixes that bypass `features/graph/cosmograph/**` or `features/graph/duckdb/**`.
- Adding a second implementation path instead of replacing the old one.
- Recomputing overlay unions and overlay `ROW_NUMBER()` index remaps inside live read views.
- Pulling `universe_links` during point-only overlay promotion.
- Treating row-hydration attachment as the final path for million-point live overlays.

## Review Checklist

- Does this change reduce or eliminate repeated work?
- Is the hot path local, cached, and shared?
- Did we keep one canonical implementation?
- Did we verify the result with tests and browser/runtime inspection?
