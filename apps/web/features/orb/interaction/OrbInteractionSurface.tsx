"use client";

import { useCallback, useRef, useState } from "react";

import {
  readGraphSelectionChords,
  type GraphSelectionChordState,
} from "@/features/graph/lib/graph-selection-chords";
import { useOrbInteraction } from "./orb-interaction-context";

/**
 * Single DOM owner of orb-mode pointer / wheel / touch interaction.
 *
 * Sits above the WebGPU orb canvas (z:0, `pointer-events-none`) and below
 * the canonical detail / wiki / info / prompt panels (z:30+) so panels
 * intercept their own pointer events first and orb clicks fall through to
 * this surface.
 *
 * Slice A0 contract:
 * - Establishes the surface, the registration handshake to the
 *   `OrbInteractionContext` provider, and the explicit touch / select /
 *   contextmenu CSS that future slices need.
 * - Preserves the existing `<4px movement = click` semantics from
 *   `OrbClickCaptureLayer` 1:1.
 * - Slice E owns rectangle drag only when the explicit rectangle tool is
 *   active. Default primary drag stays with camera rotation.
 *
 * The surface is `aria-hidden` because orb a11y will land as a
 * keyboard-driven path on the detail panel, not through this invisible
 * catch element.
 */

const DRAG_THRESHOLD_PX = 4;
const RECTANGLE_THRESHOLD_PX = 8;

// Touch double-tap detection. 300ms is the OS-standard "double-tap"
// interval (iOS / Android both treat this as the boundary between
// "two taps" and "tap, pause, tap"); 30px tolerance covers natural
// finger drift across two quick taps.
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_RADIUS_PX = 30;

export interface OrbSelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function normalizeRect(
  start: { x: number; y: number },
  end: { x: number; y: number },
): OrbSelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
}

function rectSize(rect: OrbSelectionRect): { width: number; height: number } {
  return {
    width: Math.max(0, rect.right - rect.left),
    height: Math.max(0, rect.bottom - rect.top),
  };
}

function trySetPointerCapture(element: HTMLElement, pointerId: number): void {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
    // Synthetic tests and some browser edge cases can report a pointerId
    // that is not capturable. The gesture still works when events remain
    // on the surface, so capture failure should not abort selection.
  }
}

function tryReleasePointerCapture(element: HTMLElement, pointerId: number): void {
  try {
    element.releasePointerCapture?.(pointerId);
  } catch {
    // See trySetPointerCapture.
  }
}

interface OrbInteractionSurfaceProps {
  onClick: (
    clientX: number,
    clientY: number,
    chords: GraphSelectionChordState,
  ) => void;
  /**
   * Touch-only double-tap. Fires *additively* to `onClick` (each tap
   * still selects), so single-tap latency stays at zero; the double-tap
   * is just a second event when two taps land within
   * `DOUBLE_TAP_WINDOW_MS` and `DOUBLE_TAP_RADIUS_PX`. Desktop mouse
   * users have the keyboard `Space` shortcut and do NOT receive this
   * event — clicking-twice on a canvas to pause would surprise them.
   */
  onDoubleTap?: () => void;
  onHoverMove?: (clientX: number, clientY: number) => void;
  onHoverClear?: () => void;
  rectSelectionEnabled?: boolean;
  onRectSelectionCancel?: () => void;
  onRectSelect?: (
    rect: OrbSelectionRect,
    chords: GraphSelectionChordState,
  ) => void;
}

export function OrbInteractionSurface({
  onClick,
  onDoubleTap,
  onHoverMove,
  onHoverClear,
  rectSelectionEnabled = false,
  onRectSelectionCancel,
  onRectSelect,
}: OrbInteractionSurfaceProps) {
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const rightDownRef = useRef<{ x: number; y: number } | null>(null);
  const rectStartRef = useRef<{ x: number; y: number } | null>(null);
  const rectActiveRef = useRef(false);
  const [rectPreview, setRectPreview] = useState<OrbSelectionRect | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  // Tracks the number of primary-button pointers currently down. On
  // mobile, two-finger WebGPU twist gestures generate two pointerdowns and
  // two pointerups; without this guard, a brief two-finger gesture where the
  // second finger barely moves could fire a stray tap-select when it lifts.
  // Contract:
  //   - first pointerdown: count→1, store down position.
  //   - subsequent pointerdown: count→2+, INVALIDATE down position
  //     (null) so no tap can fire when fingers lift.
  //   - pointerup: count decrements. Tap-select only fires when the
  //     LAST finger lifts (count === 0) AND the down position is still
  //     stored (no second finger ever joined).
  // pointercancel mirrors pointerup so a browser-canceled touch
  // doesn't leave the count permanently elevated.
  const activePointerCountRef = useRef(0);
  const { registerSurface } = useOrbInteraction();

  // Callback ref: fires with the element when it mounts and `null` on
  // unmount. The provider's `surfaceElement` state mirrors that, so
  // consumers can react to element identity changes, including the 3D ↔ 2D
  // toggle replacing the surface entirely.
  const handleRef = useCallback(
    (node: HTMLDivElement | null) => {
      registerSurface(node);
    },
    [registerSurface],
  );

  return (
    <div
      ref={handleRef}
      aria-hidden
      className="pointer-events-auto fixed inset-0 z-[5]"
      // touchAction `none` so the WebGPU orb owns pointer gestures without
      // the browser stealing vertical pinches as page scroll. userSelect
      // prevents text-selection during drags.
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={(e) => {
        // Only track primary-button presses for the click-vs-drag
        // discriminator. Right-button is reserved for rectangle selection
        // when that tool is active; middle/right non-tool clicks are ignored
        // so they cannot accidentally re-select a particle. Touch reports
        // button=0 by default, so single-finger tap-select still works.
        if (e.button === 2 && rectSelectionEnabled) {
          rightDownRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
        if (e.button !== 0) return;
        activePointerCountRef.current += 1;
        if (activePointerCountRef.current === 1) {
          downRef.current = { x: e.clientX, y: e.clientY };
          if (rectSelectionEnabled && onRectSelect) {
            rectStartRef.current = { x: e.clientX, y: e.clientY };
            rectActiveRef.current = false;
            setRectPreview(null);
            trySetPointerCapture(e.currentTarget, e.pointerId);
          }
        } else {
          // Second (or later) finger landed — abandon the in-flight tap.
          // The user is mid two-finger gesture; whichever finger lifts
          // first should NOT count as a tap, and neither should the
          // last finger that lifts after the gesture completes.
          downRef.current = null;
          rectStartRef.current = null;
          rectActiveRef.current = false;
          setRectPreview(null);
        }
      }}
      onPointerMove={(e) => {
        const rectStart = rectStartRef.current;
        if (rectStart && activePointerCountRef.current === 1) {
          const nextRect = normalizeRect(rectStart, {
            x: e.clientX,
            y: e.clientY,
          });
          const size = rectSize(nextRect);
          if (
            rectActiveRef.current ||
            size.width >= RECTANGLE_THRESHOLD_PX ||
            size.height >= RECTANGLE_THRESHOLD_PX
          ) {
            rectActiveRef.current = true;
            downRef.current = null;
            setRectPreview(nextRect);
          }
          return;
        }

        // Hover is desktop-only and should not run while the same
        // surface is handling camera drag / pan / pinch gestures.
        if (e.pointerType === "touch" || e.buttons !== 0) return;
        onHoverMove?.(e.clientX, e.clientY);
      }}
      onPointerLeave={() => {
        onHoverClear?.();
      }}
      onPointerUp={(e) => {
        if (e.button === 2 && rectSelectionEnabled) {
          const start = rightDownRef.current;
          rightDownRef.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) {
            onRectSelectionCancel?.();
          }
          return;
        }
        if (e.button !== 0) return;
        activePointerCountRef.current = Math.max(
          0,
          activePointerCountRef.current - 1,
        );
        // Only the last finger lifting can complete a tap, and only if
        // no additional finger ever joined (downRef is still set).
        if (activePointerCountRef.current > 0) return;

        const rectStart = rectStartRef.current;
        const shouldCommitRect = rectActiveRef.current && rectStart != null;
        rectStartRef.current = null;
        rectActiveRef.current = false;
        setRectPreview(null);
        if (rectStart) {
          tryReleasePointerCapture(e.currentTarget, e.pointerId);
        }
        if (shouldCommitRect && onRectSelect) {
          const rect = normalizeRect(rectStart, { x: e.clientX, y: e.clientY });
          const size = rectSize(rect);
          if (
            size.width >= RECTANGLE_THRESHOLD_PX ||
            size.height >= RECTANGLE_THRESHOLD_PX
          ) {
            onRectSelect(rect, readGraphSelectionChords(e.nativeEvent));
            return;
          }
        }

        const start = downRef.current;
        downRef.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) return;
        onClick(e.clientX, e.clientY, readGraphSelectionChords(e.nativeEvent));

        // Touch-only double-tap. Fires additively after `onClick` —
        // single-tap selection still happens on every tap; this just
        // emits a second event when the second tap lands within window.
        if (e.pointerType !== "touch" || !onDoubleTap) return;
        const last = lastTapRef.current;
        const now = e.timeStamp;
        if (
          last &&
          now - last.time <= DOUBLE_TAP_WINDOW_MS &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) <=
            DOUBLE_TAP_RADIUS_PX
        ) {
          onDoubleTap();
          lastTapRef.current = null;
          return;
        }
        lastTapRef.current = { x: e.clientX, y: e.clientY, time: now };
      }}
      onPointerCancel={(e) => {
        // Browser canceled the touch (e.g. system gesture interrupt).
        // Mirror pointerup's count decrement so the next gesture
        // starts from a clean slate; do NOT fire onClick.
        if (e.button === 2) {
          rightDownRef.current = null;
          return;
        }
        if (e.button !== 0) return;
        activePointerCountRef.current = Math.max(
          0,
          activePointerCountRef.current - 1,
        );
        if (activePointerCountRef.current === 0) {
          downRef.current = null;
          rectStartRef.current = null;
          rectActiveRef.current = false;
          rightDownRef.current = null;
          setRectPreview(null);
        }
        onHoverClear?.();
      }}
      // Suppress the browser context menu so rectangle right-drag does not
      // open it on pointer release.
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      {rectPreview ? (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-sm border"
          style={{
            left: rectPreview.left,
            top: rectPreview.top,
            width: rectSize(rectPreview).width,
            height: rectSize(rectPreview).height,
            borderColor: "var(--mode-accent)",
            backgroundColor: "color-mix(in srgb, var(--mode-accent) 16%, transparent)",
            boxShadow: "0 0 0 1px color-mix(in srgb, var(--mode-accent) 28%, transparent)",
          }}
        />
      ) : null}
    </div>
  );
}
