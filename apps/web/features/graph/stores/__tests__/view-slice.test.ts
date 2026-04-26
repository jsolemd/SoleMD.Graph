/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import { useDashboardStore, type RendererMode } from "../index";

describe("view-slice", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("initial rendererMode is '3d' (orb is the default /graph surface)", () => {
    expect(useDashboardStore.getState().rendererMode).toBe("3d");
  });

  it("setRendererMode('2d') flips the slice to 2d without touching other slices", () => {
    const before = useDashboardStore.getState();
    act(() => {
      before.setRendererMode("2d");
    });
    const after = useDashboardStore.getState();
    expect(after.rendererMode).toBe("2d");
    // sanity: an unrelated slice value (timeline window) is unchanged.
    expect(after.timelineSelection).toBe(before.timelineSelection);
  });

  it("setRendererMode is a no-op when called with the current value (no listener fire)", () => {
    const listener = jest.fn();
    const unsubscribe = useDashboardStore.subscribe(listener);
    act(() => {
      useDashboardStore.getState().setRendererMode("3d");
    });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("toggleRendererMode round-trips between '3d' and '2d'", () => {
    expect(useDashboardStore.getState().rendererMode).toBe("3d");
    act(() => {
      useDashboardStore.getState().toggleRendererMode();
    });
    expect(useDashboardStore.getState().rendererMode).toBe("2d");
    act(() => {
      useDashboardStore.getState().toggleRendererMode();
    });
    expect(useDashboardStore.getState().rendererMode).toBe("3d");
  });

  it("RendererMode type is re-exported from the stores barrel", () => {
    // Type-level: assignability check ensures the export at
    // apps/web/features/graph/stores/index.ts:13 stays alive.
    const mode: RendererMode = "3d";
    expect(mode).toBe("3d");
  });
});
