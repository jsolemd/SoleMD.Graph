/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useDashboardStore } from "../dashboard-store";
import {
  DEFAULT_EDGE_SOURCE_ENABLED,
  DEFAULT_EDGE_TIER_ALPHAS,
  DEFAULT_EDGE_TIER_BUDGETS,
  DEFAULT_EDGE_TIER_ENABLED,
} from "../slices/links-slice";

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
      state.setEdgeTierEnabled("tier1_hover", state.edgeTierEnabled.tier1_hover);
      state.setEdgeSourceEnabled("citation", state.edgeSourceEnabled.citation);
      state.setEdgeTierBudget("tier3_scope", state.edgeTierBudgets.tier3_scope);
      state.setEdgeTierAlpha("tier0_chords", state.edgeTierAlphas.tier0_chords);
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("initializes H0 orb edge tiers from the locked defaults", () => {
    const state = useDashboardStore.getState();

    expect(state.edgeTierEnabled).toEqual(DEFAULT_EDGE_TIER_ENABLED);
    expect(state.edgeSourceEnabled).toEqual(DEFAULT_EDGE_SOURCE_ENABLED);
    expect(state.edgeTierBudgets).toEqual(DEFAULT_EDGE_TIER_BUDGETS);
    expect(state.edgeTierAlphas).toEqual(DEFAULT_EDGE_TIER_ALPHAS);
  });

  it("keeps citation and entity source toggles independent", () => {
    act(() => {
      useDashboardStore.getState().setEdgeSourceEnabled("citation", false);
    });

    expect(useDashboardStore.getState().edgeSourceEnabled).toEqual({
      citation: false,
      entity: true,
    });

    act(() => {
      useDashboardStore.getState().setEdgeSourceEnabled("entity", false);
    });

    expect(useDashboardStore.getState().edgeSourceEnabled).toEqual({
      citation: false,
      entity: false,
    });
  });

  it("updates tier budgets and alphas without changing tier visibility", () => {
    act(() => {
      const state = useDashboardStore.getState();
      state.setEdgeTierEnabled("tier3_scope", false);
      state.setEdgeTierBudget("tier3_scope", 6_250.8);
      state.setEdgeTierAlpha("tier3_scope", 1.4);
    });

    const state = useDashboardStore.getState();
    expect(state.edgeTierEnabled.tier3_scope).toBe(false);
    expect(state.edgeTierBudgets.tier3_scope).toBe(6_250);
    expect(state.edgeTierAlphas.tier3_scope).toBe(1);
  });
});
