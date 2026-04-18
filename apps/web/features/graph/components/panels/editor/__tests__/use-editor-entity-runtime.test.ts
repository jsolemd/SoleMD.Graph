/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  fetchGraphEntityDetail,
  fetchGraphEntityMatches,
} from "@solemd/api-client/client/entity-service";
import { useEntityHover } from "@/features/graph/components/entities/use-entity-hover";
import { useEditorEntityRuntime } from "../use-editor-entity-runtime";

jest.mock("@solemd/api-client/client/entity-service", () => ({
  fetchGraphEntityMatches: jest.fn(),
  fetchGraphEntityDetail: jest.fn(),
}));
jest.mock("@/features/graph/components/entities/use-entity-hover", () => ({
  useEntityHover: jest.fn(),
}));

const mockedFetchGraphEntityMatches =
  fetchGraphEntityMatches as jest.MockedFunction<typeof fetchGraphEntityMatches>;
const mockedFetchGraphEntityDetail =
  fetchGraphEntityDetail as jest.MockedFunction<typeof fetchGraphEntityDetail>;
const mockedUseEntityHover = useEntityHover as jest.MockedFunction<typeof useEntityHover>;

describe("useEditorEntityRuntime", () => {
  const hoverContext = {
    show: jest.fn(),
    hide: jest.fn(),
    pointerEnterCard: jest.fn(),
    pointerLeaveCard: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockedFetchGraphEntityMatches.mockReset();
    mockedFetchGraphEntityDetail.mockReset();
    hoverContext.show.mockReset();
    hoverContext.hide.mockReset();
    hoverContext.pointerEnterCard.mockReset();
    hoverContext.pointerLeaveCard.mockReset();
    mockedUseEntityHover.mockReturnValue(hoverContext);
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

    expect(hoverContext.show).toHaveBeenCalledWith({
      entity: {
        entityType: "disease",
        conceptNamespace: "mesh",
        conceptId: "D012559",
        sourceIdentifier: "MESH:D012559",
        canonicalName: "Schizophrenia",
      },
      paperCount: 1200,
      x: 24,
      y: 48,
    });
  });

  it("keeps duplicate text matches as distinct highlights while hover detail stays canonical", async () => {
    mockedFetchGraphEntityMatches.mockResolvedValue({
      matches: [
        {
          matchId: "gene:HGNC:11998:0:5",
          entityType: "gene",
          conceptNamespace: "hgnc",
          conceptId: "11998",
          sourceIdentifier: "HGNC:11998",
          canonicalName: "TP53",
          matchedText: "TP53",
          aliasText: "TP53",
          aliasSource: "canonical_name",
          isCanonical: true,
          paperCount: 900,
          startOffset: 0,
          endOffset: 4,
          score: 1,
        },
        {
          matchId: "gene:HGNC:11998:15:20",
          entityType: "gene",
          conceptNamespace: "hgnc",
          conceptId: "11998",
          sourceIdentifier: "HGNC:11998",
          canonicalName: "TP53",
          matchedText: "TP53",
          aliasText: "TP53",
          aliasSource: "canonical_name",
          isCanonical: true,
          paperCount: 900,
          startOffset: 15,
          endOffset: 19,
          score: 1,
        },
      ],
    });
    mockedFetchGraphEntityDetail.mockResolvedValue({
      entityType: "gene",
      conceptNamespace: "hgnc",
      conceptId: "11998",
      sourceIdentifier: "HGNC:11998",
      canonicalName: "TP53",
      aliases: [
        {
          aliasText: "TP53",
          isCanonical: true,
          aliasSource: "canonical_name",
        },
      ],
      paperCount: 900,
    });

    const { result } = renderHook(() =>
      useEditorEntityRuntime({
        enabled: true,
      }),
    );

    act(() => {
      result.current.handleTextContextChange({
        text: "TP53 interacts with TP53 downstream targets.",
        textFrom: 0,
        cursorOffset: 10,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.entityHighlights).toHaveLength(2);
    });

    act(() => {
      result.current.handleEntityHoverChange({
        highlight: result.current.entityHighlights[0],
        x: 12,
        y: 18,
      });
    });

    expect(hoverContext.show).toHaveBeenCalledWith({
      entity: {
        entityType: "gene",
        conceptNamespace: "hgnc",
        conceptId: "11998",
        sourceIdentifier: "HGNC:11998",
        canonicalName: "TP53",
      },
      paperCount: 900,
      x: 12,
      y: 18,
    });
  });

  it("delegates hover clear to the shared hover controller", async () => {
    mockedFetchGraphEntityMatches.mockResolvedValue({
      matches: [
        {
          matchId: "disease:MESH:D012559:0:14",
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
          startOffset: 0,
          endOffset: 14,
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
      ],
      paperCount: 1200,
    });

    const { result } = renderHook(() =>
      useEditorEntityRuntime({
        enabled: true,
      }),
    );

    act(() => {
      result.current.handleTextContextChange({
        text: "schizophrenia is associated with dopamine dysfunction",
        textFrom: 0,
        cursorOffset: 14,
      });
    });

    await act(async () => {
      jest.advanceTimersByTime(350);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.entityHighlights).toHaveLength(1);
    });

    act(() => {
      result.current.handleEntityHoverChange({
        highlight: result.current.entityHighlights[0],
        x: 24,
        y: 48,
      });
    });

    act(() => {
      result.current.handleEntityHoverChange(null);
    });

    expect(hoverContext.hide).toHaveBeenCalledTimes(1);
  });
});
