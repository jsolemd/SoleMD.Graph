/**
 * @jest-environment jsdom
 *
 * Render stability tests for `useCosmographConfig` — the single hook that
 * controls every value passed to `<Cosmograph>`. Any reference instability
 * here means Cosmograph re-reads millions of DuckDB points.
 */
import { act } from "@testing-library/react";
import { renderHookWithCount, expectStableReferences } from "./render-stability-utils";

/* ── Mocks ── */

let mockColorScheme: "light" | "dark" = "dark";
jest.mock("@mantine/core", () => ({
  useComputedColorScheme: () => mockColorScheme,
}));
jest.mock("@cosmograph/react", () => ({}));

/* ── Imports (after mocks) ── */

import { useDashboardStore } from "@/features/graph/stores";
import { useCosmographConfig } from "../hooks/use-cosmograph-config";
import type { GraphCanvasSource } from "@/features/graph/duckdb";

/* ── Helpers ── */

type DashboardState = ReturnType<typeof useDashboardStore.getState>;

function resetStore(overrides: Partial<DashboardState> = {}) {
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    ...overrides,
  });
}

const CANVAS_STUB: GraphCanvasSource = {
  pointCounts: { corpus: 500_000, entities: 0, relations: 0 },
  overlayRevision: 0,
} as GraphCanvasSource;

function useConfig() {
  return useCosmographConfig(CANVAS_STUB);
}

beforeEach(() => {
  resetStore();
  mockColorScheme = "dark";
});

/* ── Palette reference stability ── */

describe("palette reference stability", () => {
  it("is stable when tableOpen changes (unrelated)", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["palette"], () => {
      useDashboardStore.setState({ tableOpen: true });
    });
  });

  it("is stable when showTimeline changes (unrelated)", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["palette"], () => {
      useDashboardStore.setState({ showTimeline: true });
    });
  });

  it("produces NEW reference when colorScheme changes (dep)", async () => {
    const { result } = renderHookWithCount(useConfig);
    const before = result.current.palette;
    await act(() => {
      useDashboardStore.setState({ colorScheme: "rainbow" });
    });
    expect(result.current.palette).not.toBe(before);
  });

  it("produces NEW reference when pointColorColumn changes (dep)", async () => {
    const { result } = renderHookWithCount(useConfig);
    const before = result.current.palette;
    await act(() => {
      useDashboardStore.setState({ pointColorColumn: "year" });
    });
    // palette depends on colorSchemeName + activeLayer + pointColorColumn
    // — changing pointColorColumn should invalidate it
    expect(result.current.palette).not.toBe(before);
  });

  it("keeps the palette reference stable across app theme toggles", async () => {
    const hook = renderHookWithCount(useConfig);
    const before = hook.result.current.palette;

    await act(() => {
      mockColorScheme = "light";
      hook.rerender();
    });

    expect(hook.result.current.palette).toBe(before);
  });
});

/* ── Function reference stability ── */

describe("function reference stability", () => {
  it("pointColorByFn is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["pointColorByFn"], () => {
      useDashboardStore.setState({ tableOpen: true });
    });
  });

  it("linkColorByFn is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["linkColorByFn"], () => {
      useDashboardStore.setState({ showTimeline: true });
    });
  });

  it("effectiveOpacity is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["effectiveOpacity"], () => {
      useDashboardStore.setState({ tableOpen: true });
    });
  });

  it("fitViewPadding is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["fitViewPadding"], () => {
      useDashboardStore.setState({ promptMode: "maximized" });
    });
  });

  it("pointColorByFn gets NEW identity when pointColorColumn changes (dep)", async () => {
    const { result } = renderHookWithCount(useConfig);
    const before = result.current.pointColorByFn;
    await act(() => {
      useDashboardStore.setState({ pointColorColumn: "year" });
    });
    expect(result.current.pointColorByFn).not.toBe(before);
  });
});

/* ── Computed value stability ── */

describe("computed value stability", () => {
  it("effectiveColorColumn is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["effectiveColorColumn"], () => {
      useDashboardStore.setState({ tableOpen: true });
    });
  });

  it("effectiveColorStrategy is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["effectiveColorStrategy"], () => {
      useDashboardStore.setState({ showTimeline: true });
    });
  });

  it("pointIncludeColumns is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["pointIncludeColumns"], () => {
      useDashboardStore.setState({ promptMode: "collapsed" });
    });
  });

  it("pointIncludeColumns is empty on default first paint", () => {
    const { result } = renderHookWithCount(useConfig);
    expect(result.current.pointIncludeColumns).toEqual([]);
  });

  it("pointIncludeColumns stays stable when an unrelated panel opens", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["pointIncludeColumns"], () => {
      useDashboardStore.setState({ activePanel: "query" });
    });
  });

  it("pointIncludeColumns stays stable when pointColorColumn changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["pointIncludeColumns"], () => {
      useDashboardStore.setState({ pointColorColumn: "year" });
    });
  });

  it("pointIncludeColumns expands when the filters panel opens", async () => {
    const { result } = renderHookWithCount(useConfig);
    const before = result.current.pointIncludeColumns;

    await act(() => {
      useDashboardStore.setState({ activePanel: "filters" });
    });

    expect(before).toEqual([]);
    expect(result.current.pointIncludeColumns.length).toBeGreaterThan(0);
  });

  it("pointClusterColumn is stable across unrelated state changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    await expectStableReferences(result, ["pointClusterColumn"], () => {
      useDashboardStore.setState({ tableOpen: true });
    });
  });

  it("pointClusterColumn changes when pointLabelColumn changes", async () => {
    const { result } = renderHookWithCount(useConfig);
    expect(result.current.pointClusterColumn).toBe("clusterLabel");

    await act(() => {
      useDashboardStore.setState({ pointLabelColumn: "paperTitle" });
    });

    expect(result.current.pointClusterColumn).toBeUndefined();
  });

  it("keeps the effective color column stable across app theme toggles", async () => {
    const hook = renderHookWithCount(useConfig);
    const before = hook.result.current.effectiveColorColumn;

    await act(() => {
      mockColorScheme = "light";
      hook.rerender();
    });

    expect(hook.result.current.effectiveColorColumn).toBe(before);
  });
});

/* ── Render count isolation ── */

describe("render count isolation", () => {
  it("changing promptMode causes 0 re-renders of the hook", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ promptMode: "maximized" });
    });
    // promptMode is not subscribed — expect no re-render
    expect(hook.renderCount()).toBe(0);
  });

  it("changing colorScheme causes exactly 1 re-render (point config block)", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ colorScheme: "rainbow" });
    });
    expect(hook.renderCount()).toBe(1);
  });

  it("changing pointColorColumn causes exactly 1 re-render", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ pointColorColumn: "year" });
    });
    // pointColorColumn is inside the useShallow point config block —
    // changing it fires exactly 1 re-render (not more).
    expect(hook.renderCount()).toBe(1);
  });

  it("changing tableOpen causes 0 re-renders of the hook", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ tableOpen: true });
    });
    expect(hook.renderCount()).toBe(0);
  });

  it("changing an unrelated panel causes 0 re-renders of the hook", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ activePanel: "query" });
    });
    expect(hook.renderCount()).toBe(0);
  });

  it("opening the filters panel causes exactly 1 re-render", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ activePanel: "filters" });
    });
    expect(hook.renderCount()).toBe(1);
  });

  it("changing selectionLocked causes 0 re-renders (unsubscribed)", async () => {
    const hook = renderHookWithCount(useConfig);
    hook.resetCount();
    await act(() => {
      useDashboardStore.setState({ selectionLocked: true });
    });
    expect(hook.renderCount()).toBe(0);
  });
});
