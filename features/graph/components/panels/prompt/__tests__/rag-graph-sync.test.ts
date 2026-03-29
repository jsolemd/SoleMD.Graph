import type {
  GraphBundleQueries,
  GraphRagQueryResponsePayload,
  PaperNode,
} from "@/features/graph/types";
import { RAG_ASK_OVERLAY_PRODUCER } from "@/features/graph/lib/overlay-producers";
import {
  clearRagGraphOverlay,
  collectSignalPaperIds,
  syncRagGraphSignals,
} from "../rag-graph-sync";

function createQueries({
  activePaperNodeResponses = [],
  universePointIds = {},
  initialProducerPointIds = {},
}: {
  activePaperNodeResponses?: Array<Record<string, PaperNode>>;
  universePointIds?: Record<string, string>;
  initialProducerPointIds?: Record<string, string[]>;
  } = {}): jest.Mocked<GraphBundleQueries> {
  const producerPointIds = new Map<string, string[]>(
    Object.entries(initialProducerPointIds).map(([producerId, pointIds]) => [
      producerId,
      [...new Set(pointIds)],
    ]),
  );
  let nextOverlayPointIds = Array.from(
    new Set(Array.from(producerPointIds.values()).flat()),
  );
  let activeCallCount = 0;

  return {
    getOverlayPointIds: jest.fn(async () => [...nextOverlayPointIds]),
    setOverlayProducerPointIds: jest.fn(async ({ producerId, pointIds }) => {
      if (pointIds.length === 0) {
        producerPointIds.delete(producerId);
      } else {
        producerPointIds.set(producerId, [...new Set(pointIds)]);
      }
      nextOverlayPointIds = Array.from(
        new Set(Array.from(producerPointIds.values()).flat()),
      );
      return { overlayCount: nextOverlayPointIds.length };
    }),
    clearOverlayProducer: jest.fn(async (producerId) => {
      producerPointIds.delete(producerId);
      nextOverlayPointIds = Array.from(
        new Set(Array.from(producerPointIds.values()).flat()),
      );
      return { overlayCount: nextOverlayPointIds.length };
    }),
    setOverlayPointIds: jest.fn(async (pointIds: string[]) => {
      nextOverlayPointIds = [...pointIds];
      return { overlayCount: pointIds.length };
    }),
    clearOverlay: jest.fn(async () => {
      nextOverlayPointIds = [];
      return { overlayCount: 0 };
    }),
    activateOverlay: jest.fn(),
    getClusterDetail: jest.fn(),
    getSelectionDetail: jest.fn(),
    getPaperDocument: jest.fn(),
    getPaperNodesByPaperIds: jest.fn(async () => {
      const response =
        activePaperNodeResponses[activeCallCount] ??
        activePaperNodeResponses[activePaperNodeResponses.length - 1] ??
        {};
      activeCallCount += 1;
      return response;
    }),
    getUniversePointIdsByPaperIds: jest.fn(async () => universePointIds),
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

function createRagResponse(
  paperIds: Array<string | null>,
): GraphRagQueryResponsePayload {
  return {
    graph_signals: paperIds.map((paperId, index) => ({
      corpus_id: index + 1,
      paper_id: paperId,
      signal_kind: "semantic_neighbor",
      channel: "semantic_neighbor",
      score: 0.9 - index * 0.1,
      rank: index + 1,
      reason: null,
      matched_terms: [],
    })),
  } as GraphRagQueryResponsePayload;
}

describe("rag-graph-sync", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("collects unique paper ids from graph signals", () => {
    expect(
      collectSignalPaperIds(createRagResponse(["paper-1", "paper-1", null])),
    ).toEqual(["paper-1"]);
  });

  it("highlights already-active paper nodes without touching overlay membership", async () => {
    const queries = createQueries({
      activePaperNodeResponses: [
        {
          "paper-1": { index: 7 } as PaperNode,
        },
      ],
    });

    const result = await syncRagGraphSignals({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse: createRagResponse(["paper-1"]),
    });

    expect(queries.getPaperNodesByPaperIds).toHaveBeenCalledTimes(1);
    expect(queries.getPaperNodesByPaperIds).toHaveBeenCalledWith(["paper-1"]);
    expect(queries.getUniversePointIdsByPaperIds).not.toHaveBeenCalled();
    expect(queries.setOverlayProducerPointIds).not.toHaveBeenCalled();
    expect(queries.clearOverlayProducer).toHaveBeenCalledWith(RAG_ASK_OVERLAY_PRODUCER);
    expect(queries.setOverlayPointIds).not.toHaveBeenCalled();
    expect(queries.clearOverlay).not.toHaveBeenCalled();
    expect(result).toEqual({
      highlightedPointIndices: [7],
    });
  });

  it("promotes non-active papers into the RAG producer without dropping other overlay producers", async () => {
    const queries = createQueries({
      activePaperNodeResponses: [
        {},
        {
          "paper-2": { index: 12 } as PaperNode,
        },
      ],
      universePointIds: {
        "paper-2": "rag-new",
      },
      initialProducerPointIds: {
        [RAG_ASK_OVERLAY_PRODUCER]: ["rag-old"],
        "manual:cluster-neighborhood": ["external-1"],
      },
    });

    const result = await syncRagGraphSignals({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse: createRagResponse(["paper-2"]),
    });

    expect(queries.getPaperNodesByPaperIds).toHaveBeenNthCalledWith(1, ["paper-2"]);
    expect(queries.getUniversePointIdsByPaperIds).toHaveBeenCalledWith(["paper-2"]);
    expect(queries.setOverlayProducerPointIds).toHaveBeenCalledWith({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      pointIds: ["rag-new"],
    });
    await expect(queries.getOverlayPointIds()).resolves.toEqual(
      expect.arrayContaining(["external-1", "rag-new"]),
    );
    expect(result).toEqual({
      highlightedPointIndices: [12],
    });
  });

  it("clears the RAG overlay producer when clearing ask state", async () => {
    const queries = createQueries();

    await clearRagGraphOverlay({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
    });

    expect(queries.clearOverlayProducer).toHaveBeenCalledWith(RAG_ASK_OVERLAY_PRODUCER);
  });

  it("clears the RAG overlay producer when no graph signals remain", async () => {
    const queries = createQueries();

    const result = await syncRagGraphSignals({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse: createRagResponse([]),
    });

    expect(queries.clearOverlayProducer).toHaveBeenCalledWith(RAG_ASK_OVERLAY_PRODUCER);
    expect(result).toEqual({
      highlightedPointIndices: [],
    });
  });
});
