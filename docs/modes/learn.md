# Learn Mode — Education Through the Graph

> Modules are graph-native. They don't exist outside the graph — they're views into it.

## Overview

Learn is not a separate section — it's a **side panel** that overlays the graph. Education modules are curated subgraph views with authored narrative. Each module defines a set of entities, papers, and relations that form its "syllabus." When you select a module, the graph zooms to that constellation and the lesson renders alongside it.

## Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  SoleMD                                                          [Sign in] │
│                                                                             │
│  ┌── Learn Panel ────────┐  ╭────────── GRAPH CANVAS ──────────────────╮   │
│  │                        │  │                                          │   │
│  │  Modules               │  │     ○  ○──○  ●D2──●haloperidol  ○      │   │
│  │  ─────────             │  │    ○──○   ●clozapine──○  ○──○           │   │
│  │                        │  │      ○  ●TRS──○   ○──●olanzapine──○    │   │
│  │  ◉ Antipsychotic       │  │     ○──○    ○──○  ○──○  ○               │   │
│  │    Pharmacology        │  │                                          │   │
│  │    5 papers · 12 ents  │  │   ● = nodes in this module (lit)        │   │
│  │                        │  │   ○ = dormant (not in module)            │   │
│  │  ○ BDNF & Depression  │  │                                          │   │
│  │    4 papers · 8 ents   │  ╰──────────────────────────────────────────╯   │
│  │                        │                                                 │
│  │  ○ Sleep Neurobiology  │  ┌── Module Content ─────────────────────────┐  │
│  │    7 papers · 15 ents  │  │                                            │  │
│  │                        │  │  # Antipsychotic Pharmacology              │  │
│  │  ○ Ketamine & TRD     │  │                                            │  │
│  │    3 papers · 6 ents   │  │  Treatment-resistant schizophrenia (TRS)  │  │
│  │                        │  │  affects ~30% of patients. First-line      │  │
│  │                        │  │  agents target D2 receptors, but cloza-    │  │
│  │                        │  │  pine remains uniquely effective...         │  │
│  │                        │  │                                            │  │
│  │                        │  │  underlined = entity (hover → graph)       │  │
│  └────────────────────────┘  └────────────────────────────────────────────┘  │
│                                                                             │
│         ╭──────────────────────────────────────────────────────╮           │
│         │  ●Ask  ○Explore  ○Write                              │           │
│         │  Ask anything about antipsychotic pharmacology... ⏎   │           │
│         ╰──────────────────────────────────────────────────────╯           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Behaviors

- **Side panel** slides in with available modules — accessed via the wordmark menu or prompt box
- **Hover a module** in the list → its constituent graph nodes light up (papers, entities, relations)
- **Click a module** → graph zooms to that constellation, lesson content renders in panel
- **Entity highlighting** in lesson text — same system as Ask and Write modes
  - Hover underlined entity → node glows in graph
  - Hover node in graph → highlights where it appears in lesson text
  - Click entity → zoom to node neighborhood

## What a Module Is

A module is a **named subgraph + authored narrative**:

- A set of entity IDs, paper IDs, and relation IDs that define the syllabus
- Authored Markdown/MDX content with entity annotations
- The content references entities that exist as real nodes in the graph
- Every fact in the lesson is a graph traversal; every entity is a live link

## Living Modules

As the knowledge graph grows (new papers ingested, new entities extracted), modules can surface new connections:

- "2 new papers added since you last studied this module"
- New nodes pulse gently at the edge of the module's constellation
- The module stays current with the underlying graph

## Ask in Module Context

When a Learn module is open, the prompt box scopes questions to that module's subgraph. Ask "Why is clozapine different?" while studying Antipsychotic Pharmacology, and the LLM answers from the module's papers and entities specifically.

## Phasing

| Phase | Feature |
|-------|---------|
| MVP | Learn panel with module list, graph node highlighting |
| Phase 2 | Entity links in lesson text (hover/click → graph), live update indicators |
| Phase 3 | Ask in module context (scoped Q&A within a module's subgraph) |
