"use client";

import { useEffect } from "react";

import { useOrbWebGpuRuntimeStore } from "../webgpu/orb-webgpu-runtime-store";

import { useOrbInteraction } from "./orb-interaction-context";
import {
  tryReleasePointerCapture,
  trySetPointerCapture,
} from "./pointer-capture";

/**
 * Desktop mouse-drag camera handler for the WebGPU orb.
 *
 * - Left-button drag (button 0): rotate around Y axis. Direct
 *   manipulation — drag right pivots the right side of the orb away
 *   (matches the natural "grab and spin" feel).
 * - Right-button drag (button 2): pan in NDC. Direct manipulation —
 *   drag right shifts the orb right. Keyboard arrows use the opposite
 *   (camera-space) convention; the two are intentionally different
 *   because direct-manipulation drags follow the finger while keyboard
 *   pans the camera.
 *
 * Shares the surface with OrbInteractionSurface (which owns
 * click-vs-drag classification for selection) and OrbTouchTwist (which
 * owns two-finger touch rotation). Only mouse-type pointers fire here;
 * touch pointers fall through to OrbTouchTwist.
 *
 * Respects the rect-selection tool: while it is active the left button
 * belongs to the rect tool and the right button dismisses it, so this
 * handler stands down completely until the tool releases.
 */
const ROTATE_RADIANS_PER_PIXEL = 0.005;

export interface OrbMouseCameraProps {
  rectSelectionEnabled: boolean;
}

export function OrbMouseCamera({
  rectSelectionEnabled,
}: OrbMouseCameraProps) {
  const { surfaceElement } = useOrbInteraction();

  useEffect(() => {
    if (surfaceElement == null) return;
    if (rectSelectionEnabled) return;

    let mode: "rotate" | "pan" | null = null;
    let activePointerId: number | null = null;
    let lastClientX = 0;
    let lastClientY = 0;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (mode != null) return;
      if (event.button === 0) {
        mode = "rotate";
      } else if (event.button === 2) {
        mode = "pan";
      } else {
        return;
      }
      activePointerId = event.pointerId;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      trySetPointerCapture(event.currentTarget, event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (mode == null || event.pointerId !== activePointerId) return;
      const dx = event.clientX - lastClientX;
      const dy = event.clientY - lastClientY;
      lastClientX = event.clientX;
      lastClientY = event.clientY;
      const handle = useOrbWebGpuRuntimeStore.getState().handle;
      if (!handle) return;
      if (mode === "rotate") {
        // Direct manipulation: the grabbed particle follows the
        // cursor. For yaw (rotateY) positive angle moves the
        // front-center particle to +X, so dx maps directly to yaw.
        // For pitch (rotateX) positive angle moves the front-center
        // particle to -Y; to make drag-up move the front up, we want
        // pitch to take the same sign as dy (negative dy -> negative
        // pitch -> +Y for front).
        handle.applyTwist(dx * ROTATE_RADIANS_PER_PIXEL);
        handle.applyPitch(dy * ROTATE_RADIANS_PER_PIXEL);
      } else if (mode === "pan") {
        // 2 NDC units span the canvas height. Mapping pixels to NDC
        // by height keeps drag distance feeling consistent across
        // zoom levels.
        const rect = (
          event.currentTarget as HTMLElement | null
        )?.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;
        const pxToNdc = 2 / rect.height;
        // Direct manipulation: drag right -> orb shifts right. Screen Y
        // grows down, NDC Y grows up, hence the negation on dy.
        handle.applyPan(dx * pxToNdc, -dy * pxToNdc);
      }
    };

    const handlePointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (event.pointerId !== activePointerId) return;
      mode = null;
      activePointerId = null;
      tryReleasePointerCapture(event.currentTarget, event.pointerId);
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
  }, [rectSelectionEnabled, surfaceElement]);

  return null;
}
