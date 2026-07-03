# Mobile and Performance Contract

Performance, mobile, and frame-policy rules for the field substrate. Read this
before changing preload, frame lifecycle, DPR, resize, reduced motion,
breakpoints, or non-desktop branches.

For raw three.js performance rules (instancing, dispose, color management,
memory) see `/threejs/references/performance.md`. For raw WebGPU resource
costs (buffer budgets, atomics, workgroup sizing) see `/webgpu`. The
contract here is field/orb/particle-specific and overrides generic advice
when they conflict.

## Bootstrap

The runtime owns its readiness gate explicitly:

- the stage waits for point-source preload + texture readiness + every
  controller's `whenReady()` promise
- the renderer mounts immediately, but controller ticks stay inert until the
  readiness gate resolves
- async point-source families must not pop in mid-flight; that is an
  accidental second first paint

Do not rely on HTML preload hints alone for the particle runtime. The graphics
stage is part of page readiness.

## Preload Policy

- preload visible-scene-critical assets first
- defer unused scene assets until idle or first-use
- keep one stable cache once assets are converted to point sources
- do not eagerly preload every registered bitmap/model asset

## Frame Lifecycle

R3F-mapped rules:

- a single top-level `useFrame` per stage drives controller ticks; nested
  `useFrame` callbacks per hotspot or per anchor are banned
- `useFrame` callbacks must not call `setState`, `useReducer`'s dispatch,
  `useTransition`, or any other API that schedules a React render. Per-frame
  output flows into three.js refs and material uniforms directly
- React state changes are reserved for discrete transitions: phase gates,
  chapter boundaries, hotspot reseed events, visibility-based mount/unmount
- elapsed time comes from `renderer/field-loop-clock.ts` — the singleton that
  keeps `uTime` in module scope. This is why the shader survives StrictMode
  double-mount and the landing warmup remount without snapping

Frame policy is architectural, not optional polish:

```ts
type FieldFramePolicy = "always" | "transitions" | "demand" | "suspended";
```

Default bias:

- active hero or transition → `always`
- settled visible module → `transitions` or `demand`
- reduced motion → `demand`
- hidden or occluded surface → `suspended`

`renderer/use-adaptive-frameloop.ts` + `renderer/FrameloopInvalidator.tsx`
are the seams that wire this. Use them; do not leave the runtime in a
permanent always-on loop by default.

## DPR and Resize

- cap DPR at `Math.min(2, devicePixelRatio)` (single biggest mobile lever)
- pass that exact value into shaders as `uPixelRatio = min(devicePixelRatio, 2)`.
  `gl_PointSize` and `vAlpha` both scale with it; renderer pixelRatio and
  `uPixelRatio` uniform must be one value with one source of truth
- configure R3F with `gl={{ pixelRatio: Math.min(2, devicePixelRatio) }}` (or
  explicit `gl.setPixelRatio` in a `useThree` effect) so renderer and shader
  share the same effective ratio
- debounce resize by ~250 ms; force immediate work on `orientationchange`
- on touch devices, skip expensive scroll/gfx resize work unless the
  responsive bucket actually changed (suppress viewport-bar noise)

For WebGPU surfaces (orb runtime), DPR cap is even stricter — read
`orb-particle-target.md` for the 1.25 cap and the rationale.

## Responsive Taxonomy

Two responsive taxonomies operate at once.

Particle / runtime:

- `uIsMobile = !desktop`
- everything below `1024px` is the non-desktop particle branch

CSS / DOM:

- phone: `≤ 659px`
- tablet: `660–1023px`
- desktop: `≥ 1024px`

Stream rotation and point-budget changes apply to both phone and tablet.
Phone-only popup alignment and mobile-only DOM tweaks are a narrower layer
on top of the broader non-desktop particle branch. Do not collapse those
into one vague "mobile" rule.

## Point Budgets

Observed runtime budgets (canonical defaults for the field substrate):

- stream: desktop `15000`, non-desktop `10000`
- sphere / blob family: `16384` on both desktop and non-desktop

Do not assume every scene family gets the same responsive point reduction.
The orb on `feat/orb-as-field-particles` targets `1_000_000` particles —
that is a separate WebGPU runtime with its own budget contract; see
`orb-particle-target.md`.

## Non-Desktop Stream Behavior

The stream branch changes several things below `1024px`:

- rotates the particle stream by 90 degrees
- switches to non-desktop stream placement and scale presets
- swaps animated path rails to the non-desktop SVG set
- swaps static backplate art through `<picture>`

Note: this is not portrait-only logic; it is the general non-desktop branch.

`StreamController.updateScale` encodes the scale half: desktop uses
`250 * (innerW/innerH) / (1512/748)`, mobile short-circuits to `168` without
touching `innerW/innerH`. Rotation, asset swap, and popup placement remain
overlay-side responsibilities, not controller-side.

## Mouse Parallax

`renderer/mouse-parallax-wrapper.ts` is the only site where pointer
parallax wires up, via `attachMouseParallax(group, options)`.

Rules:

- the landing-page field surface ships zero pointer-driven rotation on any
  device. The `mouseWrapper` group is preserved per stage item as an
  identity group so future modules can opt in without remounting
- mouse parallax is opt-in per module, not a global default
- modules that want pointer-driven parallax on their own three.js group call
  `attachMouseParallax(group)` from a scoped `useEffect` and invoke the
  returned cleanup on unmount
- desktop-gate it. Mobile surfaces leave the wrapper group at identity
  rotation; idle wrapper spin and scroll-driven model rotation are enough
- do not attach the mousemove listener on touch-only devices even as a
  no-op; tween accumulation costs real frame time and `overwrite: "auto"`
  still runs per event
- if a future mobile surface wants parallax, drive it from
  device-orientation events in a separate primitive — do not pass synthetic
  mouse coordinates into this wrapper

## Overlay Differences By Breakpoint

Reduce explanatory density on smaller screens:

- top-stage hotspot cards are desktop-only
- desktop progress bars are desktop-only
- big pinned desktop event timelines should be replaced by lighter mobile
  enter/leave-center triggers
- stream popup classes add phone-specific placement modifiers

The rule: reduce overlay density and choreography complexity on smaller
screens without inventing a second conceptual runtime.

## Reduced Motion

Hierarchy:

- preserve the world (the ambient stage can stay alive)
- simplify the choreography
- disable non-essential motion first

Implementation:

- CSS disables animation and transitions globally where appropriate
- `data-scroll` GSAP choreography only registers under
  `prefers-reduced-motion: no-preference`
- frame policy collapses to `demand` for reduced motion
- do not replace the chapter with a blank placeholder; pin points/popups
  visible rather than looping them

## Cleanup and Teardown

WebGL and three.js disposal is mandatory:

- geometry, materials, renderer, WebGL context all explicitly disposed

GSAP cleanup is just as important — long-lived tweens keep dead three.js
objects alive and fire into unmounted materials:

- `attachMouseParallax` returns a cleanup function that removes the
  `mousemove` listener and runs `gsap.killTweensOf(group.rotation)`. The
  effect that calls it must invoke that cleanup on unmount, not just on
  re-render
- `FieldController.animateIn` / `animateOut` run GSAP tweens against
  `uAlpha` / `uDepth` / `uAmplitude`. `FieldController.destroy()` calls
  `gsap.killTweensOf` on those uniforms; controllers must be destroyed when
  their owning stage unmounts
- hotspot lifecycle controllers hold no GSAP state, but the
  `FieldHotspotRing` CSS animation must be allowed to emit its final
  `animationend` or be explicitly stopped. Do not force-remount the ring to
  clear a tween

Leaked tweens are the most common cause of "it keeps animating after I
navigate away" bugs. Treat GSAP disposal with the same discipline as
geometry/material disposal.

## What To Copy

- one persistent stage owner per surface adapter
- capped DPR, propagated into `uPixelRatio`
- breakpoint-specific point budgets
- debounced resize
- mobile resize-noise suppression
- one `useFrame` driver per stage, feeding the controller hierarchy
- separate DOM overlays instead of forcing everything into WebGL
- explicit disposal on teardown (material, geometry, renderer, WebGL context)

## What Must Improve Beyond Legacy

- do not eagerly preload every unused scene asset by default
- do not rely on pseudo-element string parsing as the long-term viewport
  contract
- add explicit hidden-tab / suspended-surface frame policy
- never mutate React state from `useFrame`; uniforms and three.js refs are
  the per-frame output channel
- always read elapsed time from `renderer/field-loop-clock.ts`
