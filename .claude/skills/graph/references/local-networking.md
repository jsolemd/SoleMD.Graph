# Local Networking Contract

Agent-facing networking rules for SoleMD.Graph local development.

Use this reference for loopback policy, env vars, remote forwarding, and
host-surface troubleshooting. Keep this contract here instead of recreating it
in human-facing docs.

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
WSL2
  next dev + engine + workspace
        |
        v
Docker services
  postgres + redis + shared infra
```

Dual Tailscale on Windows and WSL is supported. It is not itself a bug.

## Canonical Endpoints

| Surface | Endpoint |
|---|---|
| WSL shell checks | `http://127.0.0.1:3000` |
| Windows browser | `http://127.0.0.1:3000` |
| PostgreSQL | `127.0.0.1:5433` |
| Redis | `127.0.0.1:6380` |
| Langfuse | `127.0.0.1:3100` |

Non-canonical baseline:
- `http://localhost:3000`
- same-machine raw tailnet addresses

## Env Contract

Prefer explicit IPv4 loopback:

```text
DATABASE_URL=...@127.0.0.1:5433/...
REDIS_URL=redis://:local_dev@127.0.0.1:6380/0
LANGFUSE_BASE_URL=http://127.0.0.1:3100
LANGFUSE_HOST=http://127.0.0.1:3100
```

## Remote Workflow

Laptop to desktop:

```bash
ssh solemd-pc -L 3000:127.0.0.1:3000 -L 8300:127.0.0.1:8300
```

Then use laptop-local `127.0.0.1` URLs.

## Triage

If `127.0.0.1` works and `localhost` fails:
- treat it as loopback-resolution drift first
- do not rewrite repo config around `localhost`

If both WSL and Windows `127.0.0.1` fail:
- treat it as app/runtime or dependency reachability first
- check Next.js, DB, and Redis directly

## References

- `../SKILL.md` for graph ownership and failure triage routing
