import {
  NODE_COUNT,
  stepSimulation,
  type SimState,
} from "../ConnectomeLoader";

function createTestSimState(): SimState {
  const n3 = NODE_COUNT * 3;
  return {
    pos: new Float32Array(n3),
    vel: new Float32Array(n3),
    driftVel: new Float32Array(n3),
    goalVel: new Float32Array(n3),
    col: new Float32Array(n3),
  };
}

describe("ConnectomeLoader simulation performance", () => {
  it(`stepSimulation completes 60 frames (1 s) under 250 ms for ${NODE_COUNT} nodes`, () => {
    const sim = createTestSimState();
    // Warm up V8 JIT — first invocations run in the interpreter.
    for (let w = 0; w < 30; w++) stepSimulation(sim, 0.016);

    const start = performance.now();
    for (let frame = 0; frame < 60; frame++) {
      stepSimulation(sim, 0.016);
    }
    const elapsed = performance.now() - start;
    // In-browser the JIT-hot cost is ~1 ms/frame. Node/Jest adds
    // overhead so the CI budget is generous at 250 ms (4.2 ms/frame).
    expect(elapsed).toBeLessThan(250);
  });

  it("positions remain bounded within BOUNDARY_RADIUS after 600 frames", () => {
    const sim = createTestSimState();
    for (let i = 0; i < NODE_COUNT * 3; i++) {
      sim.pos[i] = (Math.random() - 0.5) * 10;
    }

    for (let frame = 0; frame < 600; frame++) {
      stepSimulation(sim, 0.016);
    }

    let maxR2 = 0;
    for (let i = 0; i < NODE_COUNT; i++) {
      const b = i * 3;
      const r2 =
        sim.pos[b] ** 2 + sim.pos[b + 1] ** 2 + sim.pos[b + 2] ** 2;
      if (r2 > maxR2) maxR2 = r2;
    }
    // Soft boundary allows slight overshoot; 8 units gives margin.
    expect(Math.sqrt(maxR2)).toBeLessThan(8);
  });
});
