import { useWikiStore } from "../wiki-store";

jest.mock("@solemd/api-client/client/wiki-client", () => ({
  fetchWikiGraphClient: jest.fn(),
}));

describe("wiki-store graph fetch state", () => {
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
    jest.clearAllMocks();
  });

  it("stores an empty graph as successful data", async () => {
    const { fetchWikiGraphClient } = jest.requireMock("@solemd/api-client/client/wiki-client") as {
      fetchWikiGraphClient: jest.Mock;
    };
    fetchWikiGraphClient.mockResolvedValue({ nodes: [], edges: [], signature: "empty" });

    await useWikiStore.getState().fetchGraphData("release-a");

    expect(useWikiStore.getState().graphData).toEqual({
      nodes: [],
      edges: [],
      signature: "empty",
    });
    expect(useWikiStore.getState().graphError).toBeNull();
    expect(useWikiStore.getState().graphReleaseId).toBe("release-a");
  });

  it("preserves the real error when graph fetch fails", async () => {
    const { fetchWikiGraphClient } = jest.requireMock("@solemd/api-client/client/wiki-client") as {
      fetchWikiGraphClient: jest.Mock;
    };
    fetchWikiGraphClient.mockRejectedValue(
      new Error("Wiki graph endpoint is unavailable on the configured evidence engine."),
    );

    await useWikiStore.getState().fetchGraphData("release-a");

    expect(useWikiStore.getState().graphData).toBeNull();
    expect(useWikiStore.getState().graphError).toBe(
      "Wiki graph endpoint is unavailable on the configured evidence engine.",
    );
  });
});
