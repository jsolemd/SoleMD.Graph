# SoleMD.Graph

Agent-first biomedical knowledge graph runtime.

This README is the shortest accurate picture of the locked end-state system.
Deeper detail still lives in `docs/map/map.md` and `docs/rag/`.

- Agents should start with `.claude/skills/graph/SKILL.md`.
- Humans should start with `docs/map/map.md`, then `docs/rag/14-implementation-handoff.md`.

## End-State Topology

```text
EXTERNAL INPUTS / CONTROL
+----------------------+   +------------------------+   +----------------------+
| PubTator3 releases   |   | Semantic Scholar files |   | Langfuse Cloud       |
+----------+-----------+   +-----------+------------+   +----------+-----------+
           |                           |                           ^
           v                           v                           |
+---------------------------------------------------------------------------------------------+
| NVIDIA-Workbench WSL2 -> systemd -> native dockerd                                          |
|                                                                                             |
| Fast/NVMe surfaces (/var/lib/docker)         Bulk/warehouse surfaces (/mnt/solemd-graph)    |
| - graph-db-serve PG data                     - raw source releases                           |
| - graph-opensearch data                      - graph-db-warehouse PG data                    |
| - Redis + observability volumes              - bundles / archives / pgBackRest repo          |
|                                              - model cache / bulk working data               |
|                                                                                             |
| ALWAYS UP                                                                                   |
|                                                                                             |
|   +-------------------+     +------------------+     +--------------------------+            |
|   | graph-db-serve    |<--->| pgbouncer-serve  |<--->| graph-engine-api         |<---+      |
|   | PostgreSQL 18     |     | transaction pool |     | FastAPI + asyncpg        |    |      |
|   | serve projections |     | app/read only    |     | retrieve / evidence APIs |    |      |
|   | active pointer    |     +------------------+     | MedCPT encode / rerank   |    |      |
|   | serving_runs      |                              +-----------+--------------+    |      |
|   +---------+---------+                                          |                   |      |
|             | direct admin / migrations / cutover                |                   |      |
|             |                                                    |                   |      |
|             |                         +-----------------------+   |                   |      |
|             +------------------------>| graph-opensearch      |<--+                   |      |
|                                       | paper_index_live      |                       |      |
|                                       | evidence_index_live   |                       |      |
|                                       +-----------------------+                       |      |
|                                                                                     |      |
|                                       +-----------------------+                      |      |
|                                       | graph-redis           |<---------------------+      |
|                                       | Dramatiq + cache      |                             |
|                                       +-----------------------+                             |
|                                                                                             |
|                                       +-----------------------------------------------+     |
|                                       | Prometheus / Grafana / Loki / Alloy           |     |
|                                       | metrics, logs, dashboards                     |     |
|                                       +----------------------+------------------------+     |
|                                                              ^                              |
|                                                              |                              |
| ON DEMAND                                                    |                              |
|                                                              |                              |
|   +-------------------+    direct asyncpg    +----------------------------+                 |
|   | graph-db-warehouse|<-------------------->| graph-worker               |                 |
|   | PostgreSQL 18     |                      | Dramatiq + RAPIDS / CUDA   |                 |
|   | canonical truth   |                      | ingest / chunk / projection|                 |
|   | raw facts         |                      | graph build / export        |                 |
|   | chunks + evidence |                      | OpenSearch bulk build       |                 |
|   +---------+---------+                      | analyzer / maintenance jobs |                 |
|             ^                                +-------------+--------------+                 |
|             | bounded FDW grounding only                   |                                |
|             +---------------------- graph-db-serve --------+                                |
+---------------------------------------------------------------------------------------------+
              ^                                                ^
              | local dev or Vercel                            | API calls + bundle publish
              |                                                |
      +-------+--------+                                +------+-----------------------+
      | Next.js shell  |--------------------------------> Browser runtime             |
      | routes + UI    |  /graph-bundles/<checksum>/... | DuckDB-WASM + OPFS cache   |
      | graph assets   |--------------------------------> Cosmograph + search UI      |
      +----------------+                                 +-----------------------------+
```

Hard boundaries:

- Warehouse is canonical truth and cold by default.
- Serve is always up and owns `active_runtime_pointer`, serve projections, and cutover state.
- PgBouncer fronts serve app/read traffic only; admin, migrations, and bulk swaps go direct to PostgreSQL.
- `postgres_fdw` is bounded grounding dereference only; it is not a general cross-cluster query path.
- DuckDB is mandatory in the browser runtime, not automatically on the server hot path.
- Auth is deferred; no auth tables or auth runtime are active day one.

## Build / Publish Flow

```text
PubTator3 + Semantic Scholar releases
                |
                v
/mnt/solemd-graph/data/<source>/releases/<release-id>/
                |
                v
graph-worker ingest actors
  -> parse / validate / normalize
  -> COPY batches into graph-db-warehouse
  -> record ingest_runs + metrics
                |
                v
warehouse canonical spine
  -> papers / concepts / citations / metrics
  -> paper_sentences / paper_blocks / mentions
  -> paper_evidence_units
  -> graph source tables
                |
      +---------+----------------------------+----------------------------+
      |                                      |                            |
      v                                      v                            v
chunk + evidence assembly             projection jobs               graph build jobs
  -> chunk_runs                         -> serve _next tables         -> graph_runs
  -> chunk_assembly_errors              -> indexes + comments         -> point / cluster outputs
  -> evidence-unit batches              -> stage-and-swap             -> Parquet export
                                         -> update active pointer      -> manifest + SHA256
                                                                           |
                                                                           v
                                                         /mnt/solemd-graph/bundles/<graph_run_id>/
                                                                           |
                                                                           v
                                             /mnt/solemd-graph/bundles/by-checksum/<bundle_checksum>/
                                                                           |
                                                                           v
                                                Next.js serves immutable /graph-bundles/<checksum>/...

Parallel retrieval build from the same cohort:

serve projections + warehouse evidence inputs
                |
                v
graph-worker OpenSearch build actors
  -> build paper_index_<serving_run>
  -> build evidence_index_<serving_run>
  -> bulk load with build settings
  -> force-merge + warmup
  -> alias swap to *_live

Cutover rule:
  PG pointer state and OpenSearch aliases name what is live.
  Warehouse tables do not carry ad hoc "current" booleans.
```

## Request-Time Flow

```text
User query in browser
        |
        v
Next.js route / client fetch
        |
        v
graph-engine-api  POST /api/retrieve
        |
        +--> Pre-step: resolve active_runtime_pointer once
        |      -> capture (serving_run_id, graph_run_id, api_projection_run_id)
        |
        +--> Stage 0: query encode on engine GPU
        |      -> MedCPT query vector
        |      -> optional Redis query-vector cache hit
        |
        +--> Stage 1: OpenSearch hybrid retrieval
        |      -> BM25
        |      -> raw-vector kNN
        |      -> top-level hybrid.filter
        |      -> RRF via explicit search pipeline
        |
        +--> Stage 2: cross-encoder rerank on engine GPU
        |
        +--> Stage 3: parent-child promotion / dedup
        |
        +--> Stage 4: grounding dereference + final hydration
               -> paper lane: serve PG cards / profiles
               -> evidence lane: serve PG + bounded FDW dereference
                  into warehouse grounding tables by corpus_id / evidence_key
        |
        v
RetrieveResponse
  -> ranked papers
  -> optional evidence hits with grounded coordinates
  -> trace id + per-stage timings
        |
        v
Next.js renders UI

Graph runtime is separate from retrieval:

Next.js page load
  -> resolve current bundle checksum
  -> fetch manifest + Parquet files
  -> DuckDB-WASM opens/caches them in OPFS
  -> Cosmograph renders points / clusters
```

## Operations / Quality Flow

```text
graph-engine-api / graph-worker / PostgreSQL / OpenSearch
                |
                +--> Prometheus metrics
                +--> Loki structured logs
                +--> Grafana dashboards
                +--> Langfuse traces
                          |
                          v
                 quality analyzer jobs
                   -> read Langfuse export / cascade traces
                   -> compute retrieval metrics
                   -> write rag_quality_metrics to PostgreSQL
                   -> feed dashboards and evaluation review

serve PostgreSQL
  -> pgBackRest backup repo on /mnt/solemd-graph

warehouse PostgreSQL
  -> rebuildable from raw releases + pipeline
  -> no fake-success archive path
```

## Service Roles

- `graph-db-warehouse`: canonical biomedical store for ingest output, chunk lineage, evidence units, graph build inputs, and raw grounding truth.
- `graph-db-serve`: always-up PostgreSQL for request-path projections, serving-control tables, runtime pointer state, and bounded FDW entry to warehouse grounding.
- `pgbouncer-serve`: transaction-mode pooler only for serve app/read traffic.
- `graph-engine-api`: FastAPI boundary for retrieval, evidence, and engine-owned request orchestration.
- `graph-worker`: Dramatiq/CUDA worker for ingest, chunking, projection, OpenSearch builds, graph bundles, analyzer jobs, and maintenance tasks.
- `graph-opensearch`: runtime hybrid retrieval plane; not canonical truth.
- `graph-redis`: Dramatiq broker plus bounded runtime cache.
- `Next.js shell`: UI, route handlers, and immutable graph-bundle asset serving.
- `DuckDB-WASM`: browser-side Parquet query engine; mandatory at the graph runtime boundary.
- `Cosmograph`: browser graph renderer over DuckDB-WASM-managed bundle data.
- `Prometheus`, `Grafana`, `Loki`, `Alloy`: metrics, dashboards, log collection, and observability plumbing.
- `Langfuse Cloud`: traced evaluation and feedback loop surface for RAG quality.
- `pgBackRest`: real backup surface for the serve cluster.

## Day-One Non-Goals

- No auth activation.
- No ML Commons dependency in the live retrieval path.
- No logical replication or CDC between warehouse and serve.
- No warehouse pooler.
- No assumption that server-side DuckDB is mandatory outside benchmark-proven export jobs.

## Commands

```bash
solemd op-run graph -- npm run dev
solemd graph start
npm run dev
cd engine && uv run pytest
```
