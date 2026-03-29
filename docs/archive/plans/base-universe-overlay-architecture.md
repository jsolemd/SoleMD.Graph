# Base / Universe / Overlay / Evidence Architecture

> Superseded by [living-graph-active-universe-plan.md](living-graph-active-universe-plan.md).
> Keep this file only as historical context from the transition.

Status: in progress
Owner: Codex
Last updated: 2026-03-28

## Goal

Replace the current `hot / warm / cold` and `core / rescue / bridge` framing
with a cleaner living-graph runtime built around:

- `base_points`: stable opening scaffold rendered immediately
- `universe_points`: the broader premapped coordinate universe, not active by default
- `overlay_points`: the subset promoted from the universe during interaction
- `active_points`: the actual canvas dataset, defined as `base_points + overlay_points`
- `evidence_api`: backend retrieval for heavy / cold content

This must stay DuckDB-first and Cosmograph-native:

- no full JS hydration of chunk/paper points
- pre-indexed data and stable identifiers
- local DuckDB SQL for active-scope filtering and info widgets
- backend/API for cold evidence
- no remount / no camera reset during overlay activation

## Constraints

- The browser should own a bounded active graph, not the full universe.
- The active graph must preserve spatial continuity and avoid flicker.
- The graph should remain queryable through DuckDB table/view semantics.
- Wide point tables should stay Parquet-first.
- Warm metadata may attach lazily if it meaningfully improves local UX.
- Cold content should remain backend-driven by default.

## Current Problems

- Naming drift:
  - `hot`, `warm`, `cold`
  - `core`, `rescue`, `bridge`
  - `default-visible`, `renderable`, `reservoir`
- Runtime drift:
  - no first-class `active_points` / `overlay_points` model yet
  - warm mapped reservoir exists, but live overlay activation is not implemented
- Payload drift:
  - `pointIncludeColumns` is still broader than ideal
  - some chunk/paper UI helpers still assume JS-side node access patterns

## Target Runtime Model

### Product terms

- Base
- Overlay
- Evidence

### System terms

- `base_points`
- `universe_points`
- `overlay_points`
- `active_points`
- `active_links`
- `evidence_api`

### Semantics

- `base_points`:
  - current default opening scaffold
  - stable, immediate, bounded
- `universe_points`:
  - premapped coordinate universe beyond the base
  - not active by default
- `overlay_points`:
  - promoted from the universe based on current focus
  - added/removed in place
- `active_points`:
  - local DuckDB view powering Cosmograph
  - `base_points UNION ALL overlay_points`
- `evidence_api`:
  - backend retrieval for heavy content and cold evidence

## Implementation Tracks

### 1. Contract and naming

- [ ] Rename documentation and contracts toward `base / universe / overlay / evidence`
- [ ] Decide whether `reservoir_points.parquet` becomes `universe_points.parquet`
- [ ] Decide whether current `corpus_points.parquet` becomes `base_points.parquet`
- [ ] Keep compatibility shims where needed during transition

### 2. Runtime activation

- [ ] Introduce first-class `overlay_points` / `active_points` DuckDB views
- [ ] Keep camera stable during overlay updates
- [ ] Avoid remounting Cosmograph on overlay activation
- [ ] Use stable ids and in-place updates where possible
- [ ] Preserve current baseline greyout / focus behavior

### 3. Payload minimization

- [ ] Shrink `pointIncludeColumns` to the minimum local surface
- [ ] Move richer detail fields to warm metadata or cold API paths
- [ ] Remove remaining JS-heavy chunk/paper helper paths where feasible

### 4. Query model

- [ ] Keep large scopes as SQL predicates, not JS index arrays
- [ ] Make active-scope info widgets read from `active_points`
- [ ] Define which summaries come from local DuckDB vs backend aggregation

### 5. Export and storage

- [ ] Revisit Parquet layout for `base` and `universe` query patterns
- [ ] Document row-group and sort rationale
- [ ] Evaluate remote read-only `.duckdb` attach only where it meaningfully simplifies warm metadata

### 6. Policy alignment

- [ ] Collapse current visibility framing into `base` vs `universe`
- [ ] Keep existing upstream policy stable enough to define the base scaffold
- [ ] Treat overlay activation as runtime promotion from universe, not a second visibility taxonomy

### 7. Documentation

- [ ] Update vision / architecture / map docs
- [ ] Update bundle contract docs
- [ ] Update living graph docs
- [ ] Update policy docs to align with the new naming

## Notes

- If the full 14M-paper coordinate universe is truly precomputed, then
  `universe_points` is better described as `premapped but inactive`, not
  `projected`.
- If later papers need coordinates after the universe build, that becomes a
  distinct future path:
  - `transformed` or `projected` into the existing manifold

## External Guidance

- Cosmograph:
  - external DuckDB table names
  - pre-indexed data
  - stable ids / indices
  - in-place updates without losing positions
- DuckDB:
  - Parquet projection/filter pushdown
  - row-group-aware layout
  - read-only remote attach where appropriate

## Working Decisions

- Decision: the active browser graph should remain bounded even if the coordinate
  universe grows to tens of millions of papers.
- Decision: cold evidence should default to backend/API, not browser-local delivery.
- Decision: the runtime should prioritize spatial continuity over hard refresh.
