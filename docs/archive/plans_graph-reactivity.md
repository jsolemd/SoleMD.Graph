# Graph Reactivity — The Living Graph

> As you type, the graph breathes. As you submit, the graph reasons.

## The Idea

The graph is not a static backdrop — it responds to your thinking in real-time. Two layers work together:

1. **As-you-type reactivity** — the graph lights up semantically related nodes while you type, fading everything else. This is the "living graph" — it breathes with your thinking.
2. **Retrieval-grounded response** — on submit, the LLM retrieves evidence from the graph, classifies each source by epistemic stance (supports / refutes / related), and cites specific nodes. The graph becomes an evidence map.

The first layer is a **preview** of what retrieval will find. It builds anticipation and lets you refine your question based on what's lighting up. The second layer crystallizes the selection — the response arrives, and the graph settles into a definitive "these are your sources" state with stance coloring.

This behavior is cross-modal. Ask mode uses it for grounded Q&A. Write mode uses it for live evidence feedback. Learn mode uses it to show source material for lesson content. Explore mode is the exception — it's already a direct-manipulation graph interface.

---

## Cosmograph Mechanism

Cosmograph v2 natively supports this via **programmatic selection**:

```typescript
// Select matching nodes — everything else greys out automatically
cosmographRef.current.selectPointsByIndices(matchingIndices);

// Already wired in cosmograph/GraphRenderer.tsx:
//   pointGreyoutOpacity={colors.greyout}   ← controls fade level
//   pointOpacity={colors.pointOpacity}      ← controls highlighted level
```

When points are "selected," Cosmograph renders them at full `pointOpacity` and drops everything else to `pointGreyoutOpacity`. The visual effect — related nodes glow, everything else fades — is a single API call. No blur (WebGL canvas ignores CSS filters). Opacity fade is the right aesthetic — subtractive attention, like a spotlight in a theater.

For stance coloring (Phase D), we can dynamically update the DuckDB table's color column and use `pointColorStrategy="direct"` to render per-node hex colors.

---

## The Vocabulary Gate

**Problem**: We can't fire reactivity on every word. "The", "about", "is" would match everything or nothing. Only **meaningful terms** — entities, genes, drugs, diseases, pathways — should trigger the graph.

**Solution**: Ship a **vocabulary table** in the DuckDB bundle. The pipeline already extracts entities — we export them as a pre-computed lookup:

```sql
-- New bundle table: graph_entity_vocab
CREATE TABLE graph_entity_vocab (
  term           TEXT,        -- "dopamine", "BDNF", "ketamine"
  term_lower     TEXT,        -- lowercase for case-insensitive lookup
  entity_type    TEXT,        -- "gene", "drug", "disease", "pathway", "anatomy"
  mention_count  INTEGER,     -- how many chunks mention this term
  chunk_indices  INTEGER[],   -- pre-computed: which point indices contain this entity
);
-- Index for instant lookup
CREATE INDEX idx_vocab_term ON graph_entity_vocab(term_lower);
```

**Reactivity trigger logic**:

```
User types: "what about dopamine in treatment resistant depression"
                      ────────              ────────── ──────────
Tokenize → ["what", "about", "dopamine", "in", "treatment", "resistant", "depression"]
Lookup each token in graph_entity_vocab:
  "what"       → no match (skip)
  "about"      → no match (skip)
  "dopamine"   → MATCH → chunk_indices: [12, 45, 67, 89, 203]
  "in"         → no match (skip)
  "treatment"  → no match (skip — or match if it's an entity)
  "resistant"  → no match (skip)
  "depression" → MATCH → chunk_indices: [3, 12, 34, 67, 150, 201]

Union of indices: [3, 12, 34, 45, 67, 89, 150, 201, 203]
→ selectPointsByIndices([3, 12, 34, 45, 67, 89, 150, 201, 203])
```

**Multi-word entities**: The vocabulary also includes multi-word terms ("treatment-resistant depression", "nucleus accumbens"). The tokenizer checks n-grams (bigrams, trigrams) against the vocabulary, not just single words.

**Why this is better than full-text search**: Pre-computed `chunk_indices` means zero scanning of chunk text at query time. The mapping is already materialized during bundle build. A vocabulary of ~5,000 terms with pre-computed indices is tiny (~100 KB).

**Data source**: `solemd.entities` + `solemd.entity_links` → aggregated during `graph_bundle_build`. Every entity the NER pipeline has ever extracted becomes a vocabulary entry.

---

## Phases

### Phase A: Vocabulary-Gated Reactivity (instant, local, zero-infrastructure)

**Goal**: Prove the interaction pattern. Typing recognized entities makes the graph respond.

**How it works**:
- User types in PromptBox → debounce (150ms)
- Tokenize input text → extract candidate terms (unigrams + bigrams + trigrams)
- Look up candidates in `graph_entity_vocab` (DuckDB-WASM, indexed, instant)
- Union all `chunk_indices` from matched vocabulary entries
- Call `cosmographRef.current.selectPointsByIndices(unionIndices)`
- Empty input or no vocabulary matches → clear selection (all nodes at full opacity)

**Fallback**: If no entity matches, optionally fall back to `chunkPreview ILIKE` search for partial keyword matching. This catches terms the NER pipeline missed but that appear in text.

**What it proves**: The visceral feeling of "the graph responds to me." Typing "dopamine" and watching a cluster light up is magical. Typing "the" does nothing — the vocabulary gate keeps it clean.

**Requirements**:
| Piece | Status |
|-------|--------|
| DuckDB-WASM in-browser | Done — already loaded in `lib/graph/duckdb.ts` |
| `graph_entity_vocab` bundle table | Build — aggregate from `solemd.entities` during bundle export |
| N-gram tokenizer | Build — simple client-side, handles multi-word entities |
| CosmographRef access from PromptBox | Need — expose ref via store or context |
| Debounced reactivity hook | Build — `useGraphReactivity` (reusable across modes) |

---

### Phase B: Embedding Similarity (semantic, client-side)

**Goal**: "Reward circuitry" lights up dopamine, VTA, nucleus accumbens — without literal keyword match.

**How it works**:
- Export full 768-dim chunk embeddings (from `solemd.graph_chunk_embeddings`) into the DuckDB bundle as a sidecar table. At ~2K chunks this is only 6.7 MB — no dimensionality reduction needed. (Revisit if corpus scales past 100K chunks.)
- User types → debounce (300ms) → compute query embedding:
  - **Option 1**: Edge function that returns a vector for the typed text
  - **Option 2**: Client-side embedding via transformers.js / ONNX runtime (small model)
- Cosine similarity against all chunk embeddings in DuckDB-WASM:
  ```sql
  SELECT index, cosine_similarity(embedding, ?) AS score
  FROM graph_points_web
  ORDER BY score DESC
  LIMIT 50
  ```
- Select top-N indices where score > threshold

**Hybrid with Phase A**: Keyword match fires instantly (150ms), embedding search refines on pause (300ms). Two passes — fast then smart.

**Requirements**:
| Piece | Status |
|-------|--------|
| Chunk embeddings in bundle | Planned — MedCPT vectors exist in `solemd.chunks`, need export to bundle |
| Query embedding endpoint | Build — Supabase edge function or client-side model |
| DuckDB cosine similarity | Check — may need `vss` extension or manual dot product |
| Similarity threshold tuning | Design — too low = noise, too high = misses |

---

### Phase C: Cited Nodes on Submit (retrieval-grounded response)

**Goal**: LLM responses cite specific graph nodes. Click a citation → camera zooms to that node.

**How it works**:
- User submits query → API route receives it
- Server-side retrieval pipeline:
  1. Entity extraction from query text
  2. Graph traversal (find paths between extracted entities)
  3. Embedding similarity (top-K chunks by MedCPT cosine)
  4. Combine graph + vector results → deduplicate → rank
- LLM generates response grounded in retrieved chunks
- Response includes structured citations: `{ nodeId, chunkText, paperTitle, citationKey }`
- Client receives response → highlighted nodes persist as "evidence set"
- Clickable citations in the chat → `cosmographRef.current.zoomToPointByIndex(index)`

**The graph becomes the citation list.** Instead of footnotes you have to mentally map, the citations ARE the glowing nodes. Click one, the camera takes you there.

**Requirements**:
| Piece | Status |
|-------|--------|
| Ask mode API route | Build — `app/api/ask/route.ts` |
| Entity extraction (server) | Available — SoleMD.App NER pipeline |
| Graph traversal (server) | Available — Neo4j MCP / Cypher queries |
| Embedding retrieval (server) | Available — pgvector in Supabase |
| Structured citation format | Design — response schema with node IDs |
| Chat UI in PromptBox | Build — conversation thread component |
| Camera zoom to cited node | Ready — `cosmographRef.current.zoomToPointByIndex()` |

---

### Phase D: Epistemic Stance Coloring (support / refute / related)

**Goal**: The graph becomes an evidence map. Green = supports, coral = refutes, neutral = related context.

**How it works**:
- During Phase C retrieval, the LLM classifies each retrieved chunk:
  - **Supporting** — evidence that affirms the claim or answer
  - **Refuting** — evidence that contradicts, qualifies, or conflicts
  - **Related** — contextually relevant but epistemically neutral
- Each stance maps to a brand color:
  - Supporting: `--color-education` (fresh green)
  - Refuting: `--color-action` (warm coral)
  - Related: `--mode-accent` (current mode color)
- Dynamically update the DuckDB color column for selected nodes:
  ```sql
  UPDATE graph_points_web SET color = ? WHERE index IN (?)
  ```
- Cosmograph renders with `pointColorStrategy="direct"` — each node gets its stance color

**The graph literally shows the epistemic landscape.** You can see at a glance: "most evidence supports this, but there are two contradicting papers over there in that cluster."

**Requirements**:
| Piece | Status |
|-------|--------|
| Stance classification prompt | Design — LLM prompt that classifies chunks |
| Relation assertion data | Available — SoleMD.App extracts assertion status (affirmed/negated/speculative) |
| Dynamic color update in DuckDB | Check — can we UPDATE in the WASM instance? |
| Color reset on new query | Build — restore original colors when starting fresh |
| Visual legend for stance colors | Build — small floating legend (● supports, ◆ refutes, ○ related) |

---

## Cross-Mode Behavior

| Mode | As-You-Type (A/B) | On Submit (C/D) |
|------|-------------------|-----------------|
| **Ask** | Full — typing in chat bar lights up related nodes | Full — response cites nodes, stance colors |
| **Write** | Full — current paragraph highlights evidence | Continuous — each paragraph is a mini-query, dual-signal ●/◆ |
| **Learn** | Partial — typing in module search highlights relevant modules | On module select — source nodes for lesson content light up |
| **Explore** | No — Explore has its own search/filter (CosmographSearch) | No — Explore is direct manipulation |

---

## Data Requirements

### What's already in the bundle
- `graph_points_web`: `id`, `index`, `x`, `y`, `color`, `clusterId`, `clusterLabel`, `clusterProbability`, `paperTitle`, `citekey`, `journal`, `year`, `doi`, `chunkPreview` (short excerpt), `sectionType`, `sectionCanonical`, `chunkKind`, `blockType`, plus paper-level counts
- `graph_chunk_details`: full `chunk_text` (queried on node click, not loaded into Cosmograph)
- `graph_clusters`, `graph_cluster_exemplars`, `graph_papers`, `graph_facets`
- **No entity vocabulary table. No entity names on points. No embeddings.**

### What Phase A needs added
- **`graph_entity_vocab` table** — term, entity_type, mention_count, chunk_indices (pre-computed)
- Source: aggregate from `solemd.entities` + `solemd.entity_links` during bundle build
- ~5,000 terms × (term + type + count + indices array) ≈ 100-200 KB in Parquet
- Requires pipeline changes in **SoleMD.App** (hand-off: bundle export step)

### What Phase B needs added
- `graph_chunk_embeddings` sidecar table with `rag_chunk_id`, `index`, `embedding FLOAT[768]`
- Full 768-dim — no reduction. 6.7 MB is negligible at current scale (~2K chunks)
- Source: `solemd.graph_chunk_embeddings` (already computed, loaded via `loader.py`)
- At 100K chunks: 670 MB — revisit reduction only if/when we reach that scale

### Bundle size budget
| Addition | Size (2K chunks) | Size (100K chunks) |
|----------|-------------------|---------------------|
| Entity vocab table | ~150 KB | ~500 KB |
| Embeddings (768-dim) | ~6.7 MB | ~670 MB (revisit) |
| Total bundle (current) | ~2 MB | — |

---

## UX Details

### Debounce & Transition
- **Keyword match**: 150ms debounce, selection updates instantly (Cosmograph handles GPU-side)
- **Embedding search**: 300ms debounce after typing pause, selection refines smoothly
- **On submit**: selection snaps to evidence set, then stance colors fade in over ~200ms
- **Clear**: empty input → clear selection → all nodes return to full opacity

### Threshold & Count
- Keyword match: no limit (all matches)
- Embedding similarity: top 50, with a minimum cosine threshold (tune empirically, ~0.3 for MedCPT)
- On submit evidence set: typically 5-20 nodes (LLM-selected, not raw similarity)

### Camera Behavior
- As-you-type: **no camera movement** — let color do the work, don't hijack the viewport
- On submit: gentle `fitView` to frame the evidence cluster if it's off-screen
- Click citation: `zoomToPointByIndex()` with smooth transition

### Empty State
- No text in PromptBox → no selection → all nodes at full opacity
- First character typed → first keyword match fires after 150ms debounce

---

## Implementation Architecture

### Design Principles

- **Reusable hook**: A single `useGraphReactivity(options)` hook that any mode can plug into — not mode-specific wiring
- **Strategy pattern**: Matching strategies (vocabulary, embedding, hybrid) are pluggable interfaces. Phase A → B is swapping a strategy, not rewriting the hook
- **Config-driven thresholds**: Debounce intervals, similarity cutoffs, top-N limits, and minimum term lengths come from constants or the mode registry — never magic numbers
- **CSS variable stance colors**: `--stance-supports`, `--stance-refutes`, `--stance-related` flow through the existing token system in `globals.css`
- **Bundle-side pre-computation**: Heavy work (entity-to-chunk mapping, embedding reduction) happens at bundle build time, not at runtime

### Module Structure

```
lib/graph/reactivity/
├── index.ts                  — barrel export
├── types.ts                  — ReactivityStrategy, ReactivityMatch, StanceClassification
├── constants.ts              — debounce intervals, thresholds, min term length, max results
├── tokenizer.ts              — extract candidate terms (unigrams, bigrams, trigrams)
├── use-graph-reactivity.ts   — main hook: tokenize → match → select → animate
├── strategies/
│   ├── types.ts              — MatchStrategy interface
│   ├── vocabulary.ts         — Phase A: dictionary lookup in graph_entity_vocab
│   ├── embedding.ts          — Phase B: cosine similarity against chunk embeddings
│   └── hybrid.ts             — Phase A+B: keyword instant, embedding on pause
└── stance/
    ├── types.ts              — StanceColor, StanceResult
    └── colors.ts             — stance → CSS variable mapping
```

### Strategy Interface

```typescript
interface MatchStrategy {
  /** Human-readable name for debugging */
  readonly name: string;

  /**
   * Given extracted terms, return matching point indices.
   * Called on every debounced input change.
   */
  match(terms: string[], context: MatchContext): Promise<ReactivityMatch>;

  /** Optional: cleanup (e.g., close prepared statements) */
  dispose?(): void;
}

interface MatchContext {
  /** DuckDB connection for local queries */
  connection: AsyncDuckDBConnection;
  /** Total point count (for percentage-based thresholds) */
  totalPoints: number;
}

interface ReactivityMatch {
  /** Point indices to highlight */
  indices: number[];
  /** Which terms actually matched (for UI feedback) */
  matchedTerms: string[];
  /** Strategy that produced this match */
  source: string;
}
```

### Hook API

```typescript
function useGraphReactivity(options: {
  /** Which strategy to use */
  strategy: MatchStrategy;
  /** DuckDB connection */
  connection: AsyncDuckDBConnection | null;
  /** CosmographRef for selection calls */
  cosmographRef: RefObject<CosmographRef>;
  /** Whether reactivity is active (e.g., off in Explore mode) */
  enabled: boolean;
  /** Debounce interval in ms (from constants, not hardcoded) */
  debounceMs?: number;
}): {
  /** Call with current input text */
  onInputChange: (text: string) => void;
  /** Currently matched terms (for UI highlighting in PromptBox) */
  matchedTerms: string[];
  /** Number of highlighted points */
  highlightedCount: number;
  /** Clear all highlights */
  clear: () => void;
};
```

### Constants (not magic numbers)

```typescript
// lib/graph/reactivity/constants.ts
export const REACTIVITY = {
  /** Minimum characters before attempting vocabulary lookup */
  MIN_TERM_LENGTH: 3,
  /** Debounce for vocabulary-based matching (Phase A) */
  VOCAB_DEBOUNCE_MS: 150,
  /** Debounce for embedding-based matching (Phase B) */
  EMBEDDING_DEBOUNCE_MS: 300,
  /** Maximum points to highlight before it becomes noise */
  MAX_HIGHLIGHTED_POINTS: 200,
  /** If match covers > this fraction of all points, treat as too broad and skip */
  MAX_COVERAGE_RATIO: 0.4,
  /** Minimum cosine similarity for embedding matches (Phase B) */
  MIN_EMBEDDING_SIMILARITY: 0.3,
  /** Top-N results from embedding search (Phase B) */
  EMBEDDING_TOP_K: 50,
} as const;
```

### Mode Registry Integration

Each mode declares whether reactivity is enabled and which strategy to use:

```typescript
// In lib/graph/modes.ts — extend ModeLayout
interface ModeLayout {
  // ... existing fields ...
  /** Whether graph reactivity is active in this mode */
  reactivity: boolean;
  /** Which reactivity strategy this mode prefers */
  reactivityStrategy?: 'vocabulary' | 'embedding' | 'hybrid';
}

// ask: reactivity: true, reactivityStrategy: 'hybrid'
// write: reactivity: true, reactivityStrategy: 'hybrid'
// learn: reactivity: true, reactivityStrategy: 'vocabulary'
// explore: reactivity: false (has its own search)
```

---

## Relationship to Other Plans

- **[roadmap.md](roadmap.md)** — Phase A maps to "Ask Mode: real-time node highlighting." Phase C maps to "API route: query → entity extraction → graph traversal → RAG." Phase D maps to "Write mode: dual-signal."
- **[modes/ask.md](../modes/ask.md)** — Ask mode's "LLM ↔ Graph Pipeline" section describes Phase C. This plan adds the as-you-type layer (A/B) that precedes it.
- **[modes/write.md](../modes/write.md)** — Write mode's dual-signal (●/◆) is Phase D applied continuously per paragraph.
- **[architecture.md](../architecture.md)** — Data flow section will need a "reactivity pipeline" addition when implemented.
- **[../vision.md](../vision.md)** — "When you write, the graph listens and lights up" — this plan is the spec for that sentence.
