/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useGraphStore } from "@/features/graph/stores";

const mockCosmograph = {
  selectPoint: jest.fn(),
  setFocusedPoint: jest.fn(),
  zoomToPoint: jest.fn(),
};

jest.mock("@cosmograph/react", () => ({
  useCosmograph: () => ({ cosmograph: mockCosmograph }),
}));

import { useGraphFocus } from "../hooks/use-graph-focus";

beforeEach(() => {
  jest.clearAllMocks();
  useGraphStore.setState({ selectedNode: null, focusedPointIndex: null, mode: "ask" });
});

describe("useGraphFocus", () => {
  const point = {
    index: 7,
    id: "paper-7",
    paperId: "paper-7",
    nodeKind: "paper" as const,
    nodeRole: "primary" as const,
    color: "#000000",
    colorLight: "#000000",
    x: 0,
    y: 0,
    clusterId: 1,
    clusterLabel: "Cluster",
    displayLabel: "Paper 7",
    displayPreview: null,
    paperTitle: "Paper 7",
    citekey: null,
    journal: null,
    year: 2024,
    semanticGroups: null,
    relationCategories: null,
    textAvailability: null,
    paperAuthorCount: null,
    paperReferenceCount: null,
    paperEntityCount: null,
    paperRelationCount: null,
    isInBase: true,
    baseRank: 1,
    isOverlayActive: false,
  };

  it("focuses, zooms, and stores a new node target", () => {
    const { result } = renderHook(() => useGraphFocus());

    let changed = false;
    act(() => {
      changed = result.current.focusNode(point);
    });

    expect(changed).toBe(true);
    expect(mockCosmograph.setFocusedPoint).toHaveBeenCalledWith(7);
    expect(mockCosmograph.zoomToPoint).toHaveBeenCalledWith(7, 250);
    expect(useGraphStore.getState().focusedPointIndex).toBe(7);
    expect(useGraphStore.getState().selectedNode?.id).toBe("paper-7");
  });

  it("does not refocus or rezoom the same resolved node", () => {
    act(() => {
      useGraphStore.setState({ selectedNode: point, focusedPointIndex: 7 });
    });
    const { result } = renderHook(() => useGraphFocus());

    let changed = false;
    act(() => {
      changed = result.current.focusNode(point);
    });

    expect(changed).toBe(false);
    expect(mockCosmograph.setFocusedPoint).not.toHaveBeenCalled();
    expect(mockCosmograph.zoomToPoint).not.toHaveBeenCalled();
    expect(mockCosmograph.selectPoint).not.toHaveBeenCalled();
  });

  it("selects the point only when focus actually changes", () => {
    const { result, rerender } = renderHook(() => useGraphFocus());

    act(() => {
      result.current.focusNode(point, {
        selectPoint: true,
        addToSelection: false,
        expandLinks: false,
      });
    });

    expect(mockCosmograph.selectPoint).toHaveBeenCalledWith(7, false, false);

    jest.clearAllMocks();
    act(() => {
      useGraphStore.setState({ selectedNode: point, focusedPointIndex: 7 });
    });
    rerender();

    act(() => {
      result.current.focusNode(point, {
        selectPoint: true,
        addToSelection: false,
        expandLinks: false,
      });
    });

    expect(mockCosmograph.selectPoint).not.toHaveBeenCalled();
    expect(mockCosmograph.zoomToPoint).not.toHaveBeenCalled();
  });
});
