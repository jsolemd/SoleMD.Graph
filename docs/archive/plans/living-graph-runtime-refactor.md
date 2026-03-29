# Living Graph Runtime Refactor

> Superseded by [living-graph-active-universe-plan.md](living-graph-active-universe-plan.md).
> Keep this file only as transition history.

Status: in progress

Owner: Codex

Last updated: 2026-03-28

## Goal

Refactor SoleMD.Graph around a DuckDB-first living-graph runtime that keeps the
browser on a small, stable active canvas while allowing a much larger premapped
universe to feed overlays without JS hydration.

This plan replaces the current mental model of:

- `default-visible` baseline
- `renderable` reservoir
- warm detail metadata

with a cleaner runtime model:

- `base_points`: stable opening scaffold shown immediately
- `universe_points`: full premapped coordinate universe, not active by default
- `overlay_points`: currently activated subset from the universe
- `active_points`: `base_points + overlay_points`, the actual Cosmograph canvas
- `evidence_api`: cold/backend retrieval for heavy or unmapped evidence

## Non-Negotiable Constraints

1. No full chunk/paper JS hydration for the canvas.
2. Cosmograph must read DuckDB table names directly.
3. Active canvas updates must not remount the graph or reset the camera.
4. Active canvas indices must remain Cosmograph-compatible.
5. Heavy evidence stays cold and API-backed by default.
6. Filters and info summaries must stay SQL-first wherever possible.

## External Best Practices

- Cosmograph:
  - pre-indexed points/links
  - stable unique IDs
  - sequential point indices for the active dataset
  - external DuckDB connection/table names instead of React arrays
- DuckDB:
  - Parquet projection/filter pushdown
  - large scopes stay as SQL predicates, not JS index lists
  - row-group sizing and file layout chosen intentionally for query patterns
  - remote `ATTACH` is viable for some read-only metadata surfaces

## Target Runtime

### Browser-local

- `base_points`
- `base_clusters`
- `overlay_points_local` (initially empty temp/local table)
- `active_points` view
- `active_links` view

### Remote or lazily attached

- `universe_points`
- optional warm metadata tables:
  - documents
  - cluster exemplars
  - compact aggregated links if earned

### Backend/API

- evidence retrieval
- cold detail
- full-text/RAG
- citation neighborhoods
- any aggregate/query not worth shipping locally

## Naming Decisions

User-facing:

- Base
- Overlay
- Evidence

System-facing:

- `base_points`
- `base_clusters`
- `universe_points`
- `overlay_points_local`
- `active_points`
- `active_links`
- `evidence_api`

Deprecated terms to clean up:

- `default-visible` as the main product/runtime term
- `reservoir_points`
- `renderable cohort` as the main frontend runtime term

Allowed short-term compatibility:

- internal graph-db policy columns can stay as-is temporarily if they only feed
  `base_points` membership and do not leak into the new frontend contract

## Implementation Strategy

### Phase 1: Canonical Plan + Docs

- [ ] Replace docs that still describe the browser owning the full renderable cohort
- [ ] Document `base / universe / overlay / evidence`
- [ ] Explicitly state that the browser renders `active_points`, not `universe_points`
- [ ] Document that warm overlays are activated in place, not via graph remount

### Phase 2: Export Contract

- [ ] Rename hot point artifact from `corpus_points` to `base_points`
- [ ] Rename warm mapped artifact from `reservoir_points` to `universe_points`
- [ ] Keep `base_clusters` hot
- [ ] Ensure `universe_points` carries compact point fields only
- [ ] Keep heavy detail out of point artifacts
- [ ] Tune Parquet output settings:
  - [ ] choose row group size intentionally
  - [ ] ensure enough row groups/file for expected parallelism
  - [ ] sort/write to help pruning for likely predicates

### Phase 3: DuckDB Session Model

- [ ] Bootstrap only:
  - [ ] `base_points`
  - [ ] `base_clusters`
- [ ] Create empty local overlay tables
- [ ] Create `active_points` as base + overlay
- [ ] Create `active_links` aligned to active point indices
- [ ] Keep current scope as SQL where possible
- [ ] Avoid passing large point-index arrays unless unavoidable

### Phase 4: Cosmograph Runtime

- [ ] Point Cosmograph at `active_points`
- [ ] Keep camera stable on overlay updates
- [ ] Avoid fit/reset on overlay activation
- [ ] Enable position-preserving updates
- [ ] Remove remaining chunk/paper JS helper dependencies where possible
- [ ] Shrink `pointIncludeColumns` to the minimum needed for:
  - [ ] styling
  - [ ] filters/timeline
  - [ ] immediate selection UX

### Phase 5: Overlay Activation Primitives

- [ ] Support promoting rows from `universe_points` into `overlay_points_local`
- [ ] Support clearing/replacing overlay rows without remounting
- [ ] Keep active point indices dense and consistent for the current active set
- [ ] Define overlay lifecycle primitives even if triggers remain future:
  - [ ] activate by ids
  - [ ] activate by SQL predicate
  - [ ] clear overlay

### Phase 6: Cold Evidence Boundary

- [ ] Keep paper content/RAG/full evidence off the active canvas path
- [ ] Route heavy detail through backend/API
- [ ] Keep warm local metadata limited and queryable

## Key Open Questions

1. Do we want `universe_points` to contain the full premapped 14M at v1, or a
   smaller premapped universe with later transform/project support?
2. Do we want overlay links in v1, or overlay points first and links second?
3. Which info-panel statistics must be local-active only vs backend-universe?
4. Do we keep current graph-db policy tables and simply export `base_points`,
   or do we rename policy surfaces upstream now too?

## Initial Delivery Scope

For this refactor, "done" means:

- docs and contract aligned to `base / universe / overlay / evidence`
- export/runtime naming updated
- browser boots from `base_points`
- `active_points` exists and is the actual Cosmograph source
- no full chunk/paper JS hydration for the canvas
- point/include/query surfaces trimmed
- overlay activation primitives exist, even if product triggers come later

It does **not** require final trigger logic for:

- semantic/RAG expansion
- relation/entity expansion
- write-mode living graph behaviors

Those can build on top of this runtime once the substrate is correct.
