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
- blob carry into story chapters
- hybrid stream chapter with DOM rails and point popups
- DOM-native progress and story beats
- pcb CTA handoff
- particle shader/material/point-source behavior that reads like the archived
  source

SoleMD-specific deviations allowed at baseline:

- use SoleMD semantic/pastel tokens for the authored color palette
- keep Graph warmup chrome and route ownership where product integration needs it
- keep implementation in React/R3F instead of raw Three.js + GSAP islands

## Baseline Scope

The target lifecycle matches Maze through these sections:

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

## Workstreams

### 1. Stage Runtime

- [ ] Keep one fixed ambient-field canvas
- [ ] Tighten stage ownership to Maze semantics:
  welcome owns `blob`, graph owns `stream`, CTA owns `pcb`
- [ ] Preserve carry windows instead of treating all layers as co-equal ambient
  residents
- [ ] Make blob visibly thin/open as story scroll progresses via `uSelection`
- [ ] Reduce extra JS wobble that diverges from Maze's source-led motion

Primary files:

- `apps/web/features/ambient-field/renderer/FieldCanvas.tsx`
- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/scroll/ambient-field-scroll-state.ts`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-landing-content.ts`

### 2. Particle Material And Motion

- [ ] Port the Maze particle vertex shader behavior more faithfully
- [ ] Match noise-driven color movement instead of the calmer current field
- [ ] Keep SoleMD colors, but drive them through the Maze base/noise uniform
  contract
- [ ] Match stream funnel defaults to Maze and let per-point attrs do the shaping
- [ ] Match point sprite feel so particles read small, crisp, and fast
- [ ] Keep per-point palette seeded from semantic tokens for later entity/paper
  highlighting

Primary files:

- `apps/web/features/ambient-field/renderer/field-shaders.ts`
- `apps/web/features/ambient-field/renderer/field-point-texture.ts`
- `apps/web/features/ambient-field/scene/visual-presets.ts`
- `apps/web/features/ambient-field/asset/point-source-registry.ts`

### 3. Homepage Storyboard

- [ ] Replace the simplified landing narrative with Maze-like section sequencing
- [ ] Add Story 1 progress ownership
- [ ] Rebuild the graph/process chapter as a true hybrid stream section
- [ ] Add Story 2 progress ownership plus graph-ribbon and events beats
- [ ] Add quote slider band
- [ ] Keep CTA ownership on `pcb`

Primary files:

- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldLandingPage.tsx`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-landing-content.ts`
- new story/process/slider support components in the same directory

### 4. DOM Overlay Parity

- [ ] Convert the current process-stage abstraction into Maze-like rail + hotspot
  + popup choreography
- [ ] Keep progress bars DOM-native
- [ ] Keep graph-ribbon and events DOM-native
- [ ] Do not push these beats into the WebGL renderer

Primary files:

- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/AmbientFieldProcessStage.tsx`
- `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/ambient-field-process-stage-controller.ts`
- additional overlay components as needed

## Current Gaps Confirmed

- Visible particle color is uniform-driven; changing only the seeded point
  palette will not change the live field.
- The current stream chapter is still simplified compared with Maze:
  one SVG path, three marker lanes, and five generic popups.
- The current landing content omits Maze's second progress band, graph-ribbon,
  events beat, and slider section.
- The current runtime mounts all three stage layers all the time and smooths them
  with shared ambient logic. Maze reads more decisively because ownership is
  chapter-driven.

## Implementation Order

1. Landing storyboard and scroll manifest
2. Stream/overlay DOM rebuild
3. Shader/material parity
4. Scene-controller choreography
5. Tests and blast-radius review

## Verification

- [ ] `point-source-registry` tests still pass after material/source changes
- [ ] Scroll-state tests still pass or are updated for the new manifest
- [ ] Manual review confirms:
  hero blob carry, stream chapter hybrid motion, story progress behavior, and
  pcb CTA handoff
- [ ] Final blast-radius check via CodeAtlas `analyze_diff`
