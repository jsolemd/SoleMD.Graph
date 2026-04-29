import { validatePickGeneration } from "../orb-webgpu-picking";

describe("validatePickGeneration", () => {
  it("returns true when received generation matches current", () => {
    expect(validatePickGeneration(0, 0)).toBe(true);
    expect(validatePickGeneration(7, 7)).toBe(true);
  });

  it("returns false when received generation is older than current", () => {
    expect(validatePickGeneration(0, 1)).toBe(false);
    expect(validatePickGeneration(3, 5)).toBe(false);
  });

  it("returns false when received generation is somehow ahead (defensive)", () => {
    // Should never happen in practice — the runtime only ever bumps —
    // but the helper must not silently treat a future token as fresh.
    expect(validatePickGeneration(2, 1)).toBe(false);
  });
});

// The runtime serializes picks through a promise queue, so within a
// single tab they cannot resolve out of order. The generation token
// guards against the OTHER staleness vector: a state-changing event
// (selection replaced, hover scope changed) fires AFTER the GPU
// dispatch but BEFORE the readback resolves — the consumer must drop
// the result. The simulation below mirrors that scenario without a
// real GPU.
describe("pick generation staleness via dispatch-time capture", () => {
  it("flags a pick as stale when bump occurs between dispatch and resolution", async () => {
    let pickGeneration = 0;
    const bump = () => {
      pickGeneration += 1;
    };

    const fakePick = (): Promise<{ index: number; generation: number }> => {
      // Capture generation at "dispatch time" — when the queued
      // promise body runs, mirroring the real runtime's behavior.
      const generation = pickGeneration;
      return new Promise((resolve) => {
        // Simulate GPU readback latency. During this window the
        // consumer may bump the generation.
        setTimeout(() => resolve({ generation, index: 42 }), 0);
      });
    };

    const inflight = fakePick();
    bump(); // selection replaced before readback resolves
    const result = await inflight;
    expect(validatePickGeneration(result.generation, pickGeneration)).toBe(false);
  });

  it("returns fresh when no bump occurs during in-flight pick", async () => {
    let pickGeneration = 7;
    const fakePick = (): Promise<{ index: number; generation: number }> => {
      const generation = pickGeneration;
      return new Promise((resolve) => {
        setTimeout(() => resolve({ generation, index: 9 }), 0);
      });
    };
    const result = await fakePick();
    expect(validatePickGeneration(result.generation, pickGeneration)).toBe(true);
  });

  it("simulates two picks resolving out-of-order — caller detects the older one as stale", async () => {
    // The real runtime serializes through a queue, but simulate the
    // staleness detector with a fake that lets us resolve picks in
    // any order. The point is to verify the consumer-side logic:
    // when a fresh result and a stale result both come back, the
    // generation comparison rejects the stale one.
    let pickGeneration = 0;
    const bump = () => {
      pickGeneration += 1;
    };

    let resolveFirst: (v: { index: number; generation: number }) => void;
    const first = new Promise<{ index: number; generation: number }>((r) => {
      resolveFirst = r;
    });
    // Capture generation at dispatch time (= now) for the first pick.
    const firstGen = pickGeneration;

    bump(); // a state-change fires before second pick dispatches

    const secondGen = pickGeneration; // captured at second dispatch
    let resolveSecond: (v: { index: number; generation: number }) => void;
    const second = new Promise<{ index: number; generation: number }>((r) => {
      resolveSecond = r;
    });

    // Resolve second first — out of order vs dispatch order.
    resolveSecond!({ generation: secondGen, index: 99 });
    resolveFirst!({ generation: firstGen, index: 11 });

    const [secondResult, firstResult] = await Promise.all([second, first]);
    expect(validatePickGeneration(secondResult.generation, pickGeneration)).toBe(true);
    expect(validatePickGeneration(firstResult.generation, pickGeneration)).toBe(false);
  });
});
