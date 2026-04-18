# SoleMD.Graph

Clean-room rebuild baseline for the SoleMD.Graph repository.

The legacy Python backend has been snapshotted off `main` and removed from the
active branch. The repository is now organized around the locked cutover
contract in `docs/rag/15-repo-structure.md`.

## Active Structure

```text
apps/
  web/         # active Next.js app
  api/         # reserved for the rebuilt FastAPI surface
  worker/      # reserved for the rebuilt background worker

packages/
  ui/
  graph/
  api-client/

db/
  schema/
  migrations/

infra/
  docker/
  vercel/
```

## Current State

- `apps/web` is the only active application package today.
- `apps/api` and `apps/worker` are intentionally empty and reserved for the
  backend rebuild.
- `packages/graph` is the active shared graph runtime package for runtime
  types, bundle helpers, DuckDB-WASM, and browser-only Cosmograph code.
- `packages/api-client` is the active shared transport package for typed API
  entrypoints, shared response shapes, and normalization helpers.
- `packages/ui` remains reserved until real cross-app UI reuse exists.
- Frontend code now imports directly from `@solemd/graph` and
  `@solemd/api-client`; the old web wrapper layer has been removed.

## AI Workbench

This repo now carries a thin AI Workbench project definition under `.project/`.

- The Graph repo owns only a local project container contract.
- The Workbench container is intentionally light:
  - base image: `nvidia/ai-workbench/python-basic:1.0.8`
  - no GPU requested for the project container itself
  - Node.js 22 and `uv` are installed by [postBuild.bash](/home/workbench/SoleMD/SoleMD.Graph/postBuild.bash)
- Shared GPU and infra services remain outside this repo and continue to be
  owned by `SoleMD.Infra`.

That boundary is intentional:

- `SoleMD.Graph` is Workbench-aware, not Workbench-dominated.
- `SoleMD.Infra` still owns TEI, CodeAtlas, Neo4j, Qdrant, Langfuse, Portainer,
  and MCP infrastructure.
- Vercel and GCP deployment concerns remain separate from AI Workbench metadata.

There is no Graph-local Workbench compose stack yet. If this repo later needs
Workbench-managed local services that are truly Graph-owned, add an explicit
repo-local compose file and wire it through `environment.compose_file_path`
instead of re-owning shared Infra services here.

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
~/.nvwb/bin/nvwb-cli validate project-spec --path "$(pwd)"
```

## Canonical Docs

- Repo shape: `docs/rag/15-repo-structure.md`
- RAG cutover handoff: `docs/rag/14-implementation-handoff.md`
- System map: `docs/map/map.md`
