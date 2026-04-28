# 06 — Camera and rotation

> **Updated 2026-04-27.** The current `/graph` orb no longer mounts
> drei `CameraControls`. The first WebGPU implementation uses a fixed
> clip-space billboard view with WebGPU-owned rotation/drift in the
> compute/render pipeline and DOM-level interaction capture. The
> CameraControls design below is retained as the richer navigation
> target for later camera-state work, not as current runtime code.

## Camera

`@react-three/drei` `<CameraControls>` (wraps yomotsu/camera-controls).
Selected over `<OrbitControls>` because click-to-focus needs slerp
+ programmatic camera moves; CameraControls supports
`rotateTo(azimuth, polar, true)` and `dollyTo(distance)` cleanly.

```
<CameraControls
  makeDefault
  ref={cameraControlsRef}
  smoothTime={0.25}
  draggingSmoothTime={0.08}
  azimuthRotateSpeed={1.0}
  polarRotateSpeed={1.0}
  truckSpeed={0}              // disable pan; orbital only
  minDistance={3}
  maxDistance={18}
  minPolarAngle={Math.PI * 0.1}
  maxPolarAngle={Math.PI * 0.9}
/>
```

- **Up vector locked** to world Y (galaxy/connectome metaphor).
- **Pan disabled** (`truckSpeed=0`) — only orbit + dolly.
- **Polar angle clamped** to avoid pole singularity flips.

## drei `<Bounds>`

`<Bounds fit clip observe>` wraps the resident points group. Used
for:
- Initial fit on first paint.
- Zoom-to-selection (call `bounds.refresh(selectionBox).fit()`).
- Zoom-to-cluster (cluster centroid + radius).
- Zoom-to-search-result (centroid of result set).

`useBounds()` exposes the API. One drei primitive, three call
sites.

## Click-to-focus camera

When the user clicks a particle:

```
const target = particlePosition_world(paperId);
cameraControlsRef.current.rotateTo(azimuth, polar, true);
// distance held; only rotate so the particle is in the camera's view
```

Camera *target* stays at scene origin (orbit center) so the orb
remains the visual context. Only the camera *azimuth/polar*
rotate, slerping over `smoothTime`.

## Auto-rotation

State machine:

```
running ──(drag start)──▶ suspended-drag
suspended-drag ──(drag end)──▶ grace-1500ms ──▶ running
running ──(click select)──▶ paused-selection
paused-selection ──(dismiss)──▶ running
running ──(double-click empty)──▶ running        // explicit resume
* ──(Pause-motion control on)──▶ paused-user
paused-user ──(Pause-motion off)──▶ running
* ──(prefers-reduced-motion)──▶ paused-system
```

Rotation lives at the **scene-root group level**, not inside the
ForceKernel:

```
<group ref={orbGroupRef}>
  <Points ... />     // resident set
  <ClusterLabels />
</group>

useFrame((_, dt) => {
  if (rotationState === 'running') {
    orbGroupRef.current.rotation.y += rotationSpeed * dt;
  }
});
```

Physics simulation continues in the rotating frame regardless —
forces are local to the group.

## Camera persistence

SessionStorage key `solemd:camera-3d`:

```
{
  azimuth: number,
  polar: number,
  distance: number,
  rotationState: 'running' | 'paused-user' | 'paused-system' | 'paused-selection',
  rotationPhase: number,      // current Y rotation in radians
  rotationSpeed: number       // user override (slow/normal/fast)
}
```

Sim state does **not** persist — each page load starts a fresh sim
from baked positions and converges to equilibrium within the first
few frames (imperceptible since baked positions are already near
equilibrium).

The 2D map's camera persists separately under `solemd:camera-2d`
(canonical correction 6). No overlap. No store pollution.

## Reduced-motion + Pause-motion

- `prefers-reduced-motion`: rotation paused in `paused-system`;
  baked positions; no force wake; manual orbit drag still permitted
  (user-initiated motion is not the same as system-driven motion
  per WCAG).
- **Pause-motion** UI control in orb chrome: rotation paused in
  `paused-user`; sim cannot wake regardless of OS setting.
  Persists per session via `view-slice`.

Both states keep ranked-list + edge highlights + detail panel
fully functional — the orb communicates state through alpha,
color, panel sync; not through motion.

## Owns / doesn't own

Owns: camera mount, auto-rotation state machine, click-to-focus
slerp, persistence keys, reduced-motion contract.

Doesn't own:
- Selection → [07-selection.md](07-selection.md).
- Bounds fit-on-search → [09-search-and-rag-excitation.md](09-search-and-rag-excitation.md).
- Gesture arbitration → [16-gesture-arbitration.md](16-gesture-arbitration.md).

## Prerequisites

[04-renderer.md](04-renderer.md).

## Consumers

[07-selection.md](07-selection.md) (drag arbitration vs orbit drag),
[09-search-and-rag-excitation.md](09-search-and-rag-excitation.md)
(camera lerp on result arrival), [15-accessibility-and-low-power.md](15-accessibility-and-low-power.md).

## Invalidation

- Pan re-enabled (off-axis exploration) → up vector lock breaks →
  reconsider orbital metaphor.
- VR/AR mode → CameraControls insufficient → R3F XR primitives.
