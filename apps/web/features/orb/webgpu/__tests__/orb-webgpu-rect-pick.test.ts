import { rectPickReduce } from "../orb-webgpu-picking";

// JS mirror of the WGSL rect kernel. A particle is included when its
// projected center is inside an inclusive AABB. Edges count as inside;
// strictly outside is excluded. Zero-area rect returns the empty set —
// a degenerate drag must never select anything.
describe("rectPickReduce", () => {
  it("includes particles whose center is strictly inside the rect", () => {
    const rect = { bottom: -0.5, left: -0.5, right: 0.5, top: 0.5 };
    const centers = [
      { x: 0, y: 0 }, // inside
      { x: 0.4, y: 0.4 }, // inside
      { x: 0.6, y: 0.6 }, // outside (above-right)
      { x: -0.6, y: 0 }, // outside (left)
    ];
    expect(rectPickReduce(rect, centers)).toEqual([0, 1]);
  });

  it("includes particles exactly on the edges (inclusive)", () => {
    const rect = { bottom: -0.5, left: -0.5, right: 0.5, top: 0.5 };
    const centers = [
      { x: -0.5, y: 0 }, // left edge
      { x: 0.5, y: 0 }, // right edge
      { x: 0, y: 0.5 }, // top edge
      { x: 0, y: -0.5 }, // bottom edge
      { x: -0.5, y: -0.5 }, // bottom-left corner
      { x: 0.5, y: 0.5 }, // top-right corner
    ];
    expect(rectPickReduce(rect, centers)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("excludes particles strictly outside the rect", () => {
    const rect = { bottom: 0, left: 0, right: 1, top: 1 };
    const centers = [
      { x: -0.001, y: 0.5 }, // just left
      { x: 1.001, y: 0.5 }, // just right
      { x: 0.5, y: -0.001 }, // just below
      { x: 0.5, y: 1.001 }, // just above
    ];
    expect(rectPickReduce(rect, centers)).toEqual([]);
  });

  it("returns empty for a zero-width rect (left === right)", () => {
    const rect = { bottom: -0.5, left: 0.3, right: 0.3, top: 0.5 };
    const centers = [
      { x: 0.3, y: 0 }, // would otherwise be on the (degenerate) edge
      { x: 0.3, y: 0.4 },
    ];
    expect(rectPickReduce(rect, centers)).toEqual([]);
  });

  it("returns empty for a zero-height rect (top === bottom)", () => {
    const rect = { bottom: 0.2, left: -0.5, right: 0.5, top: 0.2 };
    const centers = [
      { x: 0, y: 0.2 },
      { x: 0.4, y: 0.2 },
    ];
    expect(rectPickReduce(rect, centers)).toEqual([]);
  });

  it("returns empty for an empty centers array", () => {
    const rect = { bottom: -1, left: -1, right: 1, top: 1 };
    expect(rectPickReduce(rect, [])).toEqual([]);
  });

  it("preserves index order in the output", () => {
    const rect = { bottom: -1, left: -1, right: 1, top: 1 };
    const centers = [
      { x: 0, y: 0 },
      { x: 5, y: 5 }, // outside
      { x: 0.1, y: 0.1 },
      { x: -0.5, y: 0.5 },
    ];
    expect(rectPickReduce(rect, centers)).toEqual([0, 2, 3]);
  });

  it("handles a swapped-bounds rect (defensive — runtime normalizes, but kernel must too)", () => {
    // clientRectToClip already orders left<right / bottom<top, but
    // the kernel must remain symmetric so a future caller passing
    // (left=1, right=-1) by mistake doesn't produce phantom hits.
    const rect = { bottom: 0.5, left: 0.5, right: -0.5, top: -0.5 };
    const centers = [
      { x: 0, y: 0 }, // would be inside the normalized rect
      { x: 0.9, y: 0 }, // outside even after normalization
    ];
    expect(rectPickReduce(rect, centers)).toEqual([0]);
  });
});
