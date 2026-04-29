import { ORB_PICK_NO_HIT } from "../../interaction/orb-picker-store";
import { resolvePickFromCandidates } from "../orb-webgpu-picking";

// JS mirror of the WGSL atomicMin reduction. The WGSL kernel packs
// (depthQ << 16) | index into one u32 and atomicMin's it into a single
// slot, so the winner is the smallest depthQ first, smallest index on
// tie. These tests pin that rule so a future shader refactor stays in
// sync with the host-side helper.
describe("resolvePickFromCandidates", () => {
  it("returns ORB_PICK_NO_HIT when there are no candidates", () => {
    expect(resolvePickFromCandidates([])).toBe(ORB_PICK_NO_HIT);
  });

  it("front candidate (smaller depthQ) wins over back candidate", () => {
    const result = resolvePickFromCandidates([
      { depthQ: 200, index: 5 },
      { depthQ: 100, index: 17 },
      { depthQ: 300, index: 3 },
    ]);
    expect(result).toBe(17);
  });

  it("on equal depthQ, the smaller index wins (stable tie-break)", () => {
    const result = resolvePickFromCandidates([
      { depthQ: 50, index: 9 },
      { depthQ: 50, index: 4 },
      { depthQ: 50, index: 12 },
    ]);
    expect(result).toBe(4);
  });

  it("singleton candidate is returned unchanged", () => {
    expect(
      resolvePickFromCandidates([{ depthQ: 999, index: 7 }]),
    ).toBe(7);
  });

  it("pure depth ordering trumps index tie-break — smaller depth wins even with larger index", () => {
    const result = resolvePickFromCandidates([
      { depthQ: 100, index: 0 },
      { depthQ: 99, index: 65535 },
    ]);
    expect(result).toBe(65535);
  });

  it("handles a full screen-distance survivor list deterministically", () => {
    // Same screen-distance hits, varying depth and index. Mirror what
    // a tightly-clustered region of particles looks like to the WGSL
    // kernel after the screen-radius gate.
    const candidates = [];
    for (let i = 0; i < 32; i += 1) {
      candidates.push({ depthQ: 200 + i, index: 100 - i });
    }
    candidates.push({ depthQ: 50, index: 999 }); // clear front winner
    candidates.push({ depthQ: 50, index: 998 }); // closer index — wins tie
    expect(resolvePickFromCandidates(candidates)).toBe(998);
  });
});
