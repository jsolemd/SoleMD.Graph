"use client";

import { useEffect } from "react";

import { useOrbWebGpuRuntimeStore } from "../webgpu/orb-webgpu-runtime-store";

import { useOrbInteraction } from "./orb-interaction-context";

/**
 * Two-finger TWIST gesture handler for the mobile orb.
 *
 * Listens for raw `pointerdown` / `pointermove` / `pointerup` /
 * `pointercancel` events on the orb interaction surface. When exactly
 * two pointers are active, it computes the angle of the line between
 * them via `Math.atan2(dy, dx)` and applies the per-frame angle delta
 * to the WebGPU runtime's presentation rotation. This rotates the orb
 * itself around its own Y axis without involving the retired R3F camera
 * controller path.
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
 * Gated on a non-null interaction surface and a live WebGPU runtime.
 * Returns null (no DOM) — pure side-effect component.
 */
export function OrbTouchTwist() {
  const { surfaceElement } = useOrbInteraction();

  useEffect(() => {
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

      // Negate so screen-CW twist yields world-CW orb rotation
      // (screen Y grows down; world Y grows up).
      useOrbWebGpuRuntimeStore.getState().handle?.applyTwist(-delta);
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
  }, [surfaceElement]);

  return null;
}
