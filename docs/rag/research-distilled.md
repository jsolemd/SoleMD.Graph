# 2026 Best-Practice Research — Curated Synthesis

Distilled findings from the seven-cluster research run on 2026-04-16, backing
the decisions recorded in this folder. The raw agent transcripts were
conversational and are not preserved. This is the durable artifact.

Archive rule:

- this file preserves the research snapshot, including historical tool
  comparisons and time-bound version statements
- it is not the implementation ledger
- current migration/auth posture lives in `12-migrations.md` and `13-auth.md`
- current runtime version inventory lives in `16-version-inventory.md`

## Research context

- **Project**: SoleMD.Graph — biomedical knowledge graph (~14 M papers,
  Semantic Scholar + PubTator3), clean-slate rebuild after a VHD transition
  that wiped the prior PG instance and named Docker volumes.
- **Host**: NVIDIA-Workbench WSL2, Ryzen 9 9950X3D (16c / 32t), 68 GB RAM
  today / 128 GB planned, RTX 5090, NVMe (`/var/lib/docker`, 1 TB) +
  internal-NVMe-backed E-drive VHDX (`/mnt/solemd-graph`, 2 TB ext4).
- **Pinned stack at research time**: PostgreSQL 18, OpenSearch 3.6, Redis 8,
  Python 3.13 (uv-managed), Next.js 16 on Vercel, and a GPU-first worker
  posture on the RTX 5090. Treat this as an archival snapshot; the active
  version ledger is `16-version-inventory.md`.
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
+ Pydantic v2; ordered SQL schema files author the desired state and
`schema_migrations.py` applies versioned SQL migrations; Dramatiq AsyncIO
middleware with shared pools; Testcontainers for integration tests.

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
SQL-first schema authoring; `lz4` TOAST; fillfactor tiering (provisional);
skip-scan applied opportunistically; pgvector HNSW deferred; no columnar
today.

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
- PostgreSQL 18's own docs matter here: `maintenance_work_mem` is a
  budget for the **utility command**, not a simple per-worker multiplier.
  Parallel `CREATE INDEX` uses that total budget while requiring only a
  minimum slice per worker. Treat `max_parallel_maintenance_workers` as a
  CPU / I/O concurrency knob first, not as linear RAM multiplication.
- Because the E-drive VHDX is confirmed internal-NVMe-backed, treat it as
  NVMe-backed virtualization rather than raw direct-attached NVMe. Start
  warehouse tuning around `effective_io_concurrency=128` and
  `random_page_cost=1.25`, then re-measure from there.
- WSL2 host tuning should follow the Linux-native path: enable `systemd`
  in `/etc/wsl.conf`, persist sysctls in `/etc/sysctl.d/*.conf`, and let
  `systemd-sysctl` apply them at boot. Use WSL's global `.wslconfig` for
  VM-level limits such as `memory=` and, if explicit HugeTLB reservation
  proves timing-sensitive at boot, `kernelCommandLine`.
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
`random_page_cost≈1.25`) and then be refined in `09-tuning.md`. WSL gets
an explicit `.wslconfig memory=` cap rather than inheriting the default
50 % host-RAM limit.

### Primary sources

- PG 18 async I/O in production — <https://postgresqlhtx.com/postgresql-18-async-i-o-in-production-real-world-benchmarks-configuration-patterns-and-storage-performance-in-2026/>
- PG 18 vacuuming improvements — <https://techcommunity.microsoft.com/blog/adforpostgresql/postgresql-18-vacuuming-improvements-explained/4459484>
- Crunchy on server performance — <https://www.crunchydata.com/blog/optimize-postgresql-server-performance>
- PG 18 resource consumption — <https://www.postgresql.org/docs/18/runtime-config-resource.html>
- PG 18 `CREATE INDEX` — <https://www.postgresql.org/docs/18/sql-createindex.html>
- PG 18 WAL config — <https://www.postgresql.org/docs/current/runtime-config-wal.html>
- docker-library/postgres#1365 — <https://github.com/docker-library/postgres/issues/1365>
- WSL advanced config — <https://learn.microsoft.com/en-us/windows/wsl/wsl-config>
- WSL systemd — <https://learn.microsoft.com/en-us/windows/wsl/systemd>
- `sysctl.d(5)` — <https://man7.org/linux/man-pages/man5/sysctl.d.5.html>

## 6. Monorepo deployment and package boundaries

### Key findings

- Monorepo deployment works best when each deployable has its own root
  directory and environment contract instead of one broad "app plus helpers"
  tree.
- Vercel's monorepo flow is explicitly project-per-root-directory, with support
  for skipping unaffected projects when internal dependencies are declared
  clearly.
- Turborepo's package model is intentionally simple: application packages are
  deployable leaves of the package graph; library packages are shared code and
  should not be promoted to deployables by accident.
- Internal packages should exist for real reuse boundaries, not as a reflexive
  decomposition of every feature folder.

### Applied decisions

Use deployment-first repository naming:

- `apps/web`
- `apps/api`
- `apps/worker`
- `packages/*` only for true shared code
- `db/` for SQL authority

Keep wiki as a web feature plus worker/API support surfaces rather than forcing
it into a separate package. Keep browser graph runtime as a package because it
is a real runtime contract shared across the frontend surface.

### Primary sources

- Vercel monorepos — <https://vercel.com/docs/monorepos>
- Turborepo internal packages — <https://turborepo.dev/docs/crafting-your-repository/creating-an-internal-package>
- Turborepo package types — <https://turborepo.dev/docs/core-concepts/package-types>

## 7. OpenSearch 3.x serving plane

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
- OpenSearch's own guidance still says JVM heap should be about half the
  memory available to the system, with `bootstrap.memory_lock=true` and
  `vm.max_map_count>=262144`. On this stack the better interpretation is
  a **31 GB cap**, not an always-grow target: Faiss HNSW is mmap-served
  from disk, so extra RAM above that should flow to the OS file cache
  rather than to JVM heap.
- Synonym strategy: search-time `synonym_graph` with `updateable: true`,
  artifact derived from `concept_search_aliases` filtered by
  `eligible_for_search_synonym = true`, with `synonym_version` stamped on
  serving docs for audit.
- Bulk-load pattern: create new index with `refresh_interval=-1`,
  `number_of_replicas=0`; bulk 1 k–5 k docs per batch; force-merge to 1
  segment; restore live settings; atomic alias swap.

### Applied decisions

Two release-scoped concrete indexes (`paper_index_<run_token>`,
`evidence_index_<run_token>`) behind stable live aliases
(`paper_index_live`, `evidence_index_live`); Faiss HNSW + fp16
provisional; engine-side rerank; filtered synonym pipeline; release
cutover via alias swap. Concrete mappings and pipeline definitions in
`07-opensearch-plane.md`.

### Primary sources

- OpenSearch 3.6 announcement — <https://opensearch.org/blog/introducing-opensearch-3-6/>
- OpenSearch system settings — <https://docs.opensearch.org/latest/install-and-configure/configuring-opensearch/configuration-system/>
- OpenSearch hybrid search — <https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/index/>
- Score ranker processor (RRF) — <https://docs.opensearch.org/latest/search-plugins/search-pipelines/score-ranker-processor/>
- k-NN methods and engines — <https://docs.opensearch.org/latest/mappings/supported-field-types/knn-methods-engines/>
- OpenSearch memory-optimized search — <https://docs.opensearch.org/latest/vector-search/optimizing-storage/memory-optimized-search/>
- Index aliases — <https://docs.opensearch.org/latest/im-plugin/index-alias/>
- NCBI MedCPT — <https://github.com/ncbi/MedCPT>

## 8. Observability, backup, and ops

### Key findings

- Langfuse tracing clients should target the latest SDKs: Python SDK v4
  today, and JS/TS SDK v5 when frontend traces land later. The Python
  v4 migration matters operationally because it changes the tracing
  model to observation-centric instrumentation
  (`propagate_attributes()`, `start_as_current_observation()`) and
  changes default span-export filtering.
- Langfuse Fast Preview / the observation-centric v4 product experience
  remains Cloud-only today. Self-hosted OSS still follows the current
  v3 platform deployment path; do **not** assume Observations API v2 /
  Metrics API v2 availability on self-hosted deployments yet.
- Langfuse Cloud Hobby is a strong workstation-phase default: 50k units
  / month included, 30 days data access, 2 users, and no local PG /
  ClickHouse / Redis / blob-store footprint.
- Serve is precious (projections, future auth / user-data). pgBackRest
  full weekly + daily incremental + 5–10 min WAL, local repo + off-box
  mirror (Backblaze B2 candidate).
- Self-hosted Langfuse requires more than web/worker + Postgres +
  ClickHouse: it also requires Redis / Valkey and a mandatory
  S3-compatible blob store for event uploads, media, and exports.
  MinIO is the documented self-hosted local option.
- Before pgBackRest is actually wired, the correct PostgreSQL posture is
  `archive_mode=off`. Do **not** normalize fake-success placeholders such
  as `archive_command='/bin/true'`; PostgreSQL documents that as
  effectively disabling archiving while reporting success.
- Langfuse built-in data retention on self-hosted is Enterprise-only.
  OSS self-host defaults to indefinite retention; if we want a 90-day
  policy on workstation/shared-infra, that requires either an EE
  license or an explicit manual cleanup/export runbook.
- Langfuse Cloud Hobby's 30-day data-access limit changes the benchmark
  archival contract: datasets and important run history need an export
  mirror if they must survive beyond the active month.
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
- When pgBackRest lands for real, wire it atomically: repo config,
  `stanza-create`, `check`, real `archive_command`, and local
  `spool-path`; enable `archive-async` only with that complete path in
  place.
- SQL-first schema authoring and CI drift checks around generated snapshots;
  keep `schema_migrations.py` as executor ledger (audit history is worth
  preserving).
- Secrets: 1Password CLI + direnv (`op run`) — zero disk persistence,
  < 1 s resolution, trivial path to prod secrets managers.

### Applied decisions

pgBackRest on serve; logical dumps on warehouse canonical-derived;
Prom / Grafana / Loki / Alloy stack in the always-up profile; SQL-first schema
authoring; 1Password + direnv for secrets. Concrete runbooks land in
`10-observability.md`, `11-backup.md`, and `12-migrations.md`. Until
`11-backup.md` lands, serve archiving stays off rather than using a
placeholder success command. Langfuse observability uses Python SDK v4
at the engine boundary and Langfuse Cloud Hobby for the current
workstation phase; self-hosting is deferred unless cloud limits,
retention, or data-control requirements become the forcing function.

### Primary sources

- pgBackRest — <https://pgbackrest.org/>
- Langfuse SDK overview — <https://langfuse.com/docs/observability/sdk/overview>
- Langfuse Python v3 → v4 — <https://langfuse.com/docs/observability/sdk/upgrade-path/python-v3-to-v4>
- Langfuse JS/TS v4 → v5 — <https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5>
- Langfuse Fast Preview / v4 — <https://langfuse.com/docs/v4>
- Langfuse pricing — <https://langfuse.com/pricing>
- Langfuse billable units — <https://langfuse.com/docs/administration/billable-units>
- Langfuse cloud deployment — <https://langfuse.com/docs/deployment/cloud>
- Langfuse data regions — <https://langfuse.com/security/data-regions>
- Langfuse self-hosting overview — <https://langfuse.com/self-hosting>
- Langfuse blob storage (self-hosted) — <https://langfuse.com/self-hosting/deployment/infrastructure/blobstorage>
- Langfuse ClickHouse (self-hosted) — <https://langfuse.com/self-hosting/deployment/infrastructure/clickhouse>
- pgBackRest user guide — <https://pgbackrest.org/user-guide.html>
- pgBackRest configuration reference — <https://pgbackrest.org/configuration.html>
- PG 18 jsonlog — <https://www.postgresql.org/about/featurematrix/detail/jsonlog-logging-format/>
- PG 18 WAL archiving — <https://www.postgresql.org/docs/current/runtime-config-wal.html>
- Langfuse data retention — <https://langfuse.com/docs/administration/data-retention>
- Atlas v0.36 PG partitions — <https://atlasgo.io/blog/2025/07/21/v036-snowflake-postgres-partitions-and-azure-devops>
- Grafana Loki OSS — <https://grafana.com/oss/loki/>
- 1Password direnv — <https://github.com/tmatilai/direnv-1password>
- Backblaze B2 vs Cloudflare R2 (ThemeDev, 2026) — <https://themedev.net/blog/cloudflare-r2-vs-backblaze-b2/>

## 9. Langfuse alternatives and fallback ladder

### Key findings

- If Langfuse Cloud Hobby's `50k` monthly-unit budget or `30`-day data
  access becomes constraining, the cleanest managed alternatives for
  SoleMD.Graph are **Phoenix Cloud / AX** and **Braintrust**.
- **Phoenix OSS** is the best lightweight local fallback when the
  constraint is RAM / local footprint rather than SaaS cost. It stays
  close to OpenTelemetry / OpenInference, keeps the exit cost low, and
  has a strong eval surface for RAG-heavy systems.
- **Braintrust** is the strongest "trace-to-eval" managed alternative
  if the priority is turning production traces directly into datasets,
  scorers, and experiments. Its free Starter plan is unusually usable
  for a solo developer.
- **LangSmith** is credible and feature-rich, but the fit is best when
  the product is already strongly LangChain / LangGraph-shaped. For
  SoleMD.Graph's current engine direction, that ecosystem bias is more
  coupling than benefit.
- **Helicone** is best understood as a cheap gateway / request logger,
  not the primary evaluation control plane. Its token / cost visibility
  is good, but the experiment surface is no longer the differentiator.
- **W&B Weave** remains a good Python-first eval / tracing option with
  strong cost tracking, but it is not a lighter operational fit than
  Phoenix for this stack.

### Applied decision

Stay on **Langfuse Cloud Hobby** for the current workstation phase. The
fallback ladder is:

1. **Phoenix OSS** if the forcing function is "keep it local, keep it
   small, keep it standards-based."
2. **Phoenix Cloud / AX** if the forcing function is better managed
   RAG eval tooling without self-hosting.
3. **Braintrust** if the forcing function is a stronger production-trace
   to evaluation workflow with generous free collaboration limits.

That keeps the current decision reversible without rewriting the entire
observability contract around a gateway-specific or framework-specific
vendor.

### Primary sources

- Phoenix home / product overview — <https://phoenix.arize.com/>
- Phoenix evaluation overview — <https://arize.com/docs/phoenix/evaluation/llm-evals>
- Phoenix evaluators API — <https://arize.com/docs/phoenix/api/evaluation-models>
- Braintrust pricing — <https://www.braintrust.dev/pricing>
- Braintrust observe docs — <https://www.braintrust.dev/docs/observe>
- Braintrust plans and limits — <https://www.braintrust.dev/docs/reference/limits>
- LangSmith pricing — <https://www.langchain.com/pricing>
- LangSmith product / observability — <https://www.langchain.com/langsmith>
- Helicone pricing — <https://www.helicone.ai/pricing>
- Helicone gateway overview — <https://docs.helicone.ai/gateway/overview>
- Weave OpenAI integration / cost tracking — <https://docs.wandb.ai/weave/guides/integrations/openai>
- Weave trace plots — <https://docs.wandb.ai/weave/guides/tracking/trace-plots>

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
