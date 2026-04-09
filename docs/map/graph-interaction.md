# Graph Interaction Runtime

> Canonical interaction model for anything that resolves references into graph
> state, graph annotations, or graph projections.

This doc is the source of truth for how PromptBox, manuscript-writing, answer
inspection, `@` lookup, graph selection, and future interaction surfaces talk
to the live graph.

The core rule is simple:

- **No UI surface owns graph semantics.**
- PromptBox is one client.
- Manuscript mode is one client.
- Selection actions are one client.
- The graph runtime owns resolution, annotation, projection, and observability.

If a new feature needs graph-aware behavior, it must fit into the contracts in
this doc instead of inventing a surface-specific path.

---

## Why this exists

The product is moving toward a live graph:

- submit a prompt and related papers appear
- entities highlight while typing
- hovering an entity opens definition + related-paper context
- clicking a cited paper or concept projects it onto the map
- writing a manuscript reveals the fingerprint of cited sources and how they connect

Those are different UX surfaces, but they are the same runtime problem:

1. identify what the user is pointing at
2. resolve it into graph-relevant objects
3. optionally annotate it
4. optionally project it into graph state
5. measure how long each stage took

The contracts below encode that structure without overfitting to PromptBox.

---

## Contract Stack

### 1. `ReferenceIntent`

This is the entry contract for graph-aware interaction.

It describes:

- what the user or system referenced
- what output is being requested
- optional graph scope context
- optional projection request

It does **not** encode UI-specific behavior.

Examples:

- a prompt entity hover
- an `@` paper mention
- a manuscript citation anchor
- a selected-node neighborhood request
- an answer claim that should light up supporting papers

`origin.surface` exists for observability and orchestration only. Runtime
semantics come from `subjects`, `annotationMode`, and `projection`.

### 2. `ReferenceResolution`

This is the normalized resolved form of an intent.

It separates outputs into:

- `activeGraphPaperRefs`
- `overlayCapableGraphPaperRefs`
- `unresolvedGraphPaperRefs`

This is the structural seam between “I know what the user meant” and “I know
what the map can currently do with it.”

### 3. `GraphAnnotationSet`

Annotations are read-only graph-adjacent UI payloads.

Examples:

- concept definition
- related-paper preview
- citation summary
- connection summary
- manuscript fingerprint summary

Annotations must remain separate from projection. Hovering should be able to
show a card without mutating overlay state.

### 4. `GraphProjectionRequest`

Projection is the act of turning resolved references into map-visible state.

Current and future modes include:

- `highlight`
- `select`
- `overlay`
- `neighborhood`
- `fingerprint`

Projection requests are producer-scoped. They must not mutate unrelated graph
producers.

### 5. `GraphProjectionResult`

This is the canonical output of projection.

It reports:

- active refs
- promoted refs
- unresolved refs
- point ids
- selected indices
- overlay count / revision when relevant

Every surface that projects onto the graph should consume this same result
shape.

### 6. `GraphInteractionTrace`

This is the observability seam for graph interaction.

Stages are:

- `intent`
- `resolve`
- `availability`
- `attach`
- `annotate`
- `project`
- `refresh`
- `render`

This trace is source-agnostic. PromptBox and manuscript interactions emit the
same stage model.

---

## Structural Rules

These are canonical requirements, not suggestions.

1. No surface-specific graph contracts

- Do not create PromptBox-only, manuscript-only, or search-only graph
  projection contracts.
- If a behavior is structurally intent, resolution, annotation, projection, or
  trace work, it belongs in this runtime.

2. Annotation and projection stay separate

- Hover cards, paper previews, and definition payloads are annotations.
- Highlighting, selection, overlay growth, and manuscript fingerprinting are
  projections.
- Do not mutate graph state from annotation-only flows.

3. Producer ownership is explicit

- Every projection-capable interaction family owns its own producer id.
- Projection lifecycles are additive unless an explicit same-producer replace is
  requested.
- Clear only the owning producer unless the user explicitly asks to clear all.

4. Resolution stays graph-aware but UI-neutral

- Resolution may use graph scope, active refs, and overlay availability.
- Resolution must not depend on PromptBox rendering details or manuscript editor
  widget structure.

5. One trace model across all interaction surfaces

- Browser-side performance work and end-to-end observability must use the same
  stage names.
- If a new workflow cannot be described with the canonical stage model, fix the
  model instead of inventing a side channel.

---

## Producer Rules

Overlay ownership is producer-scoped by design and remains so.

Rules:

- no feature may write global overlay state directly
- each interaction family owns one producer id
- clearing one producer must not wipe other producers
- prompt entity projections, RAG answer projections, and manual graph overlay
  actions must coexist

This is what lets future manuscript fingerprinting coexist with prompt-driven
and manual graph expansion.

---

## PromptBox Is Not Special

PromptBox will be the dominant UX surface, but it is not the architectural
center of the graph runtime.

PromptBox should do three things:

1. emit `ReferenceIntent`
2. render `GraphAnnotationSet`
3. request `GraphProjectionRequest`

It should not:

- own overlay semantics
- invent its own graph-resolution path
- mutate graph state outside producer-scoped projection contracts

The same applies to manuscript mode.

---

## Manuscript Fingerprint

Manuscript writing is a first-class future consumer of this runtime.

A manuscript interaction should be modeled as:

- cited papers, claims, concepts, and anchors become `ReferenceSubject`s
- the writer surface emits `ReferenceIntent`
- the runtime resolves those references
- the graph renders a `fingerprint` projection

That fingerprint may include:

- cited source nodes
- supporting / contrasting papers
- citation-neighborhood connectivity
- concept overlays
- cluster-level structure around the cited evidence

The key point is that this does not require a second graph system. It is just
another projection mode over the same contracts.

---

## Observability

Use two layers:

### Internal timing

Internal timings are the ground truth for browser-side graph interaction.

Measure stage timing directly in:

- DuckDB session/query paths
- overlay attachment
- runtime refresh
- canvas emit / first visible render

This is the authoritative source for optimization work.

### Langfuse

Langfuse should wrap higher-level interaction workflows, especially prompt and
manuscript flows that cross browser, backend, and LLM boundaries.

Langfuse should not replace internal graph timings.

The correct model is:

- internal stage timings for performance truth
- Langfuse spans for end-to-end workflow observability

---

## Canonical Type Home

The typed source of truth for these contracts is:

- `features/graph/types/interaction-runtime.ts`

Human-facing docs live here. Runtime implementations should import the shared
types instead of duplicating local shapes.

---

## Implementation Order

Build this runtime in the following order:

1. Add internal timing instrumentation to intent, resolution, availability,
   attachment, projection, refresh, and render boundaries.
2. Add producer-scoped contract tests for active-only refs, overlay-capable
   refs, mixed refs, repeated same-producer mutation, and multi-producer
   coexistence.
3. Add browser E2E for cold base load, first overlay activation, repeated
   overlay updates, prompt-driven highlight, prompt-driven promotion, and clear.
4. Build PromptBox entity hover and projection behavior on top of the shared
   contracts, not a new direct overlay path.
5. Build manuscript fingerprinting as another projection mode over the same
   runtime.

---

## Canonical Types

The canonical type home for this runtime is:

- `features/graph/types/interaction-runtime.ts`

These types are intentionally source-agnostic:

- `ReferenceIntent`
- `ReferenceResolution`
- `GraphAnnotationSet`
- `GraphProjectionRequest`
- `GraphProjectionResult`
- `GraphInteractionTrace`

Any new graph-aware feature should start there before adding surface-specific
state.

---

## Current adoption targets

The next implementation pass should converge the existing graph-aware browser
paths onto this contract stack instead of adding another integration layer.

Primary adoption targets:

- `features/graph/components/panels/prompt/rag-graph-sync.ts`
- `features/graph/components/panels/prompt/use-rag-query.ts`
- `features/graph/components/panels/prompt/use-prompt-box-controller.ts`
- `features/graph/duckdb/session/overlay-controller.ts`
- `features/graph/duckdb/types.ts`
- `features/graph/duckdb/remote-attachment.ts`

What should happen there:

- prompt/RAG flows should emit `ReferenceIntent`
- availability and attachment should normalize into `ReferenceResolution`
- hover/preview payloads should stay in `GraphAnnotationSet`
- overlay/select/neighborhood mutations should converge onto
  `GraphProjectionRequest` and `GraphProjectionResult`
- internal timing should emit `GraphInteractionTrace`

This keeps PromptBox, future manuscript mode, and other interaction surfaces
on the same runtime instead of letting each surface invent its own graph path.

---

## Implementation Rules

1. Do not add PromptBox-only graph contracts.
2. Do not merge hover annotations and overlay mutation into one request.
3. Do not let origin metadata drive core runtime semantics.
4. Do not clear unrelated overlay producers.
5. Do not create a second projection mechanism for manuscript mode.
6. Keep 14M-paper retrieval as backend reservoir logic, not browser render
   logic.
7. Keep browser projection bounded to mapped or attachable graph rows.

---

## Next Build Order

1. Add stage timing to the canonical interaction path.
2. Add producer-scoped overlay contract tests at larger scale.
3. Add browser E2E for prompt-driven and manual projection flows.
4. Build prompt entity hover + projection on these contracts.
5. Build manuscript fingerprinting as another client of the same runtime.
