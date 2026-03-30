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
> - App: Reusable code patterns
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

## Docs

| Topic | Location |
|-------|----------|
| System vision map | `docs/map/map.md` |
| Architecture | `docs/map/architecture.md` |
| Data flow | `docs/map/data.md` |
| Database schema | `docs/map/database.md` |
| Graph layout + build | `docs/map/graph-layout.md` |
| Corpus filter | `docs/map/corpus-filter.md` |
| Bundle contract | `docs/map/bundle-contract.md` |
| RAG system | `docs/map/rag.md` |
| PubTator3 pipeline | `docs/map/pubtator3.md` |
| Semantic Scholar | `docs/map/semantic-scholar.md` |
| Living graph design | `docs/design/living-graph.md` |
