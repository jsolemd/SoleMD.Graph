/**
 * @jest-environment jsdom
 */
import { act } from "@testing-library/react";
import {
  useDashboardStore,
  type OrbSelectionTool,
  type RendererMode,
} from "../index";

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

  it("keeps orb rectangle selection as an explicit tool mode", () => {
    expect(useDashboardStore.getState().orbSelectionTool).toBe("navigate");

    act(() => {
      useDashboardStore.getState().setOrbSelectionTool("rectangle");
    });
    expect(useDashboardStore.getState().orbSelectionTool).toBe("rectangle");

    act(() => {
      useDashboardStore.getState().toggleOrbRectangleSelection();
    });
    expect(useDashboardStore.getState().orbSelectionTool).toBe("navigate");
  });

  it("tracks the 3D resident point count with a revisioned cache key", () => {
    expect(useDashboardStore.getState().orbResidentPointCount).toBeNull();
    expect(useDashboardStore.getState().orbResidentRevision).toBe(0);

    act(() => {
      useDashboardStore.getState().setOrbResidentPointCount(16_384);
    });
    expect(useDashboardStore.getState().orbResidentPointCount).toBe(16_384);
    expect(useDashboardStore.getState().orbResidentRevision).toBe(1);

    act(() => {
      useDashboardStore.getState().setOrbResidentPointCount(16_384);
    });
    expect(useDashboardStore.getState().orbResidentRevision).toBe(1);

    act(() => {
      useDashboardStore.getState().setOrbResidentPointCount(null);
    });
    expect(useDashboardStore.getState().orbResidentPointCount).toBeNull();
    expect(useDashboardStore.getState().orbResidentRevision).toBe(2);
  });

  it("RendererMode type is re-exported from the stores barrel", () => {
    // Type-level: assignability check ensures the export at
    // apps/web/features/graph/stores/index.ts:13 stays alive.
    const mode: RendererMode = "3d";
    expect(mode).toBe("3d");
    const tool: OrbSelectionTool = "rectangle";
    expect(tool).toBe("rectangle");
  });
});
