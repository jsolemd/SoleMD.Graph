/**
 * @jest-environment jsdom
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import {
  GRAPH_ASK_ENGINE_ERROR_DATA_PART,
  GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
} from "@/features/graph/lib/rag-chat";
import {
  RAG_ANSWER_SELECTION_SOURCE_ID,
  RAG_ASK_OVERLAY_PRODUCER,
  RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER,
} from "@/features/graph/lib/overlay-producers";
import type {
  GraphBundle,
  GraphBundleQueries,
  GraphInteractionTrace,
  GraphNode,
  GraphRagQueryResponsePayload,
} from "@/features/graph/types";
import {
  clearRagGraphOverlay,
  syncRagGraphSignals,
} from "../rag-graph-sync";
import { fetchGraphRagQuery } from "../../../../lib/detail-service";
import { useRagQuery } from "../use-rag-query";

jest.mock("../../../../lib/detail-service", () => ({
  fetchGraphRagQuery: jest.fn(),
}));

jest.mock("ai", () => ({
  DefaultChatTransport: class DefaultChatTransport {
    constructor(_options?: unknown) {}
  },
}));

jest.mock("@ai-sdk/react", () => ({
  useChat: jest.fn(),
}));

jest.mock("../rag-graph-sync", () => ({
  syncRagGraphSignals: jest.fn(),
  clearRagGraphOverlay: jest.fn(),
}));

const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>;
const mockedFetchGraphRagQuery =
  fetchGraphRagQuery as jest.MockedFunction<typeof fetchGraphRagQuery>;
const mockedSyncRagGraphSignals =
  syncRagGraphSignals as jest.MockedFunction<typeof syncRagGraphSignals>;
const mockedClearRagGraphOverlay =
  clearRagGraphOverlay as jest.MockedFunction<typeof clearRagGraphOverlay>;

type MockChat = ReturnType<typeof createChatMock>;
let chatMock: MockChat;
let chatOptions:
  | Parameters<typeof useChat>[0]
  | undefined;
const mockInteractionTrace: GraphInteractionTrace = {
  interactionId: "prompt:1",
  intentId: "prompt:1",
  origin: {
    surface: "prompt",
    interactionKey: "ask:rag:ask",
    producerId: RAG_ASK_OVERLAY_PRODUCER,
  },
  totalDurationMs: 4,
  stages: [
    { stage: "intent", durationMs: 1 },
    { stage: "availability", durationMs: 1 },
    { stage: "project", durationMs: 1 },
    { stage: "resolve", durationMs: 1 },
  ],
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function createChatMock() {
  return {
    messages: [],
    sendMessage: jest.fn(async () => {}),
    setMessages: jest.fn(),
    clearError: jest.fn(),
    stop: jest.fn(async () => {}),
    regenerate: jest.fn(),
    resumeStream: jest.fn(),
    addToolResult: jest.fn(),
    addToolOutput: jest.fn(),
    addToolApprovalResponse: jest.fn(),
    status: "ready" as const,
    error: undefined,
  };
}

function createQueries(): jest.Mocked<GraphBundleQueries> {
  return {
    setSelectedPointIndices: jest.fn(),
    setSelectedPointScopeSql: jest.fn(),
    getOverlayPointIds: jest.fn(),
    setOverlayProducerPointIds: jest.fn(),
    clearOverlayProducer: jest.fn(),
    setOverlayPointIds: jest.fn(),
    clearOverlay: jest.fn(),
    activateOverlay: jest.fn(),
    getClusterDetail: jest.fn(),
    getSelectionDetail: jest.fn(),
    getPaperDocument: jest.fn(),
    getSelectionScopeGraphPaperRefs: jest.fn(async () => []),
    getPaperNodesByGraphPaperRefs: jest.fn(),
    ensureGraphPaperRefsAvailable: jest.fn(async (graphPaperRefs: string[]) => ({
      activeGraphPaperRefs: [],
      universePointIdsByGraphPaperRef: Object.fromEntries(
        graphPaperRefs.map((graphPaperRef) => [graphPaperRef, graphPaperRef]),
      ),
      unresolvedGraphPaperRefs: [],
    })),
    getUniversePointIdsByGraphPaperRefs: jest.fn(),
    getChunkNodesByChunkIds: jest.fn(),
    resolvePointSelection: jest.fn(),
    getTablePage: jest.fn(),
    getInfoSummary: jest.fn(),
    getInfoBars: jest.fn(),
    getInfoHistogram: jest.fn(),
    getFacetSummary: jest.fn(),
    getFacetSummaries: jest.fn(),
    searchPoints: jest.fn(),
    getVisibilityBudget: jest.fn(),
    getScopeCoordinates: jest.fn(),
    runReadOnlyQuery: jest.fn(),
  } as jest.Mocked<GraphBundleQueries>;
}

function createResponse(query: string): GraphRagQueryResponsePayload {
  return {
    query,
    graph_signals: [],
    results: [],
    evidence_bundles: [],
    retrieval_channels: [],
    meta: {
      request_id: `req:${query}`,
      generated_at: "2026-03-28T00:00:00Z",
      duration_ms: 1,
      cache_control: "no-store",
      retrieval_version: "test",
    },
    release: {
      graph_release_id: "bundle-checksum",
      graph_run_id: "run-id",
      bundle_checksum: "bundle-checksum",
      graph_name: "cosmograph",
      layer_key: "paper",
      node_kind: "paper",
      is_current: true,
    },
    selected_layer_key: null,
    selected_node_id: null,
    selected_graph_paper_ref: null,
    selected_paper_id: null,
    selection_graph_paper_refs: [],
    selected_cluster_id: null,
    scope_mode: "global",
    answer: `Answer for ${query}`,
    answer_model: "test-model",
    answer_graph_paper_refs: [],
    grounded_answer: null,
  };
}

describe("useRagQuery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatMock = createChatMock();
    chatOptions = undefined;
    mockedUseChat.mockImplementation((options) => {
      chatOptions = options;
      return chatMock as never;
    });
    mockedSyncRagGraphSignals.mockResolvedValue({
      availability: {
        activeGraphPaperRefs: [],
        universePointIdsByGraphPaperRef: {},
        unresolvedGraphPaperRefs: [],
      },
      graphAvailabilitySummary: {
        activeResolvedGraphPaperRefs: [],
        overlayPromotedGraphPaperRefs: [],
        evidenceOnlyGraphPaperRefs: [],
      },
      answerSelectedPointIndices: [],
      interactionTrace: mockInteractionTrace,
    });
  });

  it("ignores late responses from older compose requests", async () => {
    const firstRequest = deferred<GraphRagQueryResponsePayload>();
    const secondRequest = deferred<GraphRagQueryResponsePayload>();
    mockedFetchGraphRagQuery
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const queries = createQueries();
    let promptText = "first question";
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: false,
        selectedNode: null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => promptText,
      }),
    );

    await act(async () => {
      result.current.runEvidenceAssistQuery({
        intent: "support",
        queryText: "first question",
        previewText: "first question",
        paragraphText: "first question",
      });
    });

    promptText = "second question";
    await act(async () => {
      result.current.runEvidenceAssistQuery({
        intent: "support",
        queryText: "second question",
        previewText: "second question",
        paragraphText: "second question",
      });
    });

    await act(async () => {
      secondRequest.resolve(createResponse("second question"));
      await flushMicrotasks();
    });

    await act(async () => {
      firstRequest.resolve(createResponse("first question"));
      await flushMicrotasks();
    });

    expect(result.current.ragResponse?.query).toBe("second question");
    expect(mockedSyncRagGraphSignals).toHaveBeenCalledTimes(1);
    expect(mockedSyncRagGraphSignals).toHaveBeenCalledWith({
      interactionId: "prompt:2",
      origin: {
        surface: "prompt",
        interactionKey: "compose:rag:evidence-assist:support",
        producerId: RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER,
        metadata: {
          requestId: 2,
          origin: "compose",
          evidenceIntent: "support",
          queryPreview: "second question",
        },
      },
      producerId: RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER,
      queries,
      ragResponse: expect.objectContaining({ query: "second question" }),
    });
    expect(result.current.ragInteractionTrace?.stages.map((stage) => stage.stage)).toEqual([
      "intent",
      "availability",
      "project",
      "resolve",
      "render",
    ]);
  });

  it("submits ask requests through the AI SDK transport with the current graph context", async () => {
    const queries = createQueries();
    const selectedNode = { id: "paper-7", paperId: "paper-7", nodeKind: "paper" } as GraphNode;
    const promptText = "working question";
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => promptText,
      }),
    );

    await act(async () => {
      result.current.handleSubmit();
    });

    expect(chatMock.setMessages).toHaveBeenCalledWith([]);
    expect(chatMock.sendMessage).toHaveBeenCalledWith(
      { text: "working question" },
      {
        body: {
          graph_release_id: "bundle-checksum",
          selected_layer_key: "paper",
          selected_node_id: "paper-7",
          selected_graph_paper_ref: "paper-7",
          selected_paper_id: null,
          selection_graph_paper_refs: null,
          selected_cluster_id: null,
          scope_mode: null,
          client_request_id: 1,
          evidence_intent: null,
          k: 6,
          rerank_topn: 18,
          use_lexical: true,
          generate_answer: true,
        },
      },
    );
  });

  it("clears previously-owned overlay ids when the ask stream emits an engine error", async () => {
    const queries = createQueries();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null as GraphNode | null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => "working question",
      }),
    );

    expect(chatOptions).toBeDefined();

    await act(async () => {
      result.current.handleSubmit();
      await flushMicrotasks();
    });

    await act(async () => {
      chatOptions?.onData?.({
        type: GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
        data: {
          client_request_id: 1,
          response: createResponse("working question"),
        },
      } as never);
      await flushMicrotasks();
    });

    await act(async () => {
      chatOptions?.onData?.({
        type: GRAPH_ASK_ENGINE_ERROR_DATA_PART,
        data: {
          client_request_id: 1,
          error_code: "engine_request_failed",
          error_message: "boom",
          request_id: "req:boom",
          retry_after: null,
          status: 500,
        },
      } as never);
      await flushMicrotasks();
    });

    expect(mockedClearRagGraphOverlay).toHaveBeenCalledWith({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
    });
  });

  it("ignores stale ask data parts from older client request ids", async () => {
    const queries = createQueries();
    let promptText = "first question";
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => promptText,
      }),
    );

    await act(async () => {
      result.current.handleSubmit();
    });

    await act(async () => {
      result.current.clearRag();
      await flushMicrotasks();
    });

    promptText = "second question";
    await act(async () => {
      result.current.handleSubmit();
    });

    await act(async () => {
      chatOptions?.onData?.({
        type: GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
        data: {
          client_request_id: 1,
          response: createResponse("first question"),
        },
      } as never);
      chatOptions?.onData?.({
        type: GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
        data: {
          client_request_id: 3,
          response: createResponse("second question"),
        },
      } as never);
      await flushMicrotasks();
    });

    expect(result.current.ragResponse?.query).toBe("second question");
  });

  it("ignores stale ask onFinish payloads from older client request ids", async () => {
    const queries = createQueries();
    let promptText = "first question";
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => promptText,
      }),
    );

    await act(async () => {
      result.current.handleSubmit();
      await flushMicrotasks();
    });

    await act(async () => {
      result.current.clearRag();
      await flushMicrotasks();
    });

    promptText = "second question";
    await act(async () => {
      result.current.handleSubmit();
      await flushMicrotasks();
    });

    await act(async () => {
      chatOptions?.onFinish?.({
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                type: GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
                data: {
                  client_request_id: 1,
                  response: createResponse("first question"),
                },
              },
            ],
          },
        ],
      } as never);
      await flushMicrotasks();
    });

    expect(result.current.ragResponse).toBeNull();
  });

  it("passes selected graph paper refs when selection scope is enabled", async () => {
    const queries = createQueries();
    queries.getSelectionScopeGraphPaperRefs.mockResolvedValue(["paper-7", "paper-9"]);
    const selectedNode = { id: "paper-7", paperId: "paper-7", nodeKind: "paper" } as GraphNode;
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode,
        currentPointScopeSql: "clusterId = 7",
        selectionScopeEnabled: true,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => "working question",
      }),
    );

    await act(async () => {
      result.current.handleSubmit();
      await flushMicrotasks();
    });

    expect(queries.getSelectionScopeGraphPaperRefs).toHaveBeenCalledTimes(1);
    expect(queries.getSelectionScopeGraphPaperRefs).toHaveBeenCalledWith({
      currentPointScopeSql: "clusterId = 7",
    });
    expect(chatMock.sendMessage).toHaveBeenCalledWith(
      { text: "working question" },
      expect.objectContaining({
        body: expect.objectContaining({
          selection_graph_paper_refs: ["paper-7", "paper-9"],
          scope_mode: "selection_only",
        }),
      }),
    );
  });

  it("selects answer-linked point indices without making them the next auto-scope source", async () => {
    const queries = createQueries();
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();
    mockedFetchGraphRagQuery.mockResolvedValue(
      createResponse("grounded question"),
    );
    mockedSyncRagGraphSignals.mockResolvedValue({
      availability: {
        activeGraphPaperRefs: ["paper-11", "paper-22"],
        universePointIdsByGraphPaperRef: {},
        unresolvedGraphPaperRefs: [],
      },
      graphAvailabilitySummary: {
        activeResolvedGraphPaperRefs: ["paper-11", "paper-22"],
        overlayPromotedGraphPaperRefs: [],
        evidenceOnlyGraphPaperRefs: [],
      },
      answerSelectedPointIndices: [7, 9],
      interactionTrace: mockInteractionTrace,
    });

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: false,
        selectedNode: null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => "grounded question",
      }),
    );

    await act(async () => {
      result.current.runEvidenceAssistQuery({
        intent: "support",
        queryText: "grounded question",
        previewText: "grounded question",
        paragraphText: "grounded question",
      });
      await flushMicrotasks();
    });

    expect(queries.setSelectedPointIndices).toHaveBeenCalledWith([7, 9]);
    expect(setSelectedPointCount).toHaveBeenCalledWith(2);
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(
      RAG_ANSWER_SELECTION_SOURCE_ID,
    );
  });

  it("waits for point-selection mutation before finalizing the interaction trace", async () => {
    const queries = createQueries();
    const selectionUpdate = deferred<void>();
    queries.setSelectedPointIndices.mockReturnValue(selectionUpdate.promise);
    const setSelectedPointCount = jest.fn();
    const setActiveSelectionSourceId = jest.fn();
    mockedFetchGraphRagQuery.mockResolvedValue(
      createResponse("timed question"),
    );
    mockedSyncRagGraphSignals.mockResolvedValue({
      availability: {
        activeGraphPaperRefs: ["paper-11"],
        universePointIdsByGraphPaperRef: {},
        unresolvedGraphPaperRefs: [],
      },
      graphAvailabilitySummary: {
        activeResolvedGraphPaperRefs: ["paper-11"],
        overlayPromotedGraphPaperRefs: [],
        evidenceOnlyGraphPaperRefs: [],
      },
      answerSelectedPointIndices: [7],
      interactionTrace: mockInteractionTrace,
    });

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: false,
        selectedNode: null,
        currentPointScopeSql: null,
        activeSelectionSourceId: null,
        setSelectedPointCount,
        setActiveSelectionSourceId,
        getPromptText: () => "timed question",
      }),
    );

    await act(async () => {
      result.current.runEvidenceAssistQuery({
        intent: "support",
        queryText: "timed question",
        previewText: "timed question",
        paragraphText: "timed question",
      });
      await flushMicrotasks();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(result.current.ragInteractionTrace).toBeNull();
    expect(setSelectedPointCount).not.toHaveBeenCalled();

    await act(async () => {
      selectionUpdate.resolve();
      await flushMicrotasks();
    });

    expect(setSelectedPointCount).toHaveBeenCalledWith(1);
    expect(setActiveSelectionSourceId).toHaveBeenCalledWith(
      RAG_ANSWER_SELECTION_SOURCE_ID,
    );
    expect(result.current.ragInteractionTrace?.stages.map((stage) => stage.stage)).toEqual([
      "intent",
      "availability",
      "project",
      "resolve",
      "render",
    ]);
  });
});
