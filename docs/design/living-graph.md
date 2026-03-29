# The Living Graph - Base, Universe, Active Canvas

> The graph is not trying to show everything at first paint. It is trying to
> open with a domain-rich base scaffold, then let the rest of the mapped
> universe flow in on demand.

The intended operating model is simple:

- `base_points` is the curated opening canvas
- `universe_points` is the mapped remainder
- `overlay_points` is the currently promoted subset from the universe
- `active_points` is the live canvas table
- `evidence_api` serves the heavy retrieval path

The current graph runtime is intentionally **corpus-only**. There is one
canonical graph layer in the browser today: the corpus paper map. Future
layers may exist, but they must arrive as optional modules rather than as
cross-cutting branches through the base graph runtime.

This narrowing is not just cleanup. It is the reason speed, responsiveness,
and overall runtime predictability are improving. We are intentionally
stabilizing this foundation before expanding the feature surface above it.

The target base size should be large enough to preserve organ-system overlap,
but still small enough to remain stable and fast in the browser. The exact
count is a policy decision, not a runtime invariant.

---

## Three Nested Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│  DOMAIN CORPUS                                                        │
│  Full mapped paper universe: paper metadata, PubTator evidence,       │
│  and retrieval substrate.                                             │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  BASE POINTS                                                 │   │
│  │  Curated first-paint scaffold.                               │   │
│  │  High-quality papers admitted through rule evidence,         │   │
│  │  flagship journals, or narrow vocab anchors.                 │   │
│  │                                                               │   │
│  │  ┌───────────────────────────────────────────────────────┐   │   │
│  │  │  ACTIVE CANVAS                                        │   │   │
│  │  │  Base + promoted overlay in one dense table.         │   │   │
│  │  │  DuckDB-local views keep ids stable and links dense.  │   │   │
│  │  └───────────────────────────────────────────────────────┘   │   │
│  │                                                               │   │
│  │  + OVERLAY POINTS                                             │   │
│  │    Mapped papers promoted from the universe for the current   │   │
│  │    user focus.                                                │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  + EVIDENCE API                                                       │
│    Backend retrieval for raw citation neighborhoods and verbose payloads │
└───────────────────────────────────────────────────────────────────────┘
```

---

## What Base Is For

Base points are the papers that should be available immediately when the graph
opens. They are not a synonym for "everything we know".

Base admission should favor:

- rule-backed papers with curated entity or relation support
- flagship journals that reliably carry core neuro / psych work
- narrow vocab-anchored overlap that preserves breadth across medicine
- strong bench, translational, and clinical representation across the domain

That means the opening scaffold should cover:

- neurology
- psychiatry
- neuropsychiatry
- neuroscience
- psychology
- neuropsychology
- high-quality overlap across the rest of medicine

The point is not to maximize recall inside base. The point is to make sure the
base is representative, high-quality, and broad enough that a user can start
working without immediately promoting half the universe.

---

## How the Graph Responds

| User action | Graph response |
|-------------|----------------|
| Filter by year / journal / cluster | Cosmograph updates against local DuckDB views |
| Search for a paper or concept | DuckDB resolves the seed and promotes a local neighborhood when appropriate |
| Click a point | Persistent selection stays separate from active visibility |
| Open a detail panel | Universe-local document/exemplar tables attach if needed |
| Ask for evidence | `evidence_api` handles heavy retrieval and full citation context |

The browser should keep the camera fixed while the active set changes. Users
should feel like they are expanding a stable map, not jumping between maps.

---

## Two Embedding Spaces

| Embedding | Model | Purpose | Scope |
|-----------|-------|---------|-------|
| SPECTER2 | Pre-computed by Semantic Scholar | Layout, cluster structure, paper-paper proximity | Mapped universe and base |
| MedCPT | Self-embedded | Search, RAG, autocomplete, retrieval | Full corpus and evidence |

Why two?

- SPECTER2 is good for map geometry and citation-aware clustering
- MedCPT is good for query-document retrieval
- mixing those responsibilities would weaken both

---

## Canonical Runtime Pattern

The browser runtime now follows this sequence:

1. Boot `base_points` locally.
2. Project `base_points` into narrow DuckDB canvas/query views without copying the
   full base scaffold into a temp table.
3. Attach `universe_points` only when the bundle needs richer local detail or overlay promotion.
4. Promote a subset by mutating DuckDB-local overlay membership tables.
5. Expose `active_points` as a dense union view of base plus overlay.
6. Remap links through `active_links_web` and `active_paper_links_web`.
7. Keep the camera fixed while the canvas changes.
8. Use `evidence_api` for payloads that are too heavy for the bundle.

Implementation detail:

- `base_points_canvas_web` and `universe_points_canvas_web` stay Parquet-backed
  projection views
- point parquet stays narrow: ids, coordinates, cluster/color columns, compact
  bibliographic fields, compact summary metrics, and first-paint filter/search
  fields only
- `current_points_canvas_web` is the render-facing alias for Cosmograph;
  `current_points_web` is the query-facing alias for search, table, and widget
  aggregation
- `pointIncludeColumns` stays empty on the live graph page; filters, timeline,
  search, table, selection, and info widgets query `current_points_web` /
  `current_paper_points_web` directly through DuckDB instead of hydrating rich
  point metadata through Cosmograph
- `selected_point_indices` is materialized from Cosmograph selection clauses in
  DuckDB; selection should not be mirrored back into SQL through huge
  placeholder lists
- React should only mirror scalar invalidation state for selection/scope; the
  selected row set itself remains in DuckDB
- `overlay_point_ids_by_producer -> overlay_point_ids -> active_point_index_lookup_web`
- `active_points_canvas_web` / `active_points_web` are the browser-facing dense
  base-plus-overlay views
- overlay point rows stay view-backed from `universe_points`; the runtime keeps
  mutable id membership locally, not a copied rich overlay point table
- `current_points_canvas_web` / `current_points_web` / `current_paper_points_web`
  are the stable active aliases that all non-canvas DuckDB queries should use
- `active_links_web` and `active_paper_links_web` follow active ids, not a static export cohort
- info-panel scope changes batch widget summaries in DuckDB and reuse shared
  categorical results across compatible widgets
- search results carry a narrow point shell so search-select does not need a
  second point-resolution query before opening the detail panel

This is the clean boundary: base and universe are data, active is runtime state,
evidence is a service.

---

## Layer Modularity Contract

The graph runtime must not be designed around permanently entangled layers.

Current rule:

- the shipping runtime has one canonical graph layer: `corpus`
- Cosmograph and DuckDB should only boot the corpus canvas path
- there should be no paper/chunk/geo mode switching in the base runtime
- no new layer should widen the core canvas/query contract until the corpus
  runtime foundation is demonstrably stable and fast

If a future layer is added, it must be self-contained:

- its own bundle artifacts or API payloads
- its own DuckDB registration and query module
- its own canvas adapter, if it even renders on the graph canvas
- its own UI entry points and controls
- its own enable/disable switch

And just as important, it must be removable:

- disabling a future layer must not require editing corpus queries
- disabling a future layer must not change corpus view names
- disabling a future layer must not leave dead branches in the base store,
  canvas config, or bundle bootstrap path

The design target is additive modules, not shared branching logic.

---

## Base Admission Policy

The simplified admission model is:

`base = rule evidence OR flagship journal OR narrow vocab anchor`

That is the whole policy shape. Everything else is secondary to the goal of
producing a strong opening scaffold.

Practical implications:

- `entity_rule` and `relation_rule` define rule evidence
- `journal_rule` and `base_journal_family` define curated journal metadata
- `paper_evidence_summary` is the durable per-paper stage that base admission reuses
- `graph_points.is_in_base` records the final admission decision
- `graph_points.base_rank` orders base points for export and QA
- graph-build layout state is checkpointed per run on disk so failed runs resume
  from PCA / kNN / coordinates artifacts instead of restarting the whole build

This is deliberately simpler than the old visibility-lane approach because the
runtime no longer needs the base to double as the entire expansion policy.

---

## Target Composition

A good base is not just neurology and psychiatry. It should also carry the
right amount of overlap from the rest of medicine.

The current target composition is:

- strong rule-backed backbone across neuro / psych
- flagship journals that preserve foundational neurology, psychiatry, and neuroscience
- explicit organ-system coverage where neuro / psych concepts show up in clinical medicine
- a small vocab-anchor slice that preserves real overlap without letting venue-only tails flood first paint

The useful mental model is:

- `base_points` is curated, not exhaustive
- `universe_points` is comprehensive for the mapped corpus
- `overlay_points` is the user-driven expansion surface

---

## Implementation Pattern: DuckDB Bundle

The canonical bundle is:

- `base_points.parquet`
- `base_clusters.parquet`
- `universe_points.parquet`
- `paper_documents.parquet`
- `cluster_exemplars.parquet`

DuckDB keeps those artifacts local and queryable without hydrating a giant JS
array. Cosmograph reads the dense active canvas views, not raw application
objects.

The important property is that base and universe are produced from the same
mapped coordinate system. Overlay promotion should not change the manifold or
reset spatial memory.

The same principle now applies to the offline build:

- one shared PCA-space kNN graph feeds both UMAP and Leiden
- `paper_evidence_summary` is the database-side reusable evidence stage
- `graph/tmp/graph_build/<graph_run_id>/` is the filesystem-side layout stage
- publish/export is a later step, not the place where raw evidence or neighbor
  graphs are recomputed

---

## What This Replaces

The new model replaces the older lane-based first-paint policy.

Those terms belonged to a system where the opening canvas had to carry too much
policy logic. In the new architecture:

- base admission is explicit
- universe is preserved
- overlay promotion is runtime state
- evidence stays backend-driven until needed

That is the clean separation the graph needs.
