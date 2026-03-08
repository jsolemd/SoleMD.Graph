# Phase 0 — Cosmograph Chunk Embedding Scatter

**Status**: Implemented, pending visual QA
**Date**: 2026-03-07

---

## What Was Built

Full-viewport Cosmograph canvas rendering 2,239 UMAP-projected chunk embeddings as a GPU-accelerated 2D scatter plot, colored by HDBSCAN topic cluster. Floating prompt box (UI shell only), SoleMD wordmark with theme toggle, and stats bar. Marketing pages archived to `examples/marketing/`.

---

## Architecture

### How the pieces fit together

```
┌─────────────────────────────────────────────────────────┐
│  SoleMD.App (Python pipeline)                           │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐               │
│  │ MedCPT  │→ │ UMAP 2D  │→ │ HDBSCAN  │→ Supabase DB │
│  │Embedding│  │Reduction │  │Clustering│               │
│  └─────────┘  └──────────┘  └──────────┘               │
└─────────────────────────────────────────────────────────┘
                         │
                    Supabase PostgreSQL
                    (solemd schema)
                         │
┌─────────────────────────────────────────────────────────┐
│  SoleMD.Web (Next.js 15)                                │
│                                                         │
│  Server Component ──── PostgREST ──── Supabase Kong     │
│  (app/(graph)/page.tsx)   queries     (localhost:8000)   │
│         │                                               │
│         │ serialized ChunkNode[] props (~150KB gzipped) │
│         ▼                                               │
│  Client Component                                       │
│  (CosmographRenderer.tsx)                               │
│         │                                               │
│         ▼                                               │
│  Cosmograph (npm package, runs in browser)              │
│  ├── DuckDB-WASM (indexes data → Arrow format)          │
│  ├── Apache Arrow (columnar in-memory format)           │
│  ├── WebGL (GPU scatter rendering)                      │
│  └── D3 (color scales, utilities)                       │
└─────────────────────────────────────────────────────────┘
```

### Key point: No containers for Cosmograph

Cosmograph and all its dependencies (DuckDB-WASM, Apache Arrow, D3, Mosaic) are **npm packages** installed in `node_modules/`. They run entirely in the **browser** via WebAssembly and WebGL. There is no server-side container for any of this.

The only infrastructure dependency is **Supabase PostgreSQL** (via Kong at `localhost:8000`), which the Next.js server component queries at request time.

### DuckDB-WASM build warnings

Webpack emits "Critical dependency: the request of a dependency is an expression" for DuckDB-WASM. This is because DuckDB's Node.js shim uses dynamic `require()` which webpack can't statically analyze. These warnings are:
- **Harmless** — DuckDB-WASM uses the browser WebAssembly path, not the Node.js path
- **Universal** — every project using DuckDB-WASM or Cosmograph sees them
- **Suppressible** via `webpack.IgnorePlugin` in next.config.ts (cosmetic, not done yet)

---

## Data Flow

### 1. Pipeline (SoleMD.App) — already complete

| Step | Tool | Output |
|------|------|--------|
| Embed chunks | MedCPT (768-dim) | `solemd.rag_chunk_embeddings` |
| Reduce to 2D | UMAP | x, y coordinates |
| Cluster | HDBSCAN | cluster_id, cluster_label (TF-IDF) |
| Store | Supabase | `solemd.graph_runs` + `solemd.graph_points` |

Current data: 2,239 points, 71 clusters (70 real + noise), 45 papers.

### 2. Server-side fetch (lib/graph/fetch.ts)

Three parallel PostgREST queries via `@supabase/supabase-js`:
1. `graph_points_current` — VIEW with x, y, cluster_id, cluster_label, node_id, paper_id
2. `paper_rag_chunks` — chunk_text, token_count, section_canonical, etc.
3. `papers` — title, citekey

Joined in memory via `Map<string, Record>` for O(1) lookups. The VIEW has no FK relationships to chunks/papers, so PostgREST embedded selects (`!inner`) don't work — hence the separate queries.

Stats counts (authors, terms) fetched in parallel. `vocab.terms` is in a separate schema not exposed via PostgREST — falls back to 0.

### 3. RSC serialization

`ChunkNode[]` (plain objects) serialized across the React Server Component boundary as props. ~2,239 nodes × ~200 bytes ≈ ~450KB raw → ~100-150KB gzipped.

### 4. Client-side rendering

Cosmograph `<Cosmograph>` component receives `Record<string, unknown>[]` as `points` prop. Internally:
1. DuckDB-WASM indexes the data into Apache Arrow columnar format
2. WebGL renders each point as a GPU particle at (x, y) coordinates
3. Points colored by `color` field (pre-computed from cluster palette)
4. Labels auto-distributed for top points by `tokenCount` weight

---

## Supabase Integration

### Environment

```
SUPABASE_URL=http://localhost:8000     # Kong published port (WSL2 host)
SUPABASE_SERVICE_ROLE_KEY=eyJ...       # service_role JWT
```

**Important**: Use `localhost:8000` when running Next.js on WSL2 host. Use `supabase-kong:8000` only from inside a Docker container on the `solemd-infra` network.

### Server-only guard

`lib/supabase/server.ts` imports `'server-only'` — if any Client Component accidentally imports it, the build fails with a clear error. The service_role key never reaches the browser.

### Schema access

| Schema | Access via PostgREST | Notes |
|--------|---------------------|-------|
| `solemd` | Yes (default exposed) | All graph data, chunks, papers, authors |
| `vocab` | No (permission denied) | Terms count falls back to 0 |
| `public` | Yes | Not used by Web |

---

## File Structure

### New files (12)

```
lib/
├── supabase/
│   └── server.ts                   # server-only Supabase client
├── graph/
│   ├── types.ts                    # ChunkNode, GraphData, GraphMode
│   ├── colors.ts                   # 20-color cluster palette
│   ├── store.ts                    # Zustand (mode, selection, hover)
│   └── fetch.ts                    # Server-side data fetching

components/graph/
├── GraphCanvas.tsx                 # Client wrapper: dynamic({ ssr: false })
├── CosmographRenderer.tsx          # GPU scatter rendering
├── GraphErrorBoundary.tsx          # WebGL failure handler
├── PromptBox.tsx                   # Floating prompt pill (UI shell)
├── Wordmark.tsx                    # Top-left logo + ThemeToggle
├── StatsBar.tsx                    # Bottom-right live counts
└── index.ts                        # Barrel exports
```

### Route groups

```
app/
├── (graph)/
│   ├── layout.tsx                  # Full-viewport dark container
│   ├── page.tsx                    # Server Component: fetch + render (force-dynamic)
│   └── loading.tsx                 # Suspense skeleton
├── (marketing)/
│   └── layout.tsx                  # Header + Footer wrapper
├── layout.tsx                      # Root: MantineProvider + fonts only
├── error.tsx                       # Root error boundary
└── not-found.tsx                   # Branded 404
```

### Modified files (4)

| File | Change |
|------|--------|
| `app/layout.tsx` | Stripped Header/Footer — each route group provides its own |
| `next.config.ts` | Updated optimizePackageImports (removed stale, added Cosmograph/Zustand) |
| `middleware.ts` | Added `worker-src 'self' blob:` and `'wasm-unsafe-eval'` to CSP |
| `app/globals.css` | Added `--graph-bg` token (light: #f8f9fa, dark: #0a0a0f) |

### Archived (22 files → examples/marketing/)

All marketing pages (home, about, research, education), floating card components, pill button, feature card/icon, ScrollDownLottie, scroll animation hook.

---

## Dependencies Added

| Package | Purpose | License |
|---------|---------|---------|
| `@cosmograph/react` 2.1.0 | GPU scatter rendering | CC-BY-NC-4.0 |
| `@supabase/supabase-js` | Server-side data fetching | MIT |
| `zustand` | Interaction state (mode, selection, hover) | MIT |
| `server-only` | Build-time guard against client import | MIT |

**npm note**: `--legacy-peer-deps` required. Cosmograph declares `react ^16 \| ^17 \| ^18`, we use React 19.

---

## Cosmograph API Notes

### Props passed directly

The `<Cosmograph>` React component extends `Partial<CosmographConfig>`. Data and config are passed as props — no need for the separate `prepareCosmographData()` helper.

```tsx
<Cosmograph
  points={data}               // Record<string, unknown>[]
  pointIdBy="id"
  pointXBy="x"
  pointYBy="y"
  pointColorBy="color"
  pointSizeBy="tokenCount"
  enableSimulation={false}     // Use pre-computed UMAP positions
  ...
/>
```

### Key config choices

| Prop | Value | Why |
|------|-------|-----|
| `enableSimulation` | `false` | UMAP positions are pre-computed |
| `pointSizeRange` | `[3, 10]` | Size by token_count |
| `selectPointOnClick` | `'single'` | No edges, so no connected selection |
| `showClusterLabels` | `true` | Show HDBSCAN topic labels |
| `pixelRatio` | `min(devicePixelRatio, 2)` | Cap GPU load |

---

## Known Issues

| Issue | Severity | Notes |
|-------|----------|-------|
| vocab.terms count shows 0 | Low | vocab schema not exposed via PostgREST. Fix: expose in Kong config or use direct SQL function |
| DuckDB-WASM webpack warnings | Cosmetic | Suppressible via IgnorePlugin |
| `&:hover` in Mantine `styles` prop | Low | Silently ignored in v8, fix in v9 |
| PromptBox is UI shell only | Expected | No submission logic yet (Phase 1) |

---

## Verification Checklist

- [x] `npx tsc --noEmit` — zero errors
- [x] `npm run lint` — zero errors (warnings only)
- [x] `npm run build` — passes (182 kB first load)
- [x] `npm test` — 2/2 tests pass
- [x] `curl localhost:3002` — 200 OK, SSR works
- [x] Supabase PostgREST queries return correct data
- [ ] Visual: scatter renders ~2,239 colored points (pending Chrome DevTools QA)
- [ ] Visual: cluster labels visible
- [ ] Visual: dark/light theme toggle works
- [ ] Visual: PromptBox mode toggles animate
- [ ] Visual: click point → highlight + greyout

---

## Next Steps (Phase 1)

1. **Prompt submission** — Wire PromptBox to Supabase vector search (pgvector similarity)
2. **Point click panel** — Show chunk text, paper title, section on click
3. **Semantic zoom** — Show more labels as you zoom in
4. **Marketing route** — Populate `(marketing)/` if needed, or redirect to graph
