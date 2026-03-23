# The Living Graph — Dynamic Data Architecture

> The graph always shows ~2M papers. But WHICH 2M changes based on what you're
> exploring. Papers flow in and out of the visible canvas, drawn from a larger
> pre-mapped universe. The graph feels alive.

---

## Three Nested Data Layers

```
┌───────────────────────────────────────────────────────────────────────┐
│  DATABASE UNIVERSE  (~14M papers)                                     │
│                                                                       │
│  Every paper matching our two-signal domain filter.                   │
│  Full metadata from S2 bulk. MedCPT embeddings for semantic search.  │
│  PubTator3 entity annotations (318M) + relations (24.7M).           │
│  Storage: solemd.corpus + solemd.papers + pubtator.*                 │
│                                                                       │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  MAPPED UNIVERSE  (3-5M papers, is_mapped = true)             │   │
│  │                                                               │   │
│  │  SPECTER2 embedding + UMAP 2D coordinates pre-computed.      │   │
│  │  These papers HAVE positions on the map — they can appear     │   │
│  │  on the canvas instantly when relevant.                       │   │
│  │  Storage: solemd.graph (x, y, cluster_id)                    │   │
│  │                                                               │   │
│  │  ┌───────────────────────────────────────────────────────┐   │   │
│  │  │  ACTIVE CANVAS  (~2M papers at any time)              │   │   │
│  │  │                                                       │   │   │
│  │  │  Currently loaded in browser + rendered by Cosmograph │   │   │
│  │  │  via DuckDB-WASM Parquet bundle.                      │   │   │
│  │  │                                                       │   │   │
│  │  │  ┌───────────────────────────────────────────────┐   │   │   │
│  │  │  │  BASELINE  (~1.85M, is_default_visible=true) │   │   │   │
│  │  │  │                                               │   │   │   │
│  │  │  │  Core neuro/psych papers. Always visible.     │   │   │   │
│  │  │  │  Stable scaffold that doesn't change between  │   │   │   │
│  │  │  │  interactions. Quality-filtered via            │   │   │   │
│  │  │  │  graph_papers VIEW.                           │   │   │   │
│  │  │  └───────────────────────────────────────────────┘   │   │   │
│  │  │                                                       │   │   │
│  │  │  + DYNAMIC OVERLAY (0-200K papers from reservoir)     │   │   │
│  │  │    Streamed in based on user actions.                  │   │   │
│  │  │    Pre-mapped, so they have coordinates.               │   │   │
│  │  └───────────────────────────────────────────────────────┘   │   │
│  └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  + DETAIL PANEL (any of 14M papers)                                  │
│    Side panel for papers without coordinates.                        │
│    MedCPT retrieval reaches the full database.                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## User Interaction Examples

### 1. Filter by "delirium + critical care"

```
User clicks filter → "delirium" entity + "critical care" venue
  → DuckDB query against mapped universe: is_mapped=true AND venue LIKE '%crit%'
  → ~5K critical care papers with pre-computed UMAP coordinates
  → Stream into active canvas as overlay points
  → Appear near existing delirium cluster (SPECTER2 placed them there)
  → Baseline unchanged — overlay adds to it
```

### 2. Write about "lithium nephrotoxicity"

```
User types in editor → NER extracts "lithium", "nephrotoxicity"
  → MedCPT embeds query → pgvector HNSW search across full 14M
  → Top-K results split:
    - Papers with is_mapped=true → light up on canvas (they have coordinates)
    - Papers without coordinates → show in detail side panel
  → Supporting evidence glows bright, contradicting evidence pulses differently
```

### 3. Explore a psycho-oncology cluster

```
User zooms into a Leiden cluster labeled "psycho-oncology"
  → System detects focus area → queries mapped reservoir for related papers
  → Pre-mapped oncology bridge papers (is_mapped=true, is_default_visible=false)
  → Flow onto canvas near the cluster — they were UMAP-placed in context
  → User sees the cluster grow richer as they explore
```

### 4. Ask "what treats ICU delirium?"

```
User types question → MedCPT encodes → pgvector retrieves from ALL 14M
  → Top-K feed into Gemini Flash for synthesis
  → As answer streams, cited papers with coordinates illuminate on canvas
  → Papers without coordinates listed with links in answer panel
```

---

## Two Embedding Spaces

| Embedding | Model | Dimension | Purpose | Scope |
|-----------|-------|-----------|---------|-------|
| **SPECTER2** | Pre-computed by S2 | 768 | Map geometry — UMAP layout, cluster structure. Citation-aware: papers that cite each other cluster together. | Mapped universe (3-5M) |
| **MedCPT** | Self-embedded | 768 | Semantic retrieval — search, RAG, @ autocomplete. Query-document architecture — question through query encoder, chunks through document encoder. | Full database (14M) |

**Why two?** SPECTER2 is optimized for paper-paper similarity (good for layout). MedCPT is optimized for query-document matching (good for search). Using one for both would compromise either layout quality or retrieval accuracy.

---

## Architectural Constraints

1. **Single UMAP run**: Every visible paper needs pre-computed x/y from the same UMAP run. Can't merge coordinates from separate runs — the manifold would be inconsistent.

2. **Coordinate stability**: The baseline scaffold (~1.85M papers) must be stable across sessions. Users develop spatial memory ("delirium is in the upper right"). Overlay papers are placed within the same coordinate space during the initial UMAP run.

3. **Browser memory budget**: Cosmograph handles ~2M points well on modern GPUs. Loading all 5M mapped papers would exceed WebGL buffer limits. The overlay pattern keeps the active set manageable.

4. **Streaming, not bulk**: Overlay papers stream in as small DuckDB query results, not as a full Parquet reload. The existing DuckDB-WASM connection handles this — same architecture as current crossfilter queries.

---

## Implementation Pattern: DuckDB Bundle Architecture

The living graph builds on the existing Parquet bundle pipeline:

```
Phase 2 (baseline):
  GPU UMAP on ~1.85M quality-filtered papers → x, y coordinates
  Leiden clustering → cluster_id, cluster_label
  Export: corpus_points.parquet (baseline bundle)
  DuckDB-WASM loads bundle → Cosmograph renders

Phase 2+ (mapped reservoir):
  GPU UMAP on full mapped universe (3-5M) in SAME run as baseline
  Additional papers stored with is_mapped=true, is_default_visible=false
  Export: reservoir_points.parquet (overlay bundle, served separately)
  DuckDB-WASM loads on demand → Cosmograph adds overlay points
```

Key: the baseline and reservoir are from the **same UMAP run**. Reservoir papers have coordinates that are consistent with the baseline manifold.

---

## Mapped Universe Sizing

| Category | Papers | Source |
|----------|--------|--------|
| Graph tier (core journals) | ~1.98M | journal_match + pattern_match + journal_and_vocab |
| Venue-rule additions | ~38K | solemd.venue_rule (specialty venues) |
| Quality-filtered baseline | ~1.85M | graph_papers VIEW |
| Phase 1.5 overlay reservoir | ~1-3M | Top candidate papers by PMI score |
| **Total mapped universe** | **~3-5M** | All embedded in same UMAP run |

---

## Phase 2 Implementation Path

1. **SPECTER2 embedding retrieval** — S2 Batch API for ~1.98M graph-tier papers
2. **GPU UMAP** — cuML UMAP on SPECTER2 vectors → 2D coordinates
3. **Leiden clustering** — community detection → cluster labels via LLM
4. **Baseline Parquet bundle** — export quality-filtered papers with coordinates
5. **DuckDB-WASM + Cosmograph** — render baseline (~1.85M points)
6. **Reservoir embedding** — extend UMAP to include top candidate papers (Phase 1.5)
7. **Overlay streaming** — DuckDB queries against reservoir bundle on user actions
8. **State management** — track is_mapped / is_default_visible per paper

---

## Phase 2 Consideration: Concept Node Pinning

Promoting papers via entity rules (Step 3d) ensures papers about aggression, anhedonia, frontostriatal circuits, etc. are in the graph tier and will eventually get UMAP coordinates. But for the **concepts themselves** to be visually prominent on the canvas, we need concept-level visual anchors.

**Problem**: A user filtering aggressively (by year, publication type, venue) might temporarily hide all papers in the "aggression" cluster. The concept becomes invisible even though it's central to the domain.

**Solution: Exemplar pinning in the Parquet bundle**

Pin term-layer exemplar nodes for key behavioral and circuit concepts:

1. **Exemplar selection**: For each entity_rule concept, find the highest-citation-count representative paper in the graph tier that has that entity annotation. This paper becomes the "exemplar" for that concept.

2. **Pin flag**: Add `is_pinned BOOLEAN` to the Parquet bundle schema. Pinned nodes are always rendered by Cosmograph regardless of active filters.

3. **Visual treatment**: Pinned exemplars get a distinct visual treatment (different shape, persistent label, slightly larger size) so they serve as landmarks. "Aggression is near the upper-left, next to the impulsivity cluster."

4. **Synthetic nodes (alternative)**: Instead of pinning real papers, create lightweight synthetic nodes at cluster centroids. These carry no paper metadata — just a concept label and UMAP coordinates. Simpler but less informative on click.

**Scope**: This is a Cosmograph/bundle concern, not a corpus concern. The entity promotion (Phase 1) gets the papers into the graph tier. Concept pinning (Phase 2) makes them visually discoverable.
