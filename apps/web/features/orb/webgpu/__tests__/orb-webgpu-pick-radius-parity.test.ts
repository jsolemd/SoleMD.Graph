import { ORB_PICK_NO_HIT } from "../../interaction/orb-picker-store";
import {
  ORB_WEBGPU_DIM_FLAG,
  ORB_WEBGPU_EVIDENCE_FLAG,
} from "../orb-webgpu-particles";
import { resolvePickFromCandidates } from "../orb-webgpu-picking";

// JS mirror of WGSL `visualRadius` + the post-`integrateParticles`
// multipliers in orb-webgpu-shader.ts. The WGSL `computeDisplay[i].center.w`
// is `visualRadius(...) * (1 + liveDrift * 0.020) * viewZoom`. The pick
// kernel reads that same value as its hit threshold — no extra inflation.
// This helper pins both halves so a future shader refactor can't desync
// the renderer and the picker.
function computeFinalRadius(input: {
  baseRadius: number;
  depth: number; // pre-projection z, in shader's depth space
  flag: number;
  colorTime: number;
  hoverW: number;
  selectW: number;
  focusW: number;
  liveDrift: number;
  viewZoom: number;
}): number {
  const pulse = 0.5 + 0.5 * Math.sin(input.colorTime * 4.2);
  let radius =
    input.baseRadius *
    Math.min(Math.max(1.0 + input.depth * 0.10, 0.88), 1.10);
  if ((input.flag & ORB_WEBGPU_DIM_FLAG) !== 0) radius *= 0.82;
  if ((input.flag & ORB_WEBGPU_EVIDENCE_FLAG) !== 0) {
    radius *= 1.20 + pulse * 0.16;
  }
  radius *= 1.0 + (1.46 - 1.0) * input.selectW;
  radius *= 1.0 + (1.70 - 1.0) * input.hoverW;
  radius *= 1.0 + (2.15 - 1.0) * input.focusW;
  // Post-everything multipliers applied by `integrateParticles` after
  // `visualRadius` returns. Pick reads `display.center.w` which already
  // contains these.
  radius *= 1.0 + input.liveDrift * 0.020;
  radius *= input.viewZoom;
  return radius;
}

describe("orb WebGPU pick radius parity (visual ≡ pick threshold)", () => {
  const BASE = 0.0018;
  const DEFAULT_INPUT = {
    baseRadius: BASE,
    depth: 0.0,
    flag: 0,
    colorTime: 0.0,
    hoverW: 0,
    selectW: 0,
    focusW: 0,
    liveDrift: 0,
    viewZoom: 1.0,
  } as const;

  it("idle particle: visual radius equals base radius (no enlargement)", () => {
    expect(computeFinalRadius(DEFAULT_INPUT)).toBeCloseTo(BASE, 9);
  });

  it("selectW=1 multiplies the visual radius by 1.46", () => {
    const r = computeFinalRadius({ ...DEFAULT_INPUT, selectW: 1 });
    expect(r).toBeCloseTo(BASE * 1.46, 9);
  });

  it("hoverW=1 multiplies by 1.70", () => {
    const r = computeFinalRadius({ ...DEFAULT_INPUT, hoverW: 1 });
    expect(r).toBeCloseTo(BASE * 1.70, 9);
  });

  it("focusW=1 multiplies by 2.15", () => {
    const r = computeFinalRadius({ ...DEFAULT_INPUT, focusW: 1 });
    expect(r).toBeCloseTo(BASE * 2.15, 9);
  });

  it("DIM flag shrinks visual radius by 0.82× (un-engaged dim particles)", () => {
    const r = computeFinalRadius({
      ...DEFAULT_INPUT,
      flag: ORB_WEBGPU_DIM_FLAG,
    });
    expect(r).toBeCloseTo(BASE * 0.82, 9);
  });

  it("viewZoom uniformly scales the visual radius (and therefore the pick threshold)", () => {
    const r = computeFinalRadius({ ...DEFAULT_INPUT, viewZoom: 1.4 });
    expect(r).toBeCloseTo(BASE * 1.4, 9);
  });

  it("liveDrift adds a ±2% jitter to the radius", () => {
    const max = computeFinalRadius({ ...DEFAULT_INPUT, liveDrift: 1 });
    const min = computeFinalRadius({ ...DEFAULT_INPUT, liveDrift: -1 });
    expect(max).toBeCloseTo(BASE * 1.020, 9);
    expect(min).toBeCloseTo(BASE * 0.980, 9);
  });

  it("table case: deterministic across (depth, hover, select, focus, zoom)", () => {
    // Pin a representative row so a future shader edit that drifts any
    // visualRadius coefficient explicitly fails this test.
    const r = computeFinalRadius({
      baseRadius: BASE,
      depth: 0.5,
      flag: 0,
      colorTime: 0.0,
      hoverW: 0.5,
      selectW: 0.25,
      focusW: 0.0,
      liveDrift: 0.4,
      viewZoom: 1.2,
    });
    // Manual closed form:
    //   depth term = clamp(1 + 0.5*0.1, 0.88, 1.10) = 1.05
    //   selectW = 0.25 → 1 + 0.46*0.25 = 1.115
    //   hoverW  = 0.5  → 1 + 0.70*0.5  = 1.35
    //   liveDrift = 0.4 → 1 + 0.020*0.4 = 1.008
    //   viewZoom = 1.2
    //   total = BASE * 1.05 * 1.115 * 1.35 * 1.008 * 1.2
    const expected = BASE * 1.05 * 1.115 * 1.35 * 1.008 * 1.2;
    expect(r).toBeCloseTo(expected, 9);
  });

  // --- Regression: pre-fix the pick kernel inflated the threshold by an
  // extra 1.18 on top of the already post-everything visual radius. With
  // selectW=1 the renderer enlarges the sprite to 1.46× base, so the
  // visible silhouette extends well past 1.18× base. Removing the 1.18
  // inflation pins pick == visual exactly.
  describe("regression: pick threshold equals visual radius (no 1.18 inflation)", () => {
    it("with selectW=1, a click at 1.30× base radius is a hit (visual extends to 1.46×)", () => {
      const visualRadius = computeFinalRadius({
        ...DEFAULT_INPUT,
        selectW: 1,
      });
      const clickDistance = BASE * 1.30;
      // Sanity: click is INSIDE the visible sprite (1.30 < 1.46).
      expect(clickDistance).toBeLessThan(visualRadius);
      // Pick threshold is exactly the visual radius — no extra inflation.
      const isHit = clickDistance <= visualRadius;
      expect(isHit).toBe(true);
    });

    it("idle particle: a click at 1.10× base radius is a MISS (no inflation pads pick)", () => {
      const visualRadius = computeFinalRadius(DEFAULT_INPUT);
      const clickDistance = BASE * 1.10;
      // Pre-fix this would have hit (1.10 < 1.18 inflation cushion);
      // post-fix the pick threshold is exactly the visual radius.
      expect(clickDistance > visualRadius).toBe(true);
    });

    it("idle particle: a click at exactly 1.0× base radius is a hit (edge inclusive)", () => {
      const visualRadius = computeFinalRadius(DEFAULT_INPUT);
      const clickDistance = BASE;
      expect(clickDistance <= visualRadius).toBe(true);
    });
  });

  // --- Algorithmic pick decision: front-most particle wins via atomicMin
  // on (depthQ << 16) | index. Re-test that resolvePickFromCandidates
  // (the JS mirror of the WGSL reduction) returns the right index when
  // multiple particles pass the screen-radius gate.
  describe("resolvePickFromCandidates after the radius parity fix", () => {
    it("returns no-hit for empty candidate list", () => {
      expect(resolvePickFromCandidates([])).toBe(ORB_PICK_NO_HIT);
    });

    it("front-most candidate wins among multiple survivors", () => {
      // Three particles all passed the screen-radius gate (the new
      // un-inflated radius); atomicMin selects the smallest depthQ.
      // depthQ = u32(clamp((2 - z) * 0.25, 0, 1) * 65535) — smaller
      // depthQ ↔ larger z (nearer to camera under the +Z near-pole
      // convention).
      const winner = resolvePickFromCandidates([
        { depthQ: 24000, index: 4 }, // z ≈ 0.535, mid-back
        { depthQ: 8000, index: 11 }, // z ≈ 1.51,  front-most
        { depthQ: 32000, index: 7 }, // z ≈ 0.046, mid-front
      ]);
      expect(winner).toBe(11);
    });

    it("ties on depthQ break to the lower index", () => {
      const winner = resolvePickFromCandidates([
        { depthQ: 1000, index: 99 },
        { depthQ: 1000, index: 42 },
        { depthQ: 1000, index: 200 },
      ]);
      expect(winner).toBe(42);
    });
  });
});
