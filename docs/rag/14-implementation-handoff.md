# 14 — Implementation Handoff

> **Status**: locked for the authority order, the implementation through-line,
> the fresh-start rebuild rule, the preflight decisions that must be settled
> before Slice 1 starts, the drift-control rules, the "consolidate structural
> amendments now / defer sample-build-governed tuning" split, and the
> activation-gated treatment of `13-auth.md`. **Provisional**: the exact
> sample-build thresholds that will lock the remaining microdesign values.
> **Deferred**: any auth activation work before a real user-data surface
> exists.
>
> **Date**: 2026-04-17
>
> **Scope**: the full `docs/rag/` series as one connected implementation
> program. This document is not a new subsystem spec. It is the handoff layer
> that states how the existing docs fit together, which documents are authority
> for which decisions, what must move together in one PR, what can wait for a
> sample build, and how to keep the rebuild on one coherent through-line as the
> codebase catches up.

## Purpose

The doc set was written as a series, but not all in one sitting. The result is
usable, though not self-healing: each individual spec is detailed, yet the
implementation team still needs one place that answers the practical question
"what is the single story that connects all of these?" This file is that place.

Its job is to make five things explicit:

1. **One system narrative.** Warehouse ingest, projection, graph bundles,
   browser DuckDB runtime, wiki, OpenSearch, retrieval, observability, backup,
   migrations, and auth are not separate projects. They are one pipeline with
   one runtime boundary.
2. **One authority order.** When two docs appear to overlap, there is a stable
   precedence rule.
3. **One change discipline.** Structural amendments land now; performance
   choices that depend on measurement land after the sample build; auth stays
   deferred until activation.
4. **One 2026-native posture.** Prefer the stack's native capabilities and the
   explicitly chosen platform surfaces over legacy habits or adapter sprawl.
5. **One implementation sequence.** The next work is amendment-ingest and code,
   not more speculative doc authoring.

## 1. The system through-line

The full rebuild, reduced to the minimum accurate story, is this:

1. **Raw sources land on disk** on the E-drive warehouse bind mounts (`01`,
   `05`).
2. **Warehouse ingest** writes source-shaped raw/stage facts into PostgreSQL on
   the warehouse cluster (`02`, `05`).
3. **Selected-corpus activation** decides which papers enter the operational
   SoleMD canonical corpus and promotes broad selected-paper facts into the
   canonical warehouse layer. The locked first-wave policy is:
   - corpus admission by journal / venue-pattern / curated-vocab alias hit
   - mapped promotion by journal / pattern / entity-rule / relation-rule
     families with second-gate handling for noisy entity families
   - per-paper selection summary carrying publication year, locator readiness,
     mapped-rule flags, and mapped/evidence priority scores (`02`, `05e`).
4. **Mapped rollout and evidence waves fan out from the selected corpus.**
   `mapped` is the paper-level active universe; evidence owns full-text
   rewrite, chunking, grounding, and evidence derivation. The locked first-wave
   evidence dispatcher currently means "mapped, recent, high-signal,
   locator-aware, and still missing a canonical `pmc_bioc` document"
   (`05f`, `05a`, `07`).
5. **Projection jobs** read warehouse canon and write serve-facing PostgreSQL
   tables using stage-and-swap (`00`, `03`, `04`).
6. **OpenSearch build jobs** read the same serve/warehouse inputs and build the
   retrieval indexes behind aliases (`07`).
7. **Graph bundle build jobs** read warehouse graph outputs and export immutable
   Parquet bundles for the browser runtime (`05b`).
8. **Browser DuckDB runtime consumes the graph bundle** through one
   checksum-keyed local session, materializes the canonical active views, and
   hands them to Cosmograph without introducing a second JS-owned graph dataset
   (`05c`).
9. **A Dramatiq wiki sync/activation worker stages and activates the authored
   page shell into serve** and wiki page-context reads enrich from serve
   projections plus graph-release resolution, with page actions routing into the
   same graph runtime rather than inventing a separate page-local graph layer
   (`05d`, `06`).
10. **Cutover is pointer-driven, not row-flag-driven.** The live system is named
   by the serve-side singleton pointer and the alias layer, not by ad hoc
   "current" booleans in warehouse tables (`00`, `03`, `04`, `05b`, `07`).
11. **The engine API serves the frontend** from serve PG, OpenSearch, the wiki
    shell, and the immutable bundle contract; bounded FDW dereference is the
    only sanctioned cross-cluster read at request time (`00`, `03`, `05d`,
    `07`, `08`, `05b`).
12. **Observability, quality, backup, and migration discipline** are not
   sidecars. They are part of the runtime contract and must track the same
   identities and cohort boundaries (`10`, `10a`, `11`, `12`).
13. **Auth is deferred.** When it lands, it lands on serve as an activation PR,
    not as speculative partial scaffolding (`13`).

That is the through-line. Anything that does not fit inside it is either out of
scope, legacy debt, or a deferred concern.

## 2. Authority order

When multiple docs touch the same subject, use this precedence order:

1. **`docs/rag-future.md`**
   Strategic canon. It defines the end-state direction and the logical data
   model, but not every physical/runtime choice.
2. **`docs/rag/00-topology.md`**
   Physical/runtime split: two clusters, cold warehouse, FDW boundary, pointer
   cutover model.
3. **`docs/rag/02-warehouse-schema.md` and `03-serve-schema.md`**
   Schema authority. If old code or old migrations disagree, these docs win.
4. **Behavioral pipeline docs**
   `04`, `05`, `05a`, `05b`, `05c`, `05d`, `07`, `08`. These define how the
   schemas are used.
5. **Operational docs**
   `06`, `09`, `10`, `10a`, `11`, `12`. These define how the system is run,
   observed, backed up, and migrated.
6. **`13-auth.md`**
   Activation-gated. It is authoritative only when the project chooses to turn
   auth on.
7. **`15-repo-structure.md`**
   Repository/deployment/package boundary authority. It defines where runtime
   roles and shared code are allowed to live during the cutover.
8. **Existing code and prior migration chain**
   Inventory only. They are reusable implementation material, not authority.

Practical rule: if a legacy implementation conflicts with `02` / `03` / `04` /
`12`, rewrite the legacy implementation. Do not bend the new design around the
old surface.

## 3. Connected document map

The series has a stable dependency chain:

- `00` defines the two-cluster physical model and the allowed warehouse↔serve
  crossings.
- `01` makes that model real on disk.
- `02` and `03` define the two schemas.
- `04` defines how warehouse facts become serve tables.
- `05` defines how raw releases become warehouse canon.
- `05a` defines how canonical documents become evidence units / chunks.
- `05b` defines how graph warehouse outputs become Parquet browser bundles.
- `05c` defines how the browser runtime opens those bundles through DuckDB-Wasm
  and presents canonical active views to Cosmograph.
- `05d` defines how authored wiki pages live on serve, how page context is
  enriched, and how wiki actions attach to the graph runtime.
- `06` defines how Python talks to every cluster and role surface.
- `07` defines the retrieval serving plane built from warehouse/serve inputs.
- `08` defines the request-time cascade over `03` + `07` + bounded FDW.
- `09` tunes the clusters that `02`–`08` rely on.
- `10` and `10a` observe and evaluate the system emitted by `04`–`08`.
- `11` protects the systems defined by `00`–`10a`.
- `12` is the schema/change-control discipline for all schema-bearing docs.
- `13` is a separate activation path that joins later.
- `15` defines the repository shape those implementation slices should land
  into.

This means implementation work should move outward from the physical/schema core,
not inward from the API edges.

## 4. Native 2026 posture

The system has already converged on a clear native-solution posture. That
posture should be treated as locked unless a better primary-source-backed option
clearly beats it.

### 4.1 PostgreSQL

- PostgreSQL is the canonical store for warehouse facts and serve projections.
- Use native PostgreSQL features first: partitioning, MV refresh, roles, FDW,
  pg_cron, pgBackRest, pg_stat_statements, `COMMENT ON`, and SQL-first
  runner-owned DDL.
- Do not recreate release-state mirrors (`is_current`, `is_in_current_*`) when
  the singleton pointer or run ledger already names the active state.

### 4.2 DuckDB

- DuckDB is mandatory in the browser runtime because the frontend bundle contract
  is Parquet + DuckDB-WASM.
- On the server side, DuckDB's `postgres` extension is the standard
  PostgreSQL-to-Parquet export bridge for graph-bundle jobs. Exact per-table
  execution mode remains measurement-owned, but the toolkit choice is no longer
  open.
- DuckDB is not implicitly part of the warehouse or graph-build compute pipeline
  unless a specific measured use case justifies it.

### 4.3 OpenSearch

- OpenSearch owns hybrid lexical/vector serving retrieval, not canonical text
  storage and not the grounding truth.
- ML Commons is not the current day-one default. Encoder/rerank control stays
  in the engine until measurement or operations needs argue otherwise.

### 4.4 Async Python

- `asyncpg` is the primary data-path driver.
- Raw SQL + Pydantic boundaries are the default shape.
- Sync psycopg3 remains the current migrations / admin runner where
  out-of-transaction DDL and shell/CI invocation make it the simpler shape.
- Admin/DDL flows bypass PgBouncer where transaction pooling would break the
  operation.

### 4.5 Dramatiq

- Dramatiq owns long-running background orchestration: ingest, chunking,
  projection, OpenSearch build, graph bundle publish, backup automation, and
  wiki sync/activation.
- FastAPI `BackgroundTasks` and route-bound `asyncio.create_task` are not part
  of the clean cutover plane for any durable or retry-governed workload.
- GPU-first worker posture stays intentional: if a workload materially benefits
  from the RTX 5090 (embedding, rerank, graph build/layout, local eval), keep
  the GPU path. The correction is to pin supported RAPIDS / PyTorch CUDA
  combinations, not to fall back to CPU by default.

### 4.6 Langfuse

- Langfuse Cloud is the current traced-eval control plane.
- The local `10a` analyzer is the downstream quality surface that fills the
  retrieval-analysis gap Langfuse does not cover by itself.

## 5. Drift-control rules

The docs need explicit coupling rules or they will drift.

### 5.1 Structural changes

A structural change is any change to:

- schema shape
- identity shape
- run/pointer lifecycle
- trace payload contract
- role/DSN inventory
- bundle contract
- backup/migration boundary

These changes must update **all directly coupled docs in the same PR**.

### 5.2 Coupled surfaces that must move together

Use this as the minimum sync matrix:

| If you change... | You must check/update... |
|---|---|
| Warehouse schema | `02`, `04`, `05`, `05a`, `05b`, `12` |
| Serve schema | `03`, `04`, `05d`, `07`, `08`, `10`, `12` |
| Pointer / cohort lifecycle | `00`, `03`, `04`, `05b`, `07`, `08` |
| Cascade trace fields | `08`, `10`, `10a`, Langfuse skill/reference |
| Bundle contract / manifest | `05b`, `05c`, browser bundle types/runtime, `graph` skill refs if the durable contract changes |
| Wiki runtime contract | `03`, `05d`, `06`, `docs/map/wiki.md`, `docs/map/wiki-generation.md`, `docs/map/api.md`, `12` |
| Backup coverage | `11`, plus the source schema/role doc if the protected surface changed |
| New schema amendment | `12 §9` |
| Auth activation | `03`, `06`, `09`, `11`, `12`, `13` together |

### 5.3 Sample-build-gated values

Do **not** prematurely freeze values whose docs explicitly say they depend on the
first real build. Examples:

- bundle export engine default per table
- bundle wall-clock budgets
- some `INCLUDE` index sets
- some GUC values
- evidence-tier ceilings / HNSW params where the docs still call them provisional

The rule is simple: if the doc marks it provisional and ties it to sample-build
feedback, do not promote it to locked by editorial enthusiasm alone.

## 6. What should be consolidated now

This is the important implementation split.

### Consolidate now

These are structural and already decided:

- `12 §9` amendment ledger parity across authored docs
- warehouse-side structural changes already specified in `02`, `05`, `05a`,
  `05b`
- serve-side structural changes already specified in `03`, `04`, `05d`, `07`,
  `10a`
- `06` role / DSN / admin-surface parity for non-auth rows
- `08` / `10a` trace-contract parity
- mapped paper-grounded vs evidence-grounded contract parity across `07`,
  `08`, `10a`, and `12`
- browser DuckDB/runtime contract parity across `05b`, `05c`, and the bundle
  types/runtime code
- wiki sync/activation contract parity across `05d`, `06`, and the human-facing
  wiki docs
- observability metric inventory changes that are already structurally decided

### Do not force now

These should wait for sample-build evidence:

- any promotion from provisional → locked must come from the named
  sample-build harness, not from prose drift or unmeasured intuition
- export engine default per bundle table
- bundle and ingest wall-clock targets beyond the current provisional budget
- final per-table GUCs for bundle jobs
- optional optimizations whose trigger is "if this is still too slow"

### Do not touch before activation

- `13-auth.md` implementation rows
- `03` auth schema expansion beyond the placeholder
- `06` dedicated auth DSN / auth role
- `09` auth-table reloptions
- `11` auth-specific operationalization
- `12` auth activation ledger rows

### 6.1 Preflight decisions locked now

These are no longer open questions. They are part of the implementation
contract and should be landed into code/config/migrations as written:

- **Fresh-start rule.** New clusters start from runner bootstrap plus the
  new per-cluster baseline. The archived legacy migration chain is salvage
  inventory only and is never adopted on a fresh rebuild.
- **Schema-authoring posture.** Atlas Pro is not part of the implementation
  contract. Canonical schema state lives in ordered PostgreSQL SQL directories
  under `db/schema/{warehouse,serve}/`, and versioned SQL migrations under
  `db/migrations/<cluster>/` are the only applied change units.
- **Procedural PostgreSQL object home.** Product PL/pgSQL functions, trigger
  functions, and triggers live in version-controlled SQL under the canonical
  schema directories. Bootstrap SQL is reserved for runner-owned helpers,
  secret-bearing admin steps, and intentionally non-transactional ops.
- **FDW credential boundary.** Foreign-server shape may be declarative;
  secret-bearing `USER MAPPING` credentials are injected by the admin/deploy
  runner after structural migration success.
- **Connection contract.** Admin, migration, cutover, and bulk-write paths go
  direct to PostgreSQL. Pooled app/read traffic goes through PgBouncer where
  intended. Any asyncpg path that can hit transaction-pooled PgBouncer keeps
  `statement_cache_size=0` and does not use `Connection.prepare()`.
- **Chunker activation contract.** Steady-state chunking is triggered by the
  ingest-side orchestrator/dispatcher during the same warehouse-up window as
  publish, not by assuming a separate warehouse pg_cron wakeup.
- **Partition routing contract.** Slice 3 defaults to an in-process
  PostgreSQL-compatible hash implementation with parity tests against
  PostgreSQL, not a per-batch DB round-trip for routing.
- **OpenSearch live path.** Day-one live retrieval is `BM25 + raw-vector kNN +
  hybrid.filter + RRF`, with explicit search-pipeline selection from the
  engine. Hybrid score breakdown is a separate benchmark/debug path, not the
  production combiner.
- **Runtime retrieval-family contract.** Mapped paper support and
  evidence support both stay in the MedCPT retrieval family: Query
  Encoder for queries, Article Encoder for indexed paper/evidence docs,
  Cross-Encoder only for the bounded rerank stage. SPECTER2 remains the
  graph / relatedness embedding family, not a second live retrieval
  lane.
- **Analyzer vocabulary.** Live hybrid analysis is rank-based. The analyzer may
  inspect normalized debug breakdowns, but it must not describe live RRF as if
  it exposed decomposable raw hybrid scores.
- **Grounding-level reporting contract.** Paper-grounded support and
  evidence-grounded support are separate reporting modes. The cascade
  emits `grounding_level`, and the analyzer stores / dashboards quality
  by that dimension instead of averaging the two modes together.
- **Graph-embedding source contract.** `paper_embeddings_graph` is required for
  the graph lane, but the current local S2 release cannot be assumed to carry
  `embeddings-specter_v2`. Day-one graph waves therefore support two sources:
  ingest upstream embeddings when present, otherwise generate SPECTER2 locally
  for the included graph cohort. Those rows must carry explicit provenance so
  upstream-provided versus locally generated embeddings remain distinguishable.
  Full-corpus graph embedding remains a later wave, not a hidden day-one
  blocker.
- **Auth DDL review contract.** Auth remains deferred, but when it activates
  Better Auth schema SQL is still reviewed in-repo: `generate` emits the SQL
  artifact, and direct `migrate` is a local/dev validation path rather than an
  opaque production DDL path.
- **Wave-based rollout contract.** Initial implementation is cohort- and
  wave-based. Storage, mapped-paper rollout coverage, graph build, and bundle
  publication must all work without assuming an immediate full-14M-corpus
  load.
- **Version-currency contract.** Use current stable releases at the time the
  environment is cut, not stale historical pins and not floating `latest`
  tags. Exact image / package pins are operational inventory, but the policy is
  "pin current stable, review on each milestone."
- **Sample-build ownership.** Any tuning that remains provisional stays
  provisional until the named sample-build harness promotes it.
- **Repository-shape contract.** Deployables live under `apps/`, shared
  non-deployable code lives under `packages/`, canonical SQL lives under `db/`,
  and deployment/operator wiring lives under `infra/` or `scripts/`.
- **Runtime naming contract.** The deployable names are `web`, `api`, and
  `worker`. Do not preserve `engine/` as the long-term runtime root.
- **Wiki placement contract.** Wiki rendering/orchestration stays owned by the
  web app; wiki sync/activation stays owned by the worker; wiki request-time
  reads stay owned by the API.
- **Graph-runtime placement contract.** Browser DuckDB-WASM / Cosmograph
  runtime code is the reusable browser package; graph bundle build/publish is a
  worker concern; bundle asset resolution is an API concern.

## 7. Current parity state

As of this handoff:

- `08` and `10a` are aligned on the added cascade trace fields.
- `12 §9` has been updated to absorb the authored `05a` and `05b`
  structural amendments, and the migration / model-path docs now point
  at one shared contract instead of legacy file authority.
- The migration story is now explicitly fresh-start: runner bootstrap +
  new baseline for new clusters, with legacy code/migrations treated as
  salvage inventory only.
- The retrieval story is explicitly split into evidence-grounded support and
  mapped paper-grounded support inside one MedCPT family, with SPECTER2 held to
  the graph / relatedness lane.
- The implementation path is now wave-based rather than silently assuming full
  corpus scale on day one.
- The first production S2 / PubTator raw-ingest worker lane is now landed in
  `apps/worker/app`, including release-level orchestration, source-family
  loaders, and raw/stage landing.
- The first-wave selected-corpus builder and mapped-wave evidence dispatch are
  now also landed in `apps/worker/app/corpus`.
- The corpus policy contract is now explicitly locked as
  `raw -> corpus -> mapped -> evidence`, with canonical paper/fact
  materialization behind the corpus boundary.
- Mapped promotion now uses journal, venue-pattern, entity-rule, and
  relation-rule families plus second-gate handling for noisy entity families.
- Evidence-wave dispatch is now keyed as `evidence_missing_pmc_bioc` and uses
  recent/high-signal/locator-aware gating from `paper_selection_summary`.
- `13` remains intentionally activation-gated and should stay that way.

The largest remaining parity work is no longer another raw-ingest rewrite.
It is calibrating the locked corpus/mapped/evidence policies against larger
release cohorts, then landing the downstream evidence/full-text and
chunk/evidence lanes against that narrower universe.

## 7.1 Slice 6 follow-on handoff — post-policy calibration and evidence readiness

Status on 2026-04-19: the first production raw-refresh worker lane is landed
in `apps/worker/app`, and the first-wave selected-corpus builder plus
mapped-wave evidence dispatch are landed in `apps/worker/app/corpus`. The next follow-on is not another
raw-ingest rewrite, not a from-scratch selector implementation, and not a
corpus-boundary completion rewrite. That boundary is now in place. The next
agent should treat the remaining work as **policy calibration and evidence
readiness**.

Current starting point:

- The worker shell plus the first raw-refresh implementation now exist in
  `apps/worker/app`.
- Warehouse raw / chunking schema work now exists, and the S2 / PubTator raw
  loaders are landed.
- The selector worker lane, run tracking, signal provenance, canonical
  materialization, and mapped-wave dispatch now exist in `apps/worker/app/corpus`.
- `solemd.corpus.admission_reason` and `solemd.corpus.domain_status` already
  exist in `02` and are the right durable selection ledger.
- The runtime now materializes explicit corpus baseline (`corpus`, `papers`,
  `paper_text`, selection audit surfaces) and mapped-owned heavy surfaces
  (`paper_authors`, canonical PT3, and actual `paper_citations` edge
  enrichment for mapped papers) as separate phases.
- `paper_selection_summary` is now the stable warehouse-local ranking and
  audit surface for downstream waves. It already carries `publication_year`,
  `has_locator_candidate`, mapped-rule booleans, mapped-rule counts, and
  mapped/evidence priority scores.
- The first evidence-wave contract is
  `wave_policy_key = 'evidence_missing_pmc_bioc'`: mapped-only parent scope,
  missing PMC BioC canonical document, 10-year recency floor,
  evidence-priority floor, and locator-aware gating.
- Legacy inventory under `legacy/pre-cutover-2026-04-18:engine/app/corpus/`
  shows the prior selection logic: venue/journal normalization, curated
  vocab aliases, PubTator evidence, and promotion from `corpus` to `mapped`.

Scope for the next agent:

- Extend `apps/worker/app`, using the existing Dramatiq broker and pool
  bootstrap.
- Keep raw/stage ingest in `05` and keep downstream child waves in `05a` /
  `05f`; this follow-on should calibrate, not redefine, the locked corpus
  contract between them.
- Treat the raw citation contract as paper-level aggregates before mapped.
  Actual citation edges are mapped-owned `paper_citations`; evidence owns only
  in-text `paper_citation_mentions`.
- Build on the landed baseline-vs-mapped materialization split rather than
  reopening it.
- Preview and tune cohort sizes over real warehouse releases so corpus breadth,
  mapped precision, and evidence-wave ceilings can be adjusted by policy
  parameters rather than structural rewrites.
- Add source-aware evidence readiness work, especially canonical fallback when
  PMC BioC is absent but an S2 full-text source is available.
- Keep mapped-only downstream fanout explicit in logs and metrics so later
  chunking, embedding, and mapped paper-level rollout slices can trust the
  scope boundary.

Non-goals for that slice:

- No serve-cluster writes.
- No FDW read path.
- No reintroduction of alternate corpus-status ladders or a warm tier.
- No chunk/evidence implementation inside the selector itself.
- No graph-embedding backfill inside the selector itself.
- No full-200 M+ S2 canonicalization by accident.

Implementation sequence for that agent:

1. Run monitored real releases against the landed staged contract.
2. Tune policy parameters and evidence-source fallback on top of that staged
   runtime.
3. Leave chunking, graph embedding, and mapped paper-level retrieval rollout as
   downstream child waves operating on the selected corpus.

Definition of done:

- Reconstructing the same release/rule set produces the same canonical corpus,
  mapped universe, and evidence-wave membership.
- The selected corpus is queryable by one durable warehouse predicate
  (`c.domain_status IN ('corpus', 'mapped')`), and the mapped paper-level
  universe is queryable by `c.domain_status = 'mapped'`.
- Corpus-baseline surfaces reflect the admitted corpus universe, while
  mapped-owned heavy surfaces reflect only the mapped active universe.
- Evidence-wave membership remains a child-wave policy, not a new paper status,
  and is reproducible under `wave_policy_key = 'evidence_missing_pmc_bioc'`.
- Chunking, graph-embedding, and mapped-paper rollout agents all inherit the
  same scope boundary instead of each inventing one.
- The slice leaves a clean enqueue point for later chunker / evidence work,
  but does not block on that later lane.

## 8. Recommended implementation order

The cleanest order from here is:

1. **Policy calibration on top of the locked corpus boundary**
   Treat the structural selector/canonical-backfill work as done for the first
   worker slice. Further work here should be cohort preview, threshold tuning,
   and evidence-readiness improvements, not status-model rewrites.
2. **Targeted evidence-text acquisition**
   Land the paper-scoped PMC BioC refresh lane for the much smaller evidence
   cohort, and add source-aware fallback when PMC BioC is absent. This slice
   rewrites the canonical document spine for evidence-selected mapped papers
   without re-opening the raw-release orchestration problem.
3. **Grounding spine and chunk/evidence activation**
   Once the selected corpus boundary and paper-level full-text lane are real,
   land the downstream evidence-wave document spine, chunker actor body,
   evidence-unit writer, and post-publish fanout to the retrieval lane.
4. **Graph-embedding wave for `paper_embeddings_graph`**
   Land the dedicated graph-embedding slice after corpus selection has
   established stable mapped-paper ownership. This slice owns ingesting upstream
   `embeddings-specter_v2` shards when releases carry them, or local SPECTER2
   generation when they do not, with explicit provenance on
   `paper_embeddings_graph`. If the chosen graph backbone is the full
   approximately 14M-paper cohort, that full backfill remains an explicit wave
   in this slice rather than an implicit requirement hidden inside graph-bundle
   publish.
5. **Serve and retrieval implementation**
   Land serve schema + projection/cutover, then OpenSearch plane, then the
   request-time cascade.
6. **Analyzer / bundle / backup hardening**
   Implement graph bundles, observability, quality analysis, and backup only
   after the runtime identities and cutover surfaces are real. The graph lane
   explicitly includes the chosen source for `paper_embeddings_graph` in the
   current rollout wave.
7. **Sample build**
   Use the sample-build harness to promote still-provisional tuning values. Do
   not lock measurement-owned values before this step.

## 9. Bundle-generation posture in the through-line

Because `05b` was one of the most recently refined docs, state it plainly here:

- Bundle generation is part of the graph-serving pipeline, not the retrieval
  pipeline.
- The browser runtime consumes immutable Parquet through DuckDB-WASM.
- The server-side bundle exporter should stay engine-agnostic at the contract
  level.
- DuckDB's PostgreSQL extension is a supported helper for server-side Parquet
  generation where measurement justifies it, but it remains an implementation
  choice per table shape, not a new warehouse dependency.

That keeps the through-line clean:

warehouse graph outputs → export helper chosen by measurement → immutable Parquet
bundle → checksum-addressed asset serving → DuckDB-WASM → Cosmograph

One piece of temporary scaffolding lives alongside this lane during the
rebuild window: the frontend dev fixture
(`GRAPH_DEV_FIXTURE_BUNDLE_CHECKSUM`, `05b §11.7`) resolves the active
bundle directly off the `/mnt/solemd-graph/bundles/by-checksum/` alias
so `apps/web` can keep running against the 2026-04-12 bundle while the
`solemd.graph_runs` ledger is offline. It is contract-identical to the
DB path and is deleted at cutover per the cleanup steps in §11.7. The
fixture loads through `loadEnvConfig` from `@next/env` in
`apps/web/next.config.ts` pointed at the monorepo root, which is the
canonical Next pattern for loading repo-root `.env*` files into a
workspace app — that call stays in place after the fixture is
removed, because every other repo-root env var (`DATABASE_URL` etc.)
reaches the dev server through it.

A separate gap lives alongside: the landing → `/graph` boundary still
plays a fresh-canvas first-paint loading screen even when the DuckDB
session is warm, because Cosmograph mounts per-route today and no
shared shell exists above the landing / graph pages. Tracked in
`docs/future/graph-landing-stealth-handoff.md`; the target is a
hybrid-route architecture where `/` and `/graph` render the same
`<GraphShell>` component (different `mode` props) and the internal
landing → graph flow is scroll-driven on a single route, eliminating
the route boundary without needing a persistent canvas above the
App Router. External cold entry at `/graph` accepts the usual
cold-mount loading frame. The orb plan
(`docs/future/graph-orb-3d-renderer.md` M6 and the "Landing →
`/graph` boundary" contract) has been reconciled to this framing;
its earlier "we do not hoist above the route tree" caveat is
superseded because no hoisting is needed under the shared-shell
plan.

## 10. Auth posture in the through-line

`13-auth.md` belongs in the system, but not yet in the implementation path.

The through-line rule is:

- auth is a serve-cluster concern
- auth activation is a single coherent PR
- auth does not back-propagate into warehouse topology
- auth does not get pre-seeded piecemeal into unrelated docs

That is why `13` is included in the series but excluded from the immediate
amendment-ingest work.

## 11. Handoff checklist for every future PR

Before merging any PR that changes this program, check:

1. Does the change alter a structural contract?
2. If yes, did the directly coupled docs move with it?
3. If yes, did `12 §9` get a row if the change is additive?
4. Is the change one of the sample-build-gated provisional decisions?
5. If yes, is there measurement attached, or should it stay provisional?
6. Is the change accidentally smuggling auth activation in early?
7. Does the change still follow the native 2026 posture for the chosen stack?

If a PR cannot answer those seven questions cleanly, it is probably introducing
drift.

## 12. Immediate next step

The next unit of work should be named plainly:

**Canonical corpus selection on the existing `apps/worker` shell**

That pass should:

- land the worker-owned selector that turns broad raw release coverage into the
  selected SoleMD canonical corpus
- reuse and modernize the prior venue/vocab/PubTator-driven selection logic
  rather than rediscovering the corpus boundary from scratch
- keep selection warehouse-local and reproducible from raw releases plus
  curated editorial assets; no live API calls as admission gates
- make `solemd.corpus.domain_status IN ('corpus', 'mapped')` the explicit
  canonical-corpus scope contract, and `solemd.corpus.domain_status = 'mapped'`
  the explicit mapped paper-level active-universe scope contract for graph
  embeddings, paper-grounded retrieval rollout, and evidence selection
- leave chunking, graph embedding, and evidence indexing as downstream waves
  rather than entangling them into the selector
- keep full-200 M+ S2 canonicalization out of scope; the historical ~14 M
  backbone is an explicit selected-corpus wave, not an automatic import rule

No additional speculative subsystem docs are needed before that work begins.

## Relationship to other docs

- `README.md` is the index; this doc is the implementation-level overview.
- `00` remains the physical topology root.
- `12` remains the canonical amendment ledger and migration boundary.
- `13` remains explicitly deferred until activation.
- `research-distilled.md` remains the primary-source archive behind provisional
  decisions.
