# Paper Detail: Hover Popup + Click Panel

## Context

When a point is clicked or hovered on the graph, users see nothing about what they selected. The vision doc describes "type-specific intelligence cards" that surface the full depth of the knowledge graph — chunk text, paper metadata, authors, metrics, external links — as the user's primary means of drilling into evidence (Progressive Depth Level 4: "THE EVIDENCE").

Two interaction layers:
1. **Hover** → `CosmographPopup` tooltip anchored to the point (quick glance: title, year, section)
2. **Click** → Right-side detail panel with full paper metadata, chunk text, authors, metrics, links

Implements roadmap 1.2: "CosmographPopup on hover/click" and "Detail panel: click paper node → slide-in."

## Cosmograph Data Architecture

Cosmograph v2 uses **DuckDB-Wasm** internally. With `pointIncludeColumns: ['*']` (already set in `CosmographRenderer.tsx:126`), all columns on point objects are stored in DuckDB and available on click/hover callbacks. The docs state: "These columns will be available on the point objects... Useful for storing additional information about the points."

**Principle: embed what you can, fetch what you must.**

### Scale Budget (targeting 10K papers)

| Data | Per-item | At 10K papers (~50K chunks) | Embed? |
|------|----------|----------------------------|--------|
| ChunkNode (current) | ~200 B | ~10 MB | Yes (already) |
| + section/page/token/kind | ~30 B | ~1.5 MB | **Yes** |
| Papers Map (title, DOI, metrics) | ~500 B | ~5 MB | **Yes** |
| Authors | ~100 B × 5 avg | ~5 MB | **Yes** |
| chunk_text | ~2 KB | ~100 MB | **No — fetch on click** |
| abstract | ~2 KB | ~20 MB | **No — fetch on click** |
| **Total embedded** | | **~22 MB** | |

At 44 papers (today): ~1 MB total embedded. At 10K: ~22 MB. Both acceptable for an SPA.
chunk_text and abstract are the heavy items — fetched on demand via a single API route, cached in memory.

### Hybrid Data Model

```
SSR PAYLOAD (embedded — instant access)
──────────────────────────────────────────
GraphData
├── nodes: ChunkNode[]
│   ├── id, x, y, color, cluster...       (existing)
│   ├── sectionType                        NEW — for hover popup + panel badge
│   ├── sectionCanonical                   NEW — canonical section label
│   ├── pageNumber                         NEW — page reference
│   ├── tokenCount                         NEW — chunk size indicator
│   └── chunkKind                          NEW — text/table/figure
│
├── papers: Map<paperId, PaperDetail>      NEW — paper-level data (shared, not duplicated)
│   ├── id, title, journal, year, citekey
│   ├── doi, pmid, pmcid
│   ├── pageCount, figureCount, tableCount, chunkCount, sentenceCount
│   ├── authorCount, referenceCount, entityCount, relationCount, assetCount
│   └── authors: PaperAuthor[]
│
├── clusters, exemplars, stats, clusterColors  (existing, unchanged)


ON-DEMAND (fetched on click, cached in memory)
──────────────────────────────────────────
GET /api/detail/[chunkId]
├── chunkText: string                      from paper_rag_chunks
└── abstract: string | null                from papers (via chunk's paper_id)

Single API route. One fetch per unique chunk click.
Returns both chunk text + paper abstract in one response.
Cached client-side in Map<chunkId, { chunkText, abstract }>.
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  SERVER (SSR — app/page.tsx → fetchGraphData)                       │
│                                                                      │
│  Promise.all([                                                      │
│    graph_points_current,         ← existing                        │
│    papers (expanded columns),    ← MORE columns (DOI, metrics)     │
│    paper_authors,                ← NEW query                       │
│    paper_rag_chunks (metadata),  ← NEW (section, page, token ONLY) │
│    graph_clusters_current,       ← existing                        │
│    graph_cluster_exemplars,      ← existing                        │
│  ])                                                                  │
│                                                                      │
│  Build:                                                              │
│  • ChunkNode[] with section/page/token from chunks join             │
│  • Map<paperId, PaperDetail> with authors grouped                   │
│                                                                      │
│  NO chunk_text or abstract in SSR payload (too heavy at scale)      │
│                                                                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  ~22 MB at 10K papers
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENT                                                              │
│                                                                      │
│  HOVER (instant — zero fetch)          CLICK (mostly instant)       │
│  ┌─────────────────────────┐          ┌──────────────────────────┐  │
│  │ CosmographPopup         │          │ DetailPanel              │  │
│  │                         │          │                          │  │
│  │ From ChunkNode:         │          │ INSTANT (from memory):   │  │
│  │ • paperTitle            │          │ • Paper: title, journal  │  │
│  │ • year                  │          │ • Authors list           │  │
│  │ • sectionCanonical      │          │ • Metrics grid           │  │
│  │ • clusterLabel          │          │ • DOI/PubMed/PMC links   │  │
│  │                         │          │ • Cluster context        │  │
│  │ 0ms latency             │          │ • Section badge + page   │  │
│  └─────────────────────────┘          │                          │  │
│                                       │ FETCHED (one API call):  │  │
│                                       │ • Chunk text (~2KB)      │  │
│                                       │ • Abstract (~2KB)        │  │
│                                       │                          │  │
│                                       │ Cached in Map ref:       │  │
│                                       │ click same chunk = 0ms   │  │
│                                       │ click another chunk of   │  │
│                                       │ same paper = abstract    │  │
│                                       │ already cached           │  │
│                                       └──────────────────────────┘  │
│                                                                      │
│  /api/detail/[chunkId]                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ SELECT c.chunk_text, p.abstract                               │   │
│  │ FROM paper_rag_chunks c                                       │   │
│  │ JOIN papers p ON c.paper_id = p.id                            │   │
│  │ WHERE c.id = $1                                               │   │
│  │                                                                │   │
│  │ → { chunkText, abstract }                                     │   │
│  │ Cache-Control: private, max-age=300, stale-while-revalidate   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Steps

### 1. Types — `lib/graph/types.ts` (modify)

Expand `ChunkNode` with 5 new fields:
```typescript
  sectionType: string | null
  sectionCanonical: string | null
  pageNumber: number | null
  tokenCount: number | null
  chunkKind: string | null
```

Add new types:
```typescript
interface PaperAuthor {
  name: string
  surname: string | null
  givenName: string | null
  affiliation: string | null
  orcid: string | null
}

interface PaperDetail {
  id: string
  title: string | null
  journal: string | null
  year: number | null
  doi: string | null
  pmid: string | null
  pmcid: string | null
  citekey: string | null
  pageCount: number | null
  figureCount: number | null
  tableCount: number | null
  chunkCount: number | null
  sentenceCount: number | null
  authorCount: number | null
  referenceCount: number | null
  entityCount: number | null
  relationCount: number | null
  assetCount: number | null
  authors: PaperAuthor[]
}

interface ChunkDetail {
  chunkText: string
  abstract: string | null
}
```

Add `papers: Map<string, PaperDetail>` to `GraphData`.

### 2. Enrich fetchGraphData — `lib/graph/fetch.ts` (modify)

- **Papers query**: expand select → add doi, pmid, pmcid, journal, page_count, figure_count, table_count, chunk_count, sentence_count, author_count, reference_count, entity_count, relation_count, asset_count
- **Add paper_authors query**: `select('paper_id, name, surname, given_name, affiliation, orcid').order('author_index')`
- **Add chunks metadata query**: `select('id, section_type, section_canonical, page_number, token_count, chunk_kind')` — NO chunk_text (too large)
- **Build papers Map**: `Map<paperId, PaperDetail>` with authors grouped by paper_id
- **Enrich ChunkNode**: join chunk metadata by `node_id` = chunk `id`
- **Serialize**: `Map` → plain object for SSR serialization, reconstitute on client

### 3. Detail API — `app/api/detail/[id]/route.ts` (new)

- Single route: validate UUID, fetch chunk_text from paper_rag_chunks + abstract from papers via join
- Returns `{ chunkText, abstract }`
- `Cache-Control: private, max-age=300, stale-while-revalidate=600`
- Uses `createServerClient()` from `lib/supabase/server.ts`

### 4. Detail Hook — `lib/graph/use-chunk-detail.ts` (new)

- Subscribes to `useGraphStore.selectedNode`
- On selection: check `useRef(new Map<string, ChunkDetail>())` cache
  - Hit → return cached data instantly
  - Miss → fetch `/api/detail/{chunkId}`, cache result
- Returns `{ chunkDetail, loading, error }`
- Clears when selection is null
- `cancelled` flag for stale closures on rapid clicks

### 5. Hover Popup — `components/graph/HoverPopup.tsx` (new)

Uses `CosmographPopup` from `@cosmograph/react`.

- Subscribes to `useGraphStore.hoveredNode`
- On hover: show popup with `buildPopupHtml(node)`:
  ```html
  <div>
    <div>Paper Title (truncated ~60 chars)</div>
    <div>Year · Section · Cluster</div>
  </div>
  ```
- ALL data from ChunkNode — ZERO fetch, 0ms latency
- Styled with inline CSS (CosmographPopup injects raw HTML)

### 6. DetailPanel — `components/graph/panels/DetailPanel.tsx` (new)

Uses `PanelShell` with `side="right"`, `width={380}`. Calls `useChunkDetail()` internally.

**Sections** (top to bottom):

| Section | Source | Instant? |
|---------|--------|----------|
| Section Badge + Page | `selectedNode.sectionCanonical, pageNumber` | Yes |
| Chunk Text | `chunkDetail.chunkText` | Fetched (Skeleton while loading) |
| Paper Header | `papers.get(paperId).title, journal, year` | Yes |
| Authors | `paper.authors` | Yes — first 3, expandable |
| Content Metrics | `paper.*Count` | Yes — 2-col grid |
| Cluster Context | `selectedNode.clusterLabel, clusterProbability` | Yes |
| External Links | `paper.doi, pmid, pmcid` | Yes |
| Abstract | `chunkDetail.abstract` | Fetched, collapsed by default |

~80% of the panel renders instantly. Only chunk text + abstract show a brief Skeleton.

### 7. DashboardShell — `components/graph/DashboardShell.tsx` (modify)

- Import `DetailPanel`
- Read `selectedNode` from `useGraphStore`
- Read `showDetailPanel` from mode layout
- Pass `papers` Map to `DetailPanel`
- Render in AnimatePresence after legends

### 8. Mode registry — `lib/graph/modes.ts` (modify)

- Add `showDetailPanel: boolean` to `ModeLayout`
- Set `true` for all 4 modes

### 9. CosmographRenderer — `components/graph/CosmographRenderer.tsx` (modify)

- Wire CosmographPopup for hover tooltip
- Keep existing click/hover store calls unchanged

## Files Summary

| File | Action |
|------|--------|
| `lib/graph/types.ts` | Modify — expand ChunkNode, add PaperDetail, PaperAuthor, ChunkDetail |
| `lib/graph/fetch.ts` | Modify — fetch paper detail + authors + chunk metadata |
| `app/api/detail/[id]/route.ts` | Create — chunk_text + abstract fetch |
| `lib/graph/use-chunk-detail.ts` | Create — fetch-on-click hook with Map cache |
| `components/graph/panels/DetailPanel.tsx` | Create — right-side evidence card |
| `components/graph/HoverPopup.tsx` | Create — CosmographPopup hover tooltip |
| `components/graph/DashboardShell.tsx` | Modify — render DetailPanel, pass papers |
| `components/graph/CosmographRenderer.tsx` | Modify — wire popup on hover |
| `lib/graph/modes.ts` | Modify — add showDetailPanel to ModeLayout |

**Reuse**: `PanelShell` + `PANEL_SPRING` + `sectionLabelStyle`, `formatNumber()`, `createServerClient()`, CSS var tokens, `useGraphStore`.

## Verification

1. `npm run build` — zero errors
2. Hover → popup shows title + year + section (instant)
3. Click → panel slides in, paper metadata renders instantly, chunk text loads briefly
4. Click same chunk again → chunk text from cache (instant)
5. Click empty canvas → panel slides out
6. All 4 modes show detail panel on click
7. Left panel (Info) + right panel (Detail) coexist
8. Light/dark mode → popup + panel colors correct
9. Network tab: SSR payload reasonable, API calls only on first click per chunk
