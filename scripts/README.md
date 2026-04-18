## Scripts

Reserved for operator and developer scripts that are not deployable apps and do
not belong in `infra/`.

- `graph-stack` — frontend-only tmux supervisor for the current clean-room
  checkout. Backend runtime management belongs here once `apps/api` and
  `apps/worker` gain real local startup contracts.
- `schema_migrations.py` — sync PostgreSQL migration runner and durable ledger
  surface for the rebuilt backend. Local first-apply paths may use `--dsn`
  with a bootstrap connection, and the runner can sync local role passwords
  from the DSN env vars via `--sync-serve-role-passwords` or
  `--sync-warehouse-role-passwords`.
