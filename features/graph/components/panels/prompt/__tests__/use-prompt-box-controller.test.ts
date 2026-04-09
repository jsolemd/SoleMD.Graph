/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { motionValue } from "framer-motion";
import type { GraphBundle } from "@/features/graph/types";
import { useDashboardStore, useGraphStore } from "@/features/graph/stores";
import { usePromptBoxController } from "../use-prompt-box-controller";
import { useRagQuery } from "../use-rag-query";

jest.mock("@mantine/hooks", () => ({
  useViewportSize: () => ({ width: 1280, height: 720 }),
}));

jest.mock("@/features/graph/cosmograph", () => ({
  useGraphInstance: () => null,
}));

jest.mock("@/features/graph/hooks/use-typewriter", () => ({
  useTypewriter: () => ({ text: "Ask with the knowledge graph...", isLast: true }),
}));

jest.mock("../use-focused-avoidance-rects", () => ({
  useFocusedAvoidanceRects: () => [],
}));

jest.mock("../use-prompt-position", () => ({
  usePromptPosition: () => ({
    isDragging: { current: false },
    userDragX: { current: 0 },
    userDragY: { current: 0 },
    autoTargetXRef: { current: 0 },
    autoTargetYRef: { current: 0 },
    dragControls: { start: jest.fn() },
    dragX: motionValue(0),
    dragY: motionValue(0),
    cardHeight: motionValue(0),
    heightOverride: false,
    isFullHeightMode: false,
    isOffset: false,
    setIsOffset: jest.fn(),
  }),
}));

jest.mock("../use-rag-query", () => ({
  useRagQuery: jest.fn(),
}));

const mockedUseRagQuery = useRagQuery as jest.MockedFunction<typeof useRagQuery>;
const clearRag = jest.fn();
const handleSubmit = jest.fn();

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
  useGraphStore.setState({
    ...useGraphStore.getInitialState(),
    mode: "ask",
  });
  useDashboardStore.setState({
    ...useDashboardStore.getInitialState(),
    promptMode: "normal",
    writeContent: "",
  });
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
});
