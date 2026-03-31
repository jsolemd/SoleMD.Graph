"use client";

const QUANTILE_HISTOGRAM_COLUMNS = new Set([
  "paperAuthorCount",
  "paperReferenceCount",
  "paperEntityCount",
  "paperRelationCount",
]);

export function shouldUseQuantileHistogram(column: string): boolean {
  return QUANTILE_HISTOGRAM_COLUMNS.has(column);
}
