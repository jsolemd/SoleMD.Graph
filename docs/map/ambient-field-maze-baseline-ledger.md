# Ambient Field Maze Baseline Ledger

Date: 2026-04-18
Status: active implementation ledger

## Goal

Recreate the Maze homepage baseline lifecycle inside `apps/web/features/ambient-field`
as faithfully as possible before SoleMD-specific content, entity overlays, and
paper-focused adaptations are layered on top.

This baseline does not mean copying Maze branding. It means matching the source
runtime grammar:

- one fixed stage
- controller-per-anchor scene ownership
- persistent blob carry through the full scroll
- hybrid stream chapter with DOM rails and point popups
- DOM-native progress and story beats
- later-stage re-formation rather than abrupt field loss
- particle shader/material/point-source behavior that reads like the archived
  source

SoleMD-specific deviations allowed at baseline:

- use SoleMD semantic/pastel tokens for the authored color palette
- keep Graph warmup chrome and route ownership where product integration needs it
- keep implementation in React/R3F instead of raw Three.js + GSAP islands
- adapt Maze mechanics to the SoleMD storyboard instead of copying Maze's exact
  chapter meanings

## Baseline Scope

The target lifecycle reuses Maze mechanics through these sections:

1. `section-welcome`
2. `section-story-1`
3. `section-graph`
4. `section-story-2`
5. `module--slider`
6. `section-cta`

Reference sources:

- `data/research/mazehq-homepage/2026-04-18/index.html`
- `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`
- `data/research/mazehq-homepage/2026-04-18/derived/chapter-selector-map.md`
- `data/research/mazehq-homepage/2026-04-18/derived/runtime-architecture-map.md`

## Element Map

This ledger is the working rebuild map. Every parity pass should update one or
more of these elements with source references and concrete to-do items. New
elements should be added as they are discovered.

## Maze Mechanics To Preserve

These are still considered source-owned mechanics even while the storyboard is
being adapted for SoleMD:

- one persistent fixed WebGL stage
- wrapper-level idle spin plus model-level scroll turns
- source-led blob deformation timing
- selected-point thinning windows
- stream-style authored inspection rhythms
- projected hotspot / hover-card phases
- late-stage re-formation into a new shape instead of a hard cut

### 1. Fixed Stage Runtime

- [x] One fixed ambient-field canvas
- [x] Keep blob alive as the shared substrate through the full scroll
- [ ] Keep controller-per-anchor ownership crisp while the blob persists:
  `blob` stays global, `stream` layers in for detail/synthesis, later stage
  layers reform the ending
- [ ] Preserve carry windows instead of treating every layer as ambient wallpaper
- [x] Re-check visibility windows after each animation patch so the field does
  not appear to rotate once and then vanish

Primary files:

- `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`
- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts`

### 2. Timing And Rotation

- [x] Keep idle spin and scroll-linked half-turn on separate transforms
- [ ] Blob should read as a cohesive globe at local progress `0.00`
- [x] Retimed blob deformation windows to Maze-style ranges:
  - frequency ramp `0.00-0.15`
  - first amplitude rise `0.10-0.14`
  - selection thinning `0.34-0.40`
  - diagram burst `0.49-0.59`
  - alpha/depth burst `0.49-0.53`
  - shrink/re-form `0.63-0.73`
- [x] Preserve continuous rotation after the half-turn so later phases still
  feel alive

Primary files:

- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/scene/visual-presets.ts`

### 3. Particle Count, Distribution, And Feel

- [x] Blob seed count mirrors Maze `16384`
- [x] Stream seed count mirrors Maze `15000 / 10000`
- [ ] Keep source families intact:
  sphere shell, flat stream seed, bitmap PCB seed
- [ ] Re-check point-size feel after motion parity:
  if the field still reads too large, adjust point-size ceilings or sprite
  softness before changing counts
- [ ] Keep the sprite crisp:
  `32x32`, bright core, short feather, no halo wash

Primary files:

- `apps/web/features/ambient-field/asset/point-source-registry.ts`
- `apps/web/features/ambient-field/renderer/field-point-texture.ts`
- `apps/web/features/ambient-field/renderer/field-shaders.ts`

### 4. Color Grammar

- [x] Keep the default particle field neutral rather than fully semanticized
- [x] Use semantic colors as moving pulse clusters, not as a constant tint
- [ ] Keep pulse motion source-led:
  clustered and spatially coherent, not hue-jitter sparkle noise
- [x] Preserve the Maze rule that color motion comes from shader noise first
- [ ] Document every intentional SoleMD divergence from Maze here

Current working divergence:

- SoleMD may use the seeded point palette to tint pulse endpoints so different
  semantic colors can appear inside a Maze-like base/noise shader grammar

Primary files:

- `apps/web/features/ambient-field/renderer/field-shaders.ts`
- `apps/web/features/ambient-field/scene/visual-presets.ts`
- `apps/web/features/ambient-field/asset/point-source-registry.ts`

### 5. Particle Movement Types

- [ ] Ambient drift from the shared noise path
- [x] Rigid-body idle spin at the wrapper level
- [x] Scroll-linked half-turn at the model level
- [ ] Stream conveyor motion and funnel shaping
- [ ] Later phase selected-point thinning via `uSelection`

Primary files:

- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/renderer/field-shaders.ts`

### 6. Selected Points And Hover-Panel Phase

- [ ] Blob-era selected points should be treated as a staged hotspot pool
- [ ] Later metadata cards should be projected DOM overlays, not shader widgets
- [ ] Record how many selected nodes are visible in each chapter
- [ ] Keep this ledger updated as more source-owned phases are identified

Primary files:

- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/`

### 7. Scroll Chapter Map

- [ ] Welcome:
  cohesive rotating globe, early deformation onset, no overlay dependency
- [ ] Paper Story:
  selected paper points, persistent blob, first emphasis windows
- [ ] Detail Story:
  adapt Maze's stream inspection mechanics into paper/entity/relation detail
- [ ] Synthesis Story:
  relation links between points, wiki-facing connection story, persistent blob
- [ ] End State:
  field reforms into a more meaningful target shape, potentially brain-like,
  instead of disappearing

## To-Do List

- [ ] Tighten the initial globe read against the live Maze homepage
- [ ] Keep adapting Maze mechanics to the SoleMD storyboard instead of removing them
- [ ] Add a paper-highlight chapter using Maze-style selected-point staging
- [ ] Add a paper metadata / entity-relation hover-card phase using projected overlays
- [ ] Add a synthesis phase with visible point-to-point connections for the wiki story
- [ ] Add a re-formed end-state chapter, likely brain-like, while preserving the shared field
- [ ] Keep adding newly identified source elements to this ledger as they are found
- [ ] Run `/clean` discipline after the next major patch
- [ ] Do a final 1:1 parity review against the Maze source snapshot

## Current Gaps Confirmed

- The blob now persists, but the initial globe read still needs live visual
  tightening against Maze.
- Selected-point phases exist only as shader-side thinning right now; projected
  hotspot and hover-card layers are still missing.
- The current stream/detail chapter is still simplified compared with Maze:
  one SVG path family, limited popup choreography, and no authored highlight pool.
- The landing content now follows the SoleMD chapter arc, but the later synthesis
  and re-formed end-state visuals are not implemented yet.

## Implementation Order

1. Blob persistence and particle parity
2. Storyboard adaptation with Maze mechanics preserved
3. Selected-point and hover-card overlay rebuild
4. Synthesis and end-state visual chapters
5. Tests, `/clean`, and final parity review

## Verification

- [ ] `point-source-registry` tests still pass after material/source changes
- [ ] Scroll-state tests still pass or are updated for the new manifest
- [ ] Manual review confirms:
  persistent blob carry, paper highlight rhythm, detail/synthesis staging, and
  end-state re-formation
- [ ] Final blast-radius check via CodeAtlas `analyze_diff`
