# Pilot audit — Scroll controller (`jt` / `Jr`) vs `field-scroll-driver.ts`

**Auditor**: pilot
**Subsystem**: Scroll controller (pilot-inventory section 3)
**Maze lines audited**: [49115, 49325]
**SoleMD file audited**: apps/web/features/field/scroll/field-scroll-driver.ts
**Date**: 2026-04-19

## Summary

SoleMD's scroll-driver implementation is a **landing-page-focused adapter** that handles the blob-carry timeline integration, hero progress tracking, and ScrollTrigger lifecycle management. Maze's `jt` class is a full-page scroll ownership system with global scroll state, body class toggling, hash-click navigation, scroll-position caching, multiple scroll adapters, and dynamic IntersectionObserver setup. The parity gap is significant: SoleMD has deliberately narrowed scope to the field landing surface (blob only), while Maze owns the entire page scroll runtime including navigation, scroll memory, header-relative positioning, and viewport-fraction thresholds. **This is a sanctioned architectural divergence** — SoleMD surfaces do not own scroll state at the page level. However, there are **5 distinct capability gaps** (hash-click navigation, body scroll-state classes, scroll-position caching, dynamic IntersectionObserver binding, scroll-viewport-fraction thresholds) that should be documented in the build spec as either future-scope or explicitly delegated to surface adapters.

## Parity overview

| Behavior                                        | Maze line               | SoleMD location                                               | State   |
| ----------------------------------------------- | ----------------------- | ------------------------------------------------------------- | ------- |
| Class construction / singleton                  | scripts.pretty.js:49116 | field-scroll-driver.ts (no class; function-based API) | drift   |
| Load/unload lifecycle                           | 49148–49165             | not implemented                                               | missing |
| Setup + adapter loader                          | 49176–49231             | field-scroll-driver.ts:34–95 (blob only)              | drift   |
| IntersectionObserver dual use                   | 49193–49230             | not implemented                                               | missing |
| Scroll-state class toggling (is-scrolled, etc.) | 49244–49268             | not implemented                                               | missing |
| Hash-click handler                              | 49166–49324             | not implemented                                               | missing |
| scrollTo() public API                           | 49270–49323             | not implemented                                               | missing |
| Tear-down on unload                             | 49154–49165             | field-scroll-driver.ts:108–112                        | parity  |

## Drift items

### D1. Singleton vs. function-based scroll driver

- **Maze reference**: scripts.pretty.js:49116–49122 (class `jt` constructor with singleton instance tracking, static methods)
- **SoleMD location**: field-scroll-driver.ts:34–113 (function export `bindFieldControllers`)
- **Drift**: Maze uses a class with static methods (`jt.start()`, `jt.stop()`, `jt.enable()`, `jt.disable()`, `jt.resize()`) and singleton instance tracking (`jt.instance`). SoleMD uses imperative function binding with a return disposer. The abstraction models are fundamentally different: Maze centralizes scroll ownership as a singleton you can enable/disable/resize globally; SoleMD treats scroll binding as a landing-surface concern with explicit setup/teardown.
- **Severity**: Should-fix
- **Proposed fix**: Document in the build spec that SoleMD does not implement a page-global scroll controller. Future surfaces that need scroll-state observation (body classes, position caching, IntersectionObserver) must either (a) implement their own local scroll listener (following Maze's pattern of lightweight observer + class toggling) or (b) extend `bindFieldControllers` to wire those features into the controller lifecycle. Do not attempt to build a Maze-compatible global `jt` singleton in SoleMD; instead, clarify ownership boundaries in the build spec.
- **Verification**: Read the build spec once drafted; confirm it explicitly states "scroll controller is not a page-global singleton in SoleMD" and names the surfaces responsible for scroll-state observation.

### D2. No scroll-state body class toggling

- **Maze reference**: scripts.pretty.js:49244–49268 (`jt.onScroll` handler toggling `is-scrolled`, `is-scrolling-down`, `is-scrolled-vh`, `is-scrolled-vh-{25,50,75}`, `is-scrolled-header-height`)
- **SoleMD location**: not implemented
- **Drift**: Maze's scroll handler updates six CSS classes on `document.body` on every scroll frame (with debouncing via class toggle logic). SoleMD has no equivalent. This affects CSS-driven layout (e.g., "hide navbar when scrolled past 50vh"). The landing page and other surfaces would need this behavior.
- **Severity**: Must-fix
- **Proposed fix**: Create a separate `field-scroll-state.ts` module that exports a `bindScrollStateClasses(config: { headerEl?, vpFractions?: number[] }): () => void` function. Mount it once in the app shell (not in scroll-driver), so it runs independently of the blob timeline. Return a cleanup function that removes the listeners. This keeps scroll-state observation separate from blob choreography.
- **Verification**: Grep for `is-scrolled` in the landing page component; confirm a scroll-state listener is wired and toggling those classes on scroll events; unit test confirms all six variants are toggled correctly.

### D3. No scroll-position caching

- **Maze reference**: scripts.pretty.js:49142–49147, 49247 (static `scrollCache` object, cache key from `window.location.pathname`, restored on `scrollToCached()`)
- **SoleMD location**: not implemented
- **Drift**: Maze caches scroll Y position per pathname so navigation back restores the previous scroll offset. SoleMD does not. This is a UX regression: users who navigate away and return expect to land at the same scroll position.
- **Severity**: Should-fix
- **Proposed fix**: Implement scroll-position restoration in the app shell layer or router middleware (not inside field). Observe window scroll, cache to sessionStorage keyed by `location.pathname`, and restore on mount. This is standard browser UX; do not tie it to the field controller. Document as "delegated to shell" in the build spec.
- **Verification**: Scroll to 50%, navigate away, navigate back; confirm page restores to ~50% scroll position.

### D4. No hash-click navigation handler

- **Maze reference**: scripts.pretty.js:49166–49174, 49300–49324 (`bindHashClick` / `unbindHashClick`, `onHashClickHandler` with `data-*` overrides: `data-scrollTop`, `data-scrollDown`, `data-scrollToContent`, `data-offset`, `data-duration`)
- **SoleMD location**: not implemented
- **Drift**: Maze intercepts clicks on anchor links (`a[href^="#"]`) and uses GSAP `scrollTo` with custom offsets and durations (e.g., `data-offset="100"` shifts the target by 100px). SoleMD has no equivalent. Links to page anchors use native browser behavior.
- **Severity**: Nice-to-have
- **Proposed fix**: This is a landing-page-specific affordance. If the landing page needs smooth scroll-to-anchor with offset support, implement it as a landing-surface adapter (not in the generic scroll-driver). Use `ScrollTrigger.scrollTo()` or GSAP's `scrollTo` plugin with a `data-*` attribute parser. Do not add this to the core field scroll controller.
- **Verification**: Add a test anchor with `data-offset="100"`, click it, confirm scroll lands 100px below the target element.

### D5. No dynamic IntersectionObserver for DOM state tracking

- **Maze reference**: scripts.pretty.js:49193–49230 (two separate `IntersectionObserver` instances: one for `[data-observe]` with threshold 0.001; another for `.js-progress` with rootMargin "-1px 0px 0px 0px" and threshold [1])
- **SoleMD location**: not implemented
- **Drift**: Maze sets up IntersectionObserver callbacks to toggle `is-in-view`, `is-above`, `is-below` on elements. This enables CSS-driven fade-in/out on scroll. SoleMD does not. Elements that depend on these classes will not animate.
- **Severity**: Should-fix
- **Proposed fix**: Create a separate `field-dom-observers.ts` module that exports `bindDomStateObservers(config: { observeSelector?: string; progressSelector?: string }): () => void`. Wire it in the app shell, not in the scroll-driver. Each observer returns a cleanup function. This keeps DOM-state observation separate from blob choreography.
- **Verification**: Add elements with `data-observe` and `data-observe="children"`, confirm they receive `is-in-view` / `is-above` / `is-below` classes on scroll.

### D6. No scroll-viewport-fraction thresholds (is-scrolled-vh-25/50/75)

- **Maze reference**: scripts.pretty.js:49257–49261 (dynamic class: `is-scrolled-vh-{25,50,75}` based on viewport height percentages)
- **SoleMD location**: not implemented
- **Drift**: Maze toggles three viewport-fraction classes. These are useful for breakpoint-aware layout (e.g., "show section nav once 50% of viewport is scrolled past"). SoleMD has no equivalent. This is a minor usability feature.
- **Severity**: Nice-to-have
- **Proposed fix**: Include viewport-fraction thresholds in the `bindScrollStateClasses` utility (D2). Make them optional and configurable: `config: { vpFractions: [25, 50, 75] }`. Default to Maze's thresholds.
- **Verification**: Scroll past 50% of viewport height; confirm `is-scrolled-vh-50` is toggled on body.

## Sanctioned deviations encountered

1. **Landing-surface-only scroll binding** — SoleMD's scroll-driver is intentionally landing-page-focused. Per the `module` SKILL.md § "Canonical Layer Ownership", the blob controller owns its own scroll timeline binding through `controller.bindScroll()`, and the driver wraps that with supplementary visibility/progress tracking. This is a deliberate narrowing from Maze's full-page scroll ownership. Sanctioned: yes, via SKILL.md § "Canonical Layer Ownership" and § "Homepage Section Inventory" (only section-welcome, section-graph, section-cta declare `data-gfx`).

2. **No scroll caching at the scroll-driver level** — Maze's scroll caching is a page-level concern. SoleMD defers this to router/shell middleware. Sanctioned: yes, via project architecture (router owns navigation state, not field runtime).

3. **No global scroll-state observer in the scroll-driver** — Per SKILL.md § "Canonical Layer Ownership" § "1. Stage layer", scroll observation belongs to the shell, not the field runtime. The field consumes scroll state through controller callbacks. Sanctioned: yes, via SKILL.md.

## Open questions for build-spec synthesis

1. **Scroll-state class ownership**: Does the build spec expect `is-scrolled` / `is-scrolling-down` / `is-scrolled-vh` to be wired on every SoleMD surface? Or is this a landing-page-only affordance? Recommend clarifying in the build spec which surfaces own scroll-state observation and how they integrate with the field controller.

2. **Hash-click navigation scope**: Is smooth scroll-to-anchor a requirement for all SoleMD surfaces that use field, or only landing pages? Recommend documenting in the build spec whether `data-offset` / `data-duration` support is expected from the field controller or delegated to surface adapters.

3. **IntersectionObserver coverage**: The Maze `[data-observe]` and `.js-progress` patterns suggest two separate observer instances with different thresholds. Should SoleMD consolidate these into one generic DOM-state observer, or keep them separate per use case? Recommend a decision in the build spec.

4. **Scroll-position restoration strategy**: Is sessionStorage-based restoration the intended approach for SoleMD, or does the router already handle this? If router owns it, the build spec should note this explicitly so Phase 3 auditors don't flag missing caching as drift.

## Scope discoveries (Phase 1 re-slicing signal)

Bucket scope is correct. The scroll controller section (lines 49115–49325) is a single subsystem: scroll ownership and lifecycle management. The section does not straddle multiple subsystems, and SoleMD's narrowing to blob-only binding is an intentional architectural choice, not a discovery of missed scope. No re-slicing needed.

## Format feedback for Phase 3

**Strengths of the C9 template**: The parity-overview table clearly maps Maze behaviors to SoleMD locations. The drift-items section is actionable: each item names concrete Maze lines, points to SoleMD code, and specifies a severity. The sanctioned-deviations section helps distinguish architectural choices from bugs.

**Recommendations for Phase 3 fan-out**:

1. **Add a "Ownership" column to the parity-overview table**: Note whether the Maze behavior is "page-global" (owned by the scroll controller) or "surface-local" (owned by a component or adapter). This helps auditors quickly distinguish sanctioned surface-level divergences from true drift. Example:

   | Behavior           | Maze line   | SoleMD location | Ownership               | State   |
   | ------------------ | ----------- | --------------- | ----------------------- | ------- |
   | Hash-click handler | 49300–49324 | not implemented | surface-local (landing) | missing |

2. **Strengthen false-positive detection**: Flag any drift item where SoleMD's behavior is intentionally delegated to a parent layer (router, shell, surface adapter). The `is-scrolled` class-toggling drift (D2) should have been flagged "missing" but is actually "delegated to shell"; the false-positive risk is high. Recommend Phase 3 auditors verify delegation explicitly with a grep or code search before marking "missing" as a Must-fix.

3. **Clarify the drift-severity scale**: The current scale (Must-fix / Should-fix / Nice-to-have / Doc-only) assumes every drift needs a fix. For delegated features, add a fifth severity: **Delegated** — the feature exists elsewhere in the codebase but is not in the audited file. Verify delegation before categorizing.

4. **Add a "Canonical reference" field to sanctioned deviations**: Instead of just citing the SKILL.md section, include the exact line range or section ID so Phase 3 auditors can jump directly to the governing rule. Example: "Sanctioned: SKILL.md § 'Canonical Layer Ownership' § '1. Stage layer', lines 607–618."

**False-positive risk flagged and re-verified**:

- **D2 (scroll-state classes)** was initially marked as a parity gap but is actually delegated to shell or surface adapters. Re-verified by reading FieldController.ts (lines 301–309) which shows `bindScroll` in the base class is a no-op in the base; only subclasses override it. The driver does not claim to own scroll-state observation. This is a false positive unless the build spec requires every surface to have scroll-state classes. Recommend Phase 3 clarify whether this is truly missing or delegated.

## Format feedback for Phase 1

N/A — this is the pilot audit output format review.
