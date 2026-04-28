/**
 * @jest-environment jsdom
 */
import { act, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GraphBundle } from "@solemd/graph";

import { useDashboardStore } from "@/features/graph/stores";

const orbMock = jest.fn(() => <div data-testid="orb-surface" />);
const dashboardShellMock = jest.fn(({ children }: { children?: unknown }) => {
  void children;
  return <div data-testid="dashboard-shell" />;
});
const errorBoundaryMock = jest.fn(({ children }: { children?: unknown }) => (
  <div data-testid="error-boundary">{children as React.ReactNode}</div>
));

jest.mock("@/features/orb/surface/OrbSurface", () => ({
  OrbSurface: (props: unknown) => orbMock(props),
}));

// As of slice 7 the 2D branch mounts DashboardShell wrapped in
// GraphErrorBoundary, both imported from "@/features/graph". We mock
// the module-level entry point so the test asserts the actual
// surface that GraphSurfaceSwitch picks, not a symbolic name.
jest.mock("@/features/graph", () => ({
  DashboardShell: (props: unknown) => dashboardShellMock(props),
  GraphErrorBoundary: ({ children }: { children?: React.ReactNode }) =>
    errorBoundaryMock({ children }),
}));

import { GraphSurfaceSwitch } from "../GraphSurfaceSwitch";

const BUNDLE_STUB = {
  bundleChecksum: "test-bundle",
} as GraphBundle;

function setRendererMode(rendererMode: "2d" | "3d") {
  act(() => {
    useDashboardStore.setState({ rendererMode });
  });
}

describe("GraphSurfaceSwitch", () => {
  beforeEach(() => {
    orbMock.mockClear();
    dashboardShellMock.mockClear();
    errorBoundaryMock.mockClear();
    setRendererMode("3d");
  });

  afterEach(() => {
    setRendererMode("3d");
  });

  it("mounts OrbSurface (and not the 2D branch) when rendererMode is '3d'", () => {
    setRendererMode("3d");
    render(<GraphSurfaceSwitch bundle={BUNDLE_STUB} />);
    expect(screen.getByTestId("orb-surface")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-shell")).not.toBeInTheDocument();
    expect(orbMock).toHaveBeenCalledTimes(1);
    expect(dashboardShellMock).not.toHaveBeenCalled();
  });

  it("mounts DashboardShell wrapped in GraphErrorBoundary (and not OrbSurface) when rendererMode is '2d'", () => {
    setRendererMode("2d");
    render(<GraphSurfaceSwitch bundle={BUNDLE_STUB} />);
    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(screen.getByTestId("error-boundary")).toBeInTheDocument();
    expect(screen.queryByTestId("orb-surface")).not.toBeInTheDocument();
    expect(dashboardShellMock).toHaveBeenCalledTimes(1);
    expect(orbMock).not.toHaveBeenCalled();
  });

  it("does not bleed prop state across a 3d → 2d → 3d toggle", () => {
    render(<GraphSurfaceSwitch bundle={BUNDLE_STUB} />);
    expect(orbMock).toHaveBeenCalledTimes(1);
    expect(dashboardShellMock).not.toHaveBeenCalled();

    setRendererMode("2d");
    expect(screen.getByTestId("dashboard-shell")).toBeInTheDocument();
    expect(dashboardShellMock).toHaveBeenCalledTimes(1);
    // Orb mount count stays at 1 — no re-render of the 3d branch
    // while 2d is active.
    expect(orbMock).toHaveBeenCalledTimes(1);

    setRendererMode("3d");
    expect(screen.getByTestId("orb-surface")).toBeInTheDocument();
    expect(orbMock).toHaveBeenCalledTimes(2);
    // 2d branch did not render again on the flip back.
    expect(dashboardShellMock).toHaveBeenCalledTimes(1);
  });
});
