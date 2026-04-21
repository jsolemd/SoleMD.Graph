# Audit B8 — Scroll adapter registry + 6 DOM adapters (+B14 typography)

**Auditor**: agent-2 (Phase 3)
**Priority**: P0
**Date**: 2026-04-19
**SoleMD counterpart**: Partial (FieldHeroSection + FieldCtaSection); **Missing — medium** for registry + 4 other adapters + typography call sites

## Summary

Maze wires chapter-level entrance choreography through a single static
adapter registry (`$x`) consumed once by the scroll controller's `setup()`
pass. The controller scans `[data-scroll]` nodes, looks up the adapter by
`dataset.scroll`, and calls it with the element to produce a
`ScrollTrigger`-returning closure that the controller tracks for teardown
on unload. Six homepage-active adapters (`welcome`, `moveNew`, `clients`,
`graphRibbon`, `events`, `cta`) encode chapter-specific reveal timelines
— stagger, split-words, SVG clip-path, scaled-in buttons, mobile xPercent
loops — all layered on top of GSAP `ScrollTrigger`/`matchMedia` and the
vendored `lo`/`US` SplitText class used by B14.

SoleMD's landing does not have a counterpart registry. The two confirmed
partial counterparts are `FieldHeroSection.tsx` (welcome parity —
eyebrow/title/subtitle/button entrance, but on-mount Framer Motion rather
than scroll-triggered SplitText) and `FieldCtaSection.tsx` (cta
parity — same structural reveal, but `whileInView` Framer Motion with
character-grain preserved only as word-grain). No SoleMD component covers
`clients`, `graphRibbon`, `events`, or `moveNew`; those Maze chapters do
not exist as DOM surfaces on SoleMD's landing at all. B14 typography
reveal has a candidate primitive (`features/animations/_smoke/text-reveal/TextReveal.tsx`)
that is currently smoke-test only and not wired into landing components.

## Registry shape (`$x`)

`$x` at scripts.pretty.js:49102–49113 is a plain static object literal:

```
$x = {
  move: jS,
  moveNew: QS,
  clients: HS,
  contact: VS,
  cta: GS,
  events: WS,
  graphRibbon: qS,
  intro: $S,
  stream: KS,
  welcome: JS,
};
```

- **Keys** are the allowed `data-scroll` values. 10 total on the site;
  6 are homepage-active per the catalog (`welcome`, `moveNew`, `clients`,
  `graphRibbon`, `events`, `cta`); `stream` is split into B9; `move`,
  `contact`, `intro` are not present on the homepage route.
- **Values** are top-level `var` IIFE-closed functions defined earlier in
  the same module.
- **Consumer**: the scroll controller `jt.setup()` at 49176–49191 runs a
  single `matchMedia("(prefers-reduced-motion: no-preference)")` pass,
  maps every `[data-scroll]` element to `{ el, type, delay, quick }`,
  then `$x[type] && this.scrollTriggers.push($x[type](e.el, e.delay, e.quick))`.
- **Adapter contract**: `(el: HTMLElement, delay: number, quick: boolean) => ScrollTrigger | Timeline`.
  The controller treats the return as a kill-able handle during
  `unload()`. Some adapters (`JS`, `VS`, `$S`, `jS`, `QS`) return `void`
  and are therefore not actually killed — they rely on GSAP's own
  teardown via `matchMedia` revert at 49162. Only `HS`, `GS`, `WS`, `qS`,
  `KS` actually return the ScrollTrigger / Timeline handle.
- **Delay / quick arguments** are *declared* on the adapter wrapper
  objects but **not consumed** by any of the six homepage adapters —
  every adapter function body audited ignores its extra args. This is a
  Maze code-quality smell; ignore for parity.

## Per-adapter inventory

### welcome (`JS`)

- **Maze lines**: [49037, 49066]
- **Behavior**: Builds a GSAP timeline (0.75s each, `slow.out`) that:
  (1) word-splits `.js-title` via `new lo(e, { type: "words" }).words`
  and tweens from `{ x: "2em", opacity: 0 }` with `stagger.each = 0.2`
  `power2.out`; (2) word-splits `.js-subtitle` and tweens from
  `{ y: "1em", opacity: 0, duration: 0.5, stagger: 0.15 }` overlapping
  (`"<"`) the title; (3) `.a-button` from `{ scale: 0.75, opacity: 0 }`
  at `"-=33%"`; on complete, adds `is-welcome-ready` to `document.body`.
  **Not scroll-triggered** — runs on-load (no `scrollTrigger` in the
  timeline).
- **DOM contract**: Element carries `data-scroll="welcome"` and contains
  `.js-title`, `.js-subtitle`, `.a-button` descendants.
- **SoleMD counterpart**: `FieldHeroSection.tsx` (partial)
  - Same structural unit (`<section>` with eyebrow `<p>` → `<h1>` →
    body `<p>` → button row).
  - Uses Framer Motion `initial`/`animate` with `smooth` easing; runs
    on-mount, not scroll-triggered (parity with Maze's on-load
    behavior).
  - **No character/word split**: reveal is at paragraph grain, not
    word grain.
  - **No `is-welcome-ready` body class**: the landing surface does not
    publish this ready signal.
  - `eyebrow` element is new (Maze has no uppercase eyebrow above the
    title).
- **Drift items**: D1 (word-grain split missing), D2 (no `is-welcome-ready`
  broadcast), D3 (eyebrow is sanctioned addition, not drift).
- **Sanctioned deviations**: on-mount-vs-scroll is parity (Maze welcome is
  on-load too); Framer Motion over GSAP is the default SoleMD motion
  substrate per the animation-authoring skill.

### moveNew (`QS`)

- **Maze lines**: [49069, 49099]
- **Behavior**: Clones `r.children[0]` and appends it inside `r` so the
  row can be marquee-translated. Wraps the tween in
  `gsap.matchMedia().add("(max-width: 1023px)", …)` — **mobile-only**.
  Infinite (`repeat: -1`) `xPercent: -50` translate over 10 seconds with
  `scrollTrigger` `{ trigger: r, start: "top bottom", end: "bottom top",
  toggleActions: "play pause resume reset", invalidateOnRefresh,
  onRefresh: reset x }`. Cleanup removes the clone and clears props.
- **DOM contract**: Parent has `data-scroll="moveNew"` and a single child
  element (usually a logo row or badge ribbon).
- **SoleMD counterpart**: **Missing**. Landing has no marquee or ticker
  band.
- **Drift items**: D4 (mobile marquee pattern not implemented). No DOM
  equivalent on the landing page.
- **Sanctioned deviations**: moveNew is a mobile-only moving brand strip
  that SoleMD's landing does not have as a concept. If Phase 4 decides
  the chapter is not part of the SoleMD story, this becomes sanctioned.

### clients (`HS`)

- **Maze lines**: [48597, 48614]
- **Behavior**: `Ht.create({ trigger: r, toggleActions: "play pause resume reset" })`
  plus `gsap.from(r.querySelectorAll(".js-item"), { opacity: 0, scale: 0.8,
  duration: 0.5, ease: "slow.out", stagger: { amount: yi.desktop ? (r.hasAttribute("data-center") ? 0.5 : 1) : 0, from: (r.hasAttribute("data-center") && "center") || "edges" }, scrollTrigger: e })`.
  Stagger amount is breakpoint- and attribute-conditional (centered
  clusters ripple from center, edge-aligned rails ripple from edges).
  Returns the ScrollTrigger handle.
- **DOM contract**: `data-scroll="clients"`, optional `data-center`,
  contains `.js-item` children.
- **SoleMD counterpart**: **Missing**. Landing has no logo / client grid.
- **Drift items**: D5 (logo-grid chapter + centered-stagger heuristic
  not implemented).
- **Sanctioned deviations**: The SoleMD landing is deliberately narrower
  than Maze's homepage (no press / clients chapter). Potentially
  sanctioned once Phase 4 decides.

### graphRibbon (`qS`)

- **Maze lines**: [48732, 48832]
- **Behavior**: Complex multi-target scroll-triggered timeline on
  `r.parentElement` as trigger. Targets: `.js-grid-item` (staggered
  scale/opacity from bottom-right), `.js-grid-graph` (xPercent/yPercent
  drift-in), `#ribbon-chart` (scale-in from bottom-center), two
  SVG text groups (`#ribbon-text-left g`, `#ribbon-text-right g` with
  opposite-direction stagger), and two path groups
  (`#ribbon-chart-thick path`, `#ribbon-chart-thin path`) with
  inset clip-path "draw" sweeps (`inset(0% 0% 0% 100%)` → `inset(0% 0% 0% 0%)`).
  Adds a `window.resize → debounced trigger.refresh()` listener
  (`ml(() => scrollTrigger.refresh(), 1e3)`).
- **DOM contract**: `data-scroll="graphRibbon"` with an SVG/grid
  composition underneath. This is Maze's signature "graph chapter"
  reveal — multi-layer compositional entrance over a single
  ScrollTrigger.
- **SoleMD counterpart**: `FieldGraphSection.tsx` (candidate,
  but conceptually different — it stages a live graph warm-up action,
  not a composed SVG ribbon reveal). No staggered group entrance.
- **Drift items**: D6 (composed multi-target scroll-triggered reveal
  missing at graph chapter). D7 (clip-path-driven draw-in for chart
  paths not implemented anywhere on landing).
- **Sanctioned deviations**: The SoleMD graph chapter wires into the
  live Cosmograph runtime, not a static SVG ribbon — that's a deliberate
  architectural choice. Multi-layer staggered reveal pattern is still
  worth porting as a general chapter affordance.

### events (`WS`)

- **Maze lines**: [48665, 48731]
- **Behavior**: Scroll-triggered master timeline (`start: "top bottom"`,
  `end: "bottom top"`, `toggleActions: "play pause resume reset"`) on
  `r`. First tween: `.js-event-main` fades in + scales + slides from
  `yPercent: 100`. Then for each `.js-event-subitem`, builds a nested
  0.35s timeline animating `.js-event-number` (opacity+scale), `.js-event-text`
  (opacity+x), and `.js-event-checkmark path` (GSAP DrawSVG from 0% to
  100%). On nested-timeline completion, adds `is-animated` class to
  the subitem. Nested timelines are added to the master with
  `s !== 0 ? "-=0.35" : "-=0.1"` overlap. Also binds a debounced
  resize → refresh listener (identical pattern to `qS`).
- **DOM contract**: `data-scroll="events"`, `.js-event-main`,
  `.js-event-subitem` × N with `.js-event-number`, `.js-event-text`,
  `.js-event-checkmark path`.
- **SoleMD counterpart**: **Missing**. Landing has no event / timeline /
  checklist chapter.
- **Drift items**: D8 (stepped event-timeline chapter missing), D9
  (DrawSVG-based checkmark stroke-in not used anywhere on landing),
  D10 (nested-timeline-per-child-item master timeline pattern missing —
  generally useful beyond events).
- **Sanctioned deviations**: The SoleMD landing does not currently
  have a process / steps chapter with this shape. Potentially sanctioned
  pending Phase 4.

### cta (`GS`)

- **Maze lines**: [48639, 48663]
- **Behavior**: Scroll-triggered (`Ht.create({ trigger: r, toggleActions:
  "play pause resume reset" })`) timeline (0.75s, `slow.out`) word-splits
  `.js-title` and `.js-subtitle` via `new lo(e, { type: "words" })`.
  Title words tween from `{ x: "2em", opacity: 0 }` with `stagger.each = 0.2`
  `power2.out`. Subtitle words from `{ y: "1em", opacity: 0, duration: 0.5,
  stagger: 0.15 }` at `"<"`. `.a-button`(s) from `{ scale: 0.75, opacity: 0,
  stagger: 0.15 }` at `"-=33%"`. Returns the ScrollTrigger handle.
  **Same structural timeline as `JS` welcome** — difference is cta uses
  `scrollTrigger` and welcome does not.
- **DOM contract**: `data-scroll="cta"`, `.js-title`, `.js-subtitle`,
  `.a-button` × N.
- **SoleMD counterpart**: `FieldCtaSection.tsx` (partial).
  - Same structural unit (eyebrow → `<h2>` → body `<p>` → two button
    row).
  - Uses Framer Motion `whileInView` with `viewport={{ once: true,
    amount: 0.35 }}` — this is parity with Maze's scroll-triggered
    `play pause resume reset` semantics at the *paragraph* grain
    (though not at the character/word grain).
  - No SplitText: the CTA title animates as one element, not per-word.
  - Two buttons (graph open / return to top) each have staggered
    `delay: 0.08` — weak parity with Maze's 0.15 button stagger; SoleMD
    does not cascade.
- **Drift items**: D1 (word-grain split missing — same as welcome), D11
  (per-button stagger is flat rather than actual stagger).
- **Sanctioned deviations**: same as welcome — Framer Motion substrate
  and on-viewport semantics are consistent with the project's animation
  authoring skill.

## B14 — Typography reveal (SplitText consumer call sites)

SplitText (`lo`, aliased from `US` class at scripts.pretty.js:48391–48596)
is consumed inside the scroll adapters:

- `JS` welcome [49043, 49052]: `new lo(e, { type: "words" }).words` on
  `.js-title` and `.js-subtitle`.
- `QS` moveNew: not used.
- `HS` clients: not used.
- `GS` cta [48644, 48645]: same word-grain split on title + subtitle.
- `WS` events: not used (it targets dedicated `.js-event-*` elements
  directly).
- `qS` graphRibbon: not used.
- `VS` contact [48620]: `new lo(e, { type: "lines" })` on `.js-title`
  (line-grain, not word — the only line-grain consumer). Not
  homepage-active but part of the shared B14 pattern.
- `$S` intro [48839]: `new lo(e, { type: "words" }).words` on `.js-title`.
- `jS` move: not used.

The pattern is: obtain `words` (or `lines`) as an array of DOM spans,
feed them as the first argument to a `gsap.from(...)` with a stagger
config, then layer the tween into a timeline at a specific relative
time label.

### Primary SoleMD counterpart

**Pick: `apps/web/features/animations/_smoke/text-reveal/TextReveal.tsx`**
(`features/animations/_smoke/text-reveal/TextReveal.tsx`) is the closest
conceptual counterpart and is the pattern SoleMD should standardize on.
It implements character-grain staggered reveal via Framer Motion's
`staggerChildren` on a motion container with motion `span` children, and
already documents the load-bearing invariant ("stagger only orchestrates
direct motion children"). This is the SoleMD-native replacement for `lo`.

**Rejected candidates**:
- `features/wiki/module-runtime/primitives/RevealCard.tsx` — not a text
  split primitive; reveals a whole content block on user tap. Does not
  mirror `lo`.
- `features/wiki/module-runtime/motion.ts` — exports `sectionReveal` /
  `cardReveal` variants and a `staggerChildren` transition constant, but
  these are paragraph-grain, not word/character grain. Useful as a layer
  *above* the TextReveal primitive but not as the split counterpart.

**Justification**: TextReveal uses the same conceptual primitives Maze
uses (per-glyph DOM node, staggered transition, reduced-motion fallback)
while fitting the SoleMD stack (Framer Motion + `useReducedMotion`). It
is currently a smoke test and needs to be promoted: lifted out of
`_smoke`, parameterised to accept `text` + `grain: "chars" | "words"` +
`stagger` + `ease` + an `as` element type, and wired into the landing
Hero/CTA sections.

## Registry port recommendation

**Design**: Do **not** port `$x` as a JS object + scroll-controller
lookup. That pattern depends on Maze's imperative
`document.querySelectorAll("[data-scroll]")` + `dataset.scroll` lookup,
which is alien to React. Instead, expose a React-side *hook-based*
chapter adapter contract.

**Proposed shape** (naming per `/naming` conventions):

- `apps/web/features/field/scroll/chapter-adapters/` — new
  directory containing one file per adapter.
- `types.ts`: `export type ChapterAdapter = (el: HTMLElement, opts: {
  reducedMotion: boolean }) => { dispose(): void }`.
- `registry.ts`: `export const fieldChapterAdapters: Record<
  FieldChapterKey, ChapterAdapter>` — a typed record keyed by a
  string union (`"welcome" | "moveNew" | "clients" | "graphRibbon" |
  "events" | "cta"`). Mirrors `$x` structurally.
- `useChapterAdapter.ts`: `export function useChapterAdapter(ref:
  RefObject<HTMLElement>, key: FieldChapterKey): void` — effect
  hook that resolves the adapter from the registry and wires
  lifecycle; safe re-run on reducedMotion change.
- Each chapter component (`FieldHeroSection`, `FieldCtaSection`,
  …) calls the hook with its own ref and a static key. The adapter is
  free to use GSAP/ScrollTrigger or Framer Motion imperatively; the
  component renders declarative markup only.

**Why not a `ScrollProvider` config object**: the landing surface is
a single route with a single scroll ownership (`field-scroll-driver.ts`).
A centralized provider/config introduces indirection without a payoff.
Hook-per-chapter keeps the contract local and tree-shakeable, and does
not require the caller to import the registry at the top of the tree.

**What `$x` should not become**: a `querySelectorAll("[data-scroll]")`
lookup. SoleMD's chapter components already have refs; let them bind
their adapters directly. Abandon Maze's DOM-scan-driven binding.

## Drift items (roll-up across all adapters)

### D1. Title/subtitle text reveal is paragraph-grain, not word/character-grain

- **Maze ref**: scripts.pretty.js:49043, 49052, 48644, 48645 (`new lo(..., { type: "words" }).words` with GSAP stagger)
- **SoleMD location**: `apps/web/features/field/surfaces/FieldLandingPage/FieldHeroSection.tsx:44–53` and `FieldCtaSection.tsx:51–62`
- **Drift**: Maze reveals each word as a separately animated DOM span
  (`x: "2em", opacity: 0, stagger.each: 0.2`). SoleMD animates the
  whole `<h1>` / `<h2>` / `<p>` as one motion node. This flattens the
  chapter's entrance energy — the most visible parity gap on both
  counterpart sections.
- **Severity**: **Should-fix**
- **Proposed fix**: Promote `TextReveal.tsx` out of `_smoke` to
  `apps/web/features/animations/text-reveal/TextReveal.tsx`,
  parameterise (`text`, `grain: "chars" | "words"`, `stagger`, `ease`,
  `as`, `trigger: "mount" | "in-view" | "scroll"`). Replace the `h1`
  inside HeroSection (`trigger: "mount"`) and the `h2` inside
  CtaSection (`trigger: "in-view"`). For words, split on whitespace and
  emit `motion.span` per word; wrap in `display: inline-block` and
  preserve original spaces with `whiteSpace: "pre"` on space entries.
- **Verification**: Open landing, watch hero title reveal staggered
  word-by-word; grep `FieldHeroSection` for `TextReveal` import;
  confirm `reduced` branch still renders as a single static heading.

### D2. No `is-welcome-ready` broadcast on hero reveal completion

- **Maze ref**: scripts.pretty.js:49061, 49065 (`onComplete: () =>
  document.body.classList.add("is-welcome-ready")`)
- **SoleMD location**: `FieldHeroSection.tsx` — not emitted
- **Drift**: Maze publishes a "welcome finished" signal on `body` so
  downstream CSS / chrome can transition (e.g., reveal the progress
  bar or chrome pill). SoleMD's chrome pill transition is instead driven
  by `CHROME_SURFACE_TRANSITION_SCROLL_PX` scroll threshold in
  `FieldLandingPage.tsx:67, 149–155`, which is a different
  mechanism entirely (scroll-Y rather than hero-complete).
- **Severity**: **Nice-to-have**
- **Proposed fix**: Delegate to the existing scroll-threshold pattern
  unless Phase 4 identifies a concrete consumer that needs the
  hero-complete event. If needed, fire a custom event
  (`window.dispatchEvent(new Event("field:welcome-ready"))`)
  from the TextReveal `onComplete`, rather than mutating `body`.
- **Verification**: Decide in Phase 4; document the choice in the build
  spec.

### D3. Hero eyebrow (`eyebrow` p element) is a SoleMD-only addition

- **Maze ref**: no equivalent in `JS`.
- **SoleMD location**: `FieldHeroSection.tsx:27–41` and
  `FieldCtaSection.tsx:34–49`.
- **Drift**: **Not drift — sanctioned addition.** Eyebrows are part of
  the project's aesthetic skill (uppercase micro-label above a headline)
  and give the title a semantic frame Maze does not use. Record as
  sanctioned, not drift.
- **Severity**: N/A (sanctioned).

### D4. No mobile marquee/ticker chapter (moveNew)

- **Maze ref**: scripts.pretty.js:49069–49099 (`QS`)
- **SoleMD location**: not implemented
- **Drift**: SoleMD landing has no marquee. Whether this is drift or
  sanctioned depends on whether the Maze-parity brief includes this
  chapter. Since the catalog lists it as homepage-active, mark as drift
  pending Phase 4 decision.
- **Severity**: **Doc-only** (pending Phase 4 scope call)
- **Proposed fix**: Phase 4 decides: port as a mobile-only `<MoveNewRibbon />`
  chapter (with GSAP + matchMedia) OR officially drop moveNew from
  SoleMD's landing parity and mark as sanctioned.
- **Verification**: Build spec contains an explicit "moveNew: dropped" or
  "moveNew: ported" line.

### D5. No clients/logo-grid chapter

- **Maze ref**: scripts.pretty.js:48597–48614 (`HS`)
- **SoleMD location**: not implemented
- **Drift**: SoleMD landing has no client/press chapter. Same Phase 4
  scope question as D4.
- **Severity**: **Doc-only**
- **Proposed fix**: Phase 4 decides. If ported, the centered-vs-edges
  stagger heuristic based on a `data-center` attribute is the load-
  bearing detail — preserve it as a React prop rather than DOM
  attribute.
- **Verification**: Build spec explicit on clients inclusion/exclusion.

### D6. No composed multi-target scroll-triggered reveal for the graph chapter

- **Maze ref**: scripts.pretty.js:48732–48832 (`qS`)
- **SoleMD location**: `FieldGraphSection.tsx` (exists, but is a
  live-graph warm-up action wrapper, not a composed SVG ribbon reveal)
- **Drift**: Maze's `graphRibbon` does a 7-target staggered + clip-
  path-chained entrance over a single ScrollTrigger. SoleMD's graph
  section doesn't attempt this kind of multi-layer choreography.
- **Severity**: **Should-fix**
- **Proposed fix**: Add a chapter-local entrance timeline to
  `FieldGraphSection.tsx` using Framer Motion variants with
  `staggerChildren`. The composition doesn't need to match Maze's SVG
  structure — what's load-bearing is *some* staggered reveal of the
  graph-chapter visual elements (warm-up control, caption, any cards)
  so the chapter enters with choreography, not as a block.
- **Verification**: Scroll to graph section, observe multiple elements
  entering in sequence rather than one block fade.

### D7. No clip-path-driven "draw" reveal for SVG paths

- **Maze ref**: scripts.pretty.js:48811–48822 (`qS` `inset(0% 0% 0% 100%)`
  → `inset(0% 0% 0% 0%)` sweep on `#ribbon-chart-thick path` and
  `#ribbon-chart-thin path`)
- **SoleMD location**: not implemented anywhere on landing
- **Drift**: This is the "line draws itself on scroll" SVG pattern.
  DrawSVG is a paid GSAP plugin (used in `WS` too). Maze uses `clipPath`
  with `inset(...)` as a free-tier alternative.
- **Severity**: **Nice-to-have**
- **Proposed fix**: Document the `clipPath: inset(...)` technique as a
  reusable primitive in the animation-authoring skill. Not needed on
  landing until a surface reintroduces SVG line art.
- **Verification**: If added, verify via a Framer Motion `animate={{
  clipPath: "inset(0 0 0 0)" }}` on a target SVG path.

### D8. No stepped event-timeline/checklist chapter

- **Maze ref**: scripts.pretty.js:48665–48731 (`WS`)
- **SoleMD location**: not implemented
- **Drift**: No process/steps/checklist chapter on landing. Phase 4
  scope question.
- **Severity**: **Doc-only**
- **Proposed fix**: Phase 4 decides.
- **Verification**: Build spec explicit.

### D9. DrawSVG plugin not used

- **Maze ref**: scripts.pretty.js:48716 (`drawSVG: "0%"` → `drawSVG:
  "100%"` on `.js-event-checkmark path`)
- **SoleMD location**: not implemented
- **Drift**: DrawSVG is a GSAP Club plugin. SoleMD doesn't license it
  (confirmed by grep — no `drawSVG` usages anywhere in the project).
- **Severity**: **Doc-only** (licensing constraint)
- **Proposed fix**: Use Framer Motion `pathLength` (native SVG path
  animation) or `strokeDasharray`/`strokeDashoffset` if a checkmark-
  draw pattern is ever needed. Document in animation-authoring skill.
- **Verification**: If implemented, verify via Framer Motion
  `initial={{ pathLength: 0 }}`, `animate={{ pathLength: 1 }}`.

### D10. No nested-timeline-per-child-item master-timeline pattern

- **Maze ref**: scripts.pretty.js:48688–48720 (`WS` — each subitem builds
  its own nested GSAP timeline and is added to the master with a relative
  overlap)
- **SoleMD location**: not used anywhere
- **Drift**: This is a useful general pattern (not just events) —
  per-item nested timelines let you tune overlap and reuse sub-tween
  composition. Framer Motion's equivalent is
  `variants` + `staggerChildren` + per-variant `transition.when`
  semantics.
- **Severity**: **Nice-to-have**
- **Proposed fix**: Document the Framer Motion analog in the animation
  skill as "master + nested-children variants".
- **Verification**: Not actionable on landing today.

### D11. CTA button stagger is flat rather than actually staggered

- **Maze ref**: scripts.pretty.js:48660 (`n` → `{ scale: 0.75, opacity: 0,
  stagger: 0.15 }` where `n` is `r.querySelectorAll(".a-button")`)
- **SoleMD location**: `FieldCtaSection.tsx:82–116` — both buttons
  share one parent motion.div with `delay: 0.08`, so they enter
  simultaneously, not staggered.
- **Drift**: Two-button stagger not preserved. Small but visible.
- **Severity**: **Nice-to-have**
- **Proposed fix**: Replace the single wrapping motion.div with a
  motion container using `staggerChildren: 0.15` and make each button
  a motion.button child.
- **Verification**: Observe CTA buttons entering one after the other,
  not simultaneously.

### D12. No registry / hook-based chapter adapter contract exists yet

- **Maze ref**: scripts.pretty.js:49102–49113 (`$x`) + 49176–49191
  (consumer)
- **SoleMD location**: not implemented — chapters hand-roll their own
  Framer Motion inside their JSX
- **Drift**: Each chapter reinventing its own entrance means there's no
  shared vocabulary (stagger values, easing curves, reduced-motion
  handling, scroll/mount trigger selection) — which is exactly what
  `$x` centralises on the Maze side. Without a registry, every new
  chapter drifts further.
- **Severity**: **Should-fix**
- **Proposed fix**: Implement the hook-based port described in
  "Registry port recommendation" above. Migrate `FieldHeroSection`
  and `FieldCtaSection` onto it first; leave a stub entry for
  each of `moveNew`, `clients`, `graphRibbon`, `events` that throws
  a `console.warn` until its chapter is built.
- **Verification**: `features/field/scroll/chapter-adapters/`
  directory exists with `registry.ts`, `useChapterAdapter.ts`, and per-
  chapter adapter files; Hero+CTA components call `useChapterAdapter`.

### D13. TextReveal primitive is in `_smoke` and not production-wired

- **Maze ref**: whole B14 pattern (`lo` consumption)
- **SoleMD location**: `apps/web/features/animations/_smoke/text-reveal/TextReveal.tsx`
- **Drift**: SoleMD already has the right idea (character-grain Framer
  Motion stagger) but it's hardcoded to a demo headline and lives in
  the smoke-test tree. No production consumer.
- **Severity**: **Should-fix**
- **Proposed fix**: Promote to `apps/web/features/animations/text-reveal/`,
  generalise API, add tests, then wire into Hero+CTA via D1.
- **Verification**: Grep for `TextReveal` import in
  `FieldHeroSection.tsx` and `FieldCtaSection.tsx` yields
  matches.

### D14. No shared debounced-resize → refresh wiring

- **Maze ref**: scripts.pretty.js:48722–48727, 48823–48828 (both `WS`
  and `qS` register `window.addEventListener("resize", ml(() =>
  scrollTrigger.refresh(), 1e3))`)
- **SoleMD location**: `field-scroll-driver.ts:106` calls
  `ScrollTrigger.refresh()` once at bind time; no resize listener.
- **Drift**: SoleMD's scroll driver does not refresh on resize. Any
  future ScrollTrigger-bound chapter will lose alignment after a
  resize unless ScrollTrigger's built-in resize handling is still active
  (which it is, by default — this mitigates the drift).
- **Severity**: **Doc-only** (ScrollTrigger's built-in resize handler is
  normally sufficient; Maze's explicit debounce is belt-and-braces).
- **Proposed fix**: If per-chapter adapters land via D12, optionally
  expose a `refreshOnResize?: boolean` option on the adapter contract.
  Default to ScrollTrigger's native behavior.
- **Verification**: Not actionable until D12 lands.

### D15. `quick`/`delay` args in adapter signature are Maze smell, do not port

- **Maze ref**: scripts.pretty.js:49183–49190 (`delay`, `quick` computed
  but ignored by all homepage adapter bodies)
- **SoleMD location**: N/A
- **Drift**: Drift is Maze's, not SoleMD's — documenting so the Phase 4
  port does not cargo-cult a dead parameter. The SoleMD chapter adapter
  contract (D12) should be `(el, opts: { reducedMotion })`, not
  `(el, delay, quick)`.
- **Severity**: **Doc-only** (anti-port note)

## Sanctioned deviations

1. **Framer Motion as default motion substrate** over GSAP. Covered by
   the `animation-authoring` skill. Applies to D1 (TextReveal is Framer
   Motion), D6 (graph chapter reveal), D11 (CTA button stagger). GSAP
   is still used where ScrollTrigger integration is load-bearing
   (`field-scroll-driver.ts`), which is itself a pilot-audited
   sanctioned deviation (pilot audit § "Sanctioned deviations" item 1).

2. **On-mount Framer Motion for hero entrance** (D1) matches Maze's
   on-load `JS` welcome timeline (Maze's welcome has no `scrollTrigger`
   either). Not a deviation in behavior — just in substrate.

3. **`whileInView` with `viewport: { once: true, amount: 0.35 }` for CTA**
   (D1, CTA variant) is parity with Maze's `Ht.create({ toggleActions:
   "play pause resume reset" })`. The two frameworks encode "play once
   when the section enters" with different APIs; the user-observable
   behavior matches.

4. **Eyebrow label above headline** (D3) is a SoleMD aesthetic addition.
   Not drift.

5. **Live Cosmograph graph chapter vs. Maze's static SVG graphRibbon**
   (D6). The SoleMD graph section wraps a live runtime warm-up, which
   is a deliberate product choice (live > illustrated). The choreography
   gap (D6) is still real and separable from this architectural
   sanctioned deviation.

6. **No DrawSVG** (D9) — paid GSAP plugin not licensed for the project.
   Framer Motion's `pathLength` is the sanctioned alternative.

7. **Scroll driver is landing-only** — per the pilot audit § "Sanctioned
   deviations" item 1. B8's adapter registry should follow the same
   ownership boundary: it's a landing-surface concern, not a page-global
   singleton.

## Open questions

1. **Phase 4 scope call on `moveNew`, `clients`, `events`**: are these
   chapters part of SoleMD's landing parity brief, or are they officially
   out of scope? D4, D5, D8 flip between "drift" and "sanctioned" based
   on this decision.

2. **Is the adapter registry (D12) a required port, or is per-chapter
   Framer Motion hand-authoring acceptable?** If the landing stays at
   2 chapters (Hero + CTA), the registry may be overengineering. Once
   a third field chapter lands, the registry earns its weight.

3. **Does the TextReveal promotion (D13) belong inside `features/animations/`
   or `features/field/`?** Recommend `features/animations/text-reveal/`
   as a project-wide primitive, so wiki modules and future surfaces
   can also consume it.

4. **Should SoleMD port `is-welcome-ready` broadcast (D2) as a custom
   event**, or is the scroll-threshold chrome-pill transition
   (`CHROME_SURFACE_TRANSITION_SCROLL_PX`) sufficient coverage? The
   two mechanisms answer different questions ("hero animation finished"
   vs "user scrolled past threshold") and may both be needed.

5. **Any existing SoleMD adapter pattern this audit missed?** Grep for
   `ScrollTrigger` turned up `apps/web/features/animations/_smoke/scroll-fade/ScrollFade.tsx`
   and `_smoke/scroll-mechanism/ScrollMechanism.tsx` — both smoke tests.
   `ScrollyPin.tsx` in `wiki/module-runtime/primitives` is the only
   production consumer of ScrollTrigger outside the field
   scroll-driver. No registry pattern discovered. Confirming: no
   pre-existing chapter-adapter pattern on the SoleMD side — this is a
   true greenfield.
