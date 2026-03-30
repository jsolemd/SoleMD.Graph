# SoleMD.Graph — RAG Diagrams

> **Purpose**: visual explanation of the current RAG stack and the intended
> future stack
>
> **Use this with**:
> - `docs/map/rag.md` for the stable contract and current boundaries
> - `docs/plans/full-evidence-system-plan.md` for the working implementation plan

---

## 1. One-Screen Mental Model

The shortest useful summary is:

```text
CURRENT

User
  -> Next.js UI + AI SDK stream
  -> typed web adapter
  -> FastAPI paper-level retrieval
  -> PostgreSQL current tables
  -> paper evidence bundles + graph refs
  -> DuckDB local graph resolution
  -> overlay producers
  -> active canvas
  -> Cosmograph render


FUTURE

User
  -> same Next.js UI + AI SDK stream
  -> same typed web adapter
  -> FastAPI evidence orchestrator
  -> PostgreSQL evidence warehouse + Qdrant
  -> cited spans + inline citation anchors + graph refs
  -> DuckDB local graph resolution
  -> overlay producers
  -> active canvas
  -> Cosmograph render
```

What changes later is the **backend grounding depth**.

What does **not** change is the graph activation boundary:

```text
backend returns graph refs
  -> DuckDB resolves them locally
  -> overlay producers activate them
  -> active canvas updates
  -> Cosmograph renders them
```

No JS point hydration. No backend point indices. No second client-side graph engine.

---

## 2. Current State

### 2.1 Current Layer Stack

```text
+----------------------------------------------------------------------------------+
| CURRENT RAG STACK                                                                |
+----------------------------------------------------------------------------------+
|  USER                                                                            |
|  - asks a question                                                               |
|  - types '@' for Support / Refute                                                |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  FRONTEND INTERACTION LAYER                                                     |
|  Next.js 16                                                                     |
|  - PromptBox / Ask / @ assist                                                   |
|  - Vercel AI SDK streaming UI                                                   |
|  - response tray stays visible beside the graph                                 |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  WEB ADAPTER / CONTRACT LAYER                                                   |
|  - app/api/evidence/chat                                                        |
|  - app/actions/graph                                                            |
|  - lib/engine/graph-rag.ts                                                      |
|  - typed request / response contract                                            |
|  Sends:                                                                         |
|    query, graph_release_id, selected_graph_paper_ref, selection scope,          |
|    evidence_intent                                                              |
|  Receives:                                                                      |
|    answer text, evidence bundles, answer-linked papers, graph signals           |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  FASTAPI PAPER-LEVEL BACKEND                                                    |
|  engine/app/rag                                                                 |
|  - lexical paper retrieval                                                      |
|  - entity-normalized paper recall                                               |
|  - relation-normalized paper recall                                             |
|  - citation-neighbor candidate expansion                                        |
|  - semantic-neighbor expansion from selected paper                              |
|  - paper-level ranking + bundle assembly                                        |
|  - baseline extractive answer                                                   |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  POSTGRESQL CURRENT TABLES                                                      |
|  - solemd.papers                                                                |
|  - solemd.citations                                                             |
|  - solemd.paper_references                                                      |
|  - solemd.paper_assets                                                          |
|  - solemd.entities                                                              |
|  - pubtator.entity_annotations                                                  |
|  - pubtator.relations                                                           |
|  - graph run / release metadata                                                 |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  BACKEND RESPONSE                                                               |
|  - answer (paper-grounded, not span-grounded)                                   |
|  - evidence bundles                                                             |
|  - answer_linked_papers                                                         |
|  - graph signals                                                                |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  DUCKDB LOCAL GRAPH RUNTIME                                                     |
|  - resolve graph_paper_ref -> local paper/node rows                             |
|  - determine: already active / in universe / evidence-only                      |
|  - promote universe rows via overlay producers                                  |
|  - set answer-linked papers as selected                                         |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  COSMOGRAPH                                                                     |
|  - renders only dense active canvas                                             |
|  - graph stays visible while answer/evidence update                             |
+----------------------------------------------------------------------------------+
```

### 2.2 Current Graph Materialization

```text
CURRENT GRAPH RUNTIME

                       +----------------------+
                       |  base_points         |
                       |  always attached     |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       |  universe_points     |
                       |  locally attached    |
                       |  but not all active  |
                       +----------+-----------+
                                  |
                    backend refs  |  local DuckDB resolution
                                  v
                       +----------------------+
                       |  overlay producers   |
                       |  ask / answer / etc  |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       |  active canvas       |
                       |  base + promoted     |
                       +----------+-----------+
                                  |
                                  v
                       +----------------------+
                       |  Cosmograph render   |
                       +----------------------+
```

### 2.3 Current Ask Flow

```text
USER TYPES QUESTION
  |
  v
PromptBox / useChat
  |
  v
/api/evidence/chat
  |
  v
FastAPI RagService.search()
  |
  +--> lexical papers
  +--> entity-seeded papers
  +--> relation-seeded papers
  +--> citation-neighbor papers
  +--> selected-paper semantic neighbors
  |
  v
ranked paper evidence bundles
  |
  +--> baseline answer text
  +--> answer-linked papers
  +--> broader graph signals
  |
  v
frontend receives response
  |
  +--> response tray shows answer + evidence
  +--> DuckDB resolves graph refs
  +--> broader hits may become overlay-active
  +--> answer-linked papers become selected
  |
  v
user sees the answer and the studies on the graph
```

### 2.4 Current `@ Support / Refute` Flow

```text
USER WRITES CLAIM
  |
  +--> types '@'
          |
          +--> chooses Support or Refute
                    |
                    v
          same paper-level backend contract
                    |
                    +--> retrieval intent changes ranking emphasis
                    +--> returned papers still resolve through DuckDB
                    +--> answer-linked papers become selected
```

### 2.5 What Is Real Today vs Not Yet

```text
REAL TODAY
  - paper retrieval
  - paper ranking
  - paper evidence bundles
  - answer-linked paper selection on graph
  - graph overlay promotion through DuckDB

NOT YET REAL
  - cited blocks/sentences
  - inline citations from structured anchors
  - warehouse-grounded contradiction logic
  - final LLM answer synthesis over cited spans
```

---

## 3. Intended Future State

### 3.1 Future Layer Stack

```text
+----------------------------------------------------------------------------------+
| FUTURE RAG STACK                                                                 |
+----------------------------------------------------------------------------------+
|  USER                                                                            |
|  - Ask                                                                           |
|  - @ Support / Refute                                                            |
|  - graph remains visible                                                         |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  SAME FRONTEND INTERACTION LAYER                                                |
|  Next.js + AI SDK                                                                |
|  - prompt / stream / response tray                                               |
|  - no JS evidence hydration into point objects                                   |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  SAME WEB ADAPTER / CONTRACT BOUNDARY                                           |
|  The contract grows in grounding depth, not in graph shortcuts                   |
|                                                                                  |
|  Returns later:                                                                  |
|    answer text                                                                   |
|    inline citation anchors                                                       |
|    cited span packets                                                            |
|    answer-linked papers                                                          |
|    graph signals                                                                  |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  FASTAPI EVIDENCE ORCHESTRATOR                                                  |
|  - paper recall                                                                  |
|  - chunk / block / sentence retrieval                                            |
|  - cited-span assembly                                                           |
|  - inline citation packet assembly                                               |
|  - LLM synthesis from grounded spans                                             |
+-------------------------------------------+--------------------------------------+
                                            |
                    +-----------------------+-----------------------+
                    |                                               |
                    v                                               v
+-------------------------------------------+      +--------------------------------+
|  POSTGRESQL EVIDENCE WAREHOUSE            |      |  QDRANT / VECTOR SERVING       |
|  canonical spine                          |      |  derived retrieval units        |
|  - paper_documents                        |      |  - chunk embeddings             |
|  - paper_sections                         |      |  - later sentence/block search  |
|  - paper_blocks                           |      +--------------------------------+
|  - paper_sentences                        |
|  - paper_entity_mentions                  |
|  - paper_citation_mentions                |
|  - paper_chunks (derived)                 |
+-------------------------------------------+
                    |
                    v
+-------------------------------------------+--------------------------------------+
|  GROUNDED RESPONSE                                                                |
|  - answer text                                                                    |
|  - inline citations                                                               |
|  - cited spans                                                                    |
|  - cited papers                                                                    |
|  - answer-linked graph refs                                                        |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  SAME DUCKDB GRAPH RESOLUTION PATH                                               |
|  - resolve cited / related papers locally                                         |
|  - attach/promote through overlay producers                                       |
|  - answer-linked papers become selected                                           |
+-------------------------------------------+--------------------------------------+
                                            |
                                            v
+-------------------------------------------+--------------------------------------+
|  SAME COSMOGRAPH CANVAS                                                          |
|  - graph remains visible                                                          |
|  - cited studies are visible/selectable                                           |
|  - user can continue exploring from grounded evidence                             |
+----------------------------------------------------------------------------------+
```

### 3.2 Future Grounding Model

```text
FUTURE EVIDENCE SPINE

paper
  |
  +--> sections
         |
         +--> blocks
                |
                +--> sentences
                       |
                       +--> entity mentions
                       +--> citation mentions
                       +--> later chunk membership


RETRIEVAL

paper recall
  -> chunk / block recall
     -> sentence / span grounding
        -> cited-span packet
           -> inline citation anchor
              -> answer-linked paper set
```

### 3.3 Future Graph Materialization

Today the locally attached universe is already available.

Later, when the graphable corpus is larger than the locally attached universe,
the same graph contract should still work:

```text
FUTURE DEMAND-ATTACH PATH

backend returns graph refs
  |
  v
DuckDB checks:
  1. already active?
  2. already in local universe?
  3. not local yet?
         |
         +--> fetch narrow graph rows only for missing refs
         +--> attach/materialize them in DuckDB
         +--> overlay producer promotes them
         +--> active canvas updates

Cosmograph still renders only the active canvas.
```

That means:

```text
global mapped corpus
  != browser-attached universe
  != active canvas
```

Those are three different domains.

---

## 4. Current vs Future: What Actually Changes

```text
STAYS THE SAME
  - Next.js UI
  - AI SDK streaming surface
  - typed web adapter
  - FastAPI as evidence boundary
  - DuckDB local graph resolution
  - overlay producers
  - Cosmograph active-canvas rendering
  - answer-linked papers become selected

UPGRADES LATER
  - backend retrieval depth
  - evidence warehouse
  - chunk/block/sentence grounding
  - cited-span packets
  - inline citations
  - final LLM synthesis quality
  - demand-attachment for graph rows if local universe is no longer enough
```

---

## 5. User Perspective

### 5.1 Ask Today

```text
I ask:
  "What evidence links melatonin to delirium?"

System today:
  1. finds relevant papers
  2. ranks them at paper level
  3. returns a paper-grounded answer
  4. selects answer-linked papers on the graph
  5. may also promote related papers into overlay

What I see:
  - answer text
  - evidence papers
  - selected studies on the graph
  - graph still visible
```

### 5.2 Ask In The Future

```text
I ask:
  "What evidence links melatonin to delirium?"

System later:
  1. recalls papers
  2. retrieves grounded blocks/sentences
  3. synthesizes answer from those cited spans
  4. returns inline citations
  5. selects cited papers on the graph
  6. may also promote semantically related studies into overlay

What I see:
  - answer text with inline citations
  - cited evidence spans
  - cited studies selected on the graph
  - related studies available to explore around them
```

### 5.3 `@ Support / Refute`

```text
I write a sentence
  -> type '@'
  -> choose Support or Refute

Today:
  - paper-level evidence retrieval
  - answer-linked papers selected

Future:
  - cited supporting or refuting spans
  - inline citation insertion
  - cited studies selected on graph
  - nearby related studies promoted into overlay
```

---

## 6. Hard Rules

```text
DO
  - keep graph activation paper-level
  - keep evidence semantics backend-owned
  - keep DuckDB responsible for local graph resolution only
  - keep Cosmograph on dense active tables only

DO NOT
  - hydrate full point metadata into JS
  - send backend point indices
  - put heavy evidence objects into graph point payloads
  - make the browser parse LLM text to discover citations
```

---

## 7. Short Conclusion

```text
CURRENT:
  paper-level RAG baseline with real graph integration

FUTURE:
  warehouse-grounded, inline-cited, LLM-synthesized evidence system

BRIDGE BETWEEN THEM:
  same typed contract
  same DuckDB graph resolution path
  same overlay / selection model
  deeper backend grounding over time
```
