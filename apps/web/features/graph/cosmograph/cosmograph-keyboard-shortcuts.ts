import type { CosmographRef } from "@cosmograph/react";

import {
  applyViewportCamera,
  getViewportTransform,
} from "./cosmograph-viewport";

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

export interface GraphKeyboardHandlerDeps {
  getCosmograph: () => CosmographRef | undefined | null;
}

const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

function shouldSkipActiveElement(active: Element | null): boolean {
  if (!active) return false;
  if (SKIP_TAGS.has(active.tagName)) return true;
  if ((active as HTMLElement).isContentEditable) return true;
  const editable = active.getAttribute("contenteditable");
  if (editable === "" || editable === "true") return true;
  const role = active.getAttribute("role");
  return role === "button" || role === "textbox";
}

export function createGraphKeyboardHandler(
  deps: GraphKeyboardHandlerDeps,
): (event: KeyboardEvent) => void {
  return function handleKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (shouldSkipActiveElement(document.activeElement)) return;

    const k = event.key;
    const isLeft = k === "ArrowLeft" || k === "a" || k === "A";
    const isRight = k === "ArrowRight" || k === "d" || k === "D";
    const isUp = k === "ArrowUp" || k === "w" || k === "W";
    const isDown = k === "ArrowDown" || k === "s" || k === "S";
    if (!isLeft && !isRight && !isUp && !isDown) return;

    const cosmograph = deps.getCosmograph();
    const transform = getViewportTransform(cosmograph);
    if (!cosmograph || !transform) return;

    event.preventDefault();
    const dx = isLeft ? -PAN_KEY_PIXELS : isRight ? PAN_KEY_PIXELS : 0;
    const dy = isUp ? -PAN_KEY_PIXELS : isDown ? PAN_KEY_PIXELS : 0;
    applyViewportCamera(cosmograph, {
      zoomLevel: transform.zoomLevel,
      transformX: transform.transformX + dx,
      transformY: transform.transformY + dy,
    });
  };
}
