# Living Graph Active Universe Plan

> Status: in progress
> Owner: Codex
> Scope: SoleMD.Graph only

## Goal

Replace the current `default-visible` and `reservoir` runtime framing with a
cleaner living-graph architecture centered on:

- `base_points`: stable opening scaffold shown immediately
- `universe_points`: full premapped coordinate universe, not active by default
- `overlay_points`: currently activated subset of the universe
- `active_points`: the actual canvas view = base + overlay
- `evidence_api`: backend/cold retrieval for heavy paper content and full-corpus reasoning

The browser should stay DuckDB-first and Cosmograph-native:

- pre-indexed points/links
- external DuckDB table names
- stable sequential indices for the active canvas
- minimal `pointIncludeColumns`
- no full JS hydration of chunk/paper graph rows
- backend/API for cold evidence by default

## Design Principles

1. Spatial memory is sacred.
   Keep the camera stable. Avoid remounts, avoid `fitView` on overlay changes,
   and prefer in-place data updates with preserved point positions.

2. The browser owns only the active canvas.
   The full premapped universe should not be hydrated into JS or loaded as one
   giant local active table.

3. Warm is for activation, not for payload bloat.
   Overlay candidates should be compact point/link rows. Rich paper content and
   other heavy artifacts belong in warm-on-demand detail tables or cold APIs.

4. Large scopes stay as SQL.
   Prefer DuckDB predicates and views over shipping huge point-index arrays into
   JS state when a SQL scope can express the same thing.

5. Naming must match runtime truth.
   `core / rescue / bridge` remains a policy for constructing the opening base,
   but the runtime surface should speak in terms of `base`, `universe`,
   `overlay`, `active`, and `evidence`.

## Target Runtime Model

### Browser-local

- `base_points`
  - compact first-paint scaffold
  - pre-indexed for Cosmograph
- `base_links`
  - only if they materially support the initial canvas
- `overlay_points`
  - currently activated subset of `universe_points`
- `overlay_links`
  - links among active overlay points and active scaffold nodes when needed
- `active_points`
  - dense local view used by Cosmograph
  - built from `base_points UNION ALL overlay_points`
- `active_links`
  - dense local view used by Cosmograph

### Remote/lazy

- `universe_points`
  - full premapped coordinate universe
  - queryable remotely or lazily attached
- `universe_links` / compact link summaries
  - optional; only if they materially improve overlay expansion
- warm detail tables
  - documents
  - exemplars
  - any other compact, locally useful drilldown artifacts

### Cold/backend

- `evidence_api`
  - full paper content
  - heavy metadata
  - RAG
  - semantic retrieval
  - citation neighborhoods
  - other database-heavy joins

## Key Implementation Decisions

### Active canvas updates

- prefer in-place overlay activation over full graph replacement
- preserve positions for existing ids
- avoid camera resets
- default to dimming/fading non-relevant points rather than hard refresh

### Indexing

- `active_points` must expose dense sequential indices for Cosmograph
- global universe ids remain stable identities
- overlay activation must remap selected universe rows into active local indices

### Payload trimming

Keep local active point columns only for:

- point identity
- local styling
- local search/filter widgets
- immediate selection UX

Move everything else to:

- warm detail queries, or
- cold `evidence_api`

### Parquet layout

Tune export for actual query patterns:

- sorting to help row-group skipping
- intentional row-group sizing
- enough row groups for parallelism
- compact schemas for active and overlay point tables

## Workstreams

### A. Architecture and naming cleanup

- [x] rename runtime concepts across docs and code to `base / universe / overlay / active / evidence`
- [x] remove compatibility aliases and old `corpus_*` / `graph_*` runtime shims from the live path
- [x] define how policy output (`core / rescue / bridge`) maps into `base_points`
- [x] document the separation between policy language and runtime language

### B. Bundle and export contract

- [x] replace `corpus_points` / `reservoir_points` framing with `base_points` / `universe_points` where appropriate
- [x] define active-view index semantics explicitly
- [x] keep pre-indexed active rows Cosmograph-compatible
- [x] revisit whether warm detail tables should stay Parquet-first or move to remote `.duckdb` attach

### C. DuckDB runtime

- [x] create explicit `active_points` / `active_links` views
- [x] add overlay-ready local scaffolding without JS hydration
- [x] expose native overlay membership updates through local DuckDB tables/views
- [x] keep large scopes as SQL instead of index arrays where possible
- [x] trim `pointIncludeColumns` to the minimum active surface

### D. Cosmograph integration

- [x] preserve camera and point positions on overlay updates
- [x] avoid remounting the canvas on overlay changes
- [ ] validate in-place add/remove/update path for points and links
- [ ] keep dim/fade behavior aligned with the existing visual language

### E. Cold evidence boundary

- [x] push heavy paper content and full-corpus evidence flows behind backend/API retrieval
- [x] keep local warm detail only where it clearly pays for itself
- [x] document how future RAG/living-graph triggers interact with `evidence_api`

### F. Verification and cleanup

- [x] verify startup still avoids full chunk/paper JS hydration
- [x] verify detail workflows still work with lazy warm attachments
- [ ] verify overlay activation does not reset camera
- [x] update all affected docs, contracts, and comments

## Open Questions

These do not block the structural refactor:

- exact overlay trigger taxonomy
- exact fade/dim policy versus hard subset replacement
- whether universe aggregation for info widgets should be remote DuckDB or API-backed SQL
- whether some warm metadata is better as remote read-only `.duckdb` instead of Parquet

## Verification Targets

- chunk/paper first paint uses DuckDB table names, not hydrated JS point arrays
- active canvas updates do not trigger disruptive refits
- active point indices remain dense and valid for Cosmograph
- local filters operate over `active_points`
- heavy paper evidence stays off the browser hot path
