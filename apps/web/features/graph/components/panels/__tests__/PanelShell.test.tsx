/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";

jest.mock("@/features/animations/lottie/SearchToggleLottie", () => ({
  SearchToggleLottie: ({ mode }: { mode: string }) => (
    <span data-testid={`search-toggle-${mode}`} />
  ),
}));

// Mock framer-motion — merge initial/animate into style so JSX tests can
// read numeric layout fields (width/left) that are now driven by `animate`.
jest.mock("framer-motion", () => {
  const toStyle = (value: unknown) => {
    if (!value || typeof value !== "object") return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "number" || typeof v === "string") out[k] = v;
    }
    return out;
  };
  return {
    motion: {
      div: ({
        children,
        style,
        className,
        drag: _drag,
        dragControls: _dragControls,
        dragListener: _dragListener,
        dragMomentum: _dragMomentum,
        dragElastic: _dragElastic,
        dragConstraints: _dragConstraints,
        initial,
        animate,
        exit: _exit,
        transition: _transition,
        ...rest
      }: React.PropsWithChildren<Record<string, unknown>>) => (
        <div
          style={{
            ...toStyle(initial),
            ...toStyle(animate),
            ...(style as React.CSSProperties),
          }}
          className={className as string}
          {...rest}
        >
          {children}
        </div>
      ),
    },
    useDragControls: () => ({ start: jest.fn() }),
    useMotionValue: (initial: number) => ({
      get: () => initial,
      set: jest.fn(),
    }),
    animate: jest.fn(),
  };
});

// Mock lib/motion
jest.mock("@/lib/motion", () => ({
  panelReveal: {
    left: { initial: {}, animate: {}, exit: {}, transition: {}, style: {} },
    right: { initial: {}, animate: {}, exit: {}, transition: {}, style: {} },
  },
  smooth: {},
}));

// Mock viewport so the elastic dock has a deterministic budget.
const viewportSizeMock = { width: 900, height: 800 };
jest.mock("@mantine/hooks", () => {
  const actual = jest.requireActual("@mantine/hooks");
  return {
    ...actual,
    useViewportSize: () => viewportSizeMock,
  };
});

import { PanelBody, PanelSearchField, PanelShell } from "../PanelShell";
import { useDashboardStore } from "@/features/graph/stores";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    disconnect() {}
    unobserve() {}
  }

  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

describe("PanelShell", () => {
  beforeEach(() => {
    useDashboardStore.setState({ floatingObstacles: {}, panelScales: {} });
  });

  it("renders chrome with title", () => {
    render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );
    expect(screen.getByText("Wiki")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <div data-testid="child">content</div>
        </PanelShell>
      </MantineProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("calls onClose via Escape", () => {
    const onClose = jest.fn();
    render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" onClose={onClose}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears floating obstacle on unmount", () => {
    const { unmount } = render(
      <MantineProvider>
        <PanelShell id="test-panel" title="Test" onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );

    useDashboardStore.getState().setFloatingObstacle("test-panel", { x: 0, y: 0, width: 100, height: 100 });
    expect(useDashboardStore.getState().floatingObstacles["test-panel"]).toBeDefined();

    unmount();
    expect(useDashboardStore.getState().floatingObstacles["test-panel"]).toBeUndefined();
  });

  it("selectLeftClearance returns 0 when wiki panel has floating obstacle", () => {
    const { selectLeftClearance } = require("@/features/graph/stores/dashboard-store");
    const state = {
      ...useDashboardStore.getState(),
      openPanels: { ...useDashboardStore.getState().openPanels, wiki: true },
      panelsVisible: true,
      floatingObstacles: { wiki: { x: 100, y: 100, width: 400, height: 600 } },
    };
    expect(selectLeftClearance(state)).toBe(0);
  });

  it("updates docked width when defaultWidth changes", () => {
    const { container, rerender } = render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" defaultWidth={420} onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );

    const panel = container.querySelector(".absolute");
    expect(panel).toHaveStyle({ width: "420px" });

    rerender(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" defaultWidth={600} onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );

    expect(panel).toHaveStyle({ width: "600px" });
  });

  it("zooms panel content with panel-scoped keyboard shortcuts", () => {
    const { container } = render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <PanelBody>
            <div data-testid="child">content</div>
          </PanelBody>
        </PanelShell>
      </MantineProvider>,
    );

    const panel = container.querySelector(".absolute");
    const shell = panel as HTMLElement;

    expect(panel).toBeTruthy();
    expect(shell.style.getPropertyValue("--graph-panel-scale")).toBe("1");

    fireEvent.keyDown(panel as HTMLElement, { key: "=", ctrlKey: true });

    expect(useDashboardStore.getState().panelScales.wiki).toBe(1.1);
    expect(shell.style.getPropertyValue("--graph-panel-scale")).toBe("1.1");

    fireEvent.keyDown(panel as HTMLElement, { key: "0", ctrlKey: true });

    expect(useDashboardStore.getState().panelScales.wiki).toBeUndefined();
    expect(shell.style.getPropertyValue("--graph-panel-scale")).toBe("1");
  });

  it("zooms panel content from the chrome controls", () => {
    render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );

    fireEvent.click(screen.getByLabelText("Increase panel text size"));
    expect(useDashboardStore.getState().panelScales.wiki).toBe(1.1);

    fireEvent.click(screen.getByLabelText("Decrease panel text size"));
    expect(useDashboardStore.getState().panelScales.wiki).toBeUndefined();
  });

  it("renders a collapsed shared search action when closed", () => {
    const onAction = jest.fn();

    render(
      <MantineProvider>
        <PanelSearchField
          collapsible
          open={false}
          value=""
          onValueChange={jest.fn()}
          placeholder="Search..."
          ariaLabel="Search wiki pages"
          actionLabel="Search wiki"
          actionMode="search"
          onAction={onAction}
        />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByLabelText("Search wiki"));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("renders the shared search input and relays actions when open", () => {
    const onAction = jest.fn();
    const onValueChange = jest.fn();

    render(
      <MantineProvider>
        <PanelSearchField
          open
          value="ketamine"
          onValueChange={onValueChange}
          placeholder="Search..."
          ariaLabel="Search wiki pages"
          actionLabel="Clear search"
          actionMode="close"
          onAction={onAction}
        />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText("Search wiki pages"), {
      target: { value: "psilocybin" },
    });
    fireEvent.click(screen.getByLabelText("Clear search"));

    expect(onValueChange).toHaveBeenCalledWith("psilocybin");
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("stops pointer and touch gestures from bubbling past the shared search field", () => {
    const onPointerDown = jest.fn();
    const onPointerMove = jest.fn();
    const onMouseDown = jest.fn();
    const onTouchStart = jest.fn();
    const onTouchMove = jest.fn();
    const onTouchEnd = jest.fn();

    render(
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <MantineProvider>
          <PanelSearchField
            open
            value=""
            onValueChange={jest.fn()}
            placeholder="Search..."
            ariaLabel="Search wiki pages"
            actionLabel="Search wiki"
            actionMode="search"
            onAction={jest.fn()}
          />
        </MantineProvider>
      </div>,
    );

    fireEvent.pointerDown(screen.getByLabelText("Search wiki"));
    fireEvent.pointerMove(screen.getByLabelText("Search wiki"));
    fireEvent.mouseDown(screen.getByLabelText("Search wiki"));
    fireEvent.touchStart(screen.getByLabelText("Search wiki"));
    fireEvent.touchMove(screen.getByLabelText("Search wiki"));
    fireEvent.touchEnd(screen.getByLabelText("Search wiki"));
    fireEvent.pointerDown(screen.getByLabelText("Search wiki pages"));
    fireEvent.pointerMove(screen.getByLabelText("Search wiki pages"));
    fireEvent.mouseDown(screen.getByLabelText("Search wiki pages"));
    fireEvent.touchStart(screen.getByLabelText("Search wiki pages"));
    fireEvent.touchMove(screen.getByLabelText("Search wiki pages"));
    fireEvent.touchEnd(screen.getByLabelText("Search wiki pages"));

    expect(onPointerDown).not.toHaveBeenCalled();
    expect(onPointerMove).not.toHaveBeenCalled();
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onTouchStart).not.toHaveBeenCalled();
    expect(onTouchMove).not.toHaveBeenCalled();
    expect(onTouchEnd).not.toHaveBeenCalled();
  });

  it("elastic dock keeps the rightmost panel inside the viewport at 900", () => {
    useDashboardStore.setState({
      openPanels: { about: true, config: true, filters: true, info: true, query: true, wiki: true },
      panelsVisible: true,
      floatingObstacles: {},
      panelPositions: {},
    });

    const { container } = render(
      <MantineProvider>
        <PanelShell id="about" title="About" onClose={jest.fn()}><div /></PanelShell>
        <PanelShell id="config" title="Config" onClose={jest.fn()}><div /></PanelShell>
        <PanelShell id="filters" title="Filters" onClose={jest.fn()}><div /></PanelShell>
        <PanelShell id="info" title="Info" onClose={jest.fn()}><div /></PanelShell>
        <PanelShell id="query" title="Query" onClose={jest.fn()}><div /></PanelShell>
        <PanelShell id="wiki" title="Wiki" onClose={jest.fn()}><div /></PanelShell>
      </MantineProvider>,
    );

    const { PANEL_DOCK_MIN_PX, APP_CHROME_PX } = require("@/lib/density");
    const {
      computeDockedLayout,
      PANEL_EDGE_MARGIN,
    } = require("@/features/graph/stores/dashboard-store");

    const layout = computeDockedLayout(useDashboardStore.getState(), viewportSizeMock.width);
    const lastId = layout.dockedIds[layout.dockedIds.length - 1];

    // Every rendered panel meets its minimum width — nothing collapses.
    for (const id of layout.dockedIds) {
      expect(layout.widths[id]).toBeGreaterThanOrEqual(
        PANEL_DOCK_MIN_PX[id as keyof typeof PANEL_DOCK_MIN_PX],
      );
    }

    // Rightmost panel is right-pinned (or within the viewport) — never off-screen.
    const lastRight = PANEL_EDGE_MARGIN + layout.offsets[lastId] + layout.widths[lastId];
    expect(lastRight).toBeLessThanOrEqual(viewportSizeMock.width - APP_CHROME_PX.edgeMargin + 1);

    // Each PanelShell rendered successfully.
    expect(container.querySelectorAll('[data-panel-shell="desktop"]').length).toBe(6);
  });

  it("snaps state height to the painted rect on drag-start so a stale defaultHeight cannot flash larger", () => {
    useDashboardStore.setState({ floatingObstacles: {}, panelScales: {}, panelPositions: {} });

    const { container } = render(
      <MantineProvider>
        <PanelShell id="wiki" title="Wiki" defaultHeight={965} onClose={jest.fn()}>
          <div>content</div>
        </PanelShell>
      </MantineProvider>,
    );

    const panel = container.querySelector('[data-panel-shell="desktop"]') as HTMLElement;
    expect(panel).toBeTruthy();
    // Initial state height seeds from defaultHeight.
    expect(panel.style.height).toBe("965px");

    // Simulate the CSS-clamped painted rect — the panel is visually 472px tall
    // because PanelShell's docked maxHeight reserves prompt space, even though
    // the state height (defaultHeight) is still the unclamped 965.
    jest.spyOn(panel, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 420,
      bottom: 472,
      width: 420,
      height: 472,
      toJSON: () => ({}),
    } as DOMRect);

    const dragHandle = panel.querySelector('[data-panel-drag-handle="true"]') as HTMLElement;
    expect(dragHandle).toBeTruthy();
    fireEvent.pointerDown(dragHandle);

    // After the pointer-down, the height state snaps to the painted value so
    // the docked→floating maxHeight branch change cannot expose the stale 965.
    expect(panel.style.height).toBe("472px");
  });

  it("disables content scaling for spatial panels", () => {
    const { container } = render(
      <MantineProvider>
        <PanelShell id="wiki-graph" title="Wiki Graph" contentScaleMode="none" onClose={jest.fn()}>
          <PanelBody>
            <div>content</div>
          </PanelBody>
        </PanelShell>
      </MantineProvider>,
    );

    const panel = container.querySelector(".absolute") as HTMLElement;

    expect(screen.queryByLabelText("Increase panel text size")).not.toBeInTheDocument();

    fireEvent.keyDown(panel, { key: "=", ctrlKey: true });

    expect(useDashboardStore.getState().panelScales["wiki-graph"]).toBeUndefined();
    expect(panel.style.getPropertyValue("--graph-panel-scale")).toBe("1");
  });
});
