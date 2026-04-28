import {
  ORB_RESIDENT_POINT_SCOPE_SQL,
  resolveWidgetBaselineScope,
} from "../widget-baseline";

describe("widget-baseline", () => {
  it("uses the selected denominator whenever an explicit selection exists", () => {
    expect(
      resolveWidgetBaselineScope({
        selectionLocked: false,
        selectedPointCount: 12,
        selectedPointRevision: 4,
      }),
    ).toEqual({
      scope: "selected",
      cacheKey: "selected:4",
      currentPointScopeSql: null,
      ready: true,
    });
  });

  it("uses the selected denominator when selection is locked", () => {
    expect(
      resolveWidgetBaselineScope({
        selectionLocked: true,
        selectedPointCount: 12,
        selectedPointRevision: 4,
      }),
    ).toEqual({
      scope: "selected",
      cacheKey: "selected:4",
      currentPointScopeSql: null,
      ready: true,
    });
  });

  it("uses the resident rendered denominator in 3D when selection is empty", () => {
    expect(
      resolveWidgetBaselineScope({
        rendererMode: "3d",
        selectionLocked: true,
        selectedPointCount: 0,
        selectedPointRevision: 9,
        orbResidentPointCount: 16_384,
        orbResidentRevision: 2,
      }),
    ).toEqual({
      scope: "current",
      cacheKey: "resident:16384:2",
      currentPointScopeSql: ORB_RESIDENT_POINT_SCOPE_SQL,
      ready: true,
    });
  });

  it("marks the 3D resident denominator pending until the paper sample exists", () => {
    expect(
      resolveWidgetBaselineScope({
        rendererMode: "3d",
        selectionLocked: false,
        selectedPointCount: 0,
        selectedPointRevision: 9,
        orbResidentPointCount: null,
        orbResidentRevision: 1,
      }),
    ).toEqual({
      scope: "current",
      cacheKey: "resident:pending",
      currentPointScopeSql: ORB_RESIDENT_POINT_SCOPE_SQL,
      ready: false,
    });
  });

  it("uses the full dataset in 2D when there is no explicit selection", () => {
    expect(
      resolveWidgetBaselineScope({
        rendererMode: "2d",
        selectionLocked: false,
        selectedPointCount: 0,
        selectedPointRevision: 9,
      }),
    ).toEqual({
      scope: "dataset",
      cacheKey: "dataset",
      currentPointScopeSql: null,
      ready: true,
    });
  });
});
