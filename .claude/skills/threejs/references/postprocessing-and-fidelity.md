---
name: three.js postprocessing and visual fidelity
description: EffectComposer vs pmndrs/postprocessing, OutputPass, AgX/Neutral/ACES tone mapping, PMREM/IBL, MSAA/SMAA/TAA matrix, bloom variants, WebGL vs WebGPU pipeline differences
---

# Postprocessing and visual fidelity

## Two pipelines coexist; they are not interchangeable

1. **Stock three.js** (`three/examples/jsm/postprocessing/EffectComposer`). Each effect is its own full-screen pass. Acceptable for one or two effects.
2. **pmndrs/postprocessing**. A re-architected composer that **merges effects into a single fullscreen pass** via shader concatenation, using a single-triangle rendering pattern. N effects collapse to ~1 sample/pixel instead of N.

**Senior rule:** use `pmndrs/postprocessing` once you have more than one effect. Effect merging dominates fragment-bandwidth cost on dense particle fields.

## Renderer config required by pmndrs/postprocessing

```js
const renderer = new WebGLRenderer({
  powerPreference: "high-performance",
  antialias: false,   // composer handles AA via SMAA effect
  stencil: false,
  depth: false        // composer owns depth in its render targets
});
```

## Stock pipeline canonical order

```js
const composer = new EffectComposer(renderer);
composer.setPixelRatio(devicePixelRatio); // composer has its own DPR
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new Vector2(w, h), 1.5, 0.4, 0.85));
composer.addPass(new OutputPass()); // MUST be last
```

`OutputPass` is non-optional in modern three.js (r152+). It applies `renderer.toneMapping` and `renderer.outputColorSpace` conversion. Without it the image is linear/clipped. **Set `renderer.toneMapping` and `renderer.outputColorSpace`, not the canvas; `OutputPass` reads them.** When using `pmndrs/postprocessing`, you replace `OutputPass` with a `ToneMappingEffect` placed last in the final `EffectPass`, and you set `renderer.toneMapping = NoToneMapping` so it isn't applied twice.

## HDR floating-point composer target

Mandatory for bloom that respects exposure; otherwise highlights clip at 1.0 before bloom samples them:
```js
import { HalfFloatType } from "three";
const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
```
In stock three.js the equivalent: `new EffectComposer(renderer, new WebGLRenderTarget(w, h, { type: HalfFloatType }))`.

## Render target management

`composer.setSize` and `composer.setPixelRatio` operate on internal targets independently from the renderer — keep them in sync on resize. For depth-aware effects (SSAO, DOF, godrays) attach a `DepthTexture`:
```js
const target = new WebGLRenderTarget(w, h, {
  type: HalfFloatType,
  depthBuffer: true,
  depthTexture: new DepthTexture(w, h),
});
```

For MSAA inside the composer, use `samples: 4` on the render target. MSAA is free quality on opaque passes but **does not survive into postprocessing**: once you sample the resolved texture, AA is baked. Hence the SMAA/FXAA pass at the end.

## Tone mapping options

**Color management is on by default in r152+** (`THREE.ColorManagement.enabled = true`). Working color space: linear sRGB. Color textures: `SRGBColorSpace`. Data textures: `NoColorSpace` default. HDR/EXR: linear, so `NoColorSpace`.

| Constant | Notes |
|---|---|
| `NoToneMapping` | Use when composer pipeline does its own tone mapping. |
| `LinearToneMapping` | Just exposure scale; clamps. Avoid. |
| `ReinhardToneMapping` | Cheap; flattens highlights. Acceptable for stylized scenes. |
| `CineonToneMapping` | Filmic curve; greenish midtones. |
| `ACESFilmicToneMapping` | Industry default; saturated, contrasty. Best for cinematic. |
| `AgXToneMapping` | r163+. Better hue stability at extreme luminance — particles, orbs, neon. **Default for graph-viz with glow.** |
| `NeutralToneMapping` | r166+. Khronos Neutral; designed for product renderers and color-faithful UIs. Best when glow shouldn't shift hue. |
| `CustomToneMapping` | Provide your own via `ShaderChunk.tonemapping_pars_fragment`. |

**Recommendation for orb/particle field:** AgX with `toneMappingExposure ≈ 0.8–1.2`, then bloom whose threshold is set in scene-linear units (`> 1.0`) so only emissive material drives bloom. Neutral is the right pick if the orb sits next to UI chrome and color shift would visually conflict.

**Frequent senior mistake:** applying tone mapping in the renderer **and** in an `OutputPass`/`ToneMappingEffect`. Double-converts. Pick one location.

## Lighting and shadows

**Image-based lighting via PMREM** is the highest-ROI quality lever:
```js
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
// HDRLoader replaced RGBELoader in r179. RGBMLoader was removed entirely.

const pmrem = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader(); // pre-warm

new HDRLoader().load("env.hdr", (tex) => {
  const envMap = pmrem.fromEquirectangular(tex).texture;
  scene.environment = envMap;       // IBL for all PBR materials
  scene.background  = envMap;       // optional: visible sky
  tex.dispose();
  pmrem.dispose();
});
```
`scene.environment` covers all materials globally; per-material `envMap` overrides per object. Always `dispose()` PMREM and the source HDR.

**Shadow map types** (`renderer.shadowMap.type`):
- `BasicShadowMap` — hard, fast.
- `PCFShadowMap` — default; cheap soft.
- `PCFSoftShadowMap` — better soft, slightly slower.
- `VSMShadowMap` — variance shadows; arbitrarily soft via `light.shadow.blurSamples` and `radius`. Light-bleeding artifacts on overlapping occluders.

**Shadow tuning that actually matters:**
```js
light.shadow.mapSize.set(2048, 2048);
light.shadow.bias = -0.0005;
light.shadow.normalBias = 0.04;     // fixes peter-panning on curved meshes
light.shadow.radius = 4;
const s = 50;
Object.assign(light.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.5, far: 500 });
light.shadow.camera.updateProjectionMatrix();
```

For **cascaded shadow maps**, use the `CSM` addon (`three/examples/jsm/csm/CSM.js`). Required for any scene wider than ~200 world units with a directional sun.

**Drei alternatives** (R3F):
- `<Environment preset="city" />` — wraps PMREMGenerator + presets.
- `<ContactShadows />` — fakes ground shadow via blurred depth render. Ideal for orb-on-stage compositions; near-zero perf.
- `<AccumulativeShadows>` + `<RandomizedLight>` — bakes high-quality soft shadow over N frames, then freezes. Static-scene only; perfect for graph layouts that settle.
- `<SoftShadows />` — replaces shadow shader with PCSS variant; per-pixel cost but real penumbras.

Particle/orb effects rarely cast meaningful shadows; treat shadows as a contact-grounding cue for context geometry, not the orb itself.

## Effect-specific guidance

### Bloom

Three flavors:
- `UnrealBloomPass` (stock) — five-mip Gaussian pyramid. `(resolution Vector2, strength, radius, threshold)`. Threshold in tone-mapped luminance, which interacts badly with HDR.
- `BloomEffect` (pmndrs) — same idea, mergeable into the unified pass; respects HDR linear input directly.
- `SelectiveBloomEffect` (pmndrs) — uses a `Selection` of objects so only tagged meshes contribute. Use for: only the orb/glowing edges bloom, UI text doesn't.
- `MipBlurBloomEffect`/`MipmapBlurMaterial` (pmndrs newer) — downsample/upsample blur pyramid, cheaper and softer than Gaussian. Best for "atmospheric" glow on particle clouds.

**Threshold rule:** in HDR, `threshold ≈ 1.0`, `smoothing ≈ 0.025`, drive bloom by emissive `emissiveIntensity > 1`. Keeps bloom physically tied to scene-linear brightness.

### Ambient occlusion

`SSAOPass` (stock) is hardware-cheap but noisy. `GTAOPass` (stock, recent) and `SSAOEffect`/`N8AOEffect` (pmndrs ecosystem) are higher quality. AO needs depth+normal pass. **For a particle field, AO is mostly wasted** — particles don't form occlusion-rich geometry. Reserve for solid context geometry behind the orb.

### Depth of field

`BokehPass` (stock) is single-pass disc bokeh, cheap, no transparency support. `DepthOfFieldEffect` (pmndrs) is multi-pass with circle-of-confusion, near/far separation, much better quality. DoF on particles needs `transparent` materials handled carefully — particles with transparent blending lose proper depth, breaking the CoC. Either render particles to a separate target without DoF, or use `depthTest: true; depthWrite: false` and accept halos.

### Antialiasing

| Method | Use |
|---|---|
| **MSAA** (target `samples`) | Hardware AA, free, opaque pass only, lost when read into postprocessing |
| **SMAA** (`SMAAPass`/`SMAAEffect`) | Runs after composer, works on resolved image. **Default modern choice.** |
| **FXAA** | Cheaper than SMAA, blurrier on text/UI |
| **TAA** (`TAARenderPass`) | Accumulates jittered frames; razor-sharp at rest, **ghosts on motion**. **Avoid for particle scenes.** |
| **SSAA** (`SSAARenderPass`) | Supersamples; offline-quality, viable real-time only on settle frames |

**For an orb of moving particles: SMAA + MSAA-on-target.** TAA is wrong because particles are exactly what it ghosts.

### Godrays

`three-good-godrays` (Casey Primozic) integrates with pmndrs/postprocessing — directional volumetric scattering with `intensity`, `decay`, `density`, `weight`, `exposure`. Cheap and dramatic against a dark background — fits an orb illuminated from a point light very well.

### Lens flare

`R3F-Ultimate-Lens-Flare` (Anderson Mancini) — postprocessing effect with starburst/ghosts/haze parameters. Works as an `Effect` in pmndrs's `EffectPass`.

### Denoiser

Dennis Smolek's `Denoiser` is targeted at path-traced output, not raster. Not relevant unless using `three-gpu-pathtracer`. For raster particle fields, denoise is the wrong tool — handle noise at source (more samples per particle, MSAA, mip-filtered textures).

## WebGL vs WebGPU pipeline differences

The three.js WebGPU backend (`WebGPURenderer`, production-ready since r171) has its own postprocessing model based on **TSL** (Three Shading Language) node graphs, not the `EffectComposer` pass chain.

- **Class: `RenderPipeline`** (renamed from `PostProcessing` in r183, October 2025). Imported from `three/webgpu`. Constructed with the renderer; you assign `outputNode = pass(scene, camera).bloom(...)` — a TSL node expression, not a sequence of passes.
  ```js
  import { RenderPipeline } from 'three/webgpu';
  import { pass, bloom, mrt, output, normalView, emissive } from 'three/tsl';
  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = pass(scene, camera).bloom(0.5);
  pipeline.outputColorTransform = true;  // default — auto tone-mapping + sRGB
  ```
- **`outputColorTransform`** (default `true`) auto-applies tone mapping + sRGB conversion in the pipeline. Manual placement of a `toneMapping(...)` node at the end is no longer required and double-applies if you do it. Set `outputColorTransform = false` only if you need explicit control.
- **MRT** is first-class in WebGPU; TSL `mrt({ output, normal, emissive })` lets a single material write multiple buffers — basis for cheap deferred-style effects. See `webgpu-tsl-bridge.md` for a worked example.
- **Effect composition is automatic via the node graph.** No double-blit per effect; the compiler folds the node chain to a single pass when possible (same idea pmndrs/postprocessing implements manually for WebGL).
- **Tone mapping nodes** are still available for manual control (`acesFilmicToneMapping()`, `agxToneMapping()`, `cineonToneMapping()`, `reinhardToneMapping()`, `linearToneMapping()`, `neutralToneMapping()`). Use them only when you've turned `outputColorTransform` off.
- **Effects ported / native:** Bloom (`bloom()` node), DoF, SSAO/GTAO landing progressively. Some pmndrs effects don't run under WebGPU yet — verify before depending on them.
- **MSAA** set on the renderer (`samples`); SMAA-equivalents exist as TSL nodes.
- **Depth/normal** uniform via `viewportDepthTexture()` and `mrt()` — no manual DepthTexture wiring.
- **`Float16Array` rendering support** landed in r178 — half-float buffers can be supplied directly to typed-array buffer attributes without the WebGL2 conversion dance.

**Practical rule:** WebGL today → `pmndrs/postprocessing` with `HalfFloatType` targets, AgX in `OutputPass`/`ToneMappingEffect`, SMAA last, PMREM-driven IBL. Starting fresh and targeting Chrome/Edge/Safari TP → WebGPU's TSL postprocessing via `RenderPipeline` is shorter, faster, and the right forward bet — but verify each specific effect (selective bloom, godrays) ships in TSL form before depending on it.

## Orb-specific recipe (SoleMD.Graph)

**Important:** the live SoleMD.Graph orb on `feat/orb-as-field-particles`
is **raw WebGPU + WGSL with no three.js layer** — see
`/module/references/orb-particle-target.md`. There is no `EffectComposer`,
no `RenderPipeline`, no `ToneMappingEffect`. Color shaping happens
entirely inside the WGSL fragment shader, writing directly to a
`premultiplied`-alpha swap chain.

The recipe below is the *target shape* if/when the orb migrates onto
three.js + TSL. Until then, do not assume any of these passes are
running on the orb canvas:

For a 1M-particle orb on the three.js path:
- pmndrs/postprocessing for WebGL2, or `RenderPipeline` for WebGPU
- HDR (HalfFloat) composer target
- AgX tone mapping in a final `ToneMappingEffect` (or the pipeline's
  built-in `outputColorTransform`)
- Selective bloom keyed on the particle layer
- SMAA last
- Skip TAA (would ghost the particle motion)
- Skip AO (particles don't form occlusion geometry)

For raw WebGPU work on the existing orb runtime, treat
`/module/references/orb-particle-target.md` as the contract and read
`/webgpu` for any kernel/bind-group/profiling questions.
