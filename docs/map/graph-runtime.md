# Graph Runtime

> How the browser renders the bundle into a live graph.

The graph runtime is the browser-side system that takes a published Parquet
bundle, loads it through DuckDB-WASM, and hands narrow views to Cosmograph for
GPU rendering. It also owns local filter, search, selection, overlay, and
info-panel state.

Three things the runtime does NOT own:
- global corpus scale (PostgreSQL backend owns that)
- warehouse retrieval / evidence payloads (RAG backend owns that -- see
  [`rag.md`](rag.md))
- the engine-side bundle build (see [`graph-build.md`](graph-build.md))

See also: [`architecture.md`](architecture.md) for the Cosmograph adapter
boundary and [`database.md`](database.md) for the server-side tables that feed
the bundle.

---

## External to browser flow

```
   EXTERNAL SOURCES          POSTGRES (port 5433)         BUNDLE PUBLISH
   ----------------          --------------------         --------------
                                                           base_points.parquet
   PubTator3 (NCBI)   -->    pubtator.entity_annotations   base_clusters.parquet
   Semantic Scholar   -->    pubtator.relations            universe_points.parquet
                             solemd.papers                 paper_documents.parquet
                             solemd.paper_*                cluster_exemplars.parquet
                             solemd.graph_runs                    |
                             solemd.graph_points                  v
                             solemd.graph_base_points     +----------------+
                             solemd.graph_clusters        |  R2 / static    |
                                                           |  host (HTTP)    |
                                                           +--------+-------+
                                                                    |
                                                                    v
                                       +----------------------------+
                                       |    BROWSER                 |
                                       |                            |
                                       |   Next.js shell            |
                                       |    +-- DuckDB-WASM worker  |
                                       |    |     (ephemeral)       |
                                       |    +-- Cosmograph (WebGL)  |
                                       |    +-- Zustand stores      |
                                       +----------------------------+
                                                    |
                                                    v
                                       +----------------------------+
                                       |    FASTAPI (port 8300)     |
                                       |    evidence / chat stream  |
                                       +----------------------------+
```

Browser DuckDB runs as an **ephemeral in-memory analytic session** over the
canonical Parquet artifacts. It is not a persistent database.

---

## Three nested layers

**This is the canonical home for the layer diagram.** Other docs link here.

```
+-------------------------------------------------------------------------+
|  DOMAIN CORPUS                                                          |
|  Full mapped paper universe: paper metadata, PubTator evidence,         |
|  and retrieval substrate. Lives in PostgreSQL.                          |
|                                                                         |
|  +---------------------------------------------------------------+     |
|  |  UNIVERSE POINTS                                              |     |
|  |  Engine/export-defined mapped points for one run              |     |
|  |  `universe_points.parquet` (premapped, not autoloaded)        |     |
|  |                                                               |     |
|  |  +---------------------------------------------------------+  |     |
|  |  |  BASE POINTS                                            |  |     |
|  |  |  Curated first-paint scaffold                           |  |     |
|  |  |  `base_points.parquet` + `base_clusters.parquet`        |  |     |
|  |  |  Rule-backed, flagship journals, narrow vocab anchors   |  |     |
|  |  +---------------------------------------------------------+  |     |
|  |                                                               |     |
|  |  + OVERLAY POINTS                                             |     |
|  |    Mapped papers promoted from the universe for current      |     |
|  |    user focus (RAG hits, cluster drill-in, entity neighbor). |     |
|  |                                                               |     |
|  |  + ACTIVE CANVAS                                              |     |
|  |    Base + promoted overlay in one dense table.                |     |
|  |    DuckDB-local views keep ids stable and links dense.        |     |
|  +---------------------------------------------------------------+     |
|                                                                         |
|  + EVIDENCE PATH                                                        |
|    FastAPI-served heavy retrieval: raw citation neighborhoods,          |
|    full text, asset URLs, full PubTator payloads.                       |
+-------------------------------------------------------------------------+
```

What each layer is for:

| Layer | Lives in | Loaded | Purpose |
|---|---|---|---|
| Base | `base_points.parquet` | First paint (mandatory) | Render, color, size, fast faceting, local search, paged table |
| Universe | `universe_points.parquet` | Attached on interaction | Overlay promotion from mapped remainder |
| Active | DuckDB overlay membership tables + materialized runtime tables | Immediately after base | Base + promoted overlay in one dense canvas/query runtime |
| Evidence | FastAPI endpoints | On demand | Paper detail, citation neighborhoods, full text, assets |

---

## Bundle contract

The bundle is the published artifact set. The browser reads it; the engine
writes it (see [`graph-build.md`](graph-build.md)).

### Base contract

```
base_points.parquet
base_clusters.parquet
```

Base point schema (the smallest useful typed column set):

| Category | Fields |
|---|---|
| Identity | `point_index`, `id`, `paper_id` |
| Layout | `x`, `y` |
| Cluster | `cluster_id`, `cluster_label` |
| Bibliographic | `title`, `citekey`, `journal`, `year`, `display_label` |
| Quality | `paper_author_count`, `paper_reference_count`, `paper_entity_count`, `paper_relation_count` |
| Base admission | `is_in_base`, `base_rank` |
| Compact render | `hex_color`, `hex_color_light`, `text_availability` |
| Compact evidence | `semantic_groups_csv`, `relation_categories_csv` |

**What does NOT belong in base:**

- DOI / PMID / PMCID identifiers
- Open-access booleans or asset counters
- `search_text`, stitched convenience text, full abstracts
- Full author JSON or full PubTator payloads
- Full relation or citation lists
- Any JS hydration of the whole point set

### Universe contract

```
universe_points.parquet
paper_documents.parquet     (attached lazily)
cluster_exemplars.parquet   (attached lazily)
```

- Mapped to the same UMAP manifold as the base scaffold
- Excluded from first paint until promoted
- Schema aligned with base so the runtime combines them without remapping

`cluster_exemplars.parquet` is a **paper-level preview table for cluster
context**, not a chunk graph layer.

### Active contract

Active canvas state is DuckDB-local and derived from loaded Parquet.

| View | Role |
|---|---|
| `base_points_canvas_web` | Narrow render input for base first paint |
| `universe_points_canvas_web` | Narrow render input when universe is attached |
| `current_points_canvas_web` | **The render alias Cosmograph binds to** |
| `current_points_web` | Richer query alias for filter/timeline/table/widgets |
| `current_paper_points_web` | Paper-level query alias for detail panels |
| `current_links_web` | Links alias bound to current ids |
| `overlay_point_ids_by_producer` | Mutable overlay membership by promoter source |
| `overlay_point_ids` | Derived union of producer memberships |
| `overlay_points_*_runtime` | DuckDB-local overlay runtime tables rebuilt per overlay revision |
| `overlay_points_web` | Overlay query alias over the materialized runtime |
| `active_point_index_lookup_web` | Remaps ids to dense active indices |
| `active_points_web` | Thin active alias over base + materialized overlay runtime |
| `selected_point_indices` | Materialized from live Cosmograph selection clauses |

**Hard rules:**

- Render path binds directly to `current_points_canvas_web` + `current_links_web`
- `pointIncludeColumns` stays empty on the live graph page
- When overlay is empty, the active alias points straight at base -- no
  synthetic active union is built
- React/Zustand holds only scalar invalidation signals (`selectedPointCount`,
  `currentScopeRevision`, `currentPointScopeSql`), never the full active set
- Overlay mutates **producer membership tables**, then rebuilds the overlay/runtime
  tables once per overlay revision inside DuckDB

### Evidence contract

Evidence is fetched only on demand through FastAPI. It is release-scoped -- the
frontend must not invent release metadata or bypass the backend when a user is
working inside a specific published graph release.

Evidence includes: raw paper-paper citation neighborhoods, full text from
`s2orc_v2`, chunk-level bodies, PDF mirrors, full PubTator annotation and
relation lists, large citation-context payloads.

---

## DuckDB-WASM runtime rules

The 12 operating rules for the browser analytical runtime. Every rule is
enforced today; breaking any of them is a regression.

| # | Rule | Why | Where it lives |
|---|---|---|---|
| 1 | One hot connection per session | Metadata/cache reuse; DuckDB's fast path | `features/graph/duckdb/connection.ts` |
| 2 | Run DuckDB off the main thread | Keeps pointer/render responsive | `features/graph/duckdb/connection.ts` |
| 3 | Assume single-threaded Wasm | COI bundles don't ship today | `maximumThreads = 1` |
| 4 | Parquet through narrow projection views | Pushdown + statistics; no full hydration | `features/graph/duckdb/views/register-all.ts` |
| 5 | Render path narrower than query path | Cosmograph gets minimum shape; widgets query richer | `features/graph/duckdb/canvas.ts` |
| 6 | `pointIncludeColumns` empty unless a native widget needs it | Every column widens the coordinator path | `features/graph/cosmograph/hooks/use-cosmograph-config.ts` |
| 7 | Keep producer membership as source of truth and materialize overlay runtime + active lookup once per revision | Reads stay hot without duplicating the full base dataset | `features/graph/duckdb/views/overlay.ts`, `views/active-points.ts` |
| 8 | Batch widget queries, cache by overlay revision | Info panels otherwise fan out | `features/graph/duckdb/session/info-queries.ts` |
| 9 | Reuse prepared statements for hot parameterized paths | Prepare/close churn hurts | `features/graph/duckdb/queries/core.ts` |
| 10 | Evict failed cache entries | Don't pin rejected promises | `features/graph/duckdb/session/query-controller.ts` |
| 11 | Scalar invalidation in React, row membership in DuckDB | JS mirrors are the wrong place for large membership | `features/graph/stores/slices/selection-slice.ts` |
| 12 | Attach optional tables lazily | First paint shouldn't pay for detail surfaces | `features/graph/duckdb/views/register-all.ts` |

### Why single-threaded is correct today

- DuckDB-WASM 1.32.0 has no working multi-threaded bundle
  (`getJsDelivrBundles()` excludes the COI pthread bundle)
- Mosaic queries are sequential -- the single worker processes one at a time
- `FilteringClient.setActive(false)` does not prevent queries; it only shapes them
- No configurable debounce or batch size on Mosaic's internal throttling

### What "scale" means here

| Meaning | Bound |
|---|---|
| Global corpus scale | Tens or hundreds of millions of papers (PostgreSQL + evidence API) |
| Browser-attached universe scale | Bounded mapped working set (Parquet bundle) |
| Active canvas scale | The visible/queryable subset right now (DuckDB views) |

The wrong model: "100M nodes exist globally, so the browser should load 100M
node rows." The right model: the browser receives a bounded base scaffold,
promotes overlays on demand, and delegates heavy retrieval to the backend.

### Live overlay scaling rules

- The prompt/RAG path, manual activation path, and future semantic/entity overlay
  paths all feed the same browser-side overlay contract.
- Point-only overlay mutations attach `universe_points` only. `universe_links`
  stays lazy unless the interaction actually needs links.
- Narrow row attachment is the right contract for filling holes in the locally
  attached universe. It is not the final transport for million-point overlays.
- If live graph extension needs to approach 1M-2M visible points, evolve the
  canonical overlay contract toward backend-ranked cohorts or membership payloads
  that DuckDB can join locally against `universe_points`, rather than sending all
  rich point rows through JS arrays.

---

## Crossfilter performance constraint

Cosmograph's native filter and timeline widgets use the `FilteringClient` ->
Mosaic coordinator -> DuckDB-WASM pipeline. This enables **two-way brushing**
(histogram brush filters the graph; graph selection updates the histogram),
which is one of Cosmograph's strongest UX features.

The cost: each registered `FilteringClient` fires a full-table DuckDB query
on every selection change. With N active widgets on a 1M-point graph, the
coordinator executes N sequential queries (~3-4s each on single-threaded
DuckDB-WASM 1.32.0). This is the dominant contributor to selection lag at
scale.

Mitigation levers available in app code:

- Batch React store updates into a single `requestAnimationFrame`
- Use direct `INSERT INTO ... VALUES` for `selected_point_indices` instead of
  scanning `current_points_web`
- Cache dataset-scope query results at the session level
- Defer label-mode prop changes via `useDeferredValue`

---

## How the graph responds

| User action | Graph response |
|---|---|
| Filter by year / journal / cluster | Cosmograph updates native visibility clauses; panels query the same scoped DuckDB state |
| Search for a paper or concept | DuckDB resolves a seed point, then a local visibility-budget query emphasizes a seed-centered neighborhood |
| Click a point | Persistent selection stays separate from current visibility scope |
| Ask for evidence | FastAPI evidence endpoint illuminates mapped papers, doesn't redefine base/universe contract |
| Open a detail panel | `paper_documents` / `cluster_exemplars` attach on demand if not already loaded |

The browser keeps the camera fixed while the active set changes. Users do not
get jumped around between interactions.

---

## Module map

```
features/graph/
  cosmograph/              -- Cosmograph adapter barrel (see architecture.md)
    index.ts                 barrel export -- consumer entry
    GraphShell.tsx           CosmographProvider boundary
    GraphRenderer.tsx        <Cosmograph> component with ~60 props
    hooks/                   use-graph-camera, use-graph-selection,
                             use-graph-export, use-graph-focus,
                             use-zoom-labels, use-cosmograph-config,
                             use-points-filtered
    widgets/                 TimelineWidget, FilterBarWidget,
                             FilterHistogramWidget, SelectionToolbar,
                             ColorLegends, SizeLegend
    label-appearance.ts      Canvas label styling

  duckdb/                  -- DuckDB-WASM runtime
    connection.ts            Worker-backed AsyncDuckDB + single hot connection
    canvas.ts                Render-path aliases (`*_canvas_web`)
    views/
      register-all.ts          View registration dispatcher
      base-points.ts, universe.ts, overlay.ts, selection.ts
    queries/core.ts          Prepared statement reuse
    session/
      overlay-controller.ts  Overlay membership mutation
      query-controller.ts    Cache eviction, query serialization
      info-queries.ts        Batched widget queries, dataset cache

  stores/                  -- Zustand stores (scalar invalidation state)
    slices/selection-slice.ts

  components/              -- React UI bound to DuckDB query views
    explore/...
    panels/...
```

---

_Last verified against code: 2026-04-08_
