/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  fetchGraphEntityDetail,
  fetchGraphEntityMatches,
} from "@/features/graph/lib/entity-service";
import { useEditorEntityRuntime } from "../use-editor-entity-runtime";

jest.mock("@/features/graph/lib/entity-service", () => ({
  fetchGraphEntityMatches: jest.fn(),
  fetchGraphEntityDetail: jest.fn(),
}));

const mockedFetchGraphEntityMatches =
  fetchGraphEntityMatches as jest.MockedFunction<typeof fetchGraphEntityMatches>;
const mockedFetchGraphEntityDetail =
  fetchGraphEntityDetail as jest.MockedFunction<typeof fetchGraphEntityDetail>;

describe("useEditorEntityRuntime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedFetchGraphEntityMatches.mockReset();
    mockedFetchGraphEntityDetail.mockReset();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("matches canonical entities in the active text block and resolves hover detail", async () => {
    mockedFetchGraphEntityMatches.mockResolvedValue({
      matches: [
        {
          matchId: "disease:MESH:D012559:38:52",
          entityType: "disease",
          conceptNamespace: "mesh",
          conceptId: "D012559",
          sourceIdentifier: "MESH:D012559",
          canonicalName: "Schizophrenia",
          matchedText: "schizophrenia",
          aliasText: "schizophrenia",
          aliasSource: "canonical_name",
          isCanonical: true,
          paperCount: 1200,
          startOffset: 38,
          endOffset: 52,
          score: 1,
        },
      ],
    });
    mockedFetchGraphEntityDetail.mockResolvedValue({
      entityType: "disease",
      conceptNamespace: "mesh",
      conceptId: "D012559",
      sourceIdentifier: "MESH:D012559",
      canonicalName: "Schizophrenia",
      aliases: [
        {
          aliasText: "Schizophrenia",
          isCanonical: true,
          aliasSource: "canonical_name",
        },
        {
          aliasText: "schizophrenia spectrum disorder",
          isCanonical: false,
          aliasSource: "synonym",
        },
      ],
      paperCount: 1200,
      summary: null,
    });

    const { result } = renderHook(() =>
      useEditorEntityRuntime({
        enabled: true,
      }),
    );

    act(() => {
      result.current.handleTextContextChange({
        text: "Dopamine dysfunction is implicated in schizophrenia.",
        textFrom: 5,
        cursorOffset: 52,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.entityHighlights).toHaveLength(1);
    });

    expect(result.current.entityHighlights[0]).toEqual(
      expect.objectContaining({
        from: 43,
        to: 57,
        matchedText: "schizophrenia",
        entity: {
          entityType: "disease",
          conceptNamespace: "mesh",
          conceptId: "D012559",
          sourceIdentifier: "MESH:D012559",
          canonicalName: "Schizophrenia",
        },
      }),
    );

    act(() => {
      result.current.handleEntityHoverChange({
        highlight: result.current.entityHighlights[0],
        x: 24,
        y: 48,
      });
    });

    await waitFor(() => {
      expect(result.current.entityHoverCard).toEqual(
        expect.objectContaining({
          x: 24,
          y: 48,
          label: "Schizophrenia",
          entityType: "disease",
          paperCount: 1200,
          aliases: ["schizophrenia spectrum disorder"],
          detailReady: true,
        }),
      );
    });
  });
});
