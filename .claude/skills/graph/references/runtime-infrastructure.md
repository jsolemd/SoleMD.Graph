# Runtime Infrastructure Contract

Agent-facing runtime substrate for SoleMD.Graph.

Use this reference for host runtime, Docker/GPU/storage ownership, pinned local
ports, and boot/compose expectations. Keep this contract here instead of
recreating it in human-facing docs.

## Host Runtime

The canonical local runtime is native `dockerd` inside the `NVIDIA-Workbench`
WSL2 distro.

Rules:
- Do not assume Docker Desktop.
- Do not assume a devcontainer shell.
- Treat `/var/lib/docker` as serving/runtime storage.
- Treat `/mnt/solemd-graph` as warehouse-class state.

## Docker Engine

| Property | Value |
|---|---|
| Distro | `NVIDIA-Workbench` |
| Engine | `docker-ce` |
| Manager | `systemd` |
| Socket | `/var/run/docker.sock` |
| Daemon config | `/etc/docker/daemon.json` |

Operational check:

```bash
systemctl status docker
docker version
```

## GPU Contract

GPU access is through CDI, not the legacy runtime shim.

| Piece | Detail |
|---|---|
| CDI spec | `/etc/cdi/nvidia.json` |
| Toolkit | `nvidia-container-toolkit` |
| Container flag | `--device=nvidia.com/gpu=all` |
| Host GPU | RTX 5090 |

Smoke test:

```bash
docker run --rm --device=nvidia.com/gpu=all ubuntu:24.04 nvidia-smi
```

## Storage Contract

```text
serving FS
  /var/lib/docker
    -> image layers
    -> container rootfs
    -> named volumes
    -> build cache

warehouse FS
  /mnt/solemd-graph
    -> raw corpus
    -> bundles
    -> PG data
    -> archives
    -> TEI model weights
```

Rules:
- Running services do not belong on `/mnt/c` or `/mnt/e` drvfs.
- PostgreSQL data binds to `/mnt/solemd-graph/pg-data`.
- Published graph bundles live under `/mnt/solemd-graph/bundles`.
- Model cache state belongs under `/mnt/solemd-graph/cache/huggingface`.
- Current warehouse PG bind dedicates `/mnt/solemd-graph/pg-data` to one
  cluster. Before a second local PG cluster or replica ever shares that tree,
  move to a namespaced subdirectory such as
  `/mnt/solemd-graph/pg-data/warehouse`.

## Secrets Contract

The canonical local secret path is:

```bash
solemd op-run graph -- <command>
```

Rules:
- Use 1Password Environments as the only secret-bearing runtime source.
- Load one shared Environment first, then the project-specific Environment when
  you need centralized defaults with project-level overrides.
- Prefer env injection over service-local dotenv parsing.
- The canonical shared implementation and setup flow live in
  `/workspaces/SoleMD.Infra/skills/solemd/references/native-workbench.md`.
- Keep the non-secret Environment IDs in `~/.config/solemd/1password-env.sh`,
  not in repo files or Graph docs.
- Graph Docker services should receive secrets from the caller environment, not
  from an `env_file` bind to plaintext repo files.

## Boot Contract

```text
WSL distro starts (cold boot OR wake-from-sleep OR wsl --shutdown cycle)
  -> systemd runs solemd-graph-mount.service (Before=docker.service)
     -> invokes scheduled task "WSL Mount SoleMD Graph VHD" via schtasks.exe
     -> polls /mnt/solemd-graph/tei-models up to 90s for autofs to resolve
  -> systemd starts docker
  -> automount has /mnt/solemd-graph ready for bind mounts
  -> containers with restart policy come back
```

No step in this path should depend on Docker Desktop UI or manual terminal work.

Why the systemd service exists: the `WSL Mount SoleMD Graph VHD` scheduled task
only fires on Windows boot/logon triggers. Laptop sleep/wake and `wsl --shutdown`
cycles kill the WSL VM without a new Windows boot or logon, so the task does not
re-fire and the 1.85 TB vhdx ends up detached. Every bind mount under
`/mnt/solemd-graph` then fails with `no such device` and the warehouse DB, TEI,
and any container with that path dies at start.

Ownership:

| Artifact | Path |
|---|---|
| systemd unit | `/etc/systemd/system/solemd-graph-mount.service` |
| mount helper | `/usr/local/bin/ensure-solemd-graph-mount.sh` |
| Windows task | Task Scheduler → `WSL Mount SoleMD Graph VHD` |

Troubleshooting when a container reports "no such device" on `/mnt/solemd-graph`:

```bash
systemctl status solemd-graph-mount.service
journalctl -u solemd-graph-mount.service --no-pager
/usr/local/bin/ensure-solemd-graph-mount.sh   # safe to re-run; idempotent
```

Swap policy: WSL2 swap uses the default Windows location (not `E:`). Do not set
`swapFile=` in `C:\Users\Jon\.wslconfig` — the E: drive has shown I/O errors
that can cascade into container health failures.

Current local asymmetry is intentional:
- `graph-db-serve`, `pgbouncer-serve`, and `graph-redis` are always-up and use
  restart policies.
- `graph-db-warehouse` is cold-by-default under the `db` profile and does
  **not** auto-start on host reboot.
- A worker process that expects warehouse DSNs will therefore stay `not_ready`
  until someone runs
  `docker compose -f infra/docker/compose.yaml --profile db up -d graph-db-warehouse`.

## Compose Ownership

Shared infra resources come from `SoleMD.Infra`.

Graph-local stack:

```bash
cd /workspaces/SoleMD.Graph
docker compose -f infra/docker/compose.yaml up -d graph-db-serve pgbouncer-serve graph-redis
docker compose -f infra/docker/compose.yaml --profile db up -d graph-db-warehouse
```

## Pinned Local Ports

| Service | Host port | Notes |
|---|---|---|
| Next.js | `3000` | Graph frontend |
| FastAPI | `8010` | Host-run API scaffold |
| Graph DB Warehouse | `54432` | Postgres warehouse profile |
| Graph DB Serve | `55432` | Postgres serve cluster |
| PgBouncer Serve | `56432` | Transaction pooler in front of serve |
| Redis | `57379` | Local dev cache / Dramatiq broker |
| Worker Prometheus | `9095` | Infra-owned Prometheus for Graph worker telemetry |
| Worker Grafana | `3300` | Infra-owned Grafana for Graph worker telemetry |
| Langfuse | `3100` | Shared observability |
| CodeAtlas | `8100` | Shared MCP |

## References

- `docs/rag-future.md` for data-plane ownership
