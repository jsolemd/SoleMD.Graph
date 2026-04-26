# Reference — render-vs-physics lane rule

The load-bearing architectural rule for everything in this docset.
Codified at `apps/web/features/orb/bake/apply-paper-overrides.ts:51`
and reaffirmed in
`docs/future/orb-mass-normalization-port.md`.

## The rule, verbatim from `apply-paper-overrides.ts`

> The attributes this writes (`aSpeed`, `aClickPack.w`, `aBucket`,
> `aFunnel*`) are **render lanes**, not physics state. `aSpeed`
> multiplies shader noise displacement (`field-vertex-motion.glsl.ts:232`);
> `aClickPack.w` is a sprite-size multiplier
> (`field-vertex-motion.glsl.ts:266`).
>
> When the physics layer lands (N-body, search excitation, drag,
> hover-zoom), it gets its **own** state — likely a sidecar
> texture or a separate attribute pass, designed at that point.
> Sprite size MAY derive from intrinsic mass via a render mapping,
> but the two are never the same field. This separation is the
> rule the larger Cosmograph→3D port follows: visual mappings live
> here; intrinsic properties live next to the simulation.

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

### Render lanes (existing)

Written by surface code (paper baker, click handler, lands-mode
field baker). Cheap to rewrite via `addUpdateRange` +
`bufferSubData`. Visual output only.

| Lane | Type | Owner | Use |
|---|---|---|---|
| `aSpeed` | vec3 | baker (paper-mass) | shader noise modulator |
| `aClickPack.{xyz}` | vec3 | click-attraction handler (NOT physics) | click-attraction offset |
| `aClickPack.w` | float | baker | sprite size factor |
| `aBucket` | float | baker (orb mode = 0) | shader paper-bucket gate |
| `aFunnel*` | float | baker | funnel deformation |
| `aColor` | vec3 (planned) | baker | cluster color render lane |
| `aMass` | float (planned) | baker | derived from log-percentile mass |
| `aSelection` | float | selection store | selection glow render lane |
| `aSignalCount` | float | RAG / signal subscriber | evidenceMark glow render lane |

### Physics lanes (new for orb)

Written by simulation pass / interaction stores. Sidecar GPGPU
textures or DataTextures. **Never** conflated with render
attributes.

| Lane | Type | Owner | Use |
|---|---|---|---|
| `posTex` | RGBA16F texture | force kernel | current physics positions (ping-pong) |
| `velTex` | RGBA16F texture | force kernel | velocities (ping-pong) |
| `massTex` | R16F texture | bake (read-only) | intrinsic mass for force integration |
| `selectionMask` | R8 DataTexture | selection store | per-particle selection bit |
| `filterMask` | R16F DataTexture | filter+timeline subscriber | per-particle scope membership (continuous for timeline smooth-step) |
| `excitationTex` | RG16F DataTexture | RAG result subscriber | (intensity, decayStart) for `evidencePulse` |
| `pinMask` | R8 DataTexture | (optional) | per-particle pin state |

## Boundary discipline

- Adding a feature = naming a new lane + wiring its writer + wiring
  its reader.
- Never overload an existing lane with new semantics.
- Visual derivations from physics state happen in the **shader
  reading both**, not in the writer of either.
- Picking shader composes the same motion chunks as display
  (`field-picking-material.ts:15`). When physics state is added
  to display, picking adds the same.

## Pointers

- `apps/web/features/orb/bake/apply-paper-overrides.ts:51` — the
  rule's primary citation in code.
- `docs/future/orb-mass-normalization-port.md` — the prior plan
  that established the rule.
- [01-architecture.md](../01-architecture.md) § Lane inventory —
  the full lane table for this docset.
