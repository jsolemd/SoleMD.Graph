---
name: WebGPU GPGPU recipes
description: Production-shape patterns — prefix sum, radix sort, spatial hashing, Morton codes, LBVH (Karras), persistent threads, append/consume buffers, ping-pong particle simulation, force-directed graph layout, image kernels, ML matmul, indirect-dispatch chains. Each recipe with its WGSL pattern and JS dispatch.
---

# GPGPU recipes

These are the production patterns. The mental model that picks the workgroup size, atomic strategy, and barrier placement for each lives in `compute-fundamentals.md`. Read that first; otherwise the choices below look arbitrary.

Every recipe answers the same five questions: unit of work, dispatch shape, data location, sync points, contention pattern. The patterns are ordered from foundational (scan, sort) to compositional (LBVH, force-directed) so each builds on the prior.

## 1. Reduction — the simplest pattern

One scalar from N inputs. Standard halving tree in LDS:

```wgsl
@group(0) @binding(0) var<storage, read>       input:    array<f32>;
@group(0) @binding(1) var<storage, read_write> partials: array<f32>;
var<workgroup> lds: array<f32, 256>;

@compute @workgroup_size(256)
fn reduce_step(@builtin(local_invocation_id) lid: vec3u,
               @builtin(global_invocation_id) gid: vec3u,
               @builtin(workgroup_id)         wid: vec3u) {
  lds[lid.x] = select(0.0, input[gid.x], gid.x < arrayLength(&input));
  workgroupBarrier();
  var stride: u32 = 128u;
  loop {
    if (stride == 0u) { break; }
    if (lid.x < stride) { lds[lid.x] += lds[lid.x + stride]; }
    workgroupBarrier();
    stride = stride >> 1u;
  }
  if (lid.x == 0u) { partials[wid.x] = lds[0]; }
}
```

**Multi-pass.** For N > 256, run twice: stage 1 with `dispatchWorkgroups(ceil(N/256))` writes one partial per workgroup. For 1M inputs you get ~4096 partials. Stage 2 with `dispatchWorkgroups(ceil(4096/256))` reduces those to 16 partials. Stage 3 with `dispatchWorkgroups(1)` finishes. Three dispatches; no atomics; no contention.

**Subgroup-accelerated.** Replace the inner halving loop with `subgroupAdd(lds[lid.x])`, then halve only once across subgroups:

```wgsl
enable subgroups;
let sg_sum = subgroupAdd(input[gid.x]);
if (subgroup_invocation_id == 0u) { lds[subgroup_id] = sg_sum; }
workgroupBarrier();
if (subgroup_id == 0u) {
  let final_sum = subgroupAdd(lds[subgroup_invocation_id]);
  if (subgroup_invocation_id == 0u) { partials[wid.x] = final_sum; }
}
```

Two barriers, no halving loop. ~1.5–2× faster than pure LDS on hardware with 32-wide subgroups.

## 2. Prefix sum (parallel scan)

The single most-used GPGPU primitive. Underlies stream compaction, radix sort, sparse-graph CSR construction, spatial-hash insertion, BVH layer reduction. Three known algorithms; pick by scale.

**Hillis–Steele (inclusive).** O(N log N) work, O(log N) steps. Simple. Best for ≤256 elements within a single workgroup, or as the inner step of a hierarchical scan.

```wgsl
var<workgroup> a: array<f32, 256>;

@compute @workgroup_size(256)
fn hillis_steele(@builtin(local_invocation_id) lid: vec3u,
                 @builtin(global_invocation_id) gid: vec3u) {
  a[lid.x] = input[gid.x];
  workgroupBarrier();
  var d: u32 = 1u;
  loop {
    if (d >= 256u) { break; }
    let v = select(0.0, a[lid.x - d], lid.x >= d);
    workgroupBarrier();
    a[lid.x] = a[lid.x] + v;
    workgroupBarrier();
    d = d << 1u;
  }
  output[gid.x] = a[lid.x];
}
```

**Blelloch (exclusive).** O(N) work, two phases. Up-sweep (reduce phase) builds a binary tree of partial sums. Down-sweep distributes those back as exclusive-prefix offsets. Heavier code, but work-efficient — the standard inside production radix sort.

The 256-thread Blelloch scan handles 512 elements per workgroup (each thread handles two). Bank-conflict-free indexing (`i + (i / 32)`) is mandatory at this scale; without it, conflict serialization halves throughput.

**Three-pass scan for arbitrary N.** Standard production pattern (this is what `webgpuunleashed`, kishimisu's radix sort, and most WGSL implementations use):

1. **Per-workgroup scan.** Each workgroup scans its 512-element chunk. Writes per-workgroup totals to a small auxiliary buffer.
2. **Scan the totals.** A single workgroup scans the (≤512²/512 = ≤512) totals. Limits scaling to ~262K elements per pair of passes; for larger arrays, recurse this step.
3. **Add back.** Each workgroup adds its predecessor's running total to every element of its chunk.

```js
// JS dispatch shape for 1M-element scan
const N = 1_000_000;
const CHUNK = 512;            // = workgroup_size 256, two-per-thread
const groups = Math.ceil(N / CHUNK);  // ~1953
pass.setPipeline(scanLocal); pass.dispatchWorkgroups(groups);
pass.setPipeline(scanTotals); pass.dispatchWorkgroups(Math.ceil(groups / CHUNK));
pass.setPipeline(addBack);    pass.dispatchWorkgroups(groups);
```

**Subgroup hybrid scan.** With `subgroups`, replace the per-workgroup Blelloch with subgroup-internal `subgroupExclusiveAdd` plus an LDS-level scan over per-subgroup totals. Linebender's chained scan extends this with a virtual single-pass that processes ~1G elements/s on M1.

```wgsl
enable subgroups;
@compute @workgroup_size(256)
fn scan(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_index) li:  u32,
        @builtin(subgroup_id)             sgi: u32,
        @builtin(subgroup_invocation_id)  sid: u32,
        @builtin(subgroup_size)            sz: u32,
        @builtin(num_subgroups)           nsg: u32) {
  let x = input[gid.x];

  // Stage 1: subgroup-internal inclusive scan (a few cycles, no LDS)
  let within_sg = subgroupInclusiveAdd(x);

  // Last lane in each subgroup writes its subgroup total to LDS
  if (sid == sz - 1u) { sg_totals[sgi] = within_sg; }
  workgroupBarrier();

  // Stage 2: subgroup 0 scans the per-subgroup totals
  if (sgi == 0u && sid < nsg) {
    sg_totals[sid] = subgroupExclusiveAdd(sg_totals[sid]);
  }
  workgroupBarrier();

  // Stage 3: each lane adds its subgroup's exclusive prefix
  output[gid.x] = within_sg + sg_totals[sgi];
}
```

Two barriers, ~2× faster than Blelloch on most desktop GPUs.

## 3. Stream compaction with subgroupBallot

Filtering N items down to M passing items, packed densely. The subgroup version is the single highest-leverage pattern in GPGPU because it converts per-lane atomics into one global atomic per workgroup.

```wgsl
enable subgroups;

@group(0) @binding(0) var<storage, read>       input:    array<Item>;
@group(0) @binding(1) var<storage, read_write> output:   array<Item>;
@group(0) @binding(2) var<storage, read_write> out_count: atomic<u32>;

var<workgroup> sg_offsets: array<u32, 32>;

@compute @workgroup_size(64)
fn compact(@builtin(global_invocation_id) gid: vec3<u32>,
           @builtin(local_invocation_index) li:  u32,
           @builtin(subgroup_invocation_id) sid: u32,
           @builtin(subgroup_id)            sgi: u32,
           @builtin(num_subgroups)          nsg: u32) {
  let item = input[gid.x];
  let pass = predicate(item);

  let mask = subgroupBallot(pass);
  let count_in_subgroup = countOneBits(mask.x) + countOneBits(mask.y)
                        + countOneBits(mask.z) + countOneBits(mask.w);
  let lane_rank = subgroupExclusiveAdd(select(0u, 1u, pass));

  // One lane per subgroup writes the count to LDS
  if (sid == 0u) { sg_offsets[sgi] = count_in_subgroup; }
  workgroupBarrier();

  // First subgroup scans the per-subgroup counts
  if (sgi == 0u && sid < nsg) {
    sg_offsets[sid] = subgroupExclusiveAdd(sg_offsets[sid]);
  }
  workgroupBarrier();

  // Workgroup leader claims one block in the global counter
  var group_base: u32 = 0u;
  if (li == 0u) {
    var total: u32 = 0u;
    for (var i = 0u; i < nsg; i++) { total += sg_offsets[i]; }
    group_base = atomicAdd(&out_count, total);
    sg_offsets[31] = group_base;  // park it in unused slot
  }
  workgroupBarrier();
  group_base = sg_offsets[31];

  if (pass) {
    output[group_base + sg_offsets[sgi] + lane_rank] = item;
  }
}
```

50–100× speedup over per-lane `atomicAdd` for predicates passing ≥10% of inputs.

## 4. Sorting on GPU

**Bitonic sort.** O(N log²N). Trivially parallel and divergence-free. log²N stages, each comparing pairs at fixed stride. A workgroup-local stage can fuse multiple compare-swaps inside LDS. Best when N ≤ 1024 (single-workgroup sorts) or N ≤ 64K (multi-workgroup with global passes). Loses to radix beyond that.

**Radix sort.** O(N · k) where k = passes. Standard pattern, base-4 = 2 bits per pass = 16 passes for u32 keys. The phase-per-digit shape:

1. **Histogram.** Each workgroup tabulates its slice's digit counts in LDS atomics.
2. **Global prefix sum.** Convert per-workgroup histograms into global write offsets via three-pass scan.
3. **Scatter.** Each thread computes `local_offset_within_chunk + global_offset_for_digit + count_of_smaller_digits` and writes to destination.

Per-digit cost on RTX 3080 Ti: ~2 ms for 1M u32. 16 digits × 2 ms = ~32 ms total → ~30M elements/s. With subgroup acceleration: ~2× speedup.

**Subgroup-accelerated radix.** Replace the per-workgroup LDS prefix-sum with subgroup ballot+scan: `let mask = subgroupBallot(digit == d); let rank_among_d = countOneBits(mask & lane_mask_lt);`. Warp-level multi-split. On M1 Max the chained-scan radix variant (Linebender) hits ~1G elements/s.

**Production references:**

- `kishimisu/WebGPU-Radix-Sort` — 4-way (2 bits per pass), bank-conflict-free Blelloch scan internal. Practical cap with single-pass scan: ~262K elements; beyond that need hierarchical scan.
- `KeKsBoTer/wgpu_sort` — alternative high-quality. Both are LDS-based; subgroup paths landing as `subgroups` ships wider.

## 5. Spatial hashing — the workhorse for neighbor queries

For "N points each interacting with neighbors within radius r" — particle physics, fluid sim, force-directed graph layout, boids, SPH, collision detection. Naïve O(N²) collapses past ~5K nodes; spatial hash is O(N) and runs under 1 ms for 1M particles on mid-range GPUs.

**Pick cell size = `r`** (interaction radius). Each particle hashes to one cell; neighbor query touches only 9 (2D) or 27 (3D) surrounding cells. **Use counting-sort layout, not linked lists** — the Müller pattern. Linked lists waste a pointer per particle and force pointer-chasing memory traffic.

**Four passes per frame:**

```wgsl
fn hash_cell(p: vec3i) -> u32 {
  return u32((p.x * 92837111) ^ (p.y * 689287499) ^ (p.z * 283923481)) % TABLE_SIZE;
}
```

**Pass 1 — Clear & count.** Each particle increments its cell's counter:

```wgsl
@compute @workgroup_size(64)
fn count(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= num_particles) { return; }
  let cell = hash_cell(cell_coord(positions[gid.x]));
  atomicAdd(&cell_counts[cell], 1u);
}
```

**Pass 2 — Prefix sum** the `cell_counts` → `cell_starts`. Three-pass Blelloch scan from above.

**Pass 3 — Scatter (insert).** Atomically claim a slot inside each cell's range:

```wgsl
@compute @workgroup_size(64)
fn scatter(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= num_particles) { return; }
  let cell = hash_cell(cell_coord(positions[gid.x]));
  let slot = atomicAdd(&cell_cursor[cell], 1u);
  particle_indices[cell_starts[cell] + slot] = gid.x;
}
```

**Pass 4 — Query.** For each particle, loop over 9/27 neighbor cells:

```wgsl
@compute @workgroup_size(64)
fn query(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= num_particles) { return; }
  let me = positions[gid.x];
  let c0 = cell_coord(me);
  var force: vec3f = vec3f(0.0);
  for (var dx = -1; dx <= 1; dx++) {
    for (var dy = -1; dy <= 1; dy++) {
      for (var dz = -1; dz <= 1; dz++) {
        let c = hash_cell(c0 + vec3i(dx, dy, dz));
        let lo = cell_starts[c];
        let hi = cell_starts[c + 1u];
        for (var k = lo; k < hi; k++) {
          let j = particle_indices[k];
          if (j == gid.x) { continue; }
          let r = positions[j] - me;
          let d2 = dot(r, r);
          if (d2 < cutoff_sq && d2 > 0.0) {
            force += compute_pair_force(r, d2);
          }
        }
      }
    }
  }
  forces[gid.x] = force;
}
```

**Why hashing vs explicit grid.** Explicit `cell_count[cellsX*cellsY]` blows up for unbounded domains. A spatial hash sized 2× particle count keeps memory linear in N regardless of world size; cross-cell hash collisions are rejected by Euclidean distance test in pass 4.

**Performance.** This entire 4-pass pipeline runs well under 1 ms for 1M particles on mid-range desktop GPUs (RTX 3060+ class). Pass 1 (counting) dominates — atomic contention on hot cells. Mitigate with workgroup-local cell counters + flush, identical to the histogram pattern.

## 6. Morton codes and Z-order curves

Bit-interleave (x, y, z) coordinates → 1D Morton code. Sorting primitives by Morton code produces spatially-local memory access — points that are close in 3D end up close in the sorted array. Foundation for LBVH construction, GPU radix sort acceleration, and texture-tile layouts.

**21-bit-per-axis 64-bit Morton code (3D):**

```wgsl
fn expand_bits_21(v: u32) -> u64 {
  // Insert two zero bits between each of the 21 input bits.
  // 0x0000_001F_FFFF mask = lower 21 bits.
  var x: u64 = u64(v & 0x001F_FFFFu);
  x = (x | (x << 32u)) & 0x001F_0000_0000_FFFFul;
  x = (x | (x << 16u)) & 0x001F_0000_FF00_00FFul;
  x = (x | (x <<  8u)) & 0x100F_00F0_0F00_F00Ful;
  x = (x | (x <<  4u)) & 0x10C3_0C30_C30C_30C3ul;
  x = (x | (x <<  2u)) & 0x1249_2492_4924_9249ul;
  return x;
}

fn morton3d_64(p: vec3<f32>) -> u64 {
  // Quantize to 21 bits per axis (positive normalized [0,1] domain assumed)
  let q = vec3u(clamp(p, vec3f(0.0), vec3f(1.0)) * 2097151.0);
  return expand_bits_21(q.x)
       | (expand_bits_21(q.y) << 1u)
       | (expand_bits_21(q.z) << 2u);
}
```

**Note:** WGSL has no native `u64`; emulate via `vec2<u32>` (low/high halves) or use the `64-bit-integers` enable when available. For 30-bit Morton (10 bits per axis), the simpler 32-bit version fits in `u32`.

**Negative coordinates.** Map to unsigned by xor-encoding sign bits, or shift by half-domain before quantization.

## 7. LBVH construction (Karras 2012)

For long-range forces (every node interacts with every other — gravity, electrostatic, repulsion in Fruchterman–Reingold), spatial hashing breaks down. Build a hierarchy and approximate distant clusters by their center-of-mass. Karras' parallel construction is the canonical GPU build:

1. **Compute Morton codes.** One thread per primitive. Quantize positions to 21 bits per axis, interleave into 63-bit code (or 30-bit for 32-bit emulation).

2. **Sort by Morton code.** Parallel radix sort. Output: sorted indices `sorted_idx[i]` such that `morton[sorted_idx[i]]` is monotonically non-decreasing.

3. **Construct internal nodes in parallel.** Karras' insight: each of the N–1 internal nodes corresponds to a unique split position determined by the longest common prefix (LCP) of bordering leaves' Morton codes. Each internal node is processed by an independent thread using two binary searches over the sorted code array. No top-down recursion, no atomic queues, full SM occupancy:

   ```wgsl
   @compute @workgroup_size(64)
   fn build_internal(@builtin(global_invocation_id) gid: vec3u) {
     let i = gid.x;
     if (i >= num_internal) { return; }

     // 1. Direction of range: sign of LCP(i, i+1) - LCP(i, i-1)
     let d = sign(lcp(i, i+1) - lcp(i, i-1));
     // 2. Find upper bound of range using exponential + binary search
     let lcp_min = lcp(i, i - d);
     var l_max: i32 = 2;
     while (lcp(i, i + l_max * d) > lcp_min) { l_max *= 2; }
     // 3. Binary search for exact range end
     var l: i32 = 0;
     for (var t = l_max / 2; t >= 1; t /= 2) {
       if (lcp(i, i + (l + t) * d) > lcp_min) { l += t; }
     }
     let j = i + l * d;
     // 4. Find split position
     let lcp_node = lcp(i, j);
     var s: i32 = 0;
     for (var t = (l + 1) / 2; t >= 1; t = (t + 1) / 2) {
       if (lcp(i, i + (s + t) * d) > lcp_node) { s += t; }
       if (t == 1) { break; }
     }
     let split = i + s * d + min(d, 0);
     // 5. Write child pointers
     let left_child = select(split, split + num_internal, lcp(split, split+1) <= lcp(i, j));
     // ...
   }
   ```

   The 50× speedup over breadth-first construction in CUDA paper translates directly. Karras splits in *parallel* — every internal node decides its own range and split point independently from the sorted Morton array.

4. **Bottom-up bounding-box reduction.** Each leaf has a known box; each internal node's box is the union of its children. Atomic counter on each parent: when both children have written their box, the second-arriver thread proceeds upward. One thread climbs the tree per leaf, but the atomic ensures only one continues per node:

   ```wgsl
   loop {
     let parent = node[cur].parent;
     let count = atomicAdd(&node[parent].child_count, 1u);
     if (count == 0u) { break; }  // first arrival, wait for sibling
     // both children done — compute union and continue up
     node[parent].bbox = union(node[node[parent].left].bbox,
                                node[node[parent].right].bbox);
     cur = parent;
     if (cur == 0u) { break; }   // reached root
   }
   ```

**Barnes–Hut traversal.** Per particle, descend from root; at each node, if `s/d < θ` (cell size / distance to query point, θ ≈ 0.5–1.0), treat the cell as a single mass-point at center-of-mass; else recurse. WGSL has no recursion → use explicit stack in private memory:

```wgsl
var stack: array<u32, 64>;
var depth: u32 = 0u;
stack[depth] = 0u;  // root
depth = 1u;
loop {
  if (depth == 0u) { break; }
  depth -= 1u;
  let node_idx = stack[depth];
  let node = nodes[node_idx];
  let r = node.com - my_pos;
  let d2 = dot(r, r);
  if (node.size_sq < theta_sq * d2 || node.is_leaf) {
    force += node.mass * r / pow(d2 + softening, 1.5);
  } else {
    stack[depth] = node.left;
    stack[depth + 1u] = node.right;
    depth += 2u;
  }
}
```

64-deep stack is enough for million-node trees (log₂(1M) ≈ 20).

**Burtscher & Pingali's CUDA Barnes-Hut paper** is the standard reference; it uses warp-voting (`__ballot`) to keep lanes in lockstep — directly portable to WebGPU subgroups via `subgroupBallot` / `subgroupAll`.

## 8. Persistent threads — variable work per item

Standard one-thread-per-item pattern fails when items have wildly different work cost (ray bouncing depths, BVH traversal varying by depth, divergent particle behaviors). A workgroup with one expensive ray and 63 cheap rays takes the cost of the expensive one — the rest sit idle.

**The persistent-threads pattern.** Launch a fixed-size grid (e.g., one workgroup per SM × N), each workgroup loops over work items via atomic counter:

```wgsl
@group(0) @binding(0) var<storage, read_write> next_item: atomic<u32>;
@group(0) @binding(1) var<storage, read>       items:     array<WorkItem>;

@compute @workgroup_size(64)
fn persistent(@builtin(local_invocation_id) lid: vec3u) {
  loop {
    // Subgroup-leader claims a batch of N work items
    var batch_start: u32 = 0u;
    if (subgroup_invocation_id == 0u) {
      batch_start = atomicAdd(&next_item, BATCH_SIZE);
    }
    batch_start = subgroupBroadcast(batch_start, 0u);
    if (batch_start >= num_items) { break; }
    // Each lane processes one item from the batch
    let i = batch_start + subgroup_invocation_id;
    if (i < num_items) { process(items[i]); }
  }
}
```

Mental model: "threads grab work; never go idle." Wins when item cost variance is high. Loses when item cost is uniform (the atomic overhead doesn't pay off).

**Sizing.** Launch ~2× the number of resident workgroups the GPU can hold (~SM count × resident-per-SM). Too few: GPU underutilized. Too many: atomic pressure dominates.

## 9. Append/consume buffer — variable-output streaming

Producing variable-length output lists (visible vertices, collision pairs, BVH leaf candidates, particle spawns). Pattern:

```wgsl
@group(0) @binding(0) var<storage, read>       in_data:  array<Input>;
@group(0) @binding(1) var<storage, read_write> out_count: atomic<u32>;
@group(0) @binding(2) var<storage, read_write> out_data: array<Output>;

@compute @workgroup_size(64)
fn produce(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= arrayLength(&in_data)) { return; }
  let result = process(in_data[gid.x]);
  if (result.valid) {
    let slot = atomicAdd(&out_count, 1u);
    if (slot < CAPACITY) { out_data[slot] = result.payload; }
  }
}
```

The output count is then `dispatchWorkgroupsIndirect` ammunition for the next pass. Pure GPU-driven scheduling with no CPU round-trip.

**Atomic contention is the bottleneck.** Mitigate with subgroup-coalesced append (see § 3 — stream compaction). For high-throughput producers, the 50–100× speedup is the difference between viable and not.

**Capacity overflow.** Always check `slot < CAPACITY` in the writer and surface the overflow somewhere — e.g., a dedicated overflow-bit buffer the consumer can sample. Silently dropping output is the most common GPGPU bug.

## 10. Particle simulation at 1M+ scale

The reference target — graph layout, fluid, boids, SPH all share this shape.

**Storage layout.** Position + velocity in `vec4<f32>` (use `.w` for life/index/age/mass). SoA: separate `positions` and `velocities` buffers. Coalesced reads.

**Ping-pong pattern.** Two `array<Particle>` buffers, alternating read-source and write-destination each frame. As soon as a thread reads any *other* thread's prior state (any force calculation), single-buffer in-place updates race. Mandatory for force-directed layout, SPH, boids — anywhere thread `i` reads `position[j]`.

```js
// Build BOTH bind groups at init, never per-frame
const bgAB = device.createBindGroup({
  layout, entries: [{binding:0,resource:{buffer:bufA}}, {binding:1,resource:{buffer:bufB}}]
});
const bgBA = device.createBindGroup({
  layout, entries: [{binding:0,resource:{buffer:bufB}}, {binding:1,resource:{buffer:bufA}}]
});

function frame() {
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(simStep);
  pass.setBindGroup(0, frameCount % 2 ? bgBA : bgAB);
  pass.dispatchWorkgroups(Math.ceil(N / 64));
  pass.end();
  device.queue.submit([enc.finish()]);
  frameCount++;
}
```

Workgroup 64 or 256 depending on whether you stage neighbors in LDS.

**WebGPU does technically allow in-place updates** (single buffer with `read_write`) when each thread only touches its own index. The moment a thread reads any other thread's prior state, you need ping-pong.

**Integrators.**

- **Symplectic Euler:** `v += a·dt; x += v·dt`. Cheap, stable enough for dissipative systems like FR layout where velocity is heavily damped.
- **Velocity Verlet:** `x += v·dt + 0.5·a·dt²; a_new = compute_force(x); v += 0.5·(a + a_new)·dt`. Energy-conserving — required for molecular dynamics, gravitational N-body. Two passes per step or one pass storing acceleration alongside velocity.
- **Damped Verlet for graph layout:** Add `v *= cooling_factor` per step; decay from ~1.0 toward ~0.9. Without it the layout never settles.

## 11. Force-directed graph layout patterns

The 1M-particle target. Fruchterman–Reingold (FR) on GPU. Two forces per node:

- **Repulsion** — every other node pushes (Coulomb-like): `f_rep = k² / d`. O(N²) naïvely.
- **Attraction** — only along edges (Hooke-like): `f_att = d² / k`. O(E).

Plus global "temperature" capping per-step displacement and decaying each iteration.

**GPU-native FR architecture (production):**

1. **Edges pass** — one workgroup per edge batch; each thread picks an edge, reads both endpoint positions, computes attractive force, **atomically adds opposing force vectors** into a `forces[N]` buffer. Use separate `force_x[N]`, `force_y[N]` of `atomic<i32>` and accumulate fixed-point quantized forces (atomic floats don't exist in WGSL).

2. **Repulsion pass** — *the bottleneck.* Three options by scale:
   - **N ≤ 5K**: O(N²) brute force. Tile through LDS — each workgroup loads 256 positions into shared memory, every thread computes its repulsion against those 256, advance to next tile.
   - **5K ≤ N ≤ 100K**: **uniform-grid spatial hash with cutoff radius**. Set cell size = some multiple of average edge length; ignore repulsion beyond ~3 cells. Works because FR repulsion falls as 1/d — distant nodes barely matter.
   - **N ≥ 100K**: **Barnes–Hut on LBVH**. Build Morton codes from current positions, parallel-sort, Karras LBVH construction, bottom-up center-of-mass reduction, per-node tree traversal with θ ≈ 0.7. (`harp-lab/GraphWaGu`.)

3. **Integration pass** — read forces, clamp displacement to current temperature, update positions in ping-pong buffer.

4. **Cooling** — host-side scalar update each frame, pushed via uniform.

**Why ping-pong specifically.** Repulsion pass reads `position[j]` for many j ≠ i. Writing back to same buffer races. Either ping-pong positions or split into "read positions / write displacements / integrate in next pass."

**Weighted edges & multi-graphs.** CSR-ish layout: `edge_from: array<u32>`, `edge_to: array<u32>`, `edge_weight: array<f32>`. One thread per *edge*, not per node. Two atomic adds (one per endpoint) per edge.

**The repulsion atomic-float problem.** WGSL atomics don't support f32. Three workarounds (covered in `compute-fundamentals.md` § 6):

- Quantize forces to fixed-point i32 (multiply by 2²⁰), `atomicAdd`, dequantize on read. Production default.
- `atomicCompareExchangeWeak` in CAS loop reinterpreting bits via `bitcast<u32>(f) → atomicCompareExchangeWeak → bitcast<f32>`.
- Reformulate: emit one entry per (node, contributing-force) pair into append buffer; sort by node id; reduce per-node ranges. Higher bandwidth but no atomics.

The CAS-loop is the most common in WebGPU-ports of CUDA reference code today.

## 12. Image/data processing kernels

**Separable Gaussian blur** is the canonical compute-shader image kernel. Two passes (horizontal then vertical), each O(k) per pixel where k = kernel width:

- `@workgroup_size(128, 1, 1)` for horizontal pass; one workgroup processes a 128-pixel row tile.
- LDS holds tile + halo: `var<workgroup> tile: array<vec4f, 128 + 2*RADIUS>;`
- Each thread loads its pixel; first/last `RADIUS` threads cooperatively load halo.
- Single `workgroupBarrier()`.
- Each thread reads its `2*RADIUS+1` LDS neighbors, writes one output pixel.
- Vertical pass: rotate roles, `@workgroup_size(1, 128, 1)`. Or transpose-then-blur-then-transpose for cache locality.

This drops 16 KiB LDS per workgroup; throughput-bound by global memory bandwidth. ~5× over fragment-shader equivalents because LDS replaces redundant texture sampling.

**Downsample/upsample chains** (mip generation, bloom): `@workgroup_size(8,8)` with each thread averaging a 2×2 block. Storage textures with `textureLoad`/`textureStore`. For mipmap *generation* in compute, the entire mip pyramid fits in a single dispatch using subgroup operations to share data laterally.

**Convolutions in general.** For kernel radius M and tile size G, a workgroup loads (G+2M)² pixels into LDS and produces G² outputs. Pick G to balance: large G amortizes halo overhead but consumes more LDS. G=16, M=4 fits 24×24×16B = 9.2 KiB per workgroup, comfortably under 16 KiB cap.

## 13. ML inference: tiled matmul

Matmul tiling — the central ML kernel. Tile both A and B into LDS; each thread computes one output element via inner product over the K dimension, fed by tiles staged through LDS:

```wgsl
const TS: u32 = 16u;
var<workgroup> a_tile: array<f32, TS*TS>;
var<workgroup> b_tile: array<f32, TS*TS>;

@compute @workgroup_size(16, 16)
fn matmul(@builtin(global_invocation_id) gid: vec3u,
          @builtin(local_invocation_id) lid: vec3u) {
  let row = gid.y; let col = gid.x;
  var acc: f32 = 0.0;
  let tiles = (K + TS - 1u) / TS;
  for (var t: u32 = 0u; t < tiles; t++) {
    a_tile[lid.y * TS + lid.x] = A[row * K + (t * TS + lid.x)];
    b_tile[lid.y * TS + lid.x] = B[(t * TS + lid.y) * N + col];
    workgroupBarrier();
    for (var k: u32 = 0u; k < TS; k++) {
      acc += a_tile[lid.y * TS + k] * b_tile[k * TS + lid.x];
    }
    workgroupBarrier();
  }
  C[row * N + col] = acc;
}
```

ONNX-Runtime-Web's WebGPU matmul takes this further with multi-output-per-thread (each thread computes a 4×4 micro-tile) and vec4 loads. **f16** (with `shader-f16`) doubles throughput on capable hardware.

**State of WebGPU ML in 2026.** Transformers.js + ONNX Runtime Web is the production stack. Transformers.js v4 ships C++-rewritten WebGPU runtime with ~200 architectures, including specialized contrib operators (`MultiHeadAttention`, `MatMulNBits` for quantized linears) — ~4× speedup on BERT-class embedding models versus v3. Activation: `pipeline('feature-extraction', model, { device: 'webgpu' })`.

**Activation kernels** — pointwise (ReLU, GELU, SiLU): trivial `@workgroup_size(64)`, one thread per element, fused into matmul output write when possible.

**Attention** — FlashAttention-on-WebGPU research is active; ONNX `MultiHeadAttention` contrib op gets close enough for inference. Manual implementation uses tiled softmax with online normalization to keep K×K attention matrix out of global memory.

## 14. Indirect dispatch chain — zero-CPU-roundtrip pipelines

Compute kernel A produces a count → that count drives kernel B's dispatch shape, with no CPU readback. How visibility culling, occlusion-driven LOD, GPU-driven streaming, and dynamic-particle pipelines avoid the ~1 frame of latency a CPU round-trip would introduce.

```js
const indirectBuf = device.createBuffer({
  size: 12,  // (x, y, z) u32 — 12 bytes per dispatchWorkgroupsIndirect entry
  usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

// Pass 1: writes (workgroupCountX, 1, 1) into indirectBuf
const enc1 = device.createCommandEncoder();
const pass1 = enc1.beginComputePass();
pass1.setPipeline(producer); pass1.setBindGroup(0, bgProducer);
pass1.dispatchWorkgroups(producerCount);
pass1.end();
device.queue.submit([enc1.finish()]);  // submit boundary required (gpuweb#2189)

// Pass 2: consumes indirectBuf
const enc2 = device.createCommandEncoder();
const pass2 = enc2.beginComputePass();
pass2.setPipeline(consumer); pass2.setBindGroup(0, bgConsumer);
pass2.dispatchWorkgroupsIndirect(indirectBuf, 0);
pass2.end();
device.queue.submit([enc2.finish()]);
```

**Critical hazard** (gpuweb#2189): writing and reading indirect buffer in *same command buffer* is undefined / validation-rejected. Either separate `submit()` calls (above) or — within one submit — the writer must be in a different `beginComputePass`/`endPass` boundary with an explicit pass break. Practically: split into two encoders. Latency cost of two submits is negligible; the gain is keeping work GPU-side.

**Indirect arg buffer strides:**

- `dispatchWorkgroupsIndirect`: 12 bytes — `(x, y, z)` u32.
- `drawIndirect`: 16 bytes — `(vertexCount, instanceCount, firstVertex, firstInstance)`.
- `drawIndexedIndirect`: 20 bytes — `(indexCount, instanceCount, firstIndex, baseVertex, firstInstance)`.

**Multi-pass GPU-driven graph layout** uses this everywhere: filter kernel produces `visible_node_count` → indirect-dispatches force kernel with exactly that many workgroups → force kernel writes `displacement_count` → indirect-dispatches integrator. Zero CPU sync per frame.

## 15. GPGPU patterns NOT to bring from CUDA

Reflexes from CUDA mostly transfer; these don't:

- **No `__shared__` lifetime tricks.** WGSL `var<workgroup>` is reset to zero at every dispatch. No persisting LDS contents between dispatches.
- **No cross-block synchronization within one launch.** No `cooperative_groups::grid()`, no `__threadfence_system()`. End the dispatch.
- **No host-managed pinned memory.** `mapAsync` exists but is async-only; no synchronous DMA. Plan for double-/triple-buffered readback rings.
- **No `__device__` global pointers.** All buffers go through bind groups. No pointer arithmetic across allocations.
- **No warp shuffle without `subgroups` extension.** And subgroup width varies — never hardcode 32 or 64.
- **No texture-as-image-load with arbitrary format.** Storage textures restricted to a small format set; most formats read-only OR write-only in a single shader.
- **No CUDA streams.** All work goes through `device.queue`. Achieving overlap requires multiple `submit()` calls; the implementation may serialize.
- **No `cudaDeviceSynchronize()`.** Use `device.queue.onSubmittedWorkDone()` (returns a promise) for "all prior work has finished."
- **No bank-stripe modulus differing from 32.** WebGPU pegs LDS at 32 banks regardless of GPU; CUDA has historically had 16/32/64 across generations. Pad strides for 32-bank conflict-free indexing.

## Cross-references

- **Why each pattern works (mental model, dispatch shape, sync, atomics)** → `references/compute-fundamentals.md`.
- **WGSL builtin syntax (atomics, barriers, subgroups)** → `references/wgsl.md`.
- **Compute occupancy measurement, profiling, RenderDoc/PIX** → `references/performance-and-profiling.md`.
- **Buffer/texture layout, vec3 trap, SoA storage** → `references/buffers-textures-bindings.md`.
- **Production radix sorts, particle-life, GraphWaGu, Linebender chained scan** → `references/sources.md`.
