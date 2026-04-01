# SoleMD.Graph — DuckDB Runtime Best Practices

DuckDB is the browser-local analytical runtime for the graph. It is not the
global corpus database and it is not the heavy retrieval backend. Its job is to
keep the active graph responsive by querying release-scoped Parquet artifacts in
the browser with minimal JavaScript churn.

This document is the operating posture for DuckDB in SoleMD.Graph.

---

## Role

DuckDB owns:

- release-scoped `base`, `universe`, `overlay`, and `active` graph state in the
  browser
- local search, table, filter, info-panel, and visibility-budget queries
- narrow Parquet-backed projection views for the current graph release

DuckDB does not own:

- the full 100M+ paper corpus as a browser-attached working set
- warehouse retrieval, raw evidence payloads, or verbose citation expansion
- application state that can stay scalar in React/Zustand

The architectural split is deliberate:

- PostgreSQL / warehouse / evidence API own global scale
- DuckDB owns the local active working set
- Cosmograph owns rendering

If the product grows toward a 100M-node global graph, the browser still must not
attach 100M rich rows at once. The browser-attached universe must remain a
bounded working set over a larger backend corpus.

References:

- [living-graph.md](./../design/living-graph.md)
- [data.md](./data.md)
- [map.md](./map.md)

---

## External Guidance

The current local methodology matches the main DuckDB guidance:

- Reuse the same database connection for many small queries because DuckDB keeps
  useful metadata and data caches in memory.
- Query Parquet directly when workloads are mostly projection, filtering, and
  aggregation, because Parquet statistics and pushdown make that efficient.
- Treat DuckDB-Wasm as single-threaded by default; multithreading is still a
  special-mode optimization that depends on cross-origin isolation.
- Avoid designs built around many tiny write-like transactions; DuckDB is tuned
  for analytical batches, not OLTP-style chatter.

Official references:

- https://duckdb.org/docs/current/guides/performance/how_to_tune_workloads
- https://duckdb.org/docs/current/guides/performance/file_formats
- https://duckdb.org/docs/current/connect/concurrency
- https://duckdb.org/2021/10/29/duckdb-wasm

---

## Core Rules

### 1. Keep one hot connection per graph session

Use one `AsyncDuckDB` instance and one long-lived connection for the active
graph session.

Why:

- repeated reconnects throw away metadata/cache state
- one connection is the intended fast path for many small analytical reads
- the graph runtime already serializes hot-path query access cleanly

Current implementation:

- [connection.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/connection.ts)
- [core.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/queries/core.ts)

### 2. Keep DuckDB off the main thread

Always run DuckDB-Wasm through the async worker path.

Why:

- browser responsiveness matters as much as SQL throughput
- Cosmograph, React, and pointer interactions should not contend with query
  execution on the main thread

Current implementation:

- [connection.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/connection.ts)

### 3. Assume single-threaded Wasm unless the site is intentionally COI

Do not design around Wasm multithreading being present.

Why:

- DuckDB-Wasm defaults to single-threaded execution
- multithreaded Wasm depends on cross-origin isolation and compatible assets
- third-party integrations can make COI operationally expensive

Current implementation:

- `maximumThreads = 1`
- `SET threads = 1`

This is the correct default posture today.

### 4. Query Parquet through narrow projection views

Keep `base_points` and `universe_points` as Parquet-backed projection views.
Do not eagerly copy full rich point tables into browser-local temp tables.

Why:

- Parquet pushdown and statistics are valuable
- first paint must stay narrow
- copied rich point tables multiply browser memory pressure

Current implementation:

- [register-all.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/register-all.ts)
- [base-points.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/base-points.ts)
- [universe.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/universe.ts)

### 5. Keep the render path narrower than the query path

The stable contract is:

- `current_points_canvas_web` for render
- `current_points_web` / `current_paper_points_web` for queries
- `current_links_web` for graph links

Why:

- Cosmograph should render the minimum viable row shape
- filters, info widgets, search, and tables can query richer views without
  widening the render table

Current implementation:

- [canvas.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/canvas.ts)
- [QueryPanel.tsx](/home/workbench/SoleMD/SoleMD.Graph/features/graph/components/explore/query-panel/QueryPanel.tsx)

### 6. Keep `pointIncludeColumns` empty unless a native coordinator widget is active

This is the most important frontend-side DuckDB rule for scale.

Why:

- every included column widens the coordinator-fed point path
- filter columns should not be loaded into the render/coordinator path when the
  filter panel is closed
- default first paint should not pay for inactive widget accessors

Current implementation:

- [use-cosmograph-config.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/cosmograph/hooks/use-cosmograph-config.ts)

Current posture:

- default first paint keeps `pointIncludeColumns` empty
- timeline columns are only included when the timeline is enabled
- filter columns are only included while the filters panel is actually open

Future note:

- if native filter/timeline widgets become the dominant bottleneck, replace them
  with fully query-driven widgets so `pointIncludeColumns` can stay empty in all
  states, not just on default first paint

### 7. Mutate membership tables, not rich point tables

Overlay and selection should be modeled as small DuckDB-local membership tables
and stable views.

Why:

- membership churn is cheap
- copied rich overlay tables are expensive
- the active set changes frequently; the source Parquet artifacts do not

Current implementation:

- [overlay-controller.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/session/overlay-controller.ts)
- [overlay.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/overlay.ts)
- [selection.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/selection.ts)

### 8. Batch widget queries and cache by the right invalidation boundary

Dataset-level info queries should be cached per `overlayRevision` and scoped
queries should batch compatible widgets together.

Why:

- info panels otherwise devolve into repeated per-widget fanout
- overlay changes should invalidate dataset caches
- selection/scope changes should not flush more than necessary

Current implementation:

- [info-queries.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/session/info-queries.ts)
- [use-info-widget-data.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/components/explore/info-panel/use-info-widget-data.ts)

### 9. Reuse prepared statements for hot parameterized paths

Do not prepare and close statements on every repeated parameterized read/write.

Why:

- repeated small parameterized queries are common in the graph runtime
- prepared statement reuse reduces churn on the hot path

Current implementation:

- [core.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/queries/core.ts)

### 10. Evict failed cache entries

Never leave rejected promises pinned in long-lived session caches.

Why:

- a transient failure should not poison the entire session
- retries should re-execute, not replay a stale rejection

Current implementation:

- [query-controller.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/session/query-controller.ts)

### 11. Keep scalar invalidation in React, row membership in DuckDB

React/Zustand should hold revision counters and small scalar signals, not the
full active or selected row set.

Why:

- JavaScript mirrors are the wrong place for large membership state
- DuckDB and Cosmograph already own the canonical local working set

Current implementation:

- [living-graph.md](./../design/living-graph.md)
- [selection-slice.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/stores/slices/selection-slice.ts)
- [use-points-filtered.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/cosmograph/hooks/use-points-filtered.ts)

### 12. Attach optional tables lazily

`paper_documents`, `cluster_exemplars`, `universe_points`, and `universe_links`
should attach only when the active interaction path needs them.

Why:

- first paint should not pay for optional detail surfaces
- many interactions never need those artifacts

Current implementation:

- [register-all.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/views/register-all.ts)

---

## What “Scale” Means Here

For SoleMD.Graph, “scale” has three different meanings:

1. Global corpus scale.
   This can reach tens or hundreds of millions of papers or nodes.
2. Browser-attached universe scale.
   This must remain a bounded mapped working set.
3. Active canvas scale.
   This is the visible and queryable subset the user is actually interacting
   with right now.

The system only stays fast if those three are kept separate.

The wrong model is:

- “100M nodes exist globally, so the browser should load 100M node rows”

The right model is:

- “100M nodes may exist globally, but the browser receives a bounded base
  scaffold, promotes overlays on demand, and delegates heavy retrieval to the
  backend”

That is the architecture described in:

- [living-graph.md](./../design/living-graph.md)
- [database.md](./database.md)
- [rag.md](./rag.md)

---

## Current Review Result

The DuckDB methodology is fundamentally correct for the current Cosmograph
architecture:

- single hot connection
- worker offload
- Parquet-backed narrow projection views
- overlay/selection as DuckDB membership state
- query/render path split
- prepared statement reuse
- lazy optional attachments
- batched info-panel queries

The main corrective action from this review was tightening `pointIncludeColumns`
so inactive filter accessors do not widen default first paint.

Remaining strategic caution:

- the graph can scale to a much larger global corpus only if the browser-local
  working set remains bounded
- if native coordinator widgets require too many point columns for advanced
  UX, they should be replaced with query-driven widgets rather than broadening
  the render/coordinator path indefinitely
- self-hosting DuckDB-Wasm assets is worth considering later for release
  reliability, but it is not required to keep the current query methodology
  correct

---

## Review Checklist

When changing DuckDB code, verify all of the following:

- one session, one hot connection
- worker-backed Wasm, not main-thread SQL
- no new rich point hydration path on first paint
- render path still narrower than query path
- no copied rich overlay tables
- no repeated prepare/close churn
- no rejected-promise cache poisoning
- widget queries batch by kind and invalidate by revision
- optional tables attach lazily
- new scale claims do not imply browser-attaching the full global corpus
