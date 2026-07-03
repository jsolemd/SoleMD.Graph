# Local Networking Contract

Agent-facing networking rules for SoleMD.Graph local development.

Use this reference for loopback policy, env vars, remote forwarding, and
host-surface troubleshooting. Keep this contract here instead of recreating
it in human-facing docs.

> **Single source of truth.** The pinned local ports below mirror
> `runtime-infrastructure.md`. If they ever drift, treat
> `runtime-infrastructure.md` as canonical and fix this file in the same
> batch.

## Canonical Rule

Use `127.0.0.1` as the canonical local host for repo-local configuration and
verification.

Do not treat `localhost` as equivalent on this Windows + WSL2 mirrored setup.

## Host Model

```text
Windows host
  browser + tailscale
        |
        v
WSL2  (NVIDIA-Workbench distro)
  next dev + FastAPI + workspace
        |
        v
Docker services (native dockerd inside WSL2)
  postgres warehouse + postgres serve + pgbouncer + redis
```

Dual Tailscale on Windows and WSL is supported. It is not itself a bug.

## Canonical Endpoints

| Surface | Endpoint |
|---|---|
| WSL shell checks | `http://127.0.0.1:3000` |
| Windows browser | `http://127.0.0.1:3000` |
| FastAPI (host-run) | `127.0.0.1:8010` |
| Postgres warehouse | `127.0.0.1:54432` |
| Postgres serve | `127.0.0.1:55432` |
| PgBouncer (in front of serve) | `127.0.0.1:56432` |
| Redis | `127.0.0.1:57379` |

Non-canonical baselines:
- `http://localhost:3000`
- same-machine raw tailnet addresses

Langfuse is no longer part of the local loopback baseline for the workstation
phase. It is externalized to Langfuse Cloud, so use the configured
`LANGFUSE_HOST` / `LANGFUSE_BASE_URL` rather than assuming a repo-local
`127.0.0.1` service.

## Env Contract

Prefer explicit IPv4 loopback in DSNs and broker URLs. Service-local ports
(those exposed by Postgres/Redis containers) are `5432` and `6379`; the host
mappings below are what your shell or Next.js process should target.

```text
SERVE_DSN_READ=postgresql://...@127.0.0.1:55432/serve
SERVE_DSN_ADMIN=postgresql://...@127.0.0.1:55432/serve
WAREHOUSE_DSN=postgresql://...@127.0.0.1:54432/warehouse
PGBOUNCER_URL=postgresql://...@127.0.0.1:56432/serve
REDIS_URL=redis://...@127.0.0.1:57379/0
LANGFUSE_BASE_URL=https://cloud.langfuse.com
LANGFUSE_HOST=https://cloud.langfuse.com
# or: https://us.cloud.langfuse.com
```

Pull live secret values through `solemd op-run graph -- <command>` rather
than baking them into `.env` files; see `runtime-infrastructure.md` for the
secrets contract.

## Remote Workflow

Laptop to desktop (forward Next.js + FastAPI):

```bash
ssh solemd-pc -L 3000:127.0.0.1:3000 -L 8010:127.0.0.1:8010
```

Then use laptop-local `127.0.0.1` URLs.

## Triage

If `127.0.0.1` works and `localhost` fails:
- treat it as loopback-resolution drift first
- do not rewrite repo config around `localhost`

If both WSL and Windows `127.0.0.1` fail:
- treat it as app/runtime or dependency reachability first
- check Next.js, FastAPI, Postgres, and Redis directly on their pinned ports

If a Postgres-bound process complains about `54432`/`55432` not responding,
remember the warehouse is **cold by default** (compose profile `db`). Bring
it up explicitly:

```bash
docker compose -f infra/docker/compose.yaml --profile db up -d graph-db-warehouse
```

## References

- `../SKILL.md` for graph ownership and failure triage routing
- `runtime-infrastructure.md` for the canonical pinned ports table
