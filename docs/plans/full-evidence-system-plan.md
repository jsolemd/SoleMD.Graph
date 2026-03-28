# SoleMD.Graph Full Evidence System Plan

Status: Proposed target architecture  
Project: `SoleMD.Graph`  
Scope: full-fidelity evidence warehouse, retrieval plane, graph engagement model, and RAG integration built on local Semantic Scholar and PubTator assets  
Target product posture: public nonprofit educational platform  
Audience: engine, schema, retrieval, graph, and frontend workstreams

## Why This Exists

SoleMD.Graph should not stop at paper-level visualization or preview-level RAG.
The project already has unusually rich local assets:

- Semantic Scholar bulk metadata
- Semantic Scholar bulk citations with contexts and intents
- `s2orc_v2` full text with structural and citation-span annotation
- PubTator tabular entity/relation annotations
- PubTator BioCXML with passage structure and exact mention offsets
- SPECTER2 paper embeddings for map geometry

Those assets justify a stronger target than "paper search plus chunk retrieval."
The correct target is a **full evidence system**:

- exact prose retrieval
- source-aware grounding
- entity-aware filtering and reranking
- citation-aware evidence chains
- table and figure evidence
- graph interactions that respond to retrieval state in real time

The graph should not be a static backdrop. It should become the spatial memory
of the literature, continuously animated by retrieval and evidence.

## Executive Summary

SoleMD.Graph should be rebuilt around a **structured evidence warehouse** rather
than a thin `paper_chunks` table. The canonical system should model:

- document
- section
- block
- sentence
- bibliography entry
- in-text citation mention
- entity mention
- relation mention
- asset
- table and figure payload
- versioned derived chunks

Retrieval should operate across multiple evidence granularities:

- sentence
- block / paragraph
- derived retrieval chunk
- caption
- table summary
- abstract

The graph should support multiple interacting layers:

- paper layer
- evidence overlay
- entity overlay
- citation overlay
- relation overlay

The RAG system should return **evidence bundles**, not bare text. An evidence
bundle includes:

- exact supporting sentence
- parent block
- neighboring context
- section path
- matched entities
- citation mentions
- bibliography entry
- linked papers
- related assets

This plan intentionally treats current bundle/detail contracts as disposable
scaffolding. Compatibility with preview-era shapes is not a design goal.

## Platform Target, Rights Posture, and Deployment Principles

This system is being designed for a **public nonprofit educational platform**,
not just a private personal tool.

Implications:

- public attribution requirements should be assumed from the beginning, including clear Semantic Scholar attribution in the UI
- the architecture must remain rights-aware even where policy details are still evolving
- retrieval/storage and UI display must be decoupled so display policy can tighten later without re-parsing or re-indexing the corpus

Current posture:

- the formal rights/compliance model is intentionally deferred as a dedicated later workstream
- `display_policy` functionality should ship from day one as a placeholder operational contract, not as a finalized legal regime
- when license/access metadata is present, it should be surfaced in the UI so users can understand what is being shown and why
- if content is partially displayed or withheld later, the response should include an explicit reason rather than silently omitting text

Deployment principles:

- provider-agnostic in documentation
- US-based hosting only
- single-node first, with scale-out left possible but not assumed
- capability requirements should be specified in terms of RAM, storage, GPU/CPU needs, and latency budgets rather than naming a vendor

## Non-Negotiable Product Outcomes

1. A user can retrieve the **best supporting sentence** for a claim, not just a vaguely related chunk.
2. A user can expand from that sentence to surrounding paragraph context, section context, and cited references.
3. A user can filter or boost retrieval by **entity presence** at evidence level.
4. A user can retrieve methods/results/tables/figure captions as distinct evidence types.
5. The graph can light up semantically related papers and evidence nodes in response to live retrieval.
6. The system can support both discovery and writing:
   - Ask
   - Explore
   - Learn
   - Cite / write
7. Every answer is inspectable down to:
   - source release
   - exact span
   - section path
   - citation linkage
   - associated metadata
8. Chunking and retrieval policies are versioned and comparable.

## Current State and Design Drivers

### What is already true in this repo

- Local bulk storage is release-aware for Semantic Scholar and PubTator.
- The normalized PostgreSQL backbone already exists for:
  - `solemd.corpus`
  - `solemd.papers`
  - `solemd.citations`
  - related paper metadata tables
  - `pubtator.entity_annotations`
  - `pubtator.relations`
- Existing enrichment tables already in live use include:
  - `solemd.paper_assets`
  - `solemd.paper_references`
- The graph build pipeline exists and is already benchmarked at large mapped-paper scales.
- The current Phase 3 RAG schema is only a thin placeholder in [database.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/database.md#L431).
- The current bundle exporter emits placeholder chunk fields in [export_bundle.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/graph/export_bundle.py#L360).
- The current frontend "chunk detail" view is preview-based and currently maps preview text into `chunk_text` in [session.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/session.ts#L819).
- The current graph detail and RAG actions are still stubs in [graph.ts](/home/workbench/SoleMD/SoleMD.Graph/app/actions/graph.ts#L47).

### Existing table reconciliation

Two existing live tables must be evolved, not recreated:

- `solemd.paper_assets` already stores open-access PDF asset rows written by the S2 enrichment path
- `solemd.paper_references` already stores per-paper bibliography rows from S2 API enrichment

Implication:

- evidence warehouse migrations should start with `ALTER TABLE` on existing structures where possible
- the evidence model may use richer logical names such as `paper_reference_entries`, but the migration plan must explicitly reconcile those logical contracts with the existing physical tables

### PubTator coexistence rule

The existing `pubtator` schema remains a live upstream dependency for corpus promotion and policy logic.

Roles:

- `pubtator.entity_annotations` and `pubtator.relations` remain source reference tables
- `solemd.paper_entity_mentions` and `solemd.paper_relation_mentions` become evidence warehouse tables

These coexist.
The evidence warehouse does not replace the promotion-oriented `pubtator` tables.

### Observed local `s2orc_v2` findings

From direct local sampling of shard `s2orc_v2-0000.jsonl.gz`:

- total local shards: `214`
- annotation payloads are JSON-encoded strings nested inside the JSON record
- `body.annotations` currently exposes:
  - `paragraph`
  - `section_header`
  - `sentence`
  - `bib_ref`
- `bibliography.annotations` currently exposes:
  - `bib_entry`
  - `bib_id`
  - `bib_title`
  - `bib_venue`
  - `bib_author_first_name`
  - `bib_author_last_name`
- mean body length in a 200-record sample: about `31,974` characters / `5,030` words
- sentence annotations were absent in about `18%` of a 500-record sample
- section headers were present in nearly all sampled papers
- matched bibliography links were common:
  - papers with matched inline body `bib_ref`: about `90%`
  - papers with matched bibliography entries: about `93%`
- section header attributes may carry numbering, for example:
  - `1.`
  - `2.1.`
  - `4.1.`

Implications:

- the parser must decode annotation JSON strings as a second step
- sentence annotations are strong but not universal
- citation-aware retrieval is a major strength of `s2orc_v2`
- section trees can preserve numbering / hierarchy

### Observed local BioCXML findings

From direct local sampling of `BioCXML.0.tar.gz`:

- BioCXML archives are present locally
- archive members are XML documents containing one or more articles
- passages can expose:
  - title/front matter
  - abstract
  - intro/body paragraphs
  - figure captions
  - table captions
  - table payloads
- front matter may include:
  - author fragments
  - DOI / PMCID / publisher ids
  - license text
  - keywords
- inline `<annotation>` tags provide exact mention offsets and entity types

Implications:

- BioCXML is not just an abstract fallback
- it is the richest exact-offset entity annotation source
- it is currently the clearest route to table / figure caption evidence

### Observed live DB coverage

From the current graph-tier database state:

- `2,743,699` graph-tier papers
- `639,416` currently marked `text_availability = 'fulltext'`
- `657,727` with PMCID
- `955,164` marked open access

Current candidate-tier `text_availability` remains null, so graph-tier overlap
is measurable today, while candidate-tier full-text overlap should not be
estimated from current database values alone.

## Phase 0 Preview Bridge

Before the full evidence warehouse lands, the repo already has enough data to
ship a preview evidence path and validate the end-to-end loop:

- paper semantic retrieval from existing paper embeddings
- citation-context evidence from `solemd.citations.contexts`
- citation-intent metadata from `solemd.citations.intents`
- entity-based paper filtering from `pubtator.entity_annotations`
- graph highlighting through the existing Ask UI path and graph selection model

Preview scope:

- `POST /evidence/preview/query`
- `GET /evidence/preview/paper/{corpus_id}`
- PromptBox wired to preview evidence
- graph highlight payloads at paper level

Purpose:

- validate query -> retrieve -> display -> highlight quickly
- establish the evaluation harness before full-text ingest
- create a baseline that later block/sentence retrieval must beat

## Target Product Vision

### Ask

The user asks a question. The system retrieves the strongest evidence and shows:

- best sentence-level support
- surrounding paragraph / block context
- section path
- linked references
- supporting tables / captions if relevant
- papers that light up on the graph
- adjacent evidence neighborhoods

As the answer streams, cited papers and evidence clusters illuminate.

### Explore

The user moves through the paper map, but can also pivot into evidence:

- highlight papers mentioning a concept
- highlight papers containing a specific relation
- highlight chunks/sentences semantically aligned to a free-text query
- switch between paper-level, evidence-level, and entity-level overlays

### Cite / Write

The user is drafting a claim. The system can:

- retrieve exact supporting prose
- rank papers by support strength
- expose methods and sample-size context
- show whether evidence is repeated, contradictory, or citation-central
- return exact sentence and block text suitable for note capture and citation support

### Learn

The system can walk a user through a topic using evidence chains:

- cluster exemplars
- key supporting sentences
- methods/results distinctions
- graph neighborhoods of supporting and contrasting papers

## Design Principles

1. **Structured truth first**
   Retrieval units are derived artifacts. The source of truth is structured evidence.

2. **Span fidelity**
   Exact offsets matter. Every evidence object should be anchorable to source text.

3. **Multiple evidence granularities**
   Sentences, blocks, chunks, captions, tables, and abstracts all have distinct retrieval value.

4. **Versioned derivation**
   Chunking, indexing, and reranking policies should be versioned so the system can improve without losing provenance.

5. **Source layering**
   `s2orc_v2`, BioCXML, PubTator tabular, and abstract-only fallback each contribute different strengths.

6. **Graph as runtime evidence state**
   The graph should react to retrieval, not merely coexist beside it.

7. **Lean hot bundle, rich cold evidence**
   Keep the graph render path fast. Rich evidence loads through dedicated APIs.

## System Overview

```text
Local Bulk Assets
  ├── Semantic Scholar papers / abstracts / tldrs / citations / paper-ids / authors
  ├── Semantic Scholar s2orc_v2
  └── PubTator tabular + BioCXML

        ↓ normalize / parse / align / checkpoint

Canonical Evidence Warehouse (PostgreSQL)
  ├── papers / documents / sections / blocks / sentences
  ├── bibliography entries / citation mentions
  ├── entity mentions / relation mentions
  ├── assets / tables / figures
  └── chunk versions / derived chunks

        ↓ derived indexing pipelines

Retrieval Plane
  ├── dense sentence index
  ├── dense block/chunk index
  ├── sparse lexical index
  ├── entity-aware filters
  └── cross-encoder reranker

        ↓ evidence APIs

Graph + UI
  ├── paper graph layer
  ├── evidence overlays
  ├── entity overlays
  ├── citation / relation overlays
  └── writing / asking / exploration workflows
```

## Canonical Evidence Warehouse

### 1. `solemd.paper_documents`

One canonical document row per paper.

Purpose:

- document-level identity
- source precedence
- coverage
- text length / completeness
- provenance

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `corpus_id` | `BIGINT PK FK -> papers` | one canonical document per paper |
| `preferred_text_source` | `TEXT` | `s2orc_v2`, `biocxml`, `abstract_only` |
| `preferred_annotation_source` | `TEXT` | `biocxml`, `pubtator_tabular`, `none` |
| `source_release_id` | `TEXT` | primary preferred source release |
| `canonical_text_hash` | `TEXT` | hash of canonical document text |
| `document_text` | `TEXT` | canonical full text or abstract-only text |
| `text_length_chars` | `INTEGER` | |
| `text_length_words` | `INTEGER` | |
| `section_count` | `INTEGER` | |
| `block_count` | `INTEGER` | |
| `sentence_count` | `INTEGER` | |
| `reference_entry_count` | `INTEGER` | |
| `citation_mention_count` | `INTEGER` | |
| `entity_mention_count` | `INTEGER` | |
| `relation_mention_count` | `INTEGER` | |
| `page_count` | `INTEGER` | if recoverable |
| `table_count` | `INTEGER` | |
| `figure_count` | `INTEGER` | |
| `has_fulltext` | `BOOLEAN` | |
| `has_biocxml` | `BOOLEAN` | |
| `has_sentence_offsets` | `BOOLEAN` | |
| `has_citation_mentions` | `BOOLEAN` | |
| `has_entity_offsets` | `BOOLEAN` | |
| `display_policy` | `TEXT` | placeholder render policy: `full`, `partial`, `metadata_only`, `undecided` |
| `display_policy_reason` | `TEXT` | explain why text is fully shown, partially shown, or withheld |
| `rights_metadata` | `JSONB` | surfaced license/access/disclaimer metadata when present |
| `created_at` | `TIMESTAMPTZ` | |
| `updated_at` | `TIMESTAMPTZ` | |

Notes:

- `display_policy` is an operational rendering field, not the final legal/compliance model
- retrieval should continue to use canonical text even if display policy later becomes more restrictive
- when available, `rights_metadata` should carry user-explainable fields such as license text, access status, disclaimer, and source of the rights signal

### 2. `solemd.paper_document_sources`

One row per source contribution to a paper document.

Purpose:

- preserve source layering
- support source precedence
- retain auditability across releases

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `document_source_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `source_kind` | `TEXT` | `s2orc_v2`, `biocxml`, `abstract_only`, later others |
| `source_release_id` | `TEXT` | |
| `external_document_id` | `TEXT` | PMID / PMCID / corpusid / archive member id |
| `is_text_source` | `BOOLEAN` | |
| `is_annotation_source` | `BOOLEAN` | |
| `priority_rank` | `INTEGER` | lower is preferred |
| `raw_metadata` | `JSONB` | source-specific metadata |
| `created_at` | `TIMESTAMPTZ` | |

### 3. `solemd.paper_sections`

Hierarchical section tree.

Purpose:

- preserve section numbering and path
- enable section-aware retrieval and filtering

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `section_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `parent_section_id` | `BIGINT FK -> paper_sections` | nullable |
| `section_index` | `INTEGER` | stable order within document |
| `section_depth` | `INTEGER` | root = 0 |
| `section_number` | `TEXT` | from `attributes.n` when present |
| `section_name_raw` | `TEXT` | raw header |
| `section_name_normalized` | `TEXT` | normalized text |
| `section_canonical` | `TEXT` | `introduction`, `methods`, etc. |
| `section_path` | `TEXT[]` | hierarchical label path |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 4. `solemd.paper_blocks`

Canonical content spans.

Block types:

- `title`
- `abstract`
- `paragraph`
- `figure_caption`
- `table_caption`
- `table_text`
- `front_matter`
- `footnote`
- `other`

Purpose:

- preserve structure and evidence modality
- provide the main context-level retrieval substrate

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `block_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `section_id` | `BIGINT FK -> paper_sections` | nullable |
| `block_index` | `INTEGER` | stable order |
| `block_kind` | `TEXT` | see above |
| `block_label` | `TEXT` | e.g. `Figure 2`, `Table 1` |
| `source_block_id` | `TEXT` | source-local identifier if present |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `block_text` | `TEXT` | materialized text for retrieval and API reads |
| `char_count` | `INTEGER` | |
| `word_count` | `INTEGER` | |
| `page_number` | `INTEGER` | nullable |
| `section_path` | `TEXT[]` | denormalized for convenience |
| `metadata` | `JSONB` | source-specific payload |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 5. `solemd.paper_sentences`

Sentence-level evidence units.

Purpose:

- exact claim grounding
- best-sentence retrieval
- sentence-specific graph engagement

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `sentence_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `block_id` | `BIGINT FK -> paper_blocks` | |
| `section_id` | `BIGINT FK -> paper_sections` | nullable |
| `sentence_index` | `INTEGER` | order within document |
| `block_sentence_index` | `INTEGER` | order within block |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `sentence_text` | `TEXT` | |
| `char_count` | `INTEGER` | |
| `word_count` | `INTEGER` | |
| `has_citation_mention` | `BOOLEAN` | |
| `has_entity_mention` | `BOOLEAN` | |
| `has_relation_mention` | `BOOLEAN` | |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 6. `solemd.paper_reference_entries`

Bibliography entries.

Purpose:

- resolve reference metadata
- connect in-text citations to papers

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `reference_entry_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `reference_index` | `INTEGER` | stable order |
| `ref_id` | `TEXT` | source-local bibliography id, e.g. `b7` |
| `start_char` | `INTEGER` | optional if bibliography text materialized |
| `end_char` | `INTEGER` | optional |
| `raw_citation_text` | `TEXT` | |
| `title` | `TEXT` | |
| `authors_json` | `JSONB` | |
| `venue` | `TEXT` | |
| `year` | `INTEGER` | |
| `doi` | `TEXT` | |
| `pmid` | `TEXT` | |
| `pmcid` | `TEXT` | |
| `arxiv_id` | `TEXT` | |
| `mag_id` | `TEXT` | |
| `matched_paper_id` | `TEXT` | Semantic Scholar paper id |
| `matched_corpus_id` | `BIGINT` | local corpus join target |
| `match_confidence` | `REAL` | |
| `metadata` | `JSONB` | |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 7. `solemd.paper_reference_mentions`

In-text citation mentions.

Purpose:

- exact citation span grounding
- citation-aware retrieval
- graph evidence chains

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `reference_mention_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `block_id` | `BIGINT FK -> paper_blocks` | |
| `sentence_id` | `BIGINT FK -> paper_sentences` | nullable |
| `ref_id` | `TEXT` | bibliography entry join key |
| `reference_entry_id` | `BIGINT FK -> paper_reference_entries` | nullable until resolved |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `surface_text` | `TEXT` | e.g. `[7]` |
| `matched_paper_id` | `TEXT` | denormalized convenience |
| `matched_corpus_id` | `BIGINT` | denormalized convenience |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 8. `solemd.paper_assets`

General document assets.

Asset kinds:

- `open_access_pdf`
- `figure_image`
- `table_xml`
- `supplement`
- `page_image`
- `other`

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `asset_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `asset_kind` | `TEXT` | |
| `source` | `TEXT` | preserve current live asset source contract |
| `source_release_id` | `TEXT` | |
| `asset_label` | `TEXT` | `Figure 2`, `Table 1` |
| `page_number` | `INTEGER` | nullable |
| `storage_path` | `TEXT` | local or remote |
| `remote_url` | `TEXT` | |
| `content_type` | `TEXT` | |
| `byte_size` | `BIGINT` | |
| `access_status` | `TEXT` | |
| `license` | `TEXT` | |
| `disclaimer` | `TEXT` | carry forward existing live column |
| `caption_text` | `TEXT` | |
| `section_path` | `TEXT[]` | |
| `metadata` | `JSONB` | |
| `created_at` | `TIMESTAMPTZ` | |

### 9. `solemd.paper_tables`

Structured table payloads.

Purpose:

- table-aware retrieval
- later normalized table analytics

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `table_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `asset_id` | `BIGINT FK -> paper_assets` | nullable |
| `caption_block_id` | `BIGINT FK -> paper_blocks` | nullable |
| `table_block_id` | `BIGINT FK -> paper_blocks` | nullable |
| `table_label` | `TEXT` | |
| `caption_text` | `TEXT` | |
| `table_xml` | `TEXT` | raw XML when available |
| `table_json` | `JSONB` | normalized rows / cells |
| `table_text` | `TEXT` | flattened searchable text |
| `row_count` | `INTEGER` | |
| `column_count` | `INTEGER` | |
| `metadata` | `JSONB` | |

### 10. `solemd.paper_figures`

Figure metadata and caption linkage.

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `figure_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `asset_id` | `BIGINT FK -> paper_assets` | nullable |
| `caption_block_id` | `BIGINT FK -> paper_blocks` | nullable |
| `figure_label` | `TEXT` | |
| `caption_text` | `TEXT` | |
| `metadata` | `JSONB` | |

### 11. `solemd.paper_entity_mentions`

Exact concept mentions.

Purpose:

- entity-aware filtering
- entity-aware reranking
- UI highlighting
- graph overlays

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `entity_mention_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `block_id` | `BIGINT FK -> paper_blocks` | |
| `sentence_id` | `BIGINT FK -> paper_sentences` | nullable |
| `section_id` | `BIGINT FK -> paper_sections` | nullable |
| `entity_type` | `TEXT` | gene, disease, chemical, etc. |
| `concept_id` | `TEXT` | normalized concept id |
| `canonical_name` | `TEXT` | preferred concept label |
| `mention_text` | `TEXT` | exact surface form |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `source_resource` | `TEXT` | PubTator/GNorm2/etc. |
| `is_negated` | `BOOLEAN` | nullable |
| `assertion_status` | `TEXT` | nullable |
| `temporal_status` | `TEXT` | nullable |
| `confidence` | `REAL` | nullable |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 12. `solemd.paper_relation_mentions`

Grounded relation mentions.

Purpose:

- relation-aware search
- relation overlays
- graph-based evidence expansion

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `relation_mention_id` | `BIGSERIAL PK` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `block_id` | `BIGINT FK -> paper_blocks` | |
| `sentence_id` | `BIGINT FK -> paper_sentences` | nullable |
| `subject_entity_mention_id` | `BIGINT FK -> paper_entity_mentions` | nullable |
| `object_entity_mention_id` | `BIGINT FK -> paper_entity_mentions` | nullable |
| `relation_type` | `TEXT` | |
| `relation_subtype` | `TEXT` | nullable |
| `confidence` | `REAL` | nullable |
| `metadata` | `JSONB` | |
| `source_document_source_id` | `BIGINT FK -> paper_document_sources` | |

### 13. Versioned chunking: `paper_chunk_versions`

Purpose:

- decouple chunk policy from canonical text
- support controlled retrieval experiments

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `chunk_version_id` | `BIGSERIAL PK` | |
| `name` | `TEXT` | e.g. `narrative_v1` |
| `description` | `TEXT` | |
| `tokenizer_name` | `TEXT` | model tokenizer used for limits |
| `target_token_min` | `INTEGER` | |
| `target_token_max` | `INTEGER` | |
| `chunk_policy` | `JSONB` | full chunking parameters |
| `is_active` | `BOOLEAN` | |
| `created_at` | `TIMESTAMPTZ` | |

### 14. Derived retrieval chunks: `paper_chunks`

Purpose:

- derived retrieval objects across policies
- support passage-level retrieval and graph evidence overlays

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `chunk_id` | `BIGSERIAL PK` | |
| `chunk_version_id` | `BIGINT FK -> paper_chunk_versions` | |
| `corpus_id` | `BIGINT FK -> paper_documents` | |
| `section_id` | `BIGINT FK -> paper_sections` | nullable |
| `chunk_index` | `INTEGER` | order within document for this version |
| `stable_chunk_id` | `TEXT` | content/span-addressed id |
| `chunk_kind` | `TEXT` | `narrative`, `caption`, `table_summary`, `abstract`, etc. |
| `chunk_header` | `TEXT` | micro-header |
| `section_canonical` | `TEXT` | |
| `section_path` | `TEXT[]` | |
| `start_char` | `INTEGER` | |
| `end_char` | `INTEGER` | |
| `chunk_text` | `TEXT` | |
| `char_count` | `INTEGER` | |
| `word_count` | `INTEGER` | |
| `token_count` | `INTEGER` | tokenizer-aware |
| `citation_count` | `INTEGER` | convenience |
| `entity_count` | `INTEGER` | convenience |
| `metadata` | `JSONB` | |

### 15. Chunk membership: `paper_chunk_members`

Purpose:

- preserve provenance from chunk back to canonical units

Recommended columns:

| Column | Type | Notes |
|---|---|---|
| `chunk_id` | `BIGINT FK -> paper_chunks` | |
| `member_kind` | `TEXT` | `block` or `sentence` |
| `member_id` | `BIGINT` | referenced id |
| `member_order` | `INTEGER` | |
| `PRIMARY KEY` | composite | `(chunk_id, member_kind, member_id)` |

## Source Precedence Rules

### Preferred text source

1. `s2orc_v2` full text when present and structurally parseable
2. BioCXML full text / rich passage text when present and `s2orc_v2` is absent or materially weaker
3. abstract-only fallback

### Preferred annotation source

1. BioCXML exact-offset annotations
2. PubTator tabular concept/relation enrichment projected onto abstract-only fallback
3. none

### Preferred citation source

1. `s2orc_v2` in-text `bib_ref` + bibliography matching
2. API / local bibliography enrichment as secondary reconciliation

Design rule:

- text and annotation source should be modeled separately
- a paper may have `s2orc_v2` as preferred text source and BioCXML as preferred annotation source

### Abstract-only fallback structure

Abstract-only papers remain first-class evidence objects.

Recommended structure:

- `paper_documents.document_text` = abstract
- `paper_documents.preferred_text_source` = `abstract_only`
- `paper_sections` contains one section with `section_canonical = 'abstract'`
- `paper_blocks` contains one block with `block_kind = 'abstract'`
- `paper_sentences` are generated with deterministic fallback sentence splitting
- `paper_entity_mentions` are projected from PubTator tabular mention strings where exact string matching is possible

For projected abstract-only mentions:

- `span_origin = 'derived'`
- `source_resource = 'pubtator_tabular_projected'`
- ambiguous string projections should remain inspectable in metadata rather than silently collapsed

## Parsing and Ingest Design

### A. `s2orc_v2` parser

Responsibilities:

- stream JSONL
- decode nested annotation JSON strings
- build canonical text and spans
- preserve section numbers
- build bibliography entry rows
- build in-text citation mention rows

Required resilience:

- tolerate missing sentence annotations
- generate deterministic fallback sentence boundaries when annotations are absent
- preserve whether sentence boundaries are source-native or fallback-generated
- use biomedical-aware sentence splitting so abbreviations, units, citations, and enumerations do not fragment evidence badly
- use `pySBD` as the default rule-based fallback sentence splitter
- compare `scispaCy` as an evaluation baseline rather than treating it as the default
- tolerate missing `matched_paper_id`
- tolerate noisy headers and multilingual metadata

### B. BioCXML parser

Responsibilities:

- stream tar members without unpacking whole archives
- parse passage types
- parse entity annotations and relations
- capture front matter and caption/table text
- align text spans to canonical document where possible

### C. Alignment layer

The alignment layer should connect:

- PMID / PMCID / DOI / corpusid
- BioC passage offsets to canonical text spans
- entity mentions to blocks/sentences/chunks
- reference mentions to bibliography entries and linked papers

Where exact alignment is not possible:

- keep source-local offsets
- retain provenance and expose that uncertainty in metadata

## Chunking Strategy

### Core rule

Chunks are derived retrieval products, not the source of truth.

### Narrative chunk policy

Use structure-aware adaptive chunking:

- respect section boundaries
- respect sentence boundaries
- preserve subsection cohesion
- create shorter chunks for high-information local evidence
- attach micro-headers

### Token budget

Dense retrieval chunks should be tokenizer-aware. The MedCPT article encoder
examples use `max_length = 512`, so dense chunk budgets should stay below that
window rather than using raw word-count heuristics alone.

Recommended starting policy:

- target range: roughly `220-350` words or equivalent tokenizer budget
- hard cap: stay within `~384-448` model tokens for dense retrieval payloads
- use neighboring chunk expansion during answer synthesis to recover larger context

### Chunk types

Chunk types should include:

- `narrative`
- `abstract`
- `figure_caption`
- `table_caption`
- `table_summary`
- `methods_focus`
- `results_focus`

### Micro-headers

Each chunk should store:

- a concise micro-header
- section canonical label
- full section path

These should be usable for:

- reranking
- display
- graph badges
- note export

## Retrieval Plane

### Retrieval units

The retrieval system should search across multiple evidence units:

- sentences
- blocks
- chunks
- captions
- table summaries
- abstracts

### Candidate generation

At query time, generate candidates in parallel from:

- dense sentence retrieval
- dense block / chunk retrieval
- sparse lexical retrieval
- entity-constrained retrieval
- citation-neighborhood expansion
- table / figure / caption retrieval

### Fusion

Combine candidate lists with:

- Reciprocal Rank Fusion as the default baseline
- learned fusion later if evaluations justify it

### Reranking

Use MedCPT Cross Encoder over top candidates.

Recommended model checkpoints:

- query encoder: `ncbi/MedCPT-Query-Encoder`
- article encoder: `ncbi/MedCPT-Article-Encoder`
- cross-encoder reranker: `ncbi/MedCPT-Cross-Encoder`

Version governance:

- pin exact model identifiers and major library versions in implementation configs
- treat throughput numbers as benchmark outputs, not fixed spec truth
- when upstream model or library releases change, require an explicit review prompt before upgrading
- upgrade only after benchmark comparison, relevance comparison, and rollback notes are recorded

Structured rerank features should include:

- dense score
- lexical score
- entity overlap
- relation match
- section prior
- evidence type prior
- citation connectedness
- citation intent priors when citation-context metadata is available
- cluster / graph relevance
- recency / year if required by query mode

### Evidence assembly

For each selected evidence item, assemble:

- best supporting sentence
- parent block
- neighboring blocks
- section path
- matched entities
- citation mentions
- bibliography entry
- linked paper metadata
- asset context

## Physical Storage and Indexing

### Canonical truth

Canonical truth remains in PostgreSQL.

Reasons:

- relational joins
- auditability
- release provenance
- easy API reads
- easy bulk ingest and checkpoints

### Retrieval plane

The retrieval plane should be treated as separate from canonical truth.

Target capabilities:

- dense vector search
- sparse lexical search
- payload filtering
- low-latency rerank candidate handoff

### Recommended backend decision

Use a split architecture:

1. PostgreSQL as canonical evidence warehouse
2. Qdrant as the production retrieval plane for sentence/block/chunk search
3. pgvector as a bounded baseline and validation path, not the primary sentence-scale serving layer

This is the recommended target state for the full evidence system.

### Retrieval plane bring-up sequence

The production target is Qdrant, but bring-up should be staged:

1. pgvector paper-level baseline on existing SPECTER2 graph papers
2. pgvector block-level MedCPT canary for recall and latency benchmarking
3. Qdrant `evidence_blocks` collection at block scale
4. Qdrant `evidence_sentences` collection at sentence scale

Interpretation:

- pgvector is the right early validation and benchmarking tool
- Qdrant is the intended production retrieval plane once evidence-serving scale moves beyond comfortable pgvector bounds

### Why Qdrant is the recommended retrieval plane

Qdrant is a better fit for sentence-scale biomedical evidence retrieval because it natively supports:

- dense vector retrieval
- sparse vector retrieval
- dense+sparse fusion via hybrid queries and `RRF`
- payload indexes for exact filters
- nested payload filters
- tenant/principal indexing optimizations
- quantization for large-scale memory reduction

Those capabilities align directly with the evidence system query shapes:

- semantic similarity + entity filters
- semantic similarity + section/modality filters
- lexical precision + semantic recall fusion
- sentence retrieval with citation/entity payload constraints

### Why pgvector partitioning is not the primary answer

pgvector remains valuable, but it should not be the main production answer for
hundreds of millions of sentence vectors.

Key reasons:

- approximate vector filtering in pgvector is still applied after index scanning, which can require larger `ef_search` or iterative scans to recover recall under selective filters
- PostgreSQL partitioning only helps when the query planner can prune to a small number of partitions
- entity-centric and evidence-centric queries often require many overlapping filters rather than one clean partition key
- partitioning helps operations and some coarse routing, but it does not solve sentence-scale vector footprint

At expected sentence scale, raw vector storage is already large before ANN overhead:

- `120M` sentence vectors at `768d`: about `343 GiB` in `float32`
- `156M` sentence vectors at `768d`: about `446 GiB` in `float32`
- `200M` sentence vectors at `768d`: about `572 GiB` in `float32`

Even if compressed to `halfvec`, the footprint is still large enough that the
retrieval engine choice materially affects feasibility.

### Postgres indexing requirements

For canonical evidence warehouse:

- B-tree on `corpus_id`, stable indices, and section ordering
- GIN / trigram / FTS where appropriate
- careful partitioning by source / release / target kind for very large tables

### When pgvector is still the right tool

Keep pgvector for:

- paper-level graph/search embeddings already living naturally in PostgreSQL
- early warehouse-local retrieval canaries
- block/chunk-scale experiments before sentence-scale serving is turned on
- exact evaluation baselines and warehouse-side debugging

### What partitioning means if pgvector is used

If a pgvector baseline is used for canaries or bounded serving, partitioning
should be understood narrowly:

- use `LIST`, `RANGE`, or `HASH` partitions on coarse operational dimensions
- expect each partition to carry its own ANN indexes
- rely on partition pruning only for filters that consistently narrow queries to a small subset
- avoid overpartitioning, because planning overhead rises when many partitions remain eligible

Useful partition keys if needed:

- retrieval granularity
- source kind
- publication year or year bands
- corpus tier

Poor primary partition keys:

- concept ids
- section labels with many combinations
- ad hoc runtime query facets

For pgvector baseline if used:

- use approximate indexing with partition-aware filtering and iterative scans where necessary
- use `halfvec` where recall tests permit
- create exact or partial indexes on high-value filter columns
- reserve dense sentence indexing as a distinct operational concern rather than assuming it belongs in one monolithic table/index

### Recommended Qdrant collection layout

Recommended starting collections:

- `evidence_sentences`
- `evidence_blocks`
- `evidence_captions` later if captions need independent serving characteristics

Preferred rule:

- one collection per retrieval granularity
- payload-driven filtering within a collection
- avoid one collection per entity, section, or source

Recommended Qdrant payload fields:

- `corpus_id`
- `paper_id` or local paper key
- `sentence_id` or `block_id`
- `section_canonical`
- `block_kind`
- `chunk_kind` if applicable
- `source_kind`
- `publication_year`
- `corpus_tier`
- `has_entity`
- `has_citation`
- `concept_ids`
- `matched_corpus_ids`
- `cluster_id` if graph-aware boosts are added

Notes:

- display policy remains canonical PostgreSQL/API logic rather than primary retrieval logic
- a coarse `display_policy` payload field may be added later if it materially improves serving efficiency, but rights/render policy should not be owned by the vector index

Recommended Qdrant search strategy:

- dense MedCPT retrieval
- sparse lexical retrieval
- `RRF` fusion
- cross-encoder reranking
- payload filters applied early
- quantization enabled after initial relevance baselines are stable

### Sparse retrieval strategy

Use a staged lexical path:

1. initial sparse retrieval from PostgreSQL FTS on evidence text
2. application-level fusion with dense Qdrant results via `RRF`
3. later migration to unified Qdrant dense+sparse serving if evaluation justifies the extra complexity

## Entity-Aware Evidence

### Why entity offsets matter

Entity presence is high-yield evidence in biomedical retrieval.

The system should support:

- hard filters:
  - "only evidence mentioning lithium"
  - "only blocks mentioning both BDNF and depression"
- soft boosts:
  - prefer evidence with matching concepts
- exact highlighting:
  - show mention spans inside returned prose
- graph overlays:
  - light up papers and evidence nodes by concept
- evidence faceting:
  - methods-only, results-only, disease-specific, chemical-specific

### Required representation

Do not rely on paper-level counts or chunk arrays alone.
Use exact mention-level rows in `paper_entity_mentions` and optional denormalized
chunk caches for convenience.

## Citation-Aware Evidence

### Citation mentions as first-class objects

In-text citation mentions should support:

- exact span highlighting
- sentence-level evidence grounding
- bibliography expansion
- cited-paper navigation
- graph citation chain visualization

### Why this matters

This is what turns the system from "retrieved text" into "inspectable evidence."
The user should be able to click from:

- answer claim
- supporting sentence
- in-text citation span
- bibliography entry
- cited paper
- graph neighborhood

## Tables and Figures

Tables and figures should not be treated as secondary leftovers.

### First-class evidence types

- `table_text`
- `table_caption`
- `figure_caption`
- later: normalized table row retrieval

### Retrieval behavior

Queries that imply:

- sample size
- hazard ratio
- confidence interval
- measurement panel
- adverse event frequency
- protocol / assay details

should explicitly search table and caption indexes.

## Cosmograph Engagement Model

### The graph is not just paper coordinates

It becomes a live evidence state machine.

### Core graph layers

1. **Paper layer**
   - current mapped literature graph
   - SPECTER2 / citation-informed layout

2. **Evidence overlay**
   - retrieved chunks / blocks / sentence anchors
   - dynamic, query-scoped, not necessarily permanently bundled

3. **Entity overlay**
   - concept-aware highlighting and filtering

4. **Citation overlay**
   - directed citation paths between papers
   - answer-specific citation illumination

5. **Relation overlay**
   - PubTator relation-driven connective tissue

### Query-time interactions

#### As-you-type semantic highlighting

- encode the query
- retrieve candidate papers/evidence
- glow nearby relevant papers
- pulse matching evidence overlays

#### Entity highlighting

- detect recognizable biomedical entities in the query
- highlight papers and evidence nodes containing those entities
- allow AND/OR concept filters

#### Answer streaming

As evidence is selected or the answer streams:

- cited papers light up
- supporting sentence/chunk nodes appear
- neighboring graph clusters can soften into view
- contradictory or adjacent evidence can be surfaced with alternate styles

### Evidence node design

Evidence nodes should be attachable to parent papers and display:

- evidence type
- section type
- support / contrast / related stance
- entity badges
- citation count / linkage

These can be:

- ephemeral runtime overlays
- or persisted evidence graph points for exemplar and hot-path usage

## Bundle and Read Model Strategy

### Hot bundle

Keep hot bundle contents minimal and filter-oriented:

- paper points
- clusters
- exemplars
- compact paper metadata
- compact entity summaries
- compact evidence summaries for faceting

### Warm bundle / read models

Potential warm tables:

- compact chunk previews
- representative evidence per cluster
- paper-level entity / relation summaries
- per-paper evidence counts by type and section

### Cold evidence

Fetch on demand:

- full block text
- full sentence text
- exact mention spans
- citation mention chains
- bibliography payloads
- table XML / JSON
- full annotation payloads

Design rule:

- do not push full text or large annotation payloads into the always-hot graph bundle

## API Surface

### Core evidence APIs

- `POST /evidence/query`
- `GET /evidence/paper/{paper_id}`
- `GET /evidence/block/{block_id}`
- `GET /evidence/sentence/{sentence_id}`
- `GET /evidence/chunk/{chunk_id}`
- `GET /evidence/neighborhood`
- `GET /evidence/assets/{asset_id}`

### Entity and relation APIs

- `GET /evidence/entities/search`
- `GET /evidence/entity/{concept_id}`
- `GET /evidence/relations/search`

### Writing / cite APIs

- `POST /evidence/cite`
- `POST /evidence/highlight`
- `POST /evidence/support-check`

### Response contract principle

APIs should return **structured evidence objects**, not flat text blobs.

Every evidence payload should be able to include:

- ids
- corpus / paper metadata
- exact text span
- section path
- entities
- citations
- linked references
- assets
- graph identifiers / cluster ids if relevant

## Query Workflows

### Ask workflow

1. User enters free-text question.
2. Query parser extracts:
   - semantic intent
   - entities
   - possible relation signals
   - likely section priors
   - evidence modality priors
3. Candidate retrieval runs across dense, sparse, entity, and graph channels.
4. Candidates are fused and reranked.
5. Evidence bundles are assembled.
6. Graph receives highlighted paper ids, evidence ids, and overlay metadata.
7. LLM synthesizes answer using selected evidence.
8. Answer citations remain clickable all the way down to sentence spans and bibliography.

### Cite / write workflow

1. User writes a sentence or paragraph in the editor.
2. The current draft span becomes the retrieval query.
3. The system returns:
   - supporting sentences
   - parent papers
   - methods/results context
   - confidence and support metadata
4. The user selects a citation.
5. The graph lights up the supporting papers and related evidence nodes.
6. Exact prose can be copied into notes or supporting evidence panels with provenance.

### Explore workflow

1. User types a term or entity.
2. Matching papers and evidence nodes light up immediately.
3. Filters can pivot to:
   - entity type
   - section type
   - evidence type
   - year
   - venue
4. The user can open exact evidence from graph interactions.

## Evaluation Plan

The evaluation harness should begin in Phase 0, before full-text evidence is live.

Recommended initial benchmark set:

- `50-100` gold questions
- paper-level preview retrieval baseline
- later block-level and sentence-level comparisons against the preview baseline

### Retrieval metrics

- sentence-level recall@k
- block-level recall@k
- evidence bundle precision@k
- citation-resolution rate
- entity-filter precision
- table/caption retrieval recall

### RAG metrics

- grounded answer precision
- unsupported statement rate
- citation faithfulness
- answer completeness
- evidence diversity

### Graph interaction metrics

- highlight latency
- evidence overlay latency
- answer-to-graph synchronization latency
- time-to-open supporting sentence

### Quality checks

- percentage of evidence items with exact offsets
- percentage of citation mentions resolved to bibliography entries
- percentage of bibliography entries matched to local papers
- section canonicalization accuracy
- entity mention alignment accuracy

## Implementation Workstreams

### Workstream A: Canonical evidence schema

Deliverables:

- migration set for canonical evidence warehouse tables
- updated schema docs
- storage strategy notes
- retrieval-plane contract notes for PostgreSQL canonical + Qdrant serving
- explicit reconciliation notes for evolving existing `paper_assets` and `paper_references`

### Workstream B: `s2orc_v2` parser and ingest

Deliverables:

- streaming parser
- release-aware checkpoints
- document / section / block / sentence / citation rows
- biomedical-aware sentence fallback when source sentence offsets are missing

### Workstream C: BioCXML parser and overlay alignment

Deliverables:

- passage / entity / relation / caption / table extraction
- alignment layer
- exact mention rows
- entity-aware retrieval payload derivation for downstream indexes

### Workstream D: Derived chunking and retrieval products

Deliverables:

- chunk versioning
- initial chunk policies
- sentence/block/chunk read models

### Workstream E: Retrieval plane

Deliverables:

- Qdrant collection definitions and ingest
- dense retrieval
- sparse retrieval
- entity-constrained retrieval
- reranker
- retrieval evaluation harness
- preview-evidence bridge retirement plan once evidence APIs supersede it

### Workstream F: Evidence APIs

Deliverables:

- evidence query endpoints
- paper / block / sentence / chunk detail endpoints
- cite workflow endpoints

### Workstream G: Graph integration

Deliverables:

- dynamic evidence overlay design
- graph highlight protocol
- answer-to-graph sync
- evidence-node interaction model

### Workstream H: Writing workflows

Deliverables:

- support retrieval from draft prose
- citation selection UI contract
- exact-prose export path

## Suggested Build Order

0. ship Phase 0 preview evidence using existing paper embeddings, citation contexts, and entity filters
1. finalize evidence schema
2. stand up the evaluation harness and gold-question baseline against Phase 0
3. finalize retrieval contracts for PostgreSQL canonical storage plus Qdrant serving
4. implement Phase 1a core text spine
5. ingest `s2orc_v2` into canonical document/section/block/sentence tables
6. ship deterministic biomedical-aware sentence fallback and sentence-quality checks
7. implement abstract-only fallback ingest for the dominant abstract-only population
8. run pgvector block-level MedCPT canary
9. implement Phase 1b citation and entity enrichment
10. overlay BioCXML entity/relation/caption/table information
11. project PubTator tabular entity mentions onto abstract-only texts where possible
12. stand up Qdrant block retrieval first, then sentence retrieval
13. build versioned chunks
14. stand up evidence APIs
15. build dense+sparse retrieval and reranking
16. integrate graph highlighting / evidence overlays
17. implement writing/cite workflows
18. evaluate and iterate on chunking/index policies

## Delivery Phasing Recommendation

The full target remains the 15-table evidence warehouse, but delivery should be
phased so the system becomes useful early without backing away from the final
architecture.

### Phase 0: Preview evidence

Ship first with existing data:

- paper-level retrieval from current embeddings
- citation-context preview evidence from `solemd.citations.contexts`
- citation-intent metadata from `solemd.citations.intents`
- entity-aware paper filters from `pubtator.entity_annotations`
- Ask UI and graph highlight wiring

Rationale:

- this gives a shippable preview path in days
- it validates the product loop before full-text ingest
- it becomes the baseline that block and sentence retrieval must beat

### Phase 1a: Core text spine

Ship first:

- `paper_documents`
- `paper_document_sources`
- `paper_sections`
- `paper_blocks`
- `paper_sentences`

Rationale:

- these tables validate text parsing, hierarchy, and sentence handling in isolation
- this keeps the first parsing deliverable focused and testable

### Phase 1b: Citation and entity enrichment

Add next:

- `paper_reference_entries`
- `paper_reference_mentions`
- `paper_entity_mentions`

Rationale:

- this adds citation grounding and entity-aware evidence without coupling it to first-pass text parsing
- entity mentions still land early enough to support real retrieval and highlighting

### Phase 2: Relation and asset enrichment

Add next:

- `paper_relation_mentions`
- `paper_assets`
- `paper_tables`
- `paper_figures`

Rationale:

- these enrich the evidence object and graph overlays
- table/figure retrieval is important, but it does not have to block the core prose-and-citation system

### Phase 3: Derived retrieval products

Add next:

- `paper_chunk_versions`
- `paper_chunks`
- `paper_chunk_members`

Rationale:

- chunks are important retrieval products, but they are derived from the canonical spine
- keeping them in Phase 3 reduces the risk of confusing derived artifacts with source-of-truth evidence

### Deferred rights/compliance workstream

This remains intentionally deferred, but the architectural hooks are part of v1:

- `display_policy` and `display_policy_reason` exist from day one
- license/access/disclaimer metadata is preserved and surfaced when present
- retrieval and storage do not assume that current UI display policy is permanent
- a later rights/compliance workstream can tighten rendering or export rules without forcing a schema rewrite or retrieval redesign

## Open Decisions

### Retrieval engine

The major architectural decision is now recommended:

- PostgreSQL is the canonical evidence warehouse
- Qdrant is the recommended production retrieval plane
- pgvector remains the bounded baseline and validation path

Open implementation details still remain:

- exact collection count and whether captions deserve their own collection
- when to enable quantization in production
- whether sentence retrieval is turned on only after block retrieval clears evaluation gates

### Evidence overlay persistence

Need to choose whether evidence nodes are:

- ephemeral at runtime only
- partially materialized for exemplars / hot evidence
- or fully persisted as graph points

### Table normalization depth

Need to choose whether v1 stores:

- raw XML + flattened text only
- or a normalized table cell model as well

## Incremental Refresh and Monthly Update Strategy

The evidence warehouse must support release-aware refreshes, not only first-pass ingest.

Recommended rules:

1. detect document changes via `canonical_text_hash`
2. reparse only changed `s2orc_v2` shards or records
3. re-run BioCXML overlays for changed source releases
4. project refreshed PubTator tabular mentions back onto abstract-only documents
5. use retrieval payload hashes to re-embed and re-upsert only changed rows
6. keep deletion tracking so retrieval-plane points can be removed when canonical rows disappear

## Risks

### 1. Overbuilding the hot path

Risk:

- trying to ship full evidence through Parquet bundles would bloat the graph path

Mitigation:

- keep hot bundle lean
- move rich evidence to APIs

### 2. Alignment ambiguity

Risk:

- BioCXML and `s2orc_v2` will not always align perfectly

Mitigation:

- retain source-local spans
- store confidence / provenance
- do not force false exactness

### 3. Retrieval sprawl

Risk:

- too many retrieval channels without evaluation discipline

Mitigation:

- establish a versioned evaluation harness
- ship with clear sentence/block/chunk baselines before adding more learned fusion

### 4. Citation chain complexity

Risk:

- bibliography entry resolution and in-text citation linkage may become messy across sources

Mitigation:

- keep bibliography entries and citation mentions as separate first-class tables
- preserve raw ids and matched ids side by side

## Explicit Non-Goals

This plan does not assume:

- bundle backward compatibility with the current preview-era `graph_chunk_details`
- keeping current detail panel contracts unchanged
- forcing all evidence serving through DuckDB bundle reads
- a one-table RAG design

## Immediate Deliverables From This Plan

1. treat the current `paper_chunks` placeholder as superseded by a structured evidence warehouse
2. create detailed migrations for:
   - `paper_documents`
   - `paper_document_sources`
   - `paper_sections`
   - `paper_blocks`
   - `paper_sentences`
   - `paper_reference_entries`
   - `paper_reference_mentions`
   - `paper_entity_mentions`
   - `paper_relation_mentions`
   - `paper_assets`
   - `paper_tables`
   - `paper_figures`
   - `paper_chunk_versions`
   - `paper_chunks`
   - `paper_chunk_members`
3. write ALTER-based reconciliation plans for existing `paper_assets` and `paper_references`
4. replace current placeholder graph/evidence APIs with evidence-native endpoints
5. define a graph highlight protocol for evidence-driven interaction
6. stand up retrieval evaluation before finalizing serving backend choices
7. define Qdrant collection schemas, payload fields, and ingest contracts alongside PostgreSQL DDL

## Detailed Spec

The detailed implementation spec now lives at:

- [full-evidence-system-schema-and-api-spec.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/full-evidence-system-schema-and-api-spec.md)

That document pins down:

- exact DDL
- indexes
- partitioning strategy
- API payloads
- graph highlight payloads
- retrieval index contracts
- chunk version naming conventions

## Sources

### Local repo references

- [docs/map/database.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/database.md#L431)
- [engine/app/graph/export_bundle.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/graph/export_bundle.py#L360)
- [features/graph/duckdb/session.ts](/home/workbench/SoleMD/SoleMD.Graph/features/graph/duckdb/session.ts#L819)
- [app/actions/graph.ts](/home/workbench/SoleMD/SoleMD.Graph/app/actions/graph.ts#L47)
- [engine/db/migrations/001_core_schema.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/001_core_schema.sql#L93)
- [engine/db/migrations/007_add_s2_metadata_and_related_tables.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/007_add_s2_metadata_and_related_tables.sql#L101)
- [engine/db/migrations/010_extend_citations_for_bulk_dataset.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/010_extend_citations_for_bulk_dataset.sql#L8)
- [engine/app/corpus/filter.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/filter.py#L628)
- [engine/app/corpus/enrich.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/enrich.py#L357)
- [docs/plans/release-aware-bulk-ingest-and-graph-roadmap.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/release-aware-bulk-ingest-and-graph-roadmap.md)
- [docs/plans/pubtator-bulk-dataset-audit.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/pubtator-bulk-dataset-audit.md)
- [docs/map/architecture.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/architecture.md#L214)

### External primary sources

- MedCPT paper: https://academic.oup.com/bioinformatics/article/39/11/btad651/7335842
- MedCPT repository: https://github.com/ncbi/MedCPT
- pySBD repository: https://github.com/nipunsadvilkar/pySBD
- scispaCy repository: https://github.com/allenai/scispacy
- LitSense 2.0: https://academic.oup.com/nar/article/53/W1/W361/8133630
- GUIDE-RAG review: https://academic.oup.com/jamia/article/32/4/605/7954485
- Comparative evaluation of adaptive chunking in clinical RAG: https://pmc.ncbi.nlm.nih.gov/articles/PMC12649634/
- PubTator 3.0 paper: https://pubmed.ncbi.nlm.nih.gov/38572754/
- S2ORC paper: https://aclanthology.org/2020.acl-main.447.pdf
- Semantic Scholar open data overview: https://www.semanticscholar.org/faq/open-data
- pgvector documentation: https://github.com/pgvector/pgvector
- PostgreSQL declarative partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html
- Qdrant indexing and payload indexes: https://qdrant.tech/documentation/concepts/indexing/
- Qdrant filtering: https://qdrant.tech/documentation/concepts/filtering/
- Qdrant hybrid queries: https://qdrant.tech/documentation/concepts/hybrid-queries/
- Qdrant quantization: https://qdrant.tech/documentation/guides/quantization/
