# MazeHQ Doc-Search Review Playbook

Use this archive as reference code, not as authored product documentation.

## 1. What Doc-Search Over This Archive Can Answer Well

- which section owns a given `data-gfx` scene
- which `data-scroll` hooks exist and which adapter owns them
- where hotspots, stream points, popups, and progress bars live
- which assets are active on the homepage
- whether a proposed SoleMD implementation is still hybrid or has drifted into
  a simplified approximation

## 2. What It Does Not Replace

This archive does not give the same map as the Neo4j-backed code graph.

Do not use it for:

- caller graphs
- transitive dependents
- symbol reachability across the repo
- shortest path or flow tracing between local code symbols

Use Neo4j/code-search for those questions.

## 3. Recommended Query Order

1. query the derived maps first
2. query `index.html` and `scripts.pretty.js` second
3. open the raw file directly only when the map result is too coarse

## 4. Query Shapes That Should Work Reliably

- `runtime architecture fixed stage data-gfx controller per anchor`
- `chapter selector map stream popup graphRibbon events`
- `asset pipeline pcb bitmap stream rail backdrop`
- `review hybrid stream chapter ownership`
- `welcome blob carry end trigger`
- `progress js-progress data-current-visible`

## 5. Review Questions For SoleMD Parity

- does the implementation still have one fixed stage owner?
- are scene controllers mounted from semantic anchors instead of page-local
  bespoke scripts?
- is the stream/process chapter still hybrid DOM/SVG/WebGL?
- are progress bars DOM-native and outside the heavy render loop?
- are carry windows encoded explicitly instead of hard-switching scenes?
- are bitmap/model/procedural point sources still distinct?

## 6. Curation Contract For `/codeatlas/mazehq-homepage`

The curated doc-search surface should prioritize:

- `derived/*.md`
- `index.html`
- `scripts.pretty.js`

The curated doc-search surface should avoid indexing noise-heavy files as
primary retrieval targets:

- `scripts.min.js`
- `libs.min.js`
- `styles.css`
- `flow-diagram-main.svg`
- `flow-diagram-main-mobile.svg`
- `sha256sum.txt`
- `source-urls.txt`
- binary `.png` and `.glb` assets

## 7. Implementation Rule

If a question can be answered by the derived maps, use the map. If it cannot,
drop into raw source for confirmation. Do not invent runtime behavior from
memory when the archived reference code already encodes it.
