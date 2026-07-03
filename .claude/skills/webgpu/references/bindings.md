---
name: WebGPU bindings — bind groups, pipeline layouts, dynamic offsets, visibility, bindless preview
description: Mental model for binding resources to shaders. Frequency tiers, why explicit layouts beat auto, dynamic offsets, visibility flags, immutable bind groups, the absence of push constants, bindless status.
---

# Bindings

The "binding" model is how WebGPU connects shader-side resource slots (`@group(N) @binding(M)`) to GPU-side objects (buffers, textures, samplers). Six objects participate, in two halves: **layouts** (compile-time schema) and **groups** (runtime resource pointers).

```
                    LAYOUT HALF                       GROUP HALF
              (created at boot, immutable)         (created per use, immutable)

GPUBindGroupLayout    →   GPUPipelineLayout    ←   GPURenderPipeline
       ↑                          ↑                /         GPUComputePipeline
       |                          |               /                    ↑
       |                          |              /                     |
       └──────────────────  GPUBindGroup ───────┘                       |
                                  ↑                                    |
                                  └──── pass.setBindGroup(0|1|2|3, BG) ┘
```

Two truths set the rest of this file:

1. **Layouts are the contract**, bind groups are the values that satisfy it. The pipeline can never see a bind group whose layout doesn't match.
2. **Bind groups are immutable**. To "change" what a bind group points at, create a new bind group with the new resources. The expensive step is the `GPUBindGroup` allocation; binding it (`setBindGroup`) is a 4-byte command-buffer write.

> **Cross-references.** Layout *entry shapes* (buffer types, texture sample types, storage texture formats, sampler types) are detailed in [`buffers-textures-bindings.md`](./buffers-textures-bindings.md). Use that file when authoring an entry; use this file to understand what the entry *means* in the binding model.

## 1. The frequency-tier mental model

Bind groups exist because not every uniform changes every frame. A perfectly competent renderer that put the camera, the material, and the per-instance model matrix in *one* bind group per draw would do `O(draws)` rebinds per frame, plus `O(draws)` allocations of new bind groups when the camera moved. The frequency-tier convention makes that work `O(1) + O(materials) + O(instances)`.

The convention — encoded in the slot numbers — is:

| Group | Frequency | Typical contents |
|---|---|---|
| `@group(0)` | **per-frame** | Camera/view/projection, time, viewport size, frame counter |
| `@group(1)` | **per-pass** | Light list, shadow atlas, scene-wide SDF, pass-specific render-target dims |
| `@group(2)` | **per-material** | PBR textures + sampler, material constants |
| `@group(3)` | **per-draw / per-instance** | Model matrix (or dynamic-offset slice), per-instance attributes |

`maxBindGroups` defaults to 4. The slot numbers are *not* magic — the GPU doesn't know that group 0 changes least often. But you signal the frequency with the number, and your draw loop honors it:

```ts
pass.setBindGroup(0, frameBG);                  // once per pass
for (const material of materials) {
  pass.setBindGroup(1, material.passBG);        // once per material
  pass.setBindGroup(2, material.matBG);
  for (const mesh of material.meshes) {
    pass.setBindGroup(3, mesh.meshBG, [mesh.instanceOffset]);   // per draw
    pass.draw(mesh.count, 1);
  }
}
```

Why does this matter beyond CPU draw-call cost? Because **a `setBindGroup` call may force the driver to insert a barrier or flush a descriptor cache**. On D3D12 the binding model is descriptor heaps; on Vulkan it's descriptor sets; on Metal it's argument buffers. All three implementations have **per-bind-group cost** that is some implementation function of "how much state changed". Updating `@group(3)` 100,000 times a frame is fine — it's a small descriptor — but it would be ruinous if your *whole* state lived there. Splitting state by frequency exploits the implementation's caching.

**The slot encodes intent.** Putting the camera at `@group(3)` "works" but signals to every reader of your code that the camera changes per draw. It also breaks the optimizer's ability to share `@group(0)` across pipelines that all use the same camera struct.

## 2. Layout sharing strategy: `auto` is not your friend

`layout: 'auto'` lets you skip writing `GPUBindGroupLayout`s and `GPUPipelineLayout`s — the implementation derives them from the WGSL. It's seductive at first. It is the wrong default for any pipeline that shares state with another pipeline.

### Why auto-layouts break sharing

Auto-derived layouts are unique per pipeline. The spec gives them their own object identity, and **two `auto` layouts for two different pipelines are *never* compatible** — even if they look identical, even if you derived them from shaders with the same `@group/@binding` declarations. A bind group built against one auto-layout pipeline cannot be bound to another. Switching between a node-render pipeline, an edge-render pipeline, and a force-compute pipeline that all share the same `nodes` storage buffer forces a fresh `GPUBindGroup` per pipeline switch.

```ts
// BAD: layout: 'auto'
const renderPipeline  = device.createRenderPipeline({ layout: 'auto', ... });
const computePipeline = device.createComputePipeline({ layout: 'auto', ... });

const renderBG  = device.createBindGroup({ layout: renderPipeline.getBindGroupLayout(0),  ... });
const computeBG = device.createBindGroup({ layout: computePipeline.getBindGroupLayout(0), ... });

// renderBG cannot be bound during a compute pass; computeBG cannot be bound during a render pass.
// Even with identical resources, you allocated two bind groups.
```

### Why auto-layouts pick the wrong defaults

The implementation derives layout entries by reflection — it inspects the shader and infers what each binding is. The inference defaults are conservative:

- A `texture_2d<f32>` becomes `sampleType: 'float'` → **filterable**. If you bind an `rgba32float` view, validation fails (`rgba32float` is unfilterable without the `float32-filterable` feature).
- A `var<storage, read>` becomes `type: 'read-only-storage'`. If you wanted to share a layout between vertex (read-only) and compute (read-write), too bad — you have two layouts now.
- The auto-derived layout sets `hasDynamicOffset: false`. You cannot retrofit dynamic offsets onto an auto-layout pipeline.
- Unused bindings may be silently *dropped* — and shaders sometimes static-eliminate uniforms you thought were used. The dropped binding then doesn't appear in the auto-layout, which is "fine" until your bind group includes a binding the layout doesn't have, which fails validation.

The right default is explicit:

```ts
const sharedBGL = device.createBindGroupLayout({
  label: 'particles-bgl',
  entries: [
    { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: { type: 'read-only-storage', minBindingSize: 16 * 1_000_000 } },
    { binding: 1, visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'storage', hasDynamicOffset: false } },
    { binding: 2, visibility: GPUShaderStage.VERTEX,
      buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: 256 } },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: 'particles-pl',
  bindGroupLayouts: [sharedBGL],
});

const renderPipeline  = device.createRenderPipeline({  layout: pipelineLayout, ... });
const computePipeline = device.createComputePipeline({ layout: pipelineLayout, ... });
```

One layout, two pipelines, one bind group that works on both. This is also what the user-agent's pipeline cache wants — the same explicit layout across reloads of the same shader hashes.

### Auto is fine for one-shots

If you have a debug pass, a one-pipeline visualizer, a pure post-processing kernel that touches no other shader's state — `layout: 'auto'` is tolerable. Treat it as the prototyping mode. Anything that ships goes explicit.

### Layout *compatibility* is structural, not nominal

The spec calls two layouts **group-compatible** if they have the same entries (binding number, visibility, type, dynamic-offset flag, format/sampleType where applicable) — even if they are different `GPUBindGroupLayout` objects. So if you create two BGLs with identical contents in two different modules, bind groups built against either work with pipelines built against either.

In practice you should still de-duplicate to one BGL per logical group. Caching a `Map<descriptorHash, GPUBindGroupLayout>` saves allocations and makes the pipeline cache happier.

## 3. Dynamic offsets: virtualizing per-object data

The brute-force pattern for per-object uniforms is "one bind group per object". For 10,000 objects that is 10,000 bind groups — 10,000 allocations at boot, 10,000 `setBindGroup` calls per frame, 10,000 entries in the driver's descriptor cache. Dynamic offsets reduce that to *one* bind group plus N offsets.

### The mechanism

You allocate **one big buffer** containing N per-object blocks, each padded to `minUniformBufferOffsetAlignment` (default 256 B). You declare the bind group entry with `hasDynamicOffset: true` and `minBindingSize` set to the per-object struct size. You bind the single bind group once and pass per-call offsets to `setBindGroup`:

```ts
const layout = device.createBindGroupLayout({
  entries: [{
    binding: 0,
    visibility: GPUShaderStage.VERTEX,
    buffer: {
      type: 'uniform',
      hasDynamicOffset: true,
      minBindingSize: 96,        // size of the WGSL struct
    },
  }],
});

const bigUniform = device.createBuffer({
  size: 256 * objectCount,        // 256 B per object — pad up from 96
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const onlyBG = device.createBindGroup({
  layout,
  entries: [{ binding: 0, resource: { buffer: bigUniform, size: 96 } }],
});

// Per-draw: one bind group, one offset
for (let i = 0; i < objectCount; i++) {
  pass.setBindGroup(0, onlyBG, [i * 256]);     // dynamic offset in BYTES
  pass.draw(...);
}
```

The cost moved from "per-draw bind-group allocation + per-draw setBindGroup with new BG" to "one BG allocation + per-draw setBindGroup with new offset". The validation cost of the offset (alignment check, size check) is small relative to the allocation cost it replaces. **This pattern almost always wins** for any per-object uniform shape.

### Constraints

- Offset must be a multiple of `minUniformBufferOffsetAlignment` for uniforms — default 256 B; some Apple devices report 64. **Pad your blocks to the alignment**, not to the struct size.
- Offset must be a multiple of `minStorageBufferOffsetAlignment` for storage — default 256 B; can be 16 on some implementations. Storage dynamic offsets exist but are less common because storage buffers usually carry whole arrays you index by `instance_index`.
- `maxDynamicUniformBuffersPerPipelineLayout = 8`, `maxDynamicStorageBuffersPerPipelineLayout = 4`. The pipeline layout limits how many *binding slots* are flagged dynamic across the whole layout.
- The dynamic-offset array passed to `setBindGroup` is in the **order the layout declares dynamic entries**, not by binding number — easy to get wrong if you have multiple dynamic entries.

### Alternative: storage-buffer indexing by `instance_index`

For pure per-instance variation (10K particles each with a transform), a single `array<Transform>` storage buffer indexed by `@builtin(instance_index)` plus a single `pass.draw(vertCount, instanceCount)` is even better — zero `setBindGroup` calls inside the loop. Use dynamic offsets when the per-object block is too large to comfortably array-encode (skin matrices, varying-size data) or when you want to share the binding across vertex/fragment with the same struct shape.

## 4. Visibility flags: `GPUShaderStage.VERTEX | FRAGMENT | COMPUTE`

Each entry in a `GPUBindGroupLayout` has a `visibility` bitfield naming which shader stages can access the binding. The default reflex is to OR all three; this is wrong.

```js
// LAZY
visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,

// CORRECT — only the stages that actually read the binding
visibility: GPUShaderStage.VERTEX,                          // vertex-only attributes
visibility: GPUShaderStage.FRAGMENT,                        // fragment-only material textures
visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, // camera-shared
visibility: GPUShaderStage.COMPUTE,                         // simulation buffers
```

Why narrow visibility matters:

1. **Validation tightens.** A bind group bound during a compute pass that includes a binding flagged `VERTEX` will fail validation. Narrow visibility catches the wrong-pass mistake at submit time, not at GPU time.
2. **The driver gets a tighter optimization signal.** On D3D12 the root signature's visibility flag controls which root parameters propagate to which stages. Wider flags = wider root signature = larger descriptor pressure.
3. **Storage `read-write` can only be flagged `COMPUTE` without a feature.** Wider flags + `read-write` storage = layout creation error (`Storage buffer with read-write access cannot be visible to vertex/fragment without [feature]`).

The compute pipeline only accepts compute-stage bindings; the render pipeline accepts only vertex+fragment. So even though OR-ing all three "validates", you've expressed intent incorrectly. Be tight.

## 5. Storage buffer access modes: `read` vs `read_write`

Storage buffers come in three flavors at the layout level:

| Layout `type` | WGSL declaration | Where allowed | Why |
|---|---|---|---|
| `'uniform'` | `var<uniform>` | Any visibility | Read-only, ≤64 KiB binding, broadcasts across SIMD lanes |
| `'read-only-storage'` | `var<storage, read>` | Any visibility | Read-only, ≤128 MiB binding, vector load through cache |
| `'storage'` | `var<storage, read_write>` | Compute-only by default | Random read/write, atomics |

The `read-only-storage` vs `storage` split exists because **a write-capable binding forces the driver to insert memory barriers** and to mark the resource as in-flight for any subsequent reader. By declaring read-only, the driver can:

- Skip cache invalidation between dispatches.
- Cache the binding in shader-resource view (D3D12 SRV / Vulkan UNIFORM_BUFFER) instead of unordered-access view (UAV / STORAGE_BUFFER), which has better fast-path on most GPUs.
- Allow the binding in vertex/fragment stages without features — `read-write` storage in fragment requires the `fragment-storage-rw` feature flag (still proposal-status as of Chrome 144).

**Atomic types force `read_write`.** WGSL `atomic<u32>` requires the buffer be `var<storage, read_write>`. You cannot have an atomic counter in a read-only buffer. Practical pattern: keep small read-write buffers for atomics and large read-only buffers for the data you don't atomically mutate.

```wgsl
@group(0) @binding(0) var<storage, read>       points: array<vec4f>;       // 1M particles, read-only in fragment
@group(0) @binding(1) var<storage, read_write> visible: array<atomic<u32>>; // small visibility bitmap
@group(0) @binding(2) var<storage, read_write> indirect: DrawArgs;          // compute writes draw count
```

Layout side:
```ts
entries: [
  { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
    buffer: { type: 'read-only-storage' } },
  { binding: 1, visibility: GPUShaderStage.COMPUTE,
    buffer: { type: 'storage' } },
  { binding: 2, visibility: GPUShaderStage.COMPUTE,
    buffer: { type: 'storage' } },
]
```

If you accidentally flag the read-only buffer as `'storage'` at the layout level, validation forgives — but you've told the driver to assume writes. You lose the read-only fast path. **Match the WGSL access mode to the layout type exactly.**

## 6. Bind groups are immutable: rebuild, don't mutate

A `GPUBindGroup` is created once and never changed. There is no `bindGroup.setEntry(...)`. To change what binding 0 points at, you create a *new* bind group with the new resource:

```ts
const bg = device.createBindGroup({
  layout,
  entries: [
    { binding: 0, resource: { buffer: positionsT } },   // current frame
    { binding: 1, resource: { buffer: positionsT1 } },  // previous frame
  ],
});

// Next frame: ping-pong. Swap the entries — by creating a new bind group.
const bgNext = device.createBindGroup({
  layout,
  entries: [
    { binding: 0, resource: { buffer: positionsT1 } },
    { binding: 1, resource: { buffer: positionsT } },
  ],
});
```

This sounds expensive — and it is, *if you do it per draw*. A typical pattern with 10,000 objects each rebuilding their bind group every frame allocates 10,000 GPU descriptor blocks per frame; on a tile-based GPU that's a measurable throughput cliff (~30%).

Three strategies that avoid the cliff:

### Cache by content hash

Most objects don't actually change their bindings frame to frame. A material's textures are stable; a mesh's vertex buffer is stable. Build the bind group once at construction, store on the object, reuse forever. New bind group only when the contents genuinely change.

### Use dynamic offsets instead

When the *only* thing changing per draw is an offset into a shared uniform/storage buffer, dynamic offsets eliminate the bind-group-per-object pattern entirely. See section 3.

### Use a small ring of bind groups for double/triple-buffered resources

For ping-pong compute (alternating "current" and "next" buffers), build *two* bind groups at startup — `bgEven` and `bgOdd` — and swap between them based on `frameIndex & 1`. Bind-group allocation is amortized across all frames; per-frame work is one `setBindGroup` call.

```ts
const bgEven = device.createBindGroup({ layout, entries: [{...A}, {...B}] });
const bgOdd  = device.createBindGroup({ layout, entries: [{...B}, {...A}] });

function frame(i: number) {
  pass.setBindGroup(0, i & 1 ? bgOdd : bgEven);
  // ...
}
```

This is the pattern for particle ping-pong, prefix-sum scratch, any GPGPU kernel that reads from one buffer and writes to another and swaps roles next frame.

### What bind-group "binding" actually costs

The act of `pass.setBindGroup(0, bg, [...offsets])` is a 4–8 byte command-buffer write plus offset bytes — micro cost. The cost is in *building* the `GPUBindGroup` object: layout match validation, descriptor table allocation, format checks against the layout. Move the construction outside the hot path.

## 7. The bindless preview — and what to do today

Bindless rendering means: shaders index into an *array* of all textures or buffers, picking one at runtime by an integer ID. The CPU doesn't bind a specific texture; it binds *the table* once. Modern engines lean on bindless for material variance with zero CPU draw-call overhead.

**WebGPU does not have bindless yet.** The eventual feature is gated behind two pieces:

1. The `texture_and_sampler_let` WGSL extension lets you assign textures and samplers to `let` bindings — the foundation for runtime indexing into texture arrays. As of May 2026 this is in Chrome behind `chrome://flags/#enable-unsafe-webgpu`; it's the prerequisite, not bindless itself.
2. The full bindless proposal (large texture/sampler arrays at the layout level, unbounded indexing) is still in WebGPU spec draft.

### Today's substitute: large texture arrays + index

```wgsl
@group(0) @binding(0) var matAlbedo: texture_2d_array<f32>;
@group(0) @binding(1) var matSamp:   sampler;
@group(0) @binding(2) var<storage, read> matIndex: array<u32>;

@fragment fn fs(in: VsOut) -> @location(0) vec4f {
  let idx = matIndex[in.instance];
  return textureSample(matAlbedo, matSamp, in.uv, idx);
}
```

You allocate one `texture_2d_array<f32>` with up to `maxTextureArrayLayers` layers (default 256, modern GPUs 2048), upload all materials into layers, and pick the layer per-instance. **One bind group, N materials, zero draw call overhead beyond `instance_index` arithmetic.**

Constraints:
- All layers must be the same dimensions, format, mip count. Heterogeneous textures cannot live in one array.
- `maxTextureArrayLayers` is 256 default, 2048 on most desktop adapters. Plan to tier (e.g., per-shader-feature texture arrays).
- Atlas-style packing into a 2D atlas with UV remapping is the alternative when the constraint bites — slower per-fragment than `textureSampleArray` because of bilinear seams at atlas borders.

### Sampler arrays

A small set of samplers (linear, nearest, anisotropic) suffices for most material work. Keep them in a fixed bind group at boot. Don't burn array layers on samplers.

## 8. Push constants don't exist in WebGPU

In Vulkan, push constants are a small (<128 B) per-draw scratch space written via the command buffer with no resource binding at all. They're the lowest-overhead way to ship "this draw is mesh #47" into a shader. **WebGPU explicitly omits this feature** — there's no equivalent to `vkCmdPushConstants` and no plan to add one.

The three substitutes, in order of typical preference:

### 1. Small uniform buffer with dynamic offsets

Allocate one `UNIFORM | COPY_DST` buffer of `256 * N` bytes, write per-draw blobs at boot, bind once, change offset per draw. This is push-constants-with-extra-steps and the closest analog. See section 3.

### 2. Pipeline-overridable constants (`override`)

For values that are constant *for all draws of a pipeline variant* — like `BLUR_RADIUS = 8` or `TONEMAP_MODE = 1` — use WGSL `override` constants. These specialize the shader at pipeline creation time:

```wgsl
@id(0) override BLUR_RADIUS: u32 = 8;
@id(1) override TILE_SIZE:   u32 = 16;
override INV_GAMMA: f32 = 1.0 / 2.2;     // @id-less overrides allowed; must be unique by name
```

```ts
device.createComputePipeline({
  layout,
  compute: {
    module,
    entryPoint: 'main',
    constants: { 0: 16, 1: 32, INV_GAMMA: 0.4545 },
  },
});
```

The pipeline cache caches the *parsed module* across constant variations, so re-specializing for a different blur radius is cheap. Override constants cannot be vectors, arrays, or change per-draw — they are compile-time-ish (resolved at pipeline creation, not at runtime). They are the right tool for "I have 4 quality levels of this shader" or "I need to bake a tile size".

### 3. Per-instance attribute buffers

For per-draw values that are genuinely different per draw and small (a few u32s), shipping them via a vertex buffer with `stepMode: 'instance'` and reading via `@location(N)` is sometimes simpler than dynamic offsets. The vertex puller takes care of indexing.

### What about `setBindGroup` repeatedly with different one-element buffers?

Don't. Each different buffer is a different resource; the bind group must be rebuilt; you've reintroduced exactly the cost dynamic offsets exist to avoid.

## 9. External textures bind differently

`importExternalTexture({ source: HTMLVideoElement })` returns a `GPUExternalTexture`. The layout entry is `externalTexture: {}` (no further config); the WGSL type is `texture_external`. Sampling uses `textureSampleBaseClampToEdge` (no mip select, clamp address). The catch: **the external texture is valid only for the current task**. Re-import every frame; do not cache across `requestAnimationFrame`. The bind group built against it is also invalidated.

```ts
function frame() {
  const ext = device.importExternalTexture({ source: video });
  const videoBG = device.createBindGroup({
    layout: videoBGL,
    entries: [{ binding: 0, resource: ext }],
  });
  // ... use videoBG this frame only ...
}
```

This is the one place WebGPU forces per-frame bind group construction by design. See [`buffers-textures-bindings.md`](./buffers-textures-bindings.md) for the texture side.

## 10. Common mistakes (cheat sheet)

1. **`layout: 'auto'` then sharing a bind group across pipelines.** Symptom: `Bind group is not compatible with pipeline layout`. Fix: explicit `GPUPipelineLayout` shared across pipelines.
2. **Auto-derived layout picks wrong sample type.** Symptom: `sample type 'float' requires a filterable format` on `rgba32float` textures. Fix: explicit layout with `sampleType: 'unfilterable-float'`.
3. **Dynamic offset not multiple of 256.** Symptom: `Dynamic offset[N] is not a multiple of minUniformBufferOffsetAlignment`. Fix: pad each per-object block to `device.limits.minUniformBufferOffsetAlignment` (read it; it can be 64 or 256).
4. **Visibility flags too wide.** Symptom: layout creation error when `read_write` storage is flagged for vertex/fragment without the relevant feature. Fix: narrow visibility to `COMPUTE` for write-capable storage.
5. **Per-frame `createBindGroup` allocations.** Symptom: ~30% throughput cliff on tile-based GPUs. Fix: cache bind groups whose contents don't change; use dynamic offsets for varying offsets; ring-buffer for ping-pong.
6. **Treating `getBindGroupLayout(0)` from one auto-pipeline as compatible with another.** Symptom: bind group rejected on second pipeline. Fix: explicit layout, full stop.
7. **Forgetting to call `setBindGroup` for unused groups.** Symptom: "Bind group X is not set" if the pipeline layout has more groups than your encoder bound. Fix: bind all groups the pipeline layout declares, even if a particular shader doesn't read from one.
8. **Atomic counter in `read-only-storage`.** Symptom: shader-compile error. Fix: separate small `'storage'` buffer for atomics; keep the bulk read-only.
9. **Caching `GPUExternalTexture` across frames.** Symptom: `External texture is expired`. Fix: re-import every frame.
10. **`minBindingSize: 0` in production.** Spec default; defers validation to draw time. Fix: set to actual struct size; layout validation catches under-sized buffers at bind-group creation time, much earlier.
11. **Reusing dynamic offsets across `setBindGroup` calls assuming order.** Symptom: wrong offset to wrong binding. Fix: dynamic-offset array order = order of dynamic entries in the layout, not binding number order.
12. **Passing `resource: buffer` instead of `resource: { buffer }` and expecting an offset.** Symptom: validation fine but offset and size at defaults (0, full size). Fix: when you want offset/size, use the `GPUBufferBinding` form `{ buffer, offset, size }`.
