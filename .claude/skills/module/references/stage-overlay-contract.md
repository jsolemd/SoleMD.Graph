# Stage and Overlay Contract

Stage ownership, scene controllers, projection, hotspots, stream markers,
progress bars, and chapter choreography. Read this before changing how the
field stage runs or how DOM/SVG overlays mount on top of it.

## Fixed Stage Ownership

One page-global stage shell per surface adapter:

- fixed `.afr-stage` (or surface-equivalent) container
- one canvas
- one renderer
- one `THREE.Scene`
- one `PerspectiveCamera`
- one always-running render loop, gated by frame policy

The stage is declared before header and page content so the scroll document
passes over it instead of remounting it section by section.

Rules:

- one persistent stage owner per surface adapter
- no per-section canvases
- no section-local renderer instances
- elapsed-ms comes from `renderer/field-loop-clock.ts` — controllers and
  components read that singleton, never a local clock

## Controller-Per-Anchor Model

The stage manager iterates the authored manifest (`FIELD_SECTION_MANIFEST`)
and instantiates one scene controller per `stageItemId`:

- `controller/FieldController.ts` — abstract base (`yr` analog)
- `controller/BlobController.ts` — sphere subclass (`mm` analog)
- `controller/StreamController.ts` — flat-line + funnel subclass (`ug` analog)
- `controller/ObjectFormationController.ts` — flat authored-shape subclass
  (`_m` analog)

Each controller owns:

- initial parameters
- carry window visibility (`updateVisibility` with `entryFactor` /
  `exitFactor`)
- scroll binding
- scale/position updates (`updateScale`; Stream overrides with desktop
  `250 * (innerW/innerH) / (1512/748)` / mobile `168` formula)
- per-frame loop behavior (`loop(dtSec)` handles only idle wrapper rotation
  at `0.001` rad/frame; `uTime` is owned by the field-loop clock singleton)
- enter/exit tweens (`animateIn` / `animateOut`, 1.4 s / 1 s, `tnEase`
  cubic-bezier)
- screen-space projection (`toScreenPosition`)
- optional sticky behavior

React / R3F still owns component lifecycle, scene graph declaration, and
hotspot component instances. Controllers are plain-TypeScript objects
attached via `attach(...)` after refs are wired. This keeps per-frame math
out of React render and out of React state.

This is why the runtime feels continuous:

- multiple controllers can stay mounted at once
- visibility and emphasis interpolate
- the stage does not "switch scenes" by remounting global state

## Manifest-Driven, Not DOM-Scan-Driven

Authoring authority flows from `FIELD_SECTION_MANIFEST`, not from
`querySelectorAll('[data-gfx]')` page scans. Each entry carries
`{ sectionId, stageItemId, endSectionId?, presetId }`. `FixedStageManager`
prewarms point sources, awaits each controller's `whenReady()`, and only
then lets any controller tick.

Rules:

- do not instantiate controllers outside the manifest; the preload gate
  depends on the manifest being authoritative
- do not reintroduce a page-global DOM `[data-gfx]` scan as the default
  pattern
- do not add a string-keyed controller registry unless a real lazy-loaded or
  separately-authored consumer requires it
- shared chapter progress comes from `scroll/field-scroll-state.ts`, not
  from controller-local scroll truth

## Mouse Parallax Wrapper

`renderer/mouse-parallax-wrapper.ts` exports `attachMouseParallax(group,
options)` — a GSAP `sine.out` tween, 1 s duration, ±3e-4 rad/px on x,
±5e-4 rad/px on y. Returns a cleanup function (remove listener, kill tween).

Rules:

- mouse parallax is opt-in per module, not a global landing-page default
- the landing-page field surface ships zero pointer-driven rotation. The
  `mouseWrapper` group still exists per stage item as an identity group so
  future modules can target it without remounting the tree
- modules that want pointer-driven parallax on their own three.js group call
  `attachMouseParallax(group)` from a scoped `useEffect` and invoke the
  returned cleanup on unmount
- scene groups that need pointer parallax attach via this primitive, not
  bespoke mousemove listeners
- the wrapper target is always the dedicated `mouseWrapper`, not the scene
  root, so `updateScale` and `animateIn` tweens do not clobber each other

## Sticky Stage Behavior

Stream-style chapters opt into `data-gfx-sticky`. That does not create a
second pinned canvas:

- the section DOM continues scrolling
- the shared fixed stage remains in place
- the controller applies a scroll-relative Y correction so the WebGL content
  reads as pinned inside the chapter

Rule: sticky chapter behavior belongs in controller math, not in extra
canvas mounts.

## Hotspot Overlay System

Three named primitives under `apps/web/features/field/overlay/`:

- `FieldHotspotRing.tsx` — React component for a single hotspot. Props:
  - `variant`: `'cyan' | 'red'`
  - `phase`: `'idle' | 'animating' | 'only-reds' | 'only-single' | 'hidden'`
  - `delayMs`, `durationMs`, `easing`
  - `seedKey` — bumping this value forces a CSS reflow reseed so the keyframe
    animation restarts
  - `cardOffset`
  - `projection` — screen-space x/y/scale/opacity from the projection step
  - `onAnimationEnd` — wired to per-hotspot reseed
- `field-hotspot-ring.css` — hotspot keyframes under an `afr-` prefix.
  References to legacy class names should use the `afr-hotspot*`
  equivalents here
- `field-hotspot-lifecycle.ts` — exports
  `createHotspotLifecycleController({ count, samplePosition, sampleDelayMs,
  durationMs, maxRetries })`. Each hotspot's `animationend` triggers
  `reseed(index)` for that hotspot only. `reseed(index)` bumps the
  hotspot's `seedKey` so the React component restarts the CSS animation.
  Phase transitions (`only-reds`, `only-single`) are owned here

### Banned: Shared-Timer Reseed

A shared `setInterval` / shared timeline driving every hotspot's reseed
drifts out of phase and clobbers the natural cadence. Reseed is strictly
per-hotspot per `animationend`. Do not reintroduce a shared timer.

### Blob Controller Ownership

`BlobController` holds a `hotspotState` container for the 3D anchor meshes
and projection cache. Current state: projection + pool orchestration still
live in `FieldScene`; full delegation into `BlobController.hotspotState` is
deferred to a later `/clean` pass.

Rules:

- use `FieldHotspotRing` + `createHotspotLifecycleController` for any new
  hotspot surface
- do not ship bespoke DOM pools
- do not drive reseed from a global interval
- `FieldHotspotRing` + co-located `field-hotspot-ring.css` are the
  canonical ring primitive across every field surface (SVG stroke-dasharray
  `128`, `0.5` opacity, `6px` inner dot, `2 s` per-hotspot pulse). The
  landing page mounts instances inside `.afr-stage` and drives `opacity` /
  `transform` imperatively via refs — no ad-hoc CSS-in-JS box-shadow rings,
  no inline `<div>` glow pools anywhere else in the tree

## Stream Overlay System

The stream chapter is explicitly hybrid: three separate DOM/SVG layers
inside the section.

- static backdrop art via `<picture>`
- inline transparent SVG rails for motion paths
- DOM marker wrappers with hotspot circles and popup cards (~8 markers)

The WebGL stream controller is not responsible for marker choreography.
That work is owned by a separate GSAP overlay system.

### Stream Marker Timing

Marker choreography is beat-based and deterministic:

- beat size: `3.2 s`
- each marker path animation: `9.6 s`
- popup windows are scheduled with `call()` steps, not inferred from path
  progress

Popup dwell:

- two-popup markers: first popup `6.4 s`, final popup `3.2 s`
- three-popup markers: three equal `3.2 s` windows

Lane start order is authored, not DOM-order.

### Dual Responsive SVG

Stream overlays swap two things independently:

- static backdrop art swaps through `<picture>`
- animated path list swaps through JS `matchMedia`

The external backdrop SVGs and the inline animated rail SVGs do not use
identical viewBoxes (e.g. desktop inline `1204 × 535`, external `1229 × 534`;
non-desktop inline `345 × 653`, external `343 × 653`). Two near-but-not-
identical coordinate systems aligned by art direction.

Rules:

- the external backdrop SVGs are static art; animated rails live in the
  inline transparent SVG only
- do not try to recover motion-path semantics from the external art assets
- if desktop and non-desktop need different overlay rails, author them as a
  separate responsive asset pair
- do not assume the visible backplate SVG is also the motion-path authority

## Progress Bar Contract

Progress bars are separate DOM widgets:

- desktop only
- no ScrollTrigger ownership
- each segment maps to a target section through `data-id`
- progress is based on `getBoundingClientRect()` and viewport midpoint math
- CSS custom properties animate onto the wrapper (~`0.1 s`)
- canonical variable family: `--progress-1`, `--progress-2`, ... on the
  progress root
- `--bar-width` is published when the visual contract depends on measured
  rail width

Rules:

- chapter progress UI belongs in DOM
- keep it cheap and geometry-based
- do not entangle it with the WebGL frame loop unless the UI genuinely
  needs projection
- desktop-only progress should be runtime-gated, not merely hidden with CSS
- if the rail uses an active-state hook, toggle it on the root, not per
  segment

A progress rail is a reusable chapter primitive for any module with named
beats. It should remain a standalone DOM contract that reads authored beat
ids and never couples itself to renderer internals.

## Layer Ownership Summary

The runtime separates these layers cleanly:

- fixed WebGL stage: points, shaders, controller transforms; `uTime` fed
  from the field-loop clock singleton
- projected hotspot DOM: `FieldHotspotRing` instances driven by
  `createHotspotLifecycleController`; per-hotspot `animationend` reseed
- stream DOM/SVG overlay layer: motion-path markers and popups
- progress widgets: cheap DOM geometry progress

That separation is part of the premium feel. Do not collapse all
explanatory UI into the particle layer.

## Implementation Rules

- keep one persistent stage owner per surface adapter
- keep one `FieldController` subclass per anchor/manifest item
- centralize screen-space projection in `FieldController.toScreenPosition`
  (migrate any stray projection math into the controller)
- attach pointer parallax via `attachMouseParallax`, never bespoke listeners
- read elapsed time from `renderer/field-loop-clock`, never from a
  component-local clock
- build hotspots from `FieldHotspotRing` + `createHotspotLifecycleController`;
  reseed per-hotspot on `animationend`
- use the `tnEase` cubic-bezier (`cubic-bezier(0.5, 0, 0.1, 1)`) wherever
  legacy code calls Club GSAP's `CustomEase("tnEase")`. Documented divergence
  because Club GSAP `CustomEase` is not installed
- let chapter timing drive mutable runtime state, not heavy remounts
- preserve carry windows instead of abrupt section swaps
