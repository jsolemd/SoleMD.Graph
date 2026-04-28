import {
  ORB_WEBGPU_FOCUS_FLAG,
  ORB_WEBGPU_HOVER_FLAG,
  ORB_WEBGPU_SELECTION_FLAG,
} from "../orb-webgpu-particles";
import {
  HOVER_TAU_SECONDS,
  createOrbInteractionWeights,
  resetOrbInteractionWeights,
  tickOrbInteractionWeights,
} from "../orb-webgpu-interaction-weights";

describe("orb interaction weights decay", () => {
  it("ramps weight toward 1 when flag is set, decays toward 0 when cleared", () => {
    const weights = createOrbInteractionWeights(4);
    const flags = new Uint32Array(4);
    flags[0] = ORB_WEBGPU_HOVER_FLAG;

    tickOrbInteractionWeights(weights, flags, 4, 1 / 60);
    const afterFirstTick = weights.data[0]!;
    expect(afterFirstTick).toBeGreaterThan(0);
    expect(afterFirstTick).toBeLessThan(1);

    for (let frame = 0; frame < 60; frame += 1) {
      tickOrbInteractionWeights(weights, flags, 4, 1 / 60);
    }
    expect(weights.data[0]!).toBeGreaterThan(0.99);

    flags[0] = 0;
    tickOrbInteractionWeights(weights, flags, 4, HOVER_TAU_SECONDS);
    // After exactly one time-constant of decay, weight should fall by
    // factor 1/e (~0.368). Allow generous tolerance for numerical noise.
    expect(weights.data[0]!).toBeLessThan(0.5);
    expect(weights.data[0]!).toBeGreaterThan(0.2);
  });

  it("tracks hover, select, and focus channels independently", () => {
    const weights = createOrbInteractionWeights(2);
    const flags = new Uint32Array(2);
    flags[0] =
      ORB_WEBGPU_HOVER_FLAG | ORB_WEBGPU_SELECTION_FLAG | ORB_WEBGPU_FOCUS_FLAG;
    flags[1] = 0;

    for (let frame = 0; frame < 360; frame += 1) {
      tickOrbInteractionWeights(weights, flags, 2, 1 / 60);
    }

    expect(weights.data[0]!).toBeGreaterThan(0.99);
    expect(weights.data[1]!).toBeGreaterThan(0.99);
    expect(weights.data[2]!).toBeGreaterThan(0.99);
    expect(weights.data[4]!).toBeCloseTo(0, 5);
  });

  it("reset zeroes all weights", () => {
    const weights = createOrbInteractionWeights(2);
    weights.data.fill(0.5);
    resetOrbInteractionWeights(weights);
    for (const value of weights.data) {
      expect(value).toBe(0);
    }
  });
});
