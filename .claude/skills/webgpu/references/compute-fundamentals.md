---
name: WebGPU compute fundamentals
description: Mental model for compute pipelines — dispatch shape, workgroup sizing, subgroups, shared memory, barriers, atomics, memory access patterns. The why behind every choice you make before reaching for a recipe.
---

# Compute fundamentals

The recipes in the sister file `gpgpu-recipes.md` all rest on five questions you must answer the same way every time:

1. What is the unit of parallel work — one thread, one workgroup, one subgroup?
2. What is the dispatch shape — 1D, 2D, 3D; how many workgroups; static or indirect?
3. Where does the data live during the kernel — global storage, shared LDS, register?
4. Where do threads synchronize — within subgroup, within workgroup, or across dispatches?
5. What is the contention pattern — which addresses are hot, which atomic strategy mitigates?

If you can answer those five, you can derive workgroup size, atomic placement, and dispatch shape from first principles. This file is the mental model behind those answers. Recipes (scan, sort, spatial hash, LBVH, particle, image, ML, indirect dispatch) live in the sister file `gpgpu-recipes.md`.

## 1. The compute pipeline mental model

A compute pipeline is **one WGSL entry point + one bind group layout**. Nothing else. Unlike render pipelines, there is no vertex/fragment split, no rasterizer state, no fixed-function blending. You hand the device:

```js
const pipeline = await device.createComputePipelineAsync({
  layout: pipelineLayout,                              // never 'auto'
  compute: { module: shader, entryPoint: 'cs_main' },  // no constants here = baseline
});
```

A **dispatch** is `dispatchWorkgroups(x, y, z)` (or `dispatchWorkgroupsIndirect(buf, offset)`). It launches an `(x · y · z)` 3D **grid of workgroups**. Each workgroup independently runs `(WX · WY · WZ)` invocations declared by `@workgroup_size(WX, WY, WZ)` on the entry point. So one dispatch executes `x·y·z·WX·WY·WZ` total threads.

**The two-tier hierarchy is load-bearing.** Within a workgroup:

- All invocations co-locate on **one Streaming Multiprocessor / Compute Unit / Execution Unit** — the GPU's SM/CU/EU. They share L1 cache, register file, and the on-chip Local Data Store (LDS) addressable as `var<workgroup>`.
- They can synchronize via `workgroupBarrier()`. They can pass data through LDS faster than any global trip.

Across workgroups in the same dispatch:

- **No synchronization is possible.** WebGPU offers no cross-workgroup barrier. Workgroups are scheduled by the hardware in unspecified order, possibly running concurrently or serially as occupancy permits. The only way two workgroups synchronize is to end the current dispatch and start a new one — the implicit barrier between dispatches is the *only* cross-workgroup ordering point WebGPU exposes.
- **Forward progress is not guaranteed for a workgroup that hasn't started.** Spinning a workgroup waiting for another workgroup to write a flag is a deadlock waiting to happen on tiled GPUs.

That single asymmetry — workgroup-local sync free, cross-workgroup sync impossible without a new dispatch — drives most algorithm choices. The shape of every parallel scan, sort, BVH build, and graph-layout step on GPU has been bent around it.

**The subgroup is a third tier inside the workgroup.** Subgroup = warp on NVIDIA, wavefront on AMD, SIMD-group on Apple, EU-thread on Intel. It's the hardware-level SIMD execution unit: every lane in a subgroup steps in lockstep, sharing one program counter. Divergent control flow within a subgroup wastes lanes (predicated execution, both branches taken). Across subgroups within a workgroup, divergence is free.

```
Dispatch  (no synchronization across workgroups)
└── Workgroup  (workgroupBarrier, var<workgroup>)
    └── Subgroup  (lockstep SIMD, subgroup ops, no barrier needed)
        └── Lane  (one thread)
```

Memorize that diagram. Every WGSL builtin and synchronization primitive maps to exactly one tier:

| Tier | Builtin | Sync | Shared memory |
|---|---|---|---|
| Dispatch | `num_workgroups`, `workgroup_id`, `global_invocation_id` | new dispatch | none |
| Workgroup | `local_invocation_id`, `local_invocation_index`, `num_subgroups` | `workgroupBarrier`, `storageBarrier`, `textureBarrier` | `var<workgroup>` |
| Subgroup | `subgroup_size`, `subgroup_invocation_id`, `subgroup_id` (Chrome 144+) | implicit lockstep | subgroup ops (ballot, scan, shuffle) |

## 2. Workgroup sizing strategy by hardware

The single most-asked question. The answer is "match the subgroup width and round up to a sweet spot." Here is what's actually happening.

**Subgroup widths in the wild (May 2026):**

| Vendor | Subgroup size | Notes |
|---|---|---|
| NVIDIA Maxwell→Blackwell | 32 | Universal across consumer + datacenter |
| AMD GCN | 64 | Older — Vega and earlier |
| AMD RDNA1/2/3/4 | 32 (Wave32) or 64 (Wave64) | Wave32 default for compute on RDNA2+ |
| Apple A11–A14 / M1 | 32 | Pre-A15 |
| Apple A15+ / M2+ | 32 | Family-7+ standardized 32 |
| Intel Xe / Arc | 8, 16, or 32 | Variable; depends on shader |
| Qualcomm Adreno 6xx/7xx | 64–128 | Largest in WebGPU territory |
| ARM Mali Bifrost/Valhall | 4 (Mali-G71) → 16 | Smallest |

Never hardcode 32 or 64 in algorithm logic. **Always read** `device.limits.subgroupMinSize` / `subgroupMaxSize` (when `subgroups` feature is requested) or take `@builtin(subgroup_size)` at runtime. Index with `subgroup_invocation_id`, mask with `subgroup_size - 1`, never with literal `31` or `63`.

**Choosing `@workgroup_size`:**

| Workload shape | Pick | Rationale |
|---|---|---|
| 1D linear (particles, edges, prefix sum) | **64** | Multiple of every common subgroup width. One warp on NVIDIA, two wavefronts on Apple, one wave on AMD RDNA Wave32, eight on Mali. Sweet spot. |
| 1D scan/sort/reduce with LDS amortization | **256** | Larger workgroup amortizes barrier cost and per-workgroup setup over more elements. Limit on baseline WebGPU. |
| 2D image filter (separable blur, convolution) | **(8, 8) = 64** | Matches 2D pixel tile. Subgroup-friendly. |
| 2D matmul tile | **(16, 16) = 256** | Tile size in elements. Balances LDS use vs. occupancy. |
| 3D volumetric | **(4, 4, 4) = 64** | Cubic tile. |
| Kernels with very heavy register pressure | **32 or 64** | Smaller workgroup → more workgroups resident → better latency hiding. |

Hard floor: never `@workgroup_size(1)` unless you want to burn 31–63 SIMD lanes per group. Hard ceiling: `maxComputeInvocationsPerWorkgroup` is **256** in core WebGPU, **128** in Compatibility Mode. Drivers may also expose 1024 on adapters that report it, but stay at 256 for portability unless you know your audience.

**The 64 rule restated.** `@workgroup_size(64, 1, 1)` is the default for one reason: it's the smallest size that's a clean multiple of *every* common subgroup width. Pick anything smaller and you waste lanes on Adreno. Pick anything larger when shared memory or barrier amortization actually justifies it. Don't pick 1024 just because you can; occupancy almost always drops because the GPU can fit fewer such large groups per SM.

## 3. Dispatch shape and the 65,535 wall

**WebGPU default limits, all axes:**

- `maxComputeInvocationsPerWorkgroup`: **256** core / **128** compatibility (X·Y·Z product of `@workgroup_size`)
- `maxComputeWorkgroupSizeX`: 256 / Y: 256 / Z: **64**
- `maxComputeWorkgroupsPerDimension`: **65,535** per axis on `dispatchWorkgroups(x, y, z)`
- `maxComputeWorkgroupStorageSize`: **16,384 bytes** (16 KiB) for `var<workgroup>`
- `maxStorageBufferBindingSize`: 134,217,728 bytes (128 MiB)
- `maxStorageBuffersPerShaderStage`: 8 (10 with feature, more with adapter override)

**The 65,535 wall bites at scale.** With `@workgroup_size(64)` and 1D dispatch, you can fire 65535 · 64 ≈ **4.19 million invocations** in `dispatchWorkgroups(N, 1, 1)`. Million-particle simulation: fine. 16-million tile ML matmul: must use 2D dispatch or grid-stride loop.

```wgsl
// 2D dispatch fallback for >65535 workgroups in one axis
@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  // Linearize 2D dispatch back to 1D index
  let i = gid.x + gid.y * num_workgroups.x * 64u;
  if (i >= total_count) { return; }
  // ...
}
// JS:
const groups = Math.ceil(N / 64);
const gx = Math.min(groups, 65535);
const gy = Math.ceil(groups / 65535);
pass.dispatchWorkgroups(gx, gy, 1);
```

**Grid-stride loop alternative.** Each thread processes multiple items. Lets you decouple thread count from problem size and tune for occupancy:

```wgsl
@compute @workgroup_size(256)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let total_threads = num_workgroups.x * 256u;
  for (var i = gid.x; i < total_count; i += total_threads) {
    process(i);
  }
}
```

Pick grid-stride when work-per-item varies (heterogeneous workloads), or when problem size isn't known at dispatch time and you'd rather over-launch a fixed grid.

**1D vs 2D vs 3D dispatch is purely indexing.** The hardware flattens internally. Use 2D for naturally 2D work (image tiles, matmul) — your indexing reads cleaner. Use 3D for volumetric work; remember `Z` workgroup size capped at 64, dispatch capped at 65,535.

**`dispatchWorkgroups` vs `dispatchWorkgroupsIndirect`:**

- `dispatchWorkgroups(x, y, z)` takes JS `u32` values. Requires CPU round-trip if `x` is computed on GPU.
- `dispatchWorkgroupsIndirect(buf, offset)` reads three `u32`s starting at `offset` (12 bytes total). Lets the GPU dispatch from a count it just computed. Foundation for GPU-driven pipelines.

**Critical hazard (gpuweb#2189):** an indirect-arg buffer must not be written and read in the same command buffer. Either split into two `submit()` calls, or end the producing pass and begin a fresh consuming pass with the buffer marked `INDIRECT | STORAGE`. Validation will reject the same-buffer-write-and-indirect-read pattern in many implementations; even where it doesn't, the result is racy.

## 4. Workgroup-shared memory (LDS) — the amortization engine

`var<workgroup> tile: array<f32, 256>;` declares Local Data Store. LDS is **on-chip SRAM**, ~10–100× lower latency than DRAM, sized 16–96 KiB per workgroup depending on hardware. The portable WebGPU cap is 16 KiB; some adapters expose 49,152 (48 KiB) or more.

**The amortization rule.** Whenever a kernel reads the same global value from more than one thread in a workgroup, stage through LDS. A 256-thread workgroup reading 4 floats each = 4 KiB shared = 1024 reads from global → at most 1024 reads, broadcast-readable thereafter. The savings compound: 256 threads each touching 256 neighbors goes from 256² = 65,536 global loads down to 256 LDS loads + 256·256 LDS reads. Same answer, vastly less DRAM traffic.

```wgsl
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;
var<workgroup> tile: array<f32, 256>;

@compute @workgroup_size(256)
fn cs(@builtin(local_invocation_id) lid: vec3u,
      @builtin(global_invocation_id) gid: vec3u) {
  // Stage 1: cooperative load — every thread loads one element into LDS
  tile[lid.x] = input[gid.x];
  workgroupBarrier();
  // Stage 2: every thread can now see all 256 staged values in O(1)
  let sum = tile[lid.x] + tile[(lid.x + 1u) % 256u];
  output[gid.x] = sum;
}
```

**Bank conflicts.** LDS is split into 32 banks, striped at 4-byte granularity. Multiple lanes in a subgroup hitting the same bank serialize. Symptoms: blur or scan kernel runs at 1/4 expected throughput. Mitigations:

- **Pad strides.** A 32×32 LDS tile striped at 32 floats per row → every thread in column-walking phase hits the same bank. Add one column of padding (`array<f32, 33*32>`) to break the alignment.
- **Bank-conflict-free indexing.** Use `i + (i / 32)` pattern — Blelloch's classic. Adds 1 byte of padding per 32 floats. Used in `webgpuunleashed`'s prefix-sum implementation as `bank_conflict_free_idx()`.

**Budget per workgroup.** 16 KiB / 4 = 4096 floats. A single 256-thread workgroup with 16 floats per thread *just fits*. Going larger forces fewer workgroups resident on the SM, reducing latency hiding. Don't reach for LDS unless the amortization math says you'll save more in DRAM bandwidth than you lose in occupancy.

**Lifetime is dispatch-scope, not frame-scope.** `var<workgroup>` is reinitialized to zero at each workgroup launch. You cannot persist state across dispatches in LDS — that's what storage buffers are for.

## 5. The barrier mental model

Three barriers, three precise semantics:

**`workgroupBarrier()`** is a control + memory barrier scoped to the current workgroup. Every invocation in the workgroup must reach this exact barrier site. Memory accesses (LDS and storage) before the barrier are visible to all invocations in the workgroup after.

**`storageBarrier()`** orders memory accesses to `var<storage, read_write>` buffers within the workgroup. Rarely needed standalone — `workgroupBarrier()` already includes a storage memory ordering. Use only when you need to order storage-buffer accesses without synchronizing threads.

**`textureBarrier()`** orders accesses to storage textures within the workgroup. Same shape as `storageBarrier()` but for `texture_storage_2d` etc.

**Hard rules — break them and you get UB or validation reject:**

1. **All invocations must reach the same barrier.** `if (lid.x < 32u) { workgroupBarrier(); }` is undefined behavior. Hoist barriers out of divergent control flow:

   ```wgsl
   // BAD — only some threads reach the barrier
   if (lid.x < 32u) {
     tile[lid.x] = something();
     workgroupBarrier();
   }

   // GOOD — every thread reaches; the conditional work is around it
   if (lid.x < 32u) { tile[lid.x] = something(); }
   workgroupBarrier();
   if (lid.x < 32u) { /* read from tile */ }
   ```

2. **No early `return` before a barrier you haven't passed.** A thread that returns before a barrier is the same as a thread that didn't reach it. Use `if/else` to skip the work, not the barrier:

   ```wgsl
   // BAD
   if (gid.x >= count) { return; }
   tile[lid.x] = input[gid.x];
   workgroupBarrier();

   // GOOD
   let valid = gid.x < count;
   tile[lid.x] = select(0.0, input[gid.x], valid);
   workgroupBarrier();
   if (valid) { /* use tile */ }
   ```

3. **No cross-workgroup barrier exists.** End the dispatch. Rule of last resort: a "GPU spinlock" across workgroups deadlocks on tiled hardware that schedules workgroups serially.

4. **`workgroupUniformLoad(ptr)`** is a special construct: it reads a value from `var<workgroup>` and asserts it's identical for every invocation in the workgroup. Implies a barrier. Useful for reading scan results or counters that all threads need uniformly.

**Why three barrier flavors when one would do?** Some hardware can issue the memory fence without the control fence (or vice versa). Implementations don't currently exploit it much — `storageBarrier()` and `workgroupBarrier()` often emit identical native code on D3D12/Vulkan/Metal — but the spec leaves room for finer-grained synchronization.

## 6. Atomics — what they cost, what they accomplish

WGSL atomics: **only `atomic<u32>` and `atomic<i32>`**. Only in `var<storage, read_write>` or `var<workgroup>` address spaces. Full operation set: `atomicLoad`, `atomicStore`, `atomicAdd`, `atomicSub`, `atomicMax`, `atomicMin`, `atomicAnd`, `atomicOr`, `atomicXor`, `atomicExchange`, `atomicCompareExchangeWeak`.

**No `atomic<f32>`. No 64-bit atomics. No atomic floats anywhere.**

**The contention rule.** Atomic operations on a hot global address serialize at the memory controller. If 1024 lanes all `atomicAdd(&counter, 1)` on the same `u32`, hardware funnels them through one memory unit — orders of magnitude slower than non-atomic stores. Within a *subgroup*, atomic conflicts often coalesce (32 lanes adding to one address → one combined atomic on most GPUs); across subgroups, full serialization.

**Strategy: stage atomics through LDS first.** This is the single most impactful pattern in GPGPU. The "histogram lesson" — naïve global atomics measured 4× slower than CPU; staged through workgroup-local atomics measured ~50× faster than CPU on 1M elements:

```wgsl
var<workgroup> local_bins: array<atomic<u32>, 256>;
@group(0) @binding(0) var<storage, read_write> global_bins: array<atomic<u32>, 256>;

@compute @workgroup_size(64)
fn cs(@builtin(local_invocation_id) lid: vec3u,
      @builtin(global_invocation_id) gid: vec3u) {
  // Stage 1: workgroup-local accumulation (cheap, on-chip)
  let bin = compute_bin(input[gid.x]);
  atomicAdd(&local_bins[bin], 1u);
  workgroupBarrier();

  // Stage 2: each thread flushes one bin to global (no contention within thread,
  // 256 spread atomics across global instead of 64 thousand on one cell)
  let v = atomicLoad(&local_bins[lid.x]);
  if (v != 0u) { atomicAdd(&global_bins[lid.x], v); }
}
```

**Atomic-float workarounds.** Three options when you need floating-point accumulation:

1. **Quantized fixed-point.** Multiply f32 by `2²⁰` (≈1M), cast to `i32`, `atomicAdd`. Lose ~6–7 decimal digits of precision; sufficient for force accumulation in graph layout / particle physics.

2. **`atomicCompareExchangeWeak` CAS loop on bit-cast.** Spin until the swap succeeds:

   ```wgsl
   fn atomic_add_f32(addr: ptr<storage, atomic<u32>, read_write>, value: f32) {
     loop {
       let old_bits = atomicLoad(addr);
       let old_val = bitcast<f32>(old_bits);
       let new_bits = bitcast<u32>(old_val + value);
       let result = atomicCompareExchangeWeak(addr, old_bits, new_bits);
       if (result.exchanged) { break; }
     }
   }
   ```

   `atomicCompareExchangeWeak` returns `__atomic_compare_exchange_result_T { old_value: T, exchanged: bool }`. Note that "weak" means it's allowed to spuriously fail even when values match — keep it in a loop.

3. **Reformulate without atomics.** Append (thread-id, value) pairs to a list, sort by thread-id, segmented reduction. More bandwidth but no contention.

The CAS approach is the de facto WebGPU port of CUDA atomicAdd-on-float. Quantized fixed-point is the production-quality workhorse for force-directed layout (`harp-lab/GraphWaGu`).

**Append/consume buffer with atomic counter.** The producer pattern for variable-length output:

```wgsl
@group(0) @binding(0) var<storage, read_write> count: atomic<u32>;
@group(0) @binding(1) var<storage, read_write> out: array<Item>;

let slot = atomicAdd(&count, 1u);
if (slot < CAPACITY) {
  out[slot] = item;
}
```

The `count` is then `dispatchWorkgroupsIndirect` ammunition for the next pass. Pure GPU-driven scheduling.

**Subgroup-coalesced append (the right pattern at scale).** One global atomic per workgroup instead of one per lane:

```wgsl
enable subgroups;

let pass = predicate(item);
let mask = subgroupBallot(pass);
let count_in_subgroup = countOneBits(mask.x) + countOneBits(mask.y)
                      + countOneBits(mask.z) + countOneBits(mask.w);
let lane_rank = subgroupExclusiveAdd(select(0u, 1u, pass));

// Subgroup-leader claims one block in the global counter
var subgroup_base: u32 = 0u;
if (subgroup_invocation_id == 0u) {
  subgroup_base = atomicAdd(&count, count_in_subgroup);
}
subgroup_base = subgroupBroadcast(subgroup_base, 0u);

if (pass) {
  out[subgroup_base + lane_rank] = item;
}
```

50–100× speedup over per-lane `atomicAdd` for predicates passing ≥10% of the time.

## 7. Subgroup operations — the third tier of parallelism

Subgroup ops execute in lockstep within a SIMD unit. They're hardware-accelerated, no LDS round-trip, no barrier needed. Available when `subgroups` feature is requested (Chrome 134+, Safari 26+, Firefox not yet as of May 2026).

**Available builtins (May 2026):**

| Operation | What it does |
|---|---|
| `subgroupBallot(b)` | Returns `vec4<u32>` bitmask, one bit per lane indicating predicate result. Up to 128 lanes. |
| `subgroupAll(b)` / `subgroupAny(b)` | True if predicate true for all/any lanes. |
| `subgroupBroadcast(v, lane)` | Every lane reads `v` from the named lane. Lane index must be const-expression in some impls. |
| `subgroupBroadcastFirst(v)` | Every lane reads `v` from the first active lane. |
| `subgroupAdd/Mul/Min/Max/And/Or/Xor(v)` | Reduction across the subgroup. |
| `subgroupExclusiveAdd(v)` / `subgroupInclusiveAdd(v)` | Per-lane prefix scan. Same for `Mul`. |
| `subgroupShuffle(v, lane)` | Lane-to-lane data exchange. |
| `subgroupShuffleUp/Down(v, delta)` | Shift data within subgroup. |
| `subgroupShuffleXor(v, mask)` | Butterfly exchange — pair lanes at XOR distance. |
| `subgroupElect()` | True for exactly one active lane (the first). |

**Builtins for indexing (Chrome 144+ for `subgroup_id`/`num_subgroups`):**

```wgsl
@builtin(subgroup_size) sz: u32          // lanes in this subgroup (e.g., 32)
@builtin(subgroup_invocation_id) sid: u32 // lane index, [0, sz)
@builtin(subgroup_id) sgi: u32           // subgroup index within workgroup
@builtin(num_subgroups) nsg: u32         // subgroups in this workgroup
```

**The subgroup hierarchy substitutes for LDS in many patterns.** Subgroup scan is ~2× faster than pure-LDS Blelloch on most desktop GPUs, with no barrier cost. The classic pattern: subgroup-scan within subgroup → one value per subgroup goes to LDS → workgroup-level scan over those (small, often single subgroup) → broadcast back.

**Uniformity rules.** Subgroup ops require uniform control flow at the call site — every active lane in the subgroup must reach the same call. Diverged subgroups (some lanes in `if`, some in `else`) can cause UB or validation reject. The WGSL `subgroup_uniformity` diagnostic flags it. Practical: gate subgroup ops on `local_invocation_id` (workgroup-uniform), never on data-dependent branches.

**Feature detection and fallback:** every subgroup-using kernel needs a fallback. The pattern:

```js
const features = adapter.features;
const useSubgroups = features.has('subgroups');
const module = device.createShaderModule({
  code: useSubgroups ? wgslWithSubgroups : wgslWithLDS,
});
```

If you need maximum portability, write only the LDS path. If you need maximum performance and your audience is desktop/mobile-recent, gate at runtime.

## 8. Memory access patterns and coalescing

The single biggest performance lever after picking the right algorithm. Threads in a subgroup ideally read **contiguous memory addresses** — one cache line (typically 128 B = 32 float lanes) per access. Stride-N access wastes bandwidth proportionally.

**Array-of-Structs (AoS) — the trap.** A struct `{ pos: vec3, vel: vec3, color: u32 }` packed in an array forces each lane to read a different cache line for its struct, then strided reads within the struct.

**Struct-of-Arrays (SoA) — the win.** Separate `positions: array<vec4f>`, `velocities: array<vec4f>`, `colors: array<u32>`. Lane *i* of every subgroup pulls `positions[i]` from the same cache line. Coalesced reads at full DRAM bandwidth.

The pattern is so important that pure-WebGPU graph viz (1M particles in 1–4 ms) is *only* achievable with SoA storage. Toji measured 32–64× speedup vs. naïve AoS on subgroup-coalesced loads.

**The vec3 trap.** WGSL packs `vec3<f32>` to 16 bytes in storage buffers (alignment is 16, size is 12 with 4 bytes padding). If you write `array<vec3<f32>>` from JS as packed 12-byte floats, the GPU reads garbage. Either:

- Use `vec4<f32>` and ignore `.w` (or pack metadata in it).
- Use struct with explicit `@align(16)` and write padded layout from JS.
- Enable `unrestricted_pointer_parameters` and `packed_4x8_integer_dot_product` extensions to relax alignment in some contexts (not for vec3 though).

**Transpose to unlock coalescing.** When data is naturally AoS but the kernel reads it strided, a one-time transpose into SoA is almost always worth it. Cost: one pass of 1 read + 1 write per element. Benefit: every subsequent read at full bandwidth.

**`@align()` and `@size()` annotations on struct members** let you force the layout. Useful for matching JS-side typed array layouts:

```wgsl
struct Particle {
  @align(16) pos: vec3<f32>,  // forces 16-byte alignment; 4 bytes of pad after
  @align(16) vel: vec3<f32>,
  age: f32,
}
```

## 9. The five questions, revisited

Before you write any compute kernel, answer these and the algorithm shape falls out:

1. **What's the unit of parallel work?** Per-element (one thread per particle) → 1D dispatch, workgroup 64. Per-cell (one thread per spatial-hash bucket) → smaller dispatch but variable work. Per-tile (one workgroup per image tile) → 2D dispatch, workgroup (8,8) or (16,16).

2. **What's the dispatch shape?** Static known count → `dispatchWorkgroups`. Dynamic, GPU-computed → `dispatchWorkgroupsIndirect` with a producer pass. Variable per-item cost → persistent threads (next file).

3. **Where does the data live?** Read once globally, never reread → no LDS. Read by every thread in the workgroup multiple times → LDS staging. Read once per subgroup → subgroup broadcast. Read across workgroups → one-pass-then-fence-via-new-dispatch.

4. **Where do threads synchronize?** Lockstep within subgroup (subgroup ops). Same workgroup (`workgroupBarrier`). Different workgroup (must end dispatch).

5. **What's the contention pattern?** No shared writes → no atomics. Per-bin counters with hot bins → workgroup-local atomic, then global flush. Stream compaction → subgroup ballot + per-workgroup atomic on a base counter. Force accumulation → quantized fixed-point atomic or CAS-loop on bit-cast.

Every recipe in `gpgpu-recipes.md` is a specific instantiation of those five answers. Internalize the questions; the recipes become consequences, not memorization.

## Common mistakes specific to fundamentals

1. **`textureSample` in compute shaders.** Compute has no implicit derivatives. Use `textureSampleLevel(tex, samp, uv, 0.0)`. Same for `textureSampleCompare` → `textureSampleCompareLevel`.

2. **Storage texture format restrictions.** Most formats are read-only OR write-only in a single shader, not both. Only `r32float`, `r32sint`, `r32uint` allow `read_write`. `bgra8unorm` storage requires `bgra8unorm-storage` feature.

3. **`workgroupBarrier()` inside divergent control flow.** Every invocation must reach the same barrier site. Hoist barriers out of `if` branches. Validation will catch some cases; the spec leaves some as UB.

4. **Indirect-dispatch buffer written and read in same command buffer.** Split into two `submit()` calls (gpuweb#2189).

5. **`dispatchWorkgroups(N, 1, 1)` for any N.** Capped at 65,535 per dimension. For N > 65,535, go 2D dispatch or grid-stride loop.

6. **Atomic floats.** Don't exist in WGSL. Quantize to `atomic<i32>` or `atomicCompareExchangeWeak` on `bitcast<u32>(f)`.

7. **Per-frame bind group allocation.** Build bind groups (including ping-pong A→B and B→A variants) once at init.

8. **`@workgroup_size(1)`.** Wastes 31–63 SIMD lanes per group. Always at least `@workgroup_size(32)`, prefer 64.

9. **Hardcoding subgroup width.** Read `@builtin(subgroup_size)` or query limits. Algorithm logic must adapt at runtime.

10. **Treating LDS as free.** Finite per-SM budget. Larger LDS per workgroup → fewer resident workgroups → less latency hiding.

11. **`read_write` on a buffer that's read-only.** Disables read-only fast paths on some backends. Use `read` storage when the kernel doesn't write.

12. **Cross-workgroup spinlocks.** No forward-progress guarantee. End the dispatch.

13. **Subgroup ops without feature gating.** Always check `device.features.has('subgroups')`. Fall back to LDS-based equivalents.

14. **Assuming uniform 16 KiB LDS.** That's the WebGPU portable cap. Some adapters expose 32–48 KiB; opt-in via `requiredLimits`.

## Cross-references

- **WGSL atomic and barrier syntax in detail** → `references/wgsl.md` § Atomics and barriers.
- **Recipes (scan, sort, hash, BVH, particles, image, ML, indirect)** → `references/gpgpu-recipes.md`.
- **Compute occupancy, SoA vs AoS measurement, profiling** → `references/performance-and-profiling.md`.
- **Buffer/texture model, vec3 padding, alignment rules** → `references/buffers-textures-bindings.md`.
- **Browser/feature detection for `subgroups`, `shader-f16`, etc.** → `references/browser-platform-reality.md`.
- **Canonical upstream sources (W3C spec, WGSL editor's draft, Linebender, Toji, surma)** → `references/sources.md`.
