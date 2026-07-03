---
name: WebGPU synchronization, queue semantics, frame pacing, swap chain
description: Implicit barriers, single-queue submission ordering, mapAsync vs onSubmittedWorkDone, getCurrentTexture lifetime, double/triple buffering, OffscreenCanvas-on-Worker, tab visibility, device-lost recovery from a sync standpoint
---

# Synchronization, queue semantics, frame pacing, swap chain

WebGPU has *no* explicit barriers in the API surface. The runtime tracks what
each command reads and writes, and inserts whatever pipeline barriers the
backend (Vulkan / Metal / D3D12) needs. There is exactly *one* queue per
device, all submissions are ordered, and a small set of Promise contracts
(`mapAsync`, `onSubmittedWorkDone`, the canvas swap chain) are the only places
where the queue talks back to JS. Almost every "WebGPU is slow" debugging
session ends in one of: (a) you stalled the queue with a wrong-shaped await,
(b) you held the canvas texture across a tick, or (c) you misread the
implicit-barrier model. This file is the reference for all of that.

> **Cross-references.** Buffer mapping state machine and `mapAsync` upload paths
> live in [`buffer-resources.md`](./buffer-resources.md). Adapter/device/queue
> lifecycle, error scopes, and `device.lost` recovery in
> [`api-fundamentals.md`](./api-fundamentals.md). Tab-visibility nuances and
> device-lost reasons in [`browser-platform-reality.md`](./browser-platform-reality.md).
> Frame-time profiling, timestamp queries, and `mapAsync`-stall diagnosis in
> [`performance-and-profiling.md`](./performance-and-profiling.md).

## 1. The implicit synchronization model

WebGPU is implicit-barrier by spec — there is no
`vkCmdPipelineBarrier`, no `ResourceBarrier`, no MTL encoder boundary
exposed to JS. The runtime tracks **usage scopes**: an interval of
potentially-concurrent operations across which a subresource may be
touched only with a *compatible usage list* (all read-only, or all
storage, or all attachment). Scope boundaries fall at compute dispatches,
render-pass ends, and bundle finalizations. The implementation walks the
encoder, sees "pass A wrote attachment X, pass B reads X as a sampled
texture," and emits the backend barrier between them. Spec text:

> *Each usage scope covers a range of operations which may execute in a
> concurrent fashion with each other, and therefore may only use
> subresources in consistent compatible usage lists within the scope.*

This buys correctness for free — you cannot forget a barrier; cross-tab
security falls out of the same machinery. The cost is no room to
optimize barrier placement: the driver is conservative and may insert
barriers an expert Vulkan author would elide. There are also no
cross-queue or cross-device sync primitives — one queue per device, no
semaphores, no fences, no events between devices. To order work across
separate `GPUDevice`s, copy through CPU. When `pass A` writes a storage
buffer and `pass B` reads it: record in order, submit. The driver has
the dependency graph from the bind groups and inserts the barrier. Same
across command buffers in one `submit()`, same across separate `submit()`
calls — order of submission is order of execution.

## 2. Command buffer ordering vs execution ordering

The recording→submission pipeline has three "consumed" transitions
(`pass.end()` consumes the pass, `encoder.finish()` consumes the encoder,
`queue.submit()` consumes the command buffer; see
[`api-fundamentals.md`](./api-fundamentals.md) §5). Execution ordering:

1. Within one render or compute pass, dependent commands execute in
   record order. Non-dependent draws *may* be reordered by the GPU when
   blending and depth state allow.
2. Within one `submit([b1, b2, b3])`, b1 fully synchronizes with b2 and
   b2 with b3 — runtime treats it as a write→read barrier between b1's
   last command and b2's first for any shared resource.
3. Across separate `submit()` calls, queue order is preserved.
   `submit([b1])` then `submit([b2])` is identical for ordering to
   `submit([b1, b2])` — you only paid an extra IPC trip.
4. `queue.writeBuffer` / `writeTexture` / `copyExternalImageToTexture`
   insert into the queue at *call time*. After `submit([cmdBuf])` then
   `writeBuffer(buf, ...)`, the writeBuffer copy runs *after* cmdBuf —
   as if appended.

Rule 4 is the one developers most often miss: `writeBuffer` is not
"immediate to JS." It is "queued at the end of the queue right now,
synchronously to JS, asynchronously to the GPU." The data lands when
the queue gets there. The bind-group implication is in §11.

## 3. What an implicit barrier actually does

When the runtime sees a write→read dependency between passes, it emits
the platform-appropriate barrier: `vkCmdPipelineBarrier` with the right
stage/access masks on Vulkan, a new `MTL{Render,Compute}CommandEncoder`
on Metal (the encoder boundary is the barrier), `ResourceBarrier` with
a state transition on D3D12. All stall the pipeline while caches flush
and writes become visible. On a tile-based mobile GPU the cost is high
(the tile working set may flush to memory and reload). On desktop
discrete it's tens of microseconds per barrier on heavy frames.

**Render-pass merging.** Consecutive render passes with compatible
attachments and no intervening read of those attachments are merged
into one backend pass — the cross-pass barrier elided entirely. A
`copyBufferToBuffer` between the passes breaks the merge; so does a
different attachment, or sampling a target between passes. To get
merging, sample render targets only in a single later pass.

**Minimizing transitions.** Each backend barrier is a transition. Reduce
them by using a resource in one access pattern per pass (don't read+write
the same buffer in alternate passes when ping-pong is available; see
[`buffer-resources.md`](./buffer-resources.md) §15), combining writes
into one pass (write all G-buffer attachments in one geometry pass), and
avoiding render/compute alternation on the same target.

## 4. Render-pass and compute-pass scope semantics

Each `beginRenderPass` / `beginComputePass` opens a *usage scope*. Within
one scope, every subresource used must be in a *compatible usage list*:
all read-only, or all storage-write (with the "storage exception" that
permits multiple writable storage bindings on the same resource at the
cost of unspecified ordering), or all attachment. **Mixed access is
illegal in one scope.** You cannot bind the same buffer as both `STORAGE`
(read-write) and `UNIFORM` in one pass; you cannot bind a texture as both
`RENDER_ATTACHMENT` and `TEXTURE_BINDING` in one pass — *even with
`read_only` access*. The validator catches these at pass end or
encoder finish.

Per spec, "a subresource is used in the usage scope if it's referenced by
any command, including state-setting commands" — vertex/index buffers,
all bind groups, and indirect-arg buffers count, even ones never read by
the dispatched threads. **Corollary:** to sample a render target, end
the render pass and begin a new one with the texture as a sampled
binding. There are no feedback loops.

## 5. The single-queue model and what it gives up

Vulkan and D3D12 expose multiple queues per device — a graphics queue, a
compute queue, often a transfer (DMA) queue. They run physically in parallel
on hardware that supports it. Apps overlap a long compute kernel against a
graphics frame on independent data, or kick off a copy while rendering,
hiding latency.

**WebGPU has one queue.** Named `GPUQueue`, accessed as `device.queue`. There
is no API to create another. Concrete consequences:

- A long compute dispatch fully serializes against subsequent rendering.
  Fragment shaders for frame N+1 cannot start until the compute dispatch
  before them finishes.
- `copyBufferToBuffer` runs on the same queue; it does not overlap with
  render or compute.
- `writeBuffer` is queued at the same point. There's no way to upload data
  in parallel with a frame's GPU work.
- The implementation *may* internally use multiple hardware queues (Dawn
  does on D3D12 — the copy queue handles `writeBuffer` staging), but you
  cannot observe or schedule that overlap from JS.

This is a known gap. The "mesh shading" / "work graphs" proposals at gpuweb
include a "compute queue family" path; nothing has shipped. For now, design
around the constraint: keep individual dispatches small (1–2 ms each is a
useful budget), interleave compute and graphics work in the same submit so
the driver can pipeline at the warp level, and accept that GPU-driven
rendering with on-GPU culling is the highest-leverage optimization since
it removes the only piece of work *you* can run in parallel with the GPU
(JS, on the CPU).

## 6. `queue.writeBuffer` and `queue.writeTexture` are queued, not immediate

```js
device.queue.writeBuffer(uniformBuf, 0, params);
device.queue.submit([commandBuf]);
device.queue.writeBuffer(uniformBuf, 0, nextParams);
```

The two `writeBuffer` calls and the `submit` execute on the queue **in
the order issued**: the first writeBuffer lands before `commandBuf` runs;
the second lands after. The driver implements `writeBuffer` as: allocate
a slice of an internal staging arena, copy from your TypedArray into it,
queue a `copyBufferToBuffer` from staging to destination, free the slice
when the queue passes. Two host hops, but **the device-side copy is on
the queue, not synchronous to JS.** The canonical uniform-update pattern
is therefore one `writeBuffer` per frame plus the render submit, never
an `await`. Chrome 144 doubled `writeBuffer`/`writeTexture` throughput;
below ~10 MB/frame it's effectively free. See
[`buffer-resources.md`](./buffer-resources.md) §3 for the full upload-path
decision tree (writeBuffer vs `mappedAtCreation` vs staging ring).

## 7. `mapAsync` lifecycle — the precise semantics

`buf.mapAsync(mode, offset, size)` returns a `Promise<undefined>` that
resolves when:

1. All previously-submitted GPU work that touched `buf` has completed
   on the queue.
2. The buffer's mapped range has been made CPU-accessible (on a discrete
   GPU, that's a copy from VRAM to host-coherent system memory across
   PCIe; on Apple Silicon's unified memory, no copy at all).

**The Promise includes the implicit fence.** From MDN, definitively:

> *You do not need to call `onSubmittedWorkDone()` for mapping a buffer.
> `mapAsync` guarantees work submitted to the queue before calling
> `mapAsync` happens before the `mapAsync` returns.*

Which has a sharp implication: **awaiting both is a wasted Promise hop.**
A pattern that shows up in code reviews:

```js
// WRONG — redundant.
device.queue.submit([enc.finish()]);
await device.queue.onSubmittedWorkDone();
await readbackBuf.mapAsync(GPUMapMode.READ);

// RIGHT.
device.queue.submit([enc.finish()]);
await readbackBuf.mapAsync(GPUMapMode.READ);
```

The spec only guarantees the *first* form's Promise ordering, but on every
implementation the second form already waits for the buffer's last
submission. The first form just round-trips through the GPU process twice.

**Constraints.** While a buffer is in mapped or pending state, it cannot
be used in command submission — `submit` will validation-error if a
recorded command references it. You must `unmap()` first. Conversely,
you cannot call `mapAsync` on a buffer if the device is currently using
it — you can, but the Promise just won't resolve until that use completes,
which is ~1 frame in steady state and several frames if the GPU is heavily
queued.

**`mapState`.** The buffer's `mapState` is a synchronously-readable getter
(`'unmapped' | 'pending' | 'mapped'`). Useful in render-loop code that
wants to check "did the last frame's readback come back yet?" without
awaiting:

```js
if (readbackBuf.mapState === 'unmapped') {
  // safe to copy into and re-issue mapAsync
  encoder.copyBufferToBuffer(resolveBuf, 0, readbackBuf, 0, size);
}
```

The state machine table is in [`buffer-resources.md`](./buffer-resources.md)
§5; the canonical readback-ring pattern is in §6 there. The *fence/sync*
contract is here.

## 8. `queue.onSubmittedWorkDone` — when to actually use it

Promise resolves when **all currently-submitted work on this queue
has completed** — a global queue fence, not per-buffer. The two ordering
guarantees in the spec:

- `q.onSubmittedWorkDone()` calls settle in call order.
- `b.mapAsync()` called before `q.onSubmittedWorkDone()` settles first.

When to actually reach for it:

- **Clean shutdown / device.destroy.** Before tearing down a device, await
  `onSubmittedWorkDone` so destruction doesn't race with in-flight work.
- **Worker shutdown.** Before terminating an OffscreenCanvas worker, drain
  the queue.
- **Benchmark "GPU idle" markers.** Pair `performance.now()` brackets
  around `submit` and the `onSubmittedWorkDone` resolve to get an end-to-end
  span (with the caveat that GPU work is pipelined; this measures latency,
  not throughput).
- **Throttling submits in workers.** If you're not on rAF (e.g., compute-
  only headless mode), `await onSubmittedWorkDone` between submits prevents
  the queue from growing unboundedly when compute outpaces GPU. From MDN:

  > *If you are not throttling work, the browser may kill the queue if
  > there is too much work submitted. Throttling can be done by awaiting
  > `onSubmittedWorkDone()` periodically.*

When NOT to use it:

- Per-buffer readback (use `mapAsync` directly).
- Frame pacing (rAF + submit-and-return is the right shape; never await
  in a rAF callback).
- Synchronization between passes (use record order; the runtime inserts
  the barrier).

## 9. `getCurrentTexture` and the swap chain

`canvas.getContext('webgpu').getCurrentTexture()` returns a `GPUTexture`
whose lifetime is the **current task** — the rAF callback you're in.
The spec calls the per-frame invalidation step "Expire the current texture":
when the browser's compositor steps in (typically at end-of-task before
display refresh), the texture is invalidated. Holding the reference across
a tick is a validation error on the next `submit`.

Concrete rules:

1. **Call `getCurrentTexture()` inside the rAF callback, immediately before
   encoding.** Never cache.
2. **One render pass per frame writes it; the browser composites it.**
   There is no explicit `present()` call. The browser samples the
   `RENDER_ATTACHMENT`-mode texture into the page composition tree at
   end-of-task. Your `storeOp: 'store'` is what makes the pixels available
   to the compositor.
3. **Resize invalidates the swap chain.** A canvas-size change between
   `getCurrentTexture` and `submit` will validation-error. The right
   pattern: handle resize *before* the rAF tick (e.g., a `ResizeObserver`
   that updates `canvas.width`/`height` and re-`configure()`s the context),
   or queue the resize for the next tick.
4. **`alphaMode: 'opaque'`** lets the compositor skip the alpha-blend step
   when stacking the canvas over the page. For full-screen graph viewers
   always `'opaque'`.

The *swap chain depth* (how many textures the browser keeps in flight) is
implementation-defined. Browsers typically maintain a 2–3-deep chain so
that the GPU can start frame N+1 while frame N composites. You can't
control the depth from JS; trust it. Your job is one frame at a time:
get the texture, render, submit, return.

## 10. Frame pacing: the rAF contract

```js
function frame(timestamp) {
  const view = context.getCurrentTexture().createView();
  device.queue.writeBuffer(frameUbo, 0, frameParams);
  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store' }] });
  // …draws…
  pass.end();
  device.queue.submit([enc.finish()]);
  requestAnimationFrame(frame);    // never await above this line
}
requestAnimationFrame(frame);
```

`requestAnimationFrame` fires once per display refresh (60Hz, or 120Hz
on ProMotion / VRR). The compositor consumes the swap-chain texture at
that rate; submit faster and the queue backs up; submit slower and you
drop frames. **Awaiting `mapAsync` or `onSubmittedWorkDone` inside rAF
yields JS until the GPU finishes** — by then the rAF deadline has
passed, the compositor presents the previous frame, you miss vsync.
Stalls of even 1 ms can flip a 16.6 ms frame into the next 16.6 ms slot.
From [`performance-and-profiling.md`](./performance-and-profiling.md):
"Frame pacing jitter? GPU time stable at 3 ms but frame intervals
oscillate 8/24/8 ms. Cure: do all `mapAsync` reads outside rAF callback."

## 11. The `writeBuffer` → `createBindGroup` ordering trap

A common bug:

```js
// BUG SHAPE — looks like it should work, doesn't.
device.queue.writeBuffer(uniformBuf, 0, params);
const bg = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuf } }],
});
```

This *works*, but for a non-obvious reason. `createBindGroup` snapshots
the *reference* to `uniformBuf`, not its contents. The bind group sees
whatever is in `uniformBuf` *at GPU execution time*. Since `writeBuffer`
is queued before any subsequent submit, the data lands first, then the
draw runs and reads it. So this works.

Where it breaks: per-frame `createBindGroup` allocations are an
anti-pattern. Cache bind groups; use *dynamic offsets* for varying
per-draw uniforms. From [`performance-and-profiling.md`](./performance-and-profiling.md):

> *Per-frame `createBindGroup` allocations: ~30% throughput cliff on
> tile-based GPUs. Cache or use dynamic offsets.*

## 12. Multi-frame buffering: when triple-buffering matters

With one queue and rAF, the browser already double-buffers the swap chain.
You explicitly triple-buffer for **resources you read back**:

- Timestamp query results.
- Indirect arg counts you also want CPU-side for sanity checks.
- Picking buffers (color-coded ID texture readback for click testing).
- Compute output you want to display in a UI overlay.

Pattern: keep N=3 of each readback target. Frame F writes to slot
`F % 3`; reads back slot `(F - 2) % 3` (so by then `mapAsync` has resolved).
This decouples CPU and GPU at the cost of 2 frames of latency on the data.

```js
const POOL = 3;
const readbacks = Array.from({ length: POOL }, () =>
  device.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
);
const pendings = new Array(POOL).fill(null);

function frame(F) {
  const writeSlot = F % POOL;
  const readSlot = (F - (POOL - 1) + POOL) % POOL;

  // Issue copy into writeSlot.
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(resolveBuf, 0, readbacks[writeSlot], 0, size);
  device.queue.submit([enc.finish()]);

  // Kick off mapAsync without awaiting; store the Promise.
  pendings[writeSlot] = readbacks[writeSlot].mapAsync(GPUMapMode.READ);

  // Consume readSlot if its Promise has resolved (poll, don't await).
  if (readbacks[readSlot].mapState === 'mapped') {
    consume(readbacks[readSlot].getMappedRange());
    readbacks[readSlot].unmap();
  }
}
```

`mapState` polling is a synchronous getter; if the Promise hasn't resolved
yet (`'pending'`), skip this frame's readback and try next frame.

## 13. OffscreenCanvas + Worker

`canvas.transferControlToOffscreen()` returns an `OffscreenCanvas`;
`postMessage(offscreen, [offscreen])` transfers ownership to a Worker.
The worker does its own `requestAdapter`, `requestDevice`, and render
loop. Main thread is freed for UI, scrolling, gestures.

```js
// main.js
const offscreen = canvas.transferControlToOffscreen();
const worker = new Worker('./gpu-worker.js', { type: 'module' });
worker.postMessage({ canvas: offscreen }, [offscreen]);

// gpu-worker.js
self.onmessage = async (e) => {
  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  const ctx = e.data.canvas.getContext('webgpu');
  ctx.configure({ device, format: navigator.gpu.getPreferredCanvasFormat() });
  const tick = () => { /* render + submit */; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
};
```

**Constraints.** After transfer, the `<canvas>` is detached;
`getContext()` on it throws. A canvas that already had `getContext()`
called cannot be transferred. Threads cannot share a `GPUDevice` —
adapter/device/queue all live in the worker. Resize requires a
`ResizeObserver` on the main-thread `<canvas>` posting `{ type: 'resize',
width, height }` to the worker, which then resizes the OffscreenCanvas
and reconfigures. `requestAnimationFrame` is available in
`DedicatedWorkerGlobalScope` (Chrome 2024+, Safari 26+) — use it;
don't `setTimeout(0)`.

## 14. Tab visibility and the queue

When the tab moves to background: `document.hidden` becomes `true`,
`visibilitychange` fires, `requestAnimationFrame` callbacks **stop
entirely** in most browsers (Firefox/Chrome) — not throttled, halted —
or throttle to ~1 Hz; `setTimeout`/`setInterval` clamp to ≥1 second; the
compositor pauses the canvas; the GPU process may park the discrete GPU
(especially on macOS hybrid laptops on battery, see
[`api-fundamentals.md`](./api-fundamentals.md) §1); past an eviction
threshold the device may be lost.

Your code must: wire `visibilitychange` to pause unrelated CPU work
(the rAF loop pauses for free); **cap delta-time on resume** (the first
rAF after visibility returns may have a giant `timestamp -
lastTimestamp` — clamp to ~1/30s to avoid simulation explosions);
**don't accumulate state assuming continuous frames** — re-derive
camera/state from authoritative sources, not a frame counter that's
been wrong for 90 seconds; plan for `device.lost`.

## 15. Power-state transitions and queue resets

Beyond visibility, the queue can be silently destroyed by laptop sleep,
hybrid-GPU switches (plugging an eGPU, OS-driven discrete↔integrated
handoff), driver hangs, and browser GPU-process recycles. All surface
through `device.lost.then(...)` with `reason: 'unknown'`. The recovery
contract — wire `device.lost` before the first submit, tear everything
down on unexpected loss, request a fresh adapter+device, exponential
backoff capped at ~2 attempts — lives in
[`api-fundamentals.md`](./api-fundamentals.md) §9 and
[`browser-platform-reality.md`](./browser-platform-reality.md). For
the *synchronization* point of view: any await on a `mapAsync` or
`onSubmittedWorkDone` Promise from before the loss either rejects or
hangs forever (browser-dependent). Always reject pending readback
Promises explicitly when `device.lost` resolves, so you don't leak
hung promises in the worker.

## 16. Patterns and traps in one page

| Pattern | Why it's right |
|---|---|
| `mapAsync` directly (no `onSubmittedWorkDone` first) | The mapAsync Promise already includes the implicit fence on the buffer's last submit. |
| Triple-buffered readback ring with `mapState` polling | Decouples CPU and GPU; never stalls rAF. |
| `writeBuffer` then `submit` then `writeBuffer` again | All queued in order; the second writeBuffer cannot be visible to the first submit. |
| `requestAnimationFrame` callback that submits and returns | Browser's swap-chain double-buffering carries you. |
| `transferControlToOffscreen` + worker rAF | Frees main thread; render keeps running through scroll/gesture jank. |
| `device.lost` handler wired before first submit | Recovery path is uniform for all loss reasons. |

| Trap | What goes wrong |
|---|---|
| `await mapAsync` inside rAF callback | Stalls JS until GPU drains; vsync miss; frame-time spike correlated with GPU load. |
| `await onSubmittedWorkDone` inside rAF | Same; an even bigger fence. |
| Pairing `onSubmittedWorkDone` + `mapAsync` for the same buffer | Two GPU-process round-trips; one is enough. |
| Caching `getCurrentTexture()` across rAF ticks | Validation error on the next `submit`. |
| Resizing canvas mid-frame | Validation error in submit; restart frame after resize. |
| Reading + writing the same indirect buffer in one submit | gpuweb#2189; split into two submits. |
| Using a buffer in `submit` while it's mapped | Validation error; unmap first. |
| `setTimeout(render, 16)` instead of rAF | Drift; ignores ProMotion; halted by visibility halts unequally. |
| Per-frame `createBindGroup` | 30% throughput cliff on tile-based GPUs. |
| Awaiting `device.queue` work on the main thread of a worker that owns the canvas | Entire canvas pipeline stalls; main thread is fine but you've defeated the worker. |

## Cross-references

- **Buffer mapping state machine + `mapAsync` upload paths** —
  [`buffer-resources.md`](./buffer-resources.md) §§5, 6, 11.
- **Adapter/device/queue/encoder lifecycle, error scopes, `device.lost`** —
  [`api-fundamentals.md`](./api-fundamentals.md) §§1, 4, 5, 8, 9.
- **Tab visibility and device-lost reasons** —
  [`browser-platform-reality.md`](./browser-platform-reality.md) §"device-lost handling", §"workers".
- **Frame-pacing measurement, timestamp queries, mapAsync stall diagnosis** —
  [`performance-and-profiling.md`](./performance-and-profiling.md) §"frame pacing & sync".
- **Render-pass attachment ops as bandwidth contracts** —
  [`api-fundamentals.md`](./api-fundamentals.md) §6.

Spec links: <https://www.w3.org/TR/webgpu/#queue> · <https://www.w3.org/TR/webgpu/#buffer-mapping>
· <https://www.w3.org/TR/webgpu/#canvas-rendering> · <https://gpuweb.github.io/gpuweb/#programming-model-synchronization>.
