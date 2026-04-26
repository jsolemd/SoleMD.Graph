"use client";

import { useCallback, useRef } from "react";

import { useOrbInteraction } from "./orb-interaction-context";

/**
 * Single DOM owner of orb-mode pointer / wheel / touch interaction.
 *
 * Replaces the prior `OrbClickCaptureLayer`. Sits above the layout-passive
 * `FieldCanvas` (z:0, `pointer-events-none`) and below the canonical
 * detail / wiki / info / prompt panels (z:30+) so panels intercept their
 * own pointer events first and orb clicks fall through to this surface.
 *
 * Slice A0 contract:
 * - Establishes the surface, the registration handshake to the
 *   `OrbInteractionContext` provider, and the explicit touch / select /
 *   contextmenu CSS that future slices need.
 * - Preserves the existing `<4px movement = click` semantics from
 *   `OrbClickCaptureLayer` 1:1.
 * - Does **not** install wheel / drag / rect handlers. Those land in
 *   slices A1 (camera controls), D (chords), E (rect). Slice C wires
 *   pointermove into the hover resolver through the optional props.
 *
 * The surface is `aria-hidden` because orb a11y will land as a
 * keyboard-driven path on the detail panel, not through this invisible
 * catch element.
 */

const DRAG_THRESHOLD_PX = 4;

// Touch double-tap detection. 300ms is the OS-standard "double-tap"
// interval (iOS / Android both treat this as the boundary between
// "two taps" and "tap, pause, tap"); 30px tolerance covers natural
// finger drift across two quick taps.
const DOUBLE_TAP_WINDOW_MS = 300;
const DOUBLE_TAP_RADIUS_PX = 30;

interface OrbInteractionSurfaceProps {
  onClick: (clientX: number, clientY: number) => void;
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
}

export function OrbInteractionSurface({
  onClick,
  onDoubleTap,
  onHoverMove,
  onHoverClear,
}: OrbInteractionSurfaceProps) {
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  // Tracks the number of primary-button pointers currently down. On
  // mobile, two-finger camera gestures (pan + pinch via drei
  // `<CameraControls>` `TOUCH_DOLLY_OFFSET`) generate two pointerdowns
  // and two pointerups; without this guard, a brief two-finger gesture
  // where the second finger barely moves could fire a stray tap-select
  // when it lifts. Contract:
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
  // consumers (slice A1's `<CameraControls>` effect, etc.) can react to
  // element identity changes — including the 3D ↔ 2D toggle replacing
  // the surface entirely.
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
      // touchAction `none` so drei `<CameraControls>` (slice A1) owns
      // pinch / two-finger gestures without the browser stealing
      // vertical pinches as page scroll. userSelect prevents text-
      // selection during camera drags.
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
      onPointerDown={(e) => {
        // Only track primary-button presses for the click-vs-drag
        // discriminator. Right-button (button=2) is camera-controls'
        // OFFSET pan; middle (button=1) is dolly. Letting those fire a
        // selection-click on under-4px pointerup would re-select the
        // particle under the cursor every time the user clicks-without-
        // dragging to pan or dolly. Touch reports button=0 by default,
        // so this also leaves single-finger tap-select working.
        if (e.button !== 0) return;
        activePointerCountRef.current += 1;
        if (activePointerCountRef.current === 1) {
          downRef.current = { x: e.clientX, y: e.clientY };
        } else {
          // Second (or later) finger landed — abandon the in-flight tap.
          // The user is mid two-finger gesture; whichever finger lifts
          // first should NOT count as a tap, and neither should the
          // last finger that lifts after the gesture completes.
          downRef.current = null;
        }
      }}
      onPointerMove={(e) => {
        // Hover is desktop-only and should not run while the same
        // surface is handling camera drag / pan / pinch gestures.
        if (e.pointerType === "touch" || e.buttons !== 0) return;
        onHoverMove?.(e.clientX, e.clientY);
      }}
      onPointerLeave={() => {
        onHoverClear?.();
      }}
      onPointerUp={(e) => {
        if (e.button !== 0) return;
        activePointerCountRef.current = Math.max(
          0,
          activePointerCountRef.current - 1,
        );
        // Only the last finger lifting can complete a tap, and only if
        // no additional finger ever joined (downRef is still set).
        if (activePointerCountRef.current > 0) return;
        const start = downRef.current;
        downRef.current = null;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) return;
        onClick(e.clientX, e.clientY);

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
        if (e.button !== 0) return;
        activePointerCountRef.current = Math.max(
          0,
          activePointerCountRef.current - 1,
        );
        if (activePointerCountRef.current === 0) downRef.current = null;
        onHoverClear?.();
      }}
      // Right-drag is camera-controls' OFFSET pan; suppress the browser
      // context menu so the gesture doesn't open it on right-click.
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    />
  );
}
