---
name: WGSL — the language
description: WebGPU Shading Language deep reference — type system, address spaces (and what they map to in hardware), alignment + size rules, control flow + uniformity, textures and samplers, atomics and barriers, override constants, pointers, every common mistake. Extensions split into wgsl-extensions.md.
---

# WGSL — language reference

Companion file: `wgsl-extensions.md` — every WGSL extension (f16, subgroups,
packed_4x8, uniform_buffer_standard_layout, subgroup_id, subgroup_uniformity,
texture_and_sampler_let, linear_indexing, immediate_data, …) with worked
examples. Keep both open when you author non-trivial shaders.

## Mental model

WGSL is a memory-safe shading language with strong static typing, no
recursion, and a deliberate mapping to the underlying hardware. The four
features that bite hardest if you ignore them:

1. **Address spaces** are not arbitrary categories — they map directly to
   physical memory regions (registers, on-chip SRAM, off-chip VRAM). Choose
   the wrong one and you trade a 1-cycle access for hundreds of cycles, or you
   blow up the per-thread state of every invocation in flight.
2. **Layout** (alignment + size) is unforgiving. The compiler and validator
   silently respect the rules; the bytes you upload from JS do not, unless
   you're disciplined. The same struct is laid out *differently* in `uniform`
   vs `storage` unless you opt into `uniform_buffer_standard_layout`.
3. **Uniformity** is a compile-time analysis: derivatives, `textureSample`,
   barriers, and many subgroup ops require **uniform control flow**. A
   `discard` or a varying-driven branch poisons everything that follows
   in the same control region.
4. **No recursion**, no function pointers, no exceptions, `let` is immutable,
   `++` is a statement, ternary `?:` doesn't exist. The language is small;
   the rules are precise.

## Type system

### Scalars

| Type | Notes |
|---|---|
| `bool` | NOT host-shareable — cannot live in `uniform`/`storage`. Use `u32` masks at the buffer boundary. |
| `i32`, `u32` | 32-bit signed/unsigned. No implicit conversions between them or to `f32`. |
| `f32` | 32-bit IEEE 754 single. Default float type. |
| `f16` | 16-bit IEEE 754 half. Requires `enable f16;` and `shader-f16` device feature. |
| `AbstractInt`, `AbstractFloat` | Internal types for literal/const inference; collapse to concrete `i32`/`f32` at point of use. |

`bool` non-host-shareability is one of the most surprising rules: you
cannot directly read a JS-side flag as `bool` in a uniform buffer. Pack as
`u32` with `0`/`1` and convert with `bool(x)`.

There is no `f64`. GPUs don't have hardware double precision at any useful
rate; the shading language refuses to give you a footgun.

### Vectors

`vec2<T>`, `vec3<T>`, `vec4<T>` for scalar `T`. Component access via `.x .y .z .w`,
`.r .g .b .a`, or arbitrary swizzles `.xyzw`, `.xxyy`, `.zyx`. Constructors:
`vec3(1.0, 2.0, 3.0)`, `vec4(rgb, 1.0)`, `vec3(0.0)` (broadcast).

### Matrices

`matCxR<T>` is `C` columns × `R` rows of `T` (currently `f32` or `f16`),
**stored column-major**. Conceptually `array<vecR<T>, C>`. Index a column as
`m[col]` (returns a `vecR`), an element as `m[col][row]`.

WGSL's column-major convention matches GLSL/Metal/HLSL; if you transpose to
row-major in your CPU code (common in C / .NET ecosystems), you must flip
back. `transpose(m)` is cheap; mismatched assumptions are silent corruption.

### Arrays

Two flavors:

- **Fixed-size**: `array<T, N>` where `N` is a const-expression. Override
  constants are NOT permitted as array sizes outside spec carveouts.
- **Runtime-sized**: `array<T>` is legal **only as the last member of a
  struct in the `storage` address space**. Length queried via
  `arrayLength(&buf.items)` returning `u32`.

`array<T, N>` is value-typed: `let a = b;` copies all `N` elements. Pass
arrays through pointers or storage bindings to avoid copies.

### Structs

Nominal types. Members declared with attributes for layout (`@align(N)`,
`@size(N)`) and bindings (`@location`, `@builtin`, `@interpolate`). No
methods; no inheritance.

### Pointers

`ptr<AS, T, AM>` where `AS` is the address space, `T` is the pointee type,
and `AM` is the access mode (`read` or `read_write`; defaults vary by AS).
Pointers can only be formed by `&` to a `var` declaration; cannot be
returned from functions; cannot be stored in variables (only used as
function parameters and local `let` bindings).

```wgsl
fn add_to(p: ptr<function, vec3<f32>>, v: vec3<f32>) {
  *p = *p + v;
}
```

The **`unrestricted_pointer_parameters`** language extension expands
the set of address spaces you can pass through pointer parameters
(see `wgsl-extensions.md`).

The **`pointer_composite_access`** extension lets you write `p.field`
or `p[i]` instead of `(*p).field` / `(*p)[i]`.

### Texture and sampler types

Opaque handle types — see "Textures and samplers" below. Always
declared at module scope with `@group @binding`; the
`texture_and_sampler_let` extension (Chrome 146+) permits `let`
indirection as a precursor to bindless.

## Address spaces — the hardware mapping

This is the single most important section to internalize. Each address
space corresponds to a physical memory region with vastly different
performance characteristics.

| Space | Hardware | Speed | Capacity | Lifetime |
|---|---|---|---|---|
| `function` | Register file / scratchpad | 1 cycle | ~256 32-bit regs/thread typical | One invocation |
| `private` | Global memory (off-chip VRAM) | 100s of cycles | per-thread × (threads in flight) | One invocation |
| `workgroup` | On-chip shared SRAM | ~5× register | 16 KiB hard limit | One workgroup |
| `uniform` | Constant cache (on-chip) | ~register fast on hit | 64 KiB typical | Bind-group |
| `storage` | Global memory (off-chip VRAM) | 100s of cycles, cached | up to 2 GiB | Bind-group |
| `handle` | Texture/sampler descriptor | n/a | n/a | Bind-group |

### `function` — registers

Default for `var x: T;` and `let x = ...;` inside functions. The compiler
allocates registers; spills go to private/scratch on overflow. Free in the
common case. If your function accumulates a large array (`array<f32, 4096>`),
the compiler will spill — measure.

### `private` — per-thread global

`var<private> x: T;` at module scope. Lives in global memory, **N copies**
where N = total simultaneous in-flight invocations (potentially millions).
The size limit is 8192 bytes per shader for *statically accessed* private
variables. Use sparingly; almost always wrong for arrays. Never use
`private` for a scratchpad you read across function calls — `let` bindings
in `function` space are cheaper.

### `workgroup` — on-chip SRAM

`var<workgroup> shared: array<f32, 256>;` at module scope. Allocated
**once per workgroup**, shared by every invocation in that workgroup,
zero-initialized at workgroup start. ~5× register speed on hit; banked, so
strided access patterns can serialize.

**16 KiB hard limit per shader**, summed across all `workgroup` variables.
Going over fails pipeline creation. The classic kernel pattern:

```wgsl
const TS: u32 = 16u;
var<workgroup> tile: array<f32, TS * TS>;  // 1 KiB

@compute @workgroup_size(TS, TS)
fn cs(@builtin(local_invocation_id) lid: vec3<u32>,
      @builtin(global_invocation_id) gid: vec3<u32>) {
  tile[lid.y * TS + lid.x] = input[gid.y * stride + gid.x];
  workgroupBarrier();
  // ... use tile cooperatively ...
}
```

**Trap:** `var<workgroup> a: array<vec3<f32>, 64>;` allocates 1024 bytes
(stride 16), not 768. Same vec3 alignment rule as everywhere else.

### `uniform` — broadcast constants

`var<uniform> u: U;` for read-only data the same across all invocations
in the dispatch. Lives in a fast constant cache; one of the cheapest reads
in WebGPU when the cache hits and every invocation reads the same address.

**Limits:** 64 KiB per binding (typical; query `device.limits.maxUniformBufferBindingSize`).
If your data is larger, split or move to storage.

**Strict layout**: arrays at top level must have stride that is a multiple
of 16 (each element padded if needed). Unless you opt in via
`uniform_buffer_standard_layout` (see `wgsl-extensions.md`).

### `storage` — large mutable data

`var<storage, read>` (read-only) or `var<storage, read_write>` (full).
Default is `read`; you must spell out `read_write` to write. Up to ~2 GiB
per binding. Supports atomics. Required for runtime-sized arrays. Layout
rules are the relaxed ("storage") rules — no 16-byte array stride.

**Caching:** storage reads go through L1/L2 caches. Coalesced access (each
thread in a subgroup reads adjacent memory) is 30–60× faster than strided.
SoA layout is the canonical pattern for million-element workloads.

### `handle` — opaque

Implicit address space for texture and sampler resource variables.
Untyped pointers don't exist; you cannot form `ptr<handle, ...>`.

### `push_constant` / `var<immediate>`

Native backends expose push constants as `var<push_constant>`; in browsers
the standards-track replacement is the `immediate_data` language extension
(`var<immediate>`) which is listed in the WGSL spec but not yet broadly
shipping. Until it lands, the alternatives are:
- Uniform buffer with `setBindGroup(group, bindGroup, [dynamicOffset])` and
  one struct per draw at fixed offsets (the canonical pattern).
- Small storage buffer indexed by `instance_index`.

## Memory layout — alignment and size

The trap that bites every author. WGSL's layout rules apply at the
host-shareable boundary (`uniform`, `storage`, `push_constant`). The
compiler and validator enforce them; your TypedArray uploads do not.

### The roundUp formula

`roundUp(k, n) = ⌈n / k⌉ × k` — round `n` up to the next multiple of `k`.

### Scalars

| Type | AlignOf | SizeOf |
|---|---|---|
| `bool` (function/private only) | 4 | 4 |
| `i32`, `u32`, `f32` | 4 | 4 |
| `f16` | 2 | 2 |

### Vectors

| Vector | AlignOf | SizeOf |
|---|---|---|
| `vec2<T32>` | 8 | 8 |
| `vec3<T32>` | **16** | **12** |
| `vec4<T32>` | 16 | 16 |
| `vec2<f16>` | 4 | 4 |
| `vec3<f16>` | 8 | 6 |
| `vec4<f16>` | 8 | 8 |

**`vec3` is the canonical footgun**: alignment 16, size 12. The 4-byte gap
is real and observed: in `array<vec3<f32>, N>`, stride is 16 (driven by the
element's *alignment*, not its size). In a struct, the next member starts
at the offset rounded up to its own alignment, so a single `vec3<f32>`
followed by a `f32` may *fit* the f32 into the padding (offset 12), but a
`vec3<f32>` followed by a `vec4<f32>` advances to offset 16.

### Matrices

| Matrix | AlignOf | SizeOf |
|---|---|---|
| `mat2x2<f32>` | 8 | 16 |
| `mat3x2<f32>` | 8 | 24 |
| `mat4x2<f32>` | 8 | 32 |
| `mat2x3<f32>` | 16 | 32 (each col 16 — vec3 padding) |
| `mat3x3<f32>` | 16 | 48 |
| `mat4x3<f32>` | 16 | **64** |
| `mat2x4<f32>` | 16 | 32 |
| `mat3x4<f32>` | 16 | 48 |
| `mat4x4<f32>` | 16 | 64 |

**`matCx3` is the second classic footgun**: each column is a padded vec3,
so `mat4x3<f32>` is **64 bytes**, not 48. Naive packing from a JS
`Float32Array` of length 12 silently corrupts the last column. The cure is
to lay out as `mat4x4<f32>` and ignore the last row, or store as four
`vec4<f32>` columns and pack in JS with one stride-4 stride.

### Arrays

`array<T, N>` element stride is `roundUp(AlignOf(T), SizeOf(T))`.

- In `storage`: stride is exactly that.
- In `uniform`: stride is `roundUp(16, that)` — i.e., padded to the next
  multiple of 16.

`array<f32, 256>` in storage uses 1024 bytes; in uniform (without
`uniform_buffer_standard_layout`) the validator rejects it. Wrap as
`array<vec4<f32>, 64>` and index `[i / 4][i % 4]`, or move to storage,
or enable the extension.

### Structs

Member offset = `roundUp(AlignOf(member), previous_offset + SizeOf(previous))`,
or larger if the member has explicit `@align(N)`.

Struct AlignOf = max(AlignOf(member)) — or larger if any member has
`@align`. Struct SizeOf = offset past last member, rounded up to struct
AlignOf.

`@size(N)` forces a member to occupy at least `N` bytes (padded with
unspecified bytes after).

### Worked example — the trap exposed

```wgsl
struct Particle {
  pos:    vec3<f32>,   // offset 0,  size 12
  ttl:    f32,         // offset 12 — fits into vec3 padding (legal in storage)
  vel:    vec3<f32>,   // offset 16
  mass:   f32,         // offset 28
};                     // total size 32 in storage
```

The same struct in `uniform` (without `uniform_buffer_standard_layout`)
keeps the same field offsets but **must be padded to a multiple of 16**.
Total size is 32, already a multiple of 16, so this one is portable.

Try a different struct:

```wgsl
struct Bad {
  pos:    vec3<f32>,   // offset 0,  size 12
  vel:    vec3<f32>,   // offset 16 (vec3 alignment forces it!)
  ttl:    f32,         // offset 28
};                     // size 32 in both
```

If your JS code packs `[px, py, pz, vx, vy, vz, ttl]` (7 floats = 28 bytes)
the GPU reads `vx, vy, vz` for `vel` from the wrong location — your TTL
becomes the third component of velocity. Symptom: positions roughly right,
velocities catastrophically wrong, no error. The fix is `[px, py, pz, _,
vx, vy, vz, ttl]` (8 floats = 32 bytes).

### Storage vs uniform — the rule that bites

Two extra constraints in `uniform` (relaxed by the
`uniform_buffer_standard_layout` extension; see `wgsl-extensions.md`):

1. **Array element stride must be a multiple of 16.**
2. **In some implementations, top-level uniform struct members are aligned
   to 16.** Verify before relying on tightly-packed scalar uniforms.

For everything except small camera/light constant blocks, *use storage*.

## Variable kinds

| Keyword | Where | Mutable | Address space |
|---|---|---|---|
| `const` | module or fn | no | n/a — compile-time literal |
| `override` | module only | (set at pipeline create) | n/a |
| `let` | function only | no (immutable binding) | function |
| `var` (no annotation, in fn) | function | yes | function |
| `var<AS>` (module) | module | yes (depends on AS) | as named |

**`const`** values are evaluated at shader-module creation. Usable in
array sizes, attribute arguments, anywhere a const-expression is required.

**`override`** values are evaluated at pipeline creation. The API supplies
them via the `constants` map keyed by identifier or by `@id(N)`. Usable in
`@workgroup_size`, in initializer expressions, in `array<T, N>` *only*
where the spec carves out (specifically not in non-workgroup arrays).

```wgsl
override @id(0) WG_X: u32 = 64;
override @id(1) BLOOM_RADIUS: u32 = 4;

@compute @workgroup_size(WG_X, 1, 1)
fn cs() { /* ... */ }
```

```ts
device.createComputePipelineAsync({
  layout, compute: { module, entryPoint: 'cs',
    constants: { '0': 128, '1': 8 },  // numeric @id keys (string-encoded)
  },
});
```

Numeric `@id` is the right choice for any pipeline shipped through
obfuscation/minification. Identifier keys are fine when source readability
trumps stable IDs.

**`let`** is *immutable binding*, not "compile-time const". Runtime values
are fine; you just can't reassign. Evaluated at runtime.

**`var`** at function scope is mutable, lives in function space (registers
or scratch). At module scope `var` is illegal without an explicit address
space. Module-scope `var<private>`, `var<workgroup>`, `var<uniform>`,
`var<storage>` are the only forms.

## Entry points and stages

Three stages: `@vertex`, `@fragment`, `@compute`. An entry point is a free
function with one of those attributes. **Cannot be called from another
shader function** — the entry point is the dispatch root. Inputs are
listed in the parameter list with `@location` or `@builtin`; outputs are
the return type.

### Vertex

```wgsl
struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) id: u32,
};

@vertex
fn vs_main(@location(0) p: vec3<f32>,
           @location(1) uv: vec2<f32>,
           @builtin(instance_index) inst: u32) -> VsOut {
  var o: VsOut;
  o.pos = camera.viewProj * vec4(p, 1.0);
  o.uv = uv;
  o.id = inst;
  return o;
}
```

### Fragment

Outputs use `@location(N)` for color attachments. `@builtin(frag_depth)`
writes Z. `@builtin(sample_mask)` outputs coverage. MRT via struct return:

```wgsl
struct FsOut {
  @location(0) color:  vec4<f32>,
  @location(1) normal: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};
```

Inter-stage interpolation: `@interpolate(perspective|linear|flat,
center|centroid|sample|first|either)`. Integer locations (`i32`/`u32`)
**must** be `@interpolate(flat, ...)` — interpolation of integers is not
defined. `first` and `either` sampling modes shipped Chrome 128.

### Compute

```wgsl
@compute @workgroup_size(64)
fn cs_main(
  @builtin(global_invocation_id)   gid: vec3<u32>,
  @builtin(local_invocation_id)    lid: vec3<u32>,
  @builtin(local_invocation_index) li:  u32,
  @builtin(workgroup_id)           wid: vec3<u32>,
  @builtin(num_workgroups)         n:   vec3<u32>,
) { /* ... */ }
```

`local_invocation_index` is the flattened 1-D index — for 2-D / 3-D
workgroups it is `lid.x + lid.y*size_x + lid.z*size_x*size_y`.

The **`linear_indexing`** extension (Chrome 147+) adds
`@builtin(global_invocation_index)` and `@builtin(workgroup_index)` for
the dispatch grid — see `wgsl-extensions.md`.

## Built-in values reference

| Stage | Builtin | Type | Meaning |
|---|---|---|---|
| vertex in | `vertex_index` | u32 | index of vertex in draw call |
| vertex in | `instance_index` | u32 | index of instance in draw call |
| vertex out / fragment in | `position` | vec4f | clip-space (vert) → framebuffer (frag) |
| fragment in | `front_facing` | bool | true if front-facing |
| fragment in | `sample_index` | u32 | sample being processed (multisample) |
| fragment in | `sample_mask` | u32 | input coverage |
| fragment out | `frag_depth` | f32 | depth override |
| fragment out | `sample_mask` | u32 | output coverage |
| compute in | `local_invocation_id` | vec3u | position within workgroup |
| compute in | `local_invocation_index` | u32 | flattened index within workgroup |
| compute in | `global_invocation_id` | vec3u | position within dispatch |
| compute in | `workgroup_id` | vec3u | position of workgroup in dispatch |
| compute in | `num_workgroups` | vec3u | dispatch size |
| compute in | `subgroup_invocation_id` | u32 | invocation index in subgroup |
| compute in | `subgroup_size` | u32 | hardware subgroup width |
| compute in | `subgroup_id`* | u32 | subgroup index in workgroup |
| compute in | `num_subgroups`* | u32 | subgroup count in workgroup |
| compute in | `global_invocation_index`† | u32 | flattened dispatch index |
| compute in | `workgroup_index`† | u32 | flattened workgroup index |
| fragment in | `primitive_index`‡ | u32 | primitive being rasterized |
| vertex out | `clip_distances`‡ | array<f32, N> | user clip planes |

\* requires the `subgroup_id` language extension (Chrome 144+).
† requires the `linear_indexing` extension (Chrome 147+).
‡ requires the matching enable extension (`primitive_index`, `clip_distances`).

## Control flow

Statements: `if`/`else`, `switch`, `loop`, `while`, `for`, `break`,
`continue`, `return`, `discard` (fragment only). Compound assignments
(`+=`, `-=`, etc.) and `++`/`--` are statements, **not expressions**.

### `if`/`else`

Conditions must be `bool`. No implicit conversion from `i32`/`u32` (no
`if (count)` — write `if (count > 0u)`).

### `switch`

```wgsl
switch (kind) {
  case 0u: { /* ... */ }
  case 1u, 2u: { /* fall-through cases require commas, not implicit */ }
  default: { /* mandatory */ }
}
```

Selector must be `i32` or `u32`. **No fallthrough** — every case is
implicit `break`. Comma-separated case values share a body. **`default`
is mandatory.**

### Loops

```wgsl
for (var i: u32 = 0u; i < N; i = i + 1u) { /* ... */ }
while (cond) { /* ... */ }
loop {
  if (!cond) { break; }
  // body
  continuing {
    // runs at end of every iteration, even after `continue`
    break if cond2;
  }
}
```

The `continuing` block is the canonical place for back-edge update logic.
Restrictions: **no early returns or barriers in `continuing`**, and the
`break if` form replaces a regular `break` at the bottom.

`for` and `while` desugar into `loop` + `continuing`. Bounded loops with
const trip counts may be unrolled by the compiler; runtime-bounded loops
are typically preserved (issue gpuweb#3636 tracks codegen pessimization on
some runtime loops).

### `select` instead of ternary

WGSL has no `cond ? a : b`. Use `select(falseExpr, trueExpr, cond)`.
**Argument order is inverted from C** — false comes first. The most common
WGSL bug after the vec3 trap.

```wgsl
let v = select(0.0, 1.0, x > 0.0);  // 1.0 if x > 0
```

`select` accepts component-wise booleans for vector selection:
`select(vec3(0.0), vec3(1.0), vec3(true, false, true))`.

### `discard`

Fragment-only. Kills the fragment — no output written, no depth/stencil
update. **Cost**: many GPUs disable early-Z (depth-before-shading
optimization) on shaders that contain `discard`, even on paths that don't
hit it. If you can write a depth-prepass instead, do.

`discard` does NOT guarantee that subsequent shader code stops executing
(the spec used to require this; current spec is more permissive). Treat it
as best-effort termination; do not rely on it for performance.

### No recursion

Function call graph must be a DAG. Direct or indirect recursion is a
compile error: "function call cycle detected".

### `return`

`return value;` returns from a function. Entry points return their declared
output struct; `return` without a value is legal only when the return type
is unit.

## Uniformity analysis — the senior gotcha

Some operations require **uniform control flow** — the analysis must prove
that all invocations in a "uniform group" reach the call together, with
identical values for relevant inputs. Operations that require uniformity:

- `textureSample`, `textureSampleBias`, `textureSampleCompare` — need
  implicit derivatives across the 2×2 fragment quad.
- `dpdx`, `dpdy`, `fwidth` and their `Coarse`/`Fine` variants — derivative
  intrinsics.
- `workgroupBarrier`, `storageBarrier`, `textureBarrier` — every
  invocation must hit the same barrier or the workgroup deadlocks.
- `workgroupUniformLoad(ptr)` — loads one value into all invocations of a
  workgroup; the *load itself* must be in workgroup-uniform CF.
- Subgroup ops, when called from fragment stage with the relevant
  uniformity flavor.

The fragment-quad case is the most common gotcha. Fragment shaders run in
**2×2 pixel blocks** so the hardware can compute derivatives by finite
differencing the four invocations. If one of those four takes a different
branch, the derivative is undefined — the implementation may return zero,
NaN, or whatever happened to be in the register. The spec mandates
**uniform control flow** to keep this defined.

### `derivative_uniformity` diagnostic

The compiler emits `derivative_uniformity` (default severity: error) when
it can't prove uniform control flow at a derivative-requiring call site.
Chrome's stricter Tint frontend warns or errors; older relaxed frontends
silently accepted these and produced undefined output.

The classic failure pattern:

```wgsl
@fragment
fn fs(@location(0) uv: vec2<f32>, @location(1) mask: f32) -> @location(0) vec4<f32> {
  if (mask < 0.5) { discard; }
  return textureSample(tex, samp, uv);   // derivative_uniformity error
}
```

`discard` makes the rest of the fragment "non-uniform" because some
fragments terminate. Three fixes:

```wgsl
// 1. Use textureSampleLevel — explicit LOD, no derivatives needed
return textureSampleLevel(tex, samp, uv, 0.0);

// 2. Hoist the sample above the divergent branch
let color = textureSample(tex, samp, uv);
if (mask < 0.5) { discard; }
return color;

// 3. Suppress the diagnostic (only when you've verified correctness)
diagnostic(off, derivative_uniformity);
```

The `subgroup_uniformity` diagnostic plays the same role for subgroup
calls — see `wgsl-extensions.md` on the `subgroup_uniformity` extension.

### `workgroupUniformLoad`

`workgroupUniformLoad(ptr<workgroup, T>) -> T` — the canonical pattern for
broadcasting a single workgroup memory value to every invocation. The load
itself must be in workgroup-uniform CF; the result is treated as
workgroup-uniform afterward, which lets you safely use it in
control-flow conditions that wrap a barrier.

```wgsl
var<workgroup> shared_count: atomic<u32>;
@compute @workgroup_size(64)
fn cs(@builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&shared_count, compute_count()); }
  workgroupBarrier();
  let n = workgroupUniformLoad(&shared_count);   // safe broadcast
  for (var i = li; i < n; i = i + 64u) { /* ... */ }
}
```

## Textures and samplers

### Type taxonomy

- **Sampled**: `texture_1d<T>`, `texture_2d<T>`, `texture_2d_array<T>`,
  `texture_3d<T>`, `texture_cube<T>`, `texture_cube_array<T>`. T is `f32`,
  `i32`, or `u32` and must match the bound texture's sample type.
- **Multisampled**: `texture_multisampled_2d<T>`, `texture_depth_multisampled_2d`.
  No mips; only `textureLoad` (with `sample_index`).
- **Depth**: `texture_depth_2d`, `_2d_array`, `_cube`, `_cube_array`.
  Returns `f32` scalar (no swizzle).
- **Storage**: `texture_storage_*<F, A>`. F is a TexelFormat
  (`rgba8unorm`, `r32float`, `rgba16float`, …). A is `read`, `write`, or
  `read_write` (with `readonly_and_readwrite_storage_textures`).
- **External**: `texture_external` — for `importExternalTexture` (video
  frames). Sample only with `textureSampleBaseClampToEdge`.

### Samplers

`sampler` and `sampler_comparison` (depth-compare). Filterable vs
non-filterable is a **bind-group-layout** property, not a WGSL type.
Mismatched layouts fail at pipeline creation.

### Function reference

| Function | Purpose | Stage / uniformity |
|---|---|---|
| `textureSample(t, s, c [, arr, off])` | filtered sample, implicit LOD | fragment-only, uniform CF |
| `textureSampleLevel(t, s, c, lod [, …])` | explicit LOD | any stage, no uniformity |
| `textureSampleBias(t, s, c, bias [, …])` | implicit LOD + bias | fragment-only, uniform CF |
| `textureSampleGrad(t, s, c, ddx, ddy [, …])` | explicit gradients | any stage, no uniformity |
| `textureSampleCompare(t, sc, c, ref [, …])` | PCF compare | fragment-only, uniform CF |
| `textureSampleCompareLevel(t, sc, c, ref, …)` | compare at level 0 | any stage, no uniformity |
| `textureLoad(t, c, level_or_sample)` | unfiltered fetch, integer coords | any stage |
| `textureStore(t, c [, arr], v)` | storage write | any stage |
| `textureGather(comp, t, s, c [, …])` | vec4 of one channel from 2×2 | any stage |
| `textureGatherCompare(t, sc, c, ref [, …])` | gather + compare | any stage |
| `textureSampleBaseClampToEdge(t, s, c)` | required for `texture_external` and one `texture_2d<f32>` form | any stage |
| `textureDimensions(t [, level])` | dimensions vec | any stage |
| `textureNumLayers(t)` / `textureNumLevels(t)` / `textureNumSamples(t)` | metadata | any stage |

**Compute-shader rule:** never use `textureSample` (no derivatives in
compute → undefined behavior). Always `textureSampleLevel` or
`textureSampleGrad`.

For million-particle workloads, packing per-node attributes into
`r32float`/`rgba32float` storage textures often beats storage buffers —
the texture cache is separate from L1/L2 and rarely thrashed by the same
shader's uniform reads.

## Atomics and barriers

`atomic<T>` where `T ∈ {i32, u32}`. Permitted only in `workgroup` and
`storage, read_write`. **No `atomic<f32>`** — f32 atomics aren't on most
GPUs. For float accumulation you compare-exchange a `bitcast<i32>(f32)`.

```wgsl
struct Counters { hits: atomic<u32>, miss: atomic<u32>, };
@group(0) @binding(0) var<storage, read_write> c: Counters;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (probe(gid.x)) { atomicAdd(&c.hits, 1u); }
  else              { atomicAdd(&c.miss, 1u); }
}
```

### Operations

- `atomicLoad(&a)`, `atomicStore(&a, v)`
- `atomicAdd`, `atomicSub`, `atomicMax`, `atomicMin`, `atomicAnd`,
  `atomicOr`, `atomicXor`, `atomicExchange` — return the **old** value.
- `atomicCompareExchangeWeak(&a, cmp, val)` — returns
  `__atomic_compare_exchange_result<T>` with `.old_value: T` and
  `.exchanged: bool`. "Weak" means it may *spuriously* fail; wrap in CAS
  loop.

```wgsl
loop {
  let old = atomicLoad(&a);
  let new = transform(old);
  let r = atomicCompareExchangeWeak(&a, old, new);
  if (r.exchanged) { break; }
}
```

### Float atomic via CAS

```wgsl
fn atomic_add_f32(p: ptr<storage, atomic<u32>, read_write>, v: f32) {
  loop {
    let old_bits = atomicLoad(p);
    let new_bits = bitcast<u32>(bitcast<f32>(old_bits) + v);
    let r = atomicCompareExchangeWeak(p, old_bits, new_bits);
    if (r.exchanged) { break; }
  }
}
```

### Barriers

- `workgroupBarrier()` — execution + workgroup memory barrier inside one
  workgroup. Cheap.
- `storageBarrier()` — execution barrier with storage-memory ordering
  inside one workgroup. Costlier; use only when storage-buffer writes need
  ordering vs reads in the same workgroup.
- `textureBarrier()` — orders storage-texture writes within a workgroup.

**All three must be in uniform CF within the workgroup.** A barrier inside
`if (li.x < 32u)` is a uniformity error and on broken backends a deadlock.
Pattern: gate the *work*, not the barrier.

```wgsl
// WRONG — barrier in divergent branch
if (lid.x < 32u) {
  shared[lid.x] = compute();
  workgroupBarrier();   // some threads never hit this — deadlock
}

// RIGHT — barrier outside the branch
if (lid.x < 32u) {
  shared[lid.x] = compute();
}
workgroupBarrier();
```

## Built-in functions

### Math

`abs, sign, floor, ceil, fract, round, trunc, max, min, clamp, mix, step,
smoothstep, saturate`. `round` is **banker's rounding** (round-half-to-even);
this surprises people coming from `Math.round` in JS.

### Trig and exp

`sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh, asinh, acosh,
atanh, degrees, radians`.
`pow, exp, exp2, log, log2, sqrt, inverseSqrt, fma, ldexp, frexp,
modf, quantizeToF16`.

`fma(a, b, c)` is the fused multiply-add — `a * b + c` rounded once. Use
in tight inner loops for accuracy and (on hardware that exposes it)
throughput.

### Vector / matrix

`dot, cross, length, distance, normalize, reflect, refract, faceForward`.
`transpose, determinant`. **No `inverse`** for matrices — implement by
hand or pre-invert on CPU. (Some implementations expose
`inverse(mat2x2)`/`inverse(mat3x3)`/`inverse(mat4x4)` as builtins, but the
spec lists none — verify before relying.)

### Logical

`all, any, select`.

### Bit

`countLeadingZeros, countTrailingZeros, countOneBits, firstLeadingBit,
firstTrailingBit, extractBits, insertBits, reverseBits`.

### Bitcasts

`bitcast<T>(v)` reinterprets bits between same-width types (`f32` ↔ `u32`,
`vec2<f32>` ↔ `vec2<u32>`, etc.). Required for hash functions and
float-via-CAS atomics.

### Derivatives (fragment only, uniform CF)

`dpdx, dpdxCoarse, dpdxFine, dpdy, dpdyCoarse, dpdyFine, fwidth,
fwidthCoarse, fwidthFine`.

### Packing

`pack4x8snorm/unorm`, `pack2x16snorm/unorm/float` → `u32`.
`unpack4x8snorm/unorm` → `vec4<f32>`; `unpack2x16snorm/unorm/float` →
`vec2<f32>`.

With `packed_4x8_integer_dot_product`: `pack4xI8/U8/I8Clamp/U8Clamp`,
`unpack4xI8/U8`, `dot4I8Packed`, `dot4U8Packed`. See
`wgsl-extensions.md`.

### Sync

`workgroupBarrier, storageBarrier, textureBarrier, workgroupUniformLoad`.

### Subgroup / quad ops

Behind the `subgroups` extension. See `wgsl-extensions.md`.

### Array

`arrayLength(&buf.runtime_array) -> u32`.

## Common mistakes — the senior checklist

- **`vec3` stride 12 vs alignment 16.** Pack as `vec4` or pad explicitly.
- **`mat4x3` mis-sized.** Pad each column to vec4, or use `mat4x4`.
- **Uniform array of `f32`.** Either `array<vec4<f32>, N>` indexed by
  `[i/4][i%4]`, or move to storage, or enable
  `uniform_buffer_standard_layout`.
- **Runtime-sized array not last.** Order matters; runtime arrays only
  legal as the trailing member of a top-level storage struct.
- **`mat3x3<f32>` in a uniform.** Each column is padded to 16; total 48.
  Pack as three `vec4` and ignore the w channel, or as `mat4x4`.
- **`textureSample` after `discard`.** `derivative_uniformity` error.
  Use `textureSampleLevel`/`Grad` or hoist.
- **`workgroupBarrier()` inside `if (gid.x < N)`.** Deadlock or validation
  error. Gate the work, not the barrier.
- **`let` where you needed `var`.** "expression is not assignable". `let`
  is an immutable binding — fine for runtime values but you can't reassign.
- **`switch` without `default`.** Parse error. Every switch needs default.
- **Ternary `?:`.** Doesn't parse. Use `select(elseValue, thenValue,
  cond)` — note inverted order from C.
- **`++i` in expressions.** "expected statement". `i++;` is a statement;
  precompute then read the variable.
- **Recursion.** "function call cycle detected." Convert to iterative.
- **`override` in `array<T, N>`.** "array element count must be a
  const-expression." Use `const` for sizes.
- **Forgetting `enable f16;`.** `1.0h` rejected. Enable directive at
  module top, before any other declaration.
- **Atomic in `uniform`.** Type validation error. Atomics live only in
  `workgroup` or `storage, read_write`.
- **Implicit type promotion.** `let i: i32 = 1; let f = i + 1.0;` errors.
  Explicit `f32(i)`.
- **Locations colliding between vertex out and fragment in.** "missing
  input at location 1" at pipeline create.
- **Naming a uniform `model.normalMat: mat3x3<f32>`.** Silent layout
  corruption — pack as three `vec4` or use `mat4x4`.
- **`textureSample` in compute.** No derivatives in compute. Always
  `textureSampleLevel` or `textureSampleGrad`.
- **Cross-stage `@interpolate` mismatch.** Vertex output and fragment input
  with the same `@location` must agree on type and interpolation mode.

## Graph-viz / particle takeaways

Highest-leverage rules for million-particle workloads:

- Pack node state as `vec4<f32>` storage arrays or `rgba32float` storage
  textures — never naked `array<vec3<f32>>` in uniform.
- Use `override` for workgroup size so you can retune per device.
- Use subgroup ops for cluster reductions when the feature is present and
  a workgroup-shared-memory path when it isn't (`wgsl-extensions.md`).
- Gate `textureSample` calls behind explicit-LOD variants in compute
  pipelines.
- Audit every uniform/storage struct against the AlignOf/SizeOf table
  before sending bytes from JS — write a Vitest snapshot test that pins
  byte offsets if you change a struct.
- For atomics on float histograms, CAS with `bitcast` is the canonical
  pattern.

## Cross-references

- `references/compute-fundamentals.md` — workgroup sizing, subgroups, LDS,
  barriers, atomics, memory access patterns.
- `references/gpgpu-recipes.md` — barriers in real algorithms,
  subgroup-ballot stream compaction, prefix sum, sort, BVH.
- `references/buffers-textures-bindings.md` — bind-group layouts, the JS
  side of upload alignment.
- `references/performance-and-profiling.md` — measuring whether your
  layout choices land in the cache.
- `wgsl-extensions.md` — every WGSL extension with a worked example.
