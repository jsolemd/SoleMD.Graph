import type {
  GraphBundleQueries,
  GraphPaperAvailabilityResult,
  OverlayProducerId,
} from "@solemd/graph";
import type { GraphRagQueryResponsePayload } from "@solemd/api-client/shared/graph-rag";

export interface RagGraphSyncResult {
  availability: GraphPaperAvailabilityResult;
  graphAvailabilitySummary: {
    activeResolvedGraphPaperRefs: string[];
    overlayPromotedGraphPaperRefs: string[];
    evidenceOnlyGraphPaperRefs: string[];
  };
  answerSelectedPointIndices: number[];
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
  producerId,
  queries,
  ragResponse,
}: {
  producerId: OverlayProducerId;
  queries: GraphBundleQueries;
  ragResponse: GraphRagQueryResponsePayload;
}): Promise<RagGraphSyncResult> {
  const graphPaperRefs = collectSignalGraphPaperRefs(ragResponse);
  if (graphPaperRefs.length === 0) {
    await queries.clearOverlayProducer(producerId);
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
    };
  }

  const availability = await queries.ensureGraphPaperRefsAvailable(
    graphPaperRefs,
  );
  const nextRagOverlayPointIds = uniqueStrings(
    Object.values(availability.universePointIdsByGraphPaperRef),
  );

  if (nextRagOverlayPointIds.length > 0) {
    await queries.setOverlayProducerPointIds({
      producerId,
      pointIds: nextRagOverlayPointIds,
    });
  } else {
    await queries.clearOverlayProducer(producerId);
  }

  const answerGraphPaperRefs = collectAnswerGraphPaperRefs(ragResponse);
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
