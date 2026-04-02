# SoleMD.Graph — RAG System

> **Scope**: Evidence retrieval, ranking, answer synthesis, and warehouse
> grounding within the SoleMD.Graph engine.
>
> **Related docs**:
> - `database.md` — schema details for `solemd.*` and `pubtator.*` tables
> - `data.md` — data flow from PubTator3 and Semantic Scholar into PostgreSQL
> - `architecture.md` — full system stack overview
> - `graph-layout.md` — build pipeline, layout, bundle export
> - `rag-architecture.md` — full ingest/runtime/grounding deep-dive
> - `rag-architecture-code.md` — code-oriented companion with key function snippets

---

## Overview

The RAG system provides release-scoped biomedical evidence retrieval over
the knowledge graph. A user asks a question (or uses `@Support`/`@Refute`
evidence intents), the engine searches across five retrieval channels,
fuses scores with Reciprocal Rank Fusion, assembles paper-level evidence
bundles, and returns a typed response that the frontend resolves against the
local DuckDB graph runtime.

The current baseline is **paper-level**: it retrieves and ranks whole papers,
not sub-document spans. A warehouse layer is under construction to add
block/sentence grounding, inline citations, and cited-span packets without
changing the outer graph integration boundary.

---

## System Architecture

```
+-----------------------------------------------------------------------+
|  BROWSER                                                              |
|                                                                       |
|  PromptBox / useChat / @ evidence assist                              |
|  Vercel AI SDK streaming                                              |
|  Response tray (visible beside the graph)                             |
+------------------------------+----------------------------------------+
                               |
                               v
+------------------------------+----------------------------------------+
|  NEXT.JS WEB ADAPTER                                                  |
|                                                                       |
|  app/api/evidence/chat/stream.ts     Route Handler (SSE)              |
|  lib/engine/graph-rag.ts             Typed request builder            |
|  lib/engine/rag.ts                   Transport adapter                |
|                                                                       |
|  Sends:  query, graph_release_id, selected refs, scope, intent        |
|  Receives:  answer, evidence bundles, graph signals                   |
+------------------------------+----------------------------------------+
                               |
                               v
+------------------------------+----------------------------------------+
|  FASTAPI ENGINE   engine/app/rag/                                     |
|                                                                       |
|  service.py          Dependency wiring + top-level orchestration      |
|  search_support.py   Query normalization + request/session helpers    |
|  search_retrieval.py Initial retrieval and candidate collection       |
|  search_finalize.py  Enrichment, ranking, grounding, final assembly   |
|  response_serialization.py API response serialization                 |
|  repository.py       Repository adapter surface + session wiring      |
|  repository_*.py     Focused repository mixins by retrieval concern   |
|  ranking.py          Ranking orchestration + stable sort policy       |
|  ranking_support.py  Shared ranking profiles, weights, cue tables     |
|  bundle.py           Evidence bundle + graph signal assembly          |
|  answer.py           Extractive answer synthesis                      |
|  query_enrichment.py Server-side entity/relation term resolution      |
+------------------------------+----------------------------------------+
                               |
              +----------------+----------------+
              |                                 |
              v                                 v
+-----------------------------+   +-----------------------------+
|  POSTGRESQL                 |   |  FUTURE: QDRANT             |
|  solemd.papers              |   |  Dense ANN over chunks      |
|  solemd.citations           |   |  (not yet active)           |
|  solemd.entities            |   +-----------------------------+
|  solemd.graph_points        |
|  solemd.paper_references    |
|  solemd.paper_assets        |
|  pubtator.entity_annotations|
|  pubtator.relations         |
|  solemd.paper_documents  *  |
|  solemd.paper_blocks     *  |
|  solemd.paper_sentences  *  |
|  solemd.paper_*_mentions *  |
|                             |
|  * = warehouse tables       |
+-----------------------------+
              |
              v
+------------------------------+----------------------------------------+
|  RESPONSE                                                             |
|                                                                       |
|  answer text (paper-grounded extractive)                              |
|  evidence_bundles[]    per-paper ranked evidence                      |
|  graph_signals[]       graph-lighting instructions                    |
|  answer_corpus_ids[]   answer-linked paper subset                     |
|  grounded_answer?      (if warehouse spans exist for answer papers)   |
|  retrieval_channels[]  per-channel hit details                        |
+------------------------------+----------------------------------------+
                               |
                               v
+------------------------------+----------------------------------------+
|  DUCKDB LOCAL GRAPH RUNTIME                                           |
|                                                                       |
|  Resolve graph_paper_ref -> local rows                                |
|  Classify: active_resolved / universe_resolved / evidence_only        |
|  Promote universe rows via overlay producers                          |
|  Set answer-linked papers as selected                                 |
+------------------------------+----------------------------------------+
                               |
                               v
+-----------------------------------------------------------------------+
|  COSMOGRAPH   renders only the dense active canvas                    |
+-----------------------------------------------------------------------+
```

---

## Retrieval Flow

```
USER QUERY
  |
  v
_build_query()                     Normalize request fields
  |
  v
_apply_query_enrichment()          Resolve entity/relation terms server-side
  |                                (build_query_phrases + derive_relation_terms)
  v
+------ CHANNEL RETRIEVAL (parallel-safe) ------+
|                                                |
|  1. search_papers()         Lexical (FTS)      |
|  2. search_entity_papers()  Entity-seeded      |
|  3. search_relation_papers() Relation-seeded   |
|  4. fetch_semantic_neighbors() Embedding KNN   |
|                                                |
+------------------------------------------------+
  |
  v
_merge_candidate_papers()          Union all channels, keep best scores
  |
  v
fetch_citation_contexts()          Bounded neighbor pull from candidate set
  |
  v
_derive_citation_seed_scores()     Expand via citation-context neighbors
  |
  v
fetch_entity_matches()             Post-retrieval entity enrichment
fetch_relation_matches()           Post-retrieval relation enrichment
  |
  v
rank_paper_hits()                  RRF fusion + boost scores + intent affinity
  |
  v
top_hits[:k]                       Final ranked paper set
  |
  v
fetch_references()                 Bibliography for top papers
fetch_assets()                     Assets for top papers
  |
  v
assemble_evidence_bundles()        Per-paper bundle with all enrichment
merge_graph_signals()              Deduplicated graph-lighting signals
  |
  v
generate_baseline_answer()         Extractive answer from top bundles
  |
  v
build_grounded_answer_from_runtime()     (only if chunk runtime is actually ready)
  |
  v
serialize_search_result()          Pydantic response
```

---

## Retrieval Channels

All channels are release-scoped through `solemd.graph_points`. The live runtime
uses query-shape-specific ranking profiles (`general`, `title_lookup`,
`passage_lookup`) rather than one fixed global formula.

| Channel | Enum | When it runs | Source | Description |
|---------|------|--------------|--------|-------------|
| Lexical | `lexical` | all profiles | `solemd.papers` FTS | Title-first `websearch_to_tsquery` + `pg_trgm` similarity |
| Chunk lexical | `chunk_lexical` | passage lookup | `solemd.paper_chunks` FTS | Chunk-level lexical recall for sentence and passage-style queries |
| Dense query | `dense_query` | general / passage, and title lookup when lexical title anchors are weak | `solemd.papers.embedding` + pgvector HNSW | Dense paper recall using `allenai/specter2_adhoc_query` in the SPECTER2 paper space |
| Entity match | `entity_match` | enrichment and ranking | `solemd.paper_entity_mentions` | Exact concept-id or canonical-name match, fuzzy fallback |
| Relation match | `relation_match` | enrichment and ranking | `pubtator.relations` | Exact normalized `relation_type` match |
| Semantic neighbor | `semantic_neighbor` | selected-paper expansion | `solemd.papers.embedding` | Dense neighbor expansion around the selected paper |
| Citation context | `citation_context` | boost only | `solemd.citations` | Bounded expansion from already-recalled candidate set; additive boost, not an RRF lane |

### Fusion And Ranking

The live scorer lives across `engine/app/rag/ranking.py` and
`engine/app/rag/ranking_support.py` and differs by query profile:

- all profiles use RRF over `lexical`, `chunk_lexical`, `dense_query`,
  `entity_match`, `relation_match`, and `semantic_neighbor`
- `citation_context` is additive boost-only
- `title_lookup` prioritizes direct title support, title anchors, and selected-paper context
- `passage_lookup` prioritizes chunk lexical support, passage alignment, and suppresses indirect-only candidates
- `general` keeps the broadest balance across lexical, dense, entity, relation, and evidence-quality signals

Shared additive features include title similarity, title anchors, citation
boost, citation intent, entity score, relation score, dense score, publication
type priors, evidence-quality priors, and explicit support/refute intent cues.
The exact coefficients are intentionally centralized in
`ranking_support.py` so the docs do not become a second, stale source of
truth.

### Evidence Intent

`@Support` and `@Refute` produce bounded cue-language affinity scores.
Support cues: `reduced`, `improved`, `benefit`, `effective`, `protective`, etc.
Refute cues: `no significant`, `not associated`, `failed to`, `null`, `inconsistent`, etc.

---

## Module Inventory

### Retrieval (live pipeline)

| Module | Purpose |
|--------|---------|
| `service.py` | Top-level `RagService.search()` orchestration and dependency wiring |
| `search_support.py` | Query normalization, request construction, repository session helpers |
| `search_retrieval.py` | Initial retrieval, route selection, and merged candidate collection |
| `search_finalize.py` | Citation expansion, enrichment, ranking, grounding, final result assembly |
| `response_serialization.py` | `serialize_search_result()` API response serialization |
| `repository.py` | `RagRepository` protocol + `PostgresRagRepository` adapter surface |
| `repository_support.py` | Shared repository support types, constants, and helpers |
| `repository_paper_search.py` | Paper/title/chunk lexical retrieval mixin |
| `repository_seed_search.py` | Entity and relation seed-retrieval mixin |
| `repository_evidence_lookup.py` | Citation/entity/species/reference lookup mixin |
| `repository_vector_search.py` | Dense-query and semantic-neighbor retrieval mixin |
| `queries.py` | All SQL templates (paper search, entity/relation recall, citations, etc.) |
| `ranking.py` | Ranking orchestration, fused-score assembly, stable sort policy |
| `ranking_support.py` | Shared ranking profiles, channel weights, and affinity helpers |
| `bundle.py` | `assemble_evidence_bundles()` + `merge_graph_signals()` |
| `answer.py` | `generate_baseline_answer()` extractive answer from top bundles |
| `query_enrichment.py` | `build_query_phrases()`, `derive_relation_terms()` server-side |
| `types.py` | `RetrievalChannel`, `EvidenceIntent`, `RetrievalScope`, constants |
| `schemas.py` | Pydantic `RagSearchRequest` / `RagSearchResponse` + nested schemas |
| `models.py` | Internal dataclasses (`PaperEvidenceHit`, `EvidenceBundle`, etc.) |

### Contracts

| Module | Purpose |
|--------|---------|
| `serving_contract.py` | Chunk version/record, cited-span packets, inline citations, grounded answer |
| `warehouse_contract.py` | Warehouse row types, alignment status/origin enums, row builders |
| `write_contract.py` | `RagWarehouseWriteBatch` — validated batch of all warehouse row types |
| `parse_contract.py` | Base contract: document/section/block/sentence/mention record types |
| `rag_schema_contract.py` | Physical warehouse table specs and row types |
| `write_sql_contract.py` | SQL templates for staged COPY/upsert warehouse writes |
| `chunk_policy.py` | Default chunk-version policy (`default-structural-v1`) and token budgets |
| `chunk_runtime_contract.py` | Phased chunk runtime cutover: migration gates, write-stage guards |
| `chunk_cutover.py` | Step-by-step cutover workflow for chunk-backed serving |
| `index_contract.py` | Deferred warehouse index matrix (build phases, index roles) |
| `migration_contract.py` | Migration-sequencing contract (stages, table bundles, dependency ordering) |

### Grounding (source parsing + alignment)

| Module | Purpose |
|--------|---------|
| `source_parsers.py` | `parse_s2orc_row()` and `parse_biocxml_document()` adapters |
| `source_selection.py` | `select_primary_text_source()`, `build_grounding_source_plan()` |
| `source_grounding.py` | Align parsed sources to canonical ordinals, build cited-span packets |
| `alignment.py` | `align_span_to_canonical_ordinals()` — conservative offset alignment |
| `grounding_packets.py` | `build_cited_span_packet()`, `build_inline_citation_anchors()` |
| `grounded_runtime.py` | Runtime gate for chunk-backed grounded answers |
| `chunk_grounding.py` | Chunk-lineage read path for future grounded answer packets |
| `chunking.py` | `assemble_structural_chunks()` — derived chunks from blocks/sentences |

Current parser/grounding quality rules:
- BioC parsing must create a real canonical section row even when no title
  passage exists; section fidelity is driven by structured `section_type`,
  not by assuming title passages are always present
- BioC document titles come from the first actual title passage, not the first
  arbitrary passage in the XML
- same-corpus overlay sources are retained when they contribute structural or
  reference/entity value, not only when they carry entities
- entity mentions may enrich a cited span, but they must not manufacture a
  standalone inline-citation packet on their own
- chunk assembly must honor `sentence_source_policy`; stored chunk lineage
  cannot silently mix in fallback sentence segmentation when the chunk version
  disallows it

### Warehouse (write pipeline)

| Module | Purpose |
|--------|---------|
| `warehouse_grounding.py` | Read-side: build grounded answer from live warehouse tables |
| `warehouse_writer.py` | `RagWarehouseWriter.ingest_sources()` / `ingest_grounding_plans()` — orchestrate single-paper and bulk ingest |
| `write_batch_builder.py` | Convert grounding plans to `RagWarehouseWriteBatch` and merge many batches |
| `write_repository.py` | `PostgresRagWriteRepository` — staged COPY/upsert execution |
| `chunk_backfill.py` | Derived chunk backfill writer with multi-paper staged-write support |
| `write_preview.py` | Dry-run renderer: show planned SQL without executing |
| `corpus_resolution.py` | Canonical BioC source-id normalization and `corpus_id` resolution (`PMID`, `PMCID`, `DOI`) |

---

## Contract Inventory

| Contract | Module | Key Types | Purpose |
|----------|--------|-----------|---------|
| Parse | `parse_contract.py` | `PaperDocumentRecord`, `PaperBlockRecord`, `PaperSentenceRecord`, `PaperCitationMentionRecord`, `PaperEntityMentionRecord` | Normalized parser output from any source system |
| Schema | `rag_schema_contract.py` | `PaperDocumentRow`, `PaperBlockRow`, `PaperSentenceRow`, warehouse table specs | Physical PostgreSQL table shapes |
| Warehouse | `warehouse_contract.py` | `PaperCitationMentionRow`, `PaperEntityMentionRow`, `AlignmentStatus`, `SpanOrigin` | Aligned warehouse rows with provenance |
| Serving | `serving_contract.py` | `PaperChunkVersionRecord`, `PaperChunkRecord`, `CitedSpanPacket`, `InlineCitationAnchor`, `GroundedAnswerRecord` | Derived retrieval + answer-grounding units |
| Write | `write_contract.py` | `RagWarehouseWriteBatch` | Validated batch for all warehouse stages |
| Write SQL | `write_sql_contract.py` | `StageSqlTemplateSpec` | Per-table COPY/upsert SQL templates |
| Chunk Policy | `chunk_policy.py` | `DEFAULT_CHUNK_VERSION_KEY`, `build_default_chunk_version_record()` | Canonical defaults for chunk derivation |
| Chunk Runtime | `chunk_runtime_contract.py` | `ChunkRuntimePhase`, `ChunkRuntimeCutoverSpec` | Phased runtime cutover gates |
| Cutover | `chunk_cutover.py` | `ChunkCutoverStepKey`, `ChunkCutoverStep` | Step-level chunk serving cutover |
| Index | `index_contract.py` | `IndexBuildPhase`, `IndexRole`, `RagIndexMethod` | Warehouse index lifecycle |
| Migration | `migration_contract.py` | `MigrationStage`, `RagMigrationBundleSpec` | Warehouse migration ordering |

---

## Evidence Bundle Assembly

Each top-ranked paper becomes an `EvidenceBundle`:

```
PaperEvidenceHit (ranked)
  |
  +-- citation_contexts[]     CitationContextHit (incoming/outgoing)
  +-- entity_hits[]           EntityMatchedPaperHit (concept matches)
  +-- relation_hits[]         RelationMatchedPaperHit (relation type matches)
  +-- references[]            PaperReferenceRecord (bibliography)
  +-- assets[]                PaperAssetRecord (figures, supplements)
  +-- snippet                 Preview text (citation context > tldr > abstract)
  +-- rank_features{}         Per-signal score breakdown
  +-- matched_channels[]      Which retrieval channels matched
  +-- match_reasons[]         Human-readable match explanations
```

Graph signals are derived per-bundle and deduplicated:

```
Bundle -> build_bundle_graph_signals()
  |
  +-- ANSWER_EVIDENCE / ANSWER_SUPPORT / ANSWER_REFUTE  (primary)
  +-- ENTITY_MATCH          (if entity hits exist)
  +-- RELATION_MATCH        (if relation hits exist)
  +-- CITATION_NEIGHBOR     (per citation-context neighbor)
  +-- SEMANTIC_NEIGHBOR     (from selected-paper embedding proximity)
```

---

## Source Grounding Pipeline

The grounding pipeline converts raw paper sources into canonical warehouse
records. This runs offline (not in the live Ask path).

```
Raw S2ORC v2 JSON  ──>  parse_s2orc_row()      ──>  ParsedPaperSource
Raw BioCXML        ──>  parse_biocxml_document() ──>  ParsedPaperSource
                                                          |
                                                          v
                                            select_primary_text_source()
                                            build_grounding_source_plan()
                                                          |
                                                          v
                                              GroundingSourcePlan
                                              {primary, annotations}
                                                          |
                        +--------------------+------------+-------------+
                        |                    |                          |
                        v                    v                          v
               align citations      align entities            assemble chunks
               (primary text)    (primary + overlay)       (structural chunking)
                        |                    |                          |
                        v                    v                          v
            PaperCitationMentionRow  PaperEntityMentionRow   PaperChunkRecord
                        |                    |               PaperChunkMemberRecord
                        +--------------------+                         |
                                   |                                   |
                                   v                                   v
                        build_write_batch_from_grounding_plan()
                                   |
                                   v
                        RagWarehouseWriteBatch
                        {documents, sources, sections, blocks,
                         sentences, references, citations,
                         entities, chunk_versions?, chunks?, members?}
                                   |
                                   v
                        PostgresRagWriteRepository.apply_write_batch()
                                   |
                                   v
                        Staged COPY/upsert into solemd.paper_* tables
```

Source selection prefers viable S2ORC v2 (has blocks + citations or sentences)
as the primary text spine. BioCXML serves as an annotation overlay for entity
mentions when both sources exist for the same paper.

### Write Stages (ordered)

| Order | Stage | Table | Method | Dependencies |
|-------|-------|-------|--------|-------------|
| 1 | documents | `paper_documents` | COPY/upsert | — |
| 2 | document_sources | `paper_document_sources` | COPY/upsert | documents |
| 3 | sections | `paper_sections` | COPY/upsert | documents |
| 4 | blocks | `paper_blocks` | COPY/upsert | sections |
| 5 | sentences | `paper_sentences` | COPY/upsert | blocks |
| 6 | references | `paper_reference_entries` | COPY/upsert | documents |
| 7 | citations | `paper_citation_mentions` | COPY/upsert | blocks, references |
| 8 | entities | `paper_entity_mentions` | COPY/upsert | blocks, sentences |
| 9 | chunk_versions | `paper_chunk_versions` | row upsert | — (conditional) |
| 10 | chunks | `paper_chunks` | COPY/upsert | chunk_versions, blocks (conditional) |
| 11 | chunk_members | `paper_chunk_members` | COPY/upsert | chunks, blocks, sentences (conditional) |

Stages 1-8 are live. Stages 9-11 are now runtime-conditional on live table
presence, which means the same write seam can seed the chunk policy row and
backfill chunk rows once the derived-serving migration is applied.

### Bulk-load posture

For corpus-scale loads, the intended posture is:

- parse many papers off-DB
- build many `GroundingSourcePlan`s
- merge them into one `RagWarehouseWriteBatch`
- execute one staged `COPY -> temp table -> set-based merge` per batch
- for row-wise psycopg3 COPY, use plain `COPY ... FROM STDIN` and
  `copy.write_row(...)`; do not mix row-wise COPY with CSV-format clauses
- when rerunning canonical paper ingest in `refresh_existing` mode, treat the
  batch as a replace operation for that paper set: delete existing
  paper-scoped warehouse rows for the batch `corpus_id`s inside the same
  transaction, then rewrite the canonical rows

Operational rules:

- keep per-paper ingest for online repair and targeted reprocessing only
- use batched warehouse writes for backfills and release-scale ingest
- use `db.pooled()` for short metadata reads and transactional batch merges
- use dedicated non-pooled connections only for long COPY lanes or parallel
  bulk workers
- guard `ON CONFLICT DO UPDATE` merges with `IS DISTINCT FROM` checks so retry
  writes do not rewrite identical rows and churn WAL unnecessarily
- never hold database connections open during XML/JSON parsing
- defer non-essential lexical and serving indexes until after bulk loads and
  run `ANALYZE` after the load/index phase

---

## Answer Generation

The current answer path is extractive:

1. `select_answer_grounding_bundles()` picks the top 2 bundles
2. `generate_baseline_answer()` builds a text answer from paper titles,
   years, and snippet text
3. If the chunk-backed grounding runtime is actually ready for the answer-linked
   papers, `build_grounded_answer_from_runtime()` gates into the chunk-lineage
   read path and constructs a structured `GroundedAnswerRecord` with segments,
   inline citations, and cited spans
4. The response includes both `answer` (plain text) and optionally
   `grounded_answer` (structured, when warehouse data is available)

The frontend renders structured inline citations when `grounded_answer` is
present and falls back to plain paper-level answer text otherwise.

---

## Graph Integration

Evidence-to-graph integration follows a strict boundary:

1. Engine returns release-scoped paper evidence + graph signals
2. Frontend resolves `graph_paper_ref` / `corpus_id` through DuckDB aliases
3. Already-active papers light immediately
4. Non-active papers are promoted through overlay producers
5. Answer-linked papers become the selected graph subset

```
Backend graph_signals[]
  |
  v
DuckDB resolution
  |
  +-- active_resolved     Papers already in the active canvas
  +-- universe_resolved   Papers in attached universe, promoted via overlay
  +-- evidence_only       Papers not resolvable in current browser state
  |
  v
Overlay producers promote universe_resolved into active canvas
  |
  v
Cosmograph renders updated active canvas
```

Hard rules:
- No JS point-metadata hydration on the graph hot path
- No backend point indices in evidence responses
- DuckDB owns local graph state; the engine owns evidence semantics

---

## Request / Response Contract

### Request (`RagSearchRequest`)

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `graph_release_id` | `str` | required | Release/run/checksum identifier |
| `query` | `str` | required | User question text |
| `selected_layer_key` | `NodeLayer?` | `null` | `paper` or `chunk` |
| `selected_node_id` | `str?` | `null` | Currently selected graph node |
| `selected_graph_paper_ref` | `str?` | `null` | Explicit paper ref |
| `selected_paper_id` | `str?` | `null` | S2 paper id |
| `selection_graph_paper_refs` | `str[]` | `[]` | Multi-select paper refs |
| `selected_cluster_id` | `int?` | `null` | Cluster scope |
| `scope_mode` | `RetrievalScope` | `global` | `global` or `selection_only` |
| `entity_terms` | `str[]` | `[]` | Explicit entity terms |
| `relation_terms` | `str[]` | `[]` | Explicit relation terms |
| `evidence_intent` | `EvidenceIntent?` | `null` | `support`, `refute`, or `both` |
| `k` | `int` | `6` | Final result count |
| `rerank_topn` | `int` | `18` | Candidate pool size per channel |
| `use_lexical` | `bool` | `true` | Enable lexical channel |
| `generate_answer` | `bool` | `true` | Generate answer text |

### Response (`RagSearchResponse`)

| Field | Type | Purpose |
|-------|------|---------|
| `meta` | `ResponseMeta` | Request id, timing, retrieval version |
| `graph_context` | `GraphContext` | Resolved release + selection echo |
| `query` | `str` | Query echo |
| `answer` | `str?` | Extractive answer text |
| `answer_model` | `str?` | Answer model version |
| `answer_corpus_ids` | `int[]` | Answer-linked paper subset |
| `grounded_answer` | `GroundedAnswer?` | Structured segments + inline citations |
| `evidence_bundles` | `EvidenceBundle[]` | Ranked paper evidence |
| `graph_signals` | `GraphSignal[]` | Graph-lighting instructions |
| `retrieval_channels` | `RetrievalChannelResult[]` | Per-channel hit details |

---

## Mental Model

The shortest useful summary:

```
CURRENT                                 FUTURE
───────                                 ──────
User                                    User
  -> Next.js UI + AI SDK stream           -> same Next.js UI + AI SDK stream
  -> typed web adapter                    -> same typed web adapter
  -> FastAPI paper-level retrieval        -> FastAPI evidence orchestrator
  -> PostgreSQL current tables            -> PostgreSQL warehouse + Qdrant
  -> paper evidence bundles + graph refs  -> cited spans + inline citations + graph refs
  -> DuckDB local graph resolution        -> same DuckDB graph resolution
  -> overlay producers                    -> same overlay producers
  -> Cosmograph render                    -> same Cosmograph render
```

What changes later is the **backend grounding depth**.
What does **not** change is the graph activation boundary:

```
backend returns graph refs
  -> DuckDB resolves them locally
  -> overlay producers activate them
  -> active canvas updates
  -> Cosmograph renders them
```

No JS point hydration. No backend point indices. No second client-side graph engine.

---

## Future Vision

### Future Layer Stack

```
+-------------------------------------------------------------------+
| FASTAPI EVIDENCE ORCHESTRATOR                                     |
|  - paper recall                                                   |
|  - chunk / block / sentence retrieval                             |
|  - cited-span assembly                                            |
|  - inline citation packet assembly                                |
|  - LLM synthesis from grounded spans                              |
+----------------------------+--------------------------------------+
                             |
         +-------------------+-------------------+
         |                                       |
         v                                       v
+----------------------------+   +-------------------------------+
| POSTGRESQL WAREHOUSE       |   | QDRANT / VECTOR SERVING       |
| canonical spine            |   | derived retrieval units        |
|  - paper_documents         |   |  - chunk embeddings            |
|  - paper_sections          |   |  - later sentence/block search |
|  - paper_blocks            |   +-------------------------------+
|  - paper_sentences         |
|  - paper_entity_mentions   |
|  - paper_citation_mentions |
|  - paper_chunks (derived)  |
+----------------------------+
```

### Future Grounding Model

```
paper
  |
  +-> sections
        |
        +-> blocks
              |
              +-> sentences
                    |
                    +-> entity mentions
                    +-> citation mentions
                    +-> later chunk membership
```

### Future Demand-Attach Graph Materialization

When the graphable corpus exceeds the locally attached universe:

```
DuckDB checks:
  1. already active?
  2. already in local universe?
  3. not local yet?
       |
       +-> fetch narrow graph rows only for missing refs
       +-> attach/materialize them in DuckDB
       +-> overlay producer promotes them
       +-> active canvas updates
```

### Current vs Future: What Changes

```
STAYS THE SAME                          UPGRADES LATER
──────────────                          ──────────────
Next.js UI                              backend retrieval depth
AI SDK streaming surface                evidence warehouse
typed web adapter                       chunk/block/sentence grounding
FastAPI as evidence boundary            cited-span packets
DuckDB local graph resolution           inline citations
overlay producers                       final LLM synthesis quality
Cosmograph active-canvas rendering      demand-attachment for graph rows
answer-linked papers become selected
```

---

## User Perspective

### Ask Today

```
I ask:
  "What evidence links melatonin to delirium?"

System today:
  1. finds relevant papers
  2. ranks them at paper level
  3. returns a paper-grounded answer
  4. selects answer-linked papers on the graph
  5. may also promote related papers into overlay

What I see:
  - answer text
  - evidence papers
  - selected studies on the graph
```

### Ask In The Future

```
System later:
  1. recalls papers
  2. retrieves grounded blocks/sentences
  3. synthesizes answer from those cited spans
  4. returns inline citations
  5. selects cited papers on the graph

What I see:
  - answer text with inline citations
  - cited evidence spans
  - cited studies selected on the graph
  - related studies available to explore around them
```

---

## Hard Rules

```
DO                                          DO NOT
──                                          ──────
keep graph activation paper-level           hydrate full point metadata into JS
keep evidence semantics backend-owned       send backend point indices
keep DuckDB for local graph resolution      put heavy evidence objects into point payloads
keep Cosmograph on dense active tables      make the browser parse LLM text for citations
```

---

## Roadmap

### Warehouse population at scale

The canonical warehouse tables exist in the schema but are not yet populated
at corpus scale. The write pipeline (source parsers, alignment, batch builder,
staged writer) is implemented and tested. The next step is running bulk
ingestion against the S2ORC v2 and BioCXML datasets.

The write path is now explicitly batch-oriented:
- `merge_write_batches()` combines many paper batches into one validated
  warehouse batch
- `RagWarehouseWriter.ingest_grounding_plans()` / `ingest_source_groups()`
  apply many parsed papers through one repository write
- `engine/app/rag_ingest/orchestrator.py` is now the engine-owned refresh
  orchestrator for current downloaded release data, and
  `engine/db/scripts/refresh_rag_warehouse.py` is the canonical thin operator
  wrapper
- refresh source-unit progress is now DB-backed in
  `solemd.rag_refresh_source_units`, with atomic worker-safe claims over
  `s2_shard` and `bioc_archive` units
- unit-level resume progress is now DB-backed too:
  `solemd.rag_refresh_source_units.metadata` stores per-unit progress ordinals
  such as `last_processed_ordinal` and `last_corpus_id`, so the same worker can
  reclaim an interrupted `running` unit and resume inside the shard or archive
  instead of restarting the entire unit
- source-driven run-global budgeting is now DB-backed too:
  `solemd.rag_refresh_runs` stores the requested limit and selected-target
  count, and `solemd.rag_refresh_selected_targets` prevents workers from
  overshooting the shared run budget when they discover candidates in parallel
- staged canonical writes now have an explicit row-budget control too:
  `--stage-row-budget` caps approximate warehouse rows per staged write batch,
  using structural counts from the normalized parsed sources rather than file
  size heuristics; the current default is `25000`
- filesystem refresh checkpoints are now worker-local report state rather than
  the shared source of truth; parallel workers write under
  `rag_refresh/<run_id>/<worker-key>/`
- `engine/app/rag_ingest/chunk_backfill_runtime.py` now owns reusable chunk-backfill
  runtime logic, and `engine/db/scripts/backfill_structural_chunks.py` is the
  canonical operator wrapper for currently ingested canonical span tables
- `engine/db/scripts/backfill_structural_chunks.py` backfills chunks in configurable
  multi-paper batches instead of one transaction per paper
- `engine/db/scripts/backfill_structural_chunks.py --run-id ...` now persists resumable
  filesystem checkpoints, with the preferred graph tmp root falling back to
  repo-local `.tmp/` when the mounted graph tmp path is unavailable
- chunk-backfill checkpoints now store static metadata plus per-batch paper
  report files, so long runs do not rewrite one ever-growing report JSON after
  every batch
- the long-running operational posture is now explicit:
  `db.pooled()` for short metadata reads and direct `db.connect()` write lanes
  for staged COPY/upsert work
- the canonical warehouse write path is now live-validated: a bounded refresh
  smoke over `corpus_id = 9787212` wrote canonical rows into
  `paper_documents`, `paper_sections`, `paper_blocks`, `paper_sentences`, and
  `paper_references`
- the first bounded native multi-paper refresh is also live-validated:
  `refresh-batch-20260330-b` ingested `253313057`, `280634650`, and
  `284324019`, skipped already-present `9787212`, and wrote `1345` canonical
  rows from the WSL-native Semantic Scholar release root
- a second native batch is also live-validated: `refresh-batch-20260330-c`
  ingested `2766040`, `52078348`, `202759708`, `237454355`, and `277656163`,
  skipped four already-present papers, and wrote `1832` canonical rows
- the source-driven default is also live-validated: a plain `--limit 5`
  refresh without explicit corpus ids selected supported non-existing papers
  directly from `s2orc_v2-0000.jsonl.gz`, skipped nine already-present papers,
  and ingested `263615713`, `269327934`, `276284199`, `277853448`, and
  `281946597` with `1281` canonical rows written
- a larger source-driven native batch is also live-validated:
  `refresh-batch-20260330-f` ran with plain `--limit 50`, skipped forty-five
  already-present papers, and ingested fifty new canonical papers from
  `s2orc_v2-0000.jsonl.gz` with `15254` rows written
- write-batch normalization now clears unresolved citation-to-reference links
  before persistence; the warehouse validator remains strict, but ingest no
  longer fails when a parsed citation mention has no matching normalized
  bibliography row in the same paper
- S2ORC parsing now emits an implicit preamble section for paragraphs that
  appear before the first `section_header`, so canonical blocks always resolve
  against a real section row
- refresh orchestrator behavior is now explicit:
  - with `--corpus-id` / `--corpus-ids-file`, refresh is targeted against the
    canonical corpus table
  - without explicit corpus ids, refresh is source-driven from the active S2
    shards and still filters discovered ids through the canonical target loader
    before any write
  - `--worker-count` / `--worker-index` now partition source units across
    parallel refresh workers
  - source-driven parallel refresh now supports a run-global `--limit`; worker
    claims stay unit-local, while selected targets are reserved centrally in
    `solemd.rag_refresh_selected_targets`
- targeted parallel refresh is now live-validated: `refresh-parallel-smoke2`
  ran as `worker-00-of-02` and `worker-01-of-02`, claimed
  `s2orc_v2-0000.jsonl.gz` and `s2orc_v2-0001.jsonl.gz` independently through
  `solemd.rag_refresh_source_units`, and ingested `209447147` and `246836000`
  into canonical warehouse tables
- source-driven parallel budget coordination is also live-validated:
  `refresh-bench-v3-1w-20260331`, `refresh-bench-v3-2w-20260331`, and
  `refresh-bench-v3-4w-20260331` all honored the same shared
  `requested_limit = 16` and `selected_target_count = 16` through
  `solemd.rag_refresh_runs` plus `solemd.rag_refresh_selected_targets`
- measured bounded-refresh benchmark result currently favors single-worker
  source-driven refresh:
  - `1 worker`: `0.589s`, `16` papers, `5705` rows
  - `2 workers`: `0.744s`, `16` papers, `6078` rows
  - `4 workers`: `65.051s`, `16` papers, `5865` rows
  - current recommendation: use `1 worker` for bounded source-driven refresh
    with a shared global limit; keep multi-worker mode for targeted runs or
    materially larger shard/domain sweeps where overscan is amortized
- the next larger single-worker source-driven run is also live-validated:
  `refresh-batch-20260331-g` honored `requested_limit = 50`,
  `selected_target_count = 50`, ingested fifty new papers from
  `s2orc_v2-0000.jsonl.gz`, skipped ninety-six already-present papers, and
  wrote `16550` canonical rows
- the next bounded native source-driven batch is also live-validated:
  `refresh-batch-20260331-h` honored `requested_limit = 25`,
  `selected_target_count = 25`, skipped one hundred fifty-nine
  already-present papers, and wrote `5850` canonical rows
- stage-row-budgeted batching is also live-validated:
  `refresh-row-budget-smoke-20260330` ran with `requested_limit = 3`,
  `stage_row_budget = 100`, ingested three new papers, wrote `1007` canonical
  rows, and split the S2 ingest into `3` staged writes with
  `max_batch_total_rows = 422`
- stage-byte-budgeted batching is now live-validated too:
  `refresh-byte-budget-smoke-20260330` ran with `requested_limit = 3`,
  `stage_byte_budget = 2000`, ingested three new papers, wrote `754`
  canonical rows, and split the S2 ingest into `3` staged writes based on
  estimated serialized payload size
  - this byte budget is a flush threshold, not a hard cap; a single paper can
    still exceed it and will be written alone rather than dropped or split;
    the live smoke saw `estimated_bytes_total = 224775` and
    `max_batch_estimated_bytes = 108586`
- fine-grained per-unit resume is now live-validated too:
  `refresh-progress-smoke-20260330` ran with `batch_size = 1`, ingested two
  new papers with `2` staged writes, and the completed
  `s2orc_v2-0000.jsonl.gz` claim row recorded
  `metadata.last_processed_ordinal = 567` plus `metadata.last_corpus_id`
- fine-grained source-unit resume is now test-validated:
  targeted tests cover reclaiming an interrupted S2 shard for the same worker
  and resuming from the saved progress ordinal instead of reprocessing the
  whole shard
- the bounded single-row staged-write posture is also still live-validated
  after the progress changes:
  `refresh-progress-smoke-20260330` ran with `requested_limit = 2`,
  `batch_size = 1`, ingested two new papers, wrote `507` canonical rows, and
  split the S2 ingest into `2` staged writes
- `engine/db/scripts/inspect_chunk_runtime.py` now closes the psycopg pool on
  exit, so one-off readiness checks do not leave background worker threads

Operator entrypoints:
- refresh current downloaded release data:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-30 --parser-version parser-v1 --batch-size 100 --corpus-ids-file /tmp/corpus_ids.txt --checkpoint-root /tmp/rag-refresh --report-path /tmp/rag-refresh.json`
- source-driven bounded refresh from the active S2 release without a hand-built
  corpus-id file:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-30-auto --parser-version parser-v1 --limit 5 --batch-size 5 --max-s2-shards 1 --skip-bioc-fallback`
- source-driven refresh with an explicit staged-write row budget:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-30-rows --parser-version parser-v1 --limit 3 --batch-size 50 --stage-row-budget 100 --max-s2-shards 1 --skip-bioc-fallback`
- source-driven refresh with an explicit staged-write byte budget:
  `cd engine && timeout 30s uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-30-bytes --reset-run --parser-version parser-v1 --limit 3 --batch-size 50 --stage-row-budget 0 --stage-byte-budget 2000 --max-s2-shards 1 --skip-bioc-fallback`
- targeted parallel refresh worker:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-30-parallel --parser-version parser-v1 --corpus-id 209447147 --corpus-id 246836000 --max-s2-shards 2 --skip-bioc-fallback --worker-count 2 --worker-index 0`
- source-driven parallel refresh worker with a shared global budget:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id refresh-2026-03-31-budgeted --parser-version parser-v1 --limit 16 --batch-size 8 --max-s2-shards 4 --skip-bioc-fallback --worker-count 2 --worker-index 0`
- run BioC fallback only for a reconciliation pass:
  `cd engine && uv run python db/scripts/refresh_rag_warehouse.py --run-id bioc-fallback-2026-03-30 --parser-version parser-v1 --skip-s2-primary --max-bioc-archives 4`
- backfill derived chunks for already-ingested canonical spans:
  `cd engine && uv run python db/scripts/backfill_structural_chunks.py --corpus-id 12345 --source-revision-key s2orc_v2:2026-03-10 --parser-version parser-v1 --run-id chunk-backfill-2026-03-30`
- seed the default chunk version row:
  `cd engine && uv run python db/scripts/seed_default_chunk_version.py --source-revision-key s2orc_v2:2026-03-10 --parser-version parser-v1`

Storage rule for large refreshes:
- canonical source truth is release-aware:
  `data/pubtator/releases/<PUBTATOR_RELEASE_ID>/...` and
  `data/semantic-scholar/releases/<S2_RELEASE_ID>/...`
- older repo-level `raw` symlinks were convenience indirection, not the
  canonical runtime contract, and should be removed instead of recreated moving forward
- repo-local dataset mounts should either be direct roots
  (`data/pubtator -> <canonical-root>`, `data/semantic-scholar -> <canonical-root>`)
  or release-aware directories under those roots, not nested `raw` aliases
- the active canonical dataset roots are now:
  - `/home/workbench/SoleMD/SoleMD.Graph-data/data/pubtator`
  - `/home/workbench/SoleMD/SoleMD.Graph-data/data/semantic-scholar`
- current canonical warehouse totals after the latest native refreshes, BioC
  growth, low-value BioC cleanup, and the newest later-window BioC batches are:
  - `paper_documents = 355`
  - `paper_sections = 4054`
  - `paper_blocks = 9494`
  - `paper_sentences = 45331`
  - `paper_references = 12603`
  - `paper_chunk_versions = 1`
  - `paper_chunks = 2269`
  - `paper_chunk_members = 15785`
- current live canonical source coverage is now:
  - `solemd.paper_document_sources = 248` `s2orc_v2` rows
  - `solemd.paper_document_sources = 107` `biocxml` rows
- explicit targeted refresh now routes through release-sidecar corpus locators
  when available:
  - S2 sidecar:
    `data/semantic-scholar/releases/<S2_RELEASE_ID>/manifests/s2orc_v2.corpus_locator.sqlite`
  - BioC sidecar:
    `data/pubtator/releases/<PUBTATOR_RELEASE_ID>/manifests/biocxml.corpus_locator.sqlite`
- explicit targeted refresh can now refresh those source locators inline before
  the warehouse run via `--refresh-source-locators`, then immediately use the
  resulting shard/archive coverage in the same run
- inline locator refresh now reuses existing sidecar coverage and only scans
  missing corpus ids, which keeps rerunnable explicit refreshes bounded
- operational refresh/backfill/archive workflows now live under:
  `engine/app/rag_ingest/`
- the active retrieval/grounding/runtime surface remains under:
  `engine/app/rag/`
- `engine/app/rag_ingest/` now owns:
  - release refresh orchestration
  - source locator refresh/inspection
  - warehouse writer, staged-write planning, and direct-refresh write helpers
  - chunk seed/backfill and resumable checkpoint logic
  - BioC archive discovery, prewarm, ingest, and overlay backfill
  - warehouse QA and other operator-facing ingest helpers
- `engine/app/rag/` now owns:
  - live query enrichment, retrieval, ranking, and evidence bundling
  - structured grounding/runtime read paths
  - chunk-serving/runtime gates and answer synthesis
  - canonical parse/alignment/write contracts shared by ingest and serving
- operator inspection for sidecar coverage now lives in:
  `engine/db/scripts/inspect_rag_source_locator.py`
- bounded BioC archive target discovery now lives in:
  `engine/db/scripts/discover_bioc_archive_targets.py`
- bounded new-ingest BioC archive execution with direct locator seeding now
  lives in:
  `engine/db/scripts/ingest_bioc_archive_targets.py`
- bounded BioC archive-member cache prewarm now lives in:
  `engine/db/scripts/prewarm_bioc_archive_member_cache.py`
- a one-command bounded BioC window runner now lives in:
  `engine/db/scripts/ingest_bioc_archive_window.py`
- that operator can now also ingest directly from a bounded precomputed
  discovery report via `--discovery-report-path`, so archive-window prewarm
  and bounded ingest compose without rerunning candidate discovery
- the default path for that operator is now direct archive-member ingest for
  bounded BioC-only new papers:
  - it fetches only the selected archive members
  - reuses the warehouse writer, chunk seed/backfill, and QA seams directly
  - and avoids routing those small archive-targeted runs through the full
    generic refresh orchestrator
- the member-cache prewarm path is now live-validated:
  `prewarm_bioc_archive_member_cache.py --archive-name BioCXML.5.tar.gz --discovery-report-path ... --limit 6`
  fetched `6` selected members into the release-sidecar cache with
  `cache_hits = 0` and `archive_reads = 6`
- the sequential cache-backed ingest proof is now live-validated too:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.5.tar.gz --discovery-report-path ... --limit 6 --seed-chunk-version --backfill-chunks --inspect-quality`
  then reported `member_fetch.cache_hits = 6` and
  `member_fetch.archive_reads = 0`, ingested `5` BioC papers, skipped
  `1` low-value shell paper, wrote `520` canonical rows, and backfilled
  `50` chunk rows plus `239` chunk-member rows with a zero-flag QA report
- the same cache-backed pattern also now holds at a slightly larger batch size:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.6.tar.gz --discovery-report-path ... --limit 10 --seed-chunk-version --backfill-chunks --inspect-quality`
  reported `member_fetch.cache_hits = 10` and
  `member_fetch.archive_reads = 0`, ingested `7` BioC papers, skipped
  `3` low-value shell papers, wrote `254` canonical rows, and backfilled
  `9` chunk rows plus `86` chunk-member rows with a zero-flag QA report
- the joined one-command window runner is now live-validated too:
  `ingest_bioc_archive_window.py --archive-name BioCXML.7.tar.gz --start-document-ordinal 1001 --limit 4 --max-documents 200 --seed-chunk-version --backfill-chunks --inspect-quality`
  discovered a bounded later window, prewarmed `4` members, then ingested the
  same `4` papers with `member_fetch.cache_hits = 4` and
  `member_fetch.archive_reads = 0`, wrote `1031` canonical rows, and
  backfilled `43` chunk rows plus `468` chunk-member rows with a zero-flag QA
  report
- the slightly larger later-window pattern is now live-validated too:
  `ingest_bioc_archive_window.py --archive-name BioCXML.8.tar.gz --start-document-ordinal 1001 --limit 8 --max-documents 300 --seed-chunk-version --backfill-chunks --inspect-quality`
  scanned `110` docs, reused `30` manifest rows, prewarmed `8` members, then
  ingested `7` BioC papers with `member_fetch.cache_hits = 8` and
  `member_fetch.archive_reads = 0`, skipped `1` low-value shell paper, wrote
  `823` canonical rows, and backfilled `42` chunk rows plus `293`
  chunk-member rows with a zero-flag QA report
- the next archive also holds at a larger bounded window:
  `ingest_bioc_archive_window.py --archive-name BioCXML.9.tar.gz --start-document-ordinal 1001 --limit 10 --max-documents 350 --seed-chunk-version --backfill-chunks --inspect-quality`
  scanned `100` docs, prewarmed `10` members, then ingested `10` BioC papers
  with `member_fetch.cache_hits = 10` and `member_fetch.archive_reads = 0`,
  wrote `740` canonical rows, and backfilled `46` chunk rows plus `266`
  chunk-member rows with a zero-flag QA report
- the generic S2 refresh path is now quality-aware too:
  `refresh_rag_warehouse.py --limit 8 --max-s2-shards 1 --skip-bioc-fallback --seed-chunk-version --backfill-chunks --inspect-quality`
  ingested `8` new `s2orc_v2` papers, wrote `3022` canonical rows, backfilled
  `217` chunk rows plus `1466` chunk-member rows, and returned a zero-flag QA
  report for all `8` ingested papers
- the same generic S2 path also now holds under byte-budgeted staged writes:
  `refresh_rag_warehouse.py --limit 6 --max-s2-shards 1 --skip-bioc-fallback --seed-chunk-version --backfill-chunks --inspect-quality --stage-row-budget 0 --stage-byte-budget 350000`
  ingested `6` new `s2orc_v2` papers, wrote `2574` canonical rows across `5`
  staged writes, backfilled `206` chunk rows plus `1433` chunk-member rows,
  and returned a zero-flag QA report for all `6` ingested papers
- the bounded generic S2 path also holds cleanly at a slightly larger size:
  `refresh_rag_warehouse.py --limit 12 --max-s2-shards 1 --skip-bioc-fallback --seed-chunk-version --backfill-chunks --inspect-quality --stage-row-budget 0 --stage-byte-budget 500000`
  ingested `12` new `s2orc_v2` papers, wrote `3551` canonical rows across `6`
  staged writes, backfilled `267` chunk rows plus `1894` chunk-member rows,
  and returned a zero-flag QA report for all `12` ingested papers
- a sequential bounded S2 campaign runner now also exists:
  `engine/db/scripts/run_s2_refresh_campaign.py`
- that campaign path is now live-validated too:
  `run_s2_refresh_campaign.py --run-count 2 --limit-per-run 6 --max-s2-shards 1 --stage-row-budget 0 --stage-byte-budget 450000 --seed-chunk-version --backfill-chunks --inspect-quality`
  ran two source-driven S2 refreshes with aggregate results:
  - `12` selected targets
  - `12` ingested papers
  - `4399` canonical rows
  - `303` chunk rows
  - `2072` chunk-member rows
  - `0` QA-flagged papers
- the sequential bounded campaign runner is now live-validated too:
  `ingest_bioc_archive_campaign.py --archive-name BioCXML.8.tar.gz --start-document-ordinal 1301 --window-count 2 --max-documents-per-window 180 --limit-per-window 6 --seed-chunk-version --backfill-chunks --inspect-quality`
  ran two later windows with aggregate results:
  - `12` selected candidates
  - `7` ingested papers
  - `5` low-value shell skips
  - `2920` canonical rows
  - `172` chunk rows
  - `1041` chunk-member rows
  - `0` QA-flagged papers
  - prewarm remained the only archive-read cost: `12` prewarm reads,
    `12` ingest cache hits, `0` ingest archive reads
- a second campaign over the next archive also now holds:
  `ingest_bioc_archive_campaign.py --archive-name BioCXML.9.tar.gz --start-document-ordinal 1201 --window-count 2 --max-documents-per-window 200 --limit-per-window 6 --seed-chunk-version --backfill-chunks --inspect-quality`
  ran two later windows with aggregate results:
  - `12` selected candidates
  - `10` ingested papers
  - `2` low-value shell skips
  - `2332` canonical rows
  - `156` chunk rows
  - `867` chunk-member rows
  - `0` QA-flagged papers
  - prewarm remained the only archive-read cost: `12` prewarm reads,
    `12` ingest cache hits, `0` ingest archive reads
- release-sidecar BioC archive manifests now live in:
  `data/pubtator/releases/<PUBTATOR_RELEASE_ID>/manifests/biocxml.archive_manifest.sqlite`
- bounded BioC archive discovery and one-step ingest now support
  `--start-document-ordinal`, so later archive windows can be scanned
  deliberately and rerun deterministically
- bounded warehouse-quality inspection now lives in:
  `engine/db/scripts/inspect_rag_warehouse_quality.py`
- that QA layer is now slightly semantic-aware too:
  it still primarily checks structural warehouse shape, but it now flags
  suspicious structural document titles like `Introduction` so a green report
  is less likely to mask a bad BioC title promotion
- same-corpus BioC overlay discovery can now be requested directly from that
  path with `--existing-s2-only`, so archive scans can target
  "already-ingested S2 paper, still missing BioC overlay" instead of general
  new-ingest candidates or generic existing-document matches
- bounded BioC overlay backfill over existing S2-backed warehouse papers now
  has a clean operator wrapper in:
  `engine/db/scripts/backfill_bioc_overlays.py`
- that overlay backfill path can now drive archive-aware discovery inline via
  `--archive-name` and `--discovery-max-documents`, so operators no longer need
  a manual two-step corpus-id file just to test same-corpus overlays
- a cheap live BioC-only explicit targeted refresh is now validated:
  `refresh-explicit-bioc-inline-20260330` refreshed the BioC sidecar inline,
  located `corpus_id = 249973141` in `BioCXML.0.tar.gz`, and wrote a live
  `biocxml` warehouse source row without a separate manual prep step
- a first bounded live BioC batch is also validated:
  `refresh-explicit-bioc-batch0-20260330` refreshed locator coverage inline
  from `BioCXML.0.tar.gz`, located `10` corpus ids, and wrote `216` canonical
  rows as a clean bounded `biocxml` ingest batch
- a discovery-driven follow-up batch is also validated:
  `discover_bioc_archive_targets.py --archive-name BioCXML.0.tar.gz --limit 20`
  produced a reusable corpus-id file, and
  `refresh-explicit-bioc-batch1-20260330` ingested those `20` corpus ids with
  inline locator refresh for `2062` canonical rows
- a cleaner archive-ingest fast path is now validated too:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.1.tar.gz --limit 3`
  discovered `3` new BioC candidates, seeded `3` BioC locator entries
  directly from discovery results, and ingested `631` canonical rows without a
  separate locator-refresh pass
- the archive-ingest path can now also seed/backfill chunks inline:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.1.tar.gz --limit 2 --seed-chunk-version --backfill-chunks`
  ingested `2` BioC papers, seeded chunk version metadata, and backfilled
  `2` chunk rows plus `23` chunk-member rows in the same run
- the same operator can now also run bounded post-ingest warehouse QA:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.2.tar.gz --limit 2 --seed-chunk-version --backfill-chunks --inspect-quality`
  ingested `2` BioC papers, backfilled `19` chunk rows plus `114`
  chunk-member rows, and returned a zero-flag quality report for the batch
- later-window BioC ingest is now live-validated too:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.2.tar.gz --start-document-ordinal 1001 --limit 2 --max-documents 120 --seed-chunk-version --backfill-chunks --inspect-quality`
  scanned archive ordinals `1001..1120`, ingested `2` BioC papers, wrote
  `120` canonical rows, backfilled `4` chunk rows plus `34` chunk-member
  rows, and returned a zero-flag quality report for both papers
- a second later-window batch is also validated:
  `ingest_bioc_archive_targets.py --archive-name BioCXML.3.tar.gz --start-document-ordinal 1001 --limit 2 --max-documents 120 --seed-chunk-version --backfill-chunks --inspect-quality`
  scanned archive ordinals `1001..1120`, ingested `2` BioC papers, wrote
  `54` canonical rows, backfilled `2` chunk rows plus `22` chunk-member rows,
  and returned a zero-flag quality report for both papers
- later-window `.tar.gz` BioC scans remain sequential at the archive level
  even with `--start-document-ordinal`; the flag is good for bounded
  progression and reproducible windows, not true random access
- BioC archive discovery now writes a narrow manifest sidecar as it scans:
  archive name, document ordinal, member name, and document id
- repeat discovery over a covered window now reuses that manifest instead of
  rescanning the tar stream:
  - cold `BioCXML.4.tar.gz` window at `--start-document-ordinal 1001 --limit 2`
    scanned `25` docs, wrote `25` manifest entries, and selected
    `211023453` / `211070939`
  - immediate repeat of the same window scanned the same bounded logical
    window but reported `manifest_entries_used = 25` and
    `manifest_entries_written = 0`
- low-value BioC shell documents are now explicitly excluded from warehouse
  persistence:
  - title-only / empty-abstract BioC docs with `0` blocks, `0` sentences, and
    `0` references are skipped before write time
  - archive manifests now remember those rows as
    `low_value_shell_document`, so later-window discovery advances past them
    instead of rediscovering them
  - two existing shell docs (`32037055`, `19630648`) were removed from the
    warehouse and marked in the manifest sidecar
  - BioC source locators now preserve `member_name` alongside
    `archive_name + document_ordinal`, so later targeted ingest work has a
    stable archive-member identity to hang cache/index strategies off
  - precomputed discovery reports can now be loaded even when they predate the
    `member_name` field; warmed report reuse no longer breaks on that model
    evolution
  - direct archive ingest now also consults manifest skip memory before fetch,
    so a warmed rerun drops known low-value shell docs before reopening the
    archive
  - warehouse QA now reports `empty_shell_bioc_docs = 0`
- manifest coverage accounting now advances past skipped ordinals too, so a
  skipped manifest row still counts as covered for later-window discovery
- the remaining dominant cost on later-window BioC runs is now the actual
  archive parse traversal to the selected member ordinals, not candidate
  rediscovery; the next real speedup on this lane is archive parse/index
  strategy rather than more discovery plumbing
- direct live validation now exists for the tighter operator path too:
  - `bioc-archive-direct-live-20260331-a` used
    `--discovery-report-path .tmp/bioc-discovery-prewarm-20260330-c.json`
    with `--limit 2 --seed-chunk-version --backfill-chunks --inspect-quality`
  - it ingested `41325340`, skipped low-value shell `37535630`, wrote `26`
    canonical rows, and backfilled `1` chunk plus `8` chunk-member rows
  - immediate rerun `bioc-archive-direct-live-20260331-b` became a fast no-op:
    one candidate was already ingested and the other was dropped from fetch by
    manifest skip memory
- that means the next real optimization step is expanding manifest coverage for
  hot BioC archives, not adding more archive-window CLI knobs
- the canonical graph temp/checkpoint path is WSL-native and should remain on
  ext4-backed storage
- if that storage lives physically on the `E:` drive, it should be the WSL
  distro/VHD-backed filesystem on `E:`, not `/mnt/e`
- future bulk downloads should land there directly so refreshes avoid a second
  relocation step

Current source audit snapshot:
- S2ORC pilot: `200/200` parsed across 4 shards with `avg_blocks ~= 57.56`,
  `avg_sentences ~= 211.56`, and `matched_reference_fraction ~= 0.6792`
- BioC pilot: `199/200` structurally parsed across 2 archives after skipping
  empty-text block/reference passages, with canonical `corpus_id` resolution
  now measured separately from structural parser quality
- BioC document ids are now normalized against standard source identifiers
  first (`PMID`, `PMCID`, `DOI`); unresolved ids remain explicit reconciliation
  work and are not silently promoted into canonical warehouse ingest
- in the current 200-document pilot, `59` BioC docs resolved directly onto
  canonical `corpus_id`, `140` were structurally parseable PMID docs without a
  current corpus-table match, and `1` PMCID remained unresolved
- live locator snapshot:
  - S2 sidecar currently covers:
    - `209447147 -> s2orc_v2-0000.jsonl.gz:355`
    - `246836000 -> s2orc_v2-0001.jsonl.gz:2`
  - BioC sidecar currently covers:
    - `249973141 -> BioCXML.0.tar.gz:4` (`source_document_key = 36326328`)
    - `7663300 -> BioCXML.0.tar.gz:262` (`source_document_key = 219141`)
    - `11749986 -> BioCXML.0.tar.gz:156` (`source_document_key = 2055851`)
    - `20333404 -> BioCXML.0.tar.gz:186` (`source_document_key = 2086540`)
    - `20896083 -> BioCXML.0.tar.gz:134` (`source_document_key = 2035088`)
    - `25521573 -> BioCXML.0.tar.gz:75` (`source_document_key = 1979981`)
    - `35135583 -> BioCXML.0.tar.gz:249` (`source_document_key = 2149940`)
    - `35957843 -> BioCXML.0.tar.gz:157` (`source_document_key = 2057132`)
    - `37481902 -> BioCXML.0.tar.gz:97` (`source_document_key = 2000522`)
    - `38659950 -> BioCXML.0.tar.gz:187` (`source_document_key = 2087684`)
    - `39897528 -> BioCXML.0.tar.gz:109` (`source_document_key = 2012103`)
- rerunnable locator validation is also live:
  - covered-set S2 refresh now exits without rescanning:
    `locator-covered-s2-fast-20260330b` returned `scanned_units = []`,
    `scanned_documents = 0`, and reused existing sidecar coverage for
    `209447147` and `246836000`
  - covered-set BioC refresh now exits without rescanning:
    `locator-covered-bioc-fast-20260330` returned `scanned_units = []`,
    `scanned_documents = 0`, and reused existing sidecar coverage for
    `249973141`
- current same-corpus overlay posture:
  - the first `1000` documents in `BioCXML.0.tar.gz` do not intersect the
    current `s2orc_v2`-backed warehouse paper set with missing BioC overlays
  - a tighter archive-aware operator smoke is now validated too:
    `backfill_bioc_overlays.py --archive-name BioCXML.0.tar.gz --limit 5 --discovery-max-documents 100`
    exits cleanly with `candidate_corpus_ids = []` and no warehouse writes
    while still proving real archive traversal and canonical ID resolution
  - broader bounded sampling over the first `500` documents of
    `BioCXML.0.tar.gz` through `BioCXML.9.tar.gz` also found no same-corpus
    overlay hits against the current S2-backed warehouse subset
  - so the most effective current expansion path is still bounded new BioC
    warehouse ingest plus continued locator growth, not forcing a slow
    overlay-only backfill against mismatched archive windows

### Chunk-backed retrieval

Chunk-backed retrieval is now partially live:
1. `paper_chunk_versions`, `paper_chunks`, and `paper_chunk_members` exist in the schema
2. the default chunk policy row is seeded
3. bounded chunk backfill has executed for a first covered paper subset
4. full cutover still waits on broader coverage plus post-load chunk lexical indexes

The default chunk policy is now codified, not just documented:
- canonical key: `default-structural-v1`
- included section roles:
  `abstract`, `introduction`, `methods`, `results`, `discussion`,
  `conclusion`, `supplement`, `other`
- included block kinds:
  `narrative_paragraph`, `figure_caption`, `table_caption`,
  `table_body_text`
- `table_footnote` remains excluded from the first default retrieval policy
- captions stay standalone
- sentence overlap stays `none`
- current token posture is `256` target / `384` hard max under the simple
  tokenizer contract

The active chunk lifecycle is now:
- parse canonical spans
- seed one default `paper_chunk_versions` row
- backfill `paper_chunks`
- backfill `paper_chunk_members`
- enable grounded cited-span reads for covered papers
- apply post-load indexes and broaden coverage before full cutover

The DB-side artifacts for that path now exist in the repo:
- derived-serving migration file:
  `engine/db/migrations/031_rag_derived_serving.sql`
- default chunk-version seed preview:
  `engine/db/scripts/preview_chunk_seed.py`
- executable chunk-version seed helper:
  `engine/db/scripts/seed_default_chunk_version.py`
- executable chunk-content backfill helper:
  `engine/db/scripts/backfill_structural_chunks.py`
- runtime readiness inspector:
  `engine/db/scripts/inspect_chunk_runtime.py`
- runtime chunk-version seeder:
  `engine/app/rag_ingest/chunk_seed.py`

Live chunk runtime status:
- `paper_chunk_versions = 1`
- current live totals after bounded backfill plus chunk-quality rebackfill:
  - `paper_chunks = 675`
  - `paper_chunk_members = 5189`
- bounded backfill and rebackfill have now executed across the initial covered
  subset plus the residual oversize-chunk papers
- later-window covered BioC papers are also chunk-runtime ready:
  - `inspect_chunk_runtime.py --corpus-id 20499589 --corpus-id 211088512 --corpus-id 210934160 --corpus-id 211023499`
    returned:
    - `grounded_answer_runtime_ready = true`
    - `full_cutover_ready = true`
    - `chunk_rows = 6`
    - `chunk_member_rows = 56`
    - `entity_mention_rows = 102`
- `inspect_chunk_runtime.py` now reports:
  - `grounded_answer_runtime_ready = true` for covered papers
  - `full_cutover_ready = true` for a covered paper such as `283349924`
    after the post-load lexical fallback indexes were applied
- runtime chunk backfill writer contract:
  `engine/app/rag_ingest/chunk_backfill.py`
- end-to-end bounded refresh + chunk lane is also live:
  `refresh-chunk-lane-smoke-20260330-b` ingested `2` new papers, wrote `401`
  canonical rows, seeded the default chunk-version row, and backfilled `36`
  chunk rows plus `222` chunk-member rows in the same operator pass
- S2 paragraph parsing now trims block spans structurally and skips
  whitespace-only paragraphs before canonical persistence, and chunk assembly
  can fall back to sentence text or skip empty blocks defensively during
  backfill
- chunk assembly now splits oversized single-block chunks by canonical
  sentence groups when sentence lineage is available; live `paper_chunks` are
  now at `0` hard-max violations with `max_tokens = 379`
- section-role normalization now treats obvious front-matter headers such as
  acknowledgements, author contributions, funding, conflicts, ethics/data
  availability, abbreviations, and keywords as `front_matter`, and
  front-matter blocks are no longer marked `is_retrieval_default`
- the post-load lexical fallback contract is now aligned with the live schema:
  `idx_paper_blocks_search_tsv` and `idx_paper_chunks_search_tsv` are valid
  expression indexes on `to_tsvector('english', coalesce(text, ''))`, not
  fictional `search_tsv` columns

Operational rule:
- seed the default chunk version once
- backfill chunk content in staged multi-paper batches from canonical
  `paper_blocks` and `paper_sentences`
- inspect readiness before cutover
- do not keep re-upserting the chunk-version row inside every per-paper
  backfill batch

### Inline-cited answer synthesis

When warehouse spans are populated at scale, the answer path upgrades from
extractive paper-level summaries to LLM synthesis over cited spans with
structured inline citations. The `grounded_answer` response field is already
wired through the full stack.

### Dense vector retrieval

The current live runtime keeps dense paper retrieval inside PostgreSQL:

- paper-level dense recall uses pgvector HNSW over `solemd.papers.embedding`
- query encoding uses `allenai/specter2_base` with the
  `allenai/specter2_adhoc_query` adapter
- the encoder is GPU-backed when CUDA is available
- runtime search sessions disable PostgreSQL JIT because it materially reduced
  tail latency on the canonical entity and dense search paths

Chunk vectors are not live in the current runtime. `chunk_lexical` is the live
passage lane today, and the `embedding_model` field on `paper_chunk_versions`
remains metadata only.

Future dense chunk/span retrieval and optional external reranking remain
planned and experimental work. If they land, they should be documented
explicitly as an additional retrieval plane rather than implied as the current
baseline.

### Demand-attach graph materialization

When the graphable corpus exceeds the locally attached browser universe,
the existing DuckDB remote-attachment path (`ensureGraphPaperRefsAvailable`)
fetches narrow Arrow IPC rows on demand without widening the canvas payload.

### Runtime evaluation observability

Runtime evaluation artifacts now preserve both phase-level and leaf-stage
latency detail:

- `phase_profiles_ms` captures the top-level runtime phases
  (`retrieve_search_state`, `finalize_search_result`)
- `stage_profiles_ms` keeps leaf-stage timings without letting those wrapper
  phases drown out the real hotspots
- `stage_call_profiles` exposes repeated-stage loops, which matters for
  passage-style routes that may attempt multiple chunk-search queries
- `candidate_profiles`, `route_profiles_ms`, and `slow_cases` keep the
  candidate fan-out, route signature, session flags, and SQL plan metadata
  needed to explain residual tails instead of tuning from aggregate percentiles
  alone

### Runtime benchmark floor

The current runtime perf floor is now locked by both sampled live cohorts and
fixed checked-in benchmark cohorts:

- sampled current-release cohort:
  - artifact: `engine/.tmp/rag-runtime-eval-current-sample24-v1.json`
  - `24` papers / `72` cases across `title_global`, `title_selected`, and
    `sentence_global`
  - all quality metrics are `1.0`
  - overall `mean_service_duration_ms = 40.104`
  - overall `p95_service_duration_ms = 86.73`
- frozen hard cohort:
  - artifact: `engine/.tmp/rag-runtime-eval-sentence-hard-v1-current-v1.json`
  - `sentence_hard_v1`
  - `hit@1 = 0.9286`
  - `target_in_grounded_answer_rate = 0.9286`
  - `grounded_answer_rate = 1.0`
  - `p95_service_duration_ms = 557.181`
- frozen clinician-style cohort:
  - artifact: `engine/.tmp/rag-runtime-eval-clinical-actionable-v1-current-v1.json`
  - `clinical_actionable_v1`
  - `hit@k = 0.9333`
  - `target_in_grounded_answer_rate = 0.9333`
  - `grounded_answer_rate = 1.0`
  - `p95_service_duration_ms = 414.073`

These cohorts are now part of the DB-backed runtime perf suite in
`engine/test/test_rag_runtime_perf.py`, so future ranking or retrieval
experiments have to clear both the live sampled floor and the fixed difficult
benchmarks.

### Runtime artifact hygiene

Runtime evals and probes intentionally write durable artifacts into repo-local
temp roots (`.tmp`, `engine/.tmp`) so broad overnight runs do not disappear
with an attached shell. The standard cleanup path is:

```bash
cd engine
uv run python scripts/cleanup_repo_tmp.py --min-age-hours 24 --keep-latest-versions 2
```

Use `--delete` to prune the matched set after reviewing the dry-run report.
The version-retention pass collapses superseded `...-vN.json` / `.txt` /
`.stdout` artifacts per series while leaving `.log` and `.pid` files on the
age-based path, so active detached jobs keep their handles.
