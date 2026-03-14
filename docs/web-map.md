# SoleMD Web Map

> Conceptual UX map for the graph product surface.
> This is not the authoritative file map for the current runtime.
> For actual entry points, client/server boundaries, Mantine, Tailwind, Framer Motion, assets, and stores, see [code-search-map.md](code-search-map.md).

## Information Architecture

```
SoleMD.Web
│
├── GRAPH CANVAS (always present, full viewport, never unmounts)
│   │
│   ├── Layered maps — three switchable corpus views:
│   │   ├── Entity map — relations between concepts, color by degree (connection count)
│   │   ├── Chunk map — semantic similarity across passages, color by parent paper
│   │   └── Paper map — citation network between studies, color by journal/year
│   ├── Clusters — natural groupings from embedding proximity (Leiden communities)
│   ├── Timeline — temporal filter strip (publication years)
│   └── Filters — node type, category, date range, journal, author, entity class
│
├── PROMPT BOX (always present, bottom-center, single morphing component)
│   │
│   ├── Ask (default) — chat bar, conversation opens above
│   │   └── Chat history panel
│   │
│   ├── Explore — compact search bar, graph goes full viewport
│   │   └── Search/filter input
│   │
│   ├── Learn — opens Learn panel, graph scoped to module subgraph
│   │   └── Module list + lesson content panel
│   │
│   └── Write — expands upward into Tiptap editor
│       ├── Editor surface
│       ├── Grounding meter
│       └── Auto-cite / Find gap controls
│
├── DETAIL PANELS (slide in on node click, type-specific)
│   │
│   ├── Paper — metadata, authors, abstract, chunks, figures, tables, citations
│   ├── Entity — canonical term, UMLS link, category, papers, relations, similar entities
│   ├── Author — name, papers, co-authors, entity expertise profile
│   ├── Term — UMLS definition, hierarchy, synonyms, mentioning papers
│   ├── Chunk — source text, entities, values, relations, similar chunks across papers
│   ├── Figure — image, VLM description, source paper, entities depicted
│   └── Table — structured data, source paper, entities referenced
│
├── SUGGESTION PANEL (Write mode only, right side)
│   │
│   ├── Supporting (●) — semantically similar papers/chunks, insert citation
│   └── Contradicting (◆) — negated/conflicting evidence, view counter-evidence
│
├── ABOUT OVERLAY (triggered from wordmark)
│   │
│   ├── Bio, CV, research interests
│   ├── Contact
│   └── Glass-morphism over graph (graph glows through)
│
└── WORDMARK (top-left "SoleMD")
    │
    ├── Click → About overlay
    └── Menu → Learn, settings (future)
```

## Interaction Flows

```
ACTION                              RESULT
──────                              ──────

Land on SoleMD.Web               → Graph + prompt box (Ask mode default)

Hover/focus prompt box            → Mode toggles appear: [Ask] [Explore] [Learn] [Write]
Click [Ask]                       → Chat bar, graph shrinks to ~40%, reactive
Click [Explore]                   → Compact search, graph goes 100%, discovery mode
Click [Learn]                     → Learn panel slides in, graph scopes to module
Click [Write]                     → Prompt expands into editor, graph shrinks to mini

Type in Ask mode                  → Graph lights up related nodes as you type (keyword → semantic)
                                    On submit: LLM answers, evidence nodes persist with stance colors
Type in Explore search            → Nodes filter/highlight in real-time (CosmographSearch)
Type in Write editor              → Current paragraph highlights evidence (● support / ◆ contradict)

Click a graph node                → Detail panel slides in from left
Hover a graph node                → Neighborhood expands, tooltip preview
Double-click a paper              → Progressive zoom: paper → chunks → evidence

Click entity in chat/editor       → Graph zooms to entity neighborhood
Hover entity in chat/editor       → Entity node glows in graph

Click "SoleMD" wordmark           → About overlay
Press Escape / click background   → Close panels/overlays, stay in current mode
Scroll timeline                   → Temporal filter, nodes fade by publication year
```

## UI Surfaces

| Surface | Type | Position | When Visible |
|---------|------|----------|-------------|
| Graph canvas | Persistent | Full viewport | Always |
| Prompt box | Persistent | Bottom-center | Always |
| Mode toggles | Reveal | Above prompt | On hover/focus |
| Chat history | Panel | Above prompt | Ask mode, after first message |
| Editor | Expansion | Replaces prompt | Write mode |
| Detail panel | Slide-in | Left side | On node click |
| Suggestion panel | Slide-in | Right side | Write mode |
| Learn panel | Slide-in | Left side | Learn mode |
| About overlay | Overlay | Centered | On wordmark click |
| Filters | Floating | Bottom | Explore mode |
| Timeline | Floating | Bottom edge | Explore mode |
| Grounding meter | Bar | Below editor | Write mode |
| Stats bar | Floating | Bottom | Landing (Ask idle) |

For code-level data flow (fetch → render pipeline, stores, file structure), see [architecture.md](architecture.md).
For colors, typography, shadows, and aesthetic principles, see [brand.md](brand.md).

## Node Types

| Type | Visual | Size By | Color |
|------|--------|---------|-------|
| Paper | Circle | Citation count | By journal/year |
| Entity | Circle | Mention count | By category |
| Author | Circle | Paper count | Neutral |
| Term | Circle | Linked entities | By UMLS group |
| Chunk | Small circle | Similarity degree | By parent paper |
| Figure | Diamond | — | By parent paper |
| Table | Square | — | By parent paper |

## Edge Types

| Type | Visual | Width By |
|------|--------|----------|
| CITES | Solid arrow | — |
| AUTHORED_BY | Solid line | — |
| MENTIONS | Thin line | Mention count |
| RELATES | Styled by assertion | Evidence weight |
| SIMILAR (semantic) | Dashed line | Cosine similarity |
| LINKED_TO (UMLS) | Dotted line | — |
