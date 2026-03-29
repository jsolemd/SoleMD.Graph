/**
 * @jest-environment jsdom
 */
import { act, renderHook } from "@testing-library/react";
import { useChat } from "@ai-sdk/react";
import {
  GRAPH_ASK_ENGINE_ERROR_DATA_PART,
  GRAPH_ASK_EVIDENCE_RESPONSE_DATA_PART,
} from "@/features/graph/lib/rag-chat";
import {
  RAG_ASK_OVERLAY_PRODUCER,
  RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER,
} from "@/features/graph/lib/overlay-producers";
import type {
  GraphBundle,
  GraphBundleQueries,
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
    getOverlayPointIds: jest.fn(),
    setOverlayProducerPointIds: jest.fn(),
    clearOverlayProducer: jest.fn(),
    setOverlayPointIds: jest.fn(),
    clearOverlay: jest.fn(),
    activateOverlay: jest.fn(),
    getClusterDetail: jest.fn(),
    getSelectionDetail: jest.fn(),
    getPaperDocument: jest.fn(),
    getPaperNodesByPaperIds: jest.fn(),
    getUniversePointIdsByPaperIds: jest.fn(),
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
    selected_paper_id: null,
    selected_cluster_id: null,
    answer: `Answer for ${query}`,
    answer_model: "test-model",
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
    mockedSyncRagGraphSignals.mockResolvedValue();
  });

  it("ignores late responses from older compose requests", async () => {
    const firstRequest = deferred<GraphRagQueryResponsePayload>();
    const secondRequest = deferred<GraphRagQueryResponsePayload>();
    mockedFetchGraphRagQuery
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    const queries = createQueries();
    let promptText = "first question";

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: false,
        selectedNode: null,
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
      producerId: RAG_EVIDENCE_ASSIST_SUPPORT_OVERLAY_PRODUCER,
      queries,
      ragResponse: expect.objectContaining({ query: "second question" }),
    });
  });

  it("submits ask requests through the AI SDK transport with the current graph context", async () => {
    const queries = createQueries();
    const selectedNode = { id: "paper-7", paperId: "paper-7", nodeKind: "paper" } as GraphNode;
    const promptText = "working question";

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode,
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
          selected_paper_id: "paper-7",
          selected_cluster_id: null,
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

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null as GraphNode | null,
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

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null,
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

    const { result } = renderHook(() =>
      useRagQuery({
        bundle: { bundleChecksum: "bundle-checksum", runId: "run-id" } as GraphBundle,
        queries,
        isAsk: true,
        selectedNode: null,
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
});
