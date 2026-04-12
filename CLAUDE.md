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
> - Graph: Main graph repo for shared patterns
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

## Skills

| Skill | When to Use |
|-------|-------------|
| `/graph` | Architecture, data flow, CLI commands, project structure |
| `/cosmograph` | Graph canvas, DuckDB-WASM, Parquet bundles |
| `/aesthetic` | UI styling, Mantine, Tailwind, design tokens, impeccable design |
| `/naming` | File names, exports, conventions |
| `/code-search` | Find code, callers/callees, Neo4j graph |
| `/chrome-dev` | Browser automation, screenshots, Lighthouse |
| `/solemd` | Ecosystem navigation, Docker, terminal, remote access |

## Quick Commands

```bash
npm run dev                    # Next.js dev server
npm run build && npm run lint  # Build + lint
cd engine && uv run pytest     # Engine tests
```

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
| Brand + visual identity | `docs/design/brand.md` |
