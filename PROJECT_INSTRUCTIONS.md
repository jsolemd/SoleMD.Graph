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

Next.js frontend on `main`, with clean-room backend rebuild targets reserved under `apps/api` and `apps/worker`. Cosmograph graph viz + DuckDB-WASM. PostgreSQL + pgvector. Checksum-addressed graph bundles remain the browser contract.

## Canonical Sources

- `.claude/skills/graph/SKILL.md` - agent-facing architecture and ownership contract
- `docs/rag/15-repo-structure.md` - locked repo shape and cutover boundaries
- `docs/map/map.md` - human-facing ASCII system map
- `.claude/skills/graph/references/frontend-performance.md` - mandatory runtime performance contract
- `.claude/skills/langfuse/references/benchmarking.md` - agent-facing RAG benchmark and Langfuse evaluation workflow

## Environment

| Context | Details |
|---------|---------|
| Frontend | Next.js App Router in `apps/web`, Mantine 8, Tailwind CSS 4 |
| Backend | Clean-room rebuild targets in `apps/api/` and `apps/worker/`; `main` is intentionally frontend-first until those runtimes land |
| Shared packages | `packages/graph`, `packages/api-client`; `packages/ui` is reserved for future shared React primitives |
| Database | PostgreSQL + pgvector; see `docs/map/database.md` and `.claude/skills/graph/references/runtime-infrastructure.md` for runtime substrate and local ports |
| Task queue | Dramatiq + Redis remain the intended worker-plane substrate; see `.claude/skills/graph/references/runtime-infrastructure.md` for local topology and ports |

Pinned local service versions, image tags, and exposed ports live in `.claude/skills/graph/references/runtime-infrastructure.md`. Avoid repeating exact runtime pins in other docs unless that file is also updated.

## Quick Commands

```bash
npm run dev                    # Next.js dev server
npm run build && npm run lint && npm run typecheck
npm test -- --runInBand        # Frontend Jest suite
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

- `.claude/skills/graph/references/frontend-performance.md`

Any agent changing shell startup, DuckDB-Wasm/bootstrap, panel query orchestration,
selection/scope resolution, or Cosmograph runtime paths must read and follow that
document before editing code.

## Docs

| Topic | Location |
|-------|----------|
| Agent-facing architecture contract | `.claude/skills/graph/SKILL.md` |
| Repo structure + cutover boundaries | `docs/rag/15-repo-structure.md` |
| Entry point + reader journey | `docs/map/map.md` |
| Hard boundaries + adapters | `docs/map/architecture.md` |
| Database schema | `docs/map/database.md` |
| Frontend latency + runtime rules | `.claude/skills/graph/references/frontend-performance.md` |
| Ingest (legacy inventory until backend rebuild lands) | `docs/map/ingest.md` |
| Graph build (legacy inventory until backend rebuild lands) | `docs/map/graph-build.md` |
| Graph runtime (browser + DuckDB + bundle) | `docs/map/graph-runtime.md` |
| RAG runtime | `docs/map/rag.md` |
| RAG benchmark + Langfuse eval workflow | `.claude/skills/langfuse/references/benchmarking.md` |
| Product vision + roadmap | `docs/map/vision.md` |
