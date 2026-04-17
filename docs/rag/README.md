# SoleMD.Graph RAG Overhaul — Working Docs

This folder collects the operational design decisions driving SoleMD.Graph's
clean-slate RAG rebuild. `docs/rag-future.md` remains the strategic canon; the
files here translate that vision into concrete topology, schema, pipelines, and
ops.

## Reading order

Start with `00-topology.md` — every other doc lands inside the topology it
defines. Open `research-distilled.md` whenever a provisional decision needs to
be revisited against 2026 best-practice sources.

## Status

| #  | Area                                    | File                         | State                                 |
|----|-----------------------------------------|------------------------------|---------------------------------------|
| 00 | Physical topology                       | `00-topology.md`             | locked (microdesign provisional)      |
| 01 | Storage layout                          | `01-storage.md`              | locked (volume inventory)             |
| 02 | Warehouse schema (HCL + prose)          | `02-warehouse-schema.md`     | locked (microdesign provisional)      |
| 03 | Serve schema (HCL + prose)              | `03-serve-schema.md`         | locked (microdesign provisional)      |
| 04 | Warehouse → serve projection contract   | `04-projection-contract.md`  | locked (microdesign provisional)      |
| 05 | Ingest pipeline (parquet → warehouse)   | `05-ingest-pipeline.md`      | locked (microdesign provisional)      |
| 06 | Async Python stack + pools + migrations | `06-async-stack.md`          | locked (microdesign provisional)      |
| 07 | OpenSearch serving plane                | `07-opensearch-plane.md`     | locked (microdesign provisional)      |
| 08 | Retrieval cascade (three-stage)         | `08-retrieval-cascade.md`    | locked (microdesign provisional)      |
| 09 | Per-role PG 18 tuning                   | `09-tuning.md`               | locked (microdesign provisional)      |
| 10 | Observability (metrics, logs, traces)   | `10-observability.md`        | pending                               |
| 11 | Backup and recovery                     | `11-backup.md`               | pending                               |
| 12 | Migration tooling and schema lifecycle  | `12-migrations.md`           | pending                               |
| 13 | Auth / user-data plane                  | `13-auth.md`                 | deferred                              |
| -- | 2026 research synthesis                 | `research-distilled.md`      | archive of the research behind these  |

## Companion documents

- `docs/rag-future.md` — strategic canon: logical data model, identity glossary,
  evidence ontology, cascade strategy
- `docs/map/database.md` — live runtime schema reference; partial, and
  superseded here by `02-warehouse-schema.md` + `03-serve-schema.md` once those
  land
- `.claude/skills/graph/references/runtime-infrastructure.md` — runtime
  substrate contract (host, storage, compose ownership, ports)
- `.claude/skills/langfuse/references/benchmarking.md` — RAG quality feedback
  loop and benchmark policy

## Authoring rules

- Each file answers one concern end-to-end. Cross-reference; do not duplicate.
- Every decision is labeled **locked**, **provisional**, or **deferred**.
- Primary sources stay in `research-distilled.md` so per-area docs read as
  narrative, not linkfarm.
- Microdesign values are provisional until proven on a sample build.
