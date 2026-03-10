# SoleMD.Web

SoleMD.Web is currently a single-route Next.js 16 application centered on a full-screen knowledge-graph experience. The active runtime resolves the current graph bundle from `solemd.graph_runs` on the server, then mounts that bundle into DuckDB-Wasm on the client before rendering the Cosmograph shell.

## Current Runtime

- Active app surface lives in `app/`, `components/`, and `lib/`.
- The root route `/` renders the graph dashboard.
- `archive/` contains historical marketing and education prototypes. It is not part of the active runtime and should be treated as lower-priority search material unless a query explicitly mentions archive content.
- `docs/` contains product, design, and architecture notes. For search-oriented navigation, start with `docs/code-search-map.md`.

## Code Search Entry Points

- `docs/code-search-map.md`: frontend search map for `use client`, `server-only`, Mantine, Tailwind, Framer Motion, assets, routes, and stores
- `docs/architecture.md`: current runtime architecture and data flow
- `app/layout.tsx`: root layout, metadata, viewport, Mantine styles, `globals.css`, and theme provider wiring
- `app/page.tsx`: server page entry point for the graph dashboard
- `components/mantine-theme-provider.tsx`: Mantine provider plus dark-mode `.dark` sync
- `lib/mantine-theme.ts`: Mantine `createTheme(...)` bridge
- `app/globals.css`: Tailwind v4 theme tokens plus semantic CSS variables
- `lib/graph/fetch.ts`: `server-only` fetch for the active graph bundle in `solemd.graph_runs`; active-run resolution is intentionally uncached so refresh picks up a newly current graph immediately
- `lib/graph/use-graph-bundle.ts`: client hook that hydrates the bundle into `GraphData`
- `lib/graph/duckdb.ts`: DuckDB-Wasm bundle loading and query helpers
- `components/graph/GraphCanvas.tsx`: `next/dynamic(..., { ssr: false })` bridge for WebGL
- `components/graph/CosmographRenderer.tsx`: Cosmograph configuration and callbacks
- `lib/graph/stores/graph-store.ts`: shared graph interaction store
- `lib/graph/stores/dashboard-store.ts`: dashboard config, filter, legend, and table state

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Mantine 8
- Tailwind CSS 4 via `app/globals.css`
- Framer Motion
- Zustand
- Supabase
- Cosmograph

## Run

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run lint
npm run build
npm run typecheck
```

## Notes

- Styling is split intentionally:
  `app/globals.css` owns design tokens and Tailwind utility generation; Mantine uses `lib/mantine-theme.ts` for component defaults.
- Dark mode is coordinated across:
  `app/layout.tsx`, `components/mantine-theme-provider.tsx`, `components/ui/theme-toggle.tsx`, and `app/globals.css`.
- Framer Motion is concentrated in interactive overlays and panels, not spread across the whole app.
- The runtime data path is split intentionally:
  `lib/graph/fetch.ts` resolves the active bundle on the server, while `lib/graph/use-graph-bundle.ts` and `lib/graph/duckdb.ts` materialize queryable graph data in the browser.
- `bundle_manifest` is metadata only. The actual graph payload comes from the served
  `graph.duckdb` artifact or, if attach is unavailable, the bundle's Parquet sidecars.
