# 00 — Physical Topology

> **Status**: locked for the `warehouse / serve / search / archive` shape;
> microdesign details (partition count, column-level choices, HNSW params, etc.)
> are provisional until proven on a sample build.
>
> **Date**: 2026-04-16
>
> **Supersedes**: the implicit single-PG assumption behind `docs/rag-future.md`
> Executive Decision 10, which deferred a physical warehouse-plane split to a
> later phase. This document splits now, intentionally, because the storage is
> already physically split, the slate is clean, and the operational shape
> (bursty warehouse, steady serve) matches a two-cluster model naturally.
>
> **Scope**: physical plane only. The logical data model, identity glossary,
> evidence ontology, tiering strategy, and retrieval-cascade strategy in
> `docs/rag-future.md` are unchanged. This doc only fixes how those land on
> real containers and volumes.

## Purpose

Record the physical-plane decision for the SoleMD.Graph rebuild so that every
downstream doc (schema, ingest, projection, serving, ops) resolves its
ambiguities against the same container, storage, and connectivity contract.

## 1. Service layout

```
┌────────────────────────────────────────────────────────────────────────────┐
│ NVIDIA-Workbench WSL2  (Ryzen 9 9950X3D · 68 GB RAM today / 128 GB planned │
│                         · RTX 5090 · native dockerd + systemd)             │
│                                                                            │
│  always up ────────────────────────────────────────────────────────────┐   │
│                                                                        │   │
│   ┌─────────────────────┐   ┌────────────────────┐   ┌───────────────┐ │   │
│   │ graph-db-serve      │──►│ pgbouncer-serve    │◄──│ graph-engine- │ │   │
│   │   PG 18             │   │   txn mode, 1.25.1 │   │ api (FastAPI) │ │   │
│   │   NVMe named volume │   └────────────────────┘   │   Py 3.13     │ │   │
│   └─────────────────────┘                            └───────┬───────┘ │   │
│                                                              │         │   │
│   ┌─────────────────────┐   ┌────────────────────┐   ┌───────▼───────┐ │   │
│   │ graph-opensearch    │   │ graph-redis        │   │ Next.js dev / │ │   │
│   │   3.6, single node  │   │   8-alpine         │   │ Vercel prod   │ │   │
│   │   NVMe named volume │   │   stateless cache  │   └───────────────┘ │   │
│   └─────────────────────┘   └────────────────────┘                     │   │
│                                                                        │   │
│   ┌──────────────┬──────────────┬────────────┬────────┐                │   │
│   │ prometheus   │ grafana      │ loki       │ alloy  │ observability  │   │
│   └──────────────┴──────────────┴────────────┴────────┘                │   │
│                                                                        │   │
│  on-demand (compose profiles) ─────────────────────────────────────────┤   │
│                                                                        │   │
│   ┌─────────────────────┐         ┌──────────────────────┐             │   │
│   │ graph-db-warehouse  │◄────────│ graph-worker         │             │   │
│   │   current PG line   │         │   GPU-first worker   │             │   │
│   │   (see `16`)        │         │   GPU stack per `16` │             │   │
│   │                     │         │                     │             │   │
│   │   E-drive bind      │         │   ingest, projection,│             │   │
│   │   --profile db      │         │   graph build, RAG   │             │   │
│   │   direct conns only │         │   --profile gpu      │             │   │
│   └──────────┬──────────┘         └──────────┬───────────┘             │   │
│              │                               │                         │   │
│              ▼                               ▼                         │   │
│       /mnt/solemd-graph/pg-data     /mnt/solemd-graph/{data,bundles,…} │   │
│                                                                        │   │
└────────────────────────────────────────────────────────────────────────┘   │
                                                                             ▼
                                                             off-box mirror
                                                             (deferred; B2)
```

### Always-up surface

- `graph-db-serve` — PG 18 cluster holding graph-serving metadata
  (`graph_runs`, `graph_points`, `graph_clusters`, `paper_semantic_neighbors`),
  API projections (`paper_api_cards`, `paper_api_profiles`,
  `graph_cluster_api_cards`), serving-control tables (`serving_runs`,
  `serving_artifacts`, `serving_cohorts`, `serving_members`,
  `api_projection_runs`), and eventually an `auth` schema when user-data lands.
- `graph-engine-api` — always-up FastAPI surface. Reads serve PG through
  `pgbouncer-serve`, queries OpenSearch, performs bounded warehouse
  dereference where needed, and exposes the backend consumed by Next.js and
  other clients.
- `pgbouncer-serve` — transaction-mode pooler in front of serve. Engine API
  (`graph-engine-api`) and Next.js server-side calls route through the pooler;
  admin and migration paths bypass it on a reserved role.
- `graph-opensearch` — concrete release-scoped indexes
  (`paper_index_<run_token>`, `evidence_index_<run_token>`) behind stable
  aliases `paper_index_live` and `evidence_index_live`.
- `graph-redis` — Dramatiq queue + runtime cache.
- Observability stack — Prometheus, Grafana, Loki, Alloy (Promtail successor).

### On-demand surface (compose profiles)

- `graph-db-warehouse` (`--profile db`) — canonical truth: raw ingest
  surfaces, canonical metadata, concepts, facts, grounding spine, chunk
  lineage. Brought up for ingest and projection-build windows; taken down
  otherwise. Takes **direct connections** from workers — no pooler today.
- `graph-worker` (`--profile gpu`) — the engine's GPU-first worker. Prefer the
  RTX 5090 wherever the workload materially benefits (embedding, rerank, graph
  layout/build, local eval), while keeping image pins inside the supported
  RAPIDS / PyTorch CUDA matrix rather than assuming one common unsupported
  CUDA version.

### Services explicitly not in this topology

- No logical replication. No Debezium / CDC. No Supabase stack. No
  second search engine. No columnar sidecar. No warehouse pooler. No
  cross-host dependencies beyond Next.js on Vercel.

## 2. Storage layout

```
NVMe  (/var/lib/docker, serving FS)                  E-drive VHDX (internal NVMe-backed)  (/mnt/solemd-graph, warehouse FS)
├── image layers                                     ├── data/
├── named volumes                                    │   ├── semantic-scholar/releases/2026-03-10/…   (638 GB)
│   ├── graph_serve_pg-data                          │   └── pubtator/releases/2026-03-21/…           (210 GB)
│   ├── graph_opensearch_data                        ├── pg-data/                                    ← warehouse PG bind
│   ├── graph_worker-opt-venv                        ├── bundles/                                    (19 GB, published Parquet)
│   ├── graph_prometheus_data                        ├── pgbackrest-repo/                            (serve backup, primary repo)
│   ├── graph_grafana_data                           ├── archives/                                   (retired chunk versions, cold text)
│   └── graph_loki_data                              └── tei-models/
└── build cache
```

Rules:

- Serving FS (NVMe) holds every surface that needs fast random I/O at steady
  state — serve PG data, OpenSearch indexes, observability stack, worker
  venv, images.
- Warehouse FS (E-drive) is an ext4 VHDX backed by the host's internal NVMe.
  Treat it as NVMe-backed virtualization rather than raw direct-attached NVMe.
- Warehouse FS holds bulk: raw source parquet, warehouse PG data, published
  bundles, backup repo, cold archives.
- Redis and PgBouncer are stateless — no volumes.
- Object-storage-style artifacts (serving-package manifests, retired chunk
  versions, cold text exports) live under `/mnt/solemd-graph/archives/…`
  until there's a reason to front them with MinIO.

## 3. Warehouse ↔ serve contract

Primary mechanism: **release-scoped batch projection**, driven by the engine
worker, recorded in `solemd.serving_runs` and `solemd.api_projection_runs`.

### Propagation pattern

1. Warehouse is brought up (`docker compose --profile db up -d`) for an
   ingest or projection-build window.
2. A projection worker reads warehouse, computes derived rows
   (`paper_api_cards`, `paper_api_profiles`, `graph_points`,
   `graph_clusters`, `graph_cluster_api_cards`, etc.), and writes them to
   serve via a **staging table + atomic swap** pattern (`_next` table → index
   build → `ALTER TABLE … RENAME` or `ATTACH PARTITION` depending on table
   shape → keep `_prev` for a 24 h rollback window).
3. The worker records the build in `api_projection_runs`, flips the active
   `serving_run_id` in `serving_runs`, and stamps the new
   `solemd.serving_artifacts` rows.
4. Warehouse is taken down (`docker compose stop graph-db-warehouse`) when
   no further work is pending.

### Non-goals

- **No logical replication.** Warehouse runs `wal_level=minimal` so bulk COPY
  stays on the fast path during ingest windows. The 20–30 % throughput tax
  from `wal_level=logical` is not worth paying for a propagation mechanism
  we don't need.
- **No continuous propagation.** All warehouse → serve writes are driven by
  explicit projection jobs.
- **No CDC layer.** Debezium / pg_logical add operational surface without a
  matching benefit at solo-dev scale.

## 4. FDW boundary

`postgres_fdw` is wired on day one, but **only for bounded grounding
dereference** from serve into warehouse.

### Permitted

- A foreign schema on serve (e.g. `warehouse_grounding`) pointing at
  `graph-db-warehouse`.
- Foreign tables limited to the canonical grounding spine:
  `paper_documents`, `paper_sections`, `paper_blocks_*`, `paper_sentences_*`,
  `paper_citation_mentions_*`, `paper_entity_mentions_*`,
  `paper_chunk_versions`, `paper_chunk_members_*`.
- Every dereference is keyed: `WHERE corpus_id = $1 AND sentence_ordinal
  BETWEEN $2 AND $3` — never full-table scans across FDW.
- When warehouse is down, FDW queries fail; engine degrades gracefully to
  card-level content and marks grounded-detail surfaces as temporarily
  unavailable.

### Forbidden

- General API queries that could be projected. If a surface reads more than
  a bounded grounding dereference, it becomes a projection.
- Join-heavy analytical workloads.
- Aggregations across warehouse tables.

The first time a non-grounding dereference becomes hot on the request path,
that's the signal to add a projection for it — not to widen the FDW
boundary.

## 5. Cutover model

No formal release train. Cutover is driven by `serving_runs`:

- Each projection + OpenSearch bulk-load cycle produces a new
  `serving_run_id`.
- OpenSearch: new release-scoped indexes
  (`paper_index_<run_token>`, `evidence_index_<run_token>`) built with
  `refresh_interval=-1`,
  `number_of_replicas=0`, force-merged, swapped in via atomic alias update
  (`POST /_aliases` with add + remove in one body).
- Serve PG projection tables: `_next` staging → build indexes → rename or
  attach → old `_prev` retained for a 24 h rollback window.
- Frontend reads stable aliases (`paper_index_live`, `evidence_index_live`) and
  live projection table names, so no frontend coordination is needed for
  cutover.
- Rollback path: flip alias, rename tables back. No migration replay.

## 6. Decisions — locked / provisional / deferred

### Locked now

| Decision                                                                                  | Rationale                                                                                                   |
|-------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| Two PG 18 clusters (`graph-db-warehouse` + `graph-db-serve`)                              | Storage physically split; independent WAL / backups / tuning; infeasible to reverse once populated.         |
| Warehouse cold by default, serve hot by default                                           | Matches bursty build / steady-state serve workload shapes; correct regardless of RAM ceiling.               |
| Batch projection as primary warehouse → serve mechanism                                   | Keeps warehouse on `wal_level=minimal`; avoids logical-replication tax on bulk COPY.                        |
| `postgres_fdw` wired day one, bounded grounding dereference only                          | Avoids duplicating canonical grounding into serve; forbidden for general queries.                           |
| OpenSearch on NVMe as the serving retrieval plane                                         | Per `rag-future.md` Executive Decisions 2 and 5; separate from warehouse truth system.                      |
| Supabase does not drive core topology                                                     | Auth / user-data is a separate small plane, added later; Better Auth candidate.                             |
| Pinned PgBouncer transaction-mode in front of serve (see `16-version-inventory.md`)       | Engine API + frontend concurrency justifies it; prepared-statement support in txn mode since PgBouncer 1.21.|
| No pooler in front of warehouse today                                                     | Controlled batch / admin traffic; pooler adds surface area without current benefit.                         |
| `graph-engine-api` names the always-up FastAPI service; `graph-worker` names the on-demand CUDA/build worker | Keeps docs, compose, and later schema/ops sections from drifting on service identity.        |
| SQL-first schema authoring + runner-owned migrations                                      | Native PostgreSQL features are a better fit than a partial declarative OSS layer for this program's surface. |
| `scripts/schema_migrations.py` is the canonical applier / ledger; legacy `engine/...` references are inventory only | Preserves audit history, checksum, execution-mode, adopt-vs-apply semantics while matching the cutover tree. |
| Raw SQL + asyncpg on hot paths (ingest, projection, serve reads); psycopg3 for admin only | Benchmarked advantage on bulk COPY and tight per-query paths; keep psycopg3 for its sharper admin features. |
| Identity types: `BIGINT` for `corpus_id` / `concept_id`; `UUIDv7` for run / version keys (`ingest_run_id`, `graph_run_id`, `chunk_version_key`); `UUIDv5` for `evidence_key` (content-bound) | `02-warehouse-schema.md` §2 is authoritative; summarized here to prevent identity drift across docs. |

### Provisional (revisit after schema draft + sample build)

| Decision                                                                        | Why provisional                                                                                              |
|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| Hash partition count (16 / 32 / 64) across grounding families                   | Current rag-future.md default is 32; 64 risks fast-path lock slot contention. Confirm via sample.            |
| `halfvec(768)` vs `vector(768)` for embeddings                                  | Storage + build-time math favors halfvec; confirm recall on a sample HNSW build.                             |
| Fillfactor tiering (100 / 90 / 80) per table family                             | Directionally right; revisit after first projection-upsert benchmarks on serve.                              |
| HNSW `m`, `ef_construction`, `ef_search` in Faiss OpenSearch                    | Tune against real recall@k on the benchmark suite before freezing.                                           |
| `default_toast_compression = lz4` cluster-wide                                  | Right direction; confirm no regression on the widest text columns after load.                                |
| MAXALIGN column ordering on every fresh table                                   | Right in principle; apply during schema authoring, verify with `pg_column_size` sampling.                    |
| `io_method=worker` vs custom `postgres:18 --with-liburing` image                | `worker` accepted today; revisit if upstream image changes or perf gap widens.                               |

### Deferred (trigger-gated)

| Decision                                                            | Trigger                                                                                   |
|---------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| PgBouncer in front of warehouse                                     | Ingest or projection concurrency exceeds direct-connection headroom.                      |
| Read replica on serve                                               | p95 serve latency > 50 ms under real traffic, or analytical reads collide with OLTP.      |
| Any further physical split beyond warehouse / serve                 | Measured pressure on serve hot path from graph or API projections.                        |
| Columnar extension (Citus / Hydra) on `paper_citation_contexts`     | Table exceeds ~200 GB and access pattern becomes scan-heavy.                              |
| Neural sparse (SPLADE) lane in OpenSearch                           | MedCPT cascade is live and top-1 conversion plateaus.                                     |
| ColBERTv2 late-interaction sidecar                                  | SPLADE fails to close the top-1 gap.                                                      |
| Better Auth / user-data plane                                       | Frontend product needs saved state (notes, saved papers, collections).                    |
| Off-box backup mirror (Backblaze B2)                                | Serve PG holds any irreplaceable data (auth, user notes).                                 |
| OTel exporter from PG / engine into Langfuse observability surface  | LLM-side traces need correlation with DB / engine traces for end-to-end debugging.        |
| Vercel → Tailscale funnel hardening for public-facing traffic       | Public launch on the horizon.                                                             |

## Relationship to `docs/rag-future.md`

`rag-future.md` Executive Decision 10 states that a physical warehouse-plane
split is a conditional response to measured pressure, not a day-one
commitment. This doc amends that position: we split now, on purpose, because
storage is already physically split, the slate is clean, and the operational
shape naturally fits a two-cluster model. This is an intentional improvement
to the plan, not an execution of what the plan currently says.

The logical data model, identity glossary (`corpus_id`, `graph_run_id`,
`chunk_version_key`, `evidence_key`, `serving_doc_id`, `package_tier`), hot /
warm tiering, cohort model, and retrieval cascade from `rag-future.md` are
unchanged. This document only fixes how those pieces land on real containers
and volumes.

## Open items before the next doc (`01-storage.md`)

- Decide whether object-storage-style artifacts (serving-package manifests,
  retired chunk versions, cold text exports) stay on plain filesystem under
  `/mnt/solemd-graph/archives/` or get fronted by a local MinIO instance.
