# Architecture

> Hard boundaries and adapter rules that code must respect.

This doc is the "do not cross" list. It captures the decisions that shape
everything else: which layers own what, which libraries are behind adapters,
which paths the browser must not take. For how things actually work, see the
other docs (see [`map.md`](map.md)).

Agent-facing local networking and runtime operation live in the graph skill
references, not in `docs/map/`.

---

## Goal

Build a web application that lets clinicians and researchers explore
biomedical literature visually through a knowledge graph, and retrieve
evidence through conversational search. The graph renders hundreds of
thousands of papers as an interactive map of neuroscience, psychiatry, and
neurology -- clustered by research community, filterable by entity type,
searchable by concept.

Pre-computed data from PubTator3 and Semantic Scholar provides the raw release
backbone. S2 citation aggregates land in raw ingest, S2 TLDRs and SPECTER2 feed
mapped rollout, and S2ORC_v2 is reserved for evidence-tier full-text fallback.

---

## Three pillars

Three core technologies are non-negotiable.

| Pillar | What | Why nothing else works |
|---|---|---|
| **Cosmograph** (`@cosmos.gl/graph` v2.6 + `@cosmograph/cosmograph`) | GPU-accelerated graph viz via WebGL | sigma.js caps at ~100K, cytoscape.js at ~10K, vis.js at a few thousand. Cosmograph runs force simulation on GPU shaders. |
| **PostgreSQL** self-hosted + pgvector | Canonical relational store + vector search | 50-150 GB domain data is too large for Supabase Cloud (~$1,870/month); self-hosted dedicated server is ~$189/month for 128 GB RAM. |
| **Langfuse** | LLM observability + prompt management + eval | No replacement -- the RAG quality loop depends on it. |

See the technology decisions table below for the surrounding stack. Pinned local
service versions, image tags, and ports live in
`.claude/skills/graph/references/runtime-infrastructure.md`; this document owns
the architectural decisions, not the current compose pins.

---

## Adapter boundaries

The project has two **hard adapter boundaries**. All code on one side of the
boundary must go through the adapter -- no direct imports of the library.

### Cosmograph adapter: `features/graph/cosmograph/`

All `@cosmograph/react` and `@cosmograph/cosmograph` imports are contained
behind a single adapter layer. **No component outside this directory may
import from `@cosmograph/*` directly.**

```
features/graph/cosmograph/
  index.ts                     -- barrel, the only import consumers use
  GraphRenderer.tsx            -- <Cosmograph> component with ~60 props
  GraphShell.tsx               -- CosmographProvider boundary
  hooks/
    use-graph-camera.ts         -- fitView, zoom, pan
    use-graph-selection.ts      -- select, focus, clear
    use-graph-focus.ts          -- focused-node accent state
    use-graph-export.ts         -- screenshot, CSV export
    use-cosmograph-config.ts    -- config stability, pointIncludeColumns
    use-points-filtered.ts      -- filtered point view bindings
    use-zoom-labels.ts          -- zoom-based label visibility
  widgets/
    TimelineWidget.tsx          -- DuckDB-query-backed timeline
    FilterBarWidget.tsx         -- categorical filter
    FilterHistogramWidget.tsx   -- numeric filter
    SelectionToolbar.tsx        -- rect/poly selection state machine
    ColorLegends.tsx            -- type/range color legend
    SizeLegend.tsx              -- size legend
    (init-crossfilter-client.ts, widget-baseline.ts, dataset-cache.ts,
     facet-rows.ts, widget-range-utils.ts, use-widget-selectors.ts,
     native-bars-adapter.ts, native-histogram-adapter.ts)
```

**Rules:**

| # | Rule |
|---|---|
| 1 | Consumers import from `@/features/graph/cosmograph` barrel only |
| 2 | Hooks expose app-shaped APIs (e.g. `fitView(duration, padding)`) -- not raw Cosmograph ref methods |
| 3 | Widgets may use Cosmograph selection clauses for intent, but filter/timeline data itself comes from DuckDB query views, not Cosmograph point metadata |
| 4 | `cosmograph-selection.ts` and `cosmograph-columns.ts` stay in `lib/` because they import `@uwdata/mosaic-core`, not Cosmograph |

When Cosmograph ships a breaking version bump, changes are limited to this
directory. Consumer components, hooks, and panels are untouched.

### Langfuse adapter: `engine/app/langfuse_config.py`

All Langfuse SDK imports are contained behind `langfuse_config.py`. **No
engine module may import `observe`, `get_client`, or `propagate_attributes`
directly from `langfuse`** -- all must come through `app.langfuse_config`.

This solves a critical initialization order problem. The Langfuse v4 SDK
uses OpenTelemetry, which initializes its exporter on the first
`from langfuse import observe`. If the exporter initializes before
`LANGFUSE_PUBLIC_KEY` is in `os.environ`, all traces silently become no-ops.
`langfuse_config` assumes the canonical `solemd op-run graph -- ...` path has
already injected `LANGFUSE_*` before process boot. Import centralization still
matters because any direct early `from langfuse import observe` bypasses that
single safe boundary.

```
engine/app/langfuse_config.py
  configure()                    -- suppresses SDK log noise
  from langfuse import observe   -- SAFE: env vars loaded first
  get_langfuse()                 -- safe client access (None if unavailable)
  flush()                        -- safe flush (no-op if unavailable)
  get_prompt()                   -- Langfuse Prompt Management + local fallback
  SPAN_*                         -- span name registry for @observe decorators
  SCORE_*                        -- score name constants matching eval_langfuse.py
```

**Rules:**

| # | Rule |
|---|---|
| 1 | `from app.langfuse_config import observe` -- never `from langfuse import observe` |
| 2 | Span names use `SPAN_*` constants from the registry, not string literals |
| 3 | Score names use `SCORE_*` constants, matching `RAG_SCORE_CONFIGS` in `eval_langfuse.py` |
| 4 | `flush()` after long-running operations for real-time Langfuse visibility |
| 5 | Adding a new traced span requires registering the constant in `langfuse_config.py` first |
| 6 | Span name convention: `domain.subdomain.operation` (domains: `rag`, `graph`, `ingest`) |

See [`rag.md`](rag.md) for the live RAG runtime path and
`.claude/skills/langfuse/references/benchmarking.md` for the agent-facing
Langfuse benchmark workflow.

---

## Layer boundary rule

The canonical graph runtime is a **single `corpus` layer**. This is an
intentional architecture constraint, not an implementation shortcut.

```
   ALLOWED                         FORBIDDEN
   -------                         ---------

   corpus (single layer)           corpus
     |                                |
     +-- optional module A            +-- chunk_layer (cross-cuts corpus)
     |   (own bundle/query/UI)        |
     +-- optional module B            +-- entity_layer (branches through shared runtime)
         (own bundle/query/UI)
```

Future layers must arrive as **optional modules**, not as cross-cutting
branches. A new layer brings its own:

- bundle contract or API contract
- DuckDB registration and query surface
- UI entry point
- canvas adapter, if it renders on the canvas at all

The base corpus path must remain stable if those modules are disabled. No
deep coupling between future layers and the core store, bundle bootstrap, or
first-paint Cosmograph configuration.

Why: until the corpus-only DuckDB/Cosmograph path is clean, adding more
layers is out of order. Foundational runtime cleanup outranks feature
expansion.

---

## Browser runtime contract

The browser path is split into three lanes on purpose. See
[`graph-runtime.md`](graph-runtime.md) for the full implementation; this doc
owns the hard rules.

| Lane | Views | What it's for |
|---|---|---|
| Render | `current_points_canvas_web`, `current_links_web`, dense active canvas aliases | Cosmograph binds here -- minimum viable row shape |
| Query | `current_points_web`, `current_paper_points_web`, overlay_points_web | Filters, timeline, search, table, detail, point-id resolution |
| Evidence | Release-scoped FastAPI endpoints | Heavy detail, citation payloads, assets, full text, answer grounding |

**Hard rules:**

| # | Rule |
|---|---|
| 1 | `pointIncludeColumns` stays empty on the live graph page |
| 2 | Do not query rich fields from `*_canvas_web` views |
| 3 | Do not rebuild graph interactivity through JS point hydration |
| 4 | DuckDB is for local scope, selection, overlay, and point-id resolution only |
| 5 | Use the backend evidence contract for evidence semantics -- no frontend shortcuts |
| 6 | Frontend binds literally to `current_points_canvas_web` / `current_links_web`; swap views behind those aliases are implementation detail |
| 7 | Filter/timeline UI may mount native `@cosmograph/ui` controls, but only through adapters bound to `current_points_web` -- no Cosmograph accessor widgets that require `pointIncludeColumns` |
| 8 | Focused-node drill-in is a UI-local accent state layered on the real selection -- preserve the underlying DuckDB/Cosmograph selection, use focus only for ring/label/detail emphasis |
| 9 | Frontend adapts to what backend can provide, but adaptations happen at typed integration points -- do not collapse frontend + backend concerns into one layer |

At launch scale this implies a three-domain model:

```
   +----------------------------------------+
   | globally mapped corpus (offline build)  |
   +-------------------+--------------------+
                       |
                       v
   +----------------------------------------+
   | demand-attached graph rows               |
   | (browser DuckDB, bounded working set)    |
   +-------------------+--------------------+
                       |
                       v
   +----------------------------------------+
   | dense active render subset (Cosmograph) |
   +----------------------------------------+
```

RAG may search the larger corpus, but only the returned graph rows needed
for the current interaction are attached and materialized locally.

### Crossfilter performance constraint

Cosmograph's native filter and timeline widgets use `FilteringClient` ->
Mosaic coordinator -> DuckDB-WASM. This enables two-way brushing
(histogram -> graph; graph selection -> histogram) -- one of Cosmograph's
strongest UX features.

Cost: each registered `FilteringClient` fires a full-table DuckDB query
on every selection change. With N active widgets on a 1M-point graph, the
coordinator executes N sequential queries (~3-4s each on single-threaded
DuckDB-WASM 1.32.0).

Known constraints (as of 2026-04-05): no working multi-threaded DuckDB-WASM
bundle; Mosaic queries sequential; `setActive(false)` does not prevent
queries; no configurable debounce. See [`graph-runtime.md`](graph-runtime.md)
for mitigation levers.

---

## Technology decisions

Compressed to the decisions that shape the code. Full cost analysis and
rejected alternatives live in git history.

### Core stack

| Layer | Decision | Why |
|---|---|---|
| Frontend framework | Next.js 16 + App Router | Native Cosmograph React bindings; Vercel AI SDK integration; existing Mantine 8 design system |
| UI library | Mantine 8 | Data tables, overlays, theming, forms |
| Styling | Tailwind CSS 4 | Utility-first, tokens shared with Mantine |
| LLM streaming | Vercel AI SDK 6 | Server Actions, `useChat`, streaming, structured output, multi-provider |
| Database | Self-hosted PostgreSQL + pgvector | Domain data is 50-150 GB with pgvector HNSW that needs to fit in RAM |
| Vector search | pgvector (halfvec storage) | Sub-50ms queries at 2M vectors; zero extra infra |
| Embedding ORM | Drizzle (Next.js reads only) | Thin metadata scaffolding, not part of the hot path |
| Backend API | FastAPI | Canonical evidence + retrieval API |
| Task queue | Dramatiq + Redis | Ack-after-completion avoids dropped hours-long jobs |
| File serving | Cloudflare R2 | Zero egress for large Parquet bundles |
| Browser analytics | DuckDB-WASM | Local SQL over Parquet, minimal JS churn |

### Models

| Purpose | Model | Status |
|---|---|---|
| Graph clustering embedding | SPECTER2 (S2 pre-computed) | Live |
| Dense paper retrieval | `allenai/specter2_base` + `specter2_adhoc_query` | Live (self-hosted query encoder) |
| Chunk retrieval / reranking | MedCPT / MedCPT-Cross-Encoder | Experimental |
| Entity linking | SapBERT | Planned |
| Primary RAG synthesis | Gemini 2.5 Flash | Live (Langfuse-managed prompt) |
| Complex multi-paper reasoning | Claude Sonnet 4.6 / GPT-4.1 | Available via AI SDK |
| Cheap structured extraction | GPT-4.1 Nano | Available |

**Do NOT self-embed 2M papers for clustering.** SPECTER2 is free,
pre-computed, and citation-aware -- a general model would cluster by surface
semantics instead of intellectual lineage.

### Graph layout stack

| Component | Choice |
|---|---|
| Dimensionality reduction | `SparseRandomProjection` (single-pass, JL-lemma) |
| Shared kNN | cuML `NearestNeighbors` (CPU fallback: sklearn) |
| Layout | cuML UMAP with `precomputed_knn` |
| Clustering | cugraph Leiden (CPU fallback: igraph) |
| Label seeding | c-TF-IDF (BERTopic-style) |
| LLM labels | Gemini 2.5 Flash via Langfuse-managed prompt |

See [`graph-build.md`](graph-build.md) for the full pipeline.

### Monitoring

| Tool | Role |
|---|---|
| Langfuse | LLM tracing, prompt management, RAG evaluation (datasets, scores, runs, annotation queues) |
| Sentry | Error tracking (free tier) |
| Vercel Analytics | Frontend vitals (when deployed) |

---

## Canonical PostgreSQL backbone

The durable backbone is relational. Full column-level schema lives in
[`database.md`](database.md); the list below is the contract boundary.

**`solemd` schema:**

| Table | Role |
|---|---|
| `solemd.corpus` | Domain membership, admission reason, mapping readiness |
| `solemd.papers` | Canonical paper metadata + release-aware S2 enrichment stamps |
| `solemd.publication_venues` | Normalized publication venue registry |
| `solemd.authors` / `paper_authors` / `author_affiliations` | S2 author snapshots + ordered author list + raw affiliation rows |
| `solemd.paper_assets` | OA PDF metadata (later: mirrored / local assets) |
| `solemd.s2_paper_reference_metrics_raw` | Broad raw citation aggregates for gating |
| `solemd.paper_citations` | Mapped actual paper-to-paper citation edges |
| `solemd.base_policy` | Active base-admission policy record |
| `solemd.base_journal_family` / `journal_rule` | Curated journal families + venue -> family mapping |
| `solemd.entity_rule` / `relation_rule` | Rule-backed base-admission rules |
| `solemd.paper_evidence_summary` | Durable per-paper evidence summary (restartable base admission) |
| `solemd.graph_runs` / `graph_points` / `graph_base_points` / `graph_clusters` / `graph_base_features` | Run-scoped coordinates + cluster assignments + base admission + audit features |
| `solemd.vocab_terms` | 3,361 curated psych/neuro terms with UMLS CUIs (drives `entity_rule` generation) |
| `solemd.paper_documents` / `paper_sections` / `paper_blocks` / `paper_sentences` | RAG warehouse content hierarchy |
| `solemd.paper_citation_mentions` / `paper_entity_mentions` | In-text anchors + entity hits |
| `solemd.paper_chunks` / `paper_chunk_versions` / `paper_chunk_members` | Versioned retrieval chunks |

**`pubtator` schema:**

| Table | Role |
|---|---|
| `pubtator.entity_annotations` | ~25-80M rows, domain-filtered entity hits |
| `pubtator.relations` | ~500K-1M rows, domain-filtered relation hits |

### Design rules

| # | Rule |
|---|---|
| 1 | Scalar paper metadata stays on `solemd.papers` |
| 2 | Repeating relations get child tables |
| 3 | Base admission stays in graph-db, not in the browser runtime |
| 4 | Expensive PubTator aggregation is staged into `paper_evidence_summary` before publish |
| 5 | Large evidence scans join against permanent mapped-paper tables so PG can plan parallel workers |
| 6 | Graph bundles are exported read models, not source-of-truth tables |
| 7 | Frontend SQL client (Drizzle) is metadata-only scaffolding, not part of the hot path or evidence contract |

---

## Data storage split

| Tier | Lives in | Contents |
|---|---|---|
| HOT | PostgreSQL (~50-150 GB) | Users, mapped papers, chunks, MedCPT embeddings (HNSW), PubTator annotations + relations, citation aggregates, mapped SPECTER2 (halfvec), mapped TLDRs, evidence text |
| COLD | Local NVMe / release mirror | S2 and PubTator release files that are still active, resumable, or awaiting mapped/evidence consumption. Raw source files only. |

S2 broad corpus work is release-backed through `apps/worker/app/ingest/`.
The live Semantic Scholar Graph API is not the corpus backbone; use it only for
bounded enrichment or reconciliation where rate limits and non-release
semantics are acceptable.

---

## Release-aware enrichment

Per-field S2 release tracking on `solemd.papers`:

| Column | Tracks |
|---|---|
| `s2_full_release_id` | Last full metadata pass |
| `s2_embedding_release_id` | Last embedding pass |
| `s2_references_release_id` | Last outgoing-reference pass |
| `s2_references_checked_at` | Paper-level sentinel for references load |

Child tables carry `source_release_id`. This lets the monthly refresh run
independent passes per dataset without forcing a full re-enrichment.

---

_Last verified against code: 2026-04-08_
