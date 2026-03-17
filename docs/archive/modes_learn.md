# Learn Mode — Education Through the Graph

> Modules don't describe the graph — they live on it. Their position is their meaning.

## Overview

Learn mode activates the **Synthesis Map** — the fourth layer of the graph (see [Explore: Layered Maps](explore.md#layered-maps--three-levels-of-the-corpus)). Learning modules are nodes on the graph, positioned by the semantic embedding of their content. A lecture on delirium sits near the delirium entity cluster. A pharmacology walkthrough sits near drug-receptor nodes. You don't navigate *away* from the graph to learn — you navigate *into* it.

Clicking a module opens a **step-through side panel** (same PanelShell pattern as DetailPanel). As you advance through slides, the graph illuminates sourced and related nodes around you. By the end of a module, the trail of illumination forms the module's **fingerprint** — a visual map of everything you just learned.

**Implementation**: Module nodes are additional rows in the DuckDB points table with `nodeType: "module"`. Their content (title + all slides) is embedded with the same Qwen3-Embedding model as chunks, projected through the same UMAP — so they naturally land near the content they teach about. Same bundle, same renderer, just styled differently (larger, distinct color).

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SoleMD                                                          [Sign in] │
│                                                                             │
│  ┌── Learn Panel ──────────┐ ╭──────────── GRAPH CANVAS ─────────────────╮ │
│  │                          │ │                                           │ │
│  │  Antipsychotic    [2/8]  │ │     ○  ○  ○                              │ │
│  │  Pharmacology            │ │    ○  ○  ○  ○                            │ │
│  │  ─────────────────────── │ │     ○  ○  ○                              │ │
│  │                          │ │                                           │ │
│  │  Clozapine's multi-     │ │   ●D2  ●haloperidol                      │ │
│  │  receptor profile sets  │ │   ●clozapine   ◐D4                       │ │
│  │  it apart from typical  │ │   ●TRS   ●5-HT2A   ◐H1                  │ │
│  │  agents. While D2       │ │   ◐muscarinic                            │ │
│  │  antagonism drives most │ │     ○  ○  ○                              │ │
│  │  antipsychotic efficacy,│ │    ○  ○  ○  ○                            │ │
│  │  clozapine binds 5-HT2A,│ │                                           │ │
│  │  muscarinic, and        │ │   ● = sourced (bright, ring)             │ │
│  │  histamine receptors... │ │   ◐ = related (dim-glow)                 │ │
│  │                          │ │   ○ = dormant (greyed out)               │ │
│  │  [← Prev]    [Next →]  │ ╰───────────────────────────────────────────╯ │
│  └──────────────────────────┘                                              │
│                                                                             │
│                        ╭─────────────────────╮                             │
│                        │ ○Ask ○Explore ●Learn│                             │
│                        │  🔍 Search modules..│                             │
│                        ╰─────────────────────╯                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Behaviors

- **Modules are graph nodes** — positioned by semantic embedding of their content, visible on the Synthesis Map layer
- **Click a module node** → side panel opens (PanelShell) with slide deck, graph zooms to module's neighborhood
- **Step through slides** → graph illumination changes per slide:
  - **Sourced nodes** (explicitly cited in slide) glow bright with ring highlight
  - **Related nodes** (semantically near but not cited) dim-glow at partial opacity
  - **Everything else** fades to greyout opacity
  - Previous slide's nodes fade back as new slide's nodes light up
- **Entity highlighting** in slide text — same system as Ask and Write modes
  - Hover underlined entity → node glows in graph
  - Click entity → graph zooms to node neighborhood
- **Escape or click outside** → close popup, stay on Synthesis Map

## Graph Illumination — Seeing What You Learn

The core innovation: as you advance through a module, the graph becomes a **visual progress map**.

```
Slide 1: "D2 receptor antagonism"
  ● bright: D2, haloperidol, chlorpromazine        (sourced)
  ◐ dim:    D3, D4, risperidone                    (related)
  ○ faded:  everything else

Slide 2: "Clozapine's multi-receptor profile"
  ● bright: clozapine, 5-HT2A, muscarinic          (sourced)
  ◐ dim:    D2, D4, H1                             (related — D2 was sourced last slide)
  ○ faded:  everything else

Slide 3: "Evidence for clozapine superiority"
  ● bright: Smith 2024, Jones 2023, specific chunks (sourced — papers + evidence)
  ◐ dim:    TRS, treatment-resistance               (related)
  ○ faded:  everything else
```

By the end of the module, you've "walked through" a region of the graph. The trail of illumination forms the module's **fingerprint** — a named subgraph representing its conceptual territory.

## What a Module Is

A module is a **positioned node + authored slide deck**:

```markdown
---module
title: Antipsychotic Pharmacology
topics: [antipsychotics, D2, clozapine, TRS, pharmacology]
---

---slide
sources: [D2, haloperidol, chlorpromazine]
---
Treatment-resistant schizophrenia (**TRS**) affects ~30% of patients.
First-line agents target **D2 receptors**...

---slide
sources: [clozapine, 5-HT2A, muscarinic]
---
**Clozapine**'s multi-receptor profile sets it apart...
```

- **`topics`** determines the module's embedding (and therefore its position on the graph)
- **`sources`** per slide drives bright illumination — these are explicit node references
- **Semantic proximity** drives dim-glow automatically — no annotation needed for context nodes
- Entity annotations in text (`**bold**` or explicit `[[entity]]`) enable hover/click interaction

## Living Modules

As the knowledge graph grows (new papers ingested, new entities extracted), modules can surface new connections:

- "2 new papers added since you last studied this module"
- New nodes pulse gently near the module's position on the Synthesis Map
- The module stays current with the underlying graph — its dim-glow radius expands as related content grows

## Ask in Module Context

When a module popup is open, the prompt box scopes questions to that module's sourced and related nodes. Ask "Why is clozapine different?" while studying Antipsychotic Pharmacology, and the LLM answers from the module's papers and entities specifically — grounded in exactly what you're looking at.

## Phasing

| Phase | Feature |
|-------|---------|
| MVP | Synthesis Map layer, module nodes positioned by embedding, click → popup with slides |
| Phase 2 | Graph illumination (sourced bright / related dim-glow / fade per slide), entity hover/click |
| Phase 3 | Living modules (new content indicators), Ask in module context |
| Future | Module authoring UI, AI-assisted module generation from entity clusters |
