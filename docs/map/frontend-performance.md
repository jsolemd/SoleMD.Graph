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
- Keep Tiptap/ProseMirror usage behind `features/graph/tiptap/**` adapters instead of importing `@tiptap/*` directly in feature code.

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
- Register bundle parquet assets once per DuckDB session under stable logical file names before building canonical views.
- Materialize `base_points` and `base_clusters` into local DuckDB tables during bootstrap because first paint already depends on them.
- Prefer local temp/materialized tables for hot-path data that powers repeated faceting, table paging, search, and high-frequency interactions once the interactive path is active.
- If an interactive-only runtime table is still needed, build it from the local canonical table instead of reading parquet again.
- Optional or evidence-heavy relations may stay lazy, but only if they are not on the first-paint or high-frequency path.

6. No hidden hydration/runtime penalties

- Keep `"use client"` boundaries as small as possible.
- Lazy-load heavy chrome, controls, legends, and noncritical panels.
- Do not import graph-only controls into always-visible brand/header surfaces unless they are split behind a lazy boundary.
- Avoid effect cascades that cause a second fetch/render immediately after first paint.
- Keep the editor subtree isolated from response streaming and panel chrome updates so prompt/manuscript interactions do not rerender the rich-text surface unless editor-facing props actually changed.

7. Centralize performance-sensitive contracts

- Canonical table/view names, selection-query semantics, and scope-resolution rules must live in shared modules.
- If two panels need the same derived query inputs, extract that derivation into a shared hook or library module.
- If two DuckDB consumers need the same projection, predicate, or cache key, centralize it.

8. Measure before and after

- Use Chrome DevTools MCP and/or browser-network inspection for frontend latency changes.
- For DuckDB/runtime changes, verify whether requests, `HEAD` probes, or remote Parquet reads were reduced.
- Prefer structural fixes over debounce-only masking.

9. Performance regressions require tests

- Changes affecting shell startup, DuckDB bootstrap, selection/query orchestration, or repeated interaction latency must add or update regression tests.
- Tests should verify the canonical behavior directly:
  - hot-path tables are materialized once
  - hidden panels do not prefetch
  - selection/scope resolution stays shared
  - repeated queries use caches where intended

## Anti-Patterns

- Rebuilding selection or scope logic inside each panel.
- Querying hidden panels on mount “just in case”.
- Hot first-paint tables left as parquet-backed views instead of one local session table.
- Reopening DuckDB to work around invalidation or cache issues.
- Local one-off fixes that bypass `features/graph/cosmograph/**` or `features/graph/duckdb/**`.
- Local one-off fixes that bypass `features/graph/tiptap/**` and couple feature code directly to raw `@tiptap/*` imports.
- Adding a second implementation path instead of replacing the old one.

## Review Checklist

- Does this change reduce or eliminate repeated work?
- Is the hot path local, cached, and shared?
- Did we keep one canonical implementation?
- Did we verify the result with tests and browser/runtime inspection?
