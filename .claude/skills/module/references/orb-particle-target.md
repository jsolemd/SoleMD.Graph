# Orb Particle Target — 1M Particles On WebGPU

The orb is a SoleMD-specific WebGPU particle runtime that sits on the field
substrate and targets `1_000_000` resident particles. Read this before
touching any orb runtime code, particle count, compute kernel, render
pipeline, or the idle-skip discipline that keeps the runtime under budget.

For three.js authoring rules at the WebGPU layer (TSL, NodeMaterial,
`instancedArray`, `compute()`, vertex pulling) see
`/threejs/references/webgpu-tsl-bridge.md` and
`/threejs/references/postprocessing-and-fidelity.md`. For raw WebGPU
contracts (workgroup sizing, bind groups, atomics, prefix scan) see
`/webgpu/references/compute-and-gpgpu.md`. The orb runtime currently uses
hand-written WGSL + raw WebGPU rather than TSL; the TSL path is the
documented future direction.

## Active Branch

`feat/orb-as-field-particles`. The recent perf-locking commits encode the
working contract:

- `7c80958 fix(web): add stateful orb particle motion`
- `5941b01 perf(web): wider orb sphere + lower DPR + idle compute skip for 1M-particle target`
- `67b74a8 perf(web): skip weights tick + 16MB writeBuffer when orb is idle, widen radius`
- `9f361d9 fix(web): hash-random sphere seed + 21-bit pick index for 1M-particle orb`

If you are extending the orb or adding new field-substrate particle layers
to other surfaces, mirror this discipline. The contract is non-negotiable.

## Live Code Map

Runtime entry:

- `apps/web/features/orb/webgpu/orb-webgpu-runtime.ts` — `OrbWebGpuRuntimeImpl`,
  the canonical 1M-particle runtime (rAF, dispatch, write-gating)
- `apps/web/features/orb/webgpu/OrbWebGpuCanvas.tsx` — React mount point
- `apps/web/features/orb/webgpu/orb-webgpu-resources.ts` — buffer
  allocation, bind groups, pipeline construction
- `apps/web/features/orb/webgpu/orb-webgpu-gate.ts` — adapter-limit gate
  (downscales `ORB_PARTICLE_CAPACITY` if `maxStorageBufferBindingSize`
  cannot fit it)
- `apps/web/features/orb/webgpu/orb-webgpu-particles.ts` — CPU-side typed
  arrays (`sizes`, `flags`) + `buildOrbWebGpuFlagArray`

Shaders (WGSL):

- `orb-webgpu-shader.ts` — main vertex + fragment kernels, hash functions,
  uniform random sphere sampling (`homePositionForIndex` lives in
  `orb-webgpu-shader-physics.ts`), depth-aware pick packing
- `orb-webgpu-shader-noise.ts` — FBM and simplex routines
- `orb-webgpu-shader-physics.ts` — `integrateParticles` compute kernel
- `orb-webgpu-shader-seed.ts` — one-shot `seedAmbientGeometry` compute pass

Constants:

- `apps/web/features/orb/bake/orb-particle-constants.ts` — `ORB_PARTICLE_CAPACITY`,
  `ORB_BLOB_FREQUENCY`, `ORB_BLOB_AMPLITUDE`, `ORB_PARTICLE_DISPLAY_BYTES`

## Particle Count: 1_000_000

```ts
export const ORB_PARTICLE_CAPACITY = 1_000_000;
```

This is the single knob driving:

- DuckDB `paper_sample` reservoir size
- WebGPU buffer allocations (clamped down only when the adapter literally
  cannot fit them — see the gate)
- All CPU-side typed-array sizes (positions / velocities / sizes / flags)
- Focus / hover / selection index validation

Bumping this is the only edit needed to scale density up. The seed pass
modulo-wraps when the requested count exceeds the underlying point source,
so increasing this does not require regenerating the field assets.

### 21-Bit Pick Index Ceiling

The WGSL pick kernel packs `(depthQ << 21) | index` into a `u32` for
`atomicMin` reduction. This caps safe particle counts at `2^21 = 2_097_152`.
At 1M, you have 1M of headroom. Going beyond 2M requires widening the index
encoding before bumping the count — otherwise picks alias to the wrong
particle. The runtime logs a loud `console.error` if `arrays.count >
ORB_PICK_INDEX_CEILING`, but never throws — the field still renders, just
hover/click/rect resolution is unsafe.

## DPR Cap: 1.25

```ts
const ORB_CANVAS_DPR_CAP = 1.25;
```

Stricter than the field's 2.0 cap. WebGPU pixel cost scales quadratically
with DPR, and the orb runs the full integrate + render bundle every
non-idle frame, so DPR is the highest-leverage perf knob. `1.25` chosen as
a defensible floor on retina (2.0 DPR) displays. The orb's soft alpha-
blended particles tolerate sub-native sampling well; raising this back to
2.0 burns ~60% more pixel work for negligible visible gain.

Do not raise this without a measured reason and a regression test.

## Idle-Skip Discipline

The orb runs `requestAnimationFrame` every frame (the rAF callback re-arms
itself unconditionally — see `OrbWebGpuRuntimeImpl#frame`), but the three
most expensive operations are gated behind a "did anything actually
change?" check:

### 1. Skip the weights tick + 16 MB writeBuffer

```ts
private tickInteractionState(dtSeconds: number): void {
  const isActive = this.hasActiveFlag || this.focusIndex >= 0;
  if (!isActive && performance.now() > this.interactionWindowEndMs) return;
  tickOrbInteractionWeights(...);
  this.device.queue.writeBuffer(this.weightsBuffer, ...);
}
```

The weights tick is the O(N) per-particle weight smoothing loop. Skipping
it when there's no active flag and the post-interaction decay window has
closed eliminates a 16 MB-class per-frame `writeBuffer` upload — the
biggest CPU win at 1M. (The buffer is `maxParticles * VEC4_BYTES = 1M * 16
= 16 MB` allocated in `orb-webgpu-resources.ts`.)

The decay window opens when `hasActiveFlag` transitions from true to false
and `focusIndex < 0`, letting saturated weights fade out smoothly
(`INTERACTION_DECAY_WINDOW_MS = 2_250` ms — ≈5 × FOCUS_TAU_SECONDS).
Outside the decay window with no active signal, the tick and its
`writeBuffer` both skip entirely.

### 2. Skip the integrate compute dispatch

```ts
const isAnimating =
  motionDt > 0 ||
  this.hasActiveFlag ||
  this.focusIndex >= 0 ||
  performance.now() <= this.interactionWindowEndMs;
if (this.particleCount > 0 && (isAnimating || this.displayDirty)) {
  // beginComputePass + dispatch integrateParticles
}
```

When ambient motion is paused (`motionDt = 0`) AND no interaction is
pulling weights AND no decay tail is playing AND no upload has dirtied
the display buffer, the integrate compute pass skips entirely. The render
bundle keeps drawing the last computed `DisplayParticle` snapshot, so the
orb stays visible but stops animating. At 1M particles this skips ~3.2 B
FBM ALU ops per frame on truly-paused states — the headline GPU win.

### 3. Force-dispatch on dirty state

```ts
private displayDirty = false;
```

Set after any upload that changes particle state (seed, sizes, flags) so
the GPU's `DisplayParticle` buffer gets repopulated before the render
pass reads it. Cleared once the integrate dispatch fires. This gates the
condition above so an orb mounted with reduced-motion or pause active
still renders correctly on first paint.

### Apply this pattern to any new layer

When extending the orb or adding new field-substrate particle layers:

- do not unconditionally tick simulation or upload buffers every frame —
  gate behind the existing dirty/active flags
- when adding any per-frame `writeBuffer` of comparable size (megabyte-
  class), route through the same idle-skip path
- pair the gate with a decay window so motion settles smoothly rather than
  cutting abruptly

## Sphere Seed Strategy

The seed pass synthesizes positions, velocities, and per-particle attribute
seeds once per non-empty upload, on the GPU:

```wgsl
@compute @workgroup_size(64)
fn seedAmbientGeometry(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let count = computeFrame.count;
  if (i >= count) { return; }

  let pos = homePositionForIndex(i);
  computePositions[i] = vec4f(pos, 0.0);

  let h3 = iHashToFloat(iHash(i ^ 0x68bc21ebu));
  // ...
}
```

`homePositionForIndex(i)` is a **hash-random uniform sphere sample** —
two `iHash` draws produce uniform `cosθ ∈ [-1, 1]` and uniform
`φ ∈ [0, 2π)` (Archimedes' hat-box theorem), so the spherical surface
density is uniform without a golden-angle spiral term. This replaced the
earlier Fibonacci-spiral seed in commit `9f361d9` because the spiral
required a true mod-N index (1M particles → mod 1M); when the index
needed for picks/lookup exceeded the spiral period, the points realiased
into visible spokes. The hash-random sample has no period — every index
is independent — so the 21-bit pick index range and the 1M point cloud
decouple cleanly. Note: the in-source comment near the seed pass
(`orb-webgpu-shader.ts` line ~519) still says "Fibonacci spiral" and is
stale; do not be misled by it. Verify against
`orb-webgpu-shader-physics.ts:homePositionForIndex`.

The spheroid was widened (commit `5941b01`) to spread particles
spatially: lower overdraw, more uniform sampling across the 21-bit pick
index space, and visibly less density-clumping near the poles.

Per-particle `iHash`-based attribute seeds give every particle a
deterministic but un-correlated speed / phase offset. At 1M+ density the
sin/fract hash family (`particleHash` in the main shader) shows visible
diagonal banding artifacts; the integer hash family (`iHash` two-stage
multiply-shift-xor, PCG/squirrel3-style) is what makes seeding clean.

Single submission, separate from the per-frame command encoder, because it
only fires once per non-empty upload transition (the `wasEmpty && count > 0`
gate in `uploadParticles`) and we want it visible as a distinct label in
GPU traces (`orb.seed-ambient`).

## Stateful Particle Motion

Commit `7c80958`: velocities are persistent state, not derived per-frame
from time alone. `seedAmbientGeometry` initializes velocity.xyz at rest;
`integrateParticles` reads + writes the same velocity buffer each frame.

This is what gives the orb its organic feel — particles carry their
trajectory across frames, so the field reads as a flowing volume rather
than a per-frame procedural snapshot.

Implication: the velocity buffer cannot be rebuilt every frame from the
CPU. It lives in GPU storage; CPU-side flag/size uploads only mark
`displayDirty = true` to force one integrate dispatch. The motion state
is GPU-resident.

## Tone Mapping And Compositing — Important: Raw WebGPU, Not three.js

**The orb runtime is raw WebGPU + WGSL with no three.js layer.** There is
no `THREE.WebGPURenderer`, no `EffectComposer`, no `RenderPipeline`, no
`OutputPass`. Fragments are written directly to the swap-chain texture
configured in `orb-webgpu-gate.ts`:

```ts
context.configure({
  alphaMode: "premultiplied",
  device,
  format: navigator.gpu.getPreferredCanvasFormat(), // bgra8unorm-srgb on most desktops
});
```

This means the orb does NOT apply a tone-mapping curve on the JS/three.js
side. Color shaping happens entirely inside `fragmentMain`:

- per-particle saturated tints are clamped to `[0, 1]` before write
  (`burstColor` clamp in `integrateParticles`)
- a `depthLight` factor with ceiling `1.18` keeps the blue channel from
  clipping (the LANDING_BASE_BLUE_RGB has B=1.0)
- final RGB is multiplied by source alpha for premultiplied output and
  composited with `srcFactor: "one"` / `dstFactor: "one-minus-src-alpha"`

There is currently no bloom, no MSAA target, no SMAA pass — single render
bundle, single draw call (`bundleEncoder.draw(6, particleCount)`),
straight to the canvas. The reference pipeline that the field surface
uses (HalfFloat composer + AgX in three.js) does not apply here.

If a future migration moves the orb onto three.js + TSL (see "Future TSL
Migration Path" below), the canonical recipe for *that* path is:

- `renderer.toneMapping = THREE.AgXToneMapping`,
  `toneMappingExposure ≈ 0.8–1.2`
- HalfFloat composer target (or `RenderPipeline` with
  `outputColorTransform = true`)
- bloom threshold in scene-linear units (`> 1.0`); SMAA last; **never TAA
  — ghosts particle motion**; no AO (particles aren't occlusion-rich)
- additive particle blending: `forceSinglePass = true`, `transparent:
  true`, `depthWrite: false`, `depthTest: true`, `blending:
  AdditiveBlending`

Full three.js-side discipline in
`/threejs/references/postprocessing-and-fidelity.md`. Do not assume that
discipline already applies to the running orb — it does not until the
migration lands.

The "no TAA" rule still applies if you ever wire any post-process pass
in front of this surface — particle motion ghosts under temporal
accumulation regardless of which renderer drives the composer.

## Bind Layout And Resource Topology

Pipelines and bind groups live in `orb-webgpu-resources.ts`. The orb runtime
uses raw WebGPU + WGSL today (not TSL) — bind groups are explicitly
constructed with `device.createBindGroupLayout` and
`device.createBindGroup`.

Resident GPU buffers (storage):

- `computePositions: array<vec4<f32>>` — particle home + drift positions
- `computeVelocities: array<vec4<f32>>` — velocity.xyz + per-particle
  speed packed into `.w`
- `computeAttributes: array<vec4<f32>>` — color + alpha attributes
- `displayParticles: array<DisplayParticle>` — render-side struct (vec4
  center + vec4 color + vec2 effects, padded to 48 bytes per WGSL
  alignment); this is the buffer the render bundle reads
- `weightsBuffer` — per-particle interaction weight, ~16 MB at 1M (4 bytes
  × 4 floats × 1M)
- `sizesBuffer` — per-particle radius (single f32, 4 MB at 1M)
- `flagsBuffer` — per-particle bitfield (u32, 4 MB at 1M)
- `frameUniformBuffer` — per-frame uniforms (`OrbFrameUniforms`)

Render bundle:

- `GPURenderBundle` cached against `particleCount`. Invalidated on count
  change. Single draw call: `bundleEncoder.draw(6, particleCount)` (six
  vertices = quad expansion in the vertex shader)
- depth attachment is `depth24plus`, single-sample to match the non-MSAA
  color attachment (WebGPU spec requires sample count parity)

Compute pipelines:

- `seedAmbientGeometryPipeline` — one-shot seed pass, dispatched
  `Math.ceil(count / 64)` workgroups
- integrate pipeline — per-frame physics, same workgroup sizing
- pick pipeline — `atomicMin` reduction on `(depthQ << 21) | index`

## Future TSL Migration Path

The current runtime is hand-written WebGPU + WGSL. The TSL path
(`/threejs/references/webgpu-tsl-bridge.md`) is the documented future
direction:

- migrate `computePositions` / `computeVelocities` / `computeAttributes`
  to `instancedArray<vec4>` + `storage().element(instanceIndex)` vertex
  pulling
- replace the integrate kernel with a `Fn(({ ... }) => { ... }).compute(N)`
  TSL function
- replace `seedAmbientGeometry` with a TSL compute Fn that runs once
- swap raw WebGPU bind-group construction for TSL's automatic binding
  inference

When migrating: TSL compiles to both WebGL2 and WebGPU backends; reach for
`/webgpu` when authoring compute or debugging what TSL emits as WGSL.

Do not migrate piecemeal. The integrate kernel + seed kernel + render
pipeline are tightly coupled through the `DisplayParticle` layout; any
partial migration will desync the buffer alignment.

## Constants Worth Knowing

```ts
ORB_PARTICLE_CAPACITY        = 1_000_000;
ORB_PARTICLE_DISPLAY_BYTES   = 48;     // vec4 center + vec4 color + vec2 effects
ORB_BLOB_FREQUENCY           = 0.8;    // overrides field's 0.5 (multiple distinct burst clusters)
ORB_BLOB_AMPLITUDE           = 0.02;   // overrides field's 0.05 (no whole-orb pulsation at 1M density)
ORB_CANVAS_DPR_CAP           = 1.25;   // stricter than field's 2.0
ORB_PICK_INDEX_CEILING       = 2_097_151; // 21-bit pick index limit
WEIGHTS_BUFFER_SIZE_AT_1M    ≈ 16 MB
SIZES_BUFFER_SIZE_AT_1M      ≈ 4 MB
FLAGS_BUFFER_SIZE_AT_1M      ≈ 4 MB
DEPTH_TEXTURE_AT_1080P_DPR125 ≈ 10–13 MB  // depth24plus, single-sample
```

The field-blob frequency/amplitude overrides exist because the orb runs in
a focused inspection viewport at 1M density rather than the wide-camera
landing context. Keep them.

## Anti-Patterns

Do not approve changes that:

- raise `ORB_CANVAS_DPR_CAP` above `1.25` without a regression test
- bump `ORB_PARTICLE_CAPACITY` above `2_097_151` without widening the pick
  index encoding
- run the weights tick or any megabyte-class `writeBuffer` unconditionally
  every frame — always gate behind dirty/active flags
- introduce a second elapsed-time clock; the orb's per-frame time comes
  from a single `performance.now()` source, written into
  `computeFrame.time` once per frame
- replace the integer-hash sphere seed (`iHash` two-stage Wang-style
  mixer in `homePositionForIndex`) with a `sin/fract` per-particle hash
  for sphere positions — the diagonal banding artifacts at 1M+ are
  visible. The current design uses uniform random sphere sampling
  (`cosθ` and `phi` from independent `iHash` draws); do not regress to
  a Fibonacci spiral, which aliases when the index range exceeds the
  spiral period
- enable TAA on the orb; it ghosts particle motion. SMAA + MSAA-on-target
  is the right combination for any post-process pass that lands on this
  surface
- migrate to TSL piecemeal; the seed + integrate + render path is one
  contract
