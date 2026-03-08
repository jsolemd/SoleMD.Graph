# SoleMD.Web Roadmap

> Living document. Update as work progresses.
> Architecture details: [../architecture.md](../architecture.md)
> Full vision: [../vision.md](../vision.md) (symlink to SoleMD.App)

## Current State (2026-03-07)

- 11 production deps, clean build, zero TS/ESLint errors
- Supabase connected (51 papers, 2842 chunks, 1986 citations, 550 authors, 2311 vocab terms)
- Marketing site pages exist (About, Education, Research) — will be absorbed into graph UI
- No graph rendering yet. No Cosmograph. No API routes for graph data

---

## Phase 0: Graph Foundation

Goal: Paper/citation/author graph on screen with a prompt box shell.

### 0.1 — Cosmograph Setup
- [ ] Install `@cosmograph/react` (check license: CC-BY-NC-4.0, fine for non-commercial)
- [ ] Create `components/graph/GraphCanvas.tsx` — Cosmograph wrapper
- [ ] Dark canvas, full viewport, basic node rendering
- [ ] Node colors mapped to brand palette (papers = brand blue, authors = contact pink, terms = education green)
- [ ] Verify GPU rendering works, test with 51 papers + citation edges

### 0.2 — Supabase API Routes
- [ ] `app/api/graph/nodes/route.ts` — fetch papers, authors (later: entities, terms)
- [ ] `app/api/graph/edges/route.ts` — fetch citations, paper-author links (later: mentions, relations)
- [ ] Typed responses (`GraphNode`, `GraphEdge` interfaces)
- [ ] Server-side Supabase client (not browser — these are internal API routes)

### 0.3 — Graph Data Layer
- [ ] `lib/graph/types.ts` — Node, Edge, GraphMode, GraphState types
- [ ] `lib/graph/store.ts` — Zustand store (mode, selected node, filters, highlighted nodes)
- [ ] `lib/graph/data.ts` — fetch + transform Supabase data → Cosmograph format
- [ ] `lib/graph/colors.ts` — node type → brand color mapping

### 0.4 — Prompt Box Shell
- [ ] `components/graph/PromptBox.tsx` — dark pill, glass-morphism, bottom-center
- [ ] Mode toggles: Ask / Explore / Write (UI only — no backend yet)
- [ ] Framer Motion layout animations for mode transitions
- [ ] Input field (non-functional for now — placeholder text per mode)

### 0.5 — Landing Page Swap
- [ ] New root layout/page: Cosmograph full viewport + prompt box
- [ ] SoleMD wordmark top-left (static for now — About overlay comes in Phase 1)
- [ ] Stats bar: live counts from DB (papers, citations, terms)
- [ ] Move current marketing pages to archive or behind a route prefix
- [ ] Ensure `next build` still passes

---

## Phase 1: Navigation + Content

Goal: Click things, see things. Education and About content integrated.

### 1.1 — Detail Panels
- [ ] Click a paper node → slide-in panel with title, authors, journal, year, abstract, chunk count
- [ ] Click an author node → panel with name, paper count, list of papers
- [ ] Glass-morphism panels, Framer Motion slide transitions
- [ ] Escape / click background to dismiss

### 1.2 — Search + Filters
- [ ] Cosmograph built-in search component wired up
- [ ] Filter by node type (paper / author / term)
- [ ] Filter by year range
- [ ] Filter by journal

### 1.3 — About Overlay
- [ ] SoleMD wordmark click → glass-morphism overlay
- [ ] Bio, CV/resume, research interests, contact links
- [ ] Translucent — graph visible underneath
- [ ] Research interest tags could highlight graph clusters (stretch)

### 1.4 — Learn Panel
- [ ] "Learn" accessible from prompt box or wordmark menu
- [ ] Side panel with education module list
- [ ] Module = metadata + list of associated paper/entity IDs
- [ ] Hover module → highlight its graph nodes
- [ ] Click module → open lesson content in panel, zoom graph to constellation
- [ ] Module content as MDX or structured markdown

---

## Phase 2: Intelligence (needs backend pipeline)

Blocked on: entity extraction, relation extraction, embeddings in SoleMD.App.

### 2.1 — Entity + Relation Nodes
- [ ] Entity nodes from `solemd.entities` + `solemd.entity_links`
- [ ] Relation edges from `solemd.paper_relations` with assertion status
- [ ] Entity-mention edges (entity → paper/chunk)
- [ ] Visual encoding: edge style for affirmed/negated/speculative

### 2.2 — Semantic Positioning
- [ ] UMAP pre-computed 2D positions (stored in DB or computed at build time)
- [ ] Replace force-directed layout with UMAP positions
- [ ] Papers positioned by SPECTER2, entities by SapBERT, chunks by MedCPT

### 2.3 — Progressive Zoom
- [ ] Double-click paper → explode into chunks/figures/tables
- [ ] Chunk-level similarity edges (cross-paper, from MedCPT cosine)
- [ ] Click chunk → evidence panel (actual text, entities, values, relations)

### 2.4 — Learn Enhancements
- [ ] Entity highlighting in lesson text (hover underlined entity → graph node glows)
- [ ] "New since last visit" indicator on modules (new papers touching the module's subgraph)

---

## Phase 3: LLM Integration

### 3.1 — Ask Mode
- [ ] LLM chat via Claude API (edge function or API route)
- [ ] Graph traversal: extract entities from query → find paths → RAG over chunks
- [ ] Traversed nodes highlight in real-time as LLM answers
- [ ] Clickable citations in responses → zoom to paper/chunk node

### 3.2 — Write Mode
- [ ] Tiptap/ProseMirror editor (prompt box expands upward)
- [ ] Real-time NER on current paragraph (entity highlighting in editor)
- [ ] Paragraph embedding → pgvector similarity search
- [ ] Dual-signal: supporting (warm glow) + contradicting (sharp glow)
- [ ] Citation insertion (click supporting node → insert citation)
- [ ] Grounding meter

### 3.3 — Learn + Ask
- [ ] Ask questions scoped to a module's subgraph
- [ ] "Explain this concept" from within a lesson → Ask mode with module context

---

## Future
- Collaborative graphs (shared across research groups)
- Graph diff ("what changed this week")
- Export to SoleMD.Make (manuscript → Pandoc/Typst)
- Obsidian sync (vault notes ↔ graph nodes)
- Mobile (touch-optimized Cosmograph)

---

## Dependencies to Install

| Package | When | Why |
|---------|------|-----|
| `@cosmograph/react` | Phase 0.1 | GPU graph rendering |
| `zustand` | Phase 0.3 | Graph state management |
| `tiptap` + extensions | Phase 3.2 | Scientific editor |

## Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Graph-native rebuild | Vision alignment — graph IS the interface |
| 2026-03-07 | Cosmograph over alternatives | GPU perf at 100K+ nodes, pre-computed layout, CC-BY-NC-4.0 ok |
| 2026-03-07 | Dark canvas + brand pastels | Dark makes nodes pop, pastels on overlays bridge existing brand |
| 2026-03-07 | Education as graph nodes | Modules are named subgraphs, not separate pages |
| 2026-03-07 | About as overlay | Wordmark → glass panel, graph visible underneath |
| 2026-03-07 | Start with real data | 51 papers + citations, let graph grow organically |
| 2026-03-07 | Zustand for state | Lightweight, simple, good for graph mode/selection/filter state |
