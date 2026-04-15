// d3-zoom ships as pure ESM; next/jest doesn't transform it. We only need a
// shape-compatible zoomIdentity for this pure-math helper.
jest.mock("d3-zoom", () => {
  class Transform {
    constructor(public k: number, public x: number, public y: number) {}
    translate(dx: number, dy: number): Transform {
      return new Transform(this.k, this.x + this.k * dx, this.y + this.k * dy);
    }
    scale(factor: number): Transform {
      return new Transform(this.k * factor, this.x, this.y);
    }
    applyX(p: number): number {
      return p * this.k + this.x;
    }
    applyY(p: number): number {
      return p * this.k + this.y;
    }
  }
  return { zoomIdentity: new Transform(1, 0, 0) };
});

import { computeFitTransform } from "../fit-view";
import type { SimNode } from "../types";

function node(id: string, x: number, y: number): SimNode {
  return { id, x, y } as unknown as SimNode;
}

describe("computeFitTransform", () => {
  it("returns null when the container has no area", () => {
    expect(computeFitTransform([node("a", 0, 0)], 0, 100)).toBeNull();
    expect(computeFitTransform([node("a", 0, 0)], 100, 0)).toBeNull();
  });

  it("returns null when no node has coordinates yet", () => {
    const blank = { id: "a" } as unknown as SimNode;
    expect(computeFitTransform([blank], 400, 400)).toBeNull();
  });

  it("returns null when the node list is empty", () => {
    expect(computeFitTransform([], 400, 400)).toBeNull();
  });

  it("centers a symmetric bbox at container center with the expected scale", () => {
    // Nodes span (-100..100, -100..100), container 400×400. Bbox is 200×200;
    // raw fit scale is 2, padding 0.9 → k = 1.8. Bbox center is (0, 0) which
    // is already rendered at (W/2, H/2), so translate should be (0, 0).
    const t = computeFitTransform(
      [node("a", -100, -100), node("b", 100, 100)],
      400,
      400,
    );
    expect(t).not.toBeNull();
    expect(t!.k).toBeCloseTo(1.8, 5);
    // applyX(W/2) must equal W/2 for a centered bbox — easier than asserting
    // translate directly because the identity-centered invariant is clearer.
    expect(t!.applyX(200)).toBeCloseTo(200, 5);
    expect(t!.applyY(200)).toBeCloseTo(200, 5);
  });

  it("picks the tighter axis so the whole bbox fits", () => {
    // Tall bbox vs wide container → height bound wins.
    const t = computeFitTransform(
      [node("a", -50, -150), node("b", 50, 150)],
      400,
      300,
      0.9,
    );
    expect(t).not.toBeNull();
    // bboxW=100 → W-bound k = 400/100*0.9 = 3.6
    // bboxH=300 → H-bound k = 300/300*0.9 = 0.9 ← tighter
    expect(t!.k).toBeCloseTo(0.9, 5);
  });

  it("translates so an off-center bbox lands at the container center", () => {
    // Bbox (100..200, 200..300), center (150, 250). Container 400×400.
    // After fit, the rendered bbox center (150 + 200, 250 + 200) = (350, 450)
    // must land at screen (200, 200).
    const t = computeFitTransform(
      [node("a", 100, 200), node("b", 200, 300)],
      400,
      400,
    );
    expect(t).not.toBeNull();
    expect(t!.applyX(350)).toBeCloseTo(200, 5);
    expect(t!.applyY(450)).toBeCloseTo(200, 5);
  });

  it("produces a finite transform for a single node (zero extent)", () => {
    const t = computeFitTransform([node("solo", 42, -7)], 400, 400);
    expect(t).not.toBeNull();
    expect(Number.isFinite(t!.k)).toBe(true);
    expect(t!.k).toBeGreaterThan(0);
  });

  it("honors a custom padding factor", () => {
    const loose = computeFitTransform(
      [node("a", -100, -100), node("b", 100, 100)],
      400,
      400,
      0.5,
    );
    const tight = computeFitTransform(
      [node("a", -100, -100), node("b", 100, 100)],
      400,
      400,
      1.0,
    );
    expect(loose!.k).toBeLessThan(tight!.k);
  });
});
