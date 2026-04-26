"use client";

import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef } from "react";
import { PerspectiveCamera } from "three";
import CameraControlsImpl from "camera-controls";

import { BlobController } from "@/features/field/controller/BlobController";
import { useFieldMode } from "@/features/field/renderer/field-mode-context";
import { useFieldRuntime } from "@/features/field/renderer/field-runtime-context";
import { useFieldCameraStore } from "@/features/graph/stores/field-camera-store";
import { useShellStore } from "@/features/graph/stores";
import { useOrbInteraction } from "../interaction/orb-interaction-context";
import { createOrbKeyboardHandler } from "./orb-keyboard-shortcuts";

const ACTION = CameraControlsImpl.ACTION;

/**
 * drei `<CameraControls>` mount for orb mode.
 *
 * One binding scheme — desktop mouse, touchpad, and touch all share the
 * same mental model so the UX feels identical across input devices:
 *
 *   left-click drag          → ROTATE   ↔ touch one finger   (TOUCH_ROTATE)
 *   right-click drag         → OFFSET   ↔ touch two fingers  (TOUCH_DOLLY_OFFSET pan lane)
 *   middle-click drag        → DOLLY
 *   mouse wheel notch        → DOLLY
 *   trackpad 2-finger scroll → DOLLY    (matches mouse wheel — standard 3D-viewer pattern)
 *   trackpad pinch           → DOLLY    ↔ touch two fingers  (TOUCH_DOLLY_OFFSET pinch lane)
 *   trackpad rotate (Safari) → applyTwist ↔ OrbTouchTwist (mobile two-finger twist)
 *
 * Trackpad has no separate pan affordance — pan stays on right-drag.
 * This matches Sketchfab, model-viewer, and default Three.js OrbitControls.
 *
 * Keyboard lane: window-level shortcuts gated on `fieldMode === "orb"`,
 * documented in `MotionControlPanel.tsx` and implemented in
 * `orb-keyboard-shortcuts.ts`. Space toggles pause; ←/→/↑/↓ pan via
 * focal offset (OFFSET semantics — same pivot stability as right-drag);
 * `<` / `>` rotate the orbit azimuth; `+` / `-` dolly via the same
 * `controls.dolly` lane as wheel and pinch.
 * The earlier "trackpad scroll → OFFSET pan" split was a stretched
 * mobile-parity reading: on touch, pan and pinch are one fused gesture
 * (`TOUCH_DOLLY_OFFSET`), so splitting them on trackpad as separate
 * lanes felt wrong against user intuition that any wheel-like input zooms.
 *
 * Pivot stability — right-drag uses OFFSET, NOT TRUCK. OFFSET pans the
 * camera laterally while keeping `target` locked at the orb center;
 * TRUCK moves the target along with the camera and after a few drags
 * the rotation pivot drifts off-orb, breaking every subsequent rotate
 * and wheel dolly.
 *
 * Pinch override: the library would force `ACTION.ZOOM` on `wheel +
 * ctrlKey` (browser-synthesized pinch) — that only changes `camera.zoom`
 * (FOV) without moving the camera. A capture-phase listener intercepts
 * the pinch lane and calls `controls.dolly()` instead, for parity with
 * mouse-wheel and touch pinch (both DOLLY).
 *
 * Safari trackpad gestures (`gesturestart` / `gesturechange` /
 * `gestureend`) are the only browser API for trackpad rotation;
 * Chrome and Firefox expose nothing equivalent. We dispatch Safari's
 * cumulative `event.rotation` to `BlobController.applyTwist` (parity
 * with `OrbTouchTwist`) and the cumulative `event.scale` to
 * `controls.dolly` (parity with the wheel-ctrlKey pinch lane, since
 * Safari may deliver pinch through gesture events instead of wheel).
 *
 * Mount gate: `fieldMode === "orb"` AND a non-null
 * `useOrbInteraction().surfaceElement`. drei falls back to the canvas's
 * own `gl.domElement` when `domElement` is null/undefined — that surface
 * is `pointer-events-none` (the layout-passive `FieldCanvas`) so events
 * would never reach the controls. Only mount when we have the
 * `OrbInteractionSurface` element to bind to.
 *
 * Side effects on mount:
 *  - Lowers `camera.near` so dolly-in does not clip nearby particles.
 *    Restored on unmount so landing's near plane is unchanged.
 *  - Writes `sceneState.orbCameraActive = true` so BlobController
 *    switches to orb-mode galaxy world scale + point depth attenuation.
 *  - Restores the previously-stashed `toJSON` blob from
 *    `useFieldCameraStore` so 3D ↔ 2D toggle resumes camera state.
 *
   * Auto-rotation gate: the wrapper auto-rotation in `BlobController` is
   * paused while `sceneState.orbInteracting === true`. `wake` establishes
   * the first active state, `control` keeps it accurate for rotate vs
   * pan/dolly gestures, and `rest` clears it after damping settles.
   * Rotate controls also trigger BlobController's explicit interaction
   * burst envelope; camera motion alone cannot change shader-local `vNoise`.
 *
 * Auto-invalidate: drei's `<CameraControls>` already calls `invalidate()`
 * on every event under `frameloop="demand"`, so camera motion redraws
 * without manual plumbing.
 */

// Lowered camera.near for orb mode. The substrate default is 80
// (FieldCanvas constructs `near: 80`); 1 keeps near particles visible
// when the user dollies through them. Restored on unmount so the
// landing near plane is not affected.
const ORB_CAMERA_NEAR = 1;

// Bounds the dolly so the user cannot zoom out past the galaxy or push
// the camera through it. Initial Z is 400; min lets the user fly close
// without tunneling through, max keeps the structure on screen.
const ORB_MIN_DISTANCE = 30;
const ORB_MAX_DISTANCE = 1600;
const ORB_SMOOTH_TIME = 0.25;

// Trackpad-pinch wheel→dolly conversion. deltaY of -10 (a moderate pinch-
// out frame on macOS Chrome) at distance 100 produces 1 unit of dolly-in,
// which feels brisk but not jumpy. Distance-proportional so a pinch at
// distance 1000 still moves a perceptible fraction of the view, and at
// distance 30 (clamped min) doesn't punch through the orb.
const PINCH_DOLLY_RATE = 0.01;

function applyControlsConfig(controls: CameraControlsImpl) {
  controls.enabled = true;
  controls.minDistance = ORB_MIN_DISTANCE;
  controls.maxDistance = ORB_MAX_DISTANCE;
  controls.smoothTime = ORB_SMOOTH_TIME;
  controls.dollyToCursor = false;
  // Bindings — see file docstring. Mouse / touchpad / touch parity.
  controls.mouseButtons.left = ACTION.ROTATE;
  controls.mouseButtons.middle = ACTION.DOLLY;
  controls.mouseButtons.right = ACTION.OFFSET;
  controls.mouseButtons.wheel = ACTION.DOLLY;
  controls.touches.one = ACTION.TOUCH_ROTATE;
  controls.touches.two = ACTION.TOUCH_DOLLY_OFFSET;
  controls.touches.three = ACTION.NONE;
}

export function OrbCameraControls() {
  const fieldMode = useFieldMode();
  const { surfaceElement } = useOrbInteraction();
  const { sceneStateRef, controllersRef } = useFieldRuntime();
  // Read the live R3F camera directly. useThree returns the same
  // instance the canvas owns, available synchronously on first render —
  // so the camera-near mutation does NOT race the first useFrame tick
  // (which is when the FieldRuntimeBridge.cameraRef would be populated).
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const setSerialized = useFieldCameraStore((s) => s.setSerialized);

  // wake = controls started moving (drag, wheel, pinch, transition).
  // rest = motion has settled. We use wake/rest (not controlstart/end)
  // because the latter does not fire on wheel zoom; we still need to
  // know about every motion. But the auto-rotation only conflicts with
  // *rotational* user gestures — wheel zoom, pan (OFFSET), and pinch-
  // dolly don't compound with a Y-spin. Read `controls.currentAction`
  // and only flip `orbInteracting` true when the live gesture is
  // ROTATE or TOUCH_ROTATE; otherwise the orb keeps spinning while the
  // user dollies / pans / pinches, which feels much more alive.
  const handleWake = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const action = controls.currentAction;
    sceneStateRef.current.orbInteracting =
      action === ACTION.ROTATE || action === ACTION.TOUCH_ROTATE;
  }, [sceneStateRef]);

  const handleControl = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return;
    const action = controls.currentAction;
    const isRotating =
      action === ACTION.ROTATE || action === ACTION.TOUCH_ROTATE;
    sceneStateRef.current.orbInteracting = isRotating;
    if (!isRotating) return;
    const blob = controllersRef.current.blob;
    if (blob instanceof BlobController) {
      blob.triggerInteractionBurst();
    }
  }, [controllersRef, sceneStateRef]);

  const handleRest = useCallback(() => {
    sceneStateRef.current.orbInteracting = false;
  }, [sceneStateRef]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    // Capture the live scene-state object once so the cleanup closure
    // does not chase the ref pointer. The bridge ref itself is stable
    // across the (dashboard) layout, so this snapshot is safe.
    const sceneState = sceneStateRef.current;

    applyControlsConfig(controls);
    void controls.setTarget(0, 0, 0, false);

    // Stash + restore camera.near so landing's near plane is unaffected
    // by orb activity. Snapshotting in the same effect that flips it
    // means the unmount cleanup sees the same value the effect captured.
    const previousNear =
      camera instanceof PerspectiveCamera ? camera.near : null;
    if (camera instanceof PerspectiveCamera) {
      // eslint-disable-next-line react-hooks/immutability -- THREE.Camera.near mutation followed by updateProjectionMatrix() is the documented three.js API; there is no functional alternative.
      camera.near = ORB_CAMERA_NEAR;
      camera.updateProjectionMatrix();
    }

    // Mark scene state so BlobController switches into orb-mode galaxy
    // scale + depth attenuation. Cleanup forces both flags off so a
    // mid-drag unmount (renderer toggle while dragging) does not leave
    // `orbInteracting` stuck true.
    sceneState.orbCameraActive = true;
    sceneState.orbInteracting = false;

    // Restore the previously-stashed serialized state. `enableTransition
    // = false` snaps the camera into place rather than smoothing in
    // from defaults, which would be visually jarring on toggle-back.
    // Order matters: setTarget(0,0,0) above establishes the default,
    // then fromJSON optionally restores a panned target the user set
    // last session — preserving panned targets is intentional.
    const stored = useFieldCameraStore.getState().serialized;
    if (stored != null) {
      try {
        controls.fromJSON(stored, false);
      } catch {
        // Corrupt or schema-mismatched blob (e.g. library version
        // bump). Silently fall back to defaults.
      }
    }
    // `fromJSON` restores library config fields including the button
    // bindings. Camera behavior is code-owned, so reassert config after
    // restoring user position / target / focal offset.
    applyControlsConfig(controls);

    return () => {
      try {
        setSerialized(controls.toJSON());
      } catch {
        // Same defensive posture: serialization failure on unmount
        // should not throw out of cleanup.
      }
      sceneState.orbCameraActive = false;
      sceneState.orbInteracting = false;
      if (camera instanceof PerspectiveCamera && previousNear != null) {
        camera.near = previousNear;
        camera.updateProjectionMatrix();
      }
    };
  }, [camera, sceneStateRef, setSerialized]);

  // Pinch override — `wheel + ctrlKey` is the browser-synthesized pinch
  // gesture (trackpad pinch in Chrome / Firefox; browser pinch-zoom
  // anywhere). The library would force ACTION.ZOOM here, which only
  // changes `camera.zoom` (FOV) without moving the camera through space.
  // We intercept in capture phase and call controls.dolly() directly so
  // pinch matches mouse-wheel and touch pinch (all DOLLY). Non-ctrlKey
  // wheels (mouse wheel notch, trackpad 2-finger scroll) fall through
  // to the library's bubble-phase listener with the static
  // `mouseButtons.wheel = ACTION.DOLLY` binding.
  //
  // `passive: false` is required so preventDefault works.
  useEffect(() => {
    if (surfaceElement == null) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      const controls = controlsRef.current;
      if (!controls) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      const dollyAmount =
        -event.deltaY * controls.distance * PINCH_DOLLY_RATE;
      if (Number.isFinite(dollyAmount) && dollyAmount !== 0) {
        void controls.dolly(dollyAmount, false);
      }
    };

    surfaceElement.addEventListener("wheel", handleWheel, {
      capture: true,
      passive: false,
    });
    return () => {
      surfaceElement.removeEventListener("wheel", handleWheel, {
        capture: true,
      } as EventListenerOptions);
    };
  }, [surfaceElement]);

  // Safari trackpad gestures — pinch + rotation.
  //
  // Safari is the only browser that surfaces trackpad rotation at all
  // (`event.rotation`, in degrees, cumulative since gesturestart). It
  // also delivers pinch via `event.scale` here in addition to (or
  // instead of) wheel+ctrlKey. Chrome and Firefox have no trackpad-
  // rotation API; the rotation lane is best-effort Safari-only.
  //
  // We dispatch in one place because both signals share the same
  // gesture lifetime:
  //   - scale ratio → controls.dolly() (mobile parity, same as the
  //     wheel+ctrlKey lane above).
  //   - rotation delta → BlobController.applyTwist() (parity with the
  //     mobile two-finger twist gesture in OrbTouchTwist; spins the orb
  //     itself around its Y axis, additive to camera motion).
  //
  // Sign convention for rotation matches OrbTouchTwist: negate so a
  // screen-clockwise finger rotation produces a world-clockwise orb
  // spin from the user's view. Safari `event.rotation` is positive
  // for clockwise rotation in screen space.
  useEffect(() => {
    if (surfaceElement == null) return;

    let lastScale = 1;
    let lastRotation = 0;
    let active = false;

    const handleGestureStart = (event: Event) => {
      event.preventDefault();
      lastScale = 1;
      lastRotation = 0;
      active = true;
    };

    const handleGestureChange = (event: Event) => {
      if (!active) return;
      event.preventDefault();
      const e = event as Event & { scale: number; rotation: number };
      const controls = controlsRef.current;

      if (controls) {
        const scaleRatio = e.scale / lastScale;
        const dollyAmount = (scaleRatio - 1) * controls.distance;
        if (Number.isFinite(dollyAmount) && dollyAmount !== 0) {
          void controls.dolly(dollyAmount, false);
        }
        lastScale = e.scale;
      }

      const deltaDeg = e.rotation - lastRotation;
      if (deltaDeg !== 0) {
        const blob = controllersRef.current.blob;
        if (blob instanceof BlobController) {
          blob.applyTwist(-(deltaDeg * Math.PI) / 180);
        }
        lastRotation = e.rotation;
      }
    };

    const handleGestureEnd = (event: Event) => {
      event.preventDefault();
      active = false;
    };

    surfaceElement.addEventListener("gesturestart", handleGestureStart);
    surfaceElement.addEventListener("gesturechange", handleGestureChange);
    surfaceElement.addEventListener("gestureend", handleGestureEnd);
    return () => {
      surfaceElement.removeEventListener("gesturestart", handleGestureStart);
      surfaceElement.removeEventListener("gesturechange", handleGestureChange);
      surfaceElement.removeEventListener("gestureend", handleGestureEnd);
    };
  }, [controllersRef, surfaceElement]);

  // Window-level keyboard shortcuts. See `orb-keyboard-shortcuts.ts`
  // for the key→action map; documented to users in
  // `MotionControlPanel.tsx`. Gated on `fieldMode === "orb"` so the
  // listener doesn't intercept keys on landing or 2D Cosmograph.
  useEffect(() => {
    if (fieldMode !== "orb") return;

    const handleKeyDown = createOrbKeyboardHandler({
      getControls: () => controlsRef.current,
      getBlob: () => {
        const blob = controllersRef.current.blob;
        return blob instanceof BlobController ? blob : null;
      },
      getShellState: () => useShellStore.getState(),
    });

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [controllersRef, fieldMode]);

  if (fieldMode !== "orb" || surfaceElement == null) return null;

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      domElement={surfaceElement}
      smoothTime={ORB_SMOOTH_TIME}
      onWake={handleWake}
      onControl={handleControl}
      onRest={handleRest}
    />
  );
}

// Note: `dollyToCursor` is intentionally NOT enabled. Wheel-DOLLY
// references `target`, which defaults to the orb center. With
// `dollyToCursor` on, the library shifts the orbit target toward the
// cursor's world-space point on every wheel-zoom, so subsequent drag-
// rotation pivots around an off-center point — the rotation axis appears
// to drift away from the orb. Pivot stability is the whole point of the
// OFFSET-everywhere choice; cursor-drift would break it the same way
// TRUCK or `controls.forward()` would. Zoom-to-specific-particle is
// reserved for a later programmatic `controls.fitToSphere(particle)`
// action that lands the camera looking at the picked particle decisively.
