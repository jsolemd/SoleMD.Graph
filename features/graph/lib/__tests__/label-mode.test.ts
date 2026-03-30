import { resolveGraphLabelMode } from "../label-mode";

describe("label-mode", () => {
  it("keeps cluster labels at overview and switches to display labels on zoom", () => {
    const overview = resolveGraphLabelMode({
      pointLabelColumn: "clusterLabel",
      showPointLabels: true,
      showDynamicLabels: true,
      zoomedIn: false,
      isActivelyZooming: false,
      hasFocusedPoint: false,
      hasSelection: false,
    });
    const zoomed = resolveGraphLabelMode({
      pointLabelColumn: "clusterLabel",
      showPointLabels: true,
      showDynamicLabels: true,
      zoomedIn: true,
      isActivelyZooming: false,
      hasFocusedPoint: false,
      hasSelection: false,
    });

    expect(overview.effectivePointLabelColumn).toBe("clusterLabel");
    expect(overview.showDynamicLabels).toBe(true);
    expect(zoomed.effectivePointLabelColumn).toBe("displayLabel");
  });

  it("promotes focused and selected points to native selected-label behavior", () => {
    const focused = resolveGraphLabelMode({
      pointLabelColumn: "clusterLabel",
      showPointLabels: true,
      showDynamicLabels: true,
      zoomedIn: false,
      isActivelyZooming: false,
      hasFocusedPoint: true,
      focusedPointId: "paper-7",
      hasSelection: true,
    });

    expect(focused.effectivePointLabelColumn).toBe("displayLabel");
    expect(focused.showFocusedPointLabel).toBe(true);
    expect(focused.showSelectedLabels).toBe(true);
    expect(focused.showUnselectedPointLabels).toBe(false);
    expect(focused.selectedPointLabelsLimit).toBe(1);
    expect(focused.showDynamicLabels).toBe(false);
    expect(focused.showTopLabels).toBe(false);
    expect(focused.showLabelsFor).toEqual(["paper-7"]);
  });
});
