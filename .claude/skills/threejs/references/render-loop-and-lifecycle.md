---
name: three.js render loop, scene graph, and lifecycle
description: rAF, on-demand rendering, scene-graph hygiene, cameras, controls, dispose, R3F integration, and the 16 most common mistakes
---

# Render loop, scene graph, and lifecycle

## Render loop architecture

**Rule: never call `renderer.render()` from arbitrary code paths. There is exactly one call site, gated by `requestAnimationFrame`.**
Why: multiple callers cause double-rendering, torn frames, and break occlusion-query/post-processing pipelines. It also makes it impossible to instrument FPS or to switch to on-demand rendering later.
```js
const timer = new THREE.Timer(); // THREE.Clock is deprecated as of r182
let raf = 0;
const tick = () => {
  timer.update();
  const dt = timer.getDelta();
  update(dt);
  renderer.render(scene, camera);
  raf = requestAnimationFrame(tick);
};
raf = requestAnimationFrame(tick);
// teardown: cancelAnimationFrame(raf);
```
`THREE.Timer` (r163+, replaces `Clock` in r182) handles the elapsed-time and delta accounting more cleanly. Inside R3F's `useFrame`, the `state.clock` and the `delta` argument are the canonical sources — don't construct your own. Plain `performance.now()` deltas are fine for ad-hoc instrumentation but should not feed the same value into multiple consumers (mixers, particles, controls); pick a single owner.

**Rule: prefer on-demand rendering for static or mostly-static scenes — render only when the world changed.**
Why: a graph-viz app is idle most of the time. A 60 Hz forced loop on an idle canvas burns 5–15% CPU and pegs the GPU's render block, blocking React paints. R3F formalizes this as `frameloop="demand"` plus `invalidate()`.
```js
let dirty = true;
const requestRender = () => { dirty = true; };
controls.addEventListener('change', requestRender);
new ResizeObserver(requestRender).observe(canvas);

const tick = () => {
  if (dirty) { renderer.render(scene, camera); dirty = false; }
  requestAnimationFrame(tick);
};
```
R3F: `<Canvas frameloop="demand">` then `useThree(s => s.invalidate)()` after any mutation.

**Rule: separate simulation from rendering. Use a fixed timestep accumulator for physics/animation, and interpolate at draw time.**
Why: rAF cadence is variable (60/120/144 Hz, throttled in background tabs). If `update(dt)` integrates physics with raw `dt`, behavior is non-deterministic and explodes when the tab regains focus after a 4-second `dt`. Clamp `dt` and accumulate.
```js
const FIXED = 1 / 60;
let acc = 0;
const tick = () => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.1); // clamp tab-blur catch-up
  acc += dt;
  while (acc >= FIXED) { stepSim(FIXED); acc -= FIXED; }
  const alpha = acc / FIXED;
  interpolate(alpha);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
};
```

**Rule: always drive deltas with a single `THREE.Timer`, not `performance.now()` deltas computed ad-hoc.**
Why: every consumer (mixer, controls, shaders, particles) must agree on the same `dt`. Mixed time bases drift visibly under DPR or framerate change. `timer.getDelta()` returns time since the last `update()` — calling it from two consumers without re-`update()`ing zeros the second consumer. Single owner.

## Scene-graph organization

**Rule: group by lifetime and by update frequency, not by visual category.**
Three.js walks the graph every frame for matrix updates. Static decoration that lives forever should live under a parent with `matrixAutoUpdate=false` and `updateMatrixWorld()` called once. Dynamic graph nodes go under a separate `Group` you can swap, dispose, and re-attach without touching neighbors.
```js
const staticRoot = new THREE.Group(); staticRoot.matrixAutoUpdate = false;
const dynamicRoot = new THREE.Group();
scene.add(staticRoot, dynamicRoot);
staticRoot.add(grid, axes); staticRoot.updateMatrixWorld(true);
```

**Rule: collapse one-off `Mesh` per node into `InstancedMesh` (or `InstancedMesh2`/`three-ez`) once node count exceeds ~1k.**
Each `Mesh` is one draw call and one matrix update. A 50k-node graph as individual meshes is unviable; as `InstancedMesh` it's one draw. `agargaro/instanced-mesh` (InstancedMesh2) adds per-instance frustum culling, BVH raycast, and LOD on top — required for ≥10k.

**Rule: use `Layers` to partition raycast targets, post-pass selections, and helper visibility — never `visible=false` for that.**
`visible=false` still costs matrix updates and skips children too aggressively. Layers participate in camera/raycaster filtering without graph mutation.

**Rule: cap `Object3D` depth.** Matrix propagation is O(depth × children). Flatten where possible.

## Camera setup

**Rule: choose perspective for spatial intuition, orthographic for technical/2.5D and graph layouts; never let near/far span more than ~10⁴.**
Why: depth-buffer precision is logarithmic; `near=0.001, far=10000` produces z-fighting at midrange. Pick the smallest `near` and largest `far` the scene actually needs. For a graph viewer, `near=0.1, far=5000` is typical.
Three options when the dynamic range is unavoidable:
1. **Reversed depth buffer** (r179+) — set `renderer.reverseDepthBuffer = true`. Floats concentrate precision near 1.0, so reversing the depth assignment redistributes precision linearly across the frustum. This is the modern fix and replaces most uses of `logarithmicDepthBuffer`.
2. **`logarithmicDepthBuffer: true`** — older fix; costs a fragment-shader op per pixel.
3. **Tighten the frustum** — usually still cheaper than either.
Prefer reversed depth on WebGPU and modern WebGL2 targets. Fall back to logarithmic depth only if the target browser stack lacks reversed-depth support.

**Rule: tune FOV to the canvas aspect, not to a fixed 75°.**
75° is a default, not a recommendation. Dense info displays: 35–50° to reduce edge distortion. Immersive scenes: 60–75°. Update `camera.aspect` and `camera.updateProjectionMatrix()` on every resize.

**Rule: dolly-zoom (vertigo) requires synchronously varying FOV and dolly distance such that the framed object's screen size is constant.**
```js
const targetSize = 2 * Math.tan((fov0 * Math.PI / 360)) * dist0;
camera.fov = 2 * Math.atan(targetSize / (2 * dist)) * 180 / Math.PI;
camera.updateProjectionMatrix();
```

## Controls

**Rule: `OrbitControls` requires `controls.update()` only when `enableDamping` or `autoRotate` are on. Otherwise drive renders from its `change` event.** Calling `update()` every frame defeats on-demand rendering. Wire `controls.addEventListener('change', invalidate)`.

**Rule: for graph visualization, customize over `OrbitControls` rather than `TrackballControls`.** TrackballControls has no concept of an up-vector; orientation drifts. Override OrbitControls's azimuth/polar limits — don't switch class.

**Rule: never instantiate controls without passing the actual canvas element.** `new OrbitControls(camera, renderer.domElement)` — passing `document` or `window` breaks pointer capture and causes scroll-jacking outside the canvas.

## Animation systems

**Rule: animation belongs in `update(dt)`, not in `setTimeout`s or React effects.** Any timer-driven mutation desyncs from the render and shows visible jitter at non-60 Hz refresh rates.

**Rule: use `AnimationMixer` for skeletal/morph clip playback; use Theatre.js (or GSAP) for art-directed timelines; never mix the two on the same target.** Both write transforms; the last writer wins per frame and produces flicker. Pick one owner per channel.

**Rule: tab-blur freezes rAF; on `visibilitychange→hidden` cancel the loop and on `→visible` reset the timer before resuming.**
```js
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAnimationFrame(raf);
  else { timer.update(); timer.getDelta(); raf = requestAnimationFrame(tick); } // discard stale dt
});
```

## Resize / DPR

**Rule: use `ResizeObserver` on the canvas's parent, not `window.resize`.** Layout-driven canvas resizes (sidebars opening, devtools toggling, container reflow) don't fire `window.resize`. `ResizeObserver` does. One observer per canvas.
```js
const ro = new ResizeObserver(([e]) => {
  const { width, height } = e.contentRect;
  const dpr = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false); // false = don't write CSS
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  invalidate();
});
ro.observe(canvas.parentElement);
```

**Rule: cap DPR at 2.** Beyond that the GPU cost (×4) yields no perceptible gain on graph nodes. This is one of the highest-leverage single changes for mobile FPS.

## Pointer / raycasting

**Rule: do not raycast every pointermove against the full scene.** Either:
- use `Layers` to scope `raycaster.layers.set(N)`,
- pre-build a BVH on instance positions (`three-mesh-bvh`, or InstancedMesh2's BVH),
- or use GPU picking (render IDs to an offscreen target, read 1px).

A 10k-mesh raycast at 120 Hz pointer rate is 1.2M intersection tests/sec. BVH brings it to O(log n) per move.

**Rule: throttle raycast to rAF, not to pointer events.**
```js
let pending = null;
canvas.addEventListener('pointermove', (e) => { pending = e; invalidate(); });
function update() {
  if (!pending) return;
  raycaster.setFromCamera(ndc(pending), camera);
  hover = raycaster.intersectObjects(targets, false)[0]?.object ?? null;
  pending = null;
}
```

**Rule: prefer `pmndrs/pointer-events` over hand-rolled raycasting** for any non-trivial app. Per-object `pointerEvents` modes (`none` / `listener` / `auto`) and pointer-type filtering (`screen-mouse`, `screen-touch`).

## Dispose lifecycle

**Rule: every `Geometry`, `Material`, `Texture`, `RenderTarget`, and `WebGLRenderer` must be disposed.** WebGL resources live in GPU memory outside the GC. Dropping a React component without disposing leaks until the tab closes.
```js
function disposeNode(obj) {
  obj.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    if (n.material) {
      const mats = Array.isArray(n.material) ? n.material : [n.material];
      mats.forEach(m => {
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      });
    }
  });
}
disposeNode(scene);
renderer.dispose();
controls.dispose();
ro.disconnect();
cancelAnimationFrame(raf);
```

**Rule: `renderer.info.memory` is your truth.** Track `geometries` and `textures` counts across mount/unmount. They must return to baseline.

## Visibility / IntersectionObserver gating

**Rule: pause the loop when the canvas is offscreen.**
```js
const io = new IntersectionObserver(([e]) => {
  e.isIntersecting ? start() : stop();
}, { threshold: 0 });
io.observe(canvas);
```
A hero canvas above-the-fold renders even when scrolled past, blocking main thread for nothing.

## Debug / instrumentation

- **Stats.js** in dev, gated by env. Panels: 0=FPS, 1=ms, 2=MB. Wrap render with `stats.begin(); render(); stats.end();`.
- **three.js DevTools** (Chrome extension) — register the renderer with global hooks (gated behind `process.env.NODE_ENV !== 'production'`).
- **Spector.js** for per-frame WebGL command capture and state thrash audits. WebGL only — does not work on the WebGPU path.
- **Needle Inspector** for cross-engine inspection (three.js / R3F / Threlte / A-Frame / Spline) — auto-detects without registration.
- **GLTF/GLB Viewer for VS Code** to triage "is the asset broken or is my loader broken?" — opens `.gltf`/`.glb` directly with Draco + KTX2 decoding, hierarchy, animations, full stats.

## React / R3F integration

- **One `<Canvas>` per app.** Two canvases create two `WebGLRenderer`s and competing rAF loops. For multiple viewports use `gl.setViewport`/`setScissor` inside one canvas.
- **`frameloop="demand"` is the default for graph viz.** Combine with `useThree(s => s.invalidate)`. Wire it to layout commit, Cosmograph data swap, hover/select state changes, camera change events.
- **`useFrame((state, dt) => …)` is the only legal place to mutate three.js objects per frame.** Never mutate from `useEffect` or React state setters in the loop.
- **Refs, not state, for animated values.** Setting React state at 60 Hz reconciles the React tree 60 times per second. Use a `useRef` and write to `mesh.current.position` directly.
- **StrictMode double-mounts effects in dev. Your dispose path must be idempotent.** Test by toggling StrictMode on. Anything that double-creates a WebGL resource without double-disposing leaks.
- **Suspense boundaries around `useGLTF`/`useTexture`.** Asset hooks throw promises; without a boundary they unmount the canvas.
- **Drei's `<OrbitControls makeDefault />`** registers controls so other Drei components find them. Never instantiate `OrbitControls` manually inside an R3F tree.
- **`useThree(s => s.gl)` for the renderer; `useThree(s => s.size)` for resize.** Don't read `window.innerWidth` — R3F already owns the resize observer.
- **Next.js: dynamic-import the canvas with `{ ssr: false }`.** Three.js touches `window` at module evaluation; SSR will hard-crash the route. Wrap the entire `<Canvas>` subtree, not just inner components.
- **R3F under React 18+ concurrent mode**: avoid mounting heavy GPU work inside transitions; the unmount may run before the GPU upload completes, causing GL errors. Gate heavy mounts on `useDeferredValue` or a stable layout effect.

## R3F v9 specifics

The project pins `@react-three/fiber ^9.5.0`. R3F v9 introduced several silent
breaking changes vs v8 that bite when porting older code or reading old
tutorials.

- **Automatic sRGB conversion of texture props was removed.** In v8, R3F
  silently set `texture.colorSpace = SRGBColorSpace` on texture props that
  looked like color textures. In v9 you must do it yourself.
  ```jsx
  // v9 — explicit on color textures
  <meshStandardMaterial>
    <texture attach="map" {...} />
  </meshStandardMaterial>
  // or in JSX:
  // <texture-colorSpace>{THREE.SRGBColorSpace}</texture-colorSpace>
  ```
  Data textures (normal, roughness, metalness, AO, displacement) stay default
  Linear. Custom material code that touches `texture.colorSpace` directly works
  the same as before — only the implicit prop conversion changed.
- **Type renames.** `Props` → `CanvasProps`. `MeshProps`, `GroupProps`,
  `MaterialProps`, etc. were removed in favor of `ThreeElements['mesh']`,
  `ThreeElements['group']`, etc. — all derived from one source of truth.
  ```ts
  type SomeMeshProps = ThreeElements['mesh'] & { highlight?: boolean };
  ```
- **StrictMode is now properly inherited from the parent renderer** (the
  react-dom tree). Code that "worked in dev because StrictMode wasn't reaching
  the canvas" breaks on upgrade. Audit dispose paths; double-mount must be a
  no-op in resource accounting.
- **`useLoader` external-instance pooling.** v9 deduplicates loader instances
  across `useLoader` calls more aggressively. If you mutated a loader's state
  expecting per-component isolation (e.g. set `loader.crossOrigin` on one
  call), that state is now visible everywhere. Configure loaders explicitly
  per-instance instead of relying on hook-call-time mutation.

## R3F v10 forward-look (alpha — do not ship)

R3F v10 alpha is out and changes a few load-bearing things. **Don't write code
v10 will break, but don't migrate yet.**

- **`state.gl` → `state.renderer`** (deprecation warning, still works in v10).
  Reach for `useThree(s => s.gl)` rather than destructuring `state.gl` so the
  refactor is mechanical when v10 lands.
- **Phase-based scheduling.**
  ```js
  useFrame(cb, { phase: 'physics' });
  useFrame(cb, { phase: 'render' });
  useFrame(cb, { fps: 30 });          // throttle a single subscriber
  ```
- **New TSL hooks.** `useUniforms`, `useNodes`, `useLocalNodes`,
  `useRenderPipeline`. These give first-class TSL ergonomics inside R3F.
- **Subpath imports.** `@react-three/fiber/legacy` for WebGL-only,
  `@react-three/fiber/webgpu` for WebGPU features. Plan your imports so the
  v10 split is mechanical.
- Don't write code v10 will break. In particular:
  - Use `useThree(s => s.gl)` not `state.gl` destructuring.
  - Avoid embedding multiple ad-hoc `useFrame` priorities — phase metadata
    will replace numeric priority semantics.

## r184 surface notes

- **`compileAsync()` is truly non-blocking** as of r184 — pre-warm material
  programs without stalling the render thread.
  ```js
  await renderer.compileAsync(scene, camera);   // pre-warm before reveal
  ```
- **TSL → WGSL/GLSL compile is ~3× faster** in r184. Multi-second compile
  pauses on warm reload should be gone; if you see one, profile for redundant
  `Fn` invocations.

## Common mistakes

1. **Calling `renderer.render` from a controls listener AND a rAF loop** — produces tearing. Pick one driver.
2. **`new OrbitControls(camera, document.body)`** — pointer capture leaks to the whole page; scroll-jacks the user.
3. **Allocating `new THREE.Vector3()` inside `useFrame`/`tick`** — allocates 60–120 vectors/sec per usage, GC stalls. Hoist to module scope.
4. **Listening to `window.resize` instead of `ResizeObserver`** — misses container-driven resizes (collapsing sidebars, devtools).
5. **DPR uncapped on retina + 4K** — `setPixelRatio(window.devicePixelRatio)` on a 5K iMac renders 14.7 MP/frame. Cap at 2.
6. **`scene.remove(obj)` without disposing** — leaks the geometry, material, and every texture referenced by the material.
7. **Mounting two `<Canvas>` elements** — two competing rAF loops, two WebGL contexts, browser may evict the older context with no warning.
8. **Raycasting against the full scene every `pointermove`** — pointermove fires at pointer rate (often 1000 Hz on gaming mice). rAF-throttle and BVH-scope.
9. **Mixing `AnimationMixer` and Theatre.js on the same `Object3D`** — silent jitter; last writer wins per frame.
10. **Forgetting `timer.getDelta()` returns *time since last `update()`*, not since start.** Calling `getDelta()` from two consumers without re-`update()`ing zeros the second consumer. Single owner per `Timer`.
11. **`near=0.001, far=100000`** — z-fighting in the middle range. Tighten the frustum; reach for `renderer.reverseDepthBuffer = true` (r179+) before `logarithmicDepthBuffer`.
12. **Setting React state inside `useFrame`** — reconciles the entire React tree at 60+ Hz; use refs.
13. **Using `visible=false` to exclude from raycasts** — still costs matrix updates; use `Layers` instead.
14. **Skipping the rAF cancel on unmount** — the loop closes over a stale scene/renderer; future frames throw, devtools shows phantom GPU memory.
15. **Forgetting `camera.updateProjectionMatrix()` after `camera.aspect` or `camera.fov` mutation** — silently uses stale projection; visible distortion only on resize.
16. **Re-creating `WebGLRenderer` on hot-reload** without disposing the previous one — accumulates GL contexts until the browser forcibly releases the oldest. Always dispose on HMR teardown.
