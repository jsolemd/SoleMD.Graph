"use client";

import type { GraphInfoFacetRow, GraphInfoHistogramResult } from "@solemd/graph";
import { createBoundedCache } from "../../duckdb/utils";

/** Shared retry delays for widget dataset loading (retry on empty result). */
export const WIDGET_DATASET_RETRY_DELAYS = [0, 150, 450] as const;

/**
 * Per-widget dataset cache bound.
 *
 * Keys are `bundleChecksum:layer:column:overlayRevision:scope`. A normal
 * session touches a few dozen unique keys as the user filters, switches
 * layers, and the overlay ticks; 64 gives generous headroom without
 * letting long-running tabs grow memory unboundedly.
 * Uses `createBoundedCache` (LRU by insertion order) from duckdb/utils so
 * the widget layer shares eviction semantics with the query layer.
 */
export const WIDGET_DATASET_CACHE_MAX = 64;

const categoricalDatasetCache = createBoundedCache<string, GraphInfoFacetRow[]>(
  WIDGET_DATASET_CACHE_MAX,
);
const numericDatasetCache = createBoundedCache<string, number[]>(
  WIDGET_DATASET_CACHE_MAX,
);
const histogramDatasetCache = createBoundedCache<string, GraphInfoHistogramResult>(
  WIDGET_DATASET_CACHE_MAX,
);

export function getWidgetDatasetCacheKeyWithRevision(
  bundleChecksum: string,
  layer: string,
  column: string,
  overlayRevision: number,
  baselineScopeKey = "dataset",
): string {
  return `${bundleChecksum}:${layer}:${column}:${overlayRevision}:${baselineScopeKey}`;
}

export function getCachedCategoricalDataset(key: string): GraphInfoFacetRow[] | null {
  return categoricalDatasetCache.get(key) ?? null;
}

export function setCachedCategoricalDataset(key: string, values: GraphInfoFacetRow[]): void {
  if (values.length === 0) {
    categoricalDatasetCache.delete(key);
    return;
  }

  categoricalDatasetCache.set(key, values);
}

export function getCachedNumericDataset(key: string): number[] | null {
  return numericDatasetCache.get(key) ?? null;
}

export function setCachedNumericDataset(key: string, values: number[]): void {
  if (values.length === 0) {
    numericDatasetCache.delete(key);
    return;
  }

  numericDatasetCache.set(key, values);
}

export function getCachedHistogramDataset(key: string): GraphInfoHistogramResult | null {
  return histogramDatasetCache.get(key) ?? null;
}

export function setCachedHistogramDataset(key: string, value: GraphInfoHistogramResult): void {
  if (value.totalCount === 0) {
    histogramDatasetCache.delete(key);
    return;
  }

  histogramDatasetCache.set(key, value);
}
