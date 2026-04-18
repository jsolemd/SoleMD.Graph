"use client";

import type { GraphInfoFacetRow } from "@solemd/graph";

export function toFacetRowsFromBarCounts(
  rows: Array<{ value: string; count: number }>,
): GraphInfoFacetRow[] {
  return rows.map((row) => ({
    value: row.value,
    scopedCount: row.count,
    totalCount: row.count,
  }));
}
