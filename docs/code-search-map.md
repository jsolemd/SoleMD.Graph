# SoleMD.Web Code-Search Map

This document is written for search and navigation, not product vision. It is the quickest way to answer reminder-level questions about where frontend concerns live in the current codebase.

## Search Priorities

When navigating `SoleMD.Web`, prefer these directories first:

1. `app/`
2. `components/`
3. `lib/`
4. `public/`
5. `docs/`

Treat `archive/` as historical unless the query explicitly asks for archived marketing or education work.

## Current Runtime Surface

- Route entry point:
  `app/page.tsx`
- Root layout and global CSS:
  `app/layout.tsx`
- Global design tokens and Tailwind v4:
  `app/globals.css`
- Mantine provider:
  `components/mantine-theme-provider.tsx`
- Mantine theme:
  `lib/mantine-theme.ts`
- Server data fetch:
  `lib/graph/fetch.ts`
- Client bundle hydration:
  `lib/graph/use-graph-bundle.ts`
- DuckDB-Wasm graph loading:
  `lib/graph/duckdb.ts`
- Client graph shell:
  `components/graph/DashboardShell.tsx`
- WebGL dynamic import:
  `components/graph/GraphCanvas.tsx`
- Cosmograph renderer:
  `components/graph/CosmographRenderer.tsx`
- Shared graph state:
  `lib/graph/stores/graph-store.ts`
- Dashboard state:
  `lib/graph/stores/dashboard-store.ts`

## Client / Server Boundary

### Files marked with `use client`

- `app/error.tsx`
- `components/mantine-theme-provider.tsx`
- `components/ui/theme-toggle.tsx`
- `components/graph/Wordmark.tsx`
- `components/graph/PanelShell.tsx`
- `components/graph/StatsBar.tsx`
- `components/graph/PromptBox.tsx`
- `components/graph/CosmographRenderer.tsx`
- `components/graph/GraphCanvas.tsx`
- `components/graph/DashboardShell.tsx`
- `components/graph/TimelineBar.tsx`
- `components/graph/GraphErrorBoundary.tsx`
- `components/graph/explore/PointsConfig.tsx`
- `components/graph/explore/CanvasControls.tsx`
- `components/graph/explore/LeftToolbar.tsx`
- `components/graph/explore/DataTable.tsx`
- `components/graph/explore/InfoPanel.tsx`
- `components/graph/explore/FilterWidget.tsx`
- `components/graph/explore/ConfigPanel.tsx`
- `components/graph/explore/FiltersPanel.tsx`

### Server-side seams

- `app/layout.tsx`
- `app/page.tsx`
- `lib/graph/fetch.ts`
- `lib/supabase/server.ts`
- `proxy.ts`

Exact server markers worth searching:

- `server-only`
- `unstable_cache`
- `createServerClient`
- `dynamic = "force-dynamic"`
- `fetchActiveGraphBundle`

## Mantine Map

### Mantine setup

- `app/layout.tsx`: imports `@mantine/core/styles.css` and `ColorSchemeScript`
- `components/mantine-theme-provider.tsx`: `MantineProvider` plus dark-class sync
- `lib/mantine-theme.ts`: `createTheme(...)`

### Mantine-heavy UI files

- `components/ui/theme-toggle.tsx`
- `components/graph/PanelShell.tsx`
- `components/graph/PromptBox.tsx`
- `components/graph/explore/ConfigPanel.tsx`
- `components/graph/explore/DataTable.tsx`
- `components/graph/explore/FilterWidget.tsx`
- `components/graph/explore/FiltersPanel.tsx`
- `components/graph/explore/InfoPanel.tsx`
- `components/graph/explore/LeftToolbar.tsx`
- `components/graph/explore/PointsConfig.tsx`
- `app/error.tsx`
- `app/not-found.tsx`

## Tailwind / CSS Map

### Tailwind entry points

- `app/globals.css`: `@import "tailwindcss/theme.css"` and `@import "tailwindcss/utilities.css"`
- `postcss.config.mjs`: `@tailwindcss/postcss`

### CSS-variable ownership

- `app/globals.css`: `:root`, `.dark`, graph tokens, Cosmograph tokens
- `components/mantine-theme-provider.tsx`: toggles `.dark` on `<html>`
- `components/ui/theme-toggle.tsx`: user-facing color-scheme toggle

### Inline utility-class usage

Tailwind utility usage is mostly inline via `className=` in:

- `app/*.tsx`
- `components/graph/*.tsx`
- `components/graph/explore/*.tsx`
- `components/ui/theme-toggle.tsx`

## Framer Motion Map

Framer Motion imports are currently concentrated in:

- `components/ui/theme-toggle.tsx`
- `components/graph/DashboardShell.tsx`
- `components/graph/PanelShell.tsx`
- `components/graph/PromptBox.tsx`
- `components/graph/explore/CanvasControls.tsx`
- `components/graph/explore/DataTable.tsx`
- `components/graph/explore/LeftToolbar.tsx`

Search terms that should land here:

- `framer-motion`
- `motion`
- `AnimatePresence`

## Next.js Runtime Map

Search these exact terms when locating app-level behavior:

- `metadata`
- `viewport`
- `ColorSchemeScript`
- `next/font/google`
- `next/dynamic`
- `ssr: false`
- `dynamic = "force-dynamic"`
- `proxy`

Primary files:

- `app/layout.tsx`
- `app/page.tsx`
- `components/graph/GraphCanvas.tsx`
- `proxy.ts`

## Data / State Map

### Data fetch and transform

- `lib/graph/fetch.ts`
- `lib/graph/use-graph-bundle.ts`
- `lib/graph/duckdb.ts`
- `lib/graph/transform.ts`
- `lib/graph/types.ts`
- `lib/graph/columns.ts`
- `lib/graph/colors.ts`

### State

- `lib/graph/stores/graph-store.ts`
- `lib/graph/stores/dashboard-store.ts`
- `lib/graph/stores/index.ts`

### Mode registry

- `lib/graph/modes.ts`
- `lib/graph/types.ts`
- `components/graph/PromptBox.tsx`
- `components/graph/DashboardShell.tsx`

## Assets

Static assets live in `public/`:

- `public/jon-sole-photo.webp`
- `public/placeholder-logo.png`
- `public/placeholder-logo.svg`
- `public/placeholder-user.jpg`
- `public/placeholder.jpg`

The active runtime currently does not import these assets from `app/`, `components/`, or `lib/`.

## Quick Search Recipes

- "Where is Mantine configured?"
  `app/layout.tsx`, `components/mantine-theme-provider.tsx`, `lib/mantine-theme.ts`
- "Where is Tailwind configured?"
  `app/globals.css`, `postcss.config.mjs`
- "Where is dark mode controlled?"
  `components/mantine-theme-provider.tsx`, `components/ui/theme-toggle.tsx`, `app/globals.css`
- "Which files are client components?"
  search `use client`, then focus on `components/graph/**`
- "Which files are server-only?"
  `lib/graph/fetch.ts`, `lib/supabase/server.ts`, `app/page.tsx`, `app/layout.tsx`
- "Where is the active graph bundle resolved?"
  `lib/graph/fetch.ts`
- "Where is the bundle loaded in the browser?"
  `lib/graph/use-graph-bundle.ts`, `lib/graph/duckdb.ts`
- "Where is Framer Motion?"
  `components/ui/theme-toggle.tsx`, `components/graph/**`
- "Where is WebGL loaded?"
  `components/graph/GraphCanvas.tsx`, `components/graph/CosmographRenderer.tsx`
- "Where do filters, legends, and table state live?"
  `lib/graph/stores/dashboard-store.ts`
- "Where are static assets?"
  `public/`

## Anti-Confusion Notes

- `archive/` is not the active app.
- `docs/web-map.md` is a conceptual UX map, not the authoritative file map.
- The active app today is centered on the root route and graph dashboard, not the historical multi-page marketing site described in older materials.
