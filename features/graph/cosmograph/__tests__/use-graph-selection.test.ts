import { renderHook } from "@testing-library/react";

const mockPointsSelection = { reset: jest.fn() };
const mockLinksSelection = { reset: jest.fn() };

const mockCosmograph = {
  selectPoint: jest.fn(),
  setFocusedPoint: jest.fn(),
  unselectAllPoints: jest.fn(),
  pointsSelection: mockPointsSelection,
  linksSelection: mockLinksSelection,
  getActiveSelectionSourceId: jest.fn().mockReturnValue("test-source"),
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
}));

import { useGraphSelection } from "../hooks/use-graph-selection";

beforeEach(() => jest.clearAllMocks());

describe("useGraphSelection", () => {
  it("delegates selectPoint to cosmograph", () => {
    const { result } = renderHook(() => useGraphSelection());
    result.current.selectPoint(3, true, false);
    expect(mockCosmograph.selectPoint).toHaveBeenCalledWith(3, true, false);
  });

  it("delegates setFocusedPoint to cosmograph", () => {
    const { result } = renderHook(() => useGraphSelection());
    result.current.setFocusedPoint(7);
    expect(mockCosmograph.setFocusedPoint).toHaveBeenCalledWith(7);
  });

  it("delegates unselectAllPoints to cosmograph", () => {
    const { result } = renderHook(() => useGraphSelection());
    result.current.unselectAllPoints();
    expect(mockCosmograph.unselectAllPoints).toHaveBeenCalled();
  });

  it("clearSelections resets both points and links selections", () => {
    const { result } = renderHook(() => useGraphSelection());
    result.current.clearSelections();
    expect(mockPointsSelection.reset).toHaveBeenCalled();
    expect(mockLinksSelection.reset).toHaveBeenCalled();
  });

  it("getPointsSelection returns the points selection object", () => {
    const { result } = renderHook(() => useGraphSelection());
    expect(result.current.getPointsSelection()).toBe(mockPointsSelection);
  });

  it("getLinksSelection returns the links selection object", () => {
    const { result } = renderHook(() => useGraphSelection());
    expect(result.current.getLinksSelection()).toBe(mockLinksSelection);
  });

  it("getActiveSelectionSourceId returns the source id", () => {
    const { result } = renderHook(() => useGraphSelection());
    expect(result.current.getActiveSelectionSourceId()).toBe("test-source");
  });
});

describe("useGraphSelection (null cosmograph)", () => {
  beforeAll(() => {
    jest.resetModules();
    jest.mock("@cosmograph/react", () => ({
      useCosmograph: () => ({ cosmograph: null }),
    }));
  });

  it("selectPoint is a no-op when cosmograph is null", () => {
    const { useGraphSelection: useGraphSelectionNull } = require("../hooks/use-graph-selection");
    const { result } = renderHook(() => useGraphSelectionNull());
    expect(() => result.current.selectPoint(0)).not.toThrow();
  });

  it("getActiveSelectionSourceId returns null when cosmograph is null", () => {
    const { useGraphSelection: useGraphSelectionNull } = require("../hooks/use-graph-selection");
    const { result } = renderHook(() => useGraphSelectionNull());
    expect(result.current.getActiveSelectionSourceId()).toBeNull();
  });
});
