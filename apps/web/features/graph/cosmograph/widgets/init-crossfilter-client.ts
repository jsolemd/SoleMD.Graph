"use client";

import type { Cosmograph } from "@cosmograph/cosmograph";
import { getInternalApi } from "@cosmograph/cosmograph/cosmograph/internal";
import { FilteringClient } from "@cosmograph/cosmograph/cosmograph/crossfilter/filtering-client";
import {
  getSelectionSourceId,
  matchesSelectionSourceId,
} from "@/features/graph/lib/cosmograph-selection";

/**
 * Shared FilteringClient initialization for crossfilter widgets.
 *
 * Creates (or reuses) a FilteringClient bound to the Cosmograph crossfilter
 * pipeline. The `onFiltered` callback gates `onPointsFiltered` to only fire
 * when this client's source ID matches the active selection clause.
 *
 * @returns The initialized client, or `null` if the DB coordinator isn't ready.
 */
export async function initCrossfilterClient(
  cosmograph: unknown,
  config: { sourceId: string; column: string; tableName: string },
): Promise<FilteringClient | null> {
  const internalApi = getInternalApi(cosmograph as unknown as Cosmograph);
  await internalApi.dbReady();
  if (!internalApi.dbCoordinator) {
    return null;
  }

  const client = FilteringClient.getOrCreateClient({
    coordinator: internalApi.dbCoordinator,
    getTableName: () => config.tableName,
    getSelection: () => internalApi.crossfilter.pointsSelection,
    getAccessor: () => config.column,
    includeFields: () =>
      [internalApi.config.pointIndexBy].filter(Boolean) as string[],
    onFiltered: (result) => {
      if (
        matchesSelectionSourceId(
          getSelectionSourceId(
            internalApi.crossfilter.pointsSelection.active?.source,
          ),
          config.sourceId,
        )
      ) {
        internalApi.crossfilter.onPointsFiltered(result);
      }
    },
    id: config.sourceId,
  });
  client.setActive(true);
  return client;
}
