# Stream Chapter Hybrid Contract

Use this note when working on the landing-page stream/process chapter or any
future module that mixes WebGL carry with DOM/SVG explanatory choreography.

## Core Rule

The stream chapter is a **hybrid surface**, not a shader-only scene.

It is composed of:

- one ambient-field stage controller carrying the stream point cloud
- one DOM/SVG shell carrying the rail geometry, markers, and popup copy
- one authored anchor that defines when the chapter is active

These layers share timing intent, not shared runtime state.

## SoleMD Shape

Landing implementation:

- stage controller: `StreamController`
- fixed-stage owner: `FixedStageManager`
- authored stage entry: `FIELD_SECTION_MANIFEST` row for `section-graph`
- DOM shell: `surfaces/AmbientFieldLandingPage/StreamChapterShell.tsx`
- rail geometry: `stream-rail-svg.tsx`
- looped marker/popup choreography:
  `scroll/chapters/landing-stream-chapter-points.ts`
- chapter hook: `chapter-adapters/stream-chapter.ts`

The DOM shell owns:

- `data-scroll="stream"`
- the desktop and mobile SVG rail variants
- 8 stream points from the shared manifest
- popup copy and red/neutral variant styling

The stage owns:

- the stream particle conveyor
- stream preset uniforms
- carry-window visibility
- camera-space scale and funnel motion

## Shared Authoring Surface

Both DOM and stage layers read from the same authored intent:

- anchor id: `section-graph`
- stage scene slug: `stream`
- point manifest: `stream-point-manifest.ts`

Do not invent parallel per-point state synchronization between the shader and
the popup shell. The shell is explanatory choreography, not an alternate source
of truth for the stream geometry.

## Sanctioned Divergences From Maze

SoleMD keeps the Maze motion grammar but not the Maze implementation details:

- React composition replaces `.js-*` query-selector wiring
- `afsp-` prefixed CSS replaces Maze class names
- the DOM shell may be mounted as a sibling React surface rather than a literal
  child of the same node as the WebGL anchor
- SoleMD copy stays biomedical/evidence-oriented rather than reusing Maze copy

## Reduced Motion

Reduced motion should:

- keep the shell mounted
- pin points/popups visible rather than looping them
- avoid replacing the whole chapter with a blank placeholder

The stage may still carry the underlying stream surface; the reduction target is
the DOM loop, not the chapter’s existence.
