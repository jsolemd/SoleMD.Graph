---
name: ambient-field-modules
description: |
  Ambient Field runtime contract for SoleMD.Graph modules and landing surfaces.
  Use when building or reviewing homepage ambient-field surfaces, wiki modules,
  expanded module views, evidence overlays, scene manifests, graph bridge
  behavior, or scroll-driven chapter systems that sit on the shared ambient
  substrate. Companions: /aesthetic for shell styling, /animation-authoring for
  motion craft, /learn-modules for educational interaction shells, /graph for
  live graph boundaries.
version: 1.6.0
---

# Ambient Field Modules

> Canonical sources:
>
> - `docs/map/ambient-field-runtime.md`
> - `docs/map/ambient-field-implementation.md`
> - `docs/map/ambient-field-best-practices.md`
> - `references/maze-particle-runtime-architecture.md`
> - `references/maze-source-artifact-index.md`
> - `references/maze-shader-material-contract.md`
> - `references/maze-stage-overlay-contract.md`
> - `references/maze-asset-pipeline.md`
> - `references/maze-model-point-source-inspection.md`
> - `references/maze-mobile-performance-contract.md`
> - `references/maze-rebuild-checklist.md`

This skill is the contract for any module or landing surface that uses the
Ambient Field as the default knowledge-web substrate.

## Use This Skill When

- the user mentions `ambient field`, `field runtime`, `evidence layer`,
  `graph bridge`, `module background`, `scene manifest`, `overlay anchors`, or
  `scroll-driven chapters`
- a homepage section, wiki module, or expanded module should feel like it lives
  inside the same visual world as the graph
- a task risks turning the current prototype into the long-term architecture

Do not use this skill for:

- pure Cosmograph runtime work with no ambient/module surface
- static prose-only module work that does not touch the shared field runtime

## Current Repo Reality

As of `2026-04-18`, the homepage runtime is no longer just a prototype shell.
The canonical implementation now lives in:

- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx`
- `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`
- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/asset/point-source-registry.ts`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts`

Important reality checks:

- `point-source-registry.ts` is now the active source-of-truth for homepage
  point spaces:
  - `blob` from sphere points
  - `stream` from line points
  - `pcb` from bitmap-like raster points
- `FieldScene.tsx` now consumes those point sources directly and resolves the
  current stage item family through shared loops instead of hand-wired one-off
  scene code.
- `ambient-field-scroll-state.ts` now consumes a surface-authored scroll
  manifest, so carry windows and emphasis math live in data rather than inside
  the resolver body.
- `ambient-field-scroll-driver.ts` is now a generic scroll controller with an
  optional overlay adapter, not a landing-only marker implementation.
- the landing process chapter owns its own overlay adapter in
  `surfaces/AmbientFieldLandingPage/ambient-field-process-stage-controller.ts`,
  but the controller/runtime seam is reusable.

What is still not complete:

- model-backed point adapters for `World`/`Shield`/`Users`-class scenes
- preload plus eviction discipline for heavier asset families
- a fully surface-agnostic `FieldSectionManifest -> SceneResolver` layer shared
  across homepage, wiki, and learn modules
- visibility-aware clock demotion when future surfaces can safely move from
  continuous animation to demand-driven rendering

Do not regress this into page-local GSAP scripts or separate background systems.
Future modules should extend these seams, not fork them.

## Canonical Particle Parity Rules

Future ambient-field work should treat the current landing renderer as the
canonical particle contract:

- one shared point-material family across scene slugs
- scene identity comes from source coordinate spaces first:
  - `blob` from sphere points
  - `stream` from a flat x-axis line with funnel attributes
  - `pcb` from bitmap space with mirrored depth
- visible color motion comes from shader noise, not from geometry `color`
  attributes and not from extra DOM glow layers
- perspective scaling is part of the look:
  - nearer points should read larger and brighter
  - mobile clarity should come from smaller preset/runtime point sizes, not CSS
    blur or post-process haze
- the point sprite contract should stay tight:
  - `32x32`
  - hard bright core
  - short feather
  - no wide halo wash

If a future change makes the field read as fog again, fix it in this order:

1. point sprite edge softness
2. point-size ceilings and mobile preset sizing
3. source coordinate density
4. only then consider shader changes

## Maze Archive And Reference Flow

The raw Maze homepage snapshot now has two local homes:

- disposable working mirror: `/tmp/maze/`
- repo-local archive mirror: `data/research/mazehq-homepage/2026-04-18/`
- local CodeAtlas snapshot library: `/codeatlas/mazehq-homepage`

The repo-local archive includes:

- `downloaded-at.txt`
- `source-urls.txt`
- `sha256sum.txt`
- mirrored HTML, JS, CSS, SVG, PNG, and `.glb` assets
- `derived/overview.md`
- `derived/runtime-architecture-map.md`
- `derived/chapter-selector-map.md`
- `derived/asset-pipeline-map.md`
- `derived/model-inspection.md`
- `derived/doc-search-review-playbook.md`

The local CodeAtlas snapshot library includes:

- the derived markdown maps under `2026-04-18/derived/`
- the two key raw source artifacts:
  - `2026-04-18/index.html`
  - `2026-04-18/scripts.pretty.js`
- derived markdown is reverse-engineered reference material generated from
  captured source files, not authored upstream documentation
- a fast retrieval surface for selectors, assets, chapter mapping, runtime
  tokens, and source-file lookup; it is not a structural code graph
- CSS, SVG, checksum, and source-url artifacts remain in the raw archive for
  manual confirmation, but they are intentionally not primary doc-search
  targets

Important boundary:

- the raw archive is for local reverse-engineering and is gitignored via
  `data/`
- the reusable knowledge belongs in this skill and its reference files
- future agents should search this skill, its references, and the local
  CodeAtlas snapshot first, then drop into the raw archive only when they need
  line-level confirmation
- if derived docs disagree with mirrored source artifacts such as `index.html`,
  `scripts.pretty.js`, `styles.css`, or the mirrored SVG assets, prefer the
  mirrored source artifacts
- provenance files such as `source-urls.txt` and `sha256sum.txt` establish
  inventory and traceability; they do not by themselves prove runtime behavior
- `/codeatlas/mazehq-homepage` is for evidence retrieval from the snapshot
  archive, not for ownership or call-graph reasoning

## Reference Guide

Use the focused reference that matches the job instead of reopening the full
parity spec every time:

- `references/maze-source-artifact-index.md`
  - local mirror paths, inventory, checksums, and high-value grep entrypoints
- `references/maze-particle-runtime-architecture.md`
  - high-level architectural summary and motion grammar
- `references/maze-shader-material-contract.md`
  - attributes, uniforms, transform order, exact constants, and shader quirks
- `references/maze-stage-overlay-contract.md`
  - singleton stage, controller-per-anchor behavior, hotspot/stream/progress
    overlays, and chapter choreography
- `references/maze-asset-pipeline.md`
  - procedural, bitmap, and model-backed point sources plus the recommended
    SoleMD asset pipeline
- `references/maze-model-point-source-inspection.md`
  - archived `.glb` bounds, upload counts, retained attributes, and model scene
    parity rules
- `references/maze-mobile-performance-contract.md`
  - bootstrap, preload, DPR, resize, reduced-motion, mobile branches, and perf
    rules
- `references/maze-rebuild-checklist.md`
  - supplemental ship checklist mirror; the reusable canonical checklist now
    lives in this skill

## Maze Homepage Working Set

Treat this section as the reusable fast handoff for implementation planning.
This content belongs in the skill, not only in temporary Maze reference files.

### Authority And Retrieval Order

Authority order for Maze behavior:

1. this skill
2. focused Maze reference docs under `.claude/skills/ambient-field-modules/references/`
3. mirrored source artifacts in `data/research/mazehq-homepage/2026-04-18/`

Lookup order during implementation/review:

1. this skill
2. `/codeatlas/mazehq-homepage`
3. open the returned artifact or derived note with `read_doc` or `expand_doc_chunk`
4. drop to the raw archive when line-level confirmation is needed

### Homepage Section Inventory

```text
global shell      quick-access, fixed stage, header, mobile menu
section-welcome   hero shell + clients; owns blob controller and hotspot grammar
section-story-1   first story triptych; blob carry continues; progress 01-03
section-graph     sticky hybrid stream chapter; WebGL + SVG + DOM markers
section-story-2   second story triptych; progress 01-03; graphRibbon/events DOM
module--slider    quote/testimonial carousel; DOM-only
section-cta       closing CTA; owns pcb controller; carry extends to footer
section-our-blog  article grid; DOM-only
```

Critical ownership rule:

- only `section-welcome`, `section-graph`, and `section-cta` declare
  `data-gfx`
- the story sections do not mount their own WebGL scenes
- story chapters depend on carry, overlays, progress, and DOM choreography
  around the shared fixed stage

### Runtime Anchor Map

```text
section-welcome  data-gfx="blob"    data-gfx-end-trigger="#section-story-2"
section-graph    data-gfx="stream"  data-gfx-sticky
section-cta      data-gfx="pcb"     data-gfx-end-trigger="#footer"
```

Implication:

- the real abstraction is controller-per-anchor with carry windows
- do not rebuild this as one page-global scene switcher

### Timeline Working Map

1. Boot and preload:
   - app shell creates the GFX singleton
   - page-ready waits on the preload promise
   - the render loop starts only after asset preload resolves
2. Welcome / hero:
   - blob controller mounts into the fixed stage
   - welcome copy and client strip run as DOM content over the stage
   - global hotspot pool is projected into `.js-hotspot` nodes
   - `data-scroll="welcome"` and `data-scroll="clients"` are chapter-local DOM
     hooks, not shader-only behavior
3. Story 1:
   - blob carry remains active
   - `.s-progress` tracks `info-1`, `info-2`, and `info-3`
   - the visible experience is narrative DOM plus persistent stage carry
4. Stream / process:
   - stream controller mounts as its own fixed-stage object
   - the chapter also owns a separate sticky DOM shell
   - `flow-diagram-main.svg` and `flow-diagram-main-mobile.svg` provide the
     path backdrop
   - `.js-stream-point` markers and `.js-stream-point-popup` popups are looped
     DOM choreography driven by GSAP, not by the particle shader
5. Story 2:
   - no new `data-gfx` owner is introduced
   - a second `.s-progress` tracks `info-4`, `info-5`, and `info-6`
   - `data-scroll="graphRibbon"` and `data-scroll="events"` power DOM-side
     explanatory beats layered over the shared stage
6. CTA:
   - pcb controller mounts as the final active stage object
   - CTA text and buttons stay DOM-native
   - the carry window extends to `#footer`
7. Post-CTA:
   - slider and article sections are DOM-first surfaces
   - they should not introduce page-local stage forks

### Asset Dependency Map

```text
particle.png                   shared particle sprite for point rendering
pcb.png                        bitmap-to-points source for the CTA controller
logo.png                       bitmap-to-points source in the registry, not active on homepage
flow-diagram-main.svg          desktop stream backdrop in the DOM/SVG layer
flow-diagram-main-mobile.svg   mobile stream backdrop in the DOM/SVG layer
World.glb                      model-to-points registry asset, not active on homepage
Shield.glb                     model-to-points registry asset, not active on homepage
Cubes.glb                      model-to-points registry asset, not active on homepage
Net.glb                        model-to-points registry asset, not active on homepage
Users.glb                      model-to-points registry asset, not active on homepage
```

Important rule:

- homepage parity depends on both stage assets and inline DOM SVG assets
- do not reduce the stream chapter to one shader plus one model
- do not treat the `.glb` registry as proof that those meshes are directly
  rendered on the live homepage

### DOM And Component Equivalence Map

```text
Maze .s-gfx / Os singleton            SoleMD FixedStageManager / AmbientFieldStage
[data-gfx] anchors                    FieldSectionManifest scene entries
scene subclasses (blob/stream/pcb)    SceneObjectControllers resolved per anchor
.js-hotspot pooled nodes              projected overlay pool owned by runtime
.c-stream chapter shell               hybrid chapter adapter over shared stage
.js-stream-point / popup DOM          StreamChapterShell marker + popup overlay layer
.s-progress                           runtime-owned sticky progress component
data-scroll hooks                     chapter-local DOM adapters, not shader features
slider / blog sections                native DOM surfaces outside field ownership
```

Translation rule:

- keep Maze-grade motion grammar
- keep SoleMD shell chrome, typography, tokens, and product semantics
- never import Maze branding, copy, or class names as the end-state API

### High-Value `data-scroll` Hooks

Observed hooks in the captured homepage:

- `welcome`
- `clients`
- `stream`
- `graphRibbon`
- `events`
- `cta`
- `moveNew`

Use them as architectural hints:

- these are chapter adapters or local DOM motion hooks
- they are not permission to scatter page-local GSAP across the product
- future SoleMD implementations should absorb these behaviors into named
  runtime-owned adapters

## Reusable Parity Checklist

This checklist is canonical in the skill and should remain usable even if
individual Maze reference files are removed later.

- preserve one fixed full-viewport stage
- preserve controller-per-anchor ownership
- keep carry windows explicit
- keep source-specific geometry instead of one universal fallback cloud
- keep hotspots, stream markers, and progress in DOM or SVG
- keep stream hybrid rather than shader-only
- keep progress bars separate from the heavy stage runtime
- keep mobile as one runtime family with density and asset swaps, not a second
  architecture
- apply SoleMD shell aesthetics on top of the shared runtime
- reuse the same runtime family in homepage, modules, and graph-bridge surfaces

## SoleMD Aesthetic, Maze Motion

Moving forward, the default rule is:

- SoleMD owns the shell aesthetic:
  - panels
  - prompt bar
  - watermark
  - table of contents
  - typography
  - tokens
  - light and dark behavior
- Maze is the motion and runtime reference:
  - fixed full-viewport stage
  - persistent renderer, scene, and camera
  - controller-per-anchor scene objects
  - source-specific point-cloud geometry
  - carry windows and overlap
  - hybrid DOM, SVG, and WebGL chapter choreography
  - smooth scrubbed progression instead of section-burst swaps

Do not:

- rebuild custom local chrome just to imitate Maze's shell
- fork new page-specific styling systems around the field runtime
- treat Maze parity as permission to copy Maze branding or product semantics

The production target is:

```text
SoleMD shell aesthetics
  +
Maze-grade motion grammar
  +
shared Ambient Field runtime
```

## Default Architectural Shape

When a module or landing surface needs ambient motion, assume this runtime shape
by default:

```text
FixedStageManager
  ->
AssetRegistry
  ->
PointSourceAdapters
    - procedural
    - bitmap to points
    - model vertices to points
  ->
SceneObjectControllers
  ->
ProjectionController
  ->
DOM overlays and chapter UI
  ->
surface adapters
```

Future modules should extend this system, not replace it with:

- per-section canvases
- one-off page-local GSAP scripts
- abrupt preset swapping with no carry window
- one synthetic point field reused for every scene slug

## Canonical Standard

This architecture is now the canonical product direction for:

- the public landing page
- the homepage hero and story chapters
- inline wiki modules
- expanded module surfaces
- future guided graph-bridge presentations

Treat the homepage as `Module Zero`.

That means:

- the landing page is not a special-case marketing build
- modules are not a second system with separate motion rules
- future surfaces should extend the same runtime family instead of inventing
  parallel scene systems

When in doubt, ask:

- how does this surface express itself through the shared ambient runtime?

Do not ask:

- should this surface bypass the runtime entirely just because it is a homepage
  or module-specific experience?

## Why This Is Canonical

This architecture is canonical for four reasons.

### 1. Continuity

The user should feel one continuous knowledge world across:

- landing page
- wiki
- modules
- graph handoff

That continuity is easiest to preserve when the same stage grammar, point
grammar, overlay grammar, and bridge semantics are reused everywhere.

### 2. Quality

Premium motion does not come from ad hoc hero animations.

It comes from:

- persistent stage ownership
- authored carry windows
- source-specific geometry
- hybrid DOM and WebGL choreography
- careful performance budgets

Those qualities degrade fast when every page reimplements them locally.

### 3. Reuse

If the landing page and modules share:

- the same asset pipeline
- the same scene controllers
- the same projection layer
- the same overlay grammar

then improvement work compounds instead of forking.

### 4. Honesty

SoleMD is building one graph-native product, not a decorative hero plus a
separate module system.

The canonical runtime makes that relationship explicit:

- the shell may change
- the teaching surface may change
- the underlying world model should not

## Canonical Near-Clone Target

For implementation work, `near clone` means:

- full motion grammar parity
- full stage/carry/overlap parity
- full source-geometry parity
- full hybrid chapter parity
- full performance discipline parity

It does not mean:

- copying Maze branding
- copying Maze copywriting
- copying Maze class names
- copying Maze exact colors, fonts, or shell components

The correct target is:

```text
Maze-quality runtime behavior
  inside
SoleMD product aesthetics
```

More concretely:

- keep SoleMD panels
- keep SoleMD prompt bar
- keep SoleMD watermark
- keep SoleMD table of contents
- keep SoleMD light and dark themes
- match Maze in motion, pacing, layering, and scene grammar as closely as
  possible

## Canonical Layer Ownership

The runtime should be reasoned about as distinct layers with explicit
responsibility.

### 1. Stage layer

Owns:

- fixed full-viewport or surface-scoped stage
- renderer
- camera
- scene root
- frame policy
- visibility lifecycle

Should be implemented once.

### 2. Asset layer

Owns:

- procedural point sources
- bitmap-to-points sources
- model-to-points sources
- release-scoped graph-derived point assets
- texture and shader-support assets

Should not be recreated inside page components.

### 3. Scene-controller layer

Owns:

- one controller per scene anchor
- scroll timelines
- carry windows
- visibility thresholds
- scalar choreography for uniforms and overlays

This is where Maze’s runtime grammar mostly lives.

### 4. Projection layer

Owns:

- projecting scene anchors into screen coordinates
- keeping overlays aligned through scroll and resize
- centralizing overlay transforms

This prevents every popup or hotspot from redoing math locally.

### 5. Overlay layer

Owns:

- hotspots
- popups
- labels
- callouts
- prompt/panel adjacency when relevant

DOM stays the authority for readable UI.

### 6. Surface-adapter layer

Owns:

- homepage mounting
- wiki-inline mounting
- expanded-module mounting
- graph-bridge handoff entry

Adapters are thin. They should not redefine renderer behavior.

## Canonical Workflow By Role

### Runtime engineers

Own:

- stage
- asset loading
- point generation
- shader/material contract
- scene controllers
- projection math
- performance policy

They should improve the shared system, not ship one-off page fixes.

### Surface authors

Own:

- manifests
- copy placement
- section order
- semantic focus requests
- hotspot and popup content

They should author intent, not renderer logic.

### Design/system authors

Own:

- SoleMD shell components
- panel treatment
- prompt bar behavior
- watermark treatment
- ToC styling
- token usage

They should not rebuild separate shell primitives inside ambient-field surfaces.

## Canonical Authoring Contract

Every major surface should decompose into:

```text
SoleMD shell
  +
FieldSectionManifest[]
  +
shared runtime
  +
shared overlays
  +
shared bridge semantics
```

The authored API should stay semantic.

Authors may specify:

- what cluster or corpus subset is in focus
- which claims or papers deserve hotspots
- which chapter job is active
- which visual preset family is appropriate
- which bridge actions should exist

Authors should not specify:

- raw point coordinates
- direct shader math
- ad hoc scroll callbacks
- page-local overlay projection

## Canonical Anti-Patterns

The following should now be treated as architectural regressions.

- building a homepage-only canvas system
- building a module-only animation system
- using one synthetic point cloud for every visual state
- tying scene meaning directly to a preset string
- using React state as the animation transport on every scroll tick
- remounting large geometry trees on chapter change
- putting all readable UI into canvas
- forking shell styles for ambient-field pages instead of reusing product
  components
- solving mobile with a second runtime rather than density and asset swaps

## Canonical Mobile Rule

Mobile should preserve the same architecture.

Prefer:

- one runtime
- CSS-first density changes
- alternative SVG or bitmap rails when needed
- lower overlay counts
- lower point counts
- lower DPR and calmer motion

Avoid:

- separate mobile-only scene systems
- separate mobile-only authoring contracts
- different conceptual chapter grammar on phone vs desktop

## Canonical Parity Roadmap

When bringing the current prototype to near-clone parity, the order of
operations should be:

1. lock the stage/runtime architecture
2. replace synthetic universal geometry with source-specific point pipelines
3. reproduce blob/hero choreography
4. reproduce stream/process hybrid choreography
5. reproduce pcb/cta behavior
6. reapply SoleMD shell components on top
7. reuse the exact same runtime in modules
8. add graph bridge hardening and performance hardening

If work skips earlier steps and jumps to shell polish or new presets first, the
result will look busy but not feel like Maze-grade runtime behavior.

## Authoritative External Sources

For Ambient Field work, prefer these current external sources before generic web
search or memory:

- CodeAtlas indexed docs:
  - GSAP: `/greensock/GSAP`
  - Three.js: `/mrdoob/three.js`
- Official GSAP AI skills: `https://github.com/greensock/gsap-skills`
- Official Three.js LLM docs:
  - `https://threejs.org/docs/llms.txt`
  - `https://threejs.org/docs/llms-full.txt`
- Context7 Three.js library:
  - `/mrdoob/three.js`

Use them for:

- GSAP timeline and `ScrollTrigger` correctness
- plugin usage and cleanup patterns in React
- Three.js rendering, material, camera, shader, and lifecycle guidance
- version-aware examples and API shape checks

Do not rely on stale recollection for GSAP or Three.js-heavy work. The runtime
is motion- and renderer-sensitive enough that incorrect patterns compound fast.

## CodeAtlas Snapshot Doc Search Contract

For implementation or review work that touches scroll choreography, renderer
lifecycle, shader behavior, selector ownership, chapter structure, or React
integration, check CodeAtlas doc search first:

- `/codeatlas/mazehq-homepage` is a docs index over captured reference code and
  derived notes from the Maze snapshot archive
- it is not authored product documentation from Maze
- it is not the Neo4j-backed SoleMD code graph and cannot answer ownership,
  callers, dependents, blast radius, or refactor-surface questions
- use it for evidence retrieval; use `search_code`, `inspect_symbol`,
  `trace_flow`, `dependents`, and `analyze_impact` for SoleMD code-graph
  questions
- use `search_docs` with `/codeatlas/mazehq-homepage` for snapshot evidence
  retrieval: selectors, filenames, scene slugs, `data-gfx`, `data-scroll`,
  asset names, shader tokens, hotspot/stream/progress grammar, and
  archive-derived notes
- use `search_docs` with `/greensock/GSAP` for GSAP core, timelines,
  `ScrollTrigger`, and cleanup patterns
- use `search_docs` with `/mrdoob/three.js` for materials, shaders, camera,
  renderer, geometry, and lifecycle APIs
- use `search_docs_multi` across both when the question spans scroll state and
  WebGL state together

Recommended query shapes:

- `section-welcome data-gfx blob`
- `scripts.pretty.js storeItems [data-gfx]`
- `index.html js-hotspot js-stream-point s-progress`
- `chapter selector map desktop-only phone-only has-only-reds`
- `aMove aRandomness aSelection uFunnel uScreen`
- `asset pipeline stream rail popup map`
- `ScrollTrigger React cleanup`
- `GSAP matchMedia reduced motion`
- `ShaderMaterial uniforms update`
- `PointsMaterial vs ShaderMaterial`
- `WebGLRenderer setPixelRatio performance`

- prefer concrete queries anchored on filenames, selectors, scene slugs,
  controller names, asset names, or exact runtime tokens
- do not start with broad prose queries like `review ...` because manifest or
  checksum docs can outrank the runtime artifacts

Use the GSAP skills repo and Three.js `llms*.txt` docs as official supplements,
but treat CodeAtlas doc search as the first retrieval path inside this repo.
Do not add ad hoc motion patterns from memory when the library docs are already
indexed and current.

- if `/codeatlas/mazehq-homepage` is `indexing` or `search_docs` warns that
  results may be incomplete, treat doc-search as provisional and confirm in the
  archive or focused references
- after `search_docs`, open the returned source with `read_doc` or
  `expand_doc_chunk` before inferring behavior from a snippet
- if the top hits are `sha256sum.txt` or `source-urls.txt` but the question is
  about runtime behavior, refine the query or jump directly to `index.html`,
  `scripts.pretty.js`, or the relevant derived map

Review rule:

- if the task is a review, use this skill to judge architecture first, use
  `/codeatlas/mazehq-homepage` to retrieve Maze-side evidence second, and use
  repo code-graph tools separately to assess SoleMD ownership and blast radius

## Non-Negotiables

### 1. One runtime family, not one-off page effects

Homepage, inline wiki modules, expanded modules, and graph entry should all use
the same runtime family:

- shared fixed-stage controller
- shared ambient asset contract
- shared asset-to-points pipeline
- shared scene authoring contract
- shared scene-object controller model
- shared overlay contract
- shared graph bridge semantics

The visible container may change. The runtime model should not.

This is the canonical rule for future work. Any proposal that introduces a
second homepage runtime, a separate module runtime, or a page-local alternative
must justify itself as an exception rather than a default.

### 2. Module authors declare semantic intent

Authors should publish semantic scene intent, not Three.js instructions.

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
AmbientFieldRuntime
```

Hard rule:

- modules author manifests
- resolver code owns point lookup, camera fit, label choice, and overlay anchors
- renderer code consumes resolved scene state only

### 3. Hybrid rendering is the default

Do not assume every premium chapter should be live Three.js.

Choose the render medium by chapter job:

- ambient, continuous, graph-derived substrate: Ambient Field
- cinematic fixed-asset chapter: native video or prerendered loop
- diagrammatic or mechanism explanation: SVG
- product trust, evidence card, list, or search shell: DOM
- atmosphere, vignettes, shell depth, and gradients: CSS

Important refinement:

- stream or process chapters should be assumed hybrid by default
- treat motion-path markers, popup sequencing, and other explanatory beats as
  DOM or SVG choreography layered over the field, not as shader-only work

WebGL is one layer in a hybrid chapter system, not the whole presentation stack.

### 4. Canvas owns density; DOM owns meaning

Use WebGL for:

- dense points
- low-frequency ambient motion
- focus halos, dimming, lane flow, and emphasis fields

Use DOM for:

- claims
- paper or entity callouts
- labels that must remain readable
- CTA surfaces
- prompts, pills, controls, and chrome

Do not:

- put the full teaching surface inside canvas UI
- create per-point DOM nodes
- reimplement overlay projection inside each card

### 5. The field must be semantically honest

Production Ambient Field work must be release-scoped and graph-derived.

Required identity rule:

- durable identity is `corpus_id + releaseId`
- `point_index` is only an asset-local offset

Do not ship a long-term module runtime that offers graph-linked actions on top
of synthetic field data.

### 6. Frame policy is part of the architecture

Do not leave the runtime in a permanent always-on loop by default.

Use an explicit frame policy:

```ts
type FieldFramePolicy =
  | "always"
  | "transitions"
  | "demand"
  | "suspended";
```

Default bias:

- active hero or transition: `always`
- settled visible module: `transitions` or `demand`
- reduced motion: `demand`
- hidden or occluded surface: `suspended`

### 7. Surface adapters are required

The field runtime must connect to concrete surfaces through adapters, not
duplicate scene logic:

- homepage adapter
- inline wiki module adapter
- expanded module adapter
- graph bridge adapter

Adapters translate container lifecycle and scroll ownership only.

Homepage and module differences should mainly live here.

That is how we keep:

- one canonical runtime
- multiple product surfaces

### 8. Graph bridge is a first-class subsystem

Ambient surfaces are not dead-end marketing scenes.

They must support:

- opening paper, entity, or cluster detail
- warming live graph entry when useful
- preserving focus intent when entering graph mode
- failing back to the module surface cleanly if graph entry is unavailable

## Required Runtime Pieces

Future implementation work should converge toward this structure:

```text
ambient-field/
  asset/
  renderer/
  camera/
  projection/
  scene/
  store/
  overlays/
  scroll/
  surfaces/
  bridge/
  fallback/
  authoring/
```

Minimum authority split:

- `renderer/`: field geometry, material, points, runtime lifecycle
- `scene/`: types, preset registry, scene resolution, transitions
- `projection/`: anchor projection only
- `overlays/`: DOM hotspot, label, popup, and callout primitives
- `scroll/`: runtime-owned progress driver abstraction
- `bridge/`: graph entry packets and bridge state
- `authoring/`: manifest schema and validation

## Budgets

These budgets are part of the product contract, not optional polish.

- ambient asset compressed size: target under `500 KB`, upper bound under
  `1.5 MB`
- initial visible points: `5k-25k`
- max ambient points before re-review: `50k`
- active DOM overlay nodes: under `100`, preferably under `40`
- hotspots per scene: `3-12`
- cluster labels per scene: `3-8`
- paper labels per scene: `0-12`
- frame budget: under `6-8 ms` on a mid-range laptop
- reduced-motion mode: no continuous camera drift

## Existing Seams To Reuse

Do not rebuild obvious local precedents.

- `apps/web/features/animations/canvas/connectome-loader/ConnectomeLoader.tsx`
  is the strongest precedent for one-draw-call field thinking, shared typed
  arrays, remount continuity, and mutation-in-frame behavior.
- `apps/web/features/ambient-field/asset/point-source-registry.ts` is the best
  current seed of the future `AssetRegistry` / `PointSourceAdapter` layer.
  Extend it instead of re-encoding procedural, bitmap, and stream source logic
  in the renderer.
- `apps/web/features/graph/components/shell/loading/GraphLoadingExperience.tsx`
  is the strongest precedent for canvas-plus-scrim-plus-DOM composition.
- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx` is the
  starting seam for panel-local scroll choreography, but it must graduate into a
  runtime-owned progress driver abstraction.
- the focused Maze references in this skill folder are the authoritative
  runtime-behavior surface when a new landing page or module needs Maze-grade
  parity without importing Maze's brand shell.

## Authoring Workflow

### 1. Define chapter jobs first

For each chapter or section, decide whether its primary job is:

- hero
- explain
- focus
- proof
- bridge

Then choose the render medium that best fits that job.

### 2. Author manifests, not bespoke choreography

Write `FieldSectionManifest` data first.

The manifest should express:

- semantic scene intent
- overlay requests
- bridge actions
- reduced-motion fallback

Do not start by writing ad hoc GSAP callbacks against DOM datasets.

### 3. Keep visual presets low-level

`visualPresets` should remain a renderer styling layer:

- motion families
- dimming styles
- color treatments
- emphasis behavior

They should not become the main authoring API for module meaning.

### 4. Centralize anchor projection

Use this chain only:

```text
ResolvedFieldScene
  ->
FieldProjectionController
  ->
ProjectedAnchor[]
  ->
OverlayLayer
```

Update overlay positions through transforms, not noisy React state per frame.

### 5. Keep GSAP in the choreography lane

GSAP should own:

- section progress
- scrubbed transitions
- pinning and chapter timing

GSAP should not own:

- field semantics
- point lookup
- graph bridge state
- long-lived renderer state

### 6. Validate before shipping

Manifest validation should reject work that:

- references nonexistent paper, entity, or cluster IDs
- exceeds overlay or label budgets
- uses raw coordinates directly in authored scenes
- offers graph entry without a valid focus subset
- lacks a reduced-motion fallback

## Review Checklist

When reviewing Ambient Field work, ask:

- Is this still one runtime family, or did the change fork a page-specific
  implementation?
- Does it preserve SoleMD shell aesthetics while sourcing motion behavior from
  the shared runtime instead of custom chrome?
- Is the authored surface semantic, or is it manipulating renderer internals?
- Is the new motion implemented as a reusable stage/controller/asset change
  instead of a page-local patch?
- Did the author pick the correct render medium for the chapter job?
- Are overlays resolved centrally from anchors instead of positioned ad hoc?
- Does the change preserve release-scoped graph identity?
- Is there an explicit frame/visibility policy?
- Does it work in panel-local scroll containers as well as page scroll?
- Is graph bridge behavior explicit and failure-tolerant?
- Are overlay counts and point counts still inside budget?
- Is reduced motion a first-class path, not a degraded afterthought?

## Migration Order For The Current Prototype

If extending `apps/web/features/ambient-field/`, prefer this order:

1. Introduce a fixed-stage manager plus scene-object controller contract.
2. Replace the single synthetic field with an asset-to-points pipeline that
   supports procedural, bitmap, and model-derived sources.
3. Freeze the current `visual-presets.ts` API as a low-level renderer concern.
4. Introduce `fieldSceneTypes.ts` with manifest and resolved-scene types.
5. Add `resolveFieldScene.ts` and stop driving module meaning through preset
   strings alone.
6. Add `projection/FieldProjectionController.ts` and a real DOM `OverlayLayer`.
7. Replace the page-specific scroll driver with a runtime-owned progress driver
   abstraction that supports panel scrollers.
8. Add graph entry packet and bridge state types.
9. Swap the synthetic field asset for a release-scoped graph-derived ambient
   asset.

Do not treat this list as optional cleanup.

This is the canonical migration path from prototype to governed runtime.

## Bottom Line

Ambient Field work should make modules feel like guided presentations of the
knowledge web, not decorative landing pages with particles behind them.

If a change improves visual spectacle but weakens semantic honesty, graph
continuity, overlay readability, or runtime reuse, it is the wrong trade.
