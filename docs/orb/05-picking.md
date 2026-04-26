# 05 — Picking

## Pipeline

Reuses the existing GPU-ID picker from
`apps/web/features/field/renderer/field-picking.ts:63-219`.
Architecture survived recon; orb mode adds an additional layer
mask but doesn't replace the picker.

```
[OrbClickCaptureLayer]                  // existing div overlay
   │
   ▼ (clientX, clientY)
[useOrbPickerStore.handle.pickSync(x,y)] // existing
   │
   ▼ saves camera layer mask, sets to layer 1 only
[renderer.render(scene, camera, pickingTarget)]  // offscreen 1px
   │
   ▼ readPixels → decode 24-bit RGB
[particleIdx]
   │
   ▼ resident map lookup
[paperId]
   │
   ▼ resolveAndSelectNode(paperId)         // existing
[useGraphStore.selectedNode + selectionMask write]
```

Sync readback for clicks (`pickSync`); async readback throttled to
rAF for hover (`readRenderTargetPixelsAsync`) per canonical M2.

## ID encoding

The picker fragment shader encodes `aIndex` as 24-bit RGB:

```glsl
float idx = aIndex;
gl_FragColor = vec4(
  mod(idx, 256.0) / 255.0,
  mod(floor(idx / 256.0), 256.0) / 255.0,
  mod(floor(idx / 65536.0), 256.0) / 255.0,
  1.0
);
```

`aIndex` is the resident-set particle index, 0..budget-1 (≤ 16K
mobile, ≤ 30K desktop). Always fits in 24 bits.

`paperId` resolution is JS-side via the resident `Map<number,
string>` populated at buffer pack. `paperId` is `string | null`;
encoding it as a float was canonical correction 5 — corrected.

## Picking material — same motion chunks as display

Per `apps/web/features/field/renderer/field-picking-material.ts:15`:
the picking shader composes the *exact* motion chunks the display
shader uses (`computeFieldDisplacement`, etc.). Picked pixel ≡
display pixel.

Orb mode adds the center split from
[03-physics-model.md](03-physics-model.md) § Center split:

```glsl
vec3 baked = position;
vec3 live = texelFetch(posTex, ivec2(aIndex, 0), 0).xyz;
vec3 center = mix(baked, live, uWakeMix);
vec3 ambient = bounded_ambient_displacement(aIndex, uTime);
vec3 final = center + ambient;
```

Both display and picking use the same `uWakeMix`, the same
`posTex`, the same ambient function. They cannot drift relative to
each other.

## Layer masks

The persistent canvas has three coexisting layers:

- Layer 0 — lands controllers (Blob, Stream, ObjectFormation).
- Layer 1 — orb resident set.
- Layer 2 — UI overlays / drei `<Html>` portals.

Picking only renders Layer 1. Other layers are invisible to the
picker. This means a `<Html>` tooltip floating above a particle
doesn't capture the click — the particle does.

## Hit-radius vs ambient noise

The bounded ambient displacement (≤ 0.5 × `uPointSize`) keeps the
particle within its picking hit-radius. The picker hit-radius is
the rendered `gl_PointSize` clamped to `[2, 64]` per
`field-picking.ts`, so even at the largest particle (`aMass` = 1.0
→ size factor 2.6) the noise stays inside the sprite.

## Resident-set rebuild

On resident-set rebuild (scope change):
- The `Map<number, string>` is rewritten.
- `aIndex` attribute is unchanged (always 0..budget-1).
- Picking still works during rebuild because `posTex` and
  `aIndex` are coherent at every frame.

If the user clicks a position whose particle has been swapped out
of the resident set in the same frame as their click — the
returned `paperId` is the *new* particle's id. This is an
acceptable race (rare; the user's spatial intent is "this pixel
right now" and the resident set is the truth-of-pixel).

## Owns / doesn't own

Owns: picking pipeline, ID encoding, layer mask discipline,
resident-rebuild contract.

Doesn't own:
- Click → selection writes → [07-selection.md](07-selection.md).
- Lasso / rect / brush → [07-selection.md](07-selection.md).
- Hover tooltip rendering → [04-renderer.md](04-renderer.md).

## Prerequisites

[01-architecture.md](01-architecture.md), [04-renderer.md](04-renderer.md).

## Consumers

[07-selection.md](07-selection.md), all milestones that use orb
clicks.

## Invalidation

- Resident budget exceeds 16M particles (24-bit limit). Practically
  never; budget is render-bounded.
- Physics center swap is removed → display ≠ picking → must redo
  the chunk-sharing contract.
- Multiple pickers per frame (e.g. parallel orb mode + lands mode
  picking) → layer masks need extension.
