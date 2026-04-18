/**
 * @jest-environment jsdom
 */
import { renderHook, waitFor } from "@testing-library/react";

import { fetchWikiPageContextClient } from "@solemd/api-client/client/wiki-client";
import { useWikiPageContext } from "../use-wiki-page-context";

jest.mock("@solemd/api-client/client/wiki-client", () => ({
  fetchWikiPageContextClient: jest.fn(),
}));

const fetchWikiPageContextClientMock = jest.mocked(fetchWikiPageContextClient);

describe("useWikiPageContext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fetchWikiPageContextClientMock.mockResolvedValue({
      total_corpus_paper_count: 12,
      total_graph_paper_count: 5,
      top_graph_papers: [],
    });
  });

  it("prefetches context immediately for canonical entity slugs", async () => {
    const { result } = renderHook(() =>
      useWikiPageContext("entities/melatonin", null, "bundle-1"),
    );

    await waitFor(() =>
      expect(fetchWikiPageContextClientMock).toHaveBeenCalledWith(
        "entities/melatonin",
        "bundle-1",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.context?.total_corpus_paper_count).toBe(12);
    });
  });

  it("skips context fetch for non-entity slugs until the page kind says entity", async () => {
    renderHook(() =>
      useWikiPageContext("sections/core-biology", null, "bundle-1"),
    );

    await waitFor(() => {
      expect(fetchWikiPageContextClientMock).not.toHaveBeenCalled();
    });
  });
});
