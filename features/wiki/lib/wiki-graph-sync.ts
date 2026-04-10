import type {
  GraphBundleQueries,
  GraphPaperAvailabilityResult,
  OverlayProducerId,
} from "@/features/graph/types";

export interface WikiOverlayResolution {
  availability: GraphPaperAvailabilityResult;
  pointIds: string[];
}

/**
 * Phase 1: RESOLVE -- pure reads, no shared mutations.
 *
 * Takes the graphPaperRefs from the wiki page and calls
 * ensureGraphPaperRefsAvailable to find which are active vs need overlay
 * promotion. Returns the point IDs to promote + availability info.
 */
export async function resolveWikiOverlay({
  queries,
  graphPaperRefs,
}: {
  queries: GraphBundleQueries;
  graphPaperRefs: string[];
}): Promise<WikiOverlayResolution> {
  if (graphPaperRefs.length === 0) {
    return {
      availability: {
        activeGraphPaperRefs: [],
        universePointIdsByGraphPaperRef: {},
        unresolvedGraphPaperRefs: [],
      },
      pointIds: [],
    };
  }

  const availability =
    await queries.ensureGraphPaperRefsAvailable(graphPaperRefs);

  const pointIds = uniqueStrings(
    Object.values(availability.universePointIdsByGraphPaperRef),
  );

  return { availability, pointIds };
}

/**
 * Phase 2: COMMIT -- writes to overlay, guarded by generation check in hook.
 *
 * If pointIds is non-empty, calls setOverlayProducerPointIds.
 * If empty, calls clearOverlayProducer.
 */
export async function commitWikiOverlay({
  producerId,
  queries,
  pointIds,
}: {
  producerId: OverlayProducerId;
  queries: GraphBundleQueries;
  pointIds: string[];
}): Promise<void> {
  if (pointIds.length > 0) {
    await queries.setOverlayProducerPointIds({ producerId, pointIds });
  } else {
    await queries.clearOverlayProducer(producerId);
  }
}

/**
 * Phase 3: POST-COMMIT NODE CACHE -- reads current_paper_points_web AFTER
 * overlay is materialized.
 *
 * Calls getPaperNodesByGraphPaperRefs to get node indices for camera focus.
 * Returns a map of graphPaperRef -> node index.
 */
export async function cacheWikiNodeIndices({
  queries,
  graphPaperRefs,
}: {
  queries: GraphBundleQueries;
  graphPaperRefs: string[];
}): Promise<Record<string, number>> {
  if (graphPaperRefs.length === 0) {
    return {};
  }

  const nodesByRef = await queries.getPaperNodesByGraphPaperRefs(graphPaperRefs);

  const result: Record<string, number> = {};
  for (const [ref, node] of Object.entries(nodesByRef)) {
    if (Number.isFinite(node.index)) {
      result[ref] = node.index;
    }
  }

  return result;
}

/**
 * Phase 4: CLEAR -- cleanup.
 */
export async function clearWikiGraphOverlay({
  producerId,
  queries,
}: {
  producerId: OverlayProducerId;
  queries: GraphBundleQueries;
}): Promise<void> {
  await queries.clearOverlayProducer(producerId);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v.trim().length > 0)));
}
