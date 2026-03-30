# SoleMD.Graph — RAG System

> **Scope**: Evidence retrieval, ranking, answer synthesis, and warehouse
> grounding within the SoleMD.Graph engine.
>
> **Related docs**:
> - `database.md` — schema details for `solemd.*` and `pubtator.*` tables
> - `data.md` — data flow from PubTator3 and Semantic Scholar into PostgreSQL
> - `architecture.md` — full system stack overview
> - `graph-layout.md` — build pipeline, layout, bundle export

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
|  service.py          Orchestrates the full retrieval pipeline         |
|  repository.py       PostgreSQL read repository                       |
|  ranking.py          RRF fusion + intent affinity scoring             |
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

All channels are release-scoped through `solemd.graph_points`.

| Channel | Enum | RRF Weight | Source | Description |
|---------|------|-----------|--------|-------------|
| Lexical | `lexical` | 1.00 | `solemd.papers` FTS | Title-first `websearch_to_tsquery` + `pg_trgm` similarity |
| Entity match | `entity_match` | 0.95 | `solemd.entities` + `pubtator.entity_annotations` | Exact concept-id or canonical-name match, fuzzy fallback |
| Relation match | `relation_match` | 0.90 | `pubtator.relations` | Exact normalized `relation_type` match |
| Semantic neighbor | `semantic_neighbor` | 0.85 | `solemd.papers.embedding` | pgvector cosine distance from selected paper |
| Citation context | `citation_context` | boost only | `solemd.citations` | Bounded expansion from already-recalled candidate set |

### Fusion Formula

```
fused_score =
    RRF(lexical_rank, w=1.00)
  + RRF(entity_rank,  w=0.95)
  + RRF(relation_rank, w=0.90)
  + RRF(semantic_rank, w=0.85)
  + title_similarity  * 0.05
  + citation_boost    * 0.18
  + entity_score      * 0.24
  + relation_score    * 0.16
  + intent_score      * 0.14

RRF(rank, w) = w / (60 + rank)    where rank is 1-based channel position
```

### Evidence Intent

`@Support` and `@Refute` produce bounded cue-language affinity scores.
Support cues: `reduced`, `improved`, `benefit`, `effective`, `protective`, etc.
Refute cues: `no significant`, `not associated`, `failed to`, `null`, `inconsistent`, etc.

---

## Module Inventory

### Retrieval (live pipeline)

| Module | Purpose |
|--------|---------|
| `service.py` | Top-level `RagService.search()` orchestration |
| `repository.py` | `RagRepository` protocol + `PostgresRagRepository` implementation |
| `queries.py` | All SQL templates (paper search, entity/relation recall, citations, etc.) |
| `ranking.py` | RRF fusion, channel weights, intent affinity scoring |
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
| 10 | chunks | `paper_chunks` | COPY/upsert | chunk_versions, blocks (deferred) |
| 11 | chunk_members | `paper_chunk_members` | COPY/upsert | chunks, blocks, sentences (deferred) |

Stages 1-8 are live. Stage 9 is conditional on table existence. Stages 10-11
are deferred until the chunk storage migration is complete.

### Bulk-load posture

For corpus-scale loads, the intended posture is:

- parse many papers off-DB
- build many `GroundingSourcePlan`s
- merge them into one `RagWarehouseWriteBatch`
- execute one staged `COPY -> temp table -> set-based merge` per batch

Operational rules:

- keep per-paper ingest for online repair and targeted reprocessing only
- use batched warehouse writes for backfills and release-scale ingest
- use `db.pooled()` for short metadata reads and transactional batch merges
- use dedicated non-pooled connections only for long COPY lanes or parallel
  bulk workers
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
- `engine/db/scripts/backfill_chunks.py` backfills chunks in configurable
  multi-paper batches instead of one transaction per paper
- `engine/db/scripts/backfill_chunks.py --run-id ...` now persists resumable
  filesystem checkpoints, with the preferred graph tmp root falling back to
  repo-local `.tmp/` when the mounted graph tmp path is unavailable
- the long-running operational posture is now explicit:
  `db.pooled()` for short metadata reads and direct `db.connect()` write lanes
  for staged COPY/upsert work

Current raw-source audit snapshot:
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

### Chunk-backed retrieval

Chunk tables (`paper_chunks`, `paper_chunk_members`) remain deferred until:
1. `paper_chunk_versions` is live in the schema
2. Derived chunks are backfilled from canonical blocks/sentences
3. Lineage validation confirms chunk-member integrity
4. Post-load indexes are in place

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

This means the future chunk lifecycle is:
- parse canonical spans
- seed one default `paper_chunk_versions` row
- backfill `paper_chunks`
- backfill `paper_chunk_members`
- then enable chunk-backed retrieval and cited-span grounding

The DB-side artifacts for that path now exist in the repo:
- deferred migration file:
  `engine/db/migrations/031_rag_derived_serving.sql`
- default chunk-version seed preview:
  `engine/db/scripts/preview_chunk_seed.py`
- executable chunk-version seed helper:
  `engine/db/scripts/seed_chunk_version.py`
- executable chunk-content backfill helper:
  `engine/db/scripts/backfill_chunks.py`
- runtime readiness inspector:
  `engine/db/scripts/inspect_chunk_runtime.py`
- runtime chunk-version seeder:
  `engine/app/rag/chunk_seed.py`
- runtime chunk backfill writer contract:
  `engine/app/rag/chunk_backfill.py`

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

Qdrant (or equivalent) for ANN search over paper and chunk embeddings. The
canonical warehouse stores lexical fallback and provenance; dense retrieval
stays external to PostgreSQL.

Current recommendation:
- paper-level recall: `SPECTER2`
- chunk/span retrieval: `MedCPT`
- chunk reranking: `MedCPT-Cross-Encoder`

The `embedding_model` field on `paper_chunk_versions` is currently metadata
only. It records the intended embedding family for a chunk version, but the
live paper-level baseline does not embed or retrieve chunk vectors yet.

### Demand-attach graph materialization

When the graphable corpus exceeds the locally attached browser universe,
the existing DuckDB remote-attachment path (`ensureGraphPaperRefsAvailable`)
fetches narrow Arrow IPC rows on demand without widening the canvas payload.
