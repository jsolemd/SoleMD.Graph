---
name: WebGPU API fundamentals
description: Mental model for adapter / device / queue / command-encoder lifecycle, error scopes, lost-device recovery, debug labels, async pipeline compilation. Heavy on mechanism + reasoning.
---

# WebGPU API fundamentals

WebGPU's surface is small. Its difficulty comes from a handful of objects whose **lifetimes do not coincide** and whose semantics are **defined on three timelines**: content (JS), device (validation), queue (execution). Most bugs in WebGPU code come from confusing those timelines — believing a write "happened" when JS returned, holding a texture across a tick, or expecting a synchronous error where the spec is asynchronous. The rest of this file is organized around those mental models, not around an alphabetized API tour.

> **Cross-references.** Bind groups and pipeline layouts get their own deep dive in [`bindings.md`](./bindings.md). Buffer "why" + upload paths in [`buffer-resources.md`](./buffer-resources.md); texture "why" + format mental model in [`texture-resources.md`](./texture-resources.md); the validation legality cheat-sheet in [`buffers-textures-bindings.md`](./buffers-textures-bindings.md). WGSL shader-side rules in [`wgsl.md`](./wgsl.md). Browser/feature/limit detection in [`browser-platform-reality.md`](./browser-platform-reality.md). Compute pipeline mental model in [`compute-fundamentals.md`](./compute-fundamentals.md); GPGPU recipes (scan/sort/hash/LBVH) in [`gpgpu-recipes.md`](./gpgpu-recipes.md). Pipeline cache, render bundles, indirect draws in [`performance-and-profiling.md`](./performance-and-profiling.md).

## 1. Adapter and device: the mental model

When you call `navigator.gpu.requestAdapter()` you are asking the *browser* — not the GPU — for a **handle to a candidate WebGPU implementation** on the system. What that handle wraps depends on the OS:

- **macOS / iOS / iPadOS**: Metal `MTLDevice` — a logical device backed by the same physical GPU as every other process on the system. Apple's driver multiplexes work across processes; there's no isolation guarantee at the GPU. The adapter exists for symmetry.
- **Windows**: D3D12 `ID3D12Device`, often hosted in Chrome's GPU process so that a driver crash takes the GPU process — not the tab. Drivers can put each origin on its own command list slice; preemption is OS-level.
- **Linux / Android**: Vulkan `VkInstance` plus a chosen `VkPhysicalDevice`. Each `requestDevice()` later builds a `VkDevice` from a queue family. The adapter is the physical handle; the device is the logical one.

The adapter is **introspectable but not yet usable**. You can read `adapter.features`, `adapter.limits`, `adapter.info`. You cannot create buffers, textures, or pipelines until you upgrade the adapter to a `GPUDevice`.

### Why the split exists

Two reasons. First, **fingerprinting protection**. Adapter properties are tiered: the browser truncates `limits.maxBufferSize`, redacts vendor-specific `info.device` strings on most browsers, and may withhold `info.driver` entirely. The adapter exists as a privacy gate so the page can ask "do you support feature X?" without learning enough to fingerprint the user.

Second, **process isolation**. The adapter knows nothing about your data; the device owns your buffers, textures, pipelines, and the (single) queue. A device-lost event tears down only that device, not the adapter — but the adapter, having been *consumed* by `requestDevice()`, still cannot be reused. The state machine is:

```
adapter: "valid" --requestDevice()--> "consumed"
                                       ↓
                                       "expired"  (any time, browser policy)
```

**An adapter is single-use.** Calling `requestDevice()` twice on the same adapter returns an *already-lost* device on the second call. If you need a second device — or if you need to recover from device loss — you must request a fresh adapter.

> **Practical corollary.** Never cache adapters across user actions. Re-request inside `init()`. The two-line cost (`navigator.gpu.requestAdapter` is fast — driver state already loaded) buys you a clean state machine for retry logic.

### When does the adapter expire?

The spec says "any time". Concrete triggers: tab backgrounded (power saver parks the discrete GPU), eGPU unplugged, mid-session driver update (Windows pushes without prompting), GPU hand-off between integrated and discrete on hybrid systems, tab evicted and resumed after the GPU process was torn down. `device.lost` resolves with `reason: "unknown"` in all of these — never blame your code first.

### `powerPreference` is a hint to the OS, not a knob. By platform: **macOS dual-GPU laptops** — selects integrated vs discrete (default chooses based on power state; `'high-performance'` pins discrete regardless and keeps it awake as long as the tab holds an adapter, *even if the canvas is offscreen* — the laptop-battery footgun); **Apple Silicon, discrete-only Windows/Linux, Android** — ignored; **Windows hybrid** — DirectX `AdapterPreference` is set, OS may or may not route based on power profile.

Takeaway: **request `'high-performance'` only when you need it**, and destroy the device when the canvas is offscreen for >N seconds. `IntersectionObserver` + `device.destroy()` + re-`requestAdapter()` is the cleanest pattern to release the discrete GPU on idle.

`forceFallbackAdapter: true` returns a software-rasterized adapter (SwiftShader through Dawn). Useful for headless tests, useless for real workloads — refuse heavy compute if `adapter.info.isFallbackAdapter` is true. The flag moved off `GPUAdapter` in Chrome 140; read it from `adapter.info`.

### `featureLevel: 'compatibility'`

A second tier that maps onto OpenGL ES 3.1 / D3D11 capability — the surface that Android-Vulkan-pre-1.1 and old Intel Windows actually have. Trades core capabilities (cubemap arrays, multiple color attachments, 256 invocations per workgroup) for ~15% more user reach. See [`browser-platform-reality.md`](./browser-platform-reality.md) for the full surface delta. The pattern is: request `'compatibility'`, then conditionally re-enable core features:

```ts
const adapter = await navigator.gpu.requestAdapter({ featureLevel: 'compatibility' });
const required: GPUFeatureName[] = [];
if (adapter.features.has('core-features-and-limits')) required.push('core-features-and-limits');
const device = await adapter.requestDevice({ requiredFeatures: required });
```

## 2. Feature negotiation as a contract

Every entry in `requiredFeatures` is a **hard fail point**: if the adapter doesn't support it, `requestDevice()` rejects. There is **no graceful fallback** — the spec deliberately refuses to give you a device "with most of what you asked for". This is so that shipped code never enters a state where it thinks a feature is on but isn't.

The right pattern is two-pass:

```ts
async function probeFeatures(adapter: GPUAdapter): Promise<GPUFeatureName[]> {
  const wanted: GPUFeatureName[] = ['timestamp-query', 'shader-f16', 'subgroups', 'float32-filterable'];
  return wanted.filter(f => adapter.features.has(f));
}

const device = await adapter.requestDevice({
  requiredFeatures: await probeFeatures(adapter),
  requiredLimits:   await probeLimits(adapter),
  defaultQueue:     { label: 'main-queue' },
});
```

The probe pattern composes a feature set known to be supportable; `requestDevice` then succeeds. The runtime branches on `device.features.has('shader-f16')` rather than re-asking the adapter (the adapter is consumed).

### Why some features come paired

Vendor sanity. `subgroups-f16` (now deprecated) bundled `shader-f16` and `subgroups` together because no driver shipped subgroup f16 ops without f16 scalars. Today the canonical shape is **explicitly request both** — `['shader-f16', 'subgroups']` — and check `device.features.has('subgroups-f16')` separately for the f16 subgroup ops feature where it exists. The dependency graph among WGSL extensions is detailed in [`wgsl.md`](./wgsl.md).

### Adapter info granularity (the privacy budget)

`adapter.info` exposes:

```js
{
  vendor: 'apple' | 'nvidia' | 'amd' | 'intel' | 'arm' | 'microsoft' | 'google' | '',
  architecture: 'metal-3' | 'turing' | 'rdna2' | 'mali-g78' | '...' | '',
  device: '',     // usually empty by default
  description: '',// usually empty by default
  isFallbackAdapter: false,
}
```

Browsers ship with **`device` and `description` empty by default**; those are the high-entropy fields. Behind a permission policy or an origin trial they may surface. Don't rely on them for runtime branching; pick on `vendor` + `architecture` and feature-test the rest. This is deliberate: the W3C calls it the privacy budget.

## 3. Limits as physical constraints, not policy

`adapter.limits` tells you what the *adapter* can offer. `device.limits` tells you what the *device* will enforce. They are **not the same** unless you copy.

Every limit defaults to a conservative tier — typically the WebGPU minimum. If you don't pass `requiredLimits`, you get the floor. Concrete defaults that bite:

| Limit | Default | Modern desktop reality |
|---|---|---|
| `maxBufferSize` | 256 MiB | 4–16 GiB |
| `maxStorageBufferBindingSize` | 128 MiB | 2 GiB+ |
| `maxComputeInvocationsPerWorkgroup` | 256 | 1024 |
| `maxComputeWorkgroupSizeX` | 256 | 1024 |
| `maxStorageBuffersPerShaderStage` | 8 | 16+ |
| `maxColorAttachmentBytesPerSample` | 32 | 64 |

The default is the contract; the adapter's value is the *available* contract. To use what hardware actually offers, copy:

```ts
function probeLimits(adapter: GPUAdapter): Record<string, number> {
  const want = [
    'maxBufferSize',
    'maxStorageBufferBindingSize',
    'maxStorageBuffersPerShaderStage',
    'maxComputeInvocationsPerWorkgroup',
    'maxColorAttachmentBytesPerSample',
  ] as const;
  return Object.fromEntries(want.map(k => [k, adapter.limits[k]])) as any;
}
```

Why is this necessary? Two reasons.

**Mobile is genuinely different.** Tile-based deferred renderers (every Apple GPU since the A8, every Mali, every Adreno) keep a small on-chip tile buffer — typically 256 KiB to 1 MiB. `maxColorAttachmentBytesPerSample` reflects how many bytes of attachment fit in tile. Five `rgba16float` attachments at 8 B each = 40 B/sample × 4 MSAA = 160 B/sample × 32×32 tile = 160 KB — already over the budget. Mobile drivers refuse the pipeline rather than fall back to a slow path.

**`maxStorageBufferBindingSize` is a virtual-memory cap, not a guaranteed-mappable region.** A 2 GiB binding succeeds creation but might allocate-on-write. Out-of-memory hits at first write, not at creation. Treat large storage allocations as *probably* succeeding; design fallback to smaller chunks if they OOM.

You **should** copy adapter limits into requested limits because the alternative — silently accepting the floor — gives you less than the user's hardware offers. Just don't request more than your worst-case workload needs; some implementations pessimistically size descriptor heaps to satisfy raised caps.

## 4. The queue is a singleton submission point

`device.queue` is a `GPUQueue`. You cannot create a second queue. Every command submission, CPU→GPU buffer write, texture upload, and external-image copy goes through this one object. `submit()` returns *synchronously* once the command buffer is queued; the actual GPU work is in flight indefinitely after.

The spec's only ordering guarantees: `submit()` calls execute in issue order on the same queue; `onSubmittedWorkDone()` resolves in call order after all earlier submits drain; if you call `mapAsync()` before `onSubmittedWorkDone()` on the same buffer, the map promise settles first. Beyond these, do not assume ordering between unrelated promises.

There is **no GPU→GPU sync primitive** within a queue — passes inside one command buffer implicitly synchronize. To synchronize across submits, use `onSubmittedWorkDone()`. Don't pair it with `mapAsync()` on the same buffer; `mapAsync()` already waits for the relevant submit to drain.

## 5. Command encoding as a DAG submission, not a state machine

A `GPUCommandEncoder` records commands sequentially. Inside, render and compute passes are scoped: you `beginRenderPass()`, set state, draw, `end()`, and the pass-scope state is discarded. Passes do **not** nest. They cannot share state. The lifecycle is:

```
encoder = device.createCommandEncoder({ label })
   |
   |--encoder.beginRenderPass(desc) --> pass
   |     pass.setPipeline / setBindGroup / setVertexBuffer
   |     pass.draw(...)
   |     pass.end()                                   // pass consumed
   |
   |--encoder.beginComputePass(desc) --> pass
   |     pass.setPipeline / setBindGroup
   |     pass.dispatchWorkgroups(...)
   |     pass.end()
   |
   |--encoder.copyBufferToBuffer(...)                 // outside any pass
   |--encoder.copyBufferToTexture(...)
   |
   |--encoder.finish() --> commandBuffer              // encoder consumed
device.queue.submit([commandBuffer])                  // commandBuffer consumed
```

Three "consumed" transitions: pass at `end()`, encoder at `finish()`, command buffer at `submit()`. There is no reset-and-reuse. Allocation is cheap; recreate every frame.

**Order within an encoder matters for some ops, doesn't for others.** Resource transitions (writes after reads, layout changes) are inserted by the implementation between commands; the order you record is the order they execute logically. But the GPU is free to reorder independent compute dispatches *within* a pass if they don't share resources, and free to reorder draws within a render pass when blending order doesn't matter.

**Validation happens at `finish()`**, not at each command. A bad descriptor for `setPipeline` doesn't throw — it sets a bad state, and the next command that reads it fails validation, which surfaces at `finish()` time as a single error. This is why the per-call error scope pattern is so noisy and the per-submit pattern (below) is the right amortization.

### What goes inside a pass vs outside

```
                   inside pass    outside pass    one-shot encoder method
setPipeline           yes              no                  no
setBindGroup          yes              no                  no
setVertexBuffer       yes (render)     no                  no
draw / dispatch       yes              no                  no
copyBufferToBuffer    no               no                  encoder.copyBufferToBuffer()
copyBufferToTexture   no               no                  encoder.copyBufferToTexture()
copyTextureToTexture  no               no                  encoder.copyTextureToTexture()
clearBuffer           no               no                  encoder.clearBuffer()
resolveQuerySet       no               no                  encoder.resolveQuerySet()
pushDebugGroup        yes (in pass)    yes (on encoder)    both
```

Copy operations live on the encoder, not inside passes. This is intentional — they are simple memory ops and the implementation runs them on the copy queue (DMA) where the hardware exposes one.

## 6. Render pass attachment ops are a bandwidth contract

The descriptor for `beginRenderPass` carries `loadOp` and `storeOp` per attachment. These look cosmetic; they are bandwidth contracts.

```ts
{
  view: msaaView,
  resolveTarget: context.getCurrentTexture().createView(),
  clearValue: { r: 0, g: 0, b: 0, a: 1 },
  loadOp: 'clear' | 'load',
  storeOp: 'store' | 'discard',
}
```

On **tile-based deferred renderers** (every Apple GPU since the A8, every Mali, every Adreno), the GPU breaks the framebuffer into 16×16 or 32×32 tiles, brings each tile into a tiny SRAM, runs every fragment that lands on it, and writes the result back to main memory at the end. The tile starts each pass from one of two states:

- **`loadOp: 'clear'`** — tile starts zero/clear-value. **No memory read.** This is free.
- **`loadOp: 'load'`** — the previous attachment contents are *loaded into the tile*. Full bandwidth round-trip per pixel. On a 4K display this is ~30 MiB read at the start of every pass. Mobile bandwidth is precious; this can dominate frame cost.

Symmetrically:

- **`storeOp: 'store'`** — tile contents written back at end. Full bandwidth.
- **`storeOp: 'discard'`** — tile contents thrown away. **No memory write.** Free.

Use `'discard'` on transient targets:

- The depth attachment after the last pass that reads it.
- The MSAA color attachment when you only care about the resolved 1-sample image (the resolve fires before the discard).
- Velocity buffers, jitter buffers, anything you regenerate next frame.

On **immediate-mode renderers** (NVIDIA, AMD, Intel desktop) the cost is smaller but nonzero — the driver still issues a read or skip-read at pass entry. Use the same discipline; mobile users are not less important.

## 7. Canvas configuration and `getCurrentTexture` lifetime

```ts
const context = canvas.getContext('webgpu')!;
const format = navigator.gpu.getPreferredCanvasFormat();   // 'bgra8unorm' or 'rgba8unorm'

context.configure({
  device,
  format,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
  alphaMode: 'opaque',                  // 'opaque' | 'premultiplied'
  colorSpace: 'srgb',                   // 'srgb' | 'display-p3' | 'rec2100-hlg'
  toneMapping: { mode: 'standard' },    // Chrome 137+: 'standard' | 'extended'
  viewFormats: [`${format}-srgb`],
});
```

`getPreferredCanvasFormat()` returns the format the compositor prefers — `bgra8unorm` on Windows/macOS, `rgba8unorm` on most mobile. Mismatch incurs a swap-chain copy on present.

**`getCurrentTexture()` is valid only until the current task completes.** Concretely: until the next rAF tick, until the canvas is resized or reconfigured, or until device-lost. Two rules:

1. **Call `getCurrentTexture()` inside the rAF callback, immediately before encoding.** Never cache.
2. **If the canvas resizes between getting the texture and submitting, the submit will validation-error.** Either re-`configure()` and re-`getCurrentTexture()` after resize, or run the resize handler before the rAF tick.

`alphaMode: 'opaque'` lets the compositor skip the alpha-blend step when laying the canvas over the page. For full-screen graph viewers always `'opaque'`.

### HDR canvas

Wide-gamut SDR uses `colorSpace: 'display-p3'`. True HDR uses `colorSpace: 'rec2100-hlg'` paired with `toneMapping: { mode: 'extended' }` (Chrome 137+, hardware HDR display required). For SoleMD orb / particle work targeting HDR displays, render emissive points to an `rgba16float` MRT, AgX-tone-map in a postprocess pass, and emit into the HDR canvas. Always feature-detect — older browsers ignore unknown configure fields, but if you want to branch the renderer, try/catch the configure or read `'colorSpace' in (CanvasRenderingContext2D.prototype as any)` and assume modernity from there.

## 8. Error scopes as targeted try/catch around *async* GPU work

Synchronous misuse (calling `requestDevice` outside HTTPS, passing the wrong type) throws `TypeError` immediately. Anything that violates the WebGPU contract on the device timeline does **not** throw — it produces a `GPUError` of one of three types, surfaced via the error-scope stack.

### The three error filters

| Filter | Class | What it catches | Recovery |
|---|---|---|---|
| `'validation'` | `GPUValidationError` | Spec violations: wrong descriptor, out-of-range bind index, unaligned offset, mismatched format. Most common. | Fix the code. Production should never see one. |
| `'out-of-memory'` | `GPUOutOfMemoryError` | Allocation refused. Returned object exists, is **invalid**, is contagious. | Reduce resource size; degrade quality; LOD down. |
| `'internal'` | `GPUInternalError` | Implementation-defined: shader register-spilled too much, driver hit a limit not exposed. | Treat as imminent device loss. Tear down. |

`pushErrorScope(filter)` pushes a frame onto the device's error-scope stack. Subsequent operations of that error class are **captured by the topmost matching scope** instead of firing `uncapturederror`. `popErrorScope()` returns a `Promise<GPUError | null>` — null if no error of that filter occurred while the scope was top of stack.

### Critical contract: scopes wrap synchronous code

The spec says a scope **starts** when you push and **ends** when you pop. Errors generated *between* those two calls — by anything that runs synchronously in JS — are captured. Errors generated by the device timeline catching up *later* are still captured if they trace back to a call inside the scope, because the device-timeline tasks are tagged with their content-timeline scope at issue time.

But you cannot `await` inside a scope. Awaiting yields to the event loop; the scope is still on the stack but the calls during the suspended turn run with the scope as top-of-stack — usually not what you want. The canonical pattern is:

```ts
device.pushErrorScope('validation');
const pipeline = device.createRenderPipeline(desc);    // synchronous misuse caught here
const err = await device.popErrorScope();              // await OUTSIDE the scope
if (err) throw new Error(`pipeline build: ${err.message}`);
```

When you must wrap async — like `createRenderPipelineAsync` — push, call sync method that returns a Promise, pop, then await both:

```ts
device.pushErrorScope('validation');
const pipelinePromise = device.createRenderPipelineAsync(desc);
const errPromise = device.popErrorScope();
const [pipeline, err] = await Promise.all([pipelinePromise, errPromise]);
if (err) throw err;
```

### Why parsing error message strings is forbidden

`error.message` is implementation-defined. Chrome's wording differs from Firefox's, both will change between versions. Branching on substrings means your code breaks silently when a browser updates. Treat the message as observability text — log it, ship it to telemetry, never `if (err.message.includes(...))`.

### Per-submit error scope amortization

For per-frame draw loops, wrapping each pipeline call in its own scope is fine at boot but generates one Promise per draw at steady state. The right amortization unit is **per `queue.submit()`**: push at submit time, pop one frame later, never await on the render thread.

```ts
let inFlightScope: Promise<GPUError | null> | null = null;

function submitWithScope(label: string, encode: (enc: GPUCommandEncoder) => void) {
  const prev = inFlightScope;
  inFlightScope = null;
  if (prev) {
    prev.then(err => {
      if (err) telemetry('webgpu.scope.error', { label, kind: err.constructor.name, msg: err.message });
    }).catch(() => {});
  }
  device.pushErrorScope('validation');
  const enc = device.createCommandEncoder({ label });
  encode(enc);
  device.queue.submit([enc.finish()]);
  inFlightScope = device.popErrorScope();
}
```

One push per submit, one pop next submit, full coverage of the main render path with one Promise allocation per frame. Always `label` the scope so telemetry can bucket failures by surface.

### Production: `uncapturederror`

The `uncapturederror` event fires for any error not captured by an active scope. **Wire this listener before the first submit.**

```ts
device.addEventListener('uncapturederror', (e) => {
  console.error('uncaptured WebGPU error', e.error);
  telemetry.report('webgpu_error', {
    kind: e.error.constructor.name,
    msg: e.error.message,
    label: e.error.message.match(/label "([^"]+)"/)?.[1],
  });
});
```

Without a listener, uncaptured errors go to the console — invisible in production builds.

### Contagious invalidity

Spec §22: if creating object A failed, A is **invalid**; any object B that takes A as input becomes invalid; cascade. Operations on invalid objects produce no GPU work and emit no synchronous exception. They will produce a validation error on the device timeline (which `uncapturederror` catches if no scope is active) — but if that scope was popped one frame ago, the cascade can produce a black screen for several frames before the error surfaces. **This is why error scopes are required during initialization** — they make the cascade visible.

## 9. `device.lost` is a real lifecycle event

`device.lost` is a long-lived `Promise<GPUDeviceLostInfo>`. It resolves *exactly once*, when the device transitions to the lost state. After that, the device cannot be used; every operation produces no work; every promise of pending work resolves or rejects per spec.

```ts
device.lost.then((info) => {
  console.warn(`device lost: ${info.reason} — ${info.message}`);
  if (info.reason === 'destroyed') return;          // intentional, don't recover
  teardownGraphRuntime();
  setTimeout(init, 500);                            // re-request adapter on retry
});
```

### Reasons

| Reason | Meaning | Recover? |
|---|---|---|
| `'destroyed'` | You called `device.destroy()`. Permanent. | No. |
| `'unknown'` | Driver reset, GPU unplugged, OS power-managed the GPU, browser memory pressure, severe validation cascade, browser tab eviction. | Yes. |

Some browsers expose additional vendor reasons (`'cmd-buffer-too-large'`, etc.); always default-case to `'unknown'` semantics.

### Recovery means **everything is dead**

Buffers, textures, samplers, pipelines, bind groups created on the lost device are gone. Do not retain references — they will produce validation errors against the new device. Recreate every resource. Maintain the data needed to reconstruct (CPU-side mesh sources, shader strings, descriptor templates) outside the device's lifetime, in plain JS state.

### Chrome's anti-loop heuristic

Two device-lost events for the same origin within two minutes → Chrome **blocks WebGPU for that origin** for the rest of the browsing session. This protects users from runaway crash loops, but it's a footgun if your `device.lost` handler is itself buggy. Cap retries:

```ts
let lostCount = 0;
const MAX_LOSSES = 2;

async function init() {
  // ... adapter, device ...
  device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    lostCount += 1;
    if (lostCount >= MAX_LOSSES) {
      reportFatal('webgpu-blocked', info);
      return;
    }
    setTimeout(init, 500 * 2 ** (lostCount - 1));   // exponential backoff
  });
}
```

After `MAX_LOSSES` give up gracefully (canvas placeholder, telemetry ping, no further requests). Better than triggering Chrome's domain block.

## 10. Async pipeline creation is non-negotiable

Pipeline creation runs: WGSL parse → IR → SPIR-V/HLSL/MSL → driver compile → backend link. Total cost on D3D12: 5–500 ms per pipeline; on Metal: 1–50 ms; on Vulkan: 5–100 ms. The synchronous `createRenderPipeline` is implemented over async inside Chromium and **blocks the entire GPU process queue** until it returns — every other tab using the GPU stalls behind your compile.

`createRenderPipelineAsync` / `createComputePipelineAsync` is the only acceptable shape outside of throwaway benchmarks. Promise resolves "when the pipeline can be used without any stalling".

```ts
const [edgePipeline, nodePipeline, forcePipeline] = await Promise.all([
  device.createRenderPipelineAsync(edgeDesc),
  device.createRenderPipelineAsync(nodeDesc),
  device.createComputePipelineAsync(forceDesc),
]);
```

For N rendering modes, build a **deferred warmup queue**: kick off async creation in priority order during boot, fall back to a placeholder pipeline (or skip the draw) if a needed pipeline isn't ready. **Never `createPipelineSync` on the render thread.**

### Compilation hints and the pipeline cache

The user agent maintains a binary pipeline cache, keyed on `(shaderModuleHash, descriptorHash, deviceHash)`. Reload-on-the-same-page hits this cache; the second `createRenderPipelineAsync` for an identical descriptor takes microseconds.

You don't manage the cache directly. What you do manage is **descriptor stability**: any time you change a constant in the descriptor (like `entryPoint`, `targets[i].format`, `vertex.buffers`), the cache key changes and the next call triggers full compilation. Pipeline-overridable constants — declared as `@id(0) override BLUR_RADIUS: u32 = 8;` in WGSL and overridden in `compute.constants` — let you specialize without changing the shader module itself, so they reuse the cached parsed module.

```wgsl
@id(0) override TILE_SIZE: u32 = 16;
@id(1) override INV_GAMMA: f32 = 1.0 / 2.2;
```

```ts
device.createComputePipeline({
  layout,
  compute: { module, entryPoint: 'main', constants: { 0: 32, 1: 0.4545 } },
});
```

Override constants are scalars (bool/int/float) only — not vectors, not arrays. They can also override `@workgroup_size` if you spell it `@workgroup_size(WG_X, 1, 1)` and declare `override WG_X: u32`. See [`wgsl.md`](./wgsl.md) for the language side.

## 11. Debug labels and groups are how you read captures

Every WebGPU object accepts a `label` field at creation. Render and compute passes accept `label` in their descriptors. Encoders accept labels. Attach one to *everything*:

```ts
const buf = device.createBuffer({ label: 'particle.pos.t', size, usage });
const tex = device.createTexture({ label: 'msaa.color', size, format, usage });
const pl = device.createComputePipeline({ label: 'sim.step', layout, compute });
const enc = device.createCommandEncoder({ label: 'frame.encode' });
const pass = enc.beginRenderPass({ label: 'main.opaque', ... });
```

Labels surface in:

- **Validation error messages** — `Buffer with label 'particle.pos.t' has incompatible usage.`
- **WebGPU Inspector / webgpu-devtools** — the timeline groups events by label.
- **PIX / RenderDoc / Xcode GPU Frame Capture** — pass and command labels appear in the capture tree.
- **Chrome's `chrome://gpu` and `chrome://tracing`** — Dawn forwards labels into Perfetto traces.

Without labels, GPU captures are unreadable — every buffer is `Buffer 0x7fb...`, every pass is `Pass`. With labels you can navigate the capture by feature.

### Debug groups

`pushDebugGroup(label)` / `popDebugGroup()` build a hierarchy *inside* a pass:

```ts
const pass = enc.beginRenderPass(desc);
pass.pushDebugGroup('shadow.cascade.0');
pass.setPipeline(shadowPipeline);
pass.draw(...);
pass.popDebugGroup();

pass.pushDebugGroup('opaque');
for (const mesh of opaque) {
  pass.pushDebugGroup(mesh.label);
  pass.setBindGroup(2, mesh.bg);
  pass.draw(...);
  pass.popDebugGroup();
}
pass.popDebugGroup();
pass.end();
```

In a capture this turns into a tree: `frame.encode > main.opaque > opaque > mesh.skybox`. You can navigate, filter, and time-bracket per group.

`insertDebugMarker(label)` is the one-shot version — single marker, no scoping.

Strip labels in production if you must (Chrome's overhead is negligible — they're stored as UTF-8 strings in Dawn's command stream — but Safari's overhead is unmeasured and worth checking on a real device). The recommendation: leave labels on; they're invaluable for first-fault analysis.

## 12. Common mistakes (cheat sheet)

1. **Reusing `getCurrentTexture()` across frames** → `validation: texture is destroyed` on submit. Call inside rAF, never cache.
2. **Synchronous pipeline creation on first draw** → ~200 ms first-frame stall. Use `createRenderPipelineAsync` at boot.
3. **Awaiting `mapAsync` on the render thread** → frame spikes. Use a 3-buffer readback pool; skip when empty.
4. **No `device.lost` handler** → page goes black after sleep with no recovery.
5. **No `uncapturederror` listener in production** → silent rendering corruption.
6. **Requesting limits you don't need** → device creation fails on weaker GPUs. Query `adapter.limits`; request your worst-case only.
7. **Forgetting `storeOp: 'discard'` on transient depth/MSAA** → 10–30% mobile bandwidth, hot battery.
8. **`pushErrorScope` per draw** → microtask storms. Use per-submit scopes; pop one frame later.
9. **Awaiting inside an error scope** → scope captures unrelated errors during the await. Separate push, async work, and await of the popped scope.
10. **Caching adapters across retries** → immediate device-lost on reinit. Re-request adapter every retry.
11. **Trusting `timestamp-query` across machines** — results are implementation-defined, quantized to 100 µs. Relative on same device only.
12. **Parsing `error.message` strings** → breaks on browser update. Branch on `error.constructor.name`; log message verbatim.
