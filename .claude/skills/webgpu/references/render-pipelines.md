---
name: WebGPU render pipelines, draw, and render passes
description: Render pipeline as baked state object, vertex pulling vs vertex buffers, primitive/depth/stencil/blend deep dives, MRT, render bundles, indirect draws, render pass mechanics, pipeline cache, override constants, deferred rendering shape
---

# Render pipelines, draw, and render passes

The render pipeline is **the** unit of GPU state in WebGPU. Once created it is a frozen object — every fixed-function block (vertex layout, primitive topology, depth-stencil, blend, multisample, fragment outputs) is locked in. Bind it once with a single command-buffer write; re-create it never. The whole performance model of the API hangs off this distinction.

For descriptor mechanics common to both pipelines and bind groups, see `buffers-textures-bindings.md` (validation legality card) plus `bindings.md` (binding-model "why"). For shader-side WGSL, see `wgsl.md`. For compute pipelines specifically, see `compute-fundamentals.md`. This file is the canon for **render** state, draw call mechanics, and render passes.

## The render pipeline as a baked state object

When you call `createRenderPipeline(desc)` the implementation does work the WebGL programmer never had to think about:

1. Parse WGSL into an internal AST.
2. Validate the descriptor against bind-group layouts, fragment target formats, vertex attributes, depth-stencil compatibility, multisample count, override constants.
3. Translate WGSL → backend IR: SPIR-V (Vulkan/Linux/Android), MSL (Apple), HLSL/DXIL (Windows D3D12).
4. Hand IR to the vendor driver, which compiles to vendor ISA (GCN/RDNA, Apple GPU, Turing/Ada, Intel Xe). This is the slow step — vendor compilers run register allocation, instruction scheduling, sometimes machine learning-driven heuristics.
5. Bake all fixed-function state (cull mode, depth compare, blend factors, sample mask) into the pipeline state object the backend understands (a Vulkan `VkPipeline`, a Metal `MTLRenderPipelineState`, a D3D12 PSO).

**Cost on real machines:** simple pipelines compile in 1-5 ms; complex shaders with subgroups, large bind groups, or many override constants can hit 50-200 ms. On cold-cache D3D12/Windows the first pipeline of the session may take longer because the driver also initializes the graphics command queue.

**Cost to bind:** a single backend command. `setPipeline(p)` is essentially free — one bind-point swap. The whole API is designed around "create N pipelines once, switch between them at frame time."

### Cache strategy and async creation

You cannot influence the implementation cache (no `pipelineCache` like Vulkan exposes). Chrome/Dawn cache pipelines internally by descriptor hash. Your job is upstream: enumerate every state combination, create them all at boot via `createRenderPipelineAsync` (sync `createRenderPipeline` serializes the GPU-process queue and stalls first use until the vendor compiler returns).

```ts
const pipelines = new Map<string, GPURenderPipeline>();
async function buildAll(device: GPUDevice, layout: GPUPipelineLayout) {
  const tasks: Promise<unknown>[] = [];
  for (const v of ['solid', 'instanced', 'edge'] as const)
    for (const b of ['opaque', 'premul', 'add'] as const)
      for (const d of ['normal', 'reverseZ', 'noDepth'] as const)
        tasks.push(device.createRenderPipelineAsync(buildDesc(v, b, d, layout))
          .then(p => pipelines.set(`${v}|${b}|${d}`, p)));
  await Promise.all(tasks);                 // parallel compile across variants
}
```

If the matrix explodes (64 light combos × 12 materials = 768), don't pre-build all of them. Use **override constants** (below) to fold variants into one source, or compile lazily and `Promise.race(specific, fallback)` so a fallback pipeline draws until the specialized one is ready.

## Vertex buffers vs vertex pulling

Two paths to feed vertex data. The choice defines how data travels through caches.

### Classic vertex buffer layout

```ts
vertex: { module, entryPoint: 'vs', buffers: [
  { arrayStride: 32, stepMode: 'vertex',                  // per-vertex stream
    attributes: [
      { format: 'float32x3', offset: 0,  shaderLocation: 0 },  // position
      { format: 'float32x3', offset: 12, shaderLocation: 1 },  // normal
      { format: 'unorm8x4',  offset: 24, shaderLocation: 2 },  // packed color (4 B)
      // 4 B tail pad to reach stride 32
    ]},
  { arrayStride: 64, stepMode: 'instance',                // per-instance stream
    attributes: Array.from({length: 4}, (_, i) =>
      ({ format: 'float32x4', offset: i*16, shaderLocation: 3+i })),  // mat4 rows
  },
]},
```

WGSL inputs: `@location(0..6)` named in a struct; `mat4x4<f32>(m0, m1, m2, m3)` reassembles the matrix.

**Limits:** `maxVertexBuffers = 8`, `maxVertexAttributes = 16`, `maxVertexBufferArrayStride = 2048`, `maxBindGroupsPlusVertexBuffers = 24`. Stride must be a multiple of 4; `float32x4` `offset` needs 16-byte alignment. The driver's fixed-function input-assembler prefetches dense linear reads efficiently.

**Packed colors via `unorm8x4`:** four bytes auto-normalized to `vec4f` in `[0,1]`. 4× memory cut over `float32x4`, no shader cost. Same idea: `unorm10-10-10-2` for normals (Octahedral encoding fits in 32 bits with no quality loss).

**`stepMode: 'instance'`:** the canonical instancing path for moderate per-instance data. Parallel to instanced storage buffers — same idea, different binding.

### Vertex pulling (the modern default)

Skip vertex buffers entirely. Use `@builtin(vertex_index)` + `@builtin(instance_index)` to pull from a `var<storage, read>` buffer:

```wgsl
struct Particle { pos: vec3f, _pad: f32, vel: vec3f, lifetime: f32 };
@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> camera: Camera;

@vertex fn vs(@builtin(vertex_index) vid: u32,
              @builtin(instance_index) iid: u32) -> @builtin(position) vec4f {
  let p = particles[iid];
  let corner = quadCorners(vid);          // 6 vertices per quad
  return camera.viewProj * vec4f(p.pos + corner * particleSize, 1.0);
}
```

Pipeline: no `vertex.buffers`. Draw: `pass.draw(6, particleCount)`. **Zero vertex bindings, zero attribute slots.**

### Pulling wins when

- **Procedural geometry** — point sprites, billboards, particle quads, line ribbons computed from `vertex_index` arithmetic.
- **Cross-pass shared data** — compute writes positions; render reads the same storage buffer. No copies, no separate vertex layout.
- **Compute-driven counts** — a kernel writes both draw args and per-instance data; `drawIndirect` + pulling = zero CPU touchpoint.
- **Irregular SoA layouts** — separate `positionsX`, `positionsY`, `positionsZ` columns (better cache coalescing on Apple/Intel iGPUs); IA can't represent this.

### Vertex buffers win when

- **Sparse attribute access** missing cache — IA prefetches dense streams optimally; pulling forces full struct loads even when you read one field.
- **Hardware-decoded compressed formats** — `unorm8x4`, `snorm16x2`, `unorm10-10-10-2` decode in fixed-function silicon. Pulling means hand-decoding in shader.
- **glTF/USD import paths** where source already exposes attribute offsets/strides.

### For SoleMD particle/graph workloads

**Vertex pulling is the right answer.** Field/orb/edge passes share storage buffers between compute (integration) and render (drawing) — the same buffer is the source of truth. The orb runtime in `apps/web/features/orb/` uses this contract; new render surfaces should match.

## Primitive state

```ts
primitive: {
  topology:         'triangle-list', // 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip'
  stripIndexFormat: 'uint32',        // required for *-strip with indexed draws
  frontFace:        'ccw',           // 'ccw' (default) | 'cw'
  cullMode:         'back',          // 'none' (default) | 'front' | 'back'
  unclippedDepth:   false,           // requires 'depth-clip-control' feature
}
```

**Topology rules.** `triangle-strip` and `line-strip` use a primitive-restart sentinel (`0xFFFF` for `uint16`, `0xFFFFFFFF` for `uint32`); `stripIndexFormat` must match the index buffer. `line-list`, `line-strip`, `point-list` rasterize 1-pixel wide — **WebGPU exposes no polygon-mode wide lines or point size** (Vulkan does, WebGPU does not). Workaround: emit a triangle strip ribbon for thick lines, a quad for point sprites, both via vertex pulling. SoleMD graph edges use this pattern — never `line-list`.

**Front face + cull.** `ccw` + `cullMode: 'back'` matches glTF/USD convention. Mirror a matrix (negative determinant) and CCW becomes CW — subtle bug source. `cullMode` is a no-op on point/line topologies. Non-zero `depthBias`/`depthBiasSlopeScale`/`depthBiasClamp` is a validation error on point/line topologies (Chrome 131+).

**`unclippedDepth`.** With `'depth-clip-control'` feature: fragments outside `[0,1]` clamp instead of discard. Useful for shadow maps where everything past far should saturate to 1.0. Without the feature, geometry past far is hard-clipped before rasterization.

## Depth-stencil deep

```ts
depthStencil: {
  format:                'depth32float',     // 'depth16unorm' | 'depth24plus' | 'depth24plus-stencil8' | 'depth32float' | 'depth32float-stencil8'
  depthWriteEnabled:     true,
  depthCompare:          'less',             // 'never' | 'less' | 'equal' | 'less-equal' | 'greater' | 'not-equal' | 'greater-equal' | 'always'
  stencilFront:          { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
  stencilBack:           { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
  stencilReadMask:       0xFFFFFFFF,
  stencilWriteMask:      0xFFFFFFFF,
  depthBias:             0,
  depthBiasSlopeScale:   0,
  depthBiasClamp:        0,
}
```

### Reverse-Z: why and how

Floats have logarithmic precision. The interval `[0.5, 1.0]` holds the same number of representable values as `[0, 0.5]` — and `[0.999, 1.0]` holds the same again. After the perspective divide, depth buffers store a value of the form `d = a + b/z` (linear in `1/z`), so a large chunk of world-space depth far from the camera maps to a tiny range of `d`.

**Standard depth (near=0, far=1)** puts distant fragments where `d` is near 1 and `1/z`-compression also packs many depths into a tiny range — both at the edge where float precision is poor. Distant geometry z-fights; flickering is the symptom.

**Reverse-Z (near=1, far=0)** flips it. Close fragments sit at `d` near 1.0 (float precision dense), far fragments at `d` near 0 (you don't care). Float distribution and `1/z` compression cancel out — depth precision is roughly uniform in 1/z space across the entire visible range. With `depth32float` you recover ~6 effective bits in the worst regions. **Reverse-Z gains evaporate at 24-bit unorm depth — always pair with `depth32float`.**

**State required:**
```ts
depthStencil:  { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'greater' }
// render pass
depthStencilAttachment: { view, depthClearValue: 0.0, depthLoadOp: 'clear', depthStoreOp: 'store' }
```

The projection matrix must produce reverse-Z output. Either swap near/far in the perspective formula, or multiply a standard projection by `diag(1,1,-1,1)` plus an offset.

**Infinite far plane.** With reverse-Z, far at infinity costs nothing (`1/∞ = 0` matches the clear value). Doom Eternal / id Tech use this to eliminate a tunable knob entirely:

```ts
function reverseZInfFarPerspective(fovY: number, aspect: number, near: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  // Column-major; WebGPU clip space: x,y ∈ [-1,1], z ∈ [0,1]
  return new Float32Array([
    f / aspect, 0, 0,    0,
    0,          f, 0,    0,
    0,          0, 0,   -1,
    0,          0, near, 0,
  ]);
}
```

`clipZ / clipW = near / (-z)`: 1 at `z = -near`, 0 as `z → -∞`. No z-fight, no far-plane tuning.

### Depth bias

Used to push polygons slightly forward/back along the view ray to break ties — most often **shadow map self-shadowing** (acne/peter-panning).

```
final_bias = depthBias * smallestRepresentableValue(format)
           + depthBiasSlopeScale * max(|dz/dx|, |dz/dy|)
final_bias = clamp(final_bias, -depthBiasClamp, depthBiasClamp)
```

`depthBias` is the constant offset measured in ULPs of the depth format (`1.0` = one quantization step). `depthBiasSlopeScale` scales by polygon slope — steep slopes need more bias because their depth gradient across pixels is large. `depthBiasClamp` prevents huge biases on near-grazing polygons.

**Validation:** non-zero bias requires triangle topology. Line/point pipelines must have all three at 0. Most engines use `depthBias = 1, depthBiasSlopeScale = 1.5` for shadow maps as a starting point and tune from there.

### Stencil for masks, portals, outlines

Stencil is an 8-bit per-pixel side channel. Each fragment compares against a reference value (`setStencilReference()`); on pass/fail/depthFail the stencil value can be modified via `'keep' | 'zero' | 'replace' | 'invert' | 'increment-clamp' | 'decrement-clamp' | 'increment-wrap' | 'decrement-wrap'`. `stencilFront` and `stencilBack` configure independently.

Outline pattern: pass 1 writes stencil where the silhouette is (`compare: 'always', passOp: 'replace'`); pass 2 renders thick silhouette only where stencil ≠ 1 (`compare: 'not-equal'`, `depthCompare: 'always'`). Both passes share `setStencilReference(1)`.

`setStencilReference()` is per-pass dynamic state — **cannot appear in a render bundle**, so bundle-driven portal/outline systems must use a fixed reference value.

### Cascaded shadow maps

Render-pass-per-cascade into a `depth32float` 2d-array texture (one layer per cascade). Each pass: depth-only attachment (no color targets), depth-only pipeline (`fragment` omitted from descriptor entirely). The lighting pass binds the array as `texture_depth_2d_array` with a `'comparison'` sampler — `textureSampleCompare(shadowMap, shadowSampler, uv, layer, refDepth)` is one hardware PCF tap.

## Blend math, derived

Blend equations are per-color-target. Each target has independent `color` and `alpha` `BlendComponent`s, each with `srcFactor`, `dstFactor`, and `operation`:

```
final = (srcFactor × srcColor) ⊕ (dstFactor × dstColor)     where ⊕ is the operation
```

Operations: `add` (the canonical case), `subtract` (src - dst), `reverse-subtract` (dst - src), `min`, `max`.

| Mode | srcFactor | dstFactor | operation | Shader output |
|---|---|---|---|---|
| Opaque | `'one'` | `'zero'` | `'add'` | `vec4f(rgb, 1.0)` (or omit blend) |
| Straight alpha | `'src-alpha'` | `'one-minus-src-alpha'` | `'add'` | `vec4f(rgb, alpha)` |
| Premultiplied alpha | `'one'` | `'one-minus-src-alpha'` | `'add'` | `vec4f(rgb * alpha, alpha)` |
| Additive (glow) | `'one'` | `'one'` | `'add'` | `vec4f(rgb * intensity, ...)` |
| Subtractive | `'one'` | `'one'` | `'reverse-subtract'` | `vec4f(rgb, ...)` |
| Multiplicative | `'dst'` | `'zero'` | `'add'` | `vec4f(rgb, ...)` |
| Soft additive | `'one-minus-dst'` | `'one'` | `'add'` | `vec4f(rgb, ...)` |
| Min (depth-of-field min depth) | `'one'` | `'one'` | `'min'` | depth |

### Premultiplied vs straight alpha

The single most common visual bug in WebGPU compositing. **Mix the two and you get white halos around alpha edges** (or black halos on dark backgrounds). The rule:

- If your shader outputs **straight alpha** (`vec4f(rgb, alpha)` where rgb is the unmultiplied surface color), use **`src-alpha`** as srcFactor. The hardware does the multiply.
- If your shader outputs **premultiplied alpha** (`vec4f(rgb * alpha, alpha)`), use **`one`** as srcFactor. The shader did the multiply already.
- For canvas compositing on top of HTML, Chrome's compositor expects premultiplied. Render to a `bgra8unorm` canvas with premultiplied output, configure with `alphaMode: 'premultiplied'`.
- For SoleMD's orb/glow surfaces over the dark UI: premultiplied additive (`srcFactor: 'one', dstFactor: 'one', operation: 'add'`) — additive blending is order-independent and lightweight; premultiplied because we're already multiplying by alpha for soft falloff.

### Constant blend factor

`'constant'` and `'one-minus-constant'` use a per-pass `setBlendConstant(rgba)` value. Useful for fade-in/fade-out passes: bind one pipeline, animate the constant from 0 to 1 across frames, no shader change. Cannot be set inside render bundles — pass-level dynamic state only.

### Dual-source blending (`dual-source-blending` feature)

Allows the shader to output two colors at `@location(0)` (`@blend_src(0)` and `@blend_src(1)`). The blend factor `'src1'` and friends sample the second output. Used for advanced subpixel font rendering (Cleartype-style) and certain decal blending. Feature gate; not always available.

### `colorWriteMask` / `writeMask`

Per-target bitmask: `GPUColorWrite.RED | GREEN | BLUE | ALPHA` (the hex values are 1, 2, 4, 8; `ALL = 0xF`). Set to `0` for a depth-only or stencil-only pass that needs the color attachment for sample positions but should not emit color (rare; usually omit the color attachment entirely). Set to `RED | GREEN | BLUE` to write color but preserve a hand-tuned alpha (selection mask in the alpha channel).

## Multi-render-target

Up to 8 color attachments per pass on core (`maxColorAttachments = 8`); 4 in compatibility. Each attachment has its own format and blend state; the fragment shader returns a struct:

```wgsl
struct GBuffer {
  @location(0) albedo:    vec4f,   // rgba8unorm-srgb
  @location(1) normal:    vec4f,   // rgba16float (or rg16float octahedral pack)
  @location(2) material:  vec4f,   // rgba8unorm: metalness/roughness/AO/material-id
  @location(3) emissive:  vec4f,   // rgba16float (HDR)
};
@fragment fn fs_gbuffer(...) -> GBuffer { ... }
```

Pipeline `fragment.targets[i].format` must match each render-pass `colorAttachments[i]` format exactly. Each target carries its own `blend` and `writeMask`.

**`maxColorAttachmentBytesPerSample`** defaults to **32 bytes** (sum across attachments at one sample). Four `rgba16float` = 32 B fits; add an `r32float` and you hit 36 B → validation error on minimum-spec hardware. Query `device.limits.maxColorAttachmentBytesPerSample` and fall back to a smaller G-buffer (octahedral normals, RGB10A2 albedo) on tight devices.

**On tile-based GPUs** (Apple Silicon, Mali, Adreno, Imagination) all MRT attachments live in tile memory during the pass. Bandwidth cost is on-die, not main memory. G-buffer + lighting consecutive passes can be merged into one tile pass by the driver if attachments stay compatible (no `copyBufferToBuffer`/`copyTextureToTexture` between, no compute pass interruption). Write merge-friendly code; the driver elides the tile flush.

## Render bundles

Bundles are recorded draw-call sequences you replay across many frames.

```ts
const enc = device.createRenderBundleEncoder({
  colorFormats: [presentationFormat],
  depthStencilFormat: 'depth32float',
  sampleCount: 4,                            // must match the pass it executes in
});
enc.setPipeline(pipeline);
enc.setBindGroup(0, frameBG); enc.setBindGroup(1, materialBG);
enc.setVertexBuffer(0, vbo);  enc.setIndexBuffer(ibo, 'uint32');
enc.drawIndexed(indexCount, instanceCount);
const bundle = enc.finish();

// Each frame:
pass.executeBundles([bundle1, bundle2, bundle3]);
```

**What bundles cannot do:** `setViewport`, `setScissorRect`, `setBlendConstant`, `setStencilReference`, `beginOcclusionQuery`/`endOcclusionQuery` — all pass-level dynamic state. No nested `executeBundles`.

**State isolation:** state resets **before and after** each bundle. Bundles cannot inherit each other's bindings — every bundle is fully self-contained. The implementation can deeply optimize a fully-specified bundle in exchange for redundant commands relative to inline encoding.

**Resources still mutate.** Bundles record *handles*, not data. Per-frame `writeBuffer` into a uniform the bundle binds works — the next `executeBundles` sees the new data. **This is the whole game**: record the heavy command sequence once, swap buffer contents each frame.

**When bundles win:** CPU-bound scenes with many small draws (UI, sprite atlases, large mesh inventories). Per-call JS → C++ → GPU-process validation overhead dominates; bundles amortize across N replays. Toji measures 2-5× CPU encode-time reduction at 1000 draws.

**When bundles hurt:** single-draw scenes (overhead negligible already), highly dynamic scenes that rebuild bundles each frame (break-even or worse), GPU-bound work (bundles only help CPU encoding).

**Stack with indirect draw.** Record `drawIndirect(buf, off)` in the bundle; a compute kernel writes `buf` each frame to change counts. Bundle records the binding; indirect lets the count be GPU-driven. Foundation of GPU-driven rendering in WebGPU.

## Indirect draw

Draw arguments live in a GPU buffer. The CPU never knows the count.

```ts
const indirectBuf = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// Compute kernel writes the args:
@group(0) @binding(0) var<storage, read>       visibleCount: atomic<u32>;
@group(0) @binding(1) var<storage, read_write> args: array<u32, 4>;
@compute @workgroup_size(1) fn writeArgs() {
  args[0] = atomicLoad(&visibleCount);   // vertexCount
  args[1] = 1u; args[2] = 0u; args[3] = 0u;
}

pass.drawIndirect(indirectBuf, 0);
```

### Argument layouts (exact byte order — getting these wrong reads garbage with no validation)

| Method | Stride | Fields |
|---|---|---|
| `drawIndirect` | **16 B** | `vertexCount, instanceCount, firstVertex, firstInstance` (all `u32`) |
| `drawIndexedIndirect` | **20 B** | `indexCount, instanceCount, firstIndex, baseVertex (i32), firstInstance` |
| `dispatchWorkgroupsIndirect` | **12 B** | `workgroupCountX, workgroupCountY, workgroupCountZ` |

`firstInstance ≠ 0` requires the `'indirect-first-instance'` feature. Without it, default to `firstInstance = 0` and use `instance_index` + an offset uniform.

### Multi-draw indirect (Chromium experimental)

`'chromium-experimental-multi-draw-indirect'`, requires `chrome://flags/#enable-unsafe-webgpu`:

```ts
pass.multiDrawIndirect(buf, /*offset*/ 0, /*maxDrawCount*/ 256, drawCountBuf, 0);
pass.multiDrawIndexedIndirect(buf, 0, 1024, drawCountBuf, 0);
```

One call replaces N `drawIndirect`s. Stride stays 16/20 per entry. `drawCountBuf` is an optional GPU buffer holding the actual `u32` count; omit it and `maxDrawCount` is used. **Don't ship-gate on this** — experimental, no committed stable timeline. Production fallback: pre-allocate indirect slots, write `vertexCount = 0` for unused entries (cost: one IA prefetch each).

### Why indirect matters

Frustum-cull on GPU: compute pass tags visible instances into a compacted buffer + writes the count via atomics; one `drawIndirect` consumes it. **Zero CPU readback.** The traditional "GPU computes, CPU reads back, CPU issues N draws" loop has 1-2 frame latency from `mapAsync`; GPU-driven indirect has zero — same frame's compute drives the same frame's draw.

SoleMD's 1M-particle orb does exactly this: compute tags visible particles, atomics write a compacted index list + count, `drawIndirect` draws the visible subset only. The CPU never knows how many particles are visible.

## Render pass mechanics

```ts
const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: msaaView,
    resolveTarget: ctx.getCurrentTexture().createView(),
    clearValue: { r: 0, g: 0, b: 0, a: 1 },
    loadOp: 'clear',                       // 'clear' | 'load'
    storeOp: 'discard',                    // 'store' | 'discard'
  }],
  depthStencilAttachment: {
    view: depthView,
    depthClearValue: 0.0,                  // reverse-Z: 0; standard: 1
    depthLoadOp: 'clear', depthStoreOp: 'discard',
    stencilClearValue: 0,
    stencilLoadOp: 'clear', stencilStoreOp: 'discard',
  },
  occlusionQuerySet,
  timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
});
```

### `loadOp` / `storeOp` are not cosmetic

On **tile-based GPUs** (every Apple GPU, Mali, Adreno, Imagination — all mobile + Apple Silicon):

- `loadOp: 'load'` forces driver to read previous attachment contents from main memory into tile-local memory before pass starts. **Full-resolution bandwidth hit.**
- `loadOp: 'clear'` initializes tile-local memory to the clear value. **Free.**
- `storeOp: 'store'` writes tile-local back to main memory at end-of-pass. Required if any later pass reads the contents.
- `storeOp: 'discard'` skips that write. **Saves same bandwidth.** Apply to MSAA color (only the resolve persists), depth after last depth read, stencil after last stencil read.

A single-pass MSAA forward render with reverse-Z (`loadOp: 'clear'` + `storeOp: 'discard'` on MSAA color and depth, `loadOp: 'clear'` + `storeOp: 'store'` only on the resolve target) does **zero main-memory attachment reads at start, one resolved-color write at end**. Best-case for bandwidth.

### Pass merging the driver does for you

Two consecutive render passes are merge-eligible if (a) attachment formats and sample counts match, (b) the first pass stores what the second pass loads (or both keep tile memory), (c) no intervening compute pass, `copyBufferToBuffer`, or `copyTextureToTexture`. Dawn and wgpu auto-detect and elide tile flushes. **Don't fight it** — batch any mid-frame copies outside the render-pass cluster. A copy between G-buffer and lighting pass forces a tile flush even if the buffer is unrelated.

### Pass-level dynamic state

```ts
pass.setViewport(x, y, w, h, minDepth, maxDepth);   // minDepth/maxDepth in [0,1]
pass.setScissorRect(x, y, w, h);
pass.setBlendConstant({ r, g, b, a });               // for 'constant' blend factor
pass.setStencilReference(refValue);                  // for stencil compare
```

Defaults: full-attachment viewport, full-attachment scissor, blend constant `(0,0,0,0)`, stencil reference `0`. Switching pipelines does not reset these — they persist until explicitly changed or the pass ends. **None of these can appear inside a render bundle** — bundles inherit the pass's current values.

## Pipeline override constants and specialization

WGSL `override` declarations specialize at pipeline creation time — one shader source becomes many compiled variants without runtime branching.

```wgsl
override BLOCK_SIZE: u32 = 64;
@id(100) override SHADOW_QUALITY: u32 = 2;
@id(101) override ENABLE_BLOOM: bool = true;
@id(102) override LIGHT_COUNT: u32 = 4;

@compute @workgroup_size(BLOCK_SIZE) fn integrate() { ... }

@fragment fn fs(...) -> @location(0) vec4f {
  if (ENABLE_BLOOM) { /* dead-code-eliminated when override = false */ }
  for (var i = 0u; i < LIGHT_COUNT; i = i + 1u) { /* unrolled at compile time */ }
  ...
}
```

```ts
const high = await device.createRenderPipelineAsync({ ...desc,
  fragment: { ...desc.fragment, constants: { 100: 4, 101: 1, 102: 8 } } });
const low  = await device.createRenderPipelineAsync({ ...desc,
  fragment: { ...desc.fragment, constants: { 100: 0, 101: 0, 102: 1 } } });
```

Constants address by `@id(N)` (numeric) or by name (string). Types: scalars only (`bool`, `i32`, `u32`, `f32`, `f16` with `shader-f16`). No struct/array overrides — use bind groups for those.

**Why this beats runtime branching.** The compiler sees the override as a literal:
- `if (false) { ... }` → branch deleted, zero register pressure.
- `for (var i = 0; i < 4; i++)` → fully unrolled, no counter.
- `@workgroup_size(BLOCK_SIZE)` → register allocation tuned to actual count.

Runtime uniform branching costs warp divergence; override specialization costs zero.

**When to specialize vs uber-shader.** Specialize for static choices: quality presets, light count tiers, feature flags, per-platform workgroup sizes. Uber-shader (runtime uniform branching) for choices that change frame-to-frame without reloading. Practical: `BLOCK_SIZE = 64` desktop / `32` mobile (subgroup match), `LIGHT_COUNT` tiers `{8, 32, 256}` for forward+, `MSAA_TAPS` 4 vs 8 for custom AA resolves.

## A worked example: deferred rendering pass shape

Putting it all together. Given a deferred renderer with reverse-Z and MSAA-on-resolve:

```
[G-buffer pass]
  Inputs:  per-mesh vertex/storage buffers
  Outputs: 4 MRT (albedo, normal, material, depth)
  State:   reverse-Z, depthCompare='greater', depthWrite=on, no blend, cullMode='back'
  Topology: triangle-list
  loadOp:  clear all; storeOp: store (lighting pass needs them)

[SSAO compute pass]
  Inputs:  depth (sampled), normal (sampled)
  Outputs: SSAO texture (storage write)
  State:   compute pipeline (no render state); workgroup size 8x8

[Lighting pass — full-screen triangle]
  Inputs:  G-buffer (albedo/normal/material/depth), SSAO, light list, shadow atlas
  Outputs: HDR color rgba16float
  State:   no depth, no cull (full-screen tri); blend off (single output)
  Topology: triangle-list, draw(3, 1) (single tri covering screen via vertex pulling)
  loadOp:  don't-care for HDR target ('clear' to 0,0,0,0); storeOp: store

[Volumetrics pass — additive over HDR]
  Inputs:  depth (sampled, tile-mem), HDR color (load-store), volumetric grid
  Outputs: HDR color (additive blend in-place)
  State:   blend = additive (srcFactor=one, dstFactor=one), depthCompare='greater-equal', depthWriteEnabled=false
  loadOp:  load HDR; storeOp: store

[Tone-map pass — to canvas]
  Inputs:  HDR color, exposure uniform
  Outputs: bgra8unorm canvas
  State:   no depth, no blend, MSAA off (already low-frequency post)
  Topology: triangle-list, draw(3, 1) full-screen
  loadOp:  clear (canvas); storeOp: store
```

Pipeline count: 2 (G-buffer, no fragment for shadow cascades) + 1 (SSAO compute) + 1 (lighting) + 1 (volumetrics) + 1 (tone-map). Pre-warmed at boot via `Promise.all`. Indirect draw on the G-buffer pass to consume a frustum-culled instance list. Bundles wrap the lighting + volumetrics + tone-map passes since they're the same every frame (only the bound resources change).

This is the pattern: **enumerate pipelines, build at boot, pass-merge friendly attachment design, use indirect for dynamic counts, bundles for static command sequences.**

## Cross-references

- `api-fundamentals.md` — encoder/queue lifecycle, lost-device handling.
- `buffers-textures-bindings.md` — bind group layouts, texture formats, MRT bytes-per-sample limit, MSAA texture creation.
- `wgsl.md` — shader-side language, `override` declarations, `@blend_src` for dual-source, attribute interpolation modes.
- `compute-fundamentals.md` — compute pipelines (parallel structure), indirect dispatch.
- `recipes-compute.md` — GPU-driven culling source code (HiZ + cluster culling end-to-end).
- `performance-and-profiling.md` — pipeline cache strategy, pass merging on tile-based GPUs, timestamp queries on render passes.
- `browser-platform-reality.md` — feature detection for `dual-source-blending`, `depth-clip-control`, `float32-blendable`, multi-draw experimental.
