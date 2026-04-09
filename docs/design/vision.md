# Vision

> What SoleMD.Graph is trying to be -- and where it's going.

Four capabilities anchored to one graph substrate:
**Explore, Ask, Write, Learn.** Explore ships today. The rest are direction,
not yet runtime.

Clinical grounding: this is built by a consultation-liaison psychiatrist for
cross-specialty neuro/psych work. It is designed as a **non-profit
educational tool**, not a personal scratchpad. That shapes every scope
decision -- from licensing to data retention to what counts as "done."

---

## Product direction

```
   ONE GRAPH. FOUR CAPABILITIES. EVERYTHING ALWAYS AVAILABLE.

   +--------------------------------------------------------+
   |               GRAPH CANVAS (always present)            |
   |                                                        |
   |   +---------+  +---------+  +---------+  +----------+ |
   |   | EXPLORE |  |   ASK   |  |  WRITE  |  |   LEARN  | |
   |   |         |  |         |  |         |  |          | |
   |   | Navigate|  | Question|  | Editor  |  | Lectures | |
   |   | Filter  |  | -> Graph|  | -> Graph|  | + Living | |
   |   | Discover|  | answer  |  | evidence|  | knowledge| |
   |   +---------+  +---------+  +---------+  +----------+ |
   |                                                        |
   |   Target: every capability flows through the same      |
   |   graph substrate. Current runtime: Explore first.     |
   +--------------------------------------------------------+
```

| Capability | Status | What you do | Graph response | Data path |
|---|---|---|---|---|
| **Explore** | SHIPPED | Navigate, filter, zoom, click nodes | Full viewport, highlights, detail panels | DuckDB-WASM -> Cosmograph |
| **Ask** | PARTIAL | Type a question | Evidence bundle + cited papers light up | MedCPT -> pgvector -> FastAPI -> graph highlight |
| **Write** | PLANNED | Draft text in editor, `@` to cite | Supporting + contradicting evidence surfaces | NER + embedding -> dual-signal retrieval |
| **Learn** | PLANNED | Open knowledge article or lecture | Content panel opens, sourced nodes illuminate | Synthesis layer + authored content |

---

## The living graph

The browser opens on a curated base scaffold, then lets the rest of the
mapped universe flow in on demand. The canonical diagram and runtime
implementation live in [graph-runtime.md](../map/graph-runtime.md#three-nested-layers).

What each layer is for, from a product standpoint:

| Layer | Product purpose |
|---|---|
| Base | The opening canvas should feel "already about psych/neuro" without the user having to hunt. Not a recall-maximizing bucket. |
| Universe | The rest of the mapped corpus. Browsable but not rendered until promoted. |
| Overlay | What the user is focusing on right now: a cluster expansion, a RAG answer, a cited neighborhood. |
| Active | Base + overlay as the current working canvas. |
| Evidence | Heavy payloads (full text, citation neighborhoods, PubTator dumps) delivered on demand by the backend. |

**Base admission policy** (detailed in
[graph-build.md](../map/graph-build.md#base-admission)):

```
  base = domain entity evidence
       OR flagship journal
       OR narrow vocab anchor
```

A paper from any organ system qualifies if it carries a domain entity -- a
cardiology paper about QT prolongation from haloperidol gets base because
haloperidol is a `psychiatric_medication` entity. Broad entities
(hypertension, diabetes, nausea) don't create base admission.

The final admission decision is persisted in `solemd.graph_base_points`
(with `base_reason` and `base_rank`). Exported bundle flags
(`is_in_base`, `base_rank`) are derived from that table. The browser
never stores base admission state directly.

---

## The four capabilities

### Explore (SHIPPED)

Navigate the graph directly. Filter by entity type, year, journal, cluster.
Zoom into research communities. Click nodes for detail panels. The current
runtime is the paper graph and its local DuckDB query surface.

The user should feel like they are **expanding a stable map**, not jumping
between maps. The camera stays fixed while the active set changes.

### Ask (PARTIAL)

Type a question in natural language. The question is embedded, matched
against paper embeddings via pgvector HNSW, and the top-K results feed into
a synthesis step. As the answer comes back, cited papers light up on the
graph -- the user sees the evidence landscape form.

**Current state:** retrieval runs live via `RagService.search` and produces
typed evidence bundles. Grounded extractive answers return from
`baseline-extractive-v1`. LLM synthesis to live stream is next.

**Next steps (live LLM synthesis):**
- Streaming LLM generation wired into the live request path
- Per-citation span alignment (already prototyped in
  `warehouse_grounding.py` / `source_grounding.py`)
- Answer verification live (`answer_verification.py` exists but isn't wired)

### Write (PLANNED)

Open the editor panel alongside the graph. As the user drafts, NER extracts
entities from the text and embeds the current sentence. The graph responds
in two channels:

- **Supporting** -- high similarity, same direction -- glows bright
- **Contradicting** -- high citation overlap but distant in embedding space,
  or NEGATIVE_CORRELATE / INHIBIT relations -- pulses differently

Type `@` to cite -- autocomplete finds the top semantically similar papers
in ~100ms.

### Learn (PLANNED)

Learn makes the graph a teaching and knowledge surface.

| Type | What | Updates | Source |
|---|---|---|---|
| Living Knowledge | Auto-synthesized articles per entity or term: definition, key findings, open questions, conflicts | Auto, on monthly refresh | Pipeline + LLM |
| Curated Lectures | User-authored educational content anchored to the graph: step-through slides that illuminate sourced nodes | Manual; "N new papers" badges on new connections | User authoring |

**Living knowledge** -- every entity and key term gets an auto-generated
article. Definitions, key findings across the corpus, open questions,
conflicts. These live on a future Synthesis layer and update automatically
during the monthly refresh cycle. They are the graph's self-understanding.

**Curated lectures** -- user-authored modules anchored to the graph. A
lecture on antipsychotic pharmacology sits near the receptor entity cluster.
As you step through slides, the graph illuminates sourced and related nodes
around you. By the end, the trail of illumination forms the lecture's
fingerprint.

#### Implementation approaches (undecided)

```
   OPTION A: Graph Nodes              OPTION B: Wiki Layer
   ---------------------              --------------------

   Content lives AS nodes on          Content lives in SoleMD.Wiki
   the Synthesis Map layer.           (Quartz), linked to graph
   Click a node -> panel opens        entities by id.
   with knowledge or lecture.

   + Position = meaning               + Rich Markdown authoring
   + Same renderer, no extra app      + Backlinks, tags, search
   + Visible on the graph             + Publishable standalone
   - Scaling: many articles =         - Separate app, separate nav
     many nodes                       - No spatial graph position
   - Limited authoring format
```

May combine both -- wiki for living knowledge (rich text, auto-updated),
graph nodes for curated lectures (position = meaning, step-through).

---

## Clinical grounding

The use cases that shaped this project:

| Concept | Cross-specialty context |
|---|---|
| Delirium | ICU, surgical, geriatric, oncology, medical boarding |
| Lithium | Nephrology, cardiology, endocrine, psychiatry |
| Catatonia | Emergency, neurology, psychiatry, autoimmune |
| Antipsychotics | Cardiology (QT), endocrine (metabolic), renal (dose), psychiatry |
| NMS / serotonin syndrome | Emergency, critical care, psychiatry, anesthesia |
| Encephalopathy | Hepatology, nephrology, psychiatry, infectious disease |

Living knowledge on concepts like these, and curated lectures for trainees
that illuminate the evidence graph as you learn -- that is the non-profit
educational surface. The graph is not a visualization you look at. It is
the space you learn in.

Project scope framing (see memory notes):

- Non-profit educational tool (not a personal scratchpad)
- US hosting required
- Target readers: trainees, C-L consultants, cross-specialty clinicians

---

## Layer modularity contract

The shipping runtime has **one canonical graph layer: `corpus`**. Current
rules:

- Cosmograph and DuckDB boot only the corpus canvas path
- No paper/chunk/geo mode switching in the base runtime
- No new layer widens the core canvas/query contract until the corpus
  runtime foundation is demonstrably stable and fast

Any future layer must be self-contained (own bundle, own DuckDB module, own
canvas adapter, own UI entry, own enable/disable switch) and removable
(disabling must not require editing corpus queries, renaming views, or
leaving dead branches).

The design target is **additive modules**, not shared branching logic. See
[architecture.md](../map/architecture.md#layer-boundary-rule) for the
enforced boundary.

---

## Roadmap

Each item is marked PLANNED (not started / early), IN PROGRESS, or SHIPPED.

### Graph runtime

| Item | Status | Notes |
|---|---|---|
| Corpus-only canvas with Base/Universe/Active | SHIPPED | Browser binds to `current_points_canvas_web` / `current_links_web` |
| Overlay promotion from cluster drill-in | SHIPPED | `overlay_point_ids_by_producer -> active_points_web` |
| Camera-stable overlay activation | SHIPPED | `preservePointPositionsOnDataUpdate` |
| Overlay trigger: citation neighborhood | PLANNED | Uses the same overlay contract |
| Overlay trigger: entity / relation match | PLANNED | Next after citation trigger |
| Overlay trigger: semantic / RAG hit | PLANNED | Bridges `rag.md` retrieval to overlay activation |
| Overlay trigger: backend-ranked mixed | PLANNED | Backend returns a small candidate set |
| Universe-scale widget summaries | PLANNED | Decide local vs remote aggregation |
| In-place overlay validation (no remount, no flicker) | IN PROGRESS | Runtime plumbing done; visual validation remains |
| Visual emphasis policy for overlays | PLANNED | Brighten/enlarge overlay, dim unrelated base |

### Build pipeline

| Item | Status | Notes |
|---|---|---|
| Streaming SRP -> shared kNN -> UMAP + Leiden | SHIPPED | GPU native cuML path |
| `paper_evidence_summary` durable stage | SHIPPED | Restartable base admission |
| Continuous `domain_score` base admission | SHIPPED | Replaces old tier system |
| LLM cluster labels (Gemini, Langfuse-managed prompt) | SHIPPED | Resume-safe, per-batch DB writes |
| Release-scale build split (evidence / layout / base / publish) | IN PROGRESS | See `database.md#rebuild-strategy-at-scale` |
| Universe detail storage revisit | DEFERRED | Parquet-first stays canonical |

### Ingest

| Item | Status | Notes |
|---|---|---|
| PubTator3 tab load + domain filter | SHIPPED | |
| S2 bulk papers load + domain filter | SHIPPED | |
| S2 Batch API enrichment | SHIPPED | See `s2_client.py` docstring |
| BioCXML archive overlay pipeline | SHIPPED | 4-stage archive -> member -> overlay backfill |
| Monthly diff-based S2 refresh | IN PROGRESS | Workflow defined in `s2_client.py` docstring |

### RAG runtime

| Item | Status | Notes |
|---|---|---|
| Paper-first retrieval (live, release-scoped) | SHIPPED | See `rag.md` |
| Chunk-lexical retrieval | SHIPPED | Abstract-first grounding |
| Dense paper retrieval via SPECTER2 query adapter | SHIPPED | |
| Dense chunk ANN | PLANNED | Not in live request path yet |
| Grounded extractive answers (`baseline-extractive-v1`) | SHIPPED | |
| Live streaming LLM synthesis | IN PROGRESS | Modules exist, not wired to request path |
| Answer verification in-line | PLANNED | `answer_verification.py` scaffolded |
| `cited_corpus_ids` as ranking/retrieval control | PLANNED | Crosses web -> engine seam, not active |
| Optional MedCPT reranking (clinician passages) | PARTIAL | Default off, `rag_live_biomedical_reranker_enabled = false` |

### Capabilities above Explore

| Item | Status | Notes |
|---|---|---|
| Ask: natural-language query -> evidence bundle | SHIPPED | Extractive answers live |
| Ask: streaming LLM synthesis | IN PROGRESS | |
| Write: `@` citation autocomplete | PLANNED | |
| Write: live NER + dual-signal graph reaction | PLANNED | |
| Learn: living knowledge articles | PLANNED | Requires Synthesis layer + LLM-synthesized content |
| Learn: curated lectures | PLANNED | Authoring UI + illumination track |
| Learn: approach choice (graph nodes vs wiki layer) | UNDECIDED | Combination likely |

### Infrastructure + scale

| Item | Status | Notes |
|---|---|---|
| Self-hosted PostgreSQL + pgvector (dev port 5433) | SHIPPED | |
| Local development stack (Docker compose) | SHIPPED | |
| Langfuse observability + prompt management | SHIPPED | |
| US dedicated-server production deploy | PLANNED | ReliableSite target |
| Cloudflare R2 for Parquet bundles | PLANNED | Zero-egress for large bundles |
| Backup automation | PLANNED | |
| Release-aware monthly refresh cadence | PARTIAL | Per-dataset release stamps live on `solemd.papers`; automation pending |

---

## Not planned

Hard lines the runtime should not cross:

- No return to `Record<string, unknown>[]` JS point hydration for chunk or
  paper layers
- No full-universe first-paint payload -- the browser should always receive
  a bounded base scaffold and promote on demand
- No browser-side reinvention of visibility or ranking policy (that is
  FastAPI + DuckDB's job)
- No deep layer-switching logic in the base runtime (future layers are
  additive modules)

---

## Companion docs

- [map/architecture.md](../map/architecture.md) -- hard boundaries
- [map/graph-runtime.md](../map/graph-runtime.md) -- browser runtime contract
- [map/graph-build.md](../map/graph-build.md) -- engine pipeline
- [map/rag.md](../map/rag.md) -- RAG runtime
- [brand.md](brand.md) -- visual identity

---

_Last verified against code: 2026-04-08_
