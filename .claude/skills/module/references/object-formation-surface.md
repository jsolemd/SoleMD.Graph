# Object-Formation Surface

Use this reference when a future SoleMD surface needs particles to converge
into an authored shape at the end of a chapter — the "points make a shape"
pattern behind Maze's historical closing plane and stream conveyor.

This is the missing pattern behind the two user-locked deviations in
`maze-build-spec.md § 12 #46 #47`:

1. Blob points stay visible through the detail story (no chapter-exit fade).
2. objectFormation / stream do not yet converge into an end-state shape.

Landing now resolves back to a blob/globe bookend at CTA. This document is
therefore **not** the homepage closing contract anymore. It is the
implementation guide for future module pages that need authored end-state
formation without re-deriving the pattern.

## Conceptual Model

An object-formation surface is a normal `FieldController` subclass. What
changes is the **source relationship**, not the runtime.

| Axis | Homepage today | Object-formation surface |
|---|---|---|
| Start distribution | procedural blob / stream conveyor / flat bitmap | same |
| End distribution | landing returns to its opening blob bookend | authored point cloud from a bitmap or model slug |
| Transport | shared chapter progress + controller `tick()` smoothing | shared chapter progress + controller `tick()` smoothing **plus** shader exit uniforms (`uDepthOut`, `uAmplitudeOut`) driven toward the authored target |
| Exit visibility | landing visibility is aggregated in `field-scroll-state.ts` | module surface may add convergence-specific fade policy inside `tick()` |

The shader contract already carries every uniform convergence needs
(`renderer/field-shaders.ts` + `LayerUniforms` at `FieldController.ts:38–70`).
No GLSL changes are required. The work is preset values + controller
lifecycle + authored point source.

Pattern:

```text
point-source manifest entry
  ->
FieldController subclass (tick reads shared chapter progress)
  ->
visual preset *Out values (raised to Maze convergence: 10 / 4)
  ->
FIELD_SECTION_MANIFEST row
  ->
shared FixedStageManager boots it like every other scene
```

## Required Pieces

### 1. Point source

Declare the target shape in the asset layer. Primitives already exist:

- **Image-backed** (PNG/JPEG silhouette) — `asset/image-point-source.ts:89`
  `createImagePointGeometry(url, options)`. Wraps `FieldGeometry.fromTexture`
  at `asset/field-geometry.ts:139`. Use `{ channel: "r" | "g" | "b" | "luma", colorThreshold, textureScale, thickness, layers, countFactor }`.
- **Model-backed** (`.glb`) — `asset/model-point-source.ts:55`
  `createModelPointGeometry(object3d, options)`. Wraps
  `FieldGeometry.fromVertices` at `asset/field-geometry.ts:198`. Walks the
  scene graph and concatenates all mesh positions (this is a superset of
  Maze's last-mesh-only quirk — intentional).
- **Procedural** — today's objectFormation path via `buildObjectFormationBitmap()`; keep for fallback
  or tuning.

If you are adding the first URL-backed slug, formalize
`POINT_SOURCE_MANIFEST` in `asset/point-source-registry.ts` and add a true
async `loadAll()` path. Current registry is synchronous and keyed per slug at
`point-source-registry.ts:99` (`ID_OFFSETS`) — it handles procedural only.

**Extending `FieldStageItemId`** (`scene/visual-presets.ts`):
today the union is `"blob" | "stream" | "objectFormation"`. A new convergence surface
either reuses an existing slug (raising its *Out values; see §2) or adds a
new slug. Adding a slug requires: the type union update, `ID_OFFSETS` seed,
`FIELD_STAGE_ITEM_IDS`, and a preset entry.

### 2. Preset out-values

The shader's exit response lives in two preset keys:

- `amplitudeOut` (maps to `uAmplitudeOut`)
- `depthOut` (maps to `uDepthOut`)

These scale the particle displacement as a chapter exits. Maze's
convergence-flavored default is `depthOut=10 / amplitudeOut=4`
(`visual-presets.ts:10–11` effective-defaults header comment). Small values
(today's blob and objectFormation) keep points in place; large values dissolve them into
the authored end state.

Current user-locked values:

| Slug | File:line | depthOut | amplitudeOut |
|---|---|---|---|
| blob | `visual-presets.ts:132–133` | 0.8 (amplitudeOut), 1.0 (depthOut) | see col 3 |
| stream | `visual-presets.ts:175–176` | 1.0 / 0.1 | — |
| objectFormation | `visual-presets.ts` | 0.3 / 0.05 | — |

Maze-style convergence values for any slug whose surface needs the end-state
dissolve: `depthOut=10`, `amplitudeOut=4`. The shader multiplies these by the
scroll exit factor (`entryFactor` / `exitFactor`, `visual-presets.ts:10–11`)
and reads them straight from `LayerUniforms` — no additional plumbing.

### 3. Controller

Subclass `FieldController` (`controller/FieldController.ts`, base at `:30`).
Inherit the full lifecycle:

- `whenReady(): Promise<void>` (`:387`) — gate on asset readiness.
- `tick(FrameContext)` (`:383`) — per-frame uniform + transform work.
- `updateVisibility(...)` (`:228`) — **base is a sanctioned no-op**
  (`:35`). Subclasses that want chapter-exit fade call it from their own
  `tick()` or add a convergence-specific fade branch there.
- `destroy()` — R3F owns GPU resource lifecycle; do not traverse scenegraph.

Reference implementations:

- `controller/StreamController.ts:18` — stream conveyor. Reads
  `landing-stream-chapter.ts` targets during `tick()` and eases toward the
  current shared chapter state.
- `controller/ObjectFormationController.ts` — current flat authored-shape
  plane. Closest existing visual
  template for a convergence surface once a non-landing module needs it.

Minimal subclass shape for a new convergence:

```ts
export class ConvergenceController extends FieldController {
  override tick(frame) {
    const progress = getFieldChapterProgress(
      frame.sceneState,
      "section-target",
    );
    this.wrapper.position.z = damp(this.wrapper.position.z, 0, progress);
    this.updateExitUniforms(progress);
  }
}
```

Then raise `*Out` in the preset so `updateExitUniforms` actually reaches the
convergence values.

### 4. Surface manifest

Register the chapter through `FIELD_SECTION_MANIFEST`
(`surfaces/FieldLandingPage/field-landing-content.ts`).
Each entry is a `FieldSectionManifestEntry` carrying
`{ sectionId, stageItemId, endSectionId?, presetId }`. `FixedStageManager`
(`stage/FixedStageManager.tsx:49–125`) iterates the manifest, calls
`prewarmFieldPointSources`, awaits every controller's `whenReady()`,
and only then lets any controller tick.

Do **not** instantiate controllers outside the manifest. The preload gate
depends on the manifest being authoritative.

## Smallest Path To Ship One

Worked example: a molecule-silhouette PNG at the end of Story 2 that the
blob converges into.

1. **Drop `public/field/molecule-silhouette.png`** (target shape —
   white silhouette on transparent background).
2. **Point source** — add to `asset/point-source-registry.ts`:
   ```ts
   case "molecule":
     return await createImagePointGeometry("/field/molecule-silhouette.png", {
       channel: "luma",
       colorThreshold: 200,
       textureScale: 0.4,
       thickness: 0,
       layers: 1,
       countFactor: 2,
     });
   ```
   Extend `FieldStageItemId`, `ID_OFFSETS`, and
   `FIELD_STAGE_ITEM_IDS` for `"molecule"`.
3. **Preset** — add to `scene/visual-presets.ts`:
   ```ts
   molecule: {
     shader: { size: 8, /* … */ },
     amplitudeOut: 4,  // full Maze convergence
     depthOut: 10,
     // … alphaDiagramFloor: 0, selectionHotspotFloor: 0, etc.
   }
   ```
4. **Controller** — new `controller/MoleculeController.ts` subclassing
   `FieldController`. In `tick()`, read the shared chapter progress for the
   authored surface and scrub `wrapper.position.z` / `updateExitUniforms`
   against that progress.
5. **Manifest + mount** — add a row to `FIELD_SECTION_MANIFEST` with
   `stageItemId: "molecule"` and section ids matching Story 2. Mount
   the corresponding React section inside `FieldLandingPage.tsx`.

That is the complete path. Shader, preload gate, progress controller,
chapter adapter registry, shell state classes, and TOC gate all continue to
work untouched.

## Undoing The Current User-Locked Deviations

### Undo deviation #1: blob always visible through detail story

Exact edits:

- `scene/visual-presets.ts:132` → `amplitudeOut: 4` (from `0.8`)
- `scene/visual-presets.ts:133` → `depthOut: 10` (from `1.0`)
- `controller/FieldController.ts:35` and `:228` — replace the sanctioned
  no-op note and method body with a live fade policy, **or** override
  `updateVisibility()` on `BlobController` and call it from `BlobController`'s
  `tick()` so only the blob surface opts in. Prefer the per-subclass override
  so other surfaces keep the "always visible" default.
- Consider `scene/visual-presets.ts:141` `alphaDiagramFloor: 0.22` — drop
  to `0` if the detail story should darken the blob silhouette during exit.
- Consider `scene/visual-presets.ts:156` `selectionHotspotFloor: 0.85` —
  drop to `0.3` (stream/objectFormation parity) if hotspot alpha should collapse with
  the blob.

Update `maze-build-spec.md § 12 #46` to strike the user-locked note when
shipped.

### Undo deviation #2: no end-state object-formation surface yet

Minimum code path (objectFormation becomes the convergence target):

- `scene/visual-presets.ts:220` → `amplitudeOut: 4` (from `0.05`)
- `scene/visual-presets.ts:221` → `depthOut: 10` (from `0.3`)
- Follow §1–§4 above to wire an authored point-source slug (`molecule`,
  `shield`, or whatever the product needs) and its controller + manifest row.

Stream end-state variant (stream conveyor particles converge into a shape
at the bottom of the chapter):

- Keep `stream.depthOut=1.0` / `amplitudeOut=0.1` if the conveyor should
  remain visible, **or** raise to `10 / 4` if the stream should dissolve.
- Extend `StreamController.bindScroll` (`controller/StreamController.ts:128`)
  with a post-conveyor tween against the authored target.
- Consult Maze stream funnel uniforms at
  `scripts.pretty.js:42583–42593` for the classical shape — they are the
  reference for stream-specific funnel behavior but are not wired on the
  SoleMD shader today (`maze-shader-material-contract.md § "Retired (Round 14)"`).

Update `maze-build-spec.md § 12 #47` when shipped.

## What Doesn't Change

- **Shader**: `uDepthOut` / `uAmplitudeOut` are already uniforms; no GLSL
  edits needed.
- **FixedStageManager**: handles any number of manifest entries; no seam
  changes needed.
- **Preload gate**: already async-ready via `whenReady()`. First URL-backed
  slug is the trigger to formalize `POINT_SOURCE_MANIFEST` + `loadAll()`
  (build-spec § 13 P2).
- **Chapter adapter registry**: object formation is a stage concern, not a
  DOM adapter. No new chapter adapter needed unless the surface has
  scroll-linked DOM overlays.
- **Progress, TOC rail, shell state classes, HiDPI projection**: all remain
  correct.

## Related References

- `maze-build-spec.md § 6` — controller parity
- `maze-build-spec.md § 12 #46 #47` — the two user-locked deviations this
  reference unlocks
- `maze-particle-runtime-architecture.md` — controller hierarchy and the
  R3F boundary
- `image-particle-conformation.md` — required read before adding any
  image-backed point layer
- `maze-shader-material-contract.md` — `uDepthOut` / `uAmplitudeOut`
  semantics and the retired burst-overlay uniform family (do not resurrect)
- `maze-asset-pipeline.md` — canonical `fromTexture` / `fromVertices` /
  `fromModel` pipeline, Count-Factor quirk, sampling presets
- `maze-model-point-source-inspection.md` — `.glb` vertex counts per Maze
  slug, useful when picking a model target
- `stream-chapter-hybrid.md` — the (currently deferred) DOM/SVG shell
  companion to a stream surface that also has an authored shell
