## Scripts

Reserved for operator and developer scripts that are not deployable apps and do
not belong in `infra/`.

- `phone-dev` — remembers the current wireless ADB port for Jon's phone under
  `XDG_STATE_HOME`, then reuses it to run `adb connect`, `adb reverse`, and
  open the Graph frontend on the phone. Use `npm run phone:port -- <port>`
  after the wireless debugging port rotates, then `npm run phone:open` or
  `npm run dev:phone`.
- `graph-stack` — frontend-only tmux supervisor for the current clean-room
  checkout. Backend runtime management belongs here once `apps/api` and
  `apps/worker` gain real local startup contracts.
- `schema_migrations.py` — sync PostgreSQL migration runner and durable ledger
  surface for the rebuilt backend. Local first-apply paths may use `--dsn`
  with a bootstrap connection, and the runner can sync local role passwords
  from the DSN env vars via `--sync-serve-role-passwords` or
  `--sync-warehouse-role-passwords`.
