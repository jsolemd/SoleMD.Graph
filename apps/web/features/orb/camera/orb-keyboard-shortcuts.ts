import { Vector3 } from "three";
import type CameraControlsImpl from "camera-controls";

import type { BlobController } from "@/features/field/controller/BlobController";

/**
 * Window-level keyboard shortcuts for the 3D orb. Pure factory so the
 * mapping from key → action is unit-testable without an R3F mount.
 *
 *   Space      → toggle pause/play (writes `useShellStore.pauseMotion`).
 *   ← → ↑ ↓    → pan camera via setFocalOffset (OFFSET semantics — the
 *                orbit pivot stays locked at the orb center, matching
 *                right-drag pan). `a / d / w / s` alias the same lane.
 *   < / >      → rotate the orb wrapper ±5° via `BlobController.addTwistImpulse`
 *                so the spin drains over multiple frames (no key-repeat
 *                snapping) and triggers the controller-owned interaction
 *                burst envelope. `q / e` alias the same lane so a player's
 *                left hand on WASD has rotate within reach. Camera-azimuth
 *                rotation stays on left-drag ROTATE.
 *   + / -      → dolly (zoom) via `controls.dolly` — same lane as
 *                mouse-wheel and pinch, so all three feel identical.
 *                `=` doubles as zoom-in (no shift) and `_` as zoom-out.
 *
 * Active-element guard skips text inputs, textareas, contenteditable
 * surfaces, and focused buttons / role=button so the shortcut never
 * steals a keypress that the focused control would handle.
 */

// Distance-proportional pan rate. At distance 100 each arrow-press
// nudges 5 world units laterally; at distance 1000 nudges a perceptible
// 50 units. Matches the wheel-pinch dolly's distance-proportional feel.
export const PAN_KEY_RATE = 0.05;

// ~5° per keypress. Browser key-repeat (~30 Hz) gives ~150°/s on hold,
// while a tap is still visible. Smoothed by `controls.smoothTime`.
export const ROTATE_KEY_RAD = (5 * Math.PI) / 180;

// Distance-proportional dolly rate. At distance 100 a `+` press dollies
// 10 world units inward; at distance 1000, 100 units. Matches the
// wheel/pinch dolly's distance-proportional feel without using their
// rate (which is calibrated for trackpad deltaY pixels, not keypresses).
export const DOLLY_KEY_RATE = 0.1;

interface ShellPauseSlice {
  pauseMotion: boolean;
  setPauseMotion: (value: boolean) => void;
}

export interface OrbKeyboardHandlerDeps {
  getControls: () => CameraControlsImpl | null;
  getBlob: () => BlobController | null;
  getShellState: () => ShellPauseSlice;
}

const SKIP_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

function shouldSkipActiveElement(active: Element | null): boolean {
  if (!active) return false;
  if (SKIP_TAGS.has(active.tagName)) return true;
  // `isContentEditable` is the canonical browser API; the attribute
  // fallback covers jsdom, where the IDL property isn't always wired
  // through from the markup.
  if ((active as HTMLElement).isContentEditable) return true;
  const editable = active.getAttribute("contenteditable");
  if (editable === "" || editable === "true") return true;
  const role = active.getAttribute("role");
  return role === "button" || role === "textbox";
}

export function createOrbKeyboardHandler(
  deps: OrbKeyboardHandlerDeps,
): (event: KeyboardEvent) => void {
  const focalTmp = new Vector3();

  return function handleKeyDown(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (shouldSkipActiveElement(document.activeElement)) return;

    switch (event.key) {
      case " ":
      case "Spacebar": {
        event.preventDefault();
        const shell = deps.getShellState();
        shell.setPauseMotion(!shell.pauseMotion);
        return;
      }
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown":
      case "a":
      case "A":
      case "d":
      case "D":
      case "w":
      case "W":
      case "s":
      case "S": {
        const controls = deps.getControls();
        if (!controls) return;
        event.preventDefault();
        const step = controls.distance * PAN_KEY_RATE;
        const k = event.key;
        const isLeft = k === "ArrowLeft" || k === "a" || k === "A";
        const isRight = k === "ArrowRight" || k === "d" || k === "D";
        const isUp = k === "ArrowUp" || k === "w" || k === "W";
        const isDown = k === "ArrowDown" || k === "s" || k === "S";
        const dx = isLeft ? -step : isRight ? step : 0;
        // Screen-Y grows down; pan up should shift the focal offset
        // negatively so the scene appears to slide down.
        const dy = isUp ? -step : isDown ? step : 0;
        controls.getFocalOffset(focalTmp);
        void controls.setFocalOffset(
          focalTmp.x + dx,
          focalTmp.y + dy,
          focalTmp.z,
          true,
        );
        return;
      }
      case ",":
      case "<":
      case ".":
      case ">":
      case "q":
      case "Q":
      case "e":
      case "E": {
        const blob = deps.getBlob();
        if (!blob) return;
        event.preventDefault();
        const k = event.key;
        const isLeft = k === "," || k === "<" || k === "q" || k === "Q";
        const dir = isLeft ? -1 : 1;
        // Use the smoothed impulse path — `applyTwist` would dump the
        // full 5° in one frame and snap visibly between browser
        // key-repeats. `addTwistImpulse` queues the delta to drain
        // exponentially in `BlobController.tick`. Sign matches
        // OrbTouchTwist: screen-CW finger / right-key → world-CW spin.
        blob.addTwistImpulse(-dir * ROTATE_KEY_RAD);
        return;
      }
      case "+":
      case "=":
      case "-":
      case "_": {
        const controls = deps.getControls();
        if (!controls) return;
        event.preventDefault();
        const dir = event.key === "+" || event.key === "=" ? 1 : -1;
        void controls.dolly(dir * controls.distance * DOLLY_KEY_RATE, true);
        return;
      }
      default:
        return;
    }
  };
}
