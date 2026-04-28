/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";

import { useDashboardStore } from "@/features/graph/stores";
import { OrbChromeBar } from "../OrbChromeBar";

jest.mock("@/features/graph/components/chrome/ThemeToggle", () => ({
  __esModule: true,
  default: () => <button type="button">Theme</button>,
}));

jest.mock("@/features/graph/components/chrome/RendererToggleButton", () => ({
  RendererToggleButton: () => <button type="button">2D</button>,
}));

jest.mock("../MotionControlPanel", () => ({
  MotionControlPanel: () => <button type="button">Controls</button>,
}));

jest.mock("../../stores/snapshot-store", () => ({
  useOrbSnapshotStore: (selector: (state: { handle: null }) => unknown) =>
    selector({ handle: null }),
}));

function renderBar() {
  return render(
    <MantineProvider>
      <OrbChromeBar />
    </MantineProvider>,
  );
}

describe("OrbChromeBar", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("shows a disabled lock control until a 3D selection scope exists", () => {
    renderBar();

    expect(screen.getByLabelText("Lock selection")).toBeDisabled();
  });

  it("locks and unlocks the current 3D selection scope", () => {
    useDashboardStore.setState({
      currentPointScopeSql: "index IN (SELECT index FROM selected_point_indices)",
      selectedPointCount: 2,
      selectionLocked: false,
    });

    renderBar();

    fireEvent.click(screen.getByLabelText("Lock selection"));
    expect(useDashboardStore.getState().selectionLocked).toBe(true);

    fireEvent.click(screen.getByLabelText("Unlock selection"));
    expect(useDashboardStore.getState().selectionLocked).toBe(false);
  });
});
