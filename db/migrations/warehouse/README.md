Warehouse-side ordered migrations belong in `db/migrations/warehouse/`.

The first warehouse baseline creates cluster roles and structural extensions.
Fresh empty-cluster application should therefore use
`scripts/schema_migrations.py apply --cluster warehouse --dsn ...` with a
bootstrap/superuser DSN until the runner grows a dedicated warehouse bootstrap
env path.

For local development, the same apply can also pass
`--sync-warehouse-role-passwords` after the baseline succeeds so the
`WAREHOUSE_DSN_*` role credentials in the environment become immediately
usable for worker startup and admin checks.

The initial migration set intentionally sticks to stock `postgres:18.3-bookworm`
extensions. Non-stock warehouse extensions (`vector`, `hypopg`, `pg_cron`,
`pg_partman`) are deferred until the warehouse image/config slice lands.
