# Object-Formation Surface

Use this reference when a future SoleMD surface needs particles to converge into
an authored shape at the end of a chapter.

This is the missing pattern behind the current user-locked deviations:

1. blob points stay visible through the detail story
2. pcb/stream do not yet converge into an end-state shape

## Conceptual Model

An object-formation surface is still a normal `FieldController`.

What changes is the source relationship:

- start state: procedural blob / stream conveyor / flat bitmap field
- end state: authored point cloud from a bitmap or model slug
- transport: scroll-linked tween on the same point family

The pattern is:

```text
point-source manifest entry
  ->
controller subclass
  ->
visual preset out-values
  ->
scroll timeline
  ->
shared stage runtime
```

## Required Pieces

### 1. Point source

Declare the target shape in the point-source layer:

- `source: "image"` or `source: "model"`
- URL or local asset slug
- any image/model sampling presets

If the first async/URL-backed source is introduced, formalize
`POINT_SOURCE_MANIFEST` and add a true async `loadAll()` path.

### 2. Preset out-values

When a chapter really needs particles to leave one distribution and settle into
another, restore the Maze-style out-values for that surface.

Current user-locked values:

- blob: `depthOut=1.0`, `amplitudeOut=0.8`
- pcb: `depthOut=0.3`, `amplitudeOut=0.05`

Maze-style convergence values:

- `depthOut=10`
- `amplitudeOut=4`

### 3. Controller

Author or extend a `FieldController` subclass so `bindScroll()` owns the
convergence timeline and `tick()` continues to handle the live uniform/frame
work.

The base contract stays the same:

- `whenReady()` gates asset readiness
- `bindScroll()` owns chapter timing
- `tick()` owns per-frame uniforms/transforms
- `updateVisibility()` is only used if the surface opts into it explicitly

### 4. Surface manifest

Mount the authored chapter through `FieldSectionManifest` so the shared stage
manager can preload it and bind it like every other scene owner.

## Smallest Path To Ship One

Given a target PNG or model:

1. Add one point-source manifest entry.
2. Add or extend one controller subclass.
3. Restore the preset out-values for the converging scene.
4. Add one `FieldSectionManifest` row.
5. Mount the chapter surface in the page/module inventory.

## Undoing The Current User-Locked Deviations

### Undo deviation #1: blob always visible through detail story

Edit:

- `scene/visual-presets.ts`
  - blob `depthOut: 1.0 -> 10`
  - blob `amplitudeOut: 0.8 -> 4`
- `controller/FieldController.ts`
  - replace the documented no-op `updateVisibility()` policy with an active
    fade/visibility policy for the surface that needs it

### Undo deviation #2: no end-state object-formation surface yet

Edit:

- `scene/visual-presets.ts`
  - pcb `depthOut: 0.3 -> 10`
  - pcb `amplitudeOut: 0.05 -> 4`
- add the authored point-source slug and convergence controller
- extend `FIELD_SECTION_MANIFEST` for the new convergence owner

## Related References

- `maze-build-spec.md`
- `maze-particle-runtime-architecture.md`
- `image-particle-conformation.md`
- `maze-shader-material-contract.md`
- `maze-asset-pipeline.md`
