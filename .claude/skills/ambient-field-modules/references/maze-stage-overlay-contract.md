# Maze Stage And Overlay Contract

Use this reference when a task touches stage ownership, scene controllers,
projection, hotspots, stream markers, progress bars, or chapter choreography.

The Round 12 canonical ledger is
`docs/map/ambient-field-maze-baseline-ledger-round-12.md`. Line citations below
are to `scripts.pretty.js` unless otherwise noted.

## Fixed Stage Ownership

Maze uses one page-global stage shell:

- fixed `.s-gfx` container
- one canvas
- one renderer
- one `THREE.Scene`
- one `PerspectiveCamera`
- one always-running render loop

The stage is declared before header and page content, so the scroll document
passes over it instead of remounting it section by section.

SoleMD rule:

- one persistent stage owner per surface adapter
- no per-section canvases
- no section-local renderer instances
- elapsed-ms comes from `renderer/field-loop-clock.ts` — controllers and
  components read that singleton, never a local clock (see
  `maze-particle-runtime-architecture.md` → Field-Loop Clock)

## Controller-Per-Anchor Model (Round 12)

The stage manager scans `[data-gfx]` anchors and instantiates one scene
controller per slug:

- `blob`
- `stream`
- `pcb`

In Round 12, SoleMD mirrors Maze's class hierarchy (`yr` / `mm` / `ug` / `_m`)
with a typed controller hierarchy under `apps/web/features/ambient-field/`:

- `controller/FieldController.ts` — abstract base (`yr`,
  `scripts.pretty.js:43013-43254`)
- `controller/BlobController.ts` — subclass (`mm`, `:43257-43526`)
- `controller/StreamController.ts` — subclass (`ug`, `:49326-49345`)
- `controller/PcbController.ts` — subclass (`_m`, `:43615-43630`)

Each controller owns:

- initial parameters
- carry window visibility (`updateVisibility` with `entryFactor` /
  `exitFactor`)
- scroll binding
- scale/position updates (`updateScale`; Stream overrides with Maze's
  `250 * (innerW/innerH) / (1512/748)` desktop / `168` mobile formula)
- per-frame loop behavior (`loop(dtSec)` handles only idle wrapper rotation
  at `0.001` rad/frame — matching Maze `:43047`. The second Maze delta
  on that same pair of lines, `uTime += 0.002`, is owned by the
  field-loop clock singleton, not the controller)
- enter/exit tweens (`animateIn` / `animateOut`, 1.4s / 1s, `tnEase`
  cubic-bezier, `:43125-43187`)
- screen-space projection (`toScreenPosition`, `:43213-43227`)
- optional sticky behavior

React / R3F still owns component lifecycle, scene graph declaration, and
hotspot component instances. Controllers are plain-TypeScript objects attached
via `attach(...)` after refs are wired. This keeps per-frame math out of React
render and out of React state.

This is why Maze feels continuous:

- multiple controllers can stay mounted at once
- visibility and emphasis interpolate
- the stage does not "switch scenes" by remounting global state

## Mouse Parallax Wrapper

Maze's base controller (`yr`, `scripts.pretty.js:43189-43196`) wires a
mousemove parallax that rotates a dedicated `mouseWrapper` group. SoleMD
Round 12 ships this as:

- `apps/web/features/ambient-field/renderer/mouse-parallax-wrapper.ts`
- export: `attachMouseParallax(group, options)`
- GSAP `sine.out` tween, 1s duration
- ±3e-4 rad/px on x, ±5e-4 rad/px on y
- returns a cleanup function (remove listener, kill tween)

SoleMD rule:

- mouse parallax is **opt-in per module**, not a global landing-page default
- the landing-page ambient-field surface does **not** attach parallax to its
  background blob (Round 13 removed the homepage `useEffect`); the
  `mouseWrapper` group still exists per stage item as an identity group so
  future modules can target it without remounting the tree
- modules that want pointer-driven parallax on their own Three.js group call
  `attachMouseParallax(group)` from a scoped `useEffect` and invoke the
  returned cleanup on unmount
- scene groups that need pointer parallax attach via this primitive, not
  bespoke mousemove listeners
- the wrapper target is always the dedicated `mouseWrapper`, not the scene
  root, so `updateScale` and `animateIn` tweens do not clobber each other

## Sticky Stage Behavior

`stream` opts into `data-gfx-sticky`.

That does not create a second pinned canvas. Instead:

- the section DOM continues scrolling
- the shared fixed stage remains in place
- the stream controller applies a scroll-relative Y correction so the WebGL
  content reads as pinned inside the chapter

SoleMD rule:

- sticky chapter behavior belongs in controller math, not in extra canvas mounts

## Hotspot Overlay System (Round 12)

Maze predeclares a hotspot pool directly inside `.s-gfx`:

- `41` hotspot DOM nodes total
- `21` red
- `20` cyan/default
- only `3` hotspots ship with attached card UI
- the remaining `38` are bare ring affordances

DOM shape: `index.html:87-149`. CSS keyframes: extracted in
`docs/map/ambient-field-maze-baseline-ledger-round-12.md` §13. Pool + projection
logic: `scripts.pretty.js:43421-43524`.

### SoleMD Primitives

Round 12 replaces the pre-R12 inline `FieldScene` hotspot DOM logic with three
named primitives under `apps/web/features/ambient-field/overlay/`:

- `AmbientFieldHotspotRing.tsx` — React component for a single hotspot.
  Props:
  - `variant`: `'cyan' | 'red'`
  - `phase`: `'idle' | 'animating' | 'only-reds' | 'only-single' | 'hidden'`
  - `delayMs`, `durationMs`, `easing`
  - `seedKey` — bumping this value forces a CSS reflow reseed so the keyframe
    animation restarts
  - `cardOffset`
  - `projection` — screen-space x/y/scale/opacity from the projection step
  - `onAnimationEnd` — wired to per-hotspot reseed
- `ambient-field-hotspot-ring.css` — ports Maze's hotspot keyframes verbatim
  under an `afr-` prefix. Anything referencing Maze's original class names
  should use the `afr-hotspot*` equivalents here.
- `ambient-field-hotspot-lifecycle.ts` — exports
  `createHotspotLifecycleController({ count, samplePosition, sampleDelayMs,
  durationMs, maxRetries })`.
  - Each hotspot's `animationend` handler triggers `reseed(index)` for
    **that hotspot only**.
  - `reseed(index)` bumps the hotspot's `seedKey` so the React component
    restarts the CSS animation.
  - Phase transitions (e.g. `only-reds`, `only-single`) are owned here.

### Banned: Shared-Timer Reseed (Round 11 Regression)

A shared `setInterval` / shared timeline driving every hotspot's reseed was
the Round 11 regression. It drifted out of phase and clobbered the blobby
cadence Maze establishes. In Round 12, reseed is strictly
per-hotspot-per-`animationend`. Do not reintroduce a shared timer.

### Blob Controller Ownership

`BlobController` holds a `hotspotState` container for the 3D anchor meshes and
projection cache. Current status: projection + pool orchestration still live
in `FieldScene`; full delegation into `BlobController.hotspotState` is
deferred to a later `/clean` pass. Hotspot rejection rules live at
`scripts.pretty.js:43470-43499`; projection at `:43501-43524`.

SoleMD rule:

- use `AmbientFieldHotspotRing` + `createHotspotLifecycleController` for any
  new hotspot surface
- do not ship bespoke DOM pools
- do not drive reseed from a global interval
- `AmbientFieldHotspotRing` + co-located `ambient-field-hotspot-ring.css`
  are the canonical ring primitive across every ambient-field surface (SVG
  stroke-dasharray `128`, `0.5` opacity, `6px` inner dot, `2s` per-hotspot
  pulse). The landing page mounts instances inside `.afr-stage` and drives
  `opacity` / `transform` imperatively via refs — no ad-hoc CSS-in-JS
  box-shadow rings, no inline `<div>` glow pools anywhere else in the tree.

## Stream Overlay System

The stream chapter is explicitly hybrid.

It has three separate DOM/SVG layers inside the section:

- static backdrop art via `<picture>`
- inline transparent SVG rails for motion paths
- `8` DOM marker wrappers with hotspot circles and popup cards

The WebGL stream controller is not responsible for marker choreography.
That work is owned by a separate GSAP overlay system.

## Stream Marker Timing

Marker choreography is beat-based and deterministic:

- beat size: `3.2s`
- each marker path animation: `9.6s`
- popup windows are scheduled with `call()` steps, not inferred from path
  progress

Popup dwell rules:

- two-popup markers:
  - first popup visible for `6.4s`
  - final popup visible for `3.2s`
- three-popup markers:
  - three equal `3.2s` windows

Lane start order is authored, not DOM-order:

- `kdc`: `0s`
- `access`: `3.2s`
- `function`: `6.4s`
- `json`: `9.6s`
- `fpt`: `12.8s`
- `fou`: `16s`
- `image`: `19.2s`
- `framebuffer`: `22.4s`

Do not flatten this into "all markers loop together."

## Dual Responsive SVG Contract

Responsive stream overlays swap two things independently:

- static backdrop art swaps through `<picture>`
- animated path list swaps through JS `matchMedia`

Important detail:

- the external backdrop SVGs and the inline animated rail SVGs do not use
  identical viewBoxes
- desktop:
  - inline rails: `1204 x 535`
  - external backdrop: `1229 x 534`
- non-desktop:
  - inline rails: `345 x 653`
  - external backdrop: `343 x 653`
- Maze aligns two near-but-not-identical coordinate systems by art direction

Also important:

- the external backdrop SVGs are static art
- the animated rails live in the inline transparent SVG only
- do not try to recover motion-path semantics from the external art assets

SoleMD rule:

- if desktop and non-desktop need different overlay rails, author them as a
  separate responsive asset pair
- do not assume the visible backplate SVG is also the motion-path authority

## Progress Bar Contract

Progress bars are separate DOM widgets:

- desktop only
- no ScrollTrigger ownership
- each segment maps to a target section through `data-id`
- progress is based on `getBoundingClientRect()` and viewport midpoint math
- CSS custom properties animate onto the wrapper over `0.1s`

Important detail:

- `--bar-width` is measured from the first `.js-progress-bar`

SoleMD rule:

- chapter progress UI belongs in DOM
- keep it cheap and geometry-based
- do not entangle it with the WebGL frame loop unless the UI genuinely needs
  projection

## Layer Ownership Summary

Maze separates these layers cleanly:

- fixed WebGL stage:
  - points, shaders, controller transforms
  - `uTime` fed from the field-loop clock singleton
- projected hotspot DOM:
  - `AmbientFieldHotspotRing` instances driven by
    `createHotspotLifecycleController`
  - per-hotspot `animationend` reseed (no shared timer)
- stream DOM/SVG overlay layer:
  - motion-path markers and popups
- progress widgets:
  - cheap DOM geometry progress

That separation is part of the premium feel. Do not collapse all explanatory
UI into the particle layer.

## Implementation Rules For SoleMD

- keep one persistent stage owner per surface adapter
- keep one `FieldController` subclass per anchor/manifest item
- centralize screen-space projection in `FieldController.toScreenPosition`
  (migrate any stray projection math into the controller)
- attach pointer parallax via `attachMouseParallax`, never bespoke listeners
- read elapsed time from `renderer/field-loop-clock`, never from a
  component-local clock
- build hotspots from `AmbientFieldHotspotRing` +
  `createHotspotLifecycleController`; reseed per-hotspot on `animationend`
- use the `tnEase` cubic-bezier (`cubic-bezier(0.5, 0, 0.1, 1)`) wherever
  Maze calls its `CustomEase("tnEase")` — documented divergence because the
  Club GSAP CustomEase plugin is not installed
- let chapter timing drive mutable runtime state, not heavy remounts
- preserve carry windows instead of abrupt section swaps
