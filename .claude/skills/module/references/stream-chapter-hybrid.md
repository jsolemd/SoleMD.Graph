# Stream Chapter Hybrid Contract

Use this note when planning a future stream/process chapter shell or any module
that mixes WebGL carry with DOM/SVG explanatory choreography.

## Core Rule

If a DOM/SVG stream shell is authored later, the stream chapter should be
treated as a **hybrid surface**, not a shader-only scene.

It is composed of:

- one field stage controller carrying the stream point cloud
- one DOM/SVG shell carrying the rail geometry, markers, and popup copy
- one authored anchor that defines when the chapter is active

These layers share timing intent, not shared runtime state.

In the current landing runtime, the stage side of that timing intent comes from
shared chapter progress in `scroll/field-scroll-state.ts`. A future DOM
shell should subscribe to the same authored chapter ids rather than installing a
second independent stage-timing model.

## Current SoleMD State

Current landing implementation:

- stage controller: `StreamController`
- fixed-stage owner: `FixedStageManager`
- authored stage entries: `FIELD_SECTION_MANIFEST` rows spanning
  `section-story-2` through `section-mobile-carry`
- blob remains visible underneath; the stream is an overlap carrier, not a full
  scene switch
- no DOM/SVG shell is currently mounted on landing
- the graph section remains stage-owned and text-driven until a user-authored
  shell lands

If a shell is added later, the DOM layer should own:

- `data-scroll="stream"`
- the desktop and mobile SVG rail variants
- 8 stream points from the shared manifest
- popup copy and red/neutral variant styling

The stage owns:

- the stream particle conveyor
- stream preset uniforms
- carry-window visibility and overlap with blob
- camera-space scale and funnel motion
- shared chapter-progress consumption via `landing-stream-chapter.ts`

## Shared Authoring Surface

When that shell exists, both DOM and stage layers should read from the same
authored intent:

- anchor id: `section-story-2`
- stage scene slug: `stream`
- point manifest: `stream-point-manifest.ts`

Do not invent parallel per-point state synchronization between the shader and
the popup shell. The shell is explanatory choreography, not an alternate source
of truth for the stream geometry.

Do not give the shell its own scroll-derived visibility math either. It should
read the same authored chapter windows the stage uses.

## Sanctioned Divergences From Maze

When the shell is eventually built, SoleMD should keep the Maze motion grammar
but not the Maze implementation details:

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

The stage may still carry the underlying stream surface; the reduction target
is the DOM loop, not the chapter’s existence.
