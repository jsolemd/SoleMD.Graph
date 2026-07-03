---
name: module
description: Module authoring contract for SoleMD.Graph — landing surfaces, wiki modules, expanded module views, evidence overlays, scene manifests, graph bridges, and scroll-driven chapter systems on the shared field substrate. Use when building or reviewing any of these surfaces, when working on the field/orb particle runtime, or when authoring a new module shell. Make sure to use this skill whenever the user mentions module, field, landing, wiki module, expanded module, evidence overlay, scene manifest, FixedStageManager, field controller, chapter adapter, scroll-driven chapter, object formation, stream chapter, blob/stream/orb particle runtime, or 1M-particle orb. Do NOT use for generic three.js authoring (use /threejs), raw WebGPU + WGSL + compute (use /webgpu), educational interaction shells inside wiki pages (use /learn-modules), shell styling (use /aesthetic), or motion craft (use /animation-authoring).
allowed-tools: Read Glob Grep Bash
metadata:
  short-description: SoleMD module authoring contract
---

# Module Authoring

This skill is the architectural contract you use when building any SoleMD.Graph
module that sits on the field substrate — landing surfaces, wiki modules,
expanded modules, evidence overlays, the orb runtime, and scroll-driven
chapter systems.

## Read Order

1. this skill (the durable contract spine)
2. `docs/map/modules/<module>.md` for the module-specific chapter contract
3. focused references when you need rebuild evidence, the orb-runtime
   contract, or worked authoring examples

## Substrate Beneath

Every field/orb/particle module sits on three.js. For generic three.js
authoring (render loop, dispose, instancing, color management,
postprocessing) read `/threejs`. For raw WebGPU + WGSL + compute read
`/webgpu`. The orb runtime today uses raw WebGPU; the documented future
direction is TSL via `/threejs/references/webgpu-tsl-bridge.md`. Module-
specific rules here override generic advice when they conflict.

Focused references:

- `references/field-runtime-architecture.md` — shader/material contract,
  source coordinate spaces, asset pipeline
- `references/mobile-performance-contract.md` — DPR, frame policy, mobile,
  reduced motion
- `references/stage-overlay-contract.md` — stage ownership, controllers,
  hotspots, progress, stream overlays
- `references/orb-particle-target.md` — 1M-particle WebGPU orb on
  `feat/orb-as-field-particles`, idle-skip, AgX tone mapping, 21-bit pick
  index, hash-random sphere seed, stateful particle motion
- `references/runtime-contracts-by-subsystem.md` — shell, stage, presets,
  controllers, chapter adapters, scroll, progress decomposed
- `references/module-authoring-guide.md` — step-by-step authoring with
  worked landing-blob and object-formation examples
- `references/object-formation-surface.md` — particles converging into an
  authored shape
- `references/stream-chapter-hybrid.md` — DOM/SVG hybrid stream chapter shell
- `references/image-particle-conformation.md` — image/bitmap/model-derived
  particle layers

## Use This Skill When

- the user mentions `field`, `field runtime`, `evidence layer`, `graph
  bridge`, `module background`, `scene manifest`, `overlay anchors`,
  `scroll-driven chapters`, or the orb particle runtime
- a homepage section, wiki module, or expanded module should feel like it
  lives in the same visual world as the graph
- a task risks turning the current prototype into long-term architecture

Do not use this skill for: pure Cosmograph runtime work without a
field/module surface; static prose-only modules that do not touch the
shared field runtime; generic three.js authoring (`/threejs`); raw WebGPU
+ WGSL + compute (`/webgpu`); educational interaction shells inside wiki
pages (`/learn-modules`).

## Module Contract Workflow

Treat field work as a two-surface authoring problem: human-authored
chapter intent (Obsidian/wiki note the user edits freely) + checked-in
implementation contract (`docs/map/modules/<module>.md`).

Hard rule: do not implement chapter changes directly from conversational
memory if the structure is changing in any durable way. First update the
checked-in module contract, then implement from that contract against the
shared field runtime.

Operating sequence: user describes a chapter in plain language → you
translate that into the module contract markdown → you implement code
from the module contract → you write landed/deferred/locked status back
into the module contract.

## Discovery-First Rule For Underspecified Briefs

If the user gives a vibe, metaphor, or partial surface idea instead of a
full chapter brief, do not guess the missing architecture. Run a short
discovery interview first, then write the module contract, then implement.

Underspecified prompts to recognize: "make a blob of particles that feels
alive", "I want it to rotate as you scroll", "the page should feel like a
system waking up", "make something like the current landing page but for
neurons".

The interview recovers the authoring fields the runtime needs: opening
state; middle-state carriers / chapter owners; ending state (bookend or
transformation); chapter landmarks and order; overlay/shell expectations;
interaction expectations; live data / graph-bridge expectations; locked
deviations from existing patterns.

Do not ask every question at once. Ask the smallest set that turns a
poetic brief into a chapter skeleton. Preferred order: narrative shape →
chapter sequence → stage-owner transitions → overlay and interaction
needs → data / reduced-motion / mobile constraints.

If the user says "make this like the current landing page," use
`docs/map/modules/landing.md` as the baseline and ask only for the deltas.
If the user says "I have only an idea," actively invite the questions
needed to convert that idea into a buildable module contract.

### Minimum discovery questions

For most new surfaces, recover before coding:

- opening state the reader meets first
- what the field becomes in the middle chapters
- ending: bookend back to the opening, or converge into a new formed
  object
- major chapter landmarks or section beats
- which chapters are passive scroll, which are interactive
- whether any DOM/SVG shell stays synchronized with the field
- purely ambient vs. live graph/data coupling
- locked references or existing surfaces this should inherit from

Once those answers exist, mirror them into `docs/map/modules/<module>.md`
and implement from the checked-in contract rather than from memory.

### Worked reconstruction example

User: "I want a blob of particles that feels alive and rotates as you
scroll." That is not sufficient implementation detail. Ask:

- Is the ending a return to the opening blob, or should the particles
  become a new object?
- Do middle chapters stay on blob, or should another controller overlap?
- What are the major section landmarks?
- Are there synchronized DOM/SVG overlays?
- Is this passive scroll only, or are any chapters interactive?

For the current landing page, those answers resolve to: globe/blob hero
opening; blob persists through the full landing with stream overlap on
story-2/story-3/sequence/mobile-carry; CTA returns to blob/globe bookend;
chapter landmarks `hero`, `surface-rail`, `story-1`, `story-2`, `story-3`,
`sequence`, `mobile-carry`, `cta`; connection overlay keys off shared
Story 3 chapter progress; passive scroll throughout.

That is enough to recreate the current landing architecture without
inventing a different runtime model. Future modules follow the same
process, but answers may point to a different ending state, chapter owner
mix, or overlay contract.

If an Obsidian note exists, treat it as the human authoring source. If
only the repo contract exists, use `docs/map/modules/<module>.md`
directly.

## Required Module Contract Fields

Every field module contract carries the same core structure.

**Module level**: `module id`, `module kind` (`landing` / `wiki module` /
`expanded module` / `bridge surface`), `runtime family` (`Field`), `ending
pattern` (`bookend return` / `persistent carry` / `authored formation`),
human authoring source (Obsidian/wiki path), checked-in contract path,
notes on locked global deviations, mobile path, reduced-motion path.

**Stage-manifest level**: `sectionId`, `stageItemId` (controller family —
`blob` / `stream` / `objectFormation`), ownership (`owner` or `carry` — no
third state; two-family chapters declare two rows), `endSectionId` (carry
window), particle behavior summary in product terms, overlay (`none` /
`progress rail` / `hotspot cards` / `connection overlay` / `future overlay`
with description). `presetId` is assumed to equal `stageItemId` unless the
module intentionally diverges — that deviation is recorded as a module-
level `locked deviation`.

**Per-chapter level**: chapter name, section id, chapter key (or `none` if
not adapter-wired), stage state (leading family first when two rows are
present, e.g. `stream owner + blob carry`), `purpose` (one sentence on what
the chapter is *for*; required; load-bearing for generic structural names
like `Story 1`), content, particle behavior, overlay, interaction or
motion intent, mobile path, reduced-motion path, data bridge (default:
none), deferred items, locked deviations.

If the chapter contains sub-beats, list them explicitly by stable beat id
so a user can say "change `info-5`" without re-describing the whole
chapter.

Use `docs/map/modules/module-terminology.md` as the naming layer for
these fields.

## Skill vs Module Contract

The skill (this file + references) owns runtime architecture; stage /
runtime / controller / preset / overlay rules; what belongs in WebGL vs
DOM vs SVG; preload, frame-policy, reduced-motion, mobile rules; chapter-
adapter and progress contracts; sanctioned global deviations and the
rebuild path back to canonical behavior.

The module contract in `docs/map/modules/<module>.md` owns chapter names,
section order, stage ownership by chapter, content summaries, beat ids,
particle behavior intent in product language, overlay intent in product
language, deferred items and locked deviations for that module.

Do not duplicate the runtime manual into every module markdown. Do not
force the skill to become a per-module content inventory.

If a module is still storyboarded, prefer stable structural chapter names
(`Hero`, `Story 1`, `Story 2`, `CTA`). Let each chapter's `purpose`,
`content`, and `stage state` hold the current meaning so later storyboard
passes do not require renaming the structure every time.

Split: `skill = architectural how, module contract = authored what`.

## Current Repo Reality

The homepage runtime is a foundation of reusable primitives. Every
primitive exports through the barrel `apps/web/features/field/index.ts`.
Modern code paths (full live code map in
`references/field-runtime-architecture.md`):

- `renderer/field-shaders.ts` + `renderer/field-vertex-motion.glsl.ts` —
  shipped vertex + fragment shaders with the `uColorBase`/`uColorNoise`
  vec3 pair
- `renderer/field-particle-state-texture.ts` — stateful per-particle
  motion via float-texture state buffer
- `renderer/use-adaptive-frameloop.ts` + `renderer/FrameloopInvalidator.tsx`
  — frame policy seam (`always` / `transitions` / `demand` / `suspended`)
- `renderer/field-loop-clock.ts` — singleton `uTime` source
- `stage/FixedStageManager.tsx` — manifest-driven stage manager
- `controller/FieldController.ts` + `Blob`/`Stream`/`ObjectFormation`
  subclasses
- `asset/field-geometry.ts` — `FieldGeometry.sphere/stream/fromTexture/
  fromVertices`
- `asset/field-attribute-baker.ts` — `bakeFieldAttributes` +
  `SOLEMD_DEFAULT_BUCKETS`
- `scroll/field-scroll-state.ts` — shared chapter-progress producer +
  per-controller visibility aggregation
- `overlay/FieldHotspotRing.tsx` + `overlay/field-hotspot-lifecycle.ts`
  — hotspot primitive + per-hotspot `animationend` reseed

Reality checks: `point-source-registry.ts` is the source-of-truth for
homepage point spaces; `FieldScene.tsx` resolves the current stage item
family through shared loops; `field-scroll-state.ts` consumes a surface-
authored scroll manifest so carry windows live in one shared stage state;
controller chapter targets are resolved in `scroll/chapters/*.ts` and
smoothed in each controller's `tick()`; the landing connection overlay
reads Story 2 progress from shared scene state.

Still not complete: model-backed point adapters for `World`/`Shield`/
`Users`-class scenes; preload + eviction for heavier asset families;
broader reuse of `FixedStageManager` across homepage, wiki, and learn-
module surfaces; visibility-aware clock demotion.

Do not regress this into page-local GSAP scripts or separate background
systems. Future modules extend these seams.

The orb runtime on `feat/orb-as-field-particles` is a separate WebGPU
surface targeting 1M particles — see `references/orb-particle-target.md`
for non-negotiable discipline (idle-skip, 16 MB writeBuffer gating, 21-bit
pick index, hash-random sphere seed, AgX tone mapping, no TAA).

## Canonical Particle Parity Rules

Treat the current landing renderer as the canonical particle contract:

- one shared point-material family across scene slugs
- scene identity comes from source coordinate spaces first:
  - `blob` from sphere points
  - `stream` from a flat x-axis line with funnel attributes
  - `objectFormation` from bitmap space with mirrored depth
- visible color motion comes from shader noise, not from geometry `color`
  attributes and not from extra DOM glow layers
- perspective scaling is part of the look:
  - nearer points should read larger and brighter
  - mobile clarity should come from smaller preset/runtime point sizes,
    not CSS blur or post-process haze
- the point sprite contract should stay tight:
  - `32x32`
  - hard bright core
  - short feather
  - no wide halo wash

If a future change makes the field read as fog again, fix it in this
order:

1. point sprite edge softness
2. point-size ceilings and mobile preset sizing
3. source coordinate density
4. only then consider shader changes

## Reusable Parity Checklist

This checklist is canonical. It should remain usable even if individual
references are removed later.

- preserve one fixed full-viewport stage
- preserve controller-per-anchor ownership
- keep carry windows explicit
- keep source-specific geometry instead of one universal fallback cloud
- keep hotspots, stream markers, and progress in DOM or SVG
- keep stream hybrid as the parity target when a stream shell is in scope
- keep progress bars separate from the heavy stage runtime
- keep mobile as one runtime family with density and asset swaps, not a
  second architecture
- apply SoleMD shell aesthetics on top of the shared runtime
- reuse the same runtime family in homepage, modules, and graph-bridge
  surfaces

## SoleMD Aesthetic, Field-Grade Motion

SoleMD owns the shell aesthetic (panels, prompt bar, watermark, TOC,
typography, tokens, light/dark). The field substrate owns motion grammar:
fixed full-viewport stage, persistent renderer/scene/camera, controller-
per-anchor scene objects, source-specific point-cloud geometry, carry
windows and overlap, hybrid DOM/SVG/WebGL chapter choreography, smooth
scrubbed progression instead of section-burst swaps.

Do not rebuild custom local chrome to imitate a reference shell. Do not
fork page-specific styling systems around the field runtime. Do not treat
parity with a reference as permission to copy its branding or product
semantics.

Production target: `SoleMD shell + field-grade motion grammar + shared
field runtime`.

## Default Architectural Shape

When a module or landing surface needs ambient motion:

```text
FixedStageManager -> AssetRegistry -> PointSourceAdapters
  (procedural / bitmap / model)
  -> SceneObjectControllers -> ProjectionController -> DOM overlays + chapter UI -> surface adapters
```

Do not replace this with per-section canvases, one-off page-local GSAP
scripts, abrupt preset swapping with no carry window, or one synthetic
point field reused for every scene slug.

## Canonical Layer Ownership

The runtime decomposes into distinct layers; full rules in
`references/runtime-contracts-by-subsystem.md`.

1. **Stage layer** — fixed stage, renderer, camera, scene root, frame
   policy, visibility lifecycle. Implemented once.
2. **Asset layer** — procedural / bitmap / model / graph-derived point
   sources. Not recreated inside page components.
3. **Scene-controller layer** — one controller per anchor; scroll
   timelines, carry windows, visibility thresholds, uniform choreography.
4. **Projection layer** — projecting scene anchors into screen
   coordinates; keeping overlays aligned through scroll and resize.
5. **Overlay layer** — hotspots, popups, labels, callouts. DOM stays
   authoritative for readable UI.
6. **Surface-adapter layer** — homepage / wiki-inline / expanded-module
   mounting; graph-bridge handoff entry. Adapters are thin.

## Non-Negotiables

### 1. One runtime family, not one-off page effects

Homepage, inline wiki modules, expanded modules, and graph entry should
all use the same runtime family. The visible container may change. The
runtime model should not. Any proposal that introduces a second homepage
runtime, a separate module runtime, or a page-local alternative must
justify itself as an exception rather than a default.

### 2. Module authors declare semantic intent

Modules publish semantic scene intent, not three.js instructions:

```text
FieldSectionManifest -> FieldSceneState -> SceneResolver -> ResolvedFieldScene -> SceneController -> FieldRuntime
```

- modules author manifests
- resolver code owns point lookup, camera fit, label choice, overlay anchors
- renderer code consumes resolved scene state only

### 3. Hybrid rendering is the default

Choose render medium by chapter job:

- ambient, continuous, graph-derived substrate → Field
- cinematic fixed-asset chapter → native video or prerendered loop
- diagrammatic / mechanism explanation → SVG
- product trust, evidence card, list, search shell → DOM
- atmosphere, vignettes, shell depth, gradients → CSS

Stream/process chapters are hybrid by default. Motion-path markers, popup
sequencing, and explanatory beats live in DOM/SVG layered over the field,
not as shader-only work. WebGL is one layer in a hybrid chapter, not the
whole presentation stack.

### 4. Canvas owns density; DOM owns meaning

Use WebGL for dense points, low-frequency ambient motion, focus halos,
dimming, lane flow, emphasis fields. Use DOM for claims, paper or entity
callouts, readable labels, CTA surfaces, prompts, pills, controls, chrome.

Do not put the full teaching surface inside canvas UI. Do not create
per-point DOM nodes. Do not reimplement overlay projection inside each
card.

### 5. The field must be semantically honest

Production field work is release-scoped and graph-derived.

Required identity rule:

- durable identity is `corpus_id + releaseId`
- `point_index` is only an asset-local offset

Do not ship a long-term module runtime that offers graph-linked actions on
top of synthetic field data.

### 6. Frame policy is part of the architecture

Do not leave the runtime in a permanent always-on loop by default. Use an
explicit `FieldFramePolicy` ("always" / "transitions" / "demand" /
"suspended"). Default bias:

- active hero or transition → `always`
- settled visible module → `transitions` or `demand`
- reduced motion → `demand`
- hidden or occluded surface → `suspended`

### 7. Surface adapters are required

The field runtime must connect to concrete surfaces through adapters
(homepage / inline wiki / expanded module / graph bridge), not duplicate
scene logic. Adapters translate container lifecycle and scroll ownership
only. Homepage and module differences mainly live here.

### 8. Graph bridge is a first-class subsystem

Ambient surfaces are not dead-end marketing scenes. They must support:

- opening paper / entity / cluster detail
- warming live graph entry when useful
- preserving focus intent when entering graph mode
- failing back to the module surface cleanly if graph entry is unavailable

## Budgets

These are part of the product contract, not optional polish.

- ambient asset compressed size: target `<500 KB`, upper bound `<1.5 MB`
- initial visible points: `5k–25k` (field substrate); `1M` (orb runtime;
  see `references/orb-particle-target.md`)
- max ambient points before re-review: `50k` for field; `2_097_151` for
  orb (21-bit pick index ceiling)
- active DOM overlay nodes: `<100`, preferably `<40`
- hotspots per scene `3–12`; cluster labels `3–8`; paper labels `0–12`
- frame budget: `<6–8 ms` on mid-range laptop
- reduced-motion: no continuous camera drift

## Existing Seams To Reuse

Do not rebuild obvious local precedents.

- `apps/web/features/animations/canvas/connectome-loader/ConnectomeLoader.tsx`
  — one-draw-call field thinking, shared typed arrays, remount continuity
- `apps/web/features/field/asset/point-source-registry.ts` — the seed of
  the future `AssetRegistry`/`PointSourceAdapter` layer; extend it
- `apps/web/features/graph/components/shell/loading/GraphLoadingExperience.tsx`
  — canvas-plus-scrim-plus-DOM composition
- `apps/web/features/wiki/module-runtime/primitives/ScrollyPin.tsx` —
  panel-local scroll choreography seed (must graduate into runtime-owned
  progress driver)

## Review Checklist

When reviewing field/module/orb work, ask:

- Is this still one runtime family, or did the change fork a page-specific
  implementation?
- Does it preserve SoleMD shell aesthetics while sourcing motion behavior
  from the shared runtime instead of custom chrome?
- Is the authored surface semantic, or is it manipulating renderer
  internals?
- Is new motion implemented as a reusable stage/controller/asset change
  instead of a page-local patch?
- Did the author pick the correct render medium for the chapter job?
- Are overlays resolved centrally from anchors instead of positioned ad
  hoc?
- Does the change preserve release-scoped graph identity?
- Is there an explicit frame/visibility policy?
- Does it work in panel-local scroll containers as well as page scroll?
- Is graph bridge behavior explicit and failure-tolerant?
- Are overlay counts and point counts still inside budget?
- Is reduced motion a first-class path, not a degraded afterthought?
- For orb work: idle-skip gates intact? DPR ≤ 1.25? 16 MB writeBuffer
  gated behind dirty/active flag? AgX tone mapping? No TAA?

## Bottom Line

Field work should make modules feel like guided presentations of the
knowledge web, not decorative landing pages with particles behind them. If
a change improves visual spectacle but weakens semantic honesty, graph
continuity, overlay readability, or runtime reuse, it is the wrong trade.
