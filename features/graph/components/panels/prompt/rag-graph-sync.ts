import type {
  GraphBundleQueries,
  OverlayProducerId,
  GraphRagQueryResponsePayload,
} from "@/features/graph/types";

export interface RagGraphSyncResult {
  highlightedPointIndices: number[];
}

export function collectSignalPaperIds(
  ragResponse: GraphRagQueryResponsePayload,
): string[] {
  return Array.from(
    new Set(
      ragResponse.graph_signals
        .map((signal) => signal.paper_id)
        .filter((paperId): paperId is string => Boolean(paperId)),
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
  const paperIds = collectSignalPaperIds(ragResponse);
  if (paperIds.length === 0) {
    await queries.clearOverlayProducer(producerId);
    return {
      highlightedPointIndices: [],
    };
  }

  let paperNodes = await queries.getPaperNodesByPaperIds(paperIds);
  const unresolvedPaperIds = paperIds.filter((paperId) => !(paperId in paperNodes));
  const universePointIds =
    unresolvedPaperIds.length > 0
      ? await queries.getUniversePointIdsByPaperIds(unresolvedPaperIds)
      : {};
  const nextRagOverlayPointIds = uniqueStrings(Object.values(universePointIds));

  if (nextRagOverlayPointIds.length > 0) {
    await queries.setOverlayProducerPointIds({
      producerId,
      pointIds: nextRagOverlayPointIds,
    });
    paperNodes = await queries.getPaperNodesByPaperIds(paperIds);
  } else {
    await queries.clearOverlayProducer(producerId);
  }

  return {
    highlightedPointIndices: uniqueNumbers(
      Object.values(paperNodes)
        .map((node) => node.index)
        .filter((index) => Number.isFinite(index)),
    ),
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
