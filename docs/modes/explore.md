# Explore Mode — The Graph as Homepage

> You arrive at SoleMD and the graph is right there. Not a dashboard, not a feed — the graph.

## Overview

Explore gives the graph **full viewport**. The prompt box shrinks to a compact search bar tucked at the bottom. This is the primary browsing and discovery mode — filter by node type, zoom into clusters, hover to see neighborhoods, click for detail panels.

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SoleMD                                                          [Sign in] │
│                                                                             │
│    ╭─────────────────────────── GRAPH CANVAS ───────────────────────────╮   │
│    │                                                                    │   │
│    │          ┌──────┐          ┌──────┐                                │   │
│    │          │Smith │──CITES──▶│Jones │                                │   │
│    │          │ 2024 │          │ 2023 │                                │   │
│    │          └──┬───┘          └──┬───┘                                │   │
│    │             │                 │                                    │   │
│    │          MENTIONS          MENTIONS                               │   │
│    │             │                 │                                    │   │
│    │          ┌──▼───┐          ┌──▼───┐                               │   │
│    │          │BDNF  │──RELATES─│TrkB  │      ╭───────╮               │   │
│    │          └──┬───┘          └──────┘      │CLUSTER│               │   │
│    │             │                             │ D2/D3 │               │   │
│    │          LINKED_TO                        │recep- │               │   │
│    │             │                             │ tors  │               │   │
│    │          ┌──▼──────────────┐              ╰───────╯               │   │
│    │          │ Brain-Derived   │                                       │   │
│    │          │ Neurotrophic    │   ◄── HOVERED: term neighborhood     │   │
│    │          │ Factor          │       expands on mouse-over          │   │
│    │          │ [UMLS:C0107103] │                                       │   │
│    │          └─────────────────┘                                       │   │
│    │                                                                    │   │
│    ╰────────────────────────────────────────────────────────────────────╯   │
│                                                                             │
│  ┌─ Node Detail ────────────────────────────────────────────────────────┐   │
│  │  BDNF (Entity)                                                       │   │
│  │  Canonical Term: Brain-Derived Neurotrophic Factor                   │   │
│  │  Category: neuroscience.neurotrophin                                 │   │
│  │  Mentioned in: 12 papers  |  42 chunks  |  7 relations              │   │
│  │  Similar entities: NT-3, NGF, GDNF (via SapBERT)                    │   │
│  │  [View Papers] [View Relations] [Insert Citation]                    │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                        ╭─────────────────────╮                             │
│                        │ ○Ask ●Explore ○Write│  ◄── Explore is active     │
│                        │  🔍 Search graph... │                             │
│                        ╰─────────────────────╯                             │
│                                                                             │
│  Filters: [*Papers] [*Entities] [Authors] [Terms] [Figures] [Tables]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Behaviors

- **Graph fills 100% viewport** — this is the full-screen discovery mode
- **Prompt box becomes compact search** — smaller, tucked bottom-center, filters/highlights nodes
- **Node types**: papers, authors, entities, terms, figures, tables, chunks
- **Edge types**: citations, authorship, entity mentions, relations, semantic similarity
- **Hover a node** → neighborhood expands (papers that mention it, related terms, relations)
- **Click a node** → detail panel slides in with type-specific intelligence card
- **Double-click a paper** → progressive zoom into chunks/figures/tables (subgraph loading)

## Filtering & Discovery

- Filter by node type, category, date range, journal, author, entity class
- Zoom into clusters — communities of papers form naturally from embedding proximity
- Timeline filter — scroll through publication years, nodes fade in/out temporally
- Search input filters and highlights matching nodes in real-time

## Progressive Depth — The Graph Is Fractal

Every click goes deeper. Each level reveals more graph underneath.

```
FIELD         PAPER          CHUNK           EVIDENCE
─────         ─────          ─────           ────────

○ ○ ○   →   ┌──────┐  →   ┌──┬──┐   →   "actual text
○ ○ ○        │chunks│       │c1│c2│        from the paper
○ ○ ○        │figs  │       └──┴──┘        with entities,
             │tables│        ╌ ╌ ╌         values, and
             └──────┘       to other       provenance"
                            papers

"What's the    "What's in   "What does     "Show me the
 landscape?"    this paper?" this passage    evidence."
                             connect to?"
```

### Level 1: The Field
Papers, authors, entities, terms. Citations, authorship, mentions, semantic similarity. Clusters form naturally from embedding proximity.

### Level 2: Inside a Paper
Click a paper → it explodes into chunks, figures, tables, entities, relations, values. You see the paper's anatomy.

### Level 3: Chunk Neighborhood
Chunks have **semantic connections** to chunks in other papers. Dashed lines = MedCPT embedding similarity. This is where papers talk to each other — passages connect even if the papers never cite one another.

### Level 4: The Evidence
The actual text. Entities, values (p < 0.001, d = 0.73), relations with assertion status and confidence. Every node traces back to here.

## Prompt Box Shape

Compact search bar. Mode toggles visible. Smaller footprint than Ask mode.

```
╭──────────────────────╮
│ ○A ●Explore ○W       │
│ 🔍 Search graph...   │
╰──────────────────────╯
```

## Phasing

| Phase | Feature |
|-------|---------|
| MVP | Full-viewport graph, search, timeline, node filters, detail panels |
| Phase 2 | Progressive zoom (paper → chunks → evidence), subgraph loading |
| Phase 3 | Literature review (citation network analysis, gap detection), entity explorer |
