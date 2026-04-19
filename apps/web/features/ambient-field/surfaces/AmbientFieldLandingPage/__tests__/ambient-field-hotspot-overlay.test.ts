import { resolveAmbientFieldFocusPresentation } from "../ambient-field-hotspot-overlay";

describe("resolveAmbientFieldFocusPresentation", () => {
  const seatRect = {
    height: 220,
    left: 560,
    top: 180,
  };

  it("keeps the point close to its sampled field entry before settling near the seat", () => {
    const frame = {
      color: "rgb(120 160 220)",
      focusDismissProgress: 0,
      focusProgress: 0.2,
      id: "blob-hotspot-0",
      mode: "focus" as const,
      opacity: 0.92,
      scale: 0.88,
      showCard: false,
      visible: true,
      x: 140,
      y: 320,
    };

    const early = resolveAmbientFieldFocusPresentation({
      frame,
      nowSeconds: 12,
      previousState: null,
      seatRect,
    });
    const late = resolveAmbientFieldFocusPresentation({
      frame: {
        ...frame,
        focusProgress: 0.84,
      },
      nowSeconds: 13.1,
      previousState: early.state,
      seatRect,
    });

    const entryDistanceEarly = Math.hypot(
      early.pointX - frame.x,
      early.pointY - frame.y,
    );
    const seatEdgeX = seatRect.left - 24;
    const seatEdgeY = seatRect.top + seatRect.height * 0.32;
    const seatDistanceLate = Math.hypot(
      late.pointX - seatEdgeX,
      late.pointY - seatEdgeY,
    );

    expect(entryDistanceEarly).toBeLessThan(40);
    expect(seatDistanceLate).toBeLessThan(30);
    expect(late.pointScale).toBeGreaterThan(early.pointScale);
  });

  it("reveals the seat after the point has already begun traveling", () => {
    const frame = {
      color: "rgb(120 160 220)",
      focusDismissProgress: 0,
      focusProgress: 0.18,
      id: "blob-hotspot-0",
      mode: "focus" as const,
      opacity: 0.84,
      scale: 0.94,
      showCard: false,
      visible: true,
      x: 180,
      y: 290,
    };

    const presentation = resolveAmbientFieldFocusPresentation({
      frame,
      nowSeconds: 22,
      previousState: null,
      seatRect,
    });

    expect(presentation.pointOpacity).toBe(frame.opacity);
    expect(presentation.seatOpacity).toBeLessThan(frame.opacity * 0.2);
    expect(presentation.seatTranslateY).toBeGreaterThan(10);
  });

  it("dismisses the seat before sending the point up and right into the background", () => {
    const frame = {
      color: "rgb(120 160 220)",
      focusDismissProgress: 0.06,
      focusProgress: 0.78,
      id: "blob-hotspot-0",
      mode: "focus" as const,
      opacity: 0.9,
      scale: 0.9,
      showCard: false,
      visible: true,
      x: 200,
      y: 320,
    };

    const settled = resolveAmbientFieldFocusPresentation({
      frame,
      nowSeconds: 30,
      previousState: null,
      seatRect,
    });
    const exiting = resolveAmbientFieldFocusPresentation({
      frame: {
        ...frame,
        focusDismissProgress: 0.96,
        focusProgress: 0.98,
      },
      nowSeconds: 31.2,
      previousState: settled.state,
      seatRect,
    });

    expect(exiting.pointX).toBeGreaterThan(settled.pointX);
    expect(exiting.pointY).toBeLessThan(settled.pointY);
    expect(exiting.pointScale).toBeLessThan(settled.pointScale);
    expect(exiting.seatOpacity).toBeLessThan(settled.seatOpacity);
  });
});
