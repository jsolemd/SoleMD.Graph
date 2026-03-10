# SoleMD.Web Architecture

This document describes the current runtime, not the historical marketing or education prototypes in `archive/`.

For query-driven navigation such as "where is Mantine wired?", "which files are `use client`?", or "where is Framer Motion used?", see [code-search-map.md](code-search-map.md).

## Runtime Summary

The active app is a single-route graph dashboard:

- `app/page.tsx` is the root page.
- `app/layout.tsx` provides metadata, viewport, fonts, Mantine styles, and the theme provider.
- `lib/graph/fetch.ts` resolves the active graph bundle from `solemd.graph_runs`.
- `app/api/graph-bundles/[checksum]/[asset]/route.ts` serves the active or historical bundle assets over same-origin HTTP.
- `lib/graph/use-graph-bundle.ts` loads the selected bundle in the browser.
- `lib/graph/duckdb.ts` mounts the bundle into DuckDB-Wasm, exposes query helpers, and hands Cosmograph an external DuckDB connection plus the prepared points table.
- `components/graph/DashboardShell.tsx` is the client-side orchestration layer.
- `components/graph/CosmographRenderer.tsx` is the WebGL-heavy renderer loaded through `next/dynamic(..., { ssr: false })`.

There is one active route today, but the UI is multi-mode. Mode behavior is driven by `lib/graph/modes.ts`.

## Active Vs. Historical

- Active runtime:
  `app/`, `components/`, `lib/`, `public/`, `proxy.ts`, `next.config.ts`
- Supporting documentation:
  `docs/`
- Historical or exploratory work:
  `archive/`

Search and architecture work should prefer the active runtime directories before `archive/`.

## Next.js Entry Points

### `app/layout.tsx`

- Server component
- Imports `@mantine/core/styles.css`
- Imports `app/globals.css`
- Declares `metadata` and `viewport`
- Wraps the app with `MantineThemeProvider`
- Adds `ColorSchemeScript`

### `app/page.tsx`

- Server component
- Exports `dynamic = "force-dynamic"`
- Calls `fetchActiveGraphBundle()`
- Renders `GraphErrorBoundary` and `DashboardShell`

### `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx`

- Route-level loading, error, and 404 UI
- `app/error.tsx` is a client component because it handles reset behavior

## Client / Server Boundary

### Server-oriented files

- `app/layout.tsx`
- `app/page.tsx`
- `lib/graph/fetch.ts`
- `app/api/graph-bundles/[checksum]/[asset]/route.ts`
- `lib/supabase/server.ts`
- `proxy.ts`

Notable server markers:

- `lib/graph/fetch.ts` imports `server-only`
- `lib/graph/fetch.ts` reads the active `graph_runs.is_current` row uncached so a page refresh can pick up a newly current graph bundle immediately
- checksum-addressed historical bundle lookups still use `unstable_cache(...)` because those assets are immutable
- `app/api/graph-bundles/[checksum]/[asset]/route.ts` resolves checksum-scoped bundle files from disk and serves them with immutable caching headers
- `lib/supabase/server.ts` creates a privileged Supabase client from env vars
- `app/page.tsx` exports `dynamic = "force-dynamic"`

### Client-oriented files

Client components are marked with `use client` and are concentrated in:

- `components/mantine-theme-provider.tsx`
- `components/ui/theme-toggle.tsx`
- `components/graph/*.tsx`
- `components/graph/explore/*.tsx`
- `app/error.tsx`

Notable client boundary:

- `components/graph/GraphCanvas.tsx` uses `next/dynamic(...)` with `ssr: false`
  to load `CosmographRenderer` only on the client.

## Data Flow

```text
Supabase graph_runs control plane
  -> lib/supabase/server.ts
  -> lib/graph/fetch.ts
  -> app/page.tsx
  -> bundle metadata (checksum, manifest, same-origin URLs)
  -> components/graph/DashboardShell.tsx
  -> app/api/graph-bundles/[checksum]/[asset]/route.ts
  -> lib/graph/use-graph-bundle.ts
  -> lib/graph/duckdb.ts
  -> DuckDB-Wasm session
  -> graph_points_web view + local detail queries
  -> lib/graph/transform.ts
  -> components/graph/GraphCanvas.tsx
  -> components/graph/CosmographRenderer.tsx
```

The server fetch layer currently queries:

- `solemd.graph_runs` for the current completed bundle
- bundle metadata such as checksum, URI, manifest, QA summary, and bundle version

`bundle_manifest` is an inventory and schema surface, not the heavy graph payload.
The graph data itself comes from the served `graph.duckdb` file when DuckDB-Wasm
can attach it directly, with Parquet sidecars used as the fallback table source.

The server does **not** query `graph_points_current`, `graph_clusters_current`, or `graph_cluster_exemplars_current`. Those current-view surfaces are legacy/transitional and are not part of the active Web contract.

The browser bundle layer then loads:

- the DuckDB bundle file over the same-origin `/api/graph-bundles/[checksum]/[asset]` route
- Parquet assets as fallback inputs if direct DuckDB attach is unavailable
- local bundle tables such as `graph_points`, `graph_clusters`, `graph_cluster_exemplars`, `graph_papers`, `graph_chunk_details`, and `graph_facets`

`lib/graph/duckdb.ts` prepares a `graph_points_web` view in DuckDB with the field names Cosmograph expects, then:

- `components/graph/CosmographRenderer.tsx` passes that table name plus the external DuckDB connection into Cosmograph
- `lib/graph/transform.ts` normalizes local query rows into `GraphData` for the table, panels, and stats
- `components/graph/DetailPanel.tsx` resolves chunk, paper, cluster, and exemplar detail from local DuckDB queries against bundle tables
- `components/graph/explore/FiltersPanel.tsx` surfaces the precomputed `graph_facets` buckets while Cosmograph applies the live local selections against the loaded bundle tables

## State Architecture

The app uses two active Zustand stores:

### `lib/graph/stores/graph-store.ts`

Shared interaction state:

- `mode`
- `selectedNode`
- `hoveredNode`

### `lib/graph/stores/dashboard-store.ts`

Dashboard state:

- active panel
- table visibility and height
- point color / size / label configuration
- filter selection
- timeline state
- legend visibility
- selected and filtered point indices

The barrel file is `lib/graph/stores/index.ts`.

## Styling Architecture

### `app/globals.css`

This is the primary styling entry point for the app:

- Tailwind CSS 4 theme and utility imports
- `@theme` tokens
- semantic CSS custom properties in `:root`
- dark-mode overrides in `.dark`
- graph-specific variables
- Cosmograph UI variable overrides

### `lib/mantine-theme.ts`

This is the Mantine bridge:

- `createTheme(...)`
- brand and neutral color tuples
- shared component defaults
- radius and shadow defaults that point back to CSS variables

### `components/mantine-theme-provider.tsx`

This is the runtime theme seam:

- wraps the app in `MantineProvider`
- reads Mantine color scheme
- syncs `.dark` on `<html>` for CSS-variable cascading

### `postcss.config.mjs`

PostCSS wiring for:

- `postcss-preset-mantine`
- `postcss-simple-vars`
- `@tailwindcss/postcss`

## Motion, UI, And Interaction Libraries

### Mantine

Mantine is used for:

- theme provider and color scheme
- panels and controls
- error / not-found UI
- forms and toggles

Primary entry points:

- `components/mantine-theme-provider.tsx`
- `lib/mantine-theme.ts`
- `components/ui/theme-toggle.tsx`
- `components/graph/explore/*.tsx`

### Framer Motion

Framer Motion is used in:

- `components/ui/theme-toggle.tsx`
- `components/graph/DashboardShell.tsx`
- `components/graph/PanelShell.tsx`
- `components/graph/PromptBox.tsx`
- `components/graph/explore/CanvasControls.tsx`
- `components/graph/explore/DataTable.tsx`
- `components/graph/explore/LeftToolbar.tsx`

### Cosmograph

Cosmograph is centered in:

- `components/graph/DashboardShell.tsx`
- `components/graph/GraphCanvas.tsx`
- `components/graph/CosmographRenderer.tsx`

The current renderer follows Cosmograph's intended external-DuckDB path:

- `duckDBConnection={{ duckdb, connection }}`
- `points="graph_points_web"`
- `pointIdBy="id"`
- `pointIndexBy="index"`
- `pointXBy="x"`
- `pointYBy="y"`
- `enableSimulation={false}`

This keeps the point cloud inside DuckDB-Wasm rather than duplicating it into another client-side dataset just for the canvas.

## Assets

Static assets live in `public/`.

Current files:

- `public/jon-sole-photo.webp`
- `public/placeholder-logo.png`
- `public/placeholder-logo.svg`
- `public/placeholder-user.jpg`
- `public/placeholder.jpg`

At the moment, the active runtime in `app/`, `components/`, and `lib/` does not import these assets directly. Search results that surface them should be interpreted as available static files, not current runtime dependencies.

## Config Surface

- `package.json`: dependency and script map
- `next.config.ts`: `optimizePackageImports` and image formats
- `proxy.ts`: security headers and CSP report-only policy
- `lib/graph/fetch.ts`: server-side `graph_runs` lookup and bundle path validation
- `app/api/graph-bundles/[checksum]/[asset]/route.ts`: immutable checksum-scoped bundle serving with range support
- `lib/graph/use-graph-bundle.ts`: client-side bundle hydration
- `lib/graph/duckdb.ts`: DuckDB-Wasm loading, bundle attach/fallback, Cosmograph table prep, and local query execution

## Search-Oriented Summary

If you need a fast answer:

- "Where is Mantine set up?" -> `app/layout.tsx`, `components/mantine-theme-provider.tsx`, `lib/mantine-theme.ts`
- "Where is Tailwind set up?" -> `app/globals.css`, `postcss.config.mjs`
- "Which files are client-only?" -> `components/graph/**`, `components/ui/theme-toggle.tsx`, `components/mantine-theme-provider.tsx`, `app/error.tsx`
- "Which files are server-only?" -> `lib/graph/fetch.ts`, `lib/supabase/server.ts`, `app/page.tsx`, `app/layout.tsx`
- "Where is Framer Motion?" -> `components/ui/theme-toggle.tsx`, `components/graph/**`
- "Where is the server bundle fetch?" -> `lib/graph/fetch.ts`
- "Where is the client bundle load?" -> `lib/graph/use-graph-bundle.ts`, `lib/graph/duckdb.ts`
- "Where is WebGL dynamically loaded?" -> `components/graph/GraphCanvas.tsx`
