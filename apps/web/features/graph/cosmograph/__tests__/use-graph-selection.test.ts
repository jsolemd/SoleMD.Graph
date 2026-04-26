/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { swapCosmographMock } from "./test-utils";
import { useGraphStore } from "@/features/graph/stores";

const mockPointsSelection = { reset: jest.fn() };
const mockLinksSelection = { reset: jest.fn() };

const mockCosmograph = {
  selectPoint: jest.fn(),
  selectPoints: jest.fn(),
  setFocusedPoint: jest.fn(),
  unselectAllPoints: jest.fn(),
  pointsSelection: mockPointsSelection,
  linksSelection: mockLinksSelection,
  getActiveSelectionSourceId: jest.fn().mockReturnValue("test-source"),
  getSelectedPointIndices: jest.fn().mockReturnValue([]),
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
  useCosmographInternal: () => ({ cosmograph: mockCosmograph }),
}));

jest.mock("@/features/graph/lib/cosmograph-selection", () => ({
  buildSelectedPointBaselineSelectionClause: jest.fn(
    (source: { id: string }, count: number) => ({
      source,
      value: { kind: "selected-point-baseline", count },
      predicate: null,
      meta: { type: "point" },
    }),
  ),
  clearSelectionClause: jest.fn(),
  createSelectionSource: jest.fn((id: string) => ({ id })),
}));

import { useGraphSelection } from "../hooks/use-graph-selection";

beforeEach(() => {
  jest.clearAllMocks();
  useGraphStore.setState({ selectedNode: null, focusedPointIndex: null, mode: "ask" });
});

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
    expect(useGraphStore.getState().focusedPointIndex).toBe(7);
  });

  it("delegates clearFocusedPoint to cosmograph", () => {
    const { result } = renderHook(() => useGraphSelection());
    useGraphStore.getState().setFocusedPointIndex(7);
    result.current.clearFocusedPoint();
    expect(mockCosmograph.setFocusedPoint).toHaveBeenCalledWith(undefined);
    expect(useGraphStore.getState().focusedPointIndex).toBeNull();
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
  beforeAll(() => swapCosmographMock(null));
  afterAll(() => swapCosmographMock(mockCosmograph));

  it("selectPoint is a no-op when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphSelection());
    expect(() => result.current.selectPoint(0)).not.toThrow();
  });

  it("getActiveSelectionSourceId returns null when cosmograph is null", () => {
    const { result } = renderHook(() => useGraphSelection());
    expect(result.current.getActiveSelectionSourceId()).toBeNull();
  });
});
