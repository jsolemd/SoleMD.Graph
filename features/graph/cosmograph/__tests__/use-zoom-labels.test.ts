/**
 * @jest-environment jsdom
 */
import { renderHook, act } from "@testing-library/react";

jest.mock("@cosmograph/react", () => ({}));

import { useZoomLabels } from "../hooks/use-zoom-labels";

function makeMockRef(zoomLevel: number | undefined = undefined) {
  return {
    current: zoomLevel !== undefined
      ? { getZoomLevel: () => zoomLevel }
      : undefined,
  } as Parameters<typeof useZoomLabels>[0];
}

describe("useZoomLabels", () => {
  it("starts not zoomed in", () => {
    const ref = makeMockRef(0.5);
    const { result } = renderHook(() => useZoomLabels(ref));
    expect(result.current.zoomedIn).toBe(false);
    expect(result.current.isActivelyZooming).toBe(false);
  });

  it("detects zoom in above threshold via syncZoomState", () => {
    const ref = makeMockRef(2.0);
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => {
      result.current.syncZoomState();
    });

    expect(result.current.zoomedIn).toBe(true);
  });

  it("detects zoom out below threshold", () => {
    const ref = makeMockRef(2.0);
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => result.current.syncZoomState());
    expect(result.current.zoomedIn).toBe(true);

    // Simulate zoom out
    ref.current = { getZoomLevel: () => 0.5 } as never;
    act(() => result.current.syncZoomState());
    expect(result.current.zoomedIn).toBe(false);
  });

  it("handleZoomStart sets isActivelyZooming", () => {
    const ref = makeMockRef(0.5);
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => result.current.handleZoomStart());
    expect(result.current.isActivelyZooming).toBe(true);
  });

  it("handleZoomEnd clears isActivelyZooming", () => {
    const ref = makeMockRef(0.5);
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => result.current.handleZoomStart());
    expect(result.current.isActivelyZooming).toBe(true);

    act(() => result.current.handleZoomEnd());
    expect(result.current.isActivelyZooming).toBe(false);
  });

  it("handleZoom updates zoom state", () => {
    const ref = makeMockRef(2.0);
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => result.current.handleZoom());
    expect(result.current.zoomedIn).toBe(true);
  });

  it("handles undefined cosmograph ref gracefully", () => {
    const ref = makeMockRef();
    const { result } = renderHook(() => useZoomLabels(ref));

    // Should not throw
    act(() => result.current.syncZoomState());
    expect(result.current.zoomedIn).toBe(false);
  });

  it("handles null zoom level gracefully", () => {
    const ref = {
      current: { getZoomLevel: () => undefined },
    } as Parameters<typeof useZoomLabels>[0];
    const { result } = renderHook(() => useZoomLabels(ref));

    act(() => result.current.syncZoomState());
    expect(result.current.zoomedIn).toBe(false);
  });
});
