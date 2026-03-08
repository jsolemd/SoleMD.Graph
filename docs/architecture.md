# SoleMD.Web Architecture

## Core Concept

The knowledge graph IS the interface. A single full-viewport Cosmograph canvas
renders at all times. What changes is the mode — how you interact with the graph,
what chrome surrounds it, and what the graph highlights in response.

There are no pages. There is one canvas and four modes.

## Modes

Each mode is a lens on the same graph. The canvas never unmounts or reloads.
Mode configuration lives in `lib/graph/modes.ts` as a data-driven registry.

### Ask
Grounded RAG conversation. The prompt box is a chat interface. As the LLM
traverses the graph to answer, nodes light up in real-time showing the
evidence path. Citations in responses are clickable — they zoom to the
source node. The graph becomes a visible thinking process.

### Explore
Full dashboard. Toolbar, config panels, filters, data table, timeline,
legends, canvas controls — everything available to inspect the graph
directly. This is the power-user mode for researchers who want to see
every cluster, filter by year, color by metric, and browse the raw data.

### Learn
Education modules as graph constellations. Nodes that belong to a learning
module glow when that module is active. Hover a module and the chunks/papers
that inform it light up, showing the evidence network behind the lesson.
Click into a module for structured content with the graph as live context.

### Write
The prompt box expands into an editor surface. As you write, the graph
responds — real-time NER highlights entities, paragraph embeddings find
similar chunks, supporting evidence glows warm, contradicting evidence
glows sharp. Click a supporting node to insert a citation. The graph
becomes a writing partner.

## Mode Registry Architecture

```
lib/graph/modes.ts          # ModeConfig + ModeLayout per mode
lib/graph/types.ts          # GraphMode union type
lib/graph/store.ts          # Current mode state (Zustand)
lib/graph/dashboard-store.ts # Panel/config state (Zustand, typed strategies)
```

To expand a mode:
1. Add layout flags to `ModeLayout` interface (e.g., `promptVariant: 'editor'`)
2. Add the flag values to the mode's config in `MODES`
3. DashboardShell reads the flag — no conditional chains needed
4. Add mode-specific Zustand store if the mode has unique state
5. Add mode-specific components that read from both the registry and their store

To add a new mode:
1. Add key to `GraphMode` union in `types.ts`
2. Add config entry in `MODES` in `modes.ts`
3. Add icon in `MODE_ICONS` in `PromptBox.tsx`
4. Everything else picks it up automatically

## Data Flow

```
Supabase (solemd schema)
  → lib/graph/fetch.ts (Server Component, React cache, 4 parallel queries)
    → app/page.tsx (force-dynamic, passes GraphData to DashboardShell)
      → CosmographProvider (React context for sub-components)
        → CosmographRenderer (GPU scatter, reads dashboard store for config)
        → Panels, Toolbar, Controls (read from provider context)
```

Points: ~2,184 UMAP-positioned chunks from 44 papers, 58 HDBSCAN clusters.
Pre-computed positions — no simulation. `enableSimulation={false}`.

## State Architecture

Two Zustand stores, deliberately separated:

**useGraphStore** — interaction state (shared across all modes)
- `mode`: current GraphMode
- `selectedNode` / `hoveredNode`: ChunkNode | null
- Future: conversation history (Ask), active module (Learn), document state (Write)

**useDashboardStore** — dashboard config (primarily Explore mode)
- Panel visibility, config tab, point color/size/label settings
- Filters, table state, timeline visibility
- Typed with `PointColorStrategy`, `PointSizeStrategy`, `ColorSchemeName`

As modes expand, each gets its own store slice:
- `useAskStore` — conversation messages, RAG context, active evidence path
- `useLearnStore` — active module, highlighted node sets, progress
- `useWriteStore` — document content, NER entities, similarity results

## CSS Architecture

Design tokens in `app/globals.css`:
- **Semantic foundation** (`:root` / `.dark`): background, foreground, surface, text, border, shadow, brand
- **Graph tokens**: canvas bg, panel chrome, prompt overlay, wordmark, labels
- **Cosmograph tokens**: 70+ `--cosmograph-*` vars for timeline, search, legends, buttons, histograms

Mantine theme in `lib/mantine-theme.ts` bridges CSS vars to component defaults.
Tailwind v4 for layout/spacing. Mantine for interactive components.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Rendering | Cosmograph 2.1 (GPU-accelerated WebGL scatter) |
| Framework | Next.js 15 + React 19 |
| Components | Mantine 8 |
| Styling | Tailwind CSS 4 + CSS custom properties |
| Animation | Framer Motion |
| State | Zustand (mode + dashboard stores) |
| Data | Supabase (PostgreSQL, server-only client) |
| Icons | Lucide React |

## File Structure

```
app/
  page.tsx              # Graph page (Server Component, force-dynamic)
  loading.tsx           # Suspense skeleton
  layout.tsx            # Root layout (Mantine provider, fonts, metadata)
  error.tsx             # Error boundary
  not-found.tsx         # 404
components/
  graph/
    DashboardShell.tsx  # Mode-aware layout orchestrator (reads mode registry)
    CosmographRenderer  # GPU scatter (reads dashboard store, brand constants)
    GraphCanvas.tsx     # Dynamic import bridge (ssr: false)
    GraphErrorBoundary  # WebGL fallback
    PromptBox.tsx       # Mode toggles + input (reads mode registry)
    Wordmark.tsx        # Logo + theme toggle
    StatsBar.tsx        # Live counts overlay
    toolbar/
      LeftToolbar.tsx   # Panel toggle strip
    controls/
      CanvasControls    # Fit/select/zoom buttons
    panels/
      PanelShell.tsx    # Shared panel chrome
      ConfigPanel.tsx   # Points/Links/Simulation tabs
      FiltersPanel.tsx  # Per-column filter widgets
      InfoPanel.tsx     # Search + stats + color legend
      DataTable.tsx     # Resizable bottom table
      config/           # Config sub-panels
      filters/          # Filter widget components
  mantine-theme-provider.tsx
  ui/
    theme-toggle.tsx
lib/
  graph/
    modes.ts            # Mode registry (ModeConfig, ModeLayout, MODES)
    types.ts            # ChunkNode, GraphMode, strategy types
    store.ts            # useGraphStore (mode, selection, hover)
    dashboard-store.ts  # useDashboardStore (panels, config, filters)
    fetch.ts            # Server-only Supabase queries
    colors.ts           # 7 color palettes
    columns.ts          # Column metadata
  helpers.ts            # formatNumber, clamp
  utils.ts              # Re-exports helpers
  mantine-theme.ts      # Mantine/CSS var bridge
  supabase/server.ts    # Server-only Supabase client
middleware.ts           # Security headers
```
