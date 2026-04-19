# Maze Mobile And Performance Contract

Use this reference when a task touches preload policy, frame lifecycle, DPR,
resize, reduced motion, breakpoints, or non-desktop ambient-field behavior.

## Bootstrap Contract

Maze does not rely on HTML preload hints for the particle runtime.

Instead:

- page boot waits for `window.load`
- `body` starts as `is-not-ready`
- the main wrapper stays hidden until preload resolves
- the app removes `is-not-ready` only after page preload plus gfx preload finish

Important implication:

- first-load readiness is JS-owned
- the graphics stage is considered part of page readiness

SoleMD should preserve the explicit readiness contract, but it does not need to
copy Maze's exact “hide everything until all gfx preload completes” behavior.

## Asset Preload Policy

Maze does this:

- `gfx.init()` sets `this.preload = Promise.all([ku.loadAll()])`
- `ku.loadAll()` eagerly loads every registered bitmap/model asset
- converted point clouds are memoized in the asset registry before the render
  loop starts

That is useful to understand, but it is not the right default rule for SoleMD.

Preferred SoleMD rule:

- preload visible-scene-critical assets first
- defer unused scene assets until idle or first-use
- keep one stable cache once assets are converted to point sources

## Frame Lifecycle

Maze stage loop:

- one unconditional `requestAnimationFrame(this.loop)`
- per-frame scene-controller updates
- one render call

Useful parity takeaway:

- one RAF owner
- mutable scene/runtime state
- no remount-driven animation transport

Deliberate SoleMD improvement:

- add tab visibility pause or a stricter frame policy
- do not leave a continuous loop running for hidden or suspended surfaces

## DPR And Resize

Maze performance discipline includes:

- DPR capped to `min(2, devicePixelRatio)`
- resize debounced by `250ms`
- `orientationchange` forces immediate work
- on touch devices, some expensive scroll/gfx resize work is skipped unless the
  responsive bucket actually changed

These are the important rules to copy:

- cap DPR
- debounce resize
- distinguish meaningful breakpoint transitions from viewport-bar noise

Do not copy Maze's exact breakpoint-detection mechanism if a cleaner shared
viewport contract exists.

## Responsive Taxonomy

Maze uses two responsive taxonomies at once.

Particle/runtime taxonomy:

- `uIsMobile = !desktop`
- everything below `1024px` is the non-desktop particle branch

CSS/DOM taxonomy:

- `phone`: `<= 659px`
- `tablet`: `660-1023px`
- `desktop`: `>= 1024px`

Important implication:

- stream rotation and point-budget changes apply to both phone and tablet
- phone-only popup alignment and mobile-only DOM tweaks are a narrower layer on
  top of that broader non-desktop particle branch

Do not collapse those into one vague “mobile” rule.

## Point Budgets

Observed runtime budgets:

- stream:
  - desktop `15000`
  - non-desktop `10000`
- blob/sphere family:
  - `16384` on both desktop and non-desktop in this snapshot

Do not assume every scene family gets the same responsive point reduction.

## Non-Desktop Stream Behavior

The stream branch changes several things below `1024px`:

- rotates the particle stream by 90 degrees
- switches to non-desktop stream placement and scale presets
- swaps animated path rails to the non-desktop SVG set
- swaps static backplate art through `<picture>`

Important correction:

- this is not portrait-only logic
- it is the general non-desktop branch

## Overlay Differences By Breakpoint

Maze reduces explanatory density on smaller screens:

- top-stage hotspot cards are desktop-only
- desktop progress bars are desktop-only
- the big pinned desktop event timeline is replaced by lighter mobile
  enter/leave-center triggers
- stream popup classes add phone-specific placement modifiers like
  `popup--mobile-left` and `popup--mobile-right`

SoleMD rule:

- reduce overlay density and choreography complexity on smaller screens without
  inventing a second conceptual runtime

## Reduced Motion

Maze honors reduced motion in two main ways:

- CSS disables animation and transitions globally
- `data-scroll` GSAP choreography only registers under
  `prefers-reduced-motion: no-preference`

That means:

- the ambient stage can still exist
- the heavier DOM/SVG choreography is the first thing to drop away

SoleMD should keep the same hierarchy:

- preserve the world
- simplify the choreography
- disable non-essential motion first

## Cleanup And Teardown

Maze explicitly disposes:

- geometry
- materials
- renderer
- WebGL context

This is worth copying directly. Ambient-field work that ignores teardown is not
production-grade.

## What To Copy

- one persistent stage owner
- capped DPR
- breakpoint-specific point budgets
- debounced resize
- mobile resize-noise suppression
- one RAF owner
- separate DOM overlays instead of forcing everything into WebGL
- explicit disposal on teardown

## What To Improve In SoleMD

- do not eagerly preload every unused scene asset by default
- do not rely on pseudo-element string parsing as the long-term viewport
  contract
- add explicit hidden-tab / suspended-surface frame policy
- keep performance rules in the shared runtime, not in page-local code
