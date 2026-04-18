/**
 * @jest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { fetchGraphRagQuery } from "@/features/graph/lib/detail-service";
import { useReferenceMentionSource } from "../use-reference-mention-source";

jest.mock("@/features/graph/lib/detail-service", () => ({
  fetchGraphRagQuery: jest.fn(),
}));

const mockedFetchGraphRagQuery =
  fetchGraphRagQuery as jest.MockedFunction<typeof fetchGraphRagQuery>;

describe("useReferenceMentionSource", () => {
  beforeEach(() => {
    mockedFetchGraphRagQuery.mockReset();
  });

  it("derives supported-paper suggestions from local context and caches identical requests", async () => {
    mockedFetchGraphRagQuery.mockResolvedValue({
      evidence_bundles: [
        {
          corpus_id: 128,
          graph_paper_ref: "paper:128",
          paper_id: "S2-128",
          paper: {
            title: "Dopamine Signaling and Psychosis",
            year: 2024,
            journal_name: "Neurobiology Today",
          },
          score: 0.92,
          snippet: "Supportive cohort evidence connected dopamine signaling to psychosis risk.",
        },
      ],
    } as never);

    const paragraphText = [
      "Dopamine dysregulation may contribute to psychosis.",
      "The effect appears stronger in high-risk cohorts.",
      "Cortical dopamine signaling appears elevated in first-episode psychosis @dop",
    ].join(" ");

    const editor = {
      state: {
        selection: {
          $from: {
            parent: { textContent: paragraphText },
            parentOffset: paragraphText.length,
          },
        },
      },
      getText: () => paragraphText,
    } as never;

    const { result } = renderHook(() =>
      useReferenceMentionSource({
        bundle: {
          bundleChecksum: "bundle-checksum",
          runId: "run-id",
        } as never,
        queries: null,
        selectedNode: null,
        currentPointScopeSql: null,
        selectionScopeEnabled: false,
      }),
    );

    const firstItems = await result.current.getItems({
      query: "dop",
      editor,
    });
    const secondItems = await result.current.getItems({
      query: "dop",
      editor,
    });

    expect(mockedFetchGraphRagQuery).toHaveBeenCalledTimes(1);
    expect(mockedFetchGraphRagQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining(
          "The effect appears stronger in high-risk cohorts. Cortical dopamine signaling appears elevated in first-episode psychosis",
        ),
        evidenceIntent: "support",
        generateAnswer: false,
      }),
    );
    expect(mockedFetchGraphRagQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.stringContaining("Reference hint: dop"),
      }),
    );
    expect(firstItems).toEqual(secondItems);
    expect(firstItems).toEqual([
      {
        corpusId: 128,
        graphPaperRef: "paper:128",
        paperId: "S2-128",
        title: "Dopamine Signaling and Psychosis",
        year: 2024,
        journalName: "Neurobiology Today",
        snippet:
          "Supportive cohort evidence connected dopamine signaling to psychosis risk.",
        score: 0.92,
      },
    ]);
  });
});
