/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

jest.mock("@/features/wiki/components/WikiGraph", () => ({
  WikiGraph: () => <div data-testid="wiki-graph" />,
}));

import { WikiGraphView } from "../WikiGraphView";

describe("WikiGraphView", () => {
  beforeEach(() => {
    useWikiStore.setState({
      currentRoute: { kind: "graph" },
      routeHistory: [{ kind: "graph" }],
      historyIndex: 0,
      graphData: null,
      graphReleaseId: null,
      graphLoading: false,
      graphError: null,
    });
  });

  it("shows the real graph error and offers retry instead of empty state", async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    useWikiStore.setState({
      graphError: "Wiki graph endpoint is unavailable on the configured evidence engine.",
      fetchGraphData: retry,
    });

    render(
      <MantineProvider>
        <WikiGraphView
          graphReleaseId="release-a"
          onOpenPage={jest.fn()}
        />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Wiki graph endpoint is unavailable on the configured evidence engine."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("No wiki pages found.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledWith("release-a", { force: true });
  });

  it("renders a dedicated graph surface when graph data is available", () => {
    useWikiStore.setState({
      graphData: {
        nodes: [{
          id: "page:index",
          kind: "page",
          label: "Index",
          slug: "index",
          paper_id: null,
          concept_id: null,
          entity_type: null,
          tags: [],
          year: null,
          venue: null,
        }],
        edges: [],
        signature: "test",
      },
    });

    render(
      <MantineProvider>
        <WikiGraphView
          graphReleaseId="release-a"
          onOpenPage={jest.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getByTestId("wiki-graph-surface")).toBeInTheDocument();
    expect(screen.getByTestId("wiki-graph")).toBeInTheDocument();
  });
});
