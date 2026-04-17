/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MantineProvider } from "@mantine/core";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";

// Polyfill ResizeObserver for jsdom (PanelShell uses it)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  global.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  global.IntersectionObserver = IntersectionObserverMock as typeof IntersectionObserver;
});

// Mock wiki client boundary
jest.mock("@/features/wiki/lib/wiki-client", () => ({
  fetchWikiPageClient: jest.fn().mockResolvedValue(null),
  fetchWikiPageContextClient: jest.fn().mockResolvedValue(null),
  fetchWikiBacklinksClient: jest
    .fn()
    .mockResolvedValue({ slug: "", backlinks: [] }),
  searchWikiPagesClient: jest.fn().mockResolvedValue({ hits: [], total: 0 }),
  fetchWikiGraphClient: jest
    .fn()
    .mockResolvedValue({ nodes: [], edges: [], signature: "" }),
}));

// Mock the markdown renderer (depends on ESM-only react-markdown/remark-gfm/rehype-slug)
jest.mock("@/features/wiki/components/WikiMarkdownRenderer", () => ({
  WikiMarkdownRenderer: ({ contentMd }: { contentMd: string }) => (
    <div data-testid="wiki-markdown">{contentMd.slice(0, 50)}</div>
  ),
}));

// Mock the graph sync hook (depends on cosmograph)
jest.mock("@/features/wiki/hooks/use-wiki-graph-sync", () => ({
  useWikiGraphSync: () => ({
    onPaperClick: jest.fn(),
    showPageOnGraph: jest.fn().mockResolvedValue(undefined),
    clearPageGraph: jest.fn(),
    canShowPageOnGraph: false,
  }),
}));

jest.mock("@/features/animations/lottie/LottiePulseLoader", () => ({
  LottiePulseLoader: ({ size = 10 }: { size?: number }) => (
    <span data-testid="panel-inline-loader" style={{ width: size, height: size }} />
  ),
}));

jest.mock("@/features/animations/lottie/SearchToggleLottie", () => ({
  SearchToggleLottie: ({ mode }: { mode: string }) => (
    <span data-testid={`search-toggle-${mode}`} />
  ),
}));

// Mock the wiki graph runtime (depends on pixi.js + canvas)
jest.mock("@/features/wiki/graph-runtime", () => ({
  mountWikiGraph: jest.fn().mockResolvedValue({ destroy: jest.fn() }),
  toSimNode: jest.fn((n: Record<string, unknown>) => n),
  toSimLink: jest.fn((e: Record<string, unknown>) => e),
}));

// Mock framer-motion (FloatingPanelShell uses drag controls + motion values)
jest.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => {
      delete rest.drag;
      delete rest.dragControls;
      delete rest.dragListener;
      delete rest.dragMomentum;
      delete rest.dragElastic;
      return <div {...rest}>{children}</div>;
    },
    span: ({
      children,
      ...rest
    }: React.PropsWithChildren<Record<string, unknown>>) => <span {...rest}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
  useDragControls: () => ({ start: jest.fn() }),
  useMotionValue: (v: number) => ({ get: () => v, set: jest.fn() }),
  useReducedMotionConfig: jest.fn(() => true),
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
  assetBaseUrl: "http://127.0.0.1:3000",
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
  beforeEach(() => {
    useWikiStore.getState().reset();
  });

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

  it("defaults to graph home route", () => {
    expect(useWikiStore.getState().currentRoute).toEqual({ kind: "graph" });
  });

  it("shows graph home controls by default", async () => {
    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Graph home")).toBeInTheDocument();
    });
  });

  it("mounts a single wiki graph surface when the global graph overlay is open", async () => {
    useWikiStore.setState({
      globalGraphOpen: true,
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
        signature: "wiki-graph-overlay",
      },
    });

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("wiki-graph-surface")).toHaveLength(1);
    });
  });

  it("shows page view when route is page", async () => {
    useWikiStore.getState().navigateToPage("entities/melatonin");

    const { fetchWikiPageClient } = require("@/features/wiki/lib/wiki-client");
    fetchWikiPageClient.mockResolvedValue({
      slug: "entities/melatonin",
      title: "Melatonin",
      content_md: "# Melatonin",
      frontmatter: {},
      entity_type: null,
      concept_id: null,
      family_key: null,
      page_kind: "entity",
      section_slug: null,
      graph_focus: "none",
      summary: "A neurohormone.",
      tags: [],
      outgoing_links: [],
      paper_pmids: [],
      featured_pmids: [],
      paper_graph_refs: {},
      featured_graph_refs: {},
      resolved_links: {},
      linked_entities: {},
    });

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Melatonin")).toBeInTheDocument();
    });
  });

  it("renders the wiki page shell while backend context is still loading", async () => {
    useWikiStore.getState().navigateToPage("entities/melatonin");

    const {
      fetchWikiPageClient,
      fetchWikiPageContextClient,
    } = require("@/features/wiki/lib/wiki-client");
    fetchWikiPageClient.mockResolvedValue({
      slug: "entities/melatonin",
      title: "Melatonin",
      content_md: "# Melatonin",
      frontmatter: {},
      entity_type: "Chemical",
      concept_id: "MESH:D008550",
      family_key: null,
      page_kind: "entity",
      section_slug: null,
      graph_focus: "cited_papers",
      summary: "A neurohormone.",
      tags: [],
      outgoing_links: [],
      paper_pmids: [28847293],
      featured_pmids: [],
      paper_graph_refs: { 28847293: "corpus:12345" },
      featured_graph_refs: {},
      resolved_links: {},
      linked_entities: {},
    });
    fetchWikiPageContextClient.mockImplementation(
      () => new Promise(() => undefined),
    );

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Melatonin")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/1 evidence/),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId("wiki-markdown")).toBeInTheDocument();
  });

  it("keeps the local graph mounted below the pinned page header and avoids duplicate top-paper sections", async () => {
    useWikiStore.getState().navigateToPage("entities/melatonin");
    useWikiStore.setState({
      graphData: {
        nodes: [
          {
            id: "page:entities/melatonin",
            kind: "page",
            label: "Melatonin",
            slug: "entities/melatonin",
            paper_id: null,
            concept_id: "MESH:D008550",
            entity_type: "Chemical",
            semantic_group: "chemicals",
            tags: [],
            year: null,
            venue: null,
          },
          {
            id: "page:entities/circadian-rhythm",
            kind: "page",
            label: "Circadian rhythm",
            slug: "entities/circadian-rhythm",
            paper_id: null,
            concept_id: "MESH:D002965",
            entity_type: "Phenomenon",
            semantic_group: "physiology",
            tags: [],
            year: null,
            venue: null,
          },
        ],
        edges: [
          {
            source: "page:entities/melatonin",
            target: "page:entities/circadian-rhythm",
            kind: "wikilink",
          },
        ],
        signature: "test-local-graph",
      },
    });

    const {
      fetchWikiPageClient,
      fetchWikiPageContextClient,
    } = require("@/features/wiki/lib/wiki-client");
    fetchWikiPageClient.mockResolvedValue({
      slug: "entities/melatonin",
      title: "Melatonin",
      content_md: "# Melatonin",
      frontmatter: {},
      entity_type: "Chemical",
      concept_id: "MESH:D008550",
      family_key: null,
      page_kind: "entity",
      section_slug: null,
      graph_focus: "cited_papers",
      summary: "A neurohormone.",
      tags: [],
      outgoing_links: ["entities/circadian-rhythm"],
      paper_pmids: [28847293],
      featured_pmids: [],
      paper_graph_refs: { 28847293: "corpus:12345" },
      featured_graph_refs: {},
      resolved_links: {},
      linked_entities: {},
    });
    fetchWikiPageContextClient.mockResolvedValue({
      total_corpus_paper_count: 18,
      total_graph_paper_count: 6,
      top_graph_papers: [
        {
          pmid: 28847293,
          title: "Melatonin and circadian timing",
          year: 2023,
          venue: "Chronobiology International",
          citation_count: 42,
          graph_paper_ref: "corpus:12345",
        },
      ],
    });

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Melatonin")).toBeInTheDocument();
    });

    expect(screen.getByTestId("wiki-local-graph")).toBeInTheDocument();
    expect(screen.getAllByText("Top graph papers")).toHaveLength(1);
  });

  it("renders the global graph inside a panel shell with a close button", async () => {
    useWikiStore.setState({
      globalGraphOpen: true,
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
        signature: "test",
      },
    });

    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} queries={mockQueries} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Close graph")).toBeInTheDocument();
      expect(screen.getAllByTestId("wiki-graph-surface")).toHaveLength(1);
    });
  });

  it("reset returns to graph home", () => {
    useWikiStore.getState().navigateToPage("page-a");
    useWikiStore.getState().reset();
    expect(useWikiStore.getState().currentRoute).toEqual({ kind: "graph" });
  });
});
