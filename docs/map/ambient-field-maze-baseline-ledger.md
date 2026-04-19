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

## Agentic Rounds

### Round 1

- Focus:
  persistent blob, wrapper/model split, Maze-timed deformation windows
- Result:
  blob now persists through the full scroll and no longer drops out between
  chapters
- Browser finding:
  substrate continuity is correct, but the hero still reads dim and too uniform
  compared with Maze

### Round 2

- Focus:
  brighter semantic pulse clusters, tighter point-size feel, more active
  cool-neutral base
- Maze comparison:
  Maze hero shows a brighter cool-neutral field with more frequent cyan/purple
  cluster seams than our previous pass
- Current intent:
  increase pulse visibility and brightness without abandoning the neutral base
  plus semantic-burst contract

### Round 3

- Focus:
  move chapter meaning into named progress phases instead of one generic process
  channel
- Implementation:
  added explicit phase tracks for `blobSelection`, `detailInspection`,
  `synthesisLinks`, and `reform`
- Why:
  future rounds now have direct storyboard knobs for paper selection, detail
  inspection, synthesis links, and late re-formation

### Round 4

- Focus:
  source-only review of Maze particle motion, color drift, section dwell, and
  rotation cadence
- Source findings:
  `data/research/mazehq-homepage/2026-04-18/index.html` confirms the particle
  shader uses continuous FBM-driven color drift plus direct displacement, not
  discrete pulse-island reseeding:
  - `vNoise = fbm(position * (uFrequency + aStreamFreq * uStream));`
  - `r/g/b = base + clamp(vNoise, 0.0, 1.0) * 4.0 * (noise - base)`
  - `displaced += vec3(uScale * uDepth * aMove * aSpeed * snoise_1_2(...))`
  - `gl_PointSize = uSize * 100.0 / vDistance * uPixelRatio`
- Source findings:
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js` confirms the
  blob render loop is steady and should not visually restart on load:
  - `this.wrapper.rotation.y += 0.001`
  - `this.material.uniforms.uTime.value += 0.002`
- Source findings:
  our point-source registry already matches Maze's motion attributes:
  - `aMove`: `±30`
  - `aSpeed`: `0..1`
  - `aRandomness.y`: `±1`
  - `aRandomness.z`: `±0.5`
- Source findings:
  the long-lived Maze feel also comes from authored dwell, not shader alone:
  `styles.css` shows `.c-stream{height:84.75rem}` and story items with
  viewport-block padding around `20vh`, with centered titles using a taller
  `26.875vh / 12.5vh` rhythm
- Implementation target:
  replace our discrete pulse-mask islands with source-led continuous color
  drift, keep semantic colors as moving accents on top of that field, make the
  load state start at true zero-turn, and lengthen section dwell so source
  displacement can actually read
- Follow-up:
  current color pulsing is a step in the right direction but still does not
  honor Maze closely enough. The shader and the rest of the field grammar need
  another source-only review pass before the clean round.

### Round 5

- Focus:
  source-only review of Maze hotspot selection, projected hover-card behavior,
  and the remaining color-pulse parity gap
- Source findings:
  Maze does not stop at shader thinning. The blob chapter instantiates a real
  hotspot pool from `.js-hotspot` DOM nodes in `index.html` and projects them
  from geometry positions every frame:
  - `.s-gfx__hotspot.js-hotspot` nodes live in
    `data/research/mazehq-homepage/2026-04-18/index.html:87-149`
  - `addHotspots()` queries `.js-hotspot`, creates meshes, and records
    `isRed` via `.hotspot--red` in
    `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43421-43457`
  - `setRandomHotspotPosition()` samples random geometry positions and rejects
    bad placements in
    `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43470-43499`
  - `updateHotspots()` projects hotspot positions every frame and drives DOM
    opacity/scale in
    `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43501-43524`
- Source findings:
  Maze explicitly stages selected-point and hover-card density during the blob
  timeline:
  - `hotspots` label at `2`
  - `maxNumber: 0 -> 3` at `hotspots`
  - `maxNumber -> 40` at `hotspots += 1.2`
  - `uSelection: 1 -> 0.3` at `hotspots += 1.4`
  - `onlyReds: 0 -> 1` at `quickly`
  - hotspot opacity back to `0` at `respond`
  Source:
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43326-43405`
- Source findings:
  The strong sense of extra color variation in Maze is not from many shader
  palettes. The shader still uses a single blue/magenta pair:
  - `uR/G/Bcolor = 40 / 197 / 234`
  - `uR/G/Bnoise = 202 / 50 / 223`
  - `r/g/b = base + clamp(vNoise, 0, 1) * 4.0 * (noise - base)`
  Source:
  `index.html:2171-2176`, `index.html:2341-2344`,
  `scripts.pretty.js:42564-42569`
- Parity implication:
  Maze's extra color/readability comes from the base shader drift plus hotspot
  overlays and selection staging. Semantic accents in SoleMD must stay sparse
  and secondary so they do not flatten into one dominant purple wash.

### Round 6

- Focus:
  source-only review of startup rotation resets, card hotspot timing, and the
  semantic-pulse regression
- Source findings:
  Maze's particle loop is continuous from the first visible frame. The archive
  loop only ever increments wrapper rotation and shader time:
  - `this.wrapper.rotation.y += 0.001`
  - `this.material.uniforms.uTime.value += 0.002`
  Source:
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43047-43049`
- Parity implication:
  Any visible spin-then-reset cadence in SoleMD is our runtime remount or state
  churn, not a Maze mechanic. The blob clock needs to survive dev remount and
  viewport settling so the first seconds never read like a restart.
- Source findings:
  Maze cards are not shown during the initial selected-point phase. The
  stylesheet keeps hotspot cards hidden until the later `onlyReds` phase, while
  the earlier single-hotspot stage just keeps a few circle hotspots alive for a
  longer beat:
  - `.s-gfx:not(.has-only-reds) .hotspot__ui { display:none !important; }`
  - `.s-gfx:not(.has-only-reds).has-only-single .hotspot { --duration:4s; opacity:1 !important; }`
  Source:
  Maze homepage stylesheet inspected against the archived CSS/runtime grammar on
  `2026-04-19`
- Source findings:
  Maze hotspot anchors are assigned once, then only reattached when each
  hotspot's own animation cycle completes. The runtime does not batch-reseed
  the full hotspot pool on one timer:
  - initial placement via `setRandomHotspotPosition()` in `addHotspots()`
  - per-hotspot reattachment in each hotspot SVG `animationend` handler
  Source:
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43421-43457`
- Parity implication:
  Our hotspot overlay must keep a stable candidate per hotspot and only
  reassign that hotspot when it truly falls out of a valid screen slot. Shared
  reseed clocks create the jumpy card drift the source avoids.
- Current gap:
  the semantic pulses regressed into a mostly purple wash. The source base still
  needs to stay blue/pink, but SoleMD's semantic accents must reassert
  themselves as sparse direct overrides rather than being mixed back into the
  magenta base.

### Round 7

- Focus:
  remove the remaining authored screen-space bias from selected points and make
  the SoleMD highlight/card phases use real semantic point colors
- Source findings:
  Maze hotspot placement is geometry-random, not authored to one side of the
  viewport. `setRandomHotspotPosition()` repeatedly samples random geometry
  points until they satisfy basic screen-fit constraints, then that hotspot
  holds the same attachment until its own animation completes.
  Source:
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43470-43499`
- Parity implication:
  our selected-paper phase should not appear to originate from one back-left
  ribbon. Selected circles need to surface across the visible blob rather than
  following an authored left-side band.
- Intentional SoleMD divergence:
  Maze only distinguishes cyan/magenta hotspot classes. SoleMD should keep the
  same random geometry attachment grammar, but the highlight circles and cards
  should inherit the actual semantic point colors so the paper/entity/relation
  story reads through the selected nodes themselves.

### Round 8

- Focus:
  restore Maze's per-hotspot animation rhythm so selected papers appear as
  random living popups instead of one always-on rotating ribbon
- Source findings:
  Maze hotspot motion is staggered per hotspot, not one global always-on state:
  - archived HTML seeds each hotspot with its own `--delay` inline style in the
    `0ms..2000ms` range
  - `animationend` on each hotspot SVG resets `--delay`, reattaches that one
    hotspot to a new geometry point, forces layout, then re-adds
    `.is-animating`
  Source:
  `data/research/mazehq-homepage/2026-04-18/index.html:87-149`,
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43421-43457`
- Source findings:
  Maze's CSS hotspot timing is explicit:
  - default hotspot cycle duration is `2s`
  - the initial single-hotspot beat stretches to `4s`
  - the later `onlyReds` card phase disables the circle animation and keeps the
    selected hotspots statically visible
  Source:
  `data/research/mazehq-homepage/2026-04-18/styles.css` hotspot rules around
  `.hotspot.is-animating`, `.has-only-reds .hotspot`, and
  `.s-gfx:not(.has-only-reds).has-only-single .hotspot`
- Parity implication:
  our selected-paper phase should use per-hotspot random delays plus
  hotspot-local 2s/4s cycles and only reattach on that hotspot's own cycle
  completion. The later card phase should stay attached and stable rather than
  continue hopping.

### Round 9

- Focus:
  separate the neutral field substrate from the SoleMD semantic burst overlay so
  the field reads blue-first and semantic colors read as explicit pulse events
- Source findings:
  Maze's particle shader owns the neutral field color and does not use the
  geometry color buffer to tint the full blob. The hotspot layer is also not an
  arbitrary screen-space effect: `setRandomHotspotPosition()` samples positions
  from the model's geometry attribute and projects those sampled geometry points
  into the DOM layer.
  Source:
  `data/research/mazehq-homepage/2026-04-18/index.html:2337-2343`,
  `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js:43470-43524`
- Parity implication:
  when SoleMD keeps semantic colors, they should live in a constrained burst
  mask on top of the neutral field rather than becoming the full-field tint.
  The later selected-paper / card layer should still feel like it is attaching
  to sampled points from the blob, not to free-floating screen markers.
- Intentional SoleMD divergence:
  the base blob now stays blue-led for readability, while semantic colors are
  reserved for burst events and the sampled hotspot overlays.

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
- [ ] Initial page load must start at true zero-turn:
  no entering mid-rotation, no stop/restart cadence before the steady spin
- [x] Retimed blob deformation windows to Maze-style ranges:
  - frequency ramp `0.00-0.15`
  - first amplitude rise `0.10-0.14`
  - selection thinning `0.34-0.40`
  - diagram burst `0.49-0.59`
  - alpha/depth burst `0.49-0.53`
  - shrink/re-form `0.63-0.73`
- [x] Preserve continuous rotation after the half-turn so later phases still
  feel alive
- [ ] Re-check section geometry and scroll anchors after each pass:
  Maze's steady loop should never read like a rotation reset caused by short
  dwell or mid-range entry

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
- [ ] Keep the source color grammar continuous:
  no discrete pulse-step islands where the source uses drifting FBM color
  movement
- [ ] Re-review Maze shader color propagation in more detail before `/clean`:
  the current pulse feel still does not match the source closely enough
- [ ] Keep semantic accents sparse and secondary:
  the source still reads like one blue/magenta field with projected hotspots,
  not a globally semanticized blob
- [ ] Fix the semantic-pulse regression:
  semantic colors should read as distinct sparse waves again, not collapse into
  one dominant purple wash
- [ ] Document every intentional SoleMD divergence from Maze here

Current working divergence:

- SoleMD may use the seeded point palette to tint pulse endpoints so different
  semantic colors can appear inside a Maze-like base/noise shader grammar

Primary files:

- `apps/web/features/ambient-field/renderer/field-shaders.ts`
- `apps/web/features/ambient-field/scene/visual-presets.ts`
- `apps/web/features/ambient-field/asset/point-source-registry.ts`

### 5. Particle Movement Types

- [x] Ambient drift from the shared noise path
- [x] Rigid-body idle spin at the wrapper level
- [x] Scroll-linked half-turn at the model level
- [ ] Stream conveyor motion and funnel shaping
- [ ] Later phase selected-point thinning via `uSelection`
- [x] Source movement attribute ranges already match Maze:
  `aMove ±30`, `aSpeed 0..1`, `aRandomness.y ±1`, `aRandomness.z ±0.5`
- [ ] Make source-matched displacement read as alive:
  some particles should visibly zip through because color/alpha contrast and
  dwell make the existing source displacement legible

Primary files:

- `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- `apps/web/features/ambient-field/renderer/field-shaders.ts`

### 6. Selected Points And Hover-Panel Phase

- [ ] Blob-era selected points should be treated as a staged hotspot pool
- [ ] Recreate the source hotspot pool explicitly:
  `maxNumber 3 -> 40`, `uSelection 1 -> 0.3`, then later `onlyReds`
- [ ] Mirror the source hotspot structure:
  a few labeled hotspots plus many unlabeled circles instead of one bulky
  explanatory card block
- [ ] Later module reveals should be field-led:
  particles can disburse or part to reveal module panels, but the reveal should
  stay owned by the ambient field rather than by a large static DOM block
- [ ] If cards exist later, they should be sparse projected overlays or module
  reveals, not a bulky explanatory DOM slab inside the detail chapter
- [ ] Keep hover cards projected from selected points:
  source hotspots are projected each frame from geometry positions, not pinned
  to static layout slots
- [ ] Keep hotspot anchors stable for longer:
  source hotspots hold one attachment until that hotspot's own animation cycle
  ends, not until a shared timer reseeds the whole pool
- [ ] Remove the remaining left-side authored placement bias:
  selected dots and cards should surface across the visible globe rather than
  sweeping in from one back-left arc
- [ ] Use actual semantic point colors for the selected-paper and hover-card
  layers:
  the hotspot pool should read from the point palette, not from a binary
  blue/pink proxy
- [ ] Keep the first selected-point phase circle-only:
  source cards do not appear until the later `onlyReds` / detail-reveal beat
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
  beat 1 = selected paper points only; beat 2 = selected paper points plus
  projected hover cards; beat 3 = bridge into the detail chapter while the blob
  remains present
- [ ] Detail Story:
  adapt Maze's inspection mechanics into paper/entity/relation detail without
  carrying the Paper Story hover-card mode into this chapter
- [ ] Synthesis Story:
  relation links between points, wiki-facing connection story, persistent blob
- [ ] End State:
  field reforms into a more meaningful target shape, potentially brain-like,
  instead of disappearing

## To-Do List

- [ ] Tighten the initial globe read against the live Maze homepage
- [ ] Fix the load-time rotation stutter so the blob enters at zero-turn and
  stays in a steady counterclockwise spin
- [ ] Re-pass on color pulsing with source-only shader analysis:
  current color movement is improved but still not close enough to Maze
- [ ] Fix hotspot tracking quality:
  anchors should stay attached to one point much longer and cards should stop
  jumping around the viewport
- [ ] Fix highlight distribution:
  selected points and the later card anchors should surface throughout the blob
  instead of clustering into one rotating side band
- [ ] Re-review every major field element before `/clean`:
  shader, displacement read, rotation cadence, section dwell, and later reveal
  phases
- [ ] Add the missing blob hotspot / projected hover-card baseline:
  selected points and projected cards are source-owned mechanics, not optional
  polish
- [ ] Keep adapting Maze mechanics to the SoleMD storyboard instead of removing them
- [ ] Use the new named phase channels to drive selected-point density and later overlays
- [ ] Add a paper-highlight chapter using Maze-style selected-point staging
- [ ] Add a paper metadata / entity-relation hover-card phase using projected overlays
- [ ] Keep Paper Story beat naming explicit in code and docs:
  beat-level highlight/card windows are not the same thing as section-level
  chapter names
- [ ] Replace the current DOM-heavy detail section with a field-led reveal:
  particles disburse or separate to expose the relevant module panel
- [ ] Add a synthesis phase with visible point-to-point connections for the wiki story
- [ ] Add a re-formed end-state chapter, likely brain-like, while preserving the shared field
- [ ] Keep adding newly identified source elements to this ledger as they are found
- [ ] Run `/clean` discipline after the next major patch
- [ ] Do a final 1:1 parity review against the Maze source snapshot

## Current Gaps Confirmed

- The blob now persists, but the initial globe read still needs live visual
  tightening against Maze.
- The current field still needs a stronger source-like continuous color drift so
  semantic accents read as waves moving across a neutral base rather than as
  isolated pulse islands.
- The point-source movement ranges already match Maze, so the remaining "zip"
  gap is a visibility/readability problem, not a count or randomization problem.
- Scroll dwell is still shorter than the source, which compresses the perceived
  lifecycle and makes rotation/motion transitions feel less continuous.
- Projected hotspot and hover-card layers now exist, but the remaining work is
  tightening their chapter timing, motion quality, and parity against Maze's
  persistent sampled-anchor behavior.
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
