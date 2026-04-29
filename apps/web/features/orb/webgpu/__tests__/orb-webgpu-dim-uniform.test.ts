import {
  ORB_WEBGPU_DIM_FLAG,
  ORB_WEBGPU_NEIGHBOR_FLAG,
  ORB_WEBGPU_SCOPE_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
  buildOrbWebGpuFlagArray,
  computeDimUniform,
} from "../orb-webgpu-particles";

// Pure-decision contract for "dim everyone else when any selection-like
// signal is non-empty". The bright set is the union of scope ∪
// selection ∪ pending — neighbor / evidence / hover / focus ride
// alongside but are derived state, not the dim trigger.
//
// The full flag-array path is also covered here so the WGSL bit pack
// stays in sync with the pure helper.
describe("computeDimUniform — dim trigger + bright-set union", () => {
  it("empty inputs: no dim, empty bright set", () => {
    const out = computeDimUniform({
      selectionIndices: [],
      scopeIndices: [],
      pendingIndices: [],
    });
    expect(out.dimAll).toBe(false);
    expect(out.brightSet.size).toBe(0);
  });

  it("selection only triggers dim; bright set = selection", () => {
    const out = computeDimUniform({
      selectionIndices: [3, 7],
      scopeIndices: [],
      pendingIndices: [],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([3, 7]);
  });

  it("scope only triggers dim; bright set = scope", () => {
    const out = computeDimUniform({
      selectionIndices: [],
      scopeIndices: [1, 4, 9],
      pendingIndices: [],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([1, 4, 9]);
  });

  it("pending only triggers dim; bright set = pending", () => {
    const out = computeDimUniform({
      selectionIndices: [],
      scopeIndices: [],
      pendingIndices: [11, 12],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([11, 12]);
  });

  it("scope ∩ selection non-empty: bright set is the UNION (scope ∪ selection), not just intersection", () => {
    const out = computeDimUniform({
      selectionIndices: [2, 3],
      scopeIndices: [3, 4],
      pendingIndices: [],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it("scope and selection disjoint: BOTH sets stay bright (visual contract per Codex appendix)", () => {
    const out = computeDimUniform({
      selectionIndices: [10, 11],
      scopeIndices: [1, 2],
      pendingIndices: [],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([
      1, 2, 10, 11,
    ]);
  });

  it("pending merges into the bright set alongside selection and scope", () => {
    const out = computeDimUniform({
      selectionIndices: [5],
      scopeIndices: [1],
      pendingIndices: [9],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([1, 5, 9]);
  });

  it("ignores negative / non-integer indices", () => {
    const out = computeDimUniform({
      selectionIndices: [3, -1, 4.5 as number],
      scopeIndices: [-2],
      pendingIndices: [Number.NaN as number, 8],
    });
    expect(out.dimAll).toBe(true);
    expect(Array.from(out.brightSet).sort((a, b) => a - b)).toEqual([3, 8]);
  });
});

describe("buildOrbWebGpuFlagArray — flag-array reflection of the dim contract", () => {
  const COUNT = 16;

  it("no inputs: zero flags everywhere (no DIM trigger)", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [],
      focusIndex: null,
      hoverIndex: null,
      neighborIndices: [],
      pendingParticleIndices: [],
      scopeIndices: [],
      selectionIndices: [],
    });
    for (let i = 0; i < COUNT; i += 1) {
      expect(flags[i]).toBe(0);
    }
  });

  it("selection only: every non-selected particle has DIM; selection has SELECTION_FLAG and no DIM", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [],
      focusIndex: null,
      hoverIndex: null,
      neighborIndices: [],
      pendingParticleIndices: [],
      scopeIndices: [],
      selectionIndices: [4, 9],
    });
    for (let i = 0; i < COUNT; i += 1) {
      const isBright = i === 4 || i === 9;
      expect(Boolean(flags[i]! & ORB_WEBGPU_DIM_FLAG)).toBe(!isBright);
    }
    expect(flags[4]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
    expect(flags[9]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
    expect(flags[4]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    expect(flags[9]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
  });

  it("pending lights the SELECTION_FLAG path so the shader's selectW treatment fires", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [],
      focusIndex: null,
      hoverIndex: null,
      neighborIndices: [],
      pendingParticleIndices: [2, 3],
      scopeIndices: [],
      selectionIndices: [],
    });
    expect(flags[2]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
    expect(flags[3]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
    expect(flags[2]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    expect(flags[3]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    // Particles outside the pending set are dim.
    expect(flags[0]! & ORB_WEBGPU_DIM_FLAG).toBeTruthy();
    expect(flags[15]! & ORB_WEBGPU_DIM_FLAG).toBeTruthy();
  });

  it("disjoint scope + selection: BOTH sets are bright, everyone else is dim", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [],
      focusIndex: null,
      hoverIndex: null,
      neighborIndices: [],
      pendingParticleIndices: [],
      scopeIndices: [1, 2],
      selectionIndices: [10, 11],
    });
    const bright = new Set([1, 2, 10, 11]);
    for (let i = 0; i < COUNT; i += 1) {
      expect(Boolean(flags[i]! & ORB_WEBGPU_DIM_FLAG)).toBe(!bright.has(i));
    }
    expect(flags[1]! & ORB_WEBGPU_SCOPE_FLAG).toBeTruthy();
    expect(flags[10]! & ORB_WEBGPU_SELECTION_FLAG).toBeTruthy();
  });

  it("neighbor / evidence inside dim mode also clear DIM (don't get pulled into the dim path)", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [6],
      focusIndex: null,
      hoverIndex: null,
      neighborIndices: [8],
      pendingParticleIndices: [],
      scopeIndices: [],
      selectionIndices: [3],
    });
    // Selection triggers DIM_FLAG fill.
    expect(flags[0]! & ORB_WEBGPU_DIM_FLAG).toBeTruthy();
    // Neighbor/evidence opt out of dim explicitly.
    expect(flags[6]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    expect(flags[8]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    expect(flags[6]).not.toBe(0);
    expect(flags[8]! & ORB_WEBGPU_NEIGHBOR_FLAG).toBeTruthy();
  });

  it("hover / focus indices clear DIM in dim mode", () => {
    const flags = buildOrbWebGpuFlagArray(COUNT, {
      evidenceIndices: [],
      focusIndex: 12,
      hoverIndex: 13,
      neighborIndices: [],
      pendingParticleIndices: [],
      scopeIndices: [],
      selectionIndices: [3],
    });
    expect(flags[12]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    expect(flags[13]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
  });

  it("computeDimUniform.brightSet is a strict subset of the bright particles in the flag array", () => {
    // The pure helper expresses scope ∪ selection ∪ pending. The flag
    // array additionally clears DIM on neighbor / evidence / hover /
    // focus, but every helper-bright particle MUST end up un-dim in
    // the flag array — pin that invariant.
    const focus = {
      evidenceIndices: [6],
      focusIndex: 12,
      hoverIndex: 13,
      neighborIndices: [8],
      pendingParticleIndices: [9],
      scopeIndices: [1],
      selectionIndices: [3],
    };
    const flags = buildOrbWebGpuFlagArray(COUNT, focus);
    const helper = computeDimUniform({
      selectionIndices: focus.selectionIndices,
      scopeIndices: focus.scopeIndices,
      pendingIndices: focus.pendingParticleIndices,
    });
    expect(helper.dimAll).toBe(true);
    for (const index of helper.brightSet) {
      expect(flags[index]! & ORB_WEBGPU_DIM_FLAG).toBeFalsy();
    }
  });
});
