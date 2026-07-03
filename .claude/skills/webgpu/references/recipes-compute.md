---
name: WebGPU compute recipes — particles, FFT, sort, ML, geometry
description: End-to-end working recipes for the canonical GPGPU patterns. Each recipe has a mental model, a key WGSL kernel, and the JS that drives it. Sized to be adapted, not copy-pasted whole.
---

# Compute recipes

Companion to `compute-fundamentals.md` (sizing/atomics/barriers),
`gpgpu-recipes.md` (algorithm building blocks: scan, sort, hashing, LBVH),
and `recipes-graphics.md` (image/post/lighting recipes). Read this for the
*compute portfolio*: particles, FFT, sort, GEMM, BVH, marching cubes,
GPU-driven culling. Each kernel is the production shape — what changes per
application is workgroup size, data layout, and barriers. Pay attention to
dispatch counts; that's where most authors trip.

---

## 1. 1M-particle simulation with spatial hashing

A 1M-particle sim is bandwidth-bound. Each step reads (pos, vel) and writes
(pos', vel'). Double-buffer ping-pong: 1M × 32 B × 2 reads × 60 fps = 3.84 GB/s
(within 200–400 GB/s desktop, 50–100 GB/s mobile). In-place updates: 1.92 GB/s.
The implicit dispatch-to-dispatch barrier in WebGPU means in-place is fine for
compute-only flows; ping-pong is only mandatory when a render pass *also* reads
the buffer (different barrier class).

Naïve neighbour search is O(N²); spatial hashing makes it O(N) by bucketing
every particle into a cell and querying only 9 (2D) or 27 (3D) neighbours.
Three dispatches per step — full counting-sort layout in
`gpgpu-recipes.md#5-spatial-hashing--the-workhorse-for-neighbor-queries`.

```wgsl
// Pass 1: hash + count
@compute @workgroup_size(64) fn pass_count(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N) { return; }
  let cell = hash_cell(positions[gid.x]);
  atomicAdd(&cell_counts[cell], 1u);
}

// Pass 2: prefix-sum cell_counts → cell_starts (separate dispatch; see scan recipe in this file)

// Pass 3: scatter particle indices into sorted slot
@compute @workgroup_size(64) fn pass_scatter(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N) { return; }
  let cell = hash_cell(positions[gid.x]);
  let slot = atomicAdd(&cell_cursor[cell], 1u);
  particle_indices[cell_starts[cell] + slot] = gid.x;
}

// Pass 4: integrate (reads neighbours from cell_starts/indices)
@compute @workgroup_size(64) fn pass_integrate(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= N) { return; }
  let p = positions[gid.x];
  let c0 = cell_coord(p);
  var force = vec2f(0.0);
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      let c = hash(c0 + vec2i(dx, dy));
      let lo = cell_starts[c];
      let hi = cell_starts[c + 1u];
      for (var k = lo; k < hi; k++) {
        let j = particle_indices[k];
        if (j == gid.x) { continue; }
        force += pairwise_force(p, positions[j]);
      }
    }
  }
  velocities[gid.x] += force * dt;
  positions[gid.x]  += velocities[gid.x] * dt;
}
```

JS dispatch — five passes, single submit:

```js
const wg = Math.ceil(N / 64), cellWg = Math.ceil(NUM_CELLS / 64);
const enc = device.createCommandEncoder();
const dispatch = (pipe, n) => { const p = enc.beginComputePass();
  p.setPipeline(pipe); p.setBindGroup(0, bg); p.dispatchWorkgroups(n); p.end(); };
dispatch(clearCounts, cellWg);
dispatch(passCount,   wg);
dispatch(scanStarts,  cellWg);
dispatch(passScatter, wg);
dispatch(passIntegrate, wg);
device.queue.submit([enc.finish()]);
```

Same skeleton drives Fruchterman–Reingold layout (insert attractive-edge pass),
SPH fluids (kernel-weighted force), boids (rule-weighted average). See
`lisyarus.github.io` particle-life for a live worked example.

---

## 2. Cooley–Tukey FFT (1D, length-N power of 2)

The DFT is O(N²). Cooley–Tukey factors it into log₂(N) stages of butterflies,
each doing N/2 length-2 DFTs at a fixed stride — O(N log N), and every butterfly
in a stage is independent (perfect parallelism). Two strategies:

**Bit-reversal + decimation-in-time.** Permute input so index *i* sits at
*reverse_bits(i)*; then run log₂N butterfly stages, each doubling the stride.
Drawback: bit-reversal is a non-coalesced gather.

**Stockham auto-sort.** Each stage reads from one buffer and writes to the other
in a layout that makes the next stage's reads sequential. No bit-reversal pass.
Default for in-place GPU work — read `gpu.js` FFT and the WebGPU Stockham
gist for production code.

One Stockham stage:

```wgsl
struct Params { N: u32, stage: u32, dir: f32 };  // dir = -1 forward, +1 inverse
@group(0) @binding(0) var<uniform> u: Params;
@group(0) @binding(1) var<storage, read>       src: array<vec2f>;  // complex pairs
@group(0) @binding(2) var<storage, read_write> dst: array<vec2f>;

@compute @workgroup_size(64)
fn stage(@builtin(global_invocation_id) gid: vec3u) {
  let i  = gid.x;
  if (i >= u.N / 2u) { return; }
  let m  = 1u << u.stage;            // half size of butterfly
  let k  = i & (m - 1u);             // index within butterfly
  let j  = (i >> u.stage) << (u.stage + 1u); // butterfly base
  let a  = src[j + k];
  let b  = src[j + k + m];
  let theta = u.dir * 6.283185307179586 * f32(k) / f32(2u * m);
  let w  = vec2f(cos(theta), sin(theta));
  let bw = vec2f(b.x * w.x - b.y * w.y, b.x * w.y + b.y * w.x);
  // Stockham write layout: contiguous after permute
  let p  = (i << 1u) - k;
  dst[p]       = a + bw;
  dst[p + m]   = a - bw;
}
```

JS driver — log₂N stages, ping-pong each:

```js
let read = bufA, write = bufB;
const stages = Math.log2(N);
for (let s = 0; s < stages; s++) {
  device.queue.writeBuffer(paramBuf, 4, new Uint32Array([s]));
  const bg = bgFor(read, write);
  const enc = device.createCommandEncoder();
  const p = enc.beginComputePass();
  p.setPipeline(fftStage); p.setBindGroup(0, bg);
  p.dispatchWorkgroups(Math.ceil((N / 2) / 64));
  p.end();
  device.queue.submit([enc.finish()]);
  [read, write] = [write, read];
}
```

2D FFT is row-pass + column-pass over the same kernel. References:
`gpu.js/src/backend/web-gpu/utils/kernel/fft.js`, the wgpu-rs `fft` example.

---

## 8. GPU-driven culling: HiZ + cluster culling

The endgame for draw submission. Build a hierarchical depth pyramid (each mip is
the **max** of its children — conservative occlusion); each cluster (small
mesh chunk) tests its bounding sphere against HiZ; visible clusters write their
draw args to an indirect buffer; the render pass uses `drawIndexedIndirect`. CPU
sees zero per-frame draw decisions.

HiZ build, one mip per dispatch, downsample-max-2×2:

```wgsl
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var dst: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn hiz(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(dst);
  if (gid.x >= dim.x || gid.y >= dim.y) { return; }
  let p = gid.xy * 2u;
  let d0 = textureLoad(src, p,                 0).r;
  let d1 = textureLoad(src, p + vec2u(1u, 0u), 0).r;
  let d2 = textureLoad(src, p + vec2u(0u, 1u), 0).r;
  let d3 = textureLoad(src, p + vec2u(1u, 1u), 0).r;
  textureStore(dst, gid.xy, vec4f(max(max(d0, d1), max(d2, d3))));
}
```

Cluster cull (one thread per cluster, append visible draws):

```wgsl
struct Cluster { centerRadius: vec4f, indexOffset: u32, indexCount: u32 };
@group(0) @binding(0) var<storage, read>       clusters: array<Cluster>;
@group(0) @binding(1) var<storage, read_write> drawArgs: array<vec4u>; // {indexCount,instanceCount,firstIndex,baseVertex} per webgpu spec, plus firstInstance u32
@group(0) @binding(2) var<storage, read_write> drawCount: atomic<u32>;
@group(0) @binding(3) var hiz: texture_2d<f32>;
@group(0) @binding(4) var<uniform> view: mat4x4f;

@compute @workgroup_size(64)
fn cull(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= arrayLength(&clusters)) { return; }
  let c = clusters[gid.x];
  if (!frustum_visible(c, view)) { return; }
  if (occluded_by_hiz(c, view, hiz)) { return; }
  let slot = atomicAdd(&drawCount, 1u);
  drawArgs[slot] = vec4u(c.indexCount, 1u, c.indexOffset, 0u);
}
```

Render pass uses `drawIndexedIndirect`. Strides: see `buffer-resources.md#10-indirect-args-buffer-layouts`.
**Critical:** never write `drawCount` and read it via `drawIndirect` in the
**same command buffer** — split into two `submit()` calls (gpuweb#2189).

Real-world references: Niagara (Arseny Kapoulkine), wgpu-rs `bunnymark`, the
`webgpu-samples/bundleCulling` sample.

---

## 11. ML inference: f16 GEMM (8×8 tile, 2×2 micro-tile per thread)

Matrix multiplication is the foundation of transformer inference. Three rules
make GEMM fast: **tile through workgroup memory** (amortize global reads),
**multiple outputs per thread** (raise arithmetic intensity), **f16 storage**
(2× effective bandwidth on capable hardware). Mid-range desktop reaches 1+
TFLOPs/s; mobile ~50 GFLOPs/s.

```wgsl
enable f16;
const TS  : u32 = 16u;   // tile size
const SUB : u32 = 2u;    // outputs per thread axis (2x2 micro-tile)
@group(0) @binding(0) var<storage, read> A: array<f16>;
@group(0) @binding(1) var<storage, read> B: array<f16>;
@group(0) @binding(2) var<storage, read_write> C: array<f16>;
@group(0) @binding(3) var<uniform> u: vec4u;     // M, N, K, _

var<workgroup> aTile: array<f16, TS * TS>;
var<workgroup> bTile: array<f16, TS * TS>;

@compute @workgroup_size(8, 8)  // 8*8 threads each writing 2x2 = 16x16 outputs
fn gemm(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) lid: vec3u) {
  let M = u.x; let N = u.y; let K = u.z;
  var acc: array<f16, 4>;  // 2x2 micro-tile in registers
  let row0 = wg.y * TS + lid.y * SUB;
  let col0 = wg.x * TS + lid.x * SUB;

  let tiles = (K + TS - 1u) / TS;
  for (var t: u32 = 0u; t < tiles; t++) {
    // cooperative load — 8x8 threads load TS*TS = 16*16 = 256 elems = 4 per thread
    for (var p: u32 = 0u; p < SUB * SUB; p++) {
      let li = lid.y * SUB + (p / SUB);
      let lj = lid.x * SUB + (p % SUB);
      aTile[li * TS + lj] = A[(wg.y*TS + li)*K + (t*TS + lj)];
      bTile[li * TS + lj] = B[(t*TS + li)*N + (wg.x*TS + lj)];
    }
    workgroupBarrier();
    for (var k: u32 = 0u; k < TS; k++) {
      let a0 = aTile[(lid.y*SUB    )*TS + k];
      let a1 = aTile[(lid.y*SUB + 1)*TS + k];
      let b0 = bTile[k*TS + lid.x*SUB    ];
      let b1 = bTile[k*TS + lid.x*SUB + 1];
      acc[0] = fma(a0, b0, acc[0]);
      acc[1] = fma(a0, b1, acc[1]);
      acc[2] = fma(a1, b0, acc[2]);
      acc[3] = fma(a1, b1, acc[3]);
    }
    workgroupBarrier();
  }
  C[(row0  )*N + col0    ] = acc[0];
  C[(row0  )*N + col0 + 1] = acc[1];
  C[(row0+1)*N + col0    ] = acc[2];
  C[(row0+1)*N + col0 + 1] = acc[3];
}
```

Dispatch `(N/TS, M/TS, 1)`. Request `'shader-f16'`; `'subgroup-matrix'` (when
available) exposes Apple `simdgroup_matrix` / NVIDIA `mma` for another 2–4×.
Refs: Transformers.js v4 matmul tree.

---

## 12. ML inference: INT8 GEMM with `dot4U8Packed`

Quantized inference packs four `u8` weights/activations into one `u32`. The
`packed_4x8_integer_dot_product` extension exposes `dot4U8Packed(a, b)` =
sum of four 8-bit unsigned multiplies in a single instruction — 4× throughput
versus FP16 on supported hardware (NVIDIA Turing+, AMD RDNA2+, Apple A14+).
Used for quantized LLM/embedding inference.

```wgsl
enable packed_4x8_integer_dot_product;
@group(0) @binding(0) var<storage, read> A_packed: array<u32>;  // M*(K/4) u32s
@group(0) @binding(1) var<storage, read> B_packed: array<u32>;  // (K/4)*N u32s — packed columns
@group(0) @binding(2) var<storage, read_write> C: array<i32>;
@group(0) @binding(3) var<uniform> u: vec4u;                   // M, N, K, _

@compute @workgroup_size(8, 8)
fn gemm_i8(@builtin(global_invocation_id) gid: vec3u) {
  let M = u.x; let N = u.y; let K = u.z;
  let row = gid.y; let col = gid.x;
  if (row >= M || col >= N) { return; }
  var acc: u32 = 0u;
  let kp = K / 4u;
  for (var i: u32 = 0u; i < kp; i++) {
    let a = A_packed[row * kp + i];
    let b = B_packed[i  * N  + col];   // adjust packing layout to match
    acc = dot4U8Packed(a, b) + acc;    // unsigned dot, accumulate
  }
  C[row * N + col] = i32(acc);
}
```

Tile this like recipe 11 — `dot4U8Packed` is a leaf op, surrounding tiling
identical. WebLLM and ONNX-Runtime-Web ship INT8 paths on this primitive.

---

## 13. Procedural geometry from compute (vertex pulling)

The classic pipeline is "CPU uploads vertex buffer; vertex shader reads
attributes". Vertex pulling inverts: the compute kernel writes vertices into a
storage buffer; the render pass binds *no* vertex buffer and the vertex shader
reads from the storage buffer using `@builtin(vertex_index)`. End result: the
GPU procedurally generates geometry per frame, the CPU uploads nothing.

Compute kernel — write a quad per particle:

```wgsl
struct V { pos: vec3f, _pad: f32, color: vec4f };
@group(0) @binding(0) var<storage, read>       particles: array<vec4f>; // xyz + size
@group(0) @binding(1) var<storage, read_write> verts:    array<V>;

@compute @workgroup_size(64)
fn build(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= arrayLength(&particles)) { return; }
  let p = particles[gid.x];
  let s = p.w;
  let off = vec3f(s, s, 0.0);
  let base = gid.x * 6u;
  verts[base + 0u] = V(p.xyz + vec3f(-s,-s,0), 0, color_for(gid.x));
  verts[base + 1u] = V(p.xyz + vec3f( s,-s,0), 0, color_for(gid.x));
  verts[base + 2u] = V(p.xyz + vec3f( s, s,0), 0, color_for(gid.x));
  verts[base + 3u] = V(p.xyz + vec3f(-s,-s,0), 0, color_for(gid.x));
  verts[base + 4u] = V(p.xyz + vec3f( s, s,0), 0, color_for(gid.x));
  verts[base + 5u] = V(p.xyz + vec3f(-s, s,0), 0, color_for(gid.x));
}
```

Render side — same buffer bound as `read` storage, zero vertex buffers:

```wgsl
@group(0) @binding(2) var<storage, read> verts: array<V>;
@vertex fn vs(@builtin(vertex_index) i: u32) -> Vout {
  let v = verts[i];
  var o: Vout;
  o.pos   = uniforms.viewProj * vec4f(v.pos, 1.0);
  o.color = v.color;
  return o;
}
```

JS: dispatch compute, then `pass.draw(vertexCount)` — no `setVertexBuffer`.
This is how three.js TSL's `Storage`/`vertexNode` machinery works under the
hood. Trap: the buffer needs `STORAGE | VERTEX` usage only if you also want
the conventional path; pure pulling needs just `STORAGE`.

---

## 14. Ray traversal in compute (LBVH)

A BVH lets compute kernels fire ~100M rays/s on RTX-class hardware: hybrid
ML+raytrace renderers, GPU collision detection, AO baking. Build the BVH on
CPU at startup with Karras 2012 (or rebuild per frame for dynamic geometry —
see `gpgpu-recipes.md#7-lbvh-construction-karras-2012`), flatten to a node
array, traverse iteratively with a private-memory stack.

```wgsl
struct Node { aabbMin: vec3f, leftOrPrim: u32, aabbMax: vec3f, rightOrCount: u32 };
// leaf if rightOrCount has high bit set: primCount = rightOrCount & 0x7fffffffu, primIndex = leftOrPrim
@group(0) @binding(0) var<storage, read> nodes: array<Node>;
@group(0) @binding(1) var<storage, read> prims: array<vec4f>; // sphere centers + radii (example)

fn intersect_aabb(o: vec3f, invD: vec3f, lo: vec3f, hi: vec3f, tmax: f32) -> bool {
  let t0 = (lo - o) * invD;
  let t1 = (hi - o) * invD;
  let tmin_ = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  let tmax_ = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  return tmax_ >= max(tmin_, 0.0) && tmin_ < tmax;
}

fn traverse(o: vec3f, d: vec3f) -> f32 {
  var stack: array<u32, 32>;  var sp: i32 = 0;  stack[0] = 0u;
  let invD = 1.0 / d;  var tHit: f32 = 1e30;
  loop {
    if (sp < 0) { break; }
    let n = nodes[stack[sp]]; sp = sp - 1;
    if (!intersect_aabb(o, invD, n.aabbMin, n.aabbMax, tHit)) { continue; }
    if ((n.rightOrCount & 0x80000000u) != 0u) {                 // leaf
      let count = n.rightOrCount & 0x7fffffffu;
      for (var k: u32 = 0u; k < count; k++) {
        tHit = min(tHit, intersect_prim(o, d, prims[n.leftOrPrim + k]));
      }
    } else {
      sp = sp + 1; stack[sp] = n.leftOrPrim;
      sp = sp + 1; stack[sp] = n.rightOrCount;
    }
  }
  return tHit;
}
```

Stack depth 32 covers BVHs over a few million leaves. Use **subgroups** —
`subgroupAll(stack_empty)` lets the warp early-terminate divergence-free.
Refs: NVIDIA Aila & Laine (2009), `bevy_solari`, `wgpu-rs` raytracing samples.

---

## 15. Marching cubes (compute-driven mesh from SDF)

Input: 3D scalar field (density, SDF). Output: triangle mesh covering the
iso-surface. Per voxel: compute an 8-bit case index (one bit per corner: density
above iso?), look up the case in the standard 256-entry table, emit 0–15
triangles. Use the **append-buffer pattern** with a global atomic counter to
write into a flat vertex array.

```wgsl
@group(0) @binding(0) var density: texture_3d<f32>;
@group(0) @binding(1) var<storage, read>       caseTri: array<i32>;   // flat 256x16
@group(0) @binding(2) var<storage, read_write> verts:   array<vec4f>;
@group(0) @binding(3) var<storage, read_write> vertCount: atomic<u32>;

const ISO: f32 = 0.5;

@compute @workgroup_size(4, 4, 4)
fn march(@builtin(global_invocation_id) gid: vec3u) {
  let dim = textureDimensions(density);
  if (any(gid + vec3u(1u) >= dim)) { return; }
  var corners: array<f32, 8>;  var caseIdx: u32 = 0u;
  for (var i: u32 = 0u; i < 8u; i++) {
    let off = vec3u(i & 1u, (i >> 1u) & 1u, (i >> 2u) & 1u);
    corners[i] = textureLoad(density, gid + off, 0).r;
    if (corners[i] >= ISO) { caseIdx |= 1u << i; }
  }
  var triLocal: array<vec4f, 15>;  var n: u32 = 0u;
  for (var t: u32 = 0u; t < 15u; t++) {
    let edge = caseTri[caseIdx * 16u + t];
    if (edge < 0) { break; }
    triLocal[n] = vec4f(vec3f(gid) + edge_midpoint(edge, corners), 1.0);
    n = n + 1u;
  }
  if (n > 0u) {
    let base = atomicAdd(&vertCount, n);
    for (var i: u32 = 0u; i < n; i++) { verts[base + i] = triLocal[i]; }
  }
}
```

Render via vertex pulling (recipe 13); a tiny clean-up kernel writes
`(vertCount, 1, 0, 0)` into a `drawIndirect` buffer — zero CPU round-trip.
Refs: `webgpu-samples/marchingCubes`, `webgpu-samples/metaballs`.

---

## 16. GPU spatial hash for collision

Input: N entities with positions and radii. Output: list of colliding pairs
(or contact resolution forces). Same hash-grid as recipe 1, but the query loop
checks pairwise overlap and either appends to a collision list or writes
forces directly. The neighbour-loop body changes; the surrounding hashing
infrastructure is identical.

```wgsl
struct Pair { a: u32, b: u32 };
@group(0) @binding(0) var<storage, read>       positions:   array<vec4f>;  // xyz + radius
@group(0) @binding(1) var<storage, read>       cell_starts: array<u32>;
@group(0) @binding(2) var<storage, read>       indices:     array<u32>;
@group(0) @binding(3) var<storage, read_write> pairs:       array<Pair>;
@group(0) @binding(4) var<storage, read_write> pairCount:   atomic<u32>;

@compute @workgroup_size(64)
fn collide(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= arrayLength(&positions)) { return; }
  let pi = positions[gid.x];  let c0 = cell_coord(pi.xyz);
  for (var dx = -1; dx <= 1; dx++) {
  for (var dy = -1; dy <= 1; dy++) {
  for (var dz = -1; dz <= 1; dz++) {
    let c = hash(c0 + vec3i(dx, dy, dz));
    let lo = cell_starts[c];  let hi = cell_starts[c + 1u];
    for (var k = lo; k < hi; k++) {
      let j = indices[k];
      if (j <= gid.x) { continue; }   // dedupe: emit only (a < b)
      let pj = positions[j];
      if (distance(pi.xyz, pj.xyz) < (pi.w + pj.w)) {
        pairs[atomicAdd(&pairCount, 1u)] = Pair(gid.x, j);
      }
    }
  }}}
}
```

For deformable / soft-body dynamics, replace the append with a direct write
to `forces[gid.x]` (single owner — no atomic) plus `atomicAdd` of the
reaction force into `forces[j]`. Substrate beneath FLEX, PhysX particle, and
Cosmograph-style force-directed graph layout.

---

## Cross-references

- Workgroup sizing, atomics, barriers: `compute-fundamentals.md`
- Algorithm building blocks (scan, sort, hashing, LBVH): `gpgpu-recipes.md`
- Pipeline cache, indirect args strides: `performance-and-profiling.md`,
  `buffer-resources.md#10-indirect-args-buffer-layouts`
- WGSL extensions (`f16`, `packed_4x8_integer_dot_product`, `subgroups`):
  `wgsl-extensions.md`
- Render-side companions (post, lighting, AA): `recipes-graphics.md`
- Storage texture rules and 3D texture binding: `texture-resources.md`
