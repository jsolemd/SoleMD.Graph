import type { CosmographRef } from "@cosmograph/react";

import {
  applyViewportCamera,
  getViewportTransform,
} from "./cosmograph-viewport";
import { shouldSkipGraphKeyboardShortcut } from "@/features/graph/lib/graph-keyboard-guards";

/**
 * Window-level keyboard shortcuts for the 2D Cosmograph map. Pure
 * factory — `createGraphKeyboardHandler` returns a `keydown` handler
 * given a getter for the live `CosmographRef`. The handler is unit-
 * testable without mounting Cosmograph.
 *
 *   ← → ↑ ↓    → pan via the d3-zoom internal transform; `a / d / w / s`
 *                alias the same lane so a player's left hand on WASD
 *                pans without reaching for arrows. Pan is in screen
 *                pixels, scaled by `PAN_KEY_PIXELS` per keypress —
 *                matches the feel of a mouse-drag of the same distance.
 *   Escape      → clear inspection focus (`selectedNode` + focused index).
 *   + / -       → zoom in / out through Cosmograph's native zoom API.
 *
 * Active-element guard skips text inputs, textareas, contenteditable
 * surfaces, and focused buttons / role=button so the shortcut never
 * steals a keypress that the focused control would handle.
 */

// Per-keypress pan in screen pixels. 60 is brisk on a laptop trackpad
// (about a fingernail width of motion), small enough that a tap reads
// as a deliberate nudge rather than a jump. Browser key-repeat (~30 Hz)
// turns hold-to-pan into ~1800 px/s, comparable to a slow drag.
export const PAN_KEY_PIXELS = 60;
export const ZOOM_KEY_FACTOR = 1.2;
export const ZOOM_KEY_DURATION_MS = 200;

export interface GraphKeyboardHandlerDeps {
  getCosmograph: () => CosmographRef | undefined | null;
  clearInspection?: () => void;
}

export function createGraphKeyboardHandler(
  deps: GraphKeyboardHandlerDeps,
): (event: KeyboardEvent) => void {
  return function handleKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (shouldSkipGraphKeyboardShortcut(document.activeElement)) return;

    if (event.key === "Escape") {
      if (!deps.clearInspection) return;
      event.preventDefault();
      deps.clearInspection();
      return;
    }

    const k = event.key;
    const isZoomIn = k === "+" || k === "=";
    const isZoomOut = k === "-" || k === "_";
    if (isZoomIn || isZoomOut) {
      const cosmograph = deps.getCosmograph();
      if (!cosmograph) return;
      const current = Number(cosmograph.getZoomLevel());
      if (!Number.isFinite(current) || current <= 0) return;
      event.preventDefault();
      cosmograph.setZoomLevel(
        isZoomIn ? current * ZOOM_KEY_FACTOR : current / ZOOM_KEY_FACTOR,
        ZOOM_KEY_DURATION_MS,
      );
      return;
    }

    const isLeft = k === "ArrowLeft" || k === "a" || k === "A";
    const isRight = k === "ArrowRight" || k === "d" || k === "D";
    const isUp = k === "ArrowUp" || k === "w" || k === "W";
    const isDown = k === "ArrowDown" || k === "s" || k === "S";
    if (!isLeft && !isRight && !isUp && !isDown) return;

    const cosmograph = deps.getCosmograph();
    const transform = getViewportTransform(cosmograph);
    if (!cosmograph || !transform) return;

    event.preventDefault();
    // D3 zoom transform movement is camera-space inverse: increasing
    // transformX shifts the world right on screen, which feels like the
    // viewport panned left. Flip the key deltas so the arrow names match
    // the perceived camera movement.
    const dx = isLeft ? PAN_KEY_PIXELS : isRight ? -PAN_KEY_PIXELS : 0;
    const dy = isUp ? PAN_KEY_PIXELS : isDown ? -PAN_KEY_PIXELS : 0;
    applyViewportCamera(cosmograph, {
      zoomLevel: transform.zoomLevel,
      transformX: transform.transformX + dx,
      transformY: transform.transformY + dy,
    });
  };
}
