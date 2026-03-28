# SoleMD.Graph Full Evidence System Enrichment, Schema, and API Spec

Status: Proposed detailed implementation spec  
Project: `SoleMD.Graph`  
Scope: canonical evidence warehouse, enrichment pipeline, retrieval contracts, Qdrant serving model, graph highlight protocol, and evidence APIs  
Target product posture: public nonprofit educational platform  
Supersedes: preview-era `paper_chunks`-only RAG thinking  
Companion document: [full-evidence-system-plan.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/full-evidence-system-plan.md)

## Why This Document Exists

The architecture plan establishes the target system. This document pins down the
implementation contract:

- exact table set
- exact column-level expectations
- exact retrieval-plane contract
- exact enrichment flow
- exact API payload shapes
- exact graph highlight payloads

This is the document to implement against.

## Locked Decisions

The following decisions are now treated as architectural defaults:

1. PostgreSQL is the canonical evidence warehouse.
2. Qdrant is the recommended production retrieval plane for sentence/block/chunk search.
3. pgvector remains useful for graph/paper embeddings, bounded canaries, and warehouse-local validation, but it is not the primary sentence-scale serving layer.
4. The system is built around canonical spans:
   - document
   - section
   - block
   - sentence
   - citation mention
   - entity mention
   - relation mention
   - asset
5. Retrieval units are derived products:
   - block
   - sentence
   - chunk
   - caption
   - table summary
6. Entity-aware retrieval is core, not deferred.
7. Citation mentions are first-class evidence objects.
8. The graph bundle stays lean; rich evidence is served through engine APIs.
9. The product target is a public nonprofit educational platform rather than a private-only personal tool.
10. Deployment guidance remains provider-agnostic and capability-based; US-based hosting is required, but no specific vendor is part of this spec.
11. The formal rights/compliance model is deferred to a later workstream, but display-policy plumbing and explanatory license/access metadata ship from day one.

## Non-Goals

This spec does not aim to:

- preserve current `graph_chunk_details` compatibility
- stuff full evidence into the DuckDB bundle
- make one monolithic `paper_chunks` table carry all evidence semantics
- force sentence/block embeddings into canonical PostgreSQL tables

## Rights-Aware Display Posture

The architecture must remain rights-aware from the beginning even though the
formal compliance model is intentionally deferred.

Operational rule:

- retrieval/storage and UI display are separate concerns
- canonical text remains available for retrieval, parsing, and indexing
- rendering is controlled through a placeholder `display_policy` contract that can tighten later without changing the evidence warehouse or retrieval plane

Initial `display_policy` values:

- `full`
- `partial`
- `metadata_only`
- `undecided`

Interpretation:

- these are operational rendering states, not final legal conclusions
- `undecided` is the correct default when the rights model has not yet been finalized
- when license/access metadata exists, APIs should surface it so the UI can explain why content is fully shown, partially shown, or withheld

Implementation rule:

- every evidence-facing API response should include display-policy fields and any present license/access/disclaimer metadata
- the absence of a finalized rights model is not a reason to omit the plumbing

## Reference Architecture

```text
Local bulk assets
  ├── Semantic Scholar metadata
  ├── Semantic Scholar citations
  ├── Semantic Scholar s2orc_v2
  ├── PubTator tabular
  └── PubTator BioCXML

        ↓ parse / align / normalize / enrich

Canonical evidence warehouse (PostgreSQL)
  ├── documents / sources
  ├── sections / blocks / sentences
  ├── bibliography entries / citation mentions
  ├── entity mentions / relation mentions
  ├── assets / tables / figures
  ├── chunk versions / chunks / chunk members
  └── retrieval index versions / sync state

        ↓ embed / payload-build / upsert

Retrieval plane (Qdrant)
  ├── evidence_blocks
  ├── evidence_sentences
  └── later: evidence_captions

        ↓ evidence APIs

Graph + Ask + Cite UI
  ├── paper highlights
  ├── evidence overlays
  ├── citation edges
  ├── entity overlays
  └── writing support panels
```

## Global Conventions

### 1. Offset semantics

All canonical spans use:

- `start_char` inclusive
- `end_char` exclusive
- offsets measured against `solemd.paper_documents.document_text`

If a source cannot be aligned cleanly to canonical text:

- retain source-local offsets in `metadata`
- set `span_origin = 'source_local'`
- do not fabricate false exactness

### 2. Span provenance

Every span-bearing row must record:

- `source_document_source_id`
- `span_origin`

Allowed `span_origin` values:

- `source_native`
- `aligned`
- `derived`
- `source_local`

### 3. Timestamp semantics

Every table should include:

- `created_at`
- `updated_at`

All timestamps use `TIMESTAMPTZ`.

### 4. Canonical text hash

`paper_documents.canonical_text_hash` is the SHA-256 of canonical document text.

Purpose:

- change detection
- stable derivation versioning
- reindex invalidation

### 5. Stable derived ids

Derived retrieval products should be content/span-addressed where possible.

Recommended `stable_chunk_id` formula:

```text
sha256(canonical_text_hash + ":" + chunk_kind + ":" + start_char + ":" + end_char + ":" + chunk_version_name)
```

### 6. Array and JSON usage

Use arrays for short denormalized convenience fields and JSONB only for:

- source-specific payloads
- uncertain or evolving metadata
- asset-specific structural payloads

Do not hide core relational structure inside JSONB.

## Source Precedence and Merge Rules

### Preferred text source

1. `s2orc_v2` full text when parseable
2. BioCXML passage/full text when `s2orc_v2` is absent or materially weaker
3. abstract-only fallback

### Preferred annotation source

1. BioCXML exact-offset annotations
2. PubTator tabular enrichment
3. none

### Preferred citation source

1. `s2orc_v2` body `bib_ref` + bibliography entry linkage
2. secondary reconciliation from identifiers and local crosswalks

### Merge rules

- Canonical text and canonical annotations are separate choices.
- A paper may use `s2orc_v2` for text and BioCXML for entities/captions/tables.
- All source contributions are preserved in `paper_document_sources`.
- If two sources disagree, canonical presentation follows precedence rules, but source disagreement remains inspectable in metadata.
- `pubtator.entity_annotations` and `pubtator.relations` remain source reference tables for corpus promotion and rule evaluation.
- `solemd.paper_entity_mentions` and `solemd.paper_relation_mentions` are evidence warehouse tables for retrieval and graph evidence.
- These coexist; the evidence warehouse does not replace the upstream `pubtator` tables.

### Abstract-only fallback contract

Abstract-only papers are still canonical evidence documents.

Required structure:

- `paper_documents.document_text` stores the abstract text
- `paper_documents.preferred_text_source = 'abstract_only'`
- one `paper_sections` row with `section_canonical = 'abstract'`
- one `paper_blocks` row with `block_kind = 'abstract'`
- `paper_sentences` created by deterministic fallback sentence splitting
- `paper_entity_mentions` projected from PubTator tabular mentions when exact string matching is possible

For projected abstract-only entity spans:

- `span_origin = 'derived'`
- `source_resource = 'pubtator_tabular_projected'`
- ambiguity remains inspectable in metadata rather than silently discarded

## PostgreSQL Schema Contract

The evidence warehouse is split into:

- core evidence spine
- enrichment tables
- derived retrieval products
- operational retrieval tracking

### Existing table reconciliation

The detailed evidence warehouse introduces richer contracts, but two physical tables already exist and are live:

- `solemd.paper_assets`
- `solemd.paper_references`

Implementation rule:

- initial migrations should evolve these tables with `ALTER TABLE`
- do not drop or recreate them while they are still serving active enrichment code paths
- logical names such as `paper_reference_entries` describe the intended contract, but the first migration pass should reconcile against the existing storage objects

### Core Evidence Spine

#### 1. `solemd.paper_documents`

```sql
CREATE TABLE solemd.paper_documents (
    corpus_id BIGINT PRIMARY KEY
        REFERENCES solemd.papers(corpus_id) ON DELETE CASCADE,
    preferred_text_source TEXT NOT NULL
        CHECK (preferred_text_source IN ('s2orc_v2', 'biocxml', 'abstract_only')),
    preferred_annotation_source TEXT NOT NULL
        CHECK (preferred_annotation_source IN ('biocxml', 'pubtator_tabular', 'none')),
    source_release_id TEXT,
    canonical_text_hash TEXT NOT NULL,
    document_text TEXT NOT NULL,
    text_length_chars INTEGER NOT NULL,
    text_length_words INTEGER NOT NULL,
    section_count INTEGER NOT NULL DEFAULT 0,
    block_count INTEGER NOT NULL DEFAULT 0,
    sentence_count INTEGER NOT NULL DEFAULT 0,
    reference_entry_count INTEGER NOT NULL DEFAULT 0,
    citation_mention_count INTEGER NOT NULL DEFAULT 0,
    entity_mention_count INTEGER NOT NULL DEFAULT 0,
    relation_mention_count INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER,
    table_count INTEGER NOT NULL DEFAULT 0,
    figure_count INTEGER NOT NULL DEFAULT 0,
    has_fulltext BOOLEAN NOT NULL DEFAULT FALSE,
    has_biocxml BOOLEAN NOT NULL DEFAULT FALSE,
    has_sentence_offsets BOOLEAN NOT NULL DEFAULT FALSE,
    has_citation_mentions BOOLEAN NOT NULL DEFAULT FALSE,
    has_entity_offsets BOOLEAN NOT NULL DEFAULT FALSE,
    display_policy TEXT NOT NULL DEFAULT 'undecided'
        CHECK (display_policy IN ('full', 'partial', 'metadata_only', 'undecided')),
    display_policy_reason TEXT,
    rights_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

- PK on `corpus_id`

Notes:

- `document_text` is the canonical retrieval/display text source.
- Retrieval vectors do not live here.
- `display_policy` is an operational rendering field rather than a frozen legal policy.
- `rights_metadata` should surface inspectable license/access/disclaimer metadata when present.

#### 2. `solemd.paper_document_sources`

```sql
CREATE TABLE solemd.paper_document_sources (
    document_source_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL
        CHECK (source_kind IN ('s2orc_v2', 'biocxml', 'abstract_only')),
    source_release_id TEXT NOT NULL,
    external_document_id TEXT,
    is_text_source BOOLEAN NOT NULL DEFAULT FALSE,
    is_annotation_source BOOLEAN NOT NULL DEFAULT FALSE,
    priority_rank INTEGER NOT NULL,
    raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, source_kind, source_release_id, external_document_id)
);
```

Indexes:

- `INDEX (corpus_id, priority_rank)`

#### 3. `solemd.paper_sections`

```sql
CREATE TABLE solemd.paper_sections (
    section_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    parent_section_id BIGINT
        REFERENCES solemd.paper_sections(section_id) ON DELETE CASCADE,
    section_index INTEGER NOT NULL,
    section_depth INTEGER NOT NULL,
    section_number TEXT,
    section_name_raw TEXT,
    section_name_normalized TEXT,
    section_canonical TEXT NOT NULL DEFAULT 'other',
    section_path TEXT[] NOT NULL DEFAULT '{}',
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    span_origin TEXT NOT NULL
        CHECK (span_origin IN ('source_native', 'aligned', 'derived', 'source_local')),
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, section_index),
    CHECK (start_char >= 0),
    CHECK (end_char > start_char)
);
```

Indexes:

- `INDEX (corpus_id, section_index)`
- `INDEX (corpus_id, section_canonical)`
- `GIN (section_path)`

#### 4. `solemd.paper_blocks`

```sql
CREATE TABLE solemd.paper_blocks (
    block_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    section_id BIGINT
        REFERENCES solemd.paper_sections(section_id) ON DELETE SET NULL,
    block_index INTEGER NOT NULL,
    block_kind TEXT NOT NULL
        CHECK (block_kind IN (
            'title',
            'abstract',
            'paragraph',
            'figure_caption',
            'table_caption',
            'table_text',
            'front_matter',
            'footnote',
            'other'
        )),
    block_label TEXT,
    source_block_id TEXT,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    span_origin TEXT NOT NULL
        CHECK (span_origin IN ('source_native', 'aligned', 'derived', 'source_local')),
    block_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    page_number INTEGER,
    section_path TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, block_index),
    CHECK (start_char >= 0),
    CHECK (end_char > start_char)
);
```

Indexes:

- `INDEX (corpus_id, block_index)`
- `INDEX (section_id, block_index)`
- `INDEX (corpus_id, block_kind)`
- `GIN (section_path)`

#### 5. `solemd.paper_sentences`

```sql
CREATE TABLE solemd.paper_sentences (
    sentence_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    block_id BIGINT NOT NULL
        REFERENCES solemd.paper_blocks(block_id) ON DELETE CASCADE,
    section_id BIGINT
        REFERENCES solemd.paper_sections(section_id) ON DELETE SET NULL,
    sentence_index INTEGER NOT NULL,
    block_sentence_index INTEGER NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    span_origin TEXT NOT NULL
        CHECK (span_origin IN ('source_native', 'aligned', 'derived', 'source_local')),
    boundary_source TEXT NOT NULL
        CHECK (boundary_source IN ('s2orc_v2', 'biocxml', 'fallback_rule_based')),
    sentence_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    has_citation_mention BOOLEAN NOT NULL DEFAULT FALSE,
    has_entity_mention BOOLEAN NOT NULL DEFAULT FALSE,
    has_relation_mention BOOLEAN NOT NULL DEFAULT FALSE,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, sentence_index),
    UNIQUE (block_id, block_sentence_index),
    CHECK (start_char >= 0),
    CHECK (end_char > start_char)
);
```

Indexes:

- `INDEX (corpus_id, sentence_index)`
- `INDEX (block_id, block_sentence_index)`
- `INDEX (corpus_id, has_citation_mention)`
- `INDEX (corpus_id, has_entity_mention)`

Sentence fallback rules:

- fallback is required when `s2orc_v2` sentence offsets are absent
- fallback boundaries must be deterministic
- `pySBD` is the default rule-based fallback splitter
- `scispaCy` should be evaluated as a comparison baseline rather than treated as the default
- fallback output must avoid splitting:
  - abbreviations
  - dosage units
  - decimal numbers
  - common citation patterns
  - section enumerations

#### 6. `solemd.paper_reference_entries`

Initial migration path:

- extend the existing `solemd.paper_references` table to satisfy this contract
- keep physical compatibility during the first migration wave
- introduce a renamed table or compatibility view later only if the extra churn is justified

```sql
CREATE TABLE solemd.paper_reference_entries (
    reference_entry_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    reference_index INTEGER NOT NULL,
    ref_id TEXT,
    start_char INTEGER,
    end_char INTEGER,
    raw_citation_text TEXT,
    title TEXT,
    authors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    venue TEXT,
    year INTEGER,
    doi TEXT,
    pmid TEXT,
    pmcid TEXT,
    arxiv_id TEXT,
    mag_id TEXT,
    matched_paper_id TEXT,
    matched_corpus_id BIGINT,
    match_confidence REAL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, reference_index)
);
```

Indexes:

- `INDEX (corpus_id, ref_id)`
- `INDEX (matched_corpus_id)`
- `INDEX (doi)`
- `INDEX (pmid)`
- `INDEX (pmcid)`

#### 7. `solemd.paper_reference_mentions`

```sql
CREATE TABLE solemd.paper_reference_mentions (
    reference_mention_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    block_id BIGINT NOT NULL
        REFERENCES solemd.paper_blocks(block_id) ON DELETE CASCADE,
    sentence_id BIGINT
        REFERENCES solemd.paper_sentences(sentence_id) ON DELETE SET NULL,
    ref_id TEXT,
    reference_entry_id BIGINT
        REFERENCES solemd.paper_reference_entries(reference_entry_id) ON DELETE SET NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    span_origin TEXT NOT NULL
        CHECK (span_origin IN ('source_native', 'aligned', 'derived', 'source_local')),
    surface_text TEXT NOT NULL,
    matched_paper_id TEXT,
    matched_corpus_id BIGINT,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (start_char >= 0),
    CHECK (end_char > start_char)
);
```

Indexes:

- `INDEX (corpus_id, sentence_id)`
- `INDEX (reference_entry_id)`
- `INDEX (matched_corpus_id)`
- `INDEX (block_id, start_char)`

#### 8. `solemd.paper_entity_mentions`

```sql
CREATE TABLE solemd.paper_entity_mentions (
    entity_mention_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    block_id BIGINT NOT NULL
        REFERENCES solemd.paper_blocks(block_id) ON DELETE CASCADE,
    sentence_id BIGINT
        REFERENCES solemd.paper_sentences(sentence_id) ON DELETE SET NULL,
    section_id BIGINT
        REFERENCES solemd.paper_sections(section_id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL,
    concept_namespace TEXT,
    concept_id TEXT,
    canonical_name TEXT,
    mention_text TEXT NOT NULL,
    normalized_text TEXT,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    span_origin TEXT NOT NULL
        CHECK (span_origin IN ('source_native', 'aligned', 'derived', 'source_local')),
    source_resource TEXT NOT NULL,
    is_negated BOOLEAN,
    assertion_status TEXT,
    temporal_status TEXT,
    confidence REAL,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (start_char >= 0),
    CHECK (end_char > start_char)
);
```

Indexes:

- `INDEX (corpus_id, concept_id)`
- `INDEX (sentence_id)`
- `INDEX (block_id, start_char)`
- `INDEX (entity_type)`
- `INDEX (source_resource)`

Notes:

- this table is required in Phase 1
- exact chunk-level entity filters are derived from this table, not the other way around

### Enrichment Tables

#### 9. `solemd.paper_relation_mentions`

```sql
CREATE TABLE solemd.paper_relation_mentions (
    relation_mention_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    block_id BIGINT NOT NULL
        REFERENCES solemd.paper_blocks(block_id) ON DELETE CASCADE,
    sentence_id BIGINT
        REFERENCES solemd.paper_sentences(sentence_id) ON DELETE SET NULL,
    subject_entity_mention_id BIGINT
        REFERENCES solemd.paper_entity_mentions(entity_mention_id) ON DELETE SET NULL,
    object_entity_mention_id BIGINT
        REFERENCES solemd.paper_entity_mentions(entity_mention_id) ON DELETE SET NULL,
    relation_type TEXT NOT NULL,
    relation_subtype TEXT,
    confidence REAL,
    source_document_source_id BIGINT NOT NULL
        REFERENCES solemd.paper_document_sources(document_source_id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

- `INDEX (corpus_id, relation_type)`
- `INDEX (sentence_id)`
- `INDEX (subject_entity_mention_id)`
- `INDEX (object_entity_mention_id)`

#### 10. `solemd.paper_assets`

```sql
CREATE TABLE solemd.paper_assets (
    asset_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    asset_kind TEXT NOT NULL
        CHECK (asset_kind IN (
            'open_access_pdf',
            'figure_image',
            'table_xml',
            'supplement',
            'page_image',
            'other'
        )),
    source TEXT NOT NULL,
    source_release_id TEXT,
    asset_label TEXT,
    page_number INTEGER,
    storage_path TEXT,
    remote_url TEXT,
    content_type TEXT,
    byte_size BIGINT,
    access_status TEXT,
    license TEXT,
    disclaimer TEXT,
    caption_text TEXT,
    section_path TEXT[] NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (corpus_id, asset_kind, source)
);
```

Indexes:

- `INDEX (corpus_id, asset_kind)`
- `INDEX (asset_label)`

Initial migration path:

- extend the existing `solemd.paper_assets` table with the added fields above
- preserve `source`, `source_release_id`, and `disclaimer` because they are already populated by the S2 enrichment path

#### 11. `solemd.paper_tables`

```sql
CREATE TABLE solemd.paper_tables (
    table_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    asset_id BIGINT
        REFERENCES solemd.paper_assets(asset_id) ON DELETE SET NULL,
    caption_block_id BIGINT
        REFERENCES solemd.paper_blocks(block_id) ON DELETE SET NULL,
    table_block_id BIGINT
        REFERENCES solemd.paper_blocks(block_id) ON DELETE SET NULL,
    table_label TEXT,
    caption_text TEXT,
    table_xml TEXT,
    table_json JSONB,
    table_text TEXT,
    row_count INTEGER,
    column_count INTEGER,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

- `INDEX (corpus_id, table_label)`
- `INDEX (caption_block_id)`

#### 12. `solemd.paper_figures`

```sql
CREATE TABLE solemd.paper_figures (
    figure_id BIGSERIAL PRIMARY KEY,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    asset_id BIGINT
        REFERENCES solemd.paper_assets(asset_id) ON DELETE SET NULL,
    caption_block_id BIGINT
        REFERENCES solemd.paper_blocks(block_id) ON DELETE SET NULL,
    figure_label TEXT,
    caption_text TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Indexes:

- `INDEX (corpus_id, figure_label)`
- `INDEX (caption_block_id)`

### Derived Retrieval Products

#### 13. `solemd.paper_chunk_versions`

```sql
CREATE TABLE solemd.paper_chunk_versions (
    chunk_version_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    tokenizer_name TEXT NOT NULL,
    target_token_min INTEGER NOT NULL,
    target_token_max INTEGER NOT NULL,
    chunk_policy JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 14. `solemd.paper_chunks`

```sql
CREATE TABLE solemd.paper_chunks (
    chunk_id BIGSERIAL PRIMARY KEY,
    chunk_version_id BIGINT NOT NULL
        REFERENCES solemd.paper_chunk_versions(chunk_version_id) ON DELETE CASCADE,
    corpus_id BIGINT NOT NULL
        REFERENCES solemd.paper_documents(corpus_id) ON DELETE CASCADE,
    section_id BIGINT
        REFERENCES solemd.paper_sections(section_id) ON DELETE SET NULL,
    chunk_index INTEGER NOT NULL,
    stable_chunk_id TEXT NOT NULL,
    chunk_kind TEXT NOT NULL,
    chunk_header TEXT,
    section_canonical TEXT,
    section_path TEXT[] NOT NULL DEFAULT '{}',
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    char_count INTEGER NOT NULL,
    word_count INTEGER NOT NULL,
    token_count INTEGER NOT NULL,
    citation_count INTEGER NOT NULL DEFAULT 0,
    entity_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (chunk_version_id, corpus_id, chunk_index),
    UNIQUE (chunk_version_id, stable_chunk_id)
);
```

Indexes:

- `INDEX (corpus_id, chunk_version_id)`
- `INDEX (chunk_kind)`
- `GIN (section_path)`

#### 15. `solemd.paper_chunk_members`

```sql
CREATE TABLE solemd.paper_chunk_members (
    chunk_id BIGINT NOT NULL
        REFERENCES solemd.paper_chunks(chunk_id) ON DELETE CASCADE,
    member_kind TEXT NOT NULL
        CHECK (member_kind IN ('block', 'sentence')),
    member_id BIGINT NOT NULL,
    member_order INTEGER NOT NULL,
    PRIMARY KEY (chunk_id, member_kind, member_id)
);
```

Indexes:

- `INDEX (member_kind, member_id)`

### Operational Retrieval Tracking

These are implementation tables, not domain-truth tables, but they are worth
adding because Qdrant serving introduces index/version state that should remain
auditable in PostgreSQL.

#### 16. `solemd.retrieval_index_versions`

```sql
CREATE TABLE solemd.retrieval_index_versions (
    retrieval_index_version_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    target_kind TEXT NOT NULL
        CHECK (target_kind IN ('block', 'sentence', 'chunk', 'caption')),
    collection_name TEXT NOT NULL,
    dense_model_name TEXT NOT NULL,
    sparse_model_name TEXT,
    reranker_model_name TEXT,
    quantization_kind TEXT,
    payload_contract JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### 17. `solemd.retrieval_sync_state`

```sql
CREATE TABLE solemd.retrieval_sync_state (
    retrieval_index_version_id BIGINT NOT NULL
        REFERENCES solemd.retrieval_index_versions(retrieval_index_version_id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL
        CHECK (target_kind IN ('block', 'sentence', 'chunk', 'caption')),
    target_id BIGINT NOT NULL,
    corpus_id BIGINT NOT NULL,
    payload_hash TEXT NOT NULL,
    dense_vector_hash TEXT,
    sparse_vector_hash TEXT,
    sync_status TEXT NOT NULL
        CHECK (sync_status IN ('pending', 'embedded', 'upserted', 'failed')),
    last_error TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (retrieval_index_version_id, target_kind, target_id)
);
```

Indexes:

- `INDEX (sync_status, retrieval_index_version_id)`
- `INDEX (corpus_id, target_kind)`

## Retrieval Text Contract

Canonical text is kept in PostgreSQL. Retrieval-serving text is derived.

### Block retrieval text

Recommended formula:

```text
retrieval_text = micro_header + "\n" + block_text
```

Where `micro_header` is built from:

- section canonical
- section path tail
- block label if present

### Sentence retrieval text

Recommended formula:

```text
retrieval_text = section_micro_header + "\n" + sentence_text
```

The goal is better semantic alignment without mutating canonical display text.

### Chunk retrieval text

Recommended formula:

```text
retrieval_text = chunk_header + "\n" + chunk_text
```

## Qdrant Contract

### Collections

Recommended collections:

1. `evidence_blocks`
2. `evidence_sentences`
3. later: `evidence_captions`

Design rule:

- one collection per retrieval granularity
- use payload filtering inside each collection
- do not create one collection per entity, year, source, or section

### Point IDs

Use PostgreSQL IDs directly because collections are separate:

- `block_id` for `evidence_blocks`
- `sentence_id` for `evidence_sentences`
- `chunk_id` or `block_id` for `evidence_captions`

### Named vectors

Target end-state:

- `dense_medcpt_v1`
- `sparse_lexical_v1`

Optional future vectors:

- `late_interaction_v1`

### Model pins and upgrade governance

Recommended default model pins:

- query encoder: `ncbi/MedCPT-Query-Encoder`
- article encoder: `ncbi/MedCPT-Article-Encoder`
- cross-encoder reranker: `ncbi/MedCPT-Cross-Encoder`

Serving assumptions:

- embedding dimensionality: `768`
- article/query encoder context window should be treated as `512` tokens for planning
- block embeddings should be evaluated first before sentence-scale rollout

Upgrade governance:

- pin exact model identifiers and major serving-library versions in config
- when upstream releases appear, require an explicit review prompt before upgrade
- upgrades must record benchmark deltas, relevance deltas, migration notes, and rollback path

### Initial serving path

Recommended bring-up sequence:

0. pgvector paper-level baseline on existing SPECTER2 graph papers
1. pgvector block-level MedCPT canary for recall and latency benchmarking
2. Qdrant dense block retrieval
3. Qdrant dense sentence retrieval
4. application-level fusion with PostgreSQL lexical retrieval if sparse vectors are not ready
5. migrate to Qdrant dense+sparse named-vector hybrid queries once sparse indexing is productionized

This keeps architecture aligned with the end-state without blocking on the first
lexical implementation detail.

### Payload contract

Each Qdrant point should carry lightweight denormalized payload only.

Do include:

- `corpus_id`
- `publication_year`
- `corpus_tier`
- `source_kind`
- `section_canonical`
- `section_path`
- `block_kind`
- `chunk_kind` if applicable
- `has_entity`
- `has_citation`
- `concept_ids`
- `matched_corpus_ids`
- `graph_cluster_id` if available
- `graph_umap_bucket` if useful later

Notes:

- display policy remains canonical PostgreSQL/API logic rather than primary retrieval logic
- a coarse `display_policy` payload field may be added later if serving pressure justifies it, but rights/render policy should not be owned by the vector index

Do not include:

- full article text
- full nested mention payloads
- large table XML blobs
- large annotation arrays

### Qdrant indexing recommendations

- create payload indexes on high-selectivity fields used in filters
- use tenant optimization only if a field truly behaves like a stable tenant partition
- use principal optimization only for a dominant range-like field such as year or timestamp if query patterns justify it
- enable scalar quantization after relevance baselines are established

### Qdrant filters expected in production

- entity concept filter
- section canonical filter
- evidence type filter
- corpus tier filter
- publication year range
- citation presence filter
- cited-paper target filter

### Sparse retrieval strategy

Use a staged lexical path:

1. initial sparse retrieval from PostgreSQL FTS on block and sentence text
2. application-level fusion with dense Qdrant results via `RRF`
3. later migration to unified Qdrant dense+sparse serving if evaluation justifies the added complexity

## Retrieval Behavior Contract

### Retrieval stages

1. Query parsing
2. Candidate generation
3. Fusion
4. Reranking
5. Evidence assembly
6. Graph overlay generation
7. LLM synthesis

### Query parsing output

```json
{
  "normalized_query": "lithium interstitial nephritis risk",
  "detected_entities": [
    {"concept_id": "MESH:D008094", "label": "Lithium"},
    {"concept_id": "MESH:D007674", "label": "Interstitial Nephritis"}
  ],
  "relation_hints": [],
  "section_priors": ["results", "discussion"],
  "evidence_type_priors": ["sentence", "block"],
  "year_filters": null
}
```

### Query parser implementation

Recommended tiered approach:

1. fast path: exact local trie or Aho-Corasick matching over curated biomedical mention strings and aliases
2. medium path: local biomedical NER fallback for entities not caught by the trie
3. rule-based section priors from query language, for example:
   - mechanism -> methods
   - mortality -> results
   - adverse -> discussion

Implementation note:

- the current `pubtator.entity_annotations` table stores mention strings, not canonical names
- the fast path should therefore be built from mention strings plus curated aliases rather than assuming a canonical-name column exists

### Candidate generation channels

- dense block search
- dense sentence search
- lexical block search
- lexical sentence search later if warranted
- entity-filtered dense search
- citation-neighborhood expansion
- table/caption retrieval when requested
- citation-context preview retrieval during Phase 0 bootstrap

### Fusion

Baseline:

- RRF across channels

### Reranking

Use MedCPT cross-encoder over top candidates.

Rerank features:

- dense score
- lexical score
- entity overlap
- relation match
- section prior
- evidence type prior
- citation connectedness
- citation intents when citation-context metadata is available
- graph relevance priors

### Evidence assembly rules

Every returned evidence item should be able to resolve to:

- exact sentence if available
- parent block
- neighboring blocks
- section path
- entity mentions
- citation mentions
- bibliography entries
- cited paper ids
- asset references

## API Contract

Global rule:

- every evidence-facing response should include a normalized `display` object whenever a paper or evidence item is returned
- the `display` object should expose `display_policy`, `display_policy_reason`, and any available license/access/disclaimer metadata
- this contract exists from day one even while the full rights/compliance model remains a later workstream

### `POST /evidence/query`

Purpose:

- unified ask/explore/cite retrieval endpoint

Request:

```json
{
  "query": "Does lithium cause interstitial nephritis?",
  "mode": "ask",
  "top_k": 10,
  "include_neighbors": true,
  "include_graph_overlay": true,
  "filters": {
    "entity_concept_ids": ["MESH:D008094", "MESH:D007674"],
    "section_canonical": ["results", "discussion"],
    "evidence_types": ["sentence", "block"],
    "year_min": 1990,
    "year_max": 2026,
    "has_citation": true
  }
}
```

Response:

```json
{
  "query_id": "evq_20260322_xxx",
  "parsed_query": {
    "normalized_query": "lithium interstitial nephritis",
    "detected_entities": [
      {"concept_id": "MESH:D008094", "label": "Lithium"},
      {"concept_id": "MESH:D007674", "label": "Interstitial Nephritis"}
    ]
  },
  "retrieval_version": {
    "dense_model": "medcpt-article-encoder-v1",
    "sparse_model": "sparse-lexical-v1",
    "reranker": "medcpt-cross-encoder-v1"
  },
  "results": [
    {
      "evidence_kind": "sentence",
      "score": 0.91,
      "sentence_id": 123,
      "block_id": 88,
      "corpus_id": 456,
      "paper": {
        "title": "Example paper",
        "year": 2018,
        "display": {
          "display_policy": "undecided",
          "display_policy_reason": "rights_model_pending",
          "access_status": "GREEN",
          "license": "CC-BY-4.0",
          "disclaimer": null
        }
      },
      "sentence_text": "Lithium therapy has been associated with chronic tubulointerstitial nephritis.",
      "block_text": "....",
      "section": {
        "canonical": "discussion",
        "path": ["Discussion"]
      },
      "entities": [
        {
          "entity_mention_id": 1,
          "concept_id": "MESH:D008094",
          "label": "Lithium",
          "start_char": 0,
          "end_char": 7
        }
      ],
      "citations": [
        {
          "reference_mention_id": 77,
          "surface_text": "[12]",
          "matched_corpus_id": 999
        }
      ],
      "display": {
        "display_policy": "undecided",
        "display_policy_reason": "rights_model_pending",
        "license": "CC-BY-4.0",
        "access_status": "GREEN",
        "disclaimer": null
      }
    }
  ],
  "graph_overlay": {
    "query_id": "evq_20260322_xxx",
    "paper_highlights": [],
    "evidence_highlights": [],
    "citation_edges": [],
    "entity_highlights": [],
    "cluster_highlights": []
  }
}
```

### `GET /evidence/paper/{corpus_id}`

Purpose:

- paper-level evidence summary and navigation

Response should include:

- document metadata
- display-policy and rights metadata
- section summary
- evidence counts by type
- top entities
- top cited targets
- available assets

### `GET /evidence/block/{block_id}`

Purpose:

- exact block detail

Response should include:

- `block_text`
- display-policy and rights metadata
- section info
- sentence children
- entity mentions
- citation mentions
- linked table/figure data if block is a caption or table text

### `GET /evidence/sentence/{sentence_id}`

Purpose:

- exact sentence detail

Response should include:

- `sentence_text`
- display-policy and rights metadata
- parent block
- previous/next sentence ids
- entity mentions
- citation mentions
- bibliography expansion

### `POST /evidence/cite`

Purpose:

- return candidate support for a draft sentence or paragraph

Request:

```json
{
  "draft_text": "Lithium exposure has been linked to chronic tubulointerstitial injury.",
  "top_k": 8,
  "filters": {
    "evidence_types": ["sentence", "block"],
    "has_citation": true
  }
}
```

Response should include:

- supporting evidence
- contrasting evidence
- confidence
- graph overlay payload

## Graph Highlight Protocol

The graph must be able to react to retrieval state without requiring the bundle
to contain all evidence rows.

### Payload shape

```json
{
  "query_id": "evq_20260322_xxx",
  "paper_highlights": [
    {
      "corpus_id": 456,
      "score": 0.91,
      "state": "primary_support",
      "reason_codes": ["dense_match", "entity_match", "citation_supported"]
    }
  ],
  "evidence_highlights": [
    {
      "evidence_kind": "sentence",
      "evidence_id": 123,
      "corpus_id": 456,
      "parent_block_id": 88,
      "score": 0.91,
      "state": "primary_support",
      "section_canonical": "discussion",
      "entity_concept_ids": ["MESH:D008094", "MESH:D007674"],
      "matched_corpus_ids": [999]
    }
  ],
  "citation_edges": [
    {
      "source_corpus_id": 456,
      "target_corpus_id": 999,
      "weight": 1.0,
      "state": "cited_by_support"
    }
  ],
  "entity_highlights": [
    {
      "concept_id": "MESH:D008094",
      "label": "Lithium",
      "score": 1.0
    }
  ],
  "cluster_highlights": [
    {
      "cluster_id": 17,
      "score": 0.72
    }
  ]
}
```

### Graph state semantics

Allowed evidence highlight states:

- `primary_support`
- `secondary_support`
- `related`
- `contrast`
- `citation_neighbor`
- `entity_match`

## Enrichment Pipeline Spec

### Phase 0 preview evidence

Before new warehouse tables are fully online, the system can ship a preview path
using existing data already present in the repo:

- paper-level semantic retrieval from existing paper embeddings
- citation-context evidence from `solemd.citations.contexts`
- citation-intent metadata from `solemd.citations.intents`
- entity-based paper filtering from `pubtator.entity_annotations`
- graph highlighting through the current Ask-mode path

Purpose:

- validate query -> retrieve -> display -> highlight early
- establish the first evaluation baseline
- create a preview path that later evidence APIs replace

Preview deliverables:

- `POST /evidence/preview/query`
- `GET /evidence/preview/paper/{corpus_id}`
- paper-level graph highlight payloads
- PromptBox integration

### Stage 1a: `s2orc_v2` core text parse

Outputs:

- `paper_documents`
- `paper_document_sources`
- `paper_sections`
- `paper_blocks`
- `paper_sentences`

Key rules:

- decode annotation JSON strings
- preserve section numbering
- generate fallback sentences when source sentences missing
- materialize abstract-only documents with canonical abstract section/block/sentence structure

### Stage 1b: citation and entity enrichment

Outputs:

- `paper_reference_entries`
- `paper_reference_mentions`
- `paper_entity_mentions`

Key rules:

- map body `bib_ref.ref_id` to bibliography entries
- project PubTator tabular mentions onto abstract-only documents when exact string matching is possible
- keep projected abstract-only mention spans marked as `derived`

### Stage 2: BioCXML overlay

Outputs:

- source rows in `paper_document_sources`
- caption/table/front-matter blocks when new evidence exists
- `paper_entity_mentions`
- `paper_relation_mentions`
- `paper_assets`
- `paper_tables`
- `paper_figures`

Key rules:

- align passages to canonical text when possible
- otherwise preserve source-local spans
- do not lose caption/table evidence because canonical text came from another source

### Stage 3: Derived retrieval products

Outputs:

- `paper_chunk_versions`
- `paper_chunks`
- `paper_chunk_members`

Key rules:

- chunks are versioned derivations
- blocks and sentences remain canonical

### Stage 4: Retrieval sync

Outputs:

- `retrieval_index_versions`
- `retrieval_sync_state`
- Qdrant collection rows

Key rules:

- block retrieval comes before sentence retrieval
- sentence retrieval activates only after quality and cost gates are acceptable
- sync is idempotent via payload/vector hashes

## Incremental Refresh and Monthly Update Contract

The evidence warehouse must support release-aware refreshes, not only first-pass ingest.

Required behavior:

1. compare `canonical_text_hash` before and after reparsing
2. reparse only changed `s2orc_v2` shards or records
3. rerun BioCXML overlays for changed releases
4. rerun PubTator tabular projection for abstract-only documents when mentions or source text change
5. use `retrieval_sync_state.payload_hash` to re-embed and re-upsert only changed retrieval rows
6. maintain deletion tracking so Qdrant point cleanup can mirror PostgreSQL deletes

## Chunk Policy Spec

### Default chunk version

Recommended initial version:

- `narrative_v1`

Recommended contract:

- target `220-350` words
- keep under `~384-448` retrieval tokens
- respect section and sentence boundaries
- start new chunk at hard section boundaries
- shorter chunks allowed for captions and result statements

### Specialized chunk versions

Planned:

- `abstract_v1`
- `methods_focus_v1`
- `results_focus_v1`
- `caption_v1`
- `table_summary_v1`

## Delivery Phasing

### Phase 0: Preview evidence

Required behavior:

- paper-level preview retrieval works end-to-end
- citation-context evidence is displayable
- graph can highlight retrieved papers

### Phase 1a: Core text spine

Required tables:

- `paper_documents`
- `paper_document_sources`
- `paper_sections`
- `paper_blocks`
- `paper_sentences`

Required behavior:

- exact prose retrieval substrate exists
- sentence fallback works deterministically
- abstract-only documents are materialized canonically

### Phase 1b: Citation and entity enrichment

Required tables:

- `paper_reference_entries`
- `paper_reference_mentions`
- `paper_entity_mentions`

Required behavior:

- citation spans exist
- entity filters exist
- abstract-only projected entity offsets exist where projection succeeds

### Phase 2: Asset and relation enrichment

Required tables:

- `paper_relation_mentions`
- `paper_assets`
- `paper_tables`
- `paper_figures`

### Phase 3: Derived retrieval products

Required tables:

- `paper_chunk_versions`
- `paper_chunks`
- `paper_chunk_members`

### Phase 4: Retrieval serving

Required operational tables:

- `retrieval_index_versions`
- `retrieval_sync_state`

Required collections:

- `evidence_blocks`
- `evidence_sentences`

## Acceptance Criteria

### Canonical evidence

- `>= 95%` of canonical span rows have valid `start_char` / `end_char`
- `>= 90%` of `s2orc_v2` papers with `bib_ref` produce linked `paper_reference_mentions`
- `>= 95%` of entity mentions with aligned spans bind to a `block_id`

### Retrieval

- block retrieval returns evidence with inspectable provenance
- sentence retrieval can be enabled independently of block retrieval
- entity filters work at exact evidence level
- graph overlay payload can be generated from every successful query

### Graph integration

- query results can light up papers, evidence overlays, and citation paths
- every highlighted evidence item is resolvable back to canonical PostgreSQL ids

## Implementation Order

0. ship Phase 0 preview evidence using current paper embeddings, citation contexts, and entity filters
1. create schema migrations for Phase 1a tables and existing-table reconciliation
2. implement `s2orc_v2` parser with `pySBD` fallback sentence boundary generation
3. materialize abstract-only canonical documents
4. run pgvector block-level MedCPT canary
5. create schema migrations for Phase 1b tables
6. implement citation enrichment and exact or derived entity offsets
7. implement BioCXML overlay and exact entity alignment
8. add Qdrant retrieval operational tables
9. stand up `evidence_blocks` collection
10. stand up `POST /evidence/query` and detail endpoints
11. add sentence collection and reranking
12. add chunk derivations and specialized evidence types
13. add graph overlay protocol and UI consumption

## Recommended Follow-On Documents

- `docs/plans/full-evidence-system-implementation-roadmap.md`
- `docs/plans/full-evidence-system-qdrant-collection-spec.md`
- `docs/plans/full-evidence-system-graph-overlay-spec.md`

## Sources

### Local repo references

- [full-evidence-system-plan.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/full-evidence-system-plan.md)
- [release-aware-bulk-ingest-and-graph-roadmap.md](/home/workbench/SoleMD/SoleMD.Graph/docs/plans/release-aware-bulk-ingest-and-graph-roadmap.md)
- [database.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/database.md#L431)
- [architecture.md](/home/workbench/SoleMD/SoleMD.Graph/docs/map/architecture.md#L214)
- [001_core_schema.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/001_core_schema.sql#L93)
- [007_add_s2_metadata_and_related_tables.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/007_add_s2_metadata_and_related_tables.sql#L101)
- [010_extend_citations_for_bulk_dataset.sql](/home/workbench/SoleMD/SoleMD.Graph/engine/db/migrations/010_extend_citations_for_bulk_dataset.sql#L8)
- [filter.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/filter.py#L628)
- [enrich.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/enrich.py#L357)
- [PromptBox.tsx](/home/workbench/SoleMD/SoleMD.Graph/features/graph/components/panels/PromptBox.tsx#L348)
- [graph.ts](/home/workbench/SoleMD/SoleMD.Graph/app/actions/graph.ts#L71)

### External references

- pgvector README: https://github.com/pgvector/pgvector
- PostgreSQL partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html
- Qdrant indexing: https://qdrant.tech/documentation/concepts/indexing/
- Qdrant filtering: https://qdrant.tech/documentation/concepts/filtering/
- Qdrant hybrid queries: https://qdrant.tech/documentation/concepts/hybrid-queries/
- Qdrant quantization: https://qdrant.tech/documentation/guides/quantization/
- MedCPT paper: https://academic.oup.com/bioinformatics/article/39/11/btad651/7335842
- MedCPT repository: https://github.com/ncbi/MedCPT
- pySBD repository: https://github.com/nipunsadvilkar/pySBD
- scispaCy repository: https://github.com/allenai/scispacy
- LitSense 2.0: https://academic.oup.com/nar/article/53/W1/W361/8133630
- PubTator 3.0: https://pubmed.ncbi.nlm.nih.gov/38572754/
