# Maze Stage And Overlay Contract

Use this reference when a task touches stage ownership, scene controllers,
projection, hotspots, stream markers, progress bars, or chapter choreography.

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

## Controller-Per-Anchor Model

The stage manager scans `[data-gfx]` anchors and instantiates one scene
controller per slug:

- `blob`
- `stream`
- `pcb`

Each controller owns:

- initial parameters
- carry window visibility
- scroll binding
- scale/position updates
- per-frame loop behavior
- optional sticky behavior

This is why Maze feels continuous:

- multiple controllers can stay mounted at once
- visibility and emphasis interpolate
- the stage does not “switch scenes” by remounting global state

## Sticky Stage Behavior

`stream` opts into `data-gfx-sticky`.

That does not create a second pinned canvas. Instead:

- the section DOM continues scrolling
- the shared fixed stage remains in place
- the stream controller applies a scroll-relative Y correction so the WebGL
  content reads as pinned inside the chapter

SoleMD rule:

- sticky chapter behavior belongs in controller math, not in extra canvas mounts

## Hotspot Overlay System

Maze predeclares a hotspot pool directly inside `.s-gfx`:

- `41` hotspot DOM nodes total
- `21` red
- `20` cyan/default
- only `3` hotspots ship with attached card UI
- the remaining `38` are bare ring affordances

The blob scene owns hotspot projection:

- it creates hidden 3D anchor meshes
- projects them to screen space
- writes DOM `x`, `y`, `scale`, and `opacity`
- toggles stage-level classes like `has-only-reds`

Important distinction:

- declared hotspot pool size is not the same as visible hotspot count
- scroll choreography changes visibility density over time

SoleMD rule:

- keep a projected overlay layer with a reusable hotspot pool
- do not make every hotspot a React-mounted one-off card

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

Do not flatten this into “all markers loop together.”

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
- projected hotspot DOM:
  - blob-stage annotation pool
- stream DOM/SVG overlay layer:
  - motion-path markers and popups
- progress widgets:
  - cheap DOM geometry progress

That separation is part of the premium feel. Do not collapse all explanatory
UI into the particle layer.

## Implementation Rules For SoleMD

- build a reusable `StageManager`
- keep one `SceneController` per anchor/manifest item
- centralize screen-space projection in a `ProjectionController`
- keep hotspot, marker, popup, and progress systems as overlay authorities
- let chapter timing drive mutable runtime state, not heavy remounts
- preserve carry windows instead of abrupt section swaps
