import {
  exceededTapTravel,
  tapHitRadiusFor,
  TAP_HIT_RADIUS_MOUSE_PX,
  TAP_HIT_RADIUS_TOUCH_PX,
  TAP_MAX_TRAVEL_PX,
} from "../pointer-gesture";

describe("exceededTapTravel", () => {
  it("returns false when the pointer did not move", () => {
    expect(
      exceededTapTravel({ startX: 100, startY: 100, endX: 100, endY: 100 }),
    ).toBe(false);
  });

  it("returns false at the threshold boundary", () => {
    expect(
      exceededTapTravel({
        startX: 0,
        startY: 0,
        endX: TAP_MAX_TRAVEL_PX,
        endY: 0,
      }),
    ).toBe(false);
  });

  it("returns true just past the threshold", () => {
    expect(
      exceededTapTravel({
        startX: 0,
        startY: 0,
        endX: TAP_MAX_TRAVEL_PX + 1,
        endY: 0,
      }),
    ).toBe(true);
  });

  it("uses euclidean distance, not axis-aligned max", () => {
    // A 5,5 move has euclidean distance ~7.07, which is > 6.
    expect(
      exceededTapTravel({ startX: 0, startY: 0, endX: 5, endY: 5 }),
    ).toBe(true);
    // A 4,4 move has distance ~5.66, which is < 6.
    expect(
      exceededTapTravel({ startX: 0, startY: 0, endX: 4, endY: 4 }),
    ).toBe(false);
  });

  it("is symmetric: direction does not matter", () => {
    const forward = exceededTapTravel({
      startX: 10,
      startY: 10,
      endX: 30,
      endY: 10,
    });
    const backward = exceededTapTravel({
      startX: 30,
      startY: 10,
      endX: 10,
      endY: 10,
    });
    expect(forward).toBe(backward);
    expect(forward).toBe(true);
  });
});

describe("tapHitRadiusFor", () => {
  it("uses the tighter mouse radius for pointerType='mouse'", () => {
    expect(tapHitRadiusFor("mouse")).toBe(TAP_HIT_RADIUS_MOUSE_PX);
  });

  it("uses the touch radius for pointerType='touch'", () => {
    expect(tapHitRadiusFor("touch")).toBe(TAP_HIT_RADIUS_TOUCH_PX);
  });

  it("defaults to touch radius for pen and unknown pointer types", () => {
    expect(tapHitRadiusFor("pen")).toBe(TAP_HIT_RADIUS_TOUCH_PX);
    expect(tapHitRadiusFor("")).toBe(TAP_HIT_RADIUS_TOUCH_PX);
  });

  it("touch radius is large enough for a ~24px WCAG target floor", () => {
    expect(TAP_HIT_RADIUS_TOUCH_PX).toBeGreaterThanOrEqual(20);
  });
});
