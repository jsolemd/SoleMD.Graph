# SoleMD.Graph — Data Flow

How data flows from external sources to the user's browser.

The delivery contract for what stays `base`, `universe`, and `evidence` in the graph
bundle lives in [bundle-contract.md](bundle-contract.md).

Current browser-delivery note:

- the default published graph bundle now autoloads only the `base` scaffold
- mandatory first-load artifacts are currently:
  - `base_points.parquet`
  - `base_clusters.parquet`
- current premapped universe artifact:
  - `universe_points.parquet`
- universe artifacts are present in the bundle manifest but are not attached
  on startup
- browser DuckDB runs as an ephemeral in-memory analytic session over the
  canonical Parquet artifacts
- `base_points_canvas_web` and `universe_points_canvas_web` are projection
  views over Parquet rather than eager browser-local copies
- those point parquet files are intentionally narrow: canvas coordinates,
  dense ids, cluster/color fields, compact bibliographic fields, compact
  summary metrics, and first-paint filter/search columns only
- local overlay activation is expressed through DuckDB membership/views:
  `overlay_point_ids_by_producer`, `overlay_point_ids`,
  `active_point_index_lookup_web`, and `active_points_canvas_web` for the
  dense active union, with
  `current_points_canvas_web`, `current_points_web`, and
  `current_paper_points_web` as the stable browser-facing active aliases used
  by table/search/filter/detail queries
- persistent point selection is also DuckDB-native: Cosmograph intent clauses
  resolve into `selected_point_indices` inside DuckDB, rather than shipping
  large selected-index arrays back into SQL
- React mirrors only scalar selection/scope invalidation state:
  `selectedPointCount`, `selectedPointRevision`, `currentPointScopeSql`, and
  `currentScopeRevision`
- `pointIncludeColumns` stays minimal and widget-driven: only mounted native
  filter/timeline accessors are exposed to Cosmograph, while richer detail
  stays on narrow DuckDB queries and backend evidence fetches
- when overlay is empty, the live canvas aliases point straight at base views so
  first paint does not rebuild a synthetic active union
- when overlay is active, only id membership mutates locally; overlay point rows
  still resolve from `universe_points`, while the base scaffold stays
  Parquet-backed and keeps its exported indices
- `paper_documents.parquet` and `cluster_exemplars.parquet` now attach
  only when detail queries ask for them; `cluster_exemplars` is a paper-level
  preview surface, not a graph chunk layer
- info-panel scope changes batch widget summaries in DuckDB by widget kind and
  reuse categorical summary results across facet/bar widgets
- `evidence` remains the backend/API path for raw citation neighborhoods, full
  PubTator payloads, assets, and later full text
- the shipping graph runtime is corpus-only; any future graph layer must arrive
  as a self-contained module with its own bundle/query/UI path instead of
  branching through the default base/universe/overlay boot flow

---

## The Big Picture

```
╔══════════════════════════════════════════════════════════════════════════╗
║                         EXTERNAL DATA (free, pre-computed)              ║
║                                                                         ║
║   PubTator3 (NCBI)                    Semantic Scholar (Allen AI)       ║
║   ├── 1.6B entity annotations         ├── 225M paper metadata           ║
║   ├── 33M relations                    │   ONLY full bulk download      ║
║   └── 36M abstracts (BioCXML)          │   ~45 GB (JSONL shards)        ║
║                                        │                                ║
║       FTP bulk download                ├── 100M abstracts      ┐        ║
║       ~11 GB (tab files)               ├── 2.8B citation edges │ Batch  ║
║                                        ├── 200M+ SPECTER2     │ API    ║
║       Downloaded in full,              ├── 60M TLDRs           ┘        ║
║       streamed through filter          │   Fetched for domain IDs only  ║
║       into PostgreSQL.                 │   via S2 Batch API             ║
║                                        └── Results go into PostgreSQL   ║
╚════════════════════╤═══════════════════════════════╤════════════════════╝
                     │                               │
                     ▼                               ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                    LOCAL DISK  (data/ directory, .gitignored)            ║
║                                                                         ║
║   data/pubtator/raw/                  data/semantic-scholar/raw/         ║
║     bioconcepts2pubtator3.gz            papers/*.jsonl.gz (~45 GB)      ║
║     relation2pubtator3.gz                                               ║
║                                       Only the papers dataset is a full ║
║   Full tab files downloaded and       bulk download. Everything else    ║
║   streamed through a filter into      (abstracts, citations, embeddings,║
║   PostgreSQL.                         TLDRs) is fetched via S2 Batch   ║
║                                       API for domain paper IDs only.    ║
║                                                                         ║
║   DuckDB reads the S2 papers dump to identify domain corpus IDs.        ║
║   That's its only job — a one-time filter tool, not a data store.       ║
╚════════════════════════════════╤════════════════════════════════════════╝
                                 │
                                 │  DuckDB filters S2 papers → domain IDs
                                 │  S2 Batch API fetches data for those IDs
                                 │  PubTator3 tab files streamed + filtered
                                 │  All results loaded into PostgreSQL
                                 │
                                 ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                    POSTGRESQL  (Docker, port 5433)                       ║
║                                                                         ║
║   This is the permanent home for ALL data. DuckDB is just a filter      ║
║   tool for the initial S2 papers dump — it does not store anything.     ║
║                                                                         ║
║   solemd schema                        pubtator schema                  ║
║   ┌──────────────────────────┐         ┌──────────────────────────┐    ║
║   │ papers (~14M corpus rows)│         │ entity_annotations       │    ║
║   │   title, abstract, year, │         │   (25-80M rows)          │    ║
║   │   journal, PMID, S2 ID  │         │   pmid, type, concept_id │    ║
║   │                          │         │   mentions, resource     │    ║
║   │ paper_evidence_summary   │         │                          │    ║
║   │   durable per-paper      │         │ relations (500K-1M rows) │    ║
║   │   entity / relation /    │         │   pmid, type, subject,   │    ║
║   │   journal admission facts│         │   object                 │    ║
║   │                          │         └──────────────────────────┘    ║
║   │ graph_points / clusters  │                                         ║
║   │   mapped coordinates     │         Only the domain-filtered         ║
║   │   + base admission       │         subset lives here, not the       ║
║   │                          │         full 1.6B rows.                  ║
║   │ graph/tmp/graph_build/*  │                                         ║
║   │   run-scoped PCA / kNN / │         Durable layout checkpoints live  ║
║   │   coordinate checkpoints │         on disk, not in graph-db.        ║
║   │ embeddings (pgvector)    │                                         ║
║   │   MedCPT 768d vectors    │                                         ║
║   │   for RAG search         │                                         ║
║   │                          │                                         ║
║   │ citations (domain edges) │                                         ║
║   │   citing_id, cited_id,   │                                         ║
║   │   intent, influential    │                                         ║
║   └──────────────────────────┘                                         ║
╚═════════════════╤══════════════════════════════════╤════════════════════╝
                  │                                  │
                  │                                  │
     ┌────────────┘                                  └────────────┐
     │                                                            │
     ▼                                                            ▼
╔═════════════════════════╗                    ╔══════════════════════════╗
║  NEXT.JS (frontend)     ║                    ║  FASTAPI (Python engine) ║
║  port 3000              ║                    ║  port 8300               ║
║                         ║                    ║                          ║
║  Drizzle ORM            ║                    ║  psycopg (PG driver)     ║
║  (TypeScript SQL        ║                    ║                          ║
║   client, talks         ║                    ║  READS: paper data,      ║
║   directly to PG)       ║                    ║    search results,       ║
║                         ║                    ║    entity lookups        ║
║                         ║                    ║                          ║
║  Server Components      ║                    ║  WRITES: loads new data  ║
║  fetch data, pass       ║                    ║    from S2 Batch API +   ║
║  to React components    ║                    ║    PubTator3 into PG     ║
║                         ║                    ║                          ║
║  Server Actions         ║                    ║  BUILDS: evidence        ║
║  handle search,         ║                    ║    summary -> base       ║
║  LLM streaming          ║                    ║    admission -> bundle   ║
║                         ║                    ║                          ║
║  Vercel AI SDK          ║                    ║  Dramatiq workers run    ║
║  streams Gemini         ║                    ║  long batch jobs         ║
║  responses to browser   ║                    ║  (hours-long loads,      ║
╚════════════╤════════════╝                    ║   embedding generation)  ║
             │                                 ╚══════════════════════════╝
             │
             │  Serves the app + Parquet files to the browser
             │
             ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                         BROWSER (what users see)                        ║
║                                                                         ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │                    COSMOGRAPH (graph canvas)                     │   ║
║   │                                                                  │   ║
║   │   Base scaffold rendered by GPU (WebGL) over narrow canvas     │   ║
║   │   views instead of the full metadata point rows                │   ║
║   │   Clustered by research community (UMAP layout)                 │   ║
║   │   Colored and scoped locally by cluster / year / journal /      │   ║
║   │   search budget over DuckDB-WASM tables                         │   ║
║   │                                                                  │   ║
║   │   Default first-load data source:                               │   ║
║   │     base_points.parquet + base_clusters.parquet                 │   ║
║   │   Universe premapped artifact: universe_points.parquet          │   ║
║   │   Browser DuckDB storage: ephemeral analytic session           │   ║
║   │   Base startup reuses exported point_index directly; it does   │   ║
║   │   not recompute dense indices over the full base table         │   ║
║   │   Optional links remain outside the default base publish path   │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
║                                                                         ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │                    ENTITY HIGHLIGHTING                           │   ║
║   │                                                                  │   ║
║   │   User types "dopamine receptor"                                │   ║
║   │     → DuckDB-WASM searches the base point table in browser      │   ║
║   │     → Resolves a seed point and scoped visibility budget        │   ║
║   │     → Cosmograph applies native filter/timeline/budget clauses  │   ║
║   │     → Panels query the same scoped DuckDB state locally         │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
║                                                                         ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │                    RAG SEARCH + CHAT                             │   ║
║   │                                                                  │   ║
║   │   User asks: "What's the evidence for lithium in bipolar?"      │   ║
║   │     → Server Action embeds the question (MedCPT)                │   ║
║   │     → PostgreSQL vector search finds relevant papers            │   ║
║   │     → Gemini Flash synthesizes answer with citations            │   ║
║   │     → Streams back to browser via Vercel AI SDK                 │   ║
║   │     → Cited papers highlight on the graph                       │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
║                                                                         ║
║   ┌─────────────────────────────────────────────────────────────────┐   ║
║   │                    @ CITATION AUTOCOMPLETE                       │   ║
║   │                                                                  │   ║
║   │   User types @ while writing                                    │   ║
║   │     → Current sentence gets embedded (MedCPT query encoder)     │   ║
║   │     → PostgreSQL finds top-10 matching papers                   │   ║
║   │     → Dropdown shows paper titles for selection                 │   ║
║   │     → Total latency: ~100ms (feels instant)                    │   ║
║   └─────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## How Each Piece Talks to Each Other

```
                        ┌──────────────┐
                        │   Browser    │
                        └──────┬───────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌────────────────┐ ┌───────────┐ ┌──────────────────┐
     │ Parquet file   │ │ Server    │ │ Server Actions   │
     │ (static, via   │ │ Components│ │ (mutations,      │
     │  HTTP range    │ │ (reads)   │ │  search, chat)   │
     │  requests)     │ │           │ │                  │
     └───────┬────────┘ └─────┬─────┘ └────────┬─────────┘
             │                │                 │
             ▼                ▼                 ▼
     ┌────────────────┐ ┌───────────┐ ┌──────────────────┐
     │ DuckDB-WASM    │ │ Drizzle   │ │ Vercel AI SDK    │
     │ (in browser)   │ │ ORM       │ │ + Drizzle        │
     │                │ │           │ │                  │
     │ SQL over       │ │ SQL over  │ │ Embed query →    │
     │ Parquet,       │ │ TCP to    │ │ pgvector search →│
     │ no server      │ │ PostgreSQL│ │ LLM stream       │
     └────────────────┘ └─────┬─────┘ └────────┬─────────┘
                              │                 │
                              └────────┬────────┘
                                       │
                              ┌────────▼────────┐
                              │  PostgreSQL     │
                              │  (Docker 5433)  │
                              │                 │
                              │  pgvector HNSW  │
                              │  tsvector FTS   │
                              │  solemd schema  │
                              │  pubtator schema│
                              └─────────────────┘
```

---

## Monthly Refresh Cycle

```
  1st of each month (or when NCBI updates FTP):

  ┌─────────────────────────────────────────────────────────┐
  │  DOWNLOAD + IDENTIFY NEW PAPERS                          │
  │  curl new PubTator3 tab files → stream into PostgreSQL   │
  │  Fetch S2 diffs API → identify new/changed domain papers │
  └────────────────────────┬────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │  FETCH VIA BATCH API                                     │
  │  S2 Batch API: abstracts, citations, embeddings, TLDRs  │
  │  for new/changed domain paper IDs                        │
  │  Results go directly into PostgreSQL staging tables       │
  └────────────────────────┬────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │  LOAD                                                    │
  │  Merge new data into PostgreSQL staging tables           │
  │  Build indexes on staging tables                         │
  │  Atomic swap: RENAME staging → live (zero downtime)      │
  └────────────────────────┬────────────────────────────────┘
                           │
                           ▼
  ┌─────────────────────────────────────────────────────────┐
  │  REFRESH EVIDENCE + REBUILD GRAPH                        │
  │  pubtator + papers -> paper_evidence_summary            │
  │  embeddings -> PCA layout matrix -> shared kNN          │
  │  shared kNN -> GPU UMAP + GPU Leiden                    │
  │  run checkpoints -> coordinates / clusters / outliers   │
  │  base admission reads evidence summary, then exports:   │
  │    - base_points.parquet                                │
  │    - base_clusters.parquet                              │
  │  Export premapped universe artifact:                    │
  │    - universe_points.parquet                            │
  │  Optional universe/evidence artifacts follow the bundle │
  │  contract; links are not part of the default publish    │
  └─────────────────────────────────────────────────────────┘
```

---

## Technology at Each Layer

```
  LAYER              TECHNOLOGY
  ─────              ──────────
  Database           PostgreSQL 16 + pgvector 0.8.2
  Full-text search   tsvector / tsquery
  ORM / DB client    Drizzle (TypeScript) + psycopg (Python)
  Auth               Auth.js (Phase 3)
  File storage       Cloudflare R2
  Task queue         Dramatiq + Redis
  Graph viz          Cosmograph + DuckDB-WASM
  LLM streaming      Vercel AI SDK 6 + Gemini 2.5 Flash
  Batch processing   DuckDB (embedded in Python)
  Graph layout       GPU cuML UMAP + Leiden clustering
```
## End Vision: OpenEvidence-Style Graph RAG

The schema above builds toward an interactive biomedical knowledge graph where
every UX interaction maps to a specific data path:

```
┌─────────────────────────────────────────────────────────────────────┐
│  USER TYPES A QUESTION                                              │
│  "What's the evidence for lithium in bipolar disorder?"             │
│                                                                     │
│  1. MedCPT encodes the question → vector                           │
│  2. pgvector HNSW search on paper_chunks.embedding                 │
│     → top-K relevant chunks with section context                   │
│  3. Gemini Flash synthesizes answer with inline citations           │
│  4. Cited papers LIGHT UP on the Cosmograph as the answer streams  │
│  5. Each citation links to the chunk + sentence that supports it    │
│                                                                     │
│  Data path: paper_chunks → papers → graph (x,y) → Cosmograph      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  USER TYPES @ TO CITE A PAPER                                       │
│  "Building on @dopamine receptor sig..."                            │
│                                                                     │
│  1. Current sentence embedded with MedCPT query encoder             │
│  2. pgvector search on papers.embedding (SPECTER2)                  │
│     → top-10 semantically similar papers                            │
│  3. Autocomplete dropdown shows matches                             │
│  4. SIMILAR papers glow on graph, CONTRASTING papers dim/pulse     │
│     (contrasting = high citation overlap but far in embedding space,│
│      or papers with NEGATIVE_CORRELATE / INHIBIT PubTator relations)│
│                                                                     │
│  Data path: papers.embedding + pubtator.relations → Cosmograph     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  USER TYPES AN ENTITY NAME                                          │
│  Types "dopamine" in the entity search bar                          │
│                                                                     │
│  1. Trie/prefix match on entities.canonical_name + synonyms         │
│  2. Find all papers containing that entity via entity_annotations   │
│  3. Those papers LIGHT UP on the paper-layer graph                  │
│  4. Switch to ENTITY LAYER:                                         │
│     - Entity nodes positioned by SapBERT embedding (UMAP)          │
│     - Entity edges from PubTator relations (treats, inhibits, etc.) │
│     - Related entities glow (nearby in SapBERT space)               │
│     - Papers behind each entity accessible on click                 │
│                                                                     │
│  Data path: entities → entity_annotations → papers → graph → Cosmo │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  CITATION EDGES ON THE GRAPH                                        │
│                                                                     │
│  Cosmograph renders citation links between paper nodes:             │
│  - Click a paper → see who cites it and who it cites                │
│  - Influential citations rendered with thicker edges                │
│  - Citation intent labels (background, methodology, result)         │
│  - Citation chains visible as paths through the graph               │
│                                                                     │
│  Data path: citations → links Parquet → Cosmograph                 │
└─────────────────────────────────────────────────────────────────────┘
```
