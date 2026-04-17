# SoleMD.Graph RAG Future

Date: 2026-04-14  
Status: canonical architecture and execution plan

## Purpose

This is the single canonical paper for the SoleMD.Graph retrieval-augmentation future state. It merges:

- the strategic review in `docs/archive/rag/rag-future-info.md`
- the executable roadmap from `/home/workbench/.claude/plans/jazzy-inventing-chipmunk.md`
- the accepted refinements from later external architecture reviews

Use this file as the build document. The older review notes remain useful background, but they are no longer the primary handoff.

## Top-Level Flow

Interpretation note:

- the PostgreSQL sub-boxes in this diagram are **logical table families inside the same primary PostgreSQL estate** through `P0–P5`
- they are not separate PostgreSQL primaries
- a physical warehouse-plane split is deferred to `P6` and only happens if measured pressure justifies it

```text
                                   SoleMD.Graph -- Canonical Future Flow

   Source releases
   ---------------
   Semantic Scholar (S2)        PubTator               UMLS / curated vocab
          |                        |                           |
          v                        v                           v
   +----------------+      +----------------+         +----------------------+
   | s2_*_raw       |      | pubtator.*     |         | umls.* / vocab_*     |
   | source_releases|      | entity / rels  |         | alias / xref inputs  |
   | ingest_runs    |      +----------------+         +----------------------+
   +----------------+                 \                      /
             \                         \                    /
              \                         \                  /
               +-------------------------+----------------+
                                         |
                                         v
                         +--------------------------------------+
                         | Canonical PostgreSQL warehouse       |
                         |--------------------------------------|
                         | metadata: papers, paper_text, etc.   |
                         | lifecycle: paper_lifecycle           |
                         | concepts: concepts / aliases / xrefs |
                         | facts: citations / concepts / rels   |
                         | graph control: graph_runs, artifacts |
                         | grounding: documents/sections/blocks |
                         | lineage: chunk_versions/members      |
                         +------------------+-------------------+
                                            |
                    +-----------------------+------------------------+
                    |                        |                        |
                    v                        v                        v
        +----------------------+   +----------------------+   +----------------------+
        | Graph-serving PG     |   | API projections PG   |   | Serving control PG   |
        |----------------------|   |----------------------|   |----------------------|
        | graph_run_metrics    |   | paper_api_cards      |   | serving_runs         |
        | graph_points         |   | paper_api_profiles   |   | serving_artifacts    |
        | graph_clusters       |   | graph_cluster_cards  |   | serving_cohorts      |
        | semantic_neighbors   |   | api_projection_runs  |   | serving_members      |
        +----------+-----------+   +-----------+----------+   +-----------+----------+
                   |                           |                          |
                   |                           |                          |
                   |                release-scoped serving package build  |
                   |                           |                          |
                   +---------------------------+--------------------------+
                                               |
                                               v
                              +--------------------------------------+
                              | OpenSearch serving plane             |
                              |--------------------------------------|
                              | paper_index                          |
                              | evidence_index                       |
                              | package_tier field: hot / warm       |
                              | BM25 + hybrid + RRF + MedCPT lanes   |
                              +------------------+-------------------+
                                                 |
                              +------------------+-------------------+
                              |                                      |
                              v                                      v
                    +----------------------+              +----------------------+
                    | Retrieval orchestration|             | Engine API / BFF     |
                    |----------------------|              |----------------------|
                    | route split           |              | cards / detail / wiki |
                    | child-first evidence  |              | selection / graph     |
                    | rerank + promotion    |              | diagnostics           |
                    +----------+-----------+              +-----------+----------+
                               |                                      |
                               +------------------+-------------------+
                                                  |
                                                  v
                                +--------------------------------------+
                                | Grounded answer assembly             |
                                |--------------------------------------|
                                | evidence_key -> PG grounding         |
                                | claims + citations + why_cited       |
                                +------------------+-------------------+
                                                   |
                                                   v
                              +--------------------------------------+
                              | Product surfaces                      |
                              |--------------------------------------|
                              | Vercel frontend                       |
                              | clinician search                      |
                              | wiki                                  |
                              | graph / Cosmograph                    |
                              +--------------------------------------+

                                      Archive / rebuild plane
                                      -----------------------
                                      object storage:
                                      - serving manifests
                                      - bulk build artifacts
                                      - retired chunk versions
                                      - cold text exports
```

## Source of Truth Rule

For future-state RAG architecture, migration planning, retrieval-improvement direction, and serving-model decisions, this file is the only canonical source of truth.

These documents remain valid for other purposes and are not deprecated:

- `docs/map/rag.md` for current live runtime behavior
- `.claude/skills/langfuse/references/benchmarking.md` for benchmark policy and
  current Langfuse evaluation workflow

Older future-state, handoff, audit, or improvement-plan docs are now historical context only and should not be treated as active guidance when they disagree with this file.

## Executive Decisions

The core decisions are now stable.

1. PostgreSQL remains the canonical graph and grounding authority.
2. PostgreSQL stops being the primary global evidence retrieval engine.
3. The next runtime is an evidence-serving read model built from canonical PostgreSQL, not a second truth system.
4. Evidence-seeking queries become child-first internally and remain paper-first in the UI.
5. OpenSearch is the first serving plane for lexical, hybrid, weighted-RRF fusion, filtering, and bounded reranking.
6. MedCPT becomes the main runtime biomedical dense and rerank stack. SPECTER2 stays for graph build, proximity priors, and relatedness.
7. The near-term clean production shape is tiered:
   - a hot high-fidelity **practice evidence** lane for roughly `5k–10k` recency-bounded, priority-scored papers
   - a warm broader lane for paper-first or abstract-first support across the graph-visible universe
   - an explicit historical-foundation exception path for older sentinel papers that still deserve hot treatment
8. `evidence_key` is the stable grounding identity. OpenSearch document IDs are rebuildable serving identities, not grounding truth.
9. Claim-local grounding replaces whole-answer grounding.
10. Qdrant, repartitioning, and a warehouse-plane split remain conditional responses to measured bottlenecks, not day-one architecture.
11. Physical object names should stay tier-neutral and simple. Tier is a field, a cohort rule, and a retrieval policy, not a mandatory naming prefix.

The key correction is conceptual. The problem is no longer “how far can one PostgreSQL runtime surface be stretched?” It is “how should the online evidence-serving plane work, and how does PostgreSQL remain the authority behind it?”

## Identity Glossary

| Term | Meaning |
|---|---|
| `corpus_id` | Stable canonical paper identity used throughout the PostgreSQL grounding spine and the serving packages. |
| `graph_run_id` | Release or run-scoping identity for graph and serving-package builds. |
| `chunk_version_key` | Stable identity for the active chunk or evidence derivation policy version recorded into serving artifacts. |
| `evidence_key` | Stable canonical grounding identity for a typed evidence unit. Content-bound, release-independent, and round-trippable into PostgreSQL. |
| `serving_doc_id` | Release-scoped search-engine document identity. Rebuildable and alias-swappable without changing grounding truth. |
| `hot lane` | High-fidelity serving tier with typed evidence units, stable grounding, and claim-local evidence support; by default this is a practice-facing, recency-bounded evidence base rather than the entire graph-visible universe. |
| `warm lane` | Broader lower-granularity serving tier used for recall expansion and background support when hot evidence is absent or not yet promoted. |
| `serving package` | Release-scoped derived read model built from canonical PostgreSQL into paper and evidence serving indexes plus supporting manifests. |
| `package_tier` | Document-level or cohort-level serving classification such as `hot` or `warm`. This is policy metadata, not a required table or index naming prefix. |
| `historical foundation exception` | An older paper promoted into the hot lane despite falling outside the default recency window. Allowed reasons are enumerated and auditable. |

## Critical Evaluation of External Contributions

Several later external reviews materially improved the earlier position. Most of their useful additions are now incorporated here.

### Accepted now

- **OpenEvidence-shaped target behavior**: optimize for sourced, cited, clinician-facing evidence serving rather than warehouse mechanics alone.
- **Paper-first UI, child-first retrieval**: this is now the central retrieval split for evidence-seeking routes.
- **MedCPT-centered runtime**: the repo already contains `MedCPTQueryEncoder`, `MedCPTArticleEncoder`, and `MedCPTReranker` in `engine/app/rag/biomedical_models.py`; those should become the runtime default path after the serving plane exists.
- **Smaller v1 `EvidenceUnit` ontology**: start with `paragraph`, `results_paragraph`, `abstract_conclusion`, and constrained `sentence_window`.
- **Three-stage retrieval cascade with fixed budgets**: lane fusion, bounded semantic rerank, then explicit parent-child promotion.
- **`evidence_key` / serving-doc split**: canonical grounding identity must be separate from release-scoped serving identity.
- **Tiered hot/warm serving model**: this is the clean answer for a solo operator without a day-one large-RAM estate.
- **Janitor and retention work earlier**: stage/swap surfaces and retired chunk versions need lifecycle policy before the new read model is trusted.
- **NCBI MedCPT paper-embedding bootstrap where PMIDs align**: use published PubMed article embeddings when available to avoid wasting early GPU cycles on the paper lane.
- **Quantization and vector-storage mode decided before hardware purchase**: do not buy a large machine before the actual v1 dense footprint is measured.

### Accepted as later options, not current commitments

- **Neural sparse / SPLADE-style lane** in OpenSearch as an additive retrieval improvement after the main MedCPT path is stable.
- **ColBERTv2 late-interaction sidecar** if top-1 conversion remains the main frontier after the MedCPT cascade is live.

### Not adopted as hard commitments

- A hard early commitment to a second serving engine.
- A hard requirement to index every potential evidence unit densely on day one.
- A hard commitment to Vespa, Qdrant, or a full late-interaction estate before the first serving plane proves insufficient.

## Current Reality

### What the repo already does well

SoleMD.Graph already has the part many teams never build well:

- canonical span and mention lineage in PostgreSQL
- explicit chunk policy and chunk-version identity
- bounded grounding joins through ordinals and offsets
- release scoping
- a meaningful benchmark and Langfuse evaluation surface

Key local contracts already in place:

- `engine/app/rag/index_contract.py:59` draws the right dense boundary: canonical PostgreSQL is not where chunk ANN should live.
- `engine/app/rag/chunk_grounding.py:14` already reflects the right grounding shape: bounded joins over canonical lineage, not ad hoc text heuristics.
- `engine/app/rag_ingest/chunk_policy.py:21` already gives an explicit, versioned, conservative chunk policy.
- `engine/app/rag/chunk_runtime_contract.py:15` already provides the right cutover template: build first, enable reads later, apply serving indexes after the data plane is stable.

### What the evaluation surface says

The repo’s own expert-suite summary in `docs/map/rag.md` makes the frontier clear:

- `hit@1 = 0.164`
- `hit@k = 0.279`
- `0 no-target-signal misses`
- `7 target-visible-not-top1`
- `44 top1 misses`

That pattern means the center of gravity is no longer concept recovery or basic grounding. It is shortlist formation, child-evidence recall, and top-rank conversion.

### What the live database says

The PostgreSQL cluster is already large, but the important nuance is that it is not yet large because of the new RAG runtime surface.

Largest current families remain warehouse and raw-ingest backbones:

- `solemd.citations`: about `106 GB`
- `pubtator.entity_annotations`: about `62 GB`
- `solemd.papers`: about `54 GB`
- `solemd.entity_corpus_presence`: about `38 GB`
- `solemd.entity_corpus_presence_next`: another `38 GB`

By contrast, the current materialized RAG runtime surface is still small:

- chunked papers: `753`
- `paper_blocks`: about `23,070` rows
- `paper_sentences`: about `95,718` rows
- `paper_chunks`: about `20,345` rows
- `paper_chunk_members`: about `92,851` rows

So the present database feels bloated not because the new serving model is already huge, but because one PostgreSQL instance is simultaneously carrying:

- canonical warehouse tables
- raw ingest surfaces
- serving projections
- stage and swap rebuild tables
- search and vector indexes

### Text-availability reality matters

The corpus backbone is larger than the text-bearing subset.

Measured on 2026-04-14:

- total papers: about `14.06M`
- papers with non-empty abstract: about `1.06M`
- `fulltext`: about `639k`
- abstract-only and not fulltext: about `423k`

That matters because evidence-index cost is driven by text-bearing evidence units, not by paper count alone.

## What Stays in PostgreSQL and What Does Not

### PostgreSQL remains responsible for

- `corpus`
- `papers`
- `citations`
- `paper_documents`
- `paper_sections`
- canonical `paper_blocks`
- canonical `paper_sentences`
- `paper_citation_mentions`
- `paper_entity_mentions`
- `paper_chunk_versions`
- `paper_chunk_members`
- stable ordinals, offsets, anchors, and lineage
- concept normalization and crosswalk authority
- authoritative grounding lookups

This includes the large warehouse backbone surfaces such as `papers`, `citations`, and `pubtator.entity_annotations`. Those are not the architectural mistake. They are the canonical substrate.

### OpenSearch becomes responsible for

- first-stage paper lexical retrieval
- first-stage evidence lexical retrieval
- first-stage hybrid retrieval
- dense paper retrieval for runtime search
- later dense evidence retrieval when justified
- weighted RRF lane fusion
- bounded shortlist reranking support
- release-scoped serving packages for hot and warm lanes

### Object storage becomes responsible for

- retired chunk versions
- cold text
- rebuildable package artifacts
- later broader warehouse text that does not need to stay on the hot PostgreSQL heap

## Final Expected Realized Data Estate

This is the default target shape before any optional `P6` warehouse-plane split. It is the concrete end-state to build toward, not just a logical separation of responsibilities.

## Must-Build Versus Ideal End-State

This paper contains both:

- the **must-build subset for `P0–P5`**, which is what is needed to execute the serving split cleanly
- the **ideal end-state cleanup**, which is the broader canonical reshaping the estate should converge toward over time

### Must-build for `P0–P5`

These are the pieces that should be treated as cutover-critical:

- `evidence_key`
- `ConceptPackage`
- `serving_runs`
- `serving_artifacts`
- `serving_cohorts`
- `serving_members`
- `api_projection_runs`
- `paper_api_cards`
- `paper_api_profiles`
- `graph_cluster_api_cards`
- `paper_index`
- `evidence_index`
- the `package_tier` routing contract
- the claim-local grounding contract
- the canonical grounding tables and bounded dereference joins

These are what let the serving-plane split happen.

### Ideal end-state cleanup

These are important target structures, but they should not become accidental blockers for the serving cutover if an incremental path is cleaner:

- deeper canonical decomposition such as `paper_text`
- optional separate retention of `paper_embeddings_graph`
- optional separate retention of `paper_embeddings_retrieval`
- broader aggregate reshaping such as `paper_citations` versus `paper_citation_contexts`
- additional fact or API projection tables beyond the must-build serving surfaces

Rule:

- if a structure is not required to execute `P0–P5` safely, it is an end-state cleanup target rather than a cutover precondition

### ASCII view

```text
                                      +----------------------------------+
                                      |   Object Storage / Archive       |
                                      |----------------------------------|
                                      | cold text                        |
                                      | retired chunk versions           |
                                      | serving-package manifests        |
                                      | grounding manifests / parquet    |
                                      | rebuild artifacts                |
                                      +------------------+---------------+
                                                         ^
                                                         |
                                                         | build / archive
                                                         |
+--------------------------------------------------------------------------------------+
| Canonical PostgreSQL (repo-pinned major)  (solemd_graph)                             |
|--------------------------------------------------------------------------------------|
| Schemas: solemd, pubtator, umls                                                      |
|                                                                                      |
| Warehouse backbone                                                                   |
|   solemd.corpus                                                                      |
|   solemd.papers                                                                      |
|   solemd.source_releases                                                             |
|   solemd.ingest_runs                                                                 |
|   solemd.citations                                                                   |
|   solemd.vocab_terms / solemd.vocab_term_aliases                                     |
|   pubtator.entity_annotations                                                        |
|   umls.*                                                                             |
|                                                                                      |
| Canonical structural grounding                                                       |
|   solemd.paper_documents                                                             |
|   solemd.paper_sections                                                              |
|   solemd.paper_blocks_p00..p31                                                       |
|   solemd.paper_sentences_p00..p31                                                    |
|   solemd.paper_citation_mentions_p00..p31                                            |
|   solemd.paper_entity_mentions_p00..p31                                              |
|                                                                                      |
| Chunk / evidence lineage                                                             |
|   solemd.paper_chunk_versions                                                        |
|   solemd.paper_chunk_members_p00..p31                                                |
|   solemd.paper_chunks_p00..p31   [compatibility / legacy fallback / retention-led]   |
|                                                                                      |
| Control metadata                                                                     |
|   solemd.api_projection_runs            [recommended]                                |
|   solemd.serving_runs                   [recommended]                                |
|   solemd.serving_cohorts                [recommended]                                |
|   solemd.serving_members                [recommended]                                |
|   solemd.serving_artifacts              [recommended]                                |
+--------------------------------------+-----------------------------------------------+
                                       |
                                       | release-scoped serving-package build
                                       v
+--------------------------------------------------------------------------------------+
| OpenSearch Serving Plane                                                             |
|--------------------------------------------------------------------------------------|
| canonical serving aliases                                                            |
|   paper_index                                                                        |
|   evidence_index                                                                     |
|                                                                                      |
| docs carry:                                                                          |
|   corpus_id                                                                          |
|   evidence_key                                                                       |
|   serving_doc_id                                                                     |
|   package_tier                                                                       |
|   evidence_kind / section_role / release scope / concept filters                     |
|   vector fields per chosen mode                                                      |
+--------------------------------------------------------------------------------------+
```

### What “final” means here

- PostgreSQL remains the single canonical truth system for metadata, lineage, offsets, anchors, mentions, and grounding.
- OpenSearch remains a release-scoped serving projection, not a second truth system.
- Object storage remains the archive and rebuild surface for large or retired artifacts.
- A later `P6` split can move the analytical or warehouse-heavy plane onto a separate instance or replica, but it does not change the logical ownership model above.

### Recommended realized PostgreSQL table families

These are the table families that should exist in the realized target, grouped by responsibility.

#### 1. Warehouse backbone tables

These remain canonical and long-lived:

- `solemd.source_releases`
- `solemd.ingest_runs`
- `solemd.corpus`
- `solemd.papers`
- `solemd.paper_lifecycle`
- `solemd.citations`
- `solemd.vocab_terms`
- `solemd.vocab_term_aliases`
- `solemd.concept_search_aliases`
- `pubtator.entity_annotations`
- `pubtator.*` raw ingest surfaces that remain useful for rebuilds
- `umls.*`

#### 2. Canonical structural and grounding tables

These remain canonical and are the runtime grounding substrate:

- `solemd.paper_documents`
- `solemd.paper_sections`
- `solemd.paper_blocks_p00..p31`
- `solemd.paper_sentences_p00..p31`
- `solemd.paper_citation_mentions_p00..p31`
- `solemd.paper_entity_mentions_p00..p31`

These are optimized for:

- `corpus_id`-bounded dereference
- canonical ordinals and offsets
- packet assembly joins
- provenance and anchor fidelity

They are not optimized for global text retrieval.

#### 3. Chunk and evidence-lineage tables

These stay because they provide policy identity and compatibility with the current canonical chunk lineage:

- `solemd.paper_chunk_versions`
- `solemd.paper_chunk_members_p00..p31`
- `solemd.paper_chunks_p00..p31`

Important interpretation:

- `paper_chunk_versions` stays authoritative for versioned chunk policy identity
- `paper_chunk_members_*` stays useful as canonical lineage
- `paper_chunks_*` is no longer the primary hot retrieval surface
- active `paper_chunks_*` rows may still exist for compatibility, fallback, auditability, or controlled grounded reads
- retired chunk text and older versions should age out to object storage per the retention policy

#### 4. Recommended small control tables

The current paper already requires manifests and cohort control. These should be made explicit in PostgreSQL so hot/warm promotion and serving-package lineage are queryable and reproducible.

Recommended additions:

- `solemd.api_projection_runs`
- `solemd.serving_runs`
- `solemd.serving_artifacts`
- `solemd.serving_cohorts`
- `solemd.serving_members`

Example intent:

```text
solemd.api_projection_runs
  api_projection_run_id
  graph_run_id
  serving_run_id
  source_release_watermark
  projection_schema_version
  built_at
  status

solemd.serving_runs
  run_id
  graph_run_id
  api_projection_run_id
  source_release_watermark
  contract_version
  chunk_version_key
  package_tier           -- hot / warm
  build_checksum
  build_vector_mode
  build_started_at
  build_completed_at
  status

solemd.serving_artifacts
  run_id
  artifact_kind
  artifact_uri
  checksum
  row_count

solemd.serving_cohorts
  cohort_id
  cohort_name
  package_tier           -- hot / warm
  cohort_kind            -- practice_hot / warm_graph / historical_foundation
  evidence_window_years
  rubric_version
  created_at
  notes

solemd.serving_members
  cohort_id
  corpus_id
  text_availability
  structural_readiness
  anchor_readiness
  publication_year
  publication_age_years
  evidence_priority_score
  historical_exception_reason   -- enum, not free text
  package_build_status
  grounding_roundtrip_ok
  promoted_at
```

These are intentionally small metadata and control tables, not heavy retrieval-serving tables.

### Complete placement inventory

Every target table or subtable belongs to exactly one home. There should be no ambiguous middle category.

#### A. Canonical warehouse tables in PostgreSQL

These are canonical truth or canonical rebuild inputs. They live in PostgreSQL and remain part of the warehouse even if some of them are read on bounded runtime paths.

Raw ingest and release tracking:

- `solemd.source_releases`
- `solemd.ingest_runs`
- `solemd.s2_papers_raw`
- `solemd.s2_paper_authors_raw`
- `solemd.s2_paper_references_raw`
- `solemd.s2_paper_assets_raw`
- `pubtator.entity_annotations`
- `pubtator.relations`
- `umls.*`

Canonical metadata and lifecycle:

- `solemd.corpus`
- `solemd.papers`
- `solemd.paper_text`
- `solemd.venues`
- `solemd.authors`
- `solemd.paper_authors`
- `solemd.paper_assets`
- `solemd.paper_lifecycle`
- `solemd.paper_embeddings_graph`
- `solemd.paper_embeddings_retrieval` if retained

Canonical concepts and references:

- `solemd.concepts`
- `solemd.concept_aliases`
- `solemd.concept_xrefs`
- `solemd.concept_relations`
- `solemd.concept_search_aliases`
- `solemd.vocab_terms`
- `solemd.vocab_term_aliases`

Canonical paper facts and aggregates:

- `solemd.paper_citations`
- `solemd.paper_citation_contexts`
- `solemd.paper_concepts`
- `solemd.paper_relations`
- `solemd.paper_metrics`
- `solemd.paper_top_concepts`

Canonical grounding and lineage:

- `solemd.paper_documents`
- `solemd.paper_sections`
- `solemd.paper_blocks_p00..p31`
- `solemd.paper_sentences_p00..p31`
- `solemd.paper_citation_mentions_p00..p31`
- `solemd.paper_entity_mentions_p00..p31`
- `solemd.paper_chunk_versions`
- `solemd.paper_chunk_members_p00..p31`
- `solemd.paper_chunks_p00..p31`

Graph build-control warehouse metadata:

- `solemd.graph_runs`
- `solemd.graph_bundle_artifacts`

#### B. Serve-facing PostgreSQL tables

These live in PostgreSQL because the application needs them directly at serve time, but they are not the broad canonical warehouse facts.

Graph-serving metadata:

- `solemd.graph_run_metrics`
- `solemd.graph_points`
- `solemd.graph_clusters`
- `solemd.paper_semantic_neighbors`

Derived API projections:

- `solemd.paper_api_cards`
- `solemd.paper_api_profiles`
- `solemd.graph_cluster_api_cards`
- `solemd.api_projection_runs`

Serving control metadata:

- `solemd.serving_runs`
- `solemd.serving_artifacts`
- `solemd.serving_cohorts`
- `solemd.serving_members`

#### C. Serve-facing retrieval indexes in OpenSearch

These are not PostgreSQL tables. They are the first-stage retrieval surfaces.

- `paper_index`
- `evidence_index`

Tier rule:

- `package_tier` lives in the document metadata
- hot-first versus warm-backfill is a retrieval-policy choice, not a primary naming choice
- filtered aliases may exist later if operationally useful, but they are not the canonical surface

#### D. Archive and rebuild artifacts in object storage

These are not PostgreSQL tables and are not part of the live serving estate.

- retired chunk-version exports
- cold text exports
- serving-package manifests
- grounding manifests
- OpenSearch bulk build artifacts
- snapshot and rebuild artifacts

### Explicit warehouse versus serving matrix

This is the one-glance answer to “what tables do we keep in the warehouse?” and “what does the runtime actually use when serving?”

| Layer | Canonical location | Primary objects | Used for | Used directly on hot request path? |
|---|---|---|---|---|
| raw ingest warehouse | PostgreSQL | `source_releases`, `ingest_runs`, `s2_*_raw`, `pubtator.*`, `umls.*` | source audit, replay, canonical rebuild inputs | no |
| canonical metadata warehouse | PostgreSQL | `corpus`, `papers`, `paper_text`, `venues`, `authors`, `paper_authors`, `paper_assets`, `paper_lifecycle` | canonical paper identity, metadata, rights, lifecycle, API joins | no by default; bounded reads only |
| canonical concept warehouse | PostgreSQL | `concepts`, `concept_aliases`, `concept_xrefs`, `concept_relations`, `concept_search_aliases`, `vocab_*` | normalization, concept lookup, search alias derivation | no by default; bounded reads only |
| canonical fact warehouse | PostgreSQL | `paper_citations`, `paper_citation_contexts`, `paper_concepts`, `paper_relations`, `paper_metrics`, `paper_top_concepts` | graph priors, API detail, evidence and ranking support | no by default; bounded reads only |
| graph build-control warehouse | PostgreSQL | `graph_runs`, `graph_bundle_artifacts` | graph publication lineage and artifact tracking | no |
| canonical grounding warehouse | PostgreSQL | `paper_documents`, `paper_sections`, `paper_blocks_*`, `paper_sentences_*`, `paper_citation_mentions_*`, `paper_entity_mentions_*`, `paper_chunk_versions`, `paper_chunk_members_*`, `paper_chunks_*` | authoritative offsets, anchors, lineage, grounded packet assembly | yes for grounding dereference only |
| serve-facing graph metadata | PostgreSQL | `graph_run_metrics`, `graph_points`, `graph_clusters`, `paper_semantic_neighbors` | graph bootstrap, selection, related-paper UI | yes |
| serve-facing API projections | PostgreSQL | `paper_api_cards`, `paper_api_profiles`, `graph_cluster_api_cards`, `api_projection_runs` | engine API cards, wiki pages, paper detail, graph and cluster selection | yes |
| serve-facing control metadata | PostgreSQL | `serving_runs`, `serving_artifacts`, `serving_cohorts`, `serving_members` | hot/warm cohort control, package lineage, cutover audit | yes for control and diagnostics |
| serving retrieval plane | OpenSearch | `paper_index`, `evidence_index` | paper retrieval, evidence retrieval, hybrid search, RRF fusion, filtered search | yes |
| archive and rebuild plane | object storage | manifests, retired chunk versions, cold text, rebuild artifacts | restore, audit, rebuild, retention | no |

### Serving-path interpretation

For the common runtime paths:

- **paper retrieval**
  - first-stage candidate generation: OpenSearch `paper_index`
  - card rendering and metadata: `paper_api_cards`
  - detail rendering: `paper_api_profiles`

- **evidence retrieval**
  - first-stage candidate generation: OpenSearch `evidence_index`
  - evidence identity and grounding round-trip: `evidence_key` -> PostgreSQL canonical grounding tables

- **grounded answer assembly**
  - shortlist from OpenSearch
  - dereference and packet assembly from `paper_documents`, `paper_sections`, `paper_blocks_*`, `paper_sentences_*`, `paper_citation_mentions_*`, `paper_entity_mentions_*`, and lineage tables as needed

- **wiki / selection / engine API**
  - primarily `paper_api_cards`, `paper_api_profiles`, `graph_cluster_api_cards`, and graph metadata tables
  - not ad hoc fan-out joins over raw or warehouse-heavy tables on every request

### Endpoint-to-table interpretation

This is the default mapping from product surfaces to the realized estate.

- **search result cards**
  - `paper_api_cards`
  - optional OpenSearch highlight metadata when present

- **paper detail page / wiki paper page**
  - `paper_api_profiles`
  - bounded joins into `paper_top_concepts`, `paper_citation_contexts`, or grounding tables only when the view explicitly needs them

- **graph point selection**
  - `graph_points`
  - `paper_api_cards`
  - optional bounded joins to `paper_top_concepts` or `paper_semantic_neighbors`

- **graph cluster selection**
  - `graph_cluster_api_cards`
  - `graph_clusters`
  - optional bounded membership lookups from `graph_points`

- **graph bootstrap**
  - `graph_run_metrics`
  - `graph_bundle_artifacts`

- **serving diagnostics and cutover introspection**
  - `serving_runs`
  - `serving_artifacts`
  - `api_projection_runs`

### What does not need to become a PostgreSQL table

The following do not need to be materialized as large new canonical PostgreSQL tables:

- typed `EvidenceUnit` serving documents
- hot and warm search indexes
- dense vector search estates
- package manifests that are only needed for rebuild and audit

Those belong in:

- OpenSearch, when they are serving documents
- object storage, when they are manifests, archives, or rebuild artifacts

### Example realized end-state by plane

#### Canonical PostgreSQL

```text
solemd.corpus
solemd.source_releases
solemd.ingest_runs
solemd.papers
solemd.paper_lifecycle
solemd.citations
solemd.concept_search_aliases
solemd.paper_documents
solemd.paper_sections
solemd.paper_blocks_p00..p31
solemd.paper_sentences_p00..p31
solemd.paper_citation_mentions_p00..p31
solemd.paper_entity_mentions_p00..p31
solemd.paper_chunk_versions
solemd.paper_chunk_members_p00..p31
solemd.paper_chunks_p00..p31              [not primary retrieval]
solemd.api_projection_runs                [recommended]
solemd.serving_runs                       [recommended]
solemd.serving_artifacts                  [recommended]
solemd.serving_cohorts                    [recommended]
solemd.serving_members                    [recommended]
pubtator.entity_annotations
umls.*
```

#### OpenSearch

```text
paper_index
evidence_index
```

Design rule:

- keep the canonical retrieval-plane names tier-neutral
- encode `package_tier` as a field on serving documents
- if filtered aliases are later useful operationally, treat them as internal implementation details rather than the primary naming contract

#### Object storage

```text
rag-serving-packages/
  hot/<run_id>/paper_index_bulk.ndjson.gz
  hot/<run_id>/evidence_index_bulk.ndjson.gz
  hot/<run_id>/grounding_manifest.parquet
  warm/<run_id>/paper_index_bulk.ndjson.gz
  warm/<run_id>/evidence_index_bulk.ndjson.gz

rag-archive/
  chunk-versions/<chunk_version_key>/*.parquet
  cold-text/*.parquet
```

### Clean interpretation for implementation

If you want to picture the final “database” concretely, the right mental model is:

- one canonical PostgreSQL database with warehouse + structural grounding + small control metadata
- one serving search estate in OpenSearch
- one archive and rebuild estate in object storage

Not:

- one giant PostgreSQL database that also tries to be the main search engine forever
- or a second canonical database duplicating the truth model

## Fully Optimized Target PostgreSQL Structure

This is the recommended end-state PostgreSQL design if the current estate is overhauled around the actual target product rather than around legacy convenience.

The goals are:

- one canonical warehouse and grounding authority
- clear raw -> canonical -> derived boundaries
- narrow hot rows and wide cold rows separated intentionally
- graph build, RAG grounding, and engine API all fed from clean canonical tables
- hot and warm serving packages built from PostgreSQL without turning PostgreSQL into the main search engine

### Non-negotiable design rules

1. Keep raw source data, canonical truth, and derived serving tables separate.
2. Keep large text and large vectors out of hot metadata rows.
3. Keep citation edges narrow; keep heavy citation contexts separate.
4. Keep concept normalization canonical and shared across RAG, graph, and API surfaces.
5. Keep release-scoped state out of canonical paper rows whenever it can live in run-scoped or cohort-scoped tables.
6. Keep derived API tables and serving manifests rebuildable with stage-and-swap.
7. Keep PostgreSQL tables optimized for dereference, joins, and canonical facts; keep search-engine behavior in OpenSearch.

### Naming rules for the final estate

Keep names simple and obvious:

- source-normalized ingest tables: `s2_*_raw`
- canonical paper tables: `paper_*`, `papers`, `authors`, `venues`, `concepts`
- graph tables: `graph_*`
- grounding tables: `paper_documents`, `paper_sections`, `paper_blocks`, `paper_sentences`, `paper_*_mentions`, `paper_chunk_*`
- derived API tables: `paper_api_*`
- serving control tables: `serving_*`
- transient rebuild tables only: `*_next`, `*_old`

Avoid permanent tables with vague names like:

- `data`
- `info`
- `cache`
- `summary2`
- `final`

For serving and control objects specifically:

- keep names tier-neutral and stable
- store `package_tier` as data, not in the permanent object name
- prefer `paper_index` over `paper_index_hot`
- prefer `serving_runs` over `hot_serving_runs`

### End-to-end ASCII flow

```text
S2 raw ------------------+
                         |
PubTator raw ----------- +----> canonical warehouse ----+----> graph build tables ----> graph bundles
                         |                               |
UMLS + vocab ----------- +----> canonical concepts -----+----> RAG grounding tables --> serving packages
                                                         |
                                                         +----> API projections ------> engine API / wiki / selection
```

### Recommended schemas

Keep the live schema count small:

- `solemd`:
  - canonical warehouse
  - graph build surfaces
  - grounding surfaces
  - derived API tables
  - serving control metadata
- `pubtator`:
  - raw PubTator ingest tables
- `umls`:
  - raw UMLS reference tables

This is intentionally simpler than inventing many new schemas with little performance value.

### 1. Source ingest warehouse layer

This layer exists to preserve source-normalized S2 and PubTator inputs in PostgreSQL without turning them into the runtime surface.

#### `solemd.source_releases`

Contains:

- one row per source release
- source name
- source release key
- source-published timestamp
- source-ingested timestamp
- release status
- manifest checksum
- manifest URI if archived

Used for:

- naming rebuild inputs precisely
- corpus freshness reporting
- re-running builds against a known source state

Recommended indexes:

- PK on `(source_name, source_release_key)`
- btree on `(source_name, source_ingested_at DESC)`

#### `solemd.ingest_runs`

Contains:

- one row per ingest or rebuild run
- source name
- source release key
- checksum
- started and completed timestamps
- status
- manifest or artifact URI

Used for:

- reproducibility
- warehouse lineage
- resumable ingest and rebuilds

Recommended indexes:

- PK on `run_id`
- unique or near-unique key on `(source_name, source_release_key)`
- btree on `(status, completed_at DESC)`

#### `solemd.s2_papers_raw`

Contains:

- raw normalized S2 paper metadata
- `paper_id`
- `pmid`
- `doi_norm`
- `pmc_id`
- raw title and abstract
- raw venue string
- raw publication metadata
- payload checksum
- `last_seen_run_id`

Used for:

- canonical paper refresh
- source audit
- S2-specific correction and replay

Recommended indexes:

- PK on `paper_id`
- btree on `pmid`
- btree on `doi_norm`
- btree on `pmc_id`

Design rule:

- keep raw source fields typed and narrow
- do not store giant JSONB payload blobs as the primary warehouse representation
- archive original source files in object storage instead

#### `solemd.s2_paper_authors_raw`

Contains:

- `paper_id`
- `author_ordinal`
- raw author name
- raw source author identifier
- raw affiliation text

Used for:

- canonical author normalization
- provenance back to source ordering

Recommended indexes:

- PK on `(paper_id, author_ordinal)`
- btree on `(source_author_id)`

#### `solemd.s2_paper_references_raw`

Contains:

- `citing_paper_id`
- `cited_paper_id`
- influence flag
- source intent fields
- source counts and timestamps

Used for:

- canonical citation-edge rebuild
- citation drift audit against source

Recommended indexes:

- PK on `(citing_paper_id, cited_paper_id)`
- reverse btree on `(cited_paper_id, citing_paper_id)`

#### `solemd.s2_paper_assets_raw`

Contains:

- `paper_id`
- asset kind
- asset URL
- content type
- availability status
- checksum if available

Used for:

- fulltext source resolution
- wiki and paper-detail external-link surfaces

Recommended indexes:

- PK on `(paper_id, asset_kind, asset_url)`
- btree on `(paper_id)`

#### `pubtator.entity_annotations`

Contains:

- raw PubTator entity annotations
- `pmid`
- canonical `corpus_id` once mapped
- offsets
- mention text
- entity identifier
- type and source metadata

Used for:

- canonical concept presence rebuild
- grounding mention derivation
- concept normalization audit

Recommended physical shape:

- hash partition by `corpus_id` when the mapped corpus is large enough to justify it
- if `corpus_id` is not available at ingest time, backfill it early and treat unmapped rows as temporary

Recommended indexes:

- local btree on `(corpus_id, start_offset)`
- local btree on `(entity_id, corpus_id)`
- local btree on `(pmid, start_offset)` until `corpus_id` mapping is complete

#### `pubtator.relations`

Contains:

- raw PubTator relation rows
- `pmid`
- canonical `corpus_id`
- subject entity identifier
- relation type
- object entity identifier

Used for:

- canonical paper-relation rebuild
- graph prior generation

Recommended indexes:

- local btree on `(corpus_id, subject_entity_id, relation_type, object_entity_id)`
- local btree on `(pmid)`

#### `umls.*`

Contains:

- raw UMLS terminology and relation tables

Used for:

- concept normalization
- alias expansion
- concept relationship and semantic-group derivation

Design rule:

- keep UMLS raw and mostly vendor-like
- derive the SoleMD canonical concept layer in `solemd`

### 2. Canonical concept and reference layer

This layer should replace the current “crosswalk spread across many semi-canonical tables” pattern with one obvious lookup surface.

#### `solemd.concepts`

Contains:

- one canonical concept row per normalized biomedical concept
- `concept_id`
- preferred display name
- normalized preferred name
- semantic group
- concept kind
- primary namespace
- primary source identifier
- active flag

Used for:

- RAG concept package construction
- wiki and paper-detail concept rendering
- graph semantic grouping
- entity normalization across PubTator, vocab, and UMLS

Recommended indexes:

- PK on `concept_id`
- unique btree on `(primary_namespace, primary_source_id)`
- btree on `(semantic_group, concept_id)`
- btree on `(normalized_preferred_name)`

#### `solemd.concept_aliases`

Contains:

- `concept_id`
- alias text
- normalized alias
- alias kind
- source name
- priority weight

Used for:

- exact and fuzzy concept lookup
- expert-language canonicalization
- alias-driven retrieval guards

Recommended indexes:

- PK on `(concept_id, normalized_alias)`
- btree on `(normalized_alias, concept_id)`
- trigram index on `alias_text` only if fuzzy alias lookup is a proven hot path

#### `solemd.concept_search_aliases`

Contains:

- `concept_id`
- alias text
- normalized alias
- alias source
- alias source priority
- observed mention count
- ambiguity score
- language
- search equivalence class
- `eligible_for_search_synonym`
- `synonym_version`

Used for:

- deriving the filtered OpenSearch synonym artifact
- distinguishing broad canonical alias coverage from the much smaller safe lexical rescue layer
- tracking which UMLS or PubTator-derived forms are safe enough for search-time expansion

Recommended indexes:

- PK on `(concept_id, normalized_alias, synonym_version)`
- btree on `(eligible_for_search_synonym, synonym_version, normalized_alias)`
- btree on `(normalized_alias, ambiguity_score, concept_id)`

Design rule:

- this is a **derived** canonical-support table, not the final concept truth table
- UMLS is the main candidate source
- PubTator is used as observed-surface-form evidence and ambiguity/frequency support
- only rows with `eligible_for_search_synonym = true` should feed the OpenSearch synonym artifact

#### `solemd.concept_xrefs`

Contains:

- `concept_id`
- source namespace
- source identifier

Used for:

- fast joins from PubTator/UMLS/source identifiers into canonical concepts

Recommended indexes:

- unique btree on `(xref_source, xref_value)`
- btree on `(concept_id)`

#### `solemd.concept_relations`

Contains:

- `source_concept_id`
- `relation_type`
- `target_concept_id`
- source provenance
- optional confidence or weight

Used for:

- graph priors
- concept neighborhood features
- later retrieval expansion support

Recommended indexes:

- PK on `(source_concept_id, relation_type, target_concept_id)`
- reverse btree on `(target_concept_id, relation_type, source_concept_id)`

#### `solemd.vocab_terms` and `solemd.vocab_term_aliases`

Recommended role:

- keep as curated source-input tables if they remain useful editorial assets
- do not make them the final runtime concept surface
- feed them into `concepts`, `concept_aliases`, and `concept_xrefs`

### 3. Canonical paper metadata layer

This layer should be narrow, typed, and joinable. It should not force every metadata read to drag large text or vector payloads.

#### `solemd.corpus`

Contains:

- stable `corpus_id`
- domain admission reason
- domain status
- first seen and last seen timestamps

Used for:

- canonical paper membership in the SoleMD universe

Recommended indexes:

- PK on `corpus_id`
- btree on `(domain_status)`

Design rule:

- move release-scoped membership like “current graph run”, “current base”, or “hot package” out of `corpus`
- keep those in run-scoped graph tables and serving-cohort tables instead

#### `solemd.papers`

Contains:

- `corpus_id`
- `pmid`
- `doi_norm`
- `pmc_id`
- `s2_paper_id`
- `venue_id`
- `year`
- `publication_date`
- language
- article type
- open-access flag
- retraction flag
- created and updated timestamps

Used for:

- canonical paper identity and non-text bibliographic metadata
- engine API joins
- graph build metadata joins

Recommended indexes:

- PK on `corpus_id`
- unique btree on `pmid` where not null
- unique btree on `doi_norm` where not null
- unique btree on `pmc_id` where not null
- unique btree on `s2_paper_id` where not null
- optional btree on `(venue_id, year)` only if proven by query families

#### `solemd.paper_text`

Contains:

- `corpus_id`
- title
- normalized title key
- abstract
- TDLR if kept
- text-availability class
- title hash
- abstract hash
- fallback `fts_vector`

Used for:

- canonical text storage
- title matching
- fallback lexical lookup
- warm-lane abstract support

Recommended indexes:

- PK on `corpus_id`
- btree on `(normalized_title_key)`
- btree on `(text_availability, corpus_id)`
- GIN on `fts_vector` for PostgreSQL fallback only
- GiST or GIN trigram on `title` only if measured title-fuzzy lookup needs it

Design rule:

- keep PostgreSQL lexical indexes on `paper_text` as fallback and bounded-local utility
- do not grow this into the main evidence-serving search engine

#### `solemd.venues`

Contains:

- `venue_id`
- normalized venue name
- display venue name
- ISSN or eISSN
- curated family
- multiplier or policy metadata if used

Used for:

- clean venue rendering
- graph and retrieval priors

Recommended indexes:

- PK on `venue_id`
- unique btree on `(normalized_venue_name)`
- btree on `(curated_family)`

#### `solemd.authors`

Contains:

- `author_id`
- display name
- normalized name
- ORCID if available

Used for:

- canonical author references
- engine API author rendering

Recommended indexes:

- PK on `author_id`
- btree on `(normalized_name)`

#### `solemd.paper_authors`

Contains:

- `corpus_id`
- `author_ordinal`
- `author_id`
- affiliation text if needed for display

Used for:

- ordered author display
- authorship metadata joins

Recommended indexes:

- PK on `(corpus_id, author_ordinal)`
- btree on `(author_id, corpus_id)`

#### `solemd.paper_assets`

Contains:

- `corpus_id`
- asset kind
- URL or storage key
- source name
- availability state
- rights class
- license kind
- excerpt eligibility
- fulltext eligibility
- checksum if available

Used for:

- fulltext resolution
- API detail links
- serving-rights evaluation

Recommended indexes:

- PK on `(corpus_id, asset_kind, asset_uri)`
- btree on `(corpus_id)`

#### `solemd.paper_lifecycle`

Contains:

- `corpus_id`
- first seen source release
- last seen source release
- last refreshed timestamp
- retraction status
- retracted timestamp
- correction status
- correction source if known
- tombstone status
- tombstone reason
- serving-rights class
- serving-eligibility class

Used for:

- retraction and correction governance
- serving eligibility gating
- refresh and retirement logic
- hot-lane and warm-lane admission filters

Recommended indexes:

- PK on `corpus_id`
- btree on `(retraction_status, serving_eligibility_class, corpus_id)`
- btree on `(last_seen_source_release, corpus_id)`
- btree on `(tombstone_status, corpus_id)`

#### `solemd.paper_embeddings_graph`

Contains:

- `corpus_id`
- graph-model key
- graph embedding vector
- embedding version

Used for:

- graph build
- graph-neighbor derivation
- graph-relatedness experiments

Recommended indexes:

- PK on `(corpus_id, model_key)`
- no ANN index by default unless a measured PostgreSQL query family requires it

#### `solemd.paper_embeddings_retrieval`

Contains:

- `corpus_id`
- retrieval-model key
- retrieval embedding vector
- embedding version

Used for:

- warehouse-side audit of retrieval embeddings
- optional PostgreSQL comparison paths

Recommended indexes:

- PK on `(corpus_id, model_key)`
- no ANN index by default unless a measured PostgreSQL fallback path justifies it

Design rule:

- keep vectors out of `papers`
- keep vector indexes off by default in PostgreSQL because OpenSearch is the primary serving plane

### 4. Canonical paper fact and aggregate layer

This layer holds the large per-paper fact tables that power graph, RAG priors, and API detail without forcing repeated scans of raw source tables.

#### `solemd.paper_citations`

Contains:

- `citing_corpus_id`
- `cited_corpus_id`
- influence flag
- normalized intent fields
- first seen and last seen source metadata

Used for:

- citation graph
- citation-aware retrieval priors
- paper detail and wiki counts

Recommended physical shape:

- hash partition by `citing_corpus_id` if the table is rebuilt fresh at large scale

Recommended indexes:

- PK on `(citing_corpus_id, cited_corpus_id)`
- reverse btree on `(cited_corpus_id, citing_corpus_id)`
- partial btree on `(cited_corpus_id, citing_corpus_id)` where `is_influential = true` if that filter is real

#### `solemd.paper_citation_contexts`

Contains:

- `citing_corpus_id`
- `cited_corpus_id`
- `context_ordinal`
- section role
- context text
- optional intent or source fields

Used for:

- cited-context support
- wiki evidence display
- later citation-preserving retrieval features

Recommended physical shape:

- hash partition by `citing_corpus_id` if row count becomes very large

Recommended indexes:

- PK on `(citing_corpus_id, cited_corpus_id, context_ordinal)`
- btree on `(citing_corpus_id, cited_corpus_id)`

Design rule:

- keep contexts out of `paper_citations`
- the edge table stays narrow; the context table carries the heavy text

#### `solemd.paper_concepts`

Contains:

- `corpus_id`
- `concept_id`
- total mention count
- title mention count
- abstract mention count
- fulltext mention count
- source mask
- first and last mention offsets if useful

Used for:

- graph semantic features
- paper detail concept summaries
- retrieval concept filters and priors
- hot-lane eligibility and readiness signals

Recommended physical shape:

- hash partition by `corpus_id`

Recommended indexes:

- PK on `(corpus_id, concept_id)`
- reverse btree on `(concept_id, corpus_id)`

This table is the clean replacement for the current broad `entity_corpus_presence` style surface.

#### `solemd.paper_relations`

Contains:

- `corpus_id`
- `subject_concept_id`
- `relation_type`
- `object_concept_id`
- relation count
- source mask

Used for:

- graph relation priors
- paper-level structured facts
- future retrieval expansion signals

Recommended physical shape:

- hash partition by `corpus_id`

Recommended indexes:

- PK on `(corpus_id, subject_concept_id, relation_type, object_concept_id)`
- reverse btree on `(subject_concept_id, relation_type, object_concept_id, corpus_id)`

#### `solemd.paper_metrics`

Contains:

- one row per paper
- citation in/out counts
- recent citation velocity
- influential citation counts
- concept count
- relation count
- text-availability flags
- grounding readiness flags
- graph readiness flags
- publication age in years
- evidence recency bucket
- evidence priority score
- historical foundation exception flag
- historical exception reason enum

Used for:

- API card rendering
- graph scoring inputs
- hot-lane admission rubric
- package-build prioritization

Recommended indexes:

- PK on `corpus_id`
- btree on `(evidence_recency_bucket, evidence_priority_score DESC, corpus_id)`
- partial or composite indexes only for measured admission or reporting queries

#### `solemd.paper_top_concepts`

Contains:

- `corpus_id`
- rank
- `concept_id`
- weight or score
- mention count

Used for:

- paper wiki
- selection side panels
- fast paper-detail concept rendering

Recommended indexes:

- PK on `(corpus_id, rank)`
- btree on `(concept_id, corpus_id)`

### 5. Graph build and bundle layer

This layer exists to feed Cosmograph bundle generation cleanly without overloading canonical paper tables with release-scoped layout state.

This layer should be understood as two subfamilies:

- **graph build-control metadata**
  - canonical records of what graph run exists, how it was built, and where its published artifacts live
- **graph-serving metadata**
  - compact graph-facing tables that the UI and engine API can read directly for selection and bootstrap

The first subfamily is warehouse-like and operational. The second is serve-facing and intentionally compact.

#### `solemd.graph_runs`

Contains:

- `graph_run_id`
- policy versions
- model versions
- built and published timestamps
- status

Used for:

- reproducible graph runs
- bundle lineage
- graph build-control metadata

Recommended indexes:

- PK on `graph_run_id`
- btree on `(status, built_at)`

#### `solemd.graph_run_metrics`

Contains:

- `graph_run_id`
- point count
- edge or neighbor count if tracked
- base cohort size
- hot-lane overlap count
- x and y bounds
- cluster count
- published timestamp

Used for:

- frontend graph bootstrap metadata
- bundle sanity checks
- operational diagnostics for graph publication
- graph-serving bootstrap metadata

Recommended indexes:

- PK on `graph_run_id`

#### `solemd.graph_points`

Contains:

- `graph_run_id`
- `corpus_id`
- `point_index`
- `x`, `y`
- `cluster_id`
- `domain_score`
- `base_rank`
- `is_in_base`
- render-facing flags and compact metrics only

Used for:

- graph bundle export
- graph selection resolution
- active graph run lookup
- graph-serving point metadata

Recommended indexes:

- PK on `(graph_run_id, corpus_id)`
- unique btree on `(graph_run_id, point_index)`
- btree on `(graph_run_id, cluster_id)`
- partial btree on `(graph_run_id, is_in_base, base_rank, corpus_id)` where `is_in_base = true`

#### `solemd.graph_clusters`

Contains:

- `graph_run_id`
- `cluster_id`
- label
- description
- size
- optional parent cluster

Used for:

- cluster rendering
- cluster detail API
- graph-serving cluster metadata

Recommended indexes:

- PK on `(graph_run_id, cluster_id)`
- btree on `(graph_run_id, parent_cluster_id)` if hierarchy is used

#### `solemd.paper_semantic_neighbors`

Contains:

- `graph_run_id`
- `corpus_id`
- neighbor rank
- neighbor `corpus_id`
- similarity
- model key

Used for:

- graph neighborhood expansion
- paper detail related-paper surfaces
- later retrieval preserve or prior lanes

Recommended indexes:

- PK on `(graph_run_id, corpus_id, model_key, neighbor_rank)`
- reverse btree on `(graph_run_id, neighbor_corpus_id)`

#### `solemd.graph_bundle_artifacts`

Contains:

- `graph_run_id`
- artifact kind
- object-store URI
- checksum
- row count
- published timestamp

Used for:

- bundle publication audit
- frontend artifact resolution
- graph build-control metadata

Recommended indexes:

- PK on `(graph_run_id, artifact_kind)`

### 6. Canonical grounding and RAG lineage layer

This layer is authoritative for offsets, anchors, and packet assembly. It is not the serving search engine.

#### Materialization policy

- full structural grounding is required for the hot lane
- warm lane can remain abstract-derived and paper-first without full block and sentence materialization
- heavy structural tables should only be built for papers that actually need high-fidelity grounding

#### `solemd.paper_documents`

Contains:

- `corpus_id`
- document source kind
- source priority
- source revision
- text hash
- active flag

Used for:

- canonical document-source tracking
- grounding source selection

Recommended indexes:

- PK on `document_id` or a similarly stable internal key
- btree on `(corpus_id, source_priority)`
- partial btree on `(corpus_id, source_priority)` where `is_active = true`

#### `solemd.paper_sections`

Contains:

- `corpus_id`
- `document_id`
- `section_ordinal`
- `section_role`
- section title if present

Used for:

- section-aware evidence typing
- packet assembly and role filtering

Recommended indexes:

- PK on `(corpus_id, section_ordinal)`
- btree on `(corpus_id, section_role, section_ordinal)`

#### `solemd.paper_blocks_p00..p31`

Contains:

- `corpus_id`
- `section_ordinal`
- `block_ordinal`
- block kind
- block text
- offsets

Used for:

- block-level canonical provenance
- local grounding dereference

Recommended physical shape:

- hash partition by `corpus_id`
- `32` partitions is the recommended fresh-build target for the final design

Recommended indexes:

- local PK on `(corpus_id, block_ordinal)`
- local btree on `(corpus_id, section_ordinal, block_ordinal)`

#### `solemd.paper_sentences_p00..p31`

Contains:

- `corpus_id`
- `block_ordinal`
- `sentence_ordinal`
- sentence text
- offsets

Used for:

- sentence-local grounding
- evidence packet assembly

Recommended physical shape:

- hash partition by `corpus_id`

Recommended indexes:

- local PK on `(corpus_id, sentence_ordinal)`
- local btree on `(corpus_id, block_ordinal, sentence_ordinal)`

#### `solemd.paper_citation_mentions_p00..p31`

Contains:

- `corpus_id`
- `sentence_ordinal`
- cited `corpus_id`
- anchor text
- local offsets

Used for:

- citation-grounded packet assembly
- cited-support display

Recommended indexes:

- local btree on `(corpus_id, sentence_ordinal)`
- local btree on `(corpus_id, cited_corpus_id)`

#### `solemd.paper_entity_mentions_p00..p31`

Contains:

- `corpus_id`
- `sentence_ordinal`
- `concept_id`
- mention text
- local offsets

Used for:

- entity-grounded packet assembly
- evidence-concept display

Recommended indexes:

- local btree on `(corpus_id, sentence_ordinal)`
- local btree on `(corpus_id, concept_id)`

#### `solemd.paper_chunk_versions`

Contains:

- `chunk_version_key`
- policy key
- created timestamp
- active flag
- default flag

Used for:

- versioned chunk and evidence policy identity
- compatibility with canonical chunk lineage

Recommended indexes:

- PK on `chunk_version_key`
- partial unique index enforcing one active default when needed

#### `solemd.paper_chunk_members_p00..p31`

Contains:

- `corpus_id`
- `chunk_id`
- member ordinal
- referenced block or sentence ordinals

Used for:

- canonical chunk lineage
- deterministic reconstruction of chunk contents

Recommended indexes:

- local PK on `(corpus_id, chunk_id, member_ordinal)`
- local reverse btree on `(corpus_id, block_ordinal)`

#### `solemd.paper_chunks_p00..p31`

Contains:

- `corpus_id`
- `chunk_id`
- `chunk_version_key`
- chunk text
- chunk metadata

Used for:

- compatibility
- fallback lexical retrieval
- auditability

Recommended indexes:

- local PK on `(corpus_id, chunk_id)`
- fallback lexical GIN only if PostgreSQL fallback retrieval is still enabled

Design rule:

- `paper_chunks` remains canonical lineage and fallback support
- typed `EvidenceUnit` serving documents do not become a second giant PostgreSQL table family

### 7. Derived API and serving-control layer

This layer exists because the engine API, wiki, and selection surfaces should not build paper cards and paper profiles from scratch on every request.

### Modularity rule for API projections

Do **not** solve every new UI need by widening one universal `paper_api_profiles` row forever.

The projection pattern should be:

- one small stable card projection
- one richer paper detail projection
- separate compact projections for graph or cluster-specific surfaces
- additional focused projections only when a new surface has a distinct access pattern and stable shape

Preferred rule:

- add a new projection table when the access pattern is meaningfully different
- do not add large rarely-read JSON blobs to a shared hot projection just because one panel needs them
- keep projection tables rebuildable and versioned through `api_projection_runs`
- keep request routing simple: each endpoint should have an obvious primary projection table

#### `solemd.paper_api_cards`

Contains:

- one narrow row per paper
- display title
- author line
- year
- venue display
- citation counts
- text availability
- hot or warm tier flags
- current graph run and cluster metadata needed for selection surfaces
- `has_full_grounding`

Used for:

- search-result cards
- graph selection panels
- wiki list views
- engine API list endpoints

Recommended indexes:

- PK on `corpus_id`
- covering btree on `(current_graph_run_id, current_package_tier, citation_count DESC, corpus_id)`
  with `INCLUDE (display_title, author_line, year, venue_display, text_availability, has_full_grounding)`

Design rule:

- this table should stay narrow enough that index-only scans are realistic for common list queries

#### `solemd.paper_api_profiles`

Contains:

- one richer row per paper
- full title
- abstract
- TDLR if available
- identifiers
- author list or compact author JSON
- venue display
- publication metadata
- metric summary
- top concept summary
- hot or warm tier state

Used for:

- wiki paper pages
- engine API detail endpoints

Recommended indexes:

- PK on `corpus_id`

Design rule:

- this table is read almost entirely by `corpus_id`
- small JSONB fields are acceptable here when they avoid repetitive fan-out joins and are not used as primary filter keys

#### `solemd.graph_cluster_api_cards`

Contains:

- `graph_run_id`
- `cluster_id`
- label
- short description
- size
- optional parent cluster
- top concepts summary
- top venues summary
- representative papers summary

Used for:

- cluster list views
- cluster detail panels
- graph selection side panels that summarize a cluster rather than one paper

Recommended indexes:

- PK on `(graph_run_id, cluster_id)`
- btree on `(graph_run_id, size DESC, cluster_id)`

Design rule:

- this stays compact and summary-oriented
- heavy cluster exploration should still fall back to graph bundle or bounded corpus lookups, not giant denormalized cluster blobs

#### `solemd.api_projection_runs`

Contains:

- `api_projection_run_id`
- source graph run
- source serving run
- source release watermark
- projection schema version
- build status
- built timestamp

Used for:

- keeping wiki, selection, and engine API projections aligned with a known graph and serving state
- avoiding silent version skew between backend tables and frontend assumptions

Recommended indexes:

- PK on `api_projection_run_id`
- btree on `(built_at DESC, build_status)`

### Design rule for the API and graph metadata layer

The engine API, wiki, and selection surfaces should read from a small number of stable projection tables plus graph metadata tables. They should **not** rebuild paper cards, cluster cards, or graph bootstrap metadata ad hoc from raw warehouse joins on every request.

Interpretation:

- `graph_runs` and `graph_bundle_artifacts` are primarily build-control and publication metadata
- `graph_run_metrics`, `graph_points`, and `graph_clusters` are the serve-facing graph metadata tables
- `paper_api_cards`, `paper_api_profiles`, and `graph_cluster_api_cards` are the serve-facing API projections

So the answer is:

- some graph tables are warehouse-like control metadata
- some graph tables are explicitly needed to serve the graph and selection experience
- they should remain separate because they have different lifecycles and read patterns

The intended steady-state read pattern is:

- paper-facing UI -> `paper_api_cards`, `paper_api_profiles`
- cluster-facing UI -> `graph_cluster_api_cards`
- graph bootstrap and bundle resolution -> `graph_run_metrics`, `graph_bundle_artifacts`
- selection lookups -> `graph_points` + the API projection tables above

#### `solemd.serving_runs`

Contains:

- `run_id`
- `graph_run_id`
- `api_projection_run_id`
- source release watermark
- contract version
- package tier
- package type
- build checksum
- vector mode
- build status and timestamps

Used for:

- serving-package lineage
- cutover audit
- immutable release identity for the active serving package

Recommended indexes:

- PK on `run_id`
- btree on `(package_tier, status, build_completed_at DESC)`

Immutability rule:

Once a `serving_run` is built, the following are frozen for that run:

- cohort membership
- analyzer version
- synonym version
- vector mode
- contract version
- `chunk_version_key`

Any change to one of those must create a new `serving_run` and a new alias swap target. Do not mutate them in place on an active run.

#### `solemd.serving_artifacts`

Contains:

- `run_id`
- artifact kind
- alias or index name
- URI
- checksum
- row count

Used for:

- release-scoped cutover and rollback

Recommended indexes:

- PK on `(run_id, artifact_kind)`

#### `solemd.serving_cohorts`

Contains:

- `cohort_id`
- cohort name
- package tier
- cohort kind
- evidence window in years
- rubric version
- created timestamp
- notes

Used for:

- hot-lane and warm-lane cohort definition
- reproducible promotions

Recommended indexes:

- PK on `cohort_id`
- btree on `(package_tier, created_at DESC)`

#### `solemd.serving_members`

Contains:

- `cohort_id`
- `corpus_id`
- text-availability class
- structural readiness
- anchor readiness
- publication year
- publication age in years
- evidence priority score
- historical exception reason
- package build status
- grounding round-trip success
- promoted timestamp

Used for:

- warm-to-hot promotion control
- serving-package cohort assembly

Recommended indexes:

- PK on `(cohort_id, corpus_id)`
- btree on `(corpus_id, cohort_id)`
- btree on `(package_build_status, grounding_roundtrip_ok)` if used in admission reporting

### 8. What the final estate replaces in the current shape

The clean overhaul should intentionally replace a few current pain points:

- current wide `solemd.papers` becomes:
  - `papers`
  - `paper_text`
  - `paper_embeddings_graph`
  - `paper_embeddings_retrieval`
- current heavy `solemd.citations` with mixed edge and context payload becomes:
  - `paper_citations`
  - `paper_citation_contexts`
- current broad entity-presence surfaces become:
  - `paper_concepts`
  - `paper_relations`
  - `paper_metrics`
- release-scoped booleans in canonical paper membership become:
  - `graph_points`
  - `serving_members`
  - `serving_runs`

This is the intended optimized replacement, not a sidecar convenience layer.

### 9. Indexing principles by family

Use indexes deliberately by table family:

- canonical identity tables:
  - PK + true business-identifier uniques only
- large fact tables:
  - one canonical forward key
  - one canonical reverse lookup index
  - partition only when pruning or lifecycle actually benefits
- derived API tables:
  - covering indexes for real list queries
- grounding tables:
  - `corpus_id`-first local indexes only
- fallback lexical tables:
  - GIN only where the fallback path is still live

Do not add:

- speculative duplicate indexes
- giant catch-all multicolumn indexes
- ANN indexes inside PostgreSQL because “we might use them later”

### 10. Storage and table-design principles

- canonical truth tables are `LOGGED`
- rebuild scratch can be `UNLOGGED`
- append-mostly big fact tables default to high fillfactor discipline
- update-heavy small control tables can use a lower fillfactor if measured
- use `INCLUDE` only when it creates real index-only scans for hot list queries
- use generated normalized keys where that removes repeated expression work
- keep `_next` and `_old` names transient only

### 11. What this final PostgreSQL estate serves

From this one canonical PostgreSQL estate, the system should be able to produce:

- hot and warm OpenSearch serving packages
- canonical RAG grounding and claim-local evidence packets
- Cosmograph graph bundles
- engine API metadata for cards, paper detail, wiki pages, and selection views

That is the point of the design: one optimized truth system, many derived products, no duplicated canon.

### 12. Estimated PostgreSQL size envelope when fully populated

These are rough **PostgreSQL-only** size estimates for the target design, including the major recommended indexes. They do **not** include OpenSearch storage or object-storage archives.

They are derived from:

- the measured live footprint already in this repo
- the current row counts of `papers`, `citations`, and `pubtator.entity_annotations`
- the measured hot-grounding runtime slice
- the final table split proposed above

Because the current local database was not available for live re-measure during this estimate, treat these as planning ranges, not exact byte forecasts.

#### Planning assumptions

- total canonical paper backbone: about `14M`
- hot high-fidelity practice lane: `5k` or `10k`
- warm lane uses `paper_text` and serving packages, not full structural grounding for every paper
- raw S2 and PubTator warehouse tables remain in PostgreSQL
- PostgreSQL keeps graph embeddings for the full paper backbone
- PostgreSQL retrieval embeddings are optional and called out separately below
- PostgreSQL is **not** the primary evidence search engine

#### Estimated size by family

| Family | Rough size at 14M backbone + 5k hot | Rough size at 14M backbone + 10k hot | Notes |
|---|---:|---:|---|
| raw ingest warehouse | `170–250 GB` | `170–250 GB` | `s2_*_raw`, `pubtator.*`, `umls.*` |
| canonical concepts | `5–15 GB` | `5–15 GB` | `concepts`, aliases, xrefs, relations |
| canonical paper metadata | `80–120 GB` | `80–120 GB` | `corpus`, `papers`, `paper_text`, venues, authors, assets, graph embeddings |
| canonical paper facts | `120–200 GB` | `120–200 GB` | `paper_citations`, contexts, `paper_concepts`, `paper_relations`, metrics |
| graph build tables | `25–60 GB` | `25–60 GB` | `graph_points`, clusters, neighbors, artifact registry |
| canonical grounding / RAG lineage | `1.5–3 GB` | `2.5–4 GB` | practice hot lane only; this is now tightly bounded intentionally |
| derived API + serving control | `10–25 GB` | `10–25 GB` | `paper_api_*`, `serving_*` |
| **total PostgreSQL estate** | **`412–673 GB`** | **`413–674 GB`** | excludes OpenSearch and object storage |

#### What moves the estimate the most

The biggest drivers are:

1. how many papers are in the hot high-fidelity grounding lane
2. whether raw S2 reference edges and canonical citation edges both remain fully materialized in PostgreSQL
3. whether retrieval embeddings are also retained in PostgreSQL for the whole corpus
4. how aggressively API profile tables denormalize text and summaries

#### Important practical interpretation

For this target design:

- a **clean 14M backbone + 5k hot practice lane** should be expected to land around **`0.41–0.67 TB`** in PostgreSQL
- a **clean 14M backbone + 10k hot practice lane** should be expected to land around **`0.41–0.67 TB`**

That means:

- this is still large, but materially more plausible for a serious single PostgreSQL primary
- it is too large to treat casually
- it strongly supports keeping the hot grounding lane intentionally bounded by policy rather than by accident
- it strongly supports the plan to keep OpenSearch and object storage out of PostgreSQL

#### Optional retrieval-embedding surcharge

If `paper_embeddings_retrieval` is stored in PostgreSQL for the full 14M backbone in addition to `paper_embeddings_graph`, add roughly:

- **`+45–65 GB`** without ANN indexing
- more if later indexed in PostgreSQL, which this plan does **not** recommend by default

So the cleaner storage posture is:

- keep graph embeddings in PostgreSQL if graph build needs them there
- keep retrieval embeddings in the serving plane unless a PostgreSQL-local comparison surface is specifically justified

## The Clean Tiered Architecture

The right answer for a solo operator is not to distort the architecture around current hardware. The right answer is a clean tiered-fidelity architecture.

### Hot lane

Target: roughly `5k–10k` high-priority papers.

Selection intent:

- this is not “all recent papers”
- this is the most recent and highest-value practice or research papers from the target fields, plus explicit historical exceptions

Properties:

- full high-fidelity evidence serving
- typed `EvidenceUnit`s
- claim-local grounding
- canonical offsets and anchor round-trips
- evidence lexical retrieval
- paper dense retrieval
- bounded semantic reranking
- later evidence-dense ANN if quality gain justifies it
- default recency window centered on the last `10–15` years
- explicit exceptions for older landmark or still-foundational papers

### Warm lane

Target: broader corpus beyond the hot lane.

Properties:

- paper-first retrieval
- abstract-derived evidence where available
- honest lower-granularity support labels
- no fake `direct_span` claims when span-level evidence is not actually materialized
- useful for recall expansion, preservation, background context, and lower-cost broader coverage

### Practice evidence base policy

The hot lane should not be “everything graph-visible that we can afford.” It should be the **practice-facing foundational evidence base**.

Default policy:

- the graph can remain broad and historically deep
- the hot lane should be biased toward papers likely to inform current clinical care, current neuroscience interpretation, and near-term research synthesis
- the hot lane should be selected from the target fields and question domains, not from the entire recency window indiscriminately
- the warm lane should retain broader semantic and historical coverage without pretending every paper has full modern evidence-grounding treatment
- the hot lane should stay intentionally small enough that every admitted paper can justify full high-fidelity treatment

Recommended default hot-lane admission window:

- publication date within the last `15` years

Recommended exception classes that can bypass the recency window:

- current or still-canonical guidelines and consensus statements
- landmark randomized trials
- landmark mechanistic or syndrome-defining papers
- canonical methods papers that are still directly operational in the domain
- older papers repeatedly surfaced by citation, guideline, or expert-priority signals

Operational rule:

- recency should be the default **admission prior** for the practice-facing hot lane
- it should not become a blind rule that hides historically essential papers

### Promotion path

Promotion from warm to hot is a deterministic serving-package rebuild from the same canonical source:

- same `corpus_id`
- same canonical paper identity
- same `evidence_key` contract where evidence exists
- richer evidence package and richer grounding package when promoted

This is not a workaround. It is the cleanest way to preserve best-practice architecture while matching current resource reality.

### Hot-lane admission rubric

“Quality-selected” must not become an ad hoc list. Admission into the hot lane should be reproducible and measured.

Required gates for promotion:

- publication age is within the active hot-lane recency window **or** the paper is marked as a historical-foundation exception
- `text_availability` is sufficient for the intended v1 `EvidenceUnit` kinds
- structural completeness is good enough to derive the intended units reliably
- serving-rights class permits the intended hot-lane behavior
- paper is not retracted or tombstoned for serving purposes
- package build succeeds without unresolved evidence-identity collisions
- grounding round-trip succeeds for the promoted paper set
- citation anchors are present when cited support is expected

Priority factors for which eligible papers enter hot first:

- more recent publication date inside the active evidence window
- guideline, consensus, systematic-review, meta-analysis, RCT, or high-value cohort status when relevant to the route class
- `fulltext` over abstract-only when the target question classes benefit from richer evidence
- stronger entity or citation mention coverage
- specialty or product-priority cohorts
- stable package-build success across rebuilds
- spot-check retrieval quality on the promoted cohort

Operational rule:

- hot-lane admission should be driven by a recorded rubric and cohort manifest, not by hand-picked “important papers”
- warm-to-hot promotion should preserve `corpus_id` and any already valid `evidence_key`s, while adding richer evidence where the hot package supports it
- `historical_exception_reason` must be an enum, not free text

Allowed `historical_exception_reason` values:

- `guideline`
- `landmark_rct`
- `landmark_mechanism`
- `syndrome_defining`
- `methods_foundation`
- `editorial_override`

Hot activation rule:

- no hot serving package becomes active unless grounding round-trip succeeds for the admitted hot cohort
- any member failing grounding integrity must be excluded before alias swap

### Why this is the right default

For a clinician-facing evidence engine, the main question is not “can we fully ground every historically relevant paper?” It is “which papers deserve the expensive, highest-fidelity evidence treatment because they are most likely to inform current interpretation and care?”

Using a recency-bounded, priority-scored hot lane is the clean answer because it:

- lowers the full-grounding footprint dramatically
- keeps the graph and warehouse historically broad
- matches how current guideline ecosystems are maintained
- leaves room for older sentinel papers through an explicit exception mechanism rather than accidental drift

## Retrieval Contract

### Route split

- `TITLE_LOOKUP`: paper-first
- pure metadata and citation-style lookup: paper-first
- `PASSAGE_LOOKUP`: child-first, hot-first
- `QUESTION_LOOKUP`: child-first, hot-first
- evidence-seeking `GENERAL`: child-first when the query shape supports it, with hot-first routing for practice-facing queries

Practical routing rule:

- current-practice, guideline, treatment, and care-oriented questions should search the hot practice lane first and use the warm lane as bounded backfill
- broader mechanism, historical, or graph-exploration questions may consult the warm lane earlier
- older landmark papers should enter the hot lane through the explicit historical-foundation exception path, not by weakening the default recency policy for everything

### v1 `EvidenceUnit` ontology

Start smaller than the theoretical full ontology.

v1:

- `paragraph`
- `results_paragraph`
- `abstract_conclusion`
- constrained `sentence_window`

Keep raw sentence rows in PostgreSQL for grounding and local extraction inside top evidence units.

Later:

- `table_row`
- `figure_caption`
- other richer evidence types once extraction and offset fidelity are stable

### `ConceptPackage`, not loose expansion strings

The retrieval contract should become structured around:

- exposure or intervention
- phenotype or outcome
- temporality
- polarity
- dose intensity
- population
- article-type prior
- canonical IDs
- lexical guard tokens

This should replace the current center of gravity in `engine/app/rag/search_retrieval_concepts.py`.

### Three-stage retrieval cascade

The retrieval stack should be written down as a fixed-budget cascade.

#### Stage A: broad candidate formation

- paper lexical
- evidence lexical
- paper dense
- later evidence dense
- preserve or prior lane

Fuse with weighted RRF. Keep the first-stage lane set intentionally small.

Starting budgets:

- lane-local cap: `150–300` hits per lane
- fused pool cap: `800–1200` evidence candidates after fusion and dedupe

#### Stage B: bounded semantic rerank

- MedCPT cross-encoder
- fixed top-K budget
- fixed latency budget

This is where semantic discrimination should happen, not in one giant additive score.

Starting budgets:

- rerank top `50–100` evidence units
- target latency budget: `150–250 ms`

#### Stage C: product logic and parent-child promotion

Promote papers from reranked evidence units using:

- best child hit
- corroborating second child hit
- section-type prior
- study-design prior
- article-type prior
- cited-context support
- selected-context support

This replaces the current monolithic additive score stack in `engine/app/rag/ranking.py`.

Starting budgets:

- forward top `10–20` papers to answer assembly

These starting budgets should be pinned in code and in docs. They can change after measurement, but they should not drift implicitly during tuning.

### OpenSearch stays a retrieval engine, not a policy engine

OpenSearch is the right first serving plane, but it should not become the home for every downstream medical prior.

Keep inside OpenSearch:

- retrieval-native filters
- lexical guards
- release scope
- evidence kind
- section role
- concept filters

Keep in application code:

- route-specific medical priors
- article-type logic
- species or human applicability
- parent-child promotion
- preservation behavior

This is not cosmetic. OpenSearch hybrid query behavior is clause-limited and top-level only. The serving contract should not be allowed to collapse into one giant engine-specific query DSL.

Rescoring rule:

- keep the bounded MedCPT cross-encoder rerank in application code over the fused shortlist
- do not push the main semantic rerank down into an OpenSearch hybrid rescoring path

Reason:

- OpenSearch hybrid rescoring happens per subquery at shard level before final normalization and merge
- the application-tier rerank over the fused shortlist is the cleaner and more controllable contract for this product

### OpenSearch analyzer and synonym policy

The analyzer policy should stay conservative, explicit, and separate from concept normalization.

Default rule:

- PostgreSQL concepts remain the normalization authority
- OpenSearch analyzers exist to improve lexical matching behavior
- OpenSearch synonyms are a **derived search artifact**, not the ontology

#### Main field posture

For `title`, `abstract`, and evidence text fields:

- use a conservative index-time analyzer
- use a slightly looser search-time analyzer
- keep synonyms at search time, not index time
- avoid aggressive stemming on the main evidence field initially

Recommended initial analyzer split:

- `biomed_index`
  - `standard` tokenizer
  - deterministic character normalization only
  - `lowercase`
  - no synonym expansion
  - no stemming
  - no stopword removal initially

- `biomed_search`
  - same tokenizer and deterministic character normalization
  - `lowercase`
  - curated `synonym_graph`
  - updateable file-backed synonym set
  - no stemming initially
  - no stopword removal initially

#### How the synonym artifact is built

Do **not** dump all UMLS aliases or all PubTator strings directly into OpenSearch.

Build the synonym artifact in three layers:

1. broad canonical concept aliases in PostgreSQL
   - `concepts`
   - `concept_aliases`
   - `concept_xrefs`
2. observed mention evidence from PubTator
   - frequency of real surface forms
   - abbreviation ambiguity evidence
   - corpus-observed lexical variants
3. filtered search alias derivation
   - `concept_search_aliases`
   - only a subset becomes OpenSearch synonym rules

#### Inclusion rules for OpenSearch synonyms

Before a candidate alias becomes an OpenSearch synonym rule, require most of these:

- English or otherwise explicitly allowed language
- active non-obsolete concept
- allowed semantic domain
- alias length above a minimum threshold unless explicitly whitelisted
- low ambiguity across concepts
- not a broad common-English word
- not punctuation-noisy or low-information
- ideally observed in PubTator or the local corpus
- acceptable source priority from UMLS or curated vocab sources

#### Abbreviation rule

Do **not** automatically include short ambiguous aliases.

Examples like:

- `MS`
- `PD`
- `MCI`
- `AD`

should remain blocked unless the ambiguity evidence and domain scope justify explicit admission.

#### What PubTator contributes

PubTator should be treated as:

- an observed mention surface
- a frequency signal
- an ambiguity signal
- a validation source for aliases that actually appear in the target literature

It should not be treated as the main synonym authority.

#### What UMLS contributes

UMLS should be treated as:

- the broad candidate source for aliases and cross-vocabulary synonymy
- the main raw input to canonical concept alias coverage

It should not be treated as a search-ready synonym file without filtering.

#### OpenSearch implementation rule

The serving package should emit a versioned synonym artifact, for example:

- `search-artifacts/opensearch/biomed_synonyms_v{synonym_version}.txt`

The OpenSearch build then:

- loads that artifact through an updateable synonym filter
- attaches it to the search analyzer for the appropriate text fields
- records the `synonym_version` in `serving_runs`

This keeps synonym behavior rebuildable, auditable, and separable from concept truth.

## Grounding Contract

### Keep

- PostgreSQL as the authoritative grounder
- bounded joins by canonical IDs and ordinals
- round-trips into authoritative offsets and anchors

### Change

The answer contract should become claim-local.

Each claim should carry:

- `support_state`
  - `direct_span`
  - `indirect_background`
  - `withheld`
- `evidence_tier`
  - `hot_full`
  - `warm_abstract`
  - `warm_paper`
- `source_form`
  - `paragraph`
  - `results_paragraph`
  - `abstract_conclusion`
  - `sentence_window`
  - `paper_only`
- one or more `evidence_key`s
- authoritative offsets and citation anchors
- source labels
- a short `why_cited`

This split matters. `support_state` describes the grounding strength of the claim. `evidence_tier` describes how rich the serving surface was. `source_form` describes what kind of evidence object actually backed the claim.

### ID split

- `evidence_key`: canonical grounding identity derived from stable tuple fields and content
- serving document ID: release-scoped OpenSearch identity that can change across rebuilds without changing the grounding object

## Degraded-Mode Contract

The retrieval system should define degraded behavior explicitly so outages degrade quality without corrupting trust semantics.

| Mode | What still works | Allowed evidence tiers | Allowed support states |
|---|---|---|---|
| normal | hot + warm retrieval, claim-local grounding, full promotion path | `hot_full`, `warm_abstract`, `warm_paper` | `direct_span`, `indirect_background`, `withheld` |
| hot lane unavailable | warm retrieval continues, broader recall preserved | `warm_abstract`, `warm_paper` | `direct_span` only when a valid warm abstract `evidence_key` exists; otherwise `indirect_background` or `withheld` |
| warm lane unavailable | hot retrieval and high-fidelity grounding continue for hot cohort only | `hot_full` | `direct_span`, `indirect_background`, `withheld` |
| OpenSearch unavailable, PostgreSQL fallback only | availability preserved through fallback retrieval, but broader serving features are reduced | hot fallback only where PostgreSQL can still produce grounded evidence | `direct_span` only when fallback returns a valid grounded evidence unit; otherwise `indirect_background` or `withheld` |

Hard rule:

- no degraded mode may emit `direct_span` without a real grounded evidence object that round-trips to PostgreSQL offsets and anchors

## Governance, Freshness, and Release Contracts

These contracts are easy to under-specify early and painful to retrofit later. They should be treated as part of the architecture, not as “ops details.”

### Retractions, corrections, and tombstones

The warehouse and serving planes need a uniform lifecycle rule for papers that become unsafe or undesirable to serve.

Default contract:

- retracted papers remain in the canonical warehouse
- retracted papers are excluded from hot-lane admission by default
- warm-lane inclusion of retracted papers must be explicit and labeled if ever allowed for historical context
- corrected or superseded records keep canonical identity history but update serving eligibility
- tombstoned papers are removed from serving packages and API projections while remaining auditable in the warehouse

This needs one explicit implementation surface:

- `paper_lifecycle` is the canonical eligibility and retirement table

### Text rights and serving eligibility

Not every text-bearing paper is equally safe to store, index, or render in the same way.

Default contract:

- title and abstract storage rights are tracked separately from fulltext rights
- excerpt-serving rights are tracked separately from full-document storage rights
- hot-lane admission must check the serving-rights class, not just text availability
- fulltext-derived evidence units are allowed only when the rights class permits them
- historical audit rows remain in the warehouse even if serving rights later narrow

This avoids a subtle but serious failure mode: treating “we can ingest it” as equivalent to “we can serve it in the same way.”

### Freshness and rebuild cadence

The architecture needs a default cadence model, even if the exact schedule changes later.

Default contract:

- source releases are tracked explicitly in `source_releases`
- raw ingest runs are tracked explicitly in `ingest_runs`
- hot-lane serving packages should be rebuilt on a predictable cadence and also on high-priority source updates
- warm-lane serving packages can rebuild less aggressively
- API projections should rebuild from a named graph run plus serving run pair

What still needs to be determined later is the exact cadence, not whether cadence exists.

### Release compatibility and version skew

The system will eventually have at least four moving release surfaces:

- canonical source watermark
- graph run
- serving run
- API projection run

Default compatibility rule:

- every serving run records the graph run, source watermark, and contract version it depends on
- every API projection run records the graph run and serving run it was built from
- frontend and engine API responses must expose the active run identifiers in diagnostics
- no alias swap should make a new serving run active before its grounding round-trip and API compatibility checks pass

This prevents one of the easiest subtle failures in multi-plane systems: using individually valid artifacts that were not built against the same release state.

### Security and network boundary

This architecture assumes a clear service boundary.

Default contract:

- PostgreSQL and OpenSearch are private-network services, not public internet endpoints
- the web tier never connects directly to the database from the browser
- the engine API uses read-appropriate credentials, not owner credentials
- workers use the narrowest credentials required for build and archive jobs
- secrets come from one config source of truth and rotate without rewriting the architecture

### Snapshot, backup, and restore

PostgreSQL backup is already called out in the plan. OpenSearch and serving artifacts need the same discipline.

Default contract:

- PostgreSQL base backup plus WAL archive must be tested regularly
- OpenSearch production indexes need snapshot and restore drills against the configured repository
- serving-package manifests and bulk artifacts must be durably archived before destructive cleanup
- no production cutover is complete until restore has been tested for the active run class

### SLOs and alerting

The plan already defines quality and latency targets. The missing piece is operational alerting.

Minimum alerts to define before production cutover:

- PostgreSQL disk, WAL growth, autovacuum lag, and backup freshness
- OpenSearch heap pressure, disk watermarks, shard health, and snapshot freshness
- worker build failures and stale serving packages
- grounding round-trip failure rate above threshold
- hot-lane cohort drift, unexpected cohort shrink, or hot-lane admission failure spikes

### API contract versioning

The engine API is part of the architecture, not just a consumer.

Default contract:

- list-card and detail-profile projections are versioned through `api_projection_runs`
- API responses should expose support semantics cleanly: `support_state`, `evidence_tier`, and `source_form`
- wiki, selection, and search-result surfaces should read from derived API tables or service projections rather than rebuilding paper metadata ad hoc

### Human review surfaces

Not every decision should be fully manual, but some surfaces need review loops.

Minimum reviewed surfaces:

- hot-lane cohort rubric changes
- historical-foundation exception additions
- serving-rights class changes for high-value sources
- claim-local citation rendering before broad rollout

## Scalability Assessment

The current live runtime materialization is too small to prove the target architecture directly, but it is large enough to show what breaks first if the same physical pattern is extrapolated naïvely.

### Current runtime densities

Measured on the current materialized subset:

| Surface | Rows | Papers in surface | Approx rows/paper |
|---|---:|---:|---:|
| `paper_blocks` | 23,070 | 753 | 30.6 |
| `paper_sentences` | 95,718 | 753 | 127.1 |
| `paper_chunks` | 20,345 | 753 | 27.0 |
| `paper_chunk_members` | 92,851 | 753 | 123.3 |
| `paper_entity_mentions` | 105,782 | 525 | 201.5 on mention-bearing subset |
| `paper_citation_mentions` | 14,582 | 214 | 68.1 on citation-bearing subset |

Two caveats matter:

- entity and citation mentions are present on smaller subsets than the chunked-paper subset
- the current slice is likely enriched toward better-structured papers

So the entity and citation extrapolations should be treated as ranges, not point estimates.

### Order-of-magnitude extrapolation

If the current runtime pattern were expanded mechanically:

| Target hot papers | Blocks | Sentences | Chunks | Chunk members |
|---|---:|---:|---:|---:|
| `15M` | ~459.6M | ~1.91B | ~405.3M | ~1.85B |
| `20M` | ~612.8M | ~2.54B | ~540.4M | ~2.47B |

Entity and citation mentions would likely land in these rough ranges:

| Target hot papers | Entity mentions | Citation mentions |
|---|---:|---:|
| `15M` | ~2.1B to ~3.0B | ~290M to ~1.02B |
| `20M` | ~2.8B to ~4.0B | ~387M to ~1.36B |

These are not acceptable as “let PostgreSQL do all hot retrieval” numbers.

### Storage implication if the current shape were preserved

Using the current measured row sizes as a rough physical guide, preserving the present hot runtime shape all the way to a `20M` hot-paper surface likely pushes the runtime families alone into the rough `5.7–7.0 TiB` range.

That is why the right conclusion is not “make PostgreSQL larger.” It is “stop asking PostgreSQL to own global evidence retrieval.”

### What breaks first

The first failure mode is still global chunk lexical retrieval in PostgreSQL, not bounded grounding.

Why:

- `engine/app/rag/_queries_chunk_search.py:12` drives text-search retrieval over `paper_chunks.text`
- `engine/db/migrations/034_rag_post_load_lexical_indexes.sql` exists to make that viable on the current small rollout
- those queries do not benefit from the same `corpus_id` pruning that bounded grounding joins do

By contrast, `engine/app/rag/chunk_grounding.py:14` remains structurally viable much longer because it is already operating as a bounded dereference path rather than a global retrieval path.

## Bottleneck Ranking

This is the ranked failure order if the current physical posture were pushed toward the full target.

1. **Chunk lexical retrieval in PostgreSQL**
   The first hot-path failure. Global FTS over `paper_chunks.text` does not partition-prune meaningfully and will not remain the right serving substrate.
2. **Index growth**
   GIN and ANN index growth become large enough to distort rebuilds, backups, and storage planning long before bounded grounding breaks.
3. **Storage growth**
   Multi-TiB runtime families are the wrong fit for “PostgreSQL as hot evidence retriever.”
4. **Write and backfill time**
   Full-corpus chunk or evidence backfills become operationally expensive if the serving plane is still tightly bound to canonical PG tables.
5. **Operational rebuild complexity**
   Alias-swap style rebuilds are manageable in search infrastructure; multi-hundred-million-row in-place rebuilds are much uglier inside one primary PostgreSQL plane.
6. **Backup, PITR, and WAL burden**
   The more rebuildable hot text remains on the heap, the more expensive recovery becomes.
7. **Vacuum and analyze pressure**
   Not the first failure mode, but a predictable secondary consequence once stage/swap and retired versions accumulate.
8. **Partition strategy**
   `corpus_id` hash partitioning is still the right grounding key, but it cannot save a workload that should not be in PostgreSQL to begin with.
9. **Dense retrieval path**
   The current SPECTER2-first runtime path is already the wrong center of gravity. The dense question is model and serving-plane choice, not “more pgvector.”
10. **Grounded packet assembly joins**
   These are not the first thing to break, provided they remain dereference-oriented and bounded.

## Partitioning Assessment

The current 16-way hash partitioning by `corpus_id` is the right shape for canonical grounding surfaces and the wrong thing to treat as the main scaling lever.

Explicit rule:

- the current `16`-way estate remains acceptable until measured grounding pain appears
- for a net-new fresh build of the canonical grounding families, `32` partitions is the preferred target
- do not jump from `16` straight to a repartitioning project unless real post-cutover measurements justify it

### What is right about it

- `corpus_id` is the right partition key for bounded grounding
- the current partition families mirror how packet assembly actually dereferences canonical spans
- the partition children are physical storage for canonical grounding, not cleanup junk

### What is wrong about making it the headline move

Partitioning solves the grounding locality problem. It does not solve the “global evidence retrieval over chunk text” problem. If that workload stays in PostgreSQL, more partitions only delay the architectural correction.

### When 16 may become too few

Only revisit the current `16`-way estate if the post-cutover grounding surface still remains large enough that:

- the hot grounding tables carry a genuinely large active working set
- bounded packet dereference begins to show measurable partition-local skew
- maintenance operations on those grounded surfaces become a bottleneck

If a net-new fresh build is happening anyway, prefer `32` as the target shape. Only revisit `32 -> 64` if the same measured conditions still hold at that later scale.

Until then, partition surgery is not the H1 move.

## PostgreSQL Optimization Playbook

This section is the default optimization contract for large-table SoleMD.Graph work on PostgreSQL. The point is not to “tune everything.” The point is to keep canonical PostgreSQL fast for both small-path operational queries and large-path warehouse or grounding workloads by using the right measurement order and the right structural patterns.

Version rule:

- current official PostgreSQL docs remain the best-practice reference surface
- version-sensitive decisions must follow the repo-pinned server major version from runtime surfaces such as `docker/compose.yaml`, `docker/db/Dockerfile`, and `docs/map/database.md`, not stale narrative text
- this repo currently contains mixed `16` and `18` references, so any feature-specific tuning or observability advice must verify the active target major before implementation
- keep the chosen PostgreSQL major on the latest minor release rather than treating the major alone as sufficient

### Default investigation order

When a PostgreSQL path is slow, use this order:

1. `pg_stat_statements` to identify the actual high-cost statements over time
2. `pg_stat_io`, `pg_stat_activity`, and related cumulative stats to distinguish CPU, cache, and I/O pressure
3. `EXPLAIN` on the exact representative query shape
4. `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, VERBOSE, FORMAT JSON)` on a safe representative sample or shadow run
5. fix the root cause in query shape, statistics, indexes, partition pruning, or table design
6. re-measure before making broader server-level tuning changes

Do not skip straight to cluster-wide knob changes. For this codebase, structural fixes usually beat blind tuning.

### Plan-inspection rules

Use `EXPLAIN` and `EXPLAIN ANALYZE` intentionally:

- use plain `EXPLAIN` first when checking whether the planner shape is sane
- use `EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS)` when you need to understand actual row counts, buffer churn, write amplification, and planner-setting effects
- use `FORMAT JSON` when the plan is going to be compared over time or parsed by tooling
- do not run `EXPLAIN ANALYZE` casually on heavy write queries against production tables
- for partitioned tables, confirm pruning explicitly:
  - `Subplans Removed`
  - different `loops` counts across partitions
  - `(never executed)` on partitions pruned during execution

The point is to verify both plan choice and actual execution behavior, not just to stare at estimated costs.

### Always-on observability for PostgreSQL performance

For this project, the following are first-class observability surfaces:

- `pg_stat_statements`
- `pg_stat_io`
- `pg_stat_database`
- `auto_explain` for slow-query plan capture in controlled environments or targeted sessions

Operational rule:

- `pg_stat_statements` should be treated as the baseline surface for “what actually costs time”
- `auto_explain` should be used to catch real slow plans with buffers and WAL detail, not as a substitute for targeted analysis
- index-drop or index-keep decisions should be made from measured deltas over time, not from fresh post-restart counters

### Default SQL and operational query kit

The following are the default inspection queries and commands agents should reach for before changing schema, indexes, or global PostgreSQL settings.

**Top statements over time**

```sql
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_read,
  temp_blks_written,
  wal_bytes,
  query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

Use this first to find the real cost centers. Do not optimize a query just because it “looks important” in code review.

**Current I/O pressure**

```sql
SELECT
  backend_type,
  object,
  context,
  reads,
  read_time,
  writes,
  write_time,
  extends,
  extend_time
FROM pg_stat_io
ORDER BY read_time DESC NULLS LAST, write_time DESC NULLS LAST
LIMIT 30;
```

Use this to distinguish planner mistakes from actual storage pressure.

**Exact plan capture**

```sql
EXPLAIN (ANALYZE, BUFFERS, WAL, SETTINGS, VERBOSE, FORMAT JSON)
SELECT ...
;
```

Default rule:

- use the full option set on representative reads and bounded shadow runs
- archive JSON plans for important before/after comparisons
- for write-heavy jobs, use a safe sample first rather than running the full production mutation under `EXPLAIN ANALYZE`

**Index build progress**

```sql
SELECT
  pid,
  datname,
  relid::regclass AS relation_name,
  index_relid::regclass AS index_name,
  phase,
  lockers_total,
  lockers_done,
  blocks_total,
  blocks_done,
  tuples_total,
  tuples_done
FROM pg_stat_progress_create_index;
```

**Vacuum progress**

```sql
SELECT
  pid,
  relid::regclass AS relation_name,
  phase,
  heap_blks_total,
  heap_blks_scanned,
  heap_blks_vacuumed,
  index_vacuum_count,
  max_dead_tuples,
  num_dead_tuples
FROM pg_stat_progress_vacuum;
```

**Analyze after rebuild**

```sql
ANALYZE VERBOSE solemd.some_large_table;
```

Run this as part of the rebuild contract, not as optional cleanup.

**Extended statistics for correlated predicates**

```sql
CREATE STATISTICS some_table_multi_stat
  (dependencies, ndistinct, mcv)
ON column_a, column_b, column_c
FROM solemd.some_large_table;

ANALYZE solemd.some_large_table;
```

Use this when the planner misestimates correlated filters. Do not keep adding speculative compound indexes when the real problem is bad selectivity modeling.

**Low-lock index maintenance**

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_some_table_some_cols
ON solemd.some_table (some_col, other_col);

REINDEX INDEX CONCURRENTLY idx_some_table_some_cols;
```

On partitioned tables, build child indexes intentionally and verify each child exists and is usable rather than assuming the parent definition solved everything.

### Table and index design rules

Default PostgreSQL table and index guidance for this stack:

- use B-tree by default for lookup, join, and ordering paths
- use partial indexes when the hot predicate is a true subset and the subset is stable enough to justify dedicated maintenance
- use BRIN for very large tables when the indexed value is strongly correlated with physical row order
- use GIN only where the query class genuinely needs it, because it is expensive to maintain
- do not duplicate uniqueness indexes that PostgreSQL already creates for primary keys or unique constraints
- expression indexes must only use immutable functions
- for partitioned tables, create child indexes intentionally and avoid treating parent index definitions as magic

For SoleMD.Graph specifically:

- PostgreSQL FTS indexes belong only on fallback or bounded-local search surfaces
- they are not the long-term global evidence-serving answer
- canonical grounding tables should remain optimized for dereference and bounded joins, not for global text retrieval

### Statistics rules

Large-table performance often fails because the planner has the wrong row-count model, not because PostgreSQL lacks another index.

Default rules:

- run `ANALYZE` after large loads, swaps, and structural refreshes
- raise per-column statistics targets when selective predicates are planner-sensitive
- use `CREATE STATISTICS` for correlated multi-column predicates or expression-heavy filters where ordinary column statistics are insufficient
- inspect `pg_stats_ext` / extended statistics behavior when multivariate selectivity is suspected to be wrong

In practice:

- if a query combines multiple filters that are strongly correlated, extended statistics are often more correct than another speculative index
- if a large derived table is rebuilt, `ANALYZE` is part of the build, not an optional afterthought

### Bulk load and rebuild rules

For large data changes:

- prefer `COPY` for bulk ingest
- if `COPY` is not possible, use prepared or batched insert paths rather than row-by-row single-statement writes
- prefer stage-and-swap or `CREATE TABLE AS` / rebuild-and-swap patterns for large derived projections
- use `UNLOGGED` staging tables only for explicitly rebuildable scratch or swap surfaces, never for canonical truth tables
- avoid massive row-by-row deletes and updates when a rebuild or bounded-batch purge is cleaner
- after rebuild or large load:
  - `ANALYZE`
  - verify indexes
  - verify row counts and plan shape on owning queries

For live systems:

- use `CREATE INDEX CONCURRENTLY` and `REINDEX CONCURRENTLY` where the table must remain writable
- remember that concurrent index builds are slower and have caveats, but they are often the right production choice
- on partitioned tables, it is often cleaner to build indexes concurrently on children, then attach the parent partitioned index as metadata
- for rebuild-only derived jobs, allow carefully scoped session-local tuning such as higher `maintenance_work_mem` or more parallel maintenance workers when measurement justifies it
- only consider session-local `synchronous_commit = off` for idempotent, rebuildable derived jobs where crash re-run is acceptable; never make that a blanket cluster default

### Large-job execution rules

Large jobs should be fast because they are structurally correct, not because the cluster was over-tuned globally.

Default rules:

- bulk-load into a fresh table or partition whenever that is cleaner than mutating billions of existing rows
- add secondary indexes after the data load when rebuilding a derived table from scratch
- capture `pg_stat_progress_create_index` and representative `EXPLAIN` output as part of the job record
- batch destructive cleanup by key range or partition when full-table deletes would create avoidable WAL spikes and vacuum debt
- keep job-local tuning local:
  - `SET LOCAL maintenance_work_mem = ...`
  - `SET LOCAL max_parallel_maintenance_workers = ...`
  - `SET LOCAL work_mem = ...`
- reset expectations after the job; do not let rebuild tuning quietly become the hot-path default

### Parallelism rules

Parallel query is useful for large scans, joins, aggregates, and append-style reads, but it is not free.

Default rules:

- parallelism is for large data-touching reads that return comparatively small result sets or perform heavy aggregation
- verify that custom functions and aggregates used in the query are truly parallel-safe
- remember that `work_mem` applies per worker process for parallel query
- parallel utility commands behave differently: `maintenance_work_mem` is a limit for the command as a whole, not per parallel worker
- when changing parallel-worker settings, consider the whole family together:
  - `max_worker_processes`
  - `max_parallel_workers`
  - `max_parallel_workers_per_gather`
  - `max_parallel_maintenance_workers`

Operational guidance:

- use parallel query for warehouse scans and large analytical validation jobs
- do not assume a query should be parallel because it is “important”
- confirm that workers were actually granted; planned workers and launched workers are not always the same

### Partitioning rules

Partitioning is justified when it helps one of three things:

- pruning
- lifecycle management
- operational isolation

It is not justified just because tables are large.

For this stack:

- keep `corpus_id` as the grounding partition key where the current schema already relies on it
- ensure partition pruning remains enabled
- verify pruning in actual execution, not only in expected query design
- do not increase partition counts as a substitute for moving the wrong workload out of PostgreSQL

### Vacuum and bloat rules

Large tables need explicit discipline:

- autovacuum is not optional
- `VACUUM` and `VACUUM ANALYZE` remain part of the normal operational contract after large write phases
- `VACUUM FULL` is a rewrite operation and should not be treated as routine maintenance
- for index or table bloat, prefer targeted rebuild strategies over indiscriminate disruptive maintenance

For this codebase:

- stage/swap artifacts and retired chunk versions are a bigger bloat risk than canonical grounding partitions
- retention discipline is part of performance work, not only disk cleanup
- if online table or index compaction becomes necessary on large live relations, prefer `pg_repack`-style online rebuild approaches over casual `VACUUM FULL`

### Logical replication and warehouse-split rules

When the time comes to split the warehouse plane:

- use logical replication for subset or analytical-plane replication
- remember that DDL is not replicated automatically
- apply additive schema changes to subscribers before publisher-side writes that depend on them
- remember that replication identity matters, usually via primary key
- keep schema-sync discipline explicit in the migration plan

Modern PostgreSQL releases materially improve this path, including better logical-replication parallelism and large-transaction handling, but the split still needs disciplined ownership and schema coordination.

### Practical rules for “large and small both fast”

To keep both large and small paths fast:

- make large-job optimizations explicit and targeted
- avoid global over-tuning that helps one rebuild path but penalizes steady-state latency
- prefer per-job or per-session maintenance changes where appropriate
- keep derived rebuilds centralized, measurable, and stage-safe
- keep small hot-path queries narrow, indexed, and planner-friendly rather than hiding them under heavyweight infrastructure knobs

The right optimization posture is:

- measure first
- fix query shape and statistics second
- fix indexes and table design third
- tune server-wide resource knobs last

### Cluster-level knobs to touch only after plan-level fixes

The following PostgreSQL settings matter for this workload, but they should be adjusted only after query shape, statistics, and indexing are already sane:

- `work_mem`
- `hash_mem_multiplier`
- `maintenance_work_mem`
- `autovacuum_work_mem`
- `effective_io_concurrency`
- `maintenance_io_concurrency`
- `effective_cache_size`
- planner cost constants such as `random_page_cost` and `seq_page_cost`

Rules:

- prefer session-local changes for rebuild jobs and investigative runs
- treat planner-enable flags like `enable_*` as temporary diagnostic levers, not permanent fixes
- treat `enable_partitionwise_join` and `enable_partitionwise_aggregate` as case-by-case experiments only, because official PostgreSQL documentation warns they can increase planning cost and `work_mem`-bounded node counts linearly with partitions
- change cluster-wide cost constants only after enough evidence exists across a representative workload mix

## OpenSearch Optimization Playbook

This section is the default optimization contract for the evidence-serving plane.

### Serving-plane investigation order

When an OpenSearch path is slow or low-quality, use this order:

1. verify the route, lane family, and query class actually used
2. run `_rank_eval` on the affected query set before changing mappings or boosts
3. run the Profile API on a representative query to identify where search time is being spent
4. verify hybrid-query structure, shared filter shape, and search-pipeline behavior
5. verify shard count, alias targeting, vector mode, and build artifacts
6. change retrieval policy or index design
7. only then change cluster sizing or memory assumptions

Do not jump from “quality is disappointing” straight to “buy more RAM.”

### Hybrid-query rules from the official docs

The current OpenSearch hybrid-query contract is a real design boundary:

- hybrid must remain a top-level query
- the hybrid query supports a maximum of `5` query clauses
- a shared `filter` can be applied across all subqueries
- rescoring on hybrid queries happens per subquery at the shard level before normalization and score combination

For SoleMD.Graph, this means:

- keep first-stage lane families small and fixed
- keep business priors and parent-child promotion logic in application code
- do not try to encode all product policy into a giant OpenSearch query tree

### Bulk indexing and rebuild rules

For large serving-package builds:

- use `_bulk` rather than document-by-document indexing
- create the destination index explicitly before reindex or bulk load; do not rely on inferred mappings
- for initial large loads or destination reindex builds:
  - temporarily set `number_of_replicas = 0`
  - increase or disable `refresh_interval` during the pure indexing window
- restore replicas and refresh behavior only after indexing is complete
- use aliases for cutover rather than in-place mutation
- use force merge only after write traffic to that index has stopped

Operational note from the official docs:

- force merge can produce very large segments
- it should only be used after writes are complete
- reindex requires `_source` to be enabled on the source index

### Snapshot and restore rules

For production serving indexes:

- configure a snapshot repository before the first real cutover
- take snapshots on a predictable cadence for active aliases
- test restore on a non-production target before relying on snapshots as a recovery surface
- tie alias state back to `serving_runs` and archived manifests so a serving cutover can be reconstructed deterministically

OpenSearch is a rebuildable plane, but rebuildability is not a substitute for restore discipline.

### Archive file-shape rules

When exporting retired chunk versions, cold text, or other rebuildable artifacts to Parquet:

- partition the export by a useful recovery key such as source release, publication year bucket, or `corpus_id` range
- avoid one flat directory of giant files that makes restore or bounded query recovery painful
- keep row-group and file-size choices friendly to DuckDB and bounded restore workflows

### Search-quality and performance tools

OpenSearch-specific tools that should be part of the normal optimization workflow:

- `_rank_eval` for query-set quality evaluation
- `_analyze` for analyzer and synonym validation on representative biomedical queries and passages
- Profile API for timing breakdowns of search components
- search pipelines for normalization and score-ranker behavior
- `hybrid_score_explanation` in non-production debugging when hybrid score composition is unclear
- `pagination_depth` discipline on any hybrid route that supports deeper paging; keep it fixed across page navigation
- alias-based swap rather than mutable in-place cutovers

Default rule:

- if a retrieval change cannot be measured with a fixed query set and a fixed profile trace, it is not ready to become canonical behavior

### Vector-mode rules

For this architecture, the default vector posture is:

- `paper_index`: default to Faiss HNSW, with the `knn_vector` field-level `mode` and `compression_level` pinned up front and recorded in the serving-package manifest
- if the chosen paper-lane path is `on_disk` / memory-optimized search, do not plan on IVF or PQ for that same build
- `evidence_index` v1: lexical-first, bounded semantic rerank, dense ANN default-off
- use Lucene k-NN for smaller filtered experiments, not as the assumed large-scale main lane

Official OpenSearch guidance matters here:

- vector quantization exists because float vectors are expensive at scale
- Faiss supports scalar quantization, product quantization, and binary quantization
- memory-optimized search in OpenSearch 3.1 lets Faiss HNSW operate without loading the full index into off-heap memory, but it does not support IVF or PQ
- current `knn_vector` mappings expose `mode` and `compression_level` as the clean high-level contract to pin, which is better than letting encoder choices drift ad hoc across rebuilds

So the design rule is:

- pick the vector mode before hardware purchase
- record that choice in the serving-package manifest
- do not silently switch search semantics during rebuilds

### Shard and index-shape rules

- avoid oversharding; shard count must be justified by the release-scope sample-build gate, not by guesswork
- measure evidence count and document size before finalizing shard layout
- keep the canonical retrieval aliases simple and stable
- use `package_tier` filtering and routing policy for hot-first versus warm-backfill behavior
- add filtered aliases only if an operational need is proven later
- if an index is immutable after build, optimize it as an immutable serving artifact rather than a constantly mutating OLTP surface

## MedCPT Runtime Playbook

MedCPT should be used according to its official role split, not as a generic embedding family.

### Model-role rules

- use the official MedCPT query encoder for query embeddings
- use the official MedCPT article encoder for paper and typed evidence embeddings
- use the MedCPT cross encoder only on a bounded shortlist
- do not mix encoders from different model families in the same scoring lane without an explicit experiment

### Bootstrap rules

- use the published PMID-aligned PubMed embeddings from the MedCPT project for paper-lane bootstrap where available
- locally encode only non-PubMed papers and lower-level evidence units
- keep the paper lane and evidence lane in the same MedCPT representation family when comparing retrieval quality

### Input-shape rules

The official MedCPT examples imply a disciplined input contract:

- queries are encoded through the query encoder with truncation-aware handling
- papers and evidence units are encoded through the article encoder
- cross-encoder reranking is a second-stage tool, not the first retrieval lane

For this repo:

- keep query truncation visible in diagnostics
- standardize paper text composition, such as title plus abstract
- standardize typed evidence text composition by unit kind
- do not let multiple inconsistent serialization shapes silently coexist
- enforce an explicit token-length ceiling for typed evidence units before MedCPT article encoding
- if a candidate unit exceeds the allowed ceiling, split or shrink it during evidence-unit construction rather than allowing silent tail truncation to define the dense representation

## PostgreSQL Vector Extensions and Later ANN Reference Rules

These tools are worth keeping indexed and understood, but they are not the current primary serving plane.

### pgvector

Use pgvector as a comparison surface, a transition surface, or a narrow PostgreSQL-local ANN surface, not as the main hot evidence ANN layer for this roadmap.

Official pgvector guidance that matters:

- with approximate indexes, filtering is applied after the index scan
- iterative index scans can improve filtered recall
- partial indexes can help when the filtered value set is small
- partitioning can help when the filter domain is large and structurally meaningful
- half-precision and binary quantization reduce footprint
- increasing `maintenance_work_mem` can materially affect HNSW build performance

Operational rule:

- if pgvector is used experimentally, compare against exact search for recall before promoting it
- if HNSW vacuum becomes expensive, follow the official guidance to consider `REINDEX ... CONCURRENTLY` before vacuuming that index

### pgvectorscale

pgvectorscale remains a valid later option only if a PostgreSQL-local ANN lane is still strategically useful.

Official guidance that matters:

- StreamingDiskANN build can be memory-intensive
- label-based filtering is the optimized path and must be declared in the index definition
- arbitrary `WHERE` filtering remains post-filtered
- query-time knobs such as search-list size and rescore are session-tunable

Operational rule:

- if pgvectorscale is used, it should be for deliberately label-filtered workloads with a small, meaningful label vocabulary
- it is not a license to treat arbitrary PostgreSQL predicates as a free high-scale ANN filter path

### Qdrant

Qdrant remains a conditional later split if OpenSearch dense pressure becomes the real wall.

Official guidance that matters:

- payload indexes matter for filtered search quality and speed
- payload indexes should be created intentionally and early
- quantization options materially affect memory use at million-scale and above
- multivector and late-interaction capabilities are real reasons to adopt Qdrant later, not day-one reasons to complicate the serving plane

Operational rule:

- only promote Qdrant when the roadmap explicitly chooses a separate dense-serving plane or a late-interaction frontier

## Scale, RAM, and Cost Envelope

The clean architecture does not require a 1 TiB RAM host up front.

### What would force very large RAM

A very large always-on dense evidence ANN across hundreds of millions of 768-d vectors.

That is a future possibility. It is not the only clean way to launch.

### What the current corpus supports cleanly

Because the text-bearing subset is much smaller than the full paper backbone, and because the hot lane is now intentionally a recency-bounded practice evidence base rather than the full graph-visible universe, the near-term clean production target is:

- roughly `32–64 GiB` total OpenSearch cluster RAM for the first serious `5k–10k` hot practice lane
- roughly `64–128 GiB` if the hot lane expands modestly or enables more aggressive dense evidence support

That is the right envelope to benchmark against first.

### Practical sizing rules

1. Measure actual v1 evidence cardinality after the chosen ontology and text-availability filters.
2. Decide vector storage mode before buying hardware.
3. Reuse NCBI MedCPT paper embeddings where PMIDs align.
4. Keep evidence-dense ANN staged until the residual miss surface proves it is the next best quality lever.
5. Keep the warm lane paper-first or abstract-first until the hot lane is stable.

### Rough infrastructure envelope

These were the rough April 2026 review envelopes used to pressure-test feasibility:

| Shape | Rough total RAM | Rough monthly range |
|---|---:|---:|
| small serious hot-lane cluster | `64 GiB` | about `$0.6k–$0.9k/mo` managed |
| strong initial production target | `128 GiB` | about `$1.1k–$1.8k/mo` managed |
| larger future dense estate | `192 GiB` | about `$1.7k/mo` managed |

Self-hosted compute is somewhat cheaper in direct dollars and more expensive in solo-operator burden. That tradeoff should be made after the v1 dense footprint is measured, not before.

### Storage and operations note

If immediate disk relief is needed, relocate the whole PostgreSQL cluster to an **E-backed Linux ext4 volume**, not directly to `/mnt/e` drvfs storage. Do not try to solve today’s storage pressure by selectively moving a few tables first inside the current single-cluster layout.

That physical move is separate from the logical serving-plane split.

## Container and Deployment Topology

This section is the default container and host-layout contract for the roadmap. It is intentionally explicit because the physical layout matters for performance, rebuild speed, and operational sanity.

### Local development target topology

The local target is a clean split between:

- one optimized canonical PostgreSQL container
- one serving and search container group
- one build or worker container group
- one frontend shell

```text
WSL2 / local Linux host

  E:\wsl2-solemd-graph-pg.vhdx
      -> mounted inside Linux as ext4
      -> /mnt/solemd-graph-pg
      -> PostgreSQL data root only

  WSL ext4 root / root-backed Docker volumes
      -> OpenSearch data
      -> worker scratch
      -> DuckDB bundle-build scratch
      -> transient serving-package build output before object-store export

  services
      solemd-graph-db            canonical PostgreSQL
      solemd-graph-opensearch    serving/search engine
      solemd-graph-worker        bundle + serving-package + archive jobs
      solemd-graph-web           local frontend or app shell if needed
```

### Storage placement rules

1. **Canonical PostgreSQL on E-backed ext4**
   - Put the PostgreSQL data directory on an ext4 filesystem backed by an `E:`-resident VHDX.
   - Do **not** place live PostgreSQL data on `/mnt/e/...` drvfs or other Windows-mounted paths.
   - Keep the full canonical warehouse, grounding spine, and serving-control metadata there.

2. **Serving and build services on Linux root-backed storage**
   - Keep OpenSearch data on Linux ext4 root-backed Docker storage or a dedicated Linux SSD-backed mount.
   - Keep DuckDB-based bundle generation scratch on Linux storage, not on `/mnt/e`.
   - Keep temporary serving-package bulk files on Linux storage until they are pushed to OpenSearch or archived to object storage.

3. **Object-store or archive target for durable build artifacts**
   - Retired chunk versions, manifests, and rebuild exports should land in object storage.
   - Do not treat the local filesystem as the long-term archive boundary.

### Why this split is the default

- PostgreSQL is the largest durable state surface and is the right thing to move onto the larger `E:`-backed capacity.
- OpenSearch and bundle-build scratch are latency-sensitive and should stay on Linux-native local storage.
- `/mnt/e` drvfs is not the right runtime path for PostgreSQL or hot search/build workloads.
- This keeps the warehouse and serving planes physically separated without introducing needless logical complexity.

### New-container cutover rule

Do **not** keep mutating the current mixed local container estate forever. The clean migration is:

1. reserve the canonical baseline name `solemd-graph-db` for the new optimized PostgreSQL primary
2. rename the current container and any attached rollback artifacts to `solemd-graph-db-legacy`
3. point the new `solemd-graph-db` at the new E-backed ext4 PostgreSQL root
4. load or replicate the canonical database into it
5. smoke-test canonical queries, RAG grounding, graph bundle reads, and API metadata reads
6. cut all application config to the new canonical `solemd-graph-db`
7. soak for at least 7 days with retention, backup, and restore verification
8. snapshot the legacy storage one final time
9. delete `solemd-graph-db-legacy` and its obsolete volume after the soak window

The same principle applies to the serving plane:

1. stand up a clean `solemd-graph-opensearch`
2. stand up a clean `solemd-graph-worker` for DuckDB bundle generation, serving-package builds, and archive jobs
3. verify build outputs and alias swaps
4. cut serving traffic over
5. rename any old mixed-purpose containers to `*-legacy` only if needed for rollback
6. delete obsolete mixed-purpose local containers after the soak window

### What the final local container estate should be

Keep:

- `solemd-graph-db`
- `solemd-graph-opensearch`
- `solemd-graph-worker`
- `solemd-graph-redis`
- optional local `solemd-graph-web` only for local frontend development

Delete after cutover and soak:

- `solemd-graph-db-legacy` and its old volume
- any old mixed-purpose search or build containers that combine unrelated duties
- any stale container or bind-mount path that still points at `/mnt/e/...` for hot runtime work

### PostgreSQL container requirements

The new PostgreSQL container should be treated as a first-class optimized primary, not a temporary lift-and-shift.

It should include:

- the repo-pinned PostgreSQL major version on the latest minor release
- `pg_stat_statements`
- `track_io_timing=on`
- WAL compression enabled
- sane checkpoint sizing
- autovacuum left on and tuned, not disabled
- explicit backup and restore verification
- a versioned config surface checked into the repo or generated from one source of truth

It should **not** include:

- ad hoc bind mounts to Windows paths
- unrelated serving-engine state
- build scratch or export scratch inside the PG data root

### OpenSearch and DuckDB worker requirements

OpenSearch is the serving engine. DuckDB is a build-time tool, not the durable search database.

The clean split is:

- `solemd-graph-opensearch`
  - durable serving index state
  - hot and warm paper/evidence aliases
  - no canonical truth responsibilities

- `solemd-graph-worker`
  - serving-package builds
  - bundle generation
  - DuckDB export or transform jobs
  - archival jobs
  - no permanent canonical database state

### Vercel production boundary

Vercel should host the **web product surface**, not the stateful data estate.

The default production boundary is:

```text
Vercel
  -> Next.js frontend
  -> light route handlers / BFF endpoints
  -> auth/session orchestration
  -> UI streaming and response shaping

Dedicated Linux host or managed services
  -> canonical PostgreSQL
  -> OpenSearch
  -> worker / bundle-build / archive jobs
  -> optional engine API service
```

### What should not run on Vercel

Do not try to run these on Vercel:

- PostgreSQL
- OpenSearch
- DuckDB bundle generation
- long-running rebuild jobs
- serving-package builds
- large archive and export jobs

### Recommended application split for Vercel

If the product frontend is eventually served on Vercel, the clean shape is:

1. **Next.js on Vercel**
   - renders the user-facing application
   - handles lightweight server actions and route handlers
   - calls a backend service for heavy retrieval and metadata operations

2. **Engine API on a Linux host**
   - owns heavy metadata reads
   - orchestrates retrieval
   - talks to PostgreSQL and OpenSearch over a private network
   - remains containerized and independently deployable

3. **Stateful services off Vercel**
   - PostgreSQL
   - OpenSearch
   - Redis if still needed
   - workers

### WSL versus real production hosting

WSL is a local development and experimentation environment. It is not the target production substrate.

For production:

- do not think in terms of “Vercel plus WSL root”
- think in terms of “Vercel plus a real Linux service host or managed service estate”
- keep the same container boundaries from local development so promotion to production is mostly a host migration, not an architectural rewrite

### Official-platform implications

Current official Vercel guidance is consistent with this boundary:

- Vercel does not run Docker containers directly
- Vercel Functions have bounded memory and duration
- Vercel Functions use a read-only filesystem except for limited temporary scratch

That is exactly why the data estate and long-running workers belong off Vercel even if the frontend ships there.

## Recommended Execution Plan

The right sequence is a controlled strangler migration, not a rewrite.

### Phase map

| Phase | Goal | Blocking for | Rough effort (person-weeks) |
|---|---|---|---:|
| P0 | Classify relations; retention discipline | P1, P2 | 1–2 |
| P1 | Freeze ID and serving contract | P2, P3 | 2–3 |
| P2 | Stand up OpenSearch read model | P3 | 4–6 |
| P3 | Cut retrieval over by query class | P4, P5 | 3–5 |
| P4 | Slim PostgreSQL | — | 2–3 |
| P5 | MedCPT runtime + cross-encoder rerank | P5b, P6 | 3–4 |
| P5b | Later retrieval refinements if still needed | P6 | 2–6 |
| P6 | 200M warehouse-plane split, conditional | — | 4–8 |

Phases `P0` through `P2` can overlap. `P3` and `P4` are sequential cutover phases. `P5` can benchmark in parallel after `P2`, but it should not become the default interpretation of runtime gains until the serving-plane cutover is stable enough to read clearly.

## P0 — Classify and Add Retention Discipline

### Goal

Before any migration, know what every large relation actually is, so cleanup does not delete canonical data and rebuilds do not silently leak disk.

### Deliverables

**D0.1 — Relation inventory**

Create `docs/investigations/rag-future/relation-inventory.md` classifying every relation > `1 GB` into exactly one of:

- `canonical`
- `derived_serving`
- `stage_swap`
- `raw_ingest`

Build the inventory from live DB inspection, not from guesswork.

**D0.2 — Retention policy module**

Create `engine/app/rag_ops/retention.py` with:

- TTL policy for `*_next` and `*_old`
- explicit allow-list for intentionally reusable stage tables
- `paper_chunk_versions` retention policy: keep `current + N-1`
- alerting hook for large abandoned stage artifacts

**D0.3 — Retention audit CLI**

Create `engine/db/scripts/rag_retention_audit.py` with:

- `--report`
- `--archive-retired` dry-run by default
- size, age, and retention verdict output

**D0.4 — Optional physical cluster relocation**

If disk pressure already justifies it:

1. provision an `E:`-backed ext4 VHDX and mount it inside Linux, for example at `/mnt/solemd-graph-pg`
2. rename the current PostgreSQL container and rollback artifacts to `solemd-graph-db-legacy`
3. build the new canonical PostgreSQL container `solemd-graph-db`
4. point `solemd-graph-db` at the new Linux ext4 PG root
5. copy or base-backup the cluster into the new root
6. verify readiness, graph reads, API metadata reads, and a retrieval smoke run
7. cut clients over to the new canonical `solemd-graph-db`
8. keep `solemd-graph-db-legacy` only for rollback during the soak window
9. remove `solemd-graph-db-legacy` and its old volume after successful soak

**D0.5 — Guardrail: partition children are not cleanup targets**

Document explicitly that the child partitions of:

- `paper_blocks`
- `paper_sentences`
- `paper_chunks`
- `paper_chunk_members`
- `paper_entity_mentions`
- `paper_citation_mentions`

are physical storage for canonical grounding and must not be treated as disposable cleanup targets.

### Acceptance

- every relation ≥ `1 GB` has a classification and retention verdict
- `entity_corpus_presence_next` has a documented lifecycle and TTL after successful swap
- `rag_retention_audit.py --report` runs quickly and produces a reviewed baseline

### Verification

```bash
cd engine
uv run python -m db.scripts.rag_retention_audit --report > /tmp/retention-baseline.txt
uv run pytest test/test_rag_retention.py
```

### Risk / rollback

Low. This phase is read-heavy, documentation-heavy, and dry-run by default.

## P1 — Freeze ID and Serving Contracts

### Goal

Lock down the stable identities that every later phase depends on.

### Deliverables

**D1.1 — `EvidenceUnit` contract**

Create `engine/app/rag/evidence_contract.py` with:

- `EvidenceUnitKind`
- `EvidenceUnitRecord`
- explicit canonical ordinal fields
- text hash and source revision fields

**D1.2 — `evidence_key` derivation**

Create a stable builder for `evidence_key` that is:

- content-bound
- release-independent
- stable across rebuilds of identical canonical input

**D1.3 — `ConceptPackage`**

Replace expansion-string-centric retrieval with a structured contract in `engine/app/rag/search_retrieval_concepts.py`.

**D1.4 — `EvidenceSearchBackend` abstraction**

Create `engine/app/rag/evidence_backend.py` and define:

- `search_papers(...)`
- `search_evidence_units(...)`
- `hybrid_search(...)`
- `rerank(...)`

Implementations:

- `PostgresEvidenceBackend`
- `OpenSearchEvidenceBackend`

**D1.5 — Serving-package manifest**

Define `docs/investigations/rag-future/serving-package-spec.md` with:

- package identity
- inputs
- outputs
- `evidence_key` round-trip invariants

### Acceptance

- property-based tests prove `evidence_key` stability
- backend protocol exists and has a no-op testable stub
- `ConceptPackage` becomes the new center of the retrieval contract

### Verification

```bash
cd engine
uv run pytest test/test_evidence_contract.py -v
uv run pytest test/test_concept_package.py -v
uv run pytest test/test_evidence_backend_protocol.py -v
```

### Risk / rollback

Medium-low. The main risk is getting `evidence_key` wrong. That risk is large enough that peer review is justified before indexing work begins.

## P2 — Stand Up the OpenSearch Read Model

### Goal

Build the first external serving plane end-to-end from canonical PostgreSQL without making it the live hot path yet.

### Deliverables

**D2.0 — Coverage precondition**

Choose one explicit source path for v1 evidence units:

- **Path A, recommended**: derive from canonical structural spans and record the active chunk policy identity
- **Path B**: backfill the default chunk version for the target hot release scope before the serving build

For v1, choose Path A unless a measured grounding requirement proves otherwise.

**D2.1 — OpenSearch cluster**

Decide:

- self-hosted for dev and staging vs managed for production
- 3.x line
- secrets injected with `solemd op-run graph -- ...` from 1Password Environments; no plaintext dotenv fallback in the runtime

Initial vector posture:

- `paper_index` dense retrieval should default to Faiss HNSW with an explicit `mode` (`in_memory` or `on_disk`) and a pinned `compression_level`
- if the chosen paper-lane path is `on_disk` / memory-optimized search, do not plan on IVF or PQ for that same build
- `evidence_index` v1 should be lexical-first with bounded cross-encoder rerank
- evidence-dense ANN should default to off in the first production cut unless the miss surface proves it is the next quality lever
- Lucene k-NN can remain available for smaller filtered experiments, but it should not be the assumed large-scale default for the first serious evidence-serving build

**D2.2 — Index mappings**

Create `engine/app/rag/opensearch/mappings.py` for:

- `paper_index`
- `evidence_index`
- weighted-RRF score-ranker pipeline
- conservative index-time analyzers and search-time analyzers for title, abstract, and evidence text
- updateable synonym filter wired to a versioned synonym artifact
- explicit vector-mode choices recorded in the serving-package manifest so rebuilds preserve the same search semantics

**D2.3 — Serving-package builder**

Create `engine/app/rag_ops/build_serving_package.py` that:

- reads canonical PostgreSQL structural and mention tables
- synthesizes v1 `EvidenceUnit`s
- computes `evidence_key`
- emits bulk NDJSON
- emits a grounding manifest for verification
- emits the versioned OpenSearch synonym artifact from `concept_search_aliases`
- builds the canonical alias-swapped serving indexes
- writes `package_tier` onto serving documents so retrieval policy can do hot-first and warm-backfill without encoding tier into the main index names
- optional filtered aliases for tier-specific operational use may exist later, but they are not the primary naming contract

**D2.4 — Dense vector path**

Create `engine/app/rag_ops/build_evidence_vectors.py` that:

- batches v1 evidence units through `MedCPTArticleEncoder`
- writes vectors into bulk output
- uses NCBI MedCPT paper embeddings where PMIDs align
- locally encodes paper records that do not align
- applies the chosen compression path consistently for the target index family rather than leaving vector mode as an implicit infra afterthought

**D2.5 — `OpenSearchEvidenceBackend`**

Implement `engine/app/rag/opensearch/backend.py` using:

- weighted RRF
- retrieval-native filters and lexical guards
- no giant query-DSL policy layer

**D2.6 — Build orchestration**

Create `engine/db/scripts/build_rag_serving_package.py` with:

- `--mode bootstrap`
- `--mode incremental`
- `--dry-run`
- `--index-suffix`

**D2.7 — Release-scope sample-build gate**

Before any P3 cutover, require at least one release-scope sample build large enough to stress the package design rather than just the current tiny slice.

Minimum gate:

- `5k–25k` papers or `50k–200k` evidence units, whichever is larger

This gate must measure:

- evidence cardinality by unit type
- mapping validation
- shard-sizing review
- alias-swap timing
- grounding round-trip success
- build and ingest timing for both hot and warm package tiers

### Acceptance

- full build succeeds for the current small materialized subset
- structural-span derivation succeeds on sampled papers outside the current 753-paper subset
- at least one release-scope sample build passes the D2.7 gate before any P3 cutover
- hot and warm packages preserve `corpus_id` and `evidence_key`
- smoke-test queries round-trip correctly into PostgreSQL grounding
- OpenSearch backend meets initial shadow-mode latency targets
- live retrieval path is still unchanged

### Verification

```bash
cd engine
uv run python -m db.scripts.build_rag_serving_package --mode bootstrap --dry-run
uv run python -m db.scripts.build_rag_serving_package --mode bootstrap
uv run python -m db.scripts.build_rag_serving_package --mode bootstrap --sample-papers=5000
uv run pytest test/integration/test_opensearch_backend.py -v
uv run pytest test/integration/test_serving_package_build.py -v
uv run python -m db.scripts.verify_grounding_roundtrip --sample=100
```

### Risk / rollback

Medium. The critical risk is contract instability in `evidence_key`. Rollback is easy as long as the live hot path is still not using OpenSearch.

## P3 — Cut Retrieval Over by Query Class

### Goal

Move first-stage evidence retrieval off PostgreSQL in the exact order that minimizes regression risk.

### Order

1. `PASSAGE_LOOKUP`
2. `QUESTION_LOOKUP`
3. evidence-seeking `GENERAL`
4. only later paper-first routes if they clearly benefit

### Deliverables

**D3.1 — Routing wiring**

Update `engine/app/rag/search_plan.py` and config flags:

- `rag_evidence_backend_passage`
- `rag_evidence_backend_question`
- `rag_evidence_backend_general_evidence`

**D3.2 — Child-first candidate generation**

Refactor `engine/app/rag/retrieval_fusion.py` so evidence-seeking routes:

- retrieve evidence units first
- promote papers after evidence shortlist formation
- search hot lane first
- use warm lane only as an honest recall-expansion path

**D3.3 — Parent-child promotion**

Split `engine/app/rag/ranking.py` into:

- Stage 1: RRF
- Stage 2: bounded cross-encoder rerank
- Stage 3: explicit parent-child promotion

Reuse only the ranking helpers that survive the simplification.

The stage budgets from the retrieval contract should be explicit configuration, not implicit behavior:

- Stage A lane caps and fused-pool cap
- Stage B rerank cap and latency budget
- Stage C forwarded-paper cap

**D3.4 — Cross-encoder rerank integration**

Wire `MedCPTReranker` into the bounded rerank path with explicit budget handling.

**D3.5 — A/B harness**

Create `engine/app/rag_ops/ab_retrieval.py` for backend comparison and Langfuse tagging.

### Acceptance

Per query class:

- non-regression in `hit@1`
- non-regression or improvement in `hit@k`
- p95 end-to-end latency ≤ `500 ms`
- clean soak without backend failures

### Verification

```bash
cd engine
uv run python -m rag_ops.ab_retrieval --dataset=expert_suite_61 --compare=postgres,opensearch
uv run python -m scripts.run_expert_suite_benchmark --tag=p3_opensearch_passage
```

### Risk / rollback

High. This is the first live-traffic phase. Rollback is flag-based and should be immediate.

## P4 — Slim PostgreSQL After the Read Model Is Trusted

### Goal

Remove PostgreSQL from jobs it no longer needs to do and enforce the retention policies defined earlier.

### Deliverables

**D4.1 — Retire PG chunk FTS on the hot path**

- default evidence-seeking flags to OpenSearch after validation
- keep PostgreSQL fallback backend
- make `034_rag_post_load_lexical_indexes.sql` opt-in rather than default

**D4.2 — Chunk-version retention**

Create `engine/db/scripts/archive_retired_chunk_versions.py` that:

- dry-runs by default
- exports retired chunk rows to Parquet
- purges in bounded batches or stage/swap form
- records archive manifest
- runs `ANALYZE` on touched relations

**D4.3 — Stage/swap retention enforcement**

- daily retention audit
- alerting for stale `*_next` and `*_old`
- documented intentional-reuse exceptions

**D4.4 — Index audit**

Create `engine/db/scripts/index_usage_delta.py` and capture real `idx_scan` deltas over time before dropping anything.

**D4.5 — Explicit cleanup target list**

Cleanup-eligible:

- stale `*_next`
- stale `*_old`
- failed rebuild scratch
- retired chunk versions
- rebuildable cold text

Not cleanup-eligible:

- canonical partition children of the grounded span families

**D4.6 — Cold-text archive path**

If active hot text becomes large enough, design archival flows to object storage. Do not put remote lake bridging in the request hot path.

### Acceptance

- PostgreSQL chunk FTS is off evidence-seeking hot routes
- active chunk-version retention is under control
- retention audit runs daily without active alerts
- database size stabilizes rather than growing with version churn

### Verification

```bash
cd engine
uv run python -m db.scripts.rag_retention_audit --report
uv run python -m db.scripts.index_usage_delta --window=30d
uv run python -m db.scripts.archive_retired_chunk_versions --dry-run
```

### Risk / rollback

Medium. Archive work is destructive-adjacent and must remain explicit, dry-run-first, and manifest-backed.

## P5 — Make MedCPT the Runtime Default

### Goal

Move runtime dense retrieval to MedCPT for both paper and child lanes and make the bounded MedCPT reranker part of the normal serving cascade.

### Deliverables

**D5.1 — Runtime query embedder swap**

Update `engine/app/rag/query_embedding.py`:

- add `MedCPTQueryEmbedderAdapter`
- add `rag_query_embedder_backend`
- preserve `Specter2AdhocQueryEmbedder` for graph and relatedness uses

**D5.2 — Dual paper dense support**

Keep both in the paper index:

- `dense_vector_specter2`
- `dense_vector_medcpt`

**D5.3 — Cross-encoder rerank active by default**

Ensure the rerank path is live and bounded under the target latency budget.

**D5.4 — Offline benchmark**

Compare:

- `specter2_adhoc`
- `medcpt`
- `medcpt + ce_rerank`

on the expert suite.

### Acceptance

- `medcpt + ce_rerank` materially improves `hit@1`
- `medcpt + ce_rerank` materially improves `hit@k`
- `no_target_signal` remains `0`
- MedCPT becomes the default runtime query embedder

### Verification

```bash
cd engine
uv run python -m scripts.run_expert_suite_benchmark --backend=specter2_adhoc --tag=p5_baseline
uv run python -m scripts.run_expert_suite_benchmark --backend=medcpt --tag=p5_medcpt
uv run python -m scripts.run_expert_suite_benchmark --backend=medcpt --rerank=medcpt_ce --tag=p5_medcpt_ce
```

### Risk / rollback

Medium. Rollback is a setting flip because the paper index continues to hold both vector families.

## P5b — Later Refinement Gate If Top-1 Is Still the Frontier

### Goal

Only after the MedCPT cascade is live, decide whether the next quality lever is still retrieval precision rather than broader architecture.

### Candidate experiments

- neural sparse or SPLADE-style additive lane in OpenSearch
- ColBERTv2 late-interaction sidecar reranker over OpenSearch shortlists

### Rule

Run these before considering a serving-engine replacement.

## P6 — Split the 200M Warehouse Plane Only If Pressure Proves It

### Goal

Separate the analytical warehouse plane from the hot evidence-serving plane only when measured pressure requires it.

### Trigger conditions

Start only if at least two of these are true:

- PostgreSQL size exceeds roughly `3 TB`
- analytical rebuilds materially affect hot serving latency
- raw or entity surfaces become regular large-scan analytical burdens
- new full-corpus analytical needs cannot coexist with the hot grounding plane

### Deliverables

**D6.1 — Split target**

Options:

- same cluster, different schema and tablespace only as a temporary stopgap
- separate PostgreSQL instance or analytical replica
- sharded option only if single-instance analytical capacity truly fails

Default recommendation if triggered:

- separate instance or analytical replica

**D6.2 — Migration mechanics**

- logical replication of canonical tables
- text-heavy analytical assets to object storage or lakehouse formats
- hot plane keeps only what online grounding needs

**D6.3 — Operational separation**

- separate WAL/PITR cadence
- separate autovacuum profile
- separate operational ownership

### Acceptance

- hot grounding remains within target latency during warehouse workloads
- expert-suite quality does not regress

### Risk / rollback

High complexity, low urgency. Do this only when the evidence says it is the next clean move.

## Dependency Graph

```text
P0 -> P1 -> P2 -> P3 -> P4
                 \-> P5 -> P5b
                       \-> P6 (conditional)
```

## Eval Gating

Every phase should be traceable in Langfuse and measured against the expert suite.

### Standing metrics

- `hit@1`
- `hit@k`
- `evidence_recall@k`
- `paper_recall@k`
- `target_visible_not_top1`
- `no_target_signal`
- `direct_support_rate`
- `claim_withheld_rate`
- `citation_precision`
- `citation_contamination`
- `p50_latency_ms`
- `p95_latency_ms`

### Target trajectory

| Phase end | hit@1 | hit@k | no_target_signal | p95 latency |
|---|---:|---:|---:|---:|
| baseline | 0.164 | 0.279 | 0 | measure in P0 |
| post-P3 | ≥ 0.20 | ≥ 0.35 | 0 | ≤ 500 ms |
| post-P4 | ≥ 0.20 | ≥ 0.35 | 0 | ≤ 450 ms |
| post-P5 | ≥ 0.30 | ≥ 0.45 | 0 | ≤ 500 ms |

## Infrastructure and Ops Decisions Before P2

1. whether to relocate PostgreSQL cluster storage to the new `E:`-backed ext4 volume now
2. self-hosted vs managed OpenSearch
3. initial cluster shape
4. vector-storage mode and quantization choice
5. CPU vs GPU for MedCPT cross-encoder serving
6. object storage target
7. config and secret handling
8. whether the engine API should be split into its own Linux service before the Vercel cutover
9. initial hot-lane cohort size and rubric threshold
10. serving-rights policy for abstract, excerpt, and fulltext-derived evidence units
11. snapshot cadence and restore-test cadence for PostgreSQL and OpenSearch
12. network and credential model for engine API, workers, PostgreSQL, and OpenSearch
13. expected PMID coverage for the first hot-lane cohort and therefore how much local MedCPT encoding capacity is actually needed
14. exact OpenSearch analyzer and synonym policy for biomedical text, titles, and fallback lexical fields

## Work Parallelization and Routing

- schema and DB work: `/schema`
- pipeline and adapter work: `/clean` after each phase
- evaluation and benchmark gates: `/langfuse`
- code navigation: CodeAtlas

## End-to-End Verification

The roadmap is done only when all of these are true:

1. `hit@1 >= 0.30`
2. `hit@k >= 0.45`
3. `no_target_signal = 0`
4. `target_visible_not_top1` is cut by at least half
5. p95 evidence-route latency stays at or below `500 ms`
6. claim-local evidence round-trips correctly to PostgreSQL grounding
7. PostgreSQL size is stable rather than version-churn driven
8. OpenSearch outage degrades quality, not availability
9. snapshot and restore tests are passing for PostgreSQL and OpenSearch
10. hot-lane admissions respect serving-rights and lifecycle policy

## Files That Become Central During Implementation

### Existing architecture and runtime files

- `engine/app/rag/index_contract.py`
- `engine/app/rag/chunk_grounding.py`
- `engine/app/rag/chunk_runtime_contract.py`
- `engine/app/rag/search_plan.py`
- `engine/app/rag/search_retrieval_concepts.py`
- `engine/app/rag/retrieval_fusion.py`
- `engine/app/rag/ranking.py`
- `engine/app/rag/ranking_support.py`
- `engine/app/rag/answer.py`
- `engine/app/rag/grounded_runtime.py`
- `engine/app/rag/biomedical_models.py`
- `engine/app/rag/query_embedding.py`

### New implementation surfaces

- `engine/app/rag/evidence_contract.py`
- `engine/app/rag/evidence_backend.py`
- `engine/app/rag/opensearch/mappings.py`
- `engine/app/rag/opensearch/analysis.py`
- `engine/app/rag/opensearch/backend.py`
- `engine/app/rag_ops/build_serving_package.py`
- `engine/app/rag_ops/build_evidence_vectors.py`
- `engine/app/rag_ops/build_search_aliases.py`
- `engine/app/rag_ops/ab_retrieval.py`
- `engine/app/rag_ops/retention.py`
- `engine/db/scripts/build_rag_serving_package.py`
- `engine/db/scripts/build_opensearch_synonyms.py`
- `engine/db/scripts/rag_retention_audit.py`
- `engine/db/scripts/archive_retired_chunk_versions.py`
- `engine/db/scripts/index_usage_delta.py`
- `engine/db/scripts/verify_grounding_roundtrip.py`

## External Doc-Search Libraries To Keep Indexed

Agents implementing or reviewing this architecture should keep the following external libraries available in doc-search:

- `PostgreSQL` — official server documentation for schema design, partitioning, indexing, full-text search, vacuum and autovacuum, WAL/PITR, logical replication, tablespaces, and operational best practices
- `Psycopg` — the live PostgreSQL driver in this repo for pools, `COPY`, pipeline mode, and connection-lifecycle behavior
- `OpenSearch` — serving-plane query behavior, hybrid search, k-NN engines, vector modes, and pipeline semantics
- `DuckDB` and `DuckDB-WASM` — Parquet export shape, row-group/file-size tradeoffs, bundle transforms, and browser/runtime pushdown rules
- `MedCPT` — retriever and reranker model contracts, bootstrap assets, and implementation details
- `1Password Developer Docs` — Environments, CLI, SSH agent and WSL integration, shell plugins, service accounts, Connect, and secret-loading workflows used by the no-dotenv runtime contract
- `pgvector` — current PostgreSQL vector-extension behavior and limits
- `pgvectorscale` — optional future PostgreSQL ANN comparison surface
- `Qdrant` — conditional later ANN split and future comparison surface
- `Redis` — latency, pipelining, and broker/cache operational guidance while Redis remains in the worker topology
- `Dramatiq` — worker-process concurrency, retry semantics, and async actor constraints if Dramatiq remains the queue surface

Operational note:

- these external doc libraries are implementation aids, not architecture commitments
- `PostgreSQL`, `Psycopg`, `OpenSearch`, `DuckDB`, and `MedCPT` are first-order implementation references for this plan
- `Redis` and `Dramatiq` are first-order only while that queue/broker topology remains in use
- `pgvector`, `pgvectorscale`, and `Qdrant` remain comparison and fallback references unless the roadmap explicitly promotes them
- version-sensitive PostgreSQL guidance must match the repo-pinned server major version; the repo currently contains mixed `16` and `18` references, so verify the active target before applying feature-specific advice

### Priority official topics to consult first

When an agent needs current optimization or operational guidance, start with these official documentation topics before falling back to forum posts or generic blog guidance:

- `PostgreSQL`:
  - `EXPLAIN`
  - `pg_stat_statements`
  - cumulative statistics and `pg_stat_io`
  - planner statistics and extended statistics
  - partitioning
  - parallel query
  - `COPY`
  - `CREATE INDEX` / concurrent index build guidance
  - vacuum and autovacuum
  - logical replication
- `Psycopg`:
  - connection pools
  - `COPY`
  - pipeline mode for idempotent derived jobs
  - sync versus async connection lifecycle
- `OpenSearch`:
  - hybrid query limits and processing order
  - score-ranker and normalization pipelines
  - hybrid rescoring order and shard-level caveats
  - `pagination_depth` consistency rules for hybrid paging
  - k-NN methods and engines
  - `knn_vector` `mode` / `compression_level`
  - Faiss compression and vector-mode choices
  - reranking behavior and shard-level caveats
- `DuckDB` and `DuckDB-WASM`:
  - row-group effects on parallelism
  - Parquet file and row-group sizing
  - projection and predicate pushdown behavior
  - browser/runtime attachment constraints where relevant
- `MedCPT`:
  - published encoders and reranker
  - PMID-aligned bootstrap embeddings
  - query and article encoder usage contracts
- `Redis`:
  - latency diagnosis
  - pipelining
  - persistence and topology caveats for low-latency use
- `Dramatiq`:
  - worker-process concurrency
  - retry semantics
  - async actor behavior and middleware constraints

Default rule:

- prefer official docs first
- prefer the repo-pinned PostgreSQL major-version semantics when live cluster behavior matters
- treat third-party performance advice as secondary unless it clearly matches the live version and workload

## Explicit Non-Goals

- live GraphRAG traversal in the hot path
- remote lake bridging in the hot request path
- day-one Qdrant split
- repartitioning as the first scaling move
- table and figure retrieval in v1
- always-on LLM query rewriting

## Rollback Rules

- every phase must have a flag-based or settings-based rollback
- no phase deletes canonical data without a durable export first
- PostgreSQL fallback retrieval remains present and tested
- serving-plane outage must degrade quality, not service availability

## Open Questions Still Worth Resolving Before Build

1. self-hosted or managed OpenSearch for the first serious production deployment
2. exact v1 `EvidenceUnit` ontology boundaries
3. retention window for retired chunk versions in object storage
4. whether CPU is enough for MedCPT cross-encoder at the target rerank budget
5. whether to execute the new `E:`-backed PostgreSQL container cutover before P2 or only when disk pressure is immediate
6. whether to split out an `engine-api` container before the eventual Vercel deployment boundary
7. what the initial hot-lane cohort size should be for the first production practice evidence base
8. what the default serving-rights classes and excerpt/fulltext policies should be
9. what the default source-refresh and serving-package rebuild cadence should be
10. what the production snapshot cadence should be for PostgreSQL, OpenSearch, and archived manifests
11. whether API projection runs should be cut over independently or only with serving-run cutovers
12. what the production network and credential model should be for engine API, workers, PostgreSQL, and OpenSearch
13. what PMID coverage the initial hot lane is expected to have and therefore how much local MedCPT encoding capacity is actually required
14. what the exact OpenSearch analyzer and synonym policy should be for biomedical text and fallback lexical paths

## Final Recommendation

Build from this architecture:

- canonical PostgreSQL warehouse and grounder
- OpenSearch as the first evidence-serving plane
- hot recency-bounded practice evidence lane first
- warm broader graph-visible lane second
- MedCPT as the runtime biomedical retrieval stack
- claim-local grounding
- janitor and retention discipline early
- later dense and warehouse splits only when measured quality or operational pressure makes them the next clean move

What should be kept:

- the canonical PostgreSQL spine
- the existing grounding model
- `corpus_id`-bounded joins
- chunk policy and chunk-version identity
- release scoping

What should be redesigned:

- PostgreSQL as a global evidence retrieval engine
- the current paper-first retrieval merge for evidence routes
- the current additive ranking stack
- the current whole-answer grounding contract

What is a mistake to keep scaling:

- PostgreSQL chunk FTS as the primary hot evidence retriever
- a warehouse-first frame for an evidence-serving problem
- letting stage and swap artifacts accumulate without retention
- buying hardware first and defining the dense footprint later

What can wait:

- Qdrant
- repartitioning
- late interaction
- a warehouse-plane split
- tables and figures as first-class evidence units

## Deprecated Predecessor Docs

These documents are now historical context only for future-state RAG planning. Do not use them as active guidance when they disagree with this file:

- `docs/archive/rag/rag-future-info.md`
- `docs/archive/rag/investigations/2026-04-13-rag-scalability-review-comparison.md`
- `docs/archive/rag/investigations/2026-04-13-rag-scalability-review-addendum-evidence-serving.md`
- `docs/archive/rag/plans/rag-eval.md`
- `docs/archive/rag/plans/rag-runtime-direction-2026-04.md`
- `docs/archive/rag/plans/rag-ingest-stanza-hybrid-chunking-plan.md`
- `docs/archive/rag/plans/full-evidence-system-plan.md`
- `docs/archive/rag/map/rag-handoff.md`
- `docs/archive/rag/agentic/2026-04-10-rag-expert-language-canonicalization-handoff.md`
- `/home/workbench/.claude/plans/jazzy-inventing-chipmunk.md`

Current-state companion docs that remain active:

- `docs/map/rag.md`
- `.claude/skills/langfuse/references/benchmarking.md`
