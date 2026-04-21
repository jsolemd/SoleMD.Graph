# B12 audit — Progress controller (`gg`) vs. `FieldStoryProgress.tsx`

**Auditor**: agent-10
**Subsystem**: B12 — Progress controller (catalog § B12, Phase 3 Agent 10)
**Priority**: P1
**Maze lines audited**: scripts.pretty.js [50178, 50255] (78 lines)
**Maze DOM anchors**: index.html line 323 (story-1) + line 718 (story-2) — 2 `data-component="Progress"` instances
**SoleMD file audited**: `apps/web/features/field/surfaces/FieldLandingPage/FieldStoryProgress.tsx` (102 lines)
**SoleMD related**:
- `apps/web/features/field/surfaces/FieldLandingPage/FieldStoryChapter.tsx` (mounts Progress)
- `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx` (chapter mount count)
- `apps/web/features/wiki/components/ViewportTocRail.tsx` (unrelated rail pattern — cross-ref only)
- `apps/web/features/wiki/components/use-section-toc-state.ts` (unrelated rail pattern — cross-ref only)
**Date**: 2026-04-19

## Summary

Maze's `gg` progress controller is an `Ei`-derived DOM component registered through `data-component="Progress"` with **two live instances** (story-1 tracks `#info-1/2/3`, story-2 tracks `#info-4/5/6`). Each instance writes `--progress-N` CSS custom properties (one per segment, 1-indexed) on the `.js-progress` root, GSAP-smooths every scroll tick with `gsap.to(..., { duration: 0.1, ease: "sine" })`, publishes the integer active section via `dataset.currentVisible`, toggles `is-active` on the root when any-but-not-all sections are in range, measures the progress-bar pixel width into `--bar-width`, and desktop-gates the entire scroll handler behind `yi.desktop`. Segment→section binding is resolved at construction by reading each `.js-progress-segment`'s `data-id` and `document.querySelector('#' + data-id)`.

SoleMD's `FieldStoryProgress` covers the **semantic shape** of the controller: it iterates beat IDs, measures each section, writes a progress value per segment, and publishes `data-current-visible`. But it diverges on almost every parity-critical detail. CSS custom property **names do not match** (`--ambient-story-progress` per segment vs. Maze's `--progress-N` on the root). The controller is **not multi-instance** — only Story 1 mounts it; Story 2 is a bare `<section>` with no progress at all. The smoothing path is **not GSAP** (relies on `fieldLoopClock` throttling + a CSS transform on a non-transitioned node, i.e. no real smoothing per frame). The **activation algorithm** is different (focus-line at 35% viewport with 24%/46% window bounds vs. Maze's `innerHeight/2` pivot and bottom-clearing-header threshold). `is-active` root toggle, `--bar-width` CSS var, and header-offset math are **all missing**.

The drift is substantive and is not a sanctioned architectural divergence. The `module` SKILL.md lists `.s-progress` under the DOM-and-component equivalence map ("runtime-owned sticky progress component") and explicitly names "smooth scrubbed progression instead of section-burst swaps" under the SoleMD-aesthetic-Maze-motion rule. Neither the SKILL.md nor any reference file sanctions a single-instance, per-segment-variable, non-GSAP progress controller. The story-2 instance is **unconditionally parity-critical** per the plan hard rule.

## Parity overview

| Behavior                                         | Maze line(s)              | SoleMD location                                            | Ownership    | State   |
| ------------------------------------------------ | ------------------------- | ---------------------------------------------------------- | ------------ | ------- |
| Class from base `Ei` (component-registry wired)  | 50178, 50180              | function component (no base class, no registry)            | surface      | drift   |
| Component-registry activation (`data-component`) | index.html:323, 718       | explicit React mount in `FieldStoryChapter`         | surface      | drift   |
| Multi-instance (story-1 + story-2, 2 roots)      | index.html:323, 718       | 1 instance (story-1 only)                                  | surface      | **missing (P0 within B12)** |
| Desktop-only gate (`yi.desktop`)                 | 50187                     | none (runs on all widths)                                  | runtime      | drift   |
| `.js-progress-bar` width read → `--bar-width`    | 50211, 50233–50239        | not read, not published                                    | surface      | missing |
| Segment→section resolution via `data-id`         | 50212–50217               | direct `document.getElementById(beatId)` by props          | surface      | parity (different wiring, equivalent outcome) |
| CSS custom property writes per segment           | 50190–50193 (`--progress-N` on root) | per-segment `--ambient-story-progress` on each segment node | surface | **drift (name + scope)** |
| Custom property names                            | `--progress-1`, `--progress-2`, `--progress-3`, … | `--ambient-story-progress` (same name on every segment) | surface | drift |
| Custom property scope                            | root `.js-progress` (`this.view`) | individual `.js-progress-segment` equivalents | surface | drift |
| GSAP `.to()` smoothing (duration 0.1, ease sine) | 50199–50202               | none (value toFixed(4) assigned directly; throttled to 20 Hz by `fieldLoopClock`) | surface | drift |
| `dataset.currentVisible` integer published       | 50203–50204               | `setAttribute("data-current-visible", "N")`                | surface      | parity (semantic); off-by-one / activation-line differs |
| `activeSection` computation                      | 50194–50197 (`floor(Σprogress)+1`, clamped to count) | index-of-last-segment-with-progress>0.01                 | surface | drift |
| `is-active` root class toggle                    | 50205–50208               | not toggled                                                | surface      | missing |
| `calculateSectionProgress()` algorithm           | 50241–50253               | different focus/window math (see D5)                       | surface      | drift |
| Header-height offset into threshold              | 50244–50247, 50250        | not read; header ignored                                   | surface      | missing |
| Scroll-driver binding                            | 50230–50232 (native `scroll` listener) | `window.addEventListener("scroll", …)` + `fieldLoopClock` 20 Hz subscriber | surface | drift (added throttle layer) |
| Resize handling                                  | 50183–50185 (resize → `setProgressBarWidth`) | `window.addEventListener("resize", requestSync)` (syncs progress, ignores bar-width) | surface | drift |
| Destroy / unbind on teardown                     | 50221–50229               | useEffect cleanup removes scroll/resize + `fieldLoopClock` disposer | surface | parity |

## Drift items

### D1. SoleMD mounts only one progress instance (story-2 unsupported)

- **Maze reference**: index.html lines 323 and 718 — two independent `.js-progress` roots, each registered via `data-component="Progress"` and instantiated by the component registry `xy` (catalog § B13). Each instance tracks its own three segments (`info-1/2/3` vs. `info-4/5/6`).
- **SoleMD location**: `FieldStoryChapter.tsx:100` mounts `<FieldStoryProgress>` once. `FieldLandingPage.tsx:351` instantiates `FieldStoryChapter` once for Story 1. Story 2 is a bare `<section>` at `FieldLandingPage.tsx:360–418` — no progress component. Confirmed by `grep FieldStoryChapter apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx` returning two hits, both `import` and a single JSX use.
- **Drift**: Multi-instance support is parity-critical and is explicitly called out by the plan hard rule. Maze's `gg` does not know about "story 1 vs. story 2" — it is a generic DOM component that instantiates per root. SoleMD's component is prop-driven and would in principle support multiple mounts (the ref arrays are per-instance), but Story 2 never mounts it. The chapter-level asymmetry (Story 1 uses `FieldStoryChapter`; Story 2 inlines a different layout with no progress rail) means there is no parity unless Story 2 is refactored to mount a second progress instance.
- **Severity**: **Must-fix** (plan hard rule; parity-critical)
- **Proposed fix** (no code changes in this audit; build-spec direction): Either (a) promote `FieldStoryChapter` to own Story 2 as well, passing Story 2's beat IDs, or (b) mount `<FieldStoryProgress beatIds={storyTwoBeatIds} />` directly inside the Story 2 `<section>` with a distinct set of segment/section IDs. Verify both instances update independently with the same CSS and smoothing contract.
- **Verification**: Scroll past Story 2; confirm a second progress rail appears, its segments write to their own nodes, `data-current-visible` is per-instance, and both instances coexist without cross-talk.

### D2. CSS custom property name + scope diverge

- **Maze reference**: scripts.pretty.js:50190–50202. Maze builds `n[`--progress-${s + 1}`] = o` (one key per segment, 1-indexed: `--progress-1`, `--progress-2`, `--progress-3`) and writes the whole batch to **the root `.js-progress` node** via `gsap.to(this.view, {...n, duration: 0.1, ease: "sine"})`. Also writes `--bar-width` on the root at construction (50239).
- **SoleMD location**: `FieldStoryProgress.tsx:48` writes `--ambient-story-progress` on **each segment node** (one var, many nodes). No root-level variable. No `--bar-width`.
- **Drift**:
  - **Property name mismatch**: `--progress-1 / -2 / -3` is not the same contract as `--ambient-story-progress`. A CSS rule targeting Maze's `var(--progress-2)` on any descendant of `.js-progress` has no SoleMD equivalent.
  - **Scope mismatch**: Maze exposes all segment progresses simultaneously on the same root; any child selector can read sibling progress (e.g., `.s-progress__segment--3 { width: calc(var(--progress-3) * 100%) }`). SoleMD scopes each variable to its own segment, preventing cross-segment CSS correlation.
  - **Count**: Maze writes exactly N variables per tick (matches segment count). SoleMD writes exactly N variables (one per segment). The aggregate count matches; the naming and addressing do not.
  - **Missing `--bar-width`**: the `.js-progress-bar` offsetWidth → `--bar-width` on root is a Maze-supported CSS hook (allows segments to size relative to the bar's measured pixel width). SoleMD never reads `.js-progress-bar` width.
- **Severity**: **Must-fix** (parity-critical per catalog § B12 key Maze symbols list)
- **Proposed fix**: Rename the SoleMD write to `--progress-${index + 1}`, target the root container ref (`progressRootRef.current`), and batch-write all N variables to that single node each tick. Additionally, measure `.js-progress-bar` (or its SoleMD equivalent — currently no direct `.js-progress-bar` node) once per resize and publish `--bar-width` on the root.
- **Verification**: `getComputedStyle(progressRoot).getPropertyValue('--progress-1')` returns the current story-1 segment progress; `--progress-2` and `--progress-3` are simultaneously set on the same node; `--bar-width` matches the progress-bar offsetWidth in pixels.

### D3. GSAP `.to()` smoothing is absent

- **Maze reference**: scripts.pretty.js:50199–50202. Every scroll tick runs `a1.default.to(this.view, Zl(Kn({}, n), { duration: 0.1, ease: "sine" }))` — GSAP interpolates each `--progress-N` from current to target over 100 ms with a sine ease, and overwrites in-flight tweens on the next tick.
- **SoleMD location**: `FieldStoryProgress.tsx:48` does `segmentNode.style.setProperty("--ambient-story-progress", progress.toFixed(4))` — immediate assignment, no tween. The `bg-[var(--color-soft-blue)]` segment fill at line 94 uses `[transform:scaleX(var(--ambient-story-progress,0))]` with **no CSS transition** declared, so every scroll tick hard-snaps the transform.
- **Drift**: SoleMD's `fieldLoopClock.subscribe(..., 50, ...)` throttles sync cadence to ~20 Hz, but throttling is not smoothing. The Maze smoothing path interpolates between keyframes so the visible rail moves fluidly even under coarse scroll deltas; SoleMD will step at the throttle rate. This visibly affects the feel of the rail during slow scroll / trackpad momentum.
- **Severity**: **Should-fix**
- **Proposed fix**: Two options, both consistent with the SKILL.md "smooth scrubbed progression instead of section-burst swaps" rule:
  1. Add a CSS `transition: transform 100ms sine` to the segment fill (lowest-cost; matches Maze duration).
  2. Route the write through GSAP (`import { gsap } from "gsap"` then `gsap.to(root, { "--progress-1": v1, "--progress-2": v2, ..., duration: 0.1, ease: "sine" })`). This mirrors Maze exactly and integrates with the rest of the GSAP-owned runtime.
- **Verification**: Scroll slowly with a trackpad; the rail fill should visibly interpolate between scroll events rather than step at 20 Hz.

### D4. Desktop-only gate missing

- **Maze reference**: scripts.pretty.js:50187 — `if (!yi.desktop || !this.view) return;` bails the scroll handler on non-desktop. The DOM anchor class also carries `desktop-only` at index.html:323 and 718.
- **SoleMD location**: `FieldStoryProgress.tsx` has no viewport check. The component itself is conditionally rendered only by Tailwind responsive classes (`hidden … lg:flex` at line 81), which hides the DOM but **does not stop** the scroll handler — the `useEffect` still runs, still subscribes to `fieldLoopClock`, and still writes style properties to refs that may be detached.
- **Drift**: The visible-behavior result is similar (rail hidden on mobile), but the runtime cost is not — SoleMD runs all measurements and property writes on mobile even though nothing is shown. Per the SKILL.md mobile rule ("lower overlay counts… calmer motion") and the catalog's Mobile-branching-parity open question (§ "Open questions for Phase 4", item 6), this is a parity gap worth closing.
- **Severity**: **Should-fix**
- **Proposed fix**: Add a viewport check inside the `sync` function (early-return when `window.matchMedia('(max-width: 1023px)').matches` or whatever the SoleMD shell uses for desktop branching), OR skip the effect entirely via `useShellVariant` (already imported in adjacent `ViewportTocRail.tsx`) when the variant is mobile.
- **Verification**: Resize to mobile width; confirm no `--ambient-story-progress` writes happen on scroll (via devtools breakpoint or the property remaining at its initial value).

### D5. `calculateSectionProgress()` algorithm diverges

- **Maze reference**: scripts.pretty.js:50241–50253. Maze's algorithm:
  1. `n = header.offsetHeight` (default 0).
  2. `i = section.getBoundingClientRect()`.
  3. If `i.top >= innerHeight/2` → return 0 (section below the mid-viewport pivot).
  4. If `i.bottom - n <= 0` → return 1 (section fully cleared the header).
  5. Else return `clamp(abs(i.top - innerHeight/2) / i.height, 0, 1)` — distance of section top from mid-viewport, normalized by section height.
- **SoleMD location**: `FieldStoryProgress.tsx:27–49`. SoleMD's algorithm:
  1. `focusTop = scrollY + innerHeight * 0.35` (focus line at 35%, not 50%).
  2. `sectionTop = rect.top + scrollY`, `sectionHeight = offsetHeight`.
  3. `start = sectionTop - innerHeight * 0.24`.
  4. `end = sectionTop + sectionHeight - innerHeight * 0.46`.
  5. `progress = clamp01((focusTop - start) / max(1, end - start))`.
  6. Header offset is ignored.
- **Drift**:
  - **Pivot location**: Maze uses viewport midpoint (50%); SoleMD uses 35%. This shifts when a segment hits 0% and 100%.
  - **Window bounds**: Maze's window is `[innerHeight/2 – sectionHeight, innerHeight/2]` (start-relative); SoleMD's window is `[sectionTop - 24%vh, sectionTop + sectionHeight - 46%vh]` (section-relative with hard-coded offsets).
  - **Header handling**: Maze subtracts `header.offsetHeight` from the bottom-clearing threshold so a section isn't marked 100% until it's fully below the sticky header. SoleMD never measures the header.
  - **Transition shape**: Both are linear, but the rate and anchor differ enough that visible progress fill will not align between the two implementations at any given scrollY.
- **Severity**: **Should-fix** (parity-critical for visual pacing)
- **Proposed fix**: Port Maze's algorithm verbatim, substituting the SoleMD header node (likely `document.querySelector('[data-graph-chrome="header"]')` or the shell chrome ref) for `.js-header`. Keep the 50% pivot, the header-bottom-clearing short-circuit, and section-height normalization.
- **Verification**: With the sticky header at 64 px and a section spanning `[1000, 2000]` scrollY, verify progress is 0 when `scrollY + innerHeight/2 < 1000`, progress is 1 when the section's `bottom - 64 <= 0` in viewport coords, and interpolates linearly in between.

### D6. `is-active` root class not toggled

- **Maze reference**: scripts.pretty.js:50205–50208 — `this.view.classList.toggle("is-active", t > 0 && t < this.sections.length)` where `t` is the sum of all section progresses. `is-active` is true when at least one section has started AND not all sections have completed.
- **SoleMD location**: not implemented.
- **Drift**: Any CSS that styles `.js-progress.is-active` (e.g., rail visible only while scrolling through the chapter, faded otherwise) will not fire on SoleMD. This is a visual-state hook for the entire rail root.
- **Severity**: Should-fix
- **Proposed fix**: In the `sync` callback, compute `const totalProgress = segments.reduce((a, p) => a + p, 0)` and `progressRootRef.current?.classList.toggle("is-active", totalProgress > 0 && totalProgress < beatIds.length)`. Consume the class in Tailwind via a `data-[is-active=true]` pattern or move to a `data-is-active` attribute if the codebase prefers data-attrs.
- **Verification**: Scroll above the first beat → `is-active` absent. Scroll through the middle beat → `is-active` present. Scroll past the last beat → `is-active` absent.

### D7. `activeSection` computation off

- **Maze reference**: scripts.pretty.js:50194–50197 — `activeSection = min(floor(Σ progresses) + 1, sections.length)`. Sum-of-progresses metric is monotonic and saturates cleanly at the last section.
- **SoleMD location**: `FieldStoryProgress.tsx:31–46` — `currentVisible` starts at 0 and is updated in-loop to `index + 1` whenever that segment's progress exceeds 0.01. Result: the last segment with any non-zero progress wins.
- **Drift**: Both converge on similar values mid-scroll but disagree at edges. Maze's `Σ > 0 && Σ < 1` reads as `activeSection = 1`; SoleMD's `progress > 0.01` reads as `currentVisible = 1` — these happen to agree here. But when Maze's `Σ = 2.3`, SoleMD may report a different index because SoleMD only looks at the last-nonzero rather than the integer part of the sum. More importantly, Maze uses `min(..., sections.length)` to cap at the count; SoleMD has no cap (`currentVisible` can never exceed `beatIds.length` because the loop bounds it, so this part is effectively equivalent).
- **Severity**: **Should-fix** (visible through `data-current-visible` CSS hooks)
- **Proposed fix**: Replace the running-update pattern with Maze's sum-and-floor: `const total = progresses.reduce((a, b) => a + b, 0); currentVisible = Math.min(Math.floor(total) + 1, beatIds.length);`. Before any scroll, this yields 1 (not 0 as SoleMD currently does). Decide whether the pre-scroll state should be 0 or 1 based on the visual contract for `data-current-visible="0"`.
- **Verification**: With segment progresses `[1, 0.5, 0]` (sum 1.5) the active section should be 2 (floor(1.5)+1). With `[1, 1, 0.3]` (sum 2.3) it should be 3.

### D8. Scroll-driver binding uses throttle layer rather than raw scroll

- **Maze reference**: scripts.pretty.js:50230–50232 — `bind()` attaches a direct `window.addEventListener("scroll", this.onScroll)`. Relies on GSAP's internal tween scheduling for smoothness; no hand-rolled throttle.
- **SoleMD location**: `FieldStoryProgress.tsx:57–68` — raw scroll/resize set a `pending` flag; a 20 Hz `fieldLoopClock.subscribe("story-progress", 50, …)` consumes the flag and calls `sync()`.
- **Drift**: Functionally defensible (batches writes), but the `fieldLoopClock` is a runtime-level shared tick that is not used by any Maze progress primitive. Combined with D3 (no GSAP smoothing) and D4 (no desktop gate), the result is a 20 Hz stepped rail rather than an interpolated one. If D3 is fixed via GSAP, the `fieldLoopClock` subscription becomes redundant and the pattern should revert to direct scroll handling.
- **Severity**: Nice-to-have (couples with D3)
- **Proposed fix**: Remove the `fieldLoopClock` subscription and the `pending` flag. Call `sync()` directly from the scroll listener; let GSAP (D3 fix) be the smoothing layer. This also removes a cross-module dependency from a DOM-layer progress component to the render-loop clock.
- **Verification**: Scroll once rapidly; confirm `sync()` runs once per scroll event (not at 20 Hz) and the GSAP tween handles interpolation.

## Sanctioned deviations encountered

1. **No `data-component` / component-registry activation.** SoleMD uses React props-driven mounting, not a DOM scan. Sanctioned by catalog § B7/B13 (SoleMD uses React component trees, not DOM-scan registries) and SKILL.md § "DOM And Component Equivalence Map" which maps Maze's `.s-progress` to "runtime-owned sticky progress component" without prescribing the activation mechanism. **Sanctioned: yes**, via catalog § B13 and the React architectural baseline.

2. **Class name / CSS token divergence.** Maze uses `.js-progress`, `.js-progress-bar`, `.js-progress-segment`, `.s-progress__segment`. SoleMD uses Tailwind utilities and a bespoke DOM shape. Sanctioned by SKILL.md § "Canonical Near-Clone Target": "It does not mean copying Maze class names". **Sanctioned: yes.** Note this does **not** extend to the runtime CSS custom property names (D2) — those are the programmatic contract, not brand class names.

3. **No standalone `Ei` base class.** SoleMD's progress is a function component, not an inheritor of a shared lifecycle base. Sanctioned by the broader "React component tree instead of class registry" direction; `FieldController` is the SoleMD equivalent of `yr` but not of `Ei`-derived DOM components. **Sanctioned: yes**, implicitly by the catalog-level architectural choice (no single SKILL.md section states this literally).

4. **Tailwind `hidden lg:flex` rather than `desktop-only` class.** Response-class naming differs. **Sanctioned: yes** (aesthetic layer, per SKILL.md § "SoleMD Aesthetic, Maze Motion"). But the *runtime* desktop gate (D4) is not sanctioned — only the class-name choice is.

None of these sanction the Must-fix items (D1 multi-instance, D2 CSS var contract). The SKILL.md specifically calls out "smooth scrubbed progression" as a Maze-motion rule SoleMD must preserve, which puts D3 (GSAP smoothing) and D5 (activation algorithm) under that contract.

## Open questions for build-spec synthesis

1. **Story-2 progress rail scope**: Should Story 2 use the exact same `FieldStoryProgress` component with a distinct `beatIds` array, or does Story 2 warrant a visually distinct variant (e.g., rail on the opposite side)? Recommend documenting in the build spec that "two structurally identical progress instances, one per story section" is the parity target — the visual design may diverge cosmetically but the runtime contract must be identical.

2. **CSS custom property namespace**: The current SoleMD var `--ambient-story-progress` suggests a broader field-aware naming intent. If the build spec adopts `--progress-N` (Maze contract) at the progress-root level, should segment-scoped vars also exist for CSS convenience? Recommend: write `--progress-N` at the root (parity) and optionally also scope per-segment for simpler child CSS, at the cost of a second write per tick.

3. **GSAP vs. CSS-transition smoothing**: Is GSAP ownership a hard requirement for the progress controller, or is a CSS `transition` acceptable? SKILL.md § "Keep GSAP in the choreography lane" says "GSAP should own: section progress, scrubbed transitions, pinning and chapter timing" — this weighs toward GSAP. Recommend the build spec endorse GSAP for parity with Maze's `a1.default.to()` call and remove the `fieldLoopClock` throttle in favor of direct-scroll + GSAP interpolation.

4. **Header node identity**: Maze uses `.js-header`. SoleMD's shell chrome does not expose an equivalent marker. Recommend the build spec name the canonical header ref SoleMD progress should measure — likely the top app chrome element used by `APP_CHROME_PX.panelTop` — so the D5 algorithm port has an unambiguous header source.

5. **`is-active` hook consumer**: Maze's `is-active` class hook exists for CSS styling (fade in/out the rail). SoleMD may prefer `data-is-active` for Tailwind arbitrary-selector convenience. Recommend the build spec specify the attribute vs. class choice once so the Story-2 instance doesn't diverge from Story-1.

6. **`--bar-width` consumer**: The variable exists to let CSS size sub-elements relative to the measured bar width. Without a clear SoleMD consumer, porting it is speculative. Recommend the build spec either specify the consuming selector (e.g., a segment divider that must span the bar's measured width) or treat `--bar-width` as a sanctioned omission.

## Scope discoveries (Phase 1 re-slicing signal)

Bucket scope is correct. Lines 50178–50255 are a single cohesive class. No cross-slice closure is cut; `Ei` is in B6 and `gg`'s registration in `xy` is in B13 — both are already named cross-bucket edges in the catalog. The HTML anchor count (2 instances at index.html:323 and 718) matches the catalog's explicit call-out.

One signal worth surfacing to the catalog: the Story-2 gap is not a B12 bug per se — it originates in B13 (component registry) + landing-page composition (`FieldLandingPage.tsx`). The fact that Maze's `Rg` scans all `[data-component]` nodes and SoleMD's React tree must explicitly mount each instance means the 2-instance contract **only surfaces when the landing-page JSX composes both stories symmetrically**. B13's audit (Agent 11) should cross-reference this finding.

## Format feedback for Phase 3

**Strengths of the pilot template carried forward**:
- Parity-overview table with "Ownership" column (adopted from the pilot auditor's format-feedback recommendation) — immediately distinguishes surface/runtime/shell concerns.
- Line-level Maze refs in every drift item made it fast to cross-reference during write-up.

**Recommendations for remaining Phase 3 agents**:
1. When a drift crosses bucket boundaries (as D1 does here, B12 + B13), explicitly flag it in the Scope-discoveries section so the catalog maintainer can add a cross-reference edge.
2. For custom property / dataset audits, include a dedicated "Contract count" sub-row so the build-spec author can immediately see `2 instances × 3 vars = 6 live writes per tick` (Maze) vs. `1 instance × 3 vars = 3 live writes per tick` (SoleMD).

## Format feedback for Phase 1

N/A — B12 did not surface any cartography inaccuracy. slice-07 § 7 correctly identified all 78 lines, the 2 DOM anchors, the `Ei` base dependency, and the CSS custom property write pattern. The derived `runtime-architecture-map.md § 4` note was accurate.
