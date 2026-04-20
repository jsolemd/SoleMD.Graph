# Audit B10 — Scroll ownership re-verify

**Auditor**: agent-12 (Phase 3, re-verify pass)
**Priority**: P2
**Date**: 2026-04-19
**Maze source re-read**: `data/research/mazehq-homepage/2026-04-18/scripts.pretty.js` lines 49114–49325
**SoleMD source re-read**: `apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts` (114 lines, last touched commit `6e75031` 2026-04-19 18:43 — post-pilot)

## Pilot audit status

Each drift item from `pilot-scroll-controller.md` re-verified by reading the exact Maze line cited and the current SoleMD driver. C9 false-positive discipline applied.

### D1 — Singleton class `jt` vs. function-based `bindAmbientFieldControllers`

- **Claim**: Maze exposes a class with static lifecycle (`start`/`stop`/`enable`/`disable`/`resize`) and `jt.instance` singleton; SoleMD exports a plain function with a disposer.
- **Maze verification**: Lines 49115–49122 define `var jt = class jt` with `jt.instance = this`; static methods at 49123–49147 (`resize`, `enable`, `disable`, `start`, `stop`, `resetScrollCache`, `scrollToCached`). Confirmed present.
- **SoleMD verification**: `ambient-field-scroll-driver.ts:34` exports `bindAmbientFieldControllers(...)` returning `() => void`. No singleton, no static lifecycle. Confirmed present as described.
- **Verdict**: **confirmed** — and **correctly classified as "Should-fix / document, don't port"**. The pilot's proposed fix (document the architectural boundary rather than mimic a page-global singleton) is the right call per SKILL.md § 1 Stage layer ownership. No action beyond build-spec documentation.

### D2 — No scroll-state body class toggling (`is-scrolled`, `is-scrolling-down`, `is-scrolled-vh*`, `is-scrolled-header-height`)

- **Claim**: Maze's `jt.onScroll` toggles six body classes on scroll (49244–49268); SoleMD has no equivalent.
- **Maze verification**: Lines 49244–49268 confirmed — `onScroll` static toggles `is-scrolled` (49248), `is-scrolling-down` (49249–49252), `is-scrolled-vh` (49253–49256), `is-scrolled-vh-{25,50,75}` (49257–49262 with `jt.vhValues = [25, 50, 75]` at 49240), `is-scrolled-header-height` (49263–49267).
- **SoleMD verification**: Searched `apps/web` for `is-scrolled`, `is-scrolling-down`, `is-scrolled-vh`, `is-scrolled-header-height` — **zero matches**. Nothing wires these classes anywhere in the shell, router, or landing surface.
- **Verdict**: **confirmed** as a true gap. However, the pilot itself flagged at line 124 that this was "re-verified" as a possible delegation — re-verified here that there is no delegation anywhere in `apps/web`; this is genuinely not implemented. The pilot's "Must-fix" severity **should be downgraded to "Should-fix / delegated-to-shell"** in the build spec: the capability doesn't exist, but per SKILL.md § 1 Stage layer, a shell-level utility (`bindScrollStateClasses`) is the correct owner — not the ambient-field scroll-driver. The pilot's proposed split module is correct.

### D3 — No scroll-position caching

- **Claim**: Maze has `jt.scrollCache` keyed by pathname (49140, 49142–49147, 49247) with restore via `scrollToCached()`; SoleMD has none.
- **Maze verification**: Lines 49139–49147 (`resetScrollCache`, `scrollToCached`), 49236 (`jt.scrollCache = {}`), 49247 (per-scroll write `jt.scrollCache[window.location.pathname] = e`). Confirmed.
- **SoleMD verification**: Searched `apps/web` for `scrollRestoration` and `sessionStorage` around scroll — **zero matches**. Next.js App Router provides some built-in scroll restoration per-navigation but nothing keyed to pathname in this project.
- **Verdict**: **confirmed** as a deferred-gap. Correctly classified "Should-fix, delegated to router/shell." Not the ambient-field layer's job.

### D4 — No hash-click navigation handler

- **Claim**: Maze's `bindHashClick` / `onHashClickHandler` (49166–49174, 49300–49324) intercepts `a[href^="#"]` clicks with `data-scrollTop`, `data-scrollDown`, `data-scrollToContent`, `data-offset`, `data-duration` overrides; SoleMD has none.
- **Maze verification**: Lines 49166–49175 (bind/unbind), 49300–49324 (handler). Confirmed — consumes `data-offset` (49317), `data-duration` (49322), `data-scrollTop`/`data-scrollDown`/`data-scrollToContent` dataset flags (49304–49306).
- **SoleMD verification**: No equivalent click interceptor exists in `apps/web`. Native anchor behavior is used.
- **Verdict**: **confirmed** as deferred-gap. Correctly classified "Nice-to-have / surface-local." Not required for the blob-centric landing.

### D5 — No dynamic IntersectionObserver (`[data-observe]`, `.js-progress`)

- **Claim**: Maze has two IntersectionObserver instances (49193–49211 for `[data-observe]`; 49214–49230 for `.js-progress`) toggling `is-in-view`, `is-below`, `is-above`; SoleMD has none.
- **Maze verification**: Lines 49193–49204 — first observer with `threshold: 0.001` on `[data-observe]` and `[data-observe="children"]` descendants (49206–49208). Lines 49214–49230 — `.js-progress` observer with `rootMargin: "-1px 0px 0px 0px"` and `threshold: [1]`. **Small wrinkle re-verified**: the second observer is **constructed** at 49224–49228 but line 49229 calls `this.observer.observe(e)` — that's the *first* observer, not the new one `n`. The second IntersectionObserver instance is constructed and then discarded (`n` is never observed against). This looks like a latent bug in Maze or a truncation in the minified pretty-print. The pilot didn't flag this asymmetry. Noted below under "New findings".
- **SoleMD verification**: Searched `apps/web` for `is-in-view`, `data-observe` — **zero matches**.
- **Verdict**: **confirmed** as gap. Correctly "Should-fix / delegated to shell utility." Pilot's proposed `ambient-field-dom-observers.ts` split is right.

### D6 — No viewport-fraction thresholds (`is-scrolled-vh-{25,50,75}`)

- **Claim**: Maze iterates `jt.vhValues = [25, 50, 75]` to toggle three viewport-fraction classes (49257–49262).
- **Maze verification**: Lines 49240 (`jt.vhValues = [25, 50, 75]`), 49257–49262 (forEach toggling `is-scrolled-vh-${t}`). Confirmed.
- **SoleMD verification**: Zero matches (see D2).
- **Verdict**: **confirmed** as gap, correctly subsumed into D2's build-spec fix (fold into `bindScrollStateClasses`).

### Tally

| Outcome | Count | Items |
|---|---|---|
| Confirmed | 6 | D1, D2, D3, D4, D5, D6 |
| False-positive | 0 | — |
| Already fixed | 0 | — |
| Deferred-gap (same as confirmed; severity shift only) | D2 from Must-fix to Should-fix-delegated | — |

## New findings

Pilot scope was section 3 only (lines 49115–49325). Re-reading the current driver fresh surfaced five items the pilot did not cover, two of which belong in the build spec.

### N1. Hero progress CSS custom-property writer (`--ambient-hero-progress`) — SoleMD-only

- **SoleMD location**: `ambient-field-scroll-driver.ts:79–90`.
- **Maze reference**: no counterpart in the `jt` scroll controller. Hero/chrome progress in Maze is owned by the separate progress controller `gg` (bucket B12) and by `data-scroll` adapter side effects — not by `jt`.
- **Classification**: **SoleMD-native enhancement**, not drift from Maze. Worth noting in the build spec as "SoleMD scroll-driver additionally writes `--ambient-hero-progress` — a capability the Maze `jt` does not own directly."
- **Action**: Doc-only. No fix needed.

### N2. Post-bind `ScrollTrigger.refresh()` (lines 97–106)

- **SoleMD location**: `ambient-field-scroll-driver.ts:106`, with a meaningful block comment (97–105) explaining why a synchronous refresh is required in React when multiple `fromTo` tweens stack on the same uniform (`uAlpha 1→floor` then `floor→1`).
- **Maze reference**: Maze defers its bind under `setTimeout(..., 1)` (referenced in the comment; actual call site is inside Maze's `load()` path, not this slice). The SoleMD approach is architecturally equivalent but explicit rather than microtask-deferred.
- **Classification**: Sanctioned adaptation for React's synchronous mount model. Worth recording in the build spec so future editors don't "fix" it by removing the refresh.
- **Action**: Doc-only. The inline comment already documents the invariant.

### N3. Reduced-motion branch (lines 91–95)

- **SoleMD location**: `ambient-field-scroll-driver.ts:50, 91–95`. When `reducedMotion`, the driver pins `blob.visibility = 1` and `--ambient-hero-progress = 0`, skipping all ScrollTrigger construction.
- **Maze reference**: Maze uses `matchMedia.add("(prefers-reduced-motion: no-preference)", ...)` wrapping the entire adapter setup (49178). SoleMD's branch is a tighter, imperative equivalent.
- **Classification**: Parity with a cleaner gating model. Correct.
- **Action**: Doc-only.

### N4. `sceneStateRef` as the bridge between ScrollTrigger and controller state

- **SoleMD location**: `ambient-field-scroll-driver.ts:59–72`. `onUpdate` writes `localProgress` and `visibility` on `sceneStateRef.current.items.blob` — the bridge by which non-blob controllers could later observe blob progress.
- **Maze reference**: Maze controllers mutate their own state from their own scroll bindings; there is no shared `sceneStateRef` ref object.
- **Classification**: SoleMD-native architectural choice (React ref-based shared state vs. Maze's intra-controller state). Sanctioned; compatible with the "blob-only landing" contract.
- **Action**: Worth naming in the build spec as a SoleMD-specific idiom for cross-controller progress observation on future multi-controller surfaces.

### N5. Latent-bug spotting in Maze source (lines 49224–49229)

- **Maze reference**: The second IntersectionObserver (`n`) constructed at 49224 is never used — line 49229 calls `this.observer.observe(e)` (the first observer), not `n.observe(e)`. Either the pretty-print is incomplete or Maze shipped a dead-code observer.
- **Impact on SoleMD**: None — we don't port this behavior anyway. But it means the pilot's D5 description of "two observer instances with different thresholds" slightly overstates Maze's effective behavior: in practice only the first observer's config runs.
- **Action**: The build spec's D5 fix (one generic `bindDomStateObservers`) is **correct and more consolidated than Maze's**. Note this in the spec so readers understand why we don't build two observers.

## Sanctioned deviations (re-confirmed)

Pilot identified three sanctioned deviations. All three re-verified against SKILL.md § "Canonical Layer Ownership" (lines 603–676).

1. **Landing-surface-only scroll binding** — re-confirmed sanctioned. SKILL.md § 3 Scene-controller layer owns "scroll timelines" per anchor; the driver is a thin wrapper that delegates the blob timeline to `BlobController.bindScroll` (driver line 48). SoleMD does not own page-global scroll like Maze's `jt`. **Classification stands.**

2. **No scroll caching at the scroll-driver level** — re-confirmed sanctioned. Scroll restoration is Next.js router / shell territory, not field runtime. SKILL.md is silent on scroll caching because it is out of scope for the field layers. **Classification stands.**

3. **No global scroll-state observer in the scroll-driver** — re-confirmed sanctioned. SKILL.md § 1 Stage layer does **not** list scroll-state class toggling among stage responsibilities; it lists "frame policy" and "visibility lifecycle" only. Body-class side effects sit above the field runtime, in the shell. **Classification stands**, with the refinement from D2 above: the build spec should name this explicitly as "delegated to shell utility `bindScrollStateClasses`, to be authored separately."

## Recommendation for Phase 4 build-spec

The pilot audit **stands as-is for build-spec inclusion** with two minor refinements:

1. **Re-severity D2 from Must-fix to Should-fix-delegated**. The pilot itself flagged this re-verification caveat at its line 124 ("false-positive risk flagged") — my re-verify confirms the capability is genuinely missing but the correct owner is the shell, not the scroll-driver. Phase 4 should template D2 as a "Shell-utility to author" work item rather than a scroll-driver bug.
2. **Append the five new findings (N1–N5) as a "Driver enhancements post-pilot" appendix**. N1–N4 are SoleMD-native enhancements (hero progress CSS property, synchronous post-bind refresh, reduced-motion branch, sceneStateRef bridge) that should be documented so future auditors don't flag them as drift. N5 is an upstream-Maze observation that justifies consolidating D5's observer port into a single observer instead of porting Maze's two-observer pattern verbatim.

No Phase 4 rewrite needed. The pilot's drift items, sanctioned-deviations classifications, and proposed fixes are all sound; only the D2 severity label and the N-appendix need to be templated in.
