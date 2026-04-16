# Runtime Infrastructure

> Canonical reference for how containers, GPU, and storage are wired on this host.

This document describes the runtime substrate that all SoleMD projects run on:
the Docker engine, GPU passthrough mechanism, storage layout, and boot flow.
Anything running in a container — SoleMD.Graph db + opensearch + redis + worker,
SoleMD.Infra Langfuse / codeatlas / qdrant / neo4j / TEI / chrome-devtools-mcp /
etc. — shares this substrate.

For RAG data-plane ownership (canonical PostgreSQL + OpenSearch serving +
object-storage archive), see [rag-future.md](../rag-future.md) — the single
source of truth. This doc covers the physical substrate; rag-future.md covers
which plane owns what.

---

## Engine: native dockerd in NVIDIA-Workbench

The host runs **native Docker CE managed by systemd inside the
NVIDIA-Workbench WSL2 distro**. There is no Docker Desktop. There is no
`docker-desktop` helper distro.

| Property | Value |
|---|---|
| Distro | `NVIDIA-Workbench` (Ubuntu 22.04 with systemd) |
| Docker engine | `docker-ce` from `download.docker.com` (apt, versioned) |
| Managed by | `systemd` — `systemctl {status,start,stop,restart} docker` |
| CLI | `/usr/bin/docker` (installed by `docker-ce-cli` package) |
| Socket | `/var/run/docker.sock` (container-default) |
| Daemon config | `/etc/docker/daemon.json` |

### daemon.json

```jsonc
{
  "features": { "cdi": true },
  "cdi-spec-dirs": ["/etc/cdi"],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "default-address-pools": [{ "base": "172.30.0.0/16", "size": 24 }]
}
```

- **No `data-root`** — dockerd uses default `/var/lib/docker` on the
  NVIDIA-Workbench rootfs (SSD-backed serving FS). Image layers, rootfs,
  named volumes, and BuildKit cache live there. This is the **serving FS**.
- `features.cdi: true` + `cdi-spec-dirs: ["/etc/cdi"]` enables Container Device Interface for GPU access.
- Log rotation caps per-container logs at 30 MB.
- Warehouse-class state (PG data, raw corpus, bundles, model weights) lives
  on the E-backed ext4 VHDX at `/mnt/solemd-graph/` — bind-mounted, not in
  `/var/lib/docker/`. See [Storage layout](#storage-layout).

### Why not Docker Desktop

- DD's WSL integration into NVIDIA-Workbench intermittently failed with `Wsl/Service/0x8007274c` during its integration-proxy startup. The failure is a WSL interop bug triggered by mirrored networking + systemd-enabled distro + DD's rapid `wsl.exe -e …` calls; it is not fixable from outside WSL.
- NVIDIA Container Toolkit does **not** officially support the DD WSL2 backend.
- DD bind mounts through its cross-distro path were broken, forcing service configs to be baked into images.
- Native dockerd eliminates all three.

---

## GPU: CDI (Container Device Interface)

GPU access is via CDI, not the legacy `--runtime=nvidia` path.

| Piece | Detail |
|---|---|
| CDI spec | `/etc/cdi/nvidia.json` (generated at boot via `nvidia-ctk cdi generate`) |
| nvidia-container-toolkit | Installed from NVIDIA's apt repo |
| Container flag | `--device=nvidia.com/gpu=all` (or compose `deploy.resources.reservations.devices`) |
| Host driver | Injected into container: `libcuda.so`, `nvidia-smi`, `/dev/nvidia*` |
| Container provides | CUDA runtime (toolkit/headers), not driver libs |

### Host GPU

- **NVIDIA GeForce RTX 5090** (Blackwell, compute capability 120)
- Driver: 595.97 (host), CUDA 13.2 support

Containers requiring GPU should base on `nvidia/cuda:13.X-devel-ubuntu22.04`
(devel flavor — NVRTC required by Numba-dependent libraries like RAPIDS)
and add CUDA runtime libs via pip/conda as needed.

### Smoke test

```bash
docker run --rm --device=nvidia.com/gpu=all ubuntu:24.04 nvidia-smi
```

Expected: full RTX 5090 nvidia-smi output, including driver + CUDA version.

---

## Storage layout

Two-filesystem split: **serving** (hot / regeneratable / fast) on the
NVIDIA-Workbench rootfs, **warehouse** (cold / bulk / irreplaceable) on the
E-backed ext4 VHDX. This mirrors the rag-future.md three-plane model: serving
FS carries the OpenSearch plane + runtime caches; warehouse FS carries the PG
canon + raw corpus + future archives.

### Serving FS — NVIDIA-Workbench rootfs (SSD)

Root of the WSL2 distro; dockerd's default `/var/lib/docker/`.

| Contents | Notes |
|---|---|
| Image layers | all `docker images` blobs |
| Container rootfs | ephemeral overlay2 layers |
| Named volumes | `opensearch_data`, `worker-venv`, `langfuse_{pg,clickhouse,minio,redis}_data`, `db_backups`, `storage_backups`, etc. |
| BuildKit cache | cached build-step intermediate layers |
| TEI HF cache | runtime-regeneratable HF download cache |

Regenerate-if-lost policy: everything here can be rebuilt from code + compose.

### Warehouse FS — `/mnt/solemd-graph/` (E:\wsl2-solemd-graph.vhdx)

Single VHDX, attached bare via `wsl --mount --vhd`, ext4-formatted, automounted.

| Path | Purpose | Size |
|---|---|---|
| `/mnt/solemd-graph/data/` | Raw corpus: pubtator, semantic-scholar | ~870 GB |
| `/mnt/solemd-graph/bundles/` | Published graph bundles | ~19 GB |
| `/mnt/solemd-graph/tmp/` | Bundle build scratch | ~3 GB |
| `/mnt/solemd-graph/pg-data/` | PostgreSQL data root (bind-mounted into graph-db) | — (empty until DB rebuild) |
| `/mnt/solemd-graph/archives/` | Future pg_dumps, exports, durable backup snapshots | — (empty) |
| `/mnt/solemd-graph/tei-models/` | Pinned embedding-model weights (RO-bound into TEI) | ~1.8 GB |

Never bind `/mnt/solemd-graph/docker/` (abandoned — previously dockerd
data-root, now removed).

Don't host running services on `/mnt/e/` or `/mnt/c/` drvfs — too slow and
out-of-spec per rag-future.md.

### VHDX

- Filename: `E:\wsl2-solemd-graph.vhdx`
- Size: 2 TB logical (dynamic; grew from 1 TB on 2026-04-15 to accommodate PG warehouse)
- Filesystem: ext4
- Label: `solemd-graph` (required by fstab automount)
- UUID: `debfd955-bba4-4623-b1cf-60764a41c350`

### fstab entry (inside NVIDIA-Workbench)

```
LABEL=solemd-graph /mnt/solemd-graph ext4 nofail,x-systemd.automount,x-systemd.device-timeout=10s,x-systemd.mount-timeout=30s 0 0
```

`x-systemd.automount` means the mount is created lazily on first access and
retried if the device is not yet attached. Survives `wsl --shutdown`.

---

## Boot flow

The chain that takes the Windows host from cold boot to "containers running":

1. **Windows logs in or boots.**
2. **Scheduled task `WSL Mount SoleMD Graph VHD` fires** (Logon + Startup triggers). Two actions:
   - `wsl.exe --mount --vhd "E:\wsl2-solemd-graph.vhdx" --bare` — attaches the VHDX to the WSL2 VM as a raw block device (shows up as `/dev/sdd`).
   - `wsl.exe -d NVIDIA-Workbench -- true` — boots the NVIDIA-Workbench distro.
3. **NVIDIA-Workbench starts systemd.**
4. **systemd automounts `/mnt/solemd-graph`** via the fstab `x-systemd.automount` unit.
5. **systemd starts `docker.service`.** dockerd reads `/etc/docker/daemon.json`, initializes its default data-root at `/var/lib/docker` (on NVIDIA-Workbench rootfs = serving FS), and loads CDI specs.
6. **Containers with `restart: unless-stopped`** come back up on their own.

No step in this chain requires a user to open a terminal or click Docker Desktop.

---

## Engine-portable compose workflow

Compose files live at `/home/workbench/SoleMD/SoleMD.{Infra,Graph}/` inside
NVIDIA-Workbench. All external networks and volumes are declared in
`SoleMD.Infra/compose.shared.yaml` and `SoleMD.Infra/infra/langfuse/compose.yaml`.

### Required pre-created resources

- Network: `shared-infra` (external, for cross-project service discovery)
- Volumes: `opensearch_data`, `worker-venv`, `db_backups`, `storage_backups`, the 5 `langfuse_*` volumes

```bash
docker network create shared-infra
for v in opensearch_data worker-venv \
         db_backups storage_backups \
         langfuse_postgres_data langfuse_clickhouse_data langfuse_clickhouse_logs \
         langfuse_minio_data langfuse_redis_data; do
  docker volume create "$v"
done
```

No `pgdata` named volume — PG binds directly to `/mnt/solemd-graph/pg-data`.

### Bringing up stacks

From inside NVIDIA-Workbench (`docker` CLI on PATH, workbench user in docker group):

```bash
# Langfuse + portainer + codeatlas-docs-db
cd /home/workbench/SoleMD/SoleMD.Infra
docker compose --profile observability up -d \
  langfuse-web langfuse-worker codeatlas-docs-db portainer

# CodeAtlas + qdrant + neo4j + tei (gpu)
docker compose --profile gpu up -d codeatlas qdrant neo4j tei

# Chrome-devtools MCP (8 containers: 4 backends + 4 gateways)
docker compose up -d \
  chrome-devtools-mcp chrome-devtools-mcp-backend \
  chrome-devtools-visible chrome-devtools-visible-backend \
  chrome-devtools-android chrome-devtools-android-backend \
  chrome-devtools-android-laptop chrome-devtools-android-laptop-backend

# SoleMD.Graph stack — default services (opensearch + redis), then gpu profile (worker)
cd /home/workbench/SoleMD/SoleMD.Graph
docker compose -f docker/compose.yaml up -d opensearch redis
docker compose -f docker/compose.yaml --profile gpu up -d worker
# db is gated behind --profile db; bring up explicitly only when rebuilding:
#   docker compose -f docker/compose.yaml --profile db up -d db
```

Profiles `gpu` and `observability` are additive; omit them to start only the
non-GPU, non-Langfuse services.

### docker-credential-desktop.exe

If `~/.docker/config.json` contains `"credsStore": "desktop.exe"`, strip it —
that's a Docker Desktop leftover and will fail every pull on native engine.

---

## Key custom images

| Image | Base | Notes |
|---|---|---|
| `graph/worker:cu13` | `nvidia/cuda:13.0.0-devel-ubuntu22.04` | Pip-installed RAPIDS 26.04 cu13 (cugraph/cuml/cupy). Multi-stage build. BuildKit uv cache mount on `/root/.cache/uv`. |
| `graph/db:pg16` | `pgvector/pgvector:pg16` | Custom init.sql via `docker-entrypoint-initdb.d/`. |
| `opensearchproject/opensearch:3.1.0` | (vendor image) | Pinned 3.x line per rag-future.md. 4 GB heap (single-node local dev). |
| `solemd-infra/codeatlas-docs-db:16-alpine` | `postgres:16-alpine` | Custom init.sql. |
| `solemd-infra/langfuse-clickhouse:25.8` | `clickhouse/clickhouse-server:25.8` | Custom memory-spill config. |
| `solemd-infra-codeatlas` | `python:3.13-slim` | Multi-stage, uv + BuildKit cache. |
| `solemd-infra-chrome-devtools-*` | `ghcr.io/sparfenyuk/mcp-proxy` | Alpine + Chromium + Node, supervisor.sh for upstream leak mitigation. |

### External images (pinned)

| Image | Tag | Why pinned |
|---|---|---|
| `ghcr.io/huggingface/text-embeddings-inference` | `120-1.9` | Blackwell compute cap 120 for RTX 5090 + TEI 1.9. |
| `postgres` | `17` | Langfuse's pg version (matches its Prisma expectations). |
| `neo4j` | `2026-community` | Latest 2026.x LTS line. |
| `qdrant/qdrant` | `latest` | Evolving schema-compat guaranteed upstream. |

### Embedding model

- **Model**: `nomic-ai/nomic-embed-text-v2-moe` (MoE, 475M total / 305M active, 768-dim, 512 max tokens)
- **Storage**: `/mnt/solemd-graph/tei-models/nomic-embed-text-v2-moe/` on host, mounted read-only into TEI
- **Task prefixes**: `search_query: ` / `search_document: ` (asymmetric, applied in `codeatlas/code_search/embedder.py`)
- **Why v2-moe over v1.5**: v1.5's published config.json ships both `max_position_embeddings` and the `n_positions` alias; TEI 1.9's parser rejects this as duplicate-field. v2-moe ships a clean config and is the maintained successor (May 2025).

---

## Observability surfaces

| Service | Port | Purpose |
|---|---|---|
| Portainer | `127.0.0.1:9000` / `:9443` | Container UI, reachable over Tailscale from laptop |
| Langfuse Web | `127.0.0.1:3100` | LLM tracing + eval UI |
| TEI | `127.0.0.1:8081` | Embeddings HTTP endpoint |
| OpenSearch | `127.0.0.1:9200` | RAG evidence-serving plane (paper_index + evidence_index; green empty until RAG P2) |
| graph-db | `127.0.0.1:5433` | PostgreSQL 16 warehouse — on profile `db`; not up by default |
| Qdrant | `6333` (container-only) | Vector store; accessed via codeatlas |
| Neo4j | `7687` (container-only) | Bolt endpoint for codeatlas |

---

## When something is wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| `docker: command not found` inside NVIDIA-Workbench | DD integration symlink left after uninstall | Re-exec shell (path picks up /usr/bin/docker from docker-ce-cli) |
| `/mnt/solemd-graph` returns "No such device" | Filesystem label missing | `sudo e2label /dev/sdd solemd-graph` (one-time) |
| `external volume "foo" not found` on compose up | External volume was never created | `docker volume create foo` (see required list above) |
| `network shared-infra not found` on compose up | External network was never created | `docker network create shared-infra` |
| graph-db won't start with `could not access "/var/lib/postgresql/data"` | `/mnt/solemd-graph/pg-data` owned wrong | `sudo chown -R 999:999 /mnt/solemd-graph/pg-data && sudo chmod 700 /mnt/solemd-graph/pg-data` |
| OpenSearch exits with `max virtual memory areas vm.max_map_count [65530] is too low` | kernel sysctl default | `sudo sysctl -w vm.max_map_count=262144` (persist in `/etc/sysctl.conf`) |
| TEI unhealthy, `duplicate field max_position_embeddings` | Using a v1.5-style model with TEI 1.9 parser | Switch to `nomic-embed-text-v2-moe` (see embedding-model section) |
| `error getting credentials: docker-credential-desktop.exe not found` | `~/.docker/config.json` still references DD's credsStore | Remove `credsStore` key from `~/.docker/config.json` |
| Dockerd won't start after reboot | VHDX not attached (scheduled task failed) | Manually `wsl.exe --mount --vhd E:\wsl2-solemd-graph.vhdx --bare` |

---

## References

- [architecture.md](architecture.md) — code/adapter boundaries
- [local-networking.md](local-networking.md) — canonical `127.0.0.1` endpoint rules
- [graph-runtime.md](graph-runtime.md) — browser-side runtime (DuckDB-WASM, Cosmograph)
- NVIDIA Container Toolkit: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/
- CDI spec: https://github.com/cncf-tags/container-device-interface
- RAPIDS install: https://docs.rapids.ai/install/
