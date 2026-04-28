import {
  simplexFbm3,
  simplexNoise2,
  simplexNoise4,
  type Vec3,
} from "../simplex-spec";

describe("simplex spec", () => {
  const expectClose = (actual: number, expected: number) => {
    expect(Math.abs(actual - expected)).toBeLessThan(1e-5);
  };

  it("pins the 2D drift noise values used by the field shader", () => {
    const samples = [
      { input: [0, 0], expected: 0 },
      { input: [0.1, 0.2], expected: 0.82851837 },
      { input: [12.3, -4.5], expected: 0.09097236 },
      { input: [-1.2, 3.4], expected: 0.16888998 },
    ] as const;

    for (const { input, expected } of samples) {
      expectClose(simplexNoise2(input), expected);
    }
  });

  it("pins the 4D simplex values used by the FBM oracle", () => {
    const samples = [
      { input: [0, 0, 0, 0], expected: 0 },
      { input: [0.1, 0.2, 0.3, 0.4], expected: -0.2470233 },
      { input: [1.25, -0.4, 2.2, 0.75], expected: 0.03735216 },
      { input: [-3.1, 4.2, -1.3, 2.6], expected: 0.08431557 },
    ] as const;

    for (const { input, expected } of samples) {
      expectClose(simplexNoise4(input), expected);
    }
  });

  it("pins 16 deterministic FBM samples for WGSL parity", () => {
    const samples: readonly {
      input: readonly [number, number, number, number];
      expected: number;
    }[] = [
      { input: [0, 2, -1.11, 0], expected: -0.09166602 },
      { input: [2.974994, 1.24322, -0.74, 0.19], expected: 0.13746289 },
      { input: [-0.766623, -0.454404, -0.37, 0.38], expected: 0.19017973 },
      { input: [-2.777444, -1.808144, 0, 0.57], expected: -0.13584185 },
      { input: [1.48234, -1.793517, 0.37, 0.76], expected: -0.13725349 },
      { input: [2.395461, -0.421592, 0.74, 0.95], expected: -0.18543667 },
      { input: [-2.099624, 1.269386, 1.11, 1.14], expected: -0.16387495 },
      { input: [-1.854411, 1.999717, -1.11, 1.33], expected: -0.02544186 },
      { input: [2.577485, 1.216703, -0.74, 1.52], expected: 0.28659231 },
      { input: [1.190222, -0.487088, -0.37, 1.71], expected: 0.05934697 },
      { input: [-2.884192, -1.822261, 0, 1.9], expected: -0.41307578 },
      { input: [-0.446997, -1.778382, 0.37, 2.09], expected: 0.02284723 },
      { input: [2.999379, -0.38866, 0.74, 2.28], expected: -0.02605569 },
      { input: [-0.32591, 1.295193, 1.11, 2.47], expected: 0.10235775 },
      { input: [-2.915395, 1.998869, -1.11, 2.66], expected: 0.42314674 },
      { input: [1.077175, 1.189841, -0.74, 2.85], expected: 0.05147778 },
    ];

    for (const { input, expected } of samples) {
      const position: Vec3 = [input[0], input[1], input[2]];
      expectClose(simplexFbm3(position, input[3]), expected);
    }
  });
});
