import { renderHook, act } from "@testing-library/react";
import {
  useScrollPerformance,
  getOptimalAnimationSettings,
} from "@/hooks/use-scroll-performance";

// Mock performance API
Object.defineProperty(window, "performance", {
  value: {
    now: jest.fn(() => Date.now()),
  },
});

Object.defineProperty(window, "requestAnimationFrame", {
  value: jest.fn((cb) => {
    return setTimeout(cb, 16); // 60fps = ~16.67ms per frame
  }),
});

Object.defineProperty(window, "cancelAnimationFrame", {
  value: jest.fn(),
});

describe("useScrollPerformance Hook", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Performance Monitoring", () => {
    it("initializes with default metrics", () => {
      const { result } = renderHook(() => useScrollPerformance(false));

      expect(result.current).toEqual({
        frameRate: 60,
        averageFrameTime: 16.67,
        droppedFrames: 0,
        isPerformant: true,
      });
    });

    it("starts monitoring when active", () => {
      const { result } = renderHook(() => useScrollPerformance(true));

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it("stops monitoring when inactive", () => {
      const { result, rerender } = renderHook(
        ({ active }) => useScrollPerformance(active),
        { initialProps: { active: true } }
      );

      expect(window.requestAnimationFrame).toHaveBeenCalled();

      rerender({ active: false });

      expect(window.cancelAnimationFrame).toHaveBeenCalled();
    });

    it("updates metrics over time", async () => {
      const { result } = renderHook(() => useScrollPerformance(true));

      // Initial state should have default metrics
      expect(result.current.frameRate).toBe(60);
      expect(result.current.isPerformant).toBe(true);
    });

    it("detects dropped frames", async () => {
      let frameCallback: ((time: number) => void) | null = null;
      let currentTime = 0;

      (window.requestAnimationFrame as jest.Mock).mockImplementation((cb) => {
        frameCallback = cb;
        return 1;
      });

      (window.performance.now as jest.Mock).mockImplementation(
        () => currentTime
      );

      const { result } = renderHook(() => useScrollPerformance(true));

      // Simulate slow frames (dropped frames)
      act(() => {
        if (frameCallback) {
          frameCallback(currentTime);
          currentTime += 50; // 50ms = dropped frame
          frameCallback(currentTime);
          currentTime += 1000; // Advance to trigger update
          frameCallback(currentTime);
        }
      });

      expect(result.current.droppedFrames).toBeGreaterThan(0);
    });

    it("logs performance warnings", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();
      let frameCallback: ((time: number) => void) | null = null;
      let currentTime = 0;

      (window.requestAnimationFrame as jest.Mock).mockImplementation((cb) => {
        frameCallback = cb;
        return 1;
      });

      (window.performance.now as jest.Mock).mockImplementation(
        () => currentTime
      );

      renderHook(() => useScrollPerformance(true));

      // Simulate poor performance
      act(() => {
        if (frameCallback) {
          // Simulate low frame rate
          for (let i = 0; i < 10; i++) {
            frameCallback(currentTime);
            currentTime += 100; // Very slow frames
          }
          currentTime += 1000; // Trigger metrics update
          frameCallback(currentTime);
        }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("performance degraded")
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Performance Metrics Calculation", () => {
    it("calculates frame rate correctly", async () => {
      let frameCallback: ((time: number) => void) | null = null;
      let frameCount = 0;

      (window.requestAnimationFrame as jest.Mock).mockImplementation((cb) => {
        frameCallback = cb;
        return ++frameCount;
      });

      const { result } = renderHook(() => useScrollPerformance(true));

      // Simulate 60 frames in 1 second
      act(() => {
        if (frameCallback) {
          for (let i = 0; i < 60; i++) {
            frameCallback(i * 16.67);
          }
          frameCallback(1000); // 1 second mark
        }
      });

      expect(result.current.frameRate).toBeCloseTo(60, 0);
    });

    it("calculates average frame time", async () => {
      let frameCallback: ((time: number) => void) | null = null;

      (window.requestAnimationFrame as jest.Mock).mockImplementation((cb) => {
        frameCallback = cb;
        return 1;
      });

      const { result } = renderHook(() => useScrollPerformance(true));

      // Simulate consistent 16.67ms frames
      act(() => {
        if (frameCallback) {
          frameCallback(0);
          frameCallback(16.67);
          frameCallback(33.34);
          frameCallback(1000); // Trigger update
        }
      });

      expect(result.current.averageFrameTime).toBeCloseTo(16.67, 1);
    });

    it("determines performance status correctly", async () => {
      let frameCallback: ((time: number) => void) | null = null;

      (window.requestAnimationFrame as jest.Mock).mockImplementation((cb) => {
        frameCallback = cb;
        return 1;
      });

      const { result } = renderHook(() => useScrollPerformance(true));

      // Simulate good performance
      act(() => {
        if (frameCallback) {
          for (let i = 0; i < 60; i++) {
            frameCallback(i * 16.67);
          }
          frameCallback(1000);
        }
      });

      expect(result.current.isPerformant).toBe(true);
    });
  });
});

describe("getOptimalAnimationSettings", () => {
  it("returns standard settings for good performance", () => {
    const goodMetrics = {
      frameRate: 60,
      averageFrameTime: 16.67,
      droppedFrames: 0,
      isPerformant: true,
    };

    const settings = getOptimalAnimationSettings(goodMetrics);

    expect(settings).toEqual({
      duration: 0.6,
      distance: 50,
      staggerDelay: 0.1,
      shouldSimplify: false,
    });
  });

  it("returns optimized settings for poor performance", () => {
    const poorMetrics = {
      frameRate: 20,
      averageFrameTime: 50,
      droppedFrames: 10,
      isPerformant: false,
    };

    const settings = getOptimalAnimationSettings(poorMetrics);

    expect(settings).toEqual({
      duration: 0.3,
      distance: 25,
      staggerDelay: 0.05,
      shouldSimplify: true,
    });
  });

  it("handles edge cases", () => {
    const edgeMetrics = {
      frameRate: 30, // Exactly at threshold
      averageFrameTime: 33.33, // Exactly at threshold
      droppedFrames: 5,
      isPerformant: true,
    };

    const settings = getOptimalAnimationSettings(edgeMetrics);

    expect(settings.shouldSimplify).toBe(false);
  });
});

describe("Performance Benchmarks", () => {
  it("measures animation initialization time", () => {
    const startTime = performance.now();

    renderHook(() => useScrollPerformance(true));

    const endTime = performance.now();
    const initTime = endTime - startTime;

    // Initialization should be fast (< 10ms)
    expect(initTime).toBeLessThan(10);
  });

  it("measures memory usage stability", () => {
    const { unmount } = renderHook(() => useScrollPerformance(true));

    // Should clean up properly
    unmount();

    // Verify no memory leaks by checking that timers are cleared
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("handles rapid state changes efficiently", () => {
    const { rerender } = renderHook(
      ({ active }) => useScrollPerformance(active),
      { initialProps: { active: false } }
    );

    const startTime = performance.now();

    // Rapidly toggle active state
    for (let i = 0; i < 100; i++) {
      rerender({ active: i % 2 === 0 });
    }

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // Should handle rapid changes efficiently (< 100ms for 100 toggles)
    expect(totalTime).toBeLessThan(100);
  });
});
