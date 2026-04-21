# Maze HQ build spec — canonical parity reference for SoleMD field modules

**Status**: canonical first-read
**Scope**: every SoleMD field surface (landing, wiki modules, expanded module views, CTA sections, non-landing field surfaces)
**Date**: 2026-04-19
**Supersedes**: `image-particle-conformation.md` as the root reference entry point (that file remains a specialist reference for the image→particle pattern and is still required reading before adding any bitmap- or model-backed point layer)

## How to use this document

This document is **half audit, half backlog**. Every Maze HQ subsystem that matters for SoleMD field parity is paired to either (a) its SoleMD counterpart plus a drift list and rebuild notes, or (b) a rehydration checklist when the counterpart does not yet exist. Section numbering matches the subsystem buckets (B1–B14) established in `docs/agentic/maze-build-spec/catalog.md`. Each section cites the audit that produced it so implementers can drill into the line-level source.

For an implementation task, start from the bucket that matches the surface you are touching and work from its "How to rebuild / what to change" block. Every bucket links forward into the specialist `maze-*.md` references for deeper treatment of shader uniforms, asset primitives, mobile rules, or the image→particle pattern. Do **not** read those references before this document — they assume the bucket ownership this spec defines.

When a behavior is missing in SoleMD, check section 13 first: it is the prioritized backlog. When a behavior is intentionally different, check section 12: it is the consolidated sanctioned-deviation list. When in doubt about whether a sanctioned deviation covers a change you want to make, the answer is almost always "no, ask first". The spec reinforces two patterns at every level: **React composition replaces DOM-scan registries**, and **hijack native pipeline uniforms for visual changes instead of adding overlays or parallel subsystems**.

Maze names inside this document are source-artifact labels only. Current
SoleMD naming authority lives in the live code plus
`docs/map/modules/module-terminology.md`. When this document references the
current SoleMD runtime, prefer `objectFormation`, `sectionId`,
`stageItemId`, and `presetId` over legacy labels such as `pcb`,
`anchorId`, `controllerSlug`, and `gfxPreset`.

## Source footprint (Maze homepage archive)

From `catalog.md` § "Source footprint":

| Region | Lines | % of file | Audit value |
|---|---|---|---|
| Vendored libraries (GSAP core + ScrollTrigger + ScrollToPlugin + SplitText + GSAP paths plugin; three.js core + materials + geometries + loaders + WebGL renderer; Earcut; lil-gui v0.20.0; FBXLoader) | [1, ~42398] and [43699, ~48596] | ~76% | deferred — Context7 owns docs |
| Maze-authored | [~42399, ~43698] and [~48597, 55957] with vendored GSAP paths [43755, 47859] + SplitText [48391, 48596] interleaved | ~24% | primary audit surface |

Maze-authored source is ~13,500 lines of a 55,957-line `scripts.pretty.js`. The Maze-authored region is interleaved with vendored blocks — any "cite line X" reference in this spec points only into the Maze-authored stretch or into `index.html`.

## 1. Page runtime shell (`by`) — B2

**Maze**: scripts.pretty.js:55770–55907 (`by` bootstrap); app-shell utilities at 50256–50462; AJAX/`Fs` at 49840–50091. ~345 lines total.
**SoleMD**: `apps/web/app/layout.tsx` + `apps/web/app/page.tsx` + `apps/web/features/field/surfaces/FieldLandingPage/*` + `apps/web/app/providers.tsx`. Responsibility is distributed across six layers (App Router, `MantineProvider` + `DarkClassSync`, dynamic-imported landing page, `useShellVariant`, `useGraphWarmup` + `useGraphBundle`, `bindFieldControllers`).

### Parity state

| Drift | Severity | Source audit |
|---|---|---|
| Preload promise gate missing (no explicit `Promise.all([setCurrentPage, gfx.preload]).then(onPageLoaded)`) | Must-fix (forward-looking) | `b02-app-shell.md § D1` |
| `af()` / `--app-height` CSS custom property not exported; SoleMD uses `svh`/`dvh`/`lvh` instead | Should-fix (document-or-implement) | `b02-app-shell.md § D2` |
| Body-class vocabulary not wired (`is-loaded`, `is-resizing`, `is-rendering`, `is-not-ready`) | Should-fix | `b02-app-shell.md § D3` |
| No named `.js-gfx` stage mount anchor; React owns the stage root | Should-fix | `b02-app-shell.md § D4` |
| Cookie consent banner not wired | Nice-to-have (tracks product/legal) | `b02-app-shell.md § D5` |

### How to rebuild / what to change

- **Must-fix**: introduce an explicit preload promise in the surface adapter layer. Shape: `await prewarmFieldPointSources({ ids })` and `await controller.whenReady()` must both resolve before `bindFieldControllers` binds scroll and before the controller drives the render loop. This belongs inside the `FixedStageManager` seam described in SKILL.md § "Default Architectural Shape". The render loop is R3F-owned; the gate is whether `BlobController.tick` is permitted to write uniforms, not whether `useFrame` ticks.
- **Should-fix (body classes)**: author `apps/web/app/shell/bind-shell-state-classes.ts` mounted once in `layout.tsx`. Exports `bindShellStateClasses()` that adds `is-loaded` on DOMContentLoaded, `is-resizing` on resize (250 ms debounce matching Maze's `o2 = 250`), reserves `is-rendering` / `is-not-ready` for router view transitions. This utility also absorbs scroll-driver D2 (`is-scrolled`, `is-scrolling-down`, `is-scrolled-vh-*`, `is-scrolled-header-height`) — both audits converge on the same shell utility.
- **Should-fix (section manifest)**: do **not** port Maze's `[data-gfx]` DOM scan. Introduce `FieldSectionManifest[]` authored in `field-landing-content.ts` enumerating `{ sectionId, stageItemId, endSectionId?, presetId }`. Shell iterates and calls `bindFieldControllers` per entry. This is the B7 port recommendation reified at the shell layer.

### Sanctioned deviations (key rows; full set in § 12)

- `Fs` AJAX page-swap is **not** required. Next.js App Router (`<Link>` + RSC streaming + `router.push`/`replace`/`back` + `metadata.title` + `AnimatePresence` + `error.tsx`/`not-found.tsx`) is a strict superset. The Maze-step → Next.js-step lifecycle translation table is authoritative and lives in `b02-app-shell.md § "Sanctioned deviations" item 1`.
- No `yy` page-class registry or `[data-page]` DOM scan (Next.js file-based routing replaces it).
- No `ih.bind` component wiring (React component tree replaces the runtime scan).
- No GSAP `CustomEase("custom", "0.5, 0, 0.1, 1")` registered globally; Framer Motion is SoleMD's primary motion substrate, GSAP is scoped to field scroll-driver + future chapter adapters.
- Pointer/desktop detection via `useShellVariant` (`matchMedia` pointer/hover + ≤960 px width) replaces `Qo = A1()` / `yi = _y()`.

### Cross-reference

`b02-app-shell.md § "Drift items"` (5 items), `b02-app-shell.md § "Sanctioned deviations"` (8 items), `b02-app-shell.md § "Return to B7 / B11 auditors"` for cross-bucket joins.

## 2. Stage runtime (`Os`/`xi`) + controller registry (`jx`) — B11 + B7

**Maze**: scripts.pretty.js:49427–49588 (`Os` / `xi` stage runtime); 49347–49357 (`jx` controller registry); 49359–49425 (`hg` starfield, `?stars`-gated).
**SoleMD**: `apps/web/features/field/renderer/FieldScene.tsx` + `renderer/FieldCanvas.tsx` + `renderer/field-loop-clock.ts`. `BlobController` is instantiated directly inside `FieldScene.tsx`; `StreamController` and `ObjectFormationController` exist as canonical stage families even when landing only activates the manifest-declared subset.

### Agent 3 recommendation (locked)

**Do not port `jx` as a string-keyed registry.** React composition already solves what `jx` solves. The `FieldControllerInit.id` slug (`"blob" | "stream" | "objectFormation"`) is the semantic equivalent of `data-gfx` at the data layer; dispatch happens through JSX and static imports rather than DOM scan. Missing controllers are compile-time errors, which is strictly safer than Maze's silent fallback to `jx.default = yr`. `FieldSectionManifest → SceneResolver` (SKILL.md § "Required Runtime Pieces") is the higher-abstraction replacement.

### Parity state

| Drift | Severity | Source audit |
|---|---|---|
| No preload promise gate between asset resolve and first frame | Must-fix once any async source lands (pcb bitmap, model) | `b11-stage-runtime.md § D3` |
| `Os.setViewportHeight` precompute (`sceneUnits = 2 * z * tan(fov/2)`) missing | Nice-to-have (deferred until stream/pcb mount on landing) | `b11-stage-runtime.md § D1` |
| `updateItems()` on resize vs. per-frame writes | Doc-only (benign at current scope) | `b11-stage-runtime.md § D2` |
| Per-frame order: Maze `loop → updatePosition → updateVisibility`; SoleMD `tick(FrameContext)` collapses the three | Doc-only (structural rename; internal order preserved) | `b11-stage-runtime.md § D4` |
| Stage-level `animateIn` / `animateOut` on `.view` unimplemented | Sanctioned (Next.js owns route transitions) | `b11-stage-runtime.md § D5` |
| `data-gfx` DOM scan replaced by React component tree | Sanctioned (see B7) | `b11-stage-runtime.md § D6`, `b07-controller-registry.md` |

### How to rebuild / what to change

- **When pcb / stream land on landing** (or any async source is added), add a `Promise.all([pointSource.ready, texture.ready, …])` gate inside `FieldScene`. Keep `useFrame` running (R3F needs the mount) but short-circuit controller `tick` until the gate resolves. Prefer a Suspense boundary at the `<Canvas>` level — this is the idiomatic R3F pattern.
- **When pcb / stream mount**, add a module-scope memo inside `FieldScene.tsx` (or a new `stage-metrics.ts` sibling) that recomputes `sceneUnits` on `state.size` change and passes it into `tick(...)`. Do **not** resurrect `Os.static` mutation patterns — keep the value in a ref or context.
- Document the `tick` contract in `FieldController.ts`: `tick === loop + updatePosition + updateVisibility in that order`. Add section comments inside each subclass `tick()` marking the three stages.

### Sanctioned deviations

- R3F owns renderer/scene/camera construction. Parameters (`fov:45, near:80, far:10000, position:[0,0,400]`, `alpha:true`, `antialias:true`) are passed into R3F props; no hand-rolled `new tm({...})`.
- DPR via `dpr={[1, 1.75]}` + `<AdaptiveDpr/>` (SoleMD ceiling is 1.75; Maze clamps at 2). Aligned with `frontend-performance.md § "DPR capped at 2"` and stricter.
- `setClearColor(0xff1e1d, 0)` omitted — transparent clear under `alpha: true` is equivalent.
- Page-global `Os.static` fields not mirrored.
- Starfield `hg` is a **sanctioned omission** (catalog Open Questions #3/#4 — `?stars`-gated Maze debug/marketing feature not active on primary homepage).

### Cross-reference

`b11-stage-runtime.md § "Drift items"` (6 items), `b07-controller-registry.md § "Recommendation"` (Option A locked), `b07-controller-registry.md § "Architectural comparison"` for the full 10-dimension trade-off table.

## 3. Scene parameter registry (`cs.*`) — B3

**Maze**: scripts.pretty.js:42399–42544. 12 scene configs (`default`, `blob`, `blobProduct`, `sphere`, `pcb`, `stream`, `hex`, `shield`, `cubes`, `users`, `globe`, `error`) with a prototype-merge contract (`yr.params = { ...cs.default, ...cs[slug] }` at 43041).
**SoleMD**: `apps/web/features/field/scene/visual-presets.ts` — three canonical presets (`blob`, `stream`, `objectFormation`) with a flat, explicitly-typed shape. No `cs.default` inheritance.

### Parity overview (all values include post-`cs.default` merge)

| Preset | Maze key | Maze effective | SoleMD key | SoleMD | Status |
|---|---|---|---|---|---|
| blob | `uSize` | 8 (default) | `shader.size` | 10 | **Should-fix** D1 — 10 is Maze's stream value; blob should be 8 unless product-chosen |
| blob | `uDepthOut` | 10 (default) | `depthOut` | 1.0 | **Should-fix** D2 |
| blob | `uAmplitudeOut` | 4 (default) | `amplitudeOut` | 0.8 | **Should-fix** D3 |
| stream | `uSize` | 10 | `shader.size` | 9 | **Should-fix** D4 (10% reduction, no comment) |
| stream | `uDepth` | 0.69 | `shader.depth` | 0.69 | parity |
| stream | `uDepthOut` | 1 | `depthOut` | 1.0 | parity |
| stream | `uAmplitudeOut` | 0.1 | `amplitudeOut` | 0.1 | parity |
| pcb | `uSize` | 6 | `shader.size` | 6 | parity |
| pcb | `uDepthOut` | 10 (default) | `depthOut` | 0.3 | Should-fix D5 (doc — intentional "flat pcb, no z-growth" — needs comment) |
| pcb | `uAmplitudeOut` | 4 (default) | `amplitudeOut` | 0.05 | Should-fix D6 (same doc pattern as D5) |
| pcb | — | — | `scrollRotation` | [0, 0.12, 0] | **Should-fix** D7 (SoleMD-invented Y-axis tween; 0.12 matches stream `sceneOffset.x`, may be copy-paste) |
| pcb | `uSize` mobile | 8 (default) | `shader.sizeMobile` | 4 | Should-fix D8 (architectural — SoleMD adds per-uniform mobile override alongside `scaleFactorMobile`) |

All three presets are missing `positionMobile` keys (D11) and `mousemove` (D10). All 9 non-homepage Maze scenes are sanctioned omissions.

### How to rebuild / what to change

- Walk D1–D8 in order. D1/D4 are product-or-parity decisions; pick one and record inline. D2/D3/D5/D6 require cross-checking shader semantics with `BlobController` / `StreamController` / `ObjectFormationController` tween paths — the `*Out` uniforms are either raw uniforms or scalar multipliers. This bleeds into B4 and B6; do not resolve in isolation.
- D7 must trace the commit that introduced `pcb.scrollRotation = [0, 0.12, 0]`. If no product rationale, zero it.
- Add a one-line comment at the top of `visual-presets.ts` listing the effective Maze defaults (`cs.default` values) so future auditors can verify inherited values without cross-referencing this spec.

### Sanctioned deviations

- **Asset-pipeline band relocation** (`countFactor`, `vertexRandomness`, `textureScale`, `thickness`, `layers`, `gridRandomness`) — moved from `cs[slug]` into per-call options on `FieldGeometry.fromTexture`/`fromVertices`. Documented in `maze-asset-pipeline.md § "Maze defaults"`.
- **Inactive-scene omissions** (9 scenes). SoleMD is homepage-first.
- **Funnel uniforms + color pair moved from `gd.getMaterial` factory to preset data**. Centralizes all per-scene tuning in one file. `maze-shader-material-contract.md` covers the shader half.
- **SoleMD-invented floor values** (`alphaDiagramFloor`, `selectionHotspotFloor`) — Round-9-era product decision to keep blob silhouette readable through diagram chapter.
- **`rotationVelocity` scalar per preset** replaces Maze's hard-coded `+= 0.001` per frame (at 60 fps = 0.06 rad/sec).
- **No `cs.default` prototype-merge entry**. Explicit per-preset shape is the authoritative contract; do **not** reintroduce a default base.

### Cross-reference

`b03-scene-params.md § "Parity matrix"` (per-preset tables), `b03-scene-params.md § "Open questions"` (7 items for Phase 4 / future review), `maze-asset-pipeline.md` (asset-band relocation), `maze-shader-material-contract.md` (shader-side color + funnel pipeline).

## 4. Material + geometry shader pipeline — B4

**Maze**: scripts.pretty.js:42545–42632 (`gd` shader material factory), 42633 (`Fl = gd` alias), 42666–42940 (`jo` geometry generator), 42583–42593 (stream funnel uniforms), `index.html:2119–2393` (inline GLSL). ~360 lines.
**SoleMD**: `apps/web/features/field/renderer/field-shaders.ts`, `renderer/FieldScene.tsx` (R3F `<shaderMaterial>` seam), `controller/FieldController.ts` (`createLayerUniforms`), `asset/field-geometry.ts` (`sphere`, `stream`, `fromTexture`, `fromVertices`), `asset/field-attribute-baker.ts`, `asset/point-source-registry.ts`, `asset/image-point-source.ts`, `asset/model-point-source.ts`.

### Shader parity

High, close-to-verbatim. Same `fbm(vec4(x, uTime))` noise, same `(1 + uAmplitude * vNoise)` amplitude multiply, same `aMove * aSpeed * snoise_1_2(...)` drift, same stream conveyor/funnel block, same mobile 90° XY rotation, same distance-based `gl_PointSize` and `vAlpha`, same fragment sprite multiply. Two deliberate divergences are **strict improvements**: six scalar color uniforms (`uRcolor`/`uGcolor`/`uBcolor`/`uRnoise`/`uGnoise`/`uBnoise`) collapsed into two `vec3` (`uColorBase` / `uColorNoise`) — this **removes Maze's blue-channel typo** (`uBnoise - uGcolor`) by construction; and sub-threshold-alpha `discard` in the fragment stage (pure performance win).

### Geometry drift items

| Drift | Severity | Source |
|---|---|---|
| `fromTexture` first-layer depth collapses in Maze (layer 0 → z=0 pair); SoleMD spreads across `[-thickness, +thickness]` | **Should-fix (product decision)** | `b04-material-geometry.md § D1` |
| `fromTexture` drops Maze's sentinel bounding-box points `(0,0,0)` and `(w,h,0)` | Should-fix (parity-critical when `updateScale` divides by raster height) | `b04-material-geometry.md § D2` |
| `fromVertices` uses centered jitter `(random-0.5)*pR`; Maze uses positive-only `random()*pR` | Nice-to-have (SoleMD is more correct) | `b04-material-geometry.md § D3` |
| `fromModel` — Maze captures only last mesh; SoleMD concatenates all meshes | Doc-only (SoleMD is correct; Maze quirk) | `b04-material-geometry.md § D5` |
| `fillWithPoints` volumetric primitive not implemented | Nice-to-have (no consumer) | `b04-material-geometry.md § D6` |
| `aMove` distribution: Maze `random() * (±1) * 30` (triangular); SoleMD `(random*2-1) * 30` (uniform) | Nice-to-have (PDF diff, visible only in stillness count) | `b04-material-geometry.md § D8` |
| `pointTexture` — Maze PNG asset; SoleMD procedural canvas gradient | Should-fix (falloff mismatch propagates to hotspot readability) | `b04-material-geometry.md § D11` |
| `vertexColors: true` dropped; `depthWrite: false` added | Doc-only (live shader doesn't read `color`; `depthWrite:false` is belt-and-braces) | `b04-material-geometry.md § D10` |

### SKILL doc regression (urgent doc-only fix)

**`maze-shader-material-contract.md` is out of date.** It documents a retired `uBaseColor: vec3` + `uBucketAccents: vec3[4]` + `aBucket`-indexed burst-overlay uniform family and a five-uniform `uBurstType`/`uBurstStrength`/`uBurstColor`/`uBurstRegionScale`/`uBurstSoftness` block. The shipped shader is the single-pair `uColorBase` + `uColorNoise` model; no bucket-accent array, no burst-overlay uniforms. The rainbow cycle comes from `BlobController` tweening `uColorNoise` through `LANDING_RAINBOW_RGB`. **Action**: update `maze-shader-material-contract.md § "Uniform Family"` to describe the single-pair model; move the "SoleMD burst overlay uniforms" section to a "Retired (Round 14)" appendix. Tracked as D-DOC1 in `b04-material-geometry.md`.

### How to rebuild / what to change

- **D1**: decide product intent for `fromTexture` first-layer depth. Gate `thickness * (layer + 1)` behind `spreadFirstLayer: false` default to preserve Maze behavior, or accept the current depth spread as intentional. Current PCB path does not hit the code.
- **D2**: restore sentinel points behind `appendExtents: true` default before any future image-backed layer wires `updateScale`.
- **D11**: render both sprites at the same `gl_PointSize` and compare alpha profile along diameter. If divergent by >5% at any radius, either ship Maze's `particle.png` or tune procedural falloff.
- **D-DOC1**: update `maze-shader-material-contract.md` this round.

### Canonical pattern reinforcement

Per the memory policy: **hijack native pipeline uniforms for visual changes instead of adding overlays or parallel subsystems**. The shipped shader already expresses blob rainbow motion through `uColorNoise` tween — this is the correct grammar. Do not add a parallel burst overlay pipeline to re-achieve the same effect; extend the uniform set or reuse `uColorNoise`.

### Cross-reference

`b04-material-geometry.md § "Drift items"` (11 items + D-DOC1), `maze-shader-material-contract.md` (needs update), `maze-asset-pipeline.md § "Count-Factor Quirk"`, `image-particle-conformation.md` (image→particle primitives).

## 5. Asset registry + bitmap/FBX sources — B5

**Maze**: scripts.pretty.js:42133–42343 (`fm` OBJ), 42344–42398 (`md` FBX/image loader), 42941–43012 (`vd` URL-keyed registry + `ku` loader). ~340 lines.
**SoleMD**: `apps/web/features/field/asset/point-source-registry.ts` + `image-point-source.ts` + `model-point-source.ts` + `field-geometry.ts` + `field-attribute-baker.ts` + `point-source-types.ts`.

### Architectural split (sanctioned)

Maze: `vd` URL dictionary + `ku` async loader → `jo.fromTexture`/`fromVertices`/`generate` + `jo.addParams` → `geometry.center()` → `Fl.getMaterial("Shader", slug)` → wraps in `Ts` (`THREE.Points`) → caches `{ model: THREE.Points }` by slug. `ku.loadAll()` is a single eager Promise.all called from `Os`/`xi` at boot.

SoleMD: slug-keyed lazy in-memory cache `FieldPointSourceRegistry` emitting **typed-array buffers** (position + baked attributes), not materialized meshes. Keyed on composite `env:density:id` (mobile/desktop + density scale + slug). Materializes on demand during `resolve({ densityScale, isMobile, ids })`. Idempotent `prewarm(...)` equivalent to opportunistic `resolve(...)`. Material construction lives in `renderer/*`, not asset/*.

### Preload contract parity: **partial**

| Match | Diverge |
|---|---|
| Idempotent warm on re-entry | No `loadAll` entry point (scoped to named ids) |
| Deterministic emission | No async boundary (sync because all current sources are procedural) |
| Shared attribute injection runs before consumer sees buffer | No per-slug rebuild (only `registry.clear()`) |
| | No ready-signal / error surface equivalent to `loadAll` rejection |

**The parity gap surfaces the moment a URL-backed slug lands.** Until then, the contract is sufficient for the current homepage. When any of `pcb` (URL-backed), model-backed slugs (`shield`/`cubes`/`hex`/`globe`/`users`), or FBX/OBJ inputs become live, D1/D3/D9 from `b05-asset-registry.md` all graduate to Must-fix together.

### How to rebuild / what to change

- **Before any URL-backed slug lands**: formalize `POINT_SOURCE_MANIFEST: Record<slug, { source: "procedural" | "image" | "model"; url?: string; samplingPresets?: TextureGeometryOptions }>` in `point-source-registry.ts` (or sibling `asset-manifest.ts`). Use explicit `source` discriminant, not Maze's `.split(".").pop()` extension switch.
- **Add `loadAll({ densityScale, isMobile })`** when the first async source lands. Have it walk every id in `FIELD_STAGE_ITEM_IDS`. Change `resolve` to `Promise<Record<slug, source>>` on the async branch.
- **Add model loader module** `features/field/asset/model-loader.ts` owning `GLTFLoader` construction + error handling + `loadModelPoints(url, options) → Promise<THREE.BufferGeometry>`. Do not re-port `md`; use three's first-party `GLTFLoader`.
- **When pcb URL-asset parity is restored**, route through `createImagePointGeometry` with `{ channel: "r", colorThreshold: 200, textureScale: 0.5, gridRandomness: 0, thickness: 0, layers: 1 }` and drop the hand-authored bitmap. Table these as `samplingPresets[id]` in the manifest.

### Sanctioned deviations

- Registry emits buffers, not meshes (material lives in renderer).
- Scope narrowed to homepage slugs; `createModelPointGeometry` primitive is already implemented for future slugs.
- pcb is procedural (`buildPcbBitmap()`), not URL-backed — coincident ±z emission at `thickness=0, layers=1` matches Maze.
- Deterministic seeding via `createRandomSource(FIELD_SEED + offset)`.
- Integer `countFactor` undershoot fix — SoleMD emits the full count for integer `countFactor`; pass `countFactor - 1` for Maze-exact.
- `channel: 'luma'` extension on `fromTexture` for medical imagery.
- Env-keyed cache entries (mobile/desktop parallel warm-up).

### Cross-reference

`b05-asset-registry.md § "Drift items"` (10 items), `b05-asset-registry.md § "Asset-key parity audit"` (9-slug disposition table), `maze-asset-pipeline.md` (canonical pipeline), `image-particle-conformation.md` (authoring checklist before adding image/model layers).

## 6. Base controller + concrete controllers — B6

**Maze**: scripts.pretty.js:35565–35617 (`Ll` event emitter + `Ei` DOM controller base); 43013–43256 (`yr` particle base); 43257–43526 (`mm` blob); 43527–43528 (`gm` stub); 43529–43580 (`xm` floor/graph); 43581–43614 (`ym` hotspot-popup); 43615–43632 (`_m` pcb); 43633–43654 (`bm` user/quote); 43655–43703 (`Sm` stars); 49326–49346 (`ug` stream). Three-layer class tree.
**SoleMD**: `apps/web/features/field/controller/FieldController.ts` (base, fuses `Ei` + `yr`), `BlobController.ts`, `StreamController.ts`, `ObjectFormationController.ts`. Two-layer tree.

### Parity — base layer

`FieldController` collapses Maze's `Ei` + `yr` responsibilities into one class. `Ll` event emitter is sanctioned-omitted (React composition). 10 hooks fold into `tick(FrameContext)` + `destroy()`. Verified in `b06-controllers.md § "Lifecycle hooks ... missing from SoleMD"`.

### Drift items (must-fix / should-fix)

| Drift | Severity | Source |
|---|---|---|
| `updateVisibility` method exists on `FieldController` but has no active caller; dead code | **Must-fix (silent failure mode)** | `b06-controllers.md § D1` |
| `toScreenPosition` does not divide by pixel ratio; HiDPI bug for DOM overlays | **Must-fix** (affects retina/Android DPR 2.5–3) | `b06-controllers.md § D3` |
| Lifecycle naming: `updatePosition` / `updateRotation` / `updateMaterial` folded into `tick()` without named hooks | Should-fix (doc; add section comments inside each subclass tick) | `b06-controllers.md § D2` |
| `animateIn` / `animateOut`: no `fromTo` seeding, no `rotateAnimation` branch, no `wrapper.visible` flip, no Promise return | Should-fix (base method partial; subclass paths work) | `b06-controllers.md § D4` |
| `setInitialParameters` distributed across `createLayerUniforms` + first-tick seeds | Should-fix (architectural naming) | `b06-controllers.md § D10` |
| `StreamController.ts:126–127` comment incorrectly claims Maze `ug` tweens `uWave` — `uWave` is on `xm`, not `ug`. Comment correction only. | Doc-only | `b06-controllers.md § D8` |

### Sanctioned deviations

1. `Ll` event emitter → React composition.
2. `Ei` absorbed into `yr` → `FieldController` merge.
3. Five concrete controllers omitted (`gm`, `xm`, `ym`, `bm`, `Sm`) — homepage inventory only declares `blob`/`stream`/`pcb`.
4. `destroy()` does not traverse scene graph — R3F owns GPU resource lifecycle.
5. `BlobController` uses direct candidate-index projection instead of Maze's `Wh(1,16,16)` mesh-proxy pool. SoleMD is a **superset** (card mode, grace window, per-slot `cycleDurationMs`).
6. `BlobController.startColorCycle` rainbow tween through `LANDING_RAINBOW_RGB` — SoleMD-specific aesthetic.
7. `field-loop-clock` singleton drives `uTime`; replaces Maze's per-frame `+= 0.002`.

### How to rebuild / what to change

- **D1 (Must-fix)**: landing no longer treats controller-local ScrollTrigger
  timelines as the authority. Shared chapter progress now lives in
  `field-scroll-state.ts`, and controllers read declarative chapter
  targets during `tick()`. Keep `updateVisibility` only as a fallback seam for
  future non-landing surfaces that truly cannot use the shared scroll-state
  contract.
- **D3 (Must-fix)**: divide `toScreenPosition` x/y results by `renderer.getPixelRatio()` when projecting for DOM overlays. Apply the same fix to `BlobController.projectBlobHotspotCandidate` (`BlobController.ts:146–172`) — same bug, masked because the blob hotspot pool uses the candidate projector directly rather than the base method.
- **Every future `FieldController` subclass** should prefer the shared
  chapter-progress contract. Only add controller-local scroll listeners when a
  surface is intentionally outside the fixed-stage runtime.

### Mobile branching parity

Partial. `scaleFactorMobile`, `positionMobile`, `uIsMobile` writes, mobile particle counts (stream 15k → 10k), and the `168` mobile scale constant all match. The D3 HiDPI `toScreenPosition` fix closes the remaining gap.

### Cross-reference

`b06-controllers.md § "Drift items"` (10 items), `b06-controllers.md § "Mobile branching parity"` table, `b06-controllers.md § "Top regression risk"` (D1+D3 combined failure mode), `maze-particle-runtime-architecture.md` (controller hierarchy + R3F boundary).

## 7. Scroll adapter registry (`$x` + 7 chapter adapters + stream popups) — B8 + B9

**User-flagged P0 gap lives here.** The stream DOM motion-path + popup subsystem (`KS` at scripts.pretty.js:48911–49035) is the most visible missing feature on SoleMD landing. B8 (adapter registry + 6 other chapters) and B9 (stream popups) are grouped because they are both DOM-side scroll choreography that the app shell dispatches through the same `$x` registry.

### B9 — Stream DOM motion-path + popups (USER-FLAGGED, P0)

**Maze**: scripts.pretty.js:48911–49035 (`KS`, 125 lines) + `index.html:564–712` (stream shell + 8 `.js-stream-point` + 1–3 `.js-stream-point-popup` per point) + 2 SVG rails (`flow-diagram-main.svg` + mobile variant) with path IDs `kdc`, `function`, `fpt`, `access`, `json`, `fou`, `image`, `framebuffer`. 8 motion paths, 3 of 8 points are `popup--red` (access/json/fou) representing exploitable findings.
**SoleMD counterpart**: **Missing — large (P0 blocker for stream chapter parity).** `StreamController` owns the WebGL particle conveyor (wrapper z-tween + uniforms) but the `.c-stream` shell, SVG rails, markers, and popups do not exist.

**DOM-vs-WebGL ownership boundary**: `ug` (WebGL) and `KS` (DOM) share only the anchor element. They do **not** share runtime state. The SoleMD rebuild must **not** grow `StreamController` to own the DOM rail. The DOM adapter is a parallel surface adapter at the same anchor that runs a React-owned GSAP timeline.

#### 11-step rebuild checklist (from `b09-stream-popups.md § "Rebuild checklist"`)

1. **Author the marker config module** — `surfaces/FieldLandingPage/stream-point-manifest.ts`. 8 entries, each `{ id, domOrder, scheduleOrder, variant: "red"|"default", popups: [{ category?, name, label?, side?, mobileSide? }] }`. `scheduleOrder` is the canonical integer multiplier for timeline offset (replaces Maze's `o` enum).
2. **Rail SVG pair as React components with explicit path ids** — `surfaces/FieldLandingPage/stream-rail-svg.tsx` exporting `<StreamRailDesktop />` and `<StreamRailMobile />`. Each `<path>` carries `id={pointId}`. ViewBox parity (`1204×535` desktop, `345×653` mobile).
3. **DOM marker primitive** — `overlay/StreamPoint.tsx` rendering the point equivalent with SoleMD token classes. Reuse the existing `overlay/FieldHotspotRing.tsx` primitive.
4. **Popup primitive** — `overlay/StreamPointPopup.tsx` with `data-variant` / `data-side` / `data-mobile-side`. Styling in `stream-point-popup.css` under `afsp-` prefix (parallel to hotspot-ring's `afr-`).
5. **Chapter shell component** — `surfaces/FieldLandingPage/StreamChapterShell.tsx`. Owns `data-scroll="stream"` anchor, renders both rails, maps manifest to 8 `<StreamPoint>` children with refs.
6. **Motion-path timeline adapter** — `scroll/chapters/landing-stream-chapter-points.ts`. `bindStreamPointTimeline(rootEl, manifest, options): () => void`. Register `MotionPathPlugin` via `ensureGsapMotionPathRegistered()` helper. One ScrollTrigger (`start: "top bottom"`, `end: "bottom top"`, `toggleActions: "play pause resume reset"`, `invalidateOnRefresh: true`). Master `gsap.timeline({ repeat: -1, scrollTrigger })`. `gsap.matchMedia()` branches for desktop (`(min-width: 1024px)`) and mobile. Per manifest entry, child sub-timeline with same call grid as `KS`: marker visibility, motionPath `.from` tween (duration `unit * 3`, `align`/`alignOrigin`/`ease: "none"`), cascaded popup show/hide at `0, unit, unit*2, unit*3` with 2-popup/3-popup switches preserved, `scheduleOrder * unit` offset.
7. **Wire adapter into scroll registry** — extend `scroll/field-scroll-driver.ts` (or the chapter-registration seam it exposes) to call `bindStreamPointTimeline` when a `[data-scroll="stream"]` anchor mounts.
8. **Mount chapter shell on landing** — sibling to `StreamController` WebGL anchor. Shell carries `data-scroll="stream"`, stage mount carries `data-gfx="stream"`. **Must not be the same React node** (Maze co-mounts only because of its flat DOM model).
9. **Reduced-motion fallback** — timeline adapter short-circuits on `prefers-reduced-motion: reduce` and adds `is-reduced-motion` on the shell so CSS can statically show popups.
10. **Manifest validation** — assert 8 entries, unique `id`s matching the 8 path ids, `scheduleOrder` forms a permutation of `0..7`.
11. **Document hybrid chapter contract** — note in `maze-stage-overlay-contract.md` (or new `references/stream-chapter-hybrid.md`) that the stream chapter is the canonical hybrid example: WebGL conveyor + DOM rail + SVG motion geometry on the same anchor, two independent adapters, shared manifest, no shared runtime state.

#### B9 sanctioned deviations (from rebuild plan)

- Replace positional path-id coupling with authored `id` attributes on each `<path>`.
- Replace `.js-*` selector contract with refs + `data-*` attributes.
- Separate `data-gfx` and `data-scroll` anchors into sibling React nodes.
- Do not copy Maze class names; use `afsp-` prefixed SoleMD tokens.
- Do not copy Maze popup copy (vulnerability requirements) — SoleMD authors its own biomedical-pipeline narrative.
- Keep `toggleActions: "play pause resume reset"` (auto-playing loop) rather than scrubbed — matches Maze choice.

### B8 — Adapter registry + 6 homepage-active chapters

**Maze `$x`**: scripts.pretty.js:49102–49113. 10 keys; 6 homepage-active (`welcome`, `moveNew`, `clients`, `graphRibbon`, `events`, `cta`); `stream` split to B9; `move`, `contact`, `intro` non-homepage.
**Consumer**: `jt.setup()` at 49176–49191 scans `[data-scroll]`, maps to `{ el, type, delay, quick }`, then `$x[type](e.el, e.delay, e.quick)`. `delay`/`quick` args are declared but ignored by every homepage adapter — Maze smell; **do not port**.

#### Registry port recommendation (locked)

**Do not port `$x` as a JS object + DOM-scan lookup.** Expose a React-side hook-based chapter adapter contract (`b08-scroll-adapters.md § "Registry port recommendation"`):

- `apps/web/features/field/scroll/chapter-adapters/`
  - `types.ts` — `export type ChapterAdapter = (el: HTMLElement, opts: { reducedMotion: boolean }) => { dispose(): void }`
  - `registry.ts` — `export const fieldChapterAdapters: Record<FieldChapterKey, ChapterAdapter>` (typed record keyed by `"welcome" | "moveNew" | "clients" | "graphRibbon" | "events" | "cta"`)
  - `useChapterAdapter.ts` — `export function useChapterAdapter(ref: RefObject<HTMLElement>, key: FieldChapterKey): void`
  - one file per adapter

Each chapter component calls `useChapterAdapter` with its own ref. No DOM scan. Registry is tree-shakeable. Abandon `(el, delay, quick)` signature — use `(el, { reducedMotion })`.

#### Per-adapter inventory

- **welcome** (`JS`, 49037–49066): GSAP timeline with word-split title/subtitle + scaled-in button. On-load, no ScrollTrigger. Adds `is-welcome-ready` on body on complete. **SoleMD counterpart**: `FieldHeroSection.tsx` (partial — paragraph-grain, not word-grain; no `is-welcome-ready` broadcast; eyebrow is sanctioned addition).
- **moveNew** (`QS`, 49069–49099): mobile-only marquee, `gsap.matchMedia().add("(max-width: 1023px)", ...)`. **SoleMD**: missing (scope question).
- **clients** (`HS`, 48597–48614): `gsap.from(.js-item, {...scale:0.8...})` with breakpoint+attribute-conditional stagger. **SoleMD**: missing (scope question).
- **graphRibbon** (`qS`, 48732–48832): multi-target scroll-triggered timeline, SVG clip-path draw-ins, debounced resize→refresh. **SoleMD**: `FieldGraphSection.tsx` exists but wraps live Cosmograph warm-up, not SVG ribbon reveal (sanctioned product divergence + choreography gap).
- **events** (`WS`, 48665–48731): nested timeline per `.js-event-subitem`, DrawSVG checkmark stroke-in, `"-=0.35"` overlap. **SoleMD**: missing (DrawSVG is paid GSAP Club; Framer Motion `pathLength` is the sanctioned alternative).
- **cta** (`GS`, 48639–48663): same structural timeline as `JS` welcome + scroll-triggered. **SoleMD counterpart**: `FieldCtaSection.tsx` (partial — paragraph-grain, flat button stagger).

#### B14 typography reveal (folded into B8)

SplitText (`lo`) consumers: welcome word-split, cta word-split, contact line-split, intro word-split. **Primary SoleMD counterpart**: promote `apps/web/features/animations/_smoke/text-reveal/TextReveal.tsx` out of `_smoke` to `features/animations/text-reveal/` (project-wide primitive). Parameterize `text`, `grain: "chars" | "words"`, `stagger`, `ease`, `as`, `trigger: "mount" | "in-view" | "scroll"`. Wire into Hero+CTA.

#### B8 drift items (roll-up)

| Drift | Severity | Source |
|---|---|---|
| D1 — Hero/CTA text reveal is paragraph-grain, not word/char-grain | **Should-fix** | `b08-scroll-adapters.md § D1` |
| D2 — No `is-welcome-ready` broadcast | Nice-to-have | `b08-scroll-adapters.md § D2` |
| D3 — Hero eyebrow is sanctioned addition | N/A (sanctioned) | `b08-scroll-adapters.md § D3` |
| D4/D5/D8 — No moveNew/clients/events chapters | Doc-only pending scope decision | `b08-scroll-adapters.md § D4–8` |
| D6 — No composed multi-target graph chapter reveal | Should-fix | `b08-scroll-adapters.md § D6` |
| D7 — No clip-path draw-in for SVG paths | Nice-to-have | `b08-scroll-adapters.md § D7` |
| D9 — No DrawSVG (paid plugin) | Doc-only (use Framer `pathLength`) | `b08-scroll-adapters.md § D9` |
| D10 — Nested-timeline-per-child pattern unused | Nice-to-have | `b08-scroll-adapters.md § D10` |
| D11 — CTA button stagger is flat, not staggered | Nice-to-have | `b08-scroll-adapters.md § D11` |
| D12 — No hook-based chapter adapter contract exists | **Should-fix** (enables D1, D6, D11, etc.) | `b08-scroll-adapters.md § D12` |
| D13 — TextReveal primitive in `_smoke`, not production | Should-fix | `b08-scroll-adapters.md § D13` |
| D14 — No shared debounced-resize→refresh | Doc-only (ScrollTrigger's native resize suffices) | `b08-scroll-adapters.md § D14` |
| D15 — `quick`/`delay` args are Maze smell; do not port | Doc-only (anti-port) | `b08-scroll-adapters.md § D15` |

### Cross-reference

`b09-stream-popups.md § "Rebuild checklist"` (11 steps, authoritative), `b09-stream-popups.md § "Verification criteria"`, `b08-scroll-adapters.md § "Registry port recommendation"`, `b08-scroll-adapters.md § "Per-adapter inventory"`, `animation-authoring` skill for Framer Motion patterns.

## 8. Scroll ownership (scroll driver `jt` / `Jr`) — B10

**Maze**: scripts.pretty.js:49115–49325 (`jt` class, ~212 lines). Page-global singleton owning scroll, body-class state, hash-click, scroll caching, IntersectionObservers.
**SoleMD**: `apps/web/features/field/scroll/field-scroll-driver.ts` (~114 lines). Landing-surface-only function-based binding with disposer.

Pilot-audited in Phase 0 and re-verified in Phase 3 (`b10-scroll-driver-reverify.md`). All 6 pilot drift items confirmed; no false positives; no already-fixed items.

### Drift items (confirmed)

| Drift | Severity | Status |
|---|---|---|
| D1 — Singleton class vs. function-based API | Should-fix (document; do not port page-global singleton) | confirmed |
| D2 — No scroll-state body classes (`is-scrolled`, `is-scrolling-down`, `is-scrolled-vh-*`, `is-scrolled-header-height`) | **Re-severity: Should-fix / delegated-to-shell** (not scroll-driver's job) | confirmed |
| D3 — No scroll-position caching per pathname | Should-fix / delegated to router or shell | confirmed |
| D4 — No hash-click navigation handler with `data-offset`/`data-duration` overrides | Nice-to-have / surface-local | confirmed |
| D5 — No `[data-observe]` / `.js-progress` IntersectionObservers | Should-fix / delegated-to-shell utility | confirmed |
| D6 — No viewport-fraction thresholds (fold into D2 fix) | Nice-to-have | confirmed |

**Latent Maze bug**: the second IntersectionObserver constructed at Maze line 49224 is never observed against (line 49229 calls `this.observer.observe(e)` — the first observer, not `n.observe(e)`). The SoleMD rebuild should **consolidate to one `bindDomStateObservers` utility**, which is strictly more consolidated than Maze's two-observer pattern.

### Driver enhancements post-pilot (N1–N4)

- **N1**: `--ambient-hero-progress` CSS custom-property writer at driver line 79–90 is SoleMD-native; no Maze counterpart (Maze's progress is `gg`).
- **N2**: post-bind `ScrollTrigger.refresh()` at line 106 with explicit block comment. Sanctioned adaptation for React's synchronous mount model.
- **N3**: reduced-motion branch pins `blob.visibility = 1` and `--ambient-hero-progress = 0`, skipping ScrollTrigger construction. Parity with Maze's `matchMedia("(prefers-reduced-motion: no-preference)")` gate, cleaner.
- **N4**: `sceneStateRef` bridge for cross-controller progress observation — SoleMD-native architectural choice.

### How to rebuild / what to change

- Author `apps/web/app/shell/bind-shell-state-classes.ts` (shared with B2 body-class drift). Exports:
  1. `is-loaded` on DOMContentLoaded.
  2. `is-resizing` with 250 ms debounce.
  3. `is-scrolled`, `is-scrolling-down` toggles.
  4. `is-scrolled-vh-{25,50,75}` viewport-fraction (configurable via `vpFractions` option).
  5. `is-scrolled-header-height` threshold.
- Author `apps/web/app/shell/bind-dom-state-observers.ts` with one generic IntersectionObserver (not two) covering `[data-observe]` / `[data-observe="children"]` → `is-in-view` / `is-above` / `is-below` class toggles.
- Defer scroll-position caching + hash-click navigation to router / shell / landing-surface-local adapters; do not grow the field scroll driver.

### Sanctioned deviations (all three re-confirmed against SKILL.md)

1. Scroll-driver is now a shared chapter-progress producer for the fixed stage,
   not a delegate into controller-local timelines.
2. No scroll caching at scroll-driver level (router/shell concern).
3. Shell-level body-class observers still live outside the field scroll
   driver.

### Cross-reference

`pilot-scroll-controller.md` (original pilot audit), `b10-scroll-driver-reverify.md § "Tally"` (6 confirmed), `b10-scroll-driver-reverify.md § "New findings"` (N1–N5), SKILL.md § "Canonical Layer Ownership" § 1 Stage layer.

## 9. Progress controller (`gg`) — B12

**Maze**: scripts.pretty.js:50178–50255 (78 lines) + `index.html:323` (story-1) + `index.html:718` (story-2). **Two live instances.**
**SoleMD**: `apps/web/features/field/surfaces/FieldLandingPage/FieldStoryProgress.tsx` (102 lines). **One live instance** (Story 1 only).

### Parity-critical drift items (Must-fix / Should-fix)

| Drift | Severity | Source |
|---|---|---|
| D1 — Only one progress instance mounted; story-2 has no progress rail | **Must-fix** (plan hard rule; parity-critical) | `b12-progress.md § D1` |
| D2 — CSS custom property names + scope mismatch (`--progress-N` on root vs. `--ambient-story-progress` per segment); `--bar-width` missing | **Must-fix** (programmatic contract, not brand class name) | `b12-progress.md § D2` |
| D3 — GSAP `.to()` smoothing absent (value assigned directly; no CSS transition; `fieldLoopClock` throttling ≠ smoothing) | Should-fix | `b12-progress.md § D3` |
| D4 — Desktop-only runtime gate missing (component runs measurements on mobile, Tailwind only hides DOM) | Should-fix | `b12-progress.md § D4` |
| D5 — `calculateSectionProgress()` algorithm different (35% focus-line vs. Maze 50% pivot; no header offset) | Should-fix (parity-critical for visual pacing) | `b12-progress.md § D5` |
| D6 — `is-active` root class not toggled | Should-fix | `b12-progress.md § D6` |
| D7 — `activeSection` computation uses last-nonzero instead of `floor(Σ progresses) + 1` | Should-fix | `b12-progress.md § D7` |
| D8 — Scroll-driver binding uses `fieldLoopClock` throttle instead of raw scroll + GSAP smoothing | Nice-to-have (couples with D3) | `b12-progress.md § D8` |

### How to rebuild / what to change

- **D1 (Must-fix)**: either (a) promote `FieldStoryChapter` to own Story 2 with its own `beatIds` array, or (b) mount `<FieldStoryProgress beatIds={storyTwoBeatIds} />` directly inside Story 2 `<section>`. Verify both instances update independently.
- **D2 (Must-fix)**: rename writes to `--progress-${index + 1}`, target the root container ref, batch-write all N variables to that single node each tick. Measure `.js-progress-bar` (or SoleMD equivalent) once per resize and publish `--bar-width` on root. Class names are sanctioned-divergent; **CSS custom property names are the programmatic contract and must match Maze**.
- **D3**: route through `gsap.to(root, { "--progress-1": v1, "--progress-2": v2, ..., duration: 0.1, ease: "sine" })`. Mirrors Maze exactly. Remove `fieldLoopClock` subscription when GSAP becomes the smoothing layer (D8).
- **D5**: port Maze's algorithm verbatim — 50% pivot, `header.offsetHeight` subtraction, section-height normalization. Use SoleMD shell chrome ref for header (likely tied to `APP_CHROME_PX.panelTop`).

### Sanctioned deviations

- No `data-component` / component-registry activation (React props-driven).
- Tailwind `hidden lg:flex` replaces `desktop-only` class (aesthetic only; runtime desktop gate D4 is **not** sanctioned).
- No standalone `Ei` base class; progress is a function component.

### Cross-reference

`b12-progress.md § "Drift items"` (8 items), `b12-progress.md § "Open questions"` (6 items), SKILL.md § "DOM And Component Equivalence Map" (`.s-progress` → "runtime-owned sticky progress component"), SKILL.md § "SoleMD Aesthetic, Maze Motion" ("smooth scrubbed progression instead of section-burst swaps").

## 10. Chrome + component registry (`Rg` / `xy` / `yy`) — B13

**Maze**: scripts.pretty.js:55180–55283 (registry) + 55043–55132 (`Cg` Header) + 53996–54050 (`wg` SwiperSlider). 11 component classes in `xy`; 3 homepage-active.
**SoleMD**: chrome components under `apps/web/features/graph/components/chrome/*` (`ChromeBar.tsx`, `BrandWordmarkButton.tsx`, `Wordmark.tsx`, `ModeToggleBar.tsx`, `ThemeToggle.tsx`, `TimelineBar.tsx`). No DOM-scan registry.

### Full disposition table (answer to catalog Open Question #1)

| Maze `xy` entry | Maze class | Homepage-active | SoleMD counterpart | Disposition |
|---|---|---|---|---|
| `Header` | `Cg` | yes | `ChromeBar` + `BrandWordmarkButton` + `Wordmark` + `ModeToggleBar` + `ThemeToggle` + `TimelineBar` | **sanctioned product divergence** — graph-UI toolbar, not marketing nav; no underline port |
| `Progress` | `gg` | yes (×2) | `FieldStoryProgress.tsx` | **~1:1 port** (see B12 § 9) |
| `SwiperSlider` | `wg` | yes | *none* | **sanctioned omission** — no marketing carousel on SoleMD homepage |
| `FormsPagination` | `fg` | no | *none* | sanctioned omission — no multi-step forms |
| `ArticleNav` | `pg` | no | *none* | sanctioned omission — no article routes |
| `Product` | `Sg` | no | *none* | sanctioned omission — no product-listing |
| `Load` | `Mg` | no | *none* | sanctioned omission — no paginated lists |
| `Sort` | `Tg` | no | *none* | sanctioned omission — no sortable lists |
| `More` | `mg` | no | *none* | sanctioned omission — pattern unused |
| `Toggle` | `Eg` | no | *none* (Mantine `Collapse`) | sanctioned omission — Mantine primitive suffices |
| `ShareArticle` | `Ag` | no | *none* | sanctioned omission — no article routes |
| `Rg` (page class in `yy`) | `Rg` | n/a | *none* — Next.js App Router pages | sanctioned architectural deviation |

**Bottom line**: 1 1:1 port (Progress, owned by section 9), 1 sanctioned product divergence (Header → graph-UI chrome), 9 sanctioned omissions.

### Drift items

| Drift | Severity | Source |
|---|---|---|
| D1 — No DOM-scan component registry in SoleMD | Delegated (sanctioned) | `b13-components-chrome.md § D1` |
| D2 — Header (`Cg`) sliding-underline vs. pill+tray chrome | Delegated (sanctioned product divergence) | `b13-components-chrome.md § D2` |
| D3 — `SwiperSlider` has no SoleMD counterpart | Delegated (sanctioned omission) | `b13-components-chrome.md § D3` |
| D4 — `Progress` cross-ref only (see section 9) | Cross-reference | `b13-components-chrome.md § D4` |
| D5 — 8 non-homepage component slots sanctioned-omitted | Delegated | `b13-components-chrome.md § D5` |

### How to rebuild / what to change

- **None required at the chrome layer.** All drift is architectural or sanctioned product divergence.
- Build-spec rule: "SoleMD chrome is a graph-UI toolbar, not a marketing nav. Maze's `Cg` sliding-underline is not to be ported; SoleMD's active-mode highlight lives in `ModeToggleBar` (background fill + expand-label) and `aria-pressed` on pill buttons in `ChromeBar`." Any future marketing nav is greenfield, not a `Cg` port.
- Build-spec rule: if a future SoleMD route needs a carousel, introduce it as greenfield (Embla / CSS scroll-snap / Swiper) — do not port `wg`.

### Cross-reference

`b13-components-chrome.md § "Full disposition table"`, `b13-components-chrome.md § "Open questions"` (5 items), `b02-app-shell.md § "Sanctioned deviations"` item 3 (`ih.bind`), `b12-progress.md` (for Progress class body).

## 11. Typography reveal + section motion — B14 (merged into B8)

Merged into section 7 per the catalog's Phase 3 fan-out. SplitText (`lo`) is vendored (`B1`); consumption sites live inside `B8` scroll adapters.

**Primary SoleMD counterpart**: `apps/web/features/animations/_smoke/text-reveal/TextReveal.tsx`. **Recommendation**: promote out of `_smoke` to `features/animations/text-reveal/`, parameterize (`text`, `grain: "chars" | "words"`, `stagger`, `ease`, `as`, `trigger`). Wire into `FieldHeroSection` and `FieldCtaSection` via the new chapter-adapter hook (B8 D12). Reduced-motion path renders as a single static element.

Rejected candidates: `features/wiki/module-runtime/primitives/RevealCard.tsx` (not a text-split primitive; reveals a whole content block on tap), `features/wiki/module-runtime/motion.ts` (paragraph-grain variants, useful above the TextReveal primitive but not as the split counterpart).

### Cross-reference

`b08-scroll-adapters.md § "B14 — Typography reveal"`, `b08-scroll-adapters.md § D1, D13`.

## 12. Intentional deviations from Maze (consolidated sanctioned set)

Deduplicated across all 12 audits. Each entry cites the audit that first named it.

1. **Next.js App Router replaces Maze's `Fs` AJAX page-swap**. `<Link>` + RSC streaming + `router.push`/`replace`/`back` is a superset. Full Maze-step → Next.js-step lifecycle table in `b02-app-shell.md § "Sanctioned deviations" item 1`.
2. **No `yy` page-class registry** (Next.js file-based routing replaces `[data-page]` scan). `b02-app-shell.md`.
3. **No `ih.bind` component wiring** (React component tree replaces runtime scan). `b02-app-shell.md`, `b13-components-chrome.md`.
4. **Framer Motion is the primary motion substrate; GSAP scoped to field scroll-driver + chapter adapters**. `b02-app-shell.md`, `b08-scroll-adapters.md`.
5. **`useShellVariant` replaces `Qo = A1()` / `yi = _y()`** (matchMedia pointer/hover + width ≤960 px). `b02-app-shell.md`.
6. **`Ll` event emitter replaced by React composition**. `b06-controllers.md`.
7. **`Ei` + `yr` merged into `FieldController`** (two-layer tree vs. Maze's three-layer). `b06-controllers.md`, `maze-particle-runtime-architecture.md § "Controller Hierarchy And R3F Boundary"`.
8. **`jx` controller registry not ported** (React composition + static imports + compile-time safety > runtime fallback). `b07-controller-registry.md` Option A.
9. **`data-gfx` DOM scan replaced by React component tree**; `data-scroll` dispatch replaced by hook-based chapter adapter registry. `b07-controller-registry.md`, `b08-scroll-adapters.md § D12`.
10. **R3F owns renderer/scene/camera construction + resize + DPR** with identical parameters. `b11-stage-runtime.md`, `frontend-performance.md § "Core Rules #1"`.
11. **Page-global `Os.static` fields not mirrored**. `b11-stage-runtime.md`.
12. **Starfield `hg` is sanctioned-omitted** (catalog Open Questions #3/#4 — `?stars`-gated). `b11-stage-runtime.md`.
13. **Asset-pipeline band relocated** from `cs[slug]` to per-call options on `FieldGeometry.fromTexture`/`fromVertices` (`countFactor`, `vertexRandomness`, `textureScale`, `thickness`, `layers`, `gridRandomness`). `b03-scene-params.md`, `maze-asset-pipeline.md`.
14. **Inactive-scene omissions** (9 of 12 Maze scenes). `b03-scene-params.md`, `catalog.md § "Open questions" Q3/Q5`.
15. **Funnel uniforms + color pair moved from `gd.getMaterial` factory to preset data**. `b03-scene-params.md`, `b04-material-geometry.md`.
16. **Color-uniform vec3 collapse** (six scalar → two vec3; naturally removes Maze's blue-channel typo `uBnoise - uGcolor`). `b04-material-geometry.md`, `maze-shader-material-contract.md`.
17. **Fragment `discard` on sub-threshold alpha** (pure perf win). `b04-material-geometry.md`.
18. **`clamp(gl_PointSize, 1.0, 100.0)` dead statement omitted**. `b04-material-geometry.md`.
19. **`uScreen` omitted** (Maze provisions but never reads). `b04-material-geometry.md`.
20. **`aBucket` attribute + bucket relabelling** (SoleMD `paper/entity/relation/evidence`; Maze `urgentFix/patchInSLA/ignore/notExploitable`). `b04-material-geometry.md`.
21. **R3F `<shaderMaterial>` + `createLayerUniforms` replaces `gd.getMaterial` factory**. `b04-material-geometry.md`, `maze-shader-material-contract.md`.
22. **`?blending` URL param renamed to `?field-blending=additive`**. `b04-material-geometry.md`.
23. **SoleMD-invented chapter-timeline floor values** (`alphaDiagramFloor`, `selectionHotspotFloor`) — Round-9 product decision. `b03-scene-params.md`.
24. **`rotationVelocity` per-preset scalar** replaces Maze's hard-coded `+= 0.001` per frame. `b03-scene-params.md`, `b06-controllers.md`.
25. **Asset registry emits typed-array buffers, not `THREE.Points` meshes**; material lives in renderer. `b05-asset-registry.md`, `maze-asset-pipeline.md`.
26. **Asset registry scoped to homepage slugs**; `createModelPointGeometry` primitive ready for future slugs. `b05-asset-registry.md`.
27. **pcb is procedural (`buildPcbBitmap()`), not URL-backed** (coincident ±z emission preserves Maze contract). `b05-asset-registry.md`.
28. **Deterministic seeding via `createRandomSource(FIELD_SEED + offset)`**. `b05-asset-registry.md`.
29. **Integer `countFactor` undershoot fix** — pass `countFactor - 1` for Maze-exact. `b05-asset-registry.md`, `maze-asset-pipeline.md § "Count-Factor Quirk"`.
30. **`channel: 'luma'` extension on `fromTexture`** for medical imagery. `b05-asset-registry.md`.
31. **Env-keyed cache entries** (mobile/desktop parallel warm-up). `b05-asset-registry.md`.
32. **Five concrete controllers omitted** (`gm`, `xm`, `ym`, `bm`, `Sm`) — only `blob`/`stream`/`pcb` declare `data-gfx`. `b06-controllers.md`.
33. **`destroy()` does not traverse scene graph** (R3F owns GPU resource lifecycle). `b06-controllers.md`.
34. **`BlobController` uses direct candidate-index projection** instead of Maze's `Wh(1,16,16)` mesh-proxy pool. SoleMD is a superset (card mode, grace window, per-slot `cycleDurationMs`). `b06-controllers.md`.
35. **`BlobController.startColorCycle` rainbow tween through `LANDING_RAINBOW_RGB`** — SoleMD-specific aesthetic. `b06-controllers.md`.
36. **`field-loop-clock` singleton drives `uTime`** replaces Maze's per-frame `+= 0.002`. `b06-controllers.md`, `maze-particle-runtime-architecture.md`.
37. **Landing-surface-only scroll binding** — scroll-driver is not a page-global singleton. `b10-scroll-driver-reverify.md`, `pilot-scroll-controller.md`.
38. **Scroll caching delegated to router/shell**, not scroll-driver. `b10-scroll-driver-reverify.md`.
39. **Header (`Cg`) → graph-UI toolbar** (not marketing nav); no underline port. `b13-components-chrome.md § D2`.
40. **`SwiperSlider` (`wg`) omitted** — no marketing carousel on SoleMD homepage. `b13-components-chrome.md § D3`.
41. **8 non-homepage component slots sanctioned-omitted**. `b13-components-chrome.md § D5`.
42. **`preload()` delegated to Next.js `<Image>` + route-level preload**. `b13-components-chrome.md`.
43. **`onComponentChange` / `ul.CHANGE` → React reconciliation + Zustand subscriptions**. `b13-components-chrome.md`.
44. **DPR ceiling 1.75** (stricter than Maze's 2); aligned with `frontend-performance.md § "DPR capped at 2"`. `b11-stage-runtime.md`.
45. **B9 stream rebuild sanctioned divergences**: authored `id` attributes on `<path>` elements; refs + `data-*` instead of `.js-*` selectors; sibling React nodes for `data-gfx` vs. `data-scroll`; `afsp-`-prefixed tokens instead of Maze class names; SoleMD-authored copy instead of vulnerability-requirement strings. `b09-stream-popups.md § "Proposed sanctioned deviations"`.
46. **Points stay visible through the detail story**. Blob `depthOut=1.0` / `amplitudeOut=0.8`, `updateVisibility()` remains a documented no-op, and `alphaDiagramFloor` / `selectionHotspotFloor` stay in force. User-locked on **2026-04-19**. Undo path: `references/object-formation-surface.md § "Undoing deviation #1"`.
47. **Landing keeps the bookend blob ending; authored shape formation is
reserved for future module pages.** Stream remains a conveyor overlap chapter,
pcb remains available as a non-landing convergence family, and future
module-specific silhouettes still route through
`references/object-formation-surface.md`.

**47 consolidated sanctioned deviations across 14 buckets.** When in doubt whether a change fits an existing deviation, read the originating audit before deciding.

## 13. Known gaps + rebuild backlog (prioritized)

### Status after the 2026-04-19 landing pass

- **B9 stream DOM motion-path + popups** remain deferred to a future user-authored DOM/SVG shell pass; the shared stream stage controller and graph chapter are in place, but the popup rail is intentionally not shipped in this pass.
- **B12 Story-2 progress + CSS custom-property contract** landed on the root-driven `--progress-N` model.
- **B2 preload promise gate** landed through the `FixedStageManager` seam.
- **B6 HiDPI projection drift** is fixed in both `FieldController.toScreenPosition()` and `BlobController.projectBlobHotspotCandidate()`.
- **B8 chapter adapter registry + production TextReveal promotion** are live; homepage adapters now cover `welcome`, `moveNew`, `clients`, `graphRibbon`, `events`, and `cta`.
- **B3 scene-param drift** is closed for blob `uSize`, stream `uSize`, and pcb `scrollRotation`; the two remaining blob/pcb out-value differences are preserved as the user-locked deviations in § 12.
- **B4 shader-contract doc regression** is corrected in `maze-shader-material-contract.md`.

### P2 — nice-to-have / docs

- **B2 body-class vocabulary** (`is-loaded`, `is-resizing`, `is-rendering`) via `bindShellStateClasses` utility (shared with B10 D2). `b02-app-shell.md § D3`.
- **B10 shell utilities** — `bindScrollStateClasses` (is-scrolled family + vh fractions) and `bindDomStateObservers` (single consolidated IntersectionObserver). `b10-scroll-driver-reverify.md`.
- **B4 particle sprite alpha-profile match** (procedural canvas vs. Maze PNG). Ship PNG or tune gradient falloff. `b04-material-geometry.md § D11`.
- **B5 formalize `POINT_SOURCE_MANIFEST`** when first URL-backed slug lands. `b05-asset-registry.md § D1`.
- **B5 add `loadAll` async entry point** when first async source lands. `b05-asset-registry.md § D3`.
- **B6 `setInitialParameters` distributed-seed documentation** + optional hook. `b06-controllers.md § D10`.
- **B11 `Os.setViewportHeight` precompute** when stream/pcb mount on landing. `b11-stage-runtime.md § D1`.
- **B2 cookie consent banner** (tracks analytics scope). `b02-app-shell.md § D5`.

### P3 — scope questions / doc-only / anti-port

- **B8 DrawSVG** (paid plugin) — Framer Motion `pathLength` is the sanctioned alternative when needed. `b08-scroll-adapters.md § D9`.
- **B8 `quick`/`delay` adapter args** — Maze smell; do not port. `b08-scroll-adapters.md § D15`.
- **B4 `aMove` distribution PDF match** (triangular vs. uniform). Nice-to-have if strict parity matters. `b04-material-geometry.md § D8`.
- **B4 `fromVertices` centered-vs-positive jitter** — SoleMD is more correct; document. `b04-material-geometry.md § D3`.
- **B4 `fillWithPoints` volumetric primitive** — add when a surface needs it; do not build speculatively. `b04-material-geometry.md § D6`.
- **B7 stars / starfield** — sanctioned omission; revisit only if `?stars` equivalent is ever wanted. `b07-controller-registry.md`.

## 14. Cross-reference map (specialist references)

Each existing `maze-*.md` reference under `.claude/skills/module/references/` paired with which build-spec section links to it. **Each specialist reference should gain a back-link to the build-spec bucket it supports** as a follow-up pass (not done in this round — the build-spec just points into them).

| Specialist reference | Used by build-spec section |
|---|---|
| `maze-particle-runtime-architecture.md` | § 2 (Stage runtime + controller registry), § 6 (Controllers), § 12 (sanctioned #36 field-loop-clock) |
| `maze-shader-material-contract.md` | § 4 (Material + geometry); **needs update per § 4 D-DOC1** |
| `maze-stage-overlay-contract.md` | § 2 (Stage runtime), § 7 (Stream hybrid — recommended target for B9 step 11 doc) |
| `maze-asset-pipeline.md` | § 3 (Scene params — asset-band relocation), § 5 (Asset registry), § 12 sanctioned #13 / #25–#31 |
| `maze-model-point-source-inspection.md` | § 5 (Asset registry — model slug archive data) |
| `maze-source-artifact-index.md` | all sections (line-range lookups) |
| `maze-mobile-performance-contract.md` | § 2 (Stage runtime DPR), § 6 (Controllers — mobile branching), § 9 (Progress desktop gate) |
| `maze-rebuild-checklist.md` | all sections (supplemental ship checklist) |
| `image-particle-conformation.md` | § 4 (Material + geometry), § 5 (Asset registry — required read before adding image/model layers) |
| `stream-chapter-hybrid.md` | § 7 (Stream hybrid chapter contract and sanctioned DOM/WebGL split) |
| `object-formation-surface.md` | § 12 (undo path for user-locked deviations), § 13 (future convergence-surface work) |
| `round-12-module-authoring.md` | § 3 (Scene params — PCB / bitmap configs), § 5 (Asset registry — worked examples) |

## 15. Open questions for future passes

Consolidated from `catalog.md § "Open questions for Phase 4 build-spec synth"` and the drift-item open-questions sections of 12 audits. These are **not implementation tasks** — they are design questions for future conversations.

Resolved by the 2026-04-19 landing pass and no longer truly open: Q3, Q18, Q19, Q20, Q21, Q22, and Q26-Q30. They remain listed inline below for provenance.

1. **Shell-state utility mount location** — `bindShellStateClasses` inside `providers.tsx` alongside `DarkClassSync`, as a new `"use client"` component imported by `layout.tsx`, or only inside the field surface adapter? Recommendation: (b) so every route gets the vocabulary. `b02-app-shell.md § "Open questions" Q1`.
2. **Next.js `experimental.scrollRestoration` vs. landing-local `scrollToCached`-equivalent** — per-pathname scroll cache. Recommendation: flag until product needs back-button scroll restoration. `b02-app-shell.md § Q2`.
3. **`FixedStageManager` seam introduction** — **resolved 2026-04-19** in favor of the shared stage-manager seam. `b02-app-shell.md § Q3`.
4. **Page animate-in formalization** — View Transitions API (Next.js 16 native), Framer `AnimatePresence`, or shell-layer event? `b02-app-shell.md § Q4`.
5. **Shell-ready primitive** — should landing preload promise (D1) feed into a single "shell ready" signal that `FieldGraphWarmupAction` also reads? `b02-app-shell.md § Q5`.
6. **Scene params `uSize` canonical source for blob** — 10 (stream value) is a copy-paste from stream tuning or product-chosen punch? `b03-scene-params.md § Q1`.
7. **`*Out` uniform semantics** (D2/D3/D5/D6) — raw uniforms or scalar multipliers? Requires B4 + B6 cross-check. `b03-scene-params.md § Q2`.
8. **`sizeMobile` architectural decision** — per-uniform mobile override alongside `scaleFactorMobile`, or always through scale factor? `b03-scene-params.md § Q4`.
9. **Maze `mousemove` scenes** — expose `mousemove: boolean` flag on preset or document as renderer-wrapper-delegated. `b03-scene-params.md § Q5`.
10. **Non-homepage scene ports** — sanctioned future-scope or sanctioned-forever? Affects whether preset registry stays closed to current three. `b03-scene-params.md § Q8`.
11. **`fromTexture` first-layer depth behavior** — ship Maze-exact (flat), SoleMD current (spread), or flag. `b04-material-geometry.md § Q1`.
12. **Particle sprite asset source** — procedural canvas or ship Maze PNG? `b04-material-geometry.md § Q3`.
13. **Burst-overlay revival** — delete from SKILL doc or reintroduce on a controller for a future chapter? Currently vestigial. `b04-material-geometry.md § Q4`.
14. **`MAZE_HOTSPOT_COLOR = 0x22CCDF`** — add to `accent-palette.ts` for wiki/module hotspot consistency. `b04-material-geometry.md § Q5`.
15. **Manifest-driven vs. switch-driven source selection** — if model-backed slugs land, formalize `POINT_SOURCE_MANIFEST` constant or separate `asset-manifest.ts`? `b05-asset-registry.md § Q1`.
16. **Image-sampling presets co-location** — if pcb URL-asset parity restored, `visualPresets.pcb` or sibling `samplingPresets` table? `b05-asset-registry.md § Q5`.
17. **Wiki-module-scoped controllers** — does the dependency matrix require wiki modules to register controllers against DOM anchors they don't author? If yes, B7 Option B is a live candidate. `b07-controller-registry.md § Q1`.
18. **`FieldSectionManifest → SceneResolver` timing** — **resolved 2026-04-19**; landing now authors a live `FieldSectionManifest` and stage-manager seam. `b07-controller-registry.md § Q2`.
19. **Phase 4 scope call on moveNew/clients/events chapters** — **resolved 2026-04-19** in favor of porting all homepage-present adapters. `b08-scroll-adapters.md § Q1`.
20. **Chapter adapter registry required vs. per-chapter hand-authoring** — **resolved 2026-04-19** in favor of the hook-based registry. `b08-scroll-adapters.md § Q2`.
21. **TextReveal promotion location** — **resolved 2026-04-19** in favor of `features/animations/text-reveal/`. `b08-scroll-adapters.md § Q3`.
22. **`is-welcome-ready` broadcast vs. scroll-threshold chrome-pill** — **resolved 2026-04-19** by retaining `is-welcome-ready` as a dedicated body signal. `b08-scroll-adapters.md § Q4`.
23. **D3 graduation trigger** — when does missing preload promise gate become Must-fix? Recommendation: any homepage addition of a non-procedural point source. `b11-stage-runtime.md § Q1`.
24. **Starfield rehabilitation strategy** — route through `createModelPointGeometry`-equivalent machinery or add sibling `StarfieldController` subclass. Recommendation: former. `b11-stage-runtime.md § Q4`.
25. **R3F Suspense for point-source loading** — idiomatic R3F, folds D3 into one wrapper. `b11-stage-runtime.md § Q5`.
26. **Story-2 progress rail visual variant** — **resolved 2026-04-19**: same runtime component, separate beat ids, cosmetic divergence optional. `b12-progress.md § Q1`.
27. **CSS custom property namespace** — **resolved 2026-04-19** in favor of root-level `--progress-N` + `--bar-width`. `b12-progress.md § Q2`.
28. **Header node identity for D5 algorithm port** — **resolved 2026-04-19** via `APP_CHROME_PX.panelTop`. `b12-progress.md § Q4`.
29. **`is-active` class vs. `data-is-active` attribute** — **resolved 2026-04-19** by shipping both: `is-active` class plus `data-current-visible`. `b12-progress.md § Q5`.
30. **`--bar-width` consumer** — **resolved 2026-04-19** by publishing it on the progress root for CSS consumers. `b12-progress.md § Q6`.
31. **Future marketing nav or carousel** — greenfield, not a `Cg` / `wg` port. Defer decision until concrete surface exists. `b13-components-chrome.md § Q1/Q2`.
32. **Mobile branching viewport-detection contract** — SoleMD uses CSS breakpoints + `useShellVariant` matchMedia; Maze uses `yi.desktop` / `yi.scaleFactorMobile`. Document the equivalence. `catalog.md § Q6`.

## 16. How this build spec was produced

The spec is the terminal deliverable of a four-phase decomposition of Maze HQ's homepage:

- **Phase 0** — pilot cartographer + auditor on the scroll-controller slice, to validate methodology and output format.
- **Phase 1** — 7 cartography agents slicing `scripts.pretty.js` into `slice-01.md` through `slice-07.md` + `slice-pilot.md` (line-range authoritative). Output: `docs/agentic/maze-build-spec/cartography/*`.
- **Phase 2** — catalog synthesis consolidating slices into 13 active subsystem buckets + 1 deferred vendored bucket. Output: `docs/agentic/maze-build-spec/catalog.md` including `B1` vendored, `B2` app shell, `B3` scene params, `B4` material/geometry, `B5` asset registry, `B6` controllers, `B7` controller registry, `B8` scroll adapter registry, `B9` stream popups, `B10` scroll driver, `B11` stage runtime, `B12` progress, `B13` components/chrome, `B14` typography (merged into B8).
- **Phase 3** — 12 audit agents, one per active bucket (B14 merged into B8). Output: `docs/agentic/maze-build-spec/audits/b02–b13*.md` + `pilot-scroll-controller.md`.
- **Phase 4** — this synthesis. Consolidates 12 audits + 1 pilot audit + catalog + derived Maze maps into a single canonical parity reference + prioritized backlog.

Trail: `docs/agentic/maze-build-spec/` retains the full decomposition; this spec points forward into the 10 existing `maze-*.md` specialist references (section 14) and backward into the 12 audits (sections 1–11).
