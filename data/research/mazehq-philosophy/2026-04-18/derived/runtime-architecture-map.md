# Philosophy Page Runtime Architecture Map

This page reuses Maze's shared particle-stage runtime rather than shipping a
one-off animation system for the philosophy route.

## Shared Runtime Signals

- `scripts.pretty.js:4458`
  - model loading helpers
  - point-source conversion helpers
  - particle material factory
  - scene preset table
- `scripts.pretty.js:4458`
  - shader uniforms include:
    - `uPixelRatio`
    - `uIsMobile`
    - `uScreen`
    - `uAlpha`
    - `uTime`
    - `uScale`
    - `uSize`
    - `uDepth`
    - `uAmplitude`
    - `uFrequency`
    - `uSelection`
    - stream-only funnel uniforms when the `stream` scene is active
- `index.html:1017-1048`
  - particle fragment and vertex shaders are embedded inline in the page shell

## Boot Sequence

- `scripts.pretty.js:4458`
  - app bootstrap constructs `this.gfx = new xi(document.querySelector(".js-gfx"))`
  - `this.gfx.init()` runs before route completion
  - page readiness waits on:
    - `this.setCurrentPage()`
    - `this.gfx.preload`
  - after preload, `onPageLoaded()` starts the page and stage together

## Scene Preset Table

The scene preset table at `scripts.pretty.js:4458` includes these slugs relevant
to the philosophy page:

- `sphere`
- `pcb`
- `hex`
- `shield`
- `cubes`
- `users`
- `globe`

The same table also carries shared homepage/runtime presets such as `blob` and
`stream`, confirming this page lives on the same core renderer family.

## Responsive Contract

- `styles.css:1`
  - `body::before` encodes `phone`, `tablet`, and `desktop`
  - utility classes gate `desktop-only`, `phone-only`, and `tablet-only`
- `scripts.pretty.js:4458`
  - runtime reads `body::before` through `_y()` to switch device branches
  - `uIsMobile` is wired into the shader material
- `scripts.pretty.js:4458`
  - reduced motion is detected through
    `window.matchMedia(\"(prefers-reduced-motion: reduce)\")`

## Page-Level Motion Grammar

- intro:
  - sphere scene establishes the page atmosphere
- story rail:
  - progress segments sync to the five philosophy cards
  - each card swaps the local `data-gfx` scene slug
- investor and logo blocks:
  - DOM-led motion sections layered over the same app shell
- CTA:
  - the page lands on the bitmap-derived `pcb` scene before footer handoff
