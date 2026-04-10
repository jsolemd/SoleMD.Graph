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

import { FloatingPanelShell } from "../FloatingPanelShell";
import { useDashboardStore } from "@/features/graph/stores";

describe("FloatingPanelShell", () => {
  beforeEach(() => {
    // Reset store state
    useDashboardStore.setState({ floatingObstacles: {} });
  });

  it("renders chrome with title", () => {
    render(
      <MantineProvider>
        <FloatingPanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <div>content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );
    expect(screen.getByText("Wiki")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <MantineProvider>
        <FloatingPanelShell id="wiki" title="Wiki" onClose={jest.fn()}>
          <div data-testid="child">content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("calls onClose via Escape", () => {
    const onClose = jest.fn();
    render(
      <MantineProvider>
        <FloatingPanelShell id="wiki" title="Wiki" onClose={onClose}>
          <div>content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("clears floating obstacle on unmount", () => {
    const { unmount } = render(
      <MantineProvider>
        <FloatingPanelShell id="test-panel" title="Test" onClose={jest.fn()}>
          <div>content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );

    // Set an obstacle to verify it gets cleared
    useDashboardStore.getState().setFloatingObstacle("test-panel", { x: 0, y: 0, width: 100, height: 100 });
    expect(useDashboardStore.getState().floatingObstacles["test-panel"]).toBeDefined();

    unmount();
    expect(useDashboardStore.getState().floatingObstacles["test-panel"]).toBeUndefined();
  });

  it("selectLeftClearance returns 0 when panel has floating obstacle", () => {
    const { selectLeftClearance } = require("@/features/graph/stores/dashboard-store");
    const state = {
      ...useDashboardStore.getState(),
      activePanel: "wiki" as const,
      panelsVisible: true,
      floatingObstacles: { wiki: { x: 100, y: 100, width: 400, height: 600 } },
    };
    expect(selectLeftClearance(state)).toBe(0);
  });

  it("updates docked width when defaultWidth changes", () => {
    const { container, rerender } = render(
      <MantineProvider>
        <FloatingPanelShell id="wiki" title="Wiki" defaultWidth={420} onClose={jest.fn()}>
          <div>content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );

    const panel = container.querySelector(".absolute");
    expect(panel).toHaveStyle({ width: "420px" });

    rerender(
      <MantineProvider>
        <FloatingPanelShell id="wiki" title="Wiki" defaultWidth={600} onClose={jest.fn()}>
          <div>content</div>
        </FloatingPanelShell>
      </MantineProvider>,
    );

    expect(panel).toHaveStyle({ width: "600px" });
  });
});
