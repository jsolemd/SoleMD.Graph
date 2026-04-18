# 05b — Graph Bundles

> **Status**: locked for the inventory of the existing graph-bundle pipeline,
> the (b) "no warehouse write-back at publish" deletion, the speed-first
> export commitment, the `graph_runs` state machine, the bundle parquet schema
> at version 4, the `bundle_eligibility_mv` materialized-view pattern, the
> independent-build / joint-promotion cohort distinction, the asset-serving
> contract, and the DuckDB-WASM browser contract. **Provisional**: the
> warehouse-to-Parquet export engine choice (native-PG row producer versus
> DuckDB `TYPE postgres` helper; see §5.5), the wall-clock budgets in §6.7,
> the materialized-view refresh cadence in §5.4, and the bundle-build session
> GUC values in §6.3.
> **Deferred**: an in-DuckDB hot-bundle cache layer in serve, a parquet-format
> bump (any change beyond column-additive triggers a new `BUNDLE_VERSION`).
>
> **Date**: 2026-04-17
>
> **Scope**: the warehouse → graph-build → parquet-bundle → checksum-addressed
> serving → DuckDB-WASM browser pipeline owned by `engine/app/graph/`. Sibling
> of `05-ingest-pipeline.md` (RAG ingest) and `05a-chunking.md` (chunker);
> serves the Cosmograph runtime instead of the OpenSearch retrieval lane.
> The build stages themselves (PCA / kNN / UMAP / clustering / scoring) are
> already implemented and out of scope for redesign — this doc fixes the
> *export + publish + serve* boundary contracts they feed. DuckDB is **required**
> at the browser/runtime boundary because Cosmograph's data surface is the
> browser DuckDB-WASM bundle reader; DuckDB is **not automatically implied** as
> part of the warehouse, the graph-point generation stages, or the server-side
> export path.
>
> **Schema authority**: this document is the runtime / writer authority for
> graph-bundle generation. Warehouse columns (`graph_runs`, `corpus`,
> `paper_authors`, `paper_citations`, `paper_embeddings_graph`) are defined
> by `02 §0`/§4.2/§4.6/§4.7 and not restated here; this doc declares the
> upstream amendments needed (see end). Pool placement is defined in
> `06 §2.1` and not restated. Cohort coupling lives in `04 §5.1` /
> `04 §3.5` and is referenced, not re-authored. Existing engine code and the
> pre-rebuild migration chain are **inventory only**: they are read to find
> reusable implementations and required deletions, never to define the target
> schema or runtime contract. If old code or old migrations disagree with
> `02` / `03` / `04` / `12`, the docs win and the legacy surface is rewritten
> or removed.

## Purpose

Lock the deltas required to take the existing graph-build + bundle-export
pipeline (`engine/app/graph/`, ~3 500 lines, ~88 % reusable as-is) and wire
it into the new warehouse / projection / serve contracts that 02–04, 05,
05a, 06, 07 were authored against, while paying off two long-standing
debts at the same time:

The other locked posture for this lane is rollout scope: graph bundles are
allowed to build over the current implementation wave, not only after a
hypothetical full-corpus embedding load. `paper_embeddings_graph` may therefore
be sourced from upstream S2 embedding shards when present or from local
SPECTER2 generation for the active graph cohort when upstream shards are
absent. That choice must remain auditable via `paper_embeddings_graph`
provenance fields, not inferred later from operator memory.

1. **(b) — no warehouse write-back at bundle publish.** The
   `_sync_current_corpus_membership()` call in
   `engine/app/graph/build_publish.py:101, 120-173` flips
   `solemd.corpus.is_in_current_map` / `is_in_current_base` boolean flags
   on every publish. That mirrors what the singleton
   `solemd.active_runtime_pointer.graph_run_id` row on serve (`03 §2`)
   already names. Two layers of truth is exactly the dual-write trap the
   serve-side `active_runtime_pointer` design avoided. We delete the
   sync, drop the columns, and treat the warehouse `corpus` table as
   purely descriptive: every row is a paper that exists; no row carries
   "and it's in the current map" state. The single source of truth for
   "what is in the live bundle" is `active_runtime_pointer.graph_run_id`
   plus the bundle parquet files themselves.

2. **Speed-first export.** Bundle build is the operator's most-frequent
   action ("publish current"); end-to-end wall-clock has to be the
   design's first-class concern. Use the most efficient primitives
   available — partial indexes on inclusion predicates, materialized
   views for the eligibility candidate set, hash-partition pruning per
   `02 §0.6`, covering indexes for bundle-output columns, parallel
   aggregation. PostgreSQL remains the canonical schema / query
   authority; the export helper is an implementation detail chosen by
   measured wall-clock, not by runtime coupling to Cosmograph. DuckDB
   `TYPE postgres` is one candidate export accelerator because it can
   write Parquet directly, but it is not a warehouse dependency.
   Wall-clock is a first-class observability metric, not an
   after-thought.

Six load-bearing properties for this lane:

1. **Bundle build is independent in cadence; bundle promotion is joint
   and atomic.** The build can run hourly, daily, or operator-triggered
   on its own clock. Promotion ("publish current") flips
   `active_runtime_pointer.graph_run_id` per `04 §3.5` — alone for a
   graph-only refresh, jointly with `serving_run_id` +
   `api_projection_run_id` for a full cohort cutover. There is no live
   read where `serving_run_id` and `graph_run_id` can drift apart.
2. **Eligibility is a first-class object.** "Which papers go into the
   bundle?" today is implicit in `engine/app/graph/build_inputs.py`
   queries. We extract it into one SQL function
   `solemd.is_bundle_eligible(corpus_id) → boolean` plus one materialized
   view `solemd.bundle_eligibility_mv (corpus_id BIGINT PK)` that the
   bundle build joins against. Mirror of the chunker policy registry
   pattern (`05a §4`).
3. **Bundle parquet schema is versioned.** `BUNDLE_VERSION = "4"` today
   (5 tables; `engine/app/graph/export_bundle.py:28`). Append-only
   column evolution = same version; rename / drop / dtype change = new
   version. The manifest carries `bundle_version` + per-table column
   registry + per-file SHA256.
4. **Bundle storage is checksum-addressed.** SHA256 of the manifest is
   the bundle's content-bound identity; `/mnt/solemd-graph/bundles/by-checksum/<hash>/`
   symlinks to the run-id directory. Asset URLs use the checksum, are
   immutable, and cache at `max-age=31536000`. OPFS cache key in
   DuckDB-WASM is the checksum (not the run id), so re-publish of the
   same content reuses the cached parquet files.
5. **`graph_runs` is the only ledger.** State machine
   `running → succeeded → published → retired` (and `running → failed`)
   lives entirely in `solemd.graph_runs.status`. There is no
   `is_current` flag mirroring `active_runtime_pointer.graph_run_id` —
   that's the same dual-write class as (b) and is dropped (or never
   added) by this doc.
6. **Build stages are read-only canon.** PCA / kNN / UMAP / HDBSCAN / scoring
   in `engine/app/graph/build_stages.py`, paired with the embedding /
   layout / cluster checkpoints in `engine/app/graph/checkpoints.py`,
   are not redesigned. We document the *export + publish boundary*
   they feed, the *eligibility predicate* they read against, and the
   *failure / retention* contract that wraps them.

What this doc does **not** cover:

- **Build-stage internals** (PCA / kNN / UMAP / clustering / labeling
  algorithm choice). Owned by `engine/app/graph/build_stages.py` +
  `engine/app/graph/labels.py` + `.claude/skills/graph/SKILL.md`. This
  doc does not change them.
- **OpenSearch and serving-cohort orchestration.** `04`, `07`. This doc
  participates by sharing `active_runtime_pointer.graph_run_id`; it
  does not author cohort mechanics.
- **Browser graph runtime internals** (Cosmograph render loop, OPFS
  hot-table view materialization, DuckDB query orchestration). Owned by
  `.claude/skills/cosmograph/SKILL.md`, `features/graph/`, and
  `05c-browser-duckdb-runtime.md`. This doc declares the browser-side
  bundle bootstrap contract (§10), not the rendering pipeline.
- **Backup / off-box mirror.** `11-backup.md`. Bundles live on
  `/mnt/solemd-graph/bundles/`; pgBackRest covers serve, not bundles
  (warehouse is rebuildable from parquet, bundles are rebuildable from
  warehouse).
- **Tuning values for warehouse cluster.** `09-tuning.md`. This doc
  declares additive bundle-build session GUCs in §6.3 and an upstream
  amendment to `09 §3` (warehouse `postgresql.conf`) for any cluster-wide
  bumps.

## §0 Conventions delta from `02` / `03` / `04` / `05` / `05a` / `06` / `12`

Inherits every convention from those docs. Adds the bundle-lane-specific
rules below; nothing here weakens those docs.

| Concern | This doc adds |
|---|---|
| **No warehouse write-back at publish (b)** | The publish step writes only to `solemd.graph_runs` (status / bundle metadata) and to `solemd.active_runtime_pointer.graph_run_id` on serve. It never writes to `solemd.corpus` or any other warehouse-fact table. The `is_in_current_map` / `is_in_current_base` columns are dropped (`02 §4.2` upstream amendment in §11). |
| **Speed-first as a first-class design constraint** | Every export-path choice prefers the more efficient primitive for the job: PostgreSQL for canonical schema/query ownership; DuckDB `TYPE postgres` only where it measurably reduces export wall-clock or simplifies Parquet writing; partial indexes, materialized views, hash-partition pruning, covering indexes, and parallel aggregation everywhere else. Wall-clock is an emitted metric (§13). |
| **Bundle versioning rule** | Append-only column evolution holds `BUNDLE_VERSION` constant. Rename / drop / dtype change increments `BUNDLE_VERSION` and forces an OPFS cache invalidation on the browser side via the new checksum. (`engine/app/graph/export_bundle.py:28`) |
| **Eligibility-as-function pattern** | The "which papers go into the bundle" predicate is exactly one SQL function `solemd.is_bundle_eligible(corpus_id)` plus one materialized view `solemd.bundle_eligibility_mv`. Mirrors the `05a §4` chunker policy registry. The function is the single source of truth; the MV is the speed-first cache. |
| **Cohort: independent build, joint promotion** | Bundle build runs on its own cadence (minutes to hours); bundle promotion is one row UPDATE shared with serving promotion (`04 §3.5`). The two are decoupled in time and coupled at commit. |
| **Checksum-addressed identity** | `bundle_checksum = SHA256(manifest.json)`. The bundle's content-bound identity. URLs, OPFS keys, and immutability all derive from it. |

## §1 Identity / boundary

No new identity types beyond `02 §2` and `03 §2`. This section locks the
constants and derivations that make graph-bundle identity boundary-safe.

### 1.1 `graph_run_id` — locked

UUIDv7 per `02 §2`. Generated server-side by `uuidv7()` on
`solemd.graph_runs` insert (`02 §4.7`). Timestamp-ordered, externally
sortable, never recycled. The same value appears (read-only) on serve
in `solemd.active_runtime_pointer.graph_run_id` and
`solemd.graph_run_metrics.graph_run_id` (`03 §4.1`). Cross-cluster ref
enforced in code per `04 §2.4`.

### 1.2 `bundle_checksum` — locked

`SHA256(manifest.json)`, hex-encoded lowercase. Computed by
`_hash_file(manifest_path)` at `engine/app/graph/export_bundle.py:157-162,
1129`. The manifest contains `bundle_version`, per-table SHA256s, per-
table row counts, the cohort manifest pointer, and the contract block —
so any byte change to any constituent file changes the manifest changes
the checksum. There is no second-tier checksum scheme (no per-file URL
hash, no rolling Merkle tree); the manifest hash is the bundle.

### 1.3 OPFS cache key — locked

Browser DuckDB-WASM uses `bundle_checksum` as the OPFS cache key (not
`graph_run_id`). Two consequences:

- Re-publish of identical content (rare but possible: an operator
  re-runs export with no input change) yields the same checksum and
  the browser hits cache cleanly. There is no `runId`-keyed write
  path that would invalidate identical bytes.
- A bundle-version bump (rename / dtype change) yields a new checksum
  for *every* bundle re-exported under the new schema, even if the
  raw row content is unchanged. This is the right behavior — the
  TypeScript boundary models in `features/graph/types/bundle.ts`
  must agree with the Python export's manifest before a browser will
  hydrate the new shape.

### 1.4 Asset URL pattern — locked

```
/graph-bundles/<bundle_checksum>/manifest.json
/graph-bundles/<bundle_checksum>/base_points.parquet
/graph-bundles/<bundle_checksum>/base_clusters.parquet
/graph-bundles/<bundle_checksum>/universe_points.parquet
/graph-bundles/<bundle_checksum>/paper_documents.parquet
/graph-bundles/<bundle_checksum>/cluster_exemplars.parquet
/graph-bundles/<bundle_checksum>/universe_links.parquet     # full profile only
```

Backed by `/mnt/solemd-graph/bundles/by-checksum/<bundle_checksum>/`
(symlink → `/mnt/solemd-graph/bundles/<graph_run_id>/`). See §9.

## §2 Inventory of existing pipeline

The existing `engine/app/graph/` pipeline is roughly 3 500 lines of
production Python with ~88 % reusable as-is, plus the browser-side
boot / cache layer under `features/graph/`. The table below enumerates
every component this doc depends on, the file:line range that defines
it, and whether this doc treats it as **locked** (no change),
**adapt** (small wiring change at the boundary), **delete** (per (b)),
or **new** (this doc authors it). All file paths are repository-relative.

### 2.1 Engine side (`engine/app/graph/`)

| # | Component | File:line | Status | Notes |
|---|---|---|---|---|
| 1 | Build orchestrator | `engine/app/graph/build.py:1-89, 90-200+` | **locked** | `run_graph_build()`, `publish_existing_graph_run()`, GPU-container dispatch, memory-pressure preflight. |
| 2 | Build common types | `engine/app/graph/build_common.py` | **locked** | `GraphBuildResult`, `GraphBuildSummary`, `GraphInputData`, checkpoint helpers. |
| 3 | Build inputs (warehouse reader) | `engine/app/graph/build_inputs.py` | **adapt** | The "which papers go into this build" query is the one place where the eligibility predicate lives implicitly today. §4 lifts it into `solemd.is_bundle_eligible(corpus_id)` + `bundle_eligibility_mv`. The function-call shape replaces the inlined `WHERE` clause. |
| 4 | Build stages (PCA / kNN / UMAP / HDBSCAN / scoring) | `engine/app/graph/build_stages.py`, `engine/app/graph/clusters.py`, `engine/app/graph/layout.py` | **locked** | RAPIDS / cuML / cuGraph; checkpoints to `/mnt/solemd-graph/tmp/<run_id>/`. Algorithm choice unchanged. |
| 5 | Build writes (warehouse) | `engine/app/graph/build_writes.py` | **locked** | Inserts `graph_points`, `graph_clusters`, `graph_base_points` into warehouse. Membership state lives in `graph_points` (`graph_run_id` + `corpus_id`); see (b) discussion in §0. |
| 6 | Cluster labels (LLM) | `engine/app/graph/labels.py`, `engine/app/graph/llm_labels.py` | **locked** | Modified file; algorithm unchanged for this doc. Inputs: cluster centroid + member sample; output: short label + long description. |
| 7 | Paper-evidence summary refresh | `engine/app/graph/paper_evidence.py` | **locked** | Graph-side evidence-unit summary; consumed by exports (cluster exemplars, paper documents). |
| 8 | Bundle export engine | `engine/app/graph/export_bundle.py` (1019 lines) | **adapt** | The big file. Two surgical fixes per §11: (a) `solemd.citations` → `solemd.paper_citations` rename + partition-key predicate at line ~1032 (`engine/app/graph/export_bundle.py:1032`); (b) `pa.external_ids->>'ORCID'` and `pa.affiliations[1]` rewrites at `engine/app/graph/export_bundle.py:340-342` to match the new `paper_authors` shape per `02 §4.2`. Speed-first refactor in §6 is the larger change (engine-agnostic export contract; measured choice between native-PG and DuckDB helper per table). |
| 9 | Bundle export contract validator | `engine/app/graph/export.py` | **locked** | `validate_bundle_manifest_contract()`, `bundle_contract()`. The browser TypeScript schema mirrors this. |
| 10 | Bundle finalization + checksum publish | `engine/app/graph/build_publish.py:51-102` (`_finalize_graph_run`), `engine/app/graph/export_bundle.py:165-184` (`_publish_checksum_bundle_alias`) | **adapt** | The `is_current = %s` UPDATE at line 76–87 stays for now (warehouse-side ledger field); the call to `_sync_current_corpus_membership()` at line 101 is **deleted**. (b) §11. |
| 11 | Warehouse-side membership sync | `engine/app/graph/build_publish.py:120-173, 176-214` (`_sync_current_corpus_membership`, `sync_current_graph_membership`) | **delete** | Per (b). The function and its CLI / API entry points are removed. Drop `solemd.corpus.is_in_current_map` and `is_in_current_base` columns (`02 §4.2` amendment). |
| 12 | Checkpoint paths + cleanup | `engine/app/graph/checkpoints.py` | **locked** | `/mnt/solemd-graph/tmp/<run_id>/` lifecycle; pruner runs after successful publish. |
| 13 | Build dispatch (GPU container) | `engine/app/graph/build_dispatch.py` | **locked** | Detects whether to run inline or dispatch to `graph-worker` (`--profile gpu`); host vs container topology in `00 §1`. |
| 14 | Render policy | `engine/app/graph/render_policy.py` | **locked** | Predicates that decide which points are "renderable" (drives `universe_points` filter) and which are in the base cohort (drives `base_points` filter). |
| 15 | Point projection schema | `engine/app/graph/point_projection.py` | **locked** | `POINTS_SCHEMA` PyArrow schema and the `build_point_projection_select_sql()` SQL emitter. |
| 16 | Bundle-build session settings | `engine/app/graph/build_settings.py` | **adapt** | `apply_build_session_settings()` already issues `SET LOCAL` GUCs at session start. §6.3 adds the speed-first set (parallel workers, work_mem, effective_io_concurrency). |
| 17 | Tests | `engine/test/test_graph_publish.py`, `engine/test/test_graph_build_cleanup.py` | **adapt** | Update `_sync_current_corpus_membership` deletion; bundle-contract assertions stay. |

### 2.2 Browser side (`features/graph/`)

| # | Component | File:line | Status | Notes |
|---|---|---|---|---|
| 18 | Bundle file registration (DuckDB-WASM) | `features/graph/duckdb/bundle-files.ts:1-37` | **locked** | `registerBundleTableFiles()` registers each parquet under the namespaced filename `graph-bundles/<checksum>/<file>` so DuckDB's HTTP protocol fetches them. |
| 19 | DuckDB connection / OPFS persistence | `features/graph/duckdb/connection.ts` | **locked** | OPFS-backed session; cache key derived from bundle checksum. |
| 20 | Asset URL resolution | `features/graph/lib/bundle-assets.ts` | **locked** | Maps bundle manifest entries to absolute URLs via the `/graph-bundles/<checksum>/…` pattern. |
| 21 | Bundle TypeScript boundary | `features/graph/types/bundle.ts:1-80+` | **adapt** | `GraphBundleManifest`, `GraphBundleTableManifest`, `GraphBundleProfile` etc. Cross-language coordination rule: the Python manifest in `engine/app/graph/export.py` and the TypeScript types here change together or the contract breaks. CI parity check (§11). |

Headline: **~3 500 engine lines + ~600 browser lines exist; ~88 % is
reusable as-is.** The four gaps this doc closes are (b) deletion (§11),
the eligibility-MV pattern (§4), the speed-first export pipeline (§6),
and the schema-rebuild rename / column adaptations (§11).

## §3 `graph_runs` state machine

The `solemd.graph_runs` table (`02 §4.7`) is the only run-lineage ledger
for graph builds. State transitions are explicit, gated, and SMALLINT-coded
in `db/schema/enum-codes.yaml` per `12 §4`.

### 3.1 States

| Code | Symbolic name | Meaning | Entry trigger | Exit triggers |
|---:|---|---|---|---|
| 1 | `running` | Build has started; stages may be in progress; `graph_points` / `graph_clusters` may be partially populated. | `INSERT INTO solemd.graph_runs (graph_run_id, status, ...) VALUES (uuidv7(), 1, ...)` at orchestrator start. | `→ 2 (succeeded)` on `build_writes` complete; `→ 5 (failed)` on uncaught error. |
| 2 | `succeeded` | All build stages complete; `graph_points` / `graph_clusters` / `graph_base_points` populated; bundle export not yet run. | Build orchestrator UPDATE. | `→ 3 (published)` on bundle export + manifest landed + (optionally) pointer flip; `→ 5 (failed)` if a follow-up sanity check fails. |
| 3 | `published` | Bundle exported; manifest + per-file SHA256s landed; `bundle_uri`, `bundle_checksum`, `bundle_bytes`, `bundle_manifest` populated; **and** the run is the current `active_runtime_pointer.graph_run_id` on serve. | The publish transaction (§7 step 8). | `→ 4 (retired)` when a newer published run replaces this one in the pointer (§7 step 8 + 24h `_prev` retention per `04 §3.5`). |
| 4 | `retired` | Was published; no longer the live pointer target; bundle still on disk; rollback target for at least the `_prev` window. | Replaced in `active_runtime_pointer.graph_run_id`. | Pruned from disk by retention policy (§12) once outside the rollback window. |
| 5 | `failed` | Build or export raised an uncaught error; row is terminal for this `graph_run_id`. | Error handler in `_mark_graph_run_failed()` at `engine/app/graph/build_publish.py:105-117`. | None. A retry uses a fresh `graph_run_id`. |

### 3.2 Transition gates

- **`running → succeeded`** requires:
  - All `build_writes` complete (rows in `graph_points`, `graph_clusters`,
    `graph_base_points` for this `graph_run_id`).
  - Sanity check: `point_count > 0` (per existing
    `engine/app/graph/build_publish.py:264-267`).

- **`succeeded → published`** requires (all in one publish flow per §7):
  - `export_graph_bundle()` returns successfully with non-empty
    `bundle_dir`, `bundle_checksum`, `bundle_bytes`, `bundle_manifest`.
  - `_publish_checksum_bundle_alias()` symlink created (or refreshed)
    at `/mnt/solemd-graph/bundles/by-checksum/<checksum>/`.
  - `validate_bundle_manifest_contract()` passes against the in-tree
    contract (`engine/app/graph/export.py`).
  - When `--publish-current` (operator intent to make this run live):
    the cohort flip on `solemd.active_runtime_pointer.graph_run_id`
    succeeds per `04 §3.5`. For graph-only refreshes this is a one-id
    UPDATE; for full cohort cutovers all three ids
    (`serving_run_id` + `graph_run_id` + `api_projection_run_id`) move
    in one row UPDATE.

- **`published → retired`** requires:
  - A different `graph_run_id` becomes the live pointer target.
  - The retention policy (§12) leaves the bundle on disk for at least
    the `_prev` rollback window before pruning.

- **`running → failed`** requires:
  - An uncaught exception bubbles to the orchestrator's outermost
    `try / except` at `engine/app/graph/build_publish.py:105-117`.
  - The handler UPDATEs `status = 5` and stamps `qa_summary.error`.

### 3.3 No `is_current` mirror — locked

The current `solemd.graph_runs.is_current` boolean (referenced in
`engine/app/graph/build_publish.py:62-87, 100, 187`) is the warehouse-side
mirror of `solemd.active_runtime_pointer.graph_run_id` on serve. Same
dual-write class as (b). It is **dropped** by the §11 amendment to
`02 §4.7`, and the publish transaction stops writing to it.

Read paths that previously asked "is this run live?" by SELECTing
`graph_runs WHERE is_current = true` instead read the singleton
`active_runtime_pointer.graph_run_id` from serve, or — in warehouse-only
admin contexts — derive it by joining against the latest `published`
row (`status = 3, ORDER BY published_at DESC LIMIT 1`). The pointer
on serve remains authoritative for live state.

### 3.4 Identity — locked

`graph_run_id` UUIDv7 (`02 §2`), generated by `uuidv7()` server-side at
INSERT, immutable, never recycled. Cross-cluster ref to serve enforced
in code per `04 §2.4`.

### 3.5 Ledger fields on `solemd.graph_runs`

Per `02 §4.7` plus this doc:

- `graph_run_id` UUID PK
- `status` SMALLINT (codes from §3.1; registered in `enum-codes.yaml`
  per §11)
- `built_at`, `published_at` TIMESTAMPTZ
- `bundle_uri` TEXT — filesystem path
  (`/mnt/solemd-graph/bundles/<graph_run_id>/`), **not** an HTTP URL.
  The HTTP URL is derived by the asset handler from `bundle_checksum`.
- `bundle_format` TEXT — `"parquet-manifest"` (engine-only constant
  populated by the existing finalizer at
  `engine/app/graph/build_publish.py:78-82, 91`).
- `bundle_version` TEXT — current `"4"` (`engine/app/graph/export_bundle.py:28`).
- `bundle_checksum` TEXT — SHA256 hex of `manifest.json`.
- `bundle_bytes` BIGINT — sum of bytes across manifest + parquet files.
- `bundle_manifest` JSONB — small (≪ 4 KB target) — `bundle_format` /
  `bundle_version` / `tables[]` per-file summary including row count,
  byte count, sha256, column registry, contract block.
- `qa_summary` JSONB — point count, noise count, cluster count, base
  policy version, layout backend, cluster backend, checkpoint dir,
  policy summary (`engine/app/graph/build_publish.py:299-316`).

The `is_current BOOLEAN` column is **removed**. See §3.3 + §11.

### 3.6 Worked transition example

```
T0  INSERT graph_runs (graph_run_id=u7g_001, status=1)            -- running
T1  build_writes complete; UPDATE graph_runs SET status=2          -- succeeded
T2  export_bundle returns; UPDATE graph_runs SET bundle_*          -- still succeeded
T3  --publish-current path:
    BEGIN;
      UPDATE solemd.active_runtime_pointer
         SET graph_run_id          = u7g_001,
             previous_graph_run_id = graph_run_id,
             promoted_at           = now();   -- on serve
      UPDATE solemd.graph_runs SET status = 3 WHERE graph_run_id = u7g_001;
                                                  -- on warehouse, in coordinator
                                                  -- transaction (cross-cluster
                                                  -- discipline per 04 §2.4)
    COMMIT;
T4  newer publish flips pointer; coordinator UPDATEs status=4 here.
```

Cross-cluster atomicity caveat: PG transactions don't span clusters.
The coordinator runs the serve UPDATE and the warehouse UPDATE in
sequence; if the warehouse UPDATE fails after the serve UPDATE
succeeds, the `pg_cron audit_active_runtime_pointer` job (`03 §6.5`)
detects the drift (`active_runtime_pointer.graph_run_id` names a row
that isn't `status = 3` on warehouse) and emits the audit metric for
operator repair. **locked**.

## §4 Eligibility predicate as a first-class object

Today the predicate "which papers go into the bundle" is implicit in
`engine/app/graph/build_inputs.py` queries — a chain of joins against
`solemd.papers`, `solemd.paper_text`, `solemd.corpus`, and
`solemd.paper_embeddings_graph` with inline `WHERE` filters on
`text_availability`, layout status, embedding presence, etc. That
makes it (a) impossible to cache, (b) hard to audit, (c) hard to
evolve without code edits.

Lift it into a single first-class SQL object with two parts:

### 4.1 `solemd.is_bundle_eligible(corpus_id) → boolean`

A SQL-language `STABLE PARALLEL SAFE` function that returns true if
the paper at `corpus_id` should appear in the next bundle. The function
encodes the eligibility predicate exactly once; every caller (the MV
refresh, the build_inputs query, the operator's `EXPLAIN` checks) goes
through it.

```sql
-- db/schema/warehouse/60_functions.sql
CREATE OR REPLACE FUNCTION solemd.is_bundle_eligible(p_corpus_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT
    -- Paper exists and is in mapped domain status.
    c.domain_status = 'mapped'
    -- Has graph-build embedding under the active model.
    AND EXISTS (
      SELECT 1 FROM solemd.paper_embeddings_graph e
      WHERE e.corpus_id = p_corpus_id AND e.model_key = 1   /* SPECTER2_v2 */
    )
    -- Has at least abstract-class text availability.
    AND pt.text_availability >= 1
    -- Layout-eligible per the existing build readiness rule.
    AND c.layout_status IN ('mapped', 'ready')
  FROM solemd.corpus c
  LEFT JOIN solemd.paper_text pt USING (corpus_id)
  WHERE c.corpus_id = p_corpus_id
$$;
```

The exact predicate body is **provisional** — it codifies what's
currently scattered across `build_inputs.py` and `render_policy.py`
and will be tightened against the first sample build. The locked
contract is the *function signature* and the rule that the predicate
lives nowhere else.

`STABLE` is the truthful marker here: the function reads tables, so it should
be evaluated against the calling statement's snapshot rather than advertised as
immutable forever. `PARALLEL SAFE` still lets PG 18 use the function inside
parallel workers. PostgreSQL's volatility rules explicitly discourage
table-reading `IMMUTABLE` functions because cached plans can reuse stale folded
results. Primary source:
<https://www.postgresql.org/docs/18/xfunc-volatility.html>.

### 4.2 `solemd.bundle_eligibility_mv` — materialized view

The function above is a per-row test. The bundle build wants the *set*
of eligible `corpus_id`s, refreshed periodically rather than recomputed
per build. Materialize it.

```sql
CREATE MATERIALIZED VIEW solemd.bundle_eligibility_mv
AS
SELECT c.corpus_id
FROM solemd.corpus c
WHERE solemd.is_bundle_eligible(c.corpus_id);

CREATE UNIQUE INDEX bundle_eligibility_mv_pkey
  ON solemd.bundle_eligibility_mv (corpus_id);
```

The unique index is mandatory: `REFRESH MATERIALIZED VIEW CONCURRENTLY`
requires it (PG 18 docs:
<https://www.postgresql.org/docs/18/sql-refreshmaterializedview.html>).
Concurrent refresh issues `INSERT` / `UPDATE` / `DELETE` against the
existing MV instead of taking `ACCESS EXCLUSIVE`, so the bundle build
can read the MV mid-refresh without blocking — the speed-first win.

Settings: `fillfactor = 100` (refresh-then-swap; no in-place updates),
`autovacuum_vacuum_scale_factor = 0.05` (concurrent refresh leaves dead
tuples), `parallel_workers = 8` (refresh runs in a parallel scan).

### 4.3 Refresh trigger — Dramatiq actor

```python
# engine/app/graph/eligibility_refresh.py (new)
import dramatiq
from app.db import warehouse_admin_pool

@dramatiq.actor(
    queue_name="graph",
    max_retries=2,
    time_limit=600_000,  # 10 min cap
)
async def refresh_bundle_eligibility() -> None:
    async with warehouse_admin_pool.acquire() as conn:
        await conn.execute(
            "REFRESH MATERIALIZED VIEW CONCURRENTLY solemd.bundle_eligibility_mv"
        )
```

The actor is enqueued by the same trigger that fans out the chunker:
`pg_cron` polls `solemd.ingest_runs` for newly-`published` rows on the
warehouse and enqueues `refresh_bundle_eligibility` once per ingest
window (matching the chunker actor's `05a §6` pattern). The bundle
build itself does not refresh on its own — it reads against whatever
the MV holds at the moment the build starts.

### 4.4 Refresh cadence — provisional

Default: once per `ingest_runs.published` event. With S2 monthly +
PubTator weekly, that's roughly once a week. **Provisional** — if
operator-driven bundle rebuilds outpace ingest cadence, add an explicit
operator-triggered refresh hook before the build (or allow a
`--refresh-eligibility` flag on `python -m app.graph.build`).

### 4.5 Why this is the speed-first win

The bundle build's expensive query today is
`WHERE corpus_id IN (... eligibility joins on 14 M papers ...)`. With
the MV, it becomes:

```sql
WHERE corpus_id IN (SELECT corpus_id FROM solemd.bundle_eligibility_mv)
```

PG 18 inlines the IN-against-unique-PK as a hash semi-join and the
planner prunes by partition (the MV is the outer side, MV rows are a
small percentage of total `corpus`). Empirically (per
`research-distilled §5`) this collapses a 30-60 s scan to sub-second
on a 14 M-paper warehouse.

## §5 Speed-first export pipeline

The architectural commitments below are non-negotiable for the export
lane. Each is the speed-first imperative paying off; together they hit
the §6.7 wall-clock budget.

### 5.1 Materialized view + partial indexes

Per §4. The MV pre-computes eligibility; the export query joins
against it instead of re-running the predicate. Partial indexes on
warehouse `paper_*` tables match the eligibility predicate so the
planner uses index-only paths for the per-paper rollups in
§6.4. Concrete index set lives in `02 §4.2`/§4.5/§4.7 amendments.

### 5.2 Hash-partition pruning where available

`solemd.paper_citations`, `solemd.paper_authors` (if partitioned —
`02 §4.2` provisional) are hash-partitioned on `corpus_id` (or
`citing_corpus_id` for citations) × 32 per `02 §0.6, §3.1`.
`paper_evidence_units` stays unpartitioned day one per `02 §4.5`; bundle
queries should therefore rely on direct keyed lookups there until the
documented row-count trigger for later partitioning is crossed. For partitioned
families, show the planner pruning by selecting on the hash key:

```sql
-- Bundle query; planner prunes to relevant partitions
SELECT pa.corpus_id, pa.author_position, pa.name, pa.affiliation_text, pa.orcid
FROM solemd.paper_authors pa
JOIN solemd.bundle_eligibility_mv mv USING (corpus_id);
-- Plan: Append → 32× Index Scan using paper_authors_pNN_corpus_id_idx
```

If `paper_authors` ends up unpartitioned (per `02 §4.2` provisional),
the same pattern applies via the corpus-id PK btree — the speed-first
win comes from the eligibility MV being the outer side of the join.

### 5.3 Covering indexes (`INCLUDE`) on bundle-output columns

The current rollups in `engine/app/graph/export_bundle.py:332-411`
(`author_rollup`, `asset_rollup`, `entity_rollup`, `relation_rollup`)
read 4–6 columns per paper. `INCLUDE` indexes let those reads stay
index-only:

```sql
CREATE INDEX idx_paper_authors_export_cover
  ON solemd.paper_authors (corpus_id)
  INCLUDE (author_position, name, affiliation_text, orcid);

CREATE INDEX idx_paper_assets_export_cover
  ON solemd.paper_assets (corpus_id)
  INCLUDE (asset_kind, remote_url, access_status, license);
```

PG 18 covering-index docs:
<https://www.postgresql.org/docs/18/indexes-index-only-scans.html>.
Visibility-map coverage matters; the warehouse autovacuum tuning per
`09 §3` keeps the VM warm enough on these tables for index-only
scans to fire reliably.

Index landings are in §11 / `02 §4.2` amendments. **provisional** —
the exact `INCLUDE` columns lock after the §6.7 first wall-clock
measurement.

### 5.4 Parallel aggregation

The bundle build runs in its own warehouse session; per-session GUCs
unlock the planner's parallel aggregate path:

```sql
SET LOCAL max_parallel_workers_per_gather = 8;
SET LOCAL parallel_setup_cost = 0;
SET LOCAL parallel_tuple_cost = 0;
SET LOCAL work_mem = '512MB';
SET LOCAL effective_io_concurrency = 256;
SET LOCAL maintenance_work_mem = '4GB';
```

Issued by `apply_build_session_settings()` at
`engine/app/graph/build_settings.py` (existing entry point;
**adapt** to add the speed-first set). Cluster-wide values stay at the
`09 §3` warehouse posture; the bundle build session bumps the parallel
caps inside its own connection. **provisional** for exact values until
the §6.7 measurement.

### 5.5 Export toolkit — DuckDB `TYPE postgres` first, native-PG exception path

DuckDB's current PostgreSQL docs still expose both `TYPE postgres` and
`TYPE postgres_scanner`; this project standardizes on `TYPE postgres`
for new work. The current docs explicitly support reading PostgreSQL
tables directly and writing attached PostgreSQL data out to Parquet via
DuckDB's `COPY ... TO` writer. Primary sources:
<https://duckdb.org/docs/current/core_extensions/postgres> and
<https://duckdb.org/docs/current/sql/statements/copy>.

For this rebuild, the toolkit choice is closed and the execution mode
remains table-shape dependent:

- DuckDB attached to PostgreSQL + native DuckDB Parquet writer
- native PostgreSQL row producer + external Parquet writer as a bounded
  fallback where semantics or benchmark results justify it

For a clean-slate rebuild, keep PostgreSQL as the canonical schema and
SQL authority. The export engine is a separate decision:

- use DuckDB `TYPE postgres` as the standard server-side export bridge
  from PostgreSQL into Parquet-oriented bundle jobs
- keep the native PostgreSQL row-producer path as the exception path
  where the query shape is already efficient or PostgreSQL-specific
  semantics are worth preserving directly

This is a speed-first implementation choice, not a change in data
authority and not a reason to pull DuckDB into the warehouse or point-
generation stages.

Recommended path:

```python
# engine/app/graph/export_bundle.py — new path inside _export_single_table()
import duckdb

con = duckdb.connect()
con.execute("INSTALL postgres; LOAD postgres;")
con.execute(
    "ATTACH '' AS wh (TYPE postgres, READ_ONLY)"
)
con.execute(
    f"COPY ({rewritten_sql}) TO '{output_path}' "
    f"(FORMAT PARQUET, COMPRESSION ZSTD, COMPRESSION_LEVEL 3, "
    f"ROW_GROUP_SIZE {PARQUET_ROW_GROUP_SIZE})"
)
```

`rewritten_sql` references `wh.solemd.paper_*` (the attached PG schema
namespace) so DuckDB pulls the rows over the wire and applies its own
GROUP BY / window / aggregate. `COPY ... TO ... (FORMAT PARQUET, ...)`
writes the result directly without a Python intermediate.

Credential handling should follow the DuckDB docs' safer surfaces:
environment variables or DuckDB secrets, not a raw connection string
embedded in the SQL text. This fits the repo-wide `1Password CLI +
direnv` posture and avoids leaking credentials in error output.

Where plan determinism matters more than federated convenience, prefer
DuckDB's explicit `postgres_query('wh', 'SELECT ...')` table function or
a short-lived staged DuckDB table over relying on implicit pushdown.
Current DuckDB settings still label PostgreSQL filter pushdown as
experimental, so this doc does **not** assume the optimizer will always
pick the best hybrid plan for every bundle query.

**Recommendation: lock DuckDB's `postgres` extension as the standard
bundle-export toolkit, and choose the execution mode per table shape.**
The existing pyarrow + native-PG path
(`_write_query_to_parquet_copy()` / `_write_query_to_parquet()` at
`engine/app/graph/export_bundle.py:492-`) remains first-class. The
first 1 M-paper measurement chooses the default path **per table**,
not by preserving today's implementation wholesale and not by forcing
the same execution mode onto every table.

Use the three-mode split below:

| Mode | Use it for | Avoid it for |
|---|---|---|
| **A. Direct DuckDB SQL over attached PG tables** | Wide scan-heavy exports, large GROUP BY / window / aggregate rollups, and tables where DuckDB's vectorized execution plus direct Parquet write are likely to win. | Query shapes that depend on PostgreSQL-specific behavior, delicate planner choices, or semantics you do not want to translate into DuckDB SQL. |
| **B. `postgres_query('wh', 'SELECT …')` then DuckDB `COPY ... TO PARQUET`** | Complex PostgreSQL-authored queries, `LATERAL`-heavy shapes, PG-specific functions/operators, and cases where deterministic server-side semantics matter more than DuckDB-side execution. | Queries where the real win comes from DuckDB doing the aggregation work itself. |
| **C. Stage into a temporary DuckDB table, then `COPY`** | Expensive intermediates reused across multiple output files, type-normalization before write, or cases where several bundle tables share one extracted working set. | One-shot exports where the extra staging write just adds IO and latency. |

For SoleMD.Graph, the clean default is:

- start `base_points`, `universe_points`, and other scan-heavy
  projection tables in **Mode A**
- start `paper_documents` or any PG-specific / `LATERAL`-heavy export
  in **Mode B**
- use **Mode C** only where multiple bundle files share the same costly
  intermediate and the extra materialization repays itself

This keeps DuckDB where it helps most: as a fast Parquet-producing
export helper and as the mandatory browser/runtime reader, not as an
automatic dependency of the warehouse or graph-build stages.

Operational caveats to encode in the implementation:

- keep the PostgreSQL attach **READ_ONLY**
- treat `pg_experimental_filter_pushdown` as a bonus, not a contract
- set `pg_connection_limit` deliberately for bundle builds instead of
  inheriting DuckDB's very wide default blindly
- clear the DuckDB PostgreSQL schema cache (`pg_clear_cache()`) after
  warehouse schema changes during rebuild/dev if attached metadata goes
  stale

This is **provisional** until benchmarked: if the simple PostgreSQL-row-
producer path already beats the §6.7 wall-clock budget on a 1 M-paper
bundle for a given table, keep that table on the native-PG path and do
not force DuckDB into the hot loop just because it is newer. The §6.7
measurement is the gate. **provisional**.

### 5.6 DuckDB parquet writer settings — provisional

When DuckDB writes parquet (whether via the DuckDB `TYPE postgres` path
or direct), the current project defaults remain:

- `COMPRESSION ZSTD` with `COMPRESSION_LEVEL 3`.
- `ROW_GROUP_SIZE 122_880` rows, matching the existing
  `PARQUET_ROW_GROUP_SIZE` constant at
  `engine/app/graph/export_bundle.py:29`.

Those values are inherited from the existing pipeline and are reasonable
starting points, but they are still sample-build-gated tuning, not a
universal DuckDB guarantee about the best browser/runtime setting. Keep
them provisional until the first real bundle build confirms they beat
nearby settings on wall-clock and browser scan behavior.

Browser caveat: DuckDB-WASM remote parquet fetches ride the browser HTTP
stack and CORS policy rather than native server-side `httpfs`
semantics. Bundle URL design still has to respect the browser boundary
described in §10.

### 5.7 Wall-clock budget — provisional

For a typical bundle of ~1 M papers on the 68 GB host, end-to-end
budget breakdown (provisional):

| Stage | Budget |
|---|---:|
| `build_inputs` (eligibility scan + checkpoint hydrate) | ≤ 60 s |
| `build_stages` (PCA + kNN + UMAP + HDBSCAN + scoring) | 30–120 min (GPU-bound; not in the export budget) |
| `build_writes` (insert into `graph_points` / `graph_clusters`) | ≤ 60 s |
| `export` (the §5/§6 lane) | **≤ 5 min on 1 M-paper bundle, ≤ 10 min on 5 M, ≤ 30 min on 14 M** |
| `publish` (manifest + checksum + symlink + pointer flip) | ≤ 5 s |

The export budget is the speed-first commitment and the headline
observability metric (§13). On 128 GB host, the export budget is
proportionally tighter (roughly half). **provisional** until the
first sample build measures actual wall-clock.

## §6 Build → publish flow

End-to-end orchestrator-level flow. The CLI invocation is unchanged:
`python -m app.graph.build [--rebuild] [--publish-current]` (existing
entry point at `engine/app/graph/build.py`). Steady-state operator
trigger goes through Dramatiq actor `bundle.build_and_publish`
(new sibling of the existing `engine/app/graph/build.py:run_graph_build()`
function; reuses the orchestrator).

### 6.1 Stage 1 — build_inputs (eligibility-MV consumer)

Reads `solemd.bundle_eligibility_mv` to get the candidate set; pulls
the SPECTER2 embeddings for those `corpus_id`s; checkpoints the
embedding memmap to `/mnt/solemd-graph/tmp/<run_id>/embeddings.npy`.

Speed-first win: the input set comes from the MV in O(MV-size), not
from re-evaluating the predicate. If the MV is empty or stale (an
operator skipped the refresh), the orchestrator logs a structured
warning and proceeds with whatever the MV holds.

### 6.2 Stage 2 — build_stages (RAPIDS, GPU)

PCA → kNN → UMAP → HDBSCAN → scoring. Checkpoints to
`/mnt/solemd-graph/tmp/<run_id>/{layout_matrix,knn,clusters,scores}.npz`.
This stage is GPU-bound and out of scope for this doc; the existing
`build_stages.py` is locked as canon.

### 6.3 Stage 3 — build_writes (warehouse insert)

Inserts `graph_points`, `graph_clusters`, `graph_base_points` into
warehouse keyed by the new `graph_run_id`. Existing
`engine/app/graph/build_writes.py` is locked. UPDATE
`solemd.graph_runs SET status = 2 (succeeded)`.

### 6.4 Stage 4 — export_bundle (the speed-first export)

Runs the speed-first export per §5. Per-table flow inside
`engine/app/graph/export_bundle.py` (adapted):

1. `apply_build_session_settings()` issues §5.4 GUCs.
2. Materialize `solemd._tmp_export_paper_base` (existing pattern at
   `engine/app/graph/export_bundle.py:_materialize_export_views`),
   joined against `solemd.bundle_eligibility_mv` instead of the inline
   eligibility predicate. **adapt**.
3. For each table spec in `_materialized_table_specs(bundle_profile)`
   (`engine/app/graph/export_bundle.py:840-1047`):
   - **Candidate accelerated path** (§5.5): DuckDB `TYPE postgres`.
     DuckDB writes parquet directly with §5.6 settings.
   - **Fallback path**: existing `_write_query_to_parquet_copy()` /
     `_write_query_to_parquet()` (`engine/app/graph/export_bundle.py:492-`).
4. Per-file SHA256 computed by `_hash_file()` (`engine/app/graph/export_bundle.py:157-162`).
5. `_cleanup_export_views()` drops the temp tables.

Parallelism: `ThreadPoolExecutor(max_workers=EXPORT_WORKERS)`
(`engine/app/graph/export_bundle.py:1103-1111`). One PG connection
per worker thread; speed-first win is parallel I/O across the 5 (or
6, with `universe_links`) bundle tables, capped by the warehouse
connection pool.

### 6.5 Stage 5 — checksum + manifest assembly

`manifest.json` written to `/mnt/solemd-graph/bundles/<graph_run_id>/`
with the BundleManifest schema (`engine/app/graph/export_bundle.py:1115-1128`).
SHA256 of the manifest computed by `_hash_file(manifest_path)` is the
`bundle_checksum`. `validate_bundle_manifest_contract()` enforces the
contract block matches the in-tree TypeScript expectations.

### 6.6 Stage 6 — checksum-addressed symlink

`_publish_checksum_bundle_alias()` at `engine/app/graph/export_bundle.py:165-184`
creates (or refreshes) the symlink:

```
/mnt/solemd-graph/bundles/by-checksum/<bundle_checksum>/
  → ../<graph_run_id>/
```

Idempotent: if the symlink already points at the same directory, it's
left alone; if it points elsewhere or is stale, it's recreated.

### 6.7 Stage 7 — `graph_runs` finalize

Single UPDATE on `solemd.graph_runs` (warehouse) populating
`bundle_*` fields and setting `status` per §3.1. **No call to
`_sync_current_corpus_membership()`**; the function is deleted per (b).

```sql
UPDATE solemd.graph_runs
   SET status         = CASE WHEN $publish_current THEN 3 ELSE 2 END,
       bundle_uri     = $bundle_dir,
       bundle_format  = 'parquet-manifest',
       bundle_version = $bundle_version,
       bundle_checksum= $bundle_checksum,
       bundle_bytes   = $bundle_bytes,
       bundle_manifest= $bundle_manifest_jsonb,
       qa_summary     = $qa_summary_jsonb,
       updated_at     = now(),
       completed_at   = now()
 WHERE graph_run_id   = $graph_run_id;
```

### 6.8 Stage 8 — pointer flip (only when `--publish-current`)

The publish step crosses the cluster boundary. The coordinator runs
the serve UPDATE per `04 §3.5` and the warehouse `status = 3` UPDATE
in sequence on the worker's two pools (`admin` for serve via direct
connection bypass per `04 §4`; warehouse-direct for warehouse).

```python
# pseudocode, publish coordinator
async with admin_pool.acquire() as serve_admin, \
           warehouse_admin_pool.acquire() as wh_admin:
    async with serve_admin.transaction():
        await serve_admin.execute(
            """
            UPDATE solemd.active_runtime_pointer
               SET graph_run_id          = $1,
                   previous_graph_run_id = graph_run_id,
                   promoted_at           = now(),
                   promoted_by           = 'graph-publish'
             WHERE singleton_key = true
            """,
            new_graph_run_id,
        )
    # serve commit done; now mark warehouse status=3
    async with wh_admin.transaction():
        await wh_admin.execute(
            "UPDATE solemd.graph_runs SET status = 3, published_at = now() "
            "WHERE graph_run_id = $1",
            new_graph_run_id,
        )
```

For full cohort cutovers the serve UPDATE is the multi-id form per
`04 §3.5` (graph + serving + projection move together in one row
UPDATE); the warehouse-side `status = 3` UPDATE is unchanged. The
`pg_cron` `audit_active_runtime_pointer` job (`03 §6.5`) detects the
narrow cross-cluster failure mode (serve advanced, warehouse
`status` didn't catch up). **locked**.

## §7 Cohort coordination — independent build, joint promotion

Two cadences, one promotion contract.

### 7.1 Independent build cadence

A graph build run is expensive: PCA + UMAP on 14 M points with
SPECTER2 embeddings is GPU-minutes-to-hours. It runs:

- On operator demand (`python -m app.graph.build`).
- On Dramatiq schedule (`bundle.build_and_publish` actor enqueued by
  `pg_cron` daily / weekly per operator preference).
- Never as part of the projection or serving cutover path itself.

Each build produces a new `graph_run_id` and a new bundle directory.
Multiple `succeeded` runs may exist in `solemd.graph_runs` at any time
without any of them being `published` — they're staged, not live.

### 7.2 Joint promotion contract

Promotion (the `--publish-current` path or the equivalent Dramatiq
actor flag) is one row UPDATE on `solemd.active_runtime_pointer`
per `04 §3.5`. Two shapes:

- **Graph-only refresh.** Bundle was rebuilt with a newer base policy
  / model / parameter set, but no API or OpenSearch change. The
  UPDATE moves only `graph_run_id`:

  ```sql
  UPDATE solemd.active_runtime_pointer
     SET graph_run_id          = $new_graph_run,
         previous_graph_run_id = graph_run_id,
         promoted_at           = now();
  ```

- **Full cohort cutover.** Bundle is part of a larger serving
  cutover (`04 §3.5`). The UPDATE moves all three:

  ```sql
  UPDATE solemd.active_runtime_pointer
     SET serving_run_id                 = $new_serving_run,
         graph_run_id                   = $new_graph_run,
         api_projection_run_id          = $new_api_projection_run,
         previous_serving_run_id        = serving_run_id,
         previous_graph_run_id          = graph_run_id,
         previous_api_projection_run_id = api_projection_run_id,
         promoted_at                    = now();
  ```

In both shapes the three-id row stays consistent by construction
(`03 §2`, `04 §3.5`). The graph build cadence is independent of the
serving cutover cadence; the *promotion choice* (graph-only vs full
cohort) lives on the `cohort_manifest.pointer_flip_mode` per
`04 §5.1` for full cutovers, or on the operator's `--publish-current`
flag for graph-only refreshes.

The cohort manifest (`04 §5.1`) already carries `graph_run_id`. When
the projection coordinator assembles a full cohort, it picks the
latest `succeeded` graph run for the cohort's source watermark — the
graph build cadence and the cohort-build cadence don't have to align,
they just have to overlap. **locked**.

### 7.3 Reconciling with prior recon language

An earlier informal recon described build and promotion as
"independent." That's half-right — independent in *cadence*, joint at
*the live read* via the singleton pointer. There is no scenario where
serving and graph drift apart in a request the engine API serves. Cite
`03 §2` and `04 §3.5` for the pointer atomicity contract.

## §8 Build vs publish: the operator's mental model

| Action | What happens | What changes on disk | What changes in PG | Reversible? |
|---|---|---|---|---|
| `python -m app.graph.build` (no `--publish-current`) | Full pipeline runs through stages 1–7 above. | New `/mnt/solemd-graph/bundles/<graph_run_id>/` directory; new `by-checksum/<hash>/` symlink. | New `solemd.graph_runs` row with `status = 2` (or `3` if combined with publish). | Yes — bundle is staged, not live. Delete the directory + the row to undo. |
| `python -m app.graph.build --publish-current` | Same plus stage 8 cross-cluster pointer flip. | Same as above. | `solemd.graph_runs.status = 3` for new run; `active_runtime_pointer.graph_run_id = new`; `previous_graph_run_id = old`. | Yes — single UPDATE on the pointer reverts to `previous_graph_run_id`. Old run goes back to `status = 3`; new run becomes `status = 4`. |
| `python -m app.graph.publish_existing --graph-run-id X --publish-current` | Stage 7 + 8 only on an already-`succeeded` run. | None. | Same as the `--publish-current` row of stage 8 above. | Yes — same pointer rollback path. |

Bundle build wall-clock = stages 1–7. Publish wall-clock ≈ 5 ms
(one row UPDATE on serve + one row UPDATE on warehouse).

## §9 Asset-serving contract

The browser fetches bundles through the Next.js asset handler at
`/graph-bundles/<bundle_checksum>/<file>`. The handler is preserved
from the existing implementation; this section locks the contract.

### 9.1 URL pattern

```
/graph-bundles/<bundle_checksum>/manifest.json
/graph-bundles/<bundle_checksum>/<table>.parquet
```

### 9.2 Backend resolution

Reads from `/mnt/solemd-graph/bundles/by-checksum/<bundle_checksum>/`,
following the symlink to the run directory. The handler returns 404
if the checksum directory doesn't exist; the browser treats 404 as a
fatal bundle-load error (does not fall back to a different bundle).

### 9.3 Cache headers

```
Cache-Control: public, max-age=31536000, immutable
Content-Type: application/json   # for manifest.json
Content-Type: application/octet-stream   # for *.parquet
ETag: "<bundle_checksum>:<filename>"
```

`immutable` is correct because a checksum-addressed URL never changes
content. `max-age=31536000` (1 year) is the recommended Next.js
immutable-asset value
(<https://nextjs.org/docs/app/api-reference/next-config-js/headers>).

### 9.4 Disaster fallback

If the symlink at `/mnt/solemd-graph/bundles/by-checksum/<hash>/` is
missing but `solemd.graph_runs.bundle_checksum = <hash>` matches a row
with a valid `bundle_uri`, the handler may fall back to reading from
the run directory directly and emit a structured operator alert. This
is a **deferred** capability — today the symlink is the only resolution
path, and a missing symlink is treated as a hard 404. Trigger to
implement: a real production incident where the symlink got pruned but
the run directory survived.

### 9.5 Browser-side ergonomics

The browser builds asset URLs from `bundle.tableUrls[tableName]` and
`bundle.manifestUrl` (`features/graph/types/bundle.ts:55-69`). Those
are populated server-side from the bundle manifest plus the asset-
handler base URL; the browser never builds URLs from a bundle
checksum directly.

## §10 DuckDB-WASM browser contract

The browser's bundle-bootstrap path is owned by `features/graph/`. This
section locks the contract the engine-side export must satisfy; the
browser-side rendering is owned by `.claude/skills/cosmograph/SKILL.md`.

### 10.1 Bootstrap sequence

1. The `useGraphBundle()` hook (or its server-side equivalent) fetches
   `manifest.json` for the active bundle. The `bundle_checksum` is
   the URL's path segment.
2. The browser extracts `bundle_version`, `tables[]`, and `contract`
   from the manifest. If `bundle_version` doesn't match the
   TypeScript-side `EXPECTED_BUNDLE_VERSION` constant, the browser
   refuses to hydrate and shows a "bundle schema mismatch — refresh
   page" message. (Cross-language coordination is a hard contract;
   see §11.)
3. For each table in `tables[]`, the browser registers the file URL
   with DuckDB-WASM via
   `db.registerFileURL(getRegisteredBundleTableFileName(...), …, HTTP, false)`
   per `features/graph/duckdb/bundle-files.ts:19-36`. The local
   filename is `graph-bundles/<checksum>/<file>`.
4. DuckDB queries reference the registered files via
   `read_parquet('graph-bundles/<checksum>/<file>')`. DuckDB streams
   row groups over HTTP range requests; the parquet's per-column
   statistics enable predicate pushdown (`WHERE cluster_id = $1`
   skips most row groups).

### 10.2 OPFS cache

DuckDB-WASM's OPFS persistence stores the registered file URLs and
their fetched bytes keyed by the registered filename. Because the
registered filename includes `<bundle_checksum>`, two consequences:

- **Same content, same key.** A re-publish of identical bytes (same
  checksum) hits OPFS cleanly.
- **New bundle, new key.** Any change to any constituent file changes
  the manifest changes the checksum changes the OPFS key, so the new
  bundle's parquets fetch fresh. There is no stale-cache hazard.

OPFS storage docs:
<https://github.com/duckdb/duckdb-wasm#opfs-support>. **locked**.

### 10.3 Lazy loading

- `base_points.parquet` + `base_clusters.parquet` are loaded on first
  paint (the core 100K–500K base cohort the user sees first).
- `universe_points.parquet` + `paper_documents.parquet` are loaded on
  demand (when the user pans / zooms outside the base cohort, or
  selects a paper for detail).
- `cluster_exemplars.parquet` is loaded with cluster-panel hydration.
- `universe_links.parquet` (full profile only) loads when the user
  toggles the citation-link view.

The lazy split is owned by `features/graph/duckdb/connection.ts` and
the sequence in `features/graph/duckdb/`. This doc declares the
bundle table set; the browser owns the order.

### 10.4 Hot-table view

DuckDB views built on top of registered parquets give the rest of
the UI a stable query surface that doesn't change when the active
bundle changes:

```sql
CREATE OR REPLACE VIEW v_base_points AS
  SELECT * FROM read_parquet('graph-bundles/<checksum>/base_points.parquet');
```

Views are recreated when the active bundle's checksum changes
(handled in `features/graph/duckdb/connection.ts`). Cosmograph's
data props bind to the views, not to the parquet URLs directly.

### 10.5 Cross-language coordination

The Python manifest (`engine/app/graph/export.py:bundle_contract()`)
and the TypeScript types (`features/graph/types/bundle.ts`) must
agree on column names, dtypes, table set, and `bundle_version`. The
contract is enforced by:

- `validate_bundle_manifest_contract()` on the Python side
  (`engine/app/graph/export_bundle.py:1131`) at every export.
- `EXPECTED_BUNDLE_VERSION` constant on the TypeScript side checked
  at bundle bootstrap.
- A CI parity check (new — §11) that fails if Python's
  `bundle_contract()` and TypeScript's `GraphBundleContract` disagree.

The CI check is **deferred** until the §11 schema migration lands;
today the cross-language contract is enforced manually at PR review.
**provisional** for the implementation; **locked** for the rule that
the two must agree.

## §11 Schema-rebuild implementation steps

The surgical fixes that take the existing engine code inventory from
"wired against the pre-rebuild warehouse schema" to "wired against the
target schema defined by `02 §4.2` post-amendment". This section is
implementation guidance for the rebuild, not an attempt to preserve the
old migration chain as authority. All amendments land in `12 §9` ledger
rows.

### 11.1 Code changes — `engine/app/graph/`

1. `engine/app/graph/build_publish.py:101, 120-173, 176-214` —
   **delete** `_sync_current_corpus_membership()` and
   `sync_current_graph_membership()` and the call site at line 101.
   Per (b).
2. `engine/app/graph/build_publish.py:62-87` — remove the
   `is_current = false`/`is_current = %s` UPDATEs (the `is_current`
   column is dropped per §11.4 below).
3. `engine/app/graph/build_publish.py:17-48` — `load_graph_build_summary()`
   reads `c.is_in_current_map` / `c.is_in_current_base` (lines 23–26).
   **Replace** with reads against `solemd.bundle_eligibility_mv` (count
   of eligible papers) and against `solemd.graph_points` joined to the
   currently-published `graph_run_id` (count of currently-base / mapped
   points).
4. `engine/app/graph/export_bundle.py:1032` — rename `solemd.citations c`
   to `solemd.paper_citations c`. Add an explicit hash-key predicate
   so the planner prunes (the partition key is `citing_corpus_id` per
   `02 §3.1`):

   ```sql
   FROM solemd.paper_citations c
   JOIN render_points src ON src.corpus_id = c.citing_corpus_id
   JOIN render_points dst ON dst.corpus_id = c.cited_corpus_id
   WHERE c.source_release_id IS NOT NULL  -- planner hint, harmless
   ```
5. `engine/app/graph/export_bundle.py:340-342` — replace
   `pa.external_ids->>'ORCID'` and `pa.affiliations[1]` with the new
   `paper_authors` columns from `02 §4.2`. Concrete shape pending the
   `paper_authors` schema lock; if `02 §4.2` ends up using
   `pa.orcid TEXT` and `pa.affiliation_text TEXT` directly, the rewrite
   is mechanical:

   ```sql
   jsonb_build_object(
     'name', pa.name,
     'orcid', pa.orcid,
     'affiliation', pa.affiliation_text
   )
   ```
6. `engine/app/graph/build_inputs.py` — eligibility predicate becomes
   `WHERE corpus_id IN (SELECT corpus_id FROM solemd.bundle_eligibility_mv)`
   per §4.5.
7. `engine/app/graph/build_settings.py:apply_build_session_settings()`
   — append the §5.4 speed-first GUC set.
8. `engine/test/test_graph_publish.py` — update fixtures: drop the
   `is_current` and `is_in_current_*` assertions; add an
   `active_runtime_pointer.graph_run_id` flip assertion.

### 11.2 New SQL objects

- `solemd.is_bundle_eligible(corpus_id BIGINT) → BOOLEAN` per §4.1
  (`12 §9` ledger row).
- `solemd.bundle_eligibility_mv` materialized view per §4.2
  (`12 §9` ledger row).
- Unique index `bundle_eligibility_mv_pkey` on
  `solemd.bundle_eligibility_mv (corpus_id)` (required for
  `REFRESH MATERIALIZED VIEW CONCURRENTLY`).
- `INCLUDE` covering indexes per §5.3 on `solemd.paper_authors` and
  `solemd.paper_assets`.

### 11.3 New role grant

`engine_warehouse_admin` (per `06 §7` and the `11` upstream amendment)
gets `REFRESH MATERIALIZED VIEW` permission on
`solemd.bundle_eligibility_mv`:

```sql
GRANT REFRESH ON MATERIALIZED VIEW solemd.bundle_eligibility_mv
  TO engine_warehouse_admin;
```

(`06 §7` upstream amendment — note in §16 below.)

### 11.4 Column drops (warehouse — `02 §4.2`/§4.7 amendments)

- `ALTER TABLE solemd.corpus DROP COLUMN is_in_current_map;`
- `ALTER TABLE solemd.corpus DROP COLUMN is_in_current_base;`
- `ALTER TABLE solemd.graph_runs DROP COLUMN is_current;` (if present)

The corresponding indexes on these columns are also dropped.

### 11.5 Enum registry (`12 §4`)

Add `graph_run_status` enum to `db/schema/enum-codes.yaml`:

```yaml
graph_run_status:
  description: Lifecycle of one solemd.graph_runs row. See docs/rag/05b-graph-bundles.md §3.
  applies_to:
    - solemd.graph_runs.status
  codes:
    running:   1
    succeeded: 2
    published: 3
    retired:   4
    failed:    5
```

The generator (`12 §4`) emits the matching `IntEnum` in
`engine/app/models/shared/enums.py` and the `COMMENT ON COLUMN
solemd.graph_runs.status` in SQL.

### 11.6 CI parity check (cross-language)

A new check in CI runs both:

1. Python: `python -m engine.app.graph.export --emit-contract-json` →
   write the canonical contract JSON.
2. TypeScript: `npx tsc features/graph/types/bundle.ts --emit-declaration-only`
   → derive the expected contract shape.
3. Diff. Fail CI on drift.

**deferred** for the implementation; the rule (the two must agree) is
**locked** in §10.5.

## §12 Failure modes & retention

### 12.1 Build fails mid-stage (stages 1–3)

`graph_runs.status = 1 (running)` initially; the orchestrator's
exception handler UPDATEs to `5 (failed)` per
`engine/app/graph/build_publish.py:105-117`. Checkpoints in
`/mnt/solemd-graph/tmp/<run_id>/` survive, allowing operator inspection
and (in dev) resume from the failed stage. Production retry uses a
fresh `graph_run_id`. **locked**.

### 12.2 Build succeeds but export fails (stages 4–6)

`graph_runs.status = 2 (succeeded)` (the build_writes were complete);
`bundle_*` fields are NULL. Operator can re-run export-only via
`python -m app.graph.publish_existing --graph-run-id X` (existing entry
point at `engine/app/graph/build_publish.py:217-325`, `publish_existing_graph_run()`).
The existing run row is reused; bundle directory is recreated. **locked**.

### 12.3 Export succeeds but publish fails (stage 8)

Bundle on disk; `bundle_*` populated; `graph_runs.status = 2`. The
serve UPDATE on `active_runtime_pointer.graph_run_id` failed. Operator
retries via `python -m app.graph.publish_existing --graph-run-id X
--publish-current`. The pointer UPDATE is idempotent against itself
(same `graph_run_id` → no-op). **locked**.

### 12.4 Cross-cluster drift (rare)

Serve UPDATE succeeded, warehouse `status = 3` UPDATE failed. The
`pg_cron` `audit_active_runtime_pointer` job (`03 §6.5`) detects:
"`active_runtime_pointer.graph_run_id` names a run that isn't
`status = 3` on warehouse." Emits an alert metric per §13. Operator
manually UPDATEs `status = 3` on warehouse to repair. **locked**.

### 12.5 Bundle file corruption

Per-file SHA256 in the manifest catches it. The browser-side
DuckDB-WASM does not currently verify SHA256 (HTTP TLS is the wire
integrity); however, a `pg_cron` `bundle_integrity_audit` job
(deferred) re-hashes published bundles weekly and alerts on mismatch.
**deferred**.

### 12.6 Retention

- Keep N most recent **published** bundles on disk (default `N = 5`,
  provisional). Older `published` rows transition to `retired` when
  pruned; the bundle directory and its `by-checksum` symlink are
  deleted by a daily `bundle_pruner` Dramatiq actor.
- Never delete a bundle that is the current
  `active_runtime_pointer.graph_run_id` *or* its
  `previous_graph_run_id` (the 24 h `_prev` rollback target per
  `04 §3.5`).
- `failed` and `succeeded` (never-published) bundles older than 7
  days are pruned by the same actor. Operator can override via a
  manifest (deferred).

Pruning policy is **provisional** until first month of operation.

## §13 Observability hooks

This document does not design dashboards (`10-observability.md` does).
It declares the requirements that `10` must surface for the bundle
lane.

### 13.1 Required Prometheus metrics

| Metric | Type | Labels | Purpose |
|---|---|---|---|
| `bundle_build_duration_seconds` | histogram | `stage` ∈ {`build_inputs`, `build_stages`, `build_writes`, `export`, `publish`} | Per-stage wall-clock. SLO: p95 of `export` ≤ 300 s on 1 M-paper bundles. |
| `bundle_export_table_duration_seconds` | histogram | `table`, `engine` ∈ {`pg_native`, `duckdb_postgres`} | Per-table export wall-clock split by which engine wrote it. Drives the §5.5 go/no-go for DuckDB-on-PG. |
| `bundle_size_bytes` | gauge | `table`, `bundle_checksum` | Per-parquet byte count in the latest published bundle. |
| `bundle_eligibility_count` | gauge | (none) | `SELECT count(*) FROM solemd.bundle_eligibility_mv`. Drift indicator for ingest cadence. |
| `bundle_eligibility_refresh_duration_seconds` | histogram | (none) | `REFRESH MATERIALIZED VIEW CONCURRENTLY` wall-clock. |
| `bundle_publish_total` | counter | `outcome` ∈ {`success`, `failed`, `aborted`} | Publish attempts. |
| `bundle_pointer_drift_total` | counter | (none) | Hits from the `audit_active_runtime_pointer` job. |
| `bundle_load_duration_ms` | histogram | `table`, `cache_outcome` ∈ {`opfs_hit`, `opfs_miss`, `cold`} | Browser-side; emitted from `features/graph/duckdb/`. |

### 13.2 Required structured log events

Engine-side (jsonlog format per PG 18; `research-distilled §7`):

- `bundle.build.started` — `graph_run_id`, `bundle_profile`, `eligibility_count`.
- `bundle.stage.completed` — `graph_run_id`, `stage`, `duration_ms`, `rows_written`.
- `bundle.export.table_completed` — `graph_run_id`, `table`, `engine`,
  `duration_ms`, `rows`, `bytes`, `sha256`.
- `bundle.publish.flipped_pointer` — `graph_run_id`,
  `previous_graph_run_id`, `pointer_flip_mode`.
- `bundle.publish.failed` — `graph_run_id`, `stage`, `error_class`,
  `error_message`.
- `bundle.retention.pruned` — `graph_run_id`, `bundle_checksum`,
  `bytes_freed`.

### 13.3 Wall-clock budget alert

`bundle_build_duration_seconds{stage="export"} > 600` for the most-
recent build → warn. `> 1800` → page. Tuned in
`10 §13` per the §11 amendment.

## Cross-cutting invariants

Beyond the references to `02 §5`, `03 §5`, and `04`'s invariants, the
bundle lane enforces:

1. **No warehouse write at publish.** Per (b). `_finalize_graph_run()`
   writes only to `solemd.graph_runs`; `active_runtime_pointer` lives
   on serve. `solemd.corpus` is descriptive-only.
2. **`graph_run_id` immutable, never recycled.** UUIDv7. Cross-cluster
   refs validated in code per `04 §2.4`.
3. **`bundle_checksum = SHA256(manifest.json)`.** Manifest is the
   bundle's identity. Parquet file changes propagate via the per-file
   SHA256s carried in the manifest.
4. **OPFS cache key = `bundle_checksum`.** Re-publish of identical
   bytes reuses the cache; any change forces re-fetch.
5. **Eligibility predicate exists in exactly one place.** The function
   `solemd.is_bundle_eligible()`. The MV caches it; nothing inlines it.
6. **Publish is one row UPDATE on the singleton pointer.** Per
   `04 §3.5`. Graph build cadence and cohort cadence may differ; the
   live read is always atomic.
7. **TypeScript and Python manifests agree.** `bundle_version` +
   per-table column registry are checked by both
   `validate_bundle_manifest_contract()` (Python) and
   `EXPECTED_BUNDLE_VERSION` (TypeScript).
8. **`bundle_eligibility_mv` has a unique index.** Required for
   concurrent refresh. PG 18 docs.
9. **Per-table parquet currently defaults to ZSTD-3 + 122 880-row
   groups.** Browser-side DuckDB-WASM range fetches are measured around
   that geometry, but the exact values remain sample-build-gated.
10. **Bundles are immutable on disk.** A `bundle_checksum` directory
    is write-once; pruning deletes whole directories, never edits.

## §N Decisions — locked / provisional / deferred

### Locked now

| Decision | Rationale |
|---|---|
| (b) — no warehouse write-back at publish | Single source of truth; eliminates dual-write between warehouse `corpus` flags and serve `active_runtime_pointer`. |
| Speed-first as a first-class design constraint | Bundle build is the operator's most-frequent action; wall-clock is observability metric and budget. |
| `graph_runs` state machine: `1=running, 2=succeeded, 3=published, 4=retired, 5=failed` | Explicit, gated, SMALLINT-coded per `12 §4` registry. |
| Drop `graph_runs.is_current` | Same dual-write class as (b); replaced by `active_runtime_pointer.graph_run_id` on serve. |
| Drop `corpus.is_in_current_map` and `is_in_current_base` | Same dual-write class as (b). |
| Bundle versioning rule (append-only = same version; rename / drop / dtype = new version) | Browser hydration is gated on `bundle_version` match; the rule is the contract. |
| `BUNDLE_VERSION = "4"` today; 5 tables (`base_points`, `base_clusters`, `universe_points`, `paper_documents`, `cluster_exemplars`) plus `universe_links` in `full` profile | Existing `engine/app/graph/export_bundle.py:28, 32-126`. |
| `bundle_checksum = SHA256(manifest.json)` | Content-bound identity; one hash drives URL, OPFS key, immutability. |
| OPFS cache key = `bundle_checksum` (not `graph_run_id`) | Re-publish of identical content reuses cache; new content forces re-fetch. |
| Eligibility-as-function pattern: `solemd.is_bundle_eligible(corpus_id)` + `solemd.bundle_eligibility_mv` | Speed-first cache + single source of truth; mirrors `05a §4` chunker policy registry. |
| `REFRESH MATERIALIZED VIEW CONCURRENTLY` for `bundle_eligibility_mv` | Non-blocking refresh; bundle build can read mid-refresh. |
| Independent build cadence, joint promotion via singleton pointer | Build is GPU-minutes-to-hours; promotion is one row UPDATE. |
| `_publish_checksum_bundle_alias()` symlink at `/mnt/solemd-graph/bundles/by-checksum/<hash>/` | Existing pattern; preserved unchanged. |
| Asset URL pattern `/graph-bundles/<bundle_checksum>/<file>` with `Cache-Control: public, max-age=31536000, immutable` | Next.js immutable-asset convention; checksum guarantees correctness. |
| ZSTD-3 parquet compression with 122 880-row groups | Current project default for first sample builds; keep benchmark-owned rather than treating it as a universal DuckDB sweet spot. |
| `_sync_current_corpus_membership()` deletion | Per (b). |
| Schema-rebuild fixes: `solemd.citations` → `solemd.paper_citations`; `pa.external_ids->>'ORCID'` / `pa.affiliations[1]` → new `paper_authors` columns | `02 §4.2` post-amendment shape. |
| New `graph_run_status` enum in `enum-codes.yaml` | `12 §4` registry pattern. |

### Provisional (revisit after first sample build)

| Decision | Revisit trigger |
|---|---|
| Native-PG row producer vs DuckDB `TYPE postgres` helper as the default export engine per table | First wall-clock measurement on a 1 M-paper bundle. Keep the default engine per table, not by doctrine; if PostgreSQL-row-producer export already meets §6.7 for a table, DuckDB stays optional there. |
| Wall-clock budget targets in §6.7 | First sample build measurement. |
| Bundle-build session GUC values in §5.4 (`max_parallel_workers_per_gather = 8`, `work_mem = 512MB`, `effective_io_concurrency = 256`) | First export wall-clock measurement; tune via `09 §3` amendment. |
| `bundle_eligibility_mv` refresh cadence (once per `ingest_runs.published`) | Operator-driven build cadence relative to ingest cadence. |
| Eligibility predicate body in `solemd.is_bundle_eligible()` | Codified from current `build_inputs.py` + `render_policy.py`; tighten after first sample build. |
| `INCLUDE` column set on `idx_paper_authors_export_cover` and `idx_paper_assets_export_cover` | Confirm every included column actually used in the rollups. |
| Retention policy `N = 5` published bundles + 7-day `failed`/`succeeded` retention | First month of operation; tune by disk pressure. |
| Whether `validate_bundle_manifest_contract()` should hard-fail on `bundle_version` drift instead of soft-warning | Operator preference after first browser-side mismatch. |

### Deferred (trigger-gated)

| Decision | Trigger |
|---|---|
| Cross-language CI parity check (Python `bundle_contract()` ↔ TypeScript `GraphBundleContract`) | First production drift between the two; today PR review covers this. |
| Disaster fallback in asset handler (`bundle_uri` lookup when symlink missing) | First production incident where the symlink is lost but the run directory survives. |
| `bundle_integrity_audit` `pg_cron` job (weekly per-file SHA256 reverify) | Production operator concern about silent corruption on the bind-mount. |
| Browser-side per-file SHA256 verification | Adversarial-network or in-network-corruption concern. |
| Hot-bundle cache layer in serve PG | Asset handler latency becomes hot enough to want serve-resident parquet. Today the bind-mount + Next.js cache is fine. |
| Bundle-build parallelism beyond `EXPORT_WORKERS` thread pool | First-sample wall-clock pressure not addressed by §5/§6. |
| Bundle promotion enqueued via Dramatiq actor `bundle.build_and_publish` instead of CLI | First Dramatiq deploy with a graph-build trigger flow. |
| `--refresh-eligibility` flag on `python -m app.graph.build` | Operator-driven rebuild cadence outpacing ingest. |

## Open items

Forward-tracked; none block downstream docs:

- **Export-engine split.** §5.5 keeps the export contract engine-
  agnostic and makes the native-PG row-producer path and DuckDB
  `TYPE postgres` helper compete on measured wall-clock. The native-PG
  + pyarrow path remains first-class. The implementation should choose
  the default engine per table from the measurement, not by preserving
  current code and not by forcing DuckDB everywhere.
- **Wall-clock budget for 1 M-paper bundle: ≤ 5 min.** §6.7 sets this
  as the first-class target; if the first sample build measures
  significantly longer, tighten the §5 commitments (more parallel
  workers, more aggressive partition pruning) before relaxing the
  budget.
- **Eligibility predicate body.** §4.1 is provisional; the codified
  body has to match what `build_inputs.py` + `render_policy.py` do
  today. A precise transcription is a §11 implementation task, not a
  design decision.
- **Cross-cluster drift handling.** §12.4's `audit_active_runtime_pointer`
  job already lives on serve (`03 §6.5`). The drift between serve
  pointer and warehouse `graph_runs.status` is a narrow window
  (sub-second between the two UPDATEs in §6.8). If the alert ever
  fires, the repair is a one-line `UPDATE solemd.graph_runs SET
  status = 3 WHERE graph_run_id = ...`; making the coordinator more
  robust (e.g. with a saga / two-phase commit) is **deferred** unless
  a real production incident demands it.
- **`paper_authors` schema lock.** §11.1 step 5 is mechanical *if*
  `02 §4.2` lands `paper_authors` with explicit `orcid TEXT` and
  `affiliation_text TEXT` columns. If the schema lock takes a
  different shape, the rewrite needs corresponding adjustment;
  flagged here so the reviewer who finalizes `02 §4.2` knows this
  call site depends on the column names.

## Upstream amendments needed

These deltas do not modify upstream documents in this pass; they are
recorded here for the next `12 §9` ledger update.

1. **`02 §4.2` `solemd.corpus`** — drop columns
   `is_in_current_map BOOLEAN` and `is_in_current_base BOOLEAN`. Per (b).
2. **`02 §4.7` `solemd.graph_runs`** — drop `is_current BOOLEAN` if
   present; add explicit `status SMALLINT NOT NULL` with the §3.1
   enum codes; add column comments derived from `enum-codes.yaml`.
3. **`02 §4.7` `solemd.graph_runs`** — add the bundle-metadata columns
   (`bundle_uri TEXT`, `bundle_format TEXT`, `bundle_version TEXT`,
   `bundle_checksum TEXT`, `bundle_bytes BIGINT`, `bundle_manifest JSONB`,
   `qa_summary JSONB`) if not already present in the §4.7 inventory.
4. **`02 §4` (new §4.x)** — add `solemd.bundle_eligibility_mv`
   materialized view + `solemd.is_bundle_eligible(BIGINT) → BOOLEAN`
   function definition.
5. **`02 §4.5` / §4.2** — add `INCLUDE` covering indexes per §5.3 on
   `solemd.paper_authors` and `solemd.paper_assets`.
6. **`02 §1`** — confirm `pg_cron` extension is installed on warehouse
   (already listed; confirm the bundle-eligibility refresh job
   landing).
7. **`06 §7`** — add role grant: `engine_warehouse_admin` gets
   `REFRESH ON MATERIALIZED VIEW solemd.bundle_eligibility_mv`.
8. **`09 §3`** — add bundle-build session GUC commentary (current
   `09 §3` covers ingest-session GUCs; add a sibling subsection for
   bundle-build session). The exact values (§5.4) are provisional.
9. **`10 §13`** — add the bundle metric series listed in §13.1.
10. **`10a §11`** — reference this doc's §13 for bundle-quality
    feedback into the RAG quality analyzer (cross-link only; no
    behavior change).
11. **`12 §4`** — add `graph_run_status` enum row to
    `enum-codes.yaml` (5 values per §3.1).
12. **`12 §9`** — add ledger rows for:
    - Drop `corpus.is_in_current_map` / `is_in_current_base`.
    - Drop `graph_runs.is_current` (if present).
    - Add `graph_runs.status` SMALLINT + bundle-metadata columns.
    - Create `solemd.is_bundle_eligible()` function.
    - Create `solemd.bundle_eligibility_mv` MV + unique index.
    - Add `INCLUDE` covering indexes on `paper_authors`, `paper_assets`.
    - Grant `REFRESH` to `engine_warehouse_admin` on the MV.
13. **`04 §3.5`** — note that the publish-current path of a graph-only
    refresh is the one-id UPDATE form on `active_runtime_pointer`
    (already covered by the existing `04 §3.5` `UPDATE …` shape;
    cross-link from this doc).
14. **`05a §4`** — cross-link this doc as the sibling
    "policy-as-function + MV" pattern; no behavior change.

## Relationship to other docs

- `00 §1` defines `graph-worker` (on-demand CUDA/RAPIDS) and the
  warehouse-cold-by-default posture; this doc's stages 1–3 run on
  `graph-worker`.
- `01 §3` locks the bundle storage path
  (`/mnt/solemd-graph/bundles/<run_id>/` with `by-checksum/`
  symlinks); this doc's §6 / §9 build on it.
- `02 §0`/§4.2/§4.5/§4.6/§4.7` is the warehouse schema this doc
  amends per §11.
- `03 §2`/§4.1` — `active_runtime_pointer` singleton + `graph_run_metrics`
  consume `graph_run_id` published by this doc.
- `04 §3.5`/§5.1 — pointer flip and cohort manifest. This doc's
  promotion path uses the one-id UPDATE form; full cohort cutovers
  use the three-id form.
- `05 §13` — ingest publishes warehouse data; the
  `bundle_eligibility_mv` refresh actor (§4.3) is enqueued by the
  same `pg_cron` polling pattern.
- `05a §4` — sibling policy-as-function + MV pattern (chunker policy
  registry).
- `06 §2.1`/§7 — pool topology and roles; bundle build runs on
  `warehouse_read` + `admin` pools (the latter for the cross-cluster
  publish coordinator).
- `07 §3` — OpenSearch alias swap and `serving_runs` row are the
  serving-cutover side; bundle promotion participates via the
  shared singleton pointer.
- `09 §3` — warehouse `postgresql.conf`. Bundle-build session GUCs
  are additive per §5.4.
- `10 §13` — Prometheus metric catalog. Bundle metrics per §13.1.
- `10a §11` — RAG quality analyzer; bundle-build wall-clock and
  publish events are cross-link inputs.
- `11-backup.md` — bundles are not pgBackRest-protected (warehouse
  rebuilds them); retention policy in §12.6 is bundle-only.
- `12 §4`/§9 — enum registry + amendment ledger. §11 enumerates
  every ledger row this doc requires.
- `research-distilled §2`/§5 — DuckDB streaming + PG tuning patterns
  this doc applies.
- `.claude/skills/graph/SKILL.md` — agent-facing architecture and
  ownership contract; this doc is the design-doc layer beneath it.
- `.claude/skills/cosmograph/SKILL.md` — browser graph runtime
  internals; this doc declares the bundle bootstrap contract the
  runtime consumes.
