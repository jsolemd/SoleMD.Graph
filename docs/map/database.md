# Database Schema

> **Status**: canonical graph-db schema for base admission, mapped canvas state, and evidence substrate
> **Port**: 5433 (Docker, `pgvector/pgvector:pg16`)
> **Extensions**: `vector` (pgvector), `pg_trgm` (trigram FTS)
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
  limited to render fields plus the metadata needed by mounted native widgets
- narrow point parquet fields are limited to ids, coordinates, cluster/color
  columns, `display_label`, compact bibliographic metadata, compact summary
  metrics, `text_availability`, `semantic_groups_csv`, `organ_systems_csv`,
  `relation_categories_csv`, `is_in_base`, and `base_rank`
- `current_points_canvas_web` / `current_points_web` / `current_paper_points_web`
  are the canonical browser-facing active aliases for summaries, search,
  selection resolution, and table pages; they point at base directly until
  overlay activation requires the active union
- `base_points_web` and `base_points_canvas_web` must reuse the exported `point_index`
  directly instead of recomputing dense indices with runtime window functions
- when no overlay is active, the active aliases point directly at
  `base_points_canvas_web` and `base_paper_points_canvas_web`, so startup does
  not pay for an unnecessary active-union reindex
- when overlay is active, `active_points_canvas_web` appends only the promoted overlay rows
  after the base index range; the full base scaffold is not recopied into a local temp table

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
| is_in_current_map | BOOLEAN NOT NULL DEFAULT false | True once the paper is present in the current published graph run |
| is_in_current_base | BOOLEAN NOT NULL DEFAULT false | True once the paper is admitted into the current published `base_points` scaffold |
| mapped_at | TIMESTAMPTZ | When the current run first mapped the paper |
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
- `created_at`
- `updated_at`

### `solemd.base_policy`

Single active policy record for base admission. This is the source of truth for
which rule sets are active when a new graph run is built.

| Column | Type | Notes |
|--------|------|-------|
| policy_version | TEXT PK | Human-readable version string |
| description | TEXT | Summary of the active base admission policy |
| target_base_count | INTEGER NOT NULL DEFAULT `1000000` | Desired first-paint size |
| is_active | BOOLEAN NOT NULL DEFAULT false | At most one active row |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `solemd.base_journal_family`

Curated family definitions for journals used by base admission and audit.

| Column | Type | Notes |
|--------|------|-------|
| family_key | TEXT PK | Stable family identifier |
| family_label | TEXT NOT NULL | Human-readable family name |
| family_type | TEXT NOT NULL | `general_flagship`, `domain_flagship`, `domain_base`, `organ_overlap`, or `specialty` |
| include_in_base | BOOLEAN NOT NULL DEFAULT true | Whether the family remains available to the active base policy |
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

### `solemd.entity_rule`

Entity-driven base admission rules. These are rule-backed domain anchors, not
runtime visibility concepts.

| Column | Type | Notes |
|--------|------|-------|
| entity_type | TEXT NOT NULL | PubTator3 entity type |
| concept_id | TEXT NOT NULL | PubTator3 concept id |
| canonical_name | TEXT NOT NULL | Human-readable concept name |
| family_key | TEXT | Optional family key for audit grouping |
| confidence | TEXT NOT NULL | `high`, `moderate`, or `requires_second_gate` |
| min_citation_count | INTEGER NOT NULL DEFAULT 0 | Citation floor |
| added_at | TIMESTAMPTZ | |
| **PK** | (`entity_type`, `concept_id`) | |

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

### `solemd.paper_evidence_summary`

Durable per-paper evidence summary used by base admission. This is a persisted
derived stage keyed by `corpus_id`, not a new source of truth and not a
materialized-view compatibility layer.

| Column | Type | Notes |
|--------|------|-------|
| corpus_id | BIGINT PK FK→corpus | Stable paper key |
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
| journal_family_type | TEXT | `general_flagship`, `domain_flagship`, `domain_base`, `organ_overlap`, or `specialty` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

This table exists so base admission can reuse paper-level evidence facts across
rebuilds. Raw source truth still lives in `solemd.corpus`, `solemd.papers`, and
`pubtator.*`. The summary stores the expensive join results once, then later
base refreshes and publishes consume that table directly.

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

1. PCA matrices, kNN arrays, and coordinate checkpoints are large binary blobs,
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

### `solemd.graph_points`

Run-scoped mapped points for the live canvas. This table is the canonical source
for `base_points` and `universe_points` exports.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK→graph_runs | |
| corpus_id | BIGINT FK→corpus | |
| point_index | INTEGER | Dense browser-facing index derived from run order |
| x | REAL NOT NULL | UMAP dimension 1 |
| y | REAL NOT NULL | UMAP dimension 2 |
| cluster_id | INTEGER | Leiden community id |
| micro_cluster_id | INTEGER | Optional finer-grained local cluster id |
| cluster_probability | REAL | Optional confidence score |
| outlier_score | REAL | Spatial outlier score |
| is_noise | BOOLEAN NOT NULL DEFAULT false | Noise flag retained for QA |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| is_in_base | BOOLEAN NOT NULL DEFAULT false | Whether the point belongs in the first-paint scaffold |
| base_rank | REAL NOT NULL DEFAULT 0 | Ordering signal within the base scaffold |

### `solemd.graph_clusters`

Cluster-level summaries and labels for a graph run.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK→graph_runs | |
| cluster_id | INTEGER | |
| label | TEXT | Lexical or LLM label |
| label_mode | TEXT | lexical, llm, fixed, etc. |
| label_source | TEXT | Provenance for the label |
| member_count | INTEGER | Total mapped members |
| paper_count | INTEGER | Paper count |
| centroid_x | REAL | |
| centroid_y | REAL | |
| representative_node_id | TEXT | Representative point id |
| representative_node_kind | TEXT | `paper` |
| mean_cluster_probability | REAL | |
| mean_outlier_score | REAL | |
| is_noise | BOOLEAN | |
| base_count | INTEGER | Papers in base for this cluster |
| base_fraction | REAL | `base_count / paper_count` |

### `solemd.graph_base_features`

Run-scoped base-admission audit features. This table exists to explain why a
paper did or did not enter the base scaffold.

| Column | Type | Notes |
|--------|------|-------|
| graph_run_id | UUID FK→graph_runs | |
| corpus_id | BIGINT FK→corpus | |
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

Export-ready view joining corpus membership, paper metadata, and mapped
coordinates. This is the canonical read model for graph export and analysis.

Typical shape:

```sql
SELECT
  c.corpus_id,
  c.pmid,
  c.admission_reason,
  c.is_in_current_map,
  c.is_in_current_base,
  p.title,
  p.year,
  p.venue,
  p.citation_count,
  gp.graph_run_id,
  gp.point_index,
  gp.x,
  gp.y,
  gp.cluster_id,
  gp.is_in_base,
  gp.base_rank
FROM solemd.corpus c
JOIN solemd.papers p ON p.corpus_id = c.corpus_id
JOIN solemd.graph_points gp ON gp.corpus_id = c.corpus_id;
```

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
universe to decide `is_in_base` and `base_rank`.

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
4. write `graph_points.is_in_base` and `graph_points.base_rank` once, rather
   than resetting the full run and then updating it again
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

---

## Design Rules

1. `graph_points` carries the render decision through `is_in_base` and `base_rank`.
2. `graph_clusters` stays geometric and descriptive; it does not decide first paint.
3. `base_journal_family` and `journal_rule` define curated journal admission.
4. `entity_rule` and `relation_rule` define rule-backed base admission.
5. `mapped_papers` is a read model, not the source of truth.
6. `pubtator.*` is the evidence substrate, not the graph-admission policy.
7. There is no legacy multi-tier policy in this schema.
