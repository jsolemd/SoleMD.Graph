---
name: module
description: |
  Module authoring contract for SoleMD.Graph — landing surfaces, wiki modules,
  expanded module views, evidence overlays, scene manifests, graph bridges,
  and scroll-driven chapter systems that sit on the shared field
  substrate. Use when building or reviewing any of these surfaces, when
  working on the Maze parity / field runtime, or when authoring a
  new module shell.

  Triggers: module, modules, field, field modules, landing, landing page,
  landing module, wiki module, expanded
  module view, evidence overlay, scene manifest, FixedStageManager, field
  controller, chapter adapter, scroll-driven chapter, Maze parity, Maze
  build spec, object formation, points make a shape, stream chapter
  hybrid, blob / stream / objectFormation controller.

  Companions: /aesthetic for shell styling, /animation-authoring for motion
  craft, /learn-modules for educational interaction shells, /graph for live
  graph boundaries.
version: 1.9.0
---

# Module Authoring

This skill is the primary architectural contract for building Field
modules in SoleMD.Graph.

Read order:

1. this skill
2. `docs/map/modules/<module>.md` for the module-specific chapter/content contract
3. focused references only when you need audit evidence, line-level Maze
   provenance, or a deeper rebuild recipe

> Canonical sources:
>
> - `references/maze-build-spec.md` — consolidated parity ledger and rebuild
>   backlog for every field surface. Use it for audit evidence,
>   sanctioned deviations, and exact parity status.
> - `references/stream-chapter-hybrid.md` — stream chapter contract: WebGL conveyor + DOM rail + SVG motion geometry on one authored anchor.
> - `references/object-formation-surface.md` — future pattern for "particles converge into a shape" surfaces and the exact undo path for the two current user-locked deviations.
> - `docs/map/modules/README.md` — checked-in module-contract workflow. Read this before changing any landing/module chapter structure.
> - `docs/map/modules/module-terminology.md` — canonical authoring vocabulary. Use this to translate user language into module-contract fields and to keep retired landing aliases like `graphRibbon` and `moveNew`, plus archived Maze labels like `pcb`, out of primary authoring language.
> - `docs/map/modules/module-template.md` — canonical chapter/spec template for any new field module contract.
> - `docs/map/modules/landing.md` — `Module Zero` worked example. Use this as the first concrete contract sample.
> - `references/module-zero-reconstruction.md` — compact cold-start rebuild recipe for the current landing page. Read this when you need the exact runtime seams, file map, and non-negotiable ownership boundaries.
> - `docs/map/field-maze-baseline-ledger-round-12.md` — the
>   Round 12 Source Ground Truth + Foundation Primitives + Phase Log.
>   Use this as a supporting ledger, not as the primary module-building manual.
> - `references/round-12-module-authoring.md` — step-by-step authoring
>   guide with 3 worked examples (landing blob, object-formation surface,
>   hypothetical MRI module using the luma channel).
> - `docs/map/field-runtime.md`
> - `docs/map/field-implementation.md`
> - `docs/map/field-best-practices.md`
> - `references/maze-particle-runtime-architecture.md`
> - `references/maze-source-artifact-index.md`
> - `references/maze-shader-material-contract.md`
> - `references/maze-stage-overlay-contract.md`
> - `references/maze-asset-pipeline.md`
> - `references/maze-model-point-source-inspection.md`
> - `references/image-particle-conformation.md` — **read before adding any
>   image/bitmap/model-derived particle layer to a surface.** Wiring
>   checklist + the three SoleMD primitives to route through.
> - `references/maze-mobile-performance-contract.md`
> - `references/maze-rebuild-checklist.md`

Important boundary:

- this skill should contain the durable "how to build a module" contract
- the reference docs are evidence, audits, and deep-dive rebuild notes
- `docs/map/modules/*.md` files are authored structure/content declarations, not
  the primary place to restate runtime architecture
- Maze references are architecture and motion baselines only. They are not the
  naming authority for current SoleMD modules. Current naming authority is:
  live code + `docs/map/modules/*.md` + `docs/map/modules/module-terminology.md`.

This skill is the contract for any module or landing surface that uses the
Field as the default knowledge-web substrate.

## Use This Skill When

- the user mentions `field`, `field runtime`, `evidence layer`, legacy
  Maze-derived field naming,
  `graph bridge`, `module background`, `scene manifest`, `overlay anchors`, or
  `scroll-driven chapters`
- a homepage section, wiki module, or expanded module should feel like it lives
  inside the same visual world as the graph
- a task risks turning the current prototype into the long-term architecture

Do not use this skill for:

- pure Cosmograph runtime work with no field/module surface
- static prose-only module work that does not touch the shared field runtime

## Module Contract Workflow

Treat field work as a two-surface authoring problem:

1. human-authored chapter intent
2. checked-in implementation contract

The preferred human-authored surface is an Obsidian/wiki note the user can edit
freely. The preferred checked-in implementation surface is
`docs/map/modules/<module>.md`.

Important rule:

- do not implement chapter changes directly from conversational memory if the
  structure is changing in any durable way
- first update the checked-in module contract
- then implement from that contract against the shared field runtime

The operating sequence is:

1. user describes a chapter in plain language
2. agent translates that into the module contract markdown
3. agent implements code from the module contract
4. agent writes landed/deferred/locked status back into the module contract

## Discovery-First Rule For Underspecified Briefs

If the user gives a vibe, metaphor, or partial surface idea instead of a full
chapter brief, do not guess the missing architecture.

Run a short discovery interview first, then write the module contract, then
implement.

Examples of underspecified prompts:

- "make a blob of particles that feels alive"
- "I want it to rotate as you scroll"
- "the page should feel like a system waking up"
- "make something like the current landing page but for neurons"

The job of the interview is to recover the authoring fields the runtime needs:

- opening state
- middle-state carriers or chapter owners
- ending state
- whether the ending is a bookend or a transformation
- chapter landmarks and order
- overlay/shell expectations
- interaction expectations
- live data or graph-bridge expectations
- locked deviations from existing patterns

Do not ask every possible question at once. Ask the smallest set that turns a
poetic brief into a chapter skeleton.

Preferred order:

1. narrative shape
2. chapter sequence
3. stage-owner transitions
4. overlay and interaction needs
5. data/reduced-motion/mobile constraints

If the user says "make this like the current landing page," use
`docs/map/modules/landing.md` as the reconstruction baseline and ask only for
the deltas.

If the user says "I have only an idea," the skill should actively invite the
questions needed to convert that idea into a buildable module contract.

### Minimum discovery questions

For most new surfaces, recover these before coding:

- What is the opening state the reader meets first?
- What should the field become in the middle chapters?
- What should the ending be: bookend back to the opening, or converge into a
  new formed object?
- What are the major chapter landmarks or section beats?
- Which chapters are passive scroll chapters, and which are interactive?
- Does any DOM/SVG shell need to stay synchronized with the field?
- Is this purely ambient, or does it need live graph/data coupling?
- Are there locked references or existing surfaces this should inherit from?

Once those answers exist, mirror them into `docs/map/modules/<module>.md` and
implement from the checked-in contract rather than from memory.

### Worked reconstruction example

If the user says:

- "I want a blob of particles that feels alive and rotates as you scroll"

Do not treat that as sufficient implementation detail.

The skill should ask for the missing structure, such as:

- Is the ending a return to the opening blob, or should the particles become a
  new object?
- Do middle chapters stay on blob the whole time, or should another controller
  overlap?
- What are the major section landmarks?
- Are there any synchronized DOM/SVG overlays?
- Is this passive scroll only, or are any chapters interactive?

For the current landing page, the clarified answers would resolve to:

- opening state: globe/blob hero
- middle-state carriers: blob persists through the full landing; stream overlaps
  the story-2/story-3/sequence/mobile-carry run
- ending state: CTA returns to blob/globe bookend, not a new object formation
- chapter landmarks: hero, surface-rail, story-1, story-2, story-3,
  sequence, mobile-carry, cta
- overlay expectations: connection overlay synchronized to shared Story 3
  chapter progress
- interaction expectations: passive scroll chapters, no special interactive
  object-formation step on landing

That is enough to recreate the current landing architecture without inventing a
different runtime model. Future modules follow the same process, but the
clarified answers may point to a different ending state, chapter owner mix, or
overlay contract.

If an Obsidian note exists, treat it as the human authoring source. If only the
repo contract exists, use `docs/map/modules/<module>.md` directly. Until a
repo-backed wiki/modules tree exists, the checked-in contract lives under
`docs/map/modules/`.

## Required Module Contract Fields

Every field module contract should carry the same core structure.

At the module level:

- module id
- module kind (`landing`, `wiki module`, `expanded module`, `bridge surface`)
- runtime family (`Field`)
- ending pattern (`bookend return`, `persistent carry`, or `authored formation`)
- human authoring source (Obsidian/wiki path if one exists)
- checked-in contract path
- notes on locked global deviations
- mobile path
- reduced-motion path

At the stage-manifest level:

- section id (`sectionId` in code)
- controller family (`stageItemId` in code — `blob`, `stream`,
  `objectFormation`)
- ownership (`owner` or `carry` — no third state; two-family chapters
  declare two rows)
- carry window (`endSectionId` in code)
- particle behavior summary (described in product terms)
- overlay (`none`, `progress rail`, `hotspot cards`, `connection overlay`,
  or `future overlay` with a short description)

`presetId` is assumed to equal `stageItemId` and is not a separate
authoring field unless a module intentionally diverges — in which case
the deviation is recorded as a module-level `locked deviation`.

At the per-chapter level:

- chapter name
- section id
- chapter key (or `none` if not adapter-wired)
- stage state — leading family first when two rows are present
  (e.g. `stream owner + blob carry`)
- purpose — one sentence on what the chapter is *for*. Required.
  Load-bearing for generic structural names like `Story 1` and
  `Story 2`, where the chapter name alone does not convey intent.
- content
- particle behavior
- overlay
- interaction or motion intent
- mobile path
- reduced-motion path
- data bridge (default: none)
- deferred items
- locked deviations

If the chapter contains sub-beats, list them explicitly by stable beat id so a
user can say "change `info-5`" without re-describing the whole chapter.

Use `docs/map/modules/module-terminology.md` as the naming layer for these
fields. Treat legacy Maze-derived runtime names as aliases, not as the primary
authoring vocabulary, unless the task is specifically about an existing code
identifier.

## Skill vs Module Contract

Keep the division of authority explicit.

The skill owns:

- runtime architecture
- stage/runtime/controller/preset/overlay rules
- what belongs in WebGL vs DOM vs SVG
- preload, frame-policy, reduced-motion, and mobile rules
- chapter-adapter and progress contracts
- sanctioned global deviations and the rebuild path back to Maze behavior

The module contract in `docs/map/modules/<module>.md` owns:

- chapter names
- section order
- stage ownership by chapter
- content summaries
- beat ids
- particle behavior intent in product language
- overlay intent in product language
- deferred items and locked deviations for that module

Do not duplicate the full runtime manual into every module markdown file.

Do not force the skill to become a per-module content inventory either.

If a module is still being storyboarded, prefer stable structural chapter
names such as `Hero`, `Story 1`, `Story 2`, `Story 3`, `Sequence`, and `CTA`.
Let each chapter's `purpose`, `content`, and `stage state` hold the current
meaning so later storyboard passes do not require renaming the structure
every time.

The correct split is:

```text
skill = architectural how
module contract = authored what
```

## Current Repo Reality

As of `2026-04-19` (Round 12 rebuild), the homepage runtime is a foundation
of reusable primitives, not a prototype. Every primitive exports through
the barrel `apps/web/features/field/index.ts`. Canonical modules:

Asset + geometry:
- `asset/field-geometry.ts` — `FieldGeometry.sphere/stream/fromTexture/fromVertices`.
- `asset/field-attribute-baker.ts` — `bakeFieldAttributes` + `SOLEMD_DEFAULT_BUCKETS`.
- `asset/image-point-source.ts` — `createImagePointGeometry` (async; url / Image / ImageBitmap / ImageLikeData).
- `asset/model-point-source.ts` — `createModelPointGeometry` (walks Object3D).
- `asset/point-source-registry.ts` — thin consumer of the above, plus the
  homepage `blob/stream/objectFormation` entries.

Renderer:
- `renderer/field-shaders.ts` — Maze-parity vertex + fragment shaders with
  the shipped SoleMD `uColorBase` / `uColorNoise` vec3 pair.
- `renderer/FieldScene.tsx` — R3F stage consumer; owns the per-layer
  `wrapper → mouseWrapper → model` hierarchy.
- `renderer/field-loop-clock.ts` — singleton `uTime` source
  (`getFieldElapsedMs`, `getFieldElapsedSeconds`).
- `renderer/mouse-parallax-wrapper.ts` — `attachMouseParallax(group)`.
- `renderer/burst-controller.ts` — `createBurstController`.

Controllers:
- `controller/FieldController.ts` — abstract base (attach, loop,
  updateScale, updateVisibility, animateIn/Out, toScreenPosition, destroy).
- `controller/BlobController.ts` / `StreamController.ts` /
  `ObjectFormationController.ts` — stage-item specializations with Maze-parity
  updateScale formulas.

Overlay:
- `overlay/FieldHotspotRing.tsx` + `field-hotspot-ring.css` —
  DOM hotspot primitive with Maze CSS keyframes under an `afr-` prefix.
- `overlay/field-hotspot-lifecycle.ts` — `createHotspotLifecycleController`
  (per-hotspot animationend reseed, never a shared timer).

Scroll:
- `scroll/field-chapter-timeline.ts` — declarative chapter events
  (atProgress + duration + set/to/from/fromTo).
- `scroll/chapters/landing-blob-chapter.ts` — landing blob target state:
  persistent substrate through the middle chapters, then CTA bookend back to
  the opening globe.
- `scroll/chapters/landing-stream-chapter.ts` — stream overlap state for the
  story-2 / story-3 / sequence / mobile-carry corridor.
- `scroll/field-scroll-state.ts` — shared chapter-progress producer
  plus per-controller visibility aggregation from the authored manifest.
- `scroll/field-scroll-driver.ts` — ScrollTrigger intake layer that
  feeds shared scene state; controller-local ScrollTriggers are no longer the
  landing authority.

Scene/config:
- `scene/visual-presets.ts` — blob/stream/objectFormation presets with Maze numeric values.
- `scene/burst-config.ts` — `SOLEMD_BURST_COLORS` + `PHASE_TO_BUCKET`.

Legacy (pre-Round-12, now superseded in place):

Important reality checks:

- `point-source-registry.ts` is now the active source-of-truth for homepage
  point spaces:
  - `blob` from sphere points
  - `stream` from line points
  - `objectFormation` from bitmap-like raster points
- `FieldScene.tsx` now consumes those point sources directly and resolves the
  current stage item family through shared loops instead of hand-wired one-off
  scene code.
- `field-scroll-state.ts` now consumes a surface-authored scroll
  manifest, so carry windows, chapter progress, and controller overlap live in
  one shared stage state instead of one ScrollTrigger per controller.
- controller chapter targets are resolved in `scroll/chapters/*.ts` and then
  smoothed in each controller's `tick()` via the shared motion decay helpers.
- the landing connection overlay no longer owns its own scroll observer; it
  reads Story 2 progress from shared scene state.

What is still not complete:

- model-backed point adapters for `World`/`Shield`/`Users`-class scenes
- preload plus eviction discipline for heavier asset families
- broader reuse of the new `FixedStageManager` seam across homepage, wiki, and
  learn-module surfaces
- visibility-aware clock demotion when future surfaces can safely move from
  continuous animation to demand-driven rendering

Do not regress this into page-local GSAP scripts or separate background systems.
Future modules should extend these seams, not fork them.

## Canonical Particle Parity Rules

Future field work should treat the current landing renderer as the
canonical particle contract:

- one shared point-material family across scene slugs
- scene identity comes from source coordinate spaces first:
  - `blob` from sphere points
  - `stream` from a flat x-axis line with funnel attributes
  - `objectFormation` from bitmap space with mirrored depth
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
- `references/object-formation-surface.md`
  - "particles converge into a shape" pattern and the exact undo path for the
    two user-locked deviations in `maze-build-spec.md § 12 #46 #47`. Route
    here before raising blob/objectFormation `*Out` values, subclassing `FieldController`
    for convergence, or adding any scene slug whose end state is an authored
    point cloud.
- `references/stream-chapter-hybrid.md`
  - planning contract for a future stream chapter shell that mixes WebGL
    conveyor with DOM/SVG motion geometry. Route here before authoring any
    DOM overlay on the stream anchor.
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
- `references/image-particle-conformation.md`
  - required read before adding any image- / bitmap- / model-derived particle
    layer to a surface. Maze-HQ pattern + wiring checklist + the three SoleMD
    primitives (createImagePointGeometry, createModelPointGeometry, the PCB
    bitmap painters) to route through. Route here before inventing anything.
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
2. focused Maze reference docs under `.claude/skills/module/references/`
3. mirrored source artifacts in `data/research/mazehq-homepage/2026-04-18/`

Lookup order during implementation/review:

1. this skill
2. `/codeatlas/mazehq-homepage`
3. open the returned artifact or derived note with `read_doc` or `expand_doc_chunk`
4. drop to the raw archive when line-level confirmation is needed

### Homepage Section Inventory

```text
global shell      quick-access, fixed stage, header, mobile menu
section-hero      hero shell; blob bookend starts here
section-surface-rail evidence-surface strip; blob carry
section-story-1   first story triptych; blob hotspot chapter; progress 01-03
section-story-2   blob + stream overlap; stream becomes forward carrier
section-story-3   second story triptych; blob + stream overlap; progress 01-03
module--slider    quote/testimonial carousel; DOM-only
section-cta       closing CTA; blob resolves back to globe-like bookend
section-our-blog  article grid; DOM-only
```

Critical ownership rule:

- the landing does not scene-switch between blob and objectFormation anymore
- the fixed stage is manifest-driven, so multiple controllers may overlap on
  the same chapter window without creating duplicate canvases
  - story chapters still do not mount local WebGL scenes; they author chapter
  progress and DOM choreography around the shared fixed stage

### Runtime Anchor Map

```text
section-hero      blob carry starts
section-surface-rail blob carry continues
section-story-1   blob chapter targets drive hotspots + selection
section-story-2   blob + stream overlap begins
section-story-3   blob + stream overlap continues; connection overlay keys off this progress
section-sequence  blob + stream overlap continues
section-mobile-carry blob + stream overlap winds down
section-cta       blob-only CTA bookend
```

Implication:

- the real abstraction is shared chapter progress + controller overlap windows
- do not rebuild this as a page-global scene switcher or per-controller scroll
  timelines

### Timeline Working Map

1. Boot and preload:
   - app shell mounts the fixed stage once
   - `FixedStageManager` waits for point-source prewarm and controller
     attachment readiness before binding stage scroll state
   - the R3F render loop mounts immediately, but controller ticks stay inert
     until the readiness gate resolves
2. Welcome / hero:
   - blob controller is the active landing substrate from the top of the page
   - hero copy and the surface rail run as DOM content over the stage
   - global hotspot pool is projected into `.js-hotspot` nodes
   - `data-scroll="hero"` and `data-scroll="surfaceRail"` are chapter-local DOM
     hooks, not shader-only behavior
3. Story 1:
   - blob carry remains active and chapter targets drive hotspot emphasis
   - `.s-progress` tracks `info-1`, `info-2`, and `info-3`
   - the visible experience is narrative DOM plus persistent stage carry
4. Stream / process:
   - stream controller overlaps with the still-visible blob
   - the chapter may later own a separate sticky DOM shell, but none is
     currently mounted on landing
   - if a stream shell is added later, it should read the same authored chapter
     ids as the stage runtime rather than owning a second source of timing
5. Story 3:
   - no new stage owner is introduced; blob + stream continue together
   - a second `.s-progress` tracks `info-4`, `info-5`, and `info-6`
   - the connection overlay keys off Story 3 chapter progress from shared scene
     state, not a second `useScroll` observer
6. CTA:
   - blob resolves back to its opening globe-like state
   - CTA text and buttons stay DOM-native
   - shape-formation endings are reserved for later module pages unless the
     landing product contract changes explicitly
7. Post-CTA:
   - slider and article sections are DOM-first surfaces
   - they should not introduce page-local stage forks

### Asset Dependency Map

```text
particle.png                   shared particle sprite for point rendering
pcb.png                        historical bitmap source name reserved for non-landing convergence modules
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
- if a DOM shell is not yet authored, say so in the module contract instead of
  implying it exists in code

### DOM And Component Equivalence Map

```text
Maze .s-gfx / Os singleton            SoleMD FixedStageManager / FieldStage
[data-gfx] anchors                    FieldSectionManifest scene entries
scene subclasses (blob/stream/objectFormation) controllers resolved once, then activated by manifest + chapter state
.js-hotspot pooled nodes              projected overlay pool owned by runtime
.c-stream chapter shell               future hybrid chapter adapter over shared stage
.js-stream-point / popup DOM          future user-authored stream shell overlay
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
- keep stream hybrid as the parity target when a stream shell is in scope
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
shared Field runtime
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

- how does this surface express itself through the shared field runtime?

Do not ask:

- should this surface bypass the runtime entirely just because it is a homepage
  or module-specific experience?

## Authoring Discipline

For any non-trivial landing/module change, the agent should leave behind three
artifacts that agree with each other:

1. the checked-in module contract in `docs/map/modules/`
2. the runtime implementation in `apps/web/features/field/`
3. the parity/deviation ledger in the relevant reference doc when behavior is
   intentionally preserved or deferred

This prevents the common drift mode where:

- the code changes
- the chapter names change informally
- the product intent only exists in chat history

The landing page is still `Module Zero`, but it should now be treated as the
first example of this workflow rather than a special exception.

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

## Runtime Contracts By Subsystem

This is the durable module-building contract derived from the Maze decomposition
and adapted to SoleMD's React-native runtime.

### 1. Shell and bootstrap contract

React and Next.js replace Maze's page-global AJAX shell, but the ownership split
still matters.

Rules:

- one shell-level mount owns global body/document classes and global DOM
  observers
- app-shell state such as `is-loaded`, `is-resizing`, `is-scrolled`,
  `is-scrolling-down`, `is-scrolled-vh-*`, `is-scrolled-header-height`,
  `is-rendering`, and `is-not-ready` belongs to shell utilities, not to a scene
  controller
- viewport-height handling should prefer modern `svh`/`dvh` units; do not
  rebuild old `100vh` compensation unless a surface explicitly needs a CSS var
- preload-before-animate is still the rule even though the transport is React:
  the first intended hero frame should appear only after the active stage assets
  and controllers are ready
- pathname-level scroll restoration and caching belong to router/shell ownership,
  not to a scene controller or chapter adapter

Implication:

- do not put body-class toggling, generic intersection observers, or page-ready
  lifecycle glue inside `field-scroll-driver.ts` or a specific chapter
  adapter

### 2. Stage runtime contract

The stage remains a singleton-style shared runtime even though R3F owns the
renderer internals.

Rules:

- one fixed stage per surface family
- R3F owns `WebGLRenderer`, `Scene`, `Camera`, resize, and final render
- SoleMD code owns stage readiness, controller attachment, frame policy, and
  projection/overlay fan-out
- the stage must support an explicit readiness gate:
  - point-source preload
  - texture/material readiness
  - any controller `whenReady()` promises
- controller ticks may be short-circuited until readiness resolves; do not let
  async point-source families pop in mid-flight as an accidental second first
  paint
- frame policy is architectural:
  - `always` for active hero/transition states
  - `transitions` or `demand` for settled module states
  - `suspended` for hidden surfaces

Sanctioned deviation:

- we do not port Maze's DOM scan or raw Three.js singleton literally; the
  React/R3F stage is the canonical SoleMD implementation

### 3. Scene preset contract

`visual-presets.ts` is a low-level numeric/style registry, not the main authoring
surface.

Rules:

- presets encode renderer-facing numbers:
  - scale
  - rotation
  - offsets
  - shader uniforms
  - funnel tuning
  - mobile overrides
- presets should be self-complete entries rather than a hidden prototype-merge
  game spread across multiple files
- asset-generation knobs that belong to point-source creation should live in the
  asset layer, not be smuggled into chapter JSX
- module meaning must not be authored through preset names alone
- if a preset intentionally diverges from Maze for product reasons, document the
  rationale inline and in the build-spec ledger

Current sanctioned global deviations to preserve until product scope changes:

- blob stays visible through the detail story
- no end-state particle object-formation surface yet for stream/objectFormation

### 4. Controller and resolver contract

SoleMD does not use Maze's `jx` DOM-scan registry as the primary authoring
pattern.

Rules:

- scene ownership should flow from authored surface data, not from DOM discovery
- the preferred chain is:

```text
FieldSectionManifest
  ->
surface/stage resolver
  ->
controller selection
  ->
controller attach
  ->
tick / projection / overlay updates
```

- controller-per-anchor remains the core rule
- controllers own:
  - scene-local motion grammar
  - carry windows
  - visibility thresholds
  - uniform choreography
- controllers should expose `whenReady()` when async resources exist
- `updateVisibility()` may remain a documented no-op in the base class when a
  surface intentionally preserves persistent visibility; subclasses opt into
  fade/cull behavior explicitly

Do not:

- reintroduce a page-global DOM `querySelectorAll('[data-gfx]')` scan as the
  default pattern
- add a string-keyed controller registry unless a real lazy-loaded or
  separately-authored consumer requires it

### 5. Chapter adapter contract

Maze's `data-scroll` chapter choreography maps to named, runtime-owned chapter
adapters in SoleMD.

Rules:

- treat chapter adapters as first-class runtime surfaces
- each adapter should have:
  - a stable chapter key
  - a single mount point
  - reduced-motion behavior
  - cleanup/dispose semantics
- adapters own DOM/SVG reveal choreography only
- adapters do not own point lookup, controller semantics, or shell lifecycle
- adapters should be registered centrally and consumed through a hook or thin
  adapter mount, not scattered through page-local ad hoc GSAP effects

Important chapter-specific rule:

- stream/process chapters should be assumed hybrid by default
- motion-path markers, popups, and explainer beats live in DOM/SVG layered over
  the field, not as shader-only substitutes
- if the DOM shell is deferred, say so explicitly in the module contract rather
  than implying parity exists

### 6. Scroll ownership contract

Scroll ownership is split across three places:

- shell utilities own global body/document scroll classes and generic observers
- the field scroll driver owns surface/runtime progress intake and
  controller timelines
- chapter adapters own chapter-local DOM choreography

Rules:

- do not collapse these back into one all-knowing page script
- do not make a chapter adapter responsible for generic shell state
- if a feature needs panel-local scroll later, extend the runtime scroll
  abstraction rather than hard-coding window-only assumptions

SoleMD-native patterns that are valid and should not be "cleaned up" away:

- synchronous `ScrollTrigger.refresh()` after binding when multiple uniform
  tweens stack and React mount timing requires explicit refresh
- reduced-motion short-circuit branches that skip chapter/adapter binding
- shared ref-based scene state bridges when controllers or overlays need a
  stable cross-runtime state channel without per-frame React re-rendering

### 7. Progress component contract

Progress rails are a DOM/runtime component, not a shell decoration and not a
canvas feature.

Rules:

- each narrative progress group gets its own mounted progress instance
- progress state should be written as root-scoped CSS variables
- the canonical variable family is `--progress-1`, `--progress-2`, ... on the
  progress root
- publish `--bar-width` when the visual contract depends on measured rail width
- section activation math should be based on the viewport midline and any active
  header offset, not arbitrary per-section magic numbers
- smoothing belongs to the choreography lane:
  - GSAP tweening is the preferred parity path
  - throttling alone is not smoothing
- desktop-only progress should also be runtime-gated, not merely hidden with CSS
- if the rail uses an active-state hook, toggle it on the root, not per segment

Generalizable lesson:

- a progress rail is a reusable chapter primitive for any module with named
  beats; it should remain a standalone DOM contract that reads authored beat IDs
  and never couples itself to renderer internals

### 8. Chrome and component composition contract

Maze's DOM component registry does not port 1:1 to SoleMD, and it should not.

Rules:

- React composition owns chrome and DOM components
- component props replace `data-component` + `data-options` registries
- the field runtime may project overlays into DOM, but it does not own the
  broader shell chrome
- graph/product chrome remains a SoleMD system, not a Maze shell clone

Implication:

- progress can be parity-close as a runtime-owned DOM primitive
- header/nav/carousel/blog/product-listing components from Maze are not the
  architecture to port for SoleMD modules

### 9. What a future module should actually author

When building a new module, the authoring burden should usually be:

- define chapter names and order
- assign chapter keys and wire chapter adapters where needed
- declare which stage owner and carry rows run through which sections
- choose particle behavior intent in human/product language
- choose whether DOM/SVG overlays are:
  - shipped now
  - deferred
  - permanently out of scope
- declare reduced-motion behavior
- declare graph-bridge actions if they exist

The author should not have to decide:

- shader transform order
- point-source loading strategy
- how projection math works
- how the shell toggles `is-scrolled-vh-50`
- whether a controller tick runs before or after camera render

If a module request forces those decisions at authoring time, the runtime is not
abstracted enough yet.

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

They should not rebuild separate shell primitives inside field surfaces.

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
- which controller family is appropriate
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
- forking shell styles for field pages instead of reusing product
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
5. reproduce reusable object-formation close behavior where the module contract calls for it
6. reapply SoleMD shell components on top
7. reuse the exact same runtime in modules
8. add graph bridge hardening and performance hardening

If work skips earlier steps and jumps to shell polish or new presets first, the
result will look busy but not feel like Maze-grade runtime behavior.

## Authoritative External Sources

For Field work, prefer these current external sources before generic web
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

- `section-hero data-gfx blob`
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
FieldRuntime
```

Hard rule:

- modules author manifests
- resolver code owns point lookup, camera fit, label choice, and overlay anchors
- renderer code consumes resolved scene state only

### 3. Hybrid rendering is the default

Do not assume every premium chapter should be live Three.js.

Choose the render medium by chapter job:

- ambient, continuous, graph-derived substrate: Field
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

Production Field work must be release-scoped and graph-derived.

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
field/
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
- `apps/web/features/field/asset/point-source-registry.ts` is the best
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

Corollary:

- the module contract should name sections, beats, overlays, and stage ownership
- the skill should answer how those declarations become runtime behavior

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

When reviewing Field work, ask:

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

If extending `apps/web/features/field/`, prefer this order:

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

Field work should make modules feel like guided presentations of the
knowledge web, not decorative landing pages with particles behind them.

If a change improves visual spectacle but weakens semantic honesty, graph
continuity, overlay readability, or runtime reuse, it is the wrong trade.
