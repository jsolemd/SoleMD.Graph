import type {
  GraphBundleQueries,
  GraphInteractionOrigin,
  GraphInteractionTrace,
  GraphPaperAvailabilityResult,
  OverlayProducerId,
  GraphRagQueryResponsePayload,
} from "@/features/graph/types";
import {
  createGraphInteractionTrace,
  createInteractionTraceStage,
  getInteractionNow,
  mergeInteractionTraceStages,
} from "@/features/graph/lib/interaction-trace";

export interface RagGraphSyncResult {
  availability: GraphPaperAvailabilityResult;
  graphAvailabilitySummary: {
    activeResolvedGraphPaperRefs: string[];
    overlayPromotedGraphPaperRefs: string[];
    evidenceOnlyGraphPaperRefs: string[];
  };
  answerSelectedPointIndices: number[];
  interactionTrace: GraphInteractionTrace;
}

export function collectSignalGraphPaperRefs(
  ragResponse: GraphRagQueryResponsePayload,
): string[] {
  return Array.from(
    new Set(
      ragResponse.graph_signals
        .map((signal) => signal.graph_paper_ref)
        .filter((paperRef): paperRef is string => Boolean(paperRef)),
    ),
  );
}

export function collectAnswerGraphPaperRefs(
  ragResponse: GraphRagQueryResponsePayload,
): string[] {
  return Array.from(
    new Set(
      ragResponse.answer_graph_paper_refs.filter(
        (paperRef): paperRef is string => Boolean(paperRef),
      ),
    ),
  );
}

export async function syncRagGraphSignals({
  interactionId,
  origin,
  producerId,
  queries,
  ragResponse,
}: {
  interactionId: string;
  origin: GraphInteractionOrigin;
  producerId: OverlayProducerId;
  queries: GraphBundleQueries;
  ragResponse: GraphRagQueryResponsePayload;
}): Promise<RagGraphSyncResult> {
  const intentStartedAt = getInteractionNow();
  const graphPaperRefs = collectSignalGraphPaperRefs(ragResponse);
  const answerGraphPaperRefs = collectAnswerGraphPaperRefs(ragResponse);
  const intentTraceStages = [
    createInteractionTraceStage({
      stage: "intent",
      startedAt: intentStartedAt,
      metadata: {
        signalGraphPaperRefCount: graphPaperRefs.length,
        answerGraphPaperRefCount: answerGraphPaperRefs.length,
      },
    }),
  ];

  if (graphPaperRefs.length === 0) {
    const clearResult = await queries.clearOverlayProducer(producerId);
    return {
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
      interactionTrace: createGraphInteractionTrace({
        interactionId,
        origin,
        stages: mergeInteractionTraceStages(
          intentTraceStages,
          clearResult.traceStages,
        ),
        metadata: {
          signalGraphPaperRefCount: 0,
          overlayPromotedGraphPaperRefCount: 0,
          unresolvedGraphPaperRefCount: 0,
        },
      }),
    };
  }

  const availability = await queries.ensureGraphPaperRefsAvailable(
    graphPaperRefs,
  );
  const nextRagOverlayPointIds = uniqueStrings(
    Object.values(availability.universePointIdsByGraphPaperRef),
  );

  const projectResult =
    nextRagOverlayPointIds.length > 0
      ? await queries.setOverlayProducerPointIds({
          producerId,
          pointIds: nextRagOverlayPointIds,
        })
      : await queries.clearOverlayProducer(producerId);

  const resolveStartedAt = getInteractionNow();
  const answerSelectedPointIndices =
    answerGraphPaperRefs.length > 0
      ? uniqueNumbers(
          Object.values(
            await queries.getPaperNodesByGraphPaperRefs(answerGraphPaperRefs),
          )
            .map((node) => node.index)
            .filter((index) => Number.isFinite(index)),
        )
      : [];
  const resolveTraceStage = createInteractionTraceStage({
    stage: "resolve",
    startedAt: resolveStartedAt,
    metadata: {
      answerGraphPaperRefCount: answerGraphPaperRefs.length,
      selectedPointCount: answerSelectedPointIndices.length,
    },
  });

  return {
    availability,
    graphAvailabilitySummary: {
      activeResolvedGraphPaperRefs: availability.activeGraphPaperRefs,
      overlayPromotedGraphPaperRefs: graphPaperRefs.filter(
        (graphPaperRef) => graphPaperRef in availability.universePointIdsByGraphPaperRef,
      ),
      evidenceOnlyGraphPaperRefs: availability.unresolvedGraphPaperRefs,
    },
    answerSelectedPointIndices,
    interactionTrace: createGraphInteractionTrace({
      interactionId,
      origin,
      stages: mergeInteractionTraceStages(
        intentTraceStages,
        availability.traceStages,
        projectResult.traceStages,
        [resolveTraceStage],
      ),
      metadata: {
        signalGraphPaperRefCount: graphPaperRefs.length,
        overlayPromotedGraphPaperRefCount: nextRagOverlayPointIds.length,
        unresolvedGraphPaperRefCount: availability.unresolvedGraphPaperRefs.length,
      },
    }),
  };
}

export async function clearRagGraphOverlay({
  producerId,
  queries,
}: {
  producerId: OverlayProducerId;
  queries: GraphBundleQueries;
}): Promise<void> {
  await queries.clearOverlayProducer(producerId);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values));
}
