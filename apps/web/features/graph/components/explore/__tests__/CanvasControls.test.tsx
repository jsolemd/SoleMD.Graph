/**
 * @jest-environment jsdom
 */
import type { ForwardedRef, PropsWithChildren, ReactNode } from "react";
import { render, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { ShellVariantProvider } from "../../shell/ShellVariantContext";

const mockClearSelections = jest.fn();

jest.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>
        {children}
      </div>
    ),
  },
}));

jest.mock("@/features/graph/cosmograph", () => {
  const React = require("react");
  const { forwardRef, useImperativeHandle } = React;

  const SelectionToolbar = forwardRef(function MockSelectionToolbar(
    _props: Record<string, unknown>,
    ref: ForwardedRef<{ clearSelections: () => void }>,
  ) {
    useImperativeHandle(ref, () => ({ clearSelections: mockClearSelections }));
    return <div data-testid="selection-toolbar">SelectionToolbar</div>;
  });

  return {
    SelectionToolbar,
    useGraphSelection: () => ({
      clearFocusedPoint: jest.fn(),
      getPointsSelection: () => null,
      getSelectedPointIndices: () => [],
    }),
  };
});

jest.mock("@/features/graph/lib/cosmograph-selection", () => ({
  buildActivePointSelectionScopeSql: () => null,
  buildCurrentPointScopeSql: () => null,
}));

import { CanvasControls } from "../CanvasControls";

function addPortalTarget() {
  const target = document.createElement("div");
  target.setAttribute("data-chrome-selection-portal", "");
  document.body.appendChild(target);
  return target;
}

function renderControls(variant: "desktop" | "mobile") {
  const queries = {
    setSelectedPointScopeSql: jest.fn(),
  } as any;

  return render(
    <MantineProvider>
      <ShellVariantProvider value={variant}>
        <CanvasControls queries={queries} />
      </ShellVariantProvider>
    </MantineProvider>,
  );
}

describe("CanvasControls portal target", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useGraphStore.setState(useGraphStore.getInitialState());
    document.body.innerHTML = "";
  });

  it("reattaches to a replaced desktop chrome host", async () => {
    const firstTarget = addPortalTarget();
    renderControls("desktop");

    await waitFor(() => {
      expect(within(firstTarget).getByTestId("selection-toolbar")).toBeInTheDocument();
    });

    firstTarget.remove();
    const secondTarget = addPortalTarget();

    await waitFor(() => {
      expect(within(secondTarget).getByTestId("selection-toolbar")).toBeInTheDocument();
    });
  });

  it("reattaches when the mobile tray host closes and opens again", async () => {
    const firstTarget = addPortalTarget();
    renderControls("mobile");

    await waitFor(() => {
      expect(within(firstTarget).getByTestId("selection-toolbar")).toBeInTheDocument();
    });

    firstTarget.remove();
    const secondTarget = addPortalTarget();

    await waitFor(() => {
      expect(within(secondTarget).getByTestId("selection-toolbar")).toBeInTheDocument();
    });
  });
});
