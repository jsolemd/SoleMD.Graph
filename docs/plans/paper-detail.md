# Paper Detail: Bundle-Backed Selection Panel

## Status

- Click detail panel: implemented
- Hover popup: follow-up

## Obsolete Plan

The earlier version of this document assumed:

- server-side joins against `graph_points_current`
- enrichment queries against `papers`, `paper_authors`, and `paper_rag_chunks`
- a dedicated `/api/detail/[chunkId]` route for chunk text and abstract

That plan is obsolete after the bundle-first graph pivot. SoleMD.Web no longer
loads graph detail from the legacy current views, and it does not rebuild chunk
detail joins through a bespoke API.

## Current Runtime

### Control Plane

`app/page.tsx` calls `fetchActiveGraphBundle()` from [lib/graph/fetch.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/fetch.ts).

That server step queries only `solemd.graph_runs` for the active completed run:

- `graph_name = 'cosmograph'`
- `node_kind = 'rag_chunk'`
- `status = 'completed'`
- `is_current = true`

It returns bundle metadata plus same-origin asset URLs under:

- `/api/graph-bundles/[checksum]/[asset]`

`bundle_manifest` is used as the browser-facing inventory for file names,
checksums, row counts, and schema. The detail payload itself still comes from
`graph.duckdb` or the Parquet sidecars inside that served bundle.

### Browser Data Path

`useGraphBundle()` in [lib/graph/use-graph-bundle.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/use-graph-bundle.ts) hydrates the bundle in the browser.

`loadGraphBundle()` in [lib/graph/duckdb.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/duckdb.ts):

1. Instantiates DuckDB-Wasm
2. Attaches `graph.duckdb` over same-origin HTTP when possible
3. Falls back to Parquet-backed views if direct attach is unavailable
4. Prepares `graph_points_web` for Cosmograph's external DuckDB mode
5. Exposes local query helpers for selection detail and facet metadata

### Cosmograph Integration

[CosmographRenderer.tsx](/home/workbench/SoleMD/SoleMD.Web/components/graph/CosmographRenderer.tsx) now uses Cosmograph's intended external-DuckDB path:

- `duckDBConnection={{ duckdb, connection }}`
- `points="graph_points_web"`
- `pointIdBy="id"`
- `pointIndexBy="index"`
- `pointXBy="x"`
- `pointYBy="y"`
- `enableSimulation={false}`

This keeps the point cloud in DuckDB-Wasm instead of copying it into a second
canvas-only dataset.

## Detail Queries

The right-side [DetailPanel.tsx](/home/workbench/SoleMD/SoleMD.Web/components/graph/DetailPanel.tsx) is driven from local DuckDB queries against bundle tables:

- `graph_chunk_details`
- `graph_papers`
- `graph_clusters`
- `graph_cluster_exemplars`

The panel does not call Supabase for point, paper, cluster, or chunk detail.

The left-side filters panel also reads precomputed buckets from `graph_facets`,
so the bundle now carries both the point cloud and the filter ledger.

### Selection Flow

1. User clicks a point on the canvas
2. `useGraphStore.selectedNode` updates
3. `DetailPanel` asks the bundle query helper for selection detail
4. DuckDB resolves the selected chunk, related paper metadata, cluster summary,
   and representative exemplars locally
5. Results are cached by chunk id for repeat access

## Data Surfaces

### Immediate Point Metadata

The point row already carries the hot metadata needed for search, filtering, and
basic badges:

- paper title
- citekey
- journal
- year
- section metadata
- token and character counts
- chunk preview
- paper aggregate counts

### On-Demand Local Detail

The detail panel resolves the heavier evidence payload only when selected:

- full chunk text
- abstract
- parsed author list
- cluster metrics
- representative passages

## File Map

- [app/page.tsx](/home/workbench/SoleMD/SoleMD.Web/app/page.tsx)
- [app/api/graph-bundles/[checksum]/[asset]/route.ts](/home/workbench/SoleMD/SoleMD.Web/app/api/graph-bundles/[checksum]/[asset]/route.ts)
- [lib/graph/fetch.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/fetch.ts)
- [lib/graph/use-graph-bundle.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/use-graph-bundle.ts)
- [lib/graph/duckdb.ts](/home/workbench/SoleMD/SoleMD.Web/lib/graph/duckdb.ts)
- [components/graph/CosmographRenderer.tsx](/home/workbench/SoleMD/SoleMD.Web/components/graph/CosmographRenderer.tsx)
- [components/graph/DetailPanel.tsx](/home/workbench/SoleMD/SoleMD.Web/components/graph/DetailPanel.tsx)

## Follow-Up

- Add a hover popup backed by the already-loaded point metadata
- Consider exposing facet-backed filters from `graph_facets` in the Explore UI
- If desired, self-host the DuckDB-Wasm worker/wasm assets instead of using the
  documented CDN bundle loader
