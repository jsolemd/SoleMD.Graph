/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

const mountWikiGraph = jest.fn().mockResolvedValue({
  destroy: jest.fn(),
  applyHighlight: jest.fn(),
});

jest.mock("@/features/wiki/graph-runtime", () => ({
  mountWikiGraph: (...args: unknown[]) => mountWikiGraph(...args),
  toSimNode: jest.fn((node: unknown) => node),
  toSimLink: jest.fn((link: unknown) => link),
}));

import { WikiGraph } from "../WikiGraph";

describe("WikiGraph", () => {
  beforeEach(() => {
    mountWikiGraph.mockClear();
    useWikiStore.getState().reset();
    useWikiStore.setState({
      graphData: {
        nodes: [
          {
            id: "page:index",
            kind: "page",
            label: "Index",
            slug: "index",
            paper_id: null,
            concept_id: null,
            entity_type: null,
            semantic_group: null,
            tags: [],
            year: null,
            venue: null,
          },
        ],
        edges: [],
        signature: "wiki-graph-test",
      },
      graphHighlightGroups: null,
      graphSearchQuery: "",
    });
  });

  it("renders a fill container for embedded panel layouts", async () => {
    render(
      <div className="relative h-[480px] w-[640px]">
        <WikiGraph intents={{ onOpenPage: jest.fn() }} />
      </div>,
    );

    const graphRoot = screen.getByTestId("wiki-graph-canvas-root");
    expect(graphRoot).toHaveClass("absolute", "inset-0", "overflow-hidden");
    expect(graphRoot).not.toHaveStyle({ minHeight: "300px" });

    await waitFor(() => {
      expect(mountWikiGraph).toHaveBeenCalledWith(
        expect.objectContaining({ container: graphRoot }),
      );
    });
  });
});
