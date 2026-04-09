import type {
  GraphBundleQueries,
  GraphInteractionOrigin,
  GraphRagQueryResponsePayload,
  PaperNode,
} from "@/features/graph/types";
import { RAG_ASK_OVERLAY_PRODUCER } from "@/features/graph/lib/overlay-producers";
import {
  clearRagGraphOverlay,
  collectAnswerGraphPaperRefs,
  collectSignalGraphPaperRefs,
  syncRagGraphSignals,
} from "../rag-graph-sync";

function createQueries({
  activeGraphPaperRefs = [],
  activePaperNodeResponses = [],
  universePointIds = {},
  initialProducerPointIds = {},
}: {
  activeGraphPaperRefs?: string[];
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
      return {
        overlayCount: nextOverlayPointIds.length,
        overlayRevision: 1,
        traceStages: [
          { stage: "project", durationMs: 1 },
          { stage: "refresh", durationMs: 2 },
        ],
      };
    }),
    clearOverlayProducer: jest.fn(async (producerId) => {
      producerPointIds.delete(producerId);
      nextOverlayPointIds = Array.from(
        new Set(Array.from(producerPointIds.values()).flat()),
      );
      return {
        overlayCount: nextOverlayPointIds.length,
        overlayRevision: 1,
        traceStages: [{ stage: "project", durationMs: 1 }],
      };
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
    getSelectionScopeGraphPaperRefs: jest.fn(async () => []),
    ensureGraphPaperRefsAvailable: jest.fn(async (graphPaperRefs: string[]) => {
      const resolvedActiveGraphPaperRefs = graphPaperRefs.filter((graphPaperRef) =>
        activeGraphPaperRefs.includes(graphPaperRef),
      );
      const unresolvedAfterActive = graphPaperRefs.filter(
        (graphPaperRef) => !resolvedActiveGraphPaperRefs.includes(graphPaperRef),
      );
      const universePointIdsByGraphPaperRef = Object.fromEntries(
        unresolvedAfterActive
          .filter((graphPaperRef) => graphPaperRef in universePointIds)
          .map((graphPaperRef) => [graphPaperRef, universePointIds[graphPaperRef]]),
      );

      return {
        activeGraphPaperRefs: resolvedActiveGraphPaperRefs,
        universePointIdsByGraphPaperRef,
        unresolvedGraphPaperRefs: unresolvedAfterActive.filter(
          (graphPaperRef) => !(graphPaperRef in universePointIdsByGraphPaperRef),
        ),
        traceStages: [
          { stage: "availability", durationMs: 1 },
          ...(unresolvedAfterActive.some((graphPaperRef) => !(graphPaperRef in universePointIds))
            ? [{ stage: "attach", durationMs: 1 } as const]
            : []),
        ],
      };
    }),
    getPaperNodesByGraphPaperRefs: jest.fn(async (graphPaperRefs: string[]) => {
      const combinedResponses = Object.assign({}, ...activePaperNodeResponses);
      return Object.fromEntries(
        graphPaperRefs
          .filter((graphPaperRef) => graphPaperRef in combinedResponses)
          .map((graphPaperRef) => [graphPaperRef, combinedResponses[graphPaperRef]]),
      );
    }),
    getUniversePointIdsByGraphPaperRefs: jest.fn(async () => universePointIds),
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

const promptOrigin: GraphInteractionOrigin = {
  surface: "prompt",
  interactionKey: "ask:rag:ask",
  producerId: RAG_ASK_OVERLAY_PRODUCER,
};

function createRagResponse(
  paperIds: Array<string | null>,
): GraphRagQueryResponsePayload {
  return {
    answer_graph_paper_refs: paperIds
      .slice(0, 2)
      .map((paperId, index) => paperId ?? `corpus:${index + 1}`),
    graph_signals: paperIds.map((paperId, index) => ({
      corpus_id: index + 1,
      graph_paper_ref: paperId ?? `corpus:${index + 1}`,
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

  it("collects unique graph paper refs from graph signals", () => {
    expect(
      collectSignalGraphPaperRefs(createRagResponse(["paper-1", "paper-1", null])),
    ).toEqual(["paper-1", "corpus:3"]);
  });

  it("collects explicit answer-linked graph paper refs", () => {
    expect(
      collectAnswerGraphPaperRefs(createRagResponse(["paper-1", "paper-1", null])),
    ).toEqual(["paper-1"]);
  });

  it("highlights already-active paper nodes without touching overlay membership", async () => {
    const queries = createQueries({
      activeGraphPaperRefs: ["paper-1"],
      activePaperNodeResponses: [
        {
          "paper-1": { index: 7 } as PaperNode,
        },
      ],
    });

    const result = await syncRagGraphSignals({
      interactionId: "prompt:1",
      origin: promptOrigin,
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse: createRagResponse(["paper-1"]),
    });

    expect(queries.ensureGraphPaperRefsAvailable).toHaveBeenCalledTimes(1);
    expect(queries.ensureGraphPaperRefsAvailable).toHaveBeenCalledWith([
      "paper-1",
    ]);
    expect(queries.getUniversePointIdsByGraphPaperRefs).not.toHaveBeenCalled();
    expect(queries.setOverlayProducerPointIds).not.toHaveBeenCalled();
    expect(queries.clearOverlayProducer).toHaveBeenCalledWith(RAG_ASK_OVERLAY_PRODUCER);
    expect(queries.setOverlayPointIds).not.toHaveBeenCalled();
    expect(queries.clearOverlay).not.toHaveBeenCalled();
    expect(result.graphAvailabilitySummary).toEqual({
      activeResolvedGraphPaperRefs: ["paper-1"],
      overlayPromotedGraphPaperRefs: [],
      evidenceOnlyGraphPaperRefs: [],
    });
    expect(result.answerSelectedPointIndices).toEqual([7]);
    expect(result.interactionTrace.stages.map((stage) => stage.stage)).toEqual([
      "intent",
      "availability",
      "project",
      "resolve",
    ]);
  });

  it("promotes non-active papers into the RAG producer without dropping other overlay producers", async () => {
    const queries = createQueries({
      activeGraphPaperRefs: [],
      activePaperNodeResponses: [
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
      interactionId: "prompt:2",
      origin: promptOrigin,
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse: createRagResponse(["paper-2"]),
    });

    expect(queries.ensureGraphPaperRefsAvailable).toHaveBeenCalledWith([
      "paper-2",
    ]);
    expect(queries.getUniversePointIdsByGraphPaperRefs).not.toHaveBeenCalled();
    expect(queries.setOverlayProducerPointIds).toHaveBeenCalledWith({
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      pointIds: ["rag-new"],
    });
    await expect(queries.getOverlayPointIds()).resolves.toEqual(
      expect.arrayContaining(["external-1", "rag-new"]),
    );
    expect(result.graphAvailabilitySummary).toEqual({
      activeResolvedGraphPaperRefs: [],
      overlayPromotedGraphPaperRefs: ["paper-2"],
      evidenceOnlyGraphPaperRefs: [],
    });
    expect(result.answerSelectedPointIndices).toEqual([12]);
    expect(result.interactionTrace.stages.map((stage) => stage.stage)).toEqual([
      "intent",
      "availability",
      "project",
      "refresh",
      "resolve",
    ]);
  });

  it("selects only the explicit answer-linked subset when broader graph signals are present", async () => {
    const queries = createQueries({
      activeGraphPaperRefs: ["paper-1"],
      activePaperNodeResponses: [
        {
          "paper-1": { index: 7 } as PaperNode,
          "paper-2": { index: 12 } as PaperNode,
        },
      ],
      universePointIds: {
        "paper-2": "rag-new",
      },
    });

    const ragResponse = createRagResponse(["paper-1", "paper-2", "paper-3"]);
    ragResponse.answer_graph_paper_refs = ["paper-1"];

    const result = await syncRagGraphSignals({
      interactionId: "prompt:3",
      origin: promptOrigin,
      producerId: RAG_ASK_OVERLAY_PRODUCER,
      queries,
      ragResponse,
    });

    expect(result.graphAvailabilitySummary).toEqual({
      activeResolvedGraphPaperRefs: ["paper-1"],
      overlayPromotedGraphPaperRefs: ["paper-2"],
      evidenceOnlyGraphPaperRefs: ["paper-3"],
    });
    expect(result.answerSelectedPointIndices).toEqual([7]);
    expect(result.interactionTrace.stages.map((stage) => stage.stage)).toEqual([
      "intent",
      "availability",
      "attach",
      "project",
      "refresh",
      "resolve",
    ]);
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
    expect(result.graphAvailabilitySummary).toEqual({
      activeResolvedGraphPaperRefs: [],
      overlayPromotedGraphPaperRefs: [],
      evidenceOnlyGraphPaperRefs: [],
    });
    expect(result.answerSelectedPointIndices).toEqual([]);
  });
});
