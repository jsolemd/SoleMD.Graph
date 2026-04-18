# SoleMD.Graph RAG Overhaul — Working Docs

This folder collects the operational design decisions driving SoleMD.Graph's
clean-slate RAG rebuild. `docs/rag-future.md` remains the strategic canon; the
files here translate that vision into concrete topology, schema, pipelines, and
ops.

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
| 15 | Repo structure + deployment boundaries  | `15-repo-structure.md`      | locked (naming + cutover shape)       |
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

## Authoring rules

- Each file answers one concern end-to-end. Cross-reference; do not duplicate.
- Every decision is labeled **locked**, **provisional**, or **deferred**.
- Primary sources stay in `research-distilled.md` so per-area docs read as
  narrative, not linkfarm.
- Schema-bearing docs are now SQL-first. Do not reintroduce an Atlas-Pro
  dependency into the implementation plan.
- Microdesign values are provisional until proven on a sample build.
