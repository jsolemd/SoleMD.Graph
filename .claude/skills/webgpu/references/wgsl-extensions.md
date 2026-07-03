---
name: WGSL extensions reference
description: Every WGSL enable extension and language extension with version timeline, browser status, exact syntax, and a worked example. Companion to wgsl.md (language core). Read both.
---

# WGSL extensions

The WGSL spec separates extensions into two flavors:

- **Enable extensions** require `enable <name>;` at module top **and** a
  matching `requiredFeatures` entry on `requestDevice` (e.g. `'shader-f16'`).
  Without the feature on the device, `requestDevice` rejects.
- **Language extensions** are *auto-enabled* when implementations support
  them. Use `requires <name>;` to fail-fast on unsupported targets and to
  signal portability requirements. Detect at runtime with
  `navigator.gpu.wgslLanguageFeatures.has('<name>')` (the WGSLLanguageFeatures
  set, exposed as a JS Set with `has`).

The deprecated `subgroups-f16` feature was removed; instead request
`shader-f16` and `subgroups` together to get f16 inside subgroup ops.

## Version matrix (May 2026)

| Name | Kind | Spec | Chrome | Safari | Firefox | Summary |
|---|---|---|---|---|---|---|
| `f16` | enable | stable | 113+ | 26+ | 141+ | Half-precision; 2× bandwidth wins. Adreno gap. |
| `subgroups` | enable | stable | 134+ | 26+ | TBD | SIMD intrinsics for warp-level scan/reduce/shuffle. |
| `dual_source_blending` | enable | stable | 130+ | 26+ | TBD | Two fragment outputs into one framebuffer. |
| `clip_distances` | enable | stable | 144+ | partial | TBD | User clip planes. |
| `primitive_index` | enable | stable | TBD | TBD | TBD | `@builtin(primitive_index)` in fragment. |
| `packed_4x8_integer_dot_product` | language | stable | 123+ | TBD | TBD | DP4a — INT8 inference, packed-byte attributes. |
| `readonly_and_readwrite_storage_textures` | language | stable | broad | yes | partial | `read_write` storage textures (r32 family). |
| `pointer_composite_access` | language | stable | broad | yes | partial | `(*p).xyz` and `p.xyz` syntax. |
| `unrestricted_pointer_parameters` | language | stable | broad | yes | partial | Pointer params for storage/uniform/workgroup. |
| `uniform_buffer_standard_layout` | language | stable | 144+ | TBD | TBD | Drops 16-byte uniform array stride. |
| `subgroup_id` | language | stable | 144+ | TBD | TBD | `@builtin(subgroup_id)` + `num_subgroups`. |
| `subgroup_uniformity` | language | stable | TBD | TBD | TBD | Relaxes uniformity diagnostics to subgroup scope. |
| `texture_and_sampler_let` | language | stable | 146+ | TBD | TBD | Foundation for future bindless. |
| `linear_indexing` | language | stable | 147+ | TBD | TBD | `global_invocation_index`, `workgroup_index`. |
| `texture_formats_tier1` | language | stable | partial | yes | partial | Broader storage-texture format set. |
| `derivative_uniformity` | enable directive | stable | yes | yes | yes | Stricter uniformity diagnostics for derivatives. |
| `immediate_data` | language | spec listed | TBD | TBD | TBD | `var<immediate>` (push-constant equivalent). |

`derivative_uniformity` is *not* an extension, strictly — it's a
`diagnostic(...)` rule name. Listed here because authors look for it.

## Feature detection pattern

```ts
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
const wantedFeatures = (['shader-f16', 'subgroups', 'clip-distances'] as const)
  .filter(f => adapter.features.has(f));

const device = await adapter.requestDevice({ requiredFeatures: wantedFeatures });

const wgslExt = navigator.gpu.wgslLanguageFeatures;
const hasUboStdLayout = wgslExt.has('uniform_buffer_standard_layout');
const hasSubgroupId   = wgslExt.has('subgroup_id');
const hasLinearIdx    = wgslExt.has('linear_indexing');

const shaderSource = `
  ${wantedFeatures.includes('shader-f16') ? 'enable f16;' : ''}
  ${wantedFeatures.includes('subgroups') ? 'enable subgroups;' : ''}
  ${hasUboStdLayout ? 'requires uniform_buffer_standard_layout;' : ''}
  ${hasSubgroupId   ? 'requires subgroup_id;' : ''}
  // ...
`;
```

`requires` is portability-signaling: if the implementation doesn't
support the named language extension, shader compilation fails fast at
module creation. `enable` is mandatory for enable-extensions and is also
the gate for the underlying device feature being usable.

---

## Enable extensions

### `f16` — half precision

`enable f16;` plus `requiredFeatures: ['shader-f16']`. Adds `f16` scalars,
vectors, matrices. Literal suffix `h` (e.g. `1.5h`).

Half storage cuts bandwidth in half and lets you fit twice as many values
per register. Precision ~3.3 decimal digits; exponent range ±65504. Fine
for color, normals, weights, particle attributes, ML weights/activations;
**not** for absolute world-space positions in scenes larger than ~10
units, where the precision floor (~6.1e-5 at unit scale) exceeds visible
quality.

```wgsl
enable f16;

@group(0) @binding(0) var<storage, read> weights: array<vec4<f16>>;

fn dot_f16(i: u32) -> f32 {
  let w = weights[i];
  return f32(w.x) + f32(w.y) + f32(w.z) + f32(w.w);  // promote to f32 to accumulate
}
```

#### Mixed-precision matmul (the canonical f16 use case)

The headline f16 win. Store `A` and `B` as `f16` (halve bandwidth, double
register packing) and accumulate in `f32` to avoid catastrophic
cancellation. Pattern mirrors CUDA tensor-core kernels:

```wgsl
enable f16;

const TS: u32 = 16u;
@group(0) @binding(0) var<storage, read>       A: array<vec4<f16>>;  // [M, K/4] row-major
@group(0) @binding(1) var<storage, read>       B: array<vec4<f16>>;  // [K, N/4] row-major
@group(0) @binding(2) var<storage, read_write> C: array<f32>;        // [M, N]
@group(0) @binding(3) var<uniform> dims: vec4<u32>;                  // (M, N, K, _)

var<workgroup> aTile: array<vec4<f16>, TS * (TS / 4u)>;  // 16x4 vec4<f16>
var<workgroup> bTile: array<vec4<f16>, TS * (TS / 4u)>;

@compute @workgroup_size(16, 16)
fn matmul(@builtin(global_invocation_id) gid: vec3<u32>,
          @builtin(local_invocation_id)  lid: vec3<u32>) {
  let row = gid.y; let col = gid.x;
  let M = dims.x; let N = dims.y; let K = dims.z;
  var acc: f32 = 0.0;     // accumulate in f32 — never f16
  let tiles = (K + TS - 1u) / TS;
  for (var t: u32 = 0u; t < tiles; t++) {
    if (lid.x < TS / 4u) {
      aTile[lid.y * (TS / 4u) + lid.x] = A[row * (K / 4u) + t * (TS / 4u) + lid.x];
      bTile[lid.y * (TS / 4u) + lid.x] = B[(t * TS + lid.y) * (N / 4u) + lid.x];
    }
    workgroupBarrier();
    for (var k: u32 = 0u; k < TS; k++) {
      let a = aTile[lid.y * (TS / 4u) + (k / 4u)][k % 4u];
      let b = bTile[k       * (TS / 4u) + (col / 4u)][col % 4u];
      acc += f32(a) * f32(b);
    }
    workgroupBarrier();
  }
  if (row < M && col < N) { C[row * N + col] = acc; }
}
```

#### Per-vendor reality

- **Apple Silicon**: f16 storage cuts memory pressure but Metal's f16 ALU
  may run at the same rate as f32 on some GPU families. Bandwidth win is
  real; throughput win depends on the kernel.
- **Intel iGPU**: many Gen11/Gen12 iGPUs emulate f16 by upcasting to f32
  — bandwidth still wins, no compute speedup.
- **Adreno (Qualcomm)**: `shader-f16` not exposed; gate the f16 path on
  `device.features.has('shader-f16')` and ship an f32 fallback.
- **NVIDIA Ampere+ / Apple A14+**: full-rate f16 ALU; this kernel doubles
  throughput.

### `subgroups` — SIMD intrinsics

`enable subgroups;` plus `requiredFeatures: ['subgroups']`. Adds SIMD-level
parallelism: a subgroup is the hardware execution unit (16 / 32 / 64
threads on common GPUs). Subgroup ops run in a single hardware
instruction, eliminating the workgroup-shared-memory dance for
reductions, scans, broadcasts.

#### New builtins

| Builtin | Type | Available in |
|---|---|---|
| `subgroup_invocation_id` | u32 | compute, fragment |
| `subgroup_size` | u32 | compute, fragment |

Subgroup width is hardware-dependent. NVIDIA: 32. AMD RDNA: 32 or 64.
Intel: 8/16/32. Apple: 32. Query at adapter setup:
`adapter.subgroupMinSize` / `adapter.subgroupMaxSize`. The actual
`subgroup_size` available in shader is determined at pipeline creation;
plan for both 32 and 64 in any production code.

#### Operations

**Reductions** (one value broadcast to every lane):
`subgroupAdd, subgroupMul, subgroupMin, subgroupMax, subgroupAnd,
subgroupOr, subgroupXor`.

**Inclusive / Exclusive scans**:
`subgroupInclusiveAdd, subgroupExclusiveAdd, subgroupInclusiveMul,
subgroupExclusiveMul`.

**Voting**: `subgroupAll, subgroupAny, subgroupBallot, subgroupElect`.

**Communication**:
`subgroupBroadcast(v, lane), subgroupBroadcastFirst(v),
subgroupShuffle(v, lane), subgroupShuffleXor(v, mask),
subgroupShuffleUp(v, delta), subgroupShuffleDown(v, delta)`.

**Quad ops** (within a 2×2 fragment quad — fragment stage):
`quadBroadcast(v, lane), quadSwapX(v), quadSwapY(v), quadSwapDiagonal(v)`.

#### Worked example — subgroup-ballot stream compaction

The canonical pattern for "filter active items into a dense output array":

```wgsl
enable subgroups;

@group(0) @binding(0) var<storage, read>       in:    array<u32>;
@group(0) @binding(1) var<storage, read_write> out:   array<u32>;
@group(0) @binding(2) var<storage, read_write> count: atomic<u32>;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>,
      @builtin(subgroup_invocation_id) sid: u32) {
  let v = in[gid.x];
  let active = v != 0u;

  // Every lane votes "am I active?"; we get a mask of which lanes are.
  let ballot = subgroupBallot(active);

  // Lane 0 of each subgroup reserves an output range for its subgroup.
  let n_active = countOneBits(ballot.x) + countOneBits(ballot.y)
               + countOneBits(ballot.z) + countOneBits(ballot.w);
  var base: u32 = 0u;
  if (sid == 0u) { base = atomicAdd(&count, n_active); }
  base = subgroupBroadcastFirst(base);  // share the base across the subgroup

  // Each active lane computes its rank within the subgroup.
  // ballot.x has bits for lanes 0..31; .y for 32..63; etc.
  // For a 32-wide subgroup, only ballot.x is used:
  let mask_below = ballot.x & ((1u << sid) - 1u);
  let rank = countOneBits(mask_below);

  if (active) { out[base + rank] = v; }
}
```

Compaction without subgroups requires `workgroup` shared memory and an
explicit prefix sum — typically 5–10× more code and slower at scale.

#### Worked example — hierarchical scan with `subgroup_id`

The `subgroup_id` language extension (below) adds the subgroup index
within the workgroup, which lets you build a clean two-level scan:

```wgsl
enable subgroups;
requires subgroup_id;

const WG: u32 = 256u;
var<workgroup> partials: array<u32, 8>;   // up to WG / 32 subgroups

@compute @workgroup_size(WG)
fn scan(@builtin(local_invocation_index) li: u32,
        @builtin(subgroup_id) sg: u32,
        @builtin(num_subgroups) ng: u32,
        @builtin(subgroup_invocation_id) sid: u32,
        @builtin(global_invocation_id) gid: vec3<u32>) {
  var v = data[gid.x];
  let inc = subgroupInclusiveAdd(v);   // intra-subgroup scan

  // Lane = subgroup_size - 1 holds the subgroup total
  if (sid == subgroup_size - 1u) { partials[sg] = inc; }
  workgroupBarrier();

  // First subgroup scans the partials array
  if (sg == 0u && sid < ng) {
    partials[sid] = subgroupExclusiveAdd(partials[sid]);
  }
  workgroupBarrier();

  // Add the per-subgroup base to every lane's inclusive value
  data[gid.x] = inc + partials[sg];
}
```

The non-subgroup version of this kernel needs a Brent-Kung or
Blelloch tree over workgroup memory — significantly more code, and
on subgroup-capable hardware noticeably slower.

### `dual_source_blending`

`enable dual_source_blending;` plus `requiredFeatures: ['dual-source-blending']`.
Adds `@blend_src(0)` and `@blend_src(1)` for fragment outputs feeding a
single color attachment with subtractive or constant-color blends. Useful
for high-quality glyph compositing (subpixel AA) and certain particle
sorting tricks.

```wgsl
enable dual_source_blending;

struct FsOut {
  @location(0) @blend_src(0) src:  vec4<f32>,
  @location(0) @blend_src(1) dual: vec4<f32>,
};

@fragment fn fs(in: VsOut) -> FsOut {
  return FsOut(textureSample(rgb_tex, samp, in.uv),
               textureSample(alpha_tex, samp, in.uv));
}
```

### `clip_distances`

`enable clip_distances;` plus `requiredFeatures: ['clip-distances']`. Adds
`@builtin(clip_distances): array<f32, N>` (N up to 8) for vertex-stage
output. Per-vertex user clip planes — useful for cross-sectional views,
guard bands, mirror clipping.

```wgsl
enable clip_distances;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @builtin(clip_distances) clip: array<f32, 1>,
};

@vertex fn vs(@location(0) p: vec3<f32>) -> VsOut {
  var o: VsOut;
  o.pos = camera.viewProj * vec4(p, 1.0);
  o.clip[0] = dot(camera.clip_plane, vec4(p, 1.0));   // clip when negative
  return o;
}
```

### `primitive_index`

`enable primitive_index;` plus `requiredFeatures: ['primitive-index']`.
Adds `@builtin(primitive_index): u32` in fragment-stage input — the
0-based index of the primitive being rasterized. Useful for picking,
visibility buffers, deferred shading without a full G-buffer.

---

## Language extensions

### `uniform_buffer_standard_layout`

`requires uniform_buffer_standard_layout;`. Drops the 16-byte
array-stride rule for uniform buffers. After enabling, uniform buffers
follow storage-buffer layout. Major cleanup for tightly-packed scalar
arrays.

```wgsl
requires uniform_buffer_standard_layout;

// Without the extension you would write:
//   @group(0) @binding(0) var<uniform> weights: array<vec4<f32>, 64>;
// and index weights[i / 4][i % 4]. With it:
@group(0) @binding(0) var<uniform> weights: array<f32, 256>;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = weights[gid.x];   // direct, no swizzle hack
}
```

**Caveat**: top-level uniform struct member alignment to 16 may persist
on some implementations. Verify on your target backend before relying on
tightly-packed scalar struct members. Probe at boot:
`navigator.gpu.wgslLanguageFeatures.has('uniform_buffer_standard_layout')`.

### `subgroup_id`

`requires subgroup_id;`. Adds two builtins for compute shaders when
subgroups are enabled:

| Builtin | Type | Meaning |
|---|---|---|
| `@builtin(subgroup_id)` | u32 | subgroup index within the workgroup |
| `@builtin(num_subgroups)` | u32 | subgroup count in the workgroup |

Before this extension, code reconstructed `subgroup_id` via atomic
counters — a memory-traffic tax for what is conceptually a free hardware
ID. Not yet on the D3D backend; Chrome emulates there.

```wgsl
enable subgroups;
requires subgroup_id;

@compute @workgroup_size(128)
fn cs(@builtin(subgroup_id) sg: u32,
      @builtin(num_subgroups) ng: u32) {
  // ng = 128 / subgroup_size — typically 4 (subgroup_size=32) or 2 (=64)
}
```

See the hierarchical-scan example under `subgroups` above.

### `subgroup_uniformity`

`requires subgroup_uniformity;`. Relaxes the uniformity analysis for
subgroup operations from workgroup-uniformity to subgroup-uniformity.
Useful when you have an algorithm where threads in a subgroup converge
on the same control flow but the workgroup is divergent.

Adds a separate `subgroup_uniformity` diagnostic name (parallel to
`derivative_uniformity`). Suppress per-region with
`diagnostic(off, subgroup_uniformity);` once you've verified correctness.

### `texture_and_sampler_let`

`requires texture_and_sampler_let;` (Chrome 146+). Lets you assign
texture or sampler resource values to a `let` binding within a shader.
Foundation for future bindless support: methods can return textures, and
local naming is permitted.

```wgsl
requires texture_and_sampler_let;

@group(0) @binding(0) var tex_albedo: texture_2d<f32>;
@group(0) @binding(1) var tex_normal: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

fn pick_texture(material_id: u32) -> texture_2d<f32> {
  // This was previously illegal — texture_2d wasn't a returnable type.
  if (material_id == 0u) { return tex_albedo; }
  return tex_normal;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let t = pick_texture(in.material_id);
  let s = samp;
  return textureSample(t, s, in.uv);
}
```

This is *not* full bindless — the texture set is still bound through bind
groups. But it lets you author abstractions over texture choice without
the previous constraint that texture vars only live at module scope.

### `linear_indexing`

`requires linear_indexing;` (Chrome 147+). Adds two compute builtins:

| Builtin | Type | Meaning |
|---|---|---|
| `@builtin(global_invocation_index)` | u32 | flattened dispatch index |
| `@builtin(workgroup_index)` | u32 | flattened workgroup index in dispatch |

Before this extension, you computed these by hand:
`gid.x + gid.y * w + gid.z * w * h`. The new builtins are equivalent but
typed correctly and produced directly by the hardware dispatcher in some
backends.

```wgsl
requires linear_indexing;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_index) gi: u32) {
  // 1-D dispatch over a million elements — no cross-product math
  if (gi >= num_items) { return; }
  process(gi);
}
```

For 1-D kernels (the common case for particle simulation, list processing,
sorting passes), this cleans up the entry-point arithmetic and makes the
dispatch shape change-tolerant.

### `packed_4x8_integer_dot_product`

`requires packed_4x8_integer_dot_product;`. Adds DP4a — the four-wide
8-bit dot product that's been on every shipping GPU since ~2018 and
underpins most INT8 inference. Also adds packed-byte helpers.

#### New functions

- `dot4U8Packed(a: u32, b: u32) -> u32` — sum of four `(a_byte * b_byte)`
  unsigned products.
- `dot4I8Packed(a: u32, b: u32) -> i32` — same, signed.
- `pack4xU8(v: vec4<u32>) -> u32` — pack four 0..255 bytes.
- `pack4xU8Clamp(v: vec4<u32>) -> u32` — same, clamped.
- `pack4xI8(v: vec4<i32>) -> u32` — pack four signed bytes.
- `pack4xI8Clamp(v: vec4<i32>) -> u32` — same, clamped.
- `unpack4xU8(v: u32) -> vec4<u32>` — unpack four bytes.
- `unpack4xI8(v: u32) -> vec4<i32>` — unpack four signed bytes.

#### Worked example — INT8 inference inner loop

The headline use case. Quantized weights and activations packed four per
u32; sum products with `dot4U8Packed`; accumulate into u32 (or i32 for
signed). Single hardware instruction on Ampere/RDNA/Apple/Adreno.

```wgsl
requires packed_4x8_integer_dot_product;

@group(0) @binding(0) var<storage, read>       weights: array<u32>;        // [out, in/4] packed
@group(0) @binding(1) var<storage, read>       acts:    array<u32>;        // [in/4] packed
@group(0) @binding(2) var<storage, read_write> result:  array<u32>;        // [out]
@group(0) @binding(3) var<uniform> dims: vec2<u32>;                        // (out, in/4)

@compute @workgroup_size(64)
fn matvec_int8(@builtin(global_invocation_id) gid: vec3<u32>) {
  let out_i = gid.x;
  if (out_i >= dims.x) { return; }
  var acc: u32 = 0u;
  let row_base = out_i * dims.y;
  for (var i: u32 = 0u; i < dims.y; i = i + 1u) {
    acc = acc + dot4U8Packed(weights[row_base + i], acts[i]);
  }
  result[out_i] = acc;
}
```

This kernel is bandwidth-bound on most hardware — INT8 quantization and
DP4a are how transformer inference fits on a phone GPU.

#### Packed graph attributes

Color (RGBA), edge-flag bytes, octahedral-encoded normals, byte-quantized
positions for distant LOD: all pack into a single `u32` per attribute. Use
`unpack4xU8(v)` to recover floats when sampling.

### `pointer_composite_access`

`requires pointer_composite_access;`. Lets you index/swizzle through a
pointer without the explicit dereference: `p.field` instead of `(*p).field`,
`p[i]` instead of `(*p)[i]`, `p.xyz` instead of `(*p).xyz`.

```wgsl
requires pointer_composite_access;

fn translate(p: ptr<function, vec4<f32>>, dx: f32) {
  p.x = p.x + dx;     // was: (*p).x = (*p).x + dx;
}
```

A small ergonomic win that keeps the language closer to what GLSL/HLSL
authors expect.

### `unrestricted_pointer_parameters`

`requires unrestricted_pointer_parameters;`. Allows pointer parameters to
be in `storage`, `uniform`, or `workgroup` address space, not just
`function` and `private`. Lets you write helper functions over storage
buffers without copying the entire struct.

```wgsl
requires unrestricted_pointer_parameters;

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;

fn integrate(p: ptr<storage, Particle, read_write>, dt: f32) {
  (*p).pos = (*p).pos + (*p).vel * dt;
  (*p).vel = (*p).vel + gravity * dt;
}

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  integrate(&particles[gid.x], frame.dt);
}
```

Without this extension, the function would have to take `Particle` by
value (forcing a full struct copy) or be inlined manually.

### `readonly_and_readwrite_storage_textures`

`requires readonly_and_readwrite_storage_textures;`. Adds `read` and
`read_write` access modes for storage textures — previously
`write`-only. Without features, only the r32 family
(`r32float`, `r32sint`, `r32uint`) supports `read_write`.

```wgsl
requires readonly_and_readwrite_storage_textures;

@group(0) @binding(0) var img: texture_storage_2d<r32float, read_write>;

@compute @workgroup_size(8, 8)
fn smooth(@builtin(global_invocation_id) gid: vec3<u32>) {
  let c = vec2<i32>(gid.xy);
  let cur = textureLoad(img, c).x;
  let nbr = textureLoad(img, c + vec2(1, 0)).x;
  textureStore(img, c, vec4(0.5 * (cur + nbr)));
}
```

For multi-channel formats requiring `read_write`, you need additional
device features (`float32-filterable`, format-specific feature flags).

### `texture_formats_tier1` / `texture_formats_tier2`

`requires texture_formats_tier1;` (or tier2). Broaden the set of texel
formats permitted as storage textures and as sampled-then-filtered. Tier
1 covers most rgba/rg/r 8-norm and 16-float formats; tier 2 adds the rest.
Each tier maps to a corresponding device feature.

### `immediate_data` (push constants)

`requires immediate_data;`. Spec-listed; verify Chrome implementation
status before relying. Adds `var<immediate>` for push-constant-style
small per-draw data without a uniform buffer.

```wgsl
requires immediate_data;

struct ImmediateConsts { model: mat4x4<f32>, color: vec4<f32>, };
var<immediate> consts: ImmediateConsts;

@vertex fn vs(@location(0) p: vec3<f32>) -> @builtin(position) vec4<f32> {
  return camera.viewProj * consts.model * vec4(p, 1.0);
}
```

Until widely shipped, the canonical equivalent is a single uniform buffer
with `setBindGroup(group, bg, [dynamicOffset])` and one struct slot per
draw; see `references/buffers-textures-bindings.md`.

### `derivative_uniformity` (diagnostic, not extension)

Not an extension proper but a `diagnostic(...)` rule name. Default
severity: error. Triggers when a builtin that requires uniform CF for
derivatives (e.g. `textureSample`, `dpdx`) is reached from non-uniform
control flow.

```wgsl
diagnostic(off, derivative_uniformity);   // module-scope suppression

fn shade(uv: vec2<f32>, mask: f32) -> vec4<f32> {
  if (mask < 0.5) { discard; }
  return textureSample(tex, samp, uv);    // would otherwise warn
}
```

Suppress only after verifying correctness. The right fix is usually to
hoist the sample above the divergent branch or use `textureSampleLevel` /
`textureSampleGrad` (no derivatives).

---

## Deprecated and removed

- **`subgroups-f16`** — feature removed; request `shader-f16` and
  `subgroups` together to get f16 inside subgroup ops.
- **`compatibilityMode: true`** adapter flag — replaced by
  `featureLevel: 'compatibility'` on `requestAdapter`.

## Detection summary cheat-sheet

```ts
// Enable extensions: query adapter, request as device feature
adapter.features.has('shader-f16');
adapter.features.has('subgroups');
adapter.features.has('dual-source-blending');
adapter.features.has('clip-distances');
adapter.features.has('primitive-index');

// Language extensions: query WGSL feature set
const wf = navigator.gpu.wgslLanguageFeatures;
wf.has('uniform_buffer_standard_layout');
wf.has('subgroup_id');
wf.has('subgroup_uniformity');
wf.has('texture_and_sampler_let');
wf.has('linear_indexing');
wf.has('packed_4x8_integer_dot_product');
wf.has('pointer_composite_access');
wf.has('unrestricted_pointer_parameters');
wf.has('readonly_and_readwrite_storage_textures');
wf.has('immediate_data');
```

## Cross-references

- `wgsl.md` — the language core. Read first.
- `references/compute-fundamentals.md` — subgroups, LDS, barriers, atomics,
  the building-block reference.
- `references/gpgpu-recipes.md` — how subgroups, atomics, and barriers
  combine in real algorithms (sort, scan, BVH, force-directed layout).
- `references/buffers-textures-bindings.md` — bind-group layouts, storage
  texture formats, the JS side of dynamic-offset uniforms (the
  push-constant alternative until `immediate_data` ships).
- `references/performance-and-profiling.md` — measuring whether `f16`
  buys you bandwidth and whether subgroup ops actually win on your
  target hardware.
- `references/browser-platform-reality.md` — feature-detection patterns
  and per-vendor extension support gaps.
