# SoleMD.Web Roadmap

> Architecture: [../architecture.md](../architecture.md)
> Mode registry: `lib/graph/modes.ts`

## Current State

**Phase 0 complete.** Clean foundation:
- 38 production files, 2,984 lines, 12 deps
- Cosmograph GPU scatter rendering ~2,184 UMAP chunks from 44 papers
- 4 modes with data-driven registry (Ask/Explore/Learn/Write)
- Explore mode fully functional (toolbar, config panels, filters, data table, timeline, legends)
- Ask/Learn/Write show clean canvas + prompt box (shells ready for expansion)
- Full light/dark mode, branded Cosmograph CSS theming
- Zero TS errors, zero ESLint errors, builds clean

---

## Phase 1: Mode Expansion

The graph is always the page. Each mode changes how you interact with it.

### 1.1 — Ask Mode (Grounded RAG)

The prompt box becomes a chat interface. The graph becomes visible reasoning.

- [ ] Chat message history in prompt box (conversation thread above input)
- [ ] `useAskStore` — messages, active query, evidence path, loading state
- [ ] API route: query → entity extraction → graph traversal → RAG over chunks
- [ ] Real-time node highlighting as LLM traverses evidence path
- [ ] Clickable citations in responses → zoom to source node
- [ ] Grounding indicator (how many nodes support the answer)
- [ ] Mode layout: `promptVariant: 'chat'` — prompt box expands upward with messages

### 1.2 — Explore Mode (Enhancement)

Already functional. Polish and extend.

- [ ] CosmographPopup on hover/click (node detail card)
- [ ] Detail panel: click paper node → slide-in with metadata, chunks, authors
- [ ] Progressive zoom: double-click paper → explode into chunks
- [ ] Chunk-level cross-paper similarity edges (from MedCPT cosine)
- [ ] Export: selected subgraph → JSON, BibTeX, or SoleMD.Make

### 1.3 — Learn Mode (Educational Constellations)

Education modules live in the graph. Nodes glow when their module is active.

- [ ] `useLearnStore` — active module, highlighted nodes, progress tracking
- [ ] Module index panel (slide-in list of available learning modules)
- [ ] Module activation: click module → highlight its node constellation
- [ ] Hover module → chunks/papers that inform it light up with connecting lines
- [ ] Zoom to module subgraph on activation
- [ ] Module content panel: structured lesson, linked to live graph nodes
- [ ] Entity highlighting in lesson text (hover entity → graph node glows)
- [ ] Mode layout: `showModulePanel: true`, `canvasHighlighting: 'by-module'`

### 1.4 — Write Mode (Graph-Assisted Editor)

The prompt box expands into a writing surface. The graph responds to your text.

- [ ] `useWriteStore` — document content, cursor position, NER entities, similarity hits
- [ ] Expanded editor (prompt box grows upward, full-width, multi-line)
- [ ] Real-time NER on current paragraph → entity highlights in editor
- [ ] Paragraph embedding → pgvector similarity → graph nodes glow by relevance
- [ ] Dual-signal: supporting evidence (warm glow) + contradicting (sharp glow)
- [ ] Click supporting node → insert citation into editor
- [ ] Grounding meter (% of claims with supporting evidence)
- [ ] Mode layout: `promptVariant: 'editor'`, `canvasHighlighting: 'by-relevance'`

---

## Phase 2: Intelligence (needs backend pipeline)

Blocked on: entity extraction, relation extraction, embeddings in SoleMD.App.

### 2.1 — Entity + Relation Graph
- [ ] Entity nodes from `solemd.entities` + `solemd.entity_links`
- [ ] Relation edges with assertion status (affirmed/negated/speculative)
- [ ] Visual encoding: edge style by relation type and confidence

### 2.2 — Semantic Positioning
- [ ] UMAP positions from SPECTER2 (papers), SapBERT (entities), MedCPT (chunks)
- [ ] Multi-scale: paper-level layout + chunk-level sub-layout

### 2.3 — Progressive Zoom
- [ ] Paper → chunks → evidence (drill-down)
- [ ] Chunk-level cross-paper similarity edges
- [ ] Click chunk → evidence panel (text, entities, values, relations)

---

## Phase 3: Polish + Integration

### 3.1 — About Overlay
- [ ] SoleMD wordmark click → glass-morphism overlay (bio, CV, contact, research)
- [ ] Graph visible underneath, translucent panel

### 3.2 — Cross-Mode Transitions
- [ ] Learn → Ask: "Explain this concept" from within a lesson → Ask with module context
- [ ] Explore → Write: select nodes in Explore → switch to Write with pre-loaded citations
- [ ] Ask → Explore: "Show me these papers" → Explore with highlighted subgraph

### 3.3 — Persistence
- [ ] Save/restore dashboard config per mode
- [ ] Write mode autosave
- [ ] Learn mode progress persistence
- [ ] Ask mode conversation history

---

## Future
- Collaborative graphs (shared across research groups)
- Graph diff ("what changed this week")
- Export to SoleMD.Make (manuscript → Pandoc/Typst)
- Obsidian sync (vault notes ↔ graph nodes)
- Mobile (touch-optimized Cosmograph)

---

## Key Decisions

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-07 | Graph-native rebuild | The graph IS the interface, not a feature on a page |
| 2026-03-07 | Mode registry pattern | Data-driven mode config, no hardcoded conditionals |
| 2026-03-07 | Cosmograph | GPU perf at 100K+ nodes, pre-computed layout support |
| 2026-03-07 | Dark canvas + brand pastels | Dark makes nodes pop, pastels on overlays bridge brand |
| 2026-03-07 | Education as graph nodes | Modules are named subgraphs, not separate pages |
| 2026-03-07 | Two Zustand stores | Interaction state (shared) vs dashboard config (Explore) |
| 2026-03-07 | Per-mode stores | Each mode gets its own store slice as it expands |
| 2026-03-07 | No marketing pages | Graph is the only surface. About becomes an overlay |
