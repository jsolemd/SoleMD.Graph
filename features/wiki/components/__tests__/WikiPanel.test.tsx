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

// Mock framer-motion
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

describe("WikiPanel", () => {
  it("renders a PanelShell with title Wiki", async () => {
    render(
      <MantineProvider>
        <WikiPanel bundle={mockBundle} />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("Wiki")).toBeInTheDocument();
    });
  });
});
