# Warehouse Baseline Scope

This directory defines the structural warehouse-cluster baseline for the first
warehouse schema slice.

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
  - `solemd.s2_paper_references_raw`
  - `solemd.s2_paper_assets_raw`

## Intentionally deferred

- partitioned fact families (`paper_citations`, `paper_concepts`,
  `paper_relations`, `paper_blocks`, `paper_sentences`, mention tables, and
  related partition children)
- PubTator and UMLS physical table inventory
- grounding/packet-assembly tables beyond `paper_chunk_versions`
- graph bundle artifact inventory and warehouse-local embedding tables
- scheduler wiring and any runtime jobs that depend on these tables
- non-stock extensions (`vector`, `hypopg`, `pg_cron`, `pg_partman`) that
  require the warehouse image/config slice before first apply

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
