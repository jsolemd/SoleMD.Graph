# 12 — Schema Migrations

> **Status**: locked for the SQL-first schema-authoring posture, the fresh-start
> baseline rule, the per-cluster migration directory layout, the
> `schema_migrations.py` executor contract, the per-cluster ledger rule, the
> Better-Auth-outside-runner boundary, the amendment-ledger discipline, and the
> CI shape. Exact lint command selection and the generated snapshot formatting
> are **provisional** until the first full migration round-trip on the rebuilt
> clusters.
>
> **Date**: 2026-04-17
>
> **Scope**: the schema-evolution machinery for the rebuilt backend. This doc
> owns the authoring surface for PostgreSQL schema state, the versioned
> migration directory layout, the executor contract, generator outputs, CI
> checks, and the structural-amendment ledger. Runtime tuning remains in
> `09-tuning.md`; backup mechanics remain in `11-backup.md`; auth activation
> remains deferred to `13-auth.md`.
>
> **Authority**: this doc is authority for how schema-bearing changes become
> versioned SQL and how those SQL files are applied. `02` and `03` remain
> authority for warehouse / serve table shape; `06 §8` remains authority for
> the Python-side runner placement and invocation contract.

## Purpose

The rebuilt program cannot depend on Atlas Pro, and the project cannot afford
to smuggle that assumption back in through examples or tooling defaults.
PostgreSQL-native SQL is therefore the authoritative schema surface.

That resolves the main implementation blocker cleanly:

- partitions, comments, roles / grants, extensions, functions, triggers, and
  `postgres_fdw` objects are all expressible directly in PostgreSQL SQL
- the existing runner semantics already match the project shape better than a
  new migration framework would
- one SQL-first surface is cleaner than a split world where "basic tables" live
  in one tool and advanced PostgreSQL objects live in another

Sqitch is the strongest off-the-shelf open-source alternative if the runner
ever proves insufficient, but it is **not** the locked path here. The locked
path is native SQL plus the rebuilt executor and ledger.

## 0. Through-line decisions

These decisions are no longer open:

1. **No external declarative-schema dependency.** The authoring authority for
   this rebuild is the repository's SQL schema surface.
2. **SQL-first desired state.** Ordered SQL schema directories under `db/schema/`
   are the canonical structural source.
3. **Versioned SQL migrations.** Timestamped `*.sql` files under
   `db/migrations/<cluster>/` are the only applied change units.
4. **Runner-owned ledger.** `engine/db/scripts/schema_migrations.py` remains the
   executor / ledger contract, rewritten as needed, but still doc-led rather
   than legacy-led.
5. **Fresh-start rule.** New clusters bootstrap the runner ledger, then apply
   the new baseline migration set. They do not adopt the archived legacy chain.
6. **Better Auth remains outside the runner.** The serve-cluster `auth` schema
   is reserved structurally; Better Auth's own CLI owns `auth.*` only when auth
   activates.
7. **Secret-bearing user mappings stay out of version control.**
   `CREATE SERVER` may be structural SQL; `CREATE USER MAPPING` with secrets is
   an admin step applied after structural success.

## 1. Authoring surface

Canonical desired-state layout:

```text
db/
├── schema/
│   ├── warehouse/
│   │   ├── 00_schemas.sql
│   │   ├── 10_extensions.sql
│   │   ├── 20_enum_types.sql
│   │   ├── 30_tables_core.sql
│   │   ├── 40_tables_partitioned.sql
│   │   ├── 50_indexes.sql
│   │   ├── 60_functions.sql
│   │   ├── 70_triggers.sql
│   │   └── 80_comments.sql
│   ├── serve/
│   │   ├── 00_schemas.sql
│   │   ├── 10_extensions.sql
│   │   ├── 20_fdw.sql
│   │   ├── 30_tables_core.sql
│   │   ├── 40_indexes.sql
│   │   ├── 50_functions.sql
│   │   ├── 60_triggers.sql
│   │   └── 80_comments.sql
│   ├── generated/
│   │   └── enum_comments.sql
│   └── enum-codes.yaml
├── migrations/
│   ├── warehouse/
│   ├── serve/
│   └── serve/auth/          # reserved for Better Auth only; empty day one
└── snapshots/
    ├── warehouse_schema.sql
    ├── serve_schema.sql
    └── roles.sql
```

Rules:

- The ordered SQL files under `db/schema/warehouse/` and `db/schema/serve/`
  are the canonical desired-state source for structural review.
- Files are executed and reviewed in lexical order. Dependencies must therefore
  be ordered explicitly.
- `db/schema/generated/enum_comments.sql` is generator-owned.
- `db/snapshots/*.sql` are inspection artifacts for humans and CI. They are not
  authored by hand and are not the migration source.

## 2. What lives where

### 2.1 Desired-state SQL

Use the schema directories for objects that define the intended structural
state:

- schemas
- extensions
- enum types and enum-code comments
- tables and partitions
- indexes
- `COMMENT ON`
- functions
- triggers
- foreign server definitions that do not contain secrets

### 2.2 Versioned migration SQL

Use `db/migrations/<cluster>/` for reviewable change units that the runner
applies:

- baseline creation
- additive table / index / function changes
- destructive or corrective changes
- non-transactional operations that the runner marks `autocommit`

### 2.3 Admin / deploy SQL

These are intentionally outside the committed migration set:

- `CREATE USER MAPPING` statements with credentials
- secret-bearing `ALTER ROLE ... PASSWORD`
- one-off operator recovery SQL
- environment-specific restore or repair actions

## 3. Generator contract

`db/schema/enum-codes.yaml` remains the single source of truth for SMALLINT
enum codes.

Locked outputs:

- `engine/app/models/shared/enums.py`
- `db/schema/generated/enum_comments.sql`

The generator may also later emit machine-readable code maps for the frontend
or analyzer surfaces, but the locked contract today is Python enums plus SQL
comments.

## 4. Migration workflow

Operator path from structural change to applied SQL:

1. Edit the canonical SQL schema files in `db/schema/<cluster>/`.
2. Regenerate generator-owned artifacts if `enum-codes.yaml` changed.
3. Author a new timestamped SQL migration under `db/migrations/<cluster>/`.
4. Run the migration locally against an ephemeral cluster and a fresh database.
5. Review the SQL manually. There is no "generated diff is trusted by
   construction" assumption here.
6. Apply with the runner, not with ad hoc `psql`.
7. Refresh `db/snapshots/<...>.sql` from the post-apply database state.

Practical consequence: the SQL schema directories and the migration directories
must stay in sync in the same PR.

## 5. Executor contract

`engine/db/scripts/schema_migrations.py` remains the executor / ledger
baseline. The rebuilt version must satisfy these properties:

| Property | Contract |
|---|---|
| Cluster split | One ledger per cluster: warehouse and serve are independent. |
| Invocation | `python -m engine.db.scripts.schema_migrations apply --cluster warehouse|serve` |
| DSN boundary | DDL/admin DSNs are distinct from app-path DSNs; app read/write DSNs are never reused for migrations. |
| Ledger | `solemd.schema_migration_ledger` records migration name, path, checksum, execution mode, status, applied_at, applied_by, and notes. |
| Modes | `transactional` by default; `autocommit` for statements that cannot run in a transaction. |
| Idempotency | Already-applied file with matching checksum is a no-op; checksum mismatch is a hard error. |
| Fresh-start | Bootstrap creates the ledger and runner helpers only; the baseline migration set then runs in full. |
| Adopt | Supported only for repairing or importing an already-existing live cluster. Not used on fresh rebuilds. |
| Verify | Compares the ledger and on-disk migration set; exits non-zero on drift. |

## 6. Runner-owned helper objects

Bootstrap SQL is reserved for the runner's own minimum helper set:

- `solemd.schema_migration_ledger`
- any helper function the runner itself needs to record applications or manage
  non-transactional paths

Product schema does **not** hide in bootstrap. Product functions, triggers,
comments, roles, partitions, and FDW server objects belong in the SQL schema
surface and in versioned migrations.

## 7. Procedural PostgreSQL object home

The home for product procedural objects is locked:

- functions: `db/schema/<cluster>/60_functions.sql`
- triggers: `db/schema/<cluster>/70_triggers.sql`
- comments on those objects: `db/schema/<cluster>/80_comments.sql`

This applies to:

- normalization helpers
- cutover / audit helpers
- analyzer enqueue helpers
- bundle-eligibility helpers
- any trigger function required by `02`, `03`, `04`, `05a`, or `05b`

## 8. FDW boundary

Serve-side FDW setup is split deliberately:

- structural SQL may create `postgres_fdw`, the foreign server, the local
  schema, and the foreign tables / import step
- credentialed user mappings are applied by the admin path after structural
  success

This preserves the docs-first structural contract without committing secrets.

## 9. Amendment ledger

`12 §9` remains the canonical landing zone for structural amendments. The
important change is that rows now point at SQL schema / migration surfaces, not
legacy declarative-surfaces vocabulary.

The currently locked structural amendment groups are:

| Group | Canonical landing surfaces |
|---|---|
| Warehouse schema amendments from `02`, `05`, `05a`, `05b` | `db/schema/warehouse/*.sql`, `db/migrations/warehouse/*.sql` |
| Serve schema amendments from `03`, `04`, `05d`, `07`, `08`, `10a` | `db/schema/serve/*.sql`, `db/migrations/serve/*.sql` |
| Non-schema operational config amendments from `01`, `06`, `09`, `11` | `db/conf/*.conf`, compose, runtime config, metrics code |
| Better Auth activation amendments from `13` | deferred until activation; do not pre-seed day one |
| OpenSearch mapping amendments from `07` | `engine/app/opensearch/mappings/*.json` |

Interpretation rule for the rebuild:

- any amendment row that changes the intended day-one schema shape must be
  folded into the initial SQL baselines before the first migration set is
  considered complete
- auth rows are excluded until activation
- sample-build-governed tuning rows remain provisional

## 10. Better Auth boundary

Better Auth stays outside the runner and outside the day-one implementation
path.

Locked rule set:

- `db/schema/serve/00_schemas.sql` reserves `auth`
- runner migrations own `solemd.*` only
- Better Auth CLI owns `auth.*` only, and only when `13-auth.md` activates
- apply order at activation is:
  1. serve structural SQL / migrations
  2. Better Auth CLI
  3. any app-owned `solemd.user_*` additions if the product surface needs them

The current official Better Auth CLI is `npx auth@latest`, not
`@better-auth/cli`.

## 11. CI contract

The CI surface changes with the SQL-first posture:

1. **Generator drift check**
   - `generate_enums.py --check`
2. **SQL lint**
   - `sqlfluff` or equivalent SQL linter over `db/schema/**/*.sql` and
     `db/migrations/**/*.sql`
3. **Fresh-database round-trip**
   - Testcontainers starts PostgreSQL 18 for warehouse and serve
   - runner bootstrap + baseline + pending migrations apply cleanly
4. **Snapshot refresh / diff**
   - `pg_dump --schema-only` for each cluster
   - `pg_dumpall --roles-only` for cluster-global roles / grants
   - committed snapshots must match or CI fails
5. **Verify command**
   - runner `verify` against the applied migration set

There is no required Atlas dependency in CI.

## 12. Drift detection

Two drift classes matter:

### 12.1 Migration drift

The ledger says one thing, the on-disk migration directory says another.

Response:

- fail `verify`
- never edit an applied migration in place
- repair via a new migration or explicit `adopt` only when the operator is
  intentionally reconciling a pre-existing live state

### 12.2 State drift

The live cluster differs from the canonical SQL schema directories.

Response:

- reproduce on a fresh ephemeral database from the schema directories plus the
  migration set
- inspect with `pg_dump --schema-only`
- land a corrective migration that brings live state back to the intended SQL
  state

## 13. Future migrations that stay deferred

These remain named but not designed:

- `pg_partman` automation
- in-PG HNSW on `paper_embeddings_graph`
- read replica on serve
- ColBERT/SPLADE sidecars if retrieval evaluation justifies them
- off-box-backup metadata tables when the mirror path activates

## Relationship to other docs

- `02` and `03` remain authority for shape; this doc owns how that shape lands.
- `06 §8` remains the runtime companion for the runner process.
- `11` remains authority for backup mechanics, not schema authoring.
- `13` remains deferred; this doc only draws its boundary.

## Primary references

- PostgreSQL partitioning: <https://www.postgresql.org/docs/current/ddl-partitioning.html>
- PostgreSQL `CREATE TABLE`: <https://www.postgresql.org/docs/current/sql-createtable.html>
- PostgreSQL `ALTER TABLE`: <https://www.postgresql.org/docs/current/sql-altertable.html>
- PostgreSQL `postgres_fdw`: <https://www.postgresql.org/docs/current/postgres-fdw.html>
- PostgreSQL `pg_dump`: <https://www.postgresql.org/docs/current/app-pgdump.html>
- PostgreSQL `pg_dumpall`: <https://www.postgresql.org/docs/current/app-pg-dumpall.html>
- Sqitch docs (informing the optional fallback, not the locked path):
  <https://sqitch.org/docs/manual/sqitch/>
