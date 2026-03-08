# Phase 0 — Cosmograph Scatter

**Status**: historical milestone, superseded by bundle-first delivery  
**Original date**: 2026-03-07  
**Current note**: updated 2026-03-08

## What Phase 0 Proved

Phase 0 established the core front-end shape:

- full-viewport Cosmograph canvas
- precomputed `x` / `y` embedding coordinates
- cluster-colored chunk scatter
- prompt shell, wordmark, and stats overlays
- client-only WebGL renderer behind `next/dynamic(..., { ssr: false })`

That visual foundation remains intact.

## What Changed After Phase 0

The original phase-0 implementation described a server fetch path built around:

- `graph_points_current`
- `graph_clusters_current`
- ad hoc Supabase joins for paper and chunk metadata

That is no longer the active contract.

The current SoleMD.Web graph path is:

1. Query `solemd.graph_runs` for the active completed bundle
2. Expose the bundle over same-origin checksum-scoped routes
3. Load the bundle into DuckDB-Wasm in the browser
4. Hand Cosmograph an external DuckDB connection plus the prepared points table
5. Query paper, chunk, cluster, exemplar, and facet detail locally from the bundle

## Current Runtime Architecture

```text
SoleMD.App
  -> builds graph bundle
  -> records bundle metadata on solemd.graph_runs

SoleMD.Web server
  -> queries graph_runs only
  -> serves bundle assets via /api/graph-bundles/[checksum]/[asset]

SoleMD.Web client
  -> loads graph.duckdb in DuckDB-Wasm
  -> prepares graph_points_web for Cosmograph
  -> renders precomputed coordinates
  -> resolves detail panels from local DuckDB queries
```

## Cosmograph Contract

The renderer still uses precomputed embedding coordinates and keeps simulation off:

- `pointIdBy="id"`
- `pointIndexBy="index"`
- `pointXBy="x"`
- `pointYBy="y"`
- `enableSimulation={false}`

The significant change is the data source:

- before: JS arrays populated from Supabase graph views
- now: external DuckDB connection + bundle-backed `graph_points_web`

## Legacy Notes

If you see references in old discussion to `graph_points_current` or server-side
PostgREST joins, treat them as historical implementation notes rather than the
live architecture.

The canonical graph contract is documented in:

- [graph.md](/home/workbench/SoleMD/SoleMD.Web/docs/graph.md)
- [architecture.md](/home/workbench/SoleMD/SoleMD.Web/docs/architecture.md)
