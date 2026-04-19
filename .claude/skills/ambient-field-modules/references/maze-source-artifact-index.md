# Maze Source Artifact Index

Use this file when you need to reopen the raw Maze homepage snapshot instead of
the distilled architectural references.

## Snapshot Locations

- disposable working mirror:
  - `/tmp/maze/`
- repo-local archive mirror:
  - `data/research/mazehq-homepage/2026-04-18/`

The repo-local archive is the stable local copy. It is gitignored through
`data/`, so do not treat it as committed product documentation.

## Reproducibility Files

Inside `data/research/mazehq-homepage/2026-04-18/`:

- `downloaded-at.txt`
  - UTC download timestamp
- `source-urls.txt`
  - canonical source URL list for the snapshot
- `sha256sum.txt`
  - checksums for the mirrored files

If a future re-download disagrees with these checksums, assume the upstream site
changed and re-validate every parity-sensitive conclusion.

## Core Files

- `index.html`
  - stage shell, hotspot markup, stream marker markup, inline particle shaders,
    and responsive stream SVG rails
- `scripts.min.js`
  - shipped runtime bundle
- `scripts.pretty.js`
  - readable pretty-print used for line-level reverse-engineering
- `styles.css`
  - breakpoint contract, fixed-stage CSS, hotspot/popup classes, and reduced
    motion rules
- `flow-diagram-main.svg`
  - desktop stream backdrop art
- `flow-diagram-main-mobile.svg`
  - non-desktop stream backdrop art
- `particle.png`
  - point sprite texture used in the fragment shader
- `pcb.png`
  - bitmap source for the PCB point cloud
- `logo.png`
  - bitmap asset present in the registry but not active on the live homepage
- `models/*.glb`
  - model assets converted into point clouds for non-homepage scene slugs

## Highest-Value Search Entry Points

Open these first:

- `index.html:2119`
  - particle fragment shader
- `index.html:2132`
  - particle vertex shader
- `scripts.pretty.js:42545`
  - shared particle material factory
- `scripts.pretty.js:42807`
  - stream semantic bucket tables
- `scripts.pretty.js:42879`
  - shared attribute injection
- `scripts.pretty.js:42989`
  - procedural / bitmap / model point-source pipeline
- `scripts.pretty.js:48911`
  - stream DOM/SVG overlay choreography
- `scripts.pretty.js:49469`
  - singleton stage bootstrap and preload
- `scripts.pretty.js:50181`
  - progress bar DOM logic

## Useful Grep Patterns

When reopening the archive, these are the fastest high-signal searches:

- `rg -n "particles-vertex-shader|particles-fragment-shader" data/research/mazehq-homepage/2026-04-18/index.html`
- `rg -n "aMove|aSpeed|aRandomness|aSelection|aStreamFreq|uFunnel|uScreen" data/research/mazehq-homepage/2026-04-18/index.html data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`
- `rg -n "data-gfx|data-gfx-sticky|js-hotspot|js-stream-point|js-progress" data/research/mazehq-homepage/2026-04-18/index.html`
- `rg -n "getSphere|bitmapToPoints|modelToPoints|fromVertices|addParams|loadAll" data/research/mazehq-homepage/2026-04-18/scripts.pretty.js`
- `rg -n "prefers-reduced-motion|body::before|desktop-only|phone-only|tablet-only" data/research/mazehq-homepage/2026-04-18/styles.css`

## How To Use This Archive

Default order:

1. Read the focused skill references in this folder for the distilled contract.
2. Drop into the raw archive only when you need line-level confirmation or to
   answer a new question not yet encoded in the references.

Do not start by diffing raw files if a focused reference already answers the
question.
