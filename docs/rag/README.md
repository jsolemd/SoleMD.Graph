# SoleMD.Graph RAG Overhaul — Working Docs and Execution Contract

This folder collects the operational design decisions driving SoleMD.Graph's
clean-slate RAG rebuild. `docs/rag-future.md` remains the strategic canon; the
files here translate that vision into concrete topology, schema, pipelines, and
ops.

## Stack at a glance

| Layer | Stack | What it is doing here |
|---|---|---|
| Host/runtime | NVIDIA Workbench WSL2 + native Docker + systemd | Single-workstation runtime with the RTX 5090, NVMe-backed storage, and compose-profile separation between always-up and on-demand services. |
| Frontend | Next.js on Vercel | Web product surface and server-rendered app shell. |
| API | FastAPI + Python async stack | Always-up backend surface, typed DB boundary, and raw-SQL-first request path. |
| Background work | Dramatiq + Redis | Queue, runtime cache, and worker execution for ingest, projection, graph build, indexing, and maintenance jobs. |
| Canonical data | PostgreSQL warehouse + PostgreSQL serve | Warehouse holds rebuildable canonical truth; serve holds the hot projection and request-path state. |
| Pooling / cross-cluster reads | PgBouncer + `postgres_fdw` | Transaction pooling on serve reads, plus a tightly bounded serve-to-warehouse dereference path for grounding detail. |
| Retrieval plane | OpenSearch + MedCPT retrieval stack | Hybrid lexical/vector search over release-scoped paper and evidence indexes, with alias-based cutover. |
| GPU path | RTX 5090 + CUDA-class local GPU stack | Preferred execution path wherever GPU materially helps: embedding, rerank, graph build/layout, and local evaluation. |
| Graph runtime | Parquet bundles + DuckDB-Wasm + OPFS + Cosmograph | Immutable graph-bundle delivery, browser-local query/runtime state, and native graph rendering without a second JS-owned dataset. |
| Observability | Prometheus + Grafana + Loki + Alloy + Langfuse | Operational telemetry for the stack plus traced RAG evaluation and quality review. |
| Backup / recovery | pgBackRest + OpenSearch snapshots + logical warehouse dumps | Serve gets real backup/recovery; the rebuildable warehouse is mostly recovered from source data plus a smaller logical subset. |

Exact version pins and image tags do **not** belong in this README. They belong
in `16-version-inventory.md`, which is the canonical version surface for the
rebuild.

## Reading order

Start with `00-topology.md` — every other doc lands inside the topology it
defines. Open `research-distilled.md` whenever a provisional decision needs to
be revisited against 2026 best-practice sources.

When moving from reading to implementation, read
`14-implementation-handoff.md` after the numbered core docs. It is the single
through-line for authority order, drift control, and implementation
sequencing across the whole series. Then read `15-repo-structure.md` for the
locked repository/package/deployment boundaries that the code cutover should
follow.

## Implementation contract

This README is the operating contract for the backend rebuild across many
sessions and many agents. The implementation is intentionally slow,
piece-by-piece, and documentation-led.

This file has two jobs:

1. it is the **prompt/context surface** every agent should read before working
   on the backend rebuild
2. it is the **master ledger** for cross-session progress across the whole
   `docs/rag/` program

All of the numbered `docs/rag/*.md` files are intended to be implemented. They
are not passive reference notes. Each one is a contract-bound implementation
slice for the rebuilt backend.

Rules:

- Treat `docs/rag/` as the contract and the implementation tracker for the
  clean-room backend rebuild.
- Build one bounded slice at a time. Do not fan out into parallel backend
  implementation tracks unless the current slice explicitly requires it.
- Do not redesign the architecture during implementation unless the docs are
  first amended in the same batch.
- New backend code must be written against the documented contract, not against
  legacy engine structure or convenience one-offs.
- Every agent working on this rebuild should start here, then read
  `14-implementation-handoff.md`, then the specific numbered docs for the slice
  they are implementing.
- The active agent must treat the selected slice doc as the working task
  tracker for that session. The slice doc is where task-local notes,
  amendments, and completion markers should live.
- Every agent should use `/codeatlas` for live reconnaissance and `/clean` for
  implementation discipline while rebuilding the backend.
- No shims, no backward-compatibility scaffolding, no partial legacy carryover.
  The backend is being rebuilt cleanly.

Practical execution rule:

- Move the rebuild forward by checking off one concrete implementation item at a
  time.
- Update this README when a slice becomes real so the next agent sees what is
  complete, what is in progress, and what remains untouched at the program
  level.
- Update the active slice doc while working so the next agent can resume from
  the slice-local state without reconstructing intent from code diffs.
- If a code change materially changes the contract, update the relevant doc in
  the same PR/session instead of leaving drift behind for the next agent.

## How agents should work

Every backend implementation session should follow this pattern:

1. Read this README fully.
2. Read `14-implementation-handoff.md`.
3. Read the slice doc you are about to implement.
4. Use `/codeatlas` to inspect the current repo and blast radius.
5. Use `/clean` while implementing the slice.
6. Update the slice doc as the working tracker for that slice.
7. Update this README only for master-ledger progress.

Working rule:

- README = prompt + master ledger
- slice doc = active task tracker + slice-local contract

The active slice doc should be treated as the place where the agent tracks:

- what part of the slice is being implemented now
- what contract amendments were required
- what remains incomplete inside that slice
- what has been made real in code

## Implementation sequence

Implementation should proceed in this order unless a narrower doc explicitly
states otherwise:

1. Preflight cleanup and contract freeze
2. Repo/runtime scaffold
3. Serve-side substrate
4. Serve SQL baseline + migrations
5. Warehouse SQL baseline + migrations
6. Ingest lane
7. Canonical corpus selection + canonical-boundary promotion
8. Targeted evidence-text acquisition
9. Chunking / evidence-unit lane
10. Projection + active pointer
11. OpenSearch plane
12. Retrieval cascade
13. Graph bundles + browser runtime integration
14. Wiki runtime integration
15. Observability + quality
16. Backup + recovery
17. Auth only when activation is explicitly chosen

## Selected-corpus contract

The locked stage hierarchy is:

- `full upstream raw`
  - `s2_*_raw`
  - `s2_authors_raw`
  - `s2_paper_authors_raw`
  - broad paper-level citation aggregates
  - `pubtator.*_stage`
- `corpus`
  - `solemd.corpus` membership plus the baseline canonical paper surfaces
    `papers` and `paper_text`
  - selection audit/provenance surfaces:
    `corpus_selection_runs`, `corpus_selection_signals`,
    `paper_selection_summary`
- `mapped`
  - the stricter paper-level active universe inside corpus
  - mapped-owned heavy surfaces such as `paper_authors`,
    canonical `pubtator.entity_annotations`, canonical `pubtator.relations`,
    and actual paper-to-paper citation edges in `paper_citations`
- `evidence`
  - the smaller full-text / chunking / grounding subset inside mapped
  - owns evidence-wave membership, canonical document acquisition,
    document-spine child work, and in-text `paper_citation_mentions`

Two scope predicates matter:

- broad canonical corpus membership = `c.domain_status IN ('corpus', 'mapped')`
- mapped paper-level active-universe membership = `c.domain_status = 'mapped'`

Mapped now absorbs what older drafts called "warm": paper-level embeddings,
UMAP / graph rollout, and paper-grounded retrieval/indexing are rollout
behaviors over mapped papers, not a separate durable status tier.

Evidence replaces the older business "hot" label. The current first-wave
runtime now uses `evidence` as the worker/queue/actor name for
evidence-acquisition dispatch.

The worker runtime now enforces the split directly with separate
`corpus_baseline_materialization` and `mapped_surface_materialization`
phases without changing the public ladder above.

The corpus contract therefore has three distinct jobs:

1. decide what enters the selected canonical corpus from raw upstream data;
2. decide which admitted papers are promoted into the mapped paper-level active
   universe;
3. materialize only the baseline corpus surfaces at corpus scope and reserve
   heavier fanout / full-document surfaces for mapped and evidence child waves.

Selection is not just labeling rows. It is also the boundary that determines
what gets promoted into the durable canonical paper layer.

## Implementation checklist

Use this checklist as the cross-session progress tracker. Only mark an item
done when the code and docs both reflect reality.

- [x] Repo boundaries locked under `apps/`, `packages/`, `db/`, `infra/`, and
  `scripts` (`15-repo-structure.md`)
- [x] Thin AI Workbench-aware project layer added for local Graph development
- [x] Stale migration/auth vocabulary sweep completed (`Atlas`, `HCL`,
  `@better-auth/cli`, `Drizzle`, `*.hcl`, and related obsolete terms removed or
  explicitly marked historical/comparison-only; working slice: `12-migrations.md`)
- [x] Version inventory established in one canonical file (`16-version-inventory.md`; Slice 1 now locks the local runtime and Python package pins that are real in code)
- [x] `.env.example` finalized for the rebuild contract
- [ ] Testcontainers migration dry-run passing on empty fresh databases only
- [x] Graph-local runtime scaffold created under `infra/docker/`
- [x] `graph-db-warehouse` implemented
- [x] `graph-db-serve` implemented
- [x] `pgbouncer-serve` implemented
- [x] `graph-redis` implemented
- [x] Minimal `apps/api` runtime shell implemented
- [x] Minimal `apps/worker` runtime shell implemented
- [x] Serve SQL baseline landed under `db/schema/serve/`
- [x] Serve migration chain landed under `db/migrations/serve/`
- [x] Warehouse SQL baseline landed under `db/schema/warehouse/`
- [x] Warehouse migration chain landed under `db/migrations/warehouse/`
- [x] Ingest lane implemented
- [x] First-wave corpus-selection builder + mapped-wave evidence dispatch landed
- [ ] Corpus-selection contract fully owns canonical corpus promotion/backfill into the selected paper/fact layer
- [ ] Chunking / evidence-unit lane implemented
- [ ] Projection + active pointer implemented
- [ ] OpenSearch plane implemented
- [ ] Retrieval cascade implemented
- [ ] Graph bundle build/export/serve path implemented
- [ ] Browser graph runtime consuming checksum-addressed bundles
- [ ] Wiki sync/activation + read/context path implemented
- [ ] Observability stack wired for the rebuilt backend
- [ ] Backup/recovery flows wired for the rebuilt backend
- [ ] Auth remains deferred unless explicitly activated

## Status conventions

There are two kinds of status in this folder:

- The table below tracks **document status**.
- The checklist above tracks **implementation status**.

Do not confuse a doc being locked with the corresponding backend slice being
implemented.

There is also a working-surface distinction:

- this README tracks whole-program progress
- the active numbered doc tracks the current slice’s implementation state

## Status

| #  | Area                                    | File                         | State                                 |
|----|-----------------------------------------|------------------------------|---------------------------------------|
| 00 | Physical topology                       | `00-topology.md`             | locked (microdesign provisional)      |
| 01 | Storage layout                          | `01-storage.md`              | locked (volume inventory)             |
| 02 | Warehouse schema (SQL + prose)          | `02-warehouse-schema.md`     | locked (microdesign provisional)      |
| 03 | Serve schema (SQL + prose)              | `03-serve-schema.md`         | locked (microdesign provisional)      |
| 04 | Warehouse → serve projection contract   | `04-projection-contract.md`  | locked (microdesign provisional)      |
| 05 | Ingest pipeline (parquet → warehouse)   | `05-ingest-pipeline.md`      | locked (microdesign provisional)      |
| 05a| Chunking — strategy, registry, writer   | `05a-chunking.md`            | locked (microdesign provisional)      |
| 05b| Graph bundles — build / export / serve  | `05b-graph-bundles.md`       | locked (microdesign provisional)      |
| 05c| Browser DuckDB runtime                  | `05c-browser-duckdb-runtime.md` | locked (microdesign provisional)   |
| 05d| Wiki runtime                            | `05d-wiki-runtime.md`        | locked (microdesign provisional)      |
| 05e| Canonical corpus selection              | `05e-corpus-selection.md`    | implemented in first wave (selector + mapped/evidence dispatch landed; full canonical corpus promotion/backfill into paper/fact tables still follow-on) |
| 05f| Evidence-text acquisition               | `05f-evidence-text-acquisition.md`| implemented in first wave (PMC BioC worker/runtime landed for the evidence lane; policy expansion remains provisional) |
| 06 | Async Python stack + pools + migrations | `06-async-stack.md`          | locked (microdesign provisional)      |
| 07 | OpenSearch serving plane                | `07-opensearch-plane.md`     | locked (microdesign provisional)      |
| 08 | Retrieval cascade (three-stage)         | `08-retrieval-cascade.md`    | locked (microdesign provisional)      |
| 09 | Per-role PG 18 tuning                   | `09-tuning.md`               | locked (microdesign provisional)      |
| 10 | Observability (metrics, logs, traces)   | `10-observability.md`        | locked (microdesign provisional)      |
| 10a| RAG quality analyzer (local)            | `10a-rag-quality-analyzer.md`| locked (microdesign provisional)      |
| 11 | Backup and recovery                     | `11-backup.md`               | locked (microdesign provisional)      |
| 12 | Migration tooling and schema lifecycle  | `12-migrations.md`           | locked (microdesign provisional)      |
| 13 | Auth / user-data plane                  | `13-auth.md`                 | spec locked; activation deferred      |
| 14 | Cross-doc implementation handoff        | `14-implementation-handoff.md` | locked (through-line + drift control) |
| 15 | Repo structure + deployment boundaries  | `15-repo-structure.md`      | completed (repo shape + deploy roots) |
| 16 | Canonical version inventory             | `16-version-inventory.md`   | completed (canonical inventory + normalization rules; Slice 1 local runtime and Python pins landed, other exact pins remain provisional) |
| -- | 2026 research synthesis                 | `research-distilled.md`      | archive of the research behind these  |

## Companion documents

- `docs/rag-future.md` — strategic canon: logical data model, identity glossary,
  evidence ontology, cascade strategy
- `docs/map/database.md` — live runtime schema reference; partial, and
  superseded here by `02-warehouse-schema.md` + `03-serve-schema.md` once those
  land
- `docs/map/graph-runtime.md` — browser graph layer model; the human-facing
  companion to `05b` + `05c`
- `docs/map/wiki.md` and `docs/map/wiki-generation.md` — human-facing wiki
  runtime/generation maps; companions to `05d`
- `.claude/skills/graph/references/runtime-infrastructure.md` — runtime
  substrate contract (host, storage, compose ownership, ports)
- `.claude/skills/langfuse/references/benchmarking.md` — RAG quality feedback
  loop and benchmark policy

`research-distilled.md` is an archive of the research behind the contract. It
may retain historical tool comparisons such as Atlas or Drizzle. Those mentions
are context only, not implementation instructions.

## Authoring rules

- Each file answers one concern end-to-end. Cross-reference; do not duplicate.
- Every decision is labeled **locked**, **provisional**, or **deferred**.
- Primary sources stay in `research-distilled.md` so per-area docs read as
  narrative, not linkfarm.
- Schema-bearing docs are now SQL-first. Do not reintroduce an Atlas-Pro
  dependency into the implementation plan.
- Microdesign values are provisional until proven on a sample build.
