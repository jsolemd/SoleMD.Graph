# Slice pilot — scripts.pretty.js lines 49100–49600

**Cartographer**: pilot
**Slice**: [49100, 49600]
**Context scan**: [48900, 49800] (read-only for closure boundaries)
**Date**: 2026-04-19

## Summary

This slice contains the spine of the Maze homepage runtime: scroll adapter registry loader, the central scroll ownership controller (`jt` / `Jr`), concrete scene controller mappings, and the stage runtime that orchestrates WebGL rendering. The slice spans four major subsystems: data-scroll adapter loader (lines 49102–49191), scroll handler lifecycle (lines 49115–49325), controller instantiation registry (lines 49326–49357), and stage render loop initialization (lines 49359–49588). No cross-slice closures are cut; each section's IIFE or class definition is complete within the slice.

## Section inventory

| # | Section name | Lines | Purpose (1 sentence) | Key Maze symbols | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|
| 1 | `data-scroll` adapter registry (`$x`) | [49102, 49113] | Static map binding 10 named scroll adapters to their handler implementations. | `$x`, `KS`, `JS`, `QS`, `GS`, `WS`, `qS`, `jS`, `HS`, `VS` | none — adapter pattern exists only in Maze | small | Registry entries (`KS`, `JS`, etc.) defined in context-scan area; registry inserted into loader at 49189 |
| 2 | GSAP plugin registration | [49114, 49114] | One-line plugin bootstrap for ScrollTrigger and custom plugins. | `lg`, `cg`, `e1`, `t1` | none — plugin registration is build-time in SoleMD | trivial | Depends on GSAP instance `lg` imported earlier |
| 3 | Scroll controller class (`jt`) + static lifecycle | [49115, 49325] | Central scroll ownership: loads/unloads scroll triggers, manages hash navigation, caches scroll position, toggles body state on scroll events. | `jt`, `Jr`, `cg.ScrollTrigger`, `IntersectionObserver` | `apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts` | large | Constructor at 49116–49122 is clean; lifecycle methods (load/unload) at 49148–49165 tear down all scroll state; setup() at 49176–49231 is complex, orchestrating adapter loader, observer setup, and progress integration |
| 4 | Stream controller scaling override (`ug`) | [49326, 49346] | Specialized stream scene controller that inherits from base `yr` and overrides `updateScale()` for aspect-ratio-aware point sizing. | `ug`, `yr`, `yi.desktop` | `apps/web/features/ambient-field/controller/StreamController.ts` | small | Inherits from `yr` (base controller, outside slice); calls `Jr.scrollTo()` on debug parameter |
| 5 | Controller registry (`jx`) | [49347, 49357] | Static map from `[data-gfx]` scene slug names to controller class constructors. | `jx`, `yr`, `mm`, `gm`, `xm`, `ym`, `_m`, `bm`, `Sm`, `ug` | none — Maze's controller registry pattern (data-gfx mapping) has no SoleMD equivalent | small | Used by stage runtime at line 49553 to instantiate controllers |
| 6 | Background starfield renderer (`hg`) | [49359, 49425] | Optional procedural starfield that animates on scroll and responds to mouse movement, initialized if `?stars` query param is present. | `hg`, `Fl.getMaterial()`, `jo.generate()`, `xi.scene` | none — background starfield is ambient-field-specific feature | medium | Constructs itself in constructor; adds to `xi.scene` at 49406; depends on asset registry `jo` and material registry `Fl` |
| 7 | Stage runtime (`Os` / `xi`) | [49427, 49588] | Fixed WebGL stage that creates renderer, scene, camera, preloads assets via `ku.loadAll()`, scans DOM for `[data-gfx]` anchors, instantiates one controller per anchor using registry `jx`, and runs per-frame render loop with controller updates. | `Os`, `xi`, `Ei`, `ku`, `jx`, `cg.ScrollTrigger` | `apps/web/features/ambient-field/renderer/FieldScene.tsx` | large | Constructor at 49428–49462 sets up layout callbacks; init() at 49469–49474 chains preload promise; setup() at 49518–49541 creates WebGL renderer/scene/camera; storeItems() at 49546–49559 is the controller instantiation hot-path using `jx` registry and `ku.get(n).model` asset lookup; render() at 49573–49585 is the main RAF loop calling `loop()` and `updatePosition()`/`updateVisibility()` on each controller |

## Existing map overlap

| Section | Existing coverage | New info |
|---------|---------|----------|
| `$x` adapter registry | **chapter-selector-map.md § 2** ("The scroll adapter registry lives in scripts.pretty.js:49102–49112") | Adds mapping of all 10 adapters to their implementations (lines 49102–49113); clarifies that the registry is a static object literal, not a dynamic map. |
| GSAP plugin registration | **runtime-architecture-map.md § 0** mentions `cg.ScrollTrigger` ownership but not explicit registration line | Pinpoints line 49114 as the one-line registration point. |
| Scroll controller `jt` / `Jr` | **runtime-architecture-map.md § 0** ("Scroll ownership is `jt` / `Jr` in scripts.pretty.js:49115–49325") | Extends with full lifecycle breakdown: load/unload/setup split; adapter loader implementation at 49176–49191; IntersectionObserver dual use for general DOM and progress bar; scroll-state class toggling (is-scrolled, is-scrolling-down, is-scrolled-vh, is-scrolled-header-height); hash-click handler for scroll-to actions with offset/duration overrides. |
| Stream controller `ug` | **runtime-architecture-map.md § 7 "stream controller"** ("stream maps to ug via scripts.pretty.js:49347–49356") | Adds that `ug` is actually a subclass of `yr` (line 49326) and includes debug mode on `?stream` param that opens material GUI and auto-scrolls to stream anchor; overrides only `updateScale()` for aspect-ratio compensation. |
| Controller registry `jx` | **runtime-architecture-map.md § 7** ("controller registry in scripts.pretty.js:49347–49355") | Expands to list all 10 controller mappings and clarifies that `jx[n] || jx.default` means unmapped data-gfx values default to base controller `yr`. |
| Background starfield `hg` | **Not previously mapped** | New section. Starfield is optional, gated by `?stars` query param, not part of standard homepage flow. Builds procedural "stars" geometry via `jo.generate("stars")`; rotates on mouse movement via GSAP; z-position animates on scroll from -200 to +200. |
| Stage runtime `Os` / `xi` | **runtime-architecture-map.md § 1–2** ("stage runtime preloads... creates WebGL renderer... scans DOM... instantiates controllers... runs render loop") | Extends with constructor parameter parsing (dataset.options), detailed storeItems() hot-path showing asset registry lookup and controller class selection, and render loop detail (RAF → loop() → updatePosition/updateVisibility per item). Clarifies that preload is a Promise.all chain waiting on ku.loadAll() before resize/loop/bind execute. |

## Cross-slice closure boundary notes

**Opening boundaries (before line 49100):**
- `KS`, `JS`, `QS`, `GS`, `WS`, `qS`, `jS`, `HS`, `VS` (scroll adapter implementations) — all defined in context scan area (lines 48597–49100); registry at line 49102 merely references them.
- `lg` (GSAP module), `cg` (ScrollTrigger), `e1` (ScrollToPlugin), `t1` (custom plugin) — imported/defined outside slice.
- `yr` (base controller class) — defined outside slice; subclassed by `ug` at line 49326.
- `Ei` (stage base class) — extended by `Os` at line 49427; defined outside slice.
- `ku` (asset registry), `Fl` (material registry), `jo` (geometry generator) — singletons initialized outside slice; used by `hg` and `Os`.

**Closing boundaries (after line 49600):**
- No incomplete classes or IIFE closures straddle line 49600. The `_a` (analytics) class starts at line 49589 and continues past 49600 but is a separate subsystem unrelated to scroll/stage.

## Format feedback for Phase 1

This format works well for the pilot because the 500-line spine is genuinely clean: no cross-slice closures, clear subsystem boundaries, and existing maps already cover the high-level choreography—this cartography extends without repeating by pinpointing line numbers and adding registry details. **For Phase 1 fan-out, recommend:** (1) Strengthen the "Existing map overlap" column by linking to specific section numbers (e.g., "§ 2. Data-scroll Handler Registry") rather than just file names, so cartographers can jump directly to what's already known. (2) Add a "Difficulty" column detail: clarify whether "large" means >1,500 lines to understand OR large because of deep inheritance chains (e.g., `Os` extends `Ei` extends something further). The 7 Phase 1 cartographers will struggle with (a) deciding when to read context-scan lines vs. slice-only, so consider a rule like "read context-scan only if a slice-line symbol is undefined," and (b) controller/adapter naming—minified names like `GS`, `KS` make it tempting to skip linking back to the adapter-registry definitional pass. Suggest adding a "Name resolution" column: "Maps to: [implementation name]" for any registry entry so cartographers never have to guess.

