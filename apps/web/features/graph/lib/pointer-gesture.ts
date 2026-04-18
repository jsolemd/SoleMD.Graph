/**
 * Shared pointer-gesture primitives for graph surfaces.
 *
 * Both the main Cosmograph canvas and the wiki Pixi graph need to distinguish
 * a tap from a drag/pan when the browser's native `click` semantics don't
 * reach them cleanly (pointerdown preventDefault on touch suppresses `click`;
 * d3-zoom pan on touch can still synthesize a tap on the background).
 *
 * One threshold, one helper, one place to change if the ergonomics need tuning.
 */

/**
 * Long-press threshold: how long a finger (or mouse) must remain stationary
 * on a target before the gesture is committed as a long-press. Matches
 * common mobile conventions (Android ~500ms, iOS ~400ms) — the lower end
 * keeps the interaction responsive without misfiring during quick taps.
 */
export const LONG_PRESS_MS = 400;

/**
 * Maximum CSS-pixel travel between pointerdown and pointerup that still
 * counts as a tap. Travel beyond this is treated as a drag/pan.
 *
 * Matches the common ~6px finger-jitter tolerance used by d3-zoom's
 * `clickDistance` ergonomics and standard mobile UI kits.
 */
export const TAP_MAX_TRAVEL_PX = 6;

/**
 * Travel threshold for long-press specifically. Finger jitter over the
 * ~400ms press window easily exceeds `TAP_MAX_TRAVEL_PX`, which would
 * cancel an otherwise valid long-press. Use a more permissive floor that
 * still rejects an intentional drag.
 */
export const LONG_PRESS_MAX_TRAVEL_PX = 16;

/**
 * Hit-test radius around a point's center (in the same coordinate space as
 * the point positions) that counts as tapping that point.
 *
 * Mouse has pixel-precise aim; touch lands ~15-20px off the visible target.
 * The touch value is set so that the effective tap target clears the WCAG
 * 2.2 Target Size (Minimum) floor of 24x24 CSS px when combined with the
 * rendered node radius.
 */
export const TAP_HIT_RADIUS_MOUSE_PX = 12;
export const TAP_HIT_RADIUS_TOUCH_PX = 24;

/** Pick the right tap radius for the pointer that produced the event. */
export function tapHitRadiusFor(pointerType: string): number {
  return pointerType === "mouse"
    ? TAP_HIT_RADIUS_MOUSE_PX
    : TAP_HIT_RADIUS_TOUCH_PX;
}

export interface TapTravelInput {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/**
 * True iff the pointer moved more than `TAP_MAX_TRAVEL_PX` between the two
 * sample points. Uses squared distance to avoid a sqrt.
 */
export function exceededTapTravel({
  startX,
  startY,
  endX,
  endY,
}: TapTravelInput): boolean {
  const dx = endX - startX;
  const dy = endY - startY;
  return dx * dx + dy * dy > TAP_MAX_TRAVEL_PX * TAP_MAX_TRAVEL_PX;
}

/**
 * Shared pan-state latch for surfaces where a pan/zoom gesture should
 * suppress post-gesture tap side effects (click-to-clear, hover reset,
 * etc.) without wiping the user's selection. Callers decide what counts
 * as a "real" pan — movement thresholds, transform delta, etc. — and
 * call `markPanned()`. Tap handlers read `consumeJustPan()` exactly once
 * at pointerup, which returns the flag and resets it in the same step.
 *
 * Used by both the Cosmograph pan guard and the wiki Pixi graph so the
 * two surfaces share one state-machine contract instead of re-rolling it.
 */
export interface PanLatch {
  setPanning(active: boolean): void;
  markPanned(): void;
  consumeJustPan(): boolean;
  isPanning(): boolean;
}

export function createPanLatch(): PanLatch {
  let active = false;
  let justPanned = false;
  return {
    setPanning(next) {
      active = next;
    },
    markPanned() {
      justPanned = true;
    },
    consumeJustPan() {
      const value = justPanned;
      justPanned = false;
      return value;
    },
    isPanning() {
      return active;
    },
  };
}
