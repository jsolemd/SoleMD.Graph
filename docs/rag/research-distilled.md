# 2026 Best-Practice Research — Curated Synthesis

Distilled findings from the seven-cluster research run on 2026-04-16, backing
the decisions recorded in this folder. The raw agent transcripts were
conversational and are not preserved. This is the durable artifact.

## Research context

- **Project**: SoleMD.Graph — biomedical knowledge graph (~14 M papers,
  Semantic Scholar + PubTator3), clean-slate rebuild after a VHD transition
  that wiped the prior PG instance and named Docker volumes.
- **Host**: NVIDIA-Workbench WSL2, Ryzen 9 9950X3D (16c / 32t), 68 GB RAM
  today / 128 GB planned, RTX 5090, NVMe (`/var/lib/docker`, 1 TB) +
  internal-NVMe-backed E-drive VHDX (`/mnt/solemd-graph`, 2 TB ext4).
- **Pinned stack**: PostgreSQL 18, OpenSearch 3.6, Redis 8, Python 3.13
  (uv-managed), Next.js 16 on Vercel, CUDA 13.2 + RAPIDS.
- **Target shape**: two PG clusters (warehouse cold / serve hot), OpenSearch
  serving plane, MedCPT retrieval cascade, object-storage-style archive for
  cold artifacts.

## 1. Topology, propagation, and user-auth

### Key findings

- Tablespaces within one cluster do not isolate WAL, `shared_buffers`, or
  backups. Two clusters is the correct boundary when storage class and
  lifecycle differ — Cybertec and the PG docs agree.
- PG 18 logical replication improved (failover slots, parallel streaming)
  but `wal_level=logical` raises WAL volume and competes with the
  minimal-WAL `COPY` fast path. For bulk warehouses this is an ingest-side
  tax measured at 20–30 %.
- Supabase self-hosted is **not** supported with an external Postgres.
  Running the full Supabase stack adds seven services (Kong, GoTrue,
  PostgREST, Realtime, Storage, Studio, Meta) to gain features we don't
  need. Better Auth (TypeScript, Drizzle-compatible, PG-native) is the 2026
  replacement for Auth.js / Lucia for this shape.
- PgBouncer 1.25.1 (Dec 2025) supports prepared statements in transaction
  mode since 1.21. PgCat (Rust) does not. PG 18 does **not** have a
  built-in connection pooler — that was folklore.

### Applied decisions

Two clusters; batch projection + bounded `postgres_fdw` for grounding
dereference (no logical replication); PgBouncer 1.25.1 txn-mode on serve
only; Better Auth deferred until user-data lands.

### Primary sources

- PG 18 release notes — <https://www.postgresql.org/docs/release/18.0/>
- PG tablespaces (§22.6) — <https://www.postgresql.org/docs/current/manage-ag-tablespaces.html>
- PG logical replication restrictions (§29.8) — <https://www.postgresql.org/docs/current/logical-replication-restrictions.html>
- Cybertec on tablespaces — <https://www.cybertec-postgresql.com/en/when-to-use-tablespaces-in-postgresql/>
- PgBouncer changelog — <https://www.pgbouncer.org/changelog.html>
- Supabase external-PG discussion — <https://github.com/orgs/supabase/discussions/7018>
- Better Auth — <https://better-auth.com/>

## 2. Ingest architecture

### Key findings

- For 638 GB parquet → PG 18 with 32 hash partitions, the fastest path is
  DuckDB as streaming transformer + `asyncpg.copy_records_to_table` in
  binary `COPY FROM STDIN`, fanning out to per-partition leaf tables.
- `pg_parquet` v0.5.1 (Oct 2025) exists but has no partition-aware routing
  and no TB-scale benchmarks yet. Not the hot-path tool.
- UNLOGGED load → `CREATE INDEX` (parallel, not CONCURRENTLY — table is
  empty of readers) → `SET LOGGED` is the correct order in PG 18. Parallel
  GIN builds added in 18 (~45 % speedup).
- BioCXML → `lxml.iterparse` with per-parent `element.clear()`, then feed
  into the same asyncpg binary `COPY` pipeline as S2.
- Embeddings: `halfvec(768)` from day one (50 % storage, recall parity, up
  to 29× faster parallel HNSW build vs `vector`).
- Estimated full S2 bulk load: 5–9 hours on this hardware (not 3 days) with
  UNLOGGED staging + 32-way parallel binary COPY.

### Applied decisions

DuckDB + asyncpg binary COPY with 32 partition fan-out; UNLOGGED load;
post-load parallel `CREATE INDEX`; `SET LOGGED`; `VACUUM (FREEZE, ANALYZE)`.
`halfvec` kept as provisional until sample build confirms recall.

### Primary sources

- asyncpg bulk COPY throughput — <https://magic.io/blog/asyncpg-1m-rows-from-postgres-to-python/>
- PG 18 async I/O (pganalyze) — <https://pganalyze.com/blog/postgres-18-async-io>
- pgvector parallel HNSW (AWS) — <https://aws.amazon.com/blogs/database/load-vector-embeddings-up-to-67x-faster-with-pgvector-and-amazon-aurora/>
- halfvec (Neon) — <https://neon.com/blog/dont-use-vector-use-halvec-instead-and-save-50-of-your-storage-cost>
- `pg_parquet` (Crunchy Data) — <https://github.com/CrunchyData/pg_parquet>
- EDB on bulk loading — <https://www.enterprisedb.com/blog/7-best-practice-tips-postgresql-bulk-data-loading>

## 3. Async Python stack

### Key findings

- asyncpg 0.31 (Nov 2025) still edges psycopg3 3.3 on tight per-query paths
  and wins decisively on bulk `COPY`. psycopg3 closes the gap only with
  pipeline mode on round-trip-heavy paths.
- SQLAlchemy 2.1 async is production-ready but brings ORM identity-map and
  unit-of-work overhead that doesn't pay off on canonical-SQL-first code.
  Pydantic v2 at the DB boundary is enough.
- Atlas v0.36 (Jul 2025) added PostgreSQL partition support — previously
  the blocker. Alembic is SQLAlchemy-coupled and not a fit here.
- Dramatiq 2.1 AsyncIO middleware runs a persistent event loop per worker
  thread — cleaner than `asyncio.run()` per actor.
- Testcontainers session-scoped PG + function-scoped transaction-rollback
  fixture is the 2026 testing floor.

### Applied decisions

asyncpg as the default driver; psycopg3 for admin / sync utilities; raw SQL
+ Pydantic v2; Atlas authors migrations, `schema_migrations.py` applies
them; Dramatiq AsyncIO middleware with shared pools; Testcontainers for
integration tests.

### Primary sources

- asyncpg releases — <https://github.com/MagicStack/asyncpg/releases>
- psycopg 3.3 announcement — <https://www.psycopg.org/articles/2025/12/01/psycopg-33-released/>
- Atlas v0.36 PG partitions — <https://atlasgo.io/blog/2025/07/21/v036-snowflake-postgres-partitions-and-azure-devops>
- Atlas vs classic migration tools — <https://atlasgo.io/atlas-vs-others>
- PgBouncer 1.21 prepared-statement txn mode (Crunchy) — <https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer>

## 4. Canonical schema microdesign (PG 18)

### Key findings

- 32 hash partitions for `corpus_id` remains correct. 64 risks landing
  outside PG 18's 64-slot fast-path lock table when multiplied by local
  indexes, producing `LWLock:LockManager` contention.
- BIGINT sequence for `corpus_id` / `concept_id`; UUIDv7 (PG 18 native
  `uuidv7()`) for run / version identities (`ingest_run_id`,
  `graph_run_id`, `chunk_version_key`, `api_projection_run_id`); UUIDv5
  for `evidence_key` (content-bound, round-trippable from serving docs,
  not time-ordered).
- MAXALIGN column ordering (8 B → 4 B → 2 B → 1 B → variable) saves 8–16 B
  per tuple at 100 M-row scale. Worth doing on a fresh build.
- `default_toast_compression = lz4` cluster-wide. LZ4 is 2–4× faster
  decompression than pglz with similar ratios. Zstd TOAST is staged but
  not yet in the GUC enum as of PG 18.
- Fillfactor: 100 on append-mostly large facts; 90 on occasional-update;
  80 on status-flipping control. 70 is empirically worse than 80.
- PG 18 skip scan can retire some speculative reverse-direction partial
  indexes. Verify per-table with EXPLAIN.
- HNSW at 14 M × `halfvec(768)` with `m=24, ef_construction=128` builds in
  3–6 h with `maintenance_work_mem=32GB` and
  `max_parallel_maintenance_workers=8`. Rag-future.md keeps ANN off in PG
  by default; defer.
- Columnar (Citus / Hydra) on `paper_citation_contexts`: defer until
  > 200 GB and the access pattern is provably scan-heavy.

### Applied decisions

32 hash partitions (provisional); BIGINT + UUIDv7 mix; MAXALIGN ordering in
HCL authoring; `lz4` TOAST; fillfactor tiering (provisional); skip-scan
applied opportunistically; pgvector HNSW deferred; no columnar today.

### Primary sources

- PG 18 release notes — <https://www.postgresql.org/docs/release/18.0/>
- PG 18 skip scan (Neon) — <https://neon.com/postgresql/postgresql-18/skip-scan-btree>
- PG 18 UUIDv7 (Nile) — <https://www.thenile.dev/blog/uuidv7>
- `default_toast_compression` — <https://pgpedia.info/d/default_toast_compression.html>
- Percona on column alignment — <https://www.percona.com/blog/postgresql-column-alignment-and-padding-how-to-improve-performance-with-smarter-table-design/>
- Crunchy on fillfactor — <https://www.crunchydata.com/blog/postgres-performance-boost-hot-updates-and-fill-factor>
- pgvector — <https://github.com/pgvector/pgvector>

## 5. Per-role PG 18 tuning

### Key findings

- The `postgres:18` Docker image is **not** built `--with-liburing`;
  `io_method=worker` is the safe default. Custom-image maintenance is not
  worth the ~5 s vs 15 s cold-cache delta for solo-dev work.
- Because the E-drive VHDX is confirmed internal-NVMe-backed, treat it as
  NVMe-backed virtualization rather than raw direct-attached NVMe. Start
  warehouse tuning around `effective_io_concurrency=128` and
  `random_page_cost=1.25`, then re-measure from there.
- PG 18 autovacuum knobs (`autovacuum_worker_slots`,
  `autovacuum_vacuum_max_threshold`,
  `vacuum_max_eager_freeze_failure_rate`) land useful defaults; tune
  per-table for bulk-load vs projection-upsert profiles.
- `wal_level=minimal` on warehouse preserves the `COPY` fast path;
  `wal_level=replica` on serve for any future streaming replica.
- `synchronous_commit=off` is safe during bulk ingest (loses at most
  3 × `wal_writer_delay` on crash, no corruption). Flip to `on` after the
  ingest window closes.

### Applied decisions

`io_method=worker` on both clusters; separate `postgresql.conf` per role;
warehouse on minimal-WAL + async-commit during ingest, serve on
replica-WAL + sync-commit always. Warehouse tuning should start from an
internal-NVMe-backed VHDX posture (`effective_io_concurrency≈128`,
`random_page_cost≈1.25`) and then be refined in `09-tuning.md`.

### Primary sources

- PG 18 async I/O in production — <https://postgresqlhtx.com/postgresql-18-async-i-o-in-production-real-world-benchmarks-configuration-patterns-and-storage-performance-in-2026/>
- PG 18 vacuuming improvements — <https://techcommunity.microsoft.com/blog/adforpostgresql/postgresql-18-vacuuming-improvements-explained/4459484>
- Crunchy on server performance — <https://www.crunchydata.com/blog/optimize-postgresql-server-performance>
- PG 18 WAL config — <https://www.postgresql.org/docs/current/runtime-config-wal.html>
- docker-library/postgres#1365 — <https://github.com/docker-library/postgres/issues/1365>

## 6. OpenSearch 3.x serving plane

### Key findings

- Single-node, 1 primary / 0 replicas, release-scoped indexes behind
  stable aliases. Component templates so multi-node is a shard-count
  change later.
- Faiss HNSW + fp16 scalar quantization is the 2026 default for MedCPT
  (768-dim). 1-bit SQ is new in 3.6 but recall loss is not trivial — defer.
- Hybrid search via native `hybrid` compound query + `score-ranker-processor`
  (RRF, added 2.19) in a search pipeline. Weights provisional.
- MedCPT query encoder + cross-encoder rerank run in `graph-engine-api`
  (FastAPI), **not** OpenSearch ML Commons. Cleaner GPU control, batching,
  and failover.
- Synonym strategy: search-time `synonym_graph` with `updateable: true`,
  artifact derived from `concept_search_aliases` filtered by
  `eligible_for_search_synonym = true`, with `synonym_version` stamped on
  serving docs for audit.
- Bulk-load pattern: create new index with `refresh_interval=-1`,
  `number_of_replicas=0`; bulk 1 k–5 k docs per batch; force-merge to 1
  segment; restore live settings; atomic alias swap.

### Applied decisions

Two release-scoped indexes (`paper_index`, `evidence_index`) behind
aliases; Faiss HNSW + fp16 provisional; engine-side rerank; filtered
synonym pipeline; release cutover via alias swap. Concrete mappings and
pipeline definitions in `07-opensearch-plane.md`.

### Primary sources

- OpenSearch 3.6 announcement — <https://opensearch.org/blog/introducing-opensearch-3-6/>
- OpenSearch hybrid search — <https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/>
- Score ranker processor (RRF) — <https://docs.opensearch.org/latest/search-plugins/search-pipelines/score-ranker-processor/>
- k-NN methods and engines — <https://docs.opensearch.org/latest/mappings/supported-field-types/knn-methods-engines/>
- Index aliases — <https://docs.opensearch.org/latest/im-plugin/index-alias/>
- NCBI MedCPT — <https://github.com/ncbi/MedCPT>

## 7. Observability, backup, and ops

### Key findings

- Serve is precious (projections, future auth / user-data). pgBackRest
  full weekly + daily incremental + 5–10 min WAL, local repo + off-box
  mirror (Backblaze B2 candidate).
- Warehouse is rebuildable from E-drive parquet releases. Back up only the
  canonical-derived schema (concepts, aliases, lifecycle, run metadata,
  grounding spine) as logical dumps.
- Off-box target recommendation: Backblaze B2 for rare-restore workloads
  (cheapest storage, paid egress). Cloudflare R2 only if restores are
  routine (zero egress, 2.5× storage).
- Monitoring: Prometheus + Grafana + `postgres_exporter` +
  `redis_exporter` + OpenSearch Performance Analyzer.
  `pg_stat_monitor` conflicts with `pg_stat_statements` at the executor
  hook — keep `pg_stat_statements`.
- Logs: PG 18 `log_destination = 'stderr,jsonlog'`; Grafana Alloy
  (Promtail EOL early 2026) → Loki → Grafana.
- Atlas for schema diff and CI lint; keep `schema_migrations.py` as
  executor ledger (audit history is worth preserving).
- Secrets: 1Password CLI + direnv (`op run`) — zero disk persistence,
  < 1 s resolution, trivial path to prod secrets managers.

### Applied decisions

pgBackRest on serve; logical dumps on warehouse canonical-derived;
Prom / Grafana / Loki / Alloy stack in the always-up profile; Atlas HCL
authoring; 1Password + direnv for secrets. Concrete runbooks land in
`10-observability.md`, `11-backup.md`, and `12-migrations.md`.

### Primary sources

- pgBackRest — <https://pgbackrest.org/>
- PG 18 jsonlog — <https://www.postgresql.org/about/featurematrix/detail/jsonlog-logging-format/>
- Atlas v0.36 PG partitions — <https://atlasgo.io/blog/2025/07/21/v036-snowflake-postgres-partitions-and-azure-devops>
- Grafana Loki OSS — <https://grafana.com/oss/loki/>
- 1Password direnv — <https://github.com/tmatilai/direnv-1password>
- Backblaze B2 vs Cloudflare R2 (ThemeDev, 2026) — <https://themedev.net/blog/cloudflare-r2-vs-backblaze-b2/>

## Lineage

The seven research clusters were run in parallel as `general-purpose`
agents on 2026-04-16 with shared project context (host, stack, target
architecture, scale) and per-cluster focus. This file is the curated
synthesis; the raw transcripts were not preserved to keep the docs folder
narrative rather than transcript-heavy.

Later documents in this folder should cite this file instead of
re-collecting primary sources. When a provisional decision is tested on a
sample build, add a dated note to the relevant section above rather than
editing the original finding.
