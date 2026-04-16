# Local Networking

> Canonical local networking contract for SoleMD.Graph development.

This document defines the supported local-networking setup for the project.
It exists because SoleMD.Graph is developed on a Windows host with WSL2,
mirrored networking, and Tailscale running on both Windows and WSL.

The short version:

- Dual Tailscale on Windows and WSL is supported.
- The app should treat `127.0.0.1` as the canonical local service host.
- `localhost` is not the canonical host for this repo.
- Remote devices and laptops should use explicit SSH forwards or explicit
  tailnet addresses, not assumed `localhost` equivalence.

---

## Why This Exists

On this Windows + WSL2 mirrored setup, `localhost` resolves to both:

- `127.0.0.1`
- `::1`

The IPv4 loopback path is reliable for SoleMD.Graph local development. The
IPv6 loopback path is not. That means `localhost` can stall even when
`127.0.0.1` works correctly.

This is not just a browser quirk. If repo-local service configuration uses
`localhost`, the app can end up hanging on local PostgreSQL, Redis, Langfuse,
or other host-local services even though those same services are healthy on
IPv4 loopback.

---

## Supported Architecture

### Host/runtime model

| Layer | Runtime |
|---|---|
| Windows host | Chrome, Tailscale, host networking |
| WSL2 distro | Next.js dev server, engine, repo workspace, optional Tailscale node |
| Docker services | PostgreSQL, Redis, related local services |

### Supported network posture

| Component | Supported state |
|---|---|
| WSL2 | version 2 |
| WSL networking | mirrored mode |
| Tailscale on Windows | yes |
| Tailscale in WSL | yes |
| Windows local browser access | yes, via `127.0.0.1` |
| WSL local access | yes, via `127.0.0.1` |

This architecture is intentional. Do not assume that turning off one of the
Tailscale nodes is required for correctness.

---

## Canonical Endpoints

Use these as the default targets unless there is a specific reason not to.

| Surface | Canonical endpoint | Use |
|---|---|---|
| WSL shell | `http://127.0.0.1:3000` | `curl`, health checks, local verification |
| Windows browser on same machine | `http://127.0.0.1:3000` | primary local browser URL |
| PostgreSQL from app config | `127.0.0.1:5433` | `DATABASE_URL` |
| Redis from app config | `127.0.0.1:6380` | `REDIS_URL` |
| Langfuse from app config | `127.0.0.1:3100` | `LANGFUSE_BASE_URL`, `LANGFUSE_HOST` |
| Remote laptop | explicit `ssh -L` forward | stable laptop-local workflow |
| Android device via laptop | laptop-local forwarded port + `adb reverse` | mobile debugging |

Non-canonical endpoints:

- `http://localhost:3000`
- raw mirrored/Tailscale addresses for same-machine local browsing

These can work in some situations, but they are not the supported baseline for
this project.

---

## Repo Contract

### Environment variables

Repo-local service URLs should prefer explicit IPv4 loopback:

- `DATABASE_URL=postgresql://...@127.0.0.1:5433/...`
- `REDIS_URL=redis://127.0.0.1:6380/0`
- `LANGFUSE_BASE_URL=http://127.0.0.1:3100`
- `LANGFUSE_HOST=http://127.0.0.1:3100`

Do not switch these back to `localhost` unless the local-networking contract
changes and this document is updated at the same time.

### App startup behavior

When local dependencies stall, the app should fail fast instead of hanging
indefinitely. In practice:

- clear `.next/dev` before chasing phantom networking regressions after route
  or asset-serving changes
- prefer bounded startup queries and explicit error states over silent hangs

---

## Known Behavior

### Expected

- `http://127.0.0.1:3000` works from WSL
- `http://127.0.0.1:3000` works from Windows
- laptop access works through explicit SSH forwarding
- Tailscale can run on both Windows and WSL

### Known caveat

- `http://localhost:3000` may fail on the Windows host because `localhost`
  can prefer `::1`, and mirrored WSL localhost behavior does not reliably
  service the IPv6 loopback path for this workload

If `127.0.0.1` works and `localhost` fails, treat that as a host
loopback-resolution issue first, not as proof that the app is down.

---

## Remote Workflow

### Laptop to desktop

From the laptop:

```bash
ssh solemd-pc -L 3000:127.0.0.1:3000 -L 8300:127.0.0.1:8300
```

Use the laptop-local forwarded URLs afterward:

- `http://127.0.0.1:3000`
- `http://127.0.0.1:8300`

### Android via laptop

If the phone is attached to the laptop for debugging, point the phone at the
laptop-local forwarded port with `adb reverse`. Do not point the phone
directly at the desktop hostname unless that is the specific thing being
tested.

---

## Troubleshooting

### Case: `127.0.0.1` works, `localhost` fails

Interpretation:

- app is probably up
- Windows loopback resolution is the issue
- do not rewrite repo config around `localhost`

Action:

1. Use `127.0.0.1`
2. keep repo env files on IPv4 loopback
3. only consider Windows-wide IPv4-over-IPv6 preference changes as a separate
   host decision

### Case: both WSL and Windows `127.0.0.1:3000` hang

Interpretation:

- likely app/runtime issue, stale `next dev`, or blocked local dependency

Action:

1. restart `next dev`
2. clear `.next/dev`
3. verify local DB/Redis reachability on `127.0.0.1`
4. check whether a startup query is hanging

### Case: remote laptop works but local Windows browser does not

Interpretation:

- tailnet path and same-machine loopback path are different surfaces

Action:

1. verify Windows `127.0.0.1:3000`
2. do not assume tailnet success proves local `localhost` correctness

---

## References

- [map.md](map.md)
- [architecture.md](architecture.md)
- [graph-runtime.md](graph-runtime.md)
- Microsoft WSL networking:
  `https://learn.microsoft.com/en-us/windows/wsl/networking`
- Microsoft IPv6 guidance:
  `https://learn.microsoft.com/en-us/troubleshoot/windows-server/networking/configure-ipv6-in-windows`
- Tailscale Windows + WSL:
  `https://tailscale.com/docs/install/windows/wsl2`
