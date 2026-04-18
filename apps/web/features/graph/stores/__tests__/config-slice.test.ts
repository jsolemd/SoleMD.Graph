/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useDashboardStore } from "../dashboard-store";

describe("config-slice", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("does not emit when same-value config setters are called", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);

    act(() => {
      const state = useDashboardStore.getState();
      state.setPointColorColumn(state.pointColorColumn);
      state.setPointColorStrategy(state.pointColorStrategy);
      state.setPointSizeColumn(state.pointSizeColumn);
      state.setPointSizeRange([...state.pointSizeRange] as [number, number]);
      state.setPointLabelColumn(state.pointLabelColumn);
      state.setShowPointLabels(state.showPointLabels);
      state.setShowDynamicLabels(state.showDynamicLabels);
      state.setPositionXColumn(state.positionXColumn);
      state.setPositionYColumn(state.positionYColumn);
      state.setTablePage(state.tablePage);
      state.setTablePageSize(state.tablePageSize);
      state.setTableView(state.tableView);
      state.setColorScheme(state.colorScheme);
      state.setShowColorLegend(state.showColorLegend);
      state.setPointSizeStrategy(state.pointSizeStrategy);
      state.setScalePointsOnZoom(state.scalePointsOnZoom);
      state.setShowSizeLegend(state.showSizeLegend);
      state.setShowHoveredPointLabel(state.showHoveredPointLabel);
      state.setHoverLabelAlwaysOn(state.hoverLabelAlwaysOn);
      state.setRenderHoveredPointRing(state.renderHoveredPointRing);
      state.setActiveLayer(state.activeLayer);
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not emit when info widgets or filters are already in the requested state", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);

    act(() => {
      const state = useDashboardStore.getState();
      state.addInfoWidget(state.infoWidgets[0]);
      state.removeInfoWidget("not-a-widget");
      state.addFilter(state.filterColumns[0].column);
      state.removeFilter("paperTitle");
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
