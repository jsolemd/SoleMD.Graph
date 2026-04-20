# Audit B9 — Stream DOM motion-path + popups (user-flagged P0 gap)

**Auditor**: agent-1 (Phase 3)
**Priority**: P0
**Date**: 2026-04-19
**SoleMD counterpart**: Missing — design doc

## Summary

The `KS` adapter (scripts.pretty.js:48911–49035) is a 125-line DOM choreography
module that couples eight `.js-stream-point` DOM markers to eight SVG motion
paths (`kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`,
`framebuffer`) and sequences their nested `.js-stream-point-popup` children
through a scroll-linked GSAP timeline. It is the sole owner of the stream
chapter's readable-UI layer: hotspot visibility, popup cascade (category →
name → label → optional second + third popup), red-variant styling for
exploitable findings, and mobile rail swap via `matchMedia`. SoleMD's
`StreamController.ts` already owns the **WebGL conveyor** (particle wrapper +
shader uniforms + z-tween bindScroll), but there is no DOM side — the
`.c-stream` shell, SVG rails, markers, and popups do not exist anywhere in
the SoleMD tree. Rebuilding this subsystem is the blocker for stream chapter
parity and must land as a hybrid surface adapter layered over the existing
WebGL controller, **without** merging the two ownership lanes.

## Subsystem anatomy (Maze side)

### JS handler (`KS`)

Structure of `KS = (r) => { ... }` where `r` is the `[data-scroll="stream"]`
root element (same node as `[data-gfx="stream"]`):

1. **Query once** (48912–48914):
   - `e = r.querySelectorAll(".js-stream-point")` → 8 marker nodes.
   - `t = [...r.querySelectorAll(".svg-flow-diagram-paths path")]` → 8 desktop
     paths from the inline SVG.
   - `n = [...r.querySelectorAll(".svg-flow-diagram-paths-mobile path")]` → 8
     mobile paths from the mobile inline SVG.
2. **Constants** (48915–48925):
   - `i = 3.2` — base timeline unit in seconds; all popup and sub-animation
     durations/delays are multiples of `i`.
   - `s = ["kdc","function","fpt","access","json","fou","image","framebuffer"]`
     — **source path-id order** (not the DOM marker order).
3. **Reverse-lookup enum `o`** (48927–48936):
   - Maps path-id strings → integers in a **different** order:
     `kdc=0, access=1, function=2, json=3, fpt=4, fou=5, image=6, framebuffer=7`.
   - This ordering is the **timeline offset order** (i.e., when each point
     plays along the master timeline). The visible DOM order comes from `s`,
     but the scheduling order comes from `o[s[i]] * i`.
4. **ScrollTrigger `a`** (48937–48943):
   - `trigger: r`, `start: "top bottom"`, `end: "bottom top"`, i.e., the
     chapter's full scroll-through window.
   - `toggleActions: "play pause resume reset"` — **not scrubbed**; the
     timeline plays at its own tempo while the trigger is active, pauses when
     leaving, resumes on re-entry, resets on reverse-out.
   - `invalidateOnRefresh: true` — re-measures on viewport changes.
5. **Shared timeline seed `l`** (48944):
   - `{ repeat: -1, scrollTrigger: a }` — the outer timeline loops forever
     while the trigger is active.
6. **Per-viewport builder `c(h, u)`** (48945–49027):
   - `h` = marker nodes, `u` = path array (desktop or mobile).
   - Creates master timeline `f = Gd.default.timeline(l)`.
   - For each marker `g` at DOM index `b`:
     - Reads up to 3 popups: `x = _[0]` (first), `T = _[1]` if there are >2
       (optional middle), `w = _[_.length - 1]` (last — same as `x` when only
       one popup).
     - Builds sub-timeline `S` with defaults `{ ease: "sine.inOut",
       duration: i }`.
     - **Sequence (wall-clock from sub-timeline start, in seconds)**:
       - `0.0`: `g.classList.add("is-visible")` — marker appears.
       - `0.0 → i*3` (9.6s): GSAP `motionPath` tween travels the marker along
         `u[b]` with `align: u[b]`, `alignOrigin: [0.5, 0.5]`, `ease: "none"`.
         **Note: `.from()` is used, so the marker animates FROM the path
         start back to its resting position — or, more accurately, the
         motion-path values are taken as the source and the marker's CSS
         position is the destination.** Duration is 3× the base unit.
       - `0.0`: `x.classList.add("is-visible")` — popup 1 shows.
       - `i` (3.2s): if `T`, `T.classList.add("is-visible")` — popup 2 shows.
       - `i * (T ? 1 : 2)`: `x.classList.remove("is-visible")` — popup 1
         hides at 3.2s if there's a popup 2, else at 6.4s.
       - `i*2` (6.4s): if `T`, `T.classList.remove("is-visible")` — popup 2
         hides.
       - `i*2`: if `w`, `w.classList.add("is-visible")` — popup 3 shows
         (note: when there are exactly 2 popups, `w === T` already and this
         re-adds the class that was just removed; when there are exactly 1,
         `w === x` and the same applies).
       - `i*3` (9.6s): if `w`, `w.classList.remove("is-visible")` — popup 3
         hides.
       - `-0.2s` from timeline end: `g.classList.remove("is-visible")` —
         marker fades before the next point's slot opens.
     - Sub-timeline `S` is **added to the master** at offset
       `o[s[b]] * i` — i.e., the DOM-order marker is scheduled by its
       path-id's enum slot × 3.2s.
7. **matchMedia desktop/mobile branching** (49029–49032):
   - `(min-width: 1024px)` → `c(e, t)` (desktop paths).
   - `(max-width: 1023px)` → `c(e, n)` (mobile paths).
   - GSAP's `matchMedia` handles build/teardown on breakpoint change; each
     build is isolated.
8. **Return `a`** (49033) — the ScrollTrigger is the adapter's handle; the
   scroll driver's adapter loader stores this so teardown can kill it.

### HTML scaffolding

Source: `index.html:564–712`.

Root anchor (dual-role node — owns both WebGL controller and DOM adapter):

```html
<div class="col-span-12 c-stream"
     data-gfx="stream"
     data-gfx-sticky
     data-scroll="stream">
  <picture>
    <source srcset=".../flow-diagram-main-mobile.svg" media="(max-width: 1023px)">
    <img src=".../flow-diagram-main.svg" alt="...">
  </picture>

  <svg class="svg-flow-diagram-paths" viewBox="0 0 1204 535"> ...8 paths... </svg>
  <svg class="svg-flow-diagram-paths-mobile" viewBox="0 0 345 653"> ...8 paths... </svg>

  <!-- 8 × .c-stream__point -->
</div>
```

Marker structure (one of 8, all siblings of the inline SVGs):

```html
<div class="c-stream__point js-stream-point">
  <div class="c-stream__hotspot hotspot [hotspot--red]">
    <svg class="svg-circle" viewBox="0 0 220 220"><circle cx="110" cy="110" r="100"/></svg>
  </div>
  <!-- popup 1 (always) -->
  <div class="c-stream__popup js-stream-point-popup popup [popup--red] [popup--left] [popup--mobile-*]">
    <div class="popup__category">Requirement</div>
    <div class="popup__name">KDC Server Running</div>
    <div class="popup__label">Not present</div>
  </div>
  <!-- popup 2 (optional) -->
  <div class="c-stream__popup js-stream-point-popup popup [popup--red] [popup--mobile-*]">
    <div class="popup__name">Exception logged for audit</div>
  </div>
  <!-- popup 3 (red points only — 3 of 8) -->
  <div class="c-stream__popup js-stream-point-popup popup popup--red [popup--mobile-*] [popup--left]">
    <div class="popup__name">PR automatically created</div>
    <div class="popup__category">(SLA 7 days)</div>
  </div>
</div>
```

Red-variant inventory (3 of 8 points; indices by DOM order 3, 4, 5 —
`access`, `json`, `fou`): `.hotspot--red` on the hotspot and `.popup--red`
on every popup. These represent **exploitable findings / present
requirements** rather than absent-but-logged requirements.

Mobile modifiers observed on popups (orthogonal to red):
`popup--mobile-left`, `popup--mobile-right`, `popup--mobile-center`; plus
desktop direction `popup--left` for anchor flipping.

Copy inventory (for fixture parity; not for verbatim reuse — SoleMD must
author its own semantics):

| DOM idx | Path id      | Category    | Name                             | Label       | Red? |
|---------|--------------|-------------|----------------------------------|-------------|------|
| 0       | kdc          | Requirement | KDC Server Running               | Not present | no   |
| 1       | function     | Requirement | Function reachable               | Not present | no   |
| 2       | fpt          | Requirement | FTP Client Functionality         | Not present | no   |
| 3       | access       | Requirement | Access to package repositories   | Present     | yes  |
| 4       | json         | Requirement | JSON Payload Processing          | Present     | yes  |
| 5       | fou          | Requirement | FOU tunnels configured           | Present     | yes  |
| 6       | image        | Requirement | Image Parsing Configuration      | Not present | no   |
| 7       | framebuffer  | Requirement | Framebuffer console enable       | Not present | no   |

### SVG rails

Two inline SVGs, both children of the stream root:

- `.svg-flow-diagram-paths` — desktop, `viewBox="0 0 1204 535"`, 8 `<path>`
  elements, unnamed in the captured markup (IDs are assigned by position,
  not by an `id` attribute in the observed source — `KS` relies on
  **DOM order** of the 8 `<path>` children matching the `s` array order
  `kdc, function, fpt, access, json, fou, image, framebuffer`).
- `.svg-flow-diagram-paths-mobile` — mobile, `viewBox="0 0 345 653"`, 8
  `<path>` elements. Reduced thickness (`stroke-width=".7"`).
- Both are `stroke="#37c6f4"` `fill="none"` — cyan-blue, not filled. They
  exist as geometry for `motionPath` resolution; the visible diagram is
  delivered by the `<picture>` above them (the `.svg` assets
  `flow-diagram-main.svg` and `flow-diagram-main-mobile.svg`, which include
  labels, boxes, and arrowheads — not just the 8 paths).

Path-id → name resolution is **positional** in the captured HTML. A
rebuild that uses authored `id` attributes (`id="kdc"` etc.) is strictly
cleaner and equally correct — and is recommended, because the enum `o`
already encodes the name-to-index mapping explicitly.

Desktop vs mobile swap: `matchMedia("(min-width: 1024px)")` vs
`(max-width: 1023px)` inside `KS`. The `<picture>` tag handles the visible
backdrop swap; the `<svg>` path arrays are both always present in the DOM
and `KS` picks the matching one. This means mobile mounts still have
desktop paths in the DOM (wasted bytes) but the cost is small.

## DOM-vs-WebGL ownership boundary

`ug` (scripts.pretty.js:49326–49345) is the WebGL controller. It extends
the scene-object base `yr`, and on the stream anchor it owns: the particle
wrapper transform, uScale uniform, aspect-driven base scale (`250 *
aspect/(1512/748)` desktop, `168` mobile), and — in the Maze source — a
scroll-scrubbed `wrapper.position.z: -500 → 0` tween plus a `uWave`
shader uniform (see SoleMD `StreamController.ts:125–164` for the ported
half of that). **`ug` knows nothing about the `.c-stream__point` DOM
children, the popups, the inline SVGs, or the motion-path timeline.**
Conversely, `KS` knows nothing about the three.js wrapper, particle
uniforms, or the conveyor z-tween — it reads the same root element
only to scope its `querySelectorAll` calls, and otherwise operates in
pure DOM + SVG + GSAP space.

In SoleMD this maps to: `StreamController.ts` already mirrors the `ug`
side (particle scale, uniform writes, conveyor `bindScroll` z-tween)
and is correctly scoped to WebGL. It must **not** grow to own the DOM
rail. The rebuild should introduce a parallel DOM adapter that attaches
to the same anchor element but runs as a React surface adapter in the
`scroll/` or `surfaces/` layer, consumes its own GSAP timeline keyed to
the same `[data-scroll="stream"]` node, and disposes independently of
the WebGL controller. The two subsystems may share a single stream
chapter manifest entry (authored scene intent + marker config) but do
not share runtime state. **No refactor of `StreamController.ts` is
required** to land B9 — only additive work.

## Rebuild checklist for SoleMD

Ordered steps, scoped to SoleMD ambient-field conventions (see SKILL.md
§ "Canonical Layer Ownership" and § "Required Runtime Pieces"). Each step
names a file under `apps/web/features/ambient-field/` unless otherwise
noted. No code is written here; this is a build-spec input.

1. **Author the marker config module** —
   `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/stream-point-manifest.ts`.
   Exports an ordered array of 8 entries, each with:
   `{ id: "kdc"|"function"|"fpt"|"access"|"json"|"fou"|"image"|"framebuffer",
     domOrder: number, scheduleOrder: number, variant: "red"|"default",
     popups: Array<{ category?: string; name: string; label?: string;
     side?: "left"|"right"; mobileSide?: "left"|"right"|"center" }> }`.
   This replaces Maze's implicit positional coupling between the marker
   DOM order, the path array order, and the `o` enum with one
   authored table. `scheduleOrder` is the canonical integer used to
   multiply the base unit for timeline offset.

2. **Author the rail SVG pair as React components with explicit path ids**
   — `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/stream-rail-svg.tsx`
   exporting `<StreamRailDesktop />` and `<StreamRailMobile />` with each
   `<path>` carrying an `id={pointId}` attribute. Keeps viewBox parity
   (`1204×535` desktop, `345×653` mobile). Imported as static SVG so Next.js
   serializes the geometry at build.

3. **Create the DOM marker primitive** —
   `apps/web/features/ambient-field/overlay/StreamPoint.tsx` rendering the
   `.c-stream__point` equivalent with SoleMD token classes (not Maze class
   names). Accepts `{ variant, popups, hotspotRef }`. Uses the existing
   `AmbientFieldHotspotRing` primitive from
   `overlay/AmbientFieldHotspotRing.tsx` for the pulsing ring — do not
   duplicate the `.svg-circle` + keyframes pair.

4. **Create the popup primitive** —
   `apps/web/features/ambient-field/overlay/StreamPointPopup.tsx` rendering
   category + name + label with `data-variant="red|default"`,
   `data-side="left|right"`, `data-mobile-side="left|right|center"` data
   attributes. Styling token file: `stream-point-popup.css` with
   Maze-parity keyframes under an `afsp-` prefix (matching SKILL.md §
   "Overlay layer" conventions — compare to the `afr-` prefix used by
   the hotspot ring).

5. **Create the chapter shell component** —
   `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/StreamChapterShell.tsx`.
   Owns the `data-scroll="stream"` anchor (sibling or same element as the
   WebGL controller's `data-gfx="stream"` anchor), renders `<StreamRailDesktop
   />`, `<StreamRailMobile />`, and `.map` over the manifest to render 8
   `<StreamPoint>` children with refs for the timeline to consume.

6. **Create the motion-path timeline adapter** —
   `apps/web/features/ambient-field/scroll/chapters/landing-stream-chapter-points.ts`
   exporting `bindStreamPointTimeline(rootEl, manifest, options): () =>
   void`. Internal responsibilities:
   - register GSAP `MotionPathPlugin` via a shared
     `ensureGsapMotionPathRegistered()` helper (pattern-parallel to
     `ensureGsapScrollTriggerRegistered` in `FieldController.ts`),
   - create one `ScrollTrigger` with `start: "top bottom"`, `end:
     "bottom top"`, `toggleActions: "play pause resume reset"`,
     `invalidateOnRefresh: true`,
   - build a master `gsap.timeline({ repeat: -1, scrollTrigger })`,
   - branch via `gsap.matchMedia()` for desktop (`(min-width: 1024px)`)
     and mobile (`(max-width: 1023px)`) — each branch resolves the right
     `<path>` set by `id`, not by DOM index,
   - per manifest entry, build a child sub-timeline with the same call
     grid as `KS` (see anatomy above): marker visibility, motionPath
     `.from` tween with `align`, `alignOrigin: [0.5, 0.5]`, `ease:
     "none"`, duration `unit * 3`, cascaded popup show/hide at
     `0, unit, unit*2, unit*3` boundaries with the 2-popup / 3-popup
     switches preserved,
   - add each sub-timeline at `scheduleOrder * unit`,
   - return a disposer that kills the matchMedia contexts and the master
     ScrollTrigger.

7. **Wire the adapter into the scroll registry** —
   extend `scroll/ambient-field-scroll-driver.ts` (or a
   chapter-registration seam it exposes) to call `bindStreamPointTimeline`
   when a `[data-scroll="stream"]` anchor mounts, and invoke the returned
   disposer on unmount. This is the SoleMD analog of Maze's `$x["stream"]`
   lookup; see B8 audit for the registry shape.

8. **Mount the chapter shell on the landing page** —
   add `<StreamChapterShell />` inside the existing stream section of
   `apps/web/features/ambient-field/surfaces/AmbientFieldLandingPage/*`
   (exact file per B13/surface audit) so the DOM adapter and the
   `StreamController` WebGL anchor land on sibling nodes with coordinated
   scroll window. The chapter shell carries `data-scroll="stream"`; the
   WebGL stage mount carries `data-gfx="stream"`. They may share a parent
   `<section>` but **must not be the same node** in React (they are in
   Maze only because Maze's app shell co-mounts both adapters onto the
   same element by attribute — SoleMD's cleaner model keeps them as
   siblings).

9. **Add reduced-motion fallback** —
   the timeline adapter must short-circuit when
   `window.matchMedia("(prefers-reduced-motion: reduce)").matches`, adding
   an `is-reduced-motion` class on the chapter shell so CSS can statically
   show all popups at their resting positions without the motion-path
   tween. Parallel to the existing guard in `StreamController.bindScroll`.

10. **Add manifest validation** —
    lightweight runtime validation in
    `stream-point-manifest.ts` asserting 8 entries, unique `id`s matching
    the 8 path ids, `scheduleOrder` values forming a permutation of
    `0..7`. This preserves the Maze invariant that every path is consumed
    exactly once and every timeline slot is occupied exactly once.

11. **Document the hybrid chapter contract** —
    add a short note in `references/maze-stage-overlay-contract.md` (or a
    new `references/stream-chapter-hybrid.md`) stating that the stream
    chapter is the canonical hybrid example: WebGL conveyor + DOM rail +
    SVG motion geometry on the same anchor, two independent adapters,
    shared manifest, no shared runtime state.

## Verification criteria (how we'd know the rebuild is done)

- Eight `.c-stream__point` equivalents render inside the stream chapter
  shell on both desktop (`≥1024px`) and mobile (`<1024px`).
- On scroll into the chapter, all eight markers eventually travel along
  their assigned path (desktop uses `svg-flow-diagram-paths` IDs; mobile
  uses `svg-flow-diagram-paths-mobile` IDs), and the resting position
  matches the layout of the accompanying flow diagram background image.
- Each marker's popup cascade matches the Maze sequence: popup 1 shows at
  marker entry, hides after `unit` (if 2+ popups) or `unit*2` (if 1);
  popup 2 shows at `unit`, hides at `unit*2`; popup 3 shows at `unit*2`,
  hides at `unit*3`. For a 1-popup entry, only popup 1 is cycled.
- The three `variant: "red"` points (access, json, fou) render with
  `data-variant="red"` on hotspot and popup, and SoleMD's red-variant
  token styling matches the design intent (not the exact Maze color, but
  the same severity signal).
- Schedule order: marker `kdc` starts at `0 * unit`, `access` at
  `1 * unit`, `function` at `2 * unit`, `json` at `3 * unit`, `fpt` at
  `4 * unit`, `fou` at `5 * unit`, `image` at `6 * unit`, `framebuffer`
  at `7 * unit` (all multiplied by the authored base unit, default
  `3.2s`).
- Breakpoint crossing (resize across 1024px) tears down the active
  branch's timeline via `gsap.matchMedia()` and rebuilds the other
  branch cleanly, with no orphan classes or duplicated popups.
- Scrolling past the end and back triggers the ScrollTrigger
  `toggleActions: play pause resume reset` sequence — the timeline
  restarts cleanly on a fresh re-entry (does not continue mid-animation).
- WebGL side is unaffected: `StreamController` still tweens the particle
  wrapper z-depth and writes shader uniforms; disposing the DOM adapter
  does not kill the WebGL scroll binding, and vice versa.
- `prefers-reduced-motion: reduce` disables the motion-path tween and
  pins all popups to a static resting state.
- Lighthouse overlay counts remain inside the SKILL.md budget: < 100
  active DOM overlay nodes during the chapter (8 markers × ~4 DOM nodes
  each + ~20 popup leaf nodes = ~52 nodes, well inside budget).

## Risk / unknowns

- **SSR-safety for `MotionPathPlugin` registration**. GSAP plugin
  registration must happen client-side only. SoleMD already has the
  pattern via `ensureGsapScrollTriggerRegistered` in `FieldController.ts`;
  the new `ensureGsapMotionPathRegistered` must follow the same guard
  (typeof window check + idempotent registration).
- **Next.js 16 App Router client-component boundary**. `StreamChapterShell`,
  `StreamPoint`, `StreamPointPopup`, and the adapter module all live on
  the client side. The manifest can be server-authored and imported into a
  `"use client"` component as plain data. Avoid importing GSAP into any
  server component (Next.js 16 will refuse to bundle it in the server
  graph).
- **Inline SVG vs. `<img>` backdrop**. Maze keeps both: a `<picture>` for
  the decorative diagram and two inline `<svg>`s for the motion-path
  geometry. SoleMD should do the same (JSX inline SVG components for the
  motion paths, static `<Image>` or CSS-background for the decorative
  diagram) to preserve the ability to animate `motionPath` against the
  live DOM paths.
- **GSAP `matchMedia` cleanup in React StrictMode**. Double-mount in dev
  can leave stale matchMedia contexts; the disposer must fully revert
  both branches.
- **Anchor sharing with `StreamController`**. Maze co-mounts `[data-gfx]`
  and `[data-scroll]` on the same element; SoleMD's React model makes it
  cleaner to separate them as siblings. That is a minor semantic choice
  but should be explicitly documented in the build spec so that a future
  agent doesn't try to "merge" the two into one React component — which
  would re-entangle the ownership boundary this audit just clarified.
- **Path-id assumption**. Maze's captured HTML does not carry `id`
  attributes on the 8 paths — `KS` relies on DOM order matching the
  `s` array. SoleMD should author explicit `id`s on the rebuilt SVG
  components. Confirm no existing SoleMD CSS already claims those ids.
- **Red-variant count**. 3 of 8 points are red in the captured HTML. If
  SoleMD's authored semantics change this count (different narrative —
  e.g., 2 or 4 red points), the manifest + token styling must track it
  without hard-coding "exactly 3 red points". Manifest validation should
  not assert a red-count invariant.

## Proposed sanctioned deviations

1. **Replace positional path-id coupling with authored `id` attributes.**
   Maze relies on DOM order across three sources of truth (the `s` array,
   the `<path>` children of two SVGs, and the `.js-stream-point`
   siblings). SoleMD should author `id="kdc"` (etc.) on each `<path>` and
   look them up by id. This is a pure quality improvement with zero
   behavior change.

2. **Replace `.js-*` selector contract with refs + `data-*` attributes.**
   Maze's adapter runs against a page that was not authored with React in
   mind; it queries classes to find DOM nodes. SoleMD should pass refs
   from `StreamChapterShell` down into the timeline adapter (or use a
   `data-stream-point-id` attribute) and avoid DOM-scanning-by-class.
   Sanctioned per SKILL.md § "Canonical Anti-Patterns" — React state and
   refs own component lookup, not global DOM scans.

3. **Separate `data-gfx` and `data-scroll` anchors.** Maze co-mounts them
   on one element. SoleMD keeps them as siblings inside one
   `<section>`. Sanctioned per the DOM-vs-WebGL ownership boundary
   analysis above.

4. **Do not copy Maze's exact class names.** Replace `.c-stream`,
   `.c-stream__point`, `.c-stream__popup`, `.js-stream-point`,
   `.js-stream-point-popup`, `.popup`, `.popup__category`, `.popup__name`,
   `.popup__label`, `.popup--red`, `.popup--left`, `.popup--mobile-*`,
   `.hotspot`, `.hotspot--red`, `.svg-circle`, `.svg-flow-diagram-paths*`
   with SoleMD token-aligned names under an ambient-field prefix (parallel
   to `afr-` on the hotspot ring). Sanctioned per SKILL.md § "SoleMD
   Aesthetic, Maze Motion" — motion is Maze-parity, naming and shell are
   SoleMD.

5. **Do not copy Maze's exact popup copy.** The "KDC Server Running",
   "Function reachable", "FTP Client Functionality", etc. strings are
   Maze product semantics; SoleMD's stream chapter must express its own
   narrative (likely biomedical pipeline stages rather than vulnerability
   requirements). The rebuild should keep the structural shape (category
   / name / label + 1–3 popup cascade + red-variant signaling) and let
   content authoring replace strings via the manifest.

6. **Consider `toggleActions: "play pause resume reset"` vs. scrubbed
   scroll.** Maze chose auto-playing timeline over scrubbing. This means
   the stream cascade plays at its own 3.2s-unit tempo even if the user
   scrolls slowly. A scrubbed alternative would tie marker progress
   directly to scroll position. Recommend keeping Maze's choice for
   parity; flag as a future option if product wants a scrubbed variant.
