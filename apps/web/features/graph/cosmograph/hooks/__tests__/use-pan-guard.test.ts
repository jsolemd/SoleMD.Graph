/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { usePanGuard } from "../use-pan-guard";
import { TAP_MAX_TRAVEL_PX } from "@/features/graph/lib/pointer-gesture";

type ZoomEvent = Parameters<ReturnType<typeof usePanGuard>["onZoom"]>[0];

function evt(x: number, y: number, k = 1): ZoomEvent {
  return { transform: { x, y, k } } as unknown as ZoomEvent;
}

describe("usePanGuard", () => {
  it("returns false when a gesture ends without movement (tap on background)", () => {
    const { result } = renderHook(() => usePanGuard());
    result.current.onZoomStart(evt(0, 0), true);
    result.current.onZoom(evt(0, 0), true);
    result.current.onZoomEnd(evt(0, 0), true);

    expect(result.current.consumeJustPan()).toBe(false);
  });

  it("returns true when the pan traveled beyond the threshold", () => {
    const { result } = renderHook(() => usePanGuard());
    const beyond = TAP_MAX_TRAVEL_PX + 2;

    result.current.onZoomStart(evt(0, 0), true);
    result.current.onZoom(evt(beyond, 0), true);
    result.current.onZoomEnd(evt(beyond, 0), true);

    expect(result.current.consumeJustPan()).toBe(true);
  });

  it("returns true on zoom (k change), not only pan", () => {
    const { result } = renderHook(() => usePanGuard());

    result.current.onZoomStart(evt(100, 100, 1), true);
    result.current.onZoom(evt(100, 100, 1.5), true);
    result.current.onZoomEnd(evt(100, 100, 1.5), true);

    expect(result.current.consumeJustPan()).toBe(true);
  });

  it("consuming clears the flag so the next tap is a clean slate", () => {
    const { result } = renderHook(() => usePanGuard());
    const beyond = TAP_MAX_TRAVEL_PX + 2;

    result.current.onZoomStart(evt(0, 0), true);
    result.current.onZoom(evt(beyond, 0), true);
    result.current.onZoomEnd(evt(beyond, 0), true);

    expect(result.current.consumeJustPan()).toBe(true);
    // Second read returns false: flag was consumed.
    expect(result.current.consumeJustPan()).toBe(false);
  });

  it("ignores programmatic zoom lifecycles (userDriven=false)", () => {
    const { result } = renderHook(() => usePanGuard());
    const beyond = TAP_MAX_TRAVEL_PX + 2;

    result.current.onZoomStart(evt(0, 0), false);
    result.current.onZoom(evt(beyond, 0), false);
    result.current.onZoomEnd(evt(beyond, 0), false);

    expect(result.current.consumeJustPan()).toBe(false);
  });

  it("does not raise within-threshold jitter as a pan", () => {
    const { result } = renderHook(() => usePanGuard());
    // 4,4 is euclidean distance ~5.66, within the 6px budget.
    result.current.onZoomStart(evt(0, 0), true);
    result.current.onZoom(evt(4, 4), true);
    result.current.onZoomEnd(evt(4, 4), true);

    expect(result.current.consumeJustPan()).toBe(false);
  });
});
