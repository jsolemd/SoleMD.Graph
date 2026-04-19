# MazeHQ Philosophy Page Reference Overview

This archive is a code-first research snapshot of the Maze `Our Philosophy`
page captured under the same local date bucket as the homepage snapshot:
`2026-04-18`.

It was assembled from two sources:

- the HAR capture at `C:\Users\Jon\Desktop\mazehq.com - philozophy.har`
- direct same-origin fetches for page assets referenced by the HTML/CSS but not
  embedded in the HAR body payloads

## What This Archive Is For

- preserve the page-level animation flavor without reopening a live browser
- keep the philosophy page separate from the homepage archive
- make the section choreography and scene ownership searchable
- keep the model, bitmap, font, and logotype assets local for future rebuilds

## Archive Shape

- `index.html`
  - captured page shell and inline particle shaders
- `styles.css`
  - layout, responsive rules, progress bar, fixed stage, hotspots, and type
- `libs.min.js`
  - bundled vendor/runtime dependencies
- `scripts.min.js`
  - shipped page runtime
- `scripts.pretty.js`
  - readable bundle for reverse-engineering
- `models/`
  - `Cubes.glb`, `Net.glb`, `Shield.glb`, `Users.glb`, `World.glb`
- `fonts/`
  - Roobert, HelveticaNeue, and PPSupplySans variants present or retrievable
- `logotypes/`
  - mobile, desktop, `120_72`, and `120_72_x2` logo assets referenced by the
    investor and logo sections
- `particle.png`, `pcb.png`, `logo.png`, `og_image.jpg`
  - bitmap assets present in the page or site shell

## Important Behavior Summary

- the page uses the same shared fixed `.s-gfx` stage and particle shader family
  as the Maze homepage snapshot
- intro scene:
  - `data-gfx="sphere"`
- philosophy story chapter:
  - five numbered progress segments
  - five story cards with `data-gfx` scene swaps:
    - `cubes`
    - `hex`
    - `shield`
    - `users`
    - `globe`
- investor and logo strips are DOM-led sections layered over the same page shell
- closing CTA scene:
  - `data-gfx="pcb"`

## Capture Notes

- the archive currently contains `96` files including provenance and derived
  markdown
- the CSS references `Roobert300.woff` and `Roobert300.woff2`, but both URLs
  returned `404` during same-origin fetch completion on `2026-04-18` local
  / `2026-04-19` UTC
- the runtime-critical graphics assets are present locally even without a fresh
  Chrome DevTools recapture

## Retrieval Order

1. `derived/overview.md`
2. `derived/chapter-selector-map.md`
3. `derived/runtime-architecture-map.md`
4. `derived/asset-pipeline-map.md`
5. `derived/model-inspection.md`
6. `derived/doc-search-review-playbook.md`
7. `index.html`
8. `scripts.pretty.js`
9. `styles.css`
