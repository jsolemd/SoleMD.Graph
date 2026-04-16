# SoleMD.Graph — Biomedical Knowledge Graph

> **SCOPE**: You are working in **SoleMD.Graph** only.
> Do NOT modify files in other SoleMD.* projects unless explicitly requested.
>
> - Project: `solemd.graph`
> - Schemas: `solemd`, `pubtator`
> - Workspace: `/workspaces/SoleMD.Graph`
>
> **TRUSTED RELATIONSHIPS** (read-only):
> - Infra: Shared services (database, MCP servers)
> - Graph-overlay: Parallel graph branch for runtime and product comparisons
>
> **FORBIDDEN**: Never modify other SoleMD.* project source files.
> **HAND-OFF**: See `/workspaces/CLAUDE.md` for cross-project protocol.

## TL;DR

Next.js 16 frontend + Python data engine. Cosmograph graph viz + DuckDB-WASM. PostgreSQL 16 + pgvector (Docker, port 5433). PubTator3 + Semantic Scholar pre-computed data.

## Environment

| Context | Details |
|---------|---------|
| Frontend | Next.js 16, App Router, Mantine 8, Tailwind CSS 4 |
| Engine | Python 3.13 (uv-managed) in `engine/` |
| Database | PostgreSQL 16 + pgvector 0.8.2 (Docker, port 5433) |
| Task queue | Dramatiq + Redis (Docker, port 6380) |

## Quick Commands

```bash
npm run dev                    # Next.js dev server
npm run build && npm run lint  # Build + lint
cd engine && uv run pytest     # Engine tests
```

## Engineering Workflow

For code work in SoleMD.Graph, treat `/clean` as the default engineering contract,
not as an optional cleanup pass after the fact.

- Apply `/clean` principles to every coding task: native solutions first, thin
  adapters, zero duplicate work, centralization, modularization, and performance
  discipline.
- Use CodeAtlas reconnaissance before non-trivial edits to find existing
  implementations, reusable modules, native platform capabilities, adapter
  boundaries, and blast radius.
- If the user invokes `/clean`, interpret that as `/clean` + `/codeatlas`.
  `/clean` without live CodeAtlas recon is incomplete.
- Scale recon depth to risk. Tiny or non-code tasks do not need a full cleanup or
  architecture pass, but any meaningful code change should start with CodeAtlas.

## Frontend Performance

Frontend latency and graph-runtime performance rules are canonical requirements in:

- `docs/map/frontend-performance.md`

Any agent changing shell startup, DuckDB-Wasm/bootstrap, panel query orchestration,
selection/scope resolution, or Cosmograph runtime paths must read and follow that
document before editing code.

## Docs

| Topic | Location |
|-------|----------|
| Entry point + reader journey | `docs/map/map.md` |
| Hard boundaries + adapters | `docs/map/architecture.md` |
| Database schema | `docs/map/database.md` |
| Frontend latency + runtime rules | `docs/map/frontend-performance.md` |
| Ingest (PubTator3 + S2 + warehouse) | `docs/map/ingest.md` |
| Graph build (engine pipeline) | `docs/map/graph-build.md` |
| Graph runtime (browser + DuckDB + bundle) | `docs/map/graph-runtime.md` |
| RAG runtime | `docs/map/rag.md` |
| RAG benchmark | `docs/map/benchmark.md` |
| Product vision + roadmap | `docs/design/vision.md` |
