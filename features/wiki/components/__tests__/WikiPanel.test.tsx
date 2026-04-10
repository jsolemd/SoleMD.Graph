/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";

// Polyfill ResizeObserver for jsdom (PanelShell uses it)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
});

// Mock server actions
jest.mock("@/app/actions/wiki", () => ({
  getWikiPage: jest.fn().mockResolvedValue(null),
  getWikiPages: jest.fn().mockResolvedValue([]),
  searchWikiPages: jest.fn().mockResolvedValue({ hits: [], total: 0 }),
  getWikiBacklinks: jest.fn().mockResolvedValue({ slug: "", backlinks: [] }),
}));

// Mock the markdown renderer (depends on ESM-only react-markdown/remark-gfm/rehype-slug)
jest.mock("@/features/wiki/components/WikiMarkdownRenderer", () => ({
  WikiMarkdownRenderer: ({ contentMd }: { contentMd: string }) => (
    <div data-testid="wiki-markdown">{contentMd.slice(0, 50)}</div>
  ),
}));

// Mock the graph sync hook (depends on cosmograph)
jest.mock("@/features/wiki/hooks/use-wiki-graph-sync", () => ({
  useWikiGraphSync: () => ({ onPaperClick: jest.fn() }),
}));

// Mock framer-motion (FloatingPanelShell uses drag controls + motion values)
jest.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...rest}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useDragControls: () => ({ start: jest.fn() }),
  useMotionValue: (v: number) => ({ get: () => v, set: jest.fn() }),
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

import { WikiPanel } from "../WikiPanel";

const mockBundle = {
  assetBaseUrl: "http://localhost:3000",
  bundleBytes: 0,
  bundleChecksum: "test-checksum",
  bundleFormat: "parquet",
  bundleManifest: { graphRunId: "run-1" },
  bundleUri: "test-uri",
  bundleVersion: "1",
  graphName: "living_graph",
  manifestUrl: "test-manifest",
  nodeKind: "corpus",
  qaSummary: null,
  runId: "run-1",
  tableUrls: {},
} as unknown as Parameters<typeof WikiPanel>[0]["bundle"];

const mockQueries = {
  ensureGraphPaperRefsAvailable: jest.fn().mockResolvedValue({
    activeGraphPaperRefs: [],
    universePointIdsByGraphPaperRef: {},
    unresolvedGraphPaperRefs: [],
  }),
  getPaperNodesByGraphPaperRefs: jest.fn().mockResolvedValue({}),
  setOverlayProducerPointIds: jest.fn().mockResolvedValue({ overlayCount: 0 }),
  clearOverlayProducer: jest.fn().mockResolvedValue({ overlayCount: 0 }),
} as unknown as Parameters<typeof WikiPanel>[0]["queries"];

describe("WikiPanel", () => {
  it("renders a PanelShell with title Wiki", async () => {
    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Wiki")).toBeInTheDocument();
    });
  });

  it("renders search icon in header", async () => {
    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Search wiki")).toBeInTheDocument();
    });
  });

  it("renders navigation buttons when page loads", async () => {
    const { getWikiPage } = require("@/app/actions/wiki");
    getWikiPage.mockResolvedValue({
      slug: "entities/melatonin",
      title: "Melatonin",
      content_md: "# Melatonin",
      frontmatter: {},
      entity_type: null,
      concept_id: null,
      family_key: null,
      tags: [],
      outgoing_links: [],
      paper_pmids: [],
      paper_graph_refs: {},
      resolved_links: {},
    });

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Go back")).toBeInTheDocument();
      expect(screen.getByLabelText("Go forward")).toBeInTheDocument();
    });
  });
});
