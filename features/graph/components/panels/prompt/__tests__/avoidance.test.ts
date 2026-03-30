import { resolvePromptAutoPosition } from "../avoidance";

describe("prompt avoidance", () => {
  it("keeps the baseline auto position when no obstacles overlap", () => {
    const result = resolvePromptAutoPosition({
      vw: 1200,
      vh: 800,
      cardW: 420,
      cardH: 140,
      baseX: 0,
      baseY: -120,
      minX: -200,
      maxX: 200,
      minY: -420,
      maxY: -120,
      bottomBase: 32,
      avoidRects: [],
    });

    expect(result).toEqual({ x: 0, y: -120 });
  });

  it("prefers moving upward when the focused area overlaps the prompt center", () => {
    const result = resolvePromptAutoPosition({
      vw: 1200,
      vh: 800,
      cardW: 420,
      cardH: 140,
      baseX: 0,
      baseY: -120,
      minX: -200,
      maxX: 200,
      minY: -420,
      maxY: -120,
      bottomBase: 32,
      avoidRects: [
        {
          left: 420,
          right: 780,
          top: 420,
          bottom: 580,
        },
      ],
    });

    expect(result.x).toBe(0);
    expect(result.y).toBeLessThan(-120);
  });

  it("shifts sideways when upward movement cannot clear the focused area", () => {
    const result = resolvePromptAutoPosition({
      vw: 1200,
      vh: 800,
      cardW: 420,
      cardH: 180,
      baseX: 0,
      baseY: -220,
      minX: -260,
      maxX: 260,
      minY: -220,
      maxY: -220,
      bottomBase: 32,
      avoidRects: [
        {
          left: 420,
          right: 780,
          top: 310,
          bottom: 600,
        },
      ],
    });

    expect(result.y).toBe(-220);
    expect(result.x).not.toBe(0);
  });
});
