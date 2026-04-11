/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";

// Mock framer-motion
jest.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      style,
      className,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div style={style as React.CSSProperties} className={className as string}>
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
}));

// Mock lib/motion
jest.mock("@/lib/motion", () => ({
  panelReveal: {
    left: { initial: {}, animate: {}, exit: {}, transition: {}, style: {} },
    right: { initial: {}, animate: {}, exit: {}, transition: {}, style: {} },
  },
  smooth: {},
}));

import { PanelShell } from "../PanelShell";
import { useDashboardStore } from "@/features/graph/stores";

describe("PanelShell", () => {
  beforeEach(() => {
    useDashboardStore.setState({ floatingObstacles: {} });
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
});
