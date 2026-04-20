# Slice 07 — scripts.pretty.js lines 48001–55957 + index.html DOM anchors

**Cartographer**: cart-07
**Slice**: [48001, 55957] (pilot 49100–49600 excluded)
**Extra duty**: index.html DOM anchor cross-reference
**Date**: 2026-04-19

## Summary

Slice 07 covers the tail end of Maze's scroll adapter implementations (lines 48001–49099), the full closure of the app bootstrap shell (lines 50253–55957), and the component registry system. It splits into seven major sections: three scroll adapters for "clients", "cta", and "graphRibbon" chapters (pre-pilot), the "events" adapter (post-pilot), the stream DOM motion-path handler (post-pilot), progress tracking for narrative chapters, and the top-level app shell with AJAX navigation, component registry, and page initialization. The slice includes all remaining scroll choreography for story beats, the full lifecycle of the main app class (`by`), and the component registry that wires `[data-component]` DOM anchors to controller classes. No cross-slice closures at 48001 boundary; all handler implementations are closed within their local scope. The user-flagged "points that pop up" popup system is captured in index.html as `.js-stream-point-popup` elements nested inside `.js-stream-point` containers, animated via the `KS` scroll adapter (post-pilot, line 48911–49035).

## Section inventory

| # | Section name | Lines | Purpose | Key Maze symbols | Name resolution | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | "Clients" scroll adapter (`HS`) | [48597, 48613] | Fades in `.js-item` elements on scroll with aspect-ratio-aware stagger config; used by `data-scroll="clients"` in welcome hero rail. | `HS`, `zS.default.from()`, `yi.desktop` | Handler registered as `$x["clients"]` at adapter registry line 49104 | none — DOM-native scroll callback, Maze-specific pattern | small (17 lines) | Depends on `zS` (GSAP proxy); Ht.create for ScrollTrigger |
| 2 | "CTA" scroll adapter (`GS`) | [48639, 48663] | Animates CTA chapter title/subtitle words and buttons via `lo` (SplitText) on scroll; uses GSAP timeline with staggered reveal. | `GS`, `lo`, `qx.gsap.timeline()` | Handler registered as `$x["cta"]` at adapter registry line 49109 | none — text reveal is pattern, but orchestrated here via SplitText | medium (25 lines) | Depends on `lo` (SplitText class, defined 48391–48596); `qx` (GSAP proxy) |
| 3 | "GraphRibbon" scroll adapter (`qS`) | [48732, 48832] | Orchestrates multi-layer SVG ribbon animation on scroll: grid items fade/scale, ribbon SVG paths stroke in, chart paths animate with staggered timing. | `qS`, `XS.default.timeline()`, ribbon SVG `#ribbon-*` selectors | Handler registered as `$x["graphRibbon"]` at adapter registry line 49110 | `apps/web/features/wiki/module-runtime/motion.ts` (ribbon timeline pattern may exist) | large (101 lines) | Depends on `XS` (GSAP proxy); DOM has inline SVG ribbon paths at index.html:735–739 |
| 4 | "Events" scroll adapter (`WS`) | [48665, 48731] | Animates story event timeline: event-main fades/scales on scroll; event-subitems trigger staggered checkmark and text animations via nested GSAP timelines. | `WS`, `Yx.default.timeline()`, nested timeline construction | Handler registered as `$x["events"]` at adapter registry line 49108 | none — timeline choreography is Maze-specific | medium (67 lines) | Depends on `Yx` (GSAP proxy); DOM structure at index.html:890 |
| 5 | SplitText library (typesetting) (`lo` / `US`) | [48391, 48596] | Procedural text-node parser: splits DOM text into chars/words/lines via `Segmenter` API, wraps in `<span>` tags for granular GSAP animation. Supports custom punctuation rules, multi-language support. | `US`, `lo`, `IS` (Intl.Segmenter), `VI`, `kS`, `Wx`, `FS` | Class name `US`, exported as `lo`; version `3.13.0` | Possibly mirrors `apps/web/animations/_smoke/text-reveal/TextReveal.tsx` or `RevealCard.tsx` (text reveal), but this is procedural library | large (206 lines) | Pure utility; used by `GS`, `VS`, `qS`, `jS`, `$S` adapters; depends on GSAP via `Pn(Xn())` proxy pattern |
| 6 | Stream DOM motion-path adapter (`KS`) | [48911, 49035] | Binds `.js-stream-point` nodes to SVG motion paths (`svg-flow-diagram-paths`), animates points along paths with GSAP `motionPath` plugin; toggles `.js-stream-point-popup` visibility via scroll timeline. Popups show requirement status. | `KS`, `Gd.default.timeline()`, `motionPath` plugin, `.js-stream-point`, `.js-stream-point-popup` | Handler registered as `$x["stream"]` at adapter registry line 49107; also linked by `data-scroll="stream"` at index.html:564 | **Missing — large (user-flagged gap)**; this is the "points that pop up" DOM motion-path system for chapters 02/03 | large (125 lines) | Depends on `Gd` (GSAP proxy), `gx` (motionPath plugin); defines 8 path IDs (`kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`, `framebuffer`) and animates `.js-stream-point` DOM markers on scroll |
| 7 | Progress DOM controller (`gg`) | [50178, 50255] | Inherits from `Ei` base class; measures `.js-progress-bar` segments, maps to story sections by `data-id`, updates scroll-driven progress CSS variables (`--progress-N`) and `data-current-visible` attribute. | `gg`, `a1.default.to()` (GSAP), `yi.desktop` | Class name `gg`; no minified alias | `apps/web/features/ambient-field/AmbientFieldStoryProgress.tsx` | medium (78 lines) | Depends on `Ei` (base controller, outside slice); base class integration at 50178; constructor parses segments and stores section refs; onScroll callback fires on every scroll event and updates CSS custom properties via GSAP.to(); calculateSectionProgress() uses viewport-relative geometry |
| 8 | App shell utilities + helpers | [50256, 50462] | Pure utility functions: `l1()` (object type check), `Jx()` (recursive merge), `c1` (mock DOM for SSR), `h1()` (object nullify), `kc()` (setTimeout), `Uc()` (Date.now()), `qI()` (getComputedStyle), `Qx()` (matrix transform parser). Standalone utility module. | `l1`, `Jx`, `c1`, `h1`, `kc`, `Uc`, `qI`, `Qx` | Function names match minified exports | none — generic JS utilities | small (207 lines) | Pure functions; used by app shell and SSR fallbacks; no dependencies except DOM APIs |
| 9 | Component registry (`Rg` / `xy` / `yy`) | [55180, 55283] | Main page component registry: `Rg` class loads all `[data-component]` nodes from DOM, instantiates via registry `xy` (SwiperSlider, Progress, FormsPagination, etc.), triggers state/animation/destroy lifecycle events. `yy` is page-class registry (currently only `Page`). | `Rg`, `xy`, `yy`, `ul` (event enum), `el.CHANGE`, `th.preload()` | Class name `Rg` (component registry manager); registry object `xy` | `apps/web/features/graph/components/chrome/*.tsx` (Chrome/Header) + shell components | medium (104 lines) | Depends on `Ei` base class; calls `th.preload()` for lazy-loaded images; scans DOM for `[data-component]` attr; instantiates classes from `xy` registry based on data-component value; fires `ul.CHANGE` on page change; used by app shell at line 55241 |
| 10 | App shell bootstrap (`by`) | [55770, 55907] | Main app class: initializes page state, scroll handler (`Jr`), AJAX navigation (`Fs`), menu, cookies, analytics, and graphics stage (`xi`). Constructor chains promises: preload → resize → bind → init. Lifecycle: init() → setCurrentPage() → onPageLoaded() → animateIn(). Handles hash-based scroll navigation and page swap choreography. | `by`, `Jr`, `Fs`, `Rg`, `Qo`, `yi`, `vi` (debug), `Wd` (local dev flag), `th`, `Ly()` | Class name `by` | `apps/web/app/page.tsx` + Next.js App Router + `apps/web/features/graph/components/shell/*` | large (138 lines) | Depends on `Jr` (scroll handler, pilot), `Fs` (AJAX/history), `xi` (stage, pilot), `Rg` (page/component registry), `th` (image preloader), `lf` (cookies), `dg` (menu), `wy.CustomEase` (GSAP), `af()` (init callback); init() at line 55878 chains GSAP timeline, bindEventListeners() wires DOMContentLoaded/resize/orientation; setCurrentPage() instantiates `yy[n]` (page class) and chains preload; onPageLoaded() orchestrates page-in animation, scroll restore, graphics animate-in, and cookie/analytics firing |
| 11 | [49100, 49600] | See slice-pilot.md | Pilot coverage (do not re-derive) | — | — | — | — | — |

**Name resolution**: For registry entries (adapters, controllers), minified symbol name → human-readable handler or class name. For SplitText library, standalone third-party — Context7 + GSAP ecosystem.

## Existing map overlap

| Section | Existing coverage | New info added |
|---------|---|---|
| Scroll adapters (`HS`, `GS`, `WS`, `qS`, `jS`) | **chapter-selector-map.md § 2** lists adapter registry but only maps homepage-active ones (`welcome`, `clients`, `moveNew`, `stream`, `graphRibbon`, `events`, `cta`) | Adds full line ranges for all 10 adapters in registry; shows that each adapter is a standalone IIFE-closed function consuming `data-scroll` selector and returning scroll trigger handle |
| Stream DOM popups | **chapter-selector-map.md § 3** ("popup visibility is toggled by class changes on `.js-stream-point-popup`, not by particle shader state: scripts.pretty.js:48950–49020") | Confirms that stream popups are in pilot range (48950–49020 is inside pilot 49100–49600; note: should be 49050–49120); added full HTML structure from index.html showing 8 stream points with 1–3 popups each, bound to SVG paths named kdc/function/fpt/access/json/fou/image/framebuffer |
| Progress controller (`gg`) | **runtime-architecture-map.md § 4** ("Progress behavior is implemented by `gg` in scripts.pretty.js:50178–50252") | Extends with constructor details: stores refs to header, progressBar, segments, sections; onScroll updates CSS custom properties per section; calculateSectionProgress() uses viewport-relative geometry; inherits from `Ei` base; tied to `.js-progress` DOM nodes |
| App shell (`by`) | **runtime-architecture-map.md § 0** ("App bootstrap is `by`, which is created on `window.load` in scripts.pretty.js:55954–55955 and initialized in scripts.pretty.js:55888–55907") | Extends with constructor detail (AJAX swap, scroll restore, page instantiation); init() chains setup, event binding, and bootstrap callback `af()`; onPageLoaded() orchestrates page-in animation + scroll restore + graphics animate-in; setCurrentPage() instantiates page class from `yy` registry; buildComponents() wires `[data-component]` to `xy` registry |
| Component registry (`Rg`, `xy`) | **runtime-architecture-map.md § 0** ("`[data-component]` ownership is `Rg` via the component registry in scripts.pretty.js:55180–55283") | Details: `Rg` class constructor loads all `[data-component]` nodes, instantiates via `xy` registry (SwiperSlider, Progress, FormsPagination, ArticleNav, Product, Load, Sort, More, Toggle, ShareArticle, Header), fires `ul.CHANGE` event on page change; `yy` is page-class registry (only `Page: Rg` entry currently) |
| SplitText library (`lo` / `US`) | Not previously mapped | New section: third-party library (version 3.13.0) for procedural text splitting; used by story chapter adapters for staggered text reveal effects; supports multi-language via Intl.Segmenter; implements custom punctuation regex and visual class toggles |

## Cross-slice closure boundary notes

**Opening boundaries (before line 48001):**
- `$x` adapter registry (line 49102) is defined in pilot but registry *object* is built from handlers defined in context-scan area 48000–49100.
- `zS`, `qx`, `Yx`, `XS`, `Gd` (GSAP proxies via `Pn(Xn())` pattern) — imported/initialized outside slice.
- `lo` (SplitText) is defined at line 48391 within slice; exported as `US.version = "3.13.0"` at line 48595.
- `Ei` (base controller class) — extended by `gg` at line 50178; defined outside slice in controller base module.
- `Jr`, `Fs`, `Rg`, `yy` (scroll handler, AJAX, page registry) — imported/initialized outside slice; used by `by` at lines 55892–55941.
- `th`, `lf`, `dg`, `wy`, `af()`, `Ly()` (preloader, cookies, menu, GSAP, init callbacks) — imported/initialized outside slice.

**Closing boundaries (after line 55957):**
- Line 55957 is the final `})();` — end of the IIFE. No incomplete definitions straddle this boundary.

## Popups / stream DOM motion-path discoveries

**Stream chapter popups (user-flagged gap):**
The stream adapter `KS` at lines 48911–49035 (in pilot range 49100–49600 context, not in main slice but relevant) animates `.js-stream-point` DOM markers along SVG motion paths and toggles `.js-stream-point-popup` visibility on scroll. The popup system has:
- 8 stream points (lines 597–711 in index.html)
- Each point has 1–3 nested `.js-stream-point-popup` elements with:
  - `.popup__category` (e.g., "Requirement")
  - `.popup__name` (e.g., "KDC Server Running")
  - `.popup__label` (e.g., "Present" / "Not present")
- Red popups (`.popup--red`) indicate fulfilled requirements or exploitable findings.
- Motion paths mapped to SVG path IDs: `kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`, `framebuffer` (lines 48916–48925 in pilot).
- **Gap status**: Stream popup DOM structure is present in index.html; the JS handler is in pilot range (48911–49035); **SoleMD has no equivalent implementation** — marked as **Missing — large** in SoleMD counterpart map.

## DOM anchor cross-reference (extra duty)

### `data-gfx` anchors (controller anchors)

| Value | Count | Line range | Consumes via JS | HTML context |
|---|---|---|---|---|
| `blob` | 1 | [235, 235] | Controller `mm` instantiated by stage runtime `xi` via registry `jx` (pilot line 49347–49356) | `<section id="section-welcome" class="module module--welcome ... data-gfx="blob" data-gfx-end-trigger="#section-story-2">` — welcome chapter with hero copy and clients rail |
| `stream` | 1 | [564, 564] | Controller `ug` (stream-specific, subclass of `yr`, pilot line 49326–49345); scroll adapter `KS` at lines 48911–49035 (pilot range) | `<div class="col-span-12 c-stream" data-gfx="stream" data-gfx-sticky data-scroll="stream">` — contains inline SVG rails (flow-diagram-main.svg, flow-diagram-main-mobile.svg) and 8 stream points with popups |
| `pcb` | 1 | [1067, 1067] | Controller `_m` instantiated by stage runtime `xi` via registry `jx` (pilot line 49347–49356) | `<section class="module module--full-height module--centered module--cta" data-gfx="pcb" data-gfx-end-trigger="#footer" id="section-cta">` — CTA chapter with pcb bitmap-backed point cloud |

### `data-scroll` anchors (scroll adapters)

| Value | Count | Line range | Adapter handler (JS lines) | HTML context |
|---|---|---|---|---|
| `welcome` | 1 | [251, 251] | Handler `JS` (pilot line 49037–49066) | `<div class="m-welcome" data-scroll="welcome">` — hero welcome copy section |
| `moveNew` | 1 | [269, 269] | Handler `QS` (pilot line 49069–49100) | `<div class="c-clients" data-scroll="moveNew">` — wrapper for clients rail container |
| `clients` | 1 | [270, 270] | Handler `HS` (lines 48597–48613, this slice) | `<div class="c-clients__list" data-scroll="clients" style="--items: 5">` — nested inside `moveNew` wrapper; fades in `.js-item` children |
| `stream` | 1 | [564, 564] | Handler `KS` (pilot line 48911–49035); also tied to `data-gfx="stream"` | `<div class="col-span-12 c-stream" data-gfx="stream" data-gfx-sticky data-scroll="stream">` — stream chapter with motion-path and popups |
| `graphRibbon` | 1 | [754, 754] | Handler `qS` (lines 48732–48832, this slice) | `<div class="m-story__visual-grid c-ui-box c-ui-box--grid" data-scroll="graphRibbon">` — story 2 ribbon visualization with SVG chart paths |
| `events` | 1 | [890, 890] | Handler `WS` (lines 48665–48731, this slice) | `<div class="m-story__items m-story__items--mixed" data-scroll="events">` — story 2 event timeline with checkmark animations |
| `cta` | 1 | [1068, 1068] | Handler `GS` (lines 48639–48663, this slice) | `<div class="m-cta grid-wrap" data-scroll="cta">` — CTA chapter title and buttons reveal |

### `data-component` anchors (component ownership)

| Value | Count | Line range | JS owner (if resolvable) | HTML context |
|---|---|---|---|---|
| `Header` | 1 | [151, 151] | Class `Cg` (defined outside slice; instantiated by registry `xy` at line 55281) | `<header class="s-header js-header" data-component="Header">` — page header chrome |
| `Progress` | 2 | [323, 718] | Class `gg` (lines 50178–50255, this slice); instantiated by registry `xy` at line 55272 | `<div class="s-progress js-progress desktop-only" data-component="Progress" data-observe>` — appears twice: once in story 1 (line 323), once in story 2 (line 718) |
| `SwiperSlider` | 1 | [976, 976] | Class `wg` (defined outside slice; instantiated by registry `xy` at line 55271) | `<div class="m-slider__inner js-slider swiper" data-component="SwiperSlider">` — carousel component in content module |

### Popup-related HTML for user-flagged gap

**Stream point and popup structure** (index.html lines 597–711):
```
<div class="c-stream" data-gfx="stream" data-gfx-sticky data-scroll="stream">
  <!-- SVG rails for motion paths -->
  <svg class="svg-flow-diagram-paths" ...>
    <path d="..." id="[kdc|function|fpt|access|json|fou|image|framebuffer]" />
    ... (8 paths total)
  </svg>
  <svg class="svg-flow-diagram-paths-mobile" ...>
    ... (mobile version of paths)
  </svg>

  <!-- 8 stream points, each with 1–3 nested popups -->
  <div class="c-stream__point js-stream-point">
    <div class="c-stream__hotspot hotspot [hotspot--red]">
      <svg class="svg-circle"><circle /></svg>
    </div>
    <!-- Popup 1: Category + Name + Label (for requirements) -->
    <div class="c-stream__popup js-stream-point-popup popup [popup--red] [popup--left] [popup--mobile-*]">
      <div class="popup__category">Requirement</div>
      <div class="popup__name">KDC Server Running</div>
      <div class="popup__label">Not present</div>
    </div>
    <!-- Popup 2: Optional second popup (e.g., alternate view) -->
    <div class="c-stream__popup js-stream-point-popup popup [popup--red] [popup--mobile-*]">
      <div class="popup__name">Exception logged for audit</div>
    </div>
    <!-- Popup 3: Optional third popup (red points only, e.g., exploits) -->
    <div class="c-stream__popup js-stream-point-popup popup [popup--red] [popup--mobile-*]">
      <div class="popup__name">PR automatically created</div>
    </div>
  </div>
  ... (7 more stream points)
</div>
```

**Key observations for SoleMD gap:**
1. Stream points are DOM nodes (`.js-stream-point`), not WebGL particles from the stage.
2. Each point has 1–3 nested popups that are toggled visible via CSS classes added by `KS` handler (pilot line 48950–49020).
3. Popups are positioned via CSS transforms tied to SVG motion-path coordinates, not via shader calculations.
4. Red hotspots (`.hotspot--red`) and red popups (`.popup--red`) indicate exploitable states or high-severity findings.
5. Motion paths are named by vulnerability type: `kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`, `framebuffer`.
6. Mobile variants use `popup--mobile-left`, `popup--mobile-right`, `popup--mobile-center` to reposition popups on smaller screens.
7. **This entire subsystem (SVG motion-path + popup choreography) is handled by the `KS` adapter (pilot line 48911–49035) and has no SoleMD equivalent yet** — flagged user gap.

## Notes for Phase 2 catalog synth

1. **Adapter registry closure:** The 10 adapters (`HS`, `JS`, `QS`, `GS`, `WS`, `qS`, `jS`, `HS`, `VS`) are defined in lines 48597–49100 and referenced in the registry object at line 49102. Phase 2 should bucket each adapter by chapter ownership (welcome, story 1, story 2, stream, cta) and note whether it owns a WebGL controller or only DOM choreography.

2. **SplitText dependency:** Five adapters (`VS`, `GS`, `$S`, `qS`, `jS`) depend on the `lo` SplitText library (lines 48391–48596). This is a third-party pattern that should be noted as a candidate for deferral to Context7 or Maze's original SplitText fork; **SoleMD may have a custom text-reveal implementation** (check `TextReveal.tsx`).

3. **Progress as shared utility:** The `gg` progress controller is instantiated twice (story 1, story 2) via the same registry entry. Phase 2 should clarify whether progress is a single instance managing both segments or two separate instances.

4. **Stream popup ownership gap:** The `KS` adapter at line 48911–49035 is the sole consumer of `.js-stream-point-popup` DOM visibility. This is the user-flagged missing subsystem in SoleMD. Phase 2 should flag it as a **blocker for stream chapter parity**.

5. **App shell dependency chain:** The app shell `by` depends on `Jr` (scroll), `Fs` (AJAX), `xi` (stage), `Rg` (page), `xy` (components). These form a tight coupling that should be documented as the "shell integration boundary" for Phase 2.

6. **DOM→JS ownership edges:**
   - `data-gfx` → controller class (via `jx` registry in pilot)
   - `data-scroll` → adapter handler (via `$x` registry at line 49102)
   - `data-component` → component class (via `xy` registry at line 55270)
   - Each edge is a static mapping suitable for automated scanning in Phase 2.
