`infra/docker` owns the local backend rebuild stack.

Slice 1 lands the always-up scaffold only:

- `graph-db-serve`
- `pgbouncer-serve`
- `graph-redis`

Use `docker compose -f infra/docker/compose.yaml up -d` from the repo root.
The matching host-run app contract lives in [.env.example](/home/workbench/SoleMD/SoleMD.Graph/.env.example).
