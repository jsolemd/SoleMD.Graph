# Reference — render-vs-physics lane rule

The load-bearing architectural rule for everything in this docset.
The original version lived in
`apps/web/features/orb/bake/apply-paper-overrides.ts`; the current
WebGPU version is codified by
`apps/web/features/orb/bake/orb-paper-visual-mapping.ts` and
`apps/web/features/orb/webgpu/orb-webgpu-particles.ts`.

## The current rule

Paper-derived visual mappings write WebGPU display lanes: color,
radius, and drift speed. They do not define intrinsic mass or semantic
force state. Interaction state writes flag bits. Future force kernels
get their own storage buffers for mass, edges, excitation, pins, and
summary state. Visual mappings may derive from the same source data as
physics inputs, but they are never the same lane.

## Why this matters

Conflating render lanes with physics state guarantees:
- The picker drifts from display under wake-driven motion.
- Visual changes mistakenly cause physics changes (or vice versa).
- Adding a new feature requires reverse-engineering what each lane
  *currently* means in this code path.

The rule is the **prerequisite** for hybrid physics (this docset's
[03-physics-model.md](../03-physics-model.md) § Center split) and
for any future GPGPU work.

## Lane inventory (current + planned)

### WebGPU visual lanes

Written by the paper baker and packed by the WebGPU canvas. Visual
output only.

| Lane | Type | Owner | Use |
|---|---|---|---|
| `position.w` | float | paper visual mapping | billboard radius |
| `velocity.xyz` | vec3 | paper visual mapping | ambient drift/spin seed |
| `attributes.rgb` | vec3 | paper visual mapping | display color |
| `attributes.w` | float | paper visual mapping | display speed factor |
| `flags` | u32 bitfield | focus visual store | hover/focus/scope/selection/neighbor/evidence styling |

### Physics lanes

Written by simulation passes and interaction stores. Storage buffers,
not DataTextures. **Never** conflated with visual mappings.

| Lane | Type | Owner | Use |
|---|---|---|---|
| `position` | `array<vec4f>` | force kernel | current particle position + radius |
| `velocity` | `array<vec4f>` | force kernel | velocity + spare |
| `mass` / `attributes` | storage buffer | bake / kernel | intrinsic mass and simulation params |
| `edges` | storage buffer | graph upload | compact neighbor/citation/entity forces |
| `flags` | `array<u32>` | interaction upload | selected/focus/scope/evidence bits |
| `summary` | storage/readback buffers | kernel | diagnostic and UI summary values |

## Boundary discipline

- Adding a feature = naming a new lane + wiring its writer + wiring
  its reader.
- Never overload an existing lane with new semantics.
- Visual derivations from physics state happen in the **shader
  reading both**, not in the writer of either.
- Picking computes against the same storage-buffer positions that the
  display pass renders. When physics state changes display position,
  compute picking reads the updated position buffer.

## Pointers

- `apps/web/features/orb/bake/orb-paper-visual-mapping.ts` — visual
  paper-derived mapping.
- `apps/web/features/orb/webgpu/orb-webgpu-particles.ts` — WebGPU
  storage-buffer packing and flag bit layout.
- `docs/future/orb-mass-normalization-port.md` — the prior plan
  that established the rule.
- [01-architecture.md](../01-architecture.md) § Lane inventory —
  the full lane table for this docset.
