---
name: WebGPU buffer resources and memory model
description: GPUBuffer mental model, usage flag interactions, upload paths (writeBuffer / mappedAtCreation / staging ring), mapping state machine, sub-allocation, alignment, indirect args, query result buffers, residency and fragmentation, lifetime
---

# Buffer resources and memory model

This file is about *thinking in GPUBuffers*: how the driver actually allocates them, why one usage combination is hot and another is a footgun, when each upload path wins, and how to size and lay out buffers so a 1M-particle pipeline doesn't fall off a cliff at frame 30. For the validation legality table, alignment cheat-sheet, and shape of bind group layouts see `buffers-textures-bindings.md` (this file complements it; it does not duplicate it).

## 1. The GPUBuffer mental model

A `GPUBuffer` is a **virtual address range**. From JS you see only `size`, `usage`, and a `mapState`; you never get a pointer. The driver decides where the bytes physically live — discrete VRAM, system RAM mirrored to VRAM, host-coherent staging memory, or unified memory on Apple Silicon — based on the `usage` bits you set at creation. Once allocated, the *physical* placement is mostly fixed for the buffer's lifetime, even though the spec lets the driver migrate; in practice you should reason as if a buffer with `MAP_READ` is permanently in host-coherent memory and a buffer with only `STORAGE | COPY_SRC` is permanently in device-local VRAM.

**Usage flags are not free.** They serve two purposes:

1. **Validation.** A buffer used as an index source without `INDEX` set fails recording. A buffer mapped without `MAP_READ`/`MAP_WRITE` fails `mapAsync`. This catches you up front; the cost is just bookkeeping.
2. **Allocation strategy.** Each flag narrows the set of memory heaps the driver can place the buffer in. `MAP_READ` forces host-visible memory. `STORAGE` requires UAV-capable memory. The intersection of all flags' constraints picks the heap.

Compound flags can degrade performance because the intersection narrows. `MAP_READ | STORAGE` is technically valid but the buffer must live somewhere both sides can see — typically system RAM with PCIe access from the GPU on a discrete card. Storage reads through PCIe are an order of magnitude slower than VRAM reads. The mental rule:

> **`MAP_READ` is for readback only. `MAP_WRITE` is for one-shot init or staging. Everything else stays device-only.**

You don't violate this rule because the driver yells; you violate it because nothing yells, and your particle simulation suddenly costs 4 ms of frame time it shouldn't.

A useful way to picture a buffer: it's a slab of memory plus a *contract* about who is allowed to look at it and how. Tightening the contract (fewer flags) lets the driver pick the fastest slab.

### Intuiting placement for novel cases

When you're choosing usage flags for a buffer you've never built before, walk through three questions:

1. **Who reads/writes from the GPU side, and how often?** If the GPU writes every frame and reads every frame, the buffer must live in device-local memory. Adding `MAP_*` would force it into shared memory and tank that frame loop. (Use a separate staging buffer instead.)
2. **Who reads/writes from the CPU side, and how often?** Once at startup → `mappedAtCreation` (no `MAP_*` flag). Per-frame from CPU → the staging ring (one buffer mapped, one device-resident, copy between them). Per-frame back to CPU → readback pool (`MAP_READ` only, fed by `copyBufferToBuffer`).
3. **How big?** Sub-megabyte buffers can live almost anywhere without measurable cost; the placement decision matters most at tens or hundreds of megabytes, where the wrong heap multiplies bandwidth costs.

If the answers are clean — "GPU only, both stages" — pick the minimal flag set (e.g. `STORAGE | VERTEX`). If the answers conflict — "I want the GPU to update it every frame *and* the CPU to read it back continuously" — you almost certainly want **two buffers** (one device-local, one mappable) bridged by `copyBufferToBuffer`, not one buffer with a wide flag set. The "two buffers, one role each" decomposition is the single most useful instinct in the buffer model.

## 2. Usage flag interactions in practice

Beyond the validation matrix in `buffers-textures-bindings.md`, here are the combinations that actually come up and what they mean for the driver:

- **`STORAGE | VERTEX | COPY_DST`** — the canonical "particle position buffer." Compute integrates into it via storage; render reads it via vertex pulling without an extra copy. Both stages live in device-local memory; one allocation, no PCIe round-trip per frame. This is the workhorse of any GPU-driven pipeline.
- **`STORAGE | INDIRECT | COPY_DST`** — compute writes draw counts that a later `drawIndirect` consumes. Same buffer, two roles, zero CPU readback. Note: don't read AND write an indirect buffer in the same submit; see indirect args section below and SKILL.md's note on gpuweb#2189.
- **`UNIFORM | STORAGE`** — *valid but rare*. You'd want it if you have a structured-buffer-style read access pattern but also need broadcast-uniform loads on some hardware paths. In practice, pick one. If the data is < 64 KiB and the access pattern is "every invocation reads the same field," use `UNIFORM`. Otherwise `STORAGE`.
- **`MAP_WRITE | STORAGE`** — *valid, but a footgun on tile-based GPUs* (Apple, mobile, integrated). On unified-memory devices the driver will place the buffer in a region accessible from both sides, but tile-based renderers use private tile memory for storage access; sharing breaks that fast path. The buffer ends up in system RAM with the GPU bouncing through L2. On a discrete desktop GPU it's somewhat better but still not optimal. Always prefer a separate `MAP_WRITE | COPY_SRC` staging buffer + `copyBufferToBuffer` into the device-local STORAGE buffer.
- **`COPY_SRC | COPY_DST`** without anything else — the "pure transfer buffer," used as a scratch zone between two other buffers. Rare; usually you want a usage that lets you actually read the data on either CPU or GPU.

The mental rule: every additional flag is a constraint on placement. Add only the flags you actually need.

## 3. Three upload paths and when each wins

There are three ways to get bytes from JavaScript into a GPU buffer. They differ in code complexity, copy count, and bandwidth profile.

### 3.1 `queue.writeBuffer(buf, offset, data)` — the safe default

```js
const params = new Float32Array([camX, camY, camZ, time]);
device.queue.writeBuffer(uniformBuf, 0, params);
```

Internally, the driver allocates a piece of an internal staging arena, copies your TypedArray bytes into it, queues a copy-to-device command, and then frees the arena slice when that copy completes. **Two memory hops: your data → driver staging → device.** The driver chooses the staging strategy and reuses arenas across calls.

Default for all small/medium uploads. Toji's pithy summary: "an extremely solid catch-all solution." Chrome 144 doubled `writeBuffer`/`writeTexture` throughput; on M-series Macs and recent NVIDIA, sub-megabyte uploads are nearly free. Usage covers writeBuffer **up to roughly 10 MB/frame** without you needing to think about it. Beyond that the per-call copy step starts to dominate frame time and you should profile.

`srcOffset` and `size` are in **TypedArray elements, not bytes** (e.g. `writeBuffer(buf, 0, f32arr, 4, 16)` skips the first 4 floats and copies 16 floats). This catches everyone once.

### 3.2 `mappedAtCreation: true` — the one-shot init path

```js
const buf = device.createBuffer({
  size: vertexCount * 24,                 // bytes
  usage: GPUBufferUsage.VERTEX,           // COPY_DST not required!
  mappedAtCreation: true,
});
new Float32Array(buf.getMappedRange()).set(meshData);
buf.unmap();
```

When you pass `mappedAtCreation: true`, the driver returns the buffer in mapped state with a host-visible region you can write to as a regular ArrayBuffer. After `unmap()`, the driver is free to copy/migrate that memory into device-local VRAM (or it might already be in unified memory on Apple Silicon — no copy at all there).

The wins: **one fewer copy** versus `writeBuffer` (you write directly into staging-or-device memory rather than into your own JS buffer first), **`COPY_DST` is not required** (cleaner usage flags), and the code path is synchronous and trivial.

The costs:

- The buffer must fit in CPU-addressable memory at creation time. For a 12 MB position buffer this is irrelevant; for a 2 GB asset you'd want streaming.
- On a discrete GPU you've **burned PCIe upload bandwidth at startup** that you might otherwise have wanted to amortize over many frames.
- The browser zeros the buffer before mapping it back to you, which costs memory bandwidth proportional to size. For a 100 MB buffer, that's measurable.
- Only available at creation; you cannot remap the buffer this way later. If the data changes, you need a different path.

The pattern is: any data that is computed once and used many times — static vertex/index buffers, sparse lookup tables, particle seeds — initialize via `mappedAtCreation`. Anything that updates per-frame uses one of the other paths.

### 3.3 Staging buffer ring — the bandwidth path

When uploads are *both large and per-frame* — think 16 MB of new particle seeds every frame for a streaming graph layout — `writeBuffer` becomes the bottleneck. Its O(2N) memory traffic (your data → staging → device) at 16 MB × 60 fps = 1.92 GB/s of host bandwidth eaten just on the staging copy step.

A staging ring lets you write *directly* into mapped staging memory, then issue a single device-side copy. O(N) memory traffic on the host, with the device-side copy using GPU bandwidth which is 10x cheaper. This is when you reach for the ring pattern; section 6 below has the full implementation.

### 3.4 Decision rule

| Situation | Pick |
|---|---|
| Small per-frame uniform updates (kilobytes) | `writeBuffer` |
| Initialize a static buffer at startup | `mappedAtCreation` |
| Per-frame upload up to ~10 MB | `writeBuffer` |
| Per-frame upload above ~50 MB | Staging ring |
| Per-frame between 10 and 50 MB | **Profile.** `writeBuffer` is often still fine on Chrome 144+; the ring is non-trivial code |
| GPU-generated data | Don't upload at all — compute writes directly into a STORAGE buffer |

## 4. Why you might NOT want writeBuffer

The Chrome 144 doubling moved the threshold significantly higher, but it doesn't change the structural argument: `writeBuffer` *always* copies via a driver-internal staging buffer. For small data the copy is invisible; for large data the math is straightforward.

A 50 MB per-frame `writeBuffer`:

- Memory traffic: 50 MB host-to-staging + 50 MB staging-to-device = **100 MB / frame on the host bus**.
- At 60 fps that's 6 GB/s, which on a laptop with shared memory is a third of total available bandwidth.

The same 50 MB through a staging ring:

- Map a pre-allocated staging buffer (no copy). Write your data directly into the mapped range. Issue `copyBufferToBuffer` (host doesn't move bytes; the GPU's internal copy engine does it on the device side, possibly with zero PCIe traffic on a discrete card if the staging buffer is host-coherent and visible).
- Memory traffic on the host bus: **50 MB / frame**. Half. The staging ring's copy is on the GPU side.

The win scales linearly with size. At 10 MB/frame it doesn't matter. At 200 MB/frame the ring is the difference between 60 fps and 22 fps.

## 5. `mappedAtCreation` vs `mapAsync` deep

These two paths share machinery (the mapping state machine) but are used very differently.

**`mappedAtCreation: true`** at buffer creation puts the buffer in mapped state immediately, before any GPU work has happened. The buffer's usage **does not need to include `MAP_WRITE`**; this is the only way to get write access to a non-mappable buffer. After `unmap()` the buffer transitions to its first non-mapped state and can never be re-mapped (unless its usage *also* includes `MAP_READ` or `MAP_WRITE`).

**`mapAsync(mode, offset, size)`** requires the buffer's usage to include `MAP_READ` or `MAP_WRITE` matching the mode. It returns a `Promise` that resolves when:
1. All previously submitted GPU work using this buffer has completed.
2. The driver has made the requested range CPU-accessible.

This is the critical insight that often surprises people: **the Promise includes an implicit GPU barrier**. You do *not* need to call `queue.onSubmittedWorkDone()` first. The mapping won't be granted until in-flight work finishes. If you `await buf.mapAsync(...)` while the GPU is still rendering, you stall the JS thread for one or more frames waiting for the GPU to drain.

That implicit barrier is also why mapping the same buffer the GPU is currently using costs 1-3 frames of latency on average — the readback isn't ready until the GPU finishes the work that produced it. Don't await on the render thread; pool stagers (section 6) and use the triple-buffer readback ring described in [`synchronization.md`](./synchronization.md) §12.

The mapping state machine has four states:

| State | How you get there | What's legal |
|---|---|---|
| **unmapped** | Initial state for non-`mappedAtCreation` buffers; result of `unmap()` | Can be used in submitted commands; can call `mapAsync` (if usage allows) |
| **pending** | Between `mapAsync` and the Promise resolving | Cannot be used in commands; cannot call `unmap` or `getMappedRange` |
| **mapped** | After `mapAsync` Promise resolves, or at creation with `mappedAtCreation: true` | Can `getMappedRange`; cannot be used in commands |
| **destroyed** | After `destroy()` | Nothing — any use is a validation error |

`unmap()` invalidates *all* `ArrayBuffer` views from prior `getMappedRange()` calls — they become detached. Using a detached ArrayBuffer is silent corruption from the JS engine's perspective; you can read garbage or zero. Always reacquire after re-mapping.

Mapped range alignment: offset must be a multiple of 8, size a multiple of 4. Buffer creation size itself must be a multiple of 4.

## 6. Staging buffer ring — canonical implementation

```js
const RING_DEPTH = 3;                       // 2-3 typical; 4-5 if heavy GPU pipelining
const stagers = Array.from({ length: RING_DEPTH }, () =>
  device.createBuffer({
    size: PER_FRAME_BYTES,
    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,                 // start mapped; no first-frame stall
  })
);
const free = stagers.slice();               // pool of stagers ready to fill
let inflight = [];                          // {buf, fence: promise once GPU done}

async function uploadParticles(seeds /* Float32Array */) {
  let stager = free.pop();
  if (!stager) {
    // Pool exhausted: must wait for oldest in-flight to come back. Rare if depth chosen right.
    const oldest = inflight.shift();
    await oldest.fence;
    stager = oldest.buf;
  }

  // stager is in mapped state (either freshly created or just remapped).
  new Float32Array(stager.getMappedRange()).set(seeds);
  stager.unmap();

  // Schedule the device-side copy.
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(stager, 0, particlesBuf, 0, seeds.byteLength);
  device.queue.submit([enc.finish()]);

  // Re-map for next time. mapAsync resolves once GPU is done with this stager.
  const fence = stager.mapAsync(GPUMapMode.WRITE).then(() => {
    free.push(stager);                      // back into the pool
  });
  inflight.push({ buf: stager, fence });
}
```

`RING_DEPTH` should match how many frames the driver pipelines in flight. Three is a safe default; four if you also have heavy compute that delays staging completion. Too few → pool exhaustion → `await` stall. Too many → wasted memory (each stager is `PER_FRAME_BYTES`).

The reason three works: at any instant during steady-state, you typically have **one frame on the CPU being recorded, one frame queued waiting for GPU dispatch, and one frame the GPU is actually executing**. Each of those frames needs its own stager, because all three may reference different copies of the data. With `RING_DEPTH = 2`, frame N+1 wants to map the stager that frame N-1 used, but frame N-1 is still being executed by the GPU and the `mapAsync` Promise hasn't resolved yet — so the JS thread blocks. With `RING_DEPTH = 3`, by the time you cycle back, frame N-2's GPU work has long since completed and the stager is sitting on the free list.

Heavy GPU pipelines (compute-heavy, deep compositors, multiple submits per frame) push the actual in-flight depth up to four or five. The empirical answer is: profile, watch the size of `inflight`, and add one to `RING_DEPTH` if it doesn't drain.

The first call to `uploadParticles` is "free" because `mappedAtCreation` left all stagers pre-mapped. From frame 1 onward, the ring is in steady-state: one stager being filled, one in transit, one mapped and ready.

## 7. Sub-allocation strategies

Creating many small buffers is expensive: each buffer is its own allocation, possibly a separate VRAM page, with its own bind group entries and descriptor table slot. **One large `STORAGE` buffer subdivided by offset is faster** than fifty small buffers, because:

- One bind group entry instead of fifty.
- One residency tracking unit; the driver pages it as a unit.
- Adjacent regions get cache-line locality if accessed together.

The downside is you need an allocator on top of the buffer.

**Bump allocator**. Maintain a single offset that grows; never free until the whole buffer is reset. Cheap (one add per allocation), and ideal for per-frame transient data: at frame end, reset offset to zero. Many engines implement per-frame uniform pools this way.

**Ring allocator.** Offset wraps around modulo buffer size; no free. Works only if you can guarantee a region won't be in use anymore by the time you wrap. For a graph-viz frame uniform pool: size = frame_uniforms × frames_in_flight × headroom; offset cycles. Validation never sees freed regions because nothing is technically "freed" — the driver thinks it's all live.

**Suballocation in a giant `STORAGE` buffer.** For longer-lived but pooled data (per-mesh draw uniforms, per-instance buffers): maintain a free list of fixed-size slots, each slot pre-aligned to 256 bytes. New allocation = pop from free list. Free = push back. The buffer's lifetime is the program's lifetime; only the slot bookkeeping is dynamic.

**Why allocators look different from CPU mallocs.** WebGPU has no fine-grained free at the buffer level (only `destroy()`, which is whole-buffer). Offsets must respect alignment (256 bytes for uniform dynamic offsets, 16 for storage). And buffers are coarser-grained than pages on most CPUs. The result: WebGPU "allocators" are really *buffer suballocators*, and the buffer itself is allocated once via `createBuffer` and never resized.

## 8. Alignment requirements

The four numbers worth memorizing:

| Context | Alignment |
|---|---|
| Buffer size | 4 bytes |
| Mapped range offset | 8 bytes |
| Mapped range size | 4 bytes |
| Vertex attribute offset | 4 bytes |
| `copyBufferToBuffer` source/dest offset and size | 4 bytes |
| `dispatchWorkgroupsIndirect` offset | 4 bytes |
| Storage buffer binding offset (static) | 16 bytes (the WGSL struct alignment) |
| Storage buffer dynamic offset | `minStorageBufferOffsetAlignment` (default 256, often 64 on Apple) |
| Uniform buffer dynamic offset | `minUniformBufferOffsetAlignment` (default 256, often 64 on Apple) |

WGSL host-shareable layout (see `wgsl.md`): `f32`/`i32`/`u32` align 4, `vec2` align 8, `vec3`/`vec4`/all matrices align 16. **`vec3` consumes 16 bytes** — three floats of payload, four bytes of padding. `mat3x3<f32>` is three padded vec3s = 48 bytes, not 36. `mat4x4<f32>` is 64 bytes.

The rule: **storage layout is permissive, uniform layout is strict.** Storage allows tighter packing of arrays with native scalar/vec2 stride; uniform forces 16-byte stride on every array element by default. This is why `array<f32, 64>` in a uniform buffer is 1024 bytes (each element padded to 16) but in a storage buffer is 256 bytes (tight `f32` stride).

## 9. The `uniform_buffer_standard_layout` extension

When this WGSL language extension is enabled, uniform buffers use storage's relaxed rules. The big change: the "array element stride must be a multiple of 16" requirement for uniform arrays drops. `array<f32, 64>` becomes 256 bytes instead of 1024. `array<vec2<f32>, 32>` becomes 256 bytes instead of 512. For parameter buffers full of scalars or vec2s this is a 4× memory reduction *and* a 4× cache-line density gain.

Enable at the top of the WGSL module:

```wgsl
enable uniform_buffer_standard_layout;

struct Params {
  weights: array<f32, 256>,     // 1024 bytes (256×4) instead of 4096 (256×16)
  scales:  array<vec2f, 64>,    // 512 bytes (64×8) instead of 1024 (64×16)
};
@group(0) @binding(0) var<uniform> params: Params;
```

Browser support is universal in Chrome/Edge stable, Firefox, Safari 26+. See `wgsl.md` for the broader extension table. **Use it whenever you have a parameter buffer with scalar/vec2 arrays.** No runtime cost; pure layout change.

## 10. Indirect args buffer layouts

The three indirect arg structs:

| Command | Size | Layout (all u32) |
|---|---|---|
| `dispatchWorkgroupsIndirect` | 12 bytes | `workgroupCountX, workgroupCountY, workgroupCountZ` |
| `drawIndirect` | 16 bytes | `vertexCount, instanceCount, firstVertex, firstInstance` |
| `drawIndexedIndirect` | 20 bytes | `indexCount, instanceCount, firstIndex, baseVertex, firstInstance` |

`indirectOffset` must be a multiple of 4. The buffer must have `INDIRECT` usage. Combined with `STORAGE | COPY_DST`, a compute shader can write the args and a later pass dispatch from them in one frame.

```wgsl
@group(0) @binding(0) var<storage, read_write> args: array<u32, 8>;
// args[0..3]   = drawIndexedIndirect for opaque pass
// args[4..7]   = padding for alignment / next struct
```

```js
const indirectBuf = device.createBuffer({
  size: 256,                                // many indirect entries packed
  usage: GPUBufferUsage.INDIRECT
       | GPUBufferUsage.STORAGE
       | GPUBufferUsage.COPY_DST,
});

// Compute pass writes args[0..4] (visibility cull, count, etc.)
// Render pass: pass.drawIndexedIndirect(indirectBuf, 0);
// Second indirect:    pass.drawIndexedIndirect(indirectBuf, 20);
```

**Consolidate every indirect arg in the program into ONE buffer.** Chrome runs an internal validation compute kernel per indirect buffer per submit (clamping the args to known limits to prevent malicious dispatch counts). One buffer = one kernel invocation. Many small buffers = many kernel invocations. At scale this saves milliseconds per frame.

Watch the SKILL.md note: do not read AND write the same indirect buffer in the same submit (gpuweb#2189). Split into two `submit()` calls or make the producer pass and consumer pass live in different command buffers.

## 11. Query result buffers

Timestamp and occlusion queries land in a buffer with the `QUERY_RESOLVE` usage flag. To get the data to JS, copy from the resolve buffer to a separate `MAP_READ | COPY_DST` readback buffer:

```js
const resolveBuf = device.createBuffer({
  size: 16 * Float64Array.BYTES_PER_ELEMENT,    // 16 timestamps as u64
  usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
});
const readbackPool = Array.from({ length: 3 }, () =>
  device.createBuffer({
    size: resolveBuf.size,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
);

// Each frame, after writing timestamps:
encoder.resolveQuerySet(querySet, 0, 16, resolveBuf, 0);
const readback = readbackPool[frame % 3];
encoder.copyBufferToBuffer(resolveBuf, 0, readback, 0, resolveBuf.size);
device.queue.submit([encoder.finish()]);

// Some frames later, when readback's mapAsync resolves:
await readback.mapAsync(GPUMapMode.READ);
const ts = new BigUint64Array(readback.getMappedRange());
// process timestamps
readback.unmap();
```

The two-buffer pattern is canonical because `QUERY_RESOLVE` is incompatible with `MAP_READ` — same map-flag mutual-exclusion rule as everywhere else. The frame-cycled pool of three readback buffers absorbs the GPU-to-CPU pipeline depth.

## 12. Memory residency and eviction

**WebGPU has no explicit residency API.** No `MakeResident`/`Evict` like D3D12. The driver decides when to swap buffers in/out of VRAM based on its internal heuristics. Implications:

- A buffer you create and don't touch this frame still costs residency budget. The driver may keep it resident "just in case." On a constrained device this means less memory for the buffers you *are* touching.
- Don't allocate buffers eagerly for hypothetical future use. Allocate at scene transitions, destroy at scene transitions.
- On mobile (a 4 GB tab budget includes BOTH buffer pages and texture pages combined), you can hit eviction-induced stutter when total scene size approaches the budget. Symptoms: random frame-time spikes during camera pans into new areas, no obvious culprit in the trace.

The mitigation is bookkeeping discipline: track total allocation, expose it in dev mode, alarm when it crosses a per-platform threshold (typical desktop: 1 GB, mobile: 256 MB).

## 13. Fragmentation reality

A pattern that looks innocent: create a 4 MB buffer, destroy it; create a 4 MB buffer, destroy it; repeat. After enough cycles, the allocator has scattered free regions that don't coalesce, and the next 4 MB allocation may fail with OOM despite plenty of "free" total memory. Fragmentation is a real failure mode in long-running WebGPU sessions, especially anything with frequent scene transitions.

Mitigations, in order of effectiveness:

1. **Pool buffers by size class.** A pool of 16 × 4 MB buffers, reused across scenes, never fragments because the allocations are uniform.
2. **Suballocate inside a big buffer.** Same logic at finer granularity. The big buffer is allocated once; you manage offsets.
3. **`destroy()` only at scene transitions.** Avoid the create/destroy-per-frame anti-pattern.
4. **Reset by tearing down the device.** If you must, request a fresh `GPUDevice` between scenes; the old one's buffers all GC together.

## 14. Lifetime: destroy vs GC

JavaScript GC will eventually reclaim unreachable `GPUBuffer` JS objects. The device-side allocation backing them is freed when *both* (a) the GPU has no work in flight referencing the buffer and (b) the JS object is GC'd. This is non-deterministic. A buffer dropped at frame 100 may still hold VRAM at frame 200.

**For deterministic cleanup, call `buf.destroy()` explicitly.** Effects:

- Validation transitions the buffer to a destroyed state. Any subsequent use — recording, mapping, copying — is a validation error.
- The driver tries to free the device-side allocation as soon as in-flight GPU work completes. Outstanding command buffers referencing the buffer keep it alive until they execute.
- The JS object remains valid (no exception on property access), only operations fail.

Use `destroy()` at:

- Scene/level transitions (free everything from the old scene at once).
- Asset hot-reload (replace old asset, destroy old buffer).
- Component unmount when the buffer was tied to that component.

Don't use `destroy()` for per-frame cleanup; the create/destroy-per-frame pattern fragments memory (section 13). For per-frame data, use a ring or bump allocator.

### Destroying an in-flight buffer

You may call `destroy()` on a buffer that is referenced by command buffers still in the queue. The spec defines this as well-formed: the *device-side* allocation stays alive until those submits complete; only further use is rejected. In practice the call returns immediately, JS is free to drop the reference, and the driver retires the allocation when the dependent submits finish.

The trap is calling `destroy()` and then *also* recording a new command that references the buffer. The recording itself fails validation (the buffer is destroyed). If you have any code path that destroys-on-event and elsewhere encodes-on-rAF, race those carefully — record first, destroy after submit, never the other order.

For deterministic teardown patterns:

```js
// Encode and submit any final work that uses the buffer.
device.queue.submit([finalEncoder.finish()]);
// Optionally wait for it (rare; usually unnecessary).
await device.queue.onSubmittedWorkDone();
// Now destroy. The driver will free as soon as it can.
buf.destroy();
```

`onSubmittedWorkDone` is only required if you need a *strong* guarantee that a downstream call sees the buffer fully retired (e.g. immediately recreating an identically-sized buffer in a memory-tight context). For ordinary cleanup the implicit ordering is enough.

## 15. Patterns and traps in one page

| Pattern | Why it's right |
|---|---|
| **Ping-pong storage buffers** for any kernel that reads neighbors. Read from buffer A, write to B; swap each frame. | Eliminates RAW hazards inside one pass without barriers. See `compute-fundamentals.md` for the dispatch pattern; `gpgpu-recipes.md` for the worked particle/spatial-hash example. |
| **One indirect buffer for all indirect args.** | One driver validation kernel per submit. |
| **Three-deep readback pool for query/picking results.** | Absorbs GPU-CPU pipeline latency without main-thread stalls. |
| **Bump allocator for per-frame uniforms.** | Free is implicit — reset offset at frame start. |
| **`mappedAtCreation` for everything written exactly once.** | Skips `COPY_DST`, skips a copy. |
| **Staging ring with `RING_DEPTH = 3`** for per-frame uploads > ~10 MB. | Halves host bandwidth versus `writeBuffer`. |

| Trap | What goes wrong |
|---|---|
| Awaiting `mapAsync` on the render thread | Stalls JS until GPU drains; frame-time spike correlated with GPU load. |
| `MAP_WRITE | UNIFORM` (or any non-COPY non-map flag) | Validation error at creation. |
| Reading a detached ArrayBuffer after `unmap` | No exception, garbage data. |
| `vec3` array stride assumed 12 bytes | Shader reads garbage every fourth element. Use `vec4` or `array<f32>` columnar. |
| Per-frame `createBindGroup` allocations | ~30% throughput cliff on tile-based GPUs. Cache or use dynamic offsets. |
| Multiple indirect arg buffers across a frame | One validation kernel per buffer; consolidate. |
| Holding onto destroyed buffer references | Validation noise on every recorded command; refactor lifetime. |

## Cross-references

- **Validation legality + bind group layouts**: `buffers-textures-bindings.md`. That file has the exact usage matrix and bind group entry shapes; this file owns the *why* and the upload paths.
- **WGSL layout rules + extensions**: `wgsl.md`. `uniform_buffer_standard_layout`, `vec3` packing, struct alignment.
- **Compute kernel mental model + indirect dispatch**: `compute-fundamentals.md`. **Worked recipes** (prefix sum, ping-pong particles, spatial hash, sort): `gpgpu-recipes.md`.
- **Submission ordering, implicit barriers, mapAsync vs onSubmittedWorkDone, frame pacing, swap chain, OffscreenCanvas, tab visibility**: `synchronization.md`. (Encoder/queue lifecycle and error scopes still in `api-fundamentals.md`.)
- **Profiling buffer hot paths** (timestamp queries, memory dumps): `performance-and-profiling.md`.
- **Browser-specific buffer caps and limits**: `browser-platform-reality.md`.

Toji's buffer-uploads canonical post: <https://toji.dev/webgpu-best-practices/buffer-uploads.html>. Spec section: <https://www.w3.org/TR/webgpu/#buffer-interface>.
