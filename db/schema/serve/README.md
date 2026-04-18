# Serve Baseline Scope

This directory defines the structural serve-cluster baseline for the first
serve-side schema slice. It is intentionally narrower than the full runtime
contract in `docs/rag/03-serve-schema.md` and `docs/rag/06-async-stack.md`.

## Intentionally inert in this slice

- `warehouse_fdw` server creation is structural only.
- No `USER MAPPING` is created.
- No `IMPORT FOREIGN SCHEMA` runs yet.
- No warehouse host credentials or secret-bearing FDW options are committed.

- `pgbouncer_auth.user_lookup(...)` is part of the live serve auth path.
- The migration pins that function owner to `postgres`, so the bootstrap apply
  path must use a connection that can assign and preserve that ownership.
- Role passwords are still an admin/apply concern, not committed migration SQL.
- `infra/docker/pgbouncer/userlist.txt` remains a local auth-file surface only
  for the `pgbouncer_auth` bootstrap credential; app users resolve through
  `auth_query`.

- Maintenance functions exist without a scheduler.
- No `pg_cron` integration lands here.
- No job-registration SQL lands here.

- `pg_stat_statements` and `pg_prewarm` remain structural extension entries.
- They still require preload/runtime tuning before they provide operational
  value.

## Intentional role contract

- `engine_serve_read` is default read-only in database `serve`.
- It still receives a narrow `UPDATE` grant on
  `solemd.api_projection_runs`, matching `docs/rag/06-async-stack.md` §7.1.
- That exception is for projection-worker status and audit writes, not for
  general mutable serve data access.
