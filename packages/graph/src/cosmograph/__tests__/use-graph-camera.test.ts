/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { swapCosmographMock } from "./test-utils";

const mockCosmograph = {
  fitView: jest.fn(),
  fitViewByIndices: jest.fn(),
  zoomToPoint: jest.fn(),
  getZoomLevel: jest.fn().mockReturnValue(2),
  setZoomLevel: jest.fn(),
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
  useCosmographInternal: () => ({ cosmograph: mockCosmograph }),
}));

import { useGraphCamera } from "../hooks/use-graph-camera";

beforeEach(() => jest.clearAllMocks());

describe("useGraphCamera", () => {
  it("delegates fitView to cosmograph", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.fitView(300, 0.1);
    expect(mockCosmograph.fitView).toHaveBeenCalledWith(300, 0.1);
  });

  it("delegates fitViewByIndices to cosmograph", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.fitViewByIndices([0, 1, 2], 200, 0.05);
    expect(mockCosmograph.fitViewByIndices).toHaveBeenCalledWith([0, 1, 2], 200, 0.05);
  });

  it("delegates zoomToPoint to cosmograph", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.zoomToPoint(5, 400);
    expect(mockCosmograph.zoomToPoint).toHaveBeenCalledWith(5, 400);
  });

  it("zoomIn multiplies current zoom by factor", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.zoomIn(2, 100);
    expect(mockCosmograph.getZoomLevel).toHaveBeenCalled();
    expect(mockCosmograph.setZoomLevel).toHaveBeenCalledWith(4, 100);
  });

  it("zoomOut divides current zoom by factor", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.zoomOut(2, 100);
    expect(mockCosmograph.getZoomLevel).toHaveBeenCalled();
    expect(mockCosmograph.setZoomLevel).toHaveBeenCalledWith(1, 100);
  });

  it("getZoomLevel returns current level", () => {
    const { result } = renderHook(() => useGraphCamera());
    expect(result.current.getZoomLevel()).toBe(2);
  });

  it("setZoomLevel delegates to cosmograph", () => {
    const { result } = renderHook(() => useGraphCamera());
    result.current.setZoomLevel(3, 150);
    expect(mockCosmograph.setZoomLevel).toHaveBeenCalledWith(3, 150);
  });
});

describe("useGraphCamera (null cosmograph)", () => {
  beforeAll(() => swapCosmographMock(null));
  afterAll(() => swapCosmographMock(mockCosmograph));

  it("fitView is a no-op when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphCamera());
    expect(() => result.current.fitView(300)).not.toThrow();
  });

  it("getZoomLevel returns 1 when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphCamera());
    expect(result.current.getZoomLevel()).toBe(1);
  });
});
