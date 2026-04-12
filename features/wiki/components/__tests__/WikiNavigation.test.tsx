/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { WIKI_PANEL_PX } from "@/lib/density";
import { PANEL_TOP } from "@/features/graph/components/panels/PanelShell";
import { useDashboardStore } from "@/features/graph/stores";
import { resolveAdjacentFloatingPanelOffsets } from "@/features/graph/stores/dashboard-store";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

// Mock framer-motion (used by Mantine Tooltip)
jest.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...rest }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

import { WikiContextActions, WikiNavigation } from "../WikiNavigation";

function renderNav() {
  return render(
    <MantineProvider>
      <WikiNavigation />
    </MantineProvider>,
  );
}

function renderContextActions() {
  return render(
    <MantineProvider>
      <WikiContextActions />
    </MantineProvider>,
  );
}

describe("WikiNavigation", () => {
  beforeEach(() => {
    useWikiStore.getState().reset();
    useDashboardStore.setState({
      openPanels: { about: false, config: false, filters: false, info: false, query: false, wiki: true },
      panelsVisible: true,
      panelPositions: {},
      floatingObstacles: {},
    });
  });

  it("disables back and forward buttons when on graph home", () => {
    renderNav();
    expect(screen.getByLabelText("Go back")).toBeDisabled();
    expect(screen.getByLabelText("Go forward")).toBeDisabled();
  });

  it("disables graph home button when already on graph", () => {
    renderNav();
    expect(screen.getByLabelText("Graph home")).toBeDisabled();
  });

  it("enables back and graph home after navigating to a page", () => {
    useWikiStore.getState().navigateToPage("page-a");
    renderNav();
    expect(screen.getByLabelText("Go back")).not.toBeDisabled();
    expect(screen.getByLabelText("Go forward")).toBeDisabled();
    expect(screen.getByLabelText("Graph home")).not.toBeDisabled();
  });

  it("enables forward after going back", () => {
    const { navigateToPage, goBack } = useWikiStore.getState();
    navigateToPage("page-a");
    navigateToPage("page-b");
    goBack();
    renderNav();
    expect(screen.getByLabelText("Go back")).not.toBeDisabled();
    expect(screen.getByLabelText("Go forward")).not.toBeDisabled();
  });

  it("navigateToPage is idempotent for current slug", () => {
    const { navigateToPage } = useWikiStore.getState();
    navigateToPage("page-a");
    navigateToPage("page-a"); // no-op
    expect(useWikiStore.getState().routeHistory).toHaveLength(2); // graph + page-a
    expect(useWikiStore.getState().historyIndex).toBe(1);
  });

  it("navigateToGraph is idempotent when on graph", () => {
    useWikiStore.getState().navigateToGraph();
    expect(useWikiStore.getState().routeHistory).toHaveLength(1);
    expect(useWikiStore.getState().historyIndex).toBe(0);
  });

  it("reset returns to graph home and clears history", () => {
    const { navigateToPage, reset } = useWikiStore.getState();
    navigateToPage("page-a");
    navigateToPage("page-b");
    reset();
    const state = useWikiStore.getState();
    expect(state.currentRoute).toEqual({ kind: "graph" });
    expect(state.routeHistory).toEqual([{ kind: "graph" }]);
    expect(state.historyIndex).toBe(0);
  });

  it("opens the graph popout beside the floating wiki panel", () => {
    useWikiStore.getState().navigateToPage("page-a");
    useDashboardStore.getState().setFloatingObstacle("wiki", {
      x: 200,
      y: 180,
      width: 520,
      height: 620,
    });
    const expectedOffsets = resolveAdjacentFloatingPanelOffsets({
      state: useDashboardStore.getState(),
      panelId: "wiki-graph",
      anchorRect: { left: 200, top: 180, width: 520 },
      panelWidth: WIKI_PANEL_PX.localGraphWidth,
      panelTop: PANEL_TOP,
      viewportWidth: window.innerWidth,
    });

    renderContextActions();
    fireEvent.click(screen.getByLabelText("Pop out graph"));

    expect(useWikiStore.getState().localGraphPopped).toBe(true);
    expect(useDashboardStore.getState().panelPositions["wiki-graph"]).toMatchObject({
      ...expectedOffsets,
      width: WIKI_PANEL_PX.localGraphWidth,
      docked: false,
    });
  });
});
