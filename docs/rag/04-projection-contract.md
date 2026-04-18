# 04 — Projection Contract

> **Status**: locked for projection mechanics — stage-and-swap flow,
> admin-pool bypass, single-pointer flip contract, advisory-lock
> keying, cohort manifest, failure-recovery story. Microdesign details
> (per-family build SQL, exact `_prev` retention, admin pool sizes,
> observability metric names) are **provisional until the first sample
> projection build** validates them.
>
> **Date**: 2026-04-16
>
> **Scope**: the warehouse → serve projection mechanism end-to-end.
> The serve schema shape (table columns, indexes, FDW contract) is
> owned by `03`; this doc owns the *write semantics, orchestration,
> and cutover atomicity* that fill those tables.
>
> **Schema authority**: `03-serve-schema.md` is the PG-native authority
> for serve table shape. This doc is the authority for the projection
> worker's runtime contract: ledger tables, swap transaction, advisory
> locks, admin-pool bypass, cohort lifecycle, retention. Engine code
> under `engine/app/projection/` derives from here.

## Purpose

Define the operational contract that stages new projection rows on the
worker, materializes ready-to-serve tables on serve, and atomically
promotes them with a single `active_runtime_pointer` UPDATE. Six
load-bearing properties:

1. **No frontend coordination required.** Engine API reads live table
   names + the singleton pointer; cutover is invisible to the request
   path.
2. **Cohort atomicity by construction.** A single one-row UPDATE flips
   `serving_run_id` + `graph_run_id` + `api_projection_run_id`
   together (per `03 §2`). Partial promotion is *impossible*.
3. **Read-path stability under DDL.** `ALTER TABLE … RENAME` takes
   `ACCESS EXCLUSIVE` for milliseconds (PG 18 transactional DDL); the
   pgbouncer-serve transaction-mode pool isolates request-path readers
   from the swap transaction.
4. **Crash-safe.** Every step is recoverable: orphan `_next` is
   dropped before the next attempt; pointer state is one row,
   transactionally consistent with the rename; the 24 h `_prev` window
   provides a single-statement rollback.
5. **Idempotent and resumable.** Re-running a projection with the same
   `serving_run_id` resumes un-built families instead of starting
   fresh; cohort manifest is the single source of truth.
6. **Out-of-band safe.** Projection holds a dedicated **admin pool**
   that bypasses `pgbouncer-serve` so multi-statement DDL in one
   transaction (rename + pointer UPDATE + ledger insert) is durable.
   Read-path PgBouncer is unsafe for this shape (§4).

What this doc does **not** cover:

- **FDW grounding dereference** — that lives in `03 §3`. Projection
  *writes* serve; FDW *reads* warehouse. They never overlap.
- **Logical replication / CDC.** Rejected in `00 §3` and
  `research-distilled §1`. Projection is the only warehouse → serve
  write path.
- **OpenSearch alias swaps.** `07-opensearch-plane.md` owns those;
  this doc references the shared `serving_runs` row only.
- **Backup cadence.** `11-backup.md`.
- **Planner GUCs and concrete pool sizes.** `09-tuning.md`.

## 0. Conventions delta from `02` / `03`

Inherits every convention from `02 §0` and `03 §0`. Projection adds:

| Concern | Projection delta |
|---|---|
| `_next` / `_prev` suffix protocol | At most one `<table>_next` and one `<table>_prev` per family at any time. Live name is unsuffixed (`paper_api_cards`). Drop-on-orphan in §3.2 / §9.3. |
| Admin-pool bypass for DDL | Worker holds two pools — `serve_read_pool` through `pgbouncer-serve` for audits / small INSERTs, and `admin_pool` direct to PG 18 for the swap transaction. Rationale §4. |
| Advisory-lock key | `pg_try_advisory_lock(hashtext('projection:'||$family)::int8)` on a pinned admin connection for the full family lifecycle. §9.1. |
| Status codes | `serving_runs.build_status` and `api_projection_runs.build_status` share `building=1`, `published=2`, `aborted=3`, `failed=4`, `retired=5`. Registry in `db/schema/enum-codes.yaml` per `02 §0.10`. |
| Cohort manifest format | `serving_runs.cohort_manifest jsonb`, validated by Pydantic v2 schema in engine code. §5.1. |

## 1. Identity additions

None beyond `03 §2`. Confirmed:

- `serving_run_id` UUIDv7 on `solemd.serving_runs`.
- `api_projection_run_id` UUIDv7 on `solemd.api_projection_runs`.
- `active_runtime_pointer` singleton holds the live triple.

This document adds *child rows* only (`serving_artifacts` of two new
kinds, plus the cohort manifest inside `serving_runs`). No new
identity types.

## 2. Run-level lineage tables

`03 §4.3` defines row shapes. This section restates only what the
projection worker writes and adds the projection-specific columns.

### 2.1 `solemd.serving_runs` — projection-write contract

The projection worker is the only writer of `serving_runs` rows in
the projection lane. (The OpenSearch rebuild also writes
`serving_runs` for OpenSearch-driven cycles; that path is in `07`.)
Contract:

- `serving_run_id` is generated at **start** of a cycle so partial
  rows are queryable.
- `build_status` transitions: `1=building → 2=published` (success),
  `1 → 3=aborted` (worker chose to stop), or `1 → 4=failed` (uncaught
  error). Once `2`, frozen by the immutability trigger in `03 §5`.
- `cohort_manifest jsonb` is INSERTed at run start and frozen with
  the publish flip. In-progress writes only update `tables_built`,
  `last_built_family`, and timing fields.

Additive schema delta (lands in `db/schema/serve/*.sql` plus
`db/migrations/serve/*.sql`):

```sql
ALTER TABLE solemd.serving_runs
  ADD COLUMN cohort_manifest jsonb NOT NULL,
  ADD COLUMN tables_built text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN last_built_family text;

COMMENT ON COLUMN solemd.serving_runs.cohort_manifest IS
  'Pydantic-validated manifest of families, build order, source watermark, expected row counts. Frozen on publish.';
COMMENT ON COLUMN solemd.serving_runs.tables_built IS
  'Family codes successfully built so far. Drives 04 §5.4 idempotency / resume.';
COMMENT ON COLUMN solemd.serving_runs.last_built_family IS
  'Most recent family the worker finished. Resume hint.';
```

### 2.2 `solemd.api_projection_runs` — projection-write contract

Owned end-to-end by the projection worker. Created at the start of
every cycle, regardless of whether the cycle is a full serving
cutover or an API-only refresh. Lifecycle and column shape per `03
§4.3`. Additive columns:

```sql
ALTER TABLE solemd.api_projection_runs
  ADD COLUMN advisory_lock_keys bigint[] NOT NULL DEFAULT ARRAY[]::bigint[],
  ADD COLUMN swap_duration_ms integer,
  ADD COLUMN admin_connection_id integer;

COMMENT ON COLUMN solemd.api_projection_runs.advisory_lock_keys IS
  'Advisory-lock keys this run held at peak (one per family). 04 §9 audit trail.';
COMMENT ON COLUMN solemd.api_projection_runs.swap_duration_ms IS
  'Wall-clock duration of the swap transaction. Emitted to Prometheus per 04 §12.';
COMMENT ON COLUMN solemd.api_projection_runs.admin_connection_id IS
  'PG backend pid that ran the swap. Cross-references pg_stat_activity for hung-run diagnosis.';
```

### 2.3 `solemd.serving_artifacts` — projection-write contract

The projection lane writes two artifact kinds. Other kinds (per `03
§4.3`) are owned by `07-opensearch-plane.md`.

| `artifact_kind` | When | Contents |
|---|---|---|
| `cohort_manifest` | At run start. | Pointer back to `serving_runs.cohort_manifest` plus a content hash. URI: `/mnt/solemd-graph/archives/projection-manifests/<api_projection_run_id>.json`. |
| `projection_run` | Post-publish, async. | Per-family parquet snapshots + manifest. URI: `/mnt/solemd-graph/archives/serving-packages/<serving_run_id>/`. Cold reproducibility lane (§7). |

### 2.4 FK enforcement rules

Per `03 §4.3`, three columns on `serving_runs` carry refs that have no
backing PG FK. The projection worker validates each in code before the
parent INSERT. The cluster placement matters because two are genuinely
cross-cluster (no FK is *possible*) and one is intra-serve (a FK would
be possible but is rejected on ordering grounds).

| Column | Target | Kind | Why no DB FK |
|---|---|---|---|
| `serving_runs.graph_run_id` | warehouse `solemd.graph_runs` | cross-cluster | PG FKs don't span clusters. |
| `serving_runs.chunk_version_key` | warehouse `solemd.paper_chunk_versions` | cross-cluster | Same. |
| `serving_runs.api_projection_run_id` | serve `solemd.api_projection_runs` | intra-serve | Both rows are written inside the same swap transaction (§3.4); a literal FK forces a write order that the cohort manifest is free to violate. Worker asserts the row exists in-transaction. |

For the two cross-cluster refs the worker queries warehouse, asserts
the published-status guard, then INSERTs on serve:

```python
# pseudocode, projection worker
async with serve_pool.acquire() as serve, warehouse_pool.acquire() as wh:
    gr = await wh.fetchval(
        "SELECT graph_run_id FROM solemd.graph_runs WHERE graph_run_id = $1 AND status = 3",
        target_graph_run_id,
    )
    if gr is None:
        raise ProjectionAborted(f"graph_run_id {target_graph_run_id} not in published state")
    await serve.execute(
        "INSERT INTO solemd.serving_runs (serving_run_id, graph_run_id, …) VALUES ($1, $2, …)",
        new_serving_run_id, gr, …,
    )
```

## 3. Stage-and-swap flow

Identical shape for every projection target on serve. The `03 §6.1`
SQL sketch is fleshed out here with the full lifecycle: admin-pool
acquisition, advisory locking, idempotency / resume, `_prev` rollback
window.

### 3.1 Per-family lifecycle

```
                ┌────────────────────────────────────────────────────────┐
                │  PROJECTION WORKER (CUDA worker host, --profile gpu)   │
                └────────────────────────────────────────────────────────┘
                                       │
   1. pin admin connection             │  one session for the family lifecycle
   2. pg_try_advisory_lock             │  hashtext('projection:'||$family)
   3. DROP TABLE IF EXISTS …_next      │  (orphan-safe)
   4. CREATE UNLOGGED TABLE … (LIKE …) │  Replicate live shape
   5. (partition children if needed)   │  No-op for cards/profiles
   6. asyncpg copy_records_to_table    │  Binary COPY from warehouse join
   7. CREATE INDEX (parallel; non-CC)  │  Empty of readers; no CONCURRENTLY
   8. ALTER TABLE … SET LOGGED         │  Pays WAL tax once before swap
   9. ANALYZE                          │  Up-to-date stats before swap
  10. pg_prewarm                       │  Warm heap + index pages
                                       │
                ┌──────────────────────┴─────────────────────────────────┐
                │  ATOMIC SWAP TRANSACTION (admin pool, no PgBouncer)    │
                ├────────────────────────────────────────────────────────┤
                │  BEGIN;                                                │
                │    DROP TABLE IF EXISTS …_prev;                        │
                │    ALTER TABLE …      RENAME TO …_prev;                │
                │    ALTER TABLE …_next RENAME TO … ;                    │
                │    UPDATE active_runtime_pointer SET …;                │
                │    UPDATE serving_runs / api_projection_runs;          │
                │    INSERT INTO serving_artifacts;                      │
                │  COMMIT;                                               │
                └────────────────────────────────────────────────────────┘
                                       │
  11. Explicit advisory unlock         │  finally-block on same admin session
  12. Schedule _prev drop              │  pg_cron 24 h later (§3.6)
  13. Write archive parquet            │  Async post-publish; §7
```

### 3.2 Stage-table creation

```sql
DROP TABLE IF EXISTS solemd.paper_api_cards_next;
CREATE UNLOGGED TABLE solemd.paper_api_cards_next
  (LIKE solemd.paper_api_cards INCLUDING ALL);
```

`INCLUDING ALL` brings columns, defaults, generated columns,
statistics targets, comments, storage parameters, and constraints.
Indexes are recreated explicitly post-load (faster on an empty table
than growing them during COPY).

`UNLOGGED` is the bulk-load fast path: writes skip WAL while the
table has no readers. `SET LOGGED` (§3.4) pays the WAL tax once,
post-load and pre-swap, so the post-swap table is crash-safe.
Cybertec, 2024:
<https://www.cybertec-postgresql.com/en/postgresql-bulk-loading-huge-amounts-of-data/>;
EnterpriseDB, 2025:
<https://www.enterprisedb.com/blog/7-best-practice-tips-postgresql-bulk-data-loading>.
**locked**

For a partitioned target (future `paper_semantic_neighbors` per `03
§8`):

```sql
CREATE UNLOGGED TABLE solemd.paper_semantic_neighbors_next
  (LIKE solemd.paper_semantic_neighbors INCLUDING ALL)
  PARTITION BY HASH (corpus_id);

DO $$ DECLARE i int;
BEGIN
  FOR i IN 0..15 LOOP
    EXECUTE format(
      'CREATE UNLOGGED TABLE solemd.paper_semantic_neighbors_next_p%s
         PARTITION OF solemd.paper_semantic_neighbors_next
         FOR VALUES WITH (MODULUS 16, REMAINDER %s)',
      lpad(i::text, 2, '0'), i);
  END LOOP;
END$$;
```

`LIKE … INCLUDING ALL` does **not** copy the partition layout — that
must stay explicit per PG 18 `CREATE TABLE`
(<https://www.postgresql.org/docs/current/sql-createtable.html>).
Partition-aware staging is **deferred** until the §03 §8 trigger
fires.

### 3.3 Bulk load

The worker reads warehouse via direct asyncpg (warehouse has no
pooler today, per `00 §1`), transforms in-process, writes to serve
via the *direct admin pool* (§4). Binary `COPY FROM STDIN` is the
hot path per `research-distilled §2`:

```python
async with admin_pool.acquire() as serve, warehouse_pool.acquire() as wh:
    async with wh.transaction():
        cursor = wh.cursor(_QUERY_CARDS, target_graph_run_id, prefetch=2_000)
        await serve.copy_records_to_table(
            "paper_api_cards_next",
            schema_name="solemd",
            records=_records_from_cursor(cursor),
            columns=_CARDS_COLUMN_ORDER,  # MAXALIGN per 02 §0.3
        )
```

`asyncpg.copy_records_to_table` writes wire-format binary COPY
without per-row INSERT round-trips
(<https://magic.io/blog/asyncpg-1m-rows-from-postgres-to-python/>;
already cited in `research-distilled §2`). **locked**

### 3.4 Index build, ANALYZE, prewarm

```sql
-- Indexes built parallel (not CONCURRENTLY) — table has no readers
CREATE UNIQUE INDEX paper_api_cards_next_pkey
  ON solemd.paper_api_cards_next (corpus_id);

CREATE INDEX idx_paper_api_cards_next_list
  ON solemd.paper_api_cards_next
  (current_graph_run_id, package_tier, citation_count DESC, corpus_id)
  INCLUDE (display_title, author_line, publication_year,
           venue_display, text_availability, has_full_grounding)
  WHERE current_graph_run_id IS NOT NULL;

CREATE INDEX idx_paper_api_cards_next_retracted
  ON solemd.paper_api_cards_next (corpus_id) WHERE is_retracted = true;

-- WAL tax now, before swap — one-shot cost while no readers see the table
ALTER TABLE solemd.paper_api_cards_next SET LOGGED;

-- Refresh stats so the planner doesn't see a fresh-table heuristic post-swap
ANALYZE solemd.paper_api_cards_next;

-- Warm shared_buffers before the rename so the first reader doesn't hit cold cache
SELECT pg_prewarm('solemd.paper_api_cards_next', 'buffer');
SELECT pg_prewarm('solemd.idx_paper_api_cards_next_list', 'buffer');
```

`SET LOGGED` requires writing the entire table to WAL (Cybertec,
above). For 14 M cards: ~30–60 s at projection-window I/O — acceptable
because no readers see the table yet. `ANALYZE` is mandatory: without
it, the planner sees default reltuples / relpages immediately
post-swap, poisoning every plan against it for ~1 minute until
autovacuum's analyze worker catches up. **locked**

### 3.5 Swap transaction (atomic cutover)

One PG transaction over the admin pool. PG transactional DDL
guarantees atomicity (PG wiki:
<https://wiki.postgresql.org/wiki/Transactional_DDL_in_PostgreSQL:_A_Competitive_Analysis>).

```sql
-- Run via admin pool (§4); no PgBouncer in this path.
BEGIN;
  SET LOCAL lock_timeout      = '2s';
  SET LOCAL deadlock_timeout  = '100ms';
  SET LOCAL statement_timeout = '0';   -- no per-statement cap on the renames

  -- Family session advisory lock is already held on this admin connection
  -- from stage start (§9.1); swap reuses the same pinned session.

  -- Drop any leftover _prev from a previous cycle
  DROP TABLE IF EXISTS solemd.paper_api_cards_prev;

  -- The atomic swap pair. Each takes ACCESS EXCLUSIVE for ~1–10 ms
  -- (https://www.postgresql.org/docs/current/sql-altertable.html;
  --  pglocks: https://pglocks.org/?pgcommand=ALTER+TABLE+RENAME).
  ALTER TABLE solemd.paper_api_cards      RENAME TO paper_api_cards_prev;
  ALTER TABLE solemd.paper_api_cards_next RENAME TO paper_api_cards;

  -- Single-row pointer flip — atomic with the renames.
  -- API-only refresh:
  UPDATE solemd.active_runtime_pointer
     SET api_projection_run_id          = $1,
         previous_api_projection_run_id = api_projection_run_id,
         promoted_at                    = now(),
         promoted_by                    = 'projection-worker';

  -- Full serving cutover (alternative shape — graph + serving + projection move together):
  -- UPDATE solemd.active_runtime_pointer
  --    SET serving_run_id = $1, graph_run_id = $2, api_projection_run_id = $3,
  --        previous_serving_run_id = serving_run_id,
  --        previous_graph_run_id = graph_run_id,
  --        previous_api_projection_run_id = api_projection_run_id,
  --        promoted_at = now(), promoted_by = 'projection-worker';

  UPDATE solemd.api_projection_runs
     SET build_status     = 2,                          -- published
         built_at         = now(),
         swap_duration_ms = EXTRACT(MILLISECONDS FROM clock_timestamp() - $started_at)
   WHERE api_projection_run_id = $api_run_id;

  UPDATE solemd.serving_runs
     SET tables_built      = array_append(tables_built, 'paper_api_cards'),
         last_built_family = 'paper_api_cards'
   WHERE serving_run_id = $serving_run_id;

  INSERT INTO solemd.serving_artifacts
    (serving_run_id, artifact_kind, row_count, alias_or_index_name, artifact_uri, artifact_checksum)
  VALUES
    ($serving_run_id, 7 /* projection_run */, $row_count, 'paper_api_cards', NULL, $checksum);
COMMIT;
```

**Locking implications.** `ALTER TABLE … RENAME` takes
`ACCESS EXCLUSIVE` on the table (PG 18 ALTER TABLE; pglocks). With
no in-flight long readers it is millisecond-class (typical 1–10 ms;
depesz, 2019:
<https://www.depesz.com/2019/09/26/how-to-run-short-alter-table-without-long-locking-concurrent-queries/>).
The serve-side risk is a long OLTP query holding `ACCESS SHARE`
when the swap arrives — the rename then queues behind it.

**Contention story for serve readers.** Three guardrails:

1. Engine API `statement_timeout` is tight (draft 250 ms per `03
   §3.4`; final in `09-tuning.md`). A reader cannot block the swap
   longer than this.
2. `SET LOCAL lock_timeout = '2s'` inside the swap aborts cleanly
   if the rename can't acquire `ACCESS EXCLUSIVE` within 2 s.
3. `SET LOCAL deadlock_timeout = '100ms'` resolves the rare
   reader-vs-worker deadlock fast.

Expected swap duration (full cohort): 5–50 ms wall-clock; under load
with a stuck reader, capped at `lock_timeout`. Outliers logged to
`api_projection_runs.swap_duration_ms`. **locked** for shape;
`lock_timeout` value **provisional** in `09-tuning.md`.

### 3.6 `_prev` rotation and retention

After commit, the old live table exists as `_prev` — fully formed,
queryable, and the rollback target (§10.4). Default retention
**24 h** (provisional). Drop is `pg_cron`-scheduled per `03 §6.5`:

```sql
SELECT cron.schedule('drop-stale-projection-prev', '17 3 * * *',
  $$SELECT solemd.drop_projection_prev_tables()$$);

CREATE OR REPLACE FUNCTION solemd.drop_projection_prev_tables()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT n.nspname, c.relname
      FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
     WHERE n.nspname = 'solemd'
       AND c.relname LIKE '%\_prev' ESCAPE '\'
       AND c.relkind = 'r'
       AND pg_catalog.pg_stat_get_last_analyze_time(c.oid) < now() - interval '24 hours'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I', t.nspname, t.relname);
  END LOOP;
END;
$$;
```

The function uses last-analyze-time as a swap-time proxy because
`ANALYZE` is the last step of stage build (§3.4). A side ledger of
swap timestamps is cleaner — **deferred** until proven needed.

## 4. Admin-pool bypass for DDL

The projection worker holds **two** asyncpg pools:

| Pool | Routes through | Used for |
|---|---|---|
| `serve_read_pool` | `pgbouncer-serve` (txn mode) | Pre-flight audits, idempotency checks, `pg_stat_activity` queries, observability counters. |
| `admin_pool` | **Direct PostgreSQL** (no pooler) | The §3.5 swap transaction, `CREATE TABLE … (LIKE …)`, `CREATE INDEX`, `SET LOGGED`, `ANALYZE`, `pg_prewarm`, the 24 h `_prev` cleanup function. |

### 4.1 Why bypass

The pinned PgBouncer line from `16-version-inventory.md` is correct for hot OLTP
work: short transactions with prepared statements pinned to one
server connection only for the duration of the transaction. Multi-
statement DDL transactions break two assumptions:

1. **Server-pin duration mismatch.** Transaction mode unpins at
   COMMIT. Under load, PgBouncer can also recycle a connection on
   health-check timeout mid-transaction (PgBouncer FAQ:
   <https://www.pgbouncer.org/faq.html>), surfacing partial-
   transaction-rollback failures that would not occur on a direct
   connection.
2. **Prepared-statement cache invalidation across DDL.** PgBouncer
   1.21+ maintains a per-server prepared-statement cache for txn-mode
   prepared statements (Crunchy Data 2024:
   <https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer>).
   When DDL changes the underlying table, cached statements become
   invalid. PG 18 will replan on next call, but PgBouncer's cache
   state and PG's plan state can desync if the rename happens
   *between* a prepare and an execute on the same connection — the
   exact race the swap creates.

Safer rule: *DDL never traverses PgBouncer.* Direct PG 18 connections
on the same host (Unix socket available) are cheap. The projection
worker only opens one admin connection per swap. **locked**

### 4.2 Connection-string contract

```python
# engine/app/projection/_pools.py (sketch)
import asyncpg
from app.config import settings

# READ POOL — through PgBouncer
serve_read_pool = await asyncpg.create_pool(
    dsn=settings.serve_pgbouncer_dsn,
    min_size=2, max_size=8,
    statement_cache_size=0,  # PgBouncer handles its own cache; client must not double-cache
)

# ADMIN POOL — direct to PG 18 (no pooler)
admin_pool = await asyncpg.create_pool(
    dsn=settings.serve_admin_direct_dsn,    # postgresql://projector_admin@graph-db-serve:5432/serve
    min_size=1, max_size=2,                 # one swap at a time per worker; small headroom
    timeout=30,
    command_timeout=300,                    # bulk CREATE INDEX may exceed default
    statement_cache_size=128,               # admin connection caches its own statements
    server_settings={
        "application_name": "projection-worker-admin",
        "lock_timeout": "2s",
        "statement_timeout": "0",           # CREATE INDEX may take minutes
    },
)
```

Two roles on PG (managed in `12-migrations.md`):

- `engine_api` — read-only on serve, used by engine API and by the
  worker's `serve_read_pool`. Routed through PgBouncer.
- `projector_admin` — owner of `solemd.*` tables on serve; granted
  `CREATE`, `INSERT`, `UPDATE`, `DELETE`, `EXECUTE` for projection
  helpers. Direct connection only; **never** added to PgBouncer's
  `auth_query` allowlist.

Pool sizing rationale: `min=1, max=2` because projections are serial
per family (advisory lock §9) and at most one swap is in flight at
a time; second slot is for post-publish `pg_prewarm` to overlap with
`_prev` cleanup. `statement_cache_size=128` covers the swap-template
statements re-issued every cohort. **locked** for shape;
**provisional** for sizes (revisit in `09-tuning.md`).

### 4.3 Why the read pool is not adequate

The 1 % failure mode of "just use the read pool" is a catalog-state
desync that recovers only by bouncing PgBouncer. The admin-pool
bypass closes both classes (§4.1) by construction.

## 5. Cohort management

A **cohort** is a set of `(serving_run_id, family)` rows materialized
together so a single pointer flip promotes them as one unit. The
cohort is the projection worker's atomic work unit.

### 5.1 Cohort manifest (Pydantic v2 schema)

```python
# engine/app/projection/cohort.py (sketch)
from typing import Literal
from pydantic import BaseModel, Field

FamilyCode = Literal[
    "paper_api_cards", "paper_api_profiles", "graph_cluster_api_cards",
    "graph_points", "graph_clusters", "paper_semantic_neighbors", "graph_run_metrics",
    "opensearch_paper_index", "opensearch_evidence_index",
]

class FamilySpec(BaseModel):
    family: FamilyCode
    build_order: int = Field(ge=0, le=99)
    expected_row_count: int | None = None
    expected_byte_count: int | None = None
    depends_on: list[FamilyCode] = []

class CohortManifest(BaseModel):
    schema_version: int = 1
    source_graph_run_id: str           # UUIDv7 stringified
    source_release_watermark: int      # warehouse source_release_id
    chunk_version_key: str             # UUIDv7 stringified
    families: list[FamilySpec]
    pointer_flip_mode: Literal["api_only", "full_cutover"]
    notes: str | None = None
```

The manifest is constructed once at run start, validated by Pydantic,
serialized to canonical JSON (stable key order), hashed, and INSERTed
with the `serving_runs` row. The hash goes into a `serving_artifacts`
row of kind `cohort_manifest` (§7).

### 5.2 Per-family build order

Default order (lower runs first):

| Family | Build order | Depends on |
|---|---:|---|
| `graph_run_metrics` | 0 | — |
| `paper_api_profiles` | 10 | — |
| `paper_api_cards` | 20 | `paper_api_profiles` |
| `graph_clusters` | 30 | `graph_run_metrics` |
| `graph_cluster_api_cards` | 40 | `graph_clusters` |
| `graph_points` | 50 | `graph_clusters` |
| `paper_semantic_neighbors` | 60 | `graph_points` |
| `opensearch_paper_index` | 70 | `paper_api_cards`, `paper_api_profiles`, `paper_semantic_neighbors` |
| `opensearch_evidence_index` | 80 | `opensearch_paper_index` |

`depends_on` is enforced by the worker — a family with unbuilt
dependencies is skipped. For an API-only refresh the manifest may
include only cards + profiles, in which case the dependency check
passes trivially.

`07-opensearch-plane.md` owns the OpenSearch-specific build mechanics
for the two OpenSearch families above. They appear here because the
cohort manifest is shared across the whole serving cutover surface.

The dependency reasoning is **not** a DB foreign-key
(`paper_api_cards.corpus_id` doesn't FK to profiles, per `03 §5`).
It is a build-order dependency: cards rendering on the live serve
must not reference a `corpus_id` that doesn't exist in the just-
promoted `paper_api_profiles` when an operator deep-links from a list
result to a profile. Building profiles first eliminates a "card
present, profile 404" race during the few-millisecond gap between two
consecutive swaps within one cohort. **locked**

### 5.3 Failure modes — partial cohort

**Partial cohort failure is allowed at build, not at promote.**

1. Worker INSERTs `serving_runs` with `build_status = 1`.
2. Worker iterates manifest in `build_order`, building each family's
   `_next` table; rename has not happened yet.
3. If any family raises during stage / index / ANALYZE, worker:
   a. DROPs the failed family's `_next`.
   b. DROPs the *other* families' `_next` tables (cohort cannot be
      partially promoted).
   c. UPDATEs `serving_runs.build_status = 3 (aborted)`.
   d. Records the failure (§12).
   e. Releases any held family advisory lock in the worker's `finally`
      block; if the worker dies outright, the admin connection drop
      releases it automatically.
4. Pointer is **not touched.** The previous serving run remains live.

A failure *during* the swap transaction itself rolls back atomically;
same outcome — pointer untouched, `_next` orphaned (cleaned next run).

### 5.4 Idempotency / resume

Re-running with the same `serving_run_id` resumes from `tables_built`
instead of starting fresh:

```python
async def project_cohort(serving_run_id: UUID, manifest: CohortManifest):
    existing = await serve_conn.fetchrow(
        "SELECT build_status, tables_built, cohort_manifest FROM solemd.serving_runs WHERE serving_run_id = $1",
        serving_run_id,
    )
    if existing is None:
        await _insert_serving_runs_row(serving_run_id, manifest); already_built = set()
    elif existing["build_status"] == 2:
        raise ProjectionAlreadyPublished(serving_run_id)
    elif existing["build_status"] in (1, 3):
        if hash_canonical_json(existing["cohort_manifest"]) != hash_canonical_json(manifest.model_dump()):
            raise CohortManifestDrift(serving_run_id)
        already_built = set(existing["tables_built"])
        await serve_conn.execute(
            "UPDATE solemd.serving_runs SET build_status = 1 WHERE serving_run_id = $1", serving_run_id)
    elif existing["build_status"] == 4:
        raise ProjectionRequiresNewRunId(serving_run_id)
    for family in _topological_order(manifest.families):
        if family.family in already_built: continue
        await _build_and_swap_family(serving_run_id, family)
```

A fresh `serving_run_id` is generated for any cohort that should
explicitly start over. The worker never silently restarts under the
same id.

## 6. Per-family projection patterns

One subsection per family from `03 §4.1` and `03 §4.2`. Every family
follows the §3 stage-and-swap shape; this section captures the
family-specific source, expected scale, and any deviations. Full
projection SQL lives in `engine/app/projection/_queries.py`; one
representative SQL is shown for cards. The rest are summarized.

### 6.1 `paper_api_cards`

Source: warehouse `solemd.papers`, `solemd.paper_text`,
`solemd.paper_lifecycle`, `solemd.paper_metrics`,
`solemd.paper_authors`, `solemd.authors`, `solemd.venues`, plus a
serve-side snapshot of the target cohort from
`solemd.serving_members JOIN solemd.serving_cohorts` loaded into a
temporary warehouse-session relation `projection_target_members`.
Projection sketch (full SQL in `engine/app/projection/_queries.py`):

```sql
SELECT
  p.corpus_id, $1::uuid AS current_graph_run_id,
  COALESCE(pm.citation_in_count, 0)            AS citation_count,
  COALESCE(pm.influential_citation_count, 0)   AS influential_citation_count,
  p.year AS publication_year,
  COALESCE(tm.package_tier, 0)::smallint       AS package_tier,
  COALESCE(pt.text_availability, 0)::smallint  AS text_availability,
  p.article_type, p.language, p.is_retracted,
  COALESCE((pm.grounding_readiness_flags & 1)::boolean, false) AS has_full_grounding,
  pt.title AS display_title,
  _format_author_line(pa.authors) AS author_line,
  v.display_name AS venue_display,
  jsonb_build_object('pmid', p.pmid, 'doi', p.doi_norm,
                     'pmc', p.pmc_id, 's2', p.s2_paper_id) AS external_ids
FROM solemd.papers p
JOIN projection_target_members tm USING (corpus_id)
LEFT JOIN solemd.paper_text pt    USING (corpus_id)
LEFT JOIN solemd.paper_metrics pm USING (corpus_id)
LEFT JOIN solemd.venues v ON p.venue_id = v.venue_id
LEFT JOIN LATERAL (…author aggregate ORDER BY ordinal…) pa ON true
```

Expected scale (post-load, 14 M papers): ~14 M rows, ~3–6 GB
(MAXALIGN narrow row plus JSONB external_ids). **No HNSW on serve
cards** — that lane lives on OpenSearch (`07`). Build-time order: 20.
FDW: not used.

### 6.2 `paper_api_profiles`

Source: same as §6.1 plus `solemd.paper_top_concepts`,
`solemd.paper_concepts`, `solemd.concepts`. Adds full text columns
(`title`, `abstract`, `tldr`) plus `top_concepts` /
`metric_summary` JSONB. Expected scale: ~14 M rows, ~10–18 GB
(TOAST-ed abstracts dominate). Build-time order: 10. FDW: not used.

### 6.3 `graph_cluster_api_cards`

Source: warehouse-side graph build outputs (`graph_clusters`,
`graph_cluster_labels`) + per-cluster top concepts / venues /
representative members aggregated via LATERAL. Tiny (typically
≤ 50 k clusters per run). Build-time order: 40.

### 6.4 `graph_points`

Source: warehouse-side per-paper coordinates + membership for the
target `graph_run_id`. ~14 M rows per run × ~6 retained runs =
~84 M total; ~5–8 GB. Build-time order: 50. Not partitioned today
— partition trigger in `03 §8`.

### 6.5 `graph_clusters`

Mirror of warehouse `graph_clusters_<run>` filtered by run. Tiny.
Build-time order: 30.

### 6.6 `paper_semantic_neighbors`

Largest serve projection: ~14 M × top-K (default 20) = ~280 M rows
per run. Built from warehouse-side cuML / cuGraph ANN output parquet
(not from a PG join). Worker reads parquet via DuckDB and streams
into serve via binary COPY:

```python
con = duckdb.connect()
con.execute("INSTALL parquet; LOAD parquet;")
records = con.execute("""
    SELECT graph_run_id, corpus_id, neighbor_corpus_id, similarity, neighbor_rank, model_key
      FROM read_parquet('/mnt/solemd-graph/bundles/' || $graph_run_id || '/semantic_neighbors_top20.parquet')
""", {"graph_run_id": str(graph_run_id)}).fetchall()
await admin_pool.copy_records_to_table(
    "paper_semantic_neighbors_next", schema_name="solemd", records=records,
    columns=("graph_run_id", "corpus_id", "neighbor_corpus_id", "similarity", "neighbor_rank", "model_key"),
)
```

~280 M rows × ~36 B/row → ~10 GB. Build-time order: 60. FDW: not used.

When `paper_semantic_neighbors` partitioning trigger fires (`03 §8`,
hash × 16 by `corpus_id` past ~500 M rows), the §3.2 partition-aware
staging applies. **deferred**

### 6.7 `graph_run_metrics`

Tiny — one row per published graph run. Source: warehouse
`graph_runs` + `graph_bundle_artifacts` + computed bounding box.
Build-time order: 0; built first.

### 6.8 No FDW dependency for projection writes

All projection-side reads happen on warehouse-local connections. FDW
is *never* in the projection write path; per `00 §4` and `03 §3` it
is only for runtime grounding dereference from serve into warehouse.
If the worker is later moved off the warehouse host, the warehouse
connection becomes a remote PG connection — that's still not FDW.
Cross-cluster projection traffic is direct asyncpg. **locked**

## 7. Serving-artifact contract

A `serving_run` is "what is live"; a `serving_artifact` is the
durable record of the bytes that constituted that live state.

### 7.1 `cohort_manifest` artifact

Written **at run start**, before any family is built. Contains a
pointer back to `serving_runs.cohort_manifest`, a canonical-
serialization SHA-256, and the URI
`/mnt/solemd-graph/archives/projection-manifests/<api_projection_run_id>.json`.
Exists so an auditor can answer "what *should* this run have built?"
without reading the live `serving_runs` row (which may be in
`building` / `aborted` state for hours before publish).

### 7.2 `projection_run` artifact

Written **post-swap, post-publish, async**. Cold reproducibility lane
per `01 §archive`. Contents:

```
/mnt/solemd-graph/archives/serving-packages/<serving_run_id>/
├── manifest.json                      # cohort manifest copy + per-table row counts + checksums
├── schema_hash.txt                    # SHA-256 of the relevant serve-side SQL schema snapshot at build time
├── paper_api_cards.parquet            # snapshot of the live table at swap commit time
├── paper_api_profiles.parquet
├── graph_cluster_api_cards.parquet
├── graph_points.parquet
├── graph_clusters.parquet
├── graph_run_metrics.parquet
└── paper_semantic_neighbors.parquet   # if rebuilt this cycle
```

Written by a follow-up async actor scheduled by the worker:

```python
await dramatiq_broker.send(
    "projection.write_archive",
    args=[str(serving_run_id), str(api_projection_run_id)],
    delay=60_000,  # 60 s — let pg_prewarm and post-swap stats settle
)
```

The actor runs `COPY (SELECT * FROM solemd.<family>) TO PROGRAM 'zstd …'`
per family, computes a SHA-256, and INSERTs the
`serving_artifacts` row pointing at `artifact_uri =
'/mnt/solemd-graph/archives/serving-packages/<serving_run_id>/'`.

Used to: replay exact serving state for benchmarking
(`research-distilled §6`); recover from a multi-run rollback that
exhausts the 24 h `_prev` window; audit downstream-product complaints
about a missing / changed paper. **locked** for the contract;
**provisional** for compression codec and per-family naming.

### 7.3 Pointer back to `serving_runs`

`serving_artifacts(serving_run_id)` is the relationship — no direct
`serving_runs.artifact_path` column today. If engine API needs a
one-line lookup later, add a denormalized `serving_runs.archive_uri`.
**deferred**

## 8. API projection vs serving projection

Two roles share the projection worker code path but write different
ledger rows and trigger different pointer flips.

| | `serving_runs` (full cohort) | `api_projection_runs` (lighter refresh) |
|---|---|---|
| **What changes** | Every projection family + the underlying graph run + OpenSearch indexes (typically). | Just the API-facing tables (cards, profiles, cluster cards). |
| **Pointer flip** | All three pointer fields move together. | Only `api_projection_run_id` moves. |
| **Cadence** | Weekly to monthly. | Daily; recap citation counts, retraction flips, tier reassignments. |
| **Write cost** | Hours; includes graph build + OpenSearch + full projection cohort. | Minutes. |
| **Manifest** | Includes every family in §6.1–§6.7. | Only cards + profiles (and cluster cards if labels changed). |

The two share the singleton pointer. They can advance independently:

```
T0: pointer = (S=u7s_001, G=u7g_001, A=u7a_001)
T1: API-only refresh   → (S=u7s_001, G=u7g_001, A=u7a_002)
T2: API-only refresh   → (S=u7s_001, G=u7g_001, A=u7a_003)
T3: Full serving cutover → (S=u7s_002, G=u7g_002, A=u7a_004)   -- all three move
```

Atomicity is by construction: even a "full cutover" is one row
UPDATE. Partial promotion is *physically impossible*.
`CohortManifest.pointer_flip_mode` (`api_only` / `full_cutover`)
selects the UPDATE statement shape in §3.5; the choice is recorded
in the manifest and frozen with the publish flip. **locked**

## 9. Concurrency & conflict

Three classes: two projection workers, projection-vs-reader, orphan
`_next` collisions.

### 9.1 Two projection workers

The lock per family-cluster pair:

```sql
SELECT pg_try_advisory_lock(hashtext('projection:'||$family)::int8);
```

Held on the pinned admin connection for the full family lifecycle
(stage build + swap + immediate ledger writes); explicitly released in a
`finally` block with `pg_advisory_unlock(...)`. If the worker process or
admin connection dies, PG releases the session lock automatically.
(<https://www.postgresql.org/docs/current/explicit-locking.html>;
runebook:
<https://runebook.dev/en/docs/postgresql/functions-admin/pg_advisory_lock>).

The `hashtext('projection:'||family)::int8` choice over a fixed
integer space is deliberate:
- **Pro**: deterministic and effectively collision-free within the
  project's tiny family namespace; new families don't need a registry
  edit.
- **Con**: low-probability collision with another caller using
  `hashtext` on a different namespace. Mitigated by the unique
  `projection:` prefix; SoleMD owns the only `hashtext('projection:…')`
  caller.

Alternative considered and rejected: a static enum mapping
(`paper_api_cards = 1001`, `paper_api_profiles = 1002`, …). Cleaner
locally but every new family means a registry edit and a coordination
window. **locked** for `hashtext('projection:…')`; revisit if a
collision is ever observed in `pg_locks`.

`pg_try_advisory_lock` (try-lock) over `pg_advisory_lock`
(blocking-lock) — failure means "another worker is on this family"
and the worker logs and aborts the cohort cleanly
(<https://oneuptime.com/blog/post/2026-01-25-use-advisory-locks-postgresql/view>).
**locked**

The worker records every family lock key it acquires in
`api_projection_runs.advisory_lock_keys`. In the default serial build,
only one family lock is held at a time.

### 9.2 Projection-vs-reader

§3.5 covers the lock-timeout / deadlock-timeout guardrails. The
pointer UPDATE itself is one heap tuple, single-statement, atomic
under MVCC — concurrent readers see consistent state, never a torn
read.

### 9.3 `_next` table collisions

Orphan `_next` from a previous abort gets dropped before re-creating:

```sql
DROP TABLE IF EXISTS solemd.paper_api_cards_next;
CREATE UNLOGGED TABLE solemd.paper_api_cards_next (LIKE solemd.paper_api_cards INCLUDING ALL);
```

Safe because the §9.1 advisory lock prevents two workers from racing
on the same family, and orphan `_next` tables are uniquely named per
family (no `serving_run_id` suffix). The §3.5 swap also starts with
`DROP TABLE IF EXISTS … _prev` so the rename can proceed without a
collision.

## 10. Failure & recovery

### 10.1 Mid-bulk-load crash

**State**: `_next` exists, partially populated, UNLOGGED. Live
table untouched. Pointer untouched. `serving_runs.build_status = 1`.

**Recovery**: next run's `DROP TABLE IF EXISTS … _next` cleans the
orphan. A supervised retry with the same `serving_run_id` resumes per
§5.4. To abort permanently, mark `build_status = 4 (failed)`:

```sql
UPDATE solemd.serving_runs        SET build_status = 4 WHERE serving_run_id = $1 AND build_status = 1;
UPDATE solemd.api_projection_runs SET build_status = 4 WHERE api_projection_run_id = $2 AND build_status = 1;
```

Re-running then requires a new `serving_run_id` and `api_projection_run_id`.
**locked**

### 10.2 Mid-swap crash (rare; transactional)

**State**: PG rolls back the entire transaction. Live table name
still points at the prior live table. `_next` exists fully built.
Pointer untouched.

**Recovery**: a supervised retry of the swap step alone (or a fresh
projection cycle). The rename is `IF EXISTS`-safe and `_next` is
fully built — a clean retry succeeds. The advisory lock was released
when the worker's `finally` block runs or the admin connection drops.
**locked**

### 10.3 Cohort partial promotion is impossible

By construction. The pointer flip is one UPDATE — either it commits
or it rolls back. Per-family pre-swap orchestration *can* leave some
`_next` tables built and others not, but those are not visible to
the engine API (it reads live names only). They are bookkeeping only,
cleaned by §9.3.

### 10.4 Rollback to prior run

**Trigger**: post-publish, an operator notices a downstream issue.
**Recovery**: single multi-statement transaction on the admin pool:

```sql
BEGIN;
  -- Inverse rename per family. _failed slot avoids losing the rejected table.
  ALTER TABLE solemd.paper_api_cards          RENAME TO paper_api_cards_failed;
  ALTER TABLE solemd.paper_api_cards_prev     RENAME TO paper_api_cards;
  ALTER TABLE solemd.paper_api_cards_failed   RENAME TO paper_api_cards_next;

  -- Pointer reverse to previous_*
  UPDATE solemd.active_runtime_pointer
     SET serving_run_id                 = previous_serving_run_id,
         graph_run_id                   = previous_graph_run_id,
         api_projection_run_id          = previous_api_projection_run_id,
         previous_serving_run_id        = serving_run_id,
         previous_graph_run_id          = graph_run_id,
         previous_api_projection_run_id = api_projection_run_id,
         promoted_at                    = now(),
         promoted_by                    = 'operator-rollback';

  UPDATE solemd.serving_runs        SET build_status = 5 WHERE serving_run_id = $retired_run_id;
  UPDATE solemd.api_projection_runs SET build_status = 5 WHERE api_projection_run_id = $retired_api_projection_run_id;
COMMIT;
```

`_prev` provides a 24 h rollback window. Older targets require
re-projection from `serving_artifacts` of kind `projection_run` (§7.2)
— treated as a full projection cycle with the prior `cohort_manifest`,
not a single-statement rollback.

**locked** for the contract; **provisional** for whether the rollback
also flips OpenSearch aliases (likely yes for a full-cutover rollback;
coordinated in `07`).

### 10.5 Mid-archive-write crash

Live tables and pointer are correct; `serving_artifacts` row of kind
`projection_run` is missing. The actor is idempotent — re-running
re-COPYs from the now-live tables and INSERTs the missing row. Worst
case: the archive captures live state at archive-task time, not at
swap time. Lifting the COPY into the swap transaction is **deferred**
until proven needed.

## 11. Operational cadence

### 11.1 pg_cron schedules

| Job | Cron | Purpose |
|---|---|---|
| `drop-stale-projection-prev` | `17 3 * * *` | Drop `_prev` older than 24 h (§3.6). |
| `projection-trigger-api-refresh` | `0 5 * * *` | Daily API-only refresh — recompute citation counts, retraction flips, tier reassignments. Runs a SQL-side handoff that the external dispatcher turns into a Dramatiq job. |
| `projection-audit-orphans` | `45 4 * * *` | Find `_next` tables older than 6 h (likely orphan); alert via §12. |
| `projection-cohort-drift-audit` | `*/30 * * * *` | Re-validate live `cohort_manifest` against the actually-promoted family rows; emit a Prometheus gauge. |

Per `03 §6.5`, all jobs run on staggered minutes to reduce lock and I/O
collisions. `pg_cron` itself can run multiple jobs in parallel when background
workers are enabled; the SQL helper / external dispatcher split is what keeps
Redis and Dramatiq concerns out of Postgres. **locked** for the job set;
**provisional** for exact cron values (tuned in `10-observability.md`).

### 11.2 Expected RPO

For projection-built tables on serve, RPO = `serving_runs.built_at`
of the live serving run. Default cadence:

- Full serving cutover: weekly (RPO ≤ 7 days).
- API-only refresh: daily (RPO ≤ 24 h).
- Hot-fix projection (out-of-cycle): minutes — see §11.3.

Per `01 §7`, the serve cluster is also pgBackRest-protected (full
weekly + daily incr + 5–10 min WAL); the projection-side RPO sits
inside that pgBackRest envelope.

### 11.3 Hot-fix projection (out-of-cycle)

Operator path:

1. Operator constructs a `CohortManifest` (Pydantic helper) — typically
   `pointer_flip_mode = "api_only"` with `families = [paper_api_cards]`.
2. Operator dispatches: `python -m engine.app.projection hot_fix
   --manifest hotfix.json`.
3. Worker acquires the per-family advisory lock (§9.1), runs the §3
   stage-and-swap flow, and publishes.
4. Pointer flips on commit; engine API sees the new cards on the next
   request.

Total wall-clock for a `paper_api_cards`-only hot fix: ~5–15 min on
the build, ~50 ms on the swap.

### 11.4 Kill-switch contract

1. **Per-family freeze.** Set
   `app.projection_disabled_families = 'paper_api_cards,paper_api_profiles'`
   (PG GUC); the worker reads this at the start of each family and
   skips listed families. Useful for taking one misbehaving family
   out of the daily refresh without disabling the whole worker.
2. **Whole-projection halt.** Set `app.projection_enabled = false`
   (PG GUC, set via `ALTER SYSTEM` or via Dramatiq actor config).
   Worker checks at run start; if false, exits with a structured
   `projection_disabled` event. Useful for "pause everything while
   I diagnose the warehouse."

Both kill switches are non-destructive — live serving state is
unaffected, only future projections are blocked. **locked**

## 12. Observability hooks

This document does not design dashboards (`10-observability.md`
does). It emits the requirements that `10` must surface for the
projection lane.

### 12.1 Job-result rows

Every cycle writes structured rows that `10-observability.md` must
scrape: `api_projection_runs` and `serving_runs` (built / failed /
aborted counts; status histogram); per-family build duration via
`serving_artifacts.row_count` change rate and worker Prometheus
metrics.

### 12.2 Required Prometheus metrics

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `projection_swap_duration_ms` | histogram | `family`, `pointer_flip_mode` | Distribution of swap-transaction wall-clock. SLO: p95 < 100 ms. |
| `projection_build_duration_seconds` | histogram | `family` | Per-family stage build (CREATE TABLE … to ANALYZE). |
| `projection_rows_written_total` | counter | `family` | Cumulative rows COPYed into `_next` tables. |
| `projection_failures_total` | counter | `family`, `failure_class` | Failure-class breakdown (`mid_load`, `mid_index`, `mid_swap`, `lock_timeout`, `manifest_drift`). |
| `projection_orphan_next_tables` | gauge | (none) | `_next` tables older than 6 h on serve — should be ≤ 1 in steady state. |
| `projection_active_run_age_seconds` | gauge | (none) | `now() - active_runtime_pointer.promoted_at`. Drift indicator. |
| `fdw_round_trip_duration_seconds` | histogram | `query_kind` | Hot-path FDW counters from `03 §3.4`; aggregated under `10`. |
| `cohort_manifest_drift_violations_total` | counter | (none) | Hits from `projection-cohort-drift-audit` (§11.1). |

### 12.3 Required structured log events

Worker logs (jsonlog format per PG 18; `research-distilled §7`):

- `projection.cycle.started` — `serving_run_id`, `manifest`, `mode`.
- `projection.family.staging_complete` — `family`, `rows_loaded`,
  `bytes_written`.
- `projection.family.swap_complete` — `family`, `swap_duration_ms`.
- `projection.cycle.published` — `serving_run_id`,
  `api_projection_run_id`, `families`.
- `projection.cycle.aborted` — `serving_run_id`, `reason`.
- `projection.cycle.failed` — `serving_run_id`, `family`,
  `error_class`, `error_message`.

`10-observability.md` is responsible for routing these into Grafana
panels and alert rules.

## Cross-family invariants

Beyond `03 §5`, projection enforces:

1. **One advisory lock per family per cluster.** §9.1.
2. **`_next` and `_prev` tables are bookkeeping only.** Engine API
   never references them; the lint rule
   `engine/test/test_engine_api_table_names.py` greps the API code
   for the suffixes and fails CI if any are found.
3. **Pointer flip is single-row, single-UPDATE.** No projection cycle
   mutates `active_runtime_pointer` more than once.
4. **`tables_built` is monotone.** Within one `serving_run_id` it
   only ever grows; resume (§5.4) appends.
5. **`cohort_manifest` is frozen at publish.** Mutation after
   `build_status = 2` is rejected by the `03 §5` immutability trigger.
6. **Archive parquet hash matches live table content at archive time.**
   `serving_artifacts` of kind `projection_run` carries a per-file
   SHA-256; an integrity audit (deferred) re-COPYs and compares.

## Write patterns (projection worker)

The projection worker is the only writer of:

- `serving_runs` (projection-lane fields; `07` writes overlapping
  rows for OpenSearch-side cycles).
- `api_projection_runs` (entirety).
- `serving_artifacts` rows of kind `cohort_manifest` and
  `projection_run`.
- All `_next` and `_prev` rotation on every projection target.
- The `active_runtime_pointer` UPDATE inside the swap transaction.
- `serving_runs.tables_built`, `serving_runs.last_built_family`.

The projection worker reads (does not write):

- `solemd.serving_members` and `solemd.serving_cohorts` on serve
  (cohort identity and target-member snapshot).
- `solemd.papers`, `solemd.paper_text`, `solemd.paper_metrics`, etc.
  on warehouse (projection sources).
- `solemd.graph_runs`, `solemd.graph_bundle_artifacts` on warehouse
  (graph-run validation per §2.4).

## Read patterns

This doc is write-only. Serve reads (engine API list / detail /
grounding) are owned by `03 §7`; warehouse reads (analytical,
benchmark) by `02 §7`.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Stage-and-swap with `_next` / `_prev` suffixes | Atomic cutover; 24 h rollback window without full rebuild. Inherits `03 §6.1`. |
| `CREATE TABLE … (LIKE … INCLUDING ALL)` for staging | Replicates columns + defaults + storage params + comments without re-authoring; partition-aware variant in §3.2. PG 18 `CREATE TABLE`. |
| `UNLOGGED` during stage build, `SET LOGGED` before swap | Skips WAL on the COPY fast path, pays it once before swap to keep crash safety. Cybertec / EnterpriseDB; `research-distilled §2`. |
| Single multi-statement transaction for swap (DROP `_prev` + 2 RENAMEs + pointer UPDATE + ledger updates + artifact INSERT) | PG transactional DDL; one-shot atomicity. PG wiki. |
| Admin-pool bypass for the swap transaction | The pinned PgBouncer transaction-mode pooler cannot safely pin a multi-statement DDL transaction with the prepared-statement cache; direct connection has no such risk. PgBouncer FAQ; Crunchy Data 2024. |
| `lock_timeout = '2s'` inside the swap | Prevents indefinite stall behind a stuck reader. |
| Advisory-lock key `hashtext('projection:'||family)::int8` per family | Deterministic namespace-scoped key without a registry edit for each new family. |
| `pg_try_advisory_lock` (session-scoped try-lock) over blocking variant | Worker can fail fast and report instead of blocking on a parallel run, while keeping the family lock across stage build + swap on the pinned admin connection. |
| Single `active_runtime_pointer` row holds all three live ids; flipped in one UPDATE | Inherits `03 §2`. Partial cohort promotion is physically impossible. |
| Cohort manifest in `serving_runs.cohort_manifest jsonb`, frozen on publish | Auditable + replayable; immutability per `03 §5`. |
| `tables_built text[]` monotone within a `serving_run_id` | Idempotency / resume contract. |
| API projection vs full serving cutover both flow through one pointer row | Consistent state; inherits `03 §2`. |
| `_prev` retained 24 h, dropped by `pg_cron` | Operator rollback window. |
| `serving_artifacts` row of kind `projection_run` written async post-publish | Cold reproducibility lane; `01 §4`. |
| Cross-cluster FK enforcement in worker code, not DB | Cross-cluster FKs cannot exist; worker validates before INSERT. |
| Two pools on the worker (`serve_read_pool` via PgBouncer; `admin_pool` direct) | Bypass DDL safely without losing read-path pooler benefits. |
| FDW never in projection write path | Per `00 §4` and `03 §3`. |
| `pg_prewarm` called on `_next` before swap | First post-swap reader doesn't pay a cold-cache hit. |
| `ANALYZE` on `_next` before swap | Planner sees fresh stats from the moment of cutover. |
| Per-family build order with explicit dependencies | Cards reference profile-aligned `corpus_id`s; profiles built first. |
| Per-family advisory lock list recorded on `api_projection_runs.advisory_lock_keys` | Audit trail. |
| Two `pg_cron` audit jobs (`projection-audit-orphans`, `projection-cohort-drift-audit`) | Surface orphan tables and cohort drift. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| `_prev` retention window of 24 h | Measured operator rollback frequency. |
| Admin pool sizing (`min=1, max=2`, `command_timeout=300`) | Bulk index-build duration on real warehouse data. |
| `lock_timeout = '2s'` inside swap | Real reader-vs-rename observed contention. |
| Compression codec (`zstd`) for archive parquet | Verify space + CPU tradeoff at first 100 GB of archive. |
| `projection_swap_duration_ms` p95 SLO of 100 ms | Set after first month of cutover measurements. |
| Build order (cards depend on profiles) | Verify the cross-cohort race is observable in production read patterns; if not, build can parallelize. |
| `expected_row_count` tolerance in cohort manifest validation | Set tolerance after first run; today the worker logs a warning on > 5 % drift. |
| Cron schedules for projection jobs | Tune once cutover cadence is measured. |
| Hot-fix latency budget (5–15 min for cards) | Real measurement post sample build. |
| `statement_cache_size = 128` on admin pool | Check `pg_stat_statements` for swap statements after first dozen cycles. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Lift archive COPY into the swap transaction | A real operator complaint that the archive doesn't reflect exact swap-time state. Today no incremental UPSERT runs in the post-swap window so the gap is theoretical. |
| Materialize `archive_uri` denormalized on `serving_runs` | Engine API or admin tool needs a one-line lookup. |
| Full partition-aware staging for `paper_semantic_neighbors` | `03 §8` partition-trigger fires (>500 M rows). |
| Composite advisory-lock keys (cross-family ordering at lock acquisition) | A future cohort family graph turns out to need stricter ordering than `depends_on` covers. |
| Coordinated rollback transaction spanning serve PG + OpenSearch alias swap | Only if `07`'s split-cutover + durable alias-swap retry markers prove insufficient in production. Day-one contract is explicitly split, not Saga-backed. |
| Per-family blue/green (two live tables, alias view to flip) | Sub-millisecond cutover ever becomes a requirement. Default millisecond-class swap is fine for foreseeable load. |
| Cross-region projection mirroring | Multi-region serve. |
| GPU-accelerated projection compute (NVIDIA RAPIDS for the warehouse-side join) | Profile shows the join is the cohort-build bottleneck. Today the bottleneck is index build on serve. |
| Side ledger of swap timestamps (instead of `pg_stat_get_last_analyze_time`) | Cleanup function (§3.6) becomes ambiguous because external `ANALYZE` runs interfere. |

## Open items

Forward-tracked; none block `05-ingest-pipeline.md`:

- **Final `lock_timeout` value inside swap transaction.** Today's
  draft 2 s is provisional; `09-tuning.md` will own the final value.
- **Should `serving_runs.cohort_manifest` be a separate side table
  for queryability?** JSONB is fine for atomic reads; if observability
  needs to JOIN against per-family rows frequently, denormalize to a
  `serving_run_families` table. Defer until proven.
- **Per-family parallelism inside one cohort.** Today the worker
  builds families serially per dependency order. Could be parallelized
  for non-dependent families with one admin-pool connection per
  family. Defer until measured wall-clock pressure.
- **Out-of-band projection trigger via LISTEN/NOTIFY.** Today
  triggered by pg_cron + Dramatiq enqueue. LISTEN/NOTIFY would shave
  seconds from trigger latency; defer until needed.

No contradictions discovered with `00–03` or `research-distilled.md`.
The single judgement call worth flagging is the advisory-lock key
choice (`hashtext('projection:'||family)::int8`) — locked here, but
easy to swap for a static integer registry if the reviewer prefers a
deterministic key space.
