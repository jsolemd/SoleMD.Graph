# 09 — Tuning

> **Status**: locked for cluster-shape, posture deltas, memory math at
> 68 GB and 128 GB, file-ownership contract (`db/conf/<cluster>.conf`),
> per-table autovacuum reloption tiers, PgBouncer-serve sizing shape,
> and storage-aware GUC choices. Specific numeric values inside both
> `postgresql.conf` files — and the asyncpg per-pool sizes that match
> them — are **provisional until the first sample build measures
> them** (cohort projection cycle, full S2+PT3 ingest, hot-path RPS).
>
> **Date**: 2026-04-16
>
> **Scope**: every concrete tuning value for the two PG 18 clusters
> (`graph-db-warehouse`, `graph-db-serve`), the PgBouncer-serve pooler,
> the four asyncpg pools declared in `06`, the ingest-mode session
> overrides referenced by `05 §6`, and the storage-aware GUCs implied
> by `01 §6` and `00 §1`. Backups (`11`), logging shape (`10`), and
> migration mechanics (`12`) live elsewhere.
>
> **Authority**: this doc is the PG-native authority for *runtime
> values*. `02 §0` / `03 §0` remain authority for table shape; `04 §3`
> for swap mechanics; `05 §4` for ingest phase order; `06 §2` for the
> four-pool topology. Where 00–08 flagged a value as "owned by 09,"
> this document supplies it.

## Purpose

`02 / 03 / 04 / 05 / 06 / 07 / 08` describe a two-cluster topology
with mirror-image workloads. Warehouse is bulk-write + batch-read +
cold-most-of-the-time; serve is request-path read + always-hot +
periodic stage-and-swap DDL. Both clusters run on one host today
(NVIDIA-Workbench WSL2, Ryzen 9 9950X3D 16C/32T, 68 GB RAM today /
128 GB planned, RTX 5090, NVMe + internal-NVMe-backed VHDX), and
must coexist with OpenSearch (31 GB heap target, `07 §2.3`), Redis,
the Python engine worker, and the OS reserve. The math has to add up
or one of these will OOM the others.

This document lands the values that make that math add up at both
RAM points and codifies the discipline that keeps the two clusters
posturally distinct.

## §0 Conventions delta from `00` / `02` / `03` / `04` / `05` / `06`

Inherits every convention from those documents. This doc adds:

| Concern | Tuning delta |
|---|---|
| **`postgresql.conf` ownership** | Two files under `db/conf/`: `db/conf/warehouse.conf` (mounted into `graph-db-warehouse`) and `db/conf/serve.conf` (mounted into `graph-db-serve`). Each is the authority for cluster-level GUCs; `docker/compose.yaml` mounts the file read-only at `/etc/postgresql/postgresql.conf` and the entrypoint passes `-c config_file=/etc/postgresql/postgresql.conf`. The current `command:` chain in `docker/compose.yaml` is migrated into these files in one step (`12-migrations.md`). |
| **`pg_hba.conf` ownership** | Canonical repo-owned HBA files are `db/conf/warehouse_hba.conf` and `db/conf/serve_hba.conf`. They are mounted read-only into each cluster, use PostgreSQL first-match-wins ordering, and are paired with database `CONNECT` grants rather than treated as the only admission-control surface. |
| **Per-table autovacuum reloptions** | Every table in `02 §4` and `03 §4` carries an `ALTER TABLE … SET (autovacuum_*)` declaration in the SQL schema / migration surfaces, keyed to its fillfactor tier (§5 below). A generated include file is deferred until the reloption matrix proves stable enough to justify codegen. The cluster-level `autovacuum_*` GUCs in §3 / §4 are the **defaults**; per-table reloptions are the **deltas**. |
| **Memory math table** | Required artifact: §2 declares `shared_buffers + effective_cache_size` budgets per cluster at 68 GB and 128 GB and shows the host-level total adds up against OpenSearch heap + Redis + worker + OS reserve. Any change to one column of that table requires re-checking the others in the same edit. |
| **Host-level kernel tuning side note** | §10 enumerates the shared host-kernel contract for PG + OpenSearch (`vm.max_map_count`, `vm.swappiness`, `ulimits`) and the PG-specific huge-page setting (`vm.nr_hugepages`). Marked "host-level work, not container-level"; lands in `12-migrations.md` as a one-shot setup step, not a per-cluster GUC. |
| **`db/conf/<cluster>.conf` immutability discipline** | Restart-required GUCs (`shared_buffers`, `wal_level`, `max_connections`, `max_worker_processes`, `huge_pages`, `io_method`, `shared_preload_libraries`) must be flipped via `db/conf/<cluster>.conf` edit + container restart. SIGHUP-reloadable GUCs (`work_mem`, `maintenance_work_mem`, `autovacuum_*`, `random_page_cost`, `effective_io_concurrency`, planner GUCs) may be edited in place and reloaded via `pg_reload_conf()`. The two classes are called out inline in §3 / §4. |
| **Provisional-vs-locked annotations** | Every numeric value is tagged in the table that supplies it, not at the GUC line itself, to keep the conf files copyable as-is into the running clusters. |

## §1 Identity / boundary

No new types. This document is config-file-emitting only. Files
emitted are referenced by:

- `docker/compose.yaml` — mounts both confs; entrypoint uses
  `-c config_file=…`.
- `db/schema/{warehouse,serve}/*.sql` — the per-table
  `autovacuum_*` reloptions in §5 land as SQL `ALTER TABLE … SET (...)`
  declarations per table.
- `engine/app/db/pools.py` — consumes the §7 pool sizes via
  `app/config.py` `Settings` defaults.
- `engine/app/projection/_pools.py` and the ingest worker — consume
  the §7 admin-pool / ingest-write sizes.
- The `/etc/pgbouncer/pgbouncer.ini` mounted into the
  `pgbouncer-serve` container — generated from §6.

## §2 Memory math at 68 GB and 128 GB

This is the load-bearing table. PG's textbook 25 % `shared_buffers` /
75 % `effective_cache_size` ratio is the single-cluster maximum. We
have **two** PG clusters plus a 31 GB OpenSearch JVM (`07 §2.3`) plus
a Python worker that owns CUDA / RAPIDS host code (~12 GB peak,
`07 §4.2`) plus Redis (~512 MB cap per `compose.yaml`) plus the OS
reserve (page cache wants ≥ 8 GB on a 68 GB host to keep Faiss mmap
useful, `07 §4.2`). The two PG clusters share the host but have
disjoint hot working sets (warehouse cold-by-default → at-rest;
serve always-hot but small projection footprint).

### 2.1 Allocation table

Numbers below are budgets the operator commits to in `db/conf/*.conf`,
not measured peak resident sizes. Warehouse `shared_buffers` is sized
for the *ingest / projection-build window* — when warehouse is up,
serve workload is unchanged but warehouse can claim its share.

| Component | 68 GB host (today) | 128 GB host (planned) | Notes |
|---|---:|---:|---|
| OS reserve + page cache (Faiss mmap, OPFS, kernel) | ~8 GB | ~16 GB | OpenSearch §4.2: file cache wants room for `paper_index` mmap (~32 GB resident at hot steady state). On 68 GB host the OS cache is contended; on 128 GB it is comfortable. **locked** envelope. |
| OpenSearch JVM heap (`-Xms = -Xmx`) | 31 GB | 31 GB | `07 §2.3` lock — heap stays at 31 GB (compressed-oops boundary) regardless of host; extra RAM goes to OS file cache for Faiss mmap. **locked**. |
| Redis | 0.5 GB | 0.5 GB | `compose.yaml` `mem_limit: 512m`. **locked**. |
| Python worker (FastAPI + Dramatiq + RAPIDS host code) | ~12 GB | ~16 GB | `07 §4.2` engine envelope; covers MedCPT encoder / cross-encoder host buffers + asyncpg pool overhead + Pydantic resident models. **provisional**, scales by GPU model count. |
| **Serve PG `shared_buffers`** | **8 GB** | **16 GB** | OLTP-shaped, working set ≪ projection table size. 12 % / 12.5 % of host RAM. PG 18 default is 128 MB; the textbook 25 % cap is for single-PG-cluster hosts. Two-cluster math constrains us. **provisional** — verify hot-list / hot-profile cache hit rate via `pg_buffercache`. |
| **Serve PG `effective_cache_size`** | **20 GB** | **48 GB** | Sum of OS file cache available to serve + serve `shared_buffers` it expects to land. Planner uses this to choose index scans over seq scans. **provisional**. |
| **Warehouse PG `shared_buffers`** (when up) | **12 GB** | **24 GB** | Bulk-load + index-build benefits more from `maintenance_work_mem` than from `shared_buffers`; 12 GB is enough to keep partition heap pages warm during phase 4.4 CREATE INDEX (`05 §4.4`). On 128 GB, doubles. **provisional**. |
| **Warehouse PG `effective_cache_size`** (when up) | **20 GB** | **40 GB** | Used during projection-read jobs (`02 §7.2`) so the planner picks bitmap-index scans on hashed partitions. **provisional**. |
| **Coexistence rule** | When warehouse is up the host briefly overshoots; mitigation: ingest/projection windows happen when serve traffic is low (solo-dev, controlled). | At 128 GB this stops overshooting at all. | Not a hard ceiling; `wsl mem=` setting (`01` open item) defines the actual host limit. |

### 2.2 Sanity check, host total at peak

At **68 GB host**, peak (warehouse + serve both up, OpenSearch hot,
worker at projection-build peak):

```
OS + cache    8
OpenSearch   31
Redis         0.5
Worker       12
Serve buf     8
Warehouse buf 12
              ───
total       ~71.5 GB   → exceeds 68 GB by ~3.5 GB
```

Mitigation (locked): `compose.yaml` already restricts warehouse PG
container to `mem_limit: 16g` and worker to `mem_limit: 14g`; that
plus PG's lazy buffer-pool growth (it claims pages, not bytes, on
demand) means the actual resident footprint stays under 68 GB until
ingest sustained throughput peaks. The right *fix* is the 128 GB
upgrade, where:

```
OS + cache   16
OpenSearch   31
Redis         0.5
Worker       16
Serve buf    16
Warehouse buf 24
              ───
total      ~103.5 GB   → ~24 GB headroom
```

§3 / §4 emit both the 68 GB and 128 GB values; the operator picks
which row of the table is active by editing the matching constants
at the top of each conf file. **provisional** until the 128 GB
upgrade; the same values stay correct after.

### 2.3 `work_mem` and `maintenance_work_mem`

`work_mem` is per-sort/hash node, multiplied by query parallelism.
PG 18 default is 4 MB. On serve we want enough for the `INCLUDE`-
covering index sorts (`03 §4.2`) without inviting 200-MB hashes:

| Setting | Serve (68 GB) | Serve (128 GB) | Warehouse (68 GB) | Warehouse (128 GB) | Source |
|---|---:|---:|---:|---:|---|
| `work_mem` | 32 MB | 64 MB | 32 MB (256 MB during ingest, §8) | 64 MB | <https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-WORK-MEM> |
| `maintenance_work_mem` | 1 GB | 2 GB | **8 GB** (16 GB during ingest, §8) | **16 GB** | `05 §6.4` requirement; <https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-MAINTENANCE-WORK-MEM> |
| `autovacuum_work_mem` | -1 (inherit) | -1 (inherit) | -1 | -1 | Use `maintenance_work_mem`. |

Rationale (provisional):
- Serve `work_mem = 32 MB` × max 32 concurrent serve_read pool
  connections × ~2 sort/hash nodes = ~2 GB peak — under the OS
  reserve. Doubles at 128 GB to keep the same relative
  conservatism.
- Warehouse `maintenance_work_mem = 8 GB` is half the `05 §6.4`
  16 GB ingest-time value because *cluster-default* applies when
  ingest is *not* running; ingest sessions raise it (§8). Index
  builds at projection time stay under cluster default.
- PostgreSQL's own docs for the current major note that **parallel utility commands treat
  `maintenance_work_mem` as a limit for the entire utility command,
  regardless of the number of parallel worker processes**. So
  `max_parallel_maintenance_workers` is primarily a CPU / I/O
  concurrency knob here, not an 8× or 12× multiplier on one `CREATE
  INDEX` command's `maintenance_work_mem` budget. The 68 GB vs 128 GB
  split still matters, but mostly for overall host concurrency and how
  many other services are hot at the same time.

## §3 Warehouse `postgresql.conf`

File path: `db/conf/warehouse.conf` (in repo); mounted at
`/etc/postgresql/postgresql.conf` inside `graph-db-warehouse`.

Posture: cold-most-of-time; bulk-write spikes during ingest /
projection-build windows; **no live request-path readers**;
`wal_level = minimal` (per `00 §3` and `research-distilled §5`).
Optimizes for COPY throughput, parallel index build, and
no-sync-pain. Crash safety still holds — `SET LOGGED` runs before
publish (`05 §4.5`).

```conf
# db/conf/warehouse.conf — PG 18, graph-db-warehouse cluster
# Authority: docs/rag/09-tuning.md §3
# Posture: cold-by-default, bulk-load + projection-read; no live readers
# Memory math: see 09 §2.1 — values shown for 68 GB host; 128 GB column commented

# ─── Connectivity ─────────────────────────────────────────────────
listen_addresses          = '*'
port                      = 5432
max_connections           = 80                # ingest_write max=64 (§7) + warehouse_read max=8 + 8 admin headroom (§7)
                                              # 128 GB: 128
superuser_reserved_connections = 4

# ─── Memory (see §2.1 / §2.3) ─────────────────────────────────────
shared_buffers            = 12GB              # 68 GB host; 24GB on 128 GB
effective_cache_size      = 20GB              # 68 GB host; 40GB on 128 GB
work_mem                  = 32MB              # 64MB on 128 GB
maintenance_work_mem      = 8GB               # 16GB on 128 GB
autovacuum_work_mem       = -1                # inherit maintenance_work_mem
hash_mem_multiplier       = 2.0               # PG 18 default; left explicit for clarity
temp_buffers              = 32MB              # session GUC raised to 256MB during ingest (§8)

# ─── Storage / IO (§9) ────────────────────────────────────────────
random_page_cost          = 1.1               # NVMe-backed VHDX (§01 §6)
seq_page_cost             = 1.0
effective_io_concurrency  = 256               # NVMe queue depth; PG 18 max 1000
maintenance_io_concurrency = 256
io_method                 = worker            # PG 18 default; postgres:18 image not built --with-liburing
                                              #   (https://github.com/docker-library/postgres/issues/1365)
io_workers                = 8                 # 25-50 % of host logical cores; default 3 too low for ingest
huge_pages                = try               # requires vm.nr_hugepages on host (§10); falls back to 4K
                                              #   if unavailable, no-op cluster start

# ─── WAL (§3 posture: minimal) ────────────────────────────────────
wal_level                 = minimal           # COPY fast path; no streaming replica from warehouse
                                              # (research-distilled §5; PG 18 release notes)
max_wal_senders           = 0                 # forced by wal_level = minimal
max_replication_slots     = 0
wal_compression           = zstd              # PG 18 supports lz4 / zstd; zstd ≈ 30 % smaller than lz4
wal_buffers               = 64MB              # large enough that wal_writer doesn't block COPY
wal_writer_delay          = 200ms             # PG default; combined with synchronous_commit=off bounds loss
                                              #   to ≤ 3 × wal_writer_delay (= 600 ms) per research-distilled §5
synchronous_commit        = off               # ingest-window default (warehouse never durable-required;
                                              #   warehouse is rebuildable from /mnt/solemd-graph/data per 01 §3)
                                              # SET LOCAL = on for any serving-control writes that ever land here
fsync                     = on                # NEVER off; corruption risk
full_page_writes          = on                # NEVER off
archive_mode              = off               # no PITR on warehouse (00 §3)
max_wal_size              = 16GB              # large to avoid checkpoint storms during 638 GB COPY
min_wal_size              = 2GB
checkpoint_timeout        = 30min             # long; bulk-load doesn't benefit from frequent checkpoints
checkpoint_completion_target = 0.9            # spread checkpoint IO; default in PG 18

# ─── Background writer (cold-by-default) ──────────────────────────
bgwriter_delay            = 200ms             # default; nothing to spill aggressively when no readers
bgwriter_lru_maxpages     = 100               # default
bgwriter_lru_multiplier   = 2.0               # default
bgwriter_flush_after      = 512kB             # default

# ─── Parallel query / maintenance ─────────────────────────────────
max_worker_processes      = 24                # 16 logical cores + 8 headroom for autovacuum + io_workers
max_parallel_workers      = 12                # cap parallel scan workers
max_parallel_workers_per_gather = 6           # per-query cap
max_parallel_maintenance_workers = 8          # CREATE INDEX parallelism on 68 GB host.
                                              # The current PostgreSQL major treats maintenance_work_mem as a
                                              # per-command limit for parallel utility commands,
                                              # not a per-worker multiplier. Raise to 12 on 128 GB
                                              # for faster index build once host concurrency allows.

# ─── Autovacuum (cluster default; per-table reloptions in §5) ─────
autovacuum                          = on
autovacuum_naptime                  = 1min     # default
autovacuum_worker_slots             = 16       # PG 18 reservation; dynamic worker pool from this slot count
                                               #   (https://neon.com/postgresql/postgresql-18/autovacuum-maintenance-configuration)
autovacuum_max_workers              = 6        # raised from default 3; ingest creates many large tables
autovacuum_vacuum_scale_factor      = 0.1      # default; per-table override on append-mostly tables (§5)
autovacuum_vacuum_threshold         = 50       # default
autovacuum_vacuum_max_threshold     = 100000000  # PG 18 new GUC; default 100M tuples — leave default
                                                 #   (https://www.dbi-services.com/blog/postgresql-18-introduce-autovacuum_vacuum_max_threshold/)
autovacuum_vacuum_insert_scale_factor = 0.2    # PG 18 default
autovacuum_analyze_scale_factor     = 0.1      # default
autovacuum_freeze_max_age           = 200000000   # default; freeze before XID horizon hits 200M
autovacuum_multixact_freeze_max_age = 400000000   # default
autovacuum_vacuum_cost_delay        = 2ms      # PG 18 default; per-table override raises for ingest-time
autovacuum_vacuum_cost_limit        = 1000     # raised from default 200; warehouse has bandwidth headroom
vacuum_max_eager_freeze_failure_rate = 0.03    # PG 18 new; default 0.03 (3 %); leave default

# ─── Planner ──────────────────────────────────────────────────────
default_statistics_target = 200                # bulk-load benefits from richer histograms
constraint_exclusion      = partition          # required for hash-partitioned planning
jit                       = off                # bulk-load + simple analytical queries don't benefit;
                                               #   planner JIT cost > savings on hash joins this size

# ─── Logging (10-observability.md routes the events) ──────────────
log_destination           = 'stderr,jsonlog'   # PG 18 jsonlog (research-distilled §7)
logging_collector         = on
log_directory             = 'log'
log_filename              = 'postgresql-%Y-%m-%d.log'
log_min_duration_statement = 1000              # 1 s; bulk operations dominate, hot OLTP isn't here
log_checkpoints           = on
log_lock_waits            = on
log_temp_files            = 10MB
log_autovacuum_min_duration = 500ms
log_line_prefix           = '%m [%p] %u@%d/%a '
track_io_timing           = on                  # required for per-table IO observability (10)
track_wal_io_timing       = on                  # PG 18; tracks WAL IO separately
track_functions           = pl

# ─── Extensions (cluster-level requirement; 02 §1) ────────────────
shared_preload_libraries  = 'pg_stat_statements,auto_explain,pg_cron'
compute_query_id          = auto
pg_stat_statements.track_planning = on
pg_stat_statements.max    = 10000
pg_stat_statements.track  = all
auto_explain.log_min_duration = 5000          # warehouse: only catch >5s queries; ingest dominates
auto_explain.log_analyze  = off               # too expensive on bulk; flip on ad-hoc
auto_explain.log_buffers  = off
cron.database_name        = 'warehouse'
cron.use_background_workers = on              # PG 18 supported; pg_cron audit jobs (05 §11.1, §13)

# ─── Safety guards ────────────────────────────────────────────────
statement_timeout         = 0                 # warehouse runs CREATE INDEX, VACUUM, ingest COPY — no cap
                                              #   per-session SET LOCAL where bounded
lock_timeout              = 0                 # ingest holds long locks legitimately
deadlock_timeout          = 1s                # default
idle_in_transaction_session_timeout = 600s    # 10 min; catches abandoned ingest sessions

# rest of file is PG 18 defaults
```

**Reload class** (`pg_reload_conf()` reloads at SIGHUP; restart
needed for the rest):
- *Restart-required*: `shared_buffers`, `wal_level`, `max_connections`,
  `max_worker_processes`, `huge_pages`, `io_method`, `io_workers`,
  `archive_mode`, `shared_preload_libraries`, `max_wal_senders`,
  `max_replication_slots`, `autovacuum_worker_slots`.
- *SIGHUP-reloadable*: everything else above (planner, autovacuum
  scale factors, work_mem, logging, cost params, bgwriter, planner
  GUCs).

Per <https://www.postgresql.org/docs/18/runtime-config.html>.

## §4 Serve `postgresql.conf`

File path: `db/conf/serve.conf`; mounted at
`/etc/postgresql/postgresql.conf` inside `graph-db-serve`.

Posture: always-hot; OLTP-shaped reads; occasional admin DDL via
the §7 admin pool; future user-data plane (`03 §0.8`); precious
data — `wal_level = replica` for streaming-replica optionality
(`research-distilled §5`); `synchronous_commit = on` always
(`03 §8` locked).

```conf
# db/conf/serve.conf — PG 18, graph-db-serve cluster
# Authority: docs/rag/09-tuning.md §4
# Posture: always-up OLTP; serve_read pool through PgBouncer; admin pool direct

# ─── Connectivity ─────────────────────────────────────────────────
listen_addresses          = '*'
port                      = 5432
max_connections           = 100               # PgBouncer fan-in: PgBouncer pool_size 30 + admin 4 +
                                              #   replica/maintenance headroom 16 + reserve. (§6 / §7)
                                              # 128 GB: 150
superuser_reserved_connections = 4

# ─── Memory (§2.1 / §2.3) ─────────────────────────────────────────
shared_buffers            = 8GB               # 68 GB host; 16GB on 128 GB
effective_cache_size      = 20GB              # 68 GB host; 48GB on 128 GB
work_mem                  = 32MB              # 64MB on 128 GB
maintenance_work_mem      = 1GB               # 2GB on 128 GB; serve rarely runs CREATE INDEX
autovacuum_work_mem       = 256MB             # explicit cap; we want autovacuum to NOT contend with OLTP
hash_mem_multiplier       = 2.0
temp_buffers              = 16MB              # OLTP workload rarely uses temp tables

# ─── Storage / IO (§9) ────────────────────────────────────────────
random_page_cost          = 1.1               # NVMe named volume on /var/lib/docker (01 §2)
seq_page_cost             = 1.0
effective_io_concurrency  = 256
maintenance_io_concurrency = 256
io_method                 = worker            # PG 18 default; same Docker-image rationale as warehouse
io_workers                = 4                 # smaller than warehouse; serve hot path is mostly point reads
huge_pages                = try               # vm.nr_hugepages on host (§10)

# ─── WAL (§4 posture: replica) ────────────────────────────────────
wal_level                 = replica           # preserves future streaming-replica optionality (00 §6)
                                              # without the logical-WAL tax (research-distilled §1)
max_wal_senders           = 4                 # headroom for future pgBackRest archiving + optional replica
max_replication_slots     = 4
wal_compression           = zstd              # PG 18; reduces WAL bytes ~30 %
wal_buffers               = 32MB
wal_writer_delay          = 100ms             # tighter than warehouse — synchronous_commit=on means
                                              #   wal_writer flushes hotter
synchronous_commit        = on                # always; precious data (03 §8 locked)
synchronous_standby_names = ''                # no replica yet; flip to a quorum spec when one exists
fsync                     = on
full_page_writes          = on
archive_mode              = off               # keep off until 11-backup wires a real pgBackRest repo + stanza
                                              # PostgreSQL docs explicitly discourage fake-success placeholders
                                              # such as archive_command='/bin/true' for normal operation
archive_command           = ''                # set atomically with pgBackRest stanza-create/check in 11-backup
max_wal_size              = 4GB               # OLTP — small steady WAL, no bulk
min_wal_size              = 1GB
checkpoint_timeout        = 15min             # tighter than warehouse; want fast restart
checkpoint_completion_target = 0.9
checkpoint_flush_after    = 256kB             # default

# ─── Background writer (always-hot) ───────────────────────────────
bgwriter_delay            = 100ms             # tighter than warehouse default; readers benefit
                                              #   from clean buffers
bgwriter_lru_maxpages     = 200               # raised from default 100 (steady OLTP dirty churn)
bgwriter_lru_multiplier   = 4.0               # raised from default 2.0
bgwriter_flush_after      = 512kB

# ─── Parallel query / maintenance ─────────────────────────────────
max_worker_processes      = 16
max_parallel_workers      = 6                 # smaller than warehouse; OLTP doesn't benefit much
max_parallel_workers_per_gather = 2           # tight; covering-index scans are single-worker
max_parallel_maintenance_workers = 4          # serve rarely builds; admin-pool stage-and-swap (04 §3.4)

# ─── Autovacuum (aggressive — projection tables need VM coverage) ─
autovacuum                          = on
autovacuum_naptime                  = 30s     # tighter than warehouse default 1min — VM hotness matters
                                              #   for index-only scans on idx_paper_api_cards_list (03 §6.3)
autovacuum_worker_slots             = 8
autovacuum_max_workers              = 4       # default 3; bumped for the 7-table projection set
autovacuum_vacuum_scale_factor      = 0.1     # default; tighter per-table on cards/profiles (§5)
autovacuum_vacuum_threshold         = 50
autovacuum_vacuum_max_threshold     = 100000000  # PG 18 default
autovacuum_vacuum_insert_scale_factor = 0.2
autovacuum_analyze_scale_factor     = 0.05    # tighter than warehouse — planner stats freshness matters
autovacuum_freeze_max_age           = 200000000
autovacuum_multixact_freeze_max_age = 400000000
autovacuum_vacuum_cost_delay        = 2ms     # PG 18 default; balances throughput vs OLTP latency
autovacuum_vacuum_cost_limit        = 2000    # raised from default 200; serve has IO headroom
vacuum_max_eager_freeze_failure_rate = 0.03

# ─── Planner ──────────────────────────────────────────────────────
default_statistics_target = 200                # OLTP planner benefits from richer histograms on PK distros
constraint_exclusion      = partition          # serve has none today, but cheap to keep on
jit                       = on                 # OLTP detail queries hit JIT threshold rarely; keep on
jit_above_cost            = 100000             # raise threshold so cheap PK lookups skip JIT
jit_inline_above_cost     = 500000

# ─── Logging ──────────────────────────────────────────────────────
log_destination           = 'stderr,jsonlog'
logging_collector         = on
log_directory             = 'log'
log_filename              = 'postgresql-%Y-%m-%d.log'
log_min_duration_statement = 250               # tighter than warehouse — serve OLTP target p95 < 25 ms (06 §12)
log_checkpoints           = on
log_lock_waits            = on
log_temp_files            = 1MB
log_autovacuum_min_duration = 250ms
log_line_prefix           = '%m [%p] %u@%d/%a '
track_io_timing           = on
track_wal_io_timing       = on
track_functions           = pl

# ─── Extensions (03 §1) ───────────────────────────────────────────
shared_preload_libraries  = 'pg_stat_statements,auto_explain,pg_prewarm,pg_cron'
compute_query_id          = auto
pg_stat_statements.track_planning = on
pg_stat_statements.max    = 10000
pg_stat_statements.track  = all
auto_explain.log_min_duration = 250            # serve: capture every >250 ms hot-path query
auto_explain.log_analyze  = off                # off in steady; flip on for diagnosis
auto_explain.log_buffers  = off
auto_explain.log_format   = 'json'
pg_prewarm.autoprewarm    = on                 # autoprewarm worker writes autoprewarm.blocks periodically
                                               # (03 §1; https://www.postgresql.org/docs/18/pgprewarm.html)
cron.database_name        = 'serve'
cron.use_background_workers = on               # PG 18

# ─── Safety guards ────────────────────────────────────────────────
statement_timeout         = 5000               # 5 s — OLTP cap; engine API uses tighter SET LOCAL = 250 ms
                                               #   per request (03 §3.4 / §7); admin pool sets 0
lock_timeout              = 2000               # 2 s; matches 04 §3.5 swap-time SET LOCAL value
deadlock_timeout          = 100ms              # tighter than default 1s; matches 04 §3.5
idle_in_transaction_session_timeout = 60s      # 1 min; PgBouncer txn mode keeps server-conn idle short

# rest of file is PG 18 defaults
```

Reload class same partition as §3.

## §5 Per-table autovacuum overrides

Per `02 §0.5` and `03 §0.5`, every table is in one of three
fillfactor tiers. Per `02 §6.3` and `03 §6.3`, each tier wants a
different autovacuum posture. This section is the **single
authoritative reloption table**; the SQL schema and migration surfaces under
`db/schema/{warehouse,serve}/*.sql` and `db/migrations/{warehouse,serve}/*.sql`
quote these values verbatim.

### 5.1 Tier rules

| Fillfactor tier | `autovacuum_vacuum_scale_factor` | `autovacuum_analyze_scale_factor` | `autovacuum_vacuum_insert_scale_factor` | `autovacuum_vacuum_cost_delay` | `autovacuum_freeze_max_age` |
|---|---:|---:|---:|---:|---:|
| **100 — append-mostly** (large facts, grounding, PT3) | 0.2 | 0.1 | 0.5 | 2ms | 100M (early freeze; bound XID horizon) |
| **90 — update-occasional** (canonical metadata, projections) | 0.1 (cluster default) | 0.1 | 0.2 (cluster default) | 2ms | 200M (cluster default) |
| **80 — status-flipping** (control rows, singleton, runs) | **0.05** | **0.02** | **0.1** | 2ms | 200M |

Rationale:
- **100-tier** tables are huge and never UPDATEd; the default
  insert-driven autovacuum at scale_factor 0.2 fires reasonably
  often given table size, but freezing must happen *early*
  because XID consumption races the next ingest cycle. Lower
  `freeze_max_age` to 100M to bound the freeze cost.
  (`02 §6.3`; PG 18 vacuuming improvements:
  <https://techcommunity.microsoft.com/blog/adforpostgresql/postgresql-18-vacuuming-improvements-explained/4459484>)
- **90-tier** tables get cluster default; HOT updates land on free
  space within the page (`02 §0.5`).
- **80-tier** tables are tiny and status-flipping
  (`source_releases`, `ingest_runs`, `serving_runs`,
  `api_projection_runs`, `paper_chunk_versions`, `graph_runs`,
  `active_runtime_pointer`). Aggressive autovacuum at
  `scale_factor=0.05` keeps HOT chains short and stops the
  singleton from accumulating dead tuples. `analyze_scale_factor`
  at 0.02 keeps planner stats fresh after every status flip.

### 5.2 Warehouse SQL reloptions (illustrative; SQL schema is authoritative)

```sql
-- Tier 100: append-mostly large facts (02 §0.5 / §6.3)
ALTER TABLE solemd.paper_citations SET (
  autovacuum_vacuum_scale_factor          = 0.2,
  autovacuum_vacuum_insert_scale_factor   = 0.5,
  autovacuum_analyze_scale_factor         = 0.1,
  autovacuum_vacuum_cost_delay            = 2,
  autovacuum_freeze_max_age               = 100000000
);
-- Apply identically to: paper_citation_contexts, paper_concepts, paper_relations,
--   paper_blocks, paper_sentences, paper_citation_mentions, paper_entity_mentions,
--   paper_chunk_members, paper_chunks, pubtator.entity_annotations, pubtator.relations,
--   paper_authors, paper_assets.
-- All hash-partitioned families: apply to PARENT, PG inherits to children.

-- Tier 90: update-occasional canonical metadata
-- (no override needed; cluster default §3 already matches)

-- Tier 80: status-flipping control
ALTER TABLE solemd.source_releases SET (
  autovacuum_vacuum_scale_factor   = 0.05,
  autovacuum_analyze_scale_factor  = 0.02,
  autovacuum_vacuum_threshold      = 50
);
ALTER TABLE solemd.ingest_runs            SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.paper_chunk_versions   SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.graph_runs             SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.graph_bundle_artifacts SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
```

### 5.3 Serve SQL reloptions

```sql
-- Tier 100: append-only caches (rebuilt-whole)
ALTER TABLE solemd.paper_semantic_neighbors SET (
  autovacuum_vacuum_scale_factor          = 0.2,
  autovacuum_vacuum_insert_scale_factor   = 0.5,
  autovacuum_analyze_scale_factor         = 0.1,
  autovacuum_freeze_max_age               = 100000000
);
ALTER TABLE solemd.graph_points SET (
  autovacuum_vacuum_scale_factor          = 0.2,
  autovacuum_vacuum_insert_scale_factor   = 0.5,
  autovacuum_analyze_scale_factor         = 0.1
);

-- Tier 90: incrementally-updatable projections — TIGHTER on cards/profiles
-- because covering-index INCLUDE depends on VM coverage (03 §6.3)
ALTER TABLE solemd.paper_api_cards SET (
  autovacuum_vacuum_scale_factor          = 0.05,    -- override of cluster default 0.1
  autovacuum_analyze_scale_factor         = 0.05,
  autovacuum_vacuum_insert_scale_factor   = 0.1,
  autovacuum_vacuum_cost_delay            = 2
);
ALTER TABLE solemd.paper_api_profiles SET (
  autovacuum_vacuum_scale_factor          = 0.1,     -- cluster default; profiles seen less often
  autovacuum_analyze_scale_factor         = 0.1
);
ALTER TABLE solemd.graph_cluster_api_cards SET (autovacuum_vacuum_scale_factor=0.1, autovacuum_analyze_scale_factor=0.1);
ALTER TABLE solemd.graph_clusters          SET (autovacuum_vacuum_scale_factor=0.1, autovacuum_analyze_scale_factor=0.1);
ALTER TABLE solemd.graph_run_metrics       SET (autovacuum_vacuum_scale_factor=0.1, autovacuum_analyze_scale_factor=0.1);

-- Tier 80: status-flipping control
ALTER TABLE solemd.serving_runs           SET (autovacuum_vacuum_scale_factor=0.0, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.api_projection_runs    SET (autovacuum_vacuum_scale_factor=0.0, autovacuum_vacuum_threshold=50, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.serving_cohorts        SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.serving_members        SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.serving_artifacts      SET (autovacuum_vacuum_scale_factor=0.05, autovacuum_analyze_scale_factor=0.02);
ALTER TABLE solemd.active_runtime_pointer SET (autovacuum_vacuum_scale_factor=0.0, autovacuum_vacuum_threshold=10, autovacuum_analyze_scale_factor=0.0, autovacuum_analyze_threshold=10);
```

`active_runtime_pointer`'s `analyze_threshold = 10` is the lowest in
the system: it's a one-row table that flips on every cutover; without
this, planner stats lag a single ANALYZE cycle behind reality, and
the FK lookups against it all do unnecessary work. **locked**.

### 5.4 Class-level deltas

`02 §3.2` says child partitions disable autovacuum during bulk load.
That is a per-load-window override applied by the ingest worker
(`05 §4.3` precondition: `ALTER TABLE … SET (autovacuum_enabled=false)`)
and reverted by `05 §4.5` (`SET (autovacuum_enabled=true)`). Not part
of the static reloption set above.

## §6 PgBouncer-serve `pgbouncer.ini`

File path: `db/conf/pgbouncer.ini`; mounted at
`/etc/pgbouncer/pgbouncer.ini` inside the `pgbouncer-serve`
container. Current pinned PgBouncer line per `16-version-inventory.md`.
`pool_mode = transaction`
locked per `00 §6` and `03 §7.3`. PgBouncer can track prepared
statements across txn-mode, but asyncpg remains on the documented safe
floor here: `serve_read` keeps `statement_cache_size=0` and avoids
explicit prepare calls unless integration tests later prove a broader
compatibility envelope.

PgBouncer-serve sits between everything that goes through the
`engine_serve_read` role (`06 §7.1`):

- `graph-engine-api` FastAPI process (`06 §5`).
- `graph-worker` projection actor's `serve_read_pool` (`04 §4.2`).
- Next.js server-side render calls when they hit serve PG.

The `engine_admin` role bypasses (`04 §4`). The
`warehouse_grounding_reader` role on warehouse is separate and never
reaches PgBouncer (warehouse has no pooler today, `00 §1`).

```ini
;; db/conf/pgbouncer.ini — pinned PgBouncer line per `16-version-inventory.md`
;; Authority: docs/rag/09-tuning.md §6
;; Posture: txn-mode pooler in front of graph-db-serve only
;; Source: https://www.pgbouncer.org/config.html

[databases]
;; one logical database, points at serve PG
serve = host=graph-db-serve port=5432 dbname=serve auth_user=pgbouncer_auth

[pgbouncer]
listen_addr               = 0.0.0.0
listen_port               = 6432
unix_socket_dir           =
auth_type                 = scram-sha-256
auth_file                 = /etc/pgbouncer/userlist.txt
auth_user                 = pgbouncer_auth
auth_query                = SELECT usename, passwd FROM pgbouncer_auth.user_lookup($1)
                          ; engine_admin NEVER appears in pgbouncer_auth.user_lookup() — bypass discipline (04 §4)

;; ─── Pool mode (locked per 00 §6, 03 §7.3) ─────────────────────────
pool_mode                 = transaction
server_reset_query        =
                          ; empty — txn mode releases server connections per-transaction;
                          ;   prepared-statement cache (max_prepared_statements) survives release
server_reset_query_always = 0

;; ─── Pool sizing (§6.1 below) ─────────────────────────────────────
max_client_conn           = 200
                          ; engine API + Next.js + projection-worker serve_read upper bound;
                          ;   2× the max worker fan-in for safety
default_pool_size         = 30
                          ; per (database, user) pair; matched against asyncpg serve_read max=16 (§7)
                          ;   plus Next.js SSR concurrency headroom
min_pool_size             = 6
                          ; warm 6 server connections at start so first request after restart isn't cold
reserve_pool_size         = 8
                          ; spike absorption beyond default_pool_size; only used when clients
                          ;   wait > reserve_pool_timeout (https://www.pgbouncer.org/config.html)
reserve_pool_timeout      = 3
max_db_connections        = 60
                          ; hard cap per database — must stay < serve max_connections - admin reserve
                          ;   (§4 max_connections=100; admin pool=4 + replica=4 + buffer=32 = 60)
max_user_connections      = 60

;; ─── Prepared statements (optional server-side tracking; asyncpg stays conservative) ────
max_prepared_statements   = 200
                          ; protocol-level prepared-plan cache per server connection.
                          ; asyncpg serve_read still keeps statement_cache_size=0
                          ;   and avoids explicit prepare calls in txn mode; treat this
                          ;   as optional server-side tracking, not a baseline free win.
                          ; schema-changing DDL may still require RECONNECT to flush plans.

;; ─── Timeouts ─────────────────────────────────────────────────────
query_wait_timeout        = 5
                          ; client wait cap for a server connection; tighter than serve
                          ;   statement_timeout (5 s) because exhausted pool is a backpressure signal
query_timeout             = 0
                          ; let PG enforce statement_timeout (§4)
client_idle_timeout       = 0
                          ; OLTP — short txns; no need for client-idle disconnect
server_idle_timeout       = 600
                          ; recycle idle server conns after 10 min so RAM doesn't bloat
server_lifetime           = 3600
                          ; recycle every hour; helps surface PG memory leaks early
server_connect_timeout    = 5
server_login_retry        = 3

;; ─── Logging ──────────────────────────────────────────────────────
log_connections           = 0
log_disconnections        = 0
log_pooler_errors         = 1
verbose                   = 0
stats_period              = 60
                          ; SHOW STATS aggregation period; consumed by 10-observability.md

;; ─── Hardening ────────────────────────────────────────────────────
ignore_startup_parameters = extra_float_digits, search_path
                          ; asyncpg sends these on connect; safe to ignore
disable_pqexec            = 0
application_name_add_host = 0
```

### 6.1 Sizing rationale

| Setting | Value | Rationale | Source |
|---|---:|---|---|
| `max_client_conn` | 200 | Sum of FastAPI peak (asyncpg `serve_read` max=16 × 2 processes) + Next.js SSR (~40 cold-cache + retry) + projection-worker `serve_read` max=8 + headroom 2×. | <https://oneuptime.com/blog/post/2026-01-26-pgbouncer-connection-pooling/view> |
| `default_pool_size` | 30 | Larger than asyncpg `serve_read` max=16 (§7) so the pool isn't the bottleneck; smaller than `max_db_connections=60` so admin reserve is preserved. | <https://www.pgbouncer.org/config.html> |
| `min_pool_size` | 6 | Warm — first hot-path query after PgBouncer restart doesn't pay 5–15 ms PG handshake. | Same as above. |
| `reserve_pool_size` | 8 | Spike absorption; only triggers when default pool exhausted > `reserve_pool_timeout`. | Same. |
| `max_db_connections` | 60 | Floor: `max_connections=100` (§4) minus 4 superuser_reserved minus 4 admin pool minus 4 replica/maintenance reserve minus 28 buffer. | PG 18 max_connections docs. |
| `max_prepared_statements` | 200 | Keeps PgBouncer's protocol-level prepared-plan cache available while asyncpg clients still run with `statement_cache_size=0`; 200 leaves headroom over the current hot-query set and stays subject to integration-test proof. | <https://www.pgbouncer.org/config.html> |
| `query_wait_timeout` | 5 s | Backpressure signal; tighter than `statement_timeout=5s` would let a request both wait + run = 10 s; we cap composed budget at ~5 s. | <https://www.pgbouncer.org/config.html> |

**provisional** for `max_client_conn` (revisit after first
production load shape) and `default_pool_size` (revisit if
`pg_stat_statements` shows pool starvation). Everything else
**locked**.

### 6.2 Connection-budget ledger (§4 `max_connections=100`)

```
PgBouncer-serve max_db_connections   60   (clients reach PG via this lane)
admin pool (engine_admin direct)      4   (asyncpg admin max=2 × 2 processes)
projection serve_read direct (NONE)   0   (also goes via PgBouncer; no extra)
pgBackRest archiver / WAL receiver    4   (deferred till pgBackRest sidecar lands)
maintenance / pg_cron headroom        4
superuser_reserved_connections        4
operator-debug headroom              24
                                     ───
total reservation                   100   ✓ matches max_connections
```

If any column above changes, both this ledger AND `max_connections`
in §4 must update in the same edit. The ledger is the pre-flight
check that prevents silent over-commit. **locked**.

## §7 asyncpg pool sizing per role

`06 §2.1` declared the four pools and flagged sizes as provisional.
This section supplies the final values, tied to the §4
`max_connections` budget and the §6 PgBouncer ledger. Numbers are
the targets for `engine/app/config.py` `Settings` defaults; existing
68 GB defaults in `06 §7.3` align with the 68 GB column here.

| Pool | Role | Target | Pooler | min/max (68 GB) | min/max (128 GB) | `command_timeout` | `statement_cache_size` | Notes |
|---|---|---|---|---:|---:|---:|---:|---|
| `ingest_write` | `engine_ingest_write` | warehouse | direct | 8 / 64 | 8 / 96 | None | 0 | 32 hash partitions × ~2 streams (`05 §4.3`); during ingest only. **provisional** at 96 on 128 GB; raise if `ingest_phase_duration_seconds.copy` shows starvation. |
| `warehouse_read` | `engine_warehouse_read` | warehouse | direct | 2 / 8 | 2 / 16 | 300 s | 128 | Projection-build cohort reads (`04 §6`) + ingest lookup cache build (`05 §5.3`). **locked** for shape. |
| `serve_read` | `engine_serve_read` | serve | PgBouncer (txn) | 2 / 16 | 2 / 32 | 5 s | **0** | Cache lives at PgBouncer (§6); client-side cache is forbidden in txn mode (`06 §2.1`). FastAPI per-process; Dramatiq projection worker also opens. |
| `admin` | `engine_admin` | serve | direct | 1 / 2 | 1 / 4 | None | 128 | Bypasses PgBouncer (`04 §4`). Two slots: one for swap, one for `pg_prewarm` overlap. On 128 GB raise to 4 only if a second projection process lands (today bounded by per-family advisory lock, `04 §9.1`). |

### 7.1 Why these numbers add up

Serve PG `max_connections = 100` (§4 / §6.2):
- PgBouncer `max_db_connections = 60` upstream of `serve_read` pool
  (max=16 × 2 processes = 32, well under 60 default_pool_size).
- Admin: asyncpg `admin` max=2 × 2 processes (engine API + projection
  worker) = 4 direct.
- Total client-side PG reach: 60 + 4 = 64; plus headroom = §6.2 ledger.

Warehouse PG `max_connections = 80` (§3):
- `ingest_write` max=64 (single ingest process per `05 §10.1`).
- `warehouse_read` max=8 (single projection worker process per
  `04 §9.1`).
- Direct admin / pg_cron / triage: 8 headroom.
- Total: 64 + 8 + 8 = 80 ✓.

### 7.2 `statement_cache_size` discipline

- `serve_read` MUST be 0. PgBouncer may track server-side prepared plans,
  but asyncpg still treats transaction-pooled prepared statements as an
  unsafe baseline.
- If PgBouncer's prepared-plan cache remains enabled in txn mode, prove
  the path with integration tests and expect `RECONNECT` after
  schema-changing DDL that invalidates cached plans.
- `warehouse_read` and `admin` use 128 — direct connections, the
  cache is per-physical-conn and amortizes over the projection
  cycle's repeated swap-template statements.
- `ingest_write` uses 0 because every COPY is a fresh wire-format
  statement (no reuse benefit) and the connection holds long
  COPYs that re-prepare cheaply.

### 7.3 Upstream amendments needed for `06`

`06 §2.1` shows the same numbers as the 68 GB column here, so no
divergence. The 128 GB column expands `ingest_write.max` from 64 to
96 and `serve_read.max` from 16 to 32 — these update in `06 §2.1`'s
"128 GB" column when this doc lands. Flag for `06`: confirm the
admin pool stays at max=2 (not 4) on 128 GB unless multi-process
projection lands.

## §8 Ingest-mode session overrides

`05 §6.3` declared session GUCs flipped during ingest. `09` owns
the cluster-vs-session distinction:

### 8.1 Cluster-level (in `db/conf/warehouse.conf`, §3)

These are static for the warehouse cluster and do **not** toggle
per-session — restart-required:

| GUC | Value | Why cluster-level |
|---|---|---|
| `wal_level` | `minimal` | Restart-required GUC. Warehouse stays at `minimal` *always*; ingest does not toggle this per session. The only path to flipping it back is "wire warehouse for streaming replica," which is `00 §6` deferred. |
| `archive_mode` | `off` | Restart-required. Warehouse never PITR-protected (`00 §3`). |
| `max_wal_senders` | 0 | Forced by `wal_level = minimal`. |
| `synchronous_commit` (default) | `off` | Cluster default; per-session `SET LOCAL synchronous_commit = on` for any rare write that must be durable (none today). |
| `fsync` | `on` | NEVER `off`; ingest crash safety lives in UNLOGGED → SET LOGGED phase order, not in disabling fsync. |

### 8.2 Per-session (set by ingest worker via `server_settings`)

`06 §2.1` `ingest_write.server_settings` already passes these on
every connection acquired from the pool; values come from `05 §6.3`:

```python
# engine/app/db/pools.py — ingest_write spec excerpt
server_settings = {
    "application_name":        "ingest-worker",
    "synchronous_commit":      "off",       # cluster default; explicit for clarity
    "temp_buffers":            "256MB",     # ingest-only; default 32MB elsewhere (05 §4.3)
    "work_mem":                "256MB",     # ingest-only; up from cluster 32MB
    "maintenance_work_mem":    "8GB",       # cluster default, restated (16GB on 128 GB host)
    "max_parallel_maintenance_workers": "8",  # cluster default; restated
    "default_statistics_target": "200",     # cluster default; restated
}
```

Per-family bumps inside one connection:

```sql
-- BEGIN of CREATE INDEX phase (05 §4.4)
SET LOCAL maintenance_work_mem = '16GB';            -- 128 GB host only; 8GB on 68 GB
SET LOCAL max_parallel_maintenance_workers = 12;    -- 128 GB only
-- ...
CREATE INDEX paper_citations_p07_pkey ON solemd.paper_citations_p07 (citing_corpus_id, cited_corpus_id);
-- session-scoped reset on transaction commit; pool returns connection unchanged
```

### 8.3 Why `wal_level=minimal` is cluster-level discipline

Per <https://www.postgresql.org/docs/18/runtime-config-wal.html>,
`wal_level` is restart-required. The COPY fast path requires
`wal_level=minimal` to skip WAL on UNLOGGED → SET LOGGED transitions
(per `research-distilled §5`). If a future warehouse use case ever
needed `wal_level=replica`, that's a one-time restart, not a
per-session toggle. Documenting here so a future operator does not
attempt `SET LOCAL wal_level = replica` and get confused. **locked**.

## §9 Storage-aware GUCs

Both serve NVMe and warehouse VHDX are internal-NVMe-backed
(`01 §6`). Default PG values (`random_page_cost = 4`,
`effective_io_concurrency = 1`) assume rotational disks and lose
us tens of percent on every read.

| GUC | Value | Both clusters | Source |
|---|---|---|---|
| `random_page_cost` | 1.1 | yes | NVMe-class storage; widely-cited PG community baseline (Crunchy Data: <https://www.crunchydata.com/blog/optimize-postgresql-server-performance>). 1.1 (not 1.0) keeps a tiny preference for sequential when planner is on the fence. |
| `seq_page_cost` | 1.0 | yes | Default. |
| `effective_io_concurrency` | 256 | yes | NVMe queue depth — modern NVMe SSDs publish 32+ outstanding-IO sweet spots; 256 is the conservative-high end for parallel bitmap heap scans. (PG 18 docs: <https://www.postgresql.org/docs/18/runtime-config-resource.html#GUC-EFFECTIVE-IO-CONCURRENCY>.) |
| `maintenance_io_concurrency` | 256 | yes | Matches `effective_io_concurrency`; PG 18 default = 16 is too low for VACUUM on NVMe. |
| `io_method` | `worker` | yes | PG 18 default; `postgres:18` Docker image is **not** built `--with-liburing` so `io_uring` is unavailable. (<https://github.com/docker-library/postgres/issues/1365>; pganalyze on PG 18 async IO: <https://pganalyze.com/blog/postgres-18-async-io>.) **locked**. |
| `io_workers` | warehouse=8, serve=4 | per cluster | PG 18 default 3 too low; 25–50 % of host logical cores per chatdba.com PG 18 AIO tuning guide (<https://www.chatdba.com/blog/tuning-postgresql-18s-asynchronous-i-o-aio-for-performance>). Warehouse runs more parallel scan; serve fewer. **provisional**. |
| `huge_pages` | `try` | yes | Linux requires `vm.nr_hugepages` set on the host (§10). `try` falls back gracefully to 4K pages if hugepages unavailable, so the cluster boots either way. (<https://www.postgresql.org/docs/18/kernel-resources.html#LINUX-HUGE-PAGES>.) |
| `default_toast_compression` | `lz4` | yes | Inherited from `02 §0.4`; restated for completeness. (<https://pgpedia.info/d/default_toast_compression.html>.) |
| `wal_compression` | `zstd` | yes | PG 18 supports `zstd` directly; ~30 % smaller than `lz4` for typical WAL stream. |

## §10 Host-level kernel tuning side note

These are **host-level work, not container-level GUCs**; they belong
in `12-migrations.md` as a one-shot WSL2 setup step. PG and
OpenSearch share part of this host contract: `vm.max_map_count`,
`vm.swappiness`, `nofile`, and `memlock` matter for OpenSearch, while
`vm.nr_hugepages` is the PostgreSQL-side optimization. OpenSearch
already hits some of these per `07 §2.4`.

```sysctl
# /etc/sysctl.d/99-solemd-graph.conf (host /, applied via `sysctl --system`)
# PG 18 kernel resources:
#   https://www.postgresql.org/docs/18/kernel-resources.html
# OpenSearch important settings:
#   https://docs.opensearch.org/latest/install-and-configure/install-opensearch/index/

# vm.swappiness: prefer to evict cache, never swap PG/OpenSearch heap.
vm.swappiness                       = 1

# vm.max_map_count: OpenSearch requires 262144; PG mmap also benefits.
vm.max_map_count                    = 262144

# vm.overcommit_memory: PG manual recommends 2 (strict accounting);
#   in WSL2 this can interact poorly with cgroup limits — leave at 0
#   (heuristic) until container OOM behavior is observed.
# vm.overcommit_memory              = 0

# Huge pages: shared_buffers (warehouse 12 GB + serve 8 GB = 20 GB)
#   wants ~10240 huge pages of 2 MB each; round up for headroom.
#   Computed: each PG cluster needs ceil(shared_buffers / 2MB) + ~512 slack.
#   Combined two-cluster headroom on 68 GB: 14336.
vm.nr_hugepages                     = 14336

# Combined host networking — PgBouncer accepts up to 200 client conns (§6).
net.core.somaxconn                  = 4096

# File descriptor limits (mirrored at container level for OpenSearch)
fs.file-max                         = 1048576
```

```text
# /etc/security/limits.d/99-solemd-graph.conf
postgres soft nofile 65536
postgres hard nofile 65536
opensearch soft nofile 65536
opensearch hard nofile 65536
opensearch soft memlock unlimited
opensearch hard memlock unlimited
```

Discipline: this file is the side-note artifact for `12-migrations.md`
to install. Per-PG-cluster `huge_pages = try` (§9) means the cluster
starts gracefully even if the host operator hasn't run
`sysctl --system` yet. OpenSearch's `bootstrap.memory_lock = true`
(`compose.yaml`) requires the `memlock unlimited` line above.

**Open item flagged for reviewer**: preferred persistence path on WSL2
is the normal Linux one: enable `systemd` in `/etc/wsl.conf`, keep the
sysctls in `/etc/sysctl.d/99-solemd-graph.conf`, and let
`systemd-sysctl` apply them at distro boot. Use a `[boot] command=...`
workaround in `/etc/wsl.conf` only if systemd is unavailable. If
`vm.nr_hugepages` cannot reliably reach target count early enough at
boot, the fallback is to reserve huge pages earlier via WSL's global
`.wslconfig` `kernelCommandLine`. Confirm during first-boot that
`cat /proc/sys/vm/nr_hugepages` shows 14336 from inside WSL. Documented
at <https://learn.microsoft.com/en-us/windows/wsl/systemd> and
<https://learn.microsoft.com/en-us/windows/wsl/wsl-config>.

## §11 Sample-build calibration plan

These knobs ship with starting values above; the first sample build
re-measures them against real data and updates this doc:

| Knob | First-measure source | Current draft | Re-measure trigger |
|---|---|---|---|
| `shared_buffers` (serve) | `pg_buffercache` hit ratio after 1 hot-cards-list workload | 8 GB / 16 GB | Cache hit < 95 % → raise; > 99 % with idle GBs → lower. |
| `shared_buffers` (warehouse) | Same, during projection-read phase | 12 GB / 24 GB | Same logic. |
| `effective_cache_size` (both) | Compare planner cost estimates vs actual runtime via `auto_explain` | 20 GB / 40-48 GB | Plan-vs-actual divergence > 2× on hot queries → revisit. |
| `work_mem` (both) | `pg_stat_statements` for sort/hash temp_blks_written | 32 MB / 64 MB | > 0 temp blocks on hot queries → raise; persistent OOM headroom → lower. |
| `maintenance_work_mem` (warehouse, ingest-time) | `ingest_index_build_duration_seconds` per-family histogram | 8 GB / 16 GB | Real CREATE INDEX wall-clock; raise to 16/32 if 12-worker peak fits. |
| `io_workers` (both) | `pg_stat_io` async-vs-sync read counts after first warm-cache cycle | warehouse 8 / serve 4 | If async reads < 50 % under load, raise; PG 18 dynamic supported. |
| `autovacuum_*` per-table reloptions | `pg_stat_all_tables.last_autovacuum` cadence + `Heap Fetches` on covering scans | per §5 | If `Heap Fetches > 0` on `idx_paper_api_cards_list` post-cycle, tighten cards' `autovacuum_vacuum_scale_factor`. |
| HNSW `m` / `ef_construction` / `ef_search` | OpenSearch (`07`) — recall@10 on benchmark | (deferred per `02 §4.6`) | First time HNSW is built on `paper_embeddings_graph`. |
| PgBouncer `max_prepared_statements` | PgBouncer `SHOW STATS_AVERAGES`, `SHOW POOLS` cl_waiting | 200 | If prepared-statement evictions counter > 0 → raise; if memory bloat → lower. |
| `admin` pool size | `pg_stat_activity` for projection-worker admin role | min=1 max=2 | If post-publish `pg_prewarm` overlap stalls swap → raise to max=3. |
| `serve_read.max` (asyncpg) | `asyncpg_pool_acquire_duration_seconds` p99 | 16 / 32 | p99 > 5 ms steady → raise. |
| `wsl mem=` host commit | First-month resident memory observation | 64 GB (.wslconfig) → 120 GB | 128 GB hardware upgrade lands. |

The output of this calibration cycle replaces the **provisional**
tags above with **locked**; the file's narrative posture stays
unchanged.

## §12 Failure modes

### 12.1 Memory pressure → OOM-killer rules

If §2.2 sanity check goes wrong (typically: a wide JSONB write blows
`work_mem` × concurrency), the Linux OOM-killer picks a victim. PG
processes are protected by:

```bash
# host /etc/systemd/system/docker.service.d/oom.conf
[Service]
OOMScoreAdjust=-500   # docker daemon protected
```

Plus per-container `oom_kill_disable: false` (default) so a runaway
container dies before the host. Compose-level `mem_limit:` (already
in `compose.yaml`: 16g warehouse, 14g worker, 6g opensearch, 512m
redis) is the first wall.

**Discipline (locked)**:
- PG containers must NOT have `oom_kill_disable: true` — better to
  lose a partial ingest than the whole host.
- `vm.swappiness = 1` (§10) keeps PG off swap; if the kernel has to
  swap PG, performance falls off a cliff and OOM is more graceful.
- Engine API and worker re-acquire pools on `ConnectionDoesNotExistError`
  per `06 §11.2`, so a PG OOM-kill recovers within the next request.

### 12.2 Swap discipline

Hard rule: **PG is never on swap**. With `vm.swappiness = 1` and
`huge_pages = try` plus the §2 sized buffers, the kernel will evict
file cache long before it touches PG anonymous memory. If
`swap` consistently > 0 in `free -h` while PG is up, the §2.1
allocations are too large for the host — lower `shared_buffers` or
upgrade RAM.

### 12.3 Autovacuum stuck-on-old-XID warning paths

Tier 100 freeze (`autovacuum_freeze_max_age = 100M`, §5.1) bounds
the XID horizon. If a long-held transaction blocks freezing
(rare on warehouse — only ingest holds long sessions), the autovacuum
worker will log:

```
LOG: autovacuum: FREEZE table "solemd.paper_citations_p07" cancelled by lock conflict
```

`10-observability.md` consumes this from `pg_stat_all_tables.n_dead_tup`
+ `pg_stat_progress_vacuum`; alert at age > 80 % of `freeze_max_age`.
`vacuum_max_eager_freeze_failure_rate = 0.03` (PG 18 new GUC, §3) tunes
how aggressively eager-freeze gives up vs retries — cluster default
3 % is correct for our shape.

If the warning fires:
1. Check `pg_stat_activity` for long-held transactions.
2. Kill the holder if it's an abandoned ingest session (`05 §11.3`
   kill-switch).
3. Run `VACUUM (FREEZE) solemd.paper_citations` manually.

## §13 Observability hooks

This doc emits requirements `10-observability.md` consumes to
validate that the §3 / §4 tuning lands as designed:

| Source | Metric | Validates |
|---|---|---|
| `pg_stat_database` | `blks_hit / (blks_hit+blks_read)` per cluster | `shared_buffers` / `effective_cache_size` (§2.1). Target: serve > 99 %, warehouse > 95 % during projection-read phase. |
| `pg_stat_io` (PG 18) | `reads`, `writes`, `op_bytes` by `backend_type` and `io_method` | `io_method = worker` actually using async path. |
| `pg_stat_io` | `read_time` ratio sync vs async | `io_workers` count tuning input (§9). |
| `pg_stat_statements` | `mean_exec_time`, `temp_blks_written` | `work_mem` adequacy (§2.3) — non-zero temp blks on hot statements means raise. |
| `pg_stat_progress_vacuum` | `phase`, `heap_blks_scanned`, `index_vacuum_count` | Autovacuum cadence per §5 reloptions. |
| `pg_stat_all_tables` | `n_dead_tup`, `n_mod_since_analyze`, `last_autovacuum`, `last_autoanalyze` | Per-table autovacuum reloption effectiveness. |
| `pg_stat_bgwriter` | `buffers_clean`, `maxwritten_clean` | Bgwriter sizing (§3 / §4 bgwriter section). |
| `pg_stat_wal` | `wal_records`, `wal_bytes`, `wal_buffers_full` | `wal_buffers` adequacy. |
| `pg_buffercache` | `usagecount` distribution | `shared_buffers` not oversized; `pg_prewarm` keeping hot tables resident on serve. |
| `pg_locks` | `LWLock:LockManager` waits | Hash-partition fast-path lock contention (`02 §0.6`); 32-way still safe. |
| PgBouncer `SHOW STATS` / `SHOW POOLS` | `cl_waiting`, `sv_idle`, `xact_count`, `query_count` | §6 sizing — `cl_waiting > 0` for sustained periods means raise `default_pool_size`. |
| asyncpg pool wrappers (`06 §10.1`) | `asyncpg_pool_acquire_duration_seconds` per pool | §7 sizing — p99 > budget means raise pool max or pool starvation cause. |

`10-observability.md` is responsible for routing these into Grafana
panels and alert rules; this doc names the validation contract.

## Cross-cutting invariants

1. **Memory math sums to the host budget.** §2.1 changes that break
   the §2.2 total must update both columns + check the OpenSearch
   side against `07 §2.3` in the same edit.
2. **One conf file per cluster.** No GUC overrides outside
   `db/conf/{warehouse,serve}.conf` and the per-session
   `server_settings` declared in `06 §2.1`. No `ALTER SYSTEM`
   discipline at runtime — it bypasses the file authority.
3. **Per-table autovacuum reloption tier matches fillfactor tier.**
   Cross-check: a fillfactor-100 table that gets fillfactor-80
   autovacuum reloptions is a contradiction; CI lint enforces the
   alignment from `02 §0.5` / `03 §0.5`.
4. **`io_method = worker`, not `io_uring`.** Locked until upstream
   `postgres:18` Docker image is rebuilt `--with-liburing`. If we
   ever build a custom image, `io_method = io_uring` becomes the
   trigger for re-measuring §9.
5. **PgBouncer never sees `engine_admin`.** §6 `auth_query`
   excludes it by construction; CI lint asserts the `userlist.txt`
   builder never emits the admin role.
6. **Connection-budget ledger (§6.2) matches `max_connections`.**
   Single-edit invariant: `max_connections` in §4 and the §6.2
   columns move together.
7. **`wal_level = minimal` on warehouse is restart-only**, never
   per-session — §8.3.
8. **`huge_pages = try`, never `on`** — `on` blocks startup if the
   host hasn't been tuned; `try` degrades gracefully to 4K pages.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Two `postgresql.conf` files (`db/conf/warehouse.conf`, `db/conf/serve.conf`) mounted read-only into each cluster | Per-cluster posture is mirror-image; one conf cannot serve both. Compose mounts replace the current `command:` chain. |
| Two repo-owned `pg_hba.conf` files (`db/conf/warehouse_hba.conf`, `db/conf/serve_hba.conf`) mounted read-only into each cluster | HBA is cluster config, not ad hoc operator state; first-match ordering and `CONNECT` grants stay reviewable in-repo. |
| Memory math at 68 GB and 128 GB sums to host (§2.2) | Two-cluster + OpenSearch + worker forces explicit accounting; PG textbook 25 % rule does not generalize here. |
| Warehouse posture: `wal_level=minimal`, `synchronous_commit=off`, `archive_mode=off`, large `max_wal_size`, long checkpoint_timeout | `00 §3` / `research-distilled §5`; warehouse rebuildable from `/mnt/solemd-graph/data` (`01 §3`). |
| Serve posture: `wal_level=replica`, `synchronous_commit=on` always, tight checkpoint_timeout, aggressive bgwriter; enable WAL archiving only when real pgBackRest wiring lands | Precious data; future streaming-replica optionality without logical-WAL tax. Do not normalize fake-success `archive_command` placeholders. `03 §8` locked; `11-backup.md` activates archiving. |
| Per-table `autovacuum_*` reloptions by fillfactor tier (100 / 90 / 80) — §5 | Fillfactor and autovacuum aggressiveness are correlated; tying them in the SQL schema / migration surfaces prevents drift. |
| `active_runtime_pointer` `analyze_threshold = 10` | Singleton flips on every cutover; planner stats must lead, not lag. |
| PgBouncer-serve `pool_mode = transaction` | `00 §6` / `03 §7.3` locked. |
| PgBouncer `max_prepared_statements = 200` | Keeps optional server-side prepared-plan tracking available, while asyncpg still runs with `statement_cache_size=0`; schema-changing DDL remains a `RECONNECT` boundary if this feature is active. |
| PgBouncer `max_db_connections = 60` matches §6.2 connection-budget ledger | Single-edit invariant with serve `max_connections = 100`. |
| asyncpg `serve_read.statement_cache_size = 0` | Transaction-pooled asyncpg stays on the documented safe floor; any PgBouncer-side prepared-plan tracking is optional and integration-tested, not a reason to enable client-side caching (`06 §2.1`). |
| `io_method = worker` on both clusters | `postgres:18` Docker image not built `--with-liburing` (<https://github.com/docker-library/postgres/issues/1365>). |
| `random_page_cost = 1.1`, `effective_io_concurrency = 256` on both clusters | NVMe-class storage on both surfaces (`01 §6`). |
| `huge_pages = try` on both | Graceful fallback if host kernel not tuned. |
| `wal_level=minimal` is cluster-level discipline; never per-session toggled | Restart-required GUC; documented to prevent operator confusion. |
| `vm.swappiness = 1`, `vm.max_map_count = 262144`, `vm.nr_hugepages = 14336` | Host contract installed once by `12-migrations.md`: `vm.max_map_count` and memlock are OpenSearch-critical, `vm.nr_hugepages` is PostgreSQL-specific. |
| `default_toast_compression = lz4`, `wal_compression = zstd` | `02 §0.4`; PG 18 zstd WAL support. |
| `pg_prewarm.autoprewarm = on` on serve | Cold-cache stall avoidance (`03 §1`). |
| `pg_stat_monitor` NOT installed; `pg_stat_statements` is the source | `research-distilled §7` — they conflict on the executor hook. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| Serve `shared_buffers = 8 GB` (68 GB) / 16 GB (128 GB) | `pg_buffercache` hit ratio < 95 % under real load → raise. |
| Warehouse `shared_buffers = 12 GB` / 24 GB | Same; during projection-read window. |
| `work_mem = 32 MB` (cluster default both) | `pg_stat_statements.temp_blks_written > 0` on hot queries → raise. |
| `maintenance_work_mem = 8 GB` warehouse cluster default (16 GB ingest-session) | First-cycle `ingest_index_build_duration_seconds` measurement. |
| `io_workers = 8 / 4` | `pg_stat_io` async-vs-sync ratio after first warm cycle. |
| All §5 per-table autovacuum tier values | Per-table `last_autovacuum` cadence; `Heap Fetches` on covering scans. |
| PgBouncer `default_pool_size = 30` and `reserve_pool_size = 8` | `cl_waiting > 0` sustained → raise; pool starvation in `pg_stat_statements`. |
| asyncpg `serve_read.max = 16` (68 GB) / 32 (128 GB) | p99 acquire latency > 5 ms steady → raise. |
| asyncpg `admin.max = 2` even on 128 GB | Stays at 2 unless a second projection process lands. |
| Worker `mem_limit` 14 GB / 16 GB | Real RAPIDS + asyncpg + Pydantic peak. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Custom `postgres:18 --with-liburing` image to enable `io_method = io_uring` | Measured ≥ 20 % cold-cache read perf gap that liburing closes; today the gap is small (`research-distilled §5`). |
| PgBouncer in front of warehouse | `05 §10.1` ingest-concurrency exceeds 64-slot direct headroom. |
| `wal_level=replica` on warehouse | Streaming replica from warehouse becomes a thing (none today). |
| Tighter `statement_timeout` enforcement (250 ms via `SET LOCAL`) | Engine API per-request `SET LOCAL` lands consistently; today the cluster cap of 5 s is the safety net. |
| `pg_stat_monitor` adoption | `pg_stat_statements` insufficient — none today. |
| `oom_score_adj` per-process tuning inside containers | OOM-kills targeting the wrong process post-128 GB upgrade. |
| Move serve PG to its own NVMe (split from OpenSearch) | OpenSearch IO contends with serve PG (`01 §8`). |
| Per-process `huge_pages = on` (forced) | Operator runbook makes `vm.nr_hugepages` provision a hard prerequisite of cluster start. |

### Forward considerations from the initial serve-baseline review

These are not locked tuning changes today. They are preserved here so the later
config / image slice can evaluate them deliberately.

| Consideration | Revisit trigger |
|---|---|
| Treat structural extension SQL and runtime capability as separate states. `pg_stat_statements`, `pg_prewarm`, and any later `pg_cron` adoption only become real when the image and `shared_preload_libraries` contract in this doc are live. | The serve baseline lands schema-level extension declarations before the full tuning slice wires image, preload, and operator runbook support. |
| Revisit PgBouncer prepared-plan settings as one joint change: if parse-cost or eviction pressure shows up, evaluate `server_prepared_statements = 1` and a higher `max_prepared_statements` ceiling together rather than changing one in isolation. | `SHOW STATS_AVERAGES`, `SHOW POOLS`, or `pg_stat_statements` show prepared-plan churn or parse-cost that the current `200` ceiling is not absorbing. |
| Keep `default_toast_compression = lz4` as the cluster target, but allow specific serve columns to carry earlier per-column compression/storage directives where the schema slice has already proven that the read path benefits. | A serve-table review lands column-local compression choices before the cluster-level config rollout is complete. |

## Open items

Forward-tracked; none block subsequent docs:

- **128 GB upgrade timing.** All §2 / §3 / §4 values have a 128 GB
  column; the operator picks which is active by editing the named
  constants. No re-architecture required.
- **`wsl mem=` final value.** `01` open item; sets the host
  ceiling that §2.2 sanity-checks against. WSL defaults to 50 % of
  host RAM, which is too low for this stack, so an explicit
  `.wslconfig` cap is required. Recommended starting point:
  `memory=60GB` on the current 68 GB host, then re-measure after the
  128 GB upgrade before deciding whether to move closer to `120GB`.
- **Custom postgres:18 image with liburing** — defer until measured
  cold-cache gap justifies the maintenance.
- **PgBouncer `userlist.txt` generator + `pgbouncer_auth.user_lookup`
  function** — `12-migrations.md` owns; this doc names the auth
  scheme (scram-sha-256) and the auth_user contract (`pgbouncer_auth`
  must exist on serve PG, NEVER granted to `engine_admin`).
- **pgBackRest sidecar** — §4 now keeps serve `archive_mode=off`
  until `11-backup.md` lands with a real repo, `stanza-create`,
  `check`, and `archive_command`; do not use fake-success placeholders
  such as `'/bin/true'` as the normal pre-wiring state.

## Upstream amendments

Specific values flagged for prior-doc updates:

- **`06 §2.1`** — 128 GB column for `ingest_write` should be
  `min=8, max=96` (was `8 / 96` already; confirmed); `serve_read`
  128 GB column is `2 / 32` (was `2 / 32`; confirmed); `admin` stays
  `1 / 2` on 128 GB (06's draft showed `1 / 4` — `09` recommends
  staying at `1 / 2` until multi-process projection ships, per §7
  here). **Flag for `06`**: tighten `admin.max` to 2 in the 128 GB
  column unless multi-process projection lands.
- **`05 §6.4`** — clarified that `maintenance_work_mem = 8 GB` is
  the per-session ingest value on 68 GB host; `09 §3` keeps the
  warehouse cluster default at 8 GB for steady-state and the
  `ingest_write` pool's `server_settings` repeats it. No drift; the
  same number, owned in two places (cluster default + per-pool
  restate). **No edit needed**.
- **`03 §3.1`** — `fetch_size = 2000` on `warehouse_fdw` is
  re-confirmed here; if first-build measurements push it to 500 or
  5000, this doc updates the value and `03` cites here. **No edit
  today**.
- **`docker/compose.yaml`** — current `command:` chain (lines
  32–51) emits cluster GUCs as command-line `-c` flags. This doc's
  contract replaces them with the `db/conf/warehouse.conf` file
  mount + `-c config_file=…`. The old `-c` chain stays valid as a
  fallback during the migration window (`12-migrations.md` step).
- **`07 §2.3`** — JVM heap stays at 31 GB regardless of host
  upgrade; this doc's §2.1 OS-cache row sums consistent with that.
  **No edit needed**.

No contradictions discovered with `00–08` or `research-distilled.md`.
