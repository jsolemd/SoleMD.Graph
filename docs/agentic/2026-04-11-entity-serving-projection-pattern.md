# Entity Serving Projection Pattern

This is the canonical rebuild shape for large derived PostgreSQL serving tables in
SoleMD.Graph.

## Principles

- Build into a staged table with `CREATE TABLE AS`, not `TRUNCATE + INSERT` on the live table.
- Add indexes and constraints on the staged table after the bulk load finishes.
- Keep the final serving table logged.
- Use session-local ETL settings only for the rebuild session.
- Swap with a short `lock_timeout` window.
- Run `ANALYZE` on the live table immediately after cutover.
- Drop redundant indexes only when the replacement query path is verified.

## Session Settings

Use these for large derived-table rebuild sessions:

- `jit = off`
- `work_mem = '1GB'`
- `maintenance_work_mem = '2GB'`
- `max_parallel_workers_per_gather = 8`
- `max_parallel_maintenance_workers = 4`
- `effective_io_concurrency = 200`
- `random_page_cost = 1.1`
- `parallel_tuple_cost = 0`
- `parallel_setup_cost = 0`
- `synchronous_commit = off`

These are rebuild-only knobs. They should not become global defaults without a
separate capacity review.

## Canonical Flow

1. `DROP TABLE IF EXISTS <table>_next, <table>_old`
2. `CREATE TABLE <table>_next AS ...`
3. Add `NOT NULL` / defaults / comments
4. Add PK and supporting indexes on `<table>_next`
5. `BEGIN`
6. `SET LOCAL lock_timeout = '10s'`
7. Rename live table to `_old` if it exists
8. Rename `<table>_next` to the canonical live name
9. Rename staged indexes and constraints to canonical names
10. Drop `<table>_old`
11. `COMMIT`
12. `ANALYZE <table>`

## Current Entity Surfaces

These entity-serving tables now follow that pattern in code:

- `solemd.entity_aliases`
- `solemd.entity_runtime_aliases`
- `solemd.entity_corpus_presence`

The orchestration lives in:

- [engine/app/corpus/entity_projections.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/entity_projections.py:1)
- [engine/app/corpus/entities.py](/home/workbench/SoleMD/SoleMD.Graph/engine/app/corpus/entities.py:1)

## Operational Order

For the UMLS-integrated entity rebuild, run work in this order:

1. `cd engine && uv run python scripts/enrich_vocab_terms.py`
2. `cd engine && uv run python -m app.corpus.entities`
3. Verify anatomy entities, drug normalization, alias-source distribution, and `/api/entities/match`
4. Drop redundant indexes if they still exist:
   - `solemd.idx_corpus_pmid`
   - `pubtator.idx_pt_entity_disease`
   - `pubtator.idx_pt_entity_chemical`
   - `pubtator.idx_pt_entity_gene`
5. The projection rebuild is the canonical refresh path. Do not keep or add
   one-off alias/highlight backfill scripts beside it.

## Data Safety

- Source tables are not deleted by these rebuilds.
- `solemd.entity_aliases`, `solemd.entity_runtime_aliases`, and
  `solemd.entity_corpus_presence` are derived serving surfaces and can be rebuilt.
- Index drops do not remove rows; they remove redundant access paths after the
  replacement path is verified.
