# Warehouse Baseline Scope

This directory defines the structural warehouse-cluster baseline plus the
extension-safe ingest/chunking foundation for the next warehouse schema slice.

## In scope for this slice

- cluster-local roles and grants for the documented warehouse DSN split
- warehouse schemas and stock-image structural extensions
- foundational lifecycle/control tables:
  - `solemd.source_releases`
  - `solemd.ingest_runs`
  - `solemd.paper_chunk_versions`
  - `solemd.graph_runs`
- canonical identity/bibliographic scaffolding:
  - `solemd.corpus`
  - `solemd.venues`
  - `solemd.authors`
  - `solemd.papers`
  - `solemd.paper_text`
  - `solemd.paper_authors`
- raw Semantic Scholar ingest staging tables:
  - `solemd.s2_papers_raw`
  - `solemd.s2_paper_authors_raw`
  - `solemd.s2orc_documents_raw`
  - `solemd.s2_paper_references_raw`
  - `solemd.s2_paper_assets_raw`
- PubTator stage plus selection-owned canonical tables:
  - `pubtator.entity_annotations_stage`
  - `pubtator.entity_annotations`
  - `pubtator.relations_stage`
  - `pubtator.relations`
- chunking/grounding spine tables that stay on stock PostgreSQL types:
  - `solemd.paper_documents`
  - `solemd.paper_sections`
  - `solemd.paper_blocks`
  - `solemd.paper_sentences`
  - `solemd.paper_text_acquisition_runs`
  - `solemd.paper_chunks`
  - `solemd.paper_chunk_members`
  - `solemd.paper_evidence_units`
  - `solemd.chunk_runs`
  - `solemd.chunk_assembly_errors`
- grant updates that keep canonical promotion and chunk assembly on the
  `engine_ingest_write` role instead of routing them through warehouse admin
- deterministic `paper_evidence_units.evidence_key` as a writer-owned UUIDv5
  with no database default, and an intentionally unpartitioned
  `paper_evidence_units` table while the fully grounded hot cohort remains
  small (roughly hundreds of papers, not millions)
- targeted evidence-wave refresh lineage for PMC BioC-backed paper-level document
  replacement on the same canonical grounding spine
- selected-corpus and mapped/evidence-wave lineage tables for post-ingest corpus
  selection and evidence child-wave dispatch:
  - `solemd.vocab_terms`
  - `solemd.vocab_term_aliases`
  - `solemd.corpus_selection_runs`
  - `solemd.corpus_selection_signals`
  - `solemd.paper_selection_summary`
  - `solemd.corpus_wave_runs`
  - `solemd.corpus_wave_members`
- chunking hardening on the same stock-PG surface:
  - DB-level CHECK constraints on the new SMALLINT enum columns
  - parent-column LZ4 compression for partitioned text tables
  - explicit retry-count bound on `chunk_assembly_errors`

## Still intentionally deferred

- citation, concept, and relation fact families beyond the chunking spine
- broader PubTator mention-alignment families and UMLS physical table inventory
  beyond the current first-lane stage/canonical tables
- mention tables and broader grounding packet-assembly families outside the
  chunking path
- scheduler wiring and any runtime jobs that depend on these tables
- graph bundle artifact inventory and warehouse-local embedding tables
- non-stock extensions (`vector`, `hypopg`, `pg_cron`, `pg_partman`) that
  require the warehouse image/config slice before first apply
- repartitioning `paper_evidence_units`; revisit only when the fully grounded
  evidence path materially expands beyond the initial hot cohort

## Tradeoffs kept explicit

- `paper_blocks.section_ordinal` and the related sentence/block coordinates do
  not carry the heavier cross-table FKs in this slice. That remains an ingest /
  chunker consistency concern so bulk COPY paths stay simple.

## Apply path note

The initial warehouse baseline creates roles and structural extensions. A fresh
empty-cluster apply therefore needs a connection with sufficient privileges for
the first run. Until the migration runner grows a dedicated warehouse bootstrap
env path, the first apply should use
`scripts/schema_migrations.py apply --cluster warehouse --dsn ...` with a
warehouse bootstrap/superuser connection.

Schema-authoring rule for future warehouse slices:
- `engine_warehouse_admin` owns the warehouse schemas after bootstrap, but it
  does not create them from a fresh cluster by itself.
- New schemas on fresh apply must follow the current pattern: create under the
  bootstrap/admin connection, then `ALTER SCHEMA ... OWNER TO
  engine_warehouse_admin`.
- Do not regress to `SET ROLE engine_warehouse_admin; CREATE SCHEMA ...` for a
  fresh-start migration path.
