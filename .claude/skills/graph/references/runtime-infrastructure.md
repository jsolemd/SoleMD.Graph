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
Windows boot/logon
  -> scheduled task mounts VHD
  -> WSL distro starts
  -> systemd starts docker
  -> automount exposes /mnt/solemd-graph
  -> containers with restart policy come back
```

No step in this path should depend on Docker Desktop UI or manual terminal work.

## Compose Ownership

Shared infra resources come from `SoleMD.Infra`.

Graph-local stack:

```bash
cd /workspaces/SoleMD.Graph
docker compose -f docker/compose.yaml up -d opensearch redis
docker compose -f docker/compose.yaml --profile gpu up -d worker
docker compose -f docker/compose.yaml --profile db up -d graph-db
```

## Pinned Local Ports

| Service | Host port | Notes |
|---|---|---|
| Next.js | `3000` | Graph frontend |
| FastAPI | `8300` | Graph engine |
| Graph DB | `5433` | Postgres warehouse profile |
| Redis | `6380` | Local dev cache |
| Langfuse | `3100` | Shared observability |
| CodeAtlas | `8100` | Shared MCP |

## References

- `docs/rag-future.md` for data-plane ownership
