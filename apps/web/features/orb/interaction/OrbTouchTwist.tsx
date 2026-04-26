"use client";

import { useEffect } from "react";

import { BlobController } from "@/features/field/controller/BlobController";
import { useFieldMode } from "@/features/field/renderer/field-mode-context";
import { useFieldRuntime } from "@/features/field/renderer/field-runtime-context";

import { useOrbInteraction } from "./orb-interaction-context";

/**
 * Two-finger TWIST gesture handler for the mobile orb.
 *
 * Listens for raw `pointerdown` / `pointermove` / `pointerup` /
 * `pointercancel` events on the orb interaction surface. When exactly
 * two pointers are active, it computes the angle of the line between
 * them via `Math.atan2(dy, dx)` and applies the per-frame angle delta
 * to the orb wrapper's Y-axis rotation via `BlobController.applyTwist`.
 * That same controller method triggers the orb interaction-burst envelope.
 *
 * This is purely additive on top of drei `<CameraControls>` —
 * `touches.two = TOUCH_DOLLY_OFFSET` still pans + pinch-dollies the
 * camera. Twist is a third lane that rotates the orb itself (not the
 * camera) around its own Y axis, so a two-finger pan + twist combo
 * pans the camera AND spins the orb. Pointer events are dispatched
 * to ALL listeners on the same element regardless of the
 * library's `setPointerCapture` calls — capture redirects events to a
 * specific target but does not consume them, so co-existence is safe.
 *
 * Sign convention: screen Y grows downward, world Y grows upward.
 * A clockwise twist (in screen space) yields an INCREASING `atan2`
 * value. We negate the delta so a clockwise twist of the fingers
 * produces a clockwise rotation of the orb from the user's view.
 *
 * No dead-zone: per-frame deltas are naturally smoothed by the user's
 * own hand cadence, and a dead-zone would lose slow rotations
 * (each event delta is sub-threshold, but the cumulative is not).
 *
 * Gated on `fieldMode === "orb"` and a non-null `surfaceElement`.
 * Returns null (no DOM) — pure side-effect component.
 */
export function OrbTouchTwist() {
  const fieldMode = useFieldMode();
  const { surfaceElement } = useOrbInteraction();
  const { controllersRef } = useFieldRuntime();

  useEffect(() => {
    if (fieldMode !== "orb") return;
    if (surfaceElement == null) return;

    const pointers = new Map<number, { x: number; y: number }>();
    let lastAngle: number | null = null;

    const computeAngle = (): number | null => {
      if (pointers.size !== 2) return null;
      // Map preserves insertion order; first finger down = p1.
      const iter = pointers.values();
      const p1 = iter.next().value;
      const p2 = iter.next().value;
      if (!p1 || !p2) return null;
      return Math.atan2(p2.y - p1.y, p2.x - p1.x);
    };

    const handlePointerDown = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastAngle = computeAngle();
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const angle = computeAngle();
      if (angle == null) return;
      if (lastAngle == null) {
        lastAngle = angle;
        return;
      }
      // Normalize delta to [-π, π] so the discontinuity at ±π doesn't
      // produce a full-revolution kick when the line crosses the
      // 180° boundary between frames.
      let delta = angle - lastAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      else if (delta < -Math.PI) delta += 2 * Math.PI;
      lastAngle = angle;

      const blob = controllersRef.current.blob;
      if (blob instanceof BlobController) {
        // Negate so screen-CW twist yields world-CW orb rotation
        // (screen Y grows down; world Y grows up).
        blob.applyTwist(-delta);
      }
    };

    const handlePointerEnd = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      // Recompute or null `lastAngle` so the next move starts fresh
      // from the new geometry instead of using a stale 2-pointer angle.
      lastAngle = computeAngle();
    };

    surfaceElement.addEventListener("pointerdown", handlePointerDown);
    surfaceElement.addEventListener("pointermove", handlePointerMove);
    surfaceElement.addEventListener("pointerup", handlePointerEnd);
    surfaceElement.addEventListener("pointercancel", handlePointerEnd);

    return () => {
      surfaceElement.removeEventListener("pointerdown", handlePointerDown);
      surfaceElement.removeEventListener("pointermove", handlePointerMove);
      surfaceElement.removeEventListener("pointerup", handlePointerEnd);
      surfaceElement.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [controllersRef, fieldMode, surfaceElement]);

  return null;
}
