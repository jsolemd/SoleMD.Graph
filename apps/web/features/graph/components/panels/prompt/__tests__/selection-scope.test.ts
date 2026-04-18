import {
  getSelectionScopeToggleLabel,
  isSelectionScopeAvailable,
  isSelectionScopeEnabled,
} from "../selection-scope";
import { RAG_ANSWER_SELECTION_SOURCE_ID } from "@/features/graph/lib/overlay-producers";

describe("selection-scope helpers", () => {
  it("treats active graph selection as scope availability", () => {
    expect(
      isSelectionScopeAvailable({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 3,
        hasSelectedNode: false,
        activeSelectionSourceId: null,
      }),
    ).toBe(true);

    expect(
      isSelectionScopeAvailable({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 0,
        hasSelectedNode: true,
        activeSelectionSourceId: null,
      }),
    ).toBe(true);

    expect(
      isSelectionScopeAvailable({
        hasQueries: false,
        currentPointScopeSql: null,
        selectedPointCount: 3,
        hasSelectedNode: true,
        activeSelectionSourceId: null,
      }),
    ).toBe(false);

    expect(
      isSelectionScopeAvailable({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 3,
        hasSelectedNode: false,
        activeSelectionSourceId: RAG_ANSWER_SELECTION_SOURCE_ID,
      }),
    ).toBe(false);

    expect(
      isSelectionScopeAvailable({
        hasQueries: true,
        currentPointScopeSql: "clusterId = 7",
        selectedPointCount: 0,
        hasSelectedNode: false,
        activeSelectionSourceId: null,
      }),
    ).toBe(true);
  });

  it("auto-enables selection scope until the user manually turns it off", () => {
    expect(
      isSelectionScopeEnabled({
        available: true,
        manuallyDisabled: false,
      }),
    ).toBe(true);

    expect(
      isSelectionScopeEnabled({
        available: true,
        manuallyDisabled: true,
      }),
    ).toBe(false);

    expect(
      isSelectionScopeEnabled({
        available: false,
        manuallyDisabled: false,
      }),
    ).toBe(false);
  });

  it("describes selection scope in user-facing labels", () => {
    expect(
      getSelectionScopeToggleLabel({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 0,
        hasSelectedNode: false,
        activeSelectionSourceId: null,
      }),
    ).toBe("Select papers on the graph or narrow the current view to enable selection scope");

    expect(
      getSelectionScopeToggleLabel({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 5,
        hasSelectedNode: false,
        activeSelectionSourceId: null,
      }),
    ).toBe("Limit evidence to the current selection (5 papers)");

    expect(
      getSelectionScopeToggleLabel({
        hasQueries: true,
        currentPointScopeSql: "clusterId = 7",
        selectedPointCount: 0,
        hasSelectedNode: false,
        activeSelectionSourceId: null,
      }),
    ).toBe("Limit evidence to the current graph selection");

    expect(
      getSelectionScopeToggleLabel({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 0,
        hasSelectedNode: true,
        activeSelectionSourceId: null,
      }),
    ).toBe("Limit evidence to the focused paper");

    expect(
      getSelectionScopeToggleLabel({
        hasQueries: true,
        currentPointScopeSql: null,
        selectedPointCount: 2,
        hasSelectedNode: false,
        activeSelectionSourceId: RAG_ANSWER_SELECTION_SOURCE_ID,
      }),
    ).toBe(
      "Answer-linked studies are selected; click or lasso papers to scope a new query",
    );
  });
});
