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
in [future.md](../design/future.md). The graph delivery contract for `base`,
`universe`, and `evidence` bundle data lives in [bundle-contract.md](bundle-contract.md).

---

## The Living Graph — Current Runtime Structure

The browser now boots from a true base scaffold, not the broader premapped
universe.

`base_points.parquet` contains the current run's opening scaffold, while the
broader premapped tail is exported separately as `universe_points.parquet`.
Cosmograph still renders directly from DuckDB table names, but the mandatory
first-load cost is now tied to the base scaffold rather than the entire mapped
universe.

What changes during interaction is still native DuckDB/Cosmograph visibility
state, but the current runtime boundary is now:

- base scaffold autoloaded on first paint
- universe premapped artifact present in the bundle manifest but not autoloaded
- overlay activation now has a native DuckDB surface:
  `overlay_point_ids_by_producer` -> `overlay_point_ids` -> `active_points_web`
- persistent selection is also DuckDB-native:
  `selected_point_indices` is materialized from live Cosmograph clauses
- base and universe remain Parquet-backed projection views instead of being
  copied into browser-local temp point tables at startup
- universe document and exemplar artifacts attached only when detail queries ask
  for them
- evidence/server retrieval for anything unmapped or too heavy for browser-local delivery

### Three Nested Data Layers

```
┌─────────────────────────────────────────────────────────────┐
│  DATABASE UNIVERSE (~14M papers)                            │
│  Full corpus membership + metadata + retrieval substrate.   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PREMAPPED UNIVERSE                                   │  │
│  │  Engine/export-defined mapped points for one run      │  │
│  │  Split into base scaffold + universe tail             │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  BASE SCAFFOLD                                 │  │  │
│  │  │  `base_points.parquet`                          │  │  │
│  │  │  Stable opening scaffold                         │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │  ACTIVE CANVAS                                   │  │  │
│  │  │  Base + any promoted overlay                     │  │  │
│  │  │  Native filter + timeline + budget state         │  │  │
│  │  │  over the local active point table               │  │  │
│  │  │                                                  │  │  │
│  │  │  Universe activation enlarges this set          │  │  │
│  │  │  without changing the shared UMAP manifold       │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│  + Universe/evidence detail paths for richer paper evidence │
└─────────────────────────────────────────────────────────────┘
```

### How the Graph Responds

| User Action | Graph Response |
|-------------|---------------|
| Filter by year / journal / cluster | Cosmograph updates native visibility clauses; panels and summaries query the same scoped DuckDB state |
| Search for a paper or concept | DuckDB resolves a seed point, then a local visibility-budget query emphasizes a seed-centered neighborhood |
| Click a point | Persistent selection stays separate from the current visibility scope |
| Ask / fetch evidence | Evidence or server-side retrieval can illuminate mapped papers, but does not redefine the browser's base/universe contract |

### Two Embedding Spaces

| Embedding | Model | Purpose | Scope |
|-----------|-------|---------|-------|
| SPECTER2 | Pre-computed by S2 | Map geometry — UMAP layout, cluster structure | Mapped universe (3-5M) |
| MedCPT | Self-embedded | Semantic retrieval — search, RAG, @ autocomplete | Full database (14M) |

### Key Constraints

1. Every visible paper needs pre-computed UMAP x/y from a single run
2. All coordinates from same UMAP run (can't merge separate runs)
3. Browser-side DuckDB should query and scope the exported run, not rebuild
   renderability, indices, or links
4. Dynamic visibility must use native Cosmograph filtering / greyout / selection
   over local base points, not a second JS visibility engine
5. First paint should avoid full-point JS hydration; targeted universe detail
   loads are acceptable, full point-array hydration is not

### Current implementation note

- The current bundle is canonical `v4`
- Default first-load artifacts are:
  - `base_points.parquet`
  - `base_clusters.parquet`
- Universe premapped artifact:
  - `universe_points.parquet`
- `universe_links.parquet` is not part of the default publish path
- base admission is decided upstream and exported as `is_in_base` / `base_rank`
- upstream base admission is now staged as:
  raw evidence -> `paper_evidence_summary` -> `graph_base_features` -> export
- the graph build itself now stages:
  embeddings -> PCA layout matrix -> shared kNN -> coordinates / clusters -> export
- the browser only consumes the canonical `base`, `universe`, `active`, and
  `evidence` contract
- first paint now comes from `base_points`, not from a client-side
  visibility clause
- the base point table is the base scaffold itself
- the broader premapped universe is preserved as a separate universe artifact, not
  autoloaded on startup
- the active canvas is a local DuckDB + Cosmograph runtime state
- the active canvas keeps the exported base index range intact and appends only
  promoted overlay rows with new dense indices
- corpus first paint stays DuckDB-native and no longer relies on a full
  point-array metadata hydration step

---

## Layered Maps — The Abstraction Ladder

This remains the product abstraction ladder, not the fully shipped runtime.
Today’s implementation is the paper graph with DuckDB-local querying and
Cosmograph rendering. Additional layers below are the intended model for future
expansion.

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

**Cross-layer navigation target:** click an entity → highlight its chunks →
highlight its papers → show its synthesis. Each layer draws from the same
PostgreSQL + Parquet data, projected through different embeddings and layouts.

Current note:

- the shipped runtime today is the paper point cloud
- queryable citation neighborhoods remain a later universe/evidence path, not default
  always-on edge rendering

Extended thinking: `archive/modes_explore.md`

---

## Capabilities — One Fluid Experience

This section is the product direction. The current implementation has the graph
canvas, local search/filter/detail workflows, and the bundle/runtime structure
described above. Ask / Write / Learn remain architectural targets that should be
built on top of the same graph substrate.

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
│  Target: all capabilities available through one graph substrate.   │
│  Current runtime: Explore is implemented first.                    │
└────────────────────────────────────────────────────────────────────┘
```

| Capability | Status | What You Do | Graph Response | Data Path |
|-----------|--------|-------------|---------------|-----------|
| **Explore** | Current | Navigate, filter, zoom, click nodes | Full viewport, highlights, detail panels | DuckDB-WASM → Cosmograph |
| **Ask** | Planned | Type a question | Cited papers light up as answer streams | MedCPT → pgvector → Gemini → graph highlight |
| **Write** | Planned | Draft text in editor | Supporting + contradicting evidence surfaces | NER + MedCPT → pgvector → dual-signal |
| **Learn** | Planned | Click knowledge article or lecture | Content panel opens, sourced nodes illuminate | Synthesis layer + authored content |

### Explore

Navigate the graph directly. Filter by entity type, year, journal, cluster. Zoom
into research communities. Click nodes for detail panels. The current runtime is
the paper graph and its local DuckDB query surface; additional layers remain a
planned expansion on top of that substrate. This is the default state: the graph
at full viewport, waiting for you to dig in.

Extended thinking: `archive/modes_explore.md`

### Ask

Target workflow:

Type a question in natural language. The question is embedded with MedCPT, matched
against paper embeddings via pgvector HNSW search, and the top-K results feed into
Gemini Flash for synthesis. As the answer streams back, cited papers light up on the
graph — you see the evidence landscape form in real time. Every citation links back
to the specific passage that supports it.

Extended thinking: `archive/modes_ask.md`

### Write

Target workflow:

Open the editor panel alongside the graph. As you draft, NER extracts entities from
your text and MedCPT embeds your sentences. The graph responds in two channels:
supporting evidence (high similarity, same direction) glows bright; contradicting
evidence (high citation overlap but distant in embedding space, or NEGATIVE_CORRELATE
/ INHIBIT relations) pulses differently. Type `@` to cite — autocomplete finds the
top-10 semantically similar papers in ~100ms.

Extended thinking: `archive/modes_write.md`

### Learn

Target workflow:

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
| **Base admission** | `docs/map/database.md` | Direct evidence + curated base journal families |
| **Living graph** | `docs/design/living-graph.md` | Three-layer dynamic data architecture |
| **Architecture** | `docs/map/architecture.md` | Detailed technical architecture |
| **Brand** | `docs/design/brand.md` | Visual identity and design tokens |
| Archive (`docs/archive/`) | `modes_explore.md`, `modes_ask.md`, `modes_write.md`, `modes_learn.md` | Extended thinking — brainstorming, not committed specs |
