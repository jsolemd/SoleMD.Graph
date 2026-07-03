---
name: WebGPU texture resources, formats, and samplers
description: Depth-and-intuition reference for choosing the right texture format, view, sampler, and MSAA strategy for a novel case — no lookup needed. Covers the texture-as-typed-memory mental model, the sRGB view trick, MSAA cost on tile-based vs desktop GPUs, mip generation, sampler taxonomy, storage textures, KTX2 transcoding, HDR canvas, and data-movement paths.
---

# Texture resources, formats, and samplers

The **reasoning** companion to the format/sampler tables in
`buffers-textures-bindings.md`. Tables tell you *what*; this file tells you
*why* — so you can pick the right format, view, sampler, and MSAA strategy
for a case the tables don't cover.

Cross-references:
- `buffers-textures-bindings.md` — short-form format/sampler tables, common-mistakes catalog.
- `compute-fundamentals.md` — workgroup sizing for image kernels, atomics on storage textures.
- `gpgpu-recipes.md` — image kernels writing storage textures, compute mip generation.
- `render-pipelines.md` — MSAA in render passes, depth-stencil attachment state, blend rules.
- `browser-platform-reality.md` — feature/limit detection per platform.

---

## 1. Texture as a typed memory region with views

A `GPUTexture` is **not** an image. It is a typed, multidimensional region
of GPU memory described by `size`, `dimension` (`'1d'`/`'2d'`/`'3d'`),
`format`, `mipLevelCount` (allocated, not generated), `sampleCount`
(1 or 4), `viewFormats` (allow-list of alternate format interpretations),
and `usage` flags.

A **`GPUTextureView`** is a window into that memory: pick a `format`
(view-format-compatible with base), sub-range of mips
(`baseMipLevel`+`mipLevelCount`), sub-range of layers
(`baseArrayLayer`+`arrayLayerCount`), an `aspect`
(`'all'`/`'depth-only'`/`'stencil-only'`), and a `dimension` reinterpretation
(`'2d'`/`'2d-array'`/`'cube'`/`'cube-array'`/`'3d'`).

Three consequences:

1. **Views are cheap. Create freely.** A view is a descriptor + handle,
   not a copy. Hold a `'2d'` view, a `'cube'` view, and six per-face
   views of the same 2D-array texture simultaneously — all alias the same
   bytes.
2. **Same bytes, different math.** A `rgba8unorm` view and a
   `rgba8unorm-srgb` view of the same texture read identical bits but
   apply different sample-time transforms (§3).
3. **Aspect is a view choice.** `depth32float-stencil8` storage is single,
   but you can never sample `'all'` — you must split into a
   `'depth-only'` or `'stencil-only'` view for binding.

```js
const tex = device.createTexture({
  size: [w, h], format: 'rgba8unorm',
  mipLevelCount: 8,
  usage: GPUTextureUsage.TEXTURE_BINDING
       | GPUTextureUsage.STORAGE_BINDING
       | GPUTextureUsage.RENDER_ATTACHMENT
       | GPUTextureUsage.COPY_DST,
  viewFormats: ['rgba8unorm-srgb'],
});
const linearView = tex.createView();
const srgbView   = tex.createView({ format: 'rgba8unorm-srgb' });
const mip3Only   = tex.createView({ baseMipLevel: 3, mipLevelCount: 1 });
```

Mental model: `GPUBuffer` + element type + dimensionality + mip stack.
`createView` is a typed pointer.

---

## 2. The format taxonomy that matters

Group by purpose, not name.

### 8-bit unorm/snorm — render-target workhorse

- `rgba8unorm` / `bgra8unorm` — color, render targets. Filterable, blendable,
  renderable. **`bgra8unorm` is the preferred canvas format** on most
  desktop platforms — GPUs and OS compositors store the swap chain in
  BGRA. Always call `navigator.gpu.getPreferredCanvasFormat()`; mismatch
  forces a swap-chain copy. Storage on `bgra8unorm` requires the
  `bgra8unorm-storage` feature.
- `rgba8unorm-srgb` / `bgra8unorm-srgb` — same bytes; sampler does
  sRGB↔linear at read/write time. Storage **never** allowed (§3).
- `rgba8snorm` — signed 8-bit, [-1, 1]. **Normal maps**. Filterable, not
  blendable, not renderable.

Bandwidth: 4 bytes/texel — your baseline.

### 16-bit float — HDR rendering targets

- `rgba16float` — HDR intermediates, bloom/glow, post-process accumulation,
  tone-map inputs. Won't clamp at 1.0; ±65504. Filterable + blendable on
  **every** WebGPU device, no feature gate. **2× bandwidth of rgba8unorm.**
- `r16float` / `rg16float` — single-/dual-channel HDR (luminance, motion
  vectors, depth-aware blur weights).

**Use `rgba16float`, not `rgba32float`,** for any rendering buffer that
isn't a position/scratch compute target. Quality difference invisible;
bandwidth difference 2×.

### 32-bit float — compute scratch

- `rgba32float`/`rg32float`/`r32float` — particle position/velocity as
  textures (rare; storage buffers preferred), GPGPU scratch, ML feature
  maps.
- Two feature gates that bite:
  - `float32-filterable` — required to use a `'linear'` filter sampler
    with f32 formats. Without it, declare binding `'unfilterable-float'`
    and sampler `'non-filtering'`.
  - `float32-blendable` — required to blend into f32 render targets.
- Only `r32float`/`r32sint`/`r32uint` allow `read_write` storage access
  without extension features.

### R-only and RG — single/dual-channel

`r8unorm`, `r16float`, `r32float`, rg variants. Whenever data is single-
or dual-channel: depth-of-field tile masks, AO buffers, motion vectors,
single-channel lookup tables. `r8unorm` is **¼** the workhorse — for a
1920×1080 mask, 2 MB vs. 8 MB. On a fill-rate-limited mobile budget that's
the difference between shipping and not.

### Depth/stencil — implementation-defined precision

| Format                   | Depth bits     | Stencil | Feature gate              |
|--------------------------|----------------|---------|---------------------------|
| `depth16unorm`           | 16             | —       | core                      |
| `depth24plus`            | **≥24** (impl) | —       | core                      |
| `depth24plus-stencil8`   | **≥24** (impl) | 8       | core                      |
| `depth32float`           | 32 float       | —       | core                      |
| `depth32float-stencil8`  | 32 float       | 8       | `depth32float-stencil8`   |

Trap: **`depth24plus` is implementation-defined as either D24 or D32 float.**
Never assume bit count. **If you ever read depth back as a number, use
`depth32float`** — it has known semantics. Sampling depth as a regular
sampler returns the depth value; as a **comparison sampler** returns 0/1
with hardware PCF (§6.4). Combined depth/stencil must be sampled through a
`'depth-only'` or `'stencil-only'` view.

### Compressed — feature-gated, render-only

- **BC1–BC7** (`texture-compression-bc`) — desktop/Mac, ~always present.
  BC7 = high-quality RGBA at 8 bpp, default for desktop color textures.
- **ETC2/EAC** (`texture-compression-etc2`) — ubiquitous on Android.
- **ASTC** (`texture-compression-astc`) — mobile, Apple, modern Android.
  4×4 = 8 bpp, 8×8 = 2 bpp; wide quality range.
- 3D variants: `bc-sliced-3d`, `astc-sliced-3d`.

**Capabilities**: filter **yes**, render **no**, blend **no**, storage **no**.
Compressed textures can only be sampled, never written from a render or
compute pass. This is why compressed assets and your render/scratch
pipeline live in separate worlds.

### Packed — narrow uses

- `rgb10a2unorm` — HDR-ish in 4 bytes when bandwidth > precision.
- `rg11b10ufloat` — compact HDR. Renderable only with
  `rg11b10ufloat-renderable` feature.
- `rgb9e5ufloat` — shared-exponent HDR, sample-only.

---

## 3. The sRGB view trick

Every sRGB-tagged format is the **same bytes in memory** as its non-sRGB
counterpart. What changes is how the GPU samples them.

- **Read** through `rgba8unorm-srgb`: GPU applies sRGB→linear **after**
  fetching the bits. Bilinear filtering happens in linear space (correct).
- **Write** through `rgba8unorm-srgb` render target: GPU applies
  linear→sRGB **before** storing. Blending happens in linear space
  (correct).
- **Read** through `rgba8unorm` of the same memory: raw 8-bit values, no
  curve. Useful when bytes encode IDs, masks, or non-color data.

```js
const tex = device.createTexture({
  size: [w, h], format: 'rgba8unorm',
  usage: GPUTextureUsage.TEXTURE_BINDING
       | GPUTextureUsage.STORAGE_BINDING
       | GPUTextureUsage.RENDER_ATTACHMENT
       | GPUTextureUsage.COPY_DST,
  viewFormats: ['rgba8unorm-srgb'],
});
const linearView = tex.createView();                          // compute writes
const srgbView   = tex.createView({ format: 'rgba8unorm-srgb' }); // display
```

### Why storage textures cannot be sRGB

The linear↔sRGB conversion is **not atomic and not commutative with
read-modify-write**. A `textureStore` on an sRGB-encoded format would
need: load → linearize → modify → re-encode → write — a non-atomic
round-trip. Worse, `textureLoad` followed by `textureStore` would not
round-trip the same value (curve is non-linear in finite precision). The
spec resolves this by making sRGB formats **sample-only**: they appear in
the binding-layout `texture` slot but never in `storageTexture`.

**Operational rule**: keep base format **linear**. Add the sRGB variant
to `viewFormats` so the canvas/swap-chain target gets the gamma-correct
view; let compute kernels write linearly. This is the only way to mix
compute writes and gamma-correct display.

### Render-target sRGB

Render targets that you'll display directly **should** be sRGB, so the
GPU does gamma for you (the monitor expects sRGB-encoded pixels).
Modern default: configure the canvas in linear BGRA, declare
`viewFormats: ['bgra8unorm-srgb']`, get the current texture each frame
and create a `'bgra8unorm-srgb'` view as the render target. Pipeline's
`fragment.targets[0].format = 'bgra8unorm-srgb'`. Shaders write linear;
GPU encodes on store.

---

## 4. MSAA — what's "free" and what isn't

### Mental model

WebGPU v1 allows `sampleCount: 1` or `4` only. The fragment shader runs
**once per pixel** by default (NOT once per sample). Coverage is
per-sample, depth tests run per-sample. The shader output is broadcast to
every covered sample within the pixel.

You pay:
- 4× shader invocations? **No.** Shader runs once per pixel.
- 4× depth/coverage work? **Yes.**
- 4× memory? **Yes.** A 4× MSAA `rgba8unorm` target is 16 bytes/pixel of
  color + 16 of depth32float. For 1080p: 32 MB vs. 8 MB.
- Bandwidth? Depends on architecture (below).

**Result**: edge antialiasing without 4× shading cost. The win lands on
geometry edges and sub-pixel-thin geometry; shader-aliased content
(specular highlights, alpha-tested foliage) is unaffected.

### Resolve

The 4× samples must be **resolved** to a 1-sample image. Two paths:

1. **Built-in box-filter resolve** — point `resolveTarget` at a 1-sample
   texture in the color attachment. Driver resolves at end-of-pass.

   ```js
   colorAttachments: [{
     view: msaa4xView,
     resolveTarget: ctx.getCurrentTexture().createView(),
     loadOp: 'clear',
     storeOp: 'discard',   // discard MSAA, keep only resolve
   }]
   ```

2. **Manual compute-shader resolve** — bind MSAA texture as
   `texture_multisampled_2d<f32>`, `textureLoad(t, coord, sampleIndex)`,
   custom average. Required for HDR pipelines: a box-filter resolve
   followed by tone-map is **wrong** — you must tone-map *before*
   averaging or fireflies survive.

**Depth resolve**: `depthResolveTarget` requires the
`depth-multisample-resolve` feature; otherwise resolve depth in compute.

### Why MSAA isn't always free

- **Tile-based GPUs** (Apple, Mali, Adreno, PowerVR): MSAA samples live
  in on-chip tile memory, never round-trip to main memory. Resolve
  happens at tile-end. **MSAA is effectively free.** This is why iOS
  apps ship MSAA universally.
- **Desktop GPUs** (NVIDIA, AMD, Intel discrete): MSAA targets live in
  VRAM. 4× memory, 4× write bandwidth. Resolve is a separate read+write
  pass. **MSAA is measurably expensive** — always profile.

**Rule**: 4× MSAA on mobile/tile-based; profile carefully on desktop. For
desktop, post-process AA (FXAA, TAA) is usually cheaper.

### Sample mask, alpha-to-coverage

- `@builtin(sample_mask)` (input/output `u32`): per-sample coverage
  bitmap. Output mask AND-s with geometric coverage — useful for
  screen-space dithering or stochastic alpha.
- `multisample.alphaToCoverageEnabled: true`: fragment-shader alpha
  becomes a per-sample coverage pattern. Solves alpha-test Z-fighting
  for foliage without sorting.

### MSAA + storage texture? No.

Storage textures cannot be multisampled. Sampled MSAA bindings are
`texture_multisampled_2d<f32>` only — accessed via `textureLoad`, no
sampler. To use a multisampled image as a compute input, resolve first,
bind the resolved texture as storage.

---

## 5. Mip chains and why generation matters

A texture with `mipLevelCount > 1` and the right usage has **pre-allocated
slots** for level 0 through N-1. WebGPU does not generate the chain.

### Render-pass mip generator (most portable)

For each level i+1, draw a full-screen triangle sampling level i with a
linear filter, into a render-attachment view restricted to level i+1:

```js
for (let i = 0; i < mips - 1; i++) {
  const srcView = tex.createView({ baseMipLevel: i,     mipLevelCount: 1 });
  const dstView = tex.createView({ baseMipLevel: i + 1, mipLevelCount: 1 });
  // Bind: (srcView + linear sampler). Render pass attaches dstView. Draw 3.
}
```

One render pass per level, one fragment-shader invocation per output
texel.

### Compute-shader mip generator (faster on desktop)

Bind the texture as `texture_storage_2d<rgba8unorm, write>` per-level
views. Write multiple levels per dispatch using workgroup-shared memory:

```wgsl
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var mip1: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var mip2: texture_storage_2d<rgba8unorm, write>;
var<workgroup> tile: array<vec4f, 64>;

@compute @workgroup_size(8, 8)
fn cs(@builtin(local_invocation_id) lid: vec3u,
      @builtin(global_invocation_id) gid: vec3u) {
  let s00 = textureLoad(src, gid.xy * 2u + vec2u(0u, 0u), 0);
  let s10 = textureLoad(src, gid.xy * 2u + vec2u(1u, 0u), 0);
  let s01 = textureLoad(src, gid.xy * 2u + vec2u(0u, 1u), 0);
  let s11 = textureLoad(src, gid.xy * 2u + vec2u(1u, 1u), 0);
  let avg = 0.25 * (s00 + s10 + s01 + s11);
  textureStore(mip1, gid.xy, avg);
  tile[lid.y * 8u + lid.x] = avg;
  workgroupBarrier();
  // Reduce tile down for mip2 …
}
```

~6× faster than render-pass on desktop because all levels happen in one
dispatch with on-chip scratch. Format restriction: storage-texture-allowed
formats only; for sRGB use the linear-base + sRGB-view trick.

**Aliasing rule**: you cannot read mip i and write mip i+1 through views
of the same texture in the same pass. The driver doesn't track sub-resource
hazards mid-pass. Either issue a render pass per level (separate bind
groups), or use compute with explicit `storageBarrier()` between levels in
the same dispatch (cross-workgroup ordering still requires dispatch
boundary).

**Compressed mips**: precompute the entire chain offline (in the KTX2 file)
and upload each level via `copyBufferToTexture`. Compressed formats are
unwritable.

---

## 6. Sampler taxonomy

Defaults: every filter is `'nearest'`, every address mode is
`'clamp-to-edge'`, `lodMinClamp: 0`, `lodMaxClamp: 32`, `maxAnisotropy: 1`,
`compare: undefined`.

### Filter modes — what each blend costs

- **Nearest** — single texel fetch. Sharp, retro look.
- **Linear** mag/min — bilinear, 4 texels per sample.
- **Linear** mipmap — trilinear, **8 texels per sample** (4 from level i,
  4 from level i+1, blended).

Common combinations:
| `magFilter` | `minFilter` | `mipmapFilter` | Effect                |
|-------------|-------------|----------------|------------------------|
| `nearest`   | `nearest`   | `nearest`      | Point sampling         |
| `linear`    | `linear`    | `nearest`      | Bilinear with mip-jump |
| `linear`    | `linear`    | `linear`       | Trilinear (8-tap)      |

### Address modes

- `'clamp-to-edge'` — default for color. Beyond [0,1] you get edge texels.
  Use unless you have a reason not to.
- `'repeat'` — for textures designed to tile seamlessly.
- `'mirror-repeat'` — rare; mirrored joins instead of seams (useful for
  scrolling effects).

The default is `'clamp-to-edge'` to avoid the bilinear-bleeds-edge-pixel
artifact at borders.

### Anisotropy — for oblique surfaces

`maxAnisotropy: N` (1..16) lets the GPU sample up to N times along the
gradient direction at oblique angles. Cost is roughly **linear** in
anisotropy level. Quality plateau at 4× for most cases; 16× for flat-ground
tiling textures.

**Hard rule**: `maxAnisotropy > 1` requires `magFilter`, `minFilter`,
**and** `mipmapFilter` all `'linear'`. Validation rejects creation
otherwise — `maxAnisotropy: 4` with `mipmapFilter: 'nearest'` is a
creation error.

### Comparison samplers — for shadow maps

A sampler with `compare` set behaves differently:

- Returns **0/1** (or filtered blend of 0s and 1s) instead of the depth
  value.
- Pairs with `texture_depth_2d` in WGSL via
  `textureSampleCompare(t, samp, uv, refDepth)`.
- Hardware does compare + filter in one op = "PCF for free" with `compare:
  'less'`/`'less-equal'` and a linear filter (4-tap PCF).

```wgsl
@group(0) @binding(0) var shadowMap: texture_depth_2d;
@group(0) @binding(1) var shadowSamp: sampler_comparison;

fn shadow(uv: vec2f, ref: f32) -> f32 {
  return textureSampleCompare(shadowMap, shadowSamp, uv, ref);
}
```

Bind layout: `sampler: { type: 'comparison' }`; WGSL: `sampler_comparison`.
A comparison sampler **cannot** be reused as a regular filtering sampler —
build separate `GPUSampler` instances per use.

### Filtering / non-filtering / comparison sampler types

In bind-group **layouts**, samplers are one of three:

- `'filtering'` — pairs with `sampleType: 'float'` textures (filterable).
- `'non-filtering'` — pairs with `'unfilterable-float'` (e.g. raw
  `rgba32float` without `float32-filterable`), `'sint'`, or `'uint'`.
- `'comparison'` — pairs with `'depth'`. Sampler must have `compare` set.

### LOD clamps

`lodMinClamp` / `lodMaxClamp` clip the mip-chain range the sampler can
reach. Useful for forcing a low-res fallback without rebuilding the
texture, or capping bandwidth on minified surfaces.

---

## 7. Storage textures — writable from compute

| Access mode  | Formats without features                                                |
|--------------|-------------------------------------------------------------------------|
| `write-only` | `rgba8(unorm/snorm/uint/sint)`, `rgba16(float/uint/sint)`, `rgba32(float/uint/sint)`, `rg32(float/uint/sint)`, `r32(float/uint/sint)` |
| `read-write` | `r32float`, `r32sint`, `r32uint` only                                   |
| `read-only`  | Same set as write-only                                                  |

**Forbidden** without features: every sRGB format, every depth/stencil
format, every compressed format, `rgb10a2unorm`, `rg11b10ufloat`. Feature
`bgra8unorm-storage` unlocks `bgra8unorm`.

WGSL declaration carries the format **as part of the type**:

```wgsl
@group(0) @binding(0) var img: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  textureStore(img, gid.xy,
               vec4f(0.0, f32(gid.x) / 1024.0, 0.0, 1.0));
}
```

Layout: `storageTexture: { access: 'write-only', format: 'rgba16float',
viewDimension: '2d' }`. Format must match WGSL **exactly** —
character-for-character — or creation fails.

**Use cases**: image filters (bloom downsample, SSAO), compute mip
generation, volumetric writes (3D storage texture for clouds/fog/SDF), GPU
rasterization (per-layer writes via `textureStore(tex, coord, layer, val)`
into a 2D-array).

**Storage texture in 1D / 2D / 2D-array / 3D — yes. In cube / cube-array — no.**
Workaround for cubes: write to the underlying 2D-array (6 layers), bind
the same memory as `'cube'` for sampling.

---

## 8. Data movement: copy paths

### copyTextureToTexture (T2T)

`encoder.copyTextureToTexture(src, dst, size)` — between same-format,
same-dimension textures. Mip + layer offsets supported. Format conversion
**not** done; use a render or compute pass for that.

### copyExternalImageToTexture — the asset path

GPU-side path from `ImageBitmap`, `HTMLImageElement`, `HTMLVideoElement`,
`HTMLCanvasElement`, `OffscreenCanvas`. **No CPU readback.**

Critical options:
- `flipY: true` — flips Y on copy.
- `premultipliedAlpha: true` — destination's alpha is premultiplied.
  Mismatched flag = wrong blending.
- `colorSpace` — destination color space; browser converts source at
  copy time (sRGB↔display-p3).

Destination texture **must** include `RENDER_ATTACHMENT` in usage — the
implementation uses a render pass for the copy and color-space
conversion.

```js
async function loadTexture(device, url) {
  const blob = await (await fetch(url)).blob();
  // 'none' for normal/data maps; 'default' for color.
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'default' });
  const tex = device.createTexture({
    size: [bitmap.width, bitmap.height],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING
         | GPUTextureUsage.COPY_DST
         | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture(
    { source: bitmap }, { texture: tex }, [bitmap.width, bitmap.height]);
  bitmap.close();
  return tex;
}
```

### GPUExternalTexture — video, zero-copy

`device.importExternalTexture({ source: HTMLVideoElement })` returns a
texture whose lifetime is **the current JS task**. Destroyed at the next
microtask checkpoint. **Cannot** be cached across `requestAnimationFrame`.

Two choices each frame:
1. **Sample directly** — re-import every frame; submit before yielding.
   WGSL: `var<binding> v: texture_external;` sampled with
   `textureSampleBaseClampToEdge(v, samp, uv)` (no mip, clamped UVs).
2. **Copy to a regular texture** — `copyExternalImageToTexture` from the
   video into a `rgba8unorm` texture. Slower per frame, but the texture
   persists.

Path 1 is the modern default. The browser's internal YUV→RGB shader is
zero-copy on Apple Silicon and some Intel iGPUs (YUV planes sampled
directly from decoder output).

### writeTexture / copyBufferToTexture

CPU-typed-array path (`writeTexture`) and GPU-buffer path
(`copyBufferToTexture`). **`bytesPerRow` must be a multiple of 256** when
the copy spans multiple rows (single-row copies exempt). Pad CPU buffers
to that stride on upload; strip padding on readback.

---

## 9. HDR canvas configuration

```js
ctx.configure({
  device,
  format:       'rgba16float',           // HDR — won't clamp at 1.0
  colorSpace:   'display-p3',            // 'srgb' | 'display-p3' | 'rec2100-hlg'
  toneMapping:  { mode: 'extended' },    // 'standard' (clamp) | 'extended' (Chrome 129+)
  alphaMode:    'opaque',
  usage:        GPUTextureUsage.RENDER_ATTACHMENT,
});
```

- `format: 'rgba16float'` — required for HDR. Linear values can exceed
  1.0; the compositor uses the extended luminance budget.
- `colorSpace: 'display-p3'` — wider gamut on Apple, recent Android.
  `'rec2100-hlg'` for HLG-encoded HDR.
- `toneMapping.mode: 'extended'` — output may exceed 1.0; compositor maps
  to the display's actual capability. Without this, even with
  `rgba16float`, output is clamped to SDR.

Color-space mismatch silently triggers compositor conversion. Match the
canvas color space to the asset color space.

---

## 10. KTX2 / Basis Universal — the production texture pipeline

### Why

A 4K RGBA texture with full mip chain is ~88 MB uncompressed in VRAM:

| Format     | bpp     | 4K mip-chain VRAM |
|------------|---------|-------------------|
| BC7 / ASTC 4×4 | 8 bpp | ~22 MB           |
| BC1 / ETC2 RGB | 4 bpp | ~11 MB           |
| ASTC 6×6   | ~3.6 bpp | ~10 MB         |

Compressed textures stay compressed in VRAM (4–8× sample-time bandwidth
win) and upload 4–8× faster. But hardware support is fragmented: BC on
desktop/Mac, ETC2 on Android, ASTC on Apple/recent ARM. **No single
format ships everywhere.** KTX2 + Basis solves it.

### Pipeline

1. **Author**: PNG/JPG → KTX2 with **UASTC** (high quality) or **ETC1S**
   (small file) Basis Universal payload. Tools: `basisu` CLI from
   KhronosGroup/KTX-Software, or `gltf-transform` for batches.
2. **Ship**: a single `.ktx2` per asset. Optionally Zstd-supercompressed.
3. **Runtime transcode**: at load, the WASM transcoder
   (`basis_transcoder.wasm`) detects the GPU's supported compressed
   formats and transcodes UASTC/ETC1S **into the right native format**
   (BC7, BC3, ASTC, ETC2, etc.) — once, before upload.
4. **Upload**: `copyBufferToTexture` per mip into a compressed-format
   texture.

Result: small file (UASTC/ETC1S on disk), small VRAM
(BC/ASTC/ETC2 in memory), one-time CPU transcode amortized.

### UASTC vs ETC1S

| Codec   | Quality              | File size                   | Best for           |
|---------|----------------------|-----------------------------|--------------------|
| ETC1S   | Lower (~JPEG)        | Small                       | Color, UI          |
| UASTC   | High (~BC7)          | Medium (Zstd-friendly)      | Color **and** data |

UASTC + Zstd is typically 1–2× larger than JPEG on disk but transcodes to
BC7-quality on desktop. Use ETC1S when JPEG-grade artifacts are
acceptable; UASTC when bytes encode anything beyond color (normal maps,
AO).

### What KTX2 doesn't solve

- **HDR**: KTX2 supports HDR pixels, but Basis codecs do not. No
  universal compressed HDR format exists today (BC6H is desktop-only).
  Keep HDR textures small in resolution.
- **Mip generation**: KTX2 stores the full chain you author. Generate
  mips offline before encoding.
- **Compute writes**: compressed formats remain unwritable. Render
  targets and compute scratch must use uncompressed formats.

---

## 11. Texture array vs cube vs 3D in compute

| Dimension          | Sample? | Storage write?               | When to use                        |
|--------------------|---------|------------------------------|------------------------------------|
| `1d`               | yes     | yes                          | Tiny LUTs, gradients               |
| `2d`               | yes     | yes                          | Default                            |
| `2d-array`         | yes     | yes (per-layer via `textureStore(tex, coord, layer, val)`) | Atlases, terrain layers, cascaded shadow maps |
| `cube`             | yes     | **no**                       | Environment maps, irradiance probes |
| `cube-array`       | yes (`cube-array-textures` feature) | **no** | Multiple env probes              |
| `3d`               | yes     | yes                          | Volumetric clouds, fog, SDF, lattice |

The cube write-path: cube is a `2d-array` with 6 layers viewed as
`'cube'`. Storage writes go through the `2d-array` (or per-face `2d`
views); the same memory binds as `'cube'` for sampling. 3D textures
index `gid.xyz` directly — use `(4, 4, 4)` workgroup size.

---

## 12. Decision flow

```
Render target you'll display?
└→ canvas preferred format + 'bgra8unorm-srgb' viewFormat. Render through
   srgb view; compute writes through linear view.

HDR intermediate (bloom, post)?
└→ rgba16float. Always blendable, no feature gate.

Data (normals, masks, IDs, ML feature maps)?
├ 1ch float?  r32float (scratch) / r16float (HDR).
├ 1ch mask?   r8unorm.
├ normal?     rgba8snorm or BC5/ASTC.
└ IDs?        r32uint / rgba8uint.

Color asset shipped to users?
└→ KTX2 + Basis: UASTC for quality, ETC1S for size. Transcoded per device.

Sampler:
├ Color, quality?     linear/linear/linear, anisotropy 4 if oblique.
├ Pixel-art / LUT?    nearest/nearest/nearest.
├ Shadow map?         comparison sampler + linear filter (free PCF).
└ f32 no feature?     non-filtering sampler + 'unfilterable-float'.

MSAA:
├ Mobile / tile-based?     4× MSAA, near-free.
├ Desktop edge alias?      4× MSAA, profile cost.
├ Shader aliasing?         MSAA won't help. Use TAA.
└ Storage target?          MSAA forbidden. Render → resolve → bind storage.
```

---

## 13. Common mistakes (texture/sampler-specific)

Extends `buffers-textures-bindings.md` §"Common mistakes":

1. **`rgba8unorm` displayed without sRGB encoding** → washed-out colors.
   Use sRGB view (§3) or apply curve in-shader.
2. **Shader manually outputs sRGB to a `*-srgb` render target** →
   double-encoded. Shader writes linear; target encodes.
3. **`maxAnisotropy: 16` with any `'nearest'` filter** → creation error.
   All three filters must be `'linear'`.
4. **`copyExternalImageToTexture` to a texture missing `RENDER_ATTACHMENT`**
   → validation error. Internal copy uses a render pass.
5. **Caching `GPUExternalTexture` across rAF** → expired between tasks.
   Re-import every frame.
6. **MSAA without `storeOp: 'discard'` on the multi-sample view** → 4×
   bandwidth for a target you never read. Discard MSAA, store resolve.
7. **Reading mip i + writing mip i+1 in the same render pass** →
   sub-resource hazard. Separate passes, or compute with barriers.
8. **`textureSample` in compute** → no derivatives. Use
   `textureSampleLevel` with explicit mip, or `textureLoad`/`textureStore`.
9. **Compressed format as a render target** → forbidden.
10. **Storage texture WGSL `<format, write>` ≠ layout `format`** →
    creation error. Must match character-for-character.
11. **`view.format` not in `texture.viewFormats`** → `createView`
    validation error. Pre-declare every alternate format at create time.
12. **`depth24plus` and assuming bit count** → implementation-defined.
    Use `depth32float` when you need known semantics (picking, reverse-Z).
13. **Filtering sampler bound with `'unfilterable-float'` texture** →
    layout error. Filterable format (request `float32-filterable` for f32)
    or non-filtering sampler.
14. **`copyTextureToTexture` between different formats** → forbidden.
    Same format + dimension only; use a render/compute pass to convert.
