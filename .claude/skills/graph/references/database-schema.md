# Database Schema Reference

Agent-facing reference for SoleMD.Graph's biomedical data plane.

This is the universe of tables and views the backend rebuild operates over.
Use it to orient yourself before touching warehouse SQL, worker pipelines,
publish jobs, or the Drizzle-backed serve catalog.

This is **not** a code-graph. There are no `Function`, `Class`, or `File`
nodes anywhere in this project. If a reference talks about PageRank on
`CALLS` edges, it belongs to a different project.

## Engine And Extensions

| Property | Value |
|---|---|
| Postgres image | `postgres:18.3-bookworm` |
| Warehouse profile | `db` (cold-by-default; not auto-up on host reboot) |
| Serve cluster | `graph-db-serve` (always-up, restart unless-stopped) |
| Connection pooler | `pgbouncer-serve` (transaction pooling in front of serve) |

Stock extensions enabled on a fresh empty cluster
(`db/schema/warehouse/20_extensions.sql`):

- `pg_trgm`
- `pgcrypto`
- `pg_stat_statements`
- `pg_buffercache`

Deferred extensions (not yet enabled in the warehouse baseline):

- `vector` (pgvector) — embeddings storage is staged, but the extension is
  intentionally deferred until the warehouse image/config slice lands.
- `hypopg`
- `pg_cron`
- `pg_partman`

Do not assume `vector` is loaded. Embedding columns and ANN indexes are not
the warehouse's contract today. Treat any `vector` usage as future work.

## Schema Inventory (Warehouse)

| Schema | Owner role | Role |
|---|---|---|
| `solemd` | `engine_warehouse_admin` | Canonical biomedical corpus, runs, and publish ledgers |
| `pubtator` | `engine_warehouse_admin` | PubTator3 entity annotations and relations |
| `umls` | `engine_warehouse_admin` | UMLS vocabulary materialization |
| `solemd_scratch` | `engine_warehouse_admin` | Throwaway scratch space; never a runtime contract |

Definitions: `db/schema/warehouse/10_schemas.sql`.

The serve cluster has its own schema universe defined under
`db/schema/serve/`: `solemd`, `auth`, `warehouse_grounding`, `pgbouncer_auth`.
Drizzle ORM consumes the serve cluster.

## `solemd` (Warehouse) Highlights

The full universe lives in `db/schema/warehouse/4*_tables_*.sql`. The most
load-bearing tables for graph and ingest work are:

### Run lifecycle / release ledgers

| Table | Role |
|---|---|
| `solemd.source_releases` | Snapshot identifier for upstream data drops; everything joins back to a release |
| `solemd.ingest_runs` | One row per ingest invocation; tracks run inputs, outputs, status |
| `solemd.ingest_file_tasks` | Per-file task fan-out for ingest |
| `solemd.graph_runs` | Build-side ledger of graph publish lifecycle (status SMALLINT 1..5) |
| `solemd.serving_runs` | Backend serving cohort lifecycle |
| `solemd.serving_artifacts` | Concrete serving artifact rows |

`solemd.graph_runs` status is a 1..5 enum:

```sql
status SMALLINT NOT NULL DEFAULT 1,
CONSTRAINT ck_graph_runs_status CHECK (status BETWEEN 1 AND 5)
```

The serve-cluster Drizzle row also called `graph_runs` has a different shape
(text status, `bundle_uri`, `bundle_checksum`). See `bundle-publication.md`
for the divergence.

### Corpus and paper text

| Table | Role |
|---|---|
| `solemd.corpus` | Canonical paper identity table (`corpus_id` is the primary key everything joins on) |
| `solemd.papers` | Paper-level structured metadata |
| `solemd.paper_text` | Full text storage (lz4 compression on long columns) |
| `solemd.paper_documents` | Per-document spine (one row per `corpus_id`) |
| `solemd.paper_sections` | Section segmentation per document |
| `solemd.paper_blocks` | Block-level text spine, hash-partitioned 32-way on `corpus_id`, lz4 on `text` |
| `solemd.paper_sentences` | Sentence segmentation, hash-partitioned 32-way |
| `solemd.paper_chunks` | Chunk text output, hash-partitioned 32-way |
| `solemd.paper_chunk_members` | Chunk-to-sentence membership |
| `solemd.paper_evidence_units` | Evidence-unit grain for downstream RAG |
| `solemd.paper_chunk_versions` | Active chunking policy ledger |

### Authors, venues, citations

| Table | Role |
|---|---|
| `solemd.authors` / `solemd.paper_authors` | Author identity and paper-author edges |
| `solemd.venues` | Venue dimension |
| `solemd.paper_citations` | Inter-paper citation edges |

### Vocabulary and selection (corpus building)

| Table | Role |
|---|---|
| `solemd.vocab_terms` / `solemd.vocab_term_aliases` | Controlled vocabulary universe |
| `solemd.corpus_selection_runs` | Per-run corpus selection ledger |
| `solemd.corpus_selection_signals` | Per-paper signal rows feeding selection |
| `solemd.paper_corpus_assignments` | Final selection assignment |
| `solemd.corpus_selection_artifacts` / `corpus_selection_chunks` | Artifact outputs |
| `solemd.paper_entity_signals` / `paper_entity_signal_builds` | Per-paper entity-signal materializations |
| `solemd.paper_selection_summary` | Paper-level summary across runs |
| `solemd.corpus_wave_runs` / `corpus_wave_members` | Wave-based corpus expansion |

### External API mirrors and enrichment

| Table | Role |
|---|---|
| `solemd.s2_papers_raw` / `s2_paper_authors_raw` / `s2_authors_raw` | Semantic Scholar raw mirror |
| `solemd.s2_paper_reference_metrics_raw` / `_stage` | Reference-metric staging |
| `solemd.s2_dataset_cursors` / `s2_dataset_diff_manifests` / `s2_dataset_diff_files` | S2 incremental dataset cursoring |
| `solemd.pubmed_metadata_fetch_runs` / `pubmed_metadata_fetch_tasks` / `pubmed_metadata` | PubMed fetch ledgers and metadata |
| `solemd.s2_graph_enrichment_runs` / `s2_graph_enrichment_tasks` / `s2_paper_enrichment` | S2 graph enrichment |

## `pubtator` (Warehouse) Highlights

PubTator3 is mirrored as raw + canonical, both partitioned by `corpus_id`:

| Table | Role |
|---|---|
| `pubtator.entity_annotations_stage` | Raw staging during ingest |
| `pubtator.entity_annotations` | Canonical entity annotations, hash-partitioned 32-way on `corpus_id` |
| `pubtator.relations_stage` | Raw relation staging |
| `pubtator.relations` | Canonical relations, hash-partitioned 32-way on `corpus_id` |

Definitions live in `db/schema/warehouse/40_tables_core.sql:434-580` and are
indexed in `50_indexes.sql:147-200`.

Treat `pubtator.entity_annotations` and `pubtator.relations` as the canonical
upstream for every entity/relation flow into the graph. The wave/selection
pipeline reads counts from there to emit signals that feed
`solemd.paper_entity_signals`.

## Browser-Side Point Tables (Bundle Parquet, Not Postgres)

These names appear throughout the frontend and the bundle publication path,
and they are **not** Postgres tables. They are parquet files inside a
published bundle, plus DuckDB-WASM views constructed on top.

Bundle parquet (immutable, checksum-addressed):

| Asset | Role |
|---|---|
| `base_points.parquet` | Always-loaded scaffold; mandatory for first paint |
| `base_clusters.parquet` | Cluster centroids and metadata for first paint |
| `universe_points.parquet` | Mapped remainder available for promotion |
| `paper_documents.parquet` | Per-paper metadata for detail panels (lazy) |
| `cluster_exemplars.parquet` | Paper-level preview rows per cluster (lazy) |

DuckDB-WASM views (browser-side, materialized over parquet):

| View | Role |
|---|---|
| `base_points_web` / `base_points_canvas_web` | Base render input + lookup view |
| `universe_points_web` / `universe_points_canvas_web` | Universe render input + lookup view |
| `overlay_points_web` / `overlay_points_canvas_web` | Promoted-overlay subset views |
| `active_points_web` / `active_points_canvas_web` | Dense union of base + active overlay |

The browser does not see warehouse Postgres. It loads bundle parquet via the
checksum URL contract and registers views in DuckDB. See
`bundle-publication.md` for the publish surface and
`docs/map/graph-runtime.md` for the browser-side view contract.

## Graph Build Tables (Serve Cluster)

The serve cluster carries the serving-side projections that publish builds
emit:

| Table | Role |
|---|---|
| `solemd.graph_run_metrics` | Per-run quality / volume metrics |
| `solemd.graph_clusters` | Cluster dimension table |
| `solemd.graph_points` | Per-paper point (id, position, color, layer flags) |
| `solemd.graph_base_points` | Lean INSERT-only base-admission ledger (`is_in_current_base` source) |
| `solemd.graph_cluster_api_cards` | Pre-rendered cluster-level API cards |
| `solemd.paper_api_cards` / `paper_api_profiles` | Per-paper API cards/profiles |
| `solemd.paper_semantic_neighbors` | Per-paper neighbor lookup |
| `solemd.serving_runs` / `serving_artifacts` / `serving_cohorts` / `serving_members` | Serving cohort universe |
| `solemd.api_projection_runs` | Per-run projection ledger |
| `solemd.active_runtime_pointer` | Pointer to the currently-active runtime row |
| `solemd.wiki_pages` / `wiki_sync_runs` | Wiki materialization |

`graph_base_points` is the canonical INSERT-only base-admission table; do not
re-add `is_in_base` / `base_rank` columns to `graph_points`.

## Foreign Key Invariants

A few load-bearing invariants:

- Almost everything joins back to `solemd.corpus(corpus_id)`.
- Most tables also reference `solemd.source_releases(source_release_id)` so a
  release rollback is possible.
- Hash-partitioned tables (`paper_blocks`, `paper_sentences`, `paper_chunks`,
  `paper_chunk_members`, `pubtator.entity_annotations`,
  `pubtator.relations`) use `modulus 32` partitions on `corpus_id`. Don't
  drop the partition definitions when migrating.

## References

- `../SKILL.md` for ownership and triage routing
- `bundle-publication.md` for the publish flow and `graph_runs` divergence
- `docs/map/database.md` for the human-facing schema map
- `docs/map/graph-runtime.md` for the browser/DuckDB view contract
- `db/schema/warehouse/` for canonical SQL
- `db/schema/serve/` for serve-cluster SQL
