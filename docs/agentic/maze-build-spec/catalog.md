# Maze HQ build-spec catalog

**Phase**: 2 (synthesis)
**Synthesizer**: catalog-synth
**Inputs**: 8 cartography files + 6 derived maps
**Date**: 2026-04-19

## Executive summary

Maze-authored code occupies roughly 13,500 lines (~24%) of the 55,957-line `scripts.pretty.js`; the remaining ~76% is bundled GSAP 3.13.0, three.js r165+, Earcut, lil-gui v0.20.0, SplitText 3.13.0, and the GSAP paths plugin. This catalog organizes the Maze-authored surface into 13 subsystem buckets plus one deferred vendored-libraries bucket, sized and prioritized for Phase 3 audit fan-out. Top-priority audit targets are: (P0) the stream DOM motion-path + popups subsystem (`KS` adapter, 125 lines, no SoleMD counterpart — user-flagged gap), (P0) the scroll adapter registry `$x` with 7 homepage-active adapters (no SoleMD counterpart), and (P0) the controller registry `jx` that maps `data-gfx` slugs to controller classes (no SoleMD counterpart). P1 parity work concentrates on scene parameter registry, material/geometry pipeline, base controller contract, progress controller, and stage runtime — all of which have identified SoleMD equivalents that need drift audit. The recommended Phase 3 fan-out is **12 agents**.

## Source footprint

| Region | Lines | % of file | Phase 3 audit value |
|---|---|---|---|
| Vendored libraries (GSAP core + ScrollTrigger + ScrollToPlugin + SplitText + GSAP paths plugin; three.js core + materials + geometries + loaders + WebGL renderer; Earcut; lil-gui v0.20.0; FBXLoader) | [1, ~42398] and [43699, ~48596] | ~76% | defer to Context7 |
| Maze-authored | [~42399, ~43698] and [~48597, 55957] (with vendored GSAP paths [43755, 47859] + SplitText [48391, 48596] interleaved) | ~24% | primary audit surface |

## Subsystem buckets

### B1. Vendored libraries (Context7 deferral)

- **Maze sections**: slice-01 § 1–3 [1, 8000], slice-02 § 1–7 [8001, 16000], slice-03 § 1–13 [16001, 24000], slice-04 § 1–7 [24001, 32000], slice-05 § 1, 4 [32001, 35562] + [35619, 40000], slice-06 § 1 FBX parser [40001, 42132], slice-06 § 17–19 GSAP paths + ScrollTrigger utils [43699, 48596], slice-07 § 5 SplitText [48391, 48596]
- **Aggregate Maze LOC**: 0 (all vendored)
- **Key Maze symbols**: none
- **DOM anchors involved**: none
- **SoleMD counterpart(s)**: package dependencies (`gsap`, `three`, `split-type` or custom, etc.) — resolved via `package.json`, not per-file audit
- **Cross-bucket edges**: consumed by every downstream bucket; no bucket consumes it inversely
- **Audit priority**: P3 (deferred — Context7 owns this)
- **Estimated auditor context load**: 0 (deferred)

### B2. Page runtime shell / bootstrap (`by`)

- **Maze sections**: slice-07 § 8 app shell utilities [50256, 50462], slice-07 § 10 app shell bootstrap `by` [55770, 55907], slice-07 § 11 (IIFE tail) [55908, 55957]
- **Aggregate Maze LOC**: ~345
- **Key Maze symbols**: `by`, `l1`, `Jx`, `c1`, `h1`, `kc`, `Uc`, `qI`, `Qx`, `Ly()`, `af()`
- **DOM anchors involved**: none directly (orchestrates all chrome)
- **SoleMD counterpart(s)**: `apps/web/app/page.tsx` + Next.js App Router + `apps/web/features/graph/components/shell/*` (likely split across several files)
- **Cross-bucket edges**: depends on B6 (controllers) via `xi`, B7 (controller registry), B8 (scroll adapter registry), B10 (scroll driver `Jr`), B11 (stage runtime `xi`), B13 (component registry `Rg`); consumed by nothing (top of stack)
- **Audit priority**: P1 (drift likely — Next.js App Router vs. custom AJAX `Fs` create different lifecycle contracts)
- **Estimated auditor context load**: ~400 Maze lines + SoleMD app-shell + router files (~600 total)

### B3. Scene parameter registry (`cs.*`)

- **Maze sections**: slice-06 § 4 scene parameter registry [42399, 42544]
- **Aggregate Maze LOC**: 146
- **Key Maze symbols**: `cs` (object literal with 12 scene configs: blob, stream, pcb, hex, shield, cubes, sphere, blobProduct, users, logo, default, plus variants)
- **DOM anchors involved**: indirect via `yr.params = cs[slug]`
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/scene/visual-presets.ts`
- **Cross-bucket edges**: consumed by B6 (base controller `yr` constructor at 43041)
- **Audit priority**: P1 (tuning values are production levers; per-key parity matters)
- **Estimated auditor context load**: ~150 Maze lines + 1 SoleMD file

### B4. Material + geometry shader pipeline

- **Maze sections**: slice-06 § 5 shader material factory `gd` [42545, 42632], slice-06 § 6 alias `Fl = gd` [42633, 42633], slice-06 § 7 point-source geometry generator `jo` [42666, 42940]
- **Aggregate Maze LOC**: ~360
- **Key Maze symbols**: `gd`, `Fl`, `jo`, `jo.fromVertices()`, `jo.fromTexture()`, `jo.generate()`, `jo.addParams()`, stream funnel uniforms [42583, 42593], shader attributes `aStreamFreq`, `aSelection`, `aMove`, `aSpeed`, `aRandomness`
- **DOM anchors involved**: none (consumed by controllers)
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/renderer/field-shaders.ts` (material) + `apps/web/features/ambient-field/asset/*` (geometry generation)
- **Cross-bucket edges**: consumes B1 (three.js `ShaderMaterial`, `BufferGeometry`); consumed by B5 (asset registry), B6 (controllers)
- **Audit priority**: P1 (parity-critical; source-specific attributes are load-bearing)
- **Estimated auditor context load**: ~400 Maze lines + shader source + SoleMD asset modules (~800 total)

### B5. Asset registry (`vd` / `ku`) + bitmap & FBX source classes

- **Maze sections**: slice-06 § 2 bitmap sprite class `fm` [42133, 42343], slice-06 § 3 FBX texture loader `md` [42344, 42398], slice-06 § 8 asset registry `vd` [42941, 43012], plus `ku` asset loader (pilot context refs; line ~42941 per derived maps)
- **Aggregate Maze LOC**: ~340
- **Key Maze symbols**: `vd`, `ku`, `fm`, `md`, entries for `logo`, `pcb`, `shield`, `cubes`, `net`, `world`, `users`, `stars`
- **DOM anchors involved**: none (lookups keyed by `data-gfx` slug via controller registry)
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/asset/point-source-registry.ts`
- **Cross-bucket edges**: consumes B4 (geometry generator `jo`), B1 (FBXLoader, TextureLoader); consumed by B6 (controllers) and B11 (stage runtime `xi` preload)
- **Audit priority**: P1 (registry shape determines which scenes work)
- **Estimated auditor context load**: ~400 Maze lines + SoleMD registry module

### B6. Base controller + concrete controllers

- **Maze sections**: slice-05 § 2 event emitter `Ll` [35565, 35590], slice-05 § 3 controller base `Ei` [35593, 35617], slice-06 § 9 base controller `yr` [43013, 43256], slice-06 § 10 blob `mm` [43257, 43526], slice-06 § 11 stream stub `gm` [43527, 43528], slice-06 § 12 graph `xm` [43529, 43580], slice-06 § 13 hotspot-popup `ym` [43581, 43614], slice-06 § 14 CTA pcb `_m` [43615, 43632], slice-06 § 15 user `bm` [43633, 43654], slice-06 § 16 procedural stars `Sm` [43655, 43698], slice-pilot § 4 stream controller `ug` [49326, 49346]
- **Aggregate Maze LOC**: ~740
- **Key Maze symbols**: `Ll`, `Ei`, `yr`, `mm`, `gm`, `xm`, `ym`, `_m`, `bm`, `Sm`, `ug`, hotspot labels (`stats`, `hotspots`, `diagram`, `shrink`, `quickly`, `respond`, `end`)
- **DOM anchors involved**: `data-gfx="blob"` → `mm`; `data-gfx="stream"` → `ug`; `data-gfx="pcb"` → `_m`; plus `.js-hotspot` children
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/controller/FieldController.ts` (base) + `BlobController.ts` + `StreamController.ts` + `PcbController.ts`
- **Cross-bucket edges**: consumes B3 (scene params `cs`), B4 (materials, geometry), B5 (asset registry), B10 (scroll driver `Jr`), B11 (stage runtime `xi` for viewport/camera); consumed by B7 (controller registry `jx`)
- **Audit priority**: P1 (substantive drift likely — base lifecycle contract and hotspot pool are parity-critical; concrete controllers may be partial in SoleMD)
- **Estimated auditor context load**: ~900 Maze lines + 3–5 SoleMD controller files (~1,500 total)

### B7. Controller registry (`jx`) + `data-gfx` scan

- **Maze sections**: slice-pilot § 5 controller registry `jx` [49347, 49357]; consumed by B11 stage runtime at [49546, 49559]
- **Aggregate Maze LOC**: ~25
- **Key Maze symbols**: `jx`, `jx.default = yr`, slug keys (`blob`, `stream`, `pcb`, `hex`, `shield`, `cubes`, `users`, `stars`, etc.)
- **DOM anchors involved**: **`data-gfx` = `blob`, `stream`, `pcb` (3 active on homepage)**
- **SoleMD counterpart(s)**: **Missing — small**
- **Cross-bucket edges**: consumes B6 (controller classes); consumed by B11 (stage runtime DOM scan)
- **Audit priority**: P0 (no SoleMD counterpart; auditor must design the port pattern)
- **Estimated auditor context load**: ~50 Maze lines + SoleMD stage runtime + recommendation writeup

### B8. Scroll adapter registry (`$x`) + 7 homepage-active adapters

- **Maze sections**: slice-pilot § 1 adapter registry `$x` [49102, 49113]; slice-06 § 20 / slice-07 § 1 `HS` clients [48597, 48614]; slice-07 § 2 `GS` cta [48639, 48663]; slice-07 § 3 `qS` graphRibbon [48732, 48832]; slice-07 § 4 `WS` events [48665, 48731]; slice-07 § 6 `KS` stream [48911, 49035] **(split to B9)**; plus `JS` welcome [49037, 49066], `QS` moveNew [49069, 49100] (pilot context scan), `VS` hero splash text reveal, `jS`, `$S` (minor)
- **Aggregate Maze LOC (excluding KS which is in B9)**: ~420
- **Key Maze symbols**: `$x`, `HS`, `JS`, `QS`, `GS`, `WS`, `qS`, `jS`, `VS`, `$S`, `lo` (SplitText consumer)
- **DOM anchors involved**: **`data-scroll` = `welcome`, `moveNew`, `clients`, `graphRibbon`, `events`, `cta` (6 non-stream values; stream split to B9)**
- **SoleMD counterpart(s)**: **Missing — medium**
- **Cross-bucket edges**: consumes B1 (GSAP, SplitText), B10 (scroll driver attaches via `ScrollTrigger.create`); consumed by B10 (adapter loader at 49176–49191)
- **Audit priority**: P0 (no SoleMD counterpart; 6 chapter-specific DOM adapters missing)
- **Estimated auditor context load**: ~500 Maze lines + SoleMD motion modules to compare (~700 total)

### B9. Stream DOM motion-path + popups (`KS`) — user-flagged P0 gap

- **Maze sections**: slice-07 § 6 stream DOM motion-path adapter `KS` [48911, 49035]; HTML: `index.html` [564, 712] stream shell + `.js-stream-point` × 8 + `.js-stream-point-popup` × 1–3 per point; SVG rails `flow-diagram-main.svg` + mobile variant with path IDs `kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`, `framebuffer`
- **Aggregate Maze LOC**: 125 (JS) + ~120 (HTML) + 2 SVG files
- **Key Maze symbols**: `KS`, `Gd.default.timeline()`, GSAP `motionPath` plugin, `.js-stream-point`, `.js-stream-point-popup`, `.popup--red`, `.popup--mobile-*`, `.hotspot--red`
- **DOM anchors involved**: **`data-gfx="stream"` + `data-scroll="stream"` on the same node at `index.html:564`**
- **SoleMD counterpart(s)**: **Missing — large (user-flagged, P0)**
- **Cross-bucket edges**: consumes B1 (GSAP motionPath plugin), B8 (registered in `$x` registry as `$x["stream"]`); adjacent to B6 `ug` stream WebGL controller (different subsystem — DOM vs. WebGL)
- **Audit priority**: **P0 (user-flagged; blocker for stream chapter parity; isolated per plan hard rule)**
- **Estimated auditor context load**: ~250 Maze lines (JS+HTML+SVG) + 0 SoleMD (design doc only)

### B10. Scroll ownership (`jt` / `Jr`) + pilot-audited driver

- **Maze sections**: slice-pilot § 2 GSAP plugin registration [49114, 49114]; slice-pilot § 3 scroll controller `jt` [49115, 49325]
- **Aggregate Maze LOC**: ~212
- **Key Maze symbols**: `jt`, `Jr`, `cg.ScrollTrigger`, `IntersectionObserver`, scroll-state classes (`is-scrolled`, `is-scrolling-down`, `is-scrolled-vh`, `is-scrolled-header-height`), hash-click handler, adapter loader at [49176, 49191]
- **DOM anchors involved**: scans all `[data-scroll]` nodes (7 homepage values per B8+B9)
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/scroll/ambient-field-scroll-driver.ts` (already pilot-audited per Phase 0)
- **Cross-bucket edges**: consumes B1 (GSAP ScrollTrigger), B8+B9 (adapter registry and handlers); consumed by B2 (app shell `by`), B6 (controllers bind via `Jr.scrollTo`), B11 (stage runtime reacts to scroll)
- **Audit priority**: P2 (already pilot-audited; routine re-verify against latest driver)
- **Estimated auditor context load**: ~250 Maze lines + SoleMD driver (~400 total)

### B11. Stage runtime (`Os` / `xi`) + optional starfield

- **Maze sections**: slice-pilot § 6 background starfield `hg` [49359, 49425]; slice-pilot § 7 stage runtime `Os`/`xi` [49427, 49588]
- **Aggregate Maze LOC**: ~230
- **Key Maze symbols**: `Os`, `xi`, `hg`, WebGL renderer + scene + camera construction [49518, 49541], DOM scan [49546, 49559], RAF loop [49573, 49585], `ku.loadAll()` preload
- **DOM anchors involved**: `.js-gfx` (root stage mount), scans `[data-gfx]`
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/renderer/FieldScene.tsx`
- **Cross-bucket edges**: consumes B1 (three.js), B5 (asset registry), B7 (controller registry), B10 (scroll driver); consumed by B2 (app shell)
- **Audit priority**: P1 (parity-critical render loop and preload chain)
- **Estimated auditor context load**: ~300 Maze lines + SoleMD `FieldScene.tsx` + context (~600 total)

### B12. Progress controller (`gg`)

- **Maze sections**: slice-07 § 7 progress controller `gg` [50178, 50255]
- **Aggregate Maze LOC**: 78
- **Key Maze symbols**: `gg`, `.js-progress-bar`, `--progress-N` CSS custom properties, `data-current-visible` attribute, `calculateSectionProgress()`, GSAP `.to()` for smooth updates
- **DOM anchors involved**: **`data-component="Progress"` (2 instances at `index.html:323`, `718`)**
- **SoleMD counterpart(s)**: `apps/web/features/ambient-field/AmbientFieldStoryProgress.tsx`
- **Cross-bucket edges**: consumes B10 (scroll events), extends B6 base `Ei`; consumed by B13 (instantiated via component registry `xy`)
- **Audit priority**: P1 (two active DOM instances; CSS custom property writes are parity-critical)
- **Estimated auditor context load**: ~100 Maze lines + SoleMD progress component

### B13. Component registry (`Rg` / `xy` / `yy`) + chrome

- **Maze sections**: slice-07 § 9 component registry `Rg`/`xy`/`yy` [55180, 55283]
- **Aggregate Maze LOC**: 104
- **Key Maze symbols**: `Rg`, `xy` (component class map: `Header`, `Progress`, `SwiperSlider`, `FormsPagination`, `ArticleNav`, `Product`, `Load`, `Sort`, `More`, `Toggle`, `ShareArticle`), `yy` (page registry), `ul.CHANGE`, `th.preload()`, `Cg` (Header class), `wg` (SwiperSlider class)
- **DOM anchors involved**: **`data-component` = `Header`, `Progress`, `SwiperSlider` (3 homepage-active values)**
- **SoleMD counterpart(s)**: `apps/web/features/graph/components/chrome/*.tsx` (partial — Header exists; `SwiperSlider` and `Progress` may route differently in Next.js)
- **Cross-bucket edges**: consumes B12 (Progress class), B6 base `Ei`; consumed by B2 (app shell `by` instantiates `Rg`)
- **Audit priority**: P1 (3 active components; Header/Progress parity vs. SoleMD chrome)
- **Estimated auditor context load**: ~150 Maze lines + SoleMD chrome modules

### B14. Typography reveal + animation glue (SplitText usage)

- **Maze sections**: slice-07 § 5 SplitText library `lo`/`US` [48391, 48596] (vendored; consumption patterns across `GS`, `VS`, `qS`, `jS`, `$S` adapters inside B8)
- **Aggregate Maze LOC**: ~30 (consumption call sites; library itself vendored and in B1)
- **Key Maze symbols**: `lo` consumption calls inside `VS`, `GS`, `WS` adapters; split-words, split-chars, split-lines patterns with staggered GSAP timelines
- **DOM anchors involved**: none explicit (consumes text nodes inside `data-scroll="welcome"`, `"cta"`, `"events"`, `"graphRibbon"`)
- **SoleMD counterpart(s)**: `apps/web/animations/_smoke/text-reveal/TextReveal.tsx` + `RevealCard.tsx` + wiki motion modules (needs audit to disambiguate)
- **Cross-bucket edges**: folded into B8 (scroll adapters are the consumers); library itself is B1
- **Audit priority**: P2 (routine — pattern replaces SplitText with SoleMD's text-reveal primitive; purely call-site comparison)
- **Estimated auditor context load**: adapter call sites (~60 lines) + SoleMD TextReveal
- **Note**: merged into B8 for audit purposes (no separate auditor); retained as a named sub-concern for cross-reference.

## Cross-slice closure integrity

No Maze-authored closure was cut across any slice boundary. Details:

1. **GSAP ScrollTrigger utility block**: spans slice-01/02/03/04/05/06 but is entirely vendored and not audited — **resolved: collapsed into B1 vendored bucket**.
2. **three.js library code**: spans slice-01 through slice-05, vendored — **resolved: B1**.
3. **Scroll adapter functions `WS` / `qS` / `HS`**: slice-06 § 20 notes these "open" at [48597, 48664] and cart-07 claimed the continuation. Re-examination of slice-07 § 1–4 confirms each adapter's full function body is self-contained (`HS` at [48597, 48613], `GS` at [48639, 48663], `WS` at [48665, 48731], `qS` at [48732, 48832]). No closure was actually cut — slice-06's note was a boundary concern that slice-07 absorbed cleanly. **Resolved: all 7 adapters belong to B8 (+B9 for `KS`); the slice-06/07 boundary at 48664 is a safe handoff between adapter definitions.**
4. **Pilot slice overlap with slice-07**: slice-07 explicitly excludes [49100, 49600] and defers to slice-pilot. No duplicate definition exists. **Resolved: pilot owns `jt`/`Jr`/`jx`/`$x`/`ug`/`Os`/`xi`/`hg`; slice-07 owns [48001, 49099] + [49601, 55957].**
5. **Base class `Ei` used by distant subclasses**: `Ei` is defined in slice-05 [35593, 35617] and subclassed by `gg` (slice-07 [50178]), `Os` (slice-pilot [49427]), `Rg` (slice-07 [55180]), and indirectly feeds `yr` at slice-06 [43013]. **Resolved: `Ei` lives in B6 (base controller bucket); subclasses in B6, B11, B12, B13 explicitly depend on it — cross-bucket edges documented.**
6. **`by` app shell references forward symbols**: `by` at [55770, 55907] references `Jr`, `xi`, `Rg`, `Fs` which are defined earlier. **Resolved: all references are backward in source order and cleanly owned by B10, B11, B13, and Fs (AJAX/navigation — folded into B2 as part of the shell).**

**Net**: Zero unresolved cross-slice closure cuts. All section boundaries are structural (file end or handoff between completed definitions).

## Known SoleMD gaps (flagged for Phase 3 audit priority)

| Rank | Bucket | Gap size | Rationale |
|---|---|---|---|
| 1 | **B9. Stream DOM motion-path + popups (`KS`)** | **Missing — large** | User-flagged. 125 JS lines + ~120 HTML lines + 2 SVG files. Popup visibility is class-toggle, not shader state. 8 motion paths, 1–3 popups per point, red variants for exploitable findings. Blocker for stream chapter parity. **P0.** |
| 2 | **B8. Scroll adapter registry (`$x`) + 6 other adapters** | **Missing — medium** | 6 chapter-specific DOM adapters (welcome, moveNew, clients, graphRibbon, events, cta) have no SoleMD equivalent registry. Each adapter encodes chapter-specific choreography (split-text, staggered fades, SVG stroke-in). **P0.** |
| 3 | **B7. Controller registry (`jx`) + `data-gfx` scan** | **Missing — small** | ~25 lines that map 3+ `data-gfx` slugs to controller constructors. SoleMD uses React component trees, not DOM-scan registries — this is an architectural port recommendation, not a 1:1 match. **P0.** |

## Audit priority roll-up

| Priority | Bucket count | Estimated Phase 3 agent count | Rationale |
|---|---|---|---|
| P0 | 3 (B7, B8, B9) | 3 (one per P0 bucket, stream popups isolated per plan) | All three are SoleMD gaps; stream popups is user-flagged blocker |
| P1 | 7 (B2, B3, B4, B5, B6, B11, B12, B13) | 7 (some may merge; see fan-out below) | Drift audits against identified SoleMD counterparts |
| P2 | 2 (B10, B14) | 2 (may merge with larger bucket) | Pilot-audited or pattern-only |
| P3 | 1 (B1) | 0 (Context7 deferral, no agent) | Vendored |
| **Total** | **13 + 1 deferred** | **12** | Target 10–15 per plan |

## Phase 3 fan-out recommendations

**Recommended 12-agent fan-out**, clustering related buckets where the auditor benefits from shared context:

1. **Agent 1 — Stream DOM motion-path popups (B9, P0)**. Isolated per plan hard rule. Consumes `KS` handler + `index.html:564–712` + SVG motion paths. Auditor should produce a SoleMD design doc (no existing counterpart to audit against). Cross-reference the `ug` WebGL stream controller in B6 auditor's output to clarify WebGL-vs-DOM ownership boundary.

2. **Agent 2 — Scroll adapter registry + 6 DOM adapters (B8, P0)**. Covers welcome/moveNew/clients/graphRibbon/events/cta adapters plus registry shape. Also absorbs **B14 typography reveal** (call sites live inside these adapters — merging prevents context thrash across two auditors). Specialization: scroll-driven choreography + SplitText-equivalent in SoleMD.

3. **Agent 3 — Controller registry `jx` (B7, P0)**. Small scope, but architectural recommendation for SoleMD. Should read B6 (base controller + concretes) and B11 (stage runtime) output to understand the consumption pattern before recommending a port.

4. **Agent 4 — Page runtime shell / bootstrap `by` (B2, P1)**. Covers app shell utilities + AJAX/navigation `Fs` + `by` bootstrap. SoleMD counterpart spans Next.js App Router + shell components — likely multi-file. High risk of drift due to architectural differences (AJAX swap vs. React Server Components).

5. **Agent 5 — Scene parameter registry `cs.*` (B3, P1)**. Self-contained; audits per-key value parity. Small scope, could merge with **B4 material/geometry pipeline** if auditor prefers one pass.

6. **Agent 6 — Material + geometry shader pipeline (B4, P1)**. Shader factory `gd`, geometry generator `jo`, stream funnel uniforms, shader attributes. Parity-critical. Specialization: GLSL + three.js BufferGeometry.

7. **Agent 7 — Asset registry `vd`/`ku` + bitmap/FBX sources (B5, P1)**. Registry shape + bitmap-to-points conversion + FBX loader adapter.

8. **Agent 8 — Base controller + concrete controllers (B6, P1)**. Largest P1 bucket (~740 LOC). Covers `Ei` → `yr` → `mm`/`ug`/`_m` + minor subclasses. Should split between desktop and mobile branching (via `yi`). Specialization: lifecycle + hotspot pool + scroll binding.

9. **Agent 9 — Stage runtime `xi` + starfield `hg` (B11, P1)**. WebGL renderer construction + preload chain + RAF loop + DOM scan for `[data-gfx]`.

10. **Agent 10 — Progress controller `gg` (B12, P1)**. Small scope but 2 active instances; audits CSS custom property writes + `data-current-visible` toggling against SoleMD progress component.

11. **Agent 11 — Component registry `Rg`/`xy`/`yy` (B13, P1)**. Chrome components: Header, Progress, SwiperSlider. Cross-references B12 (Progress class is the same symbol).

12. **Agent 12 — Scroll ownership `jt`/`Jr` re-verify (B10, P2)**. Already pilot-audited; this is a confirmation pass against the latest SoleMD driver, including scroll-state class toggles and hash-click handling.

**No agent for B1 (Context7 deferral) or B14 (merged into Agent 2).**

## Open questions for Phase 4 build-spec synth

1. **B13 component registry SoleMD disambiguation**: Maze's `xy` registers `Header`, `Progress`, `SwiperSlider` plus 8 non-homepage components (`FormsPagination`, `ArticleNav`, `Product`, `Load`, `Sort`, `More`, `Toggle`, `ShareArticle`). SoleMD likely has a different chrome structure; the build-spec should document which Maze components map 1:1 and which are sanctioned deviations (e.g., SoleMD may use Next.js route segments instead of a `SwiperSlider` pattern).

2. **B14 SplitText counterpart ambiguity**: SoleMD has at least `TextReveal.tsx`, `RevealCard.tsx`, and wiki motion modules as candidates for the SplitText-replaced role. Agent 2's audit should pick the primary counterpart; build-spec should record the decision.

3. **Stars controller (`Sm`) + `?stars` query param**: Optional feature, not active on the main homepage. Should this be documented as a sanctioned omission in SoleMD, or as a future-work entry? Recommend: sanctioned omission.

4. **`hg` starfield same question**: Tied to `?stars`. Same sanctioned-omission recommendation.

5. **Inactive controllers `gm`/`xm`/`ym`/`bm`**: slice-06 flags these as "not confirmed active on homepage". Phase 4 should mark as sanctioned omissions, not gaps.

6. **Mobile branching parity**: Controllers, adapters, and progress check `yi.desktop` / `yi.scaleFactorMobile` throughout. SoleMD's responsive strategy may differ (CSS breakpoints vs. JS viewport detector). Phase 4 should document the viewport-detection contract for parity.

7. **`jx` registry port pattern**: Agent 3's recommendation (React component tree vs. DOM-scan registry) needs build-spec endorsement so downstream controller ports align.

8. **AJAX/navigation `Fs`**: Agent 4 must decide whether `Fs` parity is required (AJAX page-swap vs. Next.js client-side routing). Recommend build-spec treats this as a sanctioned deviation — SoleMD's routing stack is a superset.
