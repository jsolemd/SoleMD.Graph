import {
  ORB_PERF_FLAG,
  isOrbPerfOn,
  markPerf,
  measurePerf,
  getOrbPerfMarks,
  attachOrbDebugPerfMarks,
  ORB_DEBUG_KEY,
} from "../orb-webgpu-perf";

type GlobalMutable = {
  [ORB_PERF_FLAG]?: unknown;
  [ORB_DEBUG_KEY]?: { perfMarks?: unknown; [k: string]: unknown };
};

const globalRef = globalThis as unknown as GlobalMutable;

function setPerfFlag(value: boolean | undefined): void {
  if (value === undefined) {
    delete globalRef[ORB_PERF_FLAG];
  } else {
    globalRef[ORB_PERF_FLAG] = value;
  }
}

describe("orb perf-gate (window.__orbPerf)", () => {
  let markSpy: jest.SpyInstance;
  let measureSpy: jest.SpyInstance;
  const realMark = performance.mark.bind(performance);
  const realMeasure = performance.measure.bind(performance);

  beforeEach(() => {
    markSpy = jest.spyOn(performance, "mark").mockImplementation(((...args) => {
      // Forward to real impl so getOrbPerfMarks tests can read entries
      // back when the flag is on. The spy still counts call sites.
      return realMark(...(args as Parameters<typeof realMark>));
    }) as typeof performance.mark);
    measureSpy = jest
      .spyOn(performance, "measure")
      .mockImplementation(((...args) => {
        return realMeasure(...(args as Parameters<typeof realMeasure>));
      }) as typeof performance.measure);
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    markSpy.mockRestore();
    measureSpy.mockRestore();
    setPerfFlag(undefined);
    delete globalRef[ORB_DEBUG_KEY];
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe("flag off (default)", () => {
    beforeEach(() => {
      setPerfFlag(undefined);
    });

    it("isOrbPerfOn() reports false", () => {
      expect(isOrbPerfOn()).toBe(false);
    });

    it("markPerf does NOT call performance.mark", () => {
      markPerf("orb:test:start");
      markPerf("orb:test:end");
      expect(markSpy).not.toHaveBeenCalled();
    });

    it("measurePerf does NOT call performance.measure", () => {
      measurePerf("orb:test", "orb:test:start", "orb:test:end");
      expect(measureSpy).not.toHaveBeenCalled();
    });

    it("attachOrbDebugPerfMarks does NOT expose __orbDebug.perfMarks", () => {
      attachOrbDebugPerfMarks();
      expect(globalRef[ORB_DEBUG_KEY]?.perfMarks).toBeUndefined();
    });
  });

  describe("flag on", () => {
    beforeEach(() => {
      setPerfFlag(true);
    });

    it("isOrbPerfOn() reports true", () => {
      expect(isOrbPerfOn()).toBe(true);
    });

    it("markPerf forwards to performance.mark exactly once per call", () => {
      markPerf("orb:test:start");
      markPerf("orb:test:end");
      expect(markSpy).toHaveBeenCalledTimes(2);
      expect(markSpy).toHaveBeenNthCalledWith(1, "orb:test:start");
      expect(markSpy).toHaveBeenNthCalledWith(2, "orb:test:end");
    });

    it("measurePerf forwards to performance.measure with start/end pair", () => {
      markPerf("orb:test:start");
      markPerf("orb:test:end");
      measurePerf("orb:test", "orb:test:start", "orb:test:end");
      expect(measureSpy).toHaveBeenCalledTimes(1);
      expect(measureSpy).toHaveBeenCalledWith(
        "orb:test",
        "orb:test:start",
        "orb:test:end",
      );
    });

    it("getOrbPerfMarks returns only orb:* measures", () => {
      markPerf("orb:a:start");
      markPerf("orb:a:end");
      measurePerf("orb:a", "orb:a:start", "orb:a:end");
      // Add a non-orb measure that the helper should filter out.
      performance.mark("other:x:start");
      performance.mark("other:x:end");
      performance.measure("other:x", "other:x:start", "other:x:end");

      const marks = getOrbPerfMarks();
      expect(marks.length).toBe(1);
      expect(marks[0]!.name).toBe("orb:a");
    });

    it("getOrbPerfMarks tail-trims to the last 120 entries", () => {
      // Add 130 measures; only the last 120 should come back.
      for (let i = 0; i < 130; i += 1) {
        markPerf(`orb:bulk:start:${i}`);
        markPerf(`orb:bulk:end:${i}`);
        measurePerf(`orb:bulk:${i}`, `orb:bulk:start:${i}`, `orb:bulk:end:${i}`);
      }
      const marks = getOrbPerfMarks();
      expect(marks.length).toBe(120);
      // Tail = last 120, so the first should be index 10, last index 129
      expect(marks[0]!.name).toBe("orb:bulk:10");
      expect(marks[marks.length - 1]!.name).toBe("orb:bulk:129");
    });

    it("attachOrbDebugPerfMarks exposes a getter, and detach removes it", () => {
      const detach = attachOrbDebugPerfMarks();
      const bag = globalRef[ORB_DEBUG_KEY];
      expect(typeof bag?.perfMarks).toBe("function");
      detach();
      expect(globalRef[ORB_DEBUG_KEY]?.perfMarks).toBeUndefined();
    });
  });
});
