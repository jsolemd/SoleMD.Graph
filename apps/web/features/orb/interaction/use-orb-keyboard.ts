"use client";

import { useEffect } from "react";

import { shouldSkipGraphKeyboardShortcut } from "@/features/graph/lib/graph-keyboard-guards";
import type { OrbWebGpuControlHandle } from "../webgpu/orb-webgpu-runtime-store";

// Keyboard surface for the WebGPU orb. Mirrors the cosmograph keyboard
// handler in shape so the two graph runtimes feel consistent: text
// inputs / focused controls take priority, modifier keys (Ctrl/Cmd/Alt)
// pass through to the browser, and per-keypress motion is fixed in NDC
// units so brisk hold-to-pan resolves to a steady glide.
export const ORB_PAN_KEY_NDC = 0.06;
export const ORB_ZOOM_KEY_FACTOR = 1.2;
const ORB_ROTATE_KEY_RADIANS = (5 * Math.PI) / 180;

export interface UseOrbKeyboardArgs {
  /** Live getter — returns the active runtime control handle (or null). */
  getHandle: () => OrbWebGpuControlHandle | null;
  /** Returns true when this hook should be live (e.g. orb is mounted). */
  enabled?: boolean;
  /** Optional pause-motion toggle for the Space binding. */
  togglePauseMotion?: () => void;
}

export function useOrbKeyboard({
  getHandle,
  enabled = true,
  togglePauseMotion,
}: UseOrbKeyboardArgs): void {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    const handler = (event: KeyboardEvent) => {
      if (event.altKey || event.metaKey) return;
      if (shouldSkipGraphKeyboardShortcut(document.activeElement)) return;
      const handle = getHandle();
      if (!handle && event.key !== " ") return;

      // Block ctrl-modifier on every binding except those that need
      // it (none currently). The cosmograph handler does the same so
      // browser shortcuts (Ctrl+L, Ctrl+W, ...) keep working.
      if (event.ctrlKey) return;

      switch (event.key) {
        case " ":
          if (!togglePauseMotion) return;
          event.preventDefault();
          togglePauseMotion();
          return;
        // R / F zoom in / out. Replaces +/=/-/_ — keyboard now mirrors
        // the user's physical-key mental model rather than the math
        // symbol. Wheel still zooms via OrbInteractionSurface.
        case "r":
        case "R":
          event.preventDefault();
          handle?.applyZoom(ORB_ZOOM_KEY_FACTOR);
          return;
        case "f":
        case "F":
          event.preventDefault();
          handle?.applyZoom(1 / ORB_ZOOM_KEY_FACTOR);
          return;
        // nudgeRotation (eased) instead of applyTwist (instant) so
        // browser key-repeat blends to a continuous glide. Mouse drag
        // and touch twist still use applyTwist for direct manipulation.
        case "<":
        case ",":
        case "q":
        case "Q":
          event.preventDefault();
          handle?.nudgeRotation(-ORB_ROTATE_KEY_RADIANS);
          return;
        case ">":
        case ".":
        case "e":
        case "E":
          event.preventDefault();
          handle?.nudgeRotation(ORB_ROTATE_KEY_RADIANS);
          return;
        case "t":
        case "T":
          event.preventDefault();
          handle?.resetView();
          return;
        // Arrow / WASD signs: pan is camera-space, not direct
        // manipulation. ArrowLeft means "look at content further left,"
        // which shifts the world right on screen — same convention as
        // the 2D cosmograph keyboard handler. Mouse drag uses the
        // opposite (direct-manipulation) sign.
        case "ArrowLeft":
        case "a":
        case "A":
          event.preventDefault();
          handle?.applyPan(ORB_PAN_KEY_NDC, 0);
          return;
        case "ArrowRight":
        case "d":
        case "D":
          event.preventDefault();
          handle?.applyPan(-ORB_PAN_KEY_NDC, 0);
          return;
        case "ArrowUp":
        case "w":
        case "W":
          event.preventDefault();
          handle?.applyPan(0, -ORB_PAN_KEY_NDC);
          return;
        case "ArrowDown":
        case "s":
        case "S":
          event.preventDefault();
          handle?.applyPan(0, ORB_PAN_KEY_NDC);
          return;
        default:
          return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, getHandle, togglePauseMotion]);
}
