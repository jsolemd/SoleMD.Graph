/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useDashboardStore } from "../dashboard-store";

describe("visibility slice", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("does not emit store updates when clearing an already-empty visibility focus", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);

    act(() => {
      useDashboardStore.getState().clearVisibilityFocus();
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("does not emit store updates when applying the same visibility budget twice", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);
    const budget = {
      seedIndex: 12,
      clusterId: 4,
      includeCluster: true,
      xMin: -2,
      xMax: 3,
      yMin: -1,
      yMax: 5,
    };

    act(() => {
      useDashboardStore.getState().applyVisibilityBudget("corpus", budget);
    });

    expect(listener).toHaveBeenCalledTimes(1);
    listener.mockClear();

    act(() => {
      useDashboardStore.getState().applyVisibilityBudget("corpus", budget);
    });

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});
