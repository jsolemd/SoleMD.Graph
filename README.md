# SoleMD.Graph

Agent-first biomedical knowledge graph runtime.

Human-facing orientation is intentionally minimal.

- Agents should start with `.claude/skills/graph/SKILL.md`.
- Humans should start with `docs/map/map.md`.

## Map

```text
PubTator3 + Semantic Scholar
          |
          v
  Python engine
    -> graph build
    -> RAG runtime
    -> published bundle
          |
          v
  Next.js shell
    -> checksum-addressed graph assets
    -> FastAPI evidence path
          |
          v
  Browser runtime
    -> DuckDB-WASM
    -> Cosmograph
```

## Commands

```bash
solemd op-run graph -- npm run dev
solemd graph start
npm run dev
cd engine && uv run pytest
```
