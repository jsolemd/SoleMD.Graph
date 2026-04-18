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
  browser-graph/
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
  rebuild.
- `packages/*` are reserved shared roots; no forced extraction was done during
  this cutover.
- Legacy web adapters that still talk to the old backend remain in
  `apps/web/lib/engine` until they are replaced during the rebuild.

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
