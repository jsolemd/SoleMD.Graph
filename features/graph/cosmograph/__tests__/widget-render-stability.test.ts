/**
 * @jest-environment jsdom
 *
 * Tests the 5 Zustand selectors that `useWidgetSelectors` (and thus all
 * crossfilter widgets) subscribe to:
 *   activeLayer, currentScopeRevision, selectionLocked,
 *   selectedPointCount, selectedPointRevision
 *
 * The real hook lives in `widgets/use-widget-selectors.ts` and wraps
 * these with cosmograph refs + derived memos. This test validates the
 * store-level isolation (no spurious re-renders on unrelated state).
 */
import { renderHook, act } from "@testing-library/react";
import { useDashboardStore } from "@/features/graph/stores";

type DashboardState = ReturnType<typeof useDashboardStore.getState>;

function resetStore(overrides: Partial<DashboardState> = {}) {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    ...overrides,
  });
}

/** The exact 5 selectors that all filter/timeline widgets share. */
function useWidgetSelectors() {
  const activeLayer = useDashboardStore((s) => s.activeLayer);
  const currentScopeRevision = useDashboardStore((s) => s.currentScopeRevision);
  const selectionLocked = useDashboardStore((s) => s.selectionLocked);
  const selectedPointCount = useDashboardStore((s) => s.selectedPointCount);
  const selectedPointRevision = useDashboardStore((s) => s.selectedPointRevision);
  return { activeLayer, currentScopeRevision, selectionLocked, selectedPointCount, selectedPointRevision };
}

beforeEach(() => resetStore());

/* ── Selector isolation from unrelated state ── */

describe("widget selector isolation", () => {
  it("does not fire when tableOpen changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ tableOpen: true }); });
    expect(renderCount).toBe(0);
  });

  it("does not fire when promptMode changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ promptMode: "maximized" }); });
    expect(renderCount).toBe(0);
  });

  it("does not fire when colorScheme changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ colorScheme: "rainbow" }); });
    expect(renderCount).toBe(0);
  });

  it("does not fire when showTimeline changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ showTimeline: true }); });
    expect(renderCount).toBe(0);
  });

  it("does not fire when renderLinks changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.setState({ renderLinks: true }); });
    expect(renderCount).toBe(0);
  });
});

/* ── Reactivity confirmation ── */

describe("widget selector reactivity", () => {
  it("fires when currentScopeRevision changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.getState().setCurrentPointScopeSql("WHERE year > 2020"); });
    // setCurrentPointScopeSql bumps currentScopeRevision
    expect(renderCount).toBeGreaterThanOrEqual(1);
  });

  it("fires when selectedPointCount changes", async () => {
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.getState().setSelectedPointCount(42); });
    expect(renderCount).toBeGreaterThanOrEqual(1);
  });

  it("fires when selectionLocked changes", async () => {
    // Need to have a selection for lockSelection to work
    resetStore({ selectedPointCount: 10, currentPointScopeSql: "WHERE 1=1" });
    let renderCount = 0;
    renderHook(() => { renderCount++; return useWidgetSelectors(); });
    renderCount = 0;
    await act(() => { useDashboardStore.getState().lockSelection(); });
    expect(renderCount).toBeGreaterThanOrEqual(1);
  });
});
