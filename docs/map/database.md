# Database Schema

> **Status**: Phase 1 tables implemented (`001_core_schema.sql` + `002_add_is_retracted.sql` + `003_add_corpus_tier.sql` + `004_candidate_tier_and_mapping.sql` + `004b_entity_rule.sql` + `004c_baseline_expansion_and_relation_rules.sql` + `004d_final_baseline_expansion.sql` + `004e_endocrine_metabolic_baseline.sql` + `005_add_s2_enrichment_tracking.sql` + `006_add_s2_embedding_tracking.sql` + `007_add_s2_metadata_and_related_tables.sql` + `008_add_s2_reference_tracking.sql`)
> **Port**: 5433 (Docker, `pgvector/pgvector:pg16`)
> **Extensions**: `vector` (pgvector), `pg_trgm` (trigram FTS)
> **Schemas**: `solemd` (application), `pubtator` (reference data)

---

## Phase 1 — Corpus + Loading (current)

### solemd.corpus

Authoritative membership: which papers are in our domain. Papers enter as `candidate` (broad candidate pool) and are promoted to `graph` for SPECTER2 embedding + Cosmograph visualization.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT PK | S2 corpus ID |
| pmid | INTEGER UNIQUE | Bridge to PubTator3 |
| doi | TEXT | External linking |
| pmc_id | TEXT | PubMed Central cross-ref |
| filter_reason | TEXT NOT NULL | 'journal_match', 'pattern_match', 'journal_and_vocab', 'vocab_entity_match' |
| corpus_tier | TEXT NOT NULL DEFAULT 'candidate' | 'candidate' (metadata only) or 'graph' (SPECTER2 + Cosmograph). CHECK constraint. Partial index on graph tier. |
| is_mapped | BOOLEAN NOT NULL DEFAULT false | Has SPECTER2 + UMAP coords |
| is_default_visible | BOOLEAN NOT NULL DEFAULT false | In baseline canvas load |
| created_at | TIMESTAMPTZ | |

**Tiered corpus**:
- **Candidate** (~11.32M live): remaining broad candidate pool after promotions. Metadata only. Cheap to store.
- **Graph** (~2.74M live): promoted papers for SPECTER2 embeddings and Cosmograph rendering. Includes core journals, venue rules, second-wave entity rules, respiratory bridge entities, clean endocrine/metabolic additions, and relation-gated toxicity families. Quality-filtered to ~2.60M via `graph_papers` view.

**State transitions** (columns track mapping pipeline progress):
```
candidate (default)
  → corpus_tier = 'graph'       promoted by journal match or venue_rule
  → is_mapped = true            SPECTER2 embedded + UMAP x/y computed
  → is_default_visible = true   in the baseline canvas load (Phase 2 subset of mapped graph)
```

### solemd.venue_rule

Venue-level promotion rules for adding specialty papers to graph tier. Papers in these venues get promoted to `graph` even if they only matched via vocab signal.

| Column | Type | Notes |
|--------|------|-------|
| venue_normalized | TEXT PK | Exact normalized venue string |
| rule_source | TEXT NOT NULL | 'nlm', 'pattern', 'manual_cl' |
| specialty | TEXT | 'critical_care', 'psycho_oncology', etc. |
| added_at | TIMESTAMPTZ | |

### solemd.entity_rule

Entity-based promotion rules for adding papers to graph tier based on PubTator3 annotations. Papers with matching entity annotations get promoted to `graph` if they pass the confidence + citation gate.

| Column | Type | Notes |
|--------|------|-------|
| entity_type | TEXT NOT NULL | Must match pubtator.entity_annotations.entity_type |
| concept_id | TEXT NOT NULL | Must match pubtator.entity_annotations.concept_id |
| canonical_name | TEXT NOT NULL | Human-readable name |
| rule_category | TEXT NOT NULL | 'behavior', 'neuropsych_disease', 'neurotransmitter_gene' |
| confidence | TEXT NOT NULL DEFAULT 'high' | 'high', 'moderate', 'requires_second_gate' |
| min_citation_count | INTEGER NOT NULL DEFAULT 0 | Citation floor for promotion |
| added_at | TIMESTAMPTZ | |
| | **PK** | (entity_type, concept_id) — composite, because gene IDs overlap with species |

**Confidence tiers**:
- **high/moderate**: promote if paper has entity annotation + passes citation gate
- **requires_second_gate**: promote only if paper ALSO has a high-confidence entity_rule match OR a treat/cause relation on the same PMID. Used for gene entities (BDNF, DAT, SERT, COMT, MAOA) to prevent noise from pure genetics papers.

**Seeds**: 39 live rules across 6 categories:
- behavior (14)
- neuropsych_disease (5)
- neurotransmitter_gene (5, second-gated)
- systemic_bridge (7)
- iatrogenic_syndrome (6)
- endocrine_metabolic (2)

The second-wave baseline expansion added delirium, agitation, catatonia, hallucinations, delusions, paranoia, encephalopathy, hepatic encephalopathy, uremia, hyponatremia, serotonin syndrome, neuroleptic malignant syndrome, extrapyramidal symptoms, drug-induced parkinsonism, QT prolongation, and torsades de pointes. The final pre-freeze expansions added hypoxia, respiratory insufficiency, acute lung injury, diabetic ketoacidosis, and myxedema. Narrow withdrawal and several broader endocrine concepts were audited but deferred because the current PubTator concept mappings are too noisy for concept_id-only promotion.

### solemd.relation_rule

Relation-gated promotion families for high-precision bridge papers. Current live use is baseline chemical-toxicity promotion; overlay-targeted families can be staged here later without immediate graph promotion.

| Column | Type | Notes |
|--------|------|-------|
| subject_type | TEXT NOT NULL | Currently `chemical` |
| relation_type | TEXT NOT NULL | Currently `cause` |
| object_type | TEXT NOT NULL | Currently `disease` |
| object_id | TEXT NOT NULL | PubTator disease concept id |
| canonical_name | TEXT NOT NULL | Human-readable syndrome/toxicity name |
| rule_category | TEXT NOT NULL | `metabolic_toxicity`, `hematologic_toxicity`, etc. |
| target_layer | TEXT NOT NULL DEFAULT 'baseline' | `baseline` promotes now; `overlay` is staged only |
| min_citation_count | INTEGER NOT NULL DEFAULT 0 | Citation floor |
| added_at | TIMESTAMPTZ | |

**Live seeds**: 16 baseline relation rules covering:
- metabolic toxicity: weight gain, metabolic syndrome, hyperglycemia
- cardiac toxicity: myocarditis
- hematologic toxicity: agranulocytosis, neutropenia
- GI toxicity: ileus
- neurologic toxicity: seizures
- renal toxicity: kidney injury, nephritis, acute kidney failure
- dermatologic toxicity: toxic epidermal necrolysis, Stevens-Johnson syndrome
- hepatic/pancreatic toxicity: pancreatitis, hepatitis, drug-induced liver injury

### solemd.graph_papers (VIEW)

Quality-filtered view of graph-tier papers for Phase 2 export (Parquet bundles, UMAP input, cluster labeling). NOT used by enrichment — enrichment targets all graph-tier papers to get SPECTER2 embeddings for everything. The quality filter gates what appears on the map.

Null-safe logic: `ANY(NULL)` returns NULL, so each filter clause guards with `IS NOT NULL`.

```sql
CREATE VIEW solemd.graph_papers AS
SELECT p.*, c.corpus_tier, c.filter_reason, c.is_mapped, c.is_default_visible
FROM solemd.papers p
JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
WHERE c.corpus_tier = 'graph'
  AND (p.year >= 1945 OR p.year IS NULL)
  AND NOT (
    (p.publication_types IS NULL OR CARDINALITY(p.publication_types) = 0)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'News' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'LettersAndComments' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 50
  )
  AND NOT (
    p.publication_types IS NOT NULL
    AND 'Editorial' = ANY(p.publication_types)
    AND COALESCE(p.citation_count, 0) < 20
  );
```

### solemd.papers

Rich metadata. Loaded from S2 bulk during filtering, enriched via batch API.

| Column | Type | Source | Notes |
|--------|------|--------|-------|
| corpus_id | BIGINT PK FK→corpus | S2 bulk | |
| title | TEXT NOT NULL | S2 bulk | |
| year | INTEGER | S2 bulk | Timeline, decade grouping |
| venue | TEXT | S2 bulk | Venue filter |
| journal_name | TEXT | S2 bulk | |
| publication_date | DATE | S2 bulk | Exact date for timeline |
| publication_types | TEXT[] | S2 bulk | Review, ClinicalTrial, etc. |
| fields_of_study | TEXT[] | S2 bulk | Medicine, Biology, Psychology |
| reference_count | INTEGER | S2 bulk | |
| citation_count | INTEGER | S2 bulk | Node size in Cosmograph |
| influential_citation_count | INTEGER | S2 bulk | Quality signal |
| is_open_access | BOOLEAN | S2 bulk | |
| s2_url | TEXT | S2 bulk | Link to S2 page |
| abstract | TEXT | Batch API | RAG, display, search |
| tldr | TEXT | Batch API | Quick preview on hover |
| embedding | vector(768) | Batch API | SPECTER2, for UMAP layout |
| text_availability | TEXT | Batch API | 'fulltext', 'abstract', 'none' |
| paper_id | TEXT | Batch API | S2 `paperId` hash |
| paper_external_ids | JSONB | Batch API | Canonical S2 external ID snapshot |
| publication_venue_id | TEXT FK→publication_venues | Batch API | Stable venue identity |
| journal_volume | TEXT | Batch API | |
| journal_issue | TEXT | Batch API | |
| journal_pages | TEXT | Batch API | |
| s2_full_checked_at | TIMESTAMPTZ | Migration 005 | Resume sentinel for full metadata enrichment |
| s2_embedding_checked_at | TIMESTAMPTZ | Migration 006 | Resume sentinel for embedding-only enrichment |
| s2_found | BOOLEAN | Migration 005 | Whether S2 returned a paper for this corpus_id |
| s2_full_release_id | TEXT | Migration 007 | Release-aware full metadata stamp |
| s2_embedding_release_id | TEXT | Migration 007 | Release-aware embedding stamp |
| s2_references_checked_at | TIMESTAMPTZ | Migration 008 | Resume sentinel for outgoing reference sync |
| s2_references_release_id | TEXT | Migration 008 | Release-aware outgoing reference stamp |
| is_retracted | BOOLEAN DEFAULT false | Migration 002 | Retraction flag (populated post-build via PubMed E-utilities) |
| created_at | TIMESTAMPTZ | | |
| updated_at | TIMESTAMPTZ | | |

Partial index: `idx_papers_retracted` on `(is_retracted) WHERE is_retracted = true` — sparse index, near-zero overhead until populated.

### solemd.publication_venues

Normalized S2 publication venue metadata. One row per `publicationVenue.id`.

| Column | Type | Notes |
|--------|------|-------|
| publication_venue_id | TEXT PK | Stable S2 venue id |
| name | TEXT NOT NULL | |
| venue_type | TEXT | journal, conference, etc. |
| issn | TEXT | |
| url | TEXT | |
| alternate_names | TEXT[] | |
| alternate_urls | TEXT[] | |
| source | TEXT | `semantic_scholar_graph_api` |
| last_seen_release_id | TEXT | |

### solemd.authors

Canonical S2 author snapshot keyed by `authorId`.

| Column | Type | Notes |
|--------|------|-------|
| author_id | TEXT PK | Stable S2 author id |
| name | TEXT NOT NULL | |
| external_ids | JSONB | ORCID / DBLP / other ids when provided |
| source | TEXT | `semantic_scholar_graph_api` |
| last_seen_release_id | TEXT | |

### solemd.paper_authors

Paper-specific author ordering and raw affiliation strings. This is the primary bridge into the future geo layer.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT FK→papers | |
| author_position | INTEGER | 1-based paper order |
| author_id | TEXT FK→authors | Nullable if S2 omits authorId |
| name | TEXT NOT NULL | Snapshot name as seen on this paper |
| affiliations | TEXT[] | Raw S2 affiliation strings |
| external_ids | JSONB | Snapshot of author external IDs |
| source_release_id | TEXT | |
| | **PK** | (`corpus_id`, `author_position`) |

### solemd.author_affiliations

One row per raw affiliation string per paper author. Later geo enrichment normalizes these into institution / ROR / lat-lng.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| author_position | INTEGER | |
| affiliation_index | INTEGER | 1-based within author |
| raw_affiliation | TEXT NOT NULL | |
| institution / department / city / region / country | TEXT | Filled by later geo enrichment |
| country_code | TEXT | |
| latitude / longitude | DOUBLE PRECISION | |
| ror_id | TEXT | |
| source_release_id | TEXT | |
| | **PK** | (`corpus_id`, `author_position`, `affiliation_index`) |

### solemd.paper_assets

External or mirrored paper assets. Currently used for `open_access_pdf` metadata from S2.

| Column | Type | Notes |
|--------|------|-------|
| asset_id | BIGSERIAL PK | |
| corpus_id | BIGINT FK→papers | |
| asset_kind | TEXT | `open_access_pdf`, later figures/tables/local mirrors |
| source | TEXT | |
| source_release_id | TEXT | |
| remote_url | TEXT | Publisher / PMC URL |
| storage_path | TEXT | Local or bucket mirror path when present |
| access_status | TEXT | S2 OA status, e.g. `GREEN` |
| license | TEXT | |
| disclaimer | TEXT | |
| metadata | JSONB | Full asset payload |

### solemd.paper_references

Outgoing S2 reference snapshot per paper. Richer bibliographic drill-down lives here; domain-domain graph links can be derived from it.

| Column | Type | Notes |
|--------|------|-------|
| reference_id | BIGSERIAL PK | |
| corpus_id | BIGINT FK→papers | Citing paper |
| reference_index | INTEGER | 1-based order within S2 reference list |
| referenced_paper_id | TEXT | S2 paper id when resolved |
| referenced_corpus_id | BIGINT FK→corpus | Domain join target when present |
| title | TEXT | |
| year | INTEGER | |
| external_ids | JSONB | Raw S2 external id payload |
| doi / pmid / pmcid / arxiv_id / acl_id / dblp_id / mag_id | TEXT | Extracted convenience columns |
| source_release_id | TEXT | |

### solemd.citations

Normalized domain-domain citation edges. Intended source for graph links and geo citation links. Usually built from `paper_references`.

| Column | Type | Notes |
|--------|------|-------|
| citing_corpus_id | BIGINT FK→corpus | Paper that cites |
| cited_corpus_id | BIGINT FK→corpus | Paper being cited |
| cited_paper_id | TEXT | Stable S2 paper id |
| source_release_id | TEXT | |
| | **PK** | (`citing_corpus_id`, `cited_corpus_id`) |

### solemd.load_history

ETL tracking for debugging and resume support.

| Column | Type |
|--------|------|
| id | SERIAL PK |
| operation | TEXT NOT NULL |
| source | TEXT |
| rows_processed | INTEGER |
| rows_loaded | INTEGER |
| status | TEXT |
| started_at | TIMESTAMPTZ |
| completed_at | TIMESTAMPTZ |
| error_message | TEXT |
| metadata | JSONB |

### pubtator.entity_annotations (UNLOGGED)

PubTator3 entities filtered to domain PMIDs. UNLOGGED — if lost, re-run filter.

| Column | Type | Notes |
|--------|------|-------|
| pmid | INTEGER NOT NULL | |
| entity_type | TEXT NOT NULL | gene, disease, chemical, species, mutation, cellline |
| concept_id | TEXT NOT NULL | MESH:D009461, Gene:1234, etc. |
| mentions | TEXT NOT NULL | Pipe-delimited mention strings |
| resource | TEXT NOT NULL | Default 'PubTator3' |

### pubtator.relations (UNLOGGED)

PubTator3 entity-entity relations filtered to domain PMIDs.

| Column | Type | Notes |
|--------|------|-------|
| pmid | INTEGER NOT NULL | |
| relation_type | TEXT NOT NULL | treat, associate, stimulate, inhibit, etc. |
| subject_type | TEXT NOT NULL | |
| subject_id | TEXT NOT NULL | |
| object_type | TEXT NOT NULL | |
| object_id | TEXT NOT NULL | |

---

## Phase 2 — Graph + Bundles (next)

### solemd.graph_runs

Published graph-build runs and bundle metadata consumed by the frontend.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Graph run identifier |
| graph_name | VARCHAR(128) | `cosmograph` for the baseline paper graph |
| node_kind | VARCHAR(64) | `corpus` for the current mapped-paper bundle |
| status | VARCHAR(32) | running, completed, failed |
| is_current | BOOLEAN | Which run the frontend should serve by default |
| bundle_uri | TEXT | Filesystem path to bundle directory |
| bundle_format | VARCHAR(32) | `parquet-manifest` |
| bundle_version | VARCHAR(32) | Bundle schema version |
| bundle_checksum | VARCHAR(128) | Manifest checksum used by the frontend asset routes |
| bundle_bytes | BIGINT | Total bundle size in bytes |
| bundle_manifest | JSONB | Table/file manifest |
| qa_summary | JSONB | Build QA counts and sanity checks |
| source_release_id | TEXT | Semantic Scholar bulk release used for metadata |
| embedding_release_id | TEXT | Release stamp for embeddings used in the map |
| citations_release_id | TEXT | Release stamp for citation-edge ingest |
| parameters | JSONB | Layout / clustering / export parameters |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

### solemd.graph

Mapped-paper coordinates and cluster assignments for a specific graph run.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK→graph_runs | |
| corpus_id | BIGINT FK→corpus | |
| point_index | INTEGER | Stable export order within the run |
| x | REAL NOT NULL | UMAP dimension 1 |
| y | REAL NOT NULL | UMAP dimension 2 |
| cluster_id | INTEGER | Macro Leiden community ID |
| micro_cluster_id | INTEGER | Optional later finer-grained cluster ID |
| cluster_probability | REAL | Optional confidence score |
| outlier_score | REAL | Optional outlier score |
| is_noise | BOOLEAN | Reserved for future noise labeling / pruning |

### solemd.graph_clusters

Cluster-level summaries and labels for a graph run.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK→graph_runs | |
| cluster_id | INTEGER | |
| label | TEXT | Lexical or later LLM label |
| label_mode | TEXT | lexical, llm, fixed, etc. |
| label_source | TEXT | provenance for the label |
| member_count | INTEGER | |
| paper_count | INTEGER | |
| centroid_x | REAL | |
| centroid_y | REAL | |
| representative_node_id | TEXT | Current representative point/node id |
| representative_node_kind | TEXT | `paper` for the current baseline |
| candidate_count | INTEGER | Placeholder for later label candidate tracking |
| mean_cluster_probability | REAL | Optional |
| mean_outlier_score | REAL | Optional |
| is_noise | BOOLEAN | |

### Citation Edge Population

`solemd.citations` now has the extra fields needed for the Semantic Scholar bulk
citations dataset and should be treated as the canonical graph-edge source.
`solemd.paper_references` remains the richer bibliography path for now.

Current plan:
- ingest bulk `citations` into `solemd.citations`
- retain API-side `paper_references` for richer per-paper bibliography snapshots
- export those edges into `corpus_links.parquet` and `geo_citation_links`

Current bulk-backed citation columns:

| Column | Type | Notes |
|--------|------|-------|
| citing_corpus_id | BIGINT FK→corpus | |
| cited_corpus_id | BIGINT FK→corpus | |
| cited_paper_id | TEXT | Retained for API-derived paths when present |
| citation_id | BIGINT | Bulk Semantic Scholar citation identifier |
| contexts | JSONB | Citation-context text snippets |
| intents | JSONB | Nested intent labels aligned to contexts |
| is_influential | BOOLEAN | Bulk influence flag |
| context_count | INTEGER | Convenience count of context snippets |
| source | TEXT | `semantic_scholar_citations_bulk` or API-derived source |
| source_release_id | TEXT | Bulk release / API release stamp |
| updated_at | TIMESTAMPTZ | |

---

## Phase 3 — RAG + Entity Layer (later)

### solemd.paper_chunks

Full-text chunks for RAG search. Source: S2ORC structured text.

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| corpus_id | BIGINT FK→papers | Parent paper |
| chunk_index | INTEGER | Order within paper |
| section_name | TEXT | intro, methods, results, discussion |
| chunk_text | TEXT NOT NULL | The actual text |
| embedding | vector(768) | MedCPT for semantic search |
| sentence_offsets | INTEGER[] | Byte offsets for sentence boundaries |
| token_count | INTEGER | |

### solemd.entities

Canonical entity records aggregated from PubTator mentions.

| Column | Type | Notes |
|--------|------|-------|
| concept_id | TEXT PK | MESH:D009461, Gene:1234 |
| entity_type | TEXT NOT NULL | gene, disease, chemical, etc. |
| canonical_name | TEXT NOT NULL | Preferred name |
| synonyms | TEXT[] | Alternative mention forms |
| embedding | vector(768) | SapBERT for entity-level search |
| paper_count | INTEGER | Number of domain papers mentioning this entity |

---

### Two Embedding Spaces, Two Purposes

| Embedding | Model | Dimension | Purpose |
|-----------|-------|-----------|---------|
| papers.embedding | SPECTER2 | 768 | Graph UMAP layout + @ autocomplete. Citation-aware — papers that cite each other cluster together. |
| paper_chunks.embedding | MedCPT | 768 | RAG search. Query-document architecture — question goes through query encoder, chunks through document encoder. |
| entities.embedding | SapBERT | 768 | Entity layer UMAP + entity similarity. Biomedical concept-aware — "dopamine" near "serotonin" near "norepinephrine". |

### Data Flow Summary

```
Three nested data layers:

  DATABASE UNIVERSE (14M papers)
    All papers with metadata. MedCPT retrieval index.
    └── MAPPED UNIVERSE (3-5M papers)
          SPECTER2 embedding + UMAP x/y (is_mapped = true)
          └── ACTIVE CANVAS (~2M papers at any time)
                Currently rendered in Cosmograph
                ├── BASELINE (Phase 2 subset, is_default_visible = true)
                └── Dynamic overlay from mapped universe

Pipeline:

S2 bulk download (51 GB)
  → DuckDB filters by venue + vocab → solemd.corpus + solemd.papers (~14M candidate)
  → SQL UPDATE promotes core journals → corpus_tier = 'graph'
  → venue_rule promotion → additional specialty papers to graph tier
  → entity_rule promotion → +634,793 live papers (2026-03-20)
  → relation_rule promotion → +87,108 live papers (2026-03-20)
  → graph_papers VIEW applies quality filters → ~2.60M live
  → S2 Batch API enriches graph-tier only → abstract, tldr, embedding, text_availability,
      publication venue metadata, author snapshots, OA PDF metadata

PubTator3 FTP (6 GB)
  → Stream-filter by ALL candidate PMIDs → pubtator.entity_annotations + pubtator.relations
  → (Full candidate pool loaded — preserves entity data for Phase 1.5 bridge analysis)

S2 bulk `citations`
  → solemd.citations (contexts, intents, influence, canonical domain edges)

S2 Batch API (references)
  → solemd.paper_references (richer bibliography snapshot, secondary path)

GPU UMAP + Leiden on papers.embedding (graph-tier only)
  → solemd.graph_runs
  → solemd.graph (x, y, cluster_id, optional micro-cluster / score fields)
  → solemd.graph_clusters
  → is_mapped = true, is_default_visible = true for baseline

Export:
  papers + graph + entity/relation counts + OA/text metadata → corpus_points.parquet
  graph cluster summaries → corpus_clusters.parquet
  graph cluster exemplars → corpus_cluster_exemplars.parquet
  paper detail rows → corpus_documents.parquet
  bulk citations → corpus_links.parquet
  → DuckDB-WASM in browser → Cosmograph renders
```
