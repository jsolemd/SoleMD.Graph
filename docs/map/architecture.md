# SoleMD.Graph: Clean-Sheet Architecture

> **Status**: Active architecture — updated as the project evolves
> **Scope**: Biomedical knowledge graph web app powered by PubTator3 + Semantic
> Scholar, visualized through Cosmograph, with RAG-powered evidence retrieval.

---

## 1. The Goal

Build a web application that lets medical professionals **explore biomedical
literature visually through a knowledge graph** and retrieve evidence through
conversational search. The graph renders hundreds of thousands of papers as an
interactive map of neuroscience, psychiatry, and neurology — clustered by
research community, filterable by entity type, and searchable by concept.

When a user types, entities light up across the graph in real time. When they
ask a question, the system retrieves evidence from abstracts and full-text
papers, synthesizes an answer with citations, and highlights the cited papers
on the graph. When they write, they can insert citations with `@` that match
their current sentence to the most relevant papers in the corpus.

The system leverages **pre-computed data** from PubTator3 (entities, relations,
abstracts for 36M papers) and Semantic Scholar (citations, SPECTER2 embeddings,
TLDRs for 225M+ papers) instead of running local NER or PDF extraction. The
current SoleMD.App pipeline is not a dependency — we start clean.

### What Users Can Do

- **Explore** — Navigate a GPU-rendered graph of 500K-2M papers, zoom into
  scientific subfields, see cluster labels, filter by entity type/year/journal
- **Search** — Ask natural-language questions, get cited evidence from abstracts
  and full-text papers with streaming LLM synthesis
- **Cite** — Type `@` to find papers that support the current sentence, insert
  citations inline with autocomplete
- **Filter** — Type a term and watch matching papers light up instantly across
  the graph (client-side, <10ms)
- **Discover** — See where your reading fits in the broader literature, find
  connections between subfields, identify gaps

### What This Is NOT

- Not a PDF pipeline — we use pre-computed annotations, not local NER
- Not a note-taking app — Obsidian integration is a possible future feature, not a requirement
- Not a publishing platform — this is for exploration and evidence retrieval
- Not SoleMD.App v2 — code may be reused where it makes sense, but there is no
  obligation to maintain compatibility

---

## 2. Three Pillars (Locked Requirements)

These three technologies are non-negotiable. Everything else was evaluated
against alternatives and selected on merit.

### Cosmograph (cosmos.gl v2.6)

GPU-accelerated graph visualization via WebGL. Renders force-directed layouts
and pre-computed scatter plots at 1M+ nodes. No viable alternative exists —
sigma.js caps at ~100K, cytoscape.js at ~10K, vis.js at a few thousand.
Cosmograph runs the force simulation on the GPU via WebGL shaders, which is
why it scales where others cannot.

- **Package**: `@cosmos.gl/graph` (v2.6.4) + `@cosmograph/cosmograph` (product layer)
- **DuckDB integration**: Built into the Cosmograph product layer via Apache Arrow
- **React bindings**: `@cosmograph/react` — native React components
- **OpenJS Foundation**: Incubation-phase project, active development
- **Key constraint**: WebGL texture size limits node storage to `MAX_TEXTURE_SIZE^2` (~67M theoretical)
- **Embedding mode**: Requires pre-computed 2D coordinates — Cosmograph cannot do dimensionality reduction

#### Adapter Boundary (`features/graph/cosmograph/`)

All `@cosmograph/react` and `@cosmograph/cosmograph` imports are contained
behind a single adapter layer at `features/graph/cosmograph/`. No component
outside this directory may import from `@cosmograph/*` directly.

This decouples the application from Cosmograph's API surface. When Cosmograph
ships a breaking version bump, changes are limited to the adapter directory —
consumer components, hooks, and panels remain untouched.

```
features/graph/cosmograph/
├── index.ts                      # Barrel — the only import consumers use
├── GraphRenderer.tsx             # <Cosmograph> component with ~60 props
├── GraphShell.tsx                # CosmographProvider boundary
├── hooks/
│   ├── use-graph-camera.ts       # fitView, zoom, pan
│   ├── use-graph-selection.ts    # select, focus, clear, selection objects
│   └── use-graph-export.ts       # screenshot, CSV export
└── widgets/
    ├── TimelineWidget.tsx         # DuckDB-query-backed timeline control
    ├── FilterBarWidget.tsx        # DuckDB-query-backed categorical filter
    ├── FilterHistogramWidget.tsx  # DuckDB-query-backed numeric filter
    ├── SelectionToolbar.tsx       # Rect/poly selection buttons + state machine
    ├── ColorLegends.tsx           # Type or range color legend
    └── SizeLegend.tsx             # Size legend
```

**Rules**:
- Consumers import from `@/features/graph/cosmograph` (the barrel), never
  from `@cosmograph/react` or `@cosmograph/cosmograph`
- Hooks expose app-shaped APIs (e.g. `fitView(duration, padding)`) — not
  raw Cosmograph ref methods
- Widgets may use Cosmograph selection clauses for intent, but filter/timeline
  data itself should come from DuckDB query views rather than Cosmograph point
  metadata hydration
- `cosmograph-selection.ts` and `cosmograph-columns.ts` stay in `lib/`
  because they import `@uwdata/mosaic-core`, not Cosmograph

### Layer Boundary Rule

The canonical graph runtime is currently a single `corpus` layer. That is an
intentional architecture constraint, not an implementation shortcut.

This is the right direction precisely because it makes the app faster and more
responsive. Foundational runtime cleanup outranks feature expansion: until the
corpus-only DuckDB/Cosmograph path is clean, adding more layers or richer
branches is out of order.

Future layers must be treated as optional modules, not as permanent branches
through the shared graph runtime. A new layer should bring its own:

- bundle contract or API contract
- DuckDB registration and query surface
- UI entry point
- canvas adapter, if it renders on the canvas at all

The base corpus path must remain stable if those modules are disabled. In
practice that means no deep coupling between future layers and the core store,
bundle bootstrap, or first-paint Cosmograph configuration.

### Browser Runtime Contract

The browser path is split on purpose:

- render path:
  `current_points_canvas_web`, `current_links_web`, and the dense active canvas
  aliases only
- DuckDB query path:
  `current_points_web`, `current_paper_points_web`, and related query-facing
  views for filters, timeline, search, table, and local point resolution
- evidence path:
  release-scoped FastAPI responses for heavy detail, citation payloads,
  assets, full text, and answer grounding

Hard rules:

- `pointIncludeColumns` stays empty on the live graph page
- do not query rich fields from `*_canvas_web`
- do not rebuild graph interactivity through JS point hydration
- use DuckDB for local scope, selection, overlay, and point-id resolution only
- use the backend contract for evidence semantics, not frontend shortcuts
- the registration layer under these aliases may use narrow local tables or
  narrow local views with strict canonical columns, but the alias contract stays stable

### Semantic Scholar (Academic Graph)

The world's largest open academic graph. Provides everything we would otherwise
need to compute ourselves.

| Dataset | Records | What We Get |
|---------|---------|-------------|
| papers | ~225M | Title, authors, year, venue, fields of study |
| abstracts | ~100M | Full abstract text |
| citations | ~2.8B edges | Directed citation links with intent (Background/Methodology/Result) + influential flag |
| embeddings | ~200M+ | SPECTER2 768d vectors (pre-computed, citation-aware) |
| tldrs | ~60M | Machine-generated one-sentence summaries |
| s2orc | ~12M | Full-text structured papers (parsed from PDFs) |
| paper-ids | ~225M | Cross-reference mapping (DOI, PMID, arXiv) |

- **Format**: Gzipped JSONL, monthly releases with incremental diffs
- **API key**: Required for dataset downloads (free)
- **Domain filtering**: "Neuroscience" is not a separate field — falls under Medicine/Biology/Psychology. Use PMID cross-reference with PubMed MeSH for fine-grained filtering
- **Total download**: ~45 GB for papers dataset (only full bulk download); stable paper metadata, authors, OA PDF metadata, references, abstracts, TLDRs, and embeddings fetched via S2 Batch API for domain paper IDs only

### PubTator3 (NCBI Biomedical Annotations)

Pre-computed entity annotations and relations for all of PubMed, using NCBI's
state-of-the-art AIONER NER and BioREx relation extraction.

| Data | Volume | Source |
|------|--------|--------|
| Entity annotations | ~1.6B rows (6 types) | Tab-delimited FTP, 5.6 GB compressed |
| Relations | ~33M rows (8 types) | Tab-delimited FTP, 276 MB compressed |
| Annotated abstracts | ~36M papers | BioCXML FTP, 190 GB compressed |

- **Entity types**: Gene/Protein (NCBI Gene), Disease (MeSH), Chemical (MeSH), Species (NCBI Taxonomy), Mutation (dbSNP/HGVS), CellLine (Cellosaurus)
- **Relation types**: Association, Positive_Correlation, Negative_Correlation, Binding, Drug_Interaction, Cotreatment, Comparison, Conversion
- **BioCXML includes full abstract text** with character offsets — eliminates need for separate E-utilities abstract acquisition
- **Update cadence**: Monthly full dump (no incrementals)
- **Loading strategy**: `COPY` into unlogged staging tables, build indexes, atomic table swap via `ALTER TABLE RENAME`

---

## 3. Technology Decisions (With Alternatives Considered)

Each decision below was reached after evaluating all serious alternatives.
The "Why not" column captures the key reason alternatives were rejected.

### Frontend

| Decision | **Next.js 16** with Mantine 8 |
|----------|-------------------------------|
| Why | Cosmograph has native React bindings. Vercel AI SDK deepest integration. Mantine 8 existing design system. |
| Runner-up | **SvelteKit** — 40-60% smaller bundles, best DX scores, but no Cosmograph Svelte bindings |
| Also considered | TanStack Start (immature), React Router v7 (simpler but no PPR), Nuxt (no Cosmograph Vue bindings) |
| Eliminated | Astro (content sites), Qwik (lazy-loading conflicts with WebGL/WASM), Angular (heavyweight) |

### LLM Streaming

| Decision | **Vercel AI SDK 6** |
|----------|---------------------|
| Why | Industry standard for React AI apps. Server Actions, `useChat`, streaming, structured output via Zod, multi-provider support. |
| Key detail | RAG is DIY via tool calling — no built-in vector store abstraction. Citations are provider-specific, not standardized. |
| Multi-provider | Different models for different tasks: `@ai-sdk/google` (synthesis), `@ai-sdk/openai` (extraction), `@ai-sdk/anthropic` (complex reasoning) |

### Backend Platform + Data Storage

| Decision | **Self-hosted PostgreSQL (US)** + **FastAPI evidence API** + **Auth.js or Supabase Auth** + optional thin web SQL client |
|----------|---------------------------------------------------------------------------------------------------------------------------|
| Why | Domain-filtered data is 50-150 GB — too large for Supabase Cloud ($1,870+/month for required compute) but trivial for a US dedicated server (~$189/month for 128 GB RAM, 3.84 TB NVMe). |

Important boundary rule:

- FastAPI owns canonical evidence semantics, release scoping, retrieval, and later
  vector-store orchestration
- any frontend SQL client that remains is metadata-only scaffolding, not part of
  the graph hot path or the evidence contract
- the browser graph runtime is DuckDB-first and Parquet-backed, not JS-hydrated

**Why NOT Supabase Cloud for the database**: Supabase Cloud Pro includes 8 GB.
Our domain-filtered dataset is 50-150 GB with pgvector HNSW indexes that need
to fit in RAM. Supabase's 8XL compute ($1,870/month) or higher would be needed.
Self-hosted PostgreSQL on a US dedicated server provides 128 GB RAM for
~$189/month (ReliableSite EPYC 4545P, NJ/Miami/LA data centers) — 10x cheaper.
US hosting is required for this project.

**Auth options** (still being evaluated):
- **Auth.js (NextAuth v5)**: Free, framework-native, no extra service. Handles OAuth, credentials, sessions.
- **Supabase Auth (self-hosted)**: Run just GoTrue + Kong containers pointed at your PG. Get Supabase Auth features without Supabase Cloud pricing.
- **Supabase Cloud Free tier**: Use Supabase Cloud solely for Auth (50K MAU free), keep data on self-hosted PG.
- **Clerk**: Managed auth ($25+/month), excellent DX, but adds vendor dependency.

Implementation note:

- Drizzle may remain only as a thin Next.js metadata/read helper where it is
  already useful. It is not a required part of the evidence or RAG architecture.
- FastAPI remains the canonical evidence API boundary over PostgreSQL, with
  Qdrant added later only behind that boundary.

**Data storage architecture — Base/Evidence split**:

```
HOT (Self-Hosted PostgreSQL, ~50-150 GB)
├── Web app: users, saved searches, bookmarks (~1 GB)
├── Paper metadata: 500K-2M papers (~5-10 GB)
├── RAG chunks + MedCPT embeddings: pgvector HNSW (~10-30 GB)
├── Domain PubTator annotations: 25-80M rows (~10-20 GB)
├── Domain PubTator relations: 500K-1M rows (~1 GB)
├── Domain S2 citations: 50-100M edges (~10-20 GB)
├── Domain SPECTER2 embeddings: 5-10M vectors halfvec (~12-24 GB)
└── TLDRs for domain papers (~1-2 GB)

COLD (local NVMe only, ~60 GB — just raw source files)
├── S2 papers dataset: 225M rows (~45 GB JSONL.gz) — only full bulk download
├── PubTator3 tab files: entities + relations (~11 GB compressed)
└── That's it. Everything else comes via S2 Batch API.
```

The key insight: **we don't download everything in bulk.** Only the S2 papers
dataset (~45 GB) is a full download — DuckDB filters it to identify domain
corpus IDs (500K-2M papers). Then the S2 Graph Batch API fetches the stable
paper metadata we actually need for those IDs: abstracts, TLDRs, SPECTER2
embeddings, text availability, venue/journal metadata, OA PDF metadata,
authors, and later outgoing references. PubTator3 tab files (~11 GB) are
downloaded in full and streamed through a domain filter into PostgreSQL.
DuckDB is a one-time filter tool, not a data store.

### Canonical PostgreSQL Backbone

The durable backbone is relational and now centered on base admission rather
than older multi-tier first-paint policy.

- `solemd.corpus`: domain membership, admission reason, and mapping readiness
- `solemd.papers`: canonical paper metadata plus release-aware S2 enrichment
- `solemd.publication_venues`: normalized publication venue registry
- `solemd.authors`: canonical S2 author snapshots
- `solemd.paper_authors`: ordered author list per paper
- `solemd.author_affiliations`: raw affiliation rows plus later normalized institution / ROR / geo fields
- `solemd.paper_assets`: OA PDF metadata now, mirrored/local assets later
- `solemd.paper_references`: outgoing bibliographic references per paper
- `solemd.citations`: normalized domain-domain citation edges derived from references or a richer citation source
- `solemd.base_policy`: active base-admission policy record
- `solemd.base_journal_family`: curated base journal families
- `solemd.journal_rule`: normalized venue-to-family mapping
- `solemd.entity_rule`: rule-backed base-admission rules
- `solemd.relation_rule`: relation-driven overlap rules
- `solemd.paper_evidence_summary`: durable per-paper evidence summary for restartable base admission
- `solemd.graph_runs`: published run metadata and bundle manifest
- `solemd.graph_points`: run-scoped coordinates with `is_in_base` and `base_rank`
- `solemd.graph_clusters`: run-scoped cluster summaries
- `solemd.graph_base_features`: audit features used to explain base admission
- `pubtator.entity_annotations` / `pubtator.relations`: domain-filtered biomedical evidence substrate

Design rule:
- scalar paper metadata stays on `solemd.papers`
- repeating relations get child tables
- base admission stays in graph-db, not in the browser runtime
- expensive PubTator aggregation is staged into `paper_evidence_summary` before publish
- large evidence scans should join against permanent mapped-paper tables so PostgreSQL can plan parallel workers
- graph bundles, plus any future geo add-on bundles, are exported read models and not source-of-truth tables

Bundle note:
- the browser-facing graph delivery contract is explicitly tiered into `base`,
  `universe`, `active`, and `evidence`; see [bundle-contract.md](bundle-contract.md)

Geo note:
- the planned geo layer already assumes `paper_authors` + `author_affiliations` as its primary input
- Semantic Scholar author affiliations are often sparse, so future geo normalization should enrich `author_affiliations` from OpenAlex / ROR and may port prior SoleMD.App affiliation/backfill logic into `SoleMD.Graph` as first-class engine code during the transition

| Component | Eliminated alternative | Why eliminated |
|-----------|----------------------|----------------|
| Self-hosted PG | Supabase Cloud | 15x more expensive for 150 GB with pgvector |
| Self-hosted PG | Neon ($0.35/GB/month) | $53/month for 150 GB storage alone, plus compute |
| Parquet on R2 | ClickHouse | Overkill — adds another service for batch queries DuckDB handles fine |
| DuckDB embedded | MotherDuck | Cloud dependency, $82/TB/month vs free self-hosted |
| Base/Evidence split | Everything in one PG | Raw source files (~60 GB) kept on disk for re-filtering; domain data lives in PG |

### Vector Search

| Decision | **pgvector** (in self-hosted PostgreSQL) to start, **Qdrant** as upgrade path |
|----------|--------------------------------------------------------------------------------|
| Why | At 2M vectors, pgvector HNSW delivers sub-50ms queries. Zero additional infrastructure. PostgreSQL `tsvector`/`tsquery` provides workable hybrid search. |
| Upgrade trigger | If retrieval evaluations show `ts_rank` is inadequate vs BM25 for biomedical queries, add Qdrant (single Docker container, ~3 GB RAM with scalar quantization). |
| Watch | **ParadeDB pg_search** — true BM25 in PostgreSQL, architecturally ideal, but has documented stability issues (index corruption, write errors). Revisit when it reaches 1.0. |
| Also considered | VectorChord (16x faster indexing than pgvector, worth evaluating), Weaviate (best hybrid search quality but heavier ops), LanceDB (DuckDB integration but FTS limitations) |
| Eliminated | Milvus (overkill — designed for billions), Elasticsearch (massive ops overhead for 2M vectors), Chroma (no hybrid search), Turbopuffer (cloud-only) |

### Data Engine

| Decision | **FastAPI + Dramatiq + Redis** |
|----------|--------------------------------|
| Why | FastAPI for the operations API + inline MedCPT reranking. Dramatiq workers for hours-long batch jobs (PubTator load, embedding, graph build) with crash recovery. |
| Why Dramatiq over Celery | Ack-after-completion by default — if a 1.6B row load crashes at row 800M, the task retries instead of being silently dropped. |
| Phase 2 | **Prefect 3** — web UI for pipeline monitoring, scheduled monthly refreshes, asset-aware caching. Compelling when log-diving becomes painful. |
| Eliminated | Temporal (4 processes, 1-month learning curve for solo dev), Ray (overkill for single machine), Go/Rust/Node.js (no numpy/scipy/sklearn/transformers ecosystem), Supabase Edge Functions (2-second CPU limit) |

### LLM Providers

| Decision | **Multi-model architecture** |
|----------|------------------------------|
| Why | Different models for different tasks. Vercel AI SDK makes provider swapping one line of code. |

| Task | Model | Cost/M tokens | Why |
|------|-------|---------------|-----|
| Primary RAG synthesis | Gemini 2.5 Flash | $0.30 / $2.50 | Best cost/quality, 1M context, 79.9% on medical board exams |
| Complex multi-paper | Claude Sonnet 4.6 or GPT-4.1 | $3.00 / $15.00 | Weighing conflicting evidence across papers |
| Cheap entity extraction | GPT-4.1 Nano | $0.10 / $0.40 | Strict JSON Schema, 1M context |
| Retrieval reranking | Cohere Rerank 3.5 | $2 / 1K searches | Purpose-built, cheaper than LLM reranking |
| Fast preview (optional) | Groq + Llama 3.3 70B | ~$0.60 | Sub-500ms TTFT for instant draft answers |

Estimated cost: **~$30-50/month at 10K queries**.

### Embedding Models

| Decision | **Different models for different purposes** |
|----------|----------------------------------------------|
| Why | Clustering and retrieval are fundamentally different tasks. Citation-aware embeddings for graph layout, search-trained embeddings for RAG. |

| Purpose | Model | Dims | Source | Cost |
|---------|-------|------|--------|------|
| Graph clustering | SPECTER2 | 768 | Semantic Scholar (pre-computed) | Free |
| RAG retrieval | MedCPT | 768 | Self-hosted (ncbi/MedCPT-*-Encoder) | GPU compute (~$2-5 one-time) |
| Entity linking | SapBERT | 768 | Self-hosted | GPU compute |
| Fallback/notes | Qwen3-Embedding-8B | 1024 | Ollama (local) | Free |

**Do NOT self-embed 2M papers for clustering.** SPECTER2 is free, pre-computed, and
citation-aware — a general model would cluster by surface semantics instead of
intellectual lineage.

### Graph Layout

| Decision | **GPU PCA-space kNN → cuML UMAP + cuGraph Leiden** |
|----------|-----------------------------------------------------|
| Why | One shared PCA-space kNN graph now feeds both layout and clustering. That removes duplicated neighbor search, keeps the two stages aligned, and gives the build a durable checkpoint boundary. |
| Cost per rebuild | ~$1-3 GPU rental (one H100 hour) + ~$0.30-5 LLM cluster labels = under $10 total |
| CPU fallback | PaCMAP (60-90 min, best global structure of CPU methods) |
| Why not Cosmograph force layout | Cosmograph embedding mode requires pre-computed 2D coordinates. It cannot do dimensionality reduction from 768d. Force layout is for graph topology, not manifold learning. |
| Cluster labeling | c-TF-IDF for keywords → GPT-4o-mini for natural language labels (~$0.30 for 500 clusters) |
| Incremental updates | UMAP `.transform()` projects new papers onto existing 2D space. Full recompute monthly. |

Implementation notes:

- preprocess SPECTER2 embeddings once
- reduce to a shared PCA-space layout matrix
- build one self-inclusive kNN graph
- reuse that graph through UMAP `precomputed_knn`
- run Leiden from the same kNN graph
- persist run-scoped checkpoints on disk so failed runs resume from the last durable artifact

### Caching

| Decision | **None at launch** — add Valkey 8.1 when justified |
|----------|------------------------------------------------------|
| Why | pgvector queries are <50ms. PostgreSQL buffer cache handles repeated queries. No cache needed until LLM costs exceed ~$100/month from repeated queries or concurrent users exceed ~500. |
| When to add | LLM response caching (31% hit rate saves significant cost), session state, rate limiting |
| Why Valkey over Redis | BSD license, 20% less memory, 1.2M QPS. Redis 8 is AGPLv3 but has native vector sets and LangCache if you want semantic caching. |

### File Serving (Parquet Bundles)

| Decision | **Cloudflare R2** |
|----------|-------------------|
| Why | Zero egress fees. A 500MB Parquet bundle served 1000 times costs $45 on S3 vs $0 on R2. S3-compatible API, CDN-delivered. Free tier: 10 GB storage. |
| Dev | Local filesystem or Supabase Storage |
| Why not Vercel Blob | Egress fees make it expensive for large Parquet files at scale |

### Job Queue

| Decision | **pg-boss** (self-hosted) or **Inngest** (Vercel) |
|----------|------------------------------------------------------|
| Why | pg-boss: PostgreSQL-native, no Redis dependency, atomic job creation within existing DB transactions. Inngest: purpose-built for serverless Next.js on Vercel. |
| Skip | BullMQ (adds Redis without clear benefit over pg-boss), Celery (Python-only, overkill for web app jobs) |

### Monitoring

| Decision | **Langfuse + Sentry + Vercel Analytics** (Phase 1) |
|----------|------------------------------------------------------|
| Phase 1 | Langfuse (LLM tracing, already have it), Sentry (error tracking, free tier), Vercel Analytics (frontend vitals) |
| Phase 2 | PostHog (session replay on graph interactions, understand usage patterns) |
| Phase 3 | OpenTelemetry + Grafana (cross-service tracing, only if debugging latency) |

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER (Browser)                                  │
│                                                                         │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────────────┐  │
│  │   Cosmograph     │  │  DuckDB-WASM    │  │   Vercel AI SDK     │  │
│  │   (WebGL graph)  │  │  (client SQL)   │  │   (streaming chat)  │  │
│  │                  │  │                 │  │                     │  │
│  │  Behind adapter  │  │  Parquet from   │  │  Gemini Flash       │  │
│  │  boundary:       │  │  R2 via HTTP    │  │  streaming synth    │  │
│  │  cosmograph/     │  │  range reqs     │  │  with citations     │  │
│  │  (hooks+widgets) │  │                 │  │                     │  │
│  └────────┬─────────┘  └────────┬────────┘  └──────────┬──────────┘  │
│           │                     │                       │             │
│           └─────────────────────┼───────────────────────┘             │
│                                 │                                     │
└─────────────────────────────────┼─────────────────────────────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    │                            │
         ┌──────────▼──────────┐      ┌──────────▼──────────┐
         │   Next.js 16        │      │   Auth Service        │
         │   (Vercel / Docker) │      │   (Auth.js or         │
         │                     │      │    Supabase GoTrue)   │
         │  Server Components  │      │                      │
         │  Server Actions     │      │  OAuth / anonymous   │
         │  Drizzle ORM reads  │      │  JWT sessions        │
         │  AI SDK streaming   │      │                      │
         │  Route Handlers     │      │                      │
         └──────────┬──────────┘      └──────────┬───────────┘
                    │                             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │   PostgreSQL (Self-Hosted)    │
                    │   dedicated server (ReliableSite or Hetzner), 128GB RAM    │
                    │                               │
                    │  HOT DATA (~50-150 GB):       │
                    │   solemd: papers, rag_chunks,  │
                    │     graph_corpus_embeddings    │
                    │   pubtator: domain-filtered    │
                    │     annotations (25-80M rows), │
                    │     relations (500K-1M rows)   │
                    │                               │
                    │  pgvector: HNSW on MedCPT      │
                    │  tsvector: full-text search     │
                    │  pg-boss: job queue             │
                    └──────────┬───────────────────┘
                               │
                    ┌──────────▼───────────────────┐
                    │   FastAPI + Dramatiq Workers  │
                    │   (Docker)                    │
                    │                               │
                    │  FastAPI:                      │
                    │   Operations API (trigger      │
                    │   builds, check status)        │
                    │   MedCPT reranking (inline)    │
                    │                               │
                    │  Dramatiq Workers:             │
                    │   PubTator3 stream + filter    │
                    │   S2 Batch API fetches         │
                    │   Embedding generation         │
                    │   UMAP + Leiden (GPU rental)   │
                    │   Graph bundle build           │
                    └──────────────────────────────┘

                               │
                    ┌──────────▼───────────────────┐
                    │   COLD DATA (raw source files) │
                    │                               │
                    │  Local NVMe (~60 GB):         │
                    │   S2 papers dump (~45 GB)     │
                    │   PubTator3 tab files (~11 GB)│
                    │                               │
                    │  DuckDB filters S2 papers to  │
                    │  get domain IDs. S2 Batch API │
                    │  fetches the rest. One-time.  │
                    └──────────────────────────────┘

External Data Sources (batch, not real-time):
  ├── PubTator3 FTP (monthly, ~11 GB tab files)
  ├── S2 papers dataset (one-time ~45 GB; monthly diffs via S2 Diffs API)
  ├── S2 Graph Batch API
  │    ├── full paper metadata pass (abstract, TLDR, embedding, text availability,
  │    │    venue, journal, OA PDF, authors)
  │    └── reference pass (outgoing references for domain papers)
  ├── S2 citations dataset (only if intent / influence / context become hard requirements)
  └── GPU rental for UMAP/Leiden (H100, ~$1-3/hr, minutes per run)

File Delivery:
  └── Cloudflare R2 (graph Parquet bundles for DuckDB-WASM, zero egress)
```

---

## 5. Data Flow

### Batch Pipeline (Monthly / On-Demand)

```
1. ACQUIRE
   PubTator3 FTP ──→ Download tab files (~11 GB) ──→ Stream + filter into PostgreSQL
   S2 Datasets API ──→ Download papers dataset only (~45 GB) ──→ Local disk

2. FILTER
   DuckDB reads S2 papers dump ──→ Filter by Medicine + Biology + Psychology
              ──→ Cross-ref PMIDs with PubMed MeSH for neuro/psych/neuro
              ──→ 500K-2M domain paper IDs
              ──→ Load `solemd.corpus` + base `solemd.papers`

3. FETCH + LOAD
   S2 Batch API (full metadata pass)
                ──→ `solemd.papers` (abstract, TLDR, embedding, text availability,
                     paper ids, external ids, journal snapshot, release stamps)
                ──→ `solemd.publication_venues`
                ──→ `solemd.authors`
                ──→ `solemd.paper_authors`
                ──→ `solemd.author_affiliations` (raw strings first)
                ──→ `solemd.paper_assets` (`open_access_pdf`)
   S2 Batch API (reference pass)
                ──→ `solemd.paper_references`
                ──→ derive `solemd.citations` for domain-domain graph edges
   PubTator entities/relations ──→ COPY into pubtator schema ──→ Atomic swap

4. EMBED (RAG)
   Paper abstracts ──→ MedCPT Article Encoder ──→ pgvector HNSW index
   S2ORC full-text (12M papers) ──→ Chunk ──→ MedCPT ──→ pgvector

5. LAYOUT
   SPECTER2 768d ──→ preprocess ──→ PCA layout matrix
   PCA layout matrix ──→ shared kNN checkpoint
   shared kNN ──→ GPU UMAP `precomputed_knn` ──→ 2D coordinates
   shared kNN ──→ GPU Leiden ──→ cluster ids
   coordinates + cluster ids ──→ durable run checkpoints
   Cluster exemplars ──→ GPT-4o-mini ──→ Natural language labels

6. BUNDLE
   Mandatory first-load bundle (`Base`)
     base scaffold coords + cluster fields + compact filter/search metadata
     ──→ DuckDB ──→ base_points.parquet
     Cluster labels + stats
     ──→ DuckDB ──→ base_clusters.parquet
  Optional browser-local artifacts (`Universe`, attached lazily later)
     premapped universe tail with stable appended point indices
     ──→ DuckDB ──→ universe_points.parquet
     local activation surface
     ──→ DuckDB base/universe projection views + temp overlay membership
     ──→ `overlay_point_ids_by_producer` → `overlay_point_ids` → `active_points_web`
     point selection scope
     ──→ DuckDB `selected_point_indices` materialized from Cosmograph clauses
     richer paper detail rows
     ──→ DuckDB ──→ paper_documents.parquet
     cluster exemplar previews
     ──→ DuckDB ──→ cluster_exemplars.parquet
     compact aggregated link summaries if they prove useful
     ──→ DuckDB ──→ optional future aggregated link artifact
   On-demand backend fetch (`Evidence`)
     raw paper-paper citation neighborhoods
     full PubTator annotation / relation payloads
     PDF assets
     later S2ORC full-text / chunk evidence
   Upload to Cloudflare R2
```

Release-aware rule:
- `solemd.papers.s2_full_release_id` tracks the last full metadata pass
- `solemd.papers.s2_embedding_release_id` tracks the last embedding pass
- `solemd.papers.s2_references_release_id` tracks the last outgoing-reference pass
- child tables carry `source_release_id`
- `solemd.papers.s2_references_checked_at` is the paper-level sentinel for the dedicated `paper_references` load

Current API constraint:
- the live S2 batch API supports nested citation/reference paper metadata (`paperId`, `corpusId`, `title`, `year`, `externalIds`)
- it does **not** currently support nested `intents` or `isInfluential` on `citations` / `references`
- nested `references` are not emitted consistently for every paper even when bulk `reference_count > 0`, so the reference pass must trust the live payload rather than the bulk count
- if influence / intent metadata becomes mandatory, use the dedicated S2 citations dataset rather than the paper batch response

### Real-Time (Per User Request)

```
TYPING → entities light up:
  User types "dopamine receptor"
  → DuckDB-WASM: SQL over `current_points_web` / `current_paper_points_web`
    (client-side, <10ms)
  → Cosmograph highlights matching nodes

@ CITATION insertion:
  User types @, sentence = "D2 receptor antagonism in schizophrenia"
  → Next.js captures the current drafting context
  → FastAPI evidence endpoint receives support/refute intent + recent sentences
  → Engine handles retrieval and returns typed evidence bundles + graph signals
  → Browser resolves/promotes the returned papers through DuckDB overlay paths

RAG SEARCH + synthesis:
  User asks "What's the evidence for lithium in bipolar maintenance?"
  → Next.js Ask surface streams through Vercel AI SDK
  → FastAPI resolves graph release + retrieval channels + evidence bundles
  → backend returns stable paper ids / graph signals, not renderer indices
  → browser DuckDB resolves active papers locally and promotes non-active papers
    through overlay membership
  → Streaming answer and graph activation stay visible together
```

---

## 6. Service Inventory

Each service below will get its own deep-dive document with implementation
details, configuration, and integration patterns. This section establishes
what each service does and why it was chosen.

### Tier 1: Core Services (Required for MVP)

| # | Service | Role | Deep-Dive Doc |
|---|---------|------|---------------|
| 1 | **Next.js 16** | Frontend framework — SSR, Server Components, Server Actions, streaming | `next-js.md` |
| 2 | **Mantine 8** | Component library — data tables, overlays, theming, forms | `mantine.md` |
| 3 | **Cosmograph** | Graph visualization — WebGL rendering, DuckDB integration, crossfilters | `cosmograph.md` |
| 4 | **DuckDB-WASM** | Client-side analytics — SQL over Parquet in the browser | `duckdb-wasm.md` |
| 5 | **Vercel AI SDK 6** | LLM streaming — Server Actions, `useChat`, structured output, multi-provider | `vercel-ai-sdk.md` |
| 6 | **PostgreSQL** (self-hosted) | Database — domain-filtered graph data, pgvector, full-text search | `postgresql.md` |
| 7 | **Drizzle ORM** | Type-safe SQL from Next.js Server Components | `drizzle.md` |
| 8 | **pgvector** | Vector search — HNSW indexes on MedCPT embeddings | `pgvector.md` |
| 8b | **Auth.js or Supabase GoTrue** | Authentication — OAuth, anonymous sign-ins, JWT sessions | `auth.md` |
| 9 | **FastAPI** | Operations API — trigger builds, serve manifests, inline reranking | `fastapi.md` |
| 10 | **Dramatiq + Redis** | Task queue — batch jobs with crash recovery | `dramatiq.md` |
| 11 | **Cloudflare R2** | File serving — Parquet bundles with zero egress | `cloudflare-r2.md` |

### Tier 2: Data Sources (Batch Acquisition)

| # | Service | Role | Deep-Dive Doc |
|---|---------|------|---------------|
| 12 | **PubTator3 FTP** | Entity annotations + relations + abstracts for 36M papers | `pubtator3.md` |
| 13 | **Semantic Scholar Datasets** | Papers, citations, SPECTER2, TLDRs, S2ORC full-text | `semantic-scholar.md` |
| 14 | **PubMed E-utilities** | MeSH-based domain filtering for PMID harvesting | `pubmed-eutils.md` |

### Tier 3: ML Models (Embedding + Layout)

| # | Service | Role | Deep-Dive Doc |
|---|---------|------|---------------|
| 15 | **MedCPT** | RAG retrieval embeddings (asymmetric dual-encoder) | `medcpt.md` |
| 16 | **SPECTER2** | Graph clustering embeddings (pre-computed from S2) | `specter2.md` |
| 17 | **cuML UMAP** | GPU dimensionality reduction (768d → 2D) | `cuml-umap.md` |
| 18 | **Leiden** | Graph-based clustering on kNN graph | `leiden.md` |

### Tier 4: LLM Providers

| # | Service | Role | Deep-Dive Doc |
|---|---------|------|---------------|
| 19 | **Gemini 2.5 Flash** | Primary RAG synthesis ($0.30/$2.50, 1M context) | `gemini.md` |
| 20 | **GPT-4.1 Nano** | Cheap structured extraction ($0.10/$0.40) | `openai.md` |
| 21 | **Cohere Rerank 3.5** | Retrieval reranking ($2/1K searches) | `cohere-rerank.md` |

### Tier 5: Monitoring + Observability

| # | Service | Role | Deep-Dive Doc |
|---|---------|------|---------------|
| 22 | **Langfuse** | LLM tracing — token costs, latency, trace hierarchy | `langfuse.md` |
| 23 | **Sentry** | Error tracking — stack traces, breadcrumbs, releases | `sentry.md` |

### Phase 2 Services (Add When Justified)

| Service | Trigger | Role |
|---------|---------|------|
| **Qdrant** | pgvector hybrid search quality insufficient | Dedicated vector DB with native BM25 + vector fusion |
| **Valkey 8.1** | LLM costs >$100/month or >500 concurrent users | Caching layer for LLM responses, session state |
| **MeiliSearch** | Users need typo tolerance / instant search-as-you-type | Full-text search with fuzzy matching |
| **PostHog** | Need to understand user graph interaction patterns | Session replay, product analytics |
| **Prefect 3** | Pipeline monitoring via logs becomes painful | Web UI for pipeline status, scheduled runs |

---

## 7. Cost Structure

### Development Model: Local-First

**All development happens on your machine.** The production server is only
needed when you're ready to deploy for real users.

```
LOCAL (your machine)                    PRODUCTION (dedicated server (ReliableSite or Hetzner))
├── PostgreSQL (Docker)                 ├── PostgreSQL (native)
├── Next.js dev server                  ├── Next.js standalone (Docker)
├── FastAPI (uvicorn)                   ├── FastAPI (Docker)
├── Dramatiq workers                    ├── Dramatiq workers (Docker)
├── Redis (Docker)                      ├── Redis (Docker)
├── Release mirror data (~60 GB on local NVMe)    ├── Release mirror data (~60 GB on NVMe)
└── Graph Parquet (local /public)       └── Graph Parquet (R2 or Caddy)
                                        ├── Cloudflare CDN (free)
                                        ├── Coolify (git-push deploys)
                                        └── Caddy (reverse proxy + SSL)
```

The release mirror data (S2 papers dump + PubTator3 tab files, ~60 GB) **stays on your
local machine**. DuckDB reads the S2 papers dump once to identify domain IDs,
then the Batch API fetches everything else. PubTator3 tab files are streamed
through a filter into PostgreSQL. Release mirror data never needs to be hosted unless
you want the monthly refresh to run unattended on the server.

### Production Deployment: All-in-One Hetzner

**Why NOT Vercel**: Vercel doesn't support WebSockets, has serverless
timeouts (10-15s default), and cross-region latency to your backend adds
80-100ms per call. Running everything on one server gives you <1ms backend
calls, native WebSocket support, and no timeout constraints.

```
User → Cloudflare (free CDN/DNS/DDoS) → ReliableSite (US bare metal)
                                          ├── Caddy (reverse proxy + auto-SSL)
                                          ├── Next.js standalone (port 3000)
                                          ├── FastAPI (port 8000)
                                          ├── Dramatiq workers
                                          ├── PostgreSQL + pgvector
                                          ├── Redis
                                          └── MedCPT models
```

**Deployment workflow**: Git push → Coolify builds Docker images → deploys.
Or GitHub Actions → SSH → `docker compose pull && up -d`.

**Scaling path**: If you outgrow the single server, split Next.js to Vercel
or a second VPS, keep the database on dedicated hardware.

### One-Time Setup

| Item | Cost |
|------|------|
| PubTator3 download (~11 GB tab files) | $0 (bandwidth only) |
| S2 papers dataset (~45 GB) + Batch API calls for domain data | $0 (free API) |
| MedCPT embedding of 2M abstracts (self-hosted GPU) | ~$2-5 |
| GPU UMAP + Leiden on 2M points (H100 rental) | ~$1-3 |
| LLM cluster labels (500 clusters via GPT-4o-mini) | ~$0.30-5 |
| **Total one-time** | **~$5-15** |

### Monthly Operating (Local Development Phase)

Everything runs on your machine. Release mirror data (PubTator3, S2 datasets) lives
on your local NVMe. No hosted services required except LLM APIs.

| Item | Cost |
|------|------|
| Local PostgreSQL (Docker on your machine) | $0 |
| Local Next.js dev server | $0 |
| Local source files (S2 papers dump + PubTator3, ~60 GB on NVMe) | $0 |
| Local DuckDB (filters S2 papers dump, one-time use) | $0 |
| LLM queries (10K/month, Gemini Flash primary) | $30-50 |
| GPU rental for UMAP (one-time, H100 ~$1-3/hr) | $1-3 |
| Sentry (free tier) | $0 |
| **Total monthly (dev)** | **~$30-50** |

### Monthly Operating (Production Deployment)

All services on one US dedicated server. Cloudflare free tier for CDN/DDoS.
Coolify for git-push deploys.

| Item | Cost |
|------|------|
| ReliableSite EPYC 4545P (16c, 128GB DDR5, 2TB NVMe, US) | ~$189 |
| Cloudflare free tier (CDN + DNS + DDoS protection) | $0 |
| Cloudflare R2 (graph Parquet bundles for browser) | $0-15 |
| Backblaze B2 or rsync.net (automated backups) | ~$5 |
| LLM queries (10K/month, Gemini Flash primary) | $30-50 |
| Sentry (free tier) | $0 |
| **Total monthly (prod, US hosted)** | **~$220-260** |

### Scaling Path

| Milestone | Add | Monthly increase |
|-----------|-----|-----------------|
| >500 concurrent users | Valkey caching | +$5-10 |
| >2M papers | Qdrant dedicated vector DB | +$10-20 |
| Production deployment | Supabase Team or self-hosted | +$0-550 |
| Full hosted (Vercel Pro + larger VPS) | Upgraded plans | +$30-50 |

---

## 8. Repo Structure (Proposed)

```
SoleMD.Graph/
├── web/                              # Next.js 16 application
│   ├── app/                          # App Router pages + layouts
│   │   ├── (public)/                 # SEO pages (anonymous access)
│   │   ├── (app)/                    # Authenticated app shell
│   │   │   ├── graph/                # Cosmograph canvas + panels
│   │   │   ├── search/               # RAG search + chat
│   │   │   └── paper/[id]/           # Paper detail view
│   │   └── api/                      # Route handlers (if needed)
│   ├── components/                   # React components
│   │   ├── graph/                    # Graph canvas, filters, panels
│   │   │   └── cosmograph/           # Adapter boundary — all @cosmograph imports here
│   │   ├── search/                   # Search input, results, chat
│   │   └── ui/                       # Shared Mantine components
│   ├── lib/
│   │   ├── db/                       # Drizzle ORM schema + queries
│   │   ├── supabase/                 # Supabase client (server + browser)
│   │   ├── ai/                       # AI SDK config, tools, prompts
│   │   ├── duckdb/                   # DuckDB-WASM singleton + hooks
│   │   └── mantine-theme.ts          # Design system config
│   ├── public/                       # Static assets
│   ├── next.config.ts
│   ├── package.json
│   └── tsconfig.json
│
├── engine/                           # Python data engine (FastAPI + Dramatiq)
│   ├── app/
│   │   ├── api/                      # FastAPI routes
│   │   │   ├── routes/
│   │   │   │   ├── ingest.py         # Trigger PubTator/S2 loads
│   │   │   │   ├── graph.py          # Graph build, status, manifests
│   │   │   │   ├── search.py         # MedCPT reranking endpoint
│   │   │   │   └── status.py         # Health, job status
│   │   │   └── main.py              # FastAPI app factory
│   │   ├── ingest/                   # Data acquisition
│   │   │   ├── pubtator/             # BioCXML + tab bulk loader
│   │   │   ├── semantic_scholar/     # Dataset downloader + parser
│   │   │   └── pubmed/              # E-utilities MeSH filtering
│   │   ├── embed/                    # Embedding generation
│   │   │   ├── medcpt.py            # MedCPT article encoder
│   │   │   └── batch.py             # Batch orchestration
│   │   ├── graph/                    # Graph bundle builder
│   │   │   ├── layout.py            # UMAP + Leiden
│   │   │   ├── labels.py            # c-TF-IDF + LLM labels
│   │   │   └── bundle.py            # DuckDB Parquet writer
│   │   ├── retrieve/                 # RAG search logic
│   │   │   ├── search.py            # Vector + BM25 hybrid
│   │   │   └── rerank.py            # MedCPT cross-encoder
│   │   ├── tasks/                    # Dramatiq task definitions
│   │   │   ├── ingest_tasks.py
│   │   │   ├── embed_tasks.py
│   │   │   └── graph_tasks.py
│   │   └── core/
│   │       ├── config.py            # Service URLs, model config
│   │       ├── db.py                # Database connection
│   │       └── ids.py               # Deterministic ID generation
│   ├── db/
│   │   └── migrations/              # SQL migrations
│   ├── test/                         # pytest with unit/integration markers
│   ├── pyproject.toml               # uv-managed, lean dependencies
│   └── Makefile                     # ingest, embed, graph-build, serve
│
├── docker/
│   ├── compose.yaml                  # All services: db, engine, redis
│   ├── Dockerfile.engine             # Python data engine
│   └── Dockerfile.web               # Next.js standalone (self-hosted)
│
├── .github/
│   └── workflows/                    # CI: lint, test, deploy
│
├── CLAUDE.md                         # Agent instructions
└── README.md
```

---

## 9. Open Questions (For Deep-Dive Docs)

These are questions that should be resolved in the individual service
deep-dive documents, not in this overview.

1. **DuckDB-WASM memory limits**: At 2M rows in Parquet, what's the browser
   memory footprint? Need to profile with realistic data.

2. **Cosmograph at 2M nodes**: Untested. May need level-of-detail aggregation
   (cluster centroids at zoom-out, individual nodes at zoom-in).

3. **Domain filtering precision**: S2 field-of-study classification is coarse.
   How effectively can MeSH cross-referencing narrow to neuroscience/psychiatry?

4. **Incremental UMAP quality**: How much does `.transform()` quality degrade
   over time as new papers accumulate between full recomputes?

5. **Auth model**: What operations require authentication? Is anonymous
   exploration the default with auth only for saved searches/bookmarks?

6. **Terms integration**: How do hand-curated vocabulary terms (from
   SoleMD.App's vocab schema) fit into this system? Filter facets? Type-ahead
   entity recognition? Or defer entirely?

7. **Geolocation layer**: If affiliation-based geography returns later, it
   should be a modular add-on with isolated bundle/query/UI paths rather than a
   branch inside the corpus runtime.

8. **Citation graph edges in Cosmograph**: S2 citation edges (2.8B total) are
   too many for Cosmograph. Need a strategy for filtering to domain-relevant
   edges only.

9. **Graph-powered editor (future vision)**: A rich text editor (Tiptap or
   BlockNote) where writing is live-connected to the knowledge graph — citations
   auto-suggested from context, entities recognized and highlighted on the graph
   as you type, prose potentially becoming nodes in the same embedding space as
   papers. Not a Phase 1 requirement, but a compelling long-term direction that
   should inform architectural choices (e.g., ensure the `@` citation pattern
   from chat search generalizes to an editor context). Investigate when the
   simpler tools (chat + search + explore) reveal what's actually missing.

---

## 10. Repo Transition: SoleMD.Web → SoleMD.Graph

SoleMD.Graph is built by **renaming and restructuring SoleMD.Web**, not by
creating a new repo from scratch. The existing Next.js + Mantine + Cosmograph +
DuckDB-WASM foundation is kept; marketing/landing pages are removed.

**Monorepo structure** (industry standard for single-team mixed-language
projects — one repo, separate directories for each toolchain):

```
SoleMD.Graph/                         # Renamed from SoleMD.Web
├── app/                              # Next.js 16 (existing, restructured)
│   ├── app/                          # App Router
│   ├── components/                   # React components
│   ├── lib/                          # Drizzle, DuckDB, AI SDK, theme
│   ├── package.json
│   └── next.config.ts
│
├── engine/                           # Python data engine (NEW)
│   ├── app/                          # FastAPI + Dramatiq + ingest + embed + graph
│   ├── db/migrations/                # PostgreSQL schema
│   ├── pyproject.toml                # uv-managed
│   └── test/
│
├── docker/
│   └── compose.yaml                  # PostgreSQL, Redis, engine
│
├── data/                             # .gitignored — local source files (~60 GB)
│   ├── pubtator/                     # Downloaded PubTator3 tab files (~11 GB)
│   └── semantic-scholar/             # S2 papers dataset only (~45 GB)
│
├── CLAUDE.md
└── README.md
```

### Transition Steps

1. Rename GitHub repo `SoleMD.Web` → `SoleMD.Graph`
2. Delete marketing/landing pages (keep design system, graph canvas, shared components)
3. Create `engine/` directory with Python project structure
4. Create `docker/compose.yaml` for local PostgreSQL + Redis
5. Update CLAUDE.md and agent instructions for the new scope

### What Stays from SoleMD.Web

- Design system (`globals.css`, `mantine-theme.ts`, color system)
- Cosmograph integration and graph canvas components
- DuckDB-WASM hooks and Parquet loading
- Mantine component library configuration
- Dark mode support, animation system
- Next.js 16 + Turbopack configuration

### What Gets Deleted

- Marketing landing pages, hero sections, CTA blocks
- About/Education/Contact sections
- Any content pages not related to the graph/search app

---

## 11. What's Next — Sequenced Action Plan

The first priority is **data acquisition and storage** because downloads take
time and everything else depends on having data to work with.

### Phase 0: Repo Setup + Data Acquisition (Start Here)

These happen in parallel — set up the repo while data downloads.

| Step | Action | Deep-Dive Doc |
|------|--------|---------------|
| 0a | Rename SoleMD.Web → SoleMD.Graph, delete marketing pages | — |
| 0b | Create `engine/` Python project (pyproject.toml, FastAPI skeleton) | — |
| 0c | Create `docker/compose.yaml` (PostgreSQL + Redis) | `postgresql.md` |
| 0d | **Download PubTator3** tab-delimited files (~11 GB) to `data/pubtator/` | `pubtator3.md` |
| 0e | **Download S2 papers** dataset (~45 GB) to `data/semantic-scholar/`; remaining data via Batch API after filtering | `semantic-scholar.md` |
| 0f | Design PostgreSQL schema (solemd + pubtator schemas) | `postgresql.md` |

### Phase 1: Data Processing + First Graph

Once data is downloaded, process it into the database and build the first graph.

| Step | Action | Deep-Dive Doc |
|------|--------|---------------|
| 1a | Stream PubTator3 tab files → domain-filter → load into PostgreSQL | `pubtator3.md` |
| 1b | DuckDB filter S2 papers → domain IDs → S2 Batch API → PostgreSQL | `semantic-scholar.md` |
| 1c | Load domain subset into PostgreSQL | `postgresql.md` |
| 1d | GPU UMAP + Leiden on SPECTER2 embeddings → 2D layout + clusters | `cuml-umap.md` |
| 1e | Build graph Parquet bundle → load in Cosmograph | `cosmograph.md` |
| 1f | **First visible graph** — papers clustered, filterable | — |

### Phase 2: Search + RAG

Add retrieval and LLM synthesis on top of the graph.

| Step | Action | Deep-Dive Doc |
|------|--------|---------------|
| 2a | MedCPT embedding of domain abstracts → pgvector HNSW | `medcpt.md` + `pgvector.md` |
| 2b | RAG search (vector + full-text hybrid) | `pgvector.md` |
| 2c | Vercel AI SDK streaming with Gemini Flash | `vercel-ai-sdk.md` + `gemini.md` |
| 2d | `@` citation autocomplete | `vercel-ai-sdk.md` |
| 2e | Entity highlighting as you type (DuckDB-WASM client-side) | `duckdb-wasm.md` |

### Phase 3: Auth + Polish + Deploy

Prepare for real users.

| Step | Action | Deep-Dive Doc |
|------|--------|---------------|
| 3a | Auth (Auth.js or Supabase GoTrue) | `auth.md` |
| 3b | Paper detail panel (abstract, entities, TLDR, citations) | — |
| 3c | Cluster label generation (c-TF-IDF + LLM) | `cluster-labels.md` |
| 3d | Deploy to US dedicated server (ReliableSite) | `deployment.md` |
| 3e | Cloudflare CDN + R2 for Parquet serving | `cloudflare-r2.md` |

### SoleMD.App Status

SoleMD.App is being deprecated. If Graph needs any of its useful logic
(affiliation parsing, backfill routines, chunking patterns, graph builder
ideas, service client patterns), that logic should be ported into
`SoleMD.Graph/engine` in an organized way rather than treated as a runtime
dependency. There is no obligation to maintain cross-project compatibility.

---

## Sources

All findings in this document are based on research conducted by 14 parallel
agents on 2026-03-16, covering: Cosmograph v2.6, DuckDB-WASM 1.29, Vercel AI
SDK 6.0, Qdrant 1.17, pgvector 0.8.2, ParadeDB pg_search, VectorChord,
Semantic Scholar Datasets API, PubTator3 FTP, Next.js 16.1, Supabase
(PostgREST v14), Mantine 8.3, Cloudflare R2, Dramatiq, Prefect 3, cuML UMAP,
Leiden, MedCPT, SPECTER2, BGE-M3, Gemini 2.5 Flash, GPT-4.1, Claude 4.5/4.6,
Cohere Rerank 3.5, and 40+ additional technologies evaluated and eliminated.
Full research transcripts preserved in agent output files.
