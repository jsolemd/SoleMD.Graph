import { resolveWidgetBaselineScope } from "../widget-baseline";

describe("widget-baseline", () => {
  it("uses the full dataset when selection is not locked", () => {
    expect(
      resolveWidgetBaselineScope({
        selectionLocked: false,
        selectedPointCount: 12,
        selectedPointRevision: 4,
      }),
    ).toEqual({
      scope: "dataset",
      cacheKey: "dataset",
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
    });
  });

  it("falls back to dataset when a locked selection is empty", () => {
    expect(
      resolveWidgetBaselineScope({
        selectionLocked: true,
        selectedPointCount: 0,
        selectedPointRevision: 9,
      }),
    ).toEqual({
      scope: "dataset",
      cacheKey: "dataset",
    });
  });
});
