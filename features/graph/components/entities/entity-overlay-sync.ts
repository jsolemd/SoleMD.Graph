import { fetchGraphEntityOverlay } from "@/features/graph/lib/entity-service";
import { ENTITY_GRAPH_OVERLAY_PRODUCER } from "@/features/graph/lib/overlay-producers";
import type {
  GraphBundleQueries,
  OverlayProducerId,
} from "@/features/graph/types";
import type {
  GraphEntityOverlayRef,
  GraphEntityOverlayResponsePayload,
} from "@/features/graph/types/entity-service";

export interface EntityOverlaySyncResult {
  response: GraphEntityOverlayResponsePayload;
  overlayPointIds: string[];
  selectedPointIndices: number[];
}

export async function syncEntityOverlay({
  producerId = ENTITY_GRAPH_OVERLAY_PRODUCER,
  queries,
  entityRefs,
  graphReleaseId,
  signal,
  useNativeSelectionOnly = false,
}: {
  producerId?: OverlayProducerId;
  queries: GraphBundleQueries;
  entityRefs: GraphEntityOverlayRef[];
  graphReleaseId: string;
  signal?: AbortSignal;
  /** When true, skip overlay producer (no canvas rebuild) and rely on native
   *  Cosmograph selection to highlight entity papers already in the base graph. */
  useNativeSelectionOnly?: boolean;
}): Promise<EntityOverlaySyncResult> {
  if (entityRefs.length === 0) {
    if (!useNativeSelectionOnly) {
      await queries.clearOverlayProducer(producerId);
    }
    return {
      response: { graphPaperRefs: [], entityGraphPaperCounts: {} },
      overlayPointIds: [],
      selectedPointIndices: [],
    };
  }

  const response = await fetchGraphEntityOverlay(
    { entityRefs, graphReleaseId },
    { signal },
  );

  if (response.graphPaperRefs.length === 0) {
    if (!useNativeSelectionOnly) {
      await queries.clearOverlayProducer(producerId);
    }
    return { response, overlayPointIds: [], selectedPointIndices: [] };
  }

  let pointIds: string[] = [];

  if (!useNativeSelectionOnly) {
    // Overlay producer path: promote universe-only papers into the canvas.
    // This triggers a full canvas data rebuild (point count changes).
    const availability = await queries.ensureGraphPaperRefsAvailable(
      response.graphPaperRefs,
    );

    pointIds = uniqueStrings(
      Object.values(availability.universePointIdsByGraphPaperRef),
    );

    if (pointIds.length > 0) {
      await queries.setOverlayProducerPointIds({ producerId, pointIds });
    } else {
      await queries.clearOverlayProducer(producerId);
    }
  }

  // Resolve point indices for native Cosmograph selection.
  // Papers already in the base graph get highlighted without canvas rebuild.
  const entityPaperNodes = await queries.getPaperNodesByGraphPaperRefs(
    response.graphPaperRefs,
  );
  const selectedPointIndices = Object.values(entityPaperNodes)
    .map((node) => node.index)
    .filter((index): index is number => Number.isFinite(index));

  return { response, overlayPointIds: pointIds, selectedPointIndices };
}

export async function clearEntityOverlay({
  producerId = ENTITY_GRAPH_OVERLAY_PRODUCER,
  queries,
}: {
  producerId?: OverlayProducerId;
  queries: GraphBundleQueries;
}): Promise<void> {
  await queries.clearOverlayProducer(producerId);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim().length > 0)));
}
