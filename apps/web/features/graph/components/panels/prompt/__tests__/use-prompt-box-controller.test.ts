/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { motionValue } from "framer-motion";
import type { GraphBundle } from "@solemd/graph";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { useWikiStore } from "@/features/wiki/stores/wiki-store";
import { usePromptBoxController } from "../use-prompt-box-controller";
import { useRagQuery } from "../use-rag-query";
import { useReferenceMentionSource } from "../use-reference-mention-source";
import { useEntityOverlaySync } from "@/features/graph/components/entities/use-entity-overlay-sync";

jest.mock("@mantine/hooks", () => ({
  useViewportSize: () => ({ width: 1280, height: 720 }),
}));

jest.mock("@/features/graph/cosmograph", () => ({
  useGraphInstance: () => null,
  useGraphSelection: () => ({
    selectPointsByIndices: jest.fn(),
    clearSelectionBySource: jest.fn(),
  }),
}));

jest.mock("@/features/graph/hooks/use-typewriter", () => ({
  useTypewriter: () => ({ text: "Ask with the knowledge graph...", isLast: true }),
}));

jest.mock("../use-focused-avoidance-rects", () => ({
  useFocusedAvoidanceRects: () => [],
}));

jest.mock("../use-prompt-position", () => ({
  usePromptPosition: () => ({
    dragX: motionValue(0),
    dragY: motionValue(0),
    cardHeight: motionValue(0),
    heightOverride: false,
    isFullHeightMode: false,
  }),
}));

jest.mock("../use-rag-query", () => ({
  useRagQuery: jest.fn(),
}));

jest.mock("../use-reference-mention-source", () => ({
  useReferenceMentionSource: jest.fn(),
}));

jest.mock("@/features/graph/components/entities/use-entity-overlay-sync", () => ({
  useEntityOverlaySync: jest.fn(),
}));

const mockedUseRagQuery = useRagQuery as jest.MockedFunction<typeof useRagQuery>;
const mockedUseReferenceMentionSource =
  useReferenceMentionSource as jest.MockedFunction<typeof useReferenceMentionSource>;
const mockedUseEntityOverlaySync =
  useEntityOverlaySync as jest.MockedFunction<typeof useEntityOverlaySync>;
const clearRag = jest.fn();
const handleSubmit = jest.fn();
const syncEntityOverlayRefs = jest.fn();
const clearEntityOverlaySelection = jest.fn();
const referenceMentionSource = {
  getItems: jest.fn(async () => []),
};

type PromptControllerArgs = Parameters<typeof useRagQuery>[0];

let latestRagArgs: PromptControllerArgs | null = null;

function createBundle(): GraphBundle {
  return {
    bundleChecksum: "bundle-checksum",
    runId: "run-id",
  } as GraphBundle;
}

beforeEach(() => {
  latestRagArgs = null;
  clearRag.mockReset();
  handleSubmit.mockReset();
  syncEntityOverlayRefs.mockReset();
  clearEntityOverlaySelection.mockReset();
  mockedUseReferenceMentionSource.mockReturnValue(referenceMentionSource);
  mockedUseEntityOverlaySync.mockReturnValue({
    syncEntityOverlayRefs,
    clearEntityOverlaySelection,
  });
  useGraphStore.setState({
    ...useGraphStore.getInitialState(),
    mode: "ask",
  });
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    promptMode: "normal",
    writeContent: "",
  });
  useWikiStore.getState().reset();
  mockedUseRagQuery.mockImplementation((args) => {
    latestRagArgs = args;
    return {
      ragResponse: null,
      streamedAskAnswer: "",
      ragError: null,
      ragSession: null,
      ragGraphAvailability: null,
      isSubmitting: false,
      handleSubmit,
      runEvidenceAssistQuery: jest.fn(),
      clearRag,
    };
  });
});

describe("usePromptBoxController", () => {
  it("does not rerender the prompt shell for ask-mode draft text changes", () => {
    let renderCount = 0;

    const { result } = renderHook(() => {
      renderCount += 1;
      return usePromptBoxController({
        bundle: createBundle(),
        queries: null,
      });
    });

    renderCount = 0;

    act(() => {
      result.current.handlePromptContentChange("dopamine schizophrenia");
    });

    expect(renderCount).toBe(0);
    expect(latestRagArgs?.getPromptText()).toBe("dopamine schizophrenia");
  });

  it("restores the ask draft after switching away from ask mode and back", () => {
    const { result } = renderHook(() =>
      usePromptBoxController({
        bundle: createBundle(),
        queries: null,
      }),
    );

    act(() => {
      result.current.handlePromptContentChange("fingerprint the cited sources");
      result.current.handlePromptEmptyChange(false);
    });

    act(() => {
      useGraphStore.setState({ mode: "create" });
      useDashboardStore.setState({ writeContent: "# Draft manuscript" });
    });

    expect(result.current.isCreate).toBe(true);
    expect(result.current.activePromptValue).toBe("# Draft manuscript");

    act(() => {
      useGraphStore.setState({ mode: "ask" });
    });

    expect(result.current.isAsk).toBe(true);
    expect(result.current.activePromptValue).toBe(
      "fingerprint the cited sources",
    );
  });

  it("keeps typing-driven entity highlights off the graph until an explicit action requests overlay", () => {
    const { result } = renderHook(() =>
      usePromptBoxController({
        bundle: createBundle(),
        queries: null,
      }),
    );

    act(() => {
      result.current.handlePromptContentChange("dopamine and schizophrenia");
      result.current.handleShowEntityOnGraph({
        entityType: "disease",
        sourceIdentifier: "MESH:D012559",
      });
    });

    expect(syncEntityOverlayRefs).toHaveBeenCalledWith([
      {
        entityType: "disease",
        sourceIdentifier: "MESH:D012559",
      },
    ]);
  });

  it("clears explicit entity graph selection before delegating Enter-driven ask selection", () => {
    const { result } = renderHook(() =>
      usePromptBoxController({
        bundle: createBundle(),
        queries: null,
      }),
    );

    act(() => {
      result.current.handleSubmit();
    });

    expect(clearEntityOverlaySelection).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });

  it("opens the wiki panel and routes the wiki store from an explicit entity action", () => {
    const { result } = renderHook(() =>
      usePromptBoxController({
        bundle: createBundle(),
        queries: null,
      }),
    );

    act(() => {
      result.current.handleOpenEntityInWiki({
        entityType: "disease",
        conceptNamespace: "mesh",
        conceptId: "D012559",
        sourceIdentifier: "MESH:D012559",
        canonicalName: "Schizophrenia",
      });
    });

    expect(useDashboardStore.getState().panelsVisible).toBe(true);
    expect(useDashboardStore.getState().openPanels.wiki).toBe(true);
    expect(useWikiStore.getState().currentRoute).toEqual({
      kind: "page",
      slug: "entities/schizophrenia",
    });
  });
});
