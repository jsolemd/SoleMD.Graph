# MazeHQ Homepage Reference Overview

This archive is not an authored documentation set. It is a code-first research
snapshot of the Maze homepage captured on `2026-04-18`, with derived markdown
maps added so doc-search can retrieve architecture and implementation intent
from stable files instead of relying on raw bundled source alone.

## What This Derived Layer Is For

- make the archived homepage searchable as reference code
- give future agents a fast map before they open `index.html` or
  `scripts.pretty.js`
- preserve the runtime/chapter/asset relationships needed for near-clone motion
  parity
- keep the reusable knowledge in the archive itself so skill guidance can point
  to it directly

## Retrieval Order Inside The Archive

1. `derived/overview.md`
2. `derived/runtime-architecture-map.md`
3. `derived/chapter-selector-map.md`
4. `derived/asset-pipeline-map.md`
5. `derived/model-inspection.md`
6. `derived/doc-search-review-playbook.md`
7. `index.html`
8. `scripts.pretty.js`
9. `flow-diagram-main.svg` and `flow-diagram-main-mobile.svg`

## Primary Raw Source Entry Points

- `index.html:235-317` defines the welcome chapter, `data-gfx="blob"`, and the
  `welcome`, `moveNew`, and `clients` scroll hooks.
- `index.html:564-712` defines the stream chapter shell, the inline SVG rails,
  and the `.js-stream-point` plus `.js-stream-point-popup` DOM markers.
- `index.html:1067-1098` defines the CTA chapter, `data-gfx="pcb"`, and the
  `cta` scroll hook.
- `scripts.pretty.js:49469-49585` defines the fixed stage runtime that preloads
  assets, scans `[data-gfx]`, and instantiates scene controllers.
- `scripts.pretty.js:48911-49035` defines the stream DOM motion-path handler.

## Important Constraint

Doc-search over this archive is a retrieval layer over reference code and
derived maps. It is not equivalent to the Neo4j-backed code graph:

- use this archive when the question is structure, selector ownership, chapter
  choreography, asset usage, or parity review
- use Neo4j/code-search when the question is call graph, dependents, symbol
  reachability, or full flow tracing

## Recommended Questions

- which section owns the `blob`, `stream`, or `pcb` controller?
- where do hotspots come from, and are they DOM or WebGL?
- is the stream chapter shader-driven, DOM-driven, or hybrid?
- what are the exact `data-scroll` hooks on the captured homepage?
- which assets are active on the homepage versus merely present in the registry?
- how many raw vertices does `World.glb` or `Net.glb` contribute to Maze's
  point-cloud path?
