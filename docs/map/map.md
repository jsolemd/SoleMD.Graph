# SoleMD.Graph

> Biomedical knowledge graph for consultation-liaison psychiatry and
> cross-specialty neuro/psych work. GPU-rendered paper map + RAG evidence +
> living knowledge -- all anchored to the same graph substrate.

This file is the door to the rest of the docs. Nothing else should be
duplicated here -- each topic has exactly one canonical home below.

---

## System at a glance

```
   EXTERNAL DATA             ENGINE                  BROWSER
   -------------             ------                  -------

   PubTator3 (NCBI)          PostgreSQL              Next.js shell
     entities                  solemd schema            |
     relations                 pubtator schema          +-- DuckDB-WASM
     BioCXML                      |                     |     (worker, ephemeral)
                                   v                    |
   Semantic Scholar          Python engine              +-- Cosmograph
     papers                    +-- ingest                     (WebGL, GPU)
     SPECTER2                  +-- graph build
     TLDRs                     +-- RAG runtime
     citations                 +-- benchmarks                 ^
     references                                               |
                                    |                          |
                                    v                          |
                              Parquet bundle  --HTTP range-->  +
                              (base / universe /
                               exemplars / documents)          FastAPI
                                                               (evidence + chat stream)
```

---

## Reader paths

Pick a question, follow the arrow.

```
   WHERE AM I?

      [map.md]    <-- you are here

   WHAT ARE THE HARD BOUNDARIES?

      [architecture.md]
         adapter rules (Cosmograph, Langfuse)
         browser runtime contract
         single-corpus-layer constraint

   WHERE DOES THE DATA COME FROM?

      [ingest.md]      external sources + warehouse pipeline
         |
         v
      [database.md]    PostgreSQL schema (solemd + pubtator)
         |
         v
      [graph-build.md] engine: DB rows -> Parquet bundle

   HOW DOES THE BROWSER RENDER IT?

      [graph-runtime.md]  bundle -> DuckDB-WASM -> Cosmograph
         checksum-addressed assets + persistent hot cache

   HOW DOES THE API BOUNDARY WORK?

      [api.md]         FastAPI endpoint rules, latency classes, request-path patterns

   HOW DOES EVIDENCE RETRIEVAL WORK?

      [rag.md]         retrieval channels, ranking, grounding

   WHAT IS THIS TRYING TO BE?

      [vision.md]            product direction + roadmap
      [brand.md]             visual identity + design tokens
```

---

## Document index

| Doc | Answers | Canonical home for |
|---|---|---|
| [map.md](map.md) | Where do I look? | This reader-journey only |
| [architecture.md](architecture.md) | What boundaries can't I break? | Cosmograph + Langfuse adapters, browser runtime contract, tech stack, layer rule |
| [database.md](database.md) | What tables exist? | PostgreSQL schema, migrations, indexes, rebuild strategy |
| [ingest.md](ingest.md) | Where does data come from? | PubTator3 + S2 pipelines, RAG warehouse ingest, BioCXML overlays, operator CLIs |
| [graph-build.md](graph-build.md) | How is the bundle built? | UMAP/Leiden/base-admission pipeline, CLI flags, checkpoint + recovery |
| [graph-runtime.md](graph-runtime.md) | How does the browser render it? | Bundle contract, checksum-addressed asset serving, persistent DuckDB hot-cache rules, three nested layers, crossfilter cost, initial camera / starting frame |
| [field-runtime.md](field-runtime.md) | How do homepage, modules, and graph bridge behaviors share one field runtime? | Ambient asset contract, scene API, scroll choreography, homepage/module reuse, and graph bridge rules |
| [field-implementation.md](field-implementation.md) | How should we build the field runtime in our stack? | Maze audit, R3F/drei/Three/GSAP choices, dependency inventory, package shape, and v1 implementation plan |
| [author-institution-world-runtime.md](author-institution-world-runtime.md) | How should geographic author and institution exploration work? | World asset contract, institution geo anchors, search-first delivery, geography-to-graph handoff |
| [api.md](api.md) | How do the backend endpoints behave? | FastAPI endpoint families, error mapping, pooling, shell/context split, serving-index rules |
| [rag.md](rag.md) | How does evidence retrieval work? | RAG runtime, retrieval channels, grounding, answer assembly |
| [wiki-taxonomy.md](wiki-taxonomy.md) | How are wiki entities categorized and colored? | Two-axis model (semantic group + editorial section), color map, scaling rules |
| [ideas.md](ideas.md) | (placeholder) | Future brainstorming |
| [vision.md](vision.md) | What is this trying to be? | Product direction, capabilities, clinical grounding, roadmap |
| [brand.md](brand.md) | How should it feel? | Colors, typography, motion, graph visual language |

Agent-only operational contracts live in:
- `.claude/skills/graph/references/runtime-infrastructure.md`
- `.claude/skills/graph/references/local-networking.md`
- `.claude/skills/graph/references/frontend-performance.md`
- `.claude/skills/langfuse/references/benchmarking.md`

---

## The living graph in one diagram

```
+-------------------------------------------------------------------------+
|  DOMAIN CORPUS  (PostgreSQL, ~14M rows, full metadata + retrieval)      |
|                                                                         |
|  +---------------------------------------------------------------+     |
|  |  UNIVERSE POINTS  (mapped, one run, premapped Parquet)        |     |
|  |                                                               |     |
|  |  +---------------------------------------------------------+  |     |
|  |  |  BASE POINTS  (autoloaded first-paint scaffold)         |  |     |
|  |  |    rule-backed, flagship, narrow vocab anchor          |  |     |
|  |  +---------------------------------------------------------+  |     |
|  |                                                               |     |
|  |  + OVERLAY POINTS  (promoted subset of universe)              |     |
|  |  + ACTIVE CANVAS   (DuckDB-local view: base + overlay)        |     |
|  +---------------------------------------------------------------+     |
|                                                                         |
|  + EVIDENCE PATH  (FastAPI: citation neighborhoods, full text)          |
+-------------------------------------------------------------------------+
```

The canonical home for this diagram is
[graph-runtime.md](graph-runtime.md#three-nested-layers). Other docs link there.

---

## Quick commands

```bash
# Frontend
npm run dev                         # Next.js dev server
solemd op-run graph -- npm run dev  # canonical 1Password-backed frontend start
npm run dev:stack                   # interactive tmux supervisor for the frontend-only checkout
npm run dev:stack:start             # start frontend (:3000) in the managed tmux session
npm run dev:stack:clean             # stop the dev session + prune Codex/Claude session artifacts older than 7 days
npm run dev:stack:attach            # attach to the tmux dev session
npm run build && npm run lint && npm run typecheck

# Backend rebuild
# apps/api and apps/worker are reserved roots; no canonical local backend commands yet
```

See the individual docs for the full CLI reference.

---

## Footer

- Docs last verified against code: **2026-04-13**
- Project branch: `main`
- LLM readers: use CodeAtlas -- these docs are for humans. Every file path
  cited here was verified against the repo at the date above, but code moves;
  trust live CodeAtlas and the skill references for anything beyond orientation.
