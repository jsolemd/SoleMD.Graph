import { createHotspotLifecycleController } from "../field-hotspot-lifecycle";

describe("createHotspotLifecycleController", () => {
  it("samples an attachment for each hotspot at startup", () => {
    const samplePosition = jest.fn((index: number) => ({ index }));
    const controller = createHotspotLifecycleController({
      count: 3,
      samplePosition,
      sampleDelayMs: () => 500,
    });
    // Before any reseed, attachments are null.
    expect(controller.runtimes.every((r) => r.attachment === null)).toBe(true);
    controller.reseedAll();
    expect(controller.runtimes.map((r) => r.attachment)).toEqual([
      { index: 0 },
      { index: 1 },
      { index: 2 },
    ]);
  });

  it("retries sampling up to maxRetries when the strategy returns null", () => {
    let attempts = 0;
    const samplePosition = jest.fn((index: number, retry: number) => {
      attempts += 1;
      if (retry < 4) return null;
      return { index, retry };
    });
    const controller = createHotspotLifecycleController({
      count: 1,
      samplePosition,
      maxRetries: 10,
    });
    controller.reseed(0);
    expect(attempts).toBe(5);
    expect(controller.runtimes[0]!.attachment).toEqual({ index: 0, retry: 4 });
  });

  it("gives up after maxRetries and leaves attachment null", () => {
    const samplePosition = jest.fn(() => null);
    const controller = createHotspotLifecycleController({
      count: 1,
      samplePosition,
      maxRetries: 3,
    });
    controller.reseed(0);
    expect(controller.runtimes[0]!.attachment).toBeNull();
    expect(samplePosition).toHaveBeenCalledTimes(3);
  });

  it("bumps seedKey on every reseed so the component restarts the CSS animation", () => {
    const samplePosition = jest.fn((index: number) => ({ index }));
    const controller = createHotspotLifecycleController({
      count: 2,
      samplePosition,
    });
    const before = controller.runtimes[0]!.seedKey;
    controller.reseed(0);
    expect(controller.runtimes[0]!.seedKey).toBe(before + 1);
    controller.reseed(0);
    expect(controller.runtimes[0]!.seedKey).toBe(before + 2);
    // Other hotspots are untouched.
    expect(controller.runtimes[1]!.seedKey).toBe(before);
  });

  it("fires reseed via onAnimationEnd for the correct hotspot only", () => {
    const samplePosition = jest.fn((index: number) => ({ index }));
    const controller = createHotspotLifecycleController({
      count: 3,
      samplePosition,
    });
    controller.reseedAll();
    samplePosition.mockClear();
    controller.onAnimationEnd(1);
    expect(samplePosition.mock.calls.map((c) => c[0])).toEqual([1]);
  });

  it("rewrites delayMs on every reseed so hotspots do not fall into unison", () => {
    const delays = [100, 500, 900, 1500];
    let cursor = 0;
    const sampleDelayMs = jest.fn(() => delays[cursor++ % delays.length]!);
    const controller = createHotspotLifecycleController({
      count: 1,
      samplePosition: (index) => ({ index }),
      sampleDelayMs,
    });
    controller.reseed(0);
    const d1 = controller.runtimes[0]!.delayMs;
    controller.reseed(0);
    const d2 = controller.runtimes[0]!.delayMs;
    expect(d1).not.toBe(d2);
  });
});
