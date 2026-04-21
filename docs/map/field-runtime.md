# Field Runtime

Date: 2026-04-18
Status: canonical product contract

## Purpose

Define the current field runtime truth and the future extension path.

Current mounted runtime:

- the homepage landing experience
- `/field-lab`

Not the current field runtime:

- inline wiki modules inside the panel shell
- expanded module views
- the bridge into the live graph workspace

Those surfaces may adopt field patterns later, but today they use
separate runtime layers and should not be described as already sharing the
landing field runtime.

Recommended naming:

- the product runtime should be called the `Field`
- the code package should live at `apps/web/features/field/`
- internal components and types can keep the shorter `Field*` prefix because
  the package already provides the domain context
- `Evidence Layer` should refer to the semantic overlays, focus states,
  hotspots, and graph-linked actions that sit on top of the field

That gives us a simpler and more truthful name than `field-runtime`, which is
accurate but too generic for this codebase, and more honest than calling the
base renderer an evidence surface before it carries enough evidence semantics on
its own.

This doc treats the Maze pattern as the starting point for runtime architecture,
not as a branding reference alone.

The long-range objective is still to avoid two completely unrelated systems,
but the current canonical truth is narrower:

- one dedicated landing field runtime
- separate wiki/module runtime layers that may reuse motion primitives without
  yet mounting the same field runtime

This runtime is currently the canonical standard for:

- the landing page
- homepage story chapters
- `/field-lab`

This runtime is not an optional visual enhancement. It is the default module
standard for the product direction described here:

- every module should inherit the living field by default
- the graph is always present in some form
- DOM overlays teach on top of the field rather than replacing it
- the module surface changes flavor by scene, emphasis, and overlays, not by
  abandoning the shared graph substrate

Important clarification:

- this runtime is not a lightweight Cosmograph clone
- this runtime does not need to render the live graph itself
- this runtime should reproduce the feeling of the graph as a continuous visual
  through-line for the product
- Cosmograph remains a deeper background or expanded exploration layer, not the
  implementation target for modules

## What We Are Copying From Maze

The part worth copying is the frontend field architecture:

1. one persistent field runtime
2. one native scroll container
3. one scroll-to-scene controller
4. one DOM overlay layer for readable information

The part we are not copying is their stack or page backend. Maze proves that the
effect comes from composition:

- fixed or pinned graphics layer
- editorial sections scrolling over it
- shader-driven particles in WebGL
- sparse DOM overlays for labels, callouts, controls, and copy

For SoleMD, this is a better fit than a separate full-screen loading screen,
because our graph is only one part of the product surface. Wiki, retrieval,
augmentation, and modules should remain usable before live Cosmograph is ready.

The field runtime should therefore borrow from:

- Maze's persistent-field composition
- SoleMD's graph visual language
- entity and paper semantics from the knowledge web

without requiring the module layer to behave like Cosmograph.

## Core Decisions

### 0. Living field is the default module standard

The target brand and teaching model is:

- modules are not static pages with occasional visualizations
- modules are not separate from the knowledge web
- every module is a guided presentation of the knowledge web

But that does not mean every module background is a direct rendering of the
live graph. The module field should feel graph-native and evidence-aware while
remaining a governed product runtime in its own right.

That means all major modules should inherit the field runtime by
default. Variation comes from the scene system:

- which papers are foregrounded
- which clusters are emphasized
- which evidence anchors are surfaced
- how the field moves, dims, labels, and transitions

The default assumption is not "should this module use the field runtime?" The
default assumption is "how does this module express itself through the field
runtime?"

This is still not an absolute layout rule. Every major module should declare a
field scene, but not every module must center the field at every moment. Some
surfaces will temporarily prioritize:

- dense tabular evidence review
- checklists
- source comparison
- highly linear reading
- mobile-constrained layouts

Continuity with the knowledge web remains mandatory; field dominance in
every viewport is not.

### 1. Landing runtime first, future module adoption later

The homepage landing experience is the first production use of the ambient
field runtime. Future modules may adopt the same runtime family, but they do
not yet mount this same stack today.

The runtime is currently mounted through:

- `apps/web/app/page.tsx`
- `apps/web/app/field-lab/page.tsx`
- `apps/web/features/field/routes/FieldLandingRoute.tsx`

Homepage is `Module Zero` in authoring terms, but wiki modules still use a
separate runtime layer today.

### 1.5. One governed runtime does not require one global mounted canvas

The invariant is:

- one runtime family
- one ambient asset contract
- one scene authoring API
- one resolved scene contract
- one identity space across homepage, modules, and graph bridge behaviors

That does not require one always-mounted DOM canvas for the whole app.

Default implementation rule:

- one active field instance per visible surface
- shared cached ambient asset across surfaces
- shared scene and graph-bridge contracts across surfaces

This avoids forcing a fragile site-level singleton across:

- panel scroll containers
- route transitions
- simultaneous visible surfaces
- reduced-motion fallbacks
- WebGL lifecycle and memory cleanup

### 2. Field is real-data-derived, not live-data-driven

The persistent background field should be built from a release-scoped ambient
asset derived from real graph data.

Do not:

- sample the live graph on module open
- couple modules to DuckDB bootstrap
- invent a fake particle field with no identity continuity

Do:

- generate a thin ambient asset from the same graph release as `base_points`
- preserve stable point identity and coordinate continuity
- keep the asset small enough to load once and reuse site-wide

This keeps the "same dots everywhere" feeling honest while preserving fast
first paint.

However, the runtime does not need strict one-to-one equivalence with
Cosmograph scene state. It can be:

- graph-inspired rather than graph-identical
- semantically linked to papers, entities, and clusters without reproducing the
  full graph workspace
- extended with branded product motifs such as neurons, connective trails, or
  brain-like structures where they support the learning surface

### 3. Ambient mode and live graph mode are distinct

Ambient mode is for:

- atmosphere
- guided explanation
- focus and evidence callouts
- lightweight scene transitions
- a branded field atmosphere that carries through the site

Live graph mode is for:

- full Cosmograph interaction
- dense selection behavior
- graph controls
- links, labels, and richer exploration

The user should feel that modules and wiki surfaces live in the same knowledge
universe as the graph, without requiring the module field itself to become
Cosmograph.

The graph should therefore always be present in some form, but not always at
the same interaction cost. The module standard is:

- field always present
- module overlays and cards teach on top of it
- graph-specific affordances appear only when the user deliberately crosses into
  graph mode or opens graph-linked detail

### 4. Modules declare semantic scene intent, not renderer internals

Modules, homepage sections, and future surfaces should publish declarative scene
states. They should not manipulate Three.js or Cosmograph directly.

The runtime owns:

- point rendering
- scene transitions
- hotspot placement
- label budgets
- graph bridge choreography

### 4.5. Scene manifests are author intent, not renderer input

Modules and homepage sections should author semantic intent. The renderer should
consume resolved scene state only.

Required chain:

```text
FieldSectionManifest
    ->
FieldSceneState
    ->
SceneResolver
    ->
ResolvedFieldScene
    ->
SceneController
    ->
FieldRuntime
```

This keeps:

- module authoring semantic
- renderer input small and stable
- geometry, index resolution, and label selection centralized
- overlay placement free of duplicated projection math

### 5. Full-page mode is a second presentation of the same runtime

Expanded module mode must not fork the implementation. It should reuse the same:

- field renderer
- scene API
- overlay contract
- scroll choreography primitives

Only the container changes.

## Runtime Model

The recommended architecture is:

```text
ambient asset build
    ->
FieldRuntime
    ->
SceneResolver
    ->
SceneController
    ->
OverlayLayer
    ->
SurfaceAdapter
    ->
optional GraphBridge into live Cosmograph
```

### FieldRuntime

Owns the persistent point field.

Responsibilities:

- load one release-scoped ambient asset per graph release
- render points through a lightweight WebGL renderer
- expose imperative camera/focus hooks to the scene controller
- pause or reduce work when hidden
- keep visual identity consistent across surfaces
- know only rendering, visibility, and renderer lifecycle

Public contract should be close to:

```ts
setScene(scene: ResolvedFieldScene): void;
resize(bounds: DOMRect): void;
setReducedMotion(enabled: boolean): void;
setVisibility(mode: "visible" | "hidden" | "suspended"): void;
destroy(): void;
```

Recommended implementation:

- raw Three.js
- `BufferGeometry`
- `Points`
- minimal shader material for size, opacity, emphasis, and focus effects

Do not use full Cosmograph as the persistent ambient layer across the site.

### SceneResolver

Owns the conversion from author intent to renderer-ready state.

Responsibilities:

- resolve semantic IDs to point indices and cluster membership
- compute focus bounds and camera targets
- choose label candidates within budget
- produce overlay anchors
- gate graph-linked behaviors when release identity or semantic compatibility
  does not match

This layer should consume thin projections and ambient asset metadata. It
should not become a rich-content orchestration hub.

### SceneController

Owns scene transitions for a scroll container.

Responsibilities:

- translate resolved scene state into renderer updates
- manage focus, dimming, label mode, and hotspot subsets
- consume a scroll progress driver
- support native panel scroll containers as well as page scroll

Existing starting seam:

- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx`

### OverlayLayer

Owns the readable interface above the field.

Responsibilities:

- paper hotspots
- claim and evidence callouts
- cluster labels
- citations and definitions
- module controls and section affordances

The overlay layer should stay sparse. Dense fields belong in WebGL, not DOM.

The overlay layer should consume resolved anchors. It must not reimplement
projection math or scene geometry.

This is the intended teaching grammar for modules:

- the field carries continuity, motion, and evidence context
- DOM overlays carry legibility, interaction, and explanation
- cards, claims, and callouts should feel embedded into the field rather than
  replacing it with flat page sections

### SurfaceAdapter

Connects the shared field runtime to a concrete surface.

Required adapters:

- homepage adapter
- inline wiki module adapter
- expanded module adapter
- graph bridge adapter

These adapters should only translate container and lifecycle concerns. They
must not introduce alternate scene logic.

### GraphBridge

Owns the relationship between the governed field runtime and the deeper graph
workspace.

Responsibilities:

- open paper, entity, or cluster detail from field/module overlays
- optionally warm graph routes or graph state in the background
- optionally highlight or preselect relevant papers when entering graph mode
- preserve field/module mode if graph navigation is not requested or fails

Graph bridge state can still be modeled explicitly:

```text
field-visible
  ->
graph-preloading
  ->
graph-ready-hidden
  ->
graph-entry
  ->
graph-interactive
  ->
field-resumed
```

Recommended status type:

```ts
type GraphBridgeState =
  | "idle"
  | "warming"
  | "ready"
  | "interactive"
  | "failed";
```

## Data Contract

### Field asset

Build one release-scoped packed ambient asset from the published graph release.

Minimum useful fields:

- `release_id`
- `graph_build_id`
- `projection_id`
- `coordinate_space`
- `coordinate_bounds`
- `cluster_version`
- `palette_version`
- `asset_schema_version`
- `corpus_id`
- `point_index`
- `cluster_id`
- `x`
- `y`
- `tier`
- `importance`
- `color_token`
- `label_rank`
- `has_full_grounding`

The ambient asset is not the full graph bundle. It is a thin projection used as
the shared visual substrate.

Recommended split:

```text
ambient-manifest.json
ambient-points.bin
ambient-label-index.json
```

Where:

- `ambient-manifest.json` carries release identity, bounds, palette version,
  counts, checksums, and schema version
- `ambient-points.bin` carries typed point data
- `ambient-label-index.json` carries sparse label and lookup metadata

Do not default to a large JSON point cloud payload.

### Supporting projection APIs

The field runtime should resolve overlays and drill-ins from thin projections,
not warehouse-wide payloads.

Primary candidates already aligned with repo direction:

- `graph_points`
- `graph_clusters`
- `graph_run_metrics`
- `paper_api_cards`
- `paper_api_profiles`
- `graph_cluster_api_cards`
- `paper_semantic_neighbors`
- `serving_members`
- `serving_cohorts`
- `evidence_key`

If the FastAPI layer adds better purpose-built endpoints later, the scene API
should consume those without changing runtime shape.

The important contract is semantic, not visual equivalence. The runtime should
be able to answer:

- which papers or entities are relevant here
- which overlays should appear here
- what should happen when the user clicks through

It does not need to mirror the exact live graph camera or point layout.

## Scene API

Modules and homepage sections should declare scene state through a semantic API.

Baseline shape:

```ts
type FieldSceneState = {
  focus?: {
    corpusIds?: number[];
    clusterIds?: string[];
    evidenceKeys?: string[];
    cohortIds?: string[];
  };
  view?: {
    preset?: "home" | "cluster" | "selection" | "detail";
    fit?: "focus" | "bounds";
    padding?: number;
    dimStrength?: number;
  };
  labels?: {
    mode?: "none" | "cluster" | "paper" | "evidence";
    ids?: Array<number | string>;
    maxCount?: number;
  };
  hotspots?: {
    ids: Array<number | string>;
    kind: "paper" | "claim" | "cluster";
  };
  transition?: {
    preset: "fade" | "zoom" | "morph" | "bridge";
    durationMs: number;
  };
};
```

This is the authoring API, not the renderer input.

Rules:

- identify focus by stable IDs, never raw screen coordinates
- request labels by semantic group, not absolute positions
- use named transition presets, not module-local shader parameters
- let the runtime resolve text, overlay positions, and budgets

This is how modules get different "paper flavors" while staying on the same
runtime. A module can feel different by changing:

- focus cohort
- cluster emphasis
- hotspot density
- label mode
- dimming profile
- motion preset
- overlay composition

It should not need a different rendering engine.

Recommended internal resolved shape:

```ts
type ResolvedFieldScene = {
  releaseId: string;
  focusPointIndices: Uint32Array;
  focusBounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  emphasizedClusters: string[];
  dimStrength: number;
  cameraTarget: {
    x: number;
    y: number;
    zoom: number;
    padding: number;
  };
  labels: ResolvedFieldLabel[];
  hotspots: ResolvedFieldHotspot[];
  transition: ResolvedFieldTransition;
};
```

## Manifest Schema

Because agentic authoring is a major product goal, the section manifest format
should be treated as a first-class product API.

Baseline shape:

```ts
type FieldSectionManifest = {
  id: string;
  title?: string;
  eyebrow?: string;
  body?: string;
  scene: FieldSceneState;
  overlays?: Array<{
    id: string;
    kind: "claim" | "paper" | "cluster" | "definition" | "cta";
    anchor: {
      kind: "corpus" | "cluster" | "evidence" | "viewport";
      id?: string | number;
      placement?: "left" | "right" | "top" | "bottom" | "center";
    };
    content: {
      title?: string;
      body?: string;
      citationIds?: string[];
      action?: {
        label: string;
        intent: "open-paper" | "open-cluster" | "open-graph" | "expand-module";
        target?: string | number;
      };
    };
  }>;
};
```

Agents should generate and revise manifests, not bespoke React choreography.

## Validation Contract

All field manifests should pass automated validation before they are considered
ready.

Validator responsibilities:

- scene IDs exist in the ambient asset
- referenced papers exist in thin projection APIs
- requested clusters exist in the graph release
- label count stays within budget
- overlay count stays within budget
- no scene uses raw coordinates
- graph-bridge scenes declare a valid focus subset where graph entry is offered
- reduced-motion fallback exists
- release compatibility target is explicit

Target command:

```bash
pnpm validate:field-manifests
```

## Performance Budgets

The field runtime must stay visibly lighter than live graph mode.

Initial budgets:

- ambient asset compressed size: `< 500 KB` target, `< 1.5 MB` upper bound
- initial visible points: `5k-25k`
- maximum ambient points before re-review: `50k`
- DOM overlay nodes: under `100` active, preferably under `40`
- hotspots per scene: `3-12`
- cluster labels per scene: `3-8`
- paper labels per scene: `0-12`
- animation frame budget: under `6-8 ms` on a mid-range laptop
- reduced-motion mode: no continuous camera drift

Without budgets, the field runtime will drift toward a worse version of live
Cosmograph.

## Scroll Progress Abstraction

GSAP `ScrollTrigger` is an acceptable first driver, but module code should not
depend directly on GSAP semantics.

Use a runtime-owned progress abstraction:

```ts
type SceneProgressDriver = {
  subscribe(callback: (state: {
    sectionId: string;
    progress: number;
    direction: "forward" | "backward";
    active: boolean;
  }) => void): () => void;
};
```

This keeps room for:

- GSAP-backed page scroll
- panel-local scroll containers
- reduced-motion step transitions
- keyboard or test playback
- future native scroll timeline adoption

## Graph Bridge Contract

The field runtime and live graph should share enough semantic identity to
support meaningful click-through and optional graph highlighting:

- the same release family when possible
- stable paper, entity, and cluster identities where bridge behaviors exist
- consistent color and category semantics where practical

Recommended bridge behavior:

1. the module or wiki field is already visible
2. overlays expose paper, entity, or cluster-linked interactions
3. if the user chooses graph mode, relevant graph state may warm in the background
4. graph entry can open with a relevant highlight, selection, or focus packet
5. the governed field runtime remains visually coherent whether or not graph
   mode is entered

Avoid:

- making module surfaces depend on Cosmograph readiness
- forcing visual one-to-one parity with the graph workspace
- assuming every field scene must map to a graph camera state
- turning the module field into an underpowered graph clone

If graph warmup or graph navigation fails, the module and wiki field should
remain fully usable.

## Accessibility And Failure Modes

Accessibility and resilience are Phase 1 requirements, not late cleanup.

Minimum requirements:

- reduced-motion mode disables continuous drift and morph-heavy transitions
- overlay content remains real DOM
- CTA actions are keyboard reachable
- hotspots have nonvisual equivalents
- scene changes do not trap focus
- canvas is hidden from accessibility APIs when decorative and named when
  interactive
- module content remains readable if WebGL fails
- high-contrast presentation remains usable

The field is the default product grammar, but the teaching content must not
depend solely on shader state.

## Visual Semantics

Field encoding must not imply evidentiary strength unless tied to a
defined metric.

Default semantic meanings:

- brightness = salience in current scene, not truth
- size = declared importance metric, not vague authority
- halo = selected, cited, or currently referenced
- opacity = contextual relevance
- color = cluster or evidence type
- motion = transition or state change, not epistemic certainty

When appropriate, overlay metadata should also expose:

- evidence type
- grounding status
- date range
- review status
- disagreement or conflict marker

## Homepage And Module Reuse Contract

The homepage should be the first consumer of the runtime and the reference
implementation for later modules.

That means:

- the homepage is not a special case
- modules do not get their own renderer family
- content changes, but runtime mechanics stay shared

Recommended presentation model:

- homepage: full-page field with guided sections and a graph entry CTA
- inline module: pinned field inside the wiki panel scroll area
- expanded module: same runtime in a larger container
- graph mode: optional deeper exploration layer entered through graph-linked
  interactions

The unifying rule is that all of these remain visibly connected to the same
knowledge web. The field is not background decoration. It is the product's
continuous teaching substrate.

## Existing Repo Seams To Reuse

### Current homepage entry

- `apps/web/app/page.tsx`

Today this goes directly to `DashboardShell`. The long-term shape should place
the field runtime at the landing layer, with graph workspace entry as a
transition rather than the only first frame.

### Current module mount

- `apps/web/features/wiki/components/WikiModuleContent.tsx`

This is already the central module loading seam and should remain the module
runtime mount point.

### Current inline/expanded module shell

- `apps/web/features/wiki/components/WikiPanel.tsx`
- `apps/web/features/wiki/module-runtime/shell/ModuleShell.tsx`

These are the right places to host inline field containers and expanded module
presentations without inventing a parallel route family.

### Existing scroll choreography primitive

- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx`

This already proves GSAP `ScrollTrigger` belongs in the module runtime layer.

### Existing live graph shell

- `apps/web/features/graph/components/shell/DesktopShell.tsx`
- `apps/web/features/graph/components/shell/use-dashboard-shell-controller.ts`
- `apps/web/features/graph/cosmograph/GraphRenderer.tsx`

These remain the live graph workspace and graph-bridge target. The field
runtime should sit alongside them as the governed site-wide field layer, not as
an alternate Cosmograph implementation.

## Agentic Build Method

The system must support agentic creation. The user should not have to hand-code
scene choreography or overlay layout.

The recommended method is:

### 1. Runtime-first

Build the reusable runtime before building many modules.

Deliverables:

- shared field renderer
- shared scene API
- shared overlay primitives
- shared graph bridge contract

### 2. Manifest-driven content

Each homepage or module section should be represented by structured data.

At minimum:

- section copy
- scene state
- overlay anchors
- evidence or paper references
- transition preset

Agents should generate and revise these manifests rather than hand-author
custom renderer code per module.

### 2.5. Manifests are validated product assets

Manifests should be treated like any other product contract:

- schema-checked
- release-checked
- budget-checked
- reviewable in pull requests

### 3. Thin semantic authoring surface

Agents should work in terms like:

- "focus this cluster"
- "show three evidence hotspots"
- "label these papers"
- "open graph from this section"

They should not need to hand-tune shaders or absolute coordinates.

This is especially important if all modules inherit the living-field standard.
The runtime must make high-quality field-based modules cheap to generate and
cheap to revise agentically.

### 4. Shared review loop

Every new surface should be reviewed against the same questions:

- does it reuse the shared field runtime?
- does it stay within the semantic scene API?
- does it avoid DOM-heavy dense rendering?
- does it preserve graph identity continuity?
- does it keep live graph concerns out of ambient mode?
- does it preserve explicit visual semantics?
- does it degrade correctly for reduced motion and WebGL failure?

## Delivery Phases

### Phase 0. Canonicalize the architecture

Outcome:

- this doc becomes the working method for homepage and module field work

### Phase 1A. Build the ambient renderer skeleton

Build:

- release-scoped ambient asset export
- ambient renderer with shared point palette and focus controls
- scene API and resolved scene contract
- site-level runtime ownership and caching rules
- reduced-motion and WebGL-failure handling

Do not build:

- full graph interactivity
- links
- broad DOM annotations

### Phase 1B. Build the homepage prototype

Build:

- homepage prototype with `3-5` sections
- sparse overlays
- graph CTA placeholder
- no live graph-bridge requirement yet

### Phase 1C. Build the inline wiki prototype

Build:

- one real inline wiki module on the same runtime
- panel-local field container
- panel-local progress driver
- same manifest shape as homepage

### Phase 1D. Build the expanded module prototype

Build:

- expanded module presentation
- same runtime
- same manifest shape
- larger container only

### Phase 2. Build the scene and validation system

Build:

- section-to-scene manifest format
- scene resolver
- scene controller
- progress-driver abstraction with GSAP as the first implementation
- sparse hotspot and label overlays
- manifest validation tooling
- explicit budgets and enforcement

### Phase 3. Add graph bridge

Build:

- graph-linked entry behaviors from overlays and entities
- optional graph warmup
- selection or highlight packet passed into graph mode where supported
- failure recovery that leaves field/module mode intact

### Phase 4. Polish homepage as the reference implementation

Only after homepage and inline module prototypes share the runtime cleanly.

### Phase 5. Add agentic authoring tools

Build:

- scene and section manifest generation workflows
- review and validation tooling
- reusable authoring templates for homepage sections and modules
- manifest authoring and validation workflows

## Guardrails

- No second visualization stack for modules.
- No renderer API that consumes author manifests directly.
- No DOM element per paper in dense mode.
- No live DuckDB dependency for field scenes.
- No full Cosmograph as the always-on site background.
- No fake ambient semantics that break graph bridge behaviors.
- No homepage implementation that cannot be reused by modules.
- No module implementation that abandons the living field model plus
  evidence-layer contract unless accessibility or reduced-motion fallback
  requires it.
- No claim that a single global mounted canvas is required before profiling
  proves it.
- No requirement that the governed field runtime be visually or mechanically
  identical to Cosmograph.

## Suggested Package Shape

```text
apps/web/features/field/
  asset/
    loadAmbientAsset.ts
    ambientAssetTypes.ts
    validateAmbientAsset.ts

  renderer/
    FieldRenderer.ts
    createPointGeometry.ts
    fieldShaders.ts
    fieldPalette.ts

  scene/
    fieldSceneTypes.ts
    resolveFieldScene.ts
    SceneController.ts
    transitionPresets.ts

  overlays/
    OverlayLayer.tsx
    FieldHotspot.tsx
    FieldLabel.tsx
    FieldCallout.tsx

  scroll/
    SceneProgressProvider.tsx
    gsapScrollDriver.ts
    panelScrollDriver.ts

  surfaces/
    HomepageFieldSurface.tsx
    WikiInlineFieldSurface.tsx
    ExpandedModuleFieldSurface.tsx

  bridge/
    GraphBridgeController.tsx
    graphBridgeTypes.ts

  authoring/
    fieldManifestSchema.ts
    validateFieldManifest.ts
```

## Recommended Starting Point

Start with the homepage and treat it as Module Zero.

That gives the project:

- one production runtime target
- one visual language across the site
- one reusable system for future module work
- one path into the live graph that feels native rather than bolted on

The key rule is simple:

build the field runtime once, then let homepage and modules become different
scene manifests over the same substrate.
