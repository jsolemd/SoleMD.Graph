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

## Layered Maps — The Abstraction Ladder

The graph is four maps ascending an abstraction ladder — from atomic concepts to synthesized understanding. Each layer is the visual output of a pipeline stage.

```
ABSTRACTION LADDER

  Synthesis    ★  LLM-generated understanding of canonical terms
                  "What does the corpus know about this concept?"
       ↑
  Papers       ◉  Citation/reference network + author overlay
                  "What's the citation flow? Who wrote what?"
       ↑
  Chunks       ●  Semantic similarity across passages
                  "Where do papers talk to each other?"
       ↑
  Entities     ○  Relations between biomedical concepts
                  "How do these concepts connect?"

  Pipeline:    NER → Chunking → GROBID/Marker → Entity Linking → LLM Synthesis
```

### Layer 1: Entity Map

The concept layer. Nodes are biomedical entities (genes, proteins, drugs, diseases, pathways). Edges are extracted **relations** — upregulates, inhibits, treats, associates with — each carrying assertion status (affirmed/negated/speculative) and directionality.

- **Color by degree** (connection count) — heavily connected entities glow hot, isolates fade. This immediately reveals hub concepts in the corpus. (Reference: [Cosmograph degree-colored example](https://run.cosmograph.app/public/987cf266-fd90-4940-b52d-f75a1e006237))
- **Size by mention count** — how frequently each entity appears across papers
- **Edges encode relation type** — solid for affirmed, dashed for speculative, red for negated, double for conflicting evidence
- **Clusters** form around disease-pathway neighborhoods, drug-target families, or comorbidity networks
- **Functions**: Find hub entities. Trace causal chains. Detect conflicts (Entity A → B affirmed in Paper 1, negated in Paper 2). Discover bridging concepts that connect distant clusters.

### Layer 2: Chunk Map

The passage layer. Nodes are text chunks (RAG segments from papers). Edges are **semantic similarity** — MedCPT/SPECTER2 embedding cosine distance. This is where papers talk to each other at the passage level, even if they never cite one another.

- **Color by parent paper** — see which papers contribute to which regions of semantic space
- **Size by entity density** — chunks rich in named entities are larger
- **Edges encode similarity strength** — thicker lines = more semantically related passages
- **Clusters** form around topical convergences: all the passages about "BDNF and synaptic plasticity" cluster regardless of which paper they came from
- **Functions**: Find semantically similar passages across the corpus. Discover unexpected connections between papers. Identify the most information-dense regions. Power the RAG retrieval visualization ("here's what the LLM pulled from").

### Layer 3: Paper Map (+ Overlays)

The publication layer. Nodes are papers, positioned by embedding similarity (Qwen3 on Marker markdown). Two toggleable overlays add authors and citation edges on top.

**Base map (always on):**

- **Color by journal or publication year** — temporal and source patterns
- **Size by citation count** — heavily cited papers are larger
- **Clusters** form around research communities, methodological schools, or thematic areas
- **Functions**: Find seminal papers. Identify topic clusters. See which papers are bridges between communities.

**Overlay toggles:**

```
┌──────────────────────────────────────────────────────┐
│  Paper Map                  [◉ References] [◉ Authors]│  ← Toolbar toggles
└──────────────────────────────────────────────────────┘
```

**References overlay** (`paper_links` table):
- Toggling on passes `links="paper_links"` to Cosmograph; toggling off passes `links={undefined}`
- **Arrows** from citing paper → cited paper, showing the flow of ideas through the literature
- **Link opacity** kept low (~0.25) to avoid edge spaghetti at scale
- **Curved links** for readability when many edges overlap
- **Functions with edges visible**: Trace citation chains. Detect citation gaps (papers that should cite each other but don't). Map the evolution of a research area over time. See which papers are bridges between communities.

**Author overlay** (additional rows in `paper_points` with `nodeType="author"`):
- Toggling on includes author rows in the view; toggling off filters them out via the dashboard store
- **Positioned at centroid** of their papers (no separate embedding — position derived from the papers they wrote)
- **Authorship edges** connect authors to their papers
- **Co-authorship** emerges naturally — authors who share papers are close because their papers are close
- **Author size** by paper count or citation sum
- **Author color** by primary topic cluster (derived from dominant cluster of their papers)
- Clicking an author highlights all their papers (and citation edges if references overlay is also on)
- Styled differently from paper nodes via `pointSizeByFn` / `pointColorByFn` accessor functions keyed on `nodeType`

Both overlays can be on simultaneously — you see papers, the citation network between them, and the authors who wrote them, all in one view.

### Layer 4: Synthesis Map (Learn Mode)

The understanding layer. Nodes are **canonical terms** (UMLS concepts) with **LLM-generated synthesis** — auto-generated living summaries of everything the corpus knows about each concept. Each synthesis node aggregates all entities, chunks, and papers that resolve to that canonical term, then an LLM produces a structured synthesis: definition, key findings, open questions, conflicts in the evidence.

- **Positioned by term embedding** — SapBERT embeddings of canonical terms, so related concepts cluster naturally (all dopamine receptors near each other, all SSRIs near each other)
- **Size by evidence mass** — how many entities, chunks, and papers feed into this term's synthesis
- **Color by UMLS semantic group** — disorders, chemicals, genes, procedures, etc.
- **Edges** — UMLS hierarchical relations (is-a, part-of) plus corpus-derived co-occurrence
- **Functions**: See what the corpus knows about any concept. Find where evidence is rich vs thin. Discover conflicts (different papers contradict on the same term). Browse the vocabulary landscape of the entire corpus at a glance.

**What a synthesis node contains:**

Clicking a synthesis node opens a side panel with:

```
╭─────────────────────────────────────────────────╮
│  Brain-Derived Neurotrophic Factor (BDNF)       │
│  UMLS: C0107103 · Semantic: Amino Acid/Peptide  │
│  ────────────────────────────────────────────── │
│                                                  │
│  SYNTHESIS (LLM-generated)                       │
│  BDNF is a neurotrophin critical for synaptic   │
│  plasticity and neuronal survival. The corpus    │
│  contains 42 mentions across 12 papers...        │
│                                                  │
│  KEY FINDINGS                                    │
│  • Reduced BDNF in MDD (Smith 2024, Jones 2023) │
│  • TrkB signaling mediates antidepressant...     │
│                                                  │
│  CONFLICTS                                       │
│  • Serum vs brain BDNF correlation disputed...   │
│                                                  │
│  CONNECTED ENTITIES (14)                         │
│  TrkB · p75NTR · MDD · synaptic plasticity ·... │
│                                                  │
│  SOURCE PAPERS (12)                              │
│  Smith 2024 · Jones 2023 · ...                   │
╰─────────────────────────────────────────────────╯
```

The synthesis is regenerated when new papers are ingested. Each term's synthesis is grounded — every claim traces back to specific chunks and papers. The graph illuminates sourced nodes when browsing a synthesis (same pattern as Learn mode step-through).

**Learning modules** (lectures, walkthroughs, case studies) also live on this layer as a distinct node type. They are authored content positioned by embedding near the terms they teach about. Clicking a module opens a step-through slide deck in the side panel, with graph illumination per slide (sourced nodes glow bright, related nodes dim-glow). See [Learn Mode](learn.md) for full details.

**Why this is the capstone layer:**

```
Entities  →  Chunks  →  Papers (+Authors)  →  Synthesis
(concepts)   (passages)  (studies + people)    (understanding)

Pipeline extracts structure.
LLM synthesizes understanding.
Synthesis layer makes both visible.
```

### Layer Switching

The layer selector is a first-class control in Explore mode. Switching layers is not zooming — it's changing the entire map. The viewport position and any active filters carry over where meaningful (e.g., filtering by date range applies to all layers).

```
┌──────────────────────────────────────────────────────┐
│  ○ Entities   ● Chunks   ○ Papers   ○ Synthesis     │  ← Layer selector
└──────────────────────────────────────────────────────┘
```

Each layer is a separate table in the **same DuckDB connection** (one `AsyncDuckDB` instance). Switching layers is a React prop change — Cosmograph rebuilds automatically. No remounting, no reconnection. See [architecture.md: Layer Switching](architecture.md#layer-switching--multiple-maps-in-one-connection) for implementation details.

**How it works technically:**
1. Pipeline generates all layer tables into one DuckDB bundle file
2. `duckdb.ts` loads the bundle once — all tables available immediately
3. Dashboard store tracks `activeLayer: MapLayer`
4. `LAYER_CONFIGS` registry maps each layer to its table name + visual defaults
5. `CosmographRenderer` reads active layer config, passes `points={config.pointsTable}` + `links={config.linksTable}`
6. Cosmograph fires `onGraphRebuilt` → `fitView(0)` centers the new layout
7. Store resets filters/selection on layer change (different data schema)

### Cross-Layer Navigation

Layers aren't silos. Clicking a node in any layer can highlight related nodes in any other layer:

```
ENTITIES          CHUNKS            PAPERS (+AUTHORS)     SYNTHESIS
────────          ──────            ─────────────────     ─────────
Click "BDNF"  →   Highlight     →   Highlight papers  →   Show BDNF
                   chunks with       containing BDNF       synthesis
                   BDNF              (+ their authors)     node

              ←   Click chunk   ←   Click paper        ←  Click term
Show entities     Show parent       Show all chunks        Show all
in this chunk     paper             from this paper        connected
                                                           evidence
```

### Pipeline Full Circle

This layered architecture is the **visual expression of the SoleMD pipeline**, with the synthesis layer closing the loop from raw data to understanding:

```
Pipeline:       PDF → GROBID/Marker → RAG Chunking → NER → RelEx → Entity Linking → LLM Synthesis
                          ↓                ↓           ↓      ↓          ↓                ↓
Map Layer:           Paper Map        Chunk Map    Entity Map  (edges)  Synthesis Map  Synthesis (content)
                     + Authors
                     (overlay)
```

Every stage of the extraction pipeline produces a map layer. The synthesis layer adds LLM-generated understanding on top — canonical terms with auto-generated summaries of everything the corpus knows about them, plus authored teaching modules. The graph interface is not a separate product — it IS the pipeline's output, made explorable and teachable.

### Embedding Strategy — Making the Maps Speak

Each layer needs a different embedding strategy because each layer has different semantics. Entities are defined by *relationships*, chunks by *content*, papers by *both content and citations*. A single embedding model cannot serve all three. The goal is UMAP layouts where visual clusters are meaningful — not just retrieval accuracy.

**Per-layer embedding stack:**

| Layer | Text Embedding | Graph Embedding | Hybrid Weight | UMAP Input |
|-------|---------------|----------------|---------------|------------|
| **Entity** | SapBERT (entity names → UMLS-aligned vectors) | **RotatE** on extracted relation edges | Graph-heavy (70/30) | Concatenated |
| **Chunk** | **Qwen3-Embedding-0.6B** (passage text, instruction-aware) | GGVec on similarity edges | Text-heavy (70/30) | Concatenated |
| **Paper** | **Qwen3-Embedding-0.6B** (Marker markdown, 32K context) | GGVec on citation graph | Roughly equal (50/50) | Concatenated |
| **Synthesis** | SapBERT (canonical term names → UMLS-aligned) | GGVec on UMLS hierarchy + co-occurrence | Graph-heavy (60/40) | Concatenated |

Authors have no separate embedding — they are positioned at the centroid of their papers' coordinates on the Paper Map.

**Why these specific models:**

**Entity layer — RotatE (primary) + SapBERT (secondary)**
Entities are defined by their connections, not their names. RotatE embeds knowledge graph triples (BDNF → upregulates → TrkB) into a rotational complex space. Research shows translational/rotational KGE models (TransE, RotatE) produce **dramatically better UMAP clusters** than multiplicative models (ComplEx, DistMult — which collapse into a globular blob around the origin). RotatE specifically handles the relation types our pipeline extracts: symmetric (co-occurs), antisymmetric (inhibits), compositional (A→B→C chains). SapBERT adds UMLS-aligned semantic similarity so entities with similar names/concepts cluster even without direct edges.

**Chunk layer — Qwen3-Embedding-0.6B (primary) + GGVec (secondary)**
Chunks are defined by what they say. Qwen3-Embedding is the strongest choice here because:
- **Instruction-aware**: Prompt with `"cluster these biomedical passages by topic"` — produces different embedding geometry than retrieval-optimized models like MedCPT. Clustering is an explicit training objective, not a side effect.
- **Matryoshka Representation Learning (MRL)**: Truncate from 4096→256 dims post-training with minimal quality loss. Lets us tune UMAP input dimensionality without retraining.
- **0.6B model** is fast enough for large corpora while maintaining MTEB-competitive quality.
GGVec adds structural signal from chunk-to-chunk similarity edges (co-citation, shared entities).

**Paper layer — Qwen3-Embedding-0.6B on Marker markdown (primary) + GGVec (secondary)**
Papers get the richest text input: **Marker markdown** gives us the full document text, not just title+abstract. SPECTER2 is limited to ~512 tokens (title+abstract). Qwen3-Embedding's 32K context window can ingest entire papers — sections, methods, results, discussion — producing embeddings that capture the full thematic fingerprint. This means papers cluster by *what they actually contain*, not just what their abstracts promise.

```
SPECTER2 sees:     "BDNF modulates synaptic plasticity in hippocampal neurons..."  (abstract)
Qwen3 sees:        Full methods, results tables, discussion, limitations, future directions  (Marker markdown)
```

GGVec on the citation graph adds bibliometric structure — papers that cite each other or share citation neighborhoods pull closer even if their content diverges.

> **MedCPT and SPECTER2 stay for RAG retrieval.** Different embeddings for different jobs. The retrieval pipeline optimizes for nearest-neighbor precision; the graph layout optimizes for meaningful visual clustering. These are fundamentally different objectives.

**The hybrid concatenation approach:**

```
For each layer:
  1. Generate text embedding  →  vec_text (e.g., 768-dim SapBERT or 1024-dim Qwen3)
  2. Generate graph embedding →  vec_graph (e.g., 256-dim RotatE or 128-dim GGVec)
  3. Normalize each vector independently
  4. Concatenate with layer-specific weighting:
       entity_vec = 0.3 * vec_text ⊕ 0.7 * vec_graph
       chunk_vec  = 0.7 * vec_text ⊕ 0.3 * vec_graph
       paper_vec  = 0.5 * vec_text ⊕ 0.5 * vec_graph
  5. UMAP(combined_vec) → 2D layout coordinates
```

Research shows hybrid text+graph embeddings achieve ~0.93 silhouette scores — significantly outperforming either modality alone.

**Pre-UMAP processing (critical for layout quality):**
- **Mean-center** all embeddings before UMAP (prevents anisotropic blob where all vectors cluster in a narrow cone)
- **PCA to 50–100 dims** before UMAP (reduces hubness — some points becoming nearest-neighbor to everything)
- **UMAP params**: `n_neighbors=30+`, `min_dist=0.1–0.3` for visualization; `min_dist=0.0` for tighter downstream clustering
- UMAP preserves **local** structure faithfully but distorts **global** distances — inter-cluster distances on the plot are not reliable distance measures

**Full pipeline → embedding → map flow:**

```
Pipeline Stage            Text Source                Text Model              Graph Model            Map
──────────────            ───────────                ──────────              ───────────            ───
PDF → Marker              Marker markdown (full)     Qwen3-Emb-0.6B (32K)   GGVec (citations)      Paper Map
  (+ metadata)            (authors → centroid)       (no separate emb)       (authorship edges)     (+ Author overlay)
Marker → RAG Chunking     Chunk text                 Qwen3-Emb-0.6B         GGVec (sim edges)      Chunk Map
Chunks → NER              Entity names/desc          SapBERT (UMLS-aligned)  —                      Entity Map
NER → RelEx               —                          —                       RotatE (relations)     Entity Map (edges)
Entity Linking → LLM      Canonical term names       SapBERT                 GGVec (UMLS + co-occ)  Synthesis Map
```

### Pre-UMAP Processing (Pipeline Side)

Cosmograph has **no built-in UMAP**. All dimensionality reduction happens in the SoleMD.App Python pipeline. The output is `x` and `y` columns stored in the DuckDB bundle, consumed by Cosmograph with `enableSimulation: false`.

**Processing steps (applied before UMAP):**

| Step | Why | How |
|------|-----|-----|
| **Mean-center** | Prevents anisotropic blob (all vectors in a narrow cone → one big UMAP cluster) | `embeddings -= embeddings.mean(axis=0)` |
| **L2 normalize** | Ensures cosine and euclidean metrics agree; stabilizes UMAP | `embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)` |
| **PCA to 50–100 dims** | Reduces hubness (some points becoming nearest-neighbor to everything, distorting UMAP). Also speeds up UMAP significantly | `sklearn.decomposition.PCA(n_components=50)` |
| **UMAP** | 2D layout coordinates | `umap.UMAP(...)` with layer-specific params |

**UMAP parameters per layer:**

| Parameter | Entity Map | Chunk Map | Paper Map | Why |
|-----------|-----------|-----------|-----------|-----|
| `n_neighbors` | 30 | 30 | 15 | Higher = broader clusters. Papers have fewer nodes, so lower n_neighbors |
| `min_dist` | 0.15 | 0.2 | 0.25 | Lower = tighter clusters. Entities need tight clusters to show hub neighborhoods |
| `spread` | 1.0 | 1.0 | 1.5 | Higher = more space between clusters. Papers benefit from breathing room |
| `metric` | `cosine` | `cosine` | `cosine` | Standard for embedding similarity |
| `random_state` | 42 | 42 | 42 | Reproducible layouts across bundle builds |

**Key insight**: UMAP preserves **local** structure faithfully but **distorts global distances**. Inter-cluster distances on the plot are not reliable — only within-cluster relationships are meaningful. This is fine for exploration (clusters are real, distances between clusters are not).

### Cosmograph Visual Tuning — Making It Beautiful

The Cosmograph renderer has no glow shader, no bloom, no anti-aliasing controls. The "glow" in Cosmograph showcases comes from **density + low opacity** — semi-transparent overlapping points create an additive blending illusion on dark backgrounds.

**Current SoleMD.Web settings vs recommended tuning:**

| Property | Current | Recommended | Why |
|----------|---------|-------------|-----|
| `pointOpacity` | `1.0` (default) | **`0.65` (dark) / `0.8` (light)** | Creates soft luminous clusters. Dense regions glow organically. Single biggest visual improvement |
| `pointSizeRange` | `[1, 4]` | **`[1, 6]`** | More visual hierarchy — important nodes stand out, tiny nodes recede |
| `pointGreyoutOpacity` | `0.15`/`0.25` | Keep as-is | Already good focus-vs-context distinction |
| `renderHoveredPointRing` | configurable | **`true`** always | Ring gives clear hover feedback |
| `hoveredPointRingColor` | brand accent | **mode accent color** | Ties hover to current mode identity |
| `focusedPointRingColor` | (not set) | **mode accent color** | Consistent with hover ring |
| `showDynamicLabelsLimit` | `30` | `20–25` | Fewer labels = cleaner canvas |
| `showTopLabelsLimit` | `20` | `15` | Let the graph breathe |
| `pointLabelFontSize` | `11` | Keep | Small and unobtrusive |
| `scalePointsOnZoom` | `false` | Keep `false` | Points at constant size = cleaner zoom behavior |

**Per-layer visual config (future — when layer switching lands):**

| Property | Entity Map | Chunk Map | Paper Map |
|----------|-----------|-----------|-----------|
| `pointColorStrategy` | **`"degree"`** | `"categorical"` (by cluster) | `"categorical"` (by journal/year) |
| `pointSizeStrategy` | `"degree"` (connection count) | `"auto"` (entity density) | `"auto"` (citation count) |
| `pointSizeRange` | `[2, 8]` | `[1, 5]` | `[2, 10]` |
| `pointOpacity` | `0.7` | `0.6` | `0.8` |
| `renderLinks` | `true` | `false` (too many sim edges) | `true` |
| `curvedLinks` | `true` | — | `true` |
| `curvedLinkWeight` | `0.5` | — | `0.6` |
| `linkOpacity` | `0.3` | — | `0.25` |
| `linkDefaultArrows` | `false` (undirected relations) | — | `true` (citation direction) |
| `linkVisibilityDistanceRange` | `[50, 150]` | — | `[50, 200]` |
| `linkVisibilityMinTransparency` | `0.15` | — | `0.1` |

**Key aesthetic principles for Cosmograph:**

1. **Dark mode is dramatically better** — WebGL additive blending on `#111113` creates natural glow. Light mode is functional but less striking
2. **Density + low opacity = organic glow** — With 3K+ points at `pointOpacity: 0.6`, dense clusters glow without any shader. This is the "Cosmograph look"
3. **Color restraint** — 6–8 desaturated pastels, never high-saturation primaries. Our `CLUSTER_PALETTE` already follows this
4. **Curved links for relationship graphs** — `curvedLinks: true` with `curvedLinkWeight: 0.5` and low `linkOpacity: 0.3` produces elegant arcs
5. **Label restraint** — Fewer labels = more graph. Let hover labels do the heavy lifting
6. **Size hierarchy matters** — Wider `pointSizeRange` creates visual importance without clutter. Entity hub nodes should be noticeably larger than leaf nodes
7. **Greyed-out contrast is critical** — During selection, background must fade enough to create focus (`0.15` dark / `0.25` light) but not disappear entirely

**Properties available but not yet used (for future enhancement):**
- `pointColorByMap` with `"map"` strategy — exact per-value color control for entity categories
- `linkArrowsSizeScale` — tune arrow size on citation edges
- `customLabels` — annotation overlays independent of data points
- `pointLabelWeightBy` — label priority ranking (use degree or mention count)
- `focusedPointRingColor` — set to mode accent for consistent identity

---

## Progressive Depth (Within a Layer)

Independent of layer switching, each layer supports drill-down into individual nodes:

```
OVERVIEW          FOCUS              DETAIL              EVIDENCE
────────          ─────              ──────              ────────

○ ○ ○   →   ┌──────┐   →   ┌──┬──┐   →   "actual text
○ ○ ○        │ node │        │  │  │        from the paper
○ ○ ○        │ hood │        └──┴──┘        with entities,
             └──────┘        neighbors      values, and
                                            provenance"

"What's the    "What's        "Who are        "Show me the
 landscape?"    around this?"  its neighbors?"  evidence."
```

- **Hover** a node → neighborhood highlights
- **Click** a node → detail panel with type-specific card
- **Double-click** → progressive zoom into subgraph (e.g., a paper explodes into its chunks)

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
| MVP | Full-viewport graph (chunk map), search, timeline, node filters, detail panels |
| Phase 1.5 | **Detail panel cross-linking** — interactive elements in the selection panel |
| Phase 2 | **Layered maps** — entity map (degree-colored, relation edges) + paper map (citation edges) + layer switcher |
| Phase 2.5 | **Cross-layer navigation** — click entity → highlight chunks → highlight papers |
| Phase 3 | Literature review (citation network analysis, gap detection), entity explorer |

### Phase 1.5: Detail Panel Cross-Linking

The selection panel should be interactive, not just a read-only card. Clicking elements in the panel should drive the canvas:

- **Author click → highlight**: Query DuckDB for all point indices where `citekey` matches any paper by that author, then `cosmograph.selectPoints(indices)`. The canvas highlights all chunks from that author's papers.
- **Related chunk click → navigate**: Look up the exemplar's `ragChunkId` in the points table to get its index, then `cosmograph.selectPoint(index)` + `cosmograph.zoomToPoint(index)`. The canvas flies to that chunk and opens its detail panel.
- **Cluster badge click → filter**: Select all points in the same cluster via `cosmograph.getPointIndicesByExactValues('clusterId', [id])`, highlighting the full cluster.
- **DOI/PubMed/PMC links** already open externally — these stay as-is.

**Implementation needs:**
1. Expose cosmograph ref to DetailPanel (via context or Zustand, not prop drilling)
2. Add `getPointIndexByRagChunkId(id)` query helper to `GraphBundleQueries`
3. Add `getPointIndicesByAuthor(name)` query helper (joins through citekey/paperId)
4. Style clickable elements as subtle interactive text (underline on hover, cursor pointer)
