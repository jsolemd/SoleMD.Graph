# Ambient Field Best Practices

Date: 2026-04-18
Status: research synthesis and implementation guide

## Purpose

This document translates three inputs into one build guide:

- the intended product/runtime contract in
  [`ambient-field-runtime.md`](./ambient-field-runtime.md)
- the current implementation and rollout notes in
  [`ambient-field-implementation.md`](./ambient-field-implementation.md)
- live reference-site and official-doc research performed on 2026-04-18

The goal is not to make SoleMD look like a generic "award site."

The goal is to:

- keep the one-shared-field-runtime vision intact
- identify which reference patterns are actually worth stealing
- separate useful structure from expensive decoration
- give future agents a concrete starting point for homepage, module, and graph
  bridge work

This document should be treated as the practical companion to the two ambient
field docs above. Those docs define the direction. This one defines what to
clone, what to avoid, and how to implement the runtime in a way that stays
beautiful, legible, and fast.

One clarification became important during the second rendering-focused research
pass:

- the strongest reference sites are rarely "just Three.js + GSAP"
- they are hybrid render pipelines
- Three.js is usually one stage layer inside a broader system of DOM, sticky
  layout, SVG, video, prerendered assets, CSS atmosphere, and scroll
  choreography

That distinction matters for SoleMD because the wrong conclusion is:

- "award sites look good because they used Three.js"

The more accurate conclusion is:

- "award sites look good because they compose multiple render layers well, and
  only use WebGL where WebGL is actually the right tool"

## Authoritative Research Inputs

Future Ambient Field work should prefer the following sources before generic
search results or memory:

- CodeAtlas indexed docs:
  - GSAP: `/greensock/GSAP`
  - Three.js: `/mrdoob/three.js`
- Official GSAP AI skills:
  - `https://github.com/greensock/gsap-skills`
- Official Three.js LLM docs:
  - `https://threejs.org/docs/llms.txt`
  - `https://threejs.org/docs/llms-full.txt`
- Context7 Three.js library:
  - `/mrdoob/three.js`

Why these matter:

- the GSAP skills repo is now the cleanest current source for timelines,
  `ScrollTrigger`, plugin usage, React integration, cleanup, and performance
  patterns
- the Three.js LLM docs expose current renderer and API guidance in an
  agent-readable format
- Context7 gives current, searchable Three.js examples and docs without relying
  on stale model memory

For SoleMD this means:

- use CodeAtlas `search_docs` first for GSAP and Three.js-heavy work
- use the official GSAP skills for choreography correctness
- use the official Three.js LLM docs and Context7 for renderer correctness
- treat unofficial blog posts as secondary unless they add a narrowly useful
  example

## Agent Retrieval Contract

Future module and ambient-field work should follow this retrieval order before
implementation:

1. CodeAtlas `search_docs` for `/greensock/GSAP`
2. CodeAtlas `search_docs` for `/mrdoob/three.js`
3. CodeAtlas `search_docs_multi` if the implementation spans scroll state and
   WebGL state together
4. Official supplements:
   - `https://github.com/greensock/gsap-skills`
   - `https://threejs.org/docs/llms.txt`
   - `https://threejs.org/docs/llms-full.txt`
   - Context7 `/mrdoob/three.js`

Recommended query shapes:

- `ScrollTrigger React cleanup`
- `GSAP matchMedia reduced motion`
- `ShaderMaterial uniforms update`
- `PointsMaterial vs ShaderMaterial`
- `WebGLRenderer setPixelRatio performance`

This should be treated as an agent contract, not a suggestion. If future
module work touches GSAP, scroll choreography, R3F, or Three.js renderer
behavior, do not rely on memory first.

## Current Repo Reality

As of 2026-04-18, the ambient-field code in
[`../../apps/web/features/ambient-field/`](../../apps/web/features/ambient-field/)
now contains the canonical landing/runtime foundation, but it is not yet the
full cross-surface module system described in the map docs.

What exists now:

- [`FieldCanvas.tsx`](../../apps/web/features/ambient-field/renderer/FieldCanvas.tsx)
  mounts one fixed R3F canvas with `PerformanceMonitor` and `AdaptiveDpr`.
- [`FieldScene.tsx`](../../apps/web/features/ambient-field/renderer/FieldScene.tsx)
  renders the active stage family from shared point sources and a shared shader
  contract.
- [`field-shaders.ts`](../../apps/web/features/ambient-field/renderer/field-shaders.ts)
  drives FBM, amplitude deformation, ambient drift, stream conveyor/funnel, and
  perspective-weighted point importance.
- [`point-source-registry.ts`](../../apps/web/features/ambient-field/asset/point-source-registry.ts)
  is the active point-source asset registry for `blob`, `stream`, and `pcb`,
  with cache reuse and prewarm.
- [`visual-presets.ts`](../../apps/web/features/ambient-field/scene/visual-presets.ts)
  defines the current stage-item transform and uniform contract.
- [`ambient-field-scroll-driver.ts`](../../apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts)
  is now a generic scroll controller fed by a surface-authored scroll manifest
  plus optional overlay adapters.
- [`ambient-field-scroll-state.ts`](../../apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts)
  resolves landing carry windows from manifest data instead of hardcoded
  section math.
- [`ambient-field-process-stage-controller.ts`](../../apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-process-stage-controller.ts)
  is the landing-specific overlay adapter for the stream/process chapter.

What does **not** exist yet:

- release-scoped ambient assets derived from real graph data
- a shared `FieldSectionManifest -> SceneResolver -> ResolvedFieldScene` layer
  used across homepage, wiki, and learn modules
- projected overlay anchors
- graph-entry packets or graph bridge state
- visibility-aware clock demotion for future surfaces that can safely move off
  the always-on canvas loop
- model-backed point adapters plus heavier asset cleanup/eviction discipline
- a DOM overlay system that resolves real papers, entities, clusters, or
  evidence keys

The important conclusion:

- the current package now proves the **homepage foundation**
- it does not yet prove the **data contract**
- it does not yet prove the **scene architecture**
- it does not yet prove the **field-to-graph continuity**

That means future work should extend this prototype into the runtime described
in the docs, not replace it with a second implementation.

## Particle Clarity Rules

The latest parity pass made one implementation lesson explicit:

- the fastest way to ruin the field is to ask the shader to provide atmosphere,
  pulse, haze, and readability at the same time

The current canonical contract should stay:

- moving color energy comes from the vertex shader noise field, not from DOM
  overlays and not from a broad fragment glow layer
- point importance comes from perspective size and alpha, not from oversized
  sprites
- the sprite itself should stay tight and crisp:
  - bright core
  - short feather
  - no pastel fog halo
- mobile should use smaller runtime point sizes and mobile scene scales rather
  than CSS blur, opacity hacks, or a separate asset family
- if points start reading as haze again, reduce sprite feather and point-size
  ceilings before inventing new post-processing

That is closer to the archived Maze source and also produces the more durable
SoleMD result.

## What Changed In The Reference Landscape

The local docs cite Maze as the starting structural reference. That is still
useful conceptually, but the live sites have changed.

Important update from live inspection on 2026-04-18:

- `https://maze.co/` no longer presents the older ambient WebGL field pattern
  described in our current implementation notes. Its current homepage is a more
  conventional product site with fixed background layers, video surfaces, and
  product blocks.
- `https://mazehq.com/` is also no longer the older visual reference model. It
  is a newer enterprise marketing site with fixed layers, diagram blocks, and
  editorial sections, not the earlier `data-gfx` style field architecture.

So:

- the **idea** taken from historic Maze implementations remains valid
- the **current live Maze pages** should not be cargo-culted as the canonical
  visual or technical implementation

This matters because future agents should not read the local docs, look at live
Maze today, and assume they are seeing the same system. They are not.

## Live Reference Findings

The following sites were inspected with Chrome DevTools MCP on 2026-04-18.

### SoleMD ambient-field lab

Inspected:

- `http://localhost:3000/ambient-field-lab`

Observed structure:

- one fixed full-viewport canvas
- one full-viewport vignette layer above the canvas
- Framer Motion + GSAP + R3F/Three + custom shader stack
- editorial sections as normal DOM
- no sticky chapter containers
- no projected overlay anchors

What to keep:

- fixed field underneath readable DOM
- section-driven visual preset changes
- prompt-first hero
- one draw-call style thinking

What to improve:

- move from synthetic field data to release-scoped graph-derived data
- add semantic scene resolution
- add anchor projection and sparse overlay affordances
- add visibility/frame throttling
- add mobile-specific chapter behavior instead of assuming desktop pacing

### Apple Vision Pro

Inspected:

- `https://www.apple.com/apple-vision-pro/`

Observed structure:

- `0` canvases
- `29` videos
- `9` large sticky containers
- long-form section choreography built from pinned media blocks, not a
  continuous GPU field

Why it matters:

- Apple is the clearest benchmark for chapter pacing, hierarchy, copy restraint,
  and full-viewport sticky storytelling.
- It proves that not every "immersive" section needs a custom WebGL effect.
- It is the right reference for module chapters where the narrative object
  should take over the screen temporarily.

Patterns worth cloning:

- use sticky chapters for decisive moments, not for every section
- let one clear media object dominate the chapter
- keep copy short and spatially separated from the main visual
- reserve long captions for card surfaces, not free-floating paragraphs

Patterns not worth cloning directly:

- Apple’s video-heavy approach would be too asset-heavy as the default SoleMD
  module runtime
- SoleMD should not replace the field with stacked autoplay media everywhere

### Lusion

Inspected:

- `https://lusion.co/`
- Awwwards metadata for `Lusion v3` Site of the Day, October 2, 2023:
  `https://www.awwwards.com/sites/lusion-v3`

Observed structure:

- multiple canvas surfaces, including fixed transition/preloader overlays
- a fixed-stage mentality where the visual layer behaves like a scene, not a
  normal page background
- long scroll with the UI clearly separated from the stage layer
- shipped resource hints consistent with a hybrid stack:
  - Astro-generated frontend assets
  - SVG iconography and UI chrome
  - custom model/buffer assets
  - multiple texture maps
  - depth images such as `home_depth.webp`
  - Vimeo-delivered reel media

Why it matters:

- Lusion is a strong reference for stagecraft, transition layering, and how to
  make a site feel like one persistent visual world.
- It is a useful ceiling reference for the "cool" end of the spectrum.

Patterns worth cloning:

- treat the visual layer like a stage with its own identity
- use transition overlays deliberately, not continuously
- keep the content layer structurally separate from the canvas layer

Patterns not worth cloning directly:

- do not turn every SoleMD module into an agency-showreel site
- do not add decorative loaders or cinematic transitions without semantic value
- do not let spectacle outrun scientific legibility

### Superlist

Inspected:

- `https://www.superlist.com/`
- Awwwards metadata for `Superlist` Site of the Day, April 19, 2021:
  `https://www.awwwards.com/sites/superlist`

Observed structure:

- `0` canvases
- `1` video
- strong dark product shell
- screenshot- and UI-first presentation
- shipped resource hints consistent with a Framer-based runtime with motion
  modules, SVG surfaces, and static/product media rather than a custom GPU
  stage

Why it matters:

- Superlist is useful because it does **not** overuse spectacle.
- It shows how a product site can feel premium by leading with product clarity,
  crisp shells, and restrained motion.

Patterns worth cloning:

- hero value proposition should be obvious before the user decodes the visual
  system
- real product chrome and strong screenshots build trust faster than abstract
  motion
- use ambient motion as support, not as the only source of meaning

### Linear

Inspected:

- `https://linear.app/` in headless Chrome DevTools MCP

Observed structure:

- `0` canvases
- `0` videos
- heavy DOM/SVG product simulation
- dark, low-noise framing
- strong app-shell mimicry in the landing experience

Why it matters:

- Linear is the clearest reference for product-trust composition.
- It demonstrates when DOM and SVG are better than GPU effects.

Patterns worth cloning:

- when the user needs to understand the product, simulate the product directly
- dark neutral framing can make vivid accents feel more expensive
- app-state storytelling is often more persuasive than generic motion

## Modern Rendering Reality

The strongest correction from the second pass is simple:

- modern premium sites are usually **hybrid renderers**
- WebGL is only one layer
- GSAP is usually the choreography layer, not the whole rendering system

The render stack most often looks more like this:

```text
layout and pinning
  ->
scroll choreography
  ->
stage media layer
  ->
interactive GPU layer
  ->
SVG / UI / diagram layer
  ->
copy / CTA / shell layer
```

In practice that means:

- DOM and CSS own structure, spacing, sticky containers, masks, and most
  readability
- GSAP owns scroll progress, pinning, scrubbing, and chapter timing
- Three.js owns dense procedural or interactive visuals where raster/video would
  not be enough
- video, image sequences, or prerendered 3D clips often carry the hero media
  load more cheaply than a fully live GPU scene
- SVG often carries diagrams, icons, edge treatments, and vector UI
- CSS gradients, vignettes, blend/mask layers, and shell surfaces make the page
  feel expensive before the GPU even matters

This is the right mental model for SoleMD.

The ambient field should be one render layer inside a chapter system, not the
only rendering technique on the page.

## Render Layers To Deliberately Combine

### 1. Layout and pinning layer

This is regular DOM and CSS.

Its job is:

- chapter structure
- sticky and pinned containers
- max-width control
- copy rhythm
- CTA placement
- responsive fallback

Clone from references:

- Apple-style sticky chapters for major narrative beats
- Linear/Superlist-style shell discipline for product trust

Do not outsource this layer to WebGL.

### 2. Scroll choreography layer

This is where GSAP actually earns its keep.

Use GSAP for:

- chapter activation
- scrubbed transitions
- prompt/header movement
- pinned chapter orchestration
- selective text or card reveals

Use it as the conductor, not the orchestra.

Important implementation rule:

- the runtime should expose scene progress and chapter state
- GSAP should drive those values
- GSAP should not be rewriting the renderer architecture ad hoc

### 3. GPU stage layer

This is the ambient field itself.

Use Three.js/R3F when you need:

- dense point fields
- procedural motion
- custom shader blending
- identity-preserving graph-derived substrates
- true interactivity that video cannot fake

Do not use the GPU stage for:

- long-form explanatory copy
- most labels
- most controls
- every visual beat in every chapter

### 4. Media layer

This is the "other stuff" that was missing from the first pass.

Modern sites routinely mix in:

- native `<video>` for sticky cinematic beats
- prerendered 3D clips
- image sequences
- depth images for 2.5D parallax
- static screenshots when product trust matters more than spectacle

Why this matters:

- many of the best-looking scenes are not fully live GPU scenes
- they are carefully staged media moments over a strong shell
- this is often cheaper, more predictable, and easier to art-direct

For SoleMD:

- use live Three.js for the ambient field
- use prerendered or native video only for occasional hero or focus chapters
- use screenshots, SVG diagrams, or evidence cards when the user needs clarity

### 5. SVG and diagram layer

A lot of "premium" polish is vector, not GPU.

Use SVG for:

- diagrams
- line work
- arrows
- glyph systems
- masks
- iconography
- selective callout ornaments

SVG is often the right answer when:

- the element must stay sharp
- the motion is limited
- the semantics are diagrammatic rather than atmospheric

### 6. CSS atmosphere layer

This layer is easy to under-value.

Use CSS for:

- radial gradients
- vignettes
- scrims
- section fades
- matte shell surfaces
- shadow hierarchy
- theme-aware atmospheric color

This is where much of the "expensive" feeling actually comes from.

If the CSS atmosphere is wrong, better shaders will not rescue the composition.

### 7. Post-processing layer

Post-processing is real, but it should not be assumed.

Use it only when it earns itself:

- restrained bloom
- subtle DOF
- carefully chosen compositing passes
- final polish on a hero moment

Do not start here.

The default ambient field should look good before any composer pass exists.

## What The References Actually Suggest For SoleMD

The right translation is not:

- "build everything in Three.js"

The right translation is:

- "build a hybrid chapter system, with the ambient field as the continuous
  substrate"

Recommended default chapter recipe:

```text
fixed ambient field
  +
CSS vignette / atmosphere
  +
sparse DOM shell or card
  +
one GSAP-controlled chapter progression
  +
optional SVG diagram or proof artifact
```

Recommended escalation recipe for a major moment:

```text
fixed ambient field
  +
sticky chapter container
  +
one larger media object
  +
sparse copy
  +
clear bridge action
```

Possible media objects:

- prerendered video loop
- 2.5D depth/parallax asset
- SVG evidence diagram
- real product UI shell
- a more focused Three.js scene

## Technology-Specific Best Practices

### Three.js / R3F

Use Three.js for the parts that genuinely benefit from being live:

- persistent field substrate
- scene-state blending
- focus and dimming logic
- graph-linked identity continuity

Avoid using it for:

- all chapter media
- shell chrome
- heavy text treatment
- every diagram

If a scene can be prerecorded or simplified into SVG and still preserve the
meaning, that is often the better engineering choice.

### GSAP

GSAP should own:

- chapter timing
- `ScrollTrigger`
- scrubbed scene progress
- prompt/card/header choreography
- occasional short text or line reveals

GSAP should not become:

- the place where render state lives permanently
- the place where field semantics are resolved
- a substitute for a scene controller

### Scroll smoothing

Some premium sites do use smoothing, but smoothing is not the source of beauty.

Default SoleMD rule:

- native scroll first
- `ScrollTrigger` first
- add `ScrollSmoother` or equivalent only if the actual chapter feel benefits
  and mobile/accessibility fallout remains controlled

This bias matters because smoothing can introduce integration complexity that
does not help the ambient field itself.

### Split text and typographic effects

Many premium sites use text choreography, but it should stay restrained.

Use text splitting only for:

- short headings
- short hero statements
- occasional chapter transitions

Do not use it for:

- long scientific copy
- evidence paragraphs
- large repeated section bodies

If used, revert split DOM when possible and avoid creating huge node counts for
copy that is meant to be read.

### Video and video textures

Use native `<video>` when:

- the media is mostly cinematic
- the user does not need direct scene interaction
- asset direction matters more than live generativity

Use `THREE.VideoTexture` when:

- the video must live inside a 3D surface
- the video is part of the WebGL composition itself

Do not force video into WebGL just because WebGL is available.

### Post-processing

Composer-based post should be the last 10%, not the first 90%.

Default SoleMD rule:

- no post stack in the ambient field until the base field, shell, and overlays
  already feel correct
- when added, keep the pass chain short and measurable

## Distilled Rules

These are the patterns that survive after comparing the repo, the live sites,
and the official docs.

### 1. One persistent visual world, but not one global singleton canvas

Clone the rule:

- each visible ambient-field surface should feel like the same world
- that world should persist across scroll states
- the field should not remount just because one section became active

Do **not** over-interpret the rule:

- the whole site does not need one immortal global canvas
- one active field instance per visible surface is the safer default
- shared asset cache and shared scene contracts matter more than a global DOM
  singleton

### 2. Canvas owns density and atmosphere; DOM owns meaning

This is the strongest cross-reference conclusion.

Use WebGL for:

- dense points
- low-frequency ambient motion
- focus halos, dimming, lane flow, and atmospheric depth
- sparse non-semantic accent layers

Use DOM for:

- claims
- paper/entity cards
- labels that must remain readable
- calls to action
- prompts, pills, controls, and chrome

Do not:

- create one DOM node per point
- put the whole teaching surface inside `drei/Html`
- ask the canvas layer to carry dense explanatory copy

Add the missing corollary:

- video, SVG, and CSS atmosphere are first-class peers of the canvas layer, not
  fallback hacks

### 3. The field must be semantically honest

The current prototype is synthetic. The production runtime should not stay that
way.

Production rule:

- the ambient field should be derived from a published graph release
- point identity should remain durable across homepage, modules, and graph entry
- `corpus_id + releaseId` should remain the durable identity pair

Inference for SoleMD:

- the field can be more atmospheric than Cosmograph
- it cannot be semantically fake if graph bridge actions are expected to feel
  trustworthy

### 4. Build chapter grammar, not effect soup

Apple, Linear, and Superlist all reinforce the same rule:

- the experience should read as chapters with distinct jobs

Recommended chapter types:

- `hero`: prompt-first entry, thesis, primary CTA
- `explain`: one stable field + card-based narrative
- `focus`: one sticky or pinned moment with larger visual emphasis
- `bridge`: move from ambient teaching into graph intent
- `proof`: show real evidence, product chrome, or data artifact

Not every section should change everything.

Each chapter should change only one or two of:

- field preset
- overlay set
- dim/focus state
- camera fit
- CTA emphasis

### 5. The hero should be prompt-first, not ornament-first

This is the right pattern for SoleMD.

Recommended opening frame:

- living field already active
- centered prompt/search shell
- one short value statement
- one graph CTA
- one "continue" or "explore" affordance

Do not open with:

- a decorative loader
- a meaningless abstract hero with delayed product clarity
- long free-floating paragraphs directly over the field

### 6. Use sticky sections sparingly

Apple proves sticky media can be excellent. It also proves how expensive it is.

Recommended SoleMD rule:

- full-page homepage: use sticky/pinned chapters only for major scene shifts
- inline module panel: prefer panel-local scroll progress and stable field
- mobile: reduce or remove sticky chapter mechanics unless the experience
  clearly survives the smaller viewport

### 7. Prefer DOM product proof where product trust matters

Linear and Superlist are the right warning against overusing WebGL.

When the user needs to understand:

- a workflow
- a search result
- a paper summary
- a graph-linked action

use:

- real UI
- real card surfaces
- real list/table/shell patterns

Do not try to solve trust with abstract particles.

## Technical Best Practices

The sections below combine official docs with the reference-site conclusions.

### Renderer architecture

Use:

- R3F for canvas lifecycle and integration
- Three.js primitives for geometry/material control
- GSAP `ScrollTrigger` for scroll progress
- DOM overlays outside the canvas
- SVG, CSS gradients/scrims, and selective native media where they outperform a
  live GPU implementation

This matches the intended repo direction in
[`ambient-field-implementation.md`](./ambient-field-implementation.md) and the
official guidance from R3F and Three.js.

Official guidance worth honoring:

- R3F warns that creating objects is expensive, that you should think twice
  before mount/unmount churn, and that you should share geometries/materials and
  use instancing when rendering many similar objects.
- R3F also recommends `frameloop="demand"` when parts of the scene can come to
  rest, with manual `invalidate()` calls for mutation-driven updates.
- Three.js recommends `BufferGeometry`, pre-allocated typed arrays, and content
  updates instead of buffer resizing.

Production rule for SoleMD:

- keep the ambient field to one `Points` draw call in v1
- treat accent layers as optional and budgeted
- update uniforms every frame
- update CPU-side attributes only when the scene actually changes
- let non-GPU media carry some chapters instead of forcing the field to do
  every job

### Geometry and shader policy

Use:

- pre-allocated typed arrays
- one stable `BufferGeometry`
- one stable shader material
- custom attributes for emphasis, banding, reveal, and semantic classes

Avoid:

- resizing buffers on the fly
- remounting geometry for every chapter
- changing material feature flags mid-scroll in ways that force shader program
  recompilation

Inference for SoleMD:

- semantic emphasis should move through attributes like `aEmphasis`,
  `aSemanticClass`, or `aFocusMix`
- scroll progress should only modulate uniforms like `uFocusMix`,
  `uDimStrength`, `uMotionStrength`, `uPresetMix`, and `uAlpha`

### Frame policy

The current prototype defaults to continuous rendering. The production runtime
should not.

Recommended frame policy:

- `always` while the hero or a major transition is active
- `demand` when the surface is visually settled
- `suspended` when the surface is hidden or fully occluded
- reduced-motion surfaces should bias toward `demand`

Why:

- R3F explicitly recommends on-demand rendering when a scene can come to rest
- this saves battery and reduces fan churn
- it is the difference between a cool homepage and a permanently expensive one

### ScrollTrigger rules

GSAP `ScrollTrigger` remains the right choice for chapter progress.

Clone these rules from the official docs:

- create triggers in document order
- let one timeline or one state controller own a chapter
- do not stack overlapping triggers casually
- use `preventOverlaps` or stricter orchestration if multiple chapter triggers
  can conflict
- if the scroller is not `<body>`, remember that pinning behavior changes and
  `pinType` will default away from fixed-position pinning
- do not put `will-change: transform` on ancestors that need correct
  fixed-position behavior

This matters directly for inline wiki modules with panel-local scrollers.

### Hybrid media policy

Future agents should choose the render medium by chapter job, not by habit.

Use the following decision rule:

- if the chapter is ambient, continuous, and graph-derived: use the field
- if the chapter is cinematic and fixed-asset-friendly: use video or a
  prerendered loop
- if the chapter is explanatory and diagrammatic: use SVG
- if the chapter is product-trust-oriented: use real DOM/UI shells
- if the chapter only needs atmosphere: use CSS before adding more GPU work

This is the central rendering best practice that was under-specified in the
first pass.

### Overlay projection rules

Every future overlay system should follow this chain:

```text
ResolvedFieldScene
  ->
FieldProjectionController
  ->
ProjectedAnchor[]
  ->
OverlayLayer
```

Do:

- compute anchor positions centrally
- write overlay positions through transforms
- keep visible overlay counts low
- separate anchor resolution from card rendering

Do not:

- recompute projection ad hoc inside each card
- keep overlay positions in chatty React state every frame
- mix semantic overlay resolution into shader code

### Cleanup and disposal

Three.js will not automatically release geometry, material, texture, and render
target resources for you.

Production rule:

- dispose obsolete `BufferGeometry`
- dispose obsolete `Material`
- dispose textures separately
- dispose extra passes/helpers that expose `dispose()`

This becomes mandatory once the field runtime starts loading real assets,
alternate materials, label textures, or offscreen targets.

## Accessibility And Mobile Rules

### Reduced motion

Reduced motion is not optional.

Follow the platform rule:

- respect `prefers-reduced-motion: reduce`
- tone motion down rather than simply hiding everything
- preserve meaning when animation is removed

Recommended reduced-motion behavior:

- keep the field visible
- reduce or stop drift/swirl
- remove long parallax/pinned flourishes
- keep hero prompt and chapter cards static and readable

### Mobile

Do not assume the desktop grammar survives on mobile.

Mobile rules:

- remove the desktop side rail
- lower point count and accent density
- reduce alpha, depth, and lane motion before sacrificing readability
- keep the prompt shell and CTA visible early
- avoid chapters that depend on large sticky media unless they have been proven
  on-device

### Contrast and legibility

Steal the restraint from Linear and Apple, not the glass from older award sites.

Use:

- matte opaque card surfaces
- controlled vignette
- short line lengths
- low-chroma accents against stable dark or neutral foundations

Avoid:

- translucent copy cards over noisy fields
- diffuse blur as the primary readability tool
- overlapping long paragraphs directly on animated motion

## What SoleMD Should Clone

### From Apple

Clone:

- chapter pacing
- sticky media only for the biggest moments
- strong hierarchy between headline, support copy, and CTA

Do not clone:

- video-everywhere asset strategy

### From Lusion

Clone:

- stage-layer mentality
- deliberate transition overlays
- separation between spectacle layer and UI layer

Do not clone:

- agency-showreel density
- gratuitous loader theatrics

### From Superlist

Clone:

- product clarity above the fold
- premium UI shell treatment
- motion as support rather than explanation

Do not clone:

- pure screenshot-first structure for every SoleMD chapter

### From Linear

Clone:

- DOM-first explanation when the product itself is the proof
- dark neutral framing
- simulated product state as storytelling device

Do not clone:

- replacing the field everywhere with app-shell mockups

### From Historic Maze, not current live Maze

Clone:

- persistent background stage
- scroll-to-scene state changes
- sparse overlays over a fixed visual substrate

Do not clone:

- old glassy overlay treatment
- raw visual mimicry without semantic scene identity

## Recommended SoleMD Runtime Standard

Future homepage and module work should aim for this default composition:

```text
one surface-scoped ambient field
one semantic scene controller
one sparse overlay layer
one product or evidence shell above the field
one explicit graph bridge path
```

In practice that means:

- homepage hero: fixed field + prompt shell + short thesis + CTA
- chapter sections: change scene intent, not renderer ownership
- inline module: same runtime family, panel-local scroll driver
- expanded module: same runtime family, larger container
- graph entry: pass a graph packet, do not visually hard-cut into unrelated UI

And it also means:

- not every chapter has to be rendered by the field
- every chapter should still belong to the same visual world
- the field is the substrate, not the only medium

## Suggested File Ownership

This matches the direction already described in
[`ambient-field-implementation.md`](./ambient-field-implementation.md), but is
repeated here as the operational scaffold.

```text
apps/web/features/ambient-field/
  asset/
  renderer/
  camera/
  projection/
  scene/
  overlays/
  scroll/
  surfaces/
  bridge/
  fallback/
  authoring/
```

Ownership rules:

- `asset/` owns release identity and field data loading
- `renderer/` owns geometry, materials, and frame policy
- `projection/` owns anchor math
- `scene/` owns semantic resolution and transitions
- `overlays/` owns readable DOM
- `scroll/` owns progress drivers only
- `surfaces/` adapt the runtime to homepage/module containers
- `bridge/` owns graph-entry semantics

## Anti-Patterns

Do not ship any of these as the "ambient field" system:

- a second visualization stack for modules
- a homepage-only renderer that modules cannot reuse
- a fake particle field with no durable graph identity
- a field that remounts for every section
- one DOM node per point or one `Html` node per label
- scroll logic scattered across sections instead of centralized drivers
- continuous `frameloop="always"` everywhere forever
- large selected-ID arrays pushed through uniforms every frame
- cinematic transitions that add brand theater but remove scientific clarity
- glassmorphism and translucent copy cards as the default reading surface

## Recommended Next Moves

In order:

1. Keep the current lab route as the visual sandbox, but stop treating it as the
   runtime architecture.
2. Build the release-scoped ambient asset contract.
3. Implement semantic scene resolution and `ResolvedFieldScene`.
4. Add the projection controller and a real sparse overlay layer.
5. Introduce frame/visibility policy.
6. Define a chapter media policy so future sections can intentionally choose
   field vs DOM vs SVG vs video.
7. Rebuild the homepage hero and one module surface on the same runtime.
8. Add graph-entry packets only after identity continuity is real.

## Sources

### Local docs and code

- [`ambient-field-runtime.md`](./ambient-field-runtime.md)
- [`ambient-field-implementation.md`](./ambient-field-implementation.md)
- [`FieldCanvas.tsx`](../../apps/web/features/ambient-field/renderer/FieldCanvas.tsx)
- [`FieldScene.tsx`](../../apps/web/features/ambient-field/renderer/FieldScene.tsx)
- [`field-shaders.ts`](../../apps/web/features/ambient-field/renderer/field-shaders.ts)
- [`visual-presets.ts`](../../apps/web/features/ambient-field/scene/visual-presets.ts)
- [`ambient-field-scroll-driver.ts`](../../apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts)
- [`AmbientFieldLabPage.tsx`](../../apps/web/features/ambient-field/surfaces/AmbientFieldLabPage.tsx)

### Live sites inspected with Chrome DevTools MCP on 2026-04-18

- `https://maze.co/`
- `https://mazehq.com/`
- `https://www.apple.com/apple-vision-pro/`
- `https://lusion.co/`
- `https://www.superlist.com/`
- `https://linear.app/`

### Award/context references

- Superlist, Awwwards Site of the Day, 2021-04-19:
  `https://www.awwwards.com/sites/superlist`
- Linearity, Awwwards Honorable Mention, 2023-08-09:
  `https://www.awwwards.com/sites/linearity`
- Lusion v3, Awwwards Site of the Day, 2023-10-02:
  `https://www.awwwards.com/sites/lusion-v3`
- Lusion, Awwwards Site of the Day, 2019-05-20:
  `https://www.awwwards.com/sites/lusion`
- Vercel Workflow, Awwwards Honorable Mention, 2022-03-11:
  `https://www.awwwards.com/sites/vercel-workflow`

### Official implementation references

- React Three Fiber performance pitfalls:
  `https://r3f.docs.pmnd.rs/advanced/pitfalls`
- React Three Fiber scaling performance:
  `https://r3f.docs.pmnd.rs/advanced/scaling-performance`
- Three.js optimize lots of objects:
  `https://threejs.org/manual/en/optimize-lots-of-objects.html`
- Three.js how to update things:
  `https://threejs.org/manual/en/how-to-update-things.html`
- Three.js disposal guidance:
  `https://threejs.org/manual/en/how-to-dispose-of-objects.html`
- Three.js `VideoTexture`:
  `https://threejs.org/docs/pages/VideoTexture.html`
- Three.js `EffectComposer`:
  `https://threejs.org/docs/pages/EffectComposer.html`
- GSAP ScrollTrigger docs:
  `https://gsap.com/docs/v3/Plugins/ScrollTrigger/`
- GSAP ScrollSmoother docs:
  `https://gsap.com/docs/v3/Plugins/ScrollSmoother/`
- GSAP SplitText docs:
  `https://gsap.com/docs/v3/Plugins/SplitText/`
- MDN `prefers-reduced-motion`:
  `https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion`
