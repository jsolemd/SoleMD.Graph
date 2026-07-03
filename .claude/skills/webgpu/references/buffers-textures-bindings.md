---
name: WebGPU buffer, texture, and binding model
description: Buffer usage flag legality, alignment rules (256-byte / vec3 trap), uniform vs storage, dynamic offsets, texture format taxonomy, storage textures, MRT, multisampling, bind group layouts, samplers, data-movement table
---

# Buffer, texture, and binding model

## Buffer model

### Usage flags (canonical bit values)

```js
GPUBufferUsage.MAP_READ      = 0x0001
GPUBufferUsage.MAP_WRITE     = 0x0002
GPUBufferUsage.COPY_SRC      = 0x0004
GPUBufferUsage.COPY_DST      = 0x0008
GPUBufferUsage.INDEX         = 0x0010
GPUBufferUsage.VERTEX        = 0x0020
GPUBufferUsage.UNIFORM       = 0x0040
GPUBufferUsage.STORAGE       = 0x0080
GPUBufferUsage.INDIRECT      = 0x0100
GPUBufferUsage.QUERY_RESOLVE = 0x0200
```

### Legality matrix

The mapping flags are **mutually exclusive with all non-copy usages**:
- `MAP_READ` may **only** combine with `COPY_DST`. Any other bit triggers `Buffer usages [MAP_READ, X] are invalid`.
- `MAP_WRITE` may **only** combine with `COPY_SRC`.
- The two map flags are mutually exclusive with each other.

Implication: the **staging-buffer ring**. You cannot map and bind the same buffer. For per-frame uploads to STORAGE/UNIFORM, you map a `MAP_WRITE | COPY_SRC` staging buffer, write into the mapped range, `unmap`, then `copyBufferToBuffer` into the resident GPU buffer that carries `STORAGE | COPY_DST`.

All non-mapping flags can be OR-ed freely. A typical particle position buffer is `STORAGE | VERTEX | COPY_DST`: storage so compute integrates motion, vertex so render reads directly without copy, copy_dst for `writeBuffer` initialization. `INDIRECT` pairs with `STORAGE | COPY_DST` so a compute pass writes draw counts that a later `drawIndirect` consumes. `QUERY_RESOLVE` only applies to the destination of `resolveQuerySet` and is normally paired with `COPY_SRC` for readback.

### Alignment rules

- **Buffer size and offsets**: minimum 4-byte alignment everywhere (vertex offset, copy offset, indirect offset).
- **Mapped range alignment**: `mapAsync` offset must be a multiple of 8; size a multiple of 4.
- **Uniform buffer field alignment in WGSL**: 16 bytes for the *struct* and any `vec3`/`vec4`/`mat*` member.
- **Dynamic offset alignment**: `minUniformBufferOffsetAlignment` and `minStorageBufferOffsetAlignment`, both default 256 bytes. "Lower-is-better" alignment limit; query the device:
  ```js
  const align = device.limits.minUniformBufferOffsetAlignment; // 256 desktop, 64 some Apple
  ```
  When packing many per-object uniform blocks for dynamic offsetting, each block must be padded to that alignment, *not* the WGSL struct size.

### WGSL packing rules (the vec3 trap)

Per the host-shareable layout: alignments `f32/i32/u32 = 4`, `vec2 = 8`, `vec3 = 16`, `vec4 = 16`, `mat4x4 = 16`. **`vec3<f32>` occupies 16 bytes in arrays and structs** — three floats of payload, one float of padding. `mat3x3f` is three padded vec3s = 48 bytes, not 36.

```wgsl
struct Particle {           // align = 16, size = 32
  position: vec3f,          // offset  0, 12 data + 4 pad
  lifetime: f32,            // offset 12 (fills the pad slot)
  velocity: vec3f,          // offset 16, 12 data + 4 pad
  color_packed: u32,        // offset 28
};
```

Putting an `f32` immediately after a `vec3f` lets it occupy the pad slot — the only way to get 16-byte structs without waste. For pure `vec3f` arrays, accept the 4-byte tax or rewrite as separate columns (SoA vs AoS). For 1M particles, columnar (`positionsX`, `positionsY`, …) cuts memory by 25% and aligns better with compute coalescing on Apple/Intel iGPUs.

Storage buffers in `var<storage>` use the same rules as uniform in `var<uniform>` *unless* the field is the trailing runtime-sized array of a tightly-packed scalar — `array<f32>` strides at 4. The relaxed packing of `read` storage buffers does **not** drop the 16-byte struct alignment of containing structs.

### Uniform vs storage

| | Uniform | Storage |
|---|---|---|
| WGSL access | `var<uniform>` (read) | `var<storage, read>` or `read_write` |
| Default size cap | `maxUniformBufferBindingSize` = **64 KiB** | `maxStorageBufferBindingSize` = **128 MiB** |
| Random-access cost | Scalar/uniform load (broadcast) on most HW | Vector load through cache; non-uniform indexing penalized |
| Best for | Camera, per-material constants, small per-draw | Skin matrices, instance buffers, particle arrays, anything > 64 KiB |
| Visibility | Vertex/fragment/compute | Vertex/fragment/compute (`read_write` only in compute) |

A 1M-particle position buffer (12 bytes/particle = 12 MB) has no choice — uniform impossible, storage with `read` access in vertex stage is the contract, plus `read_write` in compute for integration.

### Dynamic offsets

Set up a single backing buffer holding N per-object blocks each padded to 256 B. Declare bind group entry with `hasDynamicOffset: true`, set `minBindingSize` to WGSL struct size (validation catches overruns at submit, not draw):

```js
layout: device.createBindGroupLayout({ entries: [{
  binding: 0,
  visibility: GPUShaderStage.VERTEX,
  buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 96 },
}]});

pass.setBindGroup(0, perObjectBG, [objectIndex * 256]);
```

Pipeline-layout-wide caps: `maxDynamicUniformBuffersPerPipelineLayout = 8`, `maxDynamicStorageBuffersPerPipelineLayout = 4`. Dynamic offsets win because `setBindGroup(_, sameBG, [newOffset])` is a 4-byte command-buffer write; recreating bind groups per draw is allocator pressure.

### writeBuffer vs map vs copyBuffer — performance

- `queue.writeBuffer(buf, off, data)` — safe default. For ArrayBuffer sources can be zero-copy. Best for one-shot or moderate-rate uploads.
- `mappedAtCreation: true` — only path that bypasses COPY_DST flag entirely. Use for static vertex/index data populated procedurally.
- Staging-ring with `MAP_WRITE | COPY_SRC` + `copyBufferToBuffer` — needed for high-frequency, large per-frame uploads (16 MB/frame particle state). Cycle 2–3 staging buffers; never `await mapAsync()` on a buffer the GPU might still be reading.

For a graph-viz particle system: positions integrated on GPU live entirely in `STORAGE` and never round-trip; only seed initialization needs `writeBuffer`.

## Texture model

### Dimensions

- `1d`: array layers fixed at 1, no mips beyond level created.
- `2d`: supports `depthOrArrayLayers > 1` (texture arrays) and full mip chains. Cubemaps are 2d textures with 6 layers, viewed as `cube`.
- `3d`: volumetric. Mips reduce all three axes. Sliced views via `baseArrayLayer`.

### Color format taxonomy

| Format | Filter | Render | Blend | Storage | Notes |
|---|---|---|---|---|---|
| `rgba8unorm` | yes | yes | yes | yes (write/read-write may need feature) | Default workhorse |
| `rgba8unorm-srgb` | yes | yes | yes | no | sRGB decode on sample, encode on write |
| `bgra8unorm` | yes | yes | yes | only with `bgra8unorm-storage` | Canvas preferred format on most platforms |
| `rgba16float` | yes | yes | yes | yes | HDR intermediate; bloom/glow accumulation |
| `rgba32float` | only with `float32-filterable` | yes | only with `float32-blendable` | yes | Position/velocity buffers; expensive bandwidth |
| `r32float`/`rg32float` | float32-filterable gated | yes | float32-blendable gated | yes (and **read-write**) | Only formats allowing `read_write` storage textures without features |
| `rg11b10ufloat` | yes | yes (with feature) | yes | no | Compact HDR |
| `r8unorm`, `rg8unorm` | yes | yes | yes | no | Mask/lookup tables |

Compressed formats are feature-gated:
- `texture-compression-bc`/`bc-sliced-3d`: BC1–BC7 (PC/Mac, ~always present).
- `texture-compression-etc2`: ETC2/EAC (ubiquitous on Android).
- `texture-compression-astc`/`astc-sliced-3d`: ASTC 4×4..12×12 (mobile, Apple).

Compressed formats: filter yes, render no, blend no, storage no. Portable strategy is Basis Universal transcoded to BC/ETC2/ASTC at load.

### Mip chains

There is **no built-in mip generator**. Two patterns:
1. **Render-pass mip chain** (most portable): for each level i+1, draw a full-screen triangle sampling level i with linear filter, into a view with `baseMipLevel: i+1`. Texture must have `RENDER_ATTACHMENT | TEXTURE_BINDING`.
2. **Compute mip generator**: write to `texture_storage_2d<rgba8unorm, write>` views per level; faster on desktop, requires format in storage cap set.

```js
const tex = device.createTexture({
  size: [w, h], format: 'rgba8unorm',
  mipLevelCount: Math.floor(Math.log2(Math.max(w,h))) + 1,
  usage: GPUTextureUsage.TEXTURE_BINDING
       | GPUTextureUsage.RENDER_ATTACHMENT
       | GPUTextureUsage.COPY_DST,
});
```

Each render pass needs a *separate* bind group (reading mip i while writing mip i+1 with a single view aliases).

### Texture views

```js
tex.createView({
  format,             // must be view-format-compatible (e.g. rgba8unorm <-> srgb if listed in viewFormats at create)
  dimension,          // '2d', '2d-array', 'cube', '3d', etc.
  aspect,             // 'all' | 'depth-only' | 'stencil-only'
  baseMipLevel, mipLevelCount,
  baseArrayLayer, arrayLayerCount,
});
```

Common uses:
- **sRGB toggle**: create `rgba8unorm` storage texture, declare `viewFormats: ['rgba8unorm-srgb']`, view as sRGB for sampling but linear for compute writes.
- **Depth-only sampler**: depth-stencil texture viewed with `aspect: 'depth-only'` for shadow comparison samplers.
- **Cube from layered 2D**: create `[size, size, 6]` 2d texture, view as `cube`.

## Storage textures

Format restrictions are explicit and small:
- **Allowed without features**: `rgba8(unorm|snorm|uint|sint)`, `rgba16(float|uint|sint)`, `rgba32(float|uint|sint)`, `rg32(float|uint|sint)`, `r32(float|uint|sint)`.
- **Not allowed without feature**: `bgra8unorm` (gated), every srgb format, every depth/stencil format, every compressed format, `rgb10a2unorm`, `rg11b10ufloat`.

Access modes:
- `write-only` — universal, allowed in compute and fragment.
- `read-write` — only `r32float`, `r32sint`, `r32uint` without features.
- `read-only` — recently spec'd; storage texture with sampler stripped.

WGSL declaration carries the format (part of the type, not the bind group):
```wgsl
@group(0) @binding(0) var img: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8,8)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  textureStore(img, gid.xy, vec4f(0.0, gid.x as f32 / 1024.0, 0.0, 1.0));
}
```

Bind group layout:
```js
{ binding: 0, visibility: GPUShaderStage.COMPUTE,
  storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '2d' } }
```

Format mismatch between WGSL and layout is creation-time validation: `Storage texture format mismatch`.

## Render attachments and MRT

- `maxColorAttachments` default **8**.
- `maxColorAttachmentBytesPerSample` default **32 bytes** (sum across attachments at one MSAA sample). MRT pass with 4× `rgba16float` (8 B each) + `r32float` (4 B) = 36 B *fails* on minimum-spec hardware. Query `device.limits.maxColorAttachmentBytesPerSample`.
- Each attachment's `format` must match pipeline's `fragment.targets[i].format` exactly.
- Each attachment carries its own blend state: `targets: [{ format, blend, writeMask }]`.

```wgsl
struct GBuffer {
  @location(0) albedo:   vec4f,
  @location(1) normal:   vec4f,
  @location(2) material: vec4f,
};
@fragment fn fs(...) -> GBuffer { ... }
```

Depth-stencil attachment: format must match `pipeline.depthStencil.format`. `depthLoadOp`/`depthStoreOp` and `stencilLoadOp`/`stencilStoreOp` independent. For `depth24plus-stencil8` you must specify both pairs even if you only use depth.

## Multisampling

WebGPU v1 supports `sampleCount` of **1 or 4 only**. Both texture and pipeline must agree:

```js
const msaa = device.createTexture({
  size: [w, h], format: presentationFormat, sampleCount: 4,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});
const pipeline = device.createRenderPipeline({
  multisample: { count: 4 },
  fragment: { targets: [{ format: presentationFormat }] }, ...
});
```

In the render pass, point `view` at MSAA texture and `resolveTarget` at canvas (or any 1-sample texture). Driver performs box-filter resolve at end-of-pass:

```js
colorAttachments: [{
  view: msaa.createView(),
  resolveTarget: ctx.getCurrentTexture().createView(),
  loadOp: 'clear', storeOp: 'discard',  // discard MSAA texture; only resolve persists
}]
```

`storeOp: 'discard'` on MSAA target is standard — only need the resolved 1-sample image. For multi-pass, resolve only on last pass; intermediate passes use `loadOp: 'load'` against MSAA texture.

Sampled MSAA textures bind with `multisampled: true` in layout and `texture_multisampled_2d<f32>` in WGSL (no sampler — `textureLoad(t, coord, sampleIndex)`).

## Bind groups and layouts

`maxBindGroups = 4`. Plan four slots up front by update frequency:

| Group | Frequency | Typical contents |
|---|---|---|
| 0 | Per-frame | Camera/view/projection, time, viewport |
| 1 | Per-pass | Light list, shadow atlas, scene SDF |
| 2 | Per-material | Albedo/normal/PBR textures, sampler |
| 3 | Per-draw | Model matrix (or dynamic-offset slice) |

### Layout entry shape

```js
{
  binding: N,
  visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
  // exactly one of:
  buffer:        { type: 'uniform' | 'storage' | 'read-only-storage',
                   hasDynamicOffset: false, minBindingSize: 0 },
  texture:       { sampleType: 'float' | 'unfilterable-float' | 'depth' | 'sint' | 'uint',
                   viewDimension: '2d', multisampled: false },
  storageTexture:{ access: 'write-only' | 'read-write' | 'read-only',
                   format: 'rgba8unorm', viewDimension: '2d' },
  sampler:       { type: 'filtering' | 'non-filtering' | 'comparison' },
  externalTexture: {},
}
```

`sampleType: 'float'` requires a *filterable* format. `rgba32float` without `float32-filterable` must use `'unfilterable-float'` and `'non-filtering'` sampler; mismatch produces `Texture binding sample type incompatible`.

### Pipeline-layout sharing

Avoid `layout: 'auto'` past prototyping. Auto layouts are unique per pipeline, so a bind group built for pipeline A cannot be used on pipeline B even with identical binding sets. Build named `GPUBindGroupLayout`s once, compose into `GPUPipelineLayout`, share across pipelines.

### Hot-swap discipline

Order draw loops by frequency (set group 0 once outside the loop, group 1 outside the material loop, group 2 inside). The per-mesh bind group is the *only* `setBindGroup` call inside the inner loop. For pure per-instance variation, use a single storage buffer indexed by `@builtin(instance_index)` and `drawIndexed(_, N)` once — zero per-draw bind churn.

### External textures

`importExternalTexture({ source: HTMLVideoElement })` returns `GPUExternalTexture` valid **only for the current task**. Re-import every frame; do not cache across `requestAnimationFrame`. Layout entry: `externalTexture: {}`; WGSL type: `texture_external` with `textureSampleBaseClampToEdge`.

## Samplers

```js
device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',       // 'clamp-to-edge' | 'repeat' | 'mirror-repeat'
  addressModeV: 'repeat',
  addressModeW: 'clamp-to-edge',
  lodMinClamp: 0, lodMaxClamp: 32,
  compare: undefined,           // 'less' etc → comparison sampler for shadow maps
  maxAnisotropy: 16,            // 1..16; >1 implies linear min/mag/mipmap
});
```

Comparison samplers (`compare` set) bind with `sampler: { type: 'comparison' }` and pair with `texture_depth_2d` in WGSL using `textureSampleCompare`. Anisotropy > 1 silently fails validation if any filter is `'nearest'`.

## Data movement table

| Method | Source | Destination | Sync | Best for | Pitfalls |
|---|---|---|---|---|---|
| `queue.writeBuffer(buf, off, data)` | CPU TypedArray | GPU buffer (`COPY_DST`) | Queued | Default sub-MB updates, init data | None until per-frame bottleneck |
| `mappedAtCreation: true` + `getMappedRange()` + `unmap()` | CPU | New GPU buffer (any usage) | Sync CPU write | Static vertex/index/storage built once | Only at creation; can't reuse |
| `mapAsync(WRITE)` ring + `copyBufferToBuffer` | CPU via mapped staging | Resident GPU buffer | Async map, deterministic copy | High-rate per-frame uploads (16 MB/frame particle seeds) | Never await on in-use buffer; rotate 2–3 |
| `mapAsync(READ)` after `copyBufferToBuffer` | GPU buffer | CPU TypedArray | Async, often 1–3 frames latency | Compute readback, picking, screenshots | Stalls if awaited same-frame |
| `copyBufferToBuffer(src, srcOff, dst, dstOff, size)` | GPU buffer | GPU buffer | Recorded into encoder | Staging → resident, snapshotting | Offsets/size align to 4 |
| `queue.writeTexture(dst, data, layout, size)` | CPU TypedArray | GPU texture (`COPY_DST`) | Queued | Small textures, per-mip uploads, lookup tables | `bytesPerRow` multiple of **256** when copy spans multiple rows |
| `copyBufferToTexture(src, dst, size)` | GPU buffer (`COPY_SRC`) | Texture (`COPY_DST`) | Recorded | Compute-generated textures, decoded mip chains | Same 256-byte rule; `rowsPerImage` for 3D/array |
| `copyTextureToBuffer(src, dst, size)` | Texture (`COPY_SRC`) | Buffer (`COPY_DST`) | Recorded | Read-back, screenshots | Buffer must be sized with padded `bytesPerRow`; reconstruct stride on CPU |
| `copyExternalImageToTexture({ source, flipY, colorSpaceConversion }, { texture, premultipliedAlpha }, size)` | ImageBitmap/Canvas/Video/OffscreenCanvas | Texture (`COPY_DST | RENDER_ATTACHMENT`) | Queued | Loading PNG/JPG via ImageBitmap, video frames | flipY/color-space happen on GPU; texture must be `RENDER_ATTACHMENT` |
| `importExternalTexture({ source: video })` | HTMLVideoElement | `texture_external` | Per-task lifetime | Video sampling without copy | Invalidates after current task; re-import every frame |

## Common mistakes

1. **`MAP_WRITE | UNIFORM` on the same buffer.** `Buffer usages [MAP_WRITE, UNIFORM] are invalid`. Fix: separate staging buffer + `copyBufferToBuffer`, or `writeBuffer`.
2. **Forgetting 256-byte `bytesPerRow` on `writeTexture`.** Symptom: `Bytes per row is not a multiple of 256` when copy spans multiple rows. Single-row exempt. Pad CPU buffer rows; strip padding on readback.
3. **`vec3` arrays sized as 12 bytes.** WGSL strides at 16. Symptom: shader reads garbage every fourth element, no validation error. Fix: `vec4`, manual pad, or columnar `array<f32>`.
4. **Dynamic offset not multiple of 256.** `Dynamic offset[N] is not a multiple of minUniformBufferOffsetAlignment`. Pad each per-object block to 256 even if WGSL struct is 96 bytes.
5. **`layout: 'auto'` then sharing a bind group.** `Bind group layout is not compatible with pipeline layout`. Build explicit layouts and shared `GPUPipelineLayout`.
6. **Sampling `rgba32float` with filtering sampler.** `sample type 'float' requires a filterable format`. Either request `float32-filterable` feature, or layout as `'unfilterable-float'` + `'non-filtering'`.
7. **MSAA texture without `storeOp: 'discard'`.** Paying memory bandwidth for a 4× target you'll never read. `'discard'` on MSAA `view`, `'store'` on `resolveTarget`.
8. **Storage texture format mismatch between WGSL and bind group layout.** `Storage texture binding format mismatch`. Both must agree exactly.
9. **Reusing `importExternalTexture` across rAF.** `External texture is expired`. Re-import every frame.
10. **Exceeding `maxColorAttachmentBytesPerSample` in MRT.** Drop to `rgba8unorm` for non-HDR targets or pack channels.
11. **`read-write` storage texture on `rgba16float`.** Only `r32float/sint/uint` allow `read-write` without features.
12. **Buffer used as VERTEX without VERTEX flag set.** `Buffer usage doesn't include VERTEX`. Flag checked at recording, not at write. Particle position buffer canonical: `VERTEX | STORAGE | COPY_DST`.
13. **Awaiting `mapAsync` on a buffer GPU is still using.** Resolves only after next submit completes referencing it. Use 2–3 buffer ring; rotate via index modulo.
14. **`submit()` after using `getMappedRange`.** `Buffer is mapped`. Always `unmap()` before submit; ArrayBuffer view is detached.
15. **Per-frame `createBindGroup` allocations.** Not validation error, but ~30% throughput cliff on tile-based GPUs. Cache bind groups whose contents don't change; use dynamic offsets for varying offsets.
