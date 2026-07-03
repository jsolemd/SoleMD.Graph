---
name: three.js asset pipeline and tooling
description: glTF/GLB shipping pipeline, Draco vs Meshopt, KTX2/Basis textures, transcoder wiring, debug extensions, Next.js/Vite bundling, release validation
---

# Asset pipeline and tooling

## Asset pipeline rules

**1. GLB is the only ship format.** FBX, OBJ, USD, VRM are import formats. Convert at build time with `gltf-transform` CLI or in-browser tools (Meshamorphosis); never load FBX or OBJ in production — both lack PBR semantics, are larger, and require heavier loaders. `GLTFExporter` (r184+) supports `EXT_texture_webp` for runtime export when KTX2 is overkill — useful for editor/snapshot flows, not for production assets where KTX2 still wins.

**2. Run every GLB through a deterministic transform pipeline before publish.** Canonical order:
```
dedup → prune → instance → weld → simplify (meshoptimizer)
      → resample (animations) → quantize | meshopt
      → KTX2 textures → (draco — optional, alternative to meshopt)
```
Optimizers advertise 80–90% size reduction, but only when the *full chain* runs. Do not let artists re-export; round-trip through the pipeline.

**3. Pick Meshopt over Draco for graph-viz workloads.** Draco yields slightly smaller files but decodes on CPU with a heavy WASM blob and blocks the main thread. Meshopt streams, decodes ~5× faster, and supports vertex attribute quantization that survives GPU upload without an intermediate float buffer. Use Draco only for one-shot hero assets where size dominates first paint.

**4. Textures are 60–90% of GLB weight.** Convert every PNG/JPG to **KTX2 + Basis Universal**:
- **UASTC** for normal/data maps.
- **ETC1S** for color/albedo.
The GPU receives a transcoded BCn/ASTC/ETC2 block-compressed texture and never holds a decoded RGBA copy in VRAM. Author mip chains explicitly (cannot regenerate block-compressed mips at runtime).

**5. Pad to power-of-two only when targeting WebGL1 fallbacks.** WebGL2/WebGPU accept arbitrary sizes.

**6. Pack channels.** Metallic-roughness-occlusion (ORM) into one RGB texture per glTF spec. Stop shipping three separate maps. Albedo+alpha share one. Normal maps stay alone, two-channel (XY) reconstructed Z, encoded UASTC.

**7. Normal-map encoding rule.** Always tangent-space, Y-up convention OpenGL-style for glTF (positive Y = up). Validate after KTX2 round-trip — ETC1S destroys normal maps; UASTC is mandatory.

**8. LOD is mandatory above ~100k tris per asset.** Generate LOD0/1/2 with `gltf-transform simplify` at 0.5/0.25/0.1 ratios; switch via `THREE.LOD`. For instanced graph nodes, use `three.ez/InstancedMesh2` (per-instance frustum culling, BVH raycast, WIP LOD; requires three r159+, `bvh.js`).

**9. Cache by content hash, not filename.** Asset URLs must be checksum-addressed (already SoleMD.Graph contract). Set `Cache-Control: public, max-age=31536000, immutable` on the CDN. New revisions get new URLs; never overwrite. The only correct CDN strategy for binary 3D assets — invalidation by purge is too slow and racy for streaming loads.

## Loader patterns

**10. Always use the modular GLTFLoader, never the bundled examples copy.** `import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'` is fine in dev; in production wire it via `three-stdlib` (typed, ESM, tree-shakeable) or use Drei's `useGLTF` (does this already).

**11. Wire transcoders once, share the loader.**
```ts
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(renderer);
const draco = new DRACOLoader().setDecoderPath('/draco/');
const gltf = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder).setDRACOLoader(draco);
```
**`detectSupport(renderer)` is non-negotiable for KTX2** — picks the right transcode target (BC7/ASTC/ETC2) per device. Skipping forces RGBA fallback and erases the win.

**HDR loaders.** `HDRLoader` (`three/addons/loaders/HDRLoader.js`) is the canonical Radiance HDR/RGBE loader as of r179, replacing `RGBELoader`. `RGBMLoader` was removed entirely in the same release.

**11b. Cancel in-flight loads on route transition.** `Loader.abort()` (r179+) lets you cancel pending fetches when the user navigates away or you start a different bundle:
```ts
const controller = new AbortController();
const gltfLoader = new GLTFLoader();
gltfLoader.load(url, onLoad, onProgress, onError);
// later, on route teardown:
gltfLoader.abort();   // cancels the in-flight fetch
```
Pair this with the `IntersectionObserver` and visibility logic from `render-loop-and-lifecycle.md` — abort on `→hidden`/unmount to free network capacity.

**12. Self-host transcoder binaries; do not load from unpkg/jsdelivr.** They are WASM blobs (~200 KB Draco, ~500 KB Basis). Cross-origin fetches add CORS preflight and remove subresource integrity; ship them next to your app under a versioned path. Drei's `useGLTF` accepts a `dracoLoader` you pass in.

**13. Decode off the main thread.** Draco and Basis support workers. `KTX2Loader` already uses workers internally; for Draco call `setWorkerLimit(navigator.hardwareConcurrency || 2)`. Never decode large GLBs on the render thread — stalls the rAF loop and tanks frame budget.

**14. Suspense boundaries per asset, not per scene.** In R3F + Drei, each `useGLTF('url')` is a Suspense boundary. Wrap individual heavy assets in their own `<Suspense fallback={...}>` so a 30 MB hero doesn't block 200 lightweight node meshes. Call `useGLTF.preload(url)` at route entry to start fetch before paint.

**15. Progressive streaming requires an explicit policy.** glTF 2.0 has no built-in streaming. Three patterns:
- (a) split scene into N small GLBs and load on visibility (graph-viz friendly);
- (b) Needle Cloud's automatic LOD lazy-loading;
- (c) custom range-request loader that pulls glTF JSON header first, then bins on demand.
Avoid 100 MB monolithic GLBs — they defeat HTTP/2 multiplexing.

**16. Dispose deterministically.** `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, walk the scene with `scene.traverse`. The GLTFLoader does not own the result; once you `scene.remove(gltf.scene)`, GPU resources leak until disposed. The single most common production bug surfaced by Three.js DevTools' memory panel.

## Debugging and profiling

**17. Three browser tools, three jobs.**
- **Three.js DevTools** (Chrome extension, alpha) — scene graph + property edit + render stats. Requires the page to register the renderer with global devtools hooks; not automatic.
- **Needle Inspector** (Chrome extension) — auto-detects three.js / R3F / Threlte / A-Frame / Spline / Needle scenes with no registration, hierarchy tree, in-page property edit, AI-assisted introspection. **Use this first for unfamiliar pages.**
- **Spector.js** (Chrome extension or NPM) — frame capture: every WebGL command, bound state, shader source, FBO chain, draw call. Use when "scene looks wrong" — shows actual GL state. **WebGL only — does not work on the WebGPU path.**

**18. Stats.js panels: 0=FPS, 1=ms, 2=MB.** `stats.showPanel(0)`. Wrap render with `stats.begin(); render(); stats.end();`. The MB panel only works in Chrome (`performance.memory`). For per-pass GPU timing use **stats-gl** (de-facto upgrade) using `EXT_disjoint_timer_query_webgl2`.

**19. WebGPU debug.** Spector has no first-class WebGPU equivalent. For WebGPU debug use Chrome `chrome://gpu`, the WebGPU Inspector extension, and `GPUDevice.pushErrorScope`. Three.js WebGPURenderer surfaces shader errors via console; turn them on with `renderer.debug.checkShaderErrors = true`. (See `/webgpu/references/performance-and-profiling.md` for full WebGPU debug tooling.)

**20. Inspect GLBs without booting the app.** **GLTF/GLB Viewer for VS Code** (OHZI) opens `.gltf`/`.glb` directly with DRACO + KTX2 support, hierarchy panel, animation playback, normal/origin debug, texture export, full stats. Fastest triage path for "is the asset broken or is my loader broken?" — bisects asset vs runtime in seconds.

**21. three-mesh-bvh for raycast/cull at scale.** Standard Three.js `Raycaster` is O(n) over triangles. Build a BVH on geometry once (`geometry.boundsTree = new MeshBVH(geometry)`) and override `raycast`. Combined with InstancedMesh2's per-instance BVH, hit-testing 100k+ instances stays under 1 ms.

**22. Profile, don't guess.** Chrome Performance tab → record 5 s → look for long tasks > 50 ms (loader decode), forced layout in `requestAnimationFrame` (DOM overlay on canvas), GC sawtooth (allocate-in-loop). Pair with Spector frame capture to attribute GPU cost.

## Bundling/integration with Next.js

**23. Three.js is ESM-only.** Import named exports: `import { Mesh, Scene } from 'three'` — never `import * as THREE`, which defeats tree-shaking and bloats bundles by 600+ KB. Drei is split into per-component entries; `import { useGLTF } from '@react-three/drei'` already pulls only what you use.

**24. TypeScript: use `three`'s built-in types.** Since r150+, `three` ships its own `.d.ts` — do **not** install `@types/three` (deprecated, conflicts). Example loaders import from `three/examples/jsm/...` directly, types resolve. For non-typed addons use `three-stdlib`.

**25. Next.js App Router: client-only.** All Three.js code goes in a `'use client'` component. SSR will throw on `window`/`document`. Use `next/dynamic` with `ssr: false` for the canvas wrapper:
```ts
const Scene = dynamic(() => import('./Scene'), { ssr: false });
```
The only correct pattern for R3F's `<Canvas>` — it touches the DOM during construction.

**26. Asset paths in Next.js: `/public` is the only stable URL root.** Place transcoder WASM at `public/draco/` and `public/basis/`, reference as `/draco/` and `/basis/`. Do **not** import GLBs through `import url from './model.glb'` — works in Vite, breaks in Next's Webpack/Turbopack defaults. Either put GLBs in `/public` or serve from your CDN.

**27. Vite: use `?url` for assets, `?raw` for shaders.** `import modelUrl from './x.glb?url'` returns a hashed URL; `import frag from './shader.glsl?raw'` returns source string. Community `vite-plugin-glsl` adds `#include` and minification. `tsl-uniform-ui-vite-plugin` auto-generates GUI controls from TSL uniforms during dev — useful while bringing up shaders.

**28. Workers for OffscreenCanvas where supported.** Pattern:
```ts
const worker = new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module' });
```
Transfer canvas via `canvas.transferControlToOffscreen()`, run the entire renderer in the worker. Frees main thread for DOM, panel queries, user input — critical when overlaying React UI on a heavy graph canvas. Falls back to main-thread render where unsupported.

**29. Bundle audit checklist.** `next build` → check `.next/analyze` (with `@next/bundle-analyzer`). Budget: three core ~150 KB gzip, GLTFLoader + transcoders ~30 KB JS (WASM lazy), Drei tree-shaken ~20–60 KB depending on imports. Set CI check on `bundle-stats`. Lazy-load the canvas chunk so the marketing/overlay shell paints first.

**30. CDN headers.** Brotli on JSON/JS, no recompression on `.glb`/`.ktx2`/`.drc` (already compressed — gzip wastes CPU and grows bytes). `Accept-Ranges: bytes` enabled so `KTX2Loader` and progressive GLB loaders can range-fetch.

**31. Validate every release.** Open the published GLB in the VS Code viewer (geometry/material counts), capture one frame in Spector (draw-call delta), run Stats.js for 60 s on a low-end laptop (sustained 60 fps target), watch DevTools memory panel for steady state after dispose. If any regress, do not ship.
