# Maze Rebuild Checklist

Use this checklist before approving a landing page or module that claims
Maze-grade parity.

## Source Geometry

- Does each scene use the correct source family?
  - blob/sphere from sphere points
  - stream from a flat line seed
  - pcb/logo from bitmap-space points
  - model scenes from mesh vertices converted to points
- Is the live renderer actually consuming the shared asset pipeline instead of a
  synthetic fallback field?
- Are point counts and breakpoint budgets explicit?

## Shader And Material

- Is there one shared particle material family across scene slugs?
- Are `aIndex`, `aMove`, `aSpeed`, `aRandomness`, `aAlpha`, `aSelection`, and
  stream-specific funnel attrs present where required?
- Does the transform order still match the shared contract?
- Are point size and alpha distance-weighted?
- Is the point sprite texture still part of the fragment path?

## Stage And Controllers

- Is there one persistent stage owner for the surface?
- Is scene ownership controller-per-anchor or manifest item, not one global
  scene swap?
- Are carry windows and overlap supported?
- Is sticky chapter behavior implemented as controller math rather than a second
  pinned canvas?

## Overlays

- Are readable popups, labels, and progress UI in DOM/SVG instead of canvas?
- Is overlay projection centralized?
- Does the stream chapter keep a separate DOM/SVG marker system instead of
  faking everything in WebGL?
- Are declared hotspot pool size and visible hotspot density treated as separate
  concepts?

## Mobile And Performance

- Is “mobile” explicitly defined by breakpoint family rather than assumed?
- Are phone-only overlay tweaks separate from broader non-desktop particle
  behavior?
- Is DPR capped?
- Is resize debounced and protected from mobile viewport-bar churn?
- Is there one RAF owner plus a visibility/suspension policy?
- Are unused scene assets deferred instead of always eagerly preloaded?
- Are geometry, materials, and renderer disposed on teardown?

## SoleMD Product Fit

- Does the surface keep SoleMD shell aesthetics instead of copying Maze shell
  chrome?
- Is the work extending the shared ambient runtime rather than inventing a
  homepage-only or module-only fork?
- Does authoring happen through semantic manifests / resolved scene state rather
  than raw renderer instructions?
- Is graph bridge behavior explicit where relevant?

## Red Flags

Reject or rework the change if it:

- uses one universal random point field for every scene
- treats stream as a recolored blob
- renders model scenes as meshes when parity calls for points
- remounts heavy geometry on section boundaries
- drives explanatory UI from per-point DOM nodes
- hides mobile divergence in ad hoc CSS instead of documenting the breakpoint
  contract
- introduces page-local choreography that should live in the shared runtime
