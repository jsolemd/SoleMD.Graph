/**
 * @jest-environment jsdom
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { GraphBundle, GraphBundleQueries } from "@solemd/graph";
import type { GraphCanvasSource } from "@/features/graph/duckdb";
import { useDashboardStore } from "@/features/graph/stores";

jest.mock("../../explore/ConfigPanel", () => ({
  ConfigPanel: () => <div data-testid="config-panel" />,
}));
jest.mock("../../explore/FiltersPanel", () => ({
  FiltersPanel: () => <div data-testid="filters-panel" />,
}));
jest.mock("../../explore/info-panel", () => ({
  InfoPanel: () => <div data-testid="info-panel" />,
}));
jest.mock("../../explore/query-panel", () => ({
  QueryPanel: () => <div data-testid="query-panel" />,
}));
jest.mock("../../explore/data-table", () => ({
  DataTable: () => <div data-testid="data-table" />,
}));
jest.mock("../../panels/DetailPanel", () => ({
  DetailPanel: () => <div data-testid="detail-panel" />,
}));
jest.mock("../../panels/prompt/RagResponsePanel", () => ({
  RagResponsePanel: () => <div data-testid="rag-panel" />,
}));
jest.mock("../../panels/AboutPanel", () => ({
  AboutPanel: () => <div data-testid="about-panel" />,
}));
jest.mock("@/features/wiki/components/WikiPanel", () => ({
  WikiPanel: () => <div data-testid="wiki-panel" />,
}));
jest.mock("../../panels/PromptBox", () => ({
  PromptBox: () => <div data-testid="prompt-box" />,
}));

import { GraphPanelsLayer } from "../GraphPanelsLayer";
import { ShellVariantProvider } from "../ShellVariantContext";

const QUERIES_STUB = {
  runReadOnlyQuery: jest.fn(),
} as unknown as GraphBundleQueries;

const CANVAS_STUB = {
  overlayRevision: 0,
  overlayCount: 0,
  pointCounts: { corpus: 0, entities: 0, relations: 0 },
} as GraphCanvasSource;

const BUNDLE_STUB = { bundleChecksum: "test" } as GraphBundle;

async function renderLayer(variant: "desktop" | "mobile" = "desktop") {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <ShellVariantProvider value={variant}>
        <GraphPanelsLayer
          bundle={BUNDLE_STUB}
          queries={QUERIES_STUB}
          canvas={CANVAS_STUB}
        />
      </ShellVariantProvider>,
    );
  });
  // DetailPanel is always mounted when uiHidden is false; wait for the
  // first dynamic loader to flush so subsequent assertions see a
  // settled tree.
  await waitFor(() => {
    expect(result.container.querySelector("[data-testid]")).not.toBeNull();
  });
  return result;
}

describe("GraphPanelsLayer", () => {
  beforeEach(() => {
    useDashboardStore.setState(useDashboardStore.getInitialState());
  });

  it("mounts only DetailPanel + PromptBox when no panels are open", async () => {
    await renderLayer();

    expect(await screen.findByTestId("detail-panel")).toBeInTheDocument();
    expect(await screen.findByTestId("prompt-box")).toBeInTheDocument();
    expect(screen.queryByTestId("config-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("filters-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("info-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("wiki-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("query-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("about-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("data-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rag-panel")).not.toBeInTheDocument();
  });

  it.each(["config", "filters", "info", "query", "wiki", "about"] as const)(
    "renders %s panel when togglePanel marks it open",
    async (panel) => {
      await renderLayer();

      await act(async () => {
        useDashboardStore.getState().openPanel(panel);
      });

      expect(await screen.findByTestId(`${panel}-panel`)).toBeInTheDocument();
    },
  );

  it("renders DataTable when tableOpen is true", async () => {
    await renderLayer();

    await act(async () => {
      useDashboardStore.getState().setTableOpen(true);
    });

    expect(await screen.findByTestId("data-table")).toBeInTheDocument();
  });

  it("renders RagResponsePanel when ragPanelOpen is true", async () => {
    await renderLayer();

    await act(async () => {
      useDashboardStore.setState({ ragPanelOpen: true });
    });

    expect(await screen.findByTestId("rag-panel")).toBeInTheDocument();
  });

  it("hides every renderer-clean panel when uiHidden is true", async () => {
    useDashboardStore.getState().openPanel("config");
    useDashboardStore.getState().openPanel("wiki");
    useDashboardStore.getState().setTableOpen(true);
    useDashboardStore.setState({ ragPanelOpen: true });

    await renderLayer();

    // Wait for the initial dynamic loaders to settle so the absence of
    // the panels post-toggle isn't a race against the loader.
    await screen.findByTestId("config-panel");

    await act(async () => {
      useDashboardStore.getState().setUiHidden(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId("config-panel")).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId("wiki-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("data-table")).not.toBeInTheDocument();
    expect(screen.queryByTestId("rag-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("detail-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("prompt-box")).not.toBeInTheDocument();
  });

  it("suppresses opener panels when panelsVisible is false but keeps DetailPanel", async () => {
    await renderLayer();

    await act(async () => {
      useDashboardStore.getState().openPanel("config");
      useDashboardStore.getState().setPanelsVisible(false);
    });

    expect(screen.queryByTestId("config-panel")).not.toBeInTheDocument();
    expect(await screen.findByTestId("detail-panel")).toBeInTheDocument();
  });

  it("hides PromptBox on mobile when an overlay panel is open", async () => {
    await renderLayer("mobile");

    expect(await screen.findByTestId("prompt-box")).toBeInTheDocument();

    await act(async () => {
      useDashboardStore.getState().openOnlyPanel("wiki");
    });

    await waitFor(() => {
      expect(screen.queryByTestId("prompt-box")).not.toBeInTheDocument();
    });
  });

  it("keeps PromptBox visible on desktop when an overlay panel is open", async () => {
    await renderLayer("desktop");

    await act(async () => {
      useDashboardStore.getState().openOnlyPanel("wiki");
    });

    expect(await screen.findByTestId("prompt-box")).toBeInTheDocument();
  });
});
