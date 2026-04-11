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

   HOW DOES THE API BOUNDARY WORK?

      [api.md]         FastAPI endpoint rules, latency classes, request-path patterns

   HOW DOES EVIDENCE RETRIEVAL WORK?

      [rag.md]         retrieval channels, ranking, grounding
         |
         v
      [benchmark.md]   Langfuse-native RAG eval

   WHAT IS THIS TRYING TO BE?

      [../design/vision.md]  product direction + roadmap
      [../design/brand.md]   visual identity + design tokens
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
| [graph-runtime.md](graph-runtime.md) | How does the browser render it? | Bundle contract, three nested layers, DuckDB-WASM rules, crossfilter cost, initial camera / starting frame |
| [api.md](api.md) | How do the backend endpoints behave? | FastAPI endpoint families, error mapping, pooling, shell/context split, serving-index rules |
| [rag.md](rag.md) | How does evidence retrieval work? | RAG runtime, retrieval channels, grounding, answer assembly |
| [benchmark.md](benchmark.md) | How do I measure RAG quality? | Langfuse benchmark pipeline, v2 suites, baseline interpretation |
| [wiki-taxonomy.md](wiki-taxonomy.md) | How are wiki entities categorized and colored? | Two-axis model (semantic group + editorial section), color map, scaling rules |
| [ideas.md](ideas.md) | (placeholder) | Future brainstorming |
| [../design/vision.md](../design/vision.md) | What is this trying to be? | Product direction, capabilities, clinical grounding, roadmap |
| [../design/brand.md](../design/brand.md) | How should it feel? | Colors, typography, motion, graph visual language |

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
npm run build && npm run lint       # build + lint

# Engine
cd engine && uv run pytest          # test suite
cd engine && uv run python -m app.graph.build --run --publish-current --reuse-evidence   # full graph build
cd engine && uv run python db/scripts/refresh_rag_warehouse.py                           # RAG warehouse refresh
cd engine && uv run python scripts/rag_benchmark.py --all-benchmarks --run <name>        # RAG benchmark suite
```

See the individual docs for the full CLI reference.

---

## Footer

- Docs last verified against code: **2026-04-08**
- CodeAtlas index: 649 files, 7,451 chunks, fresh (watcher lag < 60s)
- Project branch: `main`
- LLM readers: use CodeAtlas -- these docs are for humans. Every file path
  cited here was verified via CodeAtlas at the date above, but code moves;
  trust `search_code` / `inspect_symbol` / `file_context` for anything
  beyond orientation.
