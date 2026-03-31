/**
 * @jest-environment jsdom
 *
 * Zustand selector isolation tests — confirms primitive selectors only fire
 * when their own value changes, and useShallow blocks only fire when one of
 * their selected values changes.
 *
 * Per Zustand's testing guide: use React Testing Library, don't mock useShallow,
 * reset stores between tests.
 */
import { renderHook, act } from "@testing-library/react";
import { useShallow } from "zustand/react/shallow";
import { useDashboardStore } from "../dashboard-store";

type DashboardState = ReturnType<typeof useDashboardStore.getState>;

function resetStore(overrides: Partial<DashboardState> = {}) {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    ...overrides,
  });
}

beforeEach(() => resetStore());

/* ── Individual selector isolation ── */

describe("individual selector isolation", () => {
  it("activeLayer selector does not fire when tableOpen changes", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.activeLayer);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ tableOpen: true }); });
    expect(renderCount).toBe(0);
  });

  it("tableOpen selector does not fire when pointColorColumn changes (cross-slice: panel vs config)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.tableOpen);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ pointColorColumn: "year" }); });
    expect(renderCount).toBe(0);
  });

  it("showTimeline selector does not fire when selectionLocked changes (cross-slice: timeline vs selection)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.showTimeline);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ selectionLocked: true }); });
    expect(renderCount).toBe(0);
  });

  it("selectionLocked selector does not fire when renderLinks changes (cross-slice: selection vs links)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.selectionLocked);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ renderLinks: true }); });
    expect(renderCount).toBe(0);
  });

  it("promptMode selector does not fire when colorScheme changes (cross-slice: panel vs config)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.promptMode);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ colorScheme: "rainbow" }); });
    expect(renderCount).toBe(0);
  });

  it("renderLinks selector does not fire when showTimeline changes (cross-slice: links vs timeline)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore((s) => s.renderLinks);
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ showTimeline: true }); });
    expect(renderCount).toBe(0);
  });
});

/* ── useShallow block isolation ── */

describe("useShallow block isolation", () => {
  it("point config block does not fire when tableOpen changes", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore(useShallow((s) => ({
        pointColorColumn: s.pointColorColumn,
        pointColorStrategy: s.pointColorStrategy,
        colorScheme: s.colorScheme,
        pointSizeColumn: s.pointSizeColumn,
        pointSizeRange: s.pointSizeRange,
        pointSizeStrategy: s.pointSizeStrategy,
        scalePointsOnZoom: s.scalePointsOnZoom,
        pointLabelColumn: s.pointLabelColumn,
        showPointLabels: s.showPointLabels,
        showDynamicLabels: s.showDynamicLabels,
        showHoveredPointLabel: s.showHoveredPointLabel,
        hoverLabelAlwaysOn: s.hoverLabelAlwaysOn,
        renderHoveredPointRing: s.renderHoveredPointRing,
        positionXColumn: s.positionXColumn,
        positionYColumn: s.positionYColumn,
      })));
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ tableOpen: true }); });
    expect(renderCount).toBe(0);
  });

  it("link config block does not fire when pointColorColumn changes", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useDashboardStore(useShallow((s) => ({
        renderLinks: s.renderLinks,
        linkOpacity: s.linkOpacity,
        linkGreyoutOpacity: s.linkGreyoutOpacity,
        linkVisibilityDistanceRange: s.linkVisibilityDistanceRange,
        linkVisibilityMinTransparency: s.linkVisibilityMinTransparency,
        linkDefaultWidth: s.linkDefaultWidth,
        curvedLinks: s.curvedLinks,
        linkDefaultArrows: s.linkDefaultArrows,
        scaleLinksOnZoom: s.scaleLinksOnZoom,
      })));
    });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ pointColorColumn: "year" }); });
    expect(renderCount).toBe(0);
  });
});
