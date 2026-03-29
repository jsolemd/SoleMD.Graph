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

The target base size is intentionally large enough to preserve organ-system
overlap, but small enough to remain stable and fast. A domain-rich base around
`1.16M` points is the current design target.

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
│  │  High-quality papers with direct evidence or curated base    │   │
│  │  journal-family membership.                                  │   │
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

- direct evidence papers
- high-quality journal families that are explicitly curated for the domain
- organ-system overlap that preserves breadth across medicine
- prestige journals and related sub-journals that reliably carry relevant work

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
2. Attach `universe_points` only when the bundle needs richer local detail.
3. Promote a subset into `overlay_points`.
4. Rebuild `active_points` as a dense union of base plus overlay.
5. Remap links through `active_links_web` and `active_paper_links_web`.
6. Keep the camera fixed while the canvas changes.
7. Use `evidence_api` for payloads that are too heavy for the bundle.

Implementation detail:

- `overlay_point_ids -> overlay_points_web -> active_points_web`
- `active_points_web` is the browser-facing dense canvas table
- `active_links_web` and `active_paper_links_web` follow active ids, not a static export cohort

This is the clean boundary: base and universe are data, active is runtime state,
evidence is a service.

---

## Base Admission Policy

The simplified admission model is:

`base = direct evidence OR curated base journal family`

That is the whole policy shape. Everything else is secondary to the goal of
producing a strong opening scaffold.

Practical implications:

- `journal_rule` and `base_journal_family` define curated journal coverage
- `entity_rule` and `relation_rule` define direct evidence coverage
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

- strong direct-evidence backbone across neuro/psych
- flagship and prestige journals that regularly publish relevant overlap
- explicit organ-system coverage where neuro/psych concepts show up in clinical
  medicine
- enough breadth that new papers can continue to fall into the base as they are
  downloaded, if they meet quality and domain requirements

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
