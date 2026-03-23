# SoleMD.Graph — System Vision Map

One graph. Four capabilities. Everything always available.

---

## Architecture at a Glance

```
EXTERNAL DATA                 GRAPH ENGINE                 THE EXPERIENCE
─────────────                 ────────────                 ──────────────
PubTator3 (NCBI)    ──┐      UMAP layout        ──┐      ┌─────────────────────┐
  entities, relations  │      Leiden clusters       │      │  GRAPH CANVAS       │
                       ├──►   Parquet export    ────┤──►   │  (always present)   │
Semantic Scholar     ──┘      PostgreSQL            │      │                     │
  papers, citations,          pgvector HNSW     ────┘      │  Explore · Ask      │
  embeddings, TLDRs                                        │  Write  · Learn     │
                                                           │  (always available) │
        ▼                           ▼                      └─────────────────────┘
   See data.md              Layered Maps (§3)           Capabilities (§4-§5)
```

External data sources (PubTator3, Semantic Scholar) feed into a graph engine that
computes layout, clusters, and embeddings. The engine exports Parquet bundles served
to the browser, where Cosmograph renders the unified experience. Full data-flow
details live in [data.md](data.md). Deferred ideas and post-freeze roadmap items live
in [future.md](../design/future.md).

---

## The Living Graph — Dynamic Data Layers

The graph always shows ~2M papers. But WHICH 2M changes based on what you're
exploring. Papers flow in and out of the visible canvas, drawn from a larger
pre-mapped universe. The graph feels alive.

### Three Nested Data Layers

```
┌─────────────────────────────────────────────────────────────┐
│  DATABASE UNIVERSE (14M papers)                             │
│  All papers with metadata. MedCPT retrieval index.         │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  MAPPED UNIVERSE (3-5M papers)                        │  │
│  │  SPECTER2 embedding + UMAP x/y coordinates            │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  ACTIVE CANVAS (~2M papers at any time)         │  │  │
│  │  │  Currently rendered in Cosmograph               │  │  │
│  │  │                                                 │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │  BASELINE (~1.85M core neuro/psych)      │  │  │  │
│  │  │  │  Always visible. Stable scaffold.         │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │  + Dynamic overlay from mapped universe         │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  + Detail panel for any paper (side panel, no coordinates)  │
└─────────────────────────────────────────────────────────────┘
```

### How the Graph Responds

| User Action | Graph Response |
|-------------|---------------|
| Filter by "delirium + critical care" | Mapped critical care papers flow onto the canvas from reservoir |
| Write about "lithium nephrotoxicity" | MedCPT retrieves nephrology papers; mapped ones light up on canvas, unmapped show in side panel |
| Explore a psycho-oncology cluster | Overlay pulls in pre-mapped oncology bridge papers near that cluster |
| Ask "what treats ICU delirium?" | RAG retrieves from full 14M; cited papers with coordinates illuminate on canvas |

### Two Embedding Spaces

| Embedding | Model | Purpose | Scope |
|-----------|-------|---------|-------|
| SPECTER2 | Pre-computed by S2 | Map geometry — UMAP layout, cluster structure | Mapped universe (3-5M) |
| MedCPT | Self-embedded | Semantic retrieval — search, RAG, @ autocomplete | Full database (14M) |

### Key Constraints

1. Every visible paper needs pre-computed UMAP x/y from a single run
2. All coordinates from same UMAP run (can't merge separate runs)
3. Don't replace all 2M on every interaction — use persistent scaffold + dynamic overlay
4. Don't load all mapped papers into browser — stream overlay subsets

---

## Layered Maps — The Abstraction Ladder

Four layers of the same corpus, always switchable. Each layer shows different
relationships between the same underlying data. Cross-layer navigation is instant
(same DuckDB-WASM connection, React prop change).

```
  ★ Synthesis   LLM-generated understanding + learning content
       ↑
  ◉ Papers      Citation network + author overlay
       ↑
  ● Chunks      Semantic similarity across passages
       ↑
  ○ Entities    Relations between biomedical concepts
```

| Layer | Nodes | Edges | Key Function |
|-------|-------|-------|-------------|
| **Entities** | Biomedical concepts (genes, drugs, diseases) | PubTator3 relations (treats, inhibits, associates) | Navigate the concept space |
| **Chunks** | Abstract passages (~3 sentences) | Embedding similarity (MedCPT cosine) | Find semantically similar writing |
| **Papers** | Full publications | Citation links (S2, with intent + influence) | Trace evidence chains |
| **Synthesis** | LLM-generated articles + curated lectures | Topic → source links | Learn and teach through the graph |

**Cross-layer navigation:** click an entity → highlight its chunks → highlight its
papers → show its synthesis. Each layer draws from the same PostgreSQL + Parquet
data, projected through different embeddings and layouts.

Extended thinking: `archive/modes_explore.md`

---

## Capabilities — One Fluid Experience

There is no mode toggle. All four capabilities coexist on the same canvas.
The UI adapts to what you're doing — not the other way around.

```
┌────────────────────────────────────────────────────────────────────┐
│                       GRAPH CANVAS (always)                        │
│                                                                    │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌──────────────────┐ │
│  │ EXPLORE  │   │   ASK   │   │  WRITE  │   │      LEARN       │ │
│  │          │   │         │   │         │   │                  │ │
│  │ Navigate │   │ Question│   │ Editor  │   │ Living knowledge │ │
│  │ Filter   │   │ → Graph │   │ → Graph │   │ Curated lectures │ │
│  │ Discover │   │ answer  │   │ evidence│   │ → Graph context  │ │
│  └─────────┘   └─────────┘   └─────────┘   └──────────────────┘ │
│                                                                    │
│  All capabilities available simultaneously. The UI adapts to       │
│  what you're doing — not the other way around.                     │
└────────────────────────────────────────────────────────────────────┘
```

| Capability | What You Do | Graph Response | Data Path |
|-----------|-------------|---------------|-----------|
| **Explore** | Navigate, filter, zoom, click nodes | Full viewport, highlights, detail panels | DuckDB-WASM → Cosmograph |
| **Ask** | Type a question | Cited papers light up as answer streams | MedCPT → pgvector → Gemini → Cosmograph |
| **Write** | Draft text in editor | Supporting + contradicting evidence surfaces | NER + MedCPT → pgvector → dual-signal |
| **Learn** | Click knowledge article or lecture | Content panel opens, sourced nodes illuminate | Synthesis layer + authored content |

### Explore

Navigate the graph directly. Filter by entity type, year, journal, cluster. Zoom
into research communities. Click nodes for detail panels. Switch layers to see the
same corpus through different lenses — entities, chunks, papers, or synthesis. This
is the default state: the graph at full viewport, waiting for you to dig in.

Extended thinking: `archive/modes_explore.md`

### Ask

Type a question in natural language. The question is embedded with MedCPT, matched
against paper embeddings via pgvector HNSW search, and the top-K results feed into
Gemini Flash for synthesis. As the answer streams back, cited papers light up on the
graph — you see the evidence landscape form in real time. Every citation links back
to the specific passage that supports it.

Extended thinking: `archive/modes_ask.md`

### Write

Open the editor panel alongside the graph. As you draft, NER extracts entities from
your text and MedCPT embeds your sentences. The graph responds in two channels:
supporting evidence (high similarity, same direction) glows bright; contradicting
evidence (high citation overlap but distant in embedding space, or NEGATIVE_CORRELATE
/ INHIBIT relations) pulses differently. Type `@` to cite — autocomplete finds the
top-10 semantically similar papers in ~100ms.

Extended thinking: `archive/modes_write.md`

### Learn

Open a knowledge article or lecture. The content panel appears alongside the graph,
and sourced nodes illuminate as you read. By the end, the trail of illumination
forms a fingerprint of what you just learned. See the next section for the full
Learn vision.

Extended thinking: `archive/modes_learn.md`

---

## Learn — Knowledge Through the Graph

Learn makes the graph a teaching and knowledge surface. Two content types serve
different purposes but share the same interaction: content opens in a panel,
sourced nodes light up on the canvas.

| Type | What | Updates | Source |
|------|------|---------|--------|
| **Living Knowledge** | Auto-synthesized articles per entity/term — definition, key findings, open questions, conflicts from corpus evidence | Auto on monthly refresh as new papers ingested | Pipeline + LLM |
| **Curated Lectures** | User-authored educational content anchored to the graph — step-through slide panels that illuminate sourced nodes as you advance | Manual; "N new papers" badges surface new connections since last edit | User authoring |

### Living Knowledge

Every entity and key term gets an auto-generated article: definition, key findings
across the corpus, open questions, and conflicts in the evidence. These articles live
on the Synthesis layer and update automatically during the monthly refresh cycle as
new papers are ingested. They are the graph's self-understanding — what the corpus
knows about each concept, synthesized and kept current.

### Curated Lectures

User-authored educational modules anchored to the graph. A lecture on antipsychotic
pharmacology sits near the receptor entity cluster. As you step through slides, the
graph illuminates sourced and related nodes around you. By the end, the trail of
illumination forms the lecture's fingerprint — a visual map of everything covered.

### Implementation Approaches (Undecided)

```
OPTION A: Graph Nodes                    OPTION B: Wiki Layer
─────────────────────                    ─────────────────────
Content lives AS nodes on                Content lives in SoleMD.Wiki
the Synthesis Map layer.                 (Quartz), linked to graph
Click a node → panel opens               entities by ID.
with knowledge or lecture.

Pros:                                    Pros:
  Position = meaning                       Rich Markdown authoring
  Same renderer, no extra app              Backlinks, tags, search
  Visible on the graph                     Publishable standalone

Cons:                                    Cons:
  Scaling: many articles = many nodes      Separate app, separate nav
  Limited authoring format                 No spatial graph position
```

May combine both — wiki for living knowledge (rich text, auto-updated), graph nodes
for curated lectures (position = meaning, step-through illumination).

### Clinical Education Grounding

This is built by a C-L psychiatrist for cross-specialty knowledge work. Living
knowledge on concepts like delirium (across ICU, surgical, geriatric contexts) or
lithium (across nephrology, cardiology, psychiatry). Curated lectures for trainees
that illuminate the evidence graph as you learn. The graph isn't a visualization
you look at — it's the space you learn in.

---

## Document Index

| Document | Location | Purpose |
|----------|----------|---------|
| **System vision map** | `docs/map/map.md` | This file — capabilities, layers, Learn vision |
| **Data flow** | `docs/map/data.md` | How data flows from external sources to the browser |
| **PubTator3 pipeline** | `docs/map/pubtator3.md` | Entity + relation extraction from NCBI |
| **Semantic Scholar** | `docs/map/semantic-scholar.md` | Papers, citations, embeddings from S2 |
| **Database schema** | `docs/map/database.md` | PostgreSQL tables and indexes |
| **Corpus filter** | `docs/map/corpus-filter.md` | Domain corpus identification via DuckDB |
| **Living graph** | `docs/design/living-graph.md` | Three-layer dynamic data architecture |
| **Architecture** | `docs/map/architecture.md` | Detailed technical architecture |
| **Brand** | `docs/design/brand.md` | Visual identity and design tokens |
| Archive (`docs/archive/`) | `modes_explore.md`, `modes_ask.md`, `modes_write.md`, `modes_learn.md` | Extended thinking — brainstorming, not committed specs |
