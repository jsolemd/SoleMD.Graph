"use client";

import type { GraphInfoFacetRow, GraphInfoHistogramResult } from "@/features/graph/types";

/** Shared retry delays for widget dataset loading (retry on empty result). */
export const WIDGET_DATASET_RETRY_DELAYS = [0, 150, 450] as const;

const categoricalDatasetCache = new Map<string, GraphInfoFacetRow[]>();
const numericDatasetCache = new Map<string, number[]>();
const histogramDatasetCache = new Map<string, GraphInfoHistogramResult>();

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
    if (!categoricalDatasetCache.has(key)) {
      categoricalDatasetCache.delete(key);
    }
    return;
  }

  categoricalDatasetCache.set(key, values);
}

export function getCachedNumericDataset(key: string): number[] | null {
  return numericDatasetCache.get(key) ?? null;
}

export function setCachedNumericDataset(key: string, values: number[]): void {
  if (values.length === 0) {
    if (!numericDatasetCache.has(key)) {
      numericDatasetCache.delete(key);
    }
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
