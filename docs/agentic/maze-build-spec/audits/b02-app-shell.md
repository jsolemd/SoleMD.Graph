# Audit B2 — Page runtime shell / bootstrap (`by`)

**Auditor**: agent-4 (Phase 3)
**Priority**: P1
**Date**: 2026-04-19

## Summary

Maze's `by` bootstrap (scripts.pretty.js:55797–55953) is a single, page-global
class that owns the entire page-runtime lifecycle: it instantiates the scroll
controller (`Jr`), AJAX navigation layer (`Fs`), menu (`dg`), cookies (`lf`),
component registry (`Rg` via `ih.bind`), and the WebGL stage (`xi`); it gates
its first `onPageLoaded()` on a `Promise.all([setCurrentPage(), gfx.preload])`
so the stage animate-in and the render loop only run after asset preload
resolves; it chains `Jr.scrollToTop` + `Jr.scrollToCached` to restore scroll
position on both first-paint and AJAX swaps; and it binds DOMContentLoaded /
resize / orientationchange listeners that toggle global body classes
(`is-loaded`, `is-resizing`, `is-rendering`, `is-not-ready`, `local`, `debug`).

SoleMD has **no equivalent centralized bootstrap**. The responsibilities are
distributed across six loosely-coupled layers: (1) Next.js App Router (layout
+ RSC page) owns navigation, title, scroll restoration, and the initial HTML
shell; (2) `MantineProvider` + `DarkClassSync` (`app/providers.tsx`) owns
color-scheme; (3) the route dynamically imports `FieldLandingPage`
which is the actual "page class" for `/`; (4) inside the landing page,
`useShellVariant` + `ShellVariantProvider` own viewport/pointer detection;
(5) `useGraphWarmup` + `useGraphBundle` own preload; (6) `bindFieldControllers`
(scroll-driver) owns the blob scroll timeline. No single object orchestrates
these; they are composed via React effects that run when their dependencies
mount.

The AJAX/`Fs` subsystem is a **sanctioned deviation**: Next.js App Router is a
superset (client-side routing + RSC streaming + prefetch + scroll restoration)
and the lifecycle mapping is direct. The `af()` viewport-height exporter, the
body class vocabulary, and the preload-before-animate ordering are the three
concrete drifts that matter for parity. Five drift items total (1 Must-fix,
2 Should-fix, 2 Nice-to-have).

## Parity overview

| Behavior | Maze line | SoleMD location | Ownership | State |
|---|---|---|---|---|
| Top-level bootstrap entry (`window.load` → `new by().init()`) | 55954–55955 | `app/page.tsx` → `FieldLandingRoute` → `dynamic(FieldLandingPage, { ssr: false })` | page-global → route-local | sanctioned (superset) |
| AJAX navigation / `Fs` / `Dn.load()` (fetch + partial render) | 49983–50060, 50091 | Next.js App Router (`next/link`, `router.push`, RSC streaming) | router | sanctioned (superset) |
| `history.pushState` + `data-history="back\|replace"` overrides | 50063–50086 | Next.js router (`router.push`, `router.replace`, `router.back`) | router | sanctioned (superset) |
| Scroll restoration (`history.scrollRestoration = "manual"` + `scrollToCached`) | 49938–49942, 55845 | Next.js App Router default + `window.scrollTo` in landing page | router + surface-local | sanctioned (partial) — no cache |
| Page-class registry (`yy[n]`) + `[data-page]` scan | 55925–55951 | React component tree (`HomePage` RSC → `FieldLandingPage`); no DOM-scan registry | router-per-route | sanctioned (architectural) |
| Component registry wiring (`ih.bind` → `Fs.bind + Rg.bind + th.bind + Lg.init + dg.bind + Gs + zc.bind + Fg.bind`) | 55773–55784, 55945 | React component tree; chrome components imported directly (`GraphLoadingChrome`, `ViewportTocRail`, etc.) | surface-local | sanctioned (architectural) |
| Scroll controller mount (`this.scroll = new Jr()`; `Jr.start()`) | 55892, 55847 | `bindFieldControllers(...)` in `FieldLandingPage` useEffect (lines 126–146) | surface-local | sanctioned (pilot-audited, B10) |
| Stage mount (`this.gfx = new xi(.js-gfx)`; `gfx.init()`) | 55896–55897 | `<FieldCanvas>` rendered inside `FieldLandingShell` (line 253) | surface-local | drift (see D4) |
| Preload gate (`Promise.all([setCurrentPage(), gfx.preload]).then(onPageLoaded)`) | 55900–55907 | `useGraphWarmup` + `useGraphBundle` + `prewarmFieldPointSources`; independent effects | surface-local | drift (see D1) |
| Render-loop start gated on preload | via `onPageLoaded` → `gfx.animateIn` | `FieldCanvas` starts R3F loop on mount; BlobController attaches independently of bundle preload | surface-local | drift (see D1) |
| `af()` — `--app-height` viewport-height CSS var | 9238–9243; called 55807, 55808, 55888 | not implemented | — | drift (see D2) |
| Resize handler + debounce + `is-resizing` body class | 55800–55811, 55913–55918 | `useViewportSize` (Mantine hooks); no `is-resizing` body class | surface-local | drift (see D3) |
| Orientation change handler | 55920–55923 | covered by `useViewportSize` | surface-local | parity |
| DOMContentLoaded → `is-loaded` body class | 55910–55912 | not implemented | — | drift (see D3) |
| `is-rendering` / `is-not-ready` body class during page swaps | 55832, 55842 | not implemented | — | drift (see D3) |
| `local` + `debug` body class toggles | 55885–55886 | not implemented | — | nice-to-have |
| CustomEase `"custom"` registration (`0.5, 0, 0.1, 1`) | 55882, 55796 | `smooth` const imported from `@/lib/motion` (Framer Motion ease, not GSAP CustomEase) | surface-local | sanctioned (different motion stack) |
| DPR clamp (`us = Math.min(2, devicePixelRatio)`) | 55884 | R3F default DPR clamp in `<Canvas>`; not a global `us` | renderer | sanctioned |
| Lang attribute capture (`r2 = documentElement.lang`) | 55883 | not implemented (Next.js `layout.tsx` sets `lang="en"` statically) | layout | sanctioned |
| Touch / desktop detection (`Qo = A1()`, `yi = _y()`) | 55807, 55880–55881 | `useShellVariant` (`pointer: coarse`, `hover: hover`, width ≤ 960) | surface-local | parity (different implementation) |
| Menu mount (`this.menu = new dg(#menu)`) | 55894 | not implemented (no separate menu; chrome is inline) | surface-local | sanctioned (different chrome) |
| Cookies banner (`this.cookies = new lf(.js-cookies)`; `tryToShow` after onPageLoaded) | 55893, 55850 | not implemented | — | nice-to-have (see D5) |
| Analytics init (`Gs.init()` at 55895) | 55895 | not implemented in the shell; any analytics is per-route | — | sanctioned (scope) |
| Page animate-in (`currentPage.animateIn(0)`) | 55843 | Framer Motion per-section (`initial`/`whileInView`) in each landing section | surface-local | sanctioned (per-section vs per-page) |
| Page animate-out before swap (`currentPage.animateOut` + `gfx.animateOut`) | 55821–55823 | Next.js App Router view transitions / Framer `AnimatePresence` per-route | router | sanctioned (architectural) |
| AbortController per AJAX load | 49984–49986 | `fetch` in RSC; `use-graph-bundle` has its own abort flow | router + hook | sanctioned |
| Accordion binding on every `setCurrentPage` | 55948–55949 | no accordion primitive on landing; Mantine `Accordion` is self-binding | chrome | sanctioned |
| Hash navigation (inside `Jr`, not `by`) | 49300–49324 (B10) | not implemented — B10/pilot audit already flagged | surface-local | see B10 audit |
| `DOMParser.parseFromString` partial swap into `#content` / `.js-replace[id]` | 50041–50059 | RSC streaming + `<main>` client swap via router | router | sanctioned (superset) |
| Error/404 handling | not in `by` directly; server-delivered HTML handles it | Next.js `not-found.tsx` / `error.tsx` conventions | router | sanctioned (superset) |

## Drift items (C9 template)

### D1. Render loop and stage animate-in are not gated on asset preload

- **Maze reference**: scripts.pretty.js:55900–55907. The top-level
  `Promise.all([this.setCurrentPage(), this.gfx?.preload]).then(() => this.onPageLoaded())`
  only fires `onPageLoaded()` after both (a) the current page class has run
  its own `preload()` (image preloader `th.preload()`) and (b) the GFX
  stage's `preload` promise resolves (`ku.loadAll()` inside `xi` — B11).
  `onPageLoaded()` then calls `gfx.animateIn()` (55849) and
  `scroll.load()` / `Jr.start()`. Net effect: **the render loop and scroll
  bindings only begin once all preload work has resolved.**
- **SoleMD location**:
  - `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx:118–124` —
    `prewarmFieldPointSources({ ids: ["blob"] })` runs in an effect but
    does not gate anything downstream.
  - `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx:126–146` —
    `bindFieldControllers` runs as soon as `blobControllerReady` flips
    true (on controller attach inside `FieldScene`), **independent of asset
    prewarm promise state**.
  - `FieldCanvas` starts the R3F renderer on mount; there is no explicit
    `preload → startLoop` handshake.
  - `useGraphWarmup` is orthogonal (warms the `/graph` route's bundle, not the
    landing renderer).
- **Drift**: SoleMD does not have an explicit preload-gate. The blob controller
  may attach and start rendering frames before its point-source geometry is
  fully baked. In practice this works because `prewarmFieldPointSources`
  is synchronous-enough (procedural sphere, no network) — but future surfaces
  that add bitmap (`pcb`) or model-backed point sources (`World`, `Shield`,
  `Users`) will hit the regression: stage mounts, loop starts, then the
  geometry swaps in mid-frame.
- **Severity**: Must-fix (forward-looking blocker once pcb / model point
  sources land on additional surfaces)
- **Proposed fix**: Add an explicit preload promise at the field
  surface-adapter layer. Shape: `await prewarmFieldPointSources({ ids })`
  and `await controller.whenReady()` must both resolve before
  `bindFieldControllers` binds scroll and before the controller is
  given permission to drive the render loop. Expose a `scene animate-in`
  gate so the first frame written to the screen is the intended hero frame,
  not a half-baked geometry state. This belongs inside the
  `FixedStageManager` seam described in the field SKILL §"Default
  Architectural Shape" — do not inline it in a route component.
- **Verification**: Instrument `FieldCanvas` to log first-frame timestamp and
  `prewarmFieldPointSources` resolution timestamp; confirm the first
  frame is always ≥ prewarm resolution. Add a Jest test that simulates a slow
  bitmap point source and asserts the controller's `bindScroll` is not invoked
  until the prewarm promise resolves.

### D2. `af()` — `--app-height` CSS custom property is not exported

- **Maze reference**: scripts.pretty.js:9238–9243 (function `af`), called at
  55807 (onResize when `!Qo.touch`), 55808 (onResize override), and 55888
  (inside `by.init()`). Sets `document.documentElement.style.--app-height =
  ${window.innerHeight}px`. This is the canonical mobile-safe viewport-height
  primitive — prevents layout jumps when the mobile URL bar collapses /
  expands, and is used by fixed stage CSS to size the full-viewport canvas
  without triggering the `100vh` iOS bug.
- **SoleMD location**: not implemented. Grep for `--app-height` in
  `apps/web/features/field/` and `apps/web/app/globals.css` returns
  no matches. The field stage uses `fixed inset-0` (tailwind → `top:0;
  bottom:0; left:0; right:0`) which sidesteps `100vh` on the root stage but
  the landing sections themselves use `min-h-[128svh]` and `py-[12vh]` /
  `py-[14vh]` (`FieldLandingPage.tsx:366`) — `svh` solves the URL-bar
  collapse case for section heights, so this drift is partially sanctioned.
- **Drift**: SoleMD uses `svh` (small viewport height) units instead of
  re-exporting `--app-height`. `svh` is the modern equivalent and is already
  supported in all target browsers. **However**, if any future surface opts
  into Maze's exact `100 * var(--app-height, 1px)` idiom for custom scroll
  math (e.g., stream chapter carry windows), it will silently resolve to the
  CSS fallback.
- **Severity**: Should-fix (documentation drift; not a functional regression
  today, but a future footgun)
- **Proposed fix**: Either (a) document in the field SKILL that
  `svh`/`dvh`/`lvh` replace `--app-height` and explicitly forbid the Maze
  idiom going forward, or (b) add a shell-level `bindAppHeightVar()` utility
  that mirrors Maze's `af()` and export `--app-height` from the root layout
  for any surface that wants the Maze idiom. Prefer (a) — `svh` is the
  cleaner primitive.
- **Verification**: Either (a) add a rule to the SKILL and grep-lint for
  `--app-height` at review time; or (b) add the utility and confirm it fires
  on mount + resize + orientationchange.

### D3. No body-class vocabulary for lifecycle state

- **Maze reference**: scripts.pretty.js:55794–55795 (`a2 = "is-loaded"`, `F1 =
  "is-resizing"`), 55832 (`is-rendering` during page swap), 55842
  (`is-not-ready` removed on page ready), 55885–55886 (`local`, `debug`),
  55910–55912 (DOMContentLoaded → `is-loaded`), 55913–55918 (resize →
  `is-resizing` with `250ms` debounce). Additionally Maze's scroll driver (see
  pilot audit D2) adds `is-scrolled`, `is-scrolling-down`, `is-scrolled-vh`,
  etc.
- **SoleMD location**: not implemented. `apps/web/features/graph/components/shell/*`
  and `apps/web/features/field/surfaces/FieldLandingPage/*` do
  not toggle any body classes on lifecycle events. `useViewportSize` fires
  resize callbacks but does not debounce-write to `document.body.classList`.
- **Drift**: No CSS rule in SoleMD can target `body.is-loaded`, `body.is-resizing`,
  `body.is-rendering`. Maze's CSS uses these to (a) gate first-paint
  animations until the DOM is hydrated, (b) suppress pointer events during
  resize to prevent layout thrash, (c) cross-fade chrome during AJAX swaps.
  SoleMD relies on React state (`showLoading`, `canvasReady`) per-component;
  there is no global "the app is resizing" signal available to CSS.
- **Severity**: Should-fix (pair with scroll-driver pilot D2 — both need the
  same `shell-state.ts` utility)
- **Proposed fix**: Introduce `apps/web/app/shell/bind-shell-state-classes.ts`
  mounted once in `layout.tsx` (or in a root `"use client"` shell
  component). Exports a `bindShellStateClasses()` function that:
  1. adds `is-loaded` on `DOMContentLoaded` (or immediately if already past
     that event),
  2. adds `is-resizing` on resize + removes it after 250 ms debounce
     (match Maze's `o2 = 250`),
  3. reserves `is-rendering` / `is-not-ready` namespaces for router view
     transitions (could be wired to `useRouter`'s `navigate`/`transition`
     events in Next.js 16).
  Do not reimplement `local` or `debug` — those are Maze-specific dev
  affordances.
- **Verification**: Load the page and `document.body.classList.contains("is-loaded")`
  should be true after first paint. Resize the window and confirm
  `is-resizing` is added for ~250 ms then removed.

### D4. No named `.js-gfx` stage mount anchor

- **Maze reference**: scripts.pretty.js:55896
  (`this.gfx = new xi(document.querySelector(".js-gfx"))`). The stage
  runtime `xi` (B11) scans its root for `[data-gfx]` descendants to know
  which controllers to instantiate — the `.js-gfx` node is the canonical
  stage-root anchor, and the DOM scan is the bootstrap-side contract that
  wires controllers to anchors.
- **SoleMD location**: `apps/web/features/field/surfaces/FieldLandingPage/FieldLandingPage.tsx:253`
  (`<FieldCanvas className="fixed inset-0" .../>`). There is no class or
  id named `.js-gfx` anywhere in the tree; `FieldCanvas` is the stage-root
  but it is not discoverable via DOM query. The controller-per-anchor
  wiring happens in-JS via `bindFieldControllers` (line 137) which
  receives `anchors` by `root.querySelector("#section-story-1")` /
  `"#section-story-2"` — in other words, the controller-to-anchor binding
  is by section ID, not by a registry scan.
- **Drift**: SoleMD has not ported Maze's `jx` controller registry + DOM
  scan pattern (see B7 P0 bucket, owned by Agent 3). The landing page
  hard-codes `blob` and the two anchor IDs it uses. This is load-bearing
  for the stream and pcb controllers once they land — without a registry
  scan, every new controller requires editing the landing page's effect
  body.
- **Severity**: Should-fix (blocked on B7 agent's architectural
  recommendation — this audit flags it as a shell-side dependency so the
  build spec records the join)
- **Proposed fix**: Do **not** port Maze's literal DOM-scan pattern. Instead,
  per B7's recommended React component tree: introduce a
  `FieldSectionManifest[]` authored in `field-landing-content.ts`
  that enumerates `{ anchorId, controllerSlug, endAnchorId? }`. The shell
  iterates the manifest and calls `bindFieldControllers` once per
  entry. This keeps React as the ownership model while giving the build
  spec a single place to add a new chapter without editing the landing
  page's effect body.
- **Verification**: Add a test manifest with a stubbed `stream` entry;
  confirm `bindFieldControllers` is invoked with the stream anchors
  without modifying `FieldLandingPage.tsx`.

### D5. No cookies / consent banner on the landing page

- **Maze reference**: scripts.pretty.js:55893 (`this.cookies = new lf(...)`)
  and 55850 (`this.cookies.tryToShow()` called inside `onPageLoaded`).
  The cookies banner mounts as part of the bootstrap sequence, with
  visibility gated on prior consent state via `Hg`/`Vg` (get/set cookie
  helpers).
- **SoleMD location**: not implemented on the landing page.
- **Drift**: Visitors to the SoleMD landing page get no consent UI. This is
  a product/compliance decision, not a runtime regression — SoleMD.Graph
  is pre-launch and no analytics are firing that would require consent.
- **Severity**: Nice-to-have (tracks with product/legal sign-off, not
  engineering)
- **Proposed fix**: Defer until analytics/tracking is wired. When it
  lands, mount the banner once at `app/layout.tsx` (not per-route) and
  gate visibility on a `localStorage`-based consent flag. Do **not**
  duplicate Maze's `lf` class pattern — use Mantine's `Notification` or
  a lightweight consent library.
- **Verification**: N/A until analytics lands.

## Sanctioned deviations

1. **`Fs` AJAX page-swap is sanctioned not required.** Maze's
   `Fs`/`Dn` class (49840–50091) implements:
   - `fetch(path, { headers: { "X-Requested-With": "XMLHttpRequest" } })`
   - progress events via `Hl.PROGRESS`
   - `DOMParser.parseFromString` + selective swap of `#content` and
     `.js-replace[id]` nodes
   - `history.pushState` / `replaceState` with `data-history` overrides
   - `AbortController` per in-flight load
   - `setScrollRestoration("manual")` before every swap

   Next.js App Router is a **superset** of this contract:
   - `router.push` / `router.replace` / `router.back` map 1:1 to
     Maze's `Fs.goTo`/`Dn.back`/`data-history="replace"` overrides
   - RSC streaming + Suspense replaces `DOMParser` partial swap
   - `<Link>` prefetch replaces eager `fetch()` with `X-Requested-With`
   - Next.js owns `history.scrollRestoration` via its router config
   - React error boundaries + `error.tsx` / `not-found.tsx` replace
     Maze's implicit "server delivered HTML handles it" behavior
   - Abort is handled per-fetch inside RSC

   **Lifecycle mapping for the build spec:**
   | Maze step (`by` / `Fs`) | Next.js equivalent |
   |---|---|
   | `Fs.bindLinks` — intercept all `<a>` clicks | `<Link>` component (auto-prefetch + client-side nav) |
   | `Fs.load()` — fetch HTML | RSC render + streaming |
   | `Fs.render()` — swap `#content` | React reconciliation of route segments |
   | `by.onStateChange` — coordinate animateOut + load | `AnimatePresence` + Next.js `loading.tsx` + view transitions |
   | `by.render` — set title + unload scroll + setCurrentPage + onPageLoaded | `metadata.title` export + `useEffect` per-route + `router.events` hooks |
   | `by.setCurrentPage` — instantiate `yy[data-page]` | React renders the route segment's page component |
   | `Jr.scrollToCached` on page load | `experimental.scrollRestoration` or manual `window.scrollTo` |
   | `Fs.setActiveLinks` — update active nav classes | `usePathname` + conditional `aria-current` |

   Do not attempt to port `Fs` into SoleMD. The build spec should cite this
   table as the canonical translation.

2. **No `yy` page-class registry / no `[data-page]` DOM scan.** Maze
   reads `document.querySelector("[data-page]").dataset.page` and looks
   up a class in the `yy` registry (55934, 55941). SoleMD uses Next.js
   file-based routing: `app/page.tsx` → `app/graph/page.tsx` →
   `app/wiki/[slug]/page.tsx`. One route segment ⇒ one page component;
   no DOM attribute drives instantiation. Sanctioned: Next.js App Router
   is the page-class resolver.

3. **`ih.bind` component wiring is not a DOM-scan registry.** Maze's
   `ih.bind(e)` (55773–55784) calls `Fs.bind`, `Ig.bind` (slider / pager),
   `th.bind` (image preloader), `Lg.init` (lang / i18n), `Dg.bind`,
   `_a.bind`, `zc.bind`, `Fg.bind` (menu). SoleMD's equivalent is: (a)
   React component imports for `GraphLoadingChrome`, `ViewportTocRail`,
   etc., (b) Mantine primitives for form/slider components, (c)
   `next/image` for preload. Sanctioned: React component tree replaces
   the registry. The `Rg` component registry (B13) is the one that gets
   partial ownership via shell chrome components and is owned by that
   audit, not this one.

4. **GSAP `CustomEase("custom", "0.5, 0, 0.1, 1")` is not registered
   globally.** SoleMD uses Framer Motion as the primary motion layer with
   a `smooth` ease exported from `@/lib/motion`. GSAP is still used by
   `bindFieldControllers` for the scroll-driven blob timeline
   (B10), but the `CustomEase` primitive is local to that module's
   timeline construction. Sanctioned: different motion stack.

5. **No `Gs.init()` analytics bootstrap.** SoleMD does not have a global
   analytics call in the shell. Sanctioned: product scope.

6. **No `Qo.ie` IE branching.** Maze gates `Promise.all`
   initialization behind `!Qo.ie` (55898). SoleMD targets evergreen
   browsers per `package.json` browserslist / Next.js 16 requirements.
   Sanctioned: scope.

7. **No per-page `animateIn(0)` / `animateOut()` contract.** Maze's
   pages expose `animateIn(delay)` and `animateOut()` that the shell
   orchestrates during page swaps. SoleMD uses Framer Motion
   `AnimatePresence` + per-section `whileInView` triggers; entry and
   exit are component-local, not page-class-global. Sanctioned:
   architectural divergence, documented in field SKILL
   §"Canonical Authoring Contract".

8. **Desktop vs mobile detection differs.** Maze's `yi = _y()` + `Qo =
   A1()` produce a desktop/touch object used across every
   controller and adapter. SoleMD's `useShellVariant` uses `matchMedia("(pointer:
   coarse)")` + `matchMedia("(hover: hover)")` + viewport width ≤ 960.
   Sanctioned: equivalent information, different API shape; the SoleMD
   pattern is the SKILL-canonical path.

## Open questions

1. **Where should `bindShellStateClasses` (D3) mount?** Options: (a)
   inside `app/providers.tsx` alongside `DarkClassSync`, (b) a new
   `"use client"` component imported by `app/layout.tsx`, (c) inside the
   field surface adapter only. Recommend (b) so the body class
   vocabulary is available to every route (future wiki / learn / graph
   surfaces), not only the landing page. Flag for build-spec Phase 4
   decision.

2. **Should Next.js `experimental.scrollRestoration` be enabled
   globally, or should the landing page own a custom
   `scrollToCached`-equivalent?** Maze caches per `location.pathname`
   and restores on `onPageLoaded`. Next.js App Router as of 16 offers
   manual `scrollRestoration: "manual"` but no built-in per-route
   cache. If the product needs back-button scroll restore, add a
   `sessionStorage`-backed utility to `app/layout.tsx`. Recommend
   flagging this for build-spec Phase 4, not fixing here.

3. **Does the build spec want a `FixedStageManager` seam (D1, D4)?**
   The field SKILL §"Default Architectural Shape" describes it,
   but the current landing page skips the abstraction and binds
   anchors directly. A build-spec decision is needed on whether D1 and
   D4 fix the landing page imperatively (short-term) or introduce the
   seam (long-term, paired with B7 and B11 recommendations).

4. **Should the Next.js-side "page animate-in" contract be formalized?**
   Maze's `currentPage.animateIn(0)` is one guaranteed hook that fires
   once all preload resolves. SoleMD uses per-section `whileInView` which
   is fine for content but does not give the shell a single place to
   gate "first-paint readiness". If a future route needs a page-wide
   cross-fade on first-paint, the build spec should record whether to
   use `View Transitions API` (Next.js 16 native), Framer Motion
   `AnimatePresence`, or a bespoke shell-layer event.

5. **Should the landing preload promise (D1) be exposed to the warmup
   action?** `FieldGraphWarmupAction` already gates the
   "Open graph" button on `graphReady`. The stage preload is a separate
   concern — but both should probably feed into a single
   "shell ready" primitive. Defer the coupling decision to the
   build-spec.

## Return to B7 / B11 auditors

- **B7 (controller registry `jx`)**: D4 of this audit is conditional on
  B7's recommended port pattern. Please make the `FieldSectionManifest`
  shape concrete enough that the shell iteration is trivial — an
  `{ anchorId, controllerSlug, endAnchorId?, gfxPreset }` tuple would be
  enough for B2 to wire.

- **B11 (stage runtime `xi`)**: D1 of this audit depends on `xi`
  exposing an explicit `preload` promise (Maze line 55902:
  `this.gfx?.preload`). Please confirm in your audit whether
  `FieldCanvas` / `FieldScene` already exposes such a promise or whether
  it needs to be added to the stage runtime seam.

- **B10 (scroll controller `Jr`)**: D3 (body classes) overlaps with
  pilot-D2 (`is-scrolled`, `is-scrolling-down`, `is-scrolled-vh-*`).
  A single `bindShellStateClasses` utility should cover both; flag for
  Phase 4 consolidation.

- **B13 (component registry `Rg`)**: Maze's `ih.bind(e)` at
  55773–55784 includes `Rg.bind` (via a different symbol chain).
  Confirm `Rg`'s DOM scan vs the React tree mapping is documented in
  the B13 audit; this audit treats it as sanctioned.
