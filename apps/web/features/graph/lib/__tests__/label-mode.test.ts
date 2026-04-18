import { resolveGraphLabelMode, type GraphLabelModeInput } from "../label-mode";

const BASE: GraphLabelModeInput = {
  pointLabelColumn: "clusterLabel",
  showPointLabels: true,
  showDynamicLabels: true,
  showHoveredPointLabel: true,
  hoverLabelAlwaysOn: false,
  zoomedIn: false,
  hasFocusedPoint: false,
  hasSelection: false,
};

describe("label-mode", () => {
  it("keeps cluster labels at overview and switches to display labels on zoom", () => {
    const overview = resolveGraphLabelMode(BASE);
    const zoomed = resolveGraphLabelMode({ ...BASE, zoomedIn: true });

    expect(overview.effectivePointLabelColumn).toBe("displayLabel");
    expect(overview.showClusterLabels).toBe(true);
    expect(overview.showDynamicLabels).toBe(false);
    expect(overview.showTopLabels).toBe(false);
    expect(zoomed.effectivePointLabelColumn).toBe("displayLabel");
    expect(zoomed.showClusterLabels).toBe(false);
    expect(zoomed.showDynamicLabels).toBe(true);
  });

  it("promotes focused and selected points to native selected-label behavior", () => {
    const focused = resolveGraphLabelMode({
      ...BASE,
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

  it("suppresses bulk selected labels when there is no focused point", () => {
    const selected = resolveGraphLabelMode({
      ...BASE,
      hasSelection: true,
    });

    expect(selected.showFocusedPointLabel).toBe(false);
    expect(selected.showSelectedLabels).toBe(false);
    expect(selected.showUnselectedPointLabels).toBe(false);
    expect(selected.showDynamicLabels).toBe(false);
    expect(selected.showTopLabels).toBe(false);
  });

  it("gates hover labels on zoom level", () => {
    const zoomedOut = resolveGraphLabelMode(BASE);
    const zoomedIn = resolveGraphLabelMode({ ...BASE, zoomedIn: true });

    expect(zoomedOut.showHoveredPointLabel).toBe(false);
    expect(zoomedIn.showHoveredPointLabel).toBe(true);
    expect(zoomedIn.showTopLabels).toBe(true);
  });

  it("always-on override bypasses zoom gate for hover labels", () => {
    const overrideOff = resolveGraphLabelMode(BASE);
    const overrideOn = resolveGraphLabelMode({
      ...BASE,
      hoverLabelAlwaysOn: true,
    });

    expect(overrideOff.showHoveredPointLabel).toBe(false);
    expect(overrideOn.showHoveredPointLabel).toBe(true);
    expect(overrideOn.effectivePointLabelColumn).toBe("displayLabel");
  });
});
