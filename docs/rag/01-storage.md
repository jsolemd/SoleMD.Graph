# 01 — Storage Layout

> **Status**: locked for the volume / bind inventory; some sizing provisional
> until first sample build.
>
> **Date**: 2026-04-16
>
> **Scope**: every persistent surface consumed by the topology in
> `00-topology.md` — named volumes on NVMe, bind mounts on E-drive, archive
> layout, sizing envelope, growth expectations, and the filesystem concerns
> that affect them. Tuning values (`effective_io_concurrency`,
> `random_page_cost`, etc.) live in `09-tuning.md`, not here.

## Purpose

Fix exactly where every piece of state lives so `docker/compose.yaml`, the
warehouse and serve SQL schema files, the ingest pipeline, and the backup
runbook all resolve against the same paths.

Locked operational posture for the rebuild:

- initial implementation is **wave-based**, not immediate full-corpus scale
- the current 2 TB E-drive is acceptable for those first waves
- full-corpus warehouse + archive + backup scale is gated by either larger
  storage or explicit offloading / retention changes

## 1. Volume inventory

| Name                         | Kind         | Mounted on                           | Owner                 | Class     |
|------------------------------|--------------|--------------------------------------|-----------------------|-----------|
| `graph_serve_pg-data`        | named volume | `graph-db-serve:/var/lib/postgresql` | PG 18 serve     | serving   |
| `graph_opensearch_data`      | named volume | `graph-opensearch:/usr/share/opensearch/data` | OpenSearch serving line (`16`) | serving |
| `graph_worker-opt-venv`      | named volume | `graph-worker:/opt/venv`             | engine worker         | serving   |
| `graph_prometheus_data`      | named volume | `graph-prometheus:/prometheus`       | Prometheus            | serving   |
| `graph_grafana_data`         | named volume | `graph-grafana:/var/lib/grafana`     | Grafana               | serving   |
| `graph_loki_data`            | named volume | `graph-loki:/loki`                   | Loki                  | serving   |
| `/mnt/solemd-graph/pg-data`  | bind mount   | `graph-db-warehouse:/var/lib/postgresql` | PG 18 warehouse | warehouse |
| `/mnt/solemd-graph/data`     | bind mount   | `graph-worker:/mnt/solemd-graph/data`| raw release files     | warehouse |
| `/mnt/solemd-graph/bundles`  | bind mount   | `graph-worker` + asset-serving read  | published Parquet     | warehouse |
| `/mnt/solemd-graph/archives` | bind mount   | `graph-worker`                       | retired artifacts     | warehouse |
| `/mnt/solemd-graph/pgbackrest-repo` | bind  | pgBackRest sidecar (when added)      | serve backups         | warehouse |
| `/mnt/solemd-graph/tei-models` | bind mount | `graph-worker`                       | TEI model weights     | warehouse |

Stateless services (PgBouncer, Redis, Alloy) take no volumes. Redis's
Dramatiq queue is ephemeral on purpose — in-flight jobs that die on a
restart get re-queued from warehouse source-of-truth.

## 2. Named volumes on NVMe (`/var/lib/docker`)

```
/var/lib/docker/volumes/
├── graph_serve_pg-data/         serve PG cluster; projections + future auth
├── graph_opensearch_data/       paper_index + evidence_index + release aliases
├── graph_worker-opt-venv/       pre-built Python venv (RAPIDS + repo deps)
├── graph_prometheus_data/       metrics retention (15 days default)
├── graph_grafana_data/          dashboards + provisioning state
└── graph_loki_data/             log chunks + index (7 days default)
```

Rules:
- All NVMe volumes use the default `local` driver; no compose-level
  topology override needed.
- PostgreSQL 18's image stores the live cluster under a version-specific
  subdirectory beneath `/var/lib/postgresql`, so compose mounts the parent
  path rather than `/var/lib/postgresql/data`.
- Never put serve PG data on a bind mount — Docker named volumes behave
  better for crash-resume, ownership, and image-update flows.
- OpenSearch is single-node dev; `number_of_replicas = 0` makes replica
  storage a non-factor.
- Langfuse is currently externalized to Langfuse Cloud for the
  workstation phase, so it adds **no** local NVMe volume footprint.
  If a later self-hosting decision returns, the required PG +
  ClickHouse + blob-store surfaces are reinstated explicitly in this
  inventory.

## 3. Bind mounts on E-drive (`/mnt/solemd-graph`)

```
/mnt/solemd-graph/
├── pg-data/                     warehouse PG cluster data dir (UID 999)
├── data/
│   ├── semantic-scholar/
│   │   └── releases/<release_id>/   638 GB for 2026-03-10 today
│   └── pubtator/
│       └── releases/<release_id>/   210 GB for 2026-03-21 today
├── bundles/
│   ├── <graph_run_id>/          published Parquet (19 GB across 20+ runs today)
│   └── by-checksum/             symlinks for checksum asset-serving
├── archives/                    see §4 for layout
├── pgbackrest-repo/             serve backups; added with pgBackRest sidecar
└── tei-models/                  embedding model weights (TEI-compatible)
```

Rules:
- Never run a hot service on `/mnt/c`, `/mnt/e`, or any 9p/DrvFS mount.
  `/mnt/solemd-graph` is an ext4 VHDX bind; that is the supported path.
- The bind owner for PG data is UID 999 (the postgres container user).
  Never chown from inside WSL.
- The current warehouse bind uses the root path
  `/mnt/solemd-graph/pg-data` for one cluster. Before any future
  read-replica or second local PG cluster lands, move to a namespaced path such
  as `/mnt/solemd-graph/pg-data/warehouse` so PG 18 subdirectories cannot
  collide silently.
- Raw release files under `data/` are treated as read-only inputs by
  ingest workers; ingest never rewrites them in place.
- Bundles are append-only by design — a new graph run creates a new
  directory; pruning is explicit and governed by retention policy in
  `11-backup.md`.

## 4. Archive layout (filesystem-backed object store)

Plain-filesystem layout under `/mnt/solemd-graph/archives/`. No MinIO day
one; S3-style access is available later via an API server if something
needs it, but nothing in the current serving plane does.

```
/mnt/solemd-graph/archives/
├── serving-packages/
│   ├── hot/
│   │   └── <serving_run_id>/
│   │       ├── paper_index_bulk.ndjson.gz
│   │       ├── evidence_index_bulk.ndjson.gz
│   │       ├── grounding_manifest.parquet
│   │       └── serving_run_manifest.json
│   └── warm/
│       └── <serving_run_id>/
│           ├── paper_index_bulk.ndjson.gz
│           └── evidence_index_bulk.ndjson.gz
├── chunk-versions/
│   └── <chunk_version_key>/
│       ├── blocks.parquet
│       ├── sentences.parquet
│       └── members.parquet
├── cold-text/
│   └── <source_release_id>/
│       └── paper_text.parquet
└── projection-manifests/
    └── <api_projection_run_id>.json
```

Contract:
- Each directory is write-once from the producer's perspective. Retention
  pruning is a separate supervised job, recorded in `serving_artifacts` /
  `api_projection_runs` before deletion.
- Filenames are stable — no date prefixes or timestamps in the path.
  Identity comes from the enclosing `<serving_run_id>` / `<chunk_version_key>`.
- Cross-reference: the OpenSearch bulk-load pattern in
  `07-opensearch-plane.md` reads from
  `archives/serving-packages/{hot,warm}/<serving_run_id>/*`, not from a
  streaming PG pipe.

## 5. Sizing envelope

### NVMe (1 TB today, `/var/lib/docker`)

Current sizing table is the **project-local** envelope. Langfuse is
externalized to Langfuse Cloud in the current workstation phase, so no
local Langfuse storage is included here.

| Surface                        | Steady state | Peak     |
|--------------------------------|-------------:|---------:|
| Docker image layers + cache    |       ~80 GB |  ~120 GB |
| `graph_serve_pg-data`          |       ~50 GB |  ~100 GB |
| `graph_opensearch_data`        |       ~40 GB |   ~80 GB |
| `graph_worker-opt-venv`        |        ~5 GB |    ~8 GB |
| `graph_prometheus_data`        |       ~10 GB |   ~20 GB |
| `graph_grafana_data`           |       ~1 GB  |    ~2 GB |
| `graph_loki_data`              |       ~10 GB |   ~20 GB |
| Container rootfs + logs        |       ~10 GB |   ~20 GB |
| **Total**                      |      **~200 GB** | **~370 GB** |

Headroom at 1 TB is large. No NVMe sizing concerns before public launch.

### E-drive VHDX (2 TB today, `/mnt/solemd-graph`)

| Surface                              | Today   | At scale  |
|--------------------------------------|--------:|----------:|
| `data/semantic-scholar/releases/`    | 638 GB  |  ~700 GB  |
| `data/pubtator/releases/`            | 210 GB  |  ~400 GB (+BioCXML Phase 3) |
| `pg-data/` (warehouse, fresh today)  | ~0 GB   |  ~1.2 TB  |
| `bundles/`                           | 19 GB   |  ~50 GB   |
| `archives/`                          | ~0 GB   |  ~100 GB  |
| `pgbackrest-repo/` (not yet)         | —       |  ~150 GB  |
| `tei-models/`                        | ~5 GB   |  ~10 GB   |
| **Total**                            | **~871 GB** | **~2.6 TB** |

**At-scale E-drive fits poorly into 2 TB.** Expected pressure points once
warehouse is fully loaded:

- Warehouse `pg-data/` grows ~1–2 TB with citations + pubtator + grounding
  + chunk lineage loaded.
- `data/` holds rolling raw releases; a retention policy that prunes
  prior releases after new-release ingest + verification is required.
- `archives/` grows per `serving_run_id`; the retention policy pruning
  old runs must run regularly.
- `pgbackrest-repo/` will carry ~100–200 GB of rolling full + incr + WAL.

Implication: **the 2 TB E-drive is not a comfortable long-term home for
the full warehouse + archive + backup set.** That is **not** a blocker for the
initial wave-based implementation, but it is a blocker before a true
full-corpus load. Two practical paths:
1. Grow the E-drive VHDX to 4 TB before warehouse ingest.
2. Move `pgbackrest-repo/` off the E-drive onto a second bind (separate
   disk or off-box mirror as the primary, not the secondary, target).

Recording this as a deferred decision below pending the 128 GB RAM +
larger-disk hardware plan.

## 6. Filesystem and mount concerns

- `/mnt/solemd-graph` is ext4 inside a VHDX, mounted natively by WSL2.
  The VHDX is backed by the host's internal NVMe, so treat it as
  NVMe-backed virtualization (not external-SATA-class) for any I/O
  tuning decision in `09-tuning.md`. This is the supported path;
  never mount anything over DrvFS / 9p for hot services.
- Keep `/tmp` on tmpfs at WSL defaults. DuckDB spill during ingest goes
  there; size is bounded by `.wslconfig`, not by storage choice here.
- `fstrim` should run on the NVMe weekly via a systemd timer (solo-dev
  box); VHDX trim is a Windows-side concern and not in scope.
- The PG container sets `shm_size=8g` today; that is sized for parallel
  HNSW / index builds on warehouse and stays on the warehouse cluster
  only. Serve PG can stay at the default 2 GB until measured otherwise.

## 7. Backup destinations (cross-ref)

- Primary: `pgBackRest` with repo at
  `/mnt/solemd-graph/pgbackrest-repo/`. Full weekly + daily incremental +
  5–10 min WAL. Serve PG only — warehouse is rebuildable from parquet.
- Secondary (deferred): Backblaze B2 mirror for the pgBackRest repo and
  for `archives/` snapshots. Triggered when serve PG holds any
  irreplaceable data (auth, user notes).
- Warehouse canonical-derived tables (concepts, aliases, lifecycle, run
  metadata, grounding spine): logical dumps on a schedule defined in
  `11-backup.md`, stored under `pgbackrest-repo/logical-dumps/`.

`11-backup.md` owns the concrete cadence, retention, and restore drill.

## 8. Decisions — locked / provisional / deferred

### Locked now

| Decision                                                      | Rationale                                                                                |
|---------------------------------------------------------------|------------------------------------------------------------------------------------------|
| Serve PG / OpenSearch / observability on NVMe named volumes   | Fast random I/O at steady state; Docker-managed lifecycle; crash-resume is cleanest.     |
| Warehouse PG data on E-drive bind (`/mnt/solemd-graph/pg-data`) | Bulk storage; co-located with raw release files; independent from serve lifecycle.     |
| Raw release files under `data/<source>/releases/<release_id>/` | Stable ingest contract already in use; ingest treats them read-only.                    |
| Published bundles under `bundles/<graph_run_id>/` with `by-checksum/` symlinks | Asset-serving relies on checksum symlinks; contract already exercised.   |
| Plain-filesystem archive under `/mnt/solemd-graph/archives/` with the §4 layout | No hosting requirement that needs S3 API today.                         |
| No MinIO / S3 gateway day one                                 | Nothing in the serving path needs signed URLs or multi-tenant access yet.                |
| pgBackRest repo on E-drive bind                               | Same physical disk as warehouse is acceptable because warehouse isn't the backup target. |
| Warehouse-cold-by-default persists after 128 GB RAM upgrade   | Architectural choice (bursty workload shape), not a memory-forced workaround.            |
| No tablespace use inside either PG cluster                    | Per `00-topology.md` — two clusters is the isolation boundary, not tablespaces.          |

### Provisional

| Decision                                                       | Revisit trigger                                                                   |
|----------------------------------------------------------------|-----------------------------------------------------------------------------------|
| Prometheus retention 15 d, Loki retention 7 d                  | After first month of operation — may raise to 30 / 14 if investigation windows demand it. |
| `shm_size=8g` on warehouse PG only, default on serve           | Sample HNSW or large parallel index build on serve that exceeds default.          |
| Bundle retention: keep all historical runs under `bundles/`    | When `bundles/` size becomes a meaningful fraction of the E-drive envelope.       |
| `archives/` retention: keep all serving-run packages + chunk-versions | Same trigger as bundles — size-driven prune, recorded in `serving_artifacts` before deletion. |

### Deferred

| Decision                                                      | Trigger                                                                           |
|---------------------------------------------------------------|-----------------------------------------------------------------------------------|
| Grow E-drive VHDX to 4 TB                                     | Warehouse `pg-data/` plus rolling releases plus archives approach ~1.6 TB total.   |
| Move pgBackRest repo to a separate disk                       | E-drive IO contention between warehouse writes and pgBackRest reads becomes measurable. |
| MinIO (or equivalent S3 API) fronting `archives/`             | A serving component needs presigned URLs, multi-reader access, or remote fetch.    |
| Off-box backup mirror (Backblaze B2)                          | Serve PG holds irreplaceable data (auth, user notes).                              |
| Separate NVMe for OpenSearch indexes                          | OpenSearch I/O contends with serve PG or observability on the same NVMe.          |
| ZFS or Btrfs snapshots on named volumes                       | Needed for point-in-time rollback without full pgBackRest restore.                |
| Raw-release retention policy beyond latest + latest-1         | Disk pressure or regulatory / reproducibility requirement.                         |

## Open items before `02-warehouse-schema.md`

- `.wslconfig memory=` final value (68 GB today, 128 GB planned) — tuning
  / compose-sizing input, rolls forward to `09-tuning.md`. Does not block
  schema authoring.
- Whether the E-drive will be grown to 4 TB before warehouse ingest, or
  warehouse ingest proceeds at 2 TB and the pgBackRest repo gets moved
  elsewhere. Decision can wait until immediately before ingest; does not
  block schema authoring.

**Resolved in this pass** (via the `00-topology.md` edit):

- E-drive VHDX backing disk class — confirmed internal-NVMe-backed.
  `random_page_cost` can stay close to 1.1–1.2 for warehouse PG in
  `09-tuning.md`, not the 1.5 conservative default for SATA-class
  virtualization.
