/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useDashboardStore } from "../dashboard-store";

describe("links-slice", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("does not emit when same-value link setters are called", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);

    act(() => {
      const state = useDashboardStore.getState();
      state.setRenderLinks(state.renderLinks);
      state.setLinkOpacity(state.linkOpacity);
      state.setLinkGreyoutOpacity(state.linkGreyoutOpacity);
      state.setLinkVisibilityDistanceRange([...state.linkVisibilityDistanceRange] as [number, number]);
      state.setLinkVisibilityMinTransparency(state.linkVisibilityMinTransparency);
      state.setLinkDefaultWidth(state.linkDefaultWidth);
      state.setCurvedLinks(state.curvedLinks);
      state.setLinkDefaultArrows(state.linkDefaultArrows);
      state.setScaleLinksOnZoom(state.scaleLinksOnZoom);
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
