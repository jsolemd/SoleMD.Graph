/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { useGraphBundle } from "../use-graph-bundle";
import type { GraphBundle } from "@/features/graph/types";

const invalidateGraphBundleSessionCache = jest.fn();
const loadGraphBundle = jest.fn(() => new Promise(() => {}));
const registerGraphPaperAttachmentProvider = jest.fn();
const subscribeToGraphBundleProgress = jest.fn(() => () => {});
const setAvailableLayers = jest.fn();

jest.mock("@/features/graph/duckdb", () => ({
  invalidateGraphBundleSessionCache: (...args: unknown[]) =>
    invalidateGraphBundleSessionCache(...args),
  loadGraphBundle: (...args: unknown[]) => loadGraphBundle(...args),
  registerGraphPaperAttachmentProvider: (...args: unknown[]) =>
    registerGraphPaperAttachmentProvider(...args),
  subscribeToGraphBundleProgress: (...args: unknown[]) =>
    subscribeToGraphBundleProgress(...args),
}));

jest.mock("@/features/graph/duckdb/remote-attachment", () => ({
  remoteGraphPaperAttachmentProvider: { id: "remote-attachment-provider" },
}));

jest.mock("@/features/graph/stores", () => ({
  useDashboardStore: {
    getState: () => ({
      setAvailableLayers,
    }),
  },
}));

const BASE_BUNDLE: GraphBundle = {
  assetBaseUrl: "/api/graph-bundles/bundle-a",
  bundleBytes: 1024,
  bundleChecksum: "bundle-a",
  bundleFormat: "duckdb",
  bundleManifest: {
    artifacts: {
      files: {
        base_clusters: {
          content_type: "application/octet-stream",
          path: "base_clusters.parquet",
          size_bytes: 512,
          sha256: "clusters",
        },
        base_points: {
          content_type: "application/octet-stream",
          path: "base_points.parquet",
          size_bytes: 512,
          sha256: "points",
        },
      },
      tables: {},
    },
    bundle_checksum: "bundle-a",
    bundle_version: "1",
    generated_at: "2026-04-09T00:00:00Z",
    graph_name: "solemd.graph",
    node_kind: "paper",
    profile: "base",
    run_id: "run-a",
  },
  bundleUri: "bundle://bundle-a",
  bundleVersion: "1",
  graphName: "solemd.graph",
  manifestUrl: "/api/graph-bundles/bundle-a/manifest.json",
  nodeKind: "paper",
  qaSummary: null,
  runId: "run-a",
  tableUrls: {},
};

describe("useGraphBundle", () => {
  beforeEach(() => {
    invalidateGraphBundleSessionCache.mockReset();
    loadGraphBundle.mockClear();
    registerGraphPaperAttachmentProvider.mockReset();
    subscribeToGraphBundleProgress.mockReset();
    subscribeToGraphBundleProgress.mockReturnValue(() => {});
    setAvailableLayers.mockReset();
  });

  it("reuses the active bundle session across same-checksum rerenders", () => {
    const { rerender } = renderHook(({ bundle }) => useGraphBundle(bundle), {
      initialProps: { bundle: BASE_BUNDLE },
    });

    rerender({
      bundle: {
        ...BASE_BUNDLE,
      },
    });

    expect(loadGraphBundle).toHaveBeenCalledTimes(1);
    expect(invalidateGraphBundleSessionCache).not.toHaveBeenCalled();
  });

  it("invalidates the previous session only when switching bundle checksums", () => {
    const { rerender } = renderHook(({ bundle }) => useGraphBundle(bundle), {
      initialProps: { bundle: BASE_BUNDLE },
    });

    rerender({
      bundle: {
        ...BASE_BUNDLE,
        bundleChecksum: "bundle-b",
        runId: "run-b",
      },
    });

    expect(invalidateGraphBundleSessionCache).toHaveBeenCalledTimes(1);
    expect(invalidateGraphBundleSessionCache).toHaveBeenCalledWith("bundle-a");
    expect(loadGraphBundle).toHaveBeenCalledTimes(2);
  });
});
