# 03 — Serve Schema

> **Status**: locked for table inventory, identity contract, FDW contract,
> active-run pointer pattern, and per-family write/read patterns. Microdesign
> values (fillfactor tiers on projection tables, `INCLUDE` column set,
> `fetch_size`, partial-index predicates) are **provisional until the first
> sample projection build**.
>
> **Date**: 2026-04-16
>
> **Scope**: the always-up serve cluster (`graph-db-serve`). Warehouse-owned
> tables live on `graph-db-warehouse` per `02-warehouse-schema.md`.
> Projection mechanics live in `04-projection-contract.md`. Runtime tuning
> (`shared_buffers`, planner GUCs, `statement_timeout` values) lives in
> `09-tuning.md`. Backup cadence lives in `11-backup.md`.
>
> **Schema authority**: PG-native authority for the serve cluster. Engine
> asyncpg code, Pydantic boundary models, and Atlas migrations under
> `db/schema/serve.hcl` derive from here. Inherited conventions from
> `02-warehouse-schema.md` §0 apply unchanged; only deltas are restated.

## Purpose

Specify the fastest, most scalable PG 18 serve schema for SoleMD.Graph's
OLTP-shaped always-up surface so every consumer — `graph-engine-api`,
Next.js routes, the projection worker, future Better Auth — resolves
types, keys, and active-run semantics against the same contract.

Canonical truth stays on warehouse; serve holds only what the request path
touches: graph-serving projections, API cards / profiles, serving-control
lineage, and (later) a user-data `auth` schema. Grounding content is
**not** duplicated on serve — it is dereferenced over `postgres_fdw`
through a bounded, key-only contract.

## 0. Conventions delta from `02`

Serve inherits every convention from `02-warehouse-schema.md` §0 unless
called out below. Do not re-state warehouse conventions; cite `02 §X` instead.

| Concern | Serve disposition | Reference |
|---|---|---|
| Time, text, jsonb, date, numeric, real, halfvec, enums, bit flags | Inherited unchanged. | `02 §0.1` |
| Identity types (`BIGINT`, `UUIDv7`, `UUIDv5`) | Inherited; serve-scoped additions (`serving_run_id`, `api_projection_run_id`) in §2. | `02 §0.2` |
| MAXALIGN column ordering | Inherited; applied to every table below. | `02 §0.3` |
| `default_toast_compression = lz4` cluster-wide | Inherited; serve has far less TOAST-heavy text than warehouse, but the default stays consistent. | `02 §0.4` |
| Fillfactor tiering | **Delta.** See §0.5 below — serve's projection tables rebuild via stage-and-swap *and* accept incremental UPSERTs between rebuilds, which shifts the tier choice. |
| Partitioning | **Delta.** Serve projections are not partitioned by default. See §0.6 below. |
| Indexing | **Delta.** Covering (`INCLUDE`) indexes matter on serve; see §0.7 below. |
| Schemas | **Delta.** Serve uses two schemas: `solemd` and `auth`. See §0.8 below. |
| Tablespaces | Inherited — no tablespaces. The two-cluster split *is* the isolation boundary. | `00 §6`, `02 §0.9` |
| Comments and migrations | Inherited — `COMMENT ON` every table and non-obvious column; Atlas authors, `schema_migrations.py` applies. | `02 §0.10` |

### 0.5 Fillfactor tiering (serve delta)

Serve projections absorb incremental UPSERTs (citation-count / tier
refreshes) between full stage-and-swap rebuilds. HOT updates want free
space on the same page.

| Tier | Value | Applies to |
|---|---:|---|
| Append-only caches | 100 | `paper_semantic_neighbors`, `graph_points` (rebuilt-whole) |
| Incrementally-updatable projections | 90 | `paper_api_cards`, `paper_api_profiles`, `graph_cluster_api_cards`, `graph_clusters`, `graph_run_metrics` |
| Status-flipping control | 80 | `serving_runs`, `api_projection_runs`, `serving_cohorts`, `serving_members`, the `active_runtime_pointer` singleton |

Rationale: 90-tier projections absorb metric refreshes without
page-split pressure; 80 beats 70 on modern PG (`research-distilled.md`
§4). Revisit after first projection-upsert benchmark.

### 0.6 Partitioning (serve delta)

Serve projections are **not partitioned** day one, despite being keyed on
`corpus_id`. `paper_api_cards` / `paper_api_profiles` at ~14 M rows and
`graph_points` / `graph_clusters` at ~14 M × ~6 retained runs fit
comfortably in single tables; OLTP single-row lookups don't benefit from
pruning. `paper_semantic_neighbors` (~14 M × top-K) is the largest
candidate — partition trigger in §8.

### 0.7 Indexing (serve delta)

Serve is the only plane where `INCLUDE` (covering) indexes are first-class.

- Hot-path list queries declare their primary index with `INCLUDE (…)` so
  common projections satisfy the query from the index alone. Index-only
  scans require visibility-map coverage; serve's autovacuum (§6.3) keeps
  the VM warm on `INCLUDE`-backed tables.
- Be conservative with `INCLUDE` payload — non-key columns duplicate
  data and bloat the index (PG 18 §11.9,
  `https://www.postgresql.org/docs/current/indexes-index-only-scans.html`).
- Partial indexes stay cheap on hot filter predicates (`is_active`,
  `build_status`, `package_tier`, `current_graph_run_id IS NOT NULL`).
- No ANN indexes on serve — OpenSearch owns runtime dense retrieval
  (`00 §1`). Projected `halfvec` cache is deferred (§8).

### 0.8 Schemas

Two schemas on serve:

- `solemd` — all projections, serving-control tables, graph-serving
  metadata. Named consistently with warehouse so foreign-schema lookups
  are unsurprising.
- `auth` — Better Auth placeholder. Empty day one beyond §4.4; on CLI
  run, Better Auth targets it via `search_path` without a rename.

`warehouse_grounding` is the foreign-schema name created in §3's
`IMPORT FOREIGN SCHEMA`; not a local schema. No `raw` / `stage` /
`archive` — stage-and-swap uses `_next` / `_prev` suffixes on `solemd`
per `02 §0.8`.

## 1. Extensions

Required at serve cluster boot, in this order. Each rationale is serve-specific.

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;             -- digest, hmac, random bytes for identifiers
CREATE EXTENSION IF NOT EXISTS pg_trgm;              -- trigram GiST on wiki / entity alias lookup
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;   -- baseline observability; keep pg_stat_monitor OFF (conflicts; `research-distilled.md` §7)
CREATE EXTENSION IF NOT EXISTS auto_explain;         -- capture slow OLTP queries (threshold set in 09-tuning.md)
CREATE EXTENSION IF NOT EXISTS pg_buffercache;       -- VM / cache-hit diagnostics for index-only-scan health
CREATE EXTENSION IF NOT EXISTS pg_prewarm;           -- warm hot projection tables on restart; shared_preload_libraries entry required
CREATE EXTENSION IF NOT EXISTS pg_cron;              -- scheduled refreshes + cleanup; shared_preload_libraries entry required
CREATE EXTENSION IF NOT EXISTS postgres_fdw;         -- bounded grounding dereference to warehouse (see §3)
```

Notes:
- `pg_prewarm` and `pg_cron` both need `shared_preload_libraries` entries
  (listed in `09-tuning.md`). `pg_prewarm`'s autoprewarm worker writes
  `autoprewarm.blocks` periodically and replays it on startup so the
  buffer pool recovers without a cold stall
  (`https://www.postgresql.org/docs/current/pgprewarm.html`). **locked**
- `pg_cron` jobs live in the `serve` database; single-background-worker
  model means jobs must be staggered
  (`https://github.com/citusdata/pg_cron`). **locked**
- `postgres_fdw` installed on serve **only**; warehouse doesn't
  (`02 §1`). **locked**
- `pgvector` is **deferred** — projected embedding cache is gated on
  proven need (§8). No `vector` / `halfvec` columns day one.
- `hypopg`, `pg_partman` not installed on serve; neither belongs here.

## 2. Identity glossary (serve-scoped additions)

The warehouse identity contract (`02 §2`) applies unchanged. Serve
introduces two new run identities and one read-only pointer convention.

| Identity | Meaning | Lifetime | Generation | Lives on |
|---|---|---|---|---|
| `serving_run_id` | One release-scoped serving package: a coherent snapshot of `graph_run_id` + `api_projection_run_id` + OpenSearch indexes + synonym version + chunk version that the frontend reads as "the live product" for a window of time. | Permanent. Never recycled. Retired runs remain queryable for rollback and audit. | `uuidv7()` at `serving_runs` INSERT time. Timestamp-ordered so `ORDER BY serving_run_id` tracks cutover wall-clock. | `solemd.serving_runs` |
| `api_projection_run_id` | One projection build cycle: the worker wrote new rows into `_next` tables on serve, built indexes, and swapped. Multiple API projection runs can exist inside one `serving_run_id` window if only cards / profiles refresh without a full serving cutover. | Permanent. | `uuidv7()` at `api_projection_runs` INSERT time. | `solemd.api_projection_runs` |
| `active_runtime_pointer` row | Single-row singleton naming the currently-live `serving_run_id`, `graph_run_id`, and `api_projection_run_id` as one coherent state object. One UPDATE inside the swap transaction flips all three together so they can never drift apart. Readers resolve "the live run" with one row fetch. | Singleton. | Seeded once at cluster init; every cutover is a single-row UPDATE. | `solemd.active_runtime_pointer` |

Rationale: `UUIDv7` matches warehouse (`02 §0.2`, `research-distilled §4`)
— timestamp-ordered, externally sortable, no sequence leakage across the
cluster boundary. A single `active_runtime_pointer` row (not three
separate pointer tables) enforces the stage-and-swap contract: staging
fills, indexes build, one tiny UPDATE atomically flips all three run
ids together so the live product can never drift across mismatched
`graph_run_id` / `serving_run_id` / `api_projection_run_id` values. No
`serving_run_id` is hard-coded on the frontend. **locked**

## 3. FDW foreign-schema contract to warehouse

`postgres_fdw` is wired on day one. This section is the full serve-side
specification; the overall topology rule is in `00-topology.md` §4.

### 3.1 Server, user mapping, foreign schema

```sql
-- once per serve cluster boot, run by the admin role (not the engine API role)
CREATE SERVER IF NOT EXISTS warehouse_fdw
  FOREIGN DATA WRAPPER postgres_fdw
  OPTIONS (
    host        'graph-db-warehouse',   -- docker network hostname per 00-topology.md §1
    port        '5432',
    dbname      'warehouse',
    fetch_size  '2000',                 -- provisional; large enough to amortize round trips without blowing memory
    async_capable 'true',               -- PG 18 supports concurrent foreign scans for Append nodes
    use_remote_estimate 'true',         -- warehouse ANALYZE is authoritative for planner; local guesses are stale
    fdw_startup_cost '100',
    fdw_tuple_cost '0.01',
    extensions 'pgcrypto,pg_trgm'       -- safe-shippable operators; pgvector deliberately omitted
  );

CREATE USER MAPPING IF NOT EXISTS FOR engine_api
  SERVER warehouse_fdw
  OPTIONS (user 'warehouse_grounding_reader', password_required 'true');

CREATE SCHEMA IF NOT EXISTS warehouse_grounding;   -- local name for foreign tables; not a data schema

IMPORT FOREIGN SCHEMA solemd
  LIMIT TO (
    paper_documents,
    paper_sections,
    paper_blocks,
    paper_sentences,
    paper_citation_mentions,
    paper_entity_mentions,
    paper_chunk_versions,
    paper_chunk_members,
    paper_evidence_units
  )
  FROM SERVER warehouse_fdw INTO warehouse_grounding;
```

Atlas HCL captures the server, user mapping, and extension per
`https://atlasgo.io/hcl/postgres` (foreign-servers require Atlas Pro).
`IMPORT FOREIGN SCHEMA` is issued via a one-shot migration because
Atlas's declarative HCL does not round-trip foreign-table shape as of
v0.36. The migration is idempotent (`DROP SCHEMA warehouse_grounding
CASCADE` + `IMPORT FOREIGN SCHEMA`) and runs via
`engine/db/scripts/schema_migrations.py` (`02 §0.10`). **locked**

Primary source for options:
`https://www.postgresql.org/docs/current/postgres-fdw.html`.

### 3.2 Permitted foreign tables

Per `00-topology.md` §4, only the canonical grounding spine and
`paper_evidence_units` are exposed:

| Foreign table | Warehouse origin | Why exposed |
|---|---|---|
| `warehouse_grounding.paper_documents` | `02 §4.5` | Resolve active document kind / revision for a corpus_id. |
| `warehouse_grounding.paper_sections` | `02 §4.5` | Section-ordinal → role lookup for packet assembly. |
| `warehouse_grounding.paper_blocks` | `02 §4.5` (hash × 32) | Block-level text fetch for a bounded `(corpus_id, block_ordinal)` window. |
| `warehouse_grounding.paper_sentences` | `02 §4.5` (hash × 32) | Sentence-level text fetch for a bounded `(corpus_id, sentence_ordinal)` window. |
| `warehouse_grounding.paper_citation_mentions` | `02 §4.5` (hash × 32) | Citation-grounded span resolution for one `corpus_id`. |
| `warehouse_grounding.paper_entity_mentions` | `02 §4.5` (hash × 32) | Entity-grounded span resolution for one `corpus_id`. |
| `warehouse_grounding.paper_chunk_versions` | `02 §4.5` | Resolve `chunk_version_key` → policy metadata when a serving doc references a version that isn't the live default. |
| `warehouse_grounding.paper_chunk_members` | `02 §4.5` (hash × 32) | Reconstruct a chunk's sentence set for a bounded `(corpus_id, chunk_id)`. |
| `warehouse_grounding.paper_evidence_units` | `02 §4.5` | Round-trip from `evidence_key` (on OpenSearch docs) back to canonical coordinates. |

Explicitly **not** exposed: `papers`, `paper_text`, `paper_citations`,
`paper_concepts`, `paper_metrics`, `paper_top_concepts`, `concepts`,
`concept_aliases`, `pubtator.*`, `umls.*`, `s2_*_raw`, `source_releases`,
`ingest_runs`, `graph_runs`, `graph_bundle_artifacts`,
`paper_embeddings_graph`. Anything readable from a projection belongs
as a projection, not an FDW reach-through. **locked**

### 3.3 Permitted query shapes

Every FDW query against `warehouse_grounding.*` must satisfy:

1. **Keyed by `corpus_id` (or `evidence_key` for `paper_evidence_units`).**
   Allowed shapes: `WHERE corpus_id = $1`, `… AND section_ordinal = $2`,
   `… AND block_ordinal BETWEEN $2 AND $3`, `… AND sentence_ordinal
   BETWEEN $2 AND $3`, `WHERE (corpus_id, block_ordinal,
   sentence_ordinal) IN (<small VALUES>)`, `WHERE evidence_key = $1`,
   `WHERE evidence_key = ANY($1::uuid[])` (bounded, engine-enforced).
2. **Cardinality-bounded.** Engine enforces caps before SQL runs;
   exceeding a cap raises a structured error.
   - **Hard policy (schema-level):** ≤ 1 `corpus_id` per FDW query.
     Architecture, not a tunable — multi-paper scans across the FDW
     boundary are forbidden regardless of configuration.
   - **Engine-config defaults (tunable, owned by `09-tuning.md`):**
     ≤ 64 sentence range, ≤ 256 `evidence_key` array. Starting values
     only; real-request measurement may raise or lower either. Treat as
     service guardrails, not schema truth.
3. **No cross-foreign-table joins on the hot path.** Foreign-table
   joins only within a single-paper context; multi-paper aggregations
   become projections.
4. **Read-only.** `warehouse_grounding_reader` on warehouse is
   `SELECT`-only.

Forbidden shapes (enforced by lint + review, not runtime):
- `SELECT … FROM warehouse_grounding.paper_sentences` without a
  `corpus_id` predicate.
- Multi-paper joins across foreign tables with a large `corpus_id` set.
- Aggregation (`COUNT`, `SUM`, `GROUP BY`) over foreign tables —
  projections cover these.

Primary sources for `fetch_size` / `async_capable` / `use_remote_estimate`
tuning:
`https://techcommunity.microsoft.com/blog/adforpostgresql/mastering-postgres-fdw-setup-optimize-performance-and-avoid-common-pitfalls/4463564`
and
`https://www.crunchydata.com/blog/performance-tips-for-postgres-fdw`.
Default `fetch_size = 100` is too low for bounded windowed reads; 2000
amortizes round trips at a few MB per scan. **provisional**

### 3.4 Error-handling contract

Warehouse is cold-by-default (`00 §1`); the container is typically
stopped between ingest / projection-build windows. FDW queries against a
down warehouse behave deterministically:

- **Connection refused / timeout.** `postgres_fdw` raises `SQLSTATE
  08006` / `08001`. The engine API wraps every FDW-backed endpoint in a
  handler that catches these codes, logs a structured
  `warehouse_offline` event (Prometheus + Loki, per `10-observability.md`),
  and returns the degraded shape.
- **Degraded shape.** Grounding endpoints
  (`/papers/{corpus_id}/evidence/{evidence_key}`,
  `/claims/{claim_id}/grounding`) return projection-sourced fields
  (title, author line, citation counts, tier) plus
  `grounding_unavailable: true` and a stable `WAREHOUSE_OFFLINE` error
  code. `evidence_key` and `corpus_id` echo back for client retry.
- **Timeout cap.** `statement_timeout` on engine API serve connections
  is a tight OLTP budget (draft 250 ms). FDW queries inherit it and
  fail fast. `09-tuning.md` owns the final value.
- **Circuit breaker.** The engine API keeps an in-process
  warehouse-health flag: N consecutive FDW failures flip it and skip
  the FDW call entirely until a lightweight keepalive succeeds.
  Prevents reconnect storms on warehouse cold-start.

**locked** for the contract shape; concrete thresholds live in
`09-tuning.md` and `10-observability.md`.

## 4. Table families

Each subsection gives a one-paragraph purpose, MAXALIGN column layout,
keys / indexes, partitioning (if any), fillfactor, and representative HCL
for the parent. Secondary indexes are noted in prose; the full HCL under
`db/schema/serve.hcl` enumerates partitions and every secondary index
verbatim.

### 4.1 Graph-serving projections

Compact serve-facing views of the current graph build. Built from
warehouse `graph_runs` + `paper_embeddings_graph` + per-paper facts via
stage-and-swap; consumed by Next.js graph bootstrap and selection.

#### `solemd.graph_run_metrics`

One row per published graph run. Fillfactor 90 (incremental stats
refreshes possible on an active run).

```hcl
table "graph_run_metrics" {
  schema = schema.solemd
  column "graph_run_id"        { null = false, type = uuid }
  column "published_at"        { null = false, type = timestamptz }
  column "built_at"            { null = false, type = timestamptz }
  column "point_count"         { null = false, type = bigint }
  column "edge_count"          { null = true,  type = bigint }
  column "base_cohort_size"    { null = false, type = bigint }
  column "hot_overlap_count"   { null = true,  type = bigint }
  column "cluster_count"       { null = false, type = integer }
  column "embedding_model_key" { null = false, type = smallint }
  column "x_min"               { null = false, type = real }
  column "x_max"               { null = false, type = real }
  column "y_min"               { null = false, type = real }
  column "y_max"               { null = false, type = real }
  column "layout_policy_key"   { null = false, type = text }
  column "qa_summary"          { null = true,  type = jsonb }
  primary_key { columns = [column.graph_run_id] }
  index "idx_graph_run_metrics_published" {
    columns = [column.published_at desc]
  }
  settings { fillfactor = 90 }
}
```

Consumed by the graph bootstrap endpoint (bounding box, cluster count,
point count) without touching `graph_points`.

#### `solemd.graph_points`

Render-facing per-paper point metadata scoped to a graph run. Fillfactor
100 (rebuilt whole per run). Not partitioned — `graph_run_id`-first
indexes give effective planner pruning at ~14 M rows × small retention.

Columns (MAXALIGN):
- `graph_run_id` UUID NOT NULL
- `corpus_id` BIGINT NOT NULL
- `point_index` INTEGER NOT NULL
- `cluster_id` INTEGER NOT NULL
- `base_rank` INTEGER (nullable; `is_in_base = false` rows have NULL rank)
- `domain_score` REAL
- `x` REAL NOT NULL
- `y` REAL NOT NULL
- `is_in_base` BOOLEAN NOT NULL DEFAULT false

Indexes:
- PK `(graph_run_id, corpus_id)` — selection resolution (corpus → point).
- Unique btree `(graph_run_id, point_index)` — bundle-index → corpus lookup.
- Btree `(graph_run_id, cluster_id)` — cluster-member enumeration.
- Partial btree `(graph_run_id, base_rank, corpus_id)`
  where `is_in_base = true` — admission scan for the base cohort.

No `INCLUDE` on the PK: selection queries are single-row lookups that
immediately join `paper_api_cards` for display fields. Keeping the PK
tight beats a wider covering index. **provisional** if a graph-bootstrap
shape proves scanning `graph_points` for display fields is hot.

#### `solemd.graph_clusters`

Cluster identity and rendering metadata scoped to a graph run. Fillfactor
90 (labels / descriptions may refresh between builds).

Columns (MAXALIGN):
- `graph_run_id` UUID NOT NULL
- `cluster_id` INTEGER NOT NULL
- `parent_cluster_id` INTEGER (nullable; hierarchical clusters)
- `size` INTEGER NOT NULL
- `label` TEXT NOT NULL
- `description` TEXT
- `centroid_x` REAL
- `centroid_y` REAL

Indexes:
- PK `(graph_run_id, cluster_id)`.
- Btree `(graph_run_id, size DESC, cluster_id)` — cluster list views.
- Btree `(graph_run_id, parent_cluster_id)` where
  `parent_cluster_id IS NOT NULL` — hierarchy walk.

#### `solemd.paper_semantic_neighbors`

Per-paper nearest-neighbor cache, scoped to graph run and model. Largest
serve projection: ~14 M × K (default 20) = ~280 M rows per retained run.
Fillfactor 100. Partitioning deferred (§8 trigger: hash × 16 at ~500 M).

Columns (MAXALIGN):
- `graph_run_id` UUID NOT NULL
- `corpus_id` BIGINT NOT NULL
- `neighbor_corpus_id` BIGINT NOT NULL
- `similarity` REAL NOT NULL
- `neighbor_rank` SMALLINT NOT NULL
- `model_key` SMALLINT NOT NULL

Indexes:
- PK `(graph_run_id, corpus_id, model_key, neighbor_rank)` — "top-K
  neighbors of this paper under this model".
- Reverse btree `(graph_run_id, neighbor_corpus_id, corpus_id)` — "who
  considers X a neighbor".

### 4.2 API projections

Narrow, cacheable rows backing engine API list and detail endpoints.
Built from warehouse `papers` + `paper_text` + `paper_metrics` +
`paper_lifecycle` via stage-and-swap; read through PgBouncer.

#### `solemd.paper_api_cards`

The canonical list-query projection. One narrow row per paper. Fillfactor
90 (incremental citation-count / tier updates happen here between full
rebuilds).

```hcl
table "paper_api_cards" {
  schema = schema.solemd
  column "corpus_id"             { null = false, type = bigint }
  column "current_graph_run_id"  { null = true,  type = uuid }
  column "citation_count"        { null = false, type = integer, default = 0 }
  column "influential_citation_count" { null = false, type = integer, default = 0 }
  column "publication_year"      { null = true,  type = smallint }
  column "package_tier"          { null = false, type = smallint, default = 0 } // 0 none, 1 warm, 2 hot
  column "text_availability"     { null = false, type = smallint, default = 0 }
  column "article_type"          { null = true,  type = smallint }
  column "language"              { null = true,  type = smallint }
  column "is_retracted"          { null = false, type = boolean, default = false }
  column "has_full_grounding"    { null = false, type = boolean, default = false }
  column "display_title"         { null = false, type = text }
  column "author_line"           { null = true,  type = text }
  column "venue_display"         { null = true,  type = text }
  column "external_ids"          { null = true,  type = jsonb }   // small: {pmid, doi, pmc, s2}
  primary_key { columns = [column.corpus_id] }
  index "idx_paper_api_cards_list" {
    columns = [
      column.current_graph_run_id,
      column.package_tier,
      column.citation_count desc,
      column.corpus_id
    ]
    include = [
      column.display_title,
      column.author_line,
      column.publication_year,
      column.venue_display,
      column.text_availability,
      column.has_full_grounding
    ]
    where = "current_graph_run_id IS NOT NULL"
  }
  index "idx_paper_api_cards_retracted" {
    columns = [column.corpus_id]
    where   = "is_retracted = true"
  }
  settings { fillfactor = 90 }
}
```

Consumed by engine API list endpoints
(`/papers?graph_run=…&tier=hot&limit=…`), graph-selection side panel
(one `corpus_id` per point), and wiki list views.

The covering index `idx_paper_api_cards_list` is the canonical
`rag-future.md` §7 example. The `WHERE current_graph_run_id IS NOT NULL`
partial keeps the index out of the "not in any run" tail. Index-only
scans require visibility-map coverage; §6.3 autovacuum keeps the VM hot.
**locked** for shape; exact `INCLUDE` list is **provisional**.

Primary sources: `https://www.postgresql.org/docs/current/indexes-index-only-scans.html`,
`https://atlasgo.io/guides/postgres/included-columns`.

#### `solemd.paper_api_profiles`

Richer per-paper row for wiki pages and detail endpoints. Fillfactor 90.

Columns (MAXALIGN): `corpus_id` BIGINT PK; `current_graph_run_id` UUID
(denormalized for filter without join); `citation_count`,
`influential_citation_count` INTEGER; `publication_date` DATE; `year`
SMALLINT; `package_tier`, `text_availability`, `article_type`, `language`
SMALLINT; `is_retracted`, `has_full_grounding` BOOLEAN; `full_title`
TEXT; `abstract` TEXT (STORAGE EXTERNAL — always full-read); `tldr`,
`venue_display` TEXT; `authors` JSONB (compact); `metric_summary`
JSONB (priority, velocity, rank bucket); `top_concepts` JSONB (top-N
concept_id + weight); `external_ids` JSONB.

Indexes:
- PK `(corpus_id)` — ~100 % of reads are by corpus_id.
- GiST `(full_title gist_trgm_ops)` — wiki fuzzy title lookup.
  **provisional** until wiki query shape is final.
- No covering index — detail reads are single-row PK lookups that pull
  the full TOAST'd payload anyway.

Per `rag-future.md` §7: small JSONB fields acceptable when they avoid
fan-out joins and aren't filter keys. Keep `metric_summary`,
`top_concepts`, `external_ids` < 4 KB each to stay inline rather than
TOAST'd.

#### `solemd.graph_cluster_api_cards`

Compact cluster-summary projection for graph cluster panels. Fillfactor
90.

Columns (MAXALIGN):
- `graph_run_id` UUID NOT NULL
- `cluster_id` INTEGER NOT NULL
- `parent_cluster_id` INTEGER (nullable)
- `size` INTEGER NOT NULL
- `label` TEXT NOT NULL
- `short_description` TEXT
- `top_concepts` JSONB (top-N concept summary; small)
- `top_venues` JSONB (top-N venues)
- `representative_corpus_ids` JSONB (BIGINT array; ~10–20 entries)

Indexes:
- PK `(graph_run_id, cluster_id)`.
- Btree `(graph_run_id, size DESC, cluster_id)` — list views by size.
  No `INCLUDE` — the row is narrow enough that heap fetch is cheap.

Design rule: this stays compact and summary-oriented. Heavy cluster
exploration falls back to `graph_points` + `paper_api_cards`, not to a
denormalized JSON blob. **locked**

### 4.3 Serving control

Small tables naming "what is live", "what was built", and "which cohort
defined this release". Status-flipping, fillfactor 80. UPDATEs rare.

#### `solemd.serving_runs`

One row per release-scoped serving package. Fillfactor 80; cohort-shape
fields freeze once `build_status = 'published'` (see §5 invariant 4),
but narrow post-publish operational audit fields remain mutable for the
OpenSearch alias-swap follow-up step.

Columns (MAXALIGN): `serving_run_id` UUID PK `uuidv7()` default;
`graph_run_id`, `api_projection_run_id`, `chunk_version_key` UUID
(cross-cluster refs enforced in engine, not PG); `build_started_at`,
`build_completed_at` TIMESTAMPTZ; `source_release_watermark`,
`contract_version`, `synonym_version`, `analyzer_version` INTEGER;
`package_tier` (hot | warm | mixed), `vector_mode` (halfvec_fp16 | fp32
| sparse), `build_status` (building | published | retired | failed)
SMALLINT; `opensearch_alias_swap_status` SMALLINT (`pending` |
`swapped` | `failed`); `opensearch_alias_swap_attempted_at`
TIMESTAMPTZ; `build_checksum`, `notes`, `opensearch_alias_swap_error`
TEXT.

Indexes:
- PK.
- Btree `(build_status, build_completed_at DESC, serving_run_id)`.
- Btree `(package_tier, build_status, build_completed_at DESC)`.

Immutability (`rag-future.md` §7): once `build_status = 'published'`,
cohort, analyzer, synonym, vector mode, contract, and
`chunk_version_key` are frozen. The only sanctioned post-publish
updates on `serving_runs` are operational tail fields needed for the
split OpenSearch cutover: `build_status` when retiring stale runs, plus
`opensearch_alias_swap_status`, `opensearch_alias_swap_attempted_at`,
and `opensearch_alias_swap_error`. **locked**

#### `solemd.serving_artifacts`

One row per physical artifact produced by a serving run. Fillfactor 80.

Columns: `serving_run_id` UUID; `artifact_kind` SMALLINT
(`opensearch_index` | `synonym_bundle` | `cohort_manifest` |
`projection_run` | `grounding_manifest`); `row_count` BIGINT;
`created_at` TIMESTAMPTZ; `artifact_checksum`, `alias_or_index_name`,
`artifact_uri` TEXT.

Indexes: PK `(serving_run_id, artifact_kind)`; btree `(artifact_kind,
created_at DESC)`. Consumed for cutover diagnostics, rollback,
`archives/` retention auditing (`01 §4`).

#### `solemd.serving_cohorts`

Cohort definitions. Fillfactor 80. Columns: `cohort_id` BIGINT IDENTITY
PK; `package_tier`, `cohort_kind` SMALLINT (`practice_hot` |
`warm_backfill` | `historical_exception` | `rubric_test`);
`evidence_window_years` SMALLINT; `rubric_version` INTEGER; `created_at`
TIMESTAMPTZ; `cohort_name` TEXT UNIQUE; `notes` TEXT. Indexes: PK; btree
`(package_tier, created_at DESC)`.

#### `solemd.serving_members`

Membership rows. Fillfactor 80.

Columns (MAXALIGN): `cohort_id`, `corpus_id` BIGINT; `promoted_at`
TIMESTAMPTZ; `evidence_priority_score` REAL; `publication_year`,
`publication_age_years`, `text_availability_class`,
`structural_readiness`, `anchor_readiness`,
`historical_exception_reason`, `package_build_status` SMALLINT;
`grounding_roundtrip_ok` BOOLEAN.

Indexes: PK `(cohort_id, corpus_id)`; reverse btree `(corpus_id,
cohort_id)`; partial btree `(package_build_status, grounding_roundtrip_ok)`
where `package_build_status > 0`.

#### `solemd.api_projection_runs`

One row per projection-build cycle. Fillfactor 80. `serving_run_id`
names the serving-run window the cycle belongs to; `source_serving_run_id`
captures the previously-live serving run observed when the cycle started,
which matters when an API-only refresh advances `api_projection_run_id`
without creating a new live `serving_run_id`.

Columns: `api_projection_run_id` UUID PK `uuidv7()`; `serving_run_id`,
`source_graph_run_id`, `source_serving_run_id` UUID;
`source_release_watermark`, `projection_schema_version` INTEGER;
`build_status` SMALLINT; `build_started_at`, `built_at` TIMESTAMPTZ;
`rows_written` BIGINT; `tables_rewritten` TEXT[]; `notes` TEXT.

Indexes: PK; btree `(serving_run_id, built_at DESC)`; btree
`(source_graph_run_id, built_at DESC)`.

#### `solemd.active_runtime_pointer`

Single-row singleton naming the live runtime as one coherent state
object: `serving_run_id` + `graph_run_id` + `api_projection_run_id`
move together in one UPDATE, so the three ids can never drift apart.
Fillfactor 80.

```hcl
table "active_runtime_pointer" {
  schema = schema.solemd
  column "singleton_key"                  { null = false, type = boolean, default = true }
  column "serving_run_id"                 { null = false, type = uuid }
  column "graph_run_id"                   { null = false, type = uuid }
  column "api_projection_run_id"          { null = false, type = uuid }
  column "promoted_at"                    { null = false, type = timestamptz, default = sql("now()") }
  column "promoted_by"                    { null = true,  type = text }   // operator or pipeline tag
  column "previous_serving_run_id"        { null = true,  type = uuid }
  column "previous_graph_run_id"          { null = true,  type = uuid }
  column "previous_api_projection_run_id" { null = true,  type = uuid }
  primary_key { columns = [column.singleton_key] }
  check "ck_active_runtime_singleton" {
    expr = "singleton_key = true"
  }
  settings { fillfactor = 80 }
}
```

Seeded once at cluster init; every cutover is a single-row UPDATE inside
the swap transaction (§6.1). Readers resolve "the live run" with one
`SELECT … FROM solemd.active_runtime_pointer` — one heap tuple, always
in cache. Partial cutovers (for example, an API projections refresh
without a full serving cutover) still touch the same row, overwriting
only the changed ids.

Rationale for one table rather than three: the three run ids define one
coherent "what is live" state object per `rag-future.md` §7. Splitting
them into three singletons invited a mismatch class where, for
instance, the graph pointer flipped but the serving pointer didn't. A
single row closes that class by construction. **locked**

### 4.4 Auth schema placeholder (Better Auth-ready)

Better Auth's user-data plane is **deferred** per `00-topology.md` §6.
This section is the skeleton. No Better Auth tables are created day one,
but the schema and convention are reserved so the Better Auth CLI
(`npx @better-auth/cli generate` / `migrate`) drops in cleanly without a
schema rework later.

```sql
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION engine_api;
COMMENT ON SCHEMA auth IS
  'Better Auth placeholder. Empty on day one; see docs/rag/13-auth.md.';

-- role contract: Better Auth CLI runs under a privileged role; engine API reads via a narrow grant.
-- No users / sessions / accounts / verification tables yet — CLI generates them on first run.
```

Reservations so Better Auth's CLI drops in cleanly:

- **Search path / schema config.** Better Auth's migrate command
  detects `search_path` and places tables in its configured schema
  (`https://better-auth.com/docs/concepts/cli`). Configure Better Auth
  with `schema: 'auth'`; the `engine_api` role keeps `search_path =
  solemd, public`.
- **Primary key convention.** Better Auth 1.4+ on PostgreSQL delegates
  UUID generation to the database
  (`https://better-auth.com/docs/concepts/database`). Wire the Drizzle
  adapter with `generateId: false` so the PG default (`uuidv7()`) runs,
  matching serve's identity contract. **provisional**
- **Expected table set.** `auth.user`, `auth.session`, `auth.account`,
  `auth.verification` per
  `https://better-auth.com/docs/concepts/users-accounts`:
  - `user(id uuid PK, name text, email text UNIQUE, email_verified boolean, image text, created_at timestamptz, updated_at timestamptz)`
  - `session(id uuid PK, user_id uuid FK, token text UNIQUE, expires_at timestamptz, ip_address inet, user_agent text, created_at timestamptz, updated_at timestamptz)`
  - `account(id uuid PK, account_id text, provider_id text, user_id uuid FK, access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text, created_at timestamptz, updated_at timestamptz)`
  - `verification(id uuid PK, identifier text, value text, expires_at timestamptz, created_at timestamptz, updated_at timestamptz)`
- **Expected indexes.** Unique on `user.email`, unique on
  `session.token`, btree `(session.user_id, expires_at DESC)`,
  btree `(account.user_id, provider_id)`,
  btree `(verification.identifier, expires_at)`.
- **Cross-schema joins.** User-scoped surfaces (saved papers, notes,
  collections) live in `solemd.user_*` tables that FK into
  `auth.user(id)`; no user-scoped data in `auth` beyond what Better
  Auth generates.
- **Backup scope.** The `auth` schema is precious on first row.
  `11-backup.md` owns cadence; first `auth` row is the trigger for the
  off-box B2 mirror (`00 §6` deferred).

**deferred** — no `auth.*` tables day one. Schema created, role /
search-path reserved. Full spec in `13-auth.md`.

## 5. Cross-family invariants

Enforced by intra-serve FKs, application-level checks (where one side
is warehouse), and `pg_cron` audits.

1. **Active-pointer consistency.** The single `active_runtime_pointer`
   row holds all three live run ids in one heap tuple and enforces
   their cross-id invariants together:
   - `graph_run_id` references an existing `graph_run_metrics` row
     (intra-serve FK).
   - `serving_run_id` references a `serving_runs` row with
     `build_status = 'published'` (intra-serve FK + check).
   - `api_projection_run_id` references an `api_projection_runs` row
     with `build_status = 'published'` (intra-serve FK + check).
   A scheduled `pg_cron` audit (`audit_active_runtime_pointer`) catches
   `retired` flips on any of the three tables that did not propagate
   into the pointer row.
2. **Run-scoped consistency.** `graph_points` / `graph_clusters` /
   `paper_semantic_neighbors` rows FK `graph_run_id` to
   `graph_run_metrics` `ON DELETE RESTRICT`. Retirement is supervised —
   cannot run while the active pointer names the run.
3. **FDW error isolation.** `paper_api_cards` / `paper_api_profiles`
   never reference warehouse tables in generated columns or checks.
   Warehouse down ≠ serve broken. **locked**
4. **Frozen cohort-shape `serving_runs`.** Frozen-column trigger
   rejects UPDATEs to `chunk_version_key`, `contract_version`,
   `synonym_version`, `analyzer_version`, `vector_mode`, and
   `package_tier` once `build_status = 'published'`. Post-publish
   operational tail fields for retirement and OpenSearch alias-swap
   audit remain mutable by explicit allowlist.
5. **Projection row lineage.** Every `paper_api_cards` /
   `paper_api_profiles` / `graph_cluster_api_cards` row is produced by
   exactly one `api_projection_run_id`. A `pg_cron` audit verifies
   `current_graph_run_id` matches the `source_graph_run_id` of the most
   recent projection run for that table.
6. **`evidence_key` round-trip is FDW-only.** Never stored on serve;
   round-trip goes through `warehouse_grounding.paper_evidence_units`
   (§3). No shadow copy. **locked**

## 6. Write patterns

Serve write traffic is three shapes: stage-and-swap rebuild (bulk),
incremental UPSERT (between rebuilds), and pointer flip (cutover).

### 6.1 Stage-and-swap rebuild

The projection worker produces `<table>_next` tables on serve, then flips
atomically. The flow is the same for `paper_api_cards`,
`paper_api_profiles`, `graph_cluster_api_cards`, `graph_points`,
`graph_clusters`, and `paper_semantic_neighbors`.

```sql
-- 1. Build staging, matching structure
CREATE TABLE solemd.paper_api_cards_next (LIKE solemd.paper_api_cards INCLUDING ALL);

-- 2. Load via asyncpg binary COPY from the warehouse-side join (02 §6.1 pattern)
--    — this runs on the projection worker; target is serve via PgBouncer admin pool (bypasses txn-mode pooler)
COPY solemd.paper_api_cards_next (…) FROM STDIN WITH (FORMAT binary);

-- 3. Build indexes in parallel (table has no readers; CONCURRENTLY not required)
CREATE UNIQUE INDEX paper_api_cards_next_pkey ON solemd.paper_api_cards_next (corpus_id);
CREATE INDEX idx_paper_api_cards_next_list ON solemd.paper_api_cards_next
  (current_graph_run_id, package_tier, citation_count DESC, corpus_id)
  INCLUDE (display_title, author_line, publication_year, venue_display, text_availability, has_full_grounding)
  WHERE current_graph_run_id IS NOT NULL;
-- …other indexes…

-- 4. Analyze
ANALYZE solemd.paper_api_cards_next;

-- 5. Atomic swap in ONE transaction
BEGIN;
ALTER TABLE solemd.paper_api_cards RENAME TO paper_api_cards_prev;
ALTER TABLE solemd.paper_api_cards_next RENAME TO paper_api_cards;
-- API-projection-only refresh: flip just the projection id on the pointer
UPDATE solemd.active_runtime_pointer
   SET api_projection_run_id          = $new_api_projection_run,
       previous_api_projection_run_id = api_projection_run_id,
       promoted_at                    = now();
-- A full serving cutover touches the same row and flips all three ids
-- atomically in one statement so they can never drift apart:
-- UPDATE solemd.active_runtime_pointer
--    SET serving_run_id                 = $new_serving_run,
--        graph_run_id                   = $new_graph_run,
--        api_projection_run_id          = $new_api_projection_run,
--        previous_serving_run_id        = serving_run_id,
--        previous_graph_run_id          = graph_run_id,
--        previous_api_projection_run_id = api_projection_run_id,
--        promoted_at                    = now();
INSERT INTO solemd.api_projection_runs (…) VALUES (…, 'published');
INSERT INTO solemd.serving_artifacts (…) VALUES (…);
COMMIT;

-- 6. Keep paper_api_cards_prev for 24 h rollback window; drop via pg_cron (§6.5)
```

`ALTER TABLE … RENAME` takes `ACCESS EXCLUSIVE`
(`https://www.postgresql.org/docs/current/sql-altertable.html`), held
for milliseconds. Swap-time transactions see either the old or the new
table (MVCC atomicity). Readers never see half-built rows. **locked**

Future partitioned targets would use `ATTACH PARTITION` /
`DETACH PARTITION CONCURRENTLY` (only `SHARE UPDATE EXCLUSIVE`,
`https://www.postgresql.org/docs/current/ddl-partitioning.html`).
Forward path for `paper_semantic_neighbors` partitioning (§8).

### 6.2 Incremental UPSERT

Between full rebuilds, a narrow column set on `paper_api_cards` /
`paper_api_profiles` refreshes incrementally (citation counts, tier
reassignments, retraction flips):

```sql
INSERT INTO solemd.paper_api_cards AS t (corpus_id, citation_count, …)
VALUES ($1, $2, …)
ON CONFLICT (corpus_id) DO UPDATE SET
  citation_count = EXCLUDED.citation_count,
  influential_citation_count = EXCLUDED.influential_citation_count,
  package_tier = EXCLUDED.package_tier,
  is_retracted = EXCLUDED.is_retracted
  -- do NOT overwrite display_title / author_line / external_ids
WHERE t.citation_count <> EXCLUDED.citation_count
   OR t.package_tier <> EXCLUDED.package_tier
   OR t.is_retracted <> EXCLUDED.is_retracted;
```

The `WHERE` on `DO UPDATE` suppresses no-op writes that would dirty
pages and grow HOT chains. Fillfactor 90 leaves room for genuine HOT
updates. PgBouncer 1.25.1 transaction-mode prepared statements
(`https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer`)
keep this path fast.

### 6.3 Per-table autovacuum overrides

OLTP-shaped tables with covering indexes need aggressive VM maintenance
to keep index-only scans alive:

```sql
ALTER TABLE solemd.paper_api_cards SET (
  autovacuum_vacuum_scale_factor = 0.05,         -- tighter than default 0.2
  autovacuum_analyze_scale_factor = 0.05,
  autovacuum_vacuum_insert_scale_factor = 0.1,
  autovacuum_vacuum_cost_delay = 2
);

ALTER TABLE solemd.paper_api_profiles SET (
  autovacuum_vacuum_scale_factor = 0.1,
  autovacuum_analyze_scale_factor = 0.1
);

-- Control tables: tiny, status-flipping; keep them vacuuming aggressively
ALTER TABLE solemd.serving_runs SET (
  autovacuum_vacuum_scale_factor = 0.0,
  autovacuum_vacuum_threshold = 50
);
ALTER TABLE solemd.api_projection_runs SET (
  autovacuum_vacuum_scale_factor = 0.0,
  autovacuum_vacuum_threshold = 50
);
```

Rationale: covering-index benefit depends on VM coverage; aggressive
vacuum keeps list queries as index-only scans. PG 18 autovacuum defaults
(`autovacuum_worker_slots`, eager-freeze) apply; these overrides take
precedence
(`https://techcommunity.microsoft.com/blog/adforpostgresql/postgresql-18-vacuuming-improvements-explained/4459484`).
**provisional**.

### 6.4 Cutover write pattern

One cutover = one multi-statement transaction: rename projection tables
(`_next` → live, live → `_prev`), update the matching active pointer,
insert `api_projection_runs` / `serving_runs` + `serving_artifacts`
rows. PG's DDL-in-transaction atomicity guarantees read-committed
clients see the whole swap or none of it. **locked**

### 6.5 `pg_cron` scheduled jobs

All scheduled maintenance runs in `pg_cron` on serve. Jobs are staggered
across UTC minutes because `pg_cron` uses a single background worker
(`https://github.com/citusdata/pg_cron`).

```sql
-- Drop 24h-old _prev rollback tables
SELECT cron.schedule('drop-stale-projection-prev', '17 3 * * *',
  $$SELECT solemd.drop_projection_prev_tables()$$);

-- Clean pg_cron's own audit log weekly
SELECT cron.schedule('cron-audit-hygiene', '0 4 * * 0',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days'$$);

-- Retire stale serving_runs past the retention window
SELECT cron.schedule('retire-stale-serving-runs', '23 3 * * *',
  $$UPDATE solemd.serving_runs
    SET build_status = 4   -- retired
    WHERE build_status = 2 -- published
      AND build_completed_at < now() - interval '30 days'
      AND serving_run_id <> (SELECT serving_run_id FROM solemd.active_runtime_pointer)$$);

-- Active-pointer consistency audit (emits Prometheus metric via 10-observability.md)
SELECT cron.schedule('active-pointer-audit', '*/15 * * * *',
  $$SELECT solemd.audit_active_runtime_pointer()$$);

-- Autoprewarm hot-list index (in addition to pg_prewarm's autoprewarm.blocks)
SELECT cron.schedule('prewarm-hot-cards', '5 * * * *',
  $$SELECT pg_prewarm('solemd.idx_paper_api_cards_list')$$);
```

Exact schedules are **provisional** and tuned in `10-observability.md` /
`11-backup.md` once cutover cadence is measured. Staggering across
different minute values avoids the single-worker bottleneck.

## 7. Read patterns

### 7.1 From Next.js through engine API

Hot-path chain: Next.js route → `graph-engine-api` (FastAPI, asyncpg) →
`pgbouncer-serve` (txn mode, 1.25.1, prepared-statement rewrite) →
`graph-db-serve`. The backend reads `active_runtime_pointer` (1 cached row),
`paper_api_cards` (covering index, index-only when VM is warm),
`paper_api_profiles` (PK lookup), `graph_points` (selection), and
`warehouse_grounding.*` (bounded FDW for grounded-detail only).

Hot-path budgets:
- **Cards list**: one `paper_api_cards` query (covering index →
  index-only scan when VM is warm, §6.3).
- **Paper detail**: one `paper_api_profiles` PK lookup.
- **Graph bootstrap**: `active_runtime_pointer` + `graph_run_metrics` (two
  single-row reads). The bundle serves from
  `/mnt/solemd-graph/bundles/<graph_run_id>/`, not PG.
- **Grounding**: OpenSearch returns `evidence_key`; engine API calls
  `warehouse_grounding.paper_evidence_units` once + scoped
  `paper_sentences` range (§3.3). Degrade per §3.4 if warehouse is down.

### 7.2 Covering-index list query

```sql
-- representative hot query: warm-lane list for the current graph run
PREPARE warm_list (uuid, integer) AS
SELECT corpus_id, display_title, author_line, publication_year,
       venue_display, text_availability, has_full_grounding
FROM solemd.paper_api_cards
WHERE current_graph_run_id = $1
  AND package_tier = 2            -- hot
ORDER BY citation_count DESC, corpus_id
LIMIT $2;
```

`idx_paper_api_cards_list` with `INCLUDE (display_title, author_line, …)`
gives an index-only scan when visibility-map pages are set. Expected
plan on a warm run: `Index Only Scan using idx_paper_api_cards_list`,
`Heap Fetches: 0`. Confirmed against the
PG 18 manual §11.9 covering-index guidance. **provisional** — verify on
first sample build; if `Heap Fetches` is non-zero, tighten autovacuum
(§6.3) or trim the `INCLUDE` set.

### 7.3 PgBouncer pool sizing and prepared statements

- `pool_mode = transaction` (locked per `00 §6`).
- `max_prepared_statements >= 200` enables per-server prepared-statement
  cache so repeated hot queries amortize parse cost. PgBouncer rewrites
  client-side statement names to internal names
  (`https://www.crunchydata.com/blog/prepared-statements-in-transaction-mode-for-pgbouncer`).
  Clients must use the protocol-level prepared-statement API (asyncpg
  default), not raw SQL `PREPARE`. **locked**
- Admin connections (projection worker's rename path, `pg_cron`)
  bypass the pooler via a reserved role.
- Next.js serverless functions on Vercel pool through the same
  `pgbouncer-serve`; short invocations + txn mode are compatible.
- `default_pool_size`, `reserve_pool_size`, and concrete
  `max_prepared_statements` land in `09-tuning.md`.

### 7.4 Cache warming via `pg_prewarm`

1. Autoprewarm background worker replays `autoprewarm.blocks` on boot
   (`https://www.postgresql.org/docs/current/pgprewarm.html`).
2. `prewarm-hot-cards` `pg_cron` job (§6.5) re-prewarms
   `idx_paper_api_cards_list` hourly.
3. After each cutover the projection worker issues
   `SELECT pg_prewarm('solemd.paper_api_cards', 'buffer')` so new heap
   pages land resident before `_prev` drops 24 h later.

**locked**; cadence tuned in `10-observability.md`.

### 7.5 Analytical reads

No analytical reads on serve. Admission reporting, serving-run drift
audits, and benchmark suites read from warehouse through the admin
pool per `02 §7.3`. Serve stays OLTP-shaped.

## 8. Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| Two schemas: `solemd` + `auth` (placeholder) | Mirrors warehouse; reserves user-data plane without a rename. |
| `serving_run_id`, `api_projection_run_id` as UUIDv7 | Consistent with warehouse identities (`02 §2`); externally sortable; no sequence leakage. |
| Single `active_runtime_pointer` row holding `serving_run_id` + `graph_run_id` + `api_projection_run_id` | One atomic UPDATE in the swap transaction flips all three live ids together; the three can never drift apart. Replaces an earlier draft with three separate pointer tables. |
| Stage-and-swap via `ALTER TABLE … RENAME` in a transaction; `_prev` held 24 h | DDL-in-transaction atomicity; 24 h rollback window without full rebuild. |
| Covering `INCLUDE` index on `idx_paper_api_cards_list` | `rag-future.md` §7 canonical example; PG 18 §11.9 index-only-scan semantics. |
| Serve projections not partitioned day one | Row counts fit in a single table; OLTP lookups don't benefit from pruning. |
| PgBouncer transaction mode with prepared statements (1.21+) | Engine API concurrency fits txn mode; prepared statements cut parse cost. |
| `postgres_fdw` on serve only | Warehouse is source, never querier (`02 §1`). |
| Foreign schema `warehouse_grounding` limited to grounding spine + `paper_evidence_units` | `00 §4` forbids general FDW queries. |
| FDW queries keyed by `corpus_id` / `evidence_key`, cardinality-bounded | Enforces "if it's hot, project it". |
| FDW error-handling: fail fast, degrade, circuit-break | Warehouse is cold-by-default; serve must stay available when warehouse stops. |
| `wal_level = replica` | Preserves future streaming-replica optionality without the logical WAL tax. |
| `synchronous_commit = on` always | Future user-data precludes the `off` data-loss risk. |
| `pg_prewarm` autoprewarm + hourly `pg_cron` reprewarm of hot list index | No cold-cache stalls on restart. |
| Fillfactor tiers 100 / 90 / 80 (append / updatable-projection / status-flipping) | Serve-delta from `02 §0.5`. |
| Frozen-column trigger on `serving_runs` once `build_status = 'published'` | Freezes cohort / analyzer / synonym / chunk-version per `rag-future.md` §7 while still allowing post-publish retirement + OpenSearch alias-swap audit fields. |
| `pg_cron` with staggered UTC schedules | Single-worker model requires staggering. |
| Extension set: `pgcrypto`, `pg_trgm`, `pg_stat_statements`, `auto_explain`, `pg_buffercache`, `pg_prewarm`, `pg_cron`, `postgres_fdw` | Minimal OLTP + FDW + hygiene + warmup. |

### Provisional (revisit after sample build)

| Decision | Revisit trigger |
|---|---|
| `INCLUDE` column set on `idx_paper_api_cards_list` | Confirm every included column is used on the hot list path. |
| `fetch_size = 2000` on `warehouse_fdw` | Benchmark grounding latency vs 500 / 2000 / 5000. |
| `statement_timeout` draft 250 ms | Real p95 hot-path measurement; `09-tuning.md` owns final. |
| Autovacuum per-table overrides on card / profile projections | Measure `Heap Fetches` after first projection cycle; tighten if non-zero. |
| `paper_api_profiles.full_title` GiST trgm index | Verify wiki autocomplete is the actual shape. |
| `graph_points` not partitioned | Revisit past ~100 M total rows across retained runs. |
| `paper_semantic_neighbors` not partitioned | Hash × 16 by `corpus_id` becomes default at ~500 M rows. |
| Better Auth generator defaults (`schema: 'auth'`, `generateId: false`, UUIDv7 default) | Confirm on CLI first run. |
| PgBouncer `max_prepared_statements = 200` | Prepared-cache hit rate via `pg_stat_statements`. |
| 24 h `_prev` retention | Operator-rollback window adequacy after measured cutover frequency. |
| `pg_cron` job cadences | Tune once `10-observability.md` measures cutover lag. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Better Auth schema population (`auth.user` + friends) | Frontend product needs saved state (notes, saved papers, collections). Spec in `13-auth.md`. |
| `pgvector` + `halfvec(768)` projected embedding cache | OpenSearch alone can't cover a personalization surface. |
| Partition `paper_semantic_neighbors` (hash × 16) | > ~500 M rows across retained runs, or reverse-neighbor p95 > budget. |
| Partition `graph_points` | > ~100 M total rows across retained runs. |
| PgBouncer in front of warehouse | Ingest + projection concurrency exceeds direct-connection headroom (`00 §6`). |
| Read replica on serve | p95 > 50 ms, or analytical reads collide with OLTP. |
| Separate NVMe for serve PG | OpenSearch I/O contends with PG on the same NVMe (`01 §8`). |
| OTel exporter `auto_explain` → Langfuse | End-to-end DB + LLM trace correlation. |
| `fts_vector` on `paper_api_profiles` | DB-local FTS path proves useful; today OpenSearch owns FTS. |
| Columnar engine (Citus / Hydra) on serve | No use case — serve is OLTP; listed to make "not here" explicit. |

## Open items before `04-projection-contract.md`

None block `04-projection-contract.md`. Forward-tracked:

- **Final `INCLUDE` column set** on `idx_paper_api_cards_list` —
  finalized against real hot-path queries in `engine/app/rag/_queries_*.py`
  after the first projector batch lands. Today's list is the
  `rag-future.md` §7 starting point.
- **`_prev` retention window** — 24 h is a starting value; lengthen if
  cutover cadence warrants more operator rollback room.
- **`statement_timeout` and FDW retry counts** — land in `09-tuning.md`
  and `10-observability.md`.
- **Cross-reference for `04`**: the projection worker's write path
  uses an admin connection that **bypasses** `pgbouncer-serve`'s
  transaction-mode pooler so `CREATE INDEX` and `ALTER TABLE … RENAME`
  run on a dedicated connection.

## Relationship to other docs

- `00-topology.md` §1 names the cluster and PgBouncer; §4 owns the
  topology-level FDW contract that §3 here expands.
- `01-storage.md` §2 locates `graph_serve_pg-data` on NVMe.
- `02-warehouse-schema.md` §0 is the convention root; §2 the identity
  glossary; §4.5 the grounding spine this cluster FDW-dereferences;
  §4.7 the warehouse side of graph build-control.
- `04-projection-contract.md` owns the projector's write semantics and
  cutover orchestration (this doc fixes shape; `04` fixes mechanics).
- `07-opensearch-plane.md` owns `paper_index` / `evidence_index` and the
  alias-swap cutover paired with the PG swap above via `serving_runs`.
- `09-tuning.md` owns `shared_buffers`, `effective_cache_size`,
  `work_mem`, planner GUCs, `statement_timeout`, PgBouncer sizing.
- `11-backup.md` owns pgBackRest cadence; the `auth` schema is the
  trigger for activating the off-box B2 mirror.
- `13-auth.md` owns Better Auth wiring on top of §4.4's skeleton.
