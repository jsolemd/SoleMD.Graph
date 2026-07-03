---
name: WebGPU browser and platform reality
description: Real per-vendor and per-browser support — what each backend can do, what Compatibility Mode actually costs, where the matrix is broken today, and how to ship across it. May 2026.
---

# Browser and platform reality (May 2026)

## Browser support matrix

`navigator.gpu` is `undefined` on insecure origins, in `iframe`s without permissions, and on browsers with no shipping WebGPU. Below is what is enabled by default in the latest stable channels.

| Browser | Windows | macOS | Linux | Android | iOS / iPadOS | visionOS |
|---|---|---|---|---|---|---|
| Chrome / Edge (148) | Stable since 113 / D3D12 | Stable since 113 / Metal | Intel Gen12+ Vulkan since 144; NVIDIA + Wayland (driver 535.183.01+) since 147; AMD/X11 still flag | Stable since 121 / Vulkan 1.1 (Qualcomm/ARM/Intel, Android 12+); Imagination since 139 (Android 16+); compat mode (GLES 3.1) origin trial through 145 | n/a | n/a |
| Safari 26 / WebKit | n/a | Stable / Metal (Apple + Intel; Tahoe 26+) | n/a | n/a | Stable iOS 26 / iPadOS 26 | Stable visionOS 26 (HDR canvas + WebXR/WebGPU since 26.2) |
| Firefox 147 | Stable (141+) / D3D12 via wgpu | Stable: Apple Silicon all macOS (147+); first shipped on Tahoe Apple Silicon (145, Nov 2025) | Nightly only; target stable H2 2026 | Nightly only; target stable H2 2026 | n/a (iOS uses WKWebView) | n/a |
| Samsung Internet 24 | n/a | n/a | n/a | Stable | n/a | n/a |
| WKWebView | n/a | macOS 26+ | n/a | n/a | iOS 26+ (verify per host app) | visionOS 26+ |

**caniuse global:** ~83% as of May 2026, but the long tail is concentrated. Hard zeros: iOS pre-26, Firefox Linux/Android, AMD Linux X11. Long-tail Compat-only: ~15% Android (no Vulkan 1.1), older Intel iGPU on Windows.

**Origin trial / flags (Chrome through 148):**
- `featureLevel: 'compatibility'` — origin trial through Chrome 145 (April 2026), then default-on. Targets ~15% of Android + older Intel Windows.
- `chromium-experimental-multi-draw-indirect` — flag-only, do NOT ship on it.
- `WebGPUMapSyncOnWorkers` — `mapSync()` for buffers in workers, behind `--enable-features=WebGPUMapSyncOnWorkers` (Chrome 145 experimental).

## Backend translation — what WebGPU actually runs on

The WebGPU spec lives above explicit graphics APIs. Each browser+platform pair picks one.

| Platform | Backend | Browser support |
|---|---|---|
| Windows + dGPU (RTX, RX) | **D3D12** via Dawn (Chrome) / wgpu (Firefox) | Chrome 113+, Firefox 141+ |
| Windows + older Intel iGPU (no Vulkan 1.1) | **D3D11** via Compatibility Mode (Chrome only, in OT) | Chrome 145+ when ships |
| macOS / iOS / iPadOS / visionOS | **Metal 2.1+ (macOS) / 2.3+ (iOS)** | Safari 26 + Chrome 113 + Firefox 145 (Apple Silicon) |
| Linux desktop | **Vulkan 1.1+** | Chrome 144+ Intel Gen12; 147+ NVIDIA Wayland |
| Android (modern) | **Vulkan 1.1+** | Chrome 121+, Samsung 24+ |
| Android (older / no Vk 1.1) | **OpenGL ES 3.1** via Compat Mode | Chrome 145+ |
| ChromeOS | Vulkan or D3D12 (Borealis) | Chrome 113+ |
| Headless / CI | SwiftShader (CPU-Vulkan) | Chrome with `forceFallbackAdapter: true` |

Architecturally this means: **most validation, error-message, and limit differences trace to backend, not browser**. Chrome on Windows D3D12 and Firefox on Windows D3D12 share more behavior than Chrome-D3D12 vs Chrome-Metal.

## Per-vendor reality — the deep dive

### Apple (M1 → M5, A12 → A19, Mac1 → Mac2)
- **Subgroup width: 32, fixed across every shipping Apple Silicon GPU** (M1 G13 through M5 G18; A12 onward). The Metal `threads_per_simdgroup` is invariant. Safe to assume 32 for kernel design.
- **`subgroupMinSize` / `subgroupMaxSize`: both 32** on Apple. No special-casing needed.
- **`shader-f16`: yes**, used aggressively. Many WebKit-shipped shaders are f16-first. Quad ops (`quadSwap*`) supported on Apple7+; SIMD ops (`subgroupBallot`, `subgroupBroadcast`) on Apple7+. Apple6 (early A12) has SIMD reduction only — pre-M1.
- **Subgroup ops in Safari 26: shipped**. The `subgroup_id` / `num_subgroups` language extension lags — gate on `wgslLanguageFeatures.has('subgroup_id')` separately from `device.features.has('subgroups')`.
- **Tile memory: 32–256 KiB visible to fragment** depending on chip. MSAA + MRT essentially free here; this is why Metal-native engines lean hard on tile shaders. WebGPU exposes this through the new **transient attachment** flag (`GPUTextureUsage.TRANSIENT_ATTACHMENT`, Chrome 146+) — set it on intra-pass G-buffer and depth-prepass textures and the Metal backend keeps them in tile.
- **Texture compression: ASTC + ETC2 yes; BC family NO**. No BC1/BC3/BC7 on any Apple GPU. Pipelines that want to ship one BC asset are wrong on Apple — must transcode KTX2 to ASTC at load.
- **Buffer/texture limits: variable.** iPhone 6-class hardware caps `maxBufferSize` near 256 MiB; iPad Pro M4 reaches ~993 MiB in Safari. Always read `device.limits` per session — never assume desktop limits on iOS.
- **`atomicMin` / `atomicMax` on f32: supported** in recent OS releases (macOS 14.4+, iOS 17.4+).
- **Known live issue:** Emscripten-compiled WebGPU apps device-lost on first frame in Safari 26 / iOS 26 (imgui #9103). Recovery loop must not synchronously re-enter.

### NVIDIA (GTX 10 / 16 / 20 / 30 / 40 / 50)
- **Subgroup width: 32 (warp).** Fixed across every consumer GPU since G80 (2006). `subgroupMinSize === subgroupMaxSize === 32`.
- **`shader-f16`: yes on Turing (RTX 20) and later**; partial on Pascal/Volta. Tensor cores accelerate f16 matrix-multiply paths but WebGPU exposes only DP4a today.
- **`packed_4x8_integer_dot_product` (DP4a, `dot4U8Packed` / `dot4I8Packed`): hardware on Pascal+** — every GTX 10-series and later. Big perf win for int8-quantized inference.
- **Compute throughput: best of any vendor.** Atomics on shared memory and global memory both fast. Cubemap arrays supported.
- **Linux Wayland: Chrome 147+** with proprietary driver 535.183.01 or later. Wayland-only — X11 still flagged.
- **f64 on consumer cards: yes but slow** (1/32 ratio); WebGPU has no f64 anyway.

### AMD (RX 5000 / 6000 / 7000 / 8000; Vega; older GCN)
- **Subgroup width: 32 (RDNA wave32) or 64 (legacy GCN, optional RDNA wave64).** Driver picks per-shader. WebGPU exposes a *range* via `subgroupMinSize`/`subgroupMaxSize` — Mesa-RADV typically reports 32–64 on RDNA. **Don't hard-code 32 on AMD** like you can on NVIDIA/Apple.
- **`shader-f16`: yes on RDNA1+ (RX 5000 series and later)**; Vega "Rapid Packed Math" exposes packed f16 mul-add but WebGPU surface is identical.
- **DP4a: Vega 7nm (Radeon VII), RDNA2 (RX 6000) and later** per AMD's own docs — older RX 5000 (RDNA1) is missing.
- **Linux X11: still unstable in Chrome 148.** Many users get a software adapter or `null`. Production frontend must keep WebGL2 fallback for AMD/Linux.
- **Driver caveat:** Mesa-RADV ahead of AMDVLK on most distros; user driver choice changes feature surface.

### Intel (UHD 6xx; Iris Xe; Arc A; Arc B)
- **Subgroup width: variable 8 / 16 / 32 by EU and dispatch.** This is real — kernels assuming 32 will fail on older Gen9. Always read `subgroupMinSize` / `subgroupMaxSize` on Intel.
- **`shader-f16`: Iris Xe (Gen12) and later**. UHD 620 (Skylake/Kaby Lake) lacks it.
- **DP4a: Gen11 (Ice Lake) and later** per Intel; pre-Ice Lake polyfills via Mesa.
- **Older UHD 620 / 630 on Windows: Vulkan 1.1 capable, but driver crashes common.** Chrome routes some of these to Compatibility Mode (D3D11) when ships.
- **Linux Mesa Anvil (Gen12+): Chrome 144+ enables this**; older Iris/Anvil in flag.
- **Arc (Battlemage / Alchemist) on Windows D3D12: production-ready.** XMX matrix engines exist but unexposed in WebGPU.

### Qualcomm Adreno (5xx → 8xx, mobile)
- **Subgroup width: 64 or 128**. Adreno 6xx typically 64; Adreno 7xx/8xx report 64–128 range. Read both sizes; don't assume 32.
- **`shader-f16`: NOT SUPPORTED on any current Qualcomm device** (gpuweb #5006). The driver lacks `uniformAndStorageBuffer16BitAccess` — mandatory for the WebGPU `shader-f16` feature gate. AI inference paths that need f16 input/output buffers don't run on Qualcomm. Workaround: f32 inputs, f16 in shader-internal arithmetic only.
- **Subgroup ops: shipped only on recent Adreno** (Adreno 7xx in Android 14+). Don't gate on `device.features.has('subgroups')` without a fallback path.
- **Tile-based deferred renderer.** MSAA + MRT cheap. Use transient attachments aggressively. Memory budget is small — typically 4 GiB per app, less per WebView; tab switches can evict.
- **Galaxy S24/S25 issue:** community reports of `shader-f16` requirement excluding all Snapdragon 8 Gen 3 / Gen 4 from running Transformers.js f16 models. This is the dominant Android phone — plan accordingly.

### ARM Mali (Bifrost G31 → G77; Valhall G78+; CSF G610+)
- **Subgroup width:**
  - Bifrost G71/G72: warp size **4** (4-wide scalar SIMD).
  - Bifrost G76: warp size **8** (two 4-wide units).
  - Valhall G77+: warp size **16**.
  - **This is the lowest in the matrix.** Algorithms tuned for warp32 are wrong on Mali; reduction trees need full barriers between subgroup steps where you'd skip on NVIDIA.
- **`shader-f16`: Valhall (G77, G610) and later**. Bifrost lacks 16-bit storage on most drivers.
- **Subgroup ops: shipped on Valhall in 2025**, partial on Bifrost. Kernel param choice critical.
- **Tile-based.** Same MSAA / transient-attachment story as Adreno. CSF (G610+) accelerates draw-indirect heavily.

### Imagination PowerVR (8XT, 9XT, A-series, B-series, D-series)
- **TBDR (Tile-Based Deferred Rendering)** — visibility resolved before pixel shading. MSAA effectively free; deep transient G-buffers cheap.
- **WebGPU support added Chrome 139 (Aug 2025), Android 16+ devices only**. Reach is limited (mostly older MediaTek SoCs and embedded).
- **Subgroup support: A-series and later** (older PowerVR Series-9 is GLES-only, falls to Compat Mode if it gets WebGPU at all).
- Treat as an unproven platform; ship core, test on a real device before relying on any Imagination-specific tile behavior.

### Software fallbacks (SwiftShader / Apple Software / LLVMpipe)
- Headless / CI / opted-in. Request via `requestAdapter({ forceFallbackAdapter: true })`.
- **10–100× slower** than hardware. Useful for: deterministic rendering tests, golden-image diffing, security audits, environments without GPU.
- **Chrome status (May 2026): partial.** Spec defines `forceFallbackAdapter`, Chrome accepts it, returns SwiftShader on Linux/Windows; Mac returns `null` (no Apple Software fallback yet).
- **WebGL fallback to SwiftShader was deprecated in Chrome 130 and removed in 138.** WebGPU `forceFallbackAdapter` is the correct replacement; do not expect WebGL2 to silently fall back to software anymore.

## Compatibility Mode — what it actually costs

Targets devices without Vulkan 1.1 / Metal 2 / D3D12: ~15% of Android in field, ~31% of Chrome-Windows users on legacy Intel iGPU. The implementation translates a restricted WebGPU subset to **OpenGL ES 3.1** (Android, ChromeOS) or **Direct3D 11** (Windows). Restrictions exist because GLES/D3D11 lack things WebGPU otherwise assumes.

**Activation:**
```ts
const adapter = await navigator.gpu.requestAdapter({
  featureLevel: 'compatibility',     // 'core' | 'compatibility'
  powerPreference: 'high-performance',
});
```
The legacy `compatibilityMode: true` flag is deprecated; use `featureLevel`.

**Major restrictions (24 in spec; the ones that bite):**
- No cubemap arrays.
- No texture format reinterpretation via `viewFormats` (must equal base format).
- No `bgra8unorm-srgb`.
- No `@builtin(sample_mask)` / `@builtin(sample_index)`.
- No `linear` interpolation; only `flat` or `perspective`.
- No fine derivatives (`dpdxFine`, `dpdyFine`, `fwidthFine`).
- No two-component RG storage textures.
- No `textureLoad` on depth textures.
- Bind group must reference whole array layers, not subsets.
- Uniform color blending across all attachments (no per-attachment blend).
- Depth bias clamp must be zero.
- No multisample texture copies.
- No multisampled `rgba16float` / `r32float` / integer textures.
- `vertex_index` and `instance_index` count against `maxVertexAttributes`.

**Limit drops vs core:**

| Limit | Compat | Core |
|---|---|---|
| `maxColorAttachments` | 4 | 8 |
| `maxComputeInvocationsPerWorkgroup` | 128 | 256 |
| `maxComputeWorkgroupSizeX/Y` | 128 | 256 |
| `maxTextureDimension1D/2D` | 4096 | 8192 |
| `maxUniformBufferBindingSize` | 16 KiB | 64 KiB |
| `maxInterStageShaderVariables` | 15 | 16 |
| `maxStorageBuffersInVertexStage` | 0 | unlimited |
| `maxStorageTexturesInVertexStage` | 0 | unlimited |
| `maxStorageBuffersInFragmentStage` | 4 | unlimited |
| `maxStorageTexturesInFragmentStage` | 4 | unlimited |

**Lifting back to core where adapter supports it:**
```ts
const required: GPUFeatureName[] = [];
if (adapter.features.has('core-features-and-limits')) {
  required.push('core-features-and-limits');
}
const device = await adapter.requestDevice({ requiredFeatures: required });
```
If the adapter exposes `core-features-and-limits`, it's a compat-default adapter that *can* lift restrictions on the device. Request the feature and you get core surface.

**Strategy:** Design for core. Branch around the missing surface; do not maintain two parallel renderers. For 1M-particle compute on the orb runtime, the 128-invocation cap means using `@workgroup_size(64)` (default) and chunking dispatch counts — no code change needed.

## `forceFallbackAdapter` and adapter-info changes

- **`isFallbackAdapter` moved from `GPUAdapter` to `GPUAdapterInfo`** (gpuweb PR #5099, March 2025; Chrome shipped move in 140). Old `adapter.isFallbackAdapter` is gone — read `adapter.info.isFallbackAdapter`. Reachable from `device.adapterInfo.isFallbackAdapter` too, useful for libraries handed a `GPUDevice` they didn't create. **Do not** parse `adapter.info.architecture` strings (`"swiftshader"`, `"llvmpipe"`, `"unknown"`) as a fallback heuristic — they vary across browsers and OS releases.
- `GPUAdapterInfo` is intentionally redacted for fingerprinting: `vendor` (lowercase string like `"apple"`, `"nvidia"`, `"qualcomm"`), `architecture` (family like `"apple-7"`, `"turing"`, `"adreno-650"`), `device` (often empty), `description` (often empty), `backend` (in Chrome — `"vulkan"` / `"metal"` / `"d3d12"` / `"opengl"`), `subgroupMinSize`, `subgroupMaxSize`, `isFallbackAdapter`. **No driver version, no full GPU model name** in any browser; use only for telemetry, never for product gating.

## Cross-origin isolation, COOP/COEP, CSP

WebGPU itself does **not** require cross-origin isolation. But you almost always want COI alongside it:

- **Required for `SharedArrayBuffer`**, which you need to stage compute buffers from workers without round-tripping through `postMessage` copies.
- **Required for unquantized `performance.now()`** — without COI, Chrome buckets to ~100 µs and Safari coarsens further. Subframe-level GPU profiling needs COI.
- Headers: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless` if you need to embed third-party iframes that don't send CORP headers).

**Trade-offs:**
- COI breaks third-party iframes that aren't COEP-compatible (Stripe Elements pre-2024, classic Google Maps, Disqus). Use `credentialless` mode to keep them embeddable but stripped of cookies, or move payments/maps off the COI surface.

**CSP:**
- Blob-URL workers (DuckDB-WASM, KTX2 transcoders) need `worker-src blob:`.
- Lazy-loaded WebAssembly modules need `script-src 'wasm-unsafe-eval'`.
- Without these, async compute imports silently fail with no console message in some browsers.

## Mobile thermal + memory reality

- **Memory budget per tab:** ~4 GiB on iOS Safari M-class iPad; ~1–2 GiB on Android Chrome flagship; <1 GiB on low-end Android. WebKit kills tabs aggressively when system memory falls below 1.5 GiB free.
- **Thermal throttling:** kicks in at ~2–5 min sustained 100% GPU. Frame-time can drop 50% silently. Detect via `timestamp-query` rolling average; downgrade DPR or kernel size adaptively.
- **Subgroup variability:** mobile vendors vary 16 (Mali) to 128 (Adreno). Always read `adapter.info.subgroupMinSize/MaxSize` before committing to a kernel size. Workgroup `(64,1,1)` is the safest baseline.
- **Touch latency:** Android Chrome adds 50–100 ms input latency vs desktop. Don't benchmark interaction loops on phone vs laptop directly.
- **Device-lost on tab background:** iOS will pause render queue; Android often keeps it running but throttled. Either way, code defensively: re-check `device.lost` on visibility change.

## Tab visibility, queue suspension, device-lost causes

- Tab background → `requestAnimationFrame` drops to ~1 Hz; queue may pause. Check `document.visibilityState`.
- Hidden long enough → some browsers proactively `device.destroy()` the GPU device to reclaim memory. Wire `device.lost` and rebuild on visibility return.
- GPU process recycle (Chrome's GPU sandbox restart) → all WebGPU devices in the process lost simultaneously, `reason: 'unknown'`. Wait at least 250 ms before re-requesting.
- **Chrome enforces a domain-block after 2 GPU-process crashes within 2 minutes** (and a global block after 3). Cap reinit attempts at 2; surface a reload prompt rather than spin retries.
- Driver hang (rare on desktop, common on mid-tier Android) → `device.lost` with no message. Same recovery loop, fresh adapter.

## Headless and CI

- **Chrome `--headless=new --enable-features=Vulkan`** works on Linux with Mesa drivers and on Windows with D3D12 hardware. Reference image diffing for visual regression.
- **`forceFallbackAdapter: true`** for fully deterministic rendering across hardware (use SwiftShader as the golden). Slow but identical between runs.
- **GitHub Actions:** Linux runners have Mesa LLVMpipe; works for SwiftShader/LLVMpipe paths. macOS runners have a real GPU but Apple Software fallback unavailable in current Chrome.

## HDR and wide-color reality

- `colorSpace: 'display-p3'` + `toneMapping: { mode: 'extended' }` works on Apple displays and recent calibrated Android/Windows panels. Chrome 129+ shipped tone-mapping; Safari 26 has it on HDR-capable Macs and visionOS 26.2.
- `rec2100-hlg` and `rec2100-pq` are still proposals — not in Chrome canvas configure as of 148. For HDR canvas today, stick to `display-p3` + `extended` tone-mapping with `rgba16float` swapchain.
- visionOS 26.2 (Dec 2025) added HDR canvas + WebXR/WebGPU support — the only mainstream platform shipping all three together.

## Cross-link contract

- **`wgsl.md`**: per-vendor WGSL extension support (`shader-f16`, `subgroups`, DP4a, `linear_indexing`, `subgroup_id`, `uniform_buffer_standard_layout`, `texture_and_sampler_let`, derivatives).
- **`api-fundamentals.md`**: `requestAdapter` / `requestDevice` plumbing, `forceFallbackAdapter`, `featureLevel`, `requiredFeatures`/`requiredLimits` patterns.
- **`compute-fundamentals.md`**: subgroup-width-aware kernel design, workgroup sizing per vendor, transient attachment usage.
- **`performance-and-profiling.md`**: thermal-throttle detection, timestamp-query precision.
- **`buffer-resources.md`**: KTX2 + Basis transcoder fan-out into BC vs ASTC vs ETC2 by adapter feature flags.

## Quick rules — one screen

1. Detect: `'gpu' in navigator` → `requestAdapter()` non-null → `requestDevice()` resolves → wait one frame, no `device.lost`. Earlier than this is "unsupported."
2. **Read `adapter.info.subgroupMinSize/MaxSize` before choosing kernel parameters.** NVIDIA/Apple are 32; AMD is 32 or 64; Intel 8/16/32; Qualcomm 64–128; Mali 4/8/16. Don't hard-code.
3. Gate every code path on `device.features.has(...)` — never on `adapter.features.has(...)` (adapter is superset).
4. Compatibility Mode: opt-in only for old-Android reach; design for core, branch around the dropped surface.
5. **`shader-f16` is missing on every Qualcomm device** — your AI inference path needs an f32-input fallback for the dominant Android phone.
6. Ship one KTX2 asset; transcode at load. **No BC support on Apple, no BC on mobile, no ETC2/ASTC on x86 desktop.**
7. Wire `device.lost` and `uncapturederror` before the first submit. Cap reinit attempts at 2 in 2 minutes (Chrome's domain-block window).
8. `isFallbackAdapter` lives on `adapter.info`, not on `adapter`. Never parse architecture strings.
9. COI (`COOP: same-origin` + `COEP: require-corp`) for SharedArrayBuffer + unquantized timers; use `credentialless` if you embed third-party.
10. Telemetry payload is fingerprintable. Hash + bucket `vendor`/`architecture`/`backend`/`features`/limits before shipping to analytics.
