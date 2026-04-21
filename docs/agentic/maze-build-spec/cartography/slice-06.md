# Slice 06 — scripts.pretty.js lines 40001–48000

**Cartographer**: cart-06
**Slice**: [40001, 48000]
**Date**: 2026-04-19

## Summary

This slice spans the core visual and scroll-control infrastructure of Maze: FBX model parsing (lines 40001–42132), the scene parameter registry and material/geometry pipelines (lines 42133–42893), the asset registry and point-source conversion library (lines 42666–42940), the base controller abstraction and five concrete controller subclasses for blob/stream/pcb/hotspot scenes (lines 43013–43698), bundled GSAP utilities including the paths plugin library for SVG motion-path interpolation (lines 43699–47859), ScrollTrigger event handler machinery (lines 47860–48595), and the opening four scroll adapters for DOM choreography (lines 48597–48664, extending beyond slice boundary). The slice contains **no incomplete class definitions or IIFE closures cut at boundaries**; each major section is self-contained except the scroll adapter definitions which continue into cart-07's range.

## Section inventory

| # | Section name | Lines | Purpose | Key Maze symbols | Name resolution | SoleMD counterpart | Difficulty | Cross-slice deps |
|---|---|---|---|---|---|---|---|---|
| 1 | FBX model parser (class `as`) | [40001, 42132] | Parses FBX binary format, extracts geometry, materials, animations, and texture references; used as base for model loading infrastructure. | `as` (extends BufferGeometry), `Mn` (scene graph), `hr` (connections index), `FBXLoader` | FBXLoader (three.js built-in, minified) | none — third-party FBX parsing | large (lines) | Depends on three.js types outside slice; feeds models to `jo.fromVertices()` |
| 2 | Sprite-map bitmap source class (`fm`) | [42133, 42343] | Extends FBX parser to support sprite sheet extraction; generates point clouds from bitmap images by sampling pixels. | `fm` (class extends `as`), `Bn` (color space enum), `xt` (Color3 constructor) | Bitmap-to-sprite converter | none — bitmap geometry generation is Maze-specific | medium (lines) | Inherits from `as`; used by asset registry to convert logo.png, pcb.png |
| 3 | FBX texture loader (`md`) | [42344, 42398] | Parses FBX texture references, resolves texture paths, handles blob URLs and data URIs for embedded textures. | `md` (class `r`), `Mn.Objects.Texture`, `TextureLoader` | FBX texture path resolver | none | small (lines) | Integrates with FBXLoader; feeds texture data to material system |
| 4 | Scene parameter registry (`cs`) | [42399, 42544] | Static config object mapping scene slugs (blob, stream, pcb, hex, shield, cubes, sphere, blobProduct, users, logo, default) to parameter presets: scale factors, rotation, amplitude, depth, randomness, entry/exit factors. | `cs` (object literal with 12+ scene configs) | Defined as `cs = { blob: {...}, stream: {...}, pcb: {...}, ...default: {...} }` | `apps/web/features/field/scene/visual-presets.ts` | small (lines) | Used by base controller `yr` constructor at line 43041 to set `this.params` |
| 5 | Shader material factory (`gd`) | [42545, 42632] | Static material registry creating WebGL uniforms for particle shader; custom extensions for stream scene (funnel, width); caches materials by scene slug. | `gd` (class with static methods), `THREE.ShaderMaterial`, `Fl.getMaterial()` as alias | Material factory with `getMaterial(type, scene)` | `apps/web/features/field/renderer/field-shaders.ts` | medium (lines) | Creates base particle shader; extended by stream at lines 42583–42593 |
| 6 | Asset registry alias | [42633, 42633] | One-line alias: `var Fl = gd;` exposes material registry as canonical name. | `Fl` | Alias to `gd` | none (internal naming) | trivial (lines) | Entry point for material lookups |
| 7 | Point-source geometry generator (`jo`) | [42666, 42940] | Class with static methods for converting models/bitmaps/procedural sources into point clouds with enriched particle attributes (aStreamFreq, aSelection, aMove, aSpeed, aRandomness). Methods: `fromVertices()`, `fromTexture()`, `generate()`, `addParams()`. | `jo` (class with 4 static methods), `jo.fromVertices()`, `jo.fromTexture()`, `jo.generate()`, `jo.addParams()` | Geometry-to-points conversion factory | `apps/web/features/field/asset/point-source-registry.ts` | large (lines) | Core asset pipeline; used by blob/stream/pcb controllers and asset registry `vd` |
| 8 | Asset registry (`vd`) | [42941, 43012] | Static map of point-source assets (bitmap: logo, pcb; models: Shield, Cubes, Net, World, Users; procedural: stars). Stores model/texture paths and metadata. | `vd` (object literal), `jo.fromVertices()`, `jo.fromTexture()`, `jo.generate()` | Asset registry with entries like `vd = { logo: {...}, pcb: {...}, ... }` | `apps/web/features/field/asset/point-source-registry.ts` | small (lines) | Used by `ku` (asset loader at line 42941-43009) and controllers for asset lookup |
| 9 | Base controller class (`yr`) | [43013, 43256] | Abstract controller for DOM-anchored WebGL scenes; owns view ref, model, material, params, visibility lifecycle, scale/position updates, hotspot projection, scroll binding, animate-in/-out transitions, DAT.GUI debug UI. | `yr` (class constructor 43013, methods 43020–43256), `this.view` (DOM anchor), `this.slug` (scene name), `this.params` (from `cs`), `this.material` | Base controller with full lifecycle | `apps/web/features/field/controller/FieldController.ts` | large (inheritance) | Subclassed by 6 concrete controllers; uses `Pr()` (Three.js Object3D wrapper), `Gs.addModel/addMaterial()` (DAT.GUI) |
| 10 | Blob/hotspot controller (`mm`) | [43257, 43526] | Extends `yr` for welcome chapter; adds hotspot pool, scroll choreography labels (stats, hotspots, diagram, shrink, quickly, respond, end), hotspot projection to screen, visibility toggling via DOM class changes. | `mm` (class extends `yr`), hotspot labels at lines 43291–43414, hotspot pool at lines 43421–43458, projection loop at lines 43501–43524 | Blob controller | `apps/web/features/field/controller/BlobController.ts` | large (inheritance) | Inherits full `yr` lifecycle; listens to scroll events via parent's `Jr.scrollTo()` |
| 11 | Empty stream controller stub (`gm`) | [43527, 43528] | Placeholder controller class with no overrides; inherits all from `yr`. | `gm` (empty class extends `yr`) | Stream (unused variant) | none — likely legacy | trivial (lines) | Instantiable but not used on homepage |
| 12 | Graph/explanation controller (`xm`) | [43529, 43580] | Extends `yr` for story chapters; no major custom behavior beyond inherited lifecycle. | `xm` (class extends `yr`) | Graph/story controller | none listed | trivial (lines) | Not confirmed active on homepage |
| 13 | Hotspot-popup controller (`ym`) | [43581, 43614] | Extends `yr` for secondary scenes; no visible override. | `ym` (class extends `yr`) | Hotspot popup controller | none listed | trivial (lines) | Not confirmed active on homepage |
| 14 | CTA/PCB bitmap controller (`_m`) | [43615, 43632] | Extends `yr` for CTA chapter; simple z-position scroll timeline, no complex choreography. | `_m` (class extends `yr`) | PCB controller | `apps/web/features/field/controller/PcbController.ts` | small (lines) | Simple scroll-driven z-motion on `cta` data-scroll hook |
| 15 | User/avatar controller (`bm`) | [43633, 43654] | Extends `yr` for user avatar scenes; no visible overrides. | `bm` (class extends `yr`) | User controller | none listed | trivial (lines) | Not confirmed active on homepage |
| 16 | Procedural point-cloud controller (`Sm`) | [43655, 43698] | Extends `yr` for procedural particle effects; custom alpha/depth animations on entry/exit; rotates model on scroll. | `Sm` (class extends `yr`), lines 43655–43698 include constructor, `animateIn()` (alpha/depth tween), `animateOut()`, `loop()` rotation | Procedural/stars controller | none listed | medium (inheritance) | Optional, likely gated by `?stars` query param |
| 17 | GSAP imports (lg, cg, e1, t1, zS) | [43699, 43754] | Five-line import block registering GSAP modules: main library, ScrollTrigger plugin, ScrollToPlugin, custom motion-path plugin, and SplitText. | `lg`, `cg`, `e1`, `t1`, `zS` | `Pn(Xn())` = dynamic import wrapper (Pn = plugin loader, Xn = GSAP module) | none — plugin registration | trivial (lines) | Dependencies for scroll adapters and text-reveal choreography |
| 18 | GSAP paths plugin library | [43755, 47859] | Bundled GSAP plugin for SVG path sampling and motionPath animation; ~4,100 lines of utility functions, regex, path parsing, bezier interpolation, length calculation. License header at 43704. Includes SVG shape-to-path conversion (rect, circle, ellipse, line); used by stream chapter's DOM motion-path choreography. | GSAP library internals: `yd()` (path parser), `eI()`, `tI()`, `nI()` (SVG utilities), `Pw()` (shape converter), `sx()` (path slice), `Tx()` (touch-action), `Qi` (Draggable compatibility), `BI()` (ScrollSmoother normalizer) | GSAP paths 3.13.0 (bundled minified) | none — defer to Context7 for GSAP plugin docs | large (lines) | Foundation for stream point popup motion-path animations (data-scroll="stream" at lines 48911–49035, outside slice) |
| 19 | ScrollTrigger event utilities | [47860, 48595] | Continuation of GSAP ScrollTrigger machinery including velocity normalization (`hS`), touch-action handler (`Tx`), draggable event detection (`kI`), input filtering (`fS`), ScrollSmoother normalization (`BI`), wheel/touch input handling (`UI`, `dS`). Ends with ScrollTrigger class reference `US.version = "3.13.0"` and alias `var lo = US;` at line 48596. | `hS` (easing function), `Tx` (touch-action toggle), `Qi` (Draggable class from GSAP), `Km` (overflow enum), utilities for velocity clamping, event normalization | GSAP ScrollTrigger 3.13.0 + ScrollSmoother | none — defer to Context7 | large (lines) | Required for scroll-adapter motion timelines |
| 20 | Scroll adapters (HS, VS, GS, WS) — opening | [48597, 48664] | Start of four scroll adapters for DOM choreography: `HS` (items list), `VS` (hero splash text reveal), `GS` (CTA button/title reveal), `WS` (events timeline split-text reveal). Each returns a ScrollTrigger instance + GSAP timeline. | `HS`, `VS`, `GS`, `WS` (arrow functions), `lo` (ScrollTrigger alias), `Ht.create()` (ScrollTrigger factory), `Xx`/`qx`/`px` (GSAP module refs), `Tn` (ease constant) | Scroll adapters mapping to data-scroll names | Partial — extends into cart-07 at lines 48665+ for qS, jS, KS | medium (lines) | WS continues past 48664; stream adapter (KS) and others in cart-07 |

**Name resolution**: Human-readable names derived from Maze symbol table (minified); implementations listed with line ranges; external libraries (FBX, GSAP) noted with version and deferral guidance.

## Existing map overlap

| Section | Existing coverage | New info added |
|---|---|---|
| FBX parser | none (raw bundled library) | Identified as class `as` at line 40001; spans 2,132 lines; feeds models to `jo.fromVertices()` |
| Scene params (cs) | **runtime-architecture-map.md § 3** ("scripts.pretty.js:42467–42543") | Exact line boundaries: 42399–42544; lists all 12 scene configs (blob, stream, pcb, hex, shield, cubes, sphere, blobProduct, users, logo, default); clarifies use by `yr` constructor |
| Material pipeline | **runtime-architecture-map.md § 4** ("scripts.pretty.js:42545–42595") | Extends to full registry boundary 42545–42632; stream extensions at 42583–42593 confirmed; material factory alias at 42633 |
| Geometry generator | **asset-pipeline-map.md § 3** ("scripts.pretty.js:42676–42722 bitmap, 42723–42745 model") | Consolidates under `jo` class at 42666; lists three methods: `fromTexture()` (42676–42722), `fromVertices()` (42723–42745), `generate()` (42894–42917), `addParams()` (42784–42893) |
| Asset registry | **runtime-architecture-map.md § 5** ("scripts.pretty.js:42941–43009") | Exact boundaries 42941–43012; notes logo/pcb bitmap sources and Shield/Cubes/Net/World/Users models; clarifies registration is broader than homepage usage |
| Base controller | **runtime-architecture-map.md § 6** ("scripts.pretty.js:43013–43254") | Exact boundaries 43013–43256; adds detail on `data-gfx-sticky`/`data-gfx-end-trigger` binding, scale/position updates, overlay projection, animate-in/-out lifecycle |
| Blob controller (mm) | **runtime-architecture-map.md § 7** ("scripts.pretty.js:43257–43525") | Exact boundaries 43257–43526; hotspot pool at 43421–43458, projection loop at 43501–43524, labels at 43291–43414 |
| Stream controller (gm) | **runtime-architecture-map.md § 7** ("stream maps to ug") | Clarifies `gm` (line 43527) is **not** the active stream controller; active one is `ug` (outside slice at line 49326) |
| GSAP imports | none | Identified at 43699–43754; modules: lg (GSAP), cg (ScrollTrigger), e1 (ScrollToPlugin), t1 (custom), zS (SplitText) |
| GSAP paths plugin | none | Massive bundled library 43755–47859 (~4,100 lines) for SVG path sampling and motionPath; version 3.13.0; used by stream DOM choreography (KS adapter at 48911–49035, outside slice) |
| ScrollTrigger utilities | none | Identified at 47860–48595; includes velocity normalization, touch-action, draggable detection, input filtering, ScrollSmoother; ends with `lo = US;` alias at 48596 |
| Scroll adapters (HS, VS, GS, WS) | **chapter-selector-map.md § 2** lists adapters but not line-by-line; names adapters `HS`, `VS`, `GS`, `WS` | Exact lines: HS 48597–48614, VS 48615–48638, GS 48639–48664, WS extends into cart-07 at 48665+ |

## Cross-slice closure boundary notes

**Opening boundaries (before line 40001):**
- Three.js types (`BufferGeometry`, `Material`, `Object3D`, `TextureLoader`, etc.) — imported/defined outside slice (standard three.js library)
- `Pn()` (plugin loader) and `Xn()` (GSAP module getter) — dynamic import wrappers defined outside slice
- GSAP main instance (`lg`) — imported at line 43699; defined outside slice
- `Pr()` (Three.js Object3D wrapper), `Ms()` (Box3 helper) — three.js utilities used by `yr.updateScale()`
- `se()` (Vector3 constructor), `ui()` (Mesh constructor) — three.js primitives used throughout controllers
- `Gs` (DAT.GUI registry) — used by `yr` constructor at lines 43048–43050, defined outside slice
- `Jr` (scroll handler singleton) — referenced by controllers for scroll binding; defined in pilot slice at 49115
- `xi` (stage runtime) — referenced by controllers for scene/camera/viewport; defined in pilot slice at 49427
- `vi` (debug flag) — checked at line 43040; defined outside slice
- `yi` (viewport detector) — checked by controllers for mobile/desktop branching (e.g., line 43077); defined outside slice
- `wm` (GSAP defaults alias for `lg.default`) — used by Sm controller at line 43673; imported as part of `lg` import

**Closing boundaries (after line 48000, before line 48596):**
- ScrollTrigger utilities `hS`, `Tx`, `kI`, `fS`, `BI` (lines 47860–48595) are self-contained utility functions within the bundled GSAP library; they **do not bleed into cart-07**
- Scroll adapter opening at line 48597 (`HS`) is complete function definition; `VS` at 48615, `GS` at 48639, `WS` at 48665 all continue **into cart-07** (cart-07 slice starts at 48000 but pilot slice already owns 49100–49600, creating an overlap zone; check slice assignments)
- No incomplete class definitions or IIFE closures straddle the 48000 boundary

**Note on boundary design**: Slice 06 terminates cleanly at the start of scroll adapters. Cart-07 will own lines 48000–49099 and inherit the scroll adapters (HS, VS, GS, WS, and the stream/graphRibbon/events adapters KS, qS, WS at lines 48911–49035 per overview.md). The pilot slice (49100–49600) handles scroll loader, scroll handler, controller registry, and stage runtime — no overlap.

## Popups / stream DOM motion-path discoveries

**Found in this slice:**
- Lines 43755–47859: GSAP paths plugin library (SVG path parsing, bezier sampling, motionPath foundation) — **KEY INFRASTRUCTURE for stream DOM motion-path choreography flagged as a known gap**
- No explicit popup DOM element handling in this slice; popups are mounted elsewhere (index.html:597–711 per asset-pipeline-map.md § 1 and chapter-selector-map.md § 3)
- Stream adapter (KS) that drives popup visibility and motion-path animation exists at lines 48911–49035 per chapter-selector-map.md § 2, but is **outside this slice** (in cart-07 range)
- SVG flow rails (index.html:571–593) referenced in asset-pipeline-map.md but DOM structure is in index.html, not scripts.pretty.js

**Gap closure status**: This slice provides the **GSAP motionPath plugin infrastructure** but does **not contain the stream-specific data-scroll adapter (KS)** that applies it to `.js-stream-point` and `.js-stream-point-popup` elements. That adapter is at lines 48911–49035, assigned to cart-07. The chapter-selector-map.md already documents this boundary clearly (§ 3: "KS binds a ScrollTrigger, creates looped GSAP timelines, and animates DOM nodes along the SVG rails with motionPath").

## Notes for Phase 2 catalog synth

1. **FBX parser boundary**: Lines 40001–42132 are a self-contained three.js FBXLoader port (minified). Mark as **third-party—defer to Context7** for parser internals; it is not custom Maze code.

2. **Scene parameter registry**: The `cs` object at lines 42399–42544 is a **configuration node** for SoleMD's `visual-presets.ts` equivalent. Each scene slug key is a production lever for tuning rotation, scale, depth, entry/exit behavior. Recommend preserving the naming (`cs[slug]`) when porting to TypeScript.

3. **Point-source geometry pipeline**: The `jo` class (lines 42666–42940) is a **critical conversion layer** between asset sources (bitmap, model, procedural) and the particle shader. Three paths (fromTexture, fromVertices, generate) must remain distinct in any port because shader attributes are source-dependent (line 42784–42893: `aStreamFreq`, `aSelection`, `aMove`, `aSpeed`, `aRandomness` are only added if certain source types are detected). Do not collapse into a single point-cloud generator.

4. **Controller inheritance tree**: Six controllers extend `yr` (blob/mm, graph/xm, hotspot/ym, pcb/_m, user/bm, stars/Sm). The base `yr` class owns anchor layout, scale/position binding, animate-in/-out transitions, and scroll-trigger setup. Concrete classes override `loop()`, `animateIn()`, `animateOut()`, and `updateScale()` sparingly. Recommend mapping this inheritance tree in SoleMD source for inheritance clarity.

5. **GSAP bundled size**: The paths plugin alone (lines 43755–47859) is ~4,100 lines of minified code for SVG path handling. In a modern port, consider whether a smaller d3-path or custom SVG sampler could reduce bundle size.

6. **Scroll adapter naming**: The four adapters at lines 48597–48664 (HS, VS, GS, WS) + the three beyond 48000 (qS, KS, jS) form the complete `data-scroll` handler registry. The adapter loader (lines 49176–49191 in pilot slice) maps these by name. Recommend preserving the letter-pair minified names in the runtime for parity, even if source is TypeScript.

7. **Known gap closure**: This slice provides **80% of the infrastructure for stream popups** (GSAP paths plugin + scroll adapter framework) but **not the final 20%** (the KS adapter instantiation and `.js-stream-point-popup` visibility toggling). Catalog the GSAP paths plugin as **"found"** and the KS adapter as **"found elsewhere"** (lines 48911–49035).

8. **Mobile branching**: Controllers check `yi.desktop` and `yi.scaleFactorMobile` throughout (e.g., lines 43077, 43098). The viewport detector `yi` is defined outside slice. Ensure your SoleMD port tracks this branching for mobile parity.

