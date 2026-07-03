---
name: WebGPU performance and profiling
description: Bug taxonomy, timestamp queries, RenderDoc/PIX/Xcode/WebGPU Inspector workflows, Chrome DevTools + Perfetto, error scopes, debug labels, memory leak detection, pipeline lifecycle, render bundles, indirect draws, bind-group partitioning, SoA, frame capture recipes
---

# Performance and profiling

Frame budget assumed: 1–4 ms GPU time on consumer hardware while pushing millions of points/edges. Cross-link: lifetime/upload sync lives in `synchronization.md`; tracing tools live alongside `browser-platform-reality.md`.

## The bug taxonomy — match symptom to instrument

Every "WebGPU is slow" report decomposes into one of these. Reach for the right tool first; do not search blindly.

| Symptom | Class | First instrument | What to look for |
|---|---|---|---|
| Frame intermittent jitter (8/24/8 ms) | Pipeline creation in hot path | DevTools Performance → main thread | Multi-ms `createRenderPipeline` in flame graph |
| FPS halves at higher resolution | Fill-rate / bandwidth | Lower DPR test, then RenderDoc overdraw | Output res scales with frame time |
| Frame slow but JS thread idle | GPU-bound | Timestamp queries per pass | Single pass dominates GPU time |
| Frame slow + JS thread saturated | CPU recording / IPC | DevTools Performance | Long flat span between rAF and submit |
| First-draw hitch only | Driver PSO link | Perfetto + `gpu.dawn` category | One-time multi-100ms span on GPU process |
| Geometry missing/flickering | State / binding | WebGPU Inspector OR RenderDoc capture | Wrong bind group / wrong vertex buffer / wrong viewport |
| Wrong colors only | Format / sRGB / blend | WebGPU Inspector capture → attachment view | Blend state, sRGB view vs attachment, alpha mode |
| `device.lost` mid-session | Driver TDR or OOM | `device.lost.then` reason; `chrome://gpu` | Reason = `unknown` (TDR) or `out-of-memory` |
| Validation error in console | API misuse | `pushErrorScope('validation')` around suspect call | Match on error class, not message |
| GPU memory grows across reloads | Buffer/texture leak | `chrome://gpu` Video Memory + dev-build allocator HUD | Missing `.destroy()` |
| Validation error only in dev | Not a real bug | Profile production Chrome | Validation layer overhead is dev-only |

Two principles fall out:
1. **CPU-bound vs GPU-bound is the first cut.** If `requestAnimationFrame` callback wall time ≫ summed timestamp deltas, it's CPU. If they match, it's GPU. You cannot diagnose without both numbers.
2. **Capture before optimizing.** WebGPU Inspector or RenderDoc tells you what frame N actually emitted. Most "weird rendering" bugs are bind-group state errors visible in 30 seconds of capture inspection.

## Timestamp queries — the only honest GPU timing in-browser

A timestamp query records a 64-bit GPU clock value at a pass boundary. The clock is **not wall time** — it's the GPU's internal counter. To convert to nanoseconds you multiply by `adapter.info.timestampPeriod` (or just trust the implementation: in current Chrome the resolved value is already in ns). Default Chrome quantizes to **100 µs** for timing-attack mitigation; a kernel taking 30 µs reports 0 with non-zero noise. Toggle `chrome://flags/#enable-webgpu-developer-features` to unlock unquantized for local profiling. Production should never run with that flag.

### Lifecycle

```js
// 1. Request feature on adapter, on device.
const adapter = await navigator.gpu.requestAdapter();
const canTimestamp = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({
  requiredFeatures: canTimestamp ? ['timestamp-query'] : [],
});

// 2. Two-buffer pattern: resolve target + readback ring slot.
const querySet   = device.createQuerySet({ type: 'timestamp', count: 2 });
const resolveBuf = device.createBuffer({ size: 16,
  usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
// One readback per ring slot — three deep avoids per-frame mapAsync stall.
const readBufs = [0, 1, 2].map(() => device.createBuffer({ size: 16,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }));

// 3. Attach to the pass via descriptor (legacy passEncoder.writeTimestamp is gone).
const pass = encoder.beginRenderPass({
  colorAttachments: [...],
  timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 },
});
// ... draws ...
pass.end();

// 4. Resolve into GPU buffer, then async copy into mappable buffer for next frame's read.
encoder.resolveQuerySet(querySet, 0, 2, resolveBuf, 0);
const slot = readBufs[frame % 3];
if (slot.mapState === 'unmapped') {           // never copy into a mapped buffer
  encoder.copyBufferToBuffer(resolveBuf, 0, slot, 0, 16);
}

// 5. After 2–3 frames, map and read.
const reader = readBufs[(frame + 1) % 3];
if (reader.mapState === 'unmapped') {
  reader.mapAsync(GPUMapMode.READ).then(() => {
    const t = new BigUint64Array(reader.getMappedRange());
    const ns = Number(t[1] - t[0]);          // already nanoseconds in Chrome
    reader.unmap();
    rolling.addSample(Math.max(0, ns));      // clamp: begin can occasionally exceed end
  });
}
```

### What timestamp queries CAN'T see

- **`copyBufferToBuffer`/`copyBufferToTexture` cost.** No `timestampWrites` field outside render/compute passes.
- **End-of-frame swap chain present time.** Owned by browser compositor.
- **JS recording cost.** Use `performance.now()` brackets in JS, never expect timestamps to reflect CPU time.
- **Sub-pass timing.** A pass is the smallest unit. Split passes when you need finer resolution; profile one pass per submit when measuring micro-kernels (the timestamp write is a state-pipeline interrupt, so co-resident measurements interfere).

### Helper class shape

A `TimingHelper` wraps `beginRenderPass`/`beginComputePass`, injects `timestampWrites`, runs `resolveQuerySet` + `copyBufferToBuffer` on `pass.end()`, and exposes `getResultPromise()` resolving 2–3 frames later. Pair with `NonNegativeRollingAverage` (subtract oldest, add newest, no array shifts) for a stable HUD number.

## Browser-built tools

### `chrome://gpu`
First check on any bug report. Confirms:
- "WebGPU: Hardware accelerated" vs "Software only" (driver out of date or blocklisted).
- Adapter, backend (D3D12/Vulkan/Metal), driver version.
- "Video Memory" panel — sampled, not live; reload tab to refresh.

### `webgpureport.org`
One-page dump of `adapter.info`, `features`, `limits`. Bookmark it; capture per-machine baselines so "1M particles works on my laptop" has a comparable record. Useful for catching `maxStorageBufferBindingSize` / `maxBufferSize` ceiling differences across hardware.

### Useful Chrome flags
- `chrome://flags/#enable-unsafe-webgpu` — bypass adapter blocklist; required to enable `timestamp-query` on many machines.
- `chrome://flags/#enable-webgpu-developer-features` — unquantized timestamps; expanded `GPUAdapterInfo` (driver, backend, device type, D3D shader model, Vulkan version, memory heaps); strict-math option; `isZeroCopy` on `importExternalTexture`.
- `--enable-dawn-features=allow_unsafe_apis` — opens experimental gating.
- `--enable-dawn-features=use_user_defined_labels_in_backend,emit_hlsl_debug_symbols,disable_symbol_renaming` — labels and shader names round-trip into RenderDoc/PIX/Xcode captures.

### Chrome DevTools Performance panel
Records JS execution; gear icon → enable GPU lane. Find:
- **CPU-bound recording**: long flat region in JS thread between rAF wake-up and `queue.submit`. Cure: render bundles, indirect draw, fewer `setBindGroup` calls, dynamic offsets.
- **Pipeline creation in hot path**: multi-ms tall block on first occurrence of a state combo. Cure: pre-create at boot via `createRenderPipelineAsync`; warm with a 1×1 throwaway draw.
- **Sampling artifact**: short calls are skipped or grouped. Use timestamp queries for absolute numbers; the panel is for shape, not magnitudes.

The panel does **not** show GPU-process work. For that → Perfetto.

### Perfetto / chrome://tracing
Install the Perfetto Chrome extension, target Chrome, enable `gpu.dawn`, `gpu`, and `Compositor` categories under Probes. Captures a few seconds of per-thread timeline. Reveals:
- Dawn pipeline-compile spans on the GPU process (invisible to DevTools).
- Command-encoder time per frame.
- Submit latency, swap chain present.
- Validation overhead bands.
- Allocator events (catches transient staging-buffer leaks `chrome://gpu` misses).

W/S zoom, A/D pan. Close other tabs first — every WebGPU page on the GPU process shows up as noise.

## Native graphics debuggers

### WebGPU Inspector (Brendan Duncan, Chrome extension) — the right tool

Three modes:
- **Inspect** — live tree of every `GPUDevice`/`GPUBuffer`/`GPUTexture`/`GPUBindGroup`/`GPUPipeline` on the page; current properties.
- **Capture** — single-frame command capture. Per-pass attachment images, per-call bind-group contents, buffer/texture pixel values, draw count, shader source. Live shader edit.
- **Record** — multi-frame self-contained HTML for replay/bug reports.

Engine-agnostic. Closest thing to a native graphics debugger that runs purely in browser. Works on Chrome, Edge, Firefox Nightly, Safari Tech Preview (last is WIP). **Do not reach for Spector.js** — Spector is WebGL-only and silently captures nothing for WebGPU. Recurring confusion in cross-pollinated three.js notes.

### RenderDoc on Chrome (Windows + D3D12 only, Chrome 144+)

Why: when WebGPU Inspector isn't enough — usually for state corruption, depth/blend confusion, or a "missing geometry" hunt where you need to inspect a single draw's full D3D12 root signature.

Setup once: Tools → Settings → enable "Process Injection". Set `RENDERDOC_HOOK_EGL=0` in user env vars. Drop `WinPixEventRuntime.dll` from the WinPixEventRuntime nupkg into `<Chrome Dir>\<version>\` (re-do after every Chrome update).

Launch (cmd.exe, not PowerShell):
```
"<Chrome Dir>\chrome.exe" ^
  --no-sandbox --disable-gpu-sandbox --disable-direct-composition ^
  --gpu-startup-dialog ^
  --enable-dawn-features=enable_renderdoc_process_injection,use_user_defined_labels_in_backend,emit_hlsl_debug_symbols,disable_symbol_renaming
```
`--gpu-startup-dialog` blocks the GPU process so you can `File → Inject into Process` against the displayed PID before it finishes startup. Press **F11** to switch capture API from D3D11 → D3D12 (yes, it fullscreens the browser; yes, that's the workflow). Captures auto-trigger per-frame; verify the thumbnail says "D3D12". You see translated D3D12 commands plus Dawn-injected validation dispatches and barriers — not raw WebGPU calls. Labels and debug groups survive into the capture.

### PIX on Windows (D3D12 only)

Higher-fidelity than RenderDoc when you need real GPU counters: occupancy, L1/L2 miss rates, shader stall categories, bandwidth utilization. Setup:
1. Drop `WinPixEventRuntime.dll` into `<Chrome Dir>\<version>\`.
2. Run PIX as Administrator (required for timing data).
3. Launch Win32 → `chrome.exe`. Args: `--disable-gpu-sandbox --disable-gpu-watchdog --disable-direct-composition --enable-dawn-features=emit_hlsl_debug_symbols,disable_symbol_renaming,use_user_defined_labels_in_backend`. Check "Launch for GPU capture".
4. Capture frame count 2–4 (compositor + WebGPU page render share the bucket).
5. Capture: button or `Ctrl+Alt+C`. After page loads, hit GPU Capture, then "start analysis and collect timing data".

If "The requested resource is in use" — temporarily disable Windows Real-time protection.

GPU Capture vs Timing Capture: GPU Capture is per-frame, full state, slow; Timing Capture is a sampled view of submit/present — use to confirm CPU/GPU bound diagnosis without paying full capture cost.

### Xcode Metal Debugger (macOS / iOS Safari)

Hardest setup; richest Apple-specific data. Standard Chrome won't attach — needs SIP off, codesigning stripped, or a debug Chromium build. Then:

1. Xcode → Debug → Debug Executable → Chrome binary.
2. Edit Scheme: Info tab uncheck "Debug executable". Arguments: `--disable-gpu-sandbox --enable-dawn-features=use_user_defined_labels_in_backend`. Env: `MTL_CAPTURE_ENABLED=1`. Options: GPU Frame Capture = Metal.
3. In Chrome's Task Manager, find GPU Process ID. Xcode → Debug → Attach to Process by PID, "Debug Process As" = root. The PID changes per launch.
4. When WebGPU page is in target state, click the Metal "M" button. **Don't capture by Frames** (WebGPU doesn't present like a native app). Use Source → Device, set Command Buffers to 4–5.

After capture: Chrome hangs and must be restarted. Plan one capture per session.

What it gives you that nothing else does: Apple-tile-memory residency, MSAA store-time on TBDR, per-pass GPU counters tuned to Apple GPU architecture. The tool to use when MSAA is "free" on M1 but expensive on the same logical pipeline running on D3D12.

## Error scope as a debugging tool

Three classes: `'validation'` (deterministic API misuse — by far most common), `'out-of-memory'` (resource exhaustion), `'internal'` (compile/spill — surfaces as `GPUInternalError` on pipeline creation).

```js
// Wrap synchronous WebGPU operations only.
device.pushErrorScope('validation');
const buf = device.createBuffer(desc);
device.popErrorScope().then(err => { if (err) handle(err); });

// Pipeline compile spill diagnostics:
device.pushErrorScope('internal');
const pipe = await device.createComputePipelineAsync(desc);
const err = await device.popErrorScope();
if (err) console.warn('compile spilled / exceeded:', err.message);

// Global fallthrough net for everything else:
device.addEventListener('uncapturederror', e => {
  console.error('uncaptured:', e.error.message);
  reportToServer({ class: e.error.constructor.name, message: e.error.message });
});
```

Anti-patterns (silent failures):
- **Wrapping `await fetch(...)` inside a scope.** Async work breaks scope coverage; the scope pops empty while the bug is in the unrelated continuation.
- **Pushing N scopes in a loop, popping later.** Scopes nest; mid-loop pushes inside async branches lose ordering.
- **Parsing error messages.** Match on `err instanceof GPUValidationError` or `err.constructor.name`. Messages change between Chrome versions.

For shader compile errors specifically, `module.getCompilationInfo()` returns `{ messages: [{ lineNum, linePos, type, message }] }` — interleave with source for readable output.

## Debug labels and groups — make captures legible

```js
const positions = device.createBuffer({ label: 'particles-positions', ... });
const gbufNormal = device.createTexture({ label: 'gbuffer-normal', ... });
const lightingPipe = device.createRenderPipeline({ label: 'lighting-deferred', ... });

encoder.pushDebugGroup('Shadow pass — cascade 0');
//   ...draw calls...
encoder.popDebugGroup();
```

Round-trip into:
- Validation error messages (`[Buffer "particles-positions"] usage doesn't include ...`).
- WebGPU Inspector tree.
- RenderDoc / PIX / Xcode timeline (when the matching `--enable-dawn-features=use_user_defined_labels_in_backend` flag is on).

Without labels, a 200-frame PIX timeline of unnamed draws is unreadable. Instrument heavily — the cost is zero in production builds (label strings are reference-counted but not transmitted to GPU during render).

## Memory leak detection

WebGPU has no built-in introspection; rely on three lenses simultaneously.

**1. `chrome://gpu` Video Memory.** Granularity per-process, not per-`GPUDevice`. Reload-test: capture at start, run scenario, return to start. Diff = leak. Reload tab to refresh values (sampled, not live).

**2. App-side allocator HUD.** Monkey-patch `device.createBuffer` / `createTexture` in dev builds:
```ts
let bufferBytes = 0;
const orig = device.createBuffer.bind(device);
device.createBuffer = (desc) => {
  const buf = orig(desc);
  bufferBytes += desc.size;
  const origDestroy = buf.destroy.bind(buf);
  buf.destroy = () => { bufferBytes -= desc.size; origDestroy(); };
  return buf;
};
```
GC cannot see GPU memory pressure — every `GPUBuffer`/`GPUTexture` must be `.destroy()`-ed when retired. Cache the live-set and dump on demand.

**3. Perfetto with `gpu.dawn`.** Reveals leaks invisible to `chrome://gpu`: transient staging buffers piling because a hot path skips `.destroy()`; pipeline-overridable specialization producing one `GPURenderPipeline` per material variant.

Common patterns:
- Render bundles holding references to bind groups whose backing buffers are recreated each frame.
- Image-decode paths re-importing the same `ImageBitmap` to a fresh texture every navigation.
- Readback pools that grow on reconfigure and never shrink.
- `device.lost` handler not destroying app-owned resources before requesting a new device.

## In-app overlays

- **Stats.js** — FPS/MS/MEM. CPU-only.
- **stats-gl** (Renaud Rohlinger) — adds GPU panel via timestamp-query feature. Pattern: `requiredFeatures: ['timestamp-query']`; pass `stats.getTimestampWrites()` as the pass descriptor's `timestampWrites`; call `stats.end(encoder)` after `pass.end()`. Three.js: `stats.init(renderer)`. drei wraps as `<StatsGl />`. (Note: stats-gl compatibility tracks WebGPURenderer changes; check three.js forum threads if it goes silent on a Three.js upgrade.)
- **r3f-perf** — R3F overlay with draw count, geometry/texture memory, shader compile times.

These are floors for catching regressions, not absolute references — use timestamp queries directly for cross-machine numbers.

## Pipeline lifecycle and warmup

WebGPU pipelines are the most expensive object you create. Compile flow: JS → Blink → IPC → GPU process → Dawn → Tint → SPIR-V/HLSL/MSL → driver JIT → native PSO. On D3D12, a single `createRenderPipeline` can take 5–50 ms; the synchronous variant blocks the whole GPU process queue and produces multi-frame hitches.

- **Never create pipelines on first draw.** Build everything at boot via `createRenderPipelineAsync` / `createComputePipelineAsync`. Promises resolve "when the pipeline can be used without any stalling."
- **Share an explicit `GPUPipelineLayout`.** `layout: 'auto'` mints a fresh `GPUBindGroupLayout` per pipeline; bind groups don't cross-pollinate; the user-agent compile cache fragments.
- **Hash and cache pipelines yourself.** Browser maintains compile cache across reloads, but it's keyed on the full descriptor including pipeline-overridable constants. Maintain `Map<hash, GPURenderPipeline>` keyed on `(shaderModuleId, vertexLayout, colorTargets, depthStencil, primitive, multisample, constants)`.
- **Warm the cache.** Render every pipeline once into a 1×1 throwaway attachment during the loading screen — forces driver to allocate descriptor heaps, root signatures, JIT bytecode before user input.
- **Wrap pipeline creation in an `'internal'` error scope.** Driver register-spill warnings come through there.

Measurement: `performance.now()` brackets around `createRenderPipelineAsync` measure only marshaling. Real driver work is in the GPU process — only Perfetto with `gpu.dawn` shows actual compile span.

## Render bundles, indirect draws, state minimization

Render bundles cache validated, native-side commands. Win when CPU-bound; lose when scene mutates per frame, when GPU-bound, or when using `importExternalTexture` (which expires at frame end). Bundle state is reset on entry/exit — set everything you need. Bind-group identity is immutable in the bundle; underlying buffers/textures are dereferenced at replay, so `writeBuffer` updates reach the bundle without a rebuild.

`drawIndirect` lets the bundle survive instance-count changes (GPU computes `instanceCount` itself).

**Pack indirect args into one buffer.** Toji measured 412 indirect draws on Chrome/D3D12: separate buffers cost ~3 ms validation per frame; one combined `INDIRECT` buffer cost ~10 µs. Chrome's backend injects a validation compute dispatch per indirect buffer (D3D12 lets shaders write `vertex_index`/`instance_index` outside bound vertex range). Coalesce.

```ts
// Layout (u32 each):
// drawIndirect:               4 u32 = 16 B  {vc, ic, fv, fi}
// drawIndexedIndirect:        5 u32 = 20 B  {idxC, ic, fIdx, baseV, fi}     ← 20-byte stride trap
// dispatchWorkgroupsIndirect: 3 u32 = 12 B  {x, y, z}
```
The 20-byte stride is the trap: `Float32Array`/`Uint32Array` views from JS must use a 20-byte stride and not the convenient 16. Mismatched strides between JS and WGSL produce silent corruption — no validation error.

State-change minimization:
- Sort draws by `(pipeline, bindGroup1, bindGroup2, vertexBuffer)`. Redundant `setBindGroup` is **not** optimized away.
- Share `GPUPipelineLayout` across pipelines that share a bind group layout — lets `setBindGroup` survive a `setPipeline` switch when the slot's layout is identical.
- Use `setBindGroup(slot, group, dynamicOffsets)` for per-instance UBO bumps. One large UBO with `minUniformBufferOffsetAlignment` (256 B default) stride; one bind group with `hasDynamicOffset: true`; thousands of objects served via offset bumps.
- Interleave vertex attributes into one buffer — ~2× throughput vs three separate buffers.

## Bind-group partitioning by frequency

Spec contract: `@group(0)` should change least frequently. Mirrors every native API.

| Group | Frequency | Contents |
|---|---|---|
| 0 | Per-frame | view/proj, time, viewport, fog camera UBO |
| 1 | Per-pass | shadow map, GBuffer textures, env map |
| 2 | Per-material | albedo/normal/MR textures, sampler, material UBO |
| 3 | Per-draw | model UBO via dynamic offset, optional skinning palette |

Define four `GPUBindGroupLayout` once, share via one `GPUPipelineLayout`, use that for every pipeline. Bind-group slot is all-or-nothing — for unused slots use a dummy bind group against a permissive layout entry.

For million-particle workloads, prefer storage buffers over UBOs for per-instance state. UBOs cap at 64 KiB on most adapters; storage buffers go to 128 MiB by default and aren't aligned to 256 B.

## Compute occupancy and memory access

Default `@workgroup_size(64, 1, 1)` — AMD wave64, NVIDIA 2-warp, Intel Xe sub-slice friendly. 2D image work `(8, 8, 1) = 64`; 3D `(4, 4, 4) = 64`. Don't exceed 256 threads/workgroup unless measured (`maxComputeInvocationsPerWorkgroup` = 256 default; larger groups reduce occupancy by reserving full register/LDS budgets).

Register pressure symptoms: timestamp delta unchanged when you halve workload; throughput drops at a specific shader variant. Cure: hoist invariants out of loops, prefer `vec4` over scalars, inline rather than indirect call. Each KB of `var<workgroup>` LDS reduces co-resident groups per SM — a 32 KB scratchpad caps you at one group/SM on most hardware. For variable work, use `dispatchWorkgroupsIndirect` (count comes from previous compute pass) — avoid CPU readback latency.

Avoid `atomicAdd` hotspots: 1M threads on one global counter serializes. Two-stage reduction (workgroup-shared atomic, then one global atomic per group) cuts contention ~64×.

**Structure-of-Arrays for compute-bound buffers.** AoS thread-i reads stress one cache line per thread; SoA coalesces consecutive threads into one transaction. 32–64× ratio. WGSL `vec3<f32>` is 16-byte aligned in storage; pad to `vec4` explicitly (use `w` for size/age/charge). `var<workgroup>` is the manual cache for tile patterns: 2D blur fetches one texel into LDS, `workgroupBarrier()`, every thread reads from LDS.

## Bottleneck triage flow

Assume in-app HUD shows per-pass timestamp deltas, DevTools Performance recording open, `chrome://gpu` confirming the right adapter.

1. **CPU or GPU bound?** rAF wall time vs Σ timestamps.
2. **Pipeline-bound?** PIX/RenderDoc capture; pipeline switches >100/frame on a viz workload is suspicious. Cure: sort by pipeline, merge variants behind pipeline-overridable constants.
3. **Vertex-bound?** GPU time scales linearly with vertex count, fragment count is small. Instancing, LOD, vertex format compression beat vertex pulling.
4. **Fill-rate / overdraw bound?** GPU time scales with output resolution; lower DPR test confirms. Front-to-back sort opaque draws (early-Z kills hidden fragments — but spec disables it if fragment shader writes `frag_depth`, calls `discard`, or uses alpha-to-coverage; per gpuweb#4878, those force late-Z). Depth pre-pass: omit `fragment` from descriptor, then render expensive opaque pipeline with `depthCompare: 'equal'`, `depthWriteEnabled: false`. Wins on shaders >~30 instructions; loses on cheap ones. Drop MSAA or switch to FXAA postprocess on desktop. For 1M-particle clouds, render to 0.5× offscreen and upscale.
5. **Bandwidth-bound (compute)?** PIX shows L1/L2 miss rates. Cure: SoA, `var<workgroup>` tiling, smaller types (`f16` if `shader-f16` exposed).
6. **Compile/load bound (first-frame hitch)?** Pipeline warmup; `createRenderPipelineAsync`; render every pipeline once into 1×1 at boot.
7. **Memory creep?** dev-build allocator HUD + `chrome://gpu`; explicit `.destroy()` on every retired buffer/texture; reuse staging buffers via size-class pool; never recreate swap chain unless canvas size or format changed.
8. **Frame pacing jitter?** Move all `mapAsync` reads outside rAF callback (they wait on unrelated fences and stall); double-buffer timestamp readback so you read frame N-2 while submitting N; never `await onSubmittedWorkDone()` in loop.

## Frame-capture recipe — the 80/20

Symptom (e.g. flickering shadow on cascade 1) →
1. WebGPU Inspector first; capture the bad frame.
2. Find the affected pass in the command tree.
3. Inspect bind group contents: are textures the right ones? Sampler the right one?
4. Inspect the shader source (live-edit if needed): is `@group/@binding` matching the bind group layout?
5. Check pipeline state: depth compare op, blend, color write mask.
6. If still nothing — RenderDoc or PIX. Look at the D3D12 root signature, the actual descriptor heap state, the resource transitions.

Most weird-rendering bugs are bind-group state errors visible at step 3. State minimization (sort by `(pipeline, bind groups)`) prevents the bug class — fewer transitions, fewer chances to bind the wrong thing.

## Frame pacing & sync

`device.queue.onSubmittedWorkDone()` returns a Promise that resolves when all currently-submitted work is done — a fence. Use sparingly (forces roundtrip through GPU process). Legitimate uses: shutting down a worker cleanly; instrumenting "GPU idle" markers for benchmarking. **Never await inside the rAF loop.** Standard rAF-driven double buffering (browser owns swap chain) is correct by default; manual triple-buffering of staging buffers prevents `mapAsync` stalls on per-frame uploads >1 MB.

Don't pair `mapAsync()` with `queue.onSubmittedWorkDone()` for the same buffer — `mapAsync` already waits on the GPU work that referenced the buffer; the extra fence adds latency without changing correctness.

## Graph-viz target (1M points/edges, 1–4 ms)

Load-bearing techniques:
- Explicit shared pipeline layouts.
- One render bundle for the static graph + indirect draw for animated culling.
- One storage buffer in SoA layout for node positions; `vec4` padded.
- Dynamic-offset per-node UBO for picking/highlight state.
- `@workgroup_size(64)` simulation passes with workgroup-shared reduction.
- Timestamp queries on every pass so the regression floor is never invisible.

Everything else is hygiene around those choices.
