# SoleMD.Web Architecture

> Canonical vision: [vision.md](vision.md) (symlinked from SoleMD.App)

## Direction

SoleMD.Web is being rebuilt as a **graph-native, single-page application**.
The knowledge graph is the interface. A floating prompt box is the only control.
Current marketing/portfolio content (About, Education, Research) is woven into
the graph experience — not removed, but re-imagined.

## Current Data (live in Supabase)

| Entity | Count | Notes |
|--------|-------|-------|
| Papers | 51 | 49 ingested, psychiatry/neurology |
| RAG chunks | 2,842 | Full text chunked |
| Citations | 1,986 | Paper-to-paper edges |
| Authors | 550 | Via paper_authors junction |
| Vocab terms | 2,311 | Canonical terminology |
| Zotero backlog | 1,609 | Items not yet ingested |
| Entities | 0 | NER pipeline not yet run |
| Relations | 0 | RelEx pipeline not yet run |
| Embeddings | 0 | Paper/chunk/term — not yet computed |

## Build Phases

### Phase 0: Foundation (current)
- Cosmograph canvas rendering paper/citation/author graph from live Supabase
- Floating prompt box shell with Ask/Explore/Write mode toggles (UI only)
- Pre-computed force-directed layout (UMAP later when embeddings exist)
- SoleMD wordmark top-left → opens About overlay
- Stats bar: paper count, citation count, term count (live from DB)

### Phase 1: Navigation + Content
- Detail panels (click paper node → paper card with metadata, chunks, authors)
- Search + filters (by node type, year, journal)
- Education modules as special node type (click Learn → side panel with modules, graph nodes highlight)
- About overlay: bio, CV, contact, research links
- Vocab term explorer (separate cluster or searchable)

### Phase 2: Intelligence (needs backend)
- Entity nodes + mention edges (after NER pipeline runs)
- Relation edges with assertion status (after RelEx pipeline)
- UMAP semantic positioning (after embeddings computed)
- Progressive zoom: paper → chunks → evidence
- Chunk-level cross-paper similarity edges

### Phase 3: LLM Integration
- Ask mode: LLM + graph traversal + RAG, citations clickable
- Write mode: Tiptap editor, real-time NER, dual-signal (supporting/contradicting)
- Document fingerprints
- Grounding meter

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Graph rendering | Cosmograph (`@cosmograph/react`) — GPU-accelerated, 100K+ nodes |
| Graph layout | Force-directed (Phase 0), UMAP pre-computed positions (Phase 2+) |
| UI framework | Next.js 15 + React 19 + Mantine 8 |
| Styling | Tailwind CSS 4 + globals.css design tokens |
| Animation | Framer Motion (layout transitions, mode morphing) |
| State | Zustand (mode manager, selected node, graph state) |
| Editor (Phase 3) | Tiptap / ProseMirror |
| Data | Supabase (PostgreSQL + pgvector) via API routes |
| LLM (Phase 3) | Claude API via edge functions |

## Design Decisions

### Graph canvas
- Dark background — makes the brand pastels and node colors pop
- Full viewport, edge to edge
- Nodes colored by type using existing brand palette
- Dense clusters create natural luminosity

### Prompt box
- Single React component that morphs between three shapes
- Dark pill, glass-morphism, bottom-center anchored
- Mode toggles (Ask/Explore/Write) appear on hover/focus
- Framer Motion layout animations for all transitions
- The graph component never unmounts — it transforms

### Existing content integration
- **Education**: Special node type in graph. "Learn" mode or toggle opens side panel
  with module list; corresponding graph nodes highlight on hover
- **About/Portfolio**: SoleMD wordmark top-left → glass-morphism overlay with bio,
  CV, research, contact. Not a page — a floating panel over the graph
- **Research**: Papers ARE the graph. Research page content becomes the default
  Explore mode experience

### Branding bridge
- Current brand palette (5 semantic scales, pastels) applies to node types
- Dark canvas background, light/pastel overlays with glass-morphism
- Existing design tokens (shadows, radius, typography) carry forward
- Light mode: graph on dark canvas, overlays use light brand colors
- Dark mode: everything dark, nodes glow with brand accent colors

## File Structure (planned)

```
app/
  (graph)/             # Graph application (main route group)
    layout.tsx         # Graph layout — Cosmograph provider, prompt box
    page.tsx           # Landing — full graph + prompt box
  api/
    graph/             # API routes for graph data
      nodes/route.ts   # Fetch nodes (papers, authors, terms, entities)
      edges/route.ts   # Fetch edges (citations, mentions, relations)
      detail/route.ts  # Node detail data
      search/route.ts  # Graph search
components/
  graph/
    GraphCanvas.tsx    # Cosmograph wrapper
    PromptBox.tsx      # Morphing prompt box (Ask/Explore/Write)
    DetailPanel.tsx    # Node detail cards (paper/author/entity/term)
    NodeFilters.tsx    # Type/date/journal filters
    StatsBar.tsx       # Live counts from DB
  overlays/
    AboutOverlay.tsx   # Bio, CV, contact
    LearnPanel.tsx     # Education modules side panel
lib/
  graph/
    types.ts           # Node, Edge, GraphMode types
    store.ts           # Zustand store (mode, selection, filters)
    data.ts            # Supabase queries for graph data
    layout.ts          # Node positioning (force-directed → UMAP)
    colors.ts          # Node type → brand color mapping
```
