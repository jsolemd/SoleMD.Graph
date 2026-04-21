/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useAdaptiveFrameloop } from "../use-adaptive-frameloop";

type Entry = { isIntersecting: boolean };
type ObserverCallback = (entries: Entry[]) => void;

let latestObserverCallback: ObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(cb: ObserverCallback) {
    latestObserverCallback = cb;
  }
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();
  takeRecords = jest.fn(() => []);
}

beforeAll(() => {
  (globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver =
    MockIntersectionObserver;
});

beforeEach(() => {
  latestObserverCallback = null;
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
});

function useHarness(reducedMotion: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  if (!ref.current) {
    ref.current = document.createElement("div");
  }
  return useAdaptiveFrameloop({ reducedMotion, containerRef: ref });
}

describe("useAdaptiveFrameloop", () => {
  it("returns 'always' when visible, motion-enabled, and onscreen", () => {
    const { result } = renderHook(() => useHarness(false));
    expect(result.current).toBe("always");
  });

  it("returns 'demand' when reduced-motion is true", () => {
    const { result } = renderHook(() => useHarness(true));
    expect(result.current).toBe("demand");
  });

  it("returns 'demand' when the container goes offscreen", () => {
    const { result } = renderHook(() => useHarness(false));
    expect(result.current).toBe("always");
    act(() => {
      latestObserverCallback?.([{ isIntersecting: false }]);
    });
    expect(result.current).toBe("demand");
    act(() => {
      latestObserverCallback?.([{ isIntersecting: true }]);
    });
    expect(result.current).toBe("always");
  });

  it("returns 'demand' when the tab becomes hidden", () => {
    const { result } = renderHook(() => useHarness(false));
    expect(result.current).toBe("always");
    act(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("demand");
  });
});
