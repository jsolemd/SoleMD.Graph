# Database Schema

> **Status**: canonical graph-db schema for base admission, mapped canvas state, and evidence substrate
> **Local service contract**: see `.claude/skills/graph/references/runtime-infrastructure.md` for the pinned image tag, compose service name, and exposed local port
> **Extensions**: `vector` (pgvector), `pg_trgm` (trigram FTS), `pgcrypto` (UUID generation)
> **Schemas**: `solemd` (application), `pubtator` (reference data)

This document describes the target graph-db model used to build and publish the
living graph. The runtime contract is:

- `base_points` is the always-loaded scaffold
- `universe_points` is the mapped remainder available for later promotion
- `overlay_points` is the promoted subset currently active in the canvas
- `base_points` carries the exported dense `point_index` used for first paint
- `active_points` is the dense browser-facing union of base plus overlay
- `evidence_api` serves heavy retrieval and rich payloads

There is no compatibility layer here. Old pre-base terminology is intentionally
absent.

Browser runtime notes:

- browser DuckDB is an ephemeral analytical session over canonical Parquet bundle tables
- the runtime does not persist a browser-local DuckDB catalog file; base, universe, and evidence remain bundle/API artifacts
- startup autoload is explicitly `base` only; universe and evidence artifacts stay detached until a feature asks for them
- `base_points_canvas_web` and `universe_points_canvas_web` are projection views over Parquet, not eager browser-local copies
- `selected_point_indices`, `overlay_point_ids_by_producer`, and `overlay_point_ids`
  are the only mutable browser-local graph state
- `*_canvas_web` views are the Cosmograph-facing active point tables; they stay
  limited to render fields and other preindexed columns required for live
  canvas styling, not rich query/widget payloads
- narrow point parquet fields are limited to ids, coordinates, cluster/color
  columns, `display_label`, compact bibliographic metadata, compact summary
  metrics, `text_availability`, `semantic_groups_csv`,
  `relation_categories_csv`, `is_in_base`, and `base_rank`
- `current_points_canvas_web` / `current_points_web` / `current_paper_points_web`
  are the canonical browser-facing active aliases for summaries, search,
  selection resolution, and table pages; they point at base directly until
  overlay activation requires the active union
- filters, timeline, search, selection, table, and info widgets read the
  query-facing aliases, not `*_canvas_web`
- `base_points_web` and `base_points_canvas_web` must reuse the exported `point_index`
  directly instead of recomputing dense indices with runtime window functions
- when no overlay is active, the active aliases point directly at
  `base_points_canvas_web` and `base_paper_points_canvas_web`, so startup does
  not pay for an unnecessary active-union reindex
- when overlay is active, `active_points_canvas_web` appends only the promoted overlay rows
  after the base index range; the full base scaffold is not recopied into a local temp table

This is the optimization path we are committing to. We are not widening the
canvas path for convenience features before the corpus-only runtime foundation
is strong.

---

## Migration Inventory

All migrations live in `engine/db/migrations/`. Migrations 014-018 and 025
were superseded or never shipped; the canonical sequence skips those numbers.

| Migration | Purpose | Key Tables/Columns |
|-----------|---------|-------------------|
| 001 | Core schema creation | `solemd.corpus`, `solemd.papers`, `solemd.load_history`, `pubtator.entity_annotations`, `pubtator.relations` |
| 002 | Add retraction tracking | `papers.is_retracted` |
| 003 | Add layout_status column | `corpus.layout_status` (`candidate` / `mapped`) |
| 004 | Current-run flags, journal_rule, mapped_papers view | `corpus.is_in_current_map`, `corpus.is_in_current_base`, `solemd.journal_rule`, `solemd.clean_venue()`, `solemd.mapped_papers` view |
| 004b | Entity-based promotion rules | `solemd.entity_rule` -- behaviors, neuropsych diseases, neurotransmitter genes |
| 004c | Relation rules + base expansion | `solemd.relation_rule` -- chemical->cause toxicity families |
| 004d | Final pre-freeze base expansion | Respiratory bridge entities, final toxicity relations |
| 004e | Endocrine/metabolic base additions | DKA, myxedema entity rules |
| 005 | S2 enrichment tracking | `papers.s2_full_checked_at`, `papers.s2_found` |
| 006 | S2 embedding tracking | `papers.s2_embedding_checked_at` |
| 007 | S2 metadata + related tables | `papers.paper_id`, `papers.paper_external_ids`, `solemd.publication_venues`, `solemd.authors`, `solemd.paper_authors`, `solemd.author_affiliations`, `solemd.paper_assets`, `solemd.paper_citations` |
| 008 | S2 reference tracking | `papers.s2_references_checked_at`, `papers.s2_references_release_id` |
| 009 | Graph build tables | `solemd.graph_runs`, `solemd.graph_points`, `solemd.graph_clusters` |
| 010 | Citation enrichment history | Superseded by raw `s2_paper_reference_metrics_raw` plus mapped `paper_citations` |
| 011 | Bulk citation checkpoints | `solemd.bulk_citation_ingest_batches` |
| 012 | Canonical entity records | `solemd.entities` |
| 013 | PubTator tables set LOGGED | Convert `pubtator.*` from UNLOGGED -> LOGGED (fix for 342M row loss) |
| 019 | Simplify base admission naming | Rename corpus_tier->layout_status, is_default_visible->is_in_current_base; create `solemd.base_journal_family`, `solemd.base_policy`; normalize journal families; drop legacy visibility tables |
| 020 | Paper evidence summary | `solemd.paper_evidence_summary` -- durable per-paper evidence for restartable base admission |
| 021 | Refine base admission terms | Rename is_direct_evidence->has_rule_evidence, is_journal_base->has_curated_journal_family, base_source->base_reason; activate curated_base_v2 policy |
| 022 | Schema hygiene | Rename index, add column comments for graph_base_features |
| 023 | Vocab terms table | `solemd.vocab_terms` -- load 3,361 curated terms from TSV |
| 024 | Psychiatric entity rules from vocab | Generate 572 entity_rules from enriched vocab_terms; add psychiatric treatment relation_rules; add mid-tier journal_rules |
| 026 | Cluster hierarchy | `graph_clusters.description` (parent_cluster_id, parent_label, hierarchy_level removed in 042) |
| 027a | Graph base points table | `solemd.graph_base_points` -- lean INSERT-only base admission table; drop `graph_points.is_in_base` and `graph_points.base_rank` |
| 027b | Entity rule confidence gates | Downgrade broad metabolic/biochemistry terms and non-psychiatric meds to `requires_second_gate`; delete "disorder" non-diagnosis |
| 028 | RAG canonical core | `solemd.paper_documents`, `solemd.paper_document_sources`, `solemd.paper_sections` |
| 029 | RAG canonical spans + mentions | `solemd.paper_blocks`, `solemd.paper_sentences`, `solemd.paper_citation_mentions`, `solemd.paper_entity_mentions` (all hash-partitioned x16) |
| 030 | Continuous base scoring | `paper_evidence_summary.entity_rule_families`, `.entity_rule_count`, `.entity_core_families`; update base policy target to 500K |
| 043 | Journal family score multiplier | `base_journal_family.score_multiplier`, `paper_evidence_summary.journal_score_multiplier`; add `penalized` family_type; data-driven scoring replaces hardcoded flagship keys |
| 044 | Papers table rebuild -- stored fts_vector + index optimization | CTAS+swap rebuild: add `papers.fts_vector` (stored tsvector), drop 6 redundant indexes (GIN trgm, citation_count, year, venue, fos, pub_types -- 9 GB saved), add missing `s2_references_checked_at` partial index, zero-bloat foundation (101 GB -> 65 GB) |

---

## Canonical Table Set

### `solemd.corpus`

Authoritative domain membership. A paper enters the corpus if it meets the
domain filter, then remains eligible for mapping, base admission, or later
overlay promotion.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT PK | Stable internal paper id |
| pmid | INTEGER UNIQUE | PubMed id, link to PubTator3 |
| doi | TEXT | External linking |
| pmc_id | TEXT | PubMed Central cross-reference |
| admission_reason | TEXT NOT NULL | Why the paper entered the corpus; e.g. `journal_and_vocab`, `vocab_entity_match`, or other corpus-admission paths |
| layout_status | TEXT NOT NULL DEFAULT 'candidate' | `candidate` or `mapped` -- whether the paper has been promoted into the coordinate universe |
| is_in_current_map | BOOLEAN NOT NULL DEFAULT false | True once the paper is present in the current published graph run |
| is_in_current_base | BOOLEAN NOT NULL DEFAULT false | True once the paper is admitted into the current published `base_points` scaffold |
| created_at | TIMESTAMPTZ | |

### `solemd.papers`

Canonical paper metadata. This table stores the stable bibliographic and
retrieval fields used across the graph, bundle, and evidence layers.

Typical columns:

- `corpus_id`
- `title`
- `year`
- `venue`
- `journal_name`
- `publication_date`
- `publication_types`
- `fields_of_study`
- `reference_count`
- `citation_count`
- `influential_citation_count`
- `is_open_access`
- `s2_url`
- `abstract`
- `tldr`
- `embedding`
- `text_availability`
- `paper_id`
- `paper_external_ids`
- `publication_venue_id`
- `journal_volume`
- `journal_issue`
- `journal_pages`
- `is_retracted`
- `s2_full_checked_at`
- `s2_found`
- `s2_embedding_checked_at`
- `s2_full_release_id`
- `s2_embedding_release_id`
- `s2_references_checked_at`
- `s2_references_release_id`
- `fts_vector` -- stored tsvector: `setweight(title, 'A') || setweight(abstract, 'B')`, auto-maintained by trigger on INSERT/UPDATE OF title, abstract
- `created_at`
- `updated_at`

#### Papers index strategy (post migration 044)

13 indexes optimized for the three hot paths: RAG retrieval, graph build, and
S2 ingestion. 6 redundant indexes were dropped (GIN trgm duplicating GiST,
btree on columns never filtered). Total index footprint: ~33 GB (was 41 GB).

| Index | Type | Purpose |
|-------|------|---------|
| `papers_pkey` | btree | PK -- every JOIN, UPDATE, UPSERT |
| `idx_papers_paper_id` | btree unique | S2 paper_id dedup on enrichment |
| `idx_papers_lower_title` | btree | Exact/prefix title matching (RAG fast-path) |
| `idx_papers_normalized_title_key` | btree | Exact/prefix normalized title matching |
| `idx_papers_title_gist_trgm` | GiST | KNN title similarity (`<<->`) + containment (`%%`) |
| `idx_papers_normalized_title_key_gist_trgm` | GiST | KNN normalized title similarity (`<<<->`) |
| `idx_papers_title_fts` | GIN | Title-only phrase search |
| `idx_papers_fts_vector` | GIN | Stored title+abstract FTS (fastupdate=off) |
| `idx_papers_embedding_hnsw` | HNSW | Vector cosine similarity (768-dim SPECTER2) |
| `idx_papers_s2_full_checked_at` | btree partial | Find un-enriched papers (IS NULL) |
| `idx_papers_s2_embedding_checked_at` | btree partial | Find un-embedded papers (IS NULL) |
| `idx_papers_s2_references_checked_at` | btree partial | Find un-referenced papers (IS NULL) |
| `idx_papers_retracted` | btree partial | Filter retracted papers |

The `fts_vector` column is auto-maintained by `trg_papers_fts_vector` (BEFORE
INSERT OR UPDATE OF title, abstract). The trigger only fires when title or
abstract changes -- embedding-only or metadata-only updates skip it.

### `solemd.load_history`

ETL operations log for debugging and resume support.

| Column | Type | Notes |
|--------|------|-------|
| id | SERIAL PK | |
| operation | TEXT NOT NULL | `filter_papers`, `filter_pubtator`, `batch_api`, etc. |
| source | TEXT | Filename or API endpoint |
| rows_processed | INTEGER DEFAULT 0 | |
| rows_loaded | INTEGER DEFAULT 0 | |
| status | TEXT NOT NULL DEFAULT 'running' | |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| error_message | TEXT | |
| metadata | JSONB | |

### `solemd.base_policy`

Single active policy record for base admission. This is the source of truth for
which rule sets are active when a new graph run is built.

| Column | Type | Notes |
|--------|------|-------|
| policy_version | TEXT PK | Human-readable version string |
| description | TEXT | Summary of the active base admission policy |
| target_base_count | INTEGER NOT NULL DEFAULT `500000` | Desired first-paint size (updated by migration 030) |
| is_active | BOOLEAN NOT NULL DEFAULT false | At most one active row |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `solemd.base_journal_family`

Curated family definitions for journals used by base admission and audit.

| Column | Type | Notes |
|--------|------|-------|
| family_key | TEXT PK | Stable family identifier |
| family_label | TEXT NOT NULL | Human-readable family name |
| family_type | TEXT NOT NULL | `general_flagship`, `domain_flagship`, `domain_base`, `organ_overlap`, `specialty`, or `penalized` |
| include_in_base | BOOLEAN NOT NULL DEFAULT true | Whether the family remains available to the active base policy |
| score_multiplier | REAL NOT NULL DEFAULT 1.0 | Domain score multiplier: flagship=1.5, penalized=0.3, default=1.0. Read by the scoring formula -- no Python code changes needed for adjustments. |
| description | TEXT | Human-readable rationale |
| added_at | TIMESTAMPTZ | |

### `solemd.journal_rule`

Venue-to-family mapping table. A normalized venue can participate in one or
more base journal families.

| Column | Type | Notes |
|--------|------|-------|
| venue_normalized | TEXT PK | Canonical normalized journal string |
| family_key | TEXT NOT NULL | References `solemd.base_journal_family.family_key` |
| include_in_corpus | BOOLEAN NOT NULL DEFAULT true | Whether this venue remains part of the domain corpus |
| rule_source | TEXT NOT NULL | `nlm`, `pattern`, `manual_cl`, or `curated` |
| added_at | TIMESTAMPTZ | |

### `solemd.vocab_terms`

Curated psychiatric/neurological vocabulary loaded from `data/vocab_terms.tsv`
(3,361 terms with UMLS CUIs). Enriched with MeSH crosswalks and PubTator paper
counts by `engine/scripts/enrich_vocab_terms.py`. Source of truth for entity_rule
generation (migration 024).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Stable term identifier |
| canonical_name | TEXT NOT NULL | Human-readable term name |
| category | TEXT NOT NULL | e.g. `clinical.diagnosis`, `intervention.pharmacologic` |
| umls_cui | TEXT | UMLS Concept Unique Identifier |
| rxnorm_cui | TEXT | RxNorm identifier (medications) |
| semantic_types | TEXT[] | UMLS semantic type codes |
| semantic_groups | TEXT[] | UMLS semantic group codes |
| organ_systems | TEXT[] | e.g. `{psychiatric}`, `{neurological}`, `{cardiovascular}` |
| mesh_id | TEXT | MeSH descriptor UI from UMLS crosswalk |
| pubtator_entity_type | TEXT | Mapped PubTator type: `disease`, `chemical`, or `gene` |
| entity_rule_family | TEXT | Assigned family_key for rule generation |
| pubtator_paper_count | INTEGER | PubTator paper count for this MeSH concept |

### `solemd.entity_rule`

Entity-driven base admission rules. 572 rules across 14 domain-specific families,
generated from `vocab_terms` (migration 024) plus 39 original C-L overlap rules.
Broad medical entities (`cl_disorder`, `clinical_symptom`) are excluded -- those
conditions span all of medicine and belong in the universe layer.

| Column | Type | Notes |
|--------|------|-------|
| entity_type | TEXT NOT NULL | PubTator3 entity type (`disease`, `chemical`, `gene`) |
| concept_id | TEXT NOT NULL | PubTator3 concept id (e.g. `MESH:D012559`) |
| canonical_name | TEXT NOT NULL | Human-readable concept name |
| family_key | TEXT NOT NULL | Domain family (see family table below) |
| confidence | TEXT NOT NULL | `high`, `moderate`, or `requires_second_gate` |
| min_citation_count | INTEGER NOT NULL DEFAULT 0 | Citation floor (5-20 scaled by prevalence) |
| added_at | TIMESTAMPTZ | |
| **PK** | (`entity_type`, `concept_id`) | |

**Confidence gates** (migration 027b): Broad metabolic/biochemistry terms
(lipids, glucose, cholesterol, etc.), non-psychiatric medications
(immunosuppressants, antibiotics, chemo), and brain tumors are set to
`requires_second_gate`. They contribute to paper_entity_count (scoring) but do
not drive base admission alone -- the paper must also have a high-confidence
entity match or >=100 citations.

**Domain families** (14):

| Family | Rules | Examples |
|--------|-------|---------|
| `psychiatric_medication` | 183 | Haloperidol, lithium, SSRIs, clozapine |
| `neurological_disorder` | 129 | Alzheimer's, Parkinson's, MS, epilepsy |
| `psychiatric_disorder` | 82 | Schizophrenia, MDD, bipolar, PTSD, OCD |
| `drug_class` | 47 | SSRIs, antipsychotics, benzodiazepines |
| `neurotransmitter_system` | 45 | Dopamine, serotonin, GABA, glutamate |
| `neuropsych_symptom` | 29 | Anhedonia, psychomotor retardation |
| `biomarker` | 17 | Cortisol, BDNF protein |
| `behavior` | 14 | Aggression, catatonia, delirium |
| `systemic_bridge` | 7 | Encephalopathy, hyponatremia |
| `iatrogenic_syndrome` | 6 | NMS, serotonin syndrome, EPS |
| `neuropsych_disease` | 5 | FTD, akathisia, PNES |
| `neurotransmitter_gene` | 5 | BDNF, COMT, MAOA |
| `endocrine_metabolic` | 2 | DKA, myxedema |
| `psychiatric_gene` | 1 | FKBP5 |

### `solemd.relation_rule`

Relation-driven base admission rules for high-precision cross-domain overlap.

| Column | Type | Notes |
|--------|------|-------|
| subject_type | TEXT NOT NULL | Usually `chemical` |
| relation_type | TEXT NOT NULL | Usually `cause`, `associate`, `treat`, etc. |
| object_type | TEXT NOT NULL | Usually `disease` |
| object_id | TEXT NOT NULL | PubTator3 concept id |
| canonical_name | TEXT NOT NULL | Human-readable overlap name |
| family_key | TEXT | Optional family key for audit grouping |
| target_scope | TEXT NOT NULL DEFAULT 'base' | Base admission target |
| min_citation_count | INTEGER NOT NULL DEFAULT 0 | Citation floor |
| added_at | TIMESTAMPTZ | |
| **PK** | (`subject_type`, `relation_type`, `object_type`, `object_id`) | |

### `solemd.entities`

Canonical entity records aggregated from PubTator mentions. Used for entity
search, display names, and future SapBERT embedding enrichment.

| Column | Type | Notes |
|--------|------|-------|
| concept_id | TEXT NOT NULL | PubTator3 concept identifier |
| entity_type | TEXT NOT NULL | gene, disease, chemical, species, mutation, cellline |
| canonical_name | TEXT NOT NULL | Preferred name from most-frequent mention form |
| synonyms | TEXT[] | Alternative mention forms |
| embedding | vector(768) | Reserved for SapBERT enrichment (NULL until populated) |
| paper_count | INTEGER NOT NULL DEFAULT 0 | Distinct papers with this entity |
| created_at | TIMESTAMPTZ | |
| **PK** | (`concept_id`, `entity_type`) | Composite PK because gene IDs overlap across types |

### `solemd.paper_evidence_summary`

Durable per-paper evidence summary used by base admission. This is a persisted
derived stage keyed by `corpus_id`, not a new source of truth and not a
materialized-view compatibility layer.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT PK FK->corpus | Stable paper key |
| admission_reason | TEXT NOT NULL | Current corpus admission reason |
| pmid | INTEGER | Nullable because some papers do not have PubMed ids |
| citation_count | INTEGER NOT NULL DEFAULT 0 | Citation count used for evidence thresholds |
| venue_normalized | TEXT NOT NULL DEFAULT `''` | Stored normalized venue string from `solemd.clean_venue()` |
| has_vocab_match | BOOLEAN NOT NULL DEFAULT false | Whether corpus admission came through vocab-bearing gates |
| paper_entity_count | INTEGER NOT NULL DEFAULT 0 | Total PubTator entity rows matched to the paper |
| has_entity_rule_hit | BOOLEAN NOT NULL DEFAULT false | Whether any entity_rule hit survived citation gating |
| paper_relation_count | INTEGER NOT NULL DEFAULT 0 | Total PubTator relation rows matched to the paper |
| has_relation_rule_hit | BOOLEAN NOT NULL DEFAULT false | Whether any relation_rule hit survived citation gating |
| has_rule_evidence | BOOLEAN NOT NULL DEFAULT false | Whether the paper has curated rule support through entity_rule or relation_rule |
| has_curated_journal_family | BOOLEAN NOT NULL DEFAULT false | Whether the paper also matches a curated journal family |
| journal_family_key | TEXT | Matched base journal family, if any |
| journal_family_label | TEXT | Human-readable base journal family label |
| journal_family_type | TEXT | `general_flagship`, `domain_flagship`, `domain_base`, `organ_overlap`, `specialty`, or `penalized` |
| entity_rule_families | INTEGER NOT NULL DEFAULT 0 | Distinct entity_rule family_keys matched (high confidence only) |
| entity_rule_count | INTEGER NOT NULL DEFAULT 0 | Distinct entity_rule concept_ids matched (high confidence only) |
| entity_core_families | INTEGER NOT NULL DEFAULT 0 | Distinct core family_keys matched (psychiatric_disorder, neurological_disorder, psychiatric_medication, neurotransmitter_system, neuropsych_symptom) |
| journal_score_multiplier | REAL NOT NULL DEFAULT 1.0 | Score multiplier from `base_journal_family.score_multiplier` (flagship=1.5, penalized=0.3, default=1.0) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

This table exists so base admission can reuse paper-level evidence facts across
rebuilds. Raw source truth still lives in `solemd.corpus`, `solemd.papers`, and
`pubtator.*`. The summary stores the expensive join results once, then later
base refreshes and publishes consume that table directly.

**Continuous domain-density scoring** (migration 030): The `entity_rule_families`,
`entity_rule_count`, and `entity_core_families` columns enable a continuous
`domain_score` formula that replaces binary has_rule_evidence -> base admission.
The top `target_base_count` papers by domain_score enter base; the rest remain
universe. The score rewards family diversity (squared), core family matches
(200 pts each), relation rule hits (500 pts), flagship journals (800 pts),
citation count (log-scaled x40), and recency (30 pts for 2020+).

### `solemd.graph_runs`

Published graph runs and bundle metadata.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Graph run identifier |
| graph_name | VARCHAR(128) | Current paper graph name |
| node_kind | VARCHAR(64) | `corpus` |
| status | VARCHAR(32) | running, completed, failed |
| is_current | BOOLEAN | Which run is published by default |
| bundle_uri | TEXT | Filesystem path to bundle directory |
| bundle_format | VARCHAR(32) | `parquet-manifest` |
| bundle_version | VARCHAR(32) | Bundle schema version |
| bundle_checksum | VARCHAR(128) | Manifest checksum |
| bundle_manifest | JSONB | Table/file manifest |
| qa_summary | JSONB | Build QA counts |
| parameters | JSONB | Layout, clustering, and export parameters |
| source_release_id | TEXT | Semantic Scholar release |
| embedding_release_id | TEXT | Embedding release stamp |
| citations_release_id | TEXT | Citation ingest stamp |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

`graph_runs.qa_summary` is also used during active builds to expose the current
build stage and checkpoint directory before the final publish summary replaces
that interim payload.

### `solemd.graph_points`

Run-scoped mapped points for the live canvas. This table stores coordinates
and cluster assignments. Base admission decisions are stored separately in
`graph_base_points` (lean INSERT-only table) rather than as columns here.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK->graph_runs | |
| corpus_id | BIGINT FK->corpus | |
| point_index | INTEGER | Dense browser-facing index derived from run order |
| x | REAL NOT NULL | UMAP dimension 1 |
| y | REAL NOT NULL | UMAP dimension 2 |
| cluster_id | INTEGER | Leiden community id |
| micro_cluster_id | INTEGER | Optional finer-grained local cluster id |
| cluster_probability | REAL | Reserved confidence field; currently unset for the Leiden pipeline |
| outlier_score | REAL | Spatial outlier score |
| is_noise | BOOLEAN NOT NULL DEFAULT false | Noise flag retained for QA |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `solemd.graph_base_points`

Lean INSERT-only table for base-admitted papers per run. Replaces the
previous `graph_points.is_in_base` / `graph_points.base_rank` columns that
required a full-table UPDATE on every `materialize_base_admission()` call.
All consumers JOIN to this table instead of reading columns off graph_points.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID NOT NULL | |
| corpus_id | BIGINT NOT NULL | |
| base_reason | TEXT NOT NULL | `rule`, `flagship`, `vocab` |
| base_rank | REAL NOT NULL DEFAULT 0 | Ordering signal within the base scaffold |
| **PK** | (`graph_run_id`, `corpus_id`) | |

### `solemd.graph_clusters`

Cluster-level summaries and labels for a graph run. ~200-300 clusters from
GPU Leiden (resolution 3.0) with LLM-generated labels (Gemini 2.5 Flash)
and hierarchical parent groups.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK->graph_runs | |
| cluster_id | INTEGER | |
| label | TEXT | LLM-generated clinical/scientific label (3-7 words) |
| label_mode | TEXT | `ctfidf`, `llm`, `fixed` |
| label_source | TEXT | `gemini-2.5-flash`, `ctfidf`, `system` |
| description | TEXT | One-sentence cluster description (LLM-generated) |
| member_count | INTEGER | Total mapped members |
| paper_count | INTEGER | Paper count |
| centroid_x | REAL | |
| centroid_y | REAL | |
| representative_node_id | TEXT | Representative point id |
| representative_node_kind | TEXT | `paper` |
| candidate_count | INTEGER | Candidate papers considered |
| mean_cluster_probability | REAL | |
| mean_outlier_score | REAL | |
| is_noise | BOOLEAN | |

**Labeling pipeline** (modular, each step re-runnable independently):

1. **c-TF-IDF** -- extracts top 10 distinctive keywords per cluster from
   representative paper abstracts/titles (200 papers per cluster, by citation)
2. **LLM labeling** -- sends keywords + 20 representative titles to Gemini 2.5
   Flash; generates specific clinical labels and descriptions (~$0.05/run)

### `solemd.graph_base_features`

Run-scoped base-admission audit features. This table exists to explain why a
paper did or did not enter the base scaffold.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK->graph_runs | |
| corpus_id | BIGINT FK->corpus | |
| admission_reason | TEXT | Corpus admission reason |
| has_vocab_match | BOOLEAN | Whether corpus admission came through vocab-bearing gates |
| citation_count | INTEGER | |
| paper_entity_count | INTEGER | |
| paper_relation_count | INTEGER | |
| has_entity_rule_hit | BOOLEAN | |
| has_relation_rule_hit | BOOLEAN | |
| has_rule_evidence | BOOLEAN | Whether the paper has curated rule support |
| has_curated_journal_family | BOOLEAN | Whether the paper also matches a curated journal family |
| journal_family_key | TEXT | Family key that triggered journal-side base admission, if any |
| journal_family_label | TEXT | Human-readable journal family label |
| journal_family_type | TEXT | Journal family type used for ranking/audit |
| base_reason | TEXT | `rule`, `flagship`, `vocab`, or `NULL` when the paper remains universe-only |
| created_at | TIMESTAMPTZ | |

### `solemd.mapped_papers` view

Quality-filtered mapped universe view joining corpus + papers. Used for graph
layout, base admission, and bundle export (NOT for enrichment -- enrichment
targets all mapped papers including low-cite items).

The view applies quality filters: excludes pre-1945 papers, low-cite
news/letters/editorials, and null-type low-cite papers.

```sql
SELECT p.*, c.layout_status, c.admission_reason,
       c.is_in_current_map, c.is_in_current_base
FROM solemd.papers p
JOIN solemd.corpus c ON c.corpus_id = p.corpus_id
WHERE c.layout_status = 'mapped'
  AND (p.year >= 1945 OR p.year IS NULL)
  AND NOT (... quality exclusions ...);
```

### `solemd.bulk_citation_ingest_batches`

Persistent per-batch checkpoints for the Semantic Scholar bulk citations ingest.
Enables resumable multi-shard loading.

| Column | Type | Notes |
|--------|------|-------|
| release_id | TEXT NOT NULL | S2 release identifier |
| batch_index | INTEGER NOT NULL | Batch sequence number |
| shard_names | JSONB | Ordered shard file names in batch |
| shards_scanned | INTEGER | Shards processed so far |
| total_domain_edges | BIGINT | Domain-domain edges found |
| loaded_edges | BIGINT | Edges written to citations |
| status | TEXT NOT NULL | `running`, `completed`, `failed` |
| started_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |
| **PK** | (`release_id`, `batch_index`) | |

### `solemd.publication_venues`

Semantic Scholar venue registry. Populated during S2 enrichment.

| Column | Type | Notes |
|--------|------|-------|
| publication_venue_id | TEXT PK | S2 venue identifier |
| name | TEXT NOT NULL | Venue name |
| venue_type | TEXT | Journal, conference, etc. |
| issn | TEXT | |
| url | TEXT | |
| alternate_names | TEXT[] | |
| alternate_urls | TEXT[] | |
| source | TEXT DEFAULT 'semantic_scholar_graph_api' | |
| last_seen_release_id | TEXT | S2 release stamp |

### `solemd.authors`

Semantic Scholar author registry.

| Column | Type | Notes |
|--------|------|-------|
| author_id | TEXT PK | S2 author identifier |
| name | TEXT NOT NULL | |
| external_ids | JSONB | ORCID, DBLP, etc. |
| source | TEXT DEFAULT 'semantic_scholar_graph_api' | |
| last_seen_release_id | TEXT | |

### `solemd.paper_authors`

Per-paper author snapshot from S2 Graph API. Source for future geo enrichment.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT FK->papers | |
| author_position | INTEGER | Ordinal position on paper |
| author_id | TEXT FK->authors | Nullable (some authors lack S2 IDs) |
| name | TEXT NOT NULL | |
| affiliations | TEXT[] | Raw affiliation strings |
| external_ids | JSONB | |
| source_release_id | TEXT | |
| **PK** | (`corpus_id`, `author_position`) | |

### `solemd.author_affiliations`

Normalized affiliations derived from paper_authors. Structured for geo enrichment.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| author_position | INTEGER | |
| affiliation_index | INTEGER | |
| raw_affiliation | TEXT NOT NULL | Original affiliation string |
| institution | TEXT | Parsed institution name |
| department | TEXT | |
| city | TEXT | |
| region | TEXT | |
| country | TEXT | |
| country_code | TEXT | |
| latitude | DOUBLE PRECISION | |
| longitude | DOUBLE PRECISION | |
| ror_id | TEXT | Research Organization Registry identifier |
| **PK** | (`corpus_id`, `author_position`, `affiliation_index`) | |

### `solemd.paper_assets`

External or mirrored paper assets such as open-access PDFs.

| Column | Type | Notes |
|--------|------|-------|
| asset_id | BIGSERIAL PK | |
| corpus_id | BIGINT FK->papers | |
| asset_kind | TEXT NOT NULL | `open_access_pdf`, etc. |
| source | TEXT DEFAULT 'semantic_scholar_graph_api' | |
| remote_url | TEXT | |
| storage_path | TEXT | Local mirror path |
| access_status | TEXT | |
| license | TEXT | |
| disclaimer | TEXT | |
| metadata | JSONB | |
| **UNIQUE** | (`corpus_id`, `asset_kind`, `source`) | |

### `solemd.paper_references`

Outgoing reference list per paper from S2 Graph API.

| Column | Type | Notes |
|--------|------|-------|
| reference_id | BIGSERIAL PK | |
| corpus_id | BIGINT FK->papers | |
| reference_index | INTEGER NOT NULL | Order in reference list |
| referenced_paper_id | TEXT | S2 paperId of the cited paper |
| referenced_corpus_id | BIGINT FK->corpus | Populated when the cited paper is in our domain |
| title | TEXT | |
| year | INTEGER | |
| external_ids | JSONB | DOI, PMID, etc. |
| source_release_id | TEXT | |
| **UNIQUE** | (`corpus_id`, `reference_index`) | |

### `solemd.paper_citations`

Mapped actual paper-to-paper citation edges. Raw ingest keeps broad citation
metrics in `s2_paper_reference_metrics_raw`; this table is populated during
mapped enrichment for mapped citing papers.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT FK->corpus | Mapped citing paper |
| reference_checksum | TEXT | Stable release-scoped reference row key |
| cited_corpus_id | BIGINT FK->corpus | Populated when cited paper is canonical |
| cited_s2_paper_id | TEXT | S2 paperId for unresolved/out-of-corpus cited paper |
| linkage_status | SMALLINT | Pending / linked / orphan |
| is_influential | BOOLEAN | S2 influential citation flag |
| intent_raw | TEXT | Raw S2 intent payload |
| **PK** | (`corpus_id`, `reference_checksum`) | |

---

## RAG Canonical Tables

The RAG warehouse spine stores structured document content for retrieval
augmented generation. These tables were introduced in migrations 028-029 and
form a hierarchical document model.

### Document hierarchy

```
+----------------------+
|   paper_documents    |  1 per corpus_id -- document metadata
+----------+-----------+
           | 1:N
+----------+-----------+
| paper_document_sources|  provenance per source system (S2, PubTator, S2ORC)
+----------------------+
           |
+----------+-----------+
|   paper_sections     |  hierarchical section tree (title, abstract, body, ...)
+----------+-----------+
           | 1:N
+----------+-----------+
|    paper_blocks      |  paragraph-level text spans (hash-partitioned x16)
+----------+-----------+
           | 1:N
+----------+-----------+
|  paper_sentences     |  sentence-level spans (hash-partitioned x16)
+----------------------+
```

### `solemd.paper_documents`

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT PK FK->papers | |
| title | TEXT | Document title |
| language | TEXT | Detected language |
| source_availability | TEXT | What text is available |
| primary_source_system | TEXT | Which source system provides canonical text |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `solemd.paper_document_sources`

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT FK->paper_documents | |
| document_source_ordinal | INTEGER | Source order |
| source_system | TEXT NOT NULL | e.g. `semantic_scholar`, `pubtator3`, `s2orc` |
| source_revision | TEXT NOT NULL | Release/version identifier |
| source_document_key | TEXT NOT NULL | Document key in the source system |
| source_plane | TEXT NOT NULL | Which structural plane (abstract, fulltext, etc.) |
| parser_version | TEXT NOT NULL | Parser version used |
| is_primary_text_source | BOOLEAN | True when this source supplies the canonical text spine |
| raw_attrs_json | JSONB | Additional source-specific attributes |
| **PK** | (`corpus_id`, `document_source_ordinal`) | |

### `solemd.paper_sections`

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT FK->paper_documents | |
| section_ordinal | INTEGER | Section order within document |
| parent_section_ordinal | INTEGER | Self-referential FK for nested sections |
| section_role | TEXT NOT NULL | `title`, `abstract`, `introduction`, `methods`, etc. |
| display_label | TEXT | Display heading text |
| numbering_token | TEXT | Section number (e.g. "2.1") |
| text | TEXT NOT NULL | Full section text |
| **PK** | (`corpus_id`, `section_ordinal`) | |

### `solemd.paper_blocks`

Paragraph-level text spans. Hash-partitioned by `corpus_id` into 16 partitions
for scale.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| block_ordinal | INTEGER | Block order within document |
| section_ordinal | INTEGER NOT NULL | FK to parent section |
| section_role | TEXT NOT NULL | Denormalized section role |
| block_kind | TEXT NOT NULL | `paragraph`, `list_item`, `table_cell`, etc. |
| text | TEXT NOT NULL | Block text content |
| is_retrieval_default | BOOLEAN DEFAULT true | Whether included in default RAG retrieval |
| linked_asset_ref | TEXT | Optional reference to external asset |
| **PK** | (`corpus_id`, `block_ordinal`) | |

### `solemd.paper_sentences`

Sentence-level spans within blocks. Hash-partitioned x16.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| block_ordinal | INTEGER | FK to parent block |
| sentence_ordinal | INTEGER | Sentence order within block |
| section_ordinal | INTEGER NOT NULL | Denormalized section reference |
| segmentation_source | TEXT NOT NULL | Segmenter used (e.g. `spacy_en_core_web_sm`) |
| text | TEXT NOT NULL | Sentence text |
| **PK** | (`corpus_id`, `block_ordinal`, `sentence_ordinal`) | |

### `solemd.paper_citation_mentions`

Aligned in-text citation mentions with canonical span lineage. Hash-partitioned x16.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| source_system / source_revision / source_document_key / source_plane | TEXT | Source provenance |
| span_origin | TEXT | Where the mention was detected |
| alignment_status | TEXT | How it was aligned to canonical spine |
| source_start_offset / source_end_offset | INTEGER | Character offsets in source |
| text | TEXT | Mention surface text |
| canonical_section_ordinal / canonical_block_ordinal / canonical_sentence_ordinal | INTEGER | Aligned canonical position |
| source_citation_key | TEXT NOT NULL | Key from source citation marker |
| matched_corpus_id | BIGINT FK->corpus | Resolved target paper |

### `solemd.paper_entity_mentions`

Aligned entity mentions with concept identifiers. Hash-partitioned x16.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT | |
| source_system / source_revision / source_document_key / source_plane | TEXT | Source provenance |
| span_origin | TEXT | Where the mention was detected |
| alignment_status | TEXT | How it was aligned to canonical spine |
| source_start_offset / source_end_offset | INTEGER | Character offsets in source |
| text | TEXT | Mention surface text |
| canonical_section_ordinal / canonical_block_ordinal / canonical_sentence_ordinal | INTEGER | Aligned canonical position |
| entity_type | TEXT NOT NULL | gene, disease, chemical, etc. |
| concept_namespace | TEXT | e.g. `MESH`, `NCBI_Gene` |
| concept_id | TEXT | Normalized concept identifier |

---

## Key Table Relationships

```
+------------------------------------------------------------------+
|                        solemd.corpus                             |
|  corpus_id (PK) | pmid | admission_reason | layout_status        |
+--------+---------------------------------------------------------+
         | 1:1
         +---------------------------------------------------------+
         |                                                         |
+--------+--------------+                              +-----------+--------------+
|    solemd.papers      |                              | paper_evidence_summary    |
|  corpus_id (PK/FK)    |                              |  corpus_id (PK/FK)       |
|  title, year, venue   |                              |  has_rule_evidence       |
|  citation_count       |                              |  entity_rule_families    |
|  embedding(768)       |                              |  domain_score inputs     |
|  abstract, tldr       |                              +--------------------------+
|  publication_venue_id-+---> publication_venues
+--------+--------------+
         | 1:N
         +--------------+--------------+---------------+---------------+
         |              |              |               |               |
+-----------------+ +---+-----------+ ++--------------+ ++------------+ ++--------------+
| paper_citations | | paper_authors | |paper_documents| | paper_assets| | pubtator rels |
| corpus_id (FK)  | | corpus_id(FK) | |corpus_id(PK) | |corpus_id(FK)| |corpus_id pair |
| cited_corpus_id | | author_id(FK) | |-> sections    | |asset_kind   | |relation type |
| cited_s2_paper  | | name, affils  | |  -> blocks    | |remote_url   | |source lineage |
+-----------------+ |  v            | |    -> sents   | +-------------+ +---------------+
                    | author_affils | |  -> cit_ments |
                    +---------------+ |  -> ent_ments |
                                      +--------------+

+------------------------------------------------------------------+
|                       solemd.graph_runs                          |
|  id (PK) | graph_name | status | is_current | bundle_manifest    |
+--------+---------------------------------------------------------+
         | 1:N
         +--------------------------+------------------------------+
         |                          |                              |
+--------+----------+   +----------+----------+   +---------------+--------+
|  graph_points     |   |  graph_clusters     |   |  graph_base_points     |
|  run_id, corp_id  |   |  run_id, cluster_id |   |  run_id, corpus_id     |
|  x, y             |   |  label, description |   |  base_reason           |
|  cluster_id       |   |  member_count       |   |  base_rank             |
|  point_index      |   |  centroid_x/y       |   +------------------------+
+-------+-----------+   |  base_count         |
        |               +---------------------+
        | 1:1
+-------+-----------+
| graph_base_features|
|  run_id, corp_id  |
|  base_reason      |
|  has_rule_evidence|
+-------------------+

+------------------------------------+     +--------------------------+
|  pubtator.entity_annotations      |     |   pubtator.relations     |
|  pmid, entity_type, concept_id    |     |   pmid, relation_type    |
|  mentions, resource               |     |   subject/object type+id |
+------------------------------------+     +--------------------------+
         ^ joined via pmid                          ^ joined via pmid
         |                                          |
+--------+------------------------------------------+--------------+
|  solemd.entity_rule / solemd.relation_rule                       |
|  concept-driven base admission rules                             |
+------------------------------------------------------------------+
```

---

### Browser DuckDB Runtime (local, not graph-db)

The browser-side `overlay_points`, `active_points`, and active-link tables are
DuckDB-local derived views, not PostgreSQL tables. The canonical local shape is:

- `base_points_web` / `base_points_canvas_web`
- `universe_points_web` / `universe_points_canvas_web`
- `selected_point_indices`
- `overlay_point_ids_by_producer`
- `overlay_point_ids`
- `overlay_points_web` / `overlay_points_canvas_web`
- `active_point_index_lookup_web`
- `current_points_web` / `current_points_canvas_web`
- `current_paper_points_web`
- `active_points_web` / `active_points_canvas_web`
- `active_paper_points_web` / `active_paper_points_canvas_web`
- `base_links_web`
- `current_links_web`
- `active_links_web` / `active_paper_links_web`

Design rule:

- canvas views stay narrow and carry only the preindexed render columns Cosmograph needs directly
- query views stay richer and serve search, info-panel aggregation, and the data table without widening the canvas path
- base and universe stay Parquet-backed; they are not copied into browser-local temp point tables at startup
- selection state is SQL-native: Cosmograph intent clauses materialize into
  `selected_point_indices` inside DuckDB instead of reinserting large JS-owned
  index lists
- React only mirrors scalar selection/scope state for UI invalidation:
  `selectedPointCount`, `selectedPointRevision`, `currentPointScopeSql`, and
  `currentScopeRevision`. Full selected-id membership stays inside DuckDB
- overlay state is id-only: `overlay_point_ids_by_producer` and
  `overlay_point_ids` are the only mutable local membership tables
- `overlay_points_web` / `overlay_points_canvas_web` resolve promoted rows from
  `universe_points`, rather than copying rich overlay rows into a second local
  point table
- metadata views can stay richer because they are queried on demand
- point clicks resolve a narrow paper shell first; fuller document preview and evidence stay lazy behind follow-up DuckDB/API calls
- universe artifacts remain detached until overlay activation needs them
- full-base runtime reindexing is forbidden; only overlay rows may be renumbered
  after the fixed base index range so Cosmograph keeps a dense active canvas
- first-paint boot should never require the browser to materialize detail-only
  columns such as `search_text`, `payload_json`, DOI/PMID/PMCID, open-access
  flags, asset counts, or cold evidence payloads
- `paper_documents` and `cluster_exemplars` are lazy local detail attachments, not first-paint dependencies
- `cluster_exemplars` carries paper-level exemplar previews for cluster context;
  it is not a chunk-mode graph surface
- info-panel scope changes should batch widget aggregation by kind and reuse one
  categorical summary result for both facet and bar widgets instead of scanning
  the same scope twice
- dataset categorical totals should be cached per overlay revision and merged
  with fresh scoped counts instead of rescanning the full dataset on every
  filter change
- table pagination should use a count query plus a paged row query rather than a
  wide `count(*) OVER ()` materialization on the full point projection
- the canonical runtime is corpus-only; future graph layers must attach as
  optional modules with their own DuckDB views/tables instead of branching
  through the base corpus schema

### Graph Build Checkpoints (filesystem)

Layout checkpoints are intentionally **not** stored in PostgreSQL. They are
run-scoped filesystem artifacts written under:

- `graph/tmp/graph_build/<graph_run_id>/`

Why they are not tables:

1. Layout matrices, kNN arrays, and coordinate checkpoints are large binary blobs,
   not relational facts.
2. Resume logic needs fast append/restart behavior without bloating graph-db.
3. PostgreSQL stays focused on durable corpus/evidence/run metadata, while the
   layout engine owns its numeric work files.

Canonical checkpoint artifacts:

- `corpus_ids.npy`
- `citation_counts.npy`
- `layout_matrix.npy`
- `knn_indices.npy`
- `knn_distances.npy`
- `coordinates.npy`
- `cluster_ids.npy`
- `outlier_scores.npy`
- `is_noise.npy`
- `checkpoint.json`

---

## Rebuild Strategy At Scale

The canonical schema is designed so `base_points` rebuilds do not have to
recompute the entire graph stack forever. For the current mapped corpus, a full
graph rebuild is acceptable. For larger releases such as `14M+` mapped papers,
the graph should be rebuilt as an overnight pipeline with four separate stages.

### 1. `paper_evidence_summary`

Materialize per-paper evidence features once per ingest or rule release, not
once per graph publish.

This summary should hold the expensive admission inputs:

- entity-rule hits
- relation-rule hits
- family keys matched by journal curation
- citation and metadata thresholds
- per-paper evidence counts used by base admission
- entity rule family diversity (for continuous scoring)

`graph_base_features` is run-scoped audit output. `paper_evidence_summary` is
the reusable upstream substrate that keeps later base rebuilds cheap.

Operationally, the summary refresh is committed in five stages:

1. `source`
2. `entity`
3. `relation`
4. `journal`
5. `finalize`

That gives the build a real resume boundary. If a refresh fails on `relation`,
the next run can start from `relation` instead of throwing away the completed
`source` and `entity` work.

### 2. `universe_layout`

Recompute mapped coordinates only when the embedding release or layout recipe
changes.

This stage owns:

- PCA-space layout matrix checkpoint
- shared kNN graph checkpoint
- UMAP coordinates
- cluster assignment
- outlier scores
- run-independent mapped paper membership for the release

The expensive layout job should not rerun just because the base policy or
journal families changed.

Operationally, the canonical layout build now uses:

1. one shared PCA-space kNN graph
2. UMAP `precomputed_knn` to reuse that graph for layout
3. Leiden clustering from the same kNN graph
4. durable filesystem checkpoints so failed runs can resume

### 3. `base_admission`

Apply the active `base_policy` against the evidence summary and the mapped
universe to decide base membership and `base_rank`. Continuous domain-density
scoring (migration 030) computes a `domain_score` per paper and admits the
top `target_base_count` papers into `graph_base_points`.

This stage should be the normal policy-refresh path. It is much cheaper than a
full graph rebuild because it operates on precomputed features instead of
rescanning PubTator evidence tables and redoing layout.

### 4. `publish`

Export and publish the canonical bundle:

- `base_points`
- `base_clusters`
- `universe_points`
- evidence-side artifacts

This final stage should be the only step that mutates the current published run.
If a run already has persisted `graph_points` and `graph_clusters`, it should
also be publishable later without rerunning layout.

## Why This Split Matters

The current full rebuild is slow because it combines all of the following into a
single publish path:

- evidence joins across the mapped corpus
- base-admission feature materialization
- layout-owned run state
- export and manifest generation

That is acceptable for a clean canonical reset. It is not the intended steady
state for universe-scale publishing.

The long-term optimization target is:

1. ingest new papers into `corpus` and `papers`
2. refresh `paper_evidence_summary` incrementally
3. append or rebuild `universe_layout` on a release cadence
4. recompute `base_admission` whenever policy changes
5. publish a new canonical bundle

With that separation, new papers can flow into the baseline corpus continuously,
while `base_points` can be refreshed as a cheap policy job and the full
universe layout can run as an overnight release build.

### Implementation Notes For Release-Scale Builds

When the mapped universe grows materially beyond the current corpus, the highest
leverage optimizations are:

1. keep entity, relation, and journal-family evidence in a persistent
   `paper_evidence_summary` keyed by `corpus_id`
2. add composite PubTator indexes that match the admission joins, especially
   `(pmid, entity_type, concept_id)` for entities and
   `(pmid, subject_type, relation_type, object_type, object_id)` for relations
3. if a run-scoped staging pass is still needed, materialize `run_points` once
   with an index on `pmid` instead of reusing the same CTE across multiple heavy
   joins
4. write `graph_base_points` via INSERT only, rather than updating columns on
   `graph_points` across the full run
5. persist normalized venue or paper-to-family mapping so journal top-ups do not
   rerun millions of `clean_venue()` evaluations during every publish
6. checkpoint layout artifacts (`layout_matrix`, shared `knn`, coordinates,
   clusters) so GPU builds restart from the last durable stage instead of from
   raw embeddings

### Why `paper_evidence_summary` Is A Table

Keep `paper_evidence_summary` as a normal persisted table refreshed by explicit
SQL stages. Do not replace it with a materialized view.

Reasons:

1. The graph build needs controlled `INSERT ... ON CONFLICT` updates and stale-row cleanup.
2. The summary is reused by multiple later stages, so it should survive publish failures.
3. A normal table leaves room for incremental or batched refresh later without changing the contract.

### Why Heavy Evidence Scans Avoid Temp-Source Tables

The expensive entity and relation aggregates should join raw PubTator evidence
directly against permanent mapped-paper tables (`solemd.corpus` and
`solemd.papers`) and only use temporary tables for the smaller downstream
stages.

That query shape matters because PostgreSQL parallel query is much more willing
to plan `Gather` / `Gather Merge` workers over large scans of regular tables
than over scans driven by temporary-table sources. In practice, that means the
summary refresh can actually use multiple workers on the PubTator-side scans
instead of falling back to a serial temp-table probe pattern.

---

## Evidence Substrate

### `pubtator.entity_annotations`

PubTator3 entities filtered to corpus PMIDs.

| Column | Type | Notes |
|--------|------|-------|
| pmid | INTEGER NOT NULL | |
| entity_type | TEXT NOT NULL | gene, disease, chemical, species, mutation, cellline |
| concept_id | TEXT NOT NULL | |
| mentions | TEXT NOT NULL | Pipe-delimited mention strings |
| resource | TEXT NOT NULL | Default `PubTator3` |

### `pubtator.relations`

PubTator3 relations filtered to corpus PMIDs.

| Column | Type | Notes |
|--------|------|-------|
| pmid | INTEGER NOT NULL | |
| relation_type | TEXT NOT NULL | |
| subject_type | TEXT NOT NULL | |
| subject_id | TEXT NOT NULL | |
| object_type | TEXT NOT NULL | |
| object_id | TEXT NOT NULL | |

Both tables were originally created as UNLOGGED for fast bulk loading.
Migration 013 converted them to LOGGED after an unclean shutdown lost 342M rows.

---

## Functions

### `solemd.clean_venue(TEXT)`

Normalize venue names for journal-rule matching. Mirrors Python `_clean_venue()`
and DuckDB `clean_venue()` macro. Transformations: lowercase, strip trailing dot,
strip leading "the ", strip subtitle after ":", strip trailing parenthetical.

Declared `IMMUTABLE PARALLEL SAFE` for use in indexes and parallel queries.

---

## Design Rules

1. `graph_base_points` carries the base-admission decision through `base_reason` and `base_rank`.
2. `graph_clusters` stays geometric and descriptive; it does not decide first paint.
3. `base_journal_family` and `journal_rule` define curated journal admission.
4. `entity_rule` and `relation_rule` define rule-backed base admission.
5. `mapped_papers` is a read model, not the source of truth.
6. `pubtator.*` is the evidence substrate, not the graph-admission policy.
7. There is no legacy multi-tier policy in this schema.
8. `paper_evidence_summary` is the durable upstream substrate for base admission; `graph_base_features` is run-scoped audit output.
9. Base admission uses continuous domain-density scoring, not binary rule-hit thresholds.
10. RAG canonical tables (paper_documents -> sections -> blocks -> sentences -> mentions) form a self-contained warehouse spine that does not branch through the graph admission path.

---

_Last verified against code: 2026-04-08_
