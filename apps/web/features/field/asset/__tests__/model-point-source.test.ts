import { createModelPointGeometry } from "../model-point-source";

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function makeModel(vertices: number) {
  const array = new Float32Array(vertices * 3);
  for (let i = 0; i < vertices; i += 1) {
    array[i * 3] = i;
    array[i * 3 + 1] = i * 0.1;
    array[i * 3 + 2] = i * 0.01;
  }
  return {
    geometry: {
      getAttribute: (name: string) => (name === "position" ? { array } : null),
    },
  };
}

describe("createModelPointGeometry", () => {
  it("emits exactly one point per vertex when countFactor is 1", () => {
    const model = makeModel(100);
    const geometry = createModelPointGeometry(model, {
      countFactor: 1,
      positionRandomness: 0,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.count).toBe(100);
  });

  it("emits countFactor * vertices points for integer counts", () => {
    const model = makeModel(100);
    const geometry = createModelPointGeometry(model, {
      countFactor: 5,
      positionRandomness: 0,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.count).toBe(500);
  });

  it("approximates countFactor * vertices for fractional counts", () => {
    const model = makeModel(1000);
    const geometry = createModelPointGeometry(model, {
      countFactor: 1.2,
      positionRandomness: 0,
      random: seededRandom(9),
    });
    const count = geometry.getAttribute("position")!.count;
    expect(count).toBeGreaterThan(1200 * 0.95);
    expect(count).toBeLessThan(1200 * 1.05);
  });

  it("walks nested children to collect positions", () => {
    const model = {
      children: [makeModel(50), { children: [makeModel(25)] }],
    };
    const geometry = createModelPointGeometry(model, {
      countFactor: 1,
      positionRandomness: 0,
      random: seededRandom(1),
    });
    expect(geometry.getAttribute("position")!.count).toBe(75);
  });

  it("returns an empty geometry when the model has no positions", () => {
    const geometry = createModelPointGeometry(
      {},
      { countFactor: 1, positionRandomness: 0, random: seededRandom(1) },
    );
    expect(geometry.getAttribute("position")!.count).toBe(0);
  });
});
