# PgBouncer Local Auth Notes

This directory is the local-development PgBouncer surface for the serve cluster.

## Password ownership

- `engine_serve_read` authenticates through `auth_query` against
  `pgbouncer_auth.user_lookup($1)`.
- `pgbouncer_auth` itself authenticates through `auth_file`, so
  `userlist.txt` must stay aligned with `PGBOUNCER_AUTH_PASSWORD`.

## Rotation procedure

When `PGBOUNCER_AUTH_PASSWORD` changes locally:

1. Update the environment value.
2. Update `infra/docker/pgbouncer/userlist.txt` to the same password.
3. Re-run:
   `uv run scripts/schema_migrations.py apply --cluster serve --sync-serve-role-passwords`
4. Recreate the container:
   `docker compose -f infra/docker/compose.yaml --env-file .env.example up -d --force-recreate pgbouncer-serve`

This repo keeps `userlist.txt` tracked because the local scaffold is intentionally
simple. Do not treat it as a production secret-management pattern.
