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

## Commands

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
```

## Canonical Docs

- Repo shape: `docs/rag/15-repo-structure.md`
- RAG cutover handoff: `docs/rag/14-implementation-handoff.md`
- System map: `docs/map/map.md`
