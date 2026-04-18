/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Providers } from "@/app/providers";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";

jest.mock("@/features/animations/canvas/connectome-loader/ConnectomeLoader", () => ({
  __esModule: true,
  default: ({ paused = false }: { paused?: boolean }) => (
    <div data-testid="connectome-loader" data-paused={String(paused)} />
  ),
}));

jest.mock("@/features/animations/lottie/LottiePulseLoader", () => ({
  LottiePulseLoader: () => <div data-testid="lottie-loader" />,
}));

jest.mock("@/features/graph/components/panels/AboutPanel", () => ({
  AboutPanel: () => <div data-testid="about-panel">About</div>,
}));

import { GraphLoadingExperience } from "../GraphLoadingExperience";

describe("GraphLoadingExperience", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
    useGraphStore.setState(useGraphStore.getInitialState());
  });

  it("opens the about panel from the loading chrome", () => {
    render(
      <Providers>
        <GraphLoadingExperience />
      </Providers>,
    );

    fireEvent.click(screen.getByRole("button", { name: "About SoleMD" }));

    expect(useDashboardStore.getState().openPanels.about).toBe(true);
    expect(screen.getByTestId("about-panel")).toBeInTheDocument();
  });

  it("suspends the interactive backdrop once the canvas is ready", () => {
    render(
      <Providers>
        <GraphLoadingExperience canvasReady />
      </Providers>,
    );

    expect(screen.getByTestId("connectome-loader")).toHaveAttribute(
      "data-paused",
      "true",
    );
    expect(screen.queryByTestId("loading-constellations")).not.toBeInTheDocument();
    expect(screen.getByText("Finalizing graph rendering")).toBeInTheDocument();
  });
});
