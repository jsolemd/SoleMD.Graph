import type { GraphNode } from '@/features/graph/types';

/** Safe property access on a graph node by column key. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getNodeProp(node: GraphNode, key: string): any {
  return (node as never as Record<string, unknown>)[key];
}

/** Loop-safe min that avoids stack overflow from spread on large arrays. */
export function safeMin(values: number[]): number {
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  return min;
}

/** Loop-safe max that avoids stack overflow from spread on large arrays. */
export function safeMax(values: number[]): number {
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return max;
}

const COLUMN_PRECISION: Record<string, number> = {
  clusterProbability: 3,
  outlierScore: 3,
  x: 2,
  y: 2,
};

export function formatCellValue(
  value: unknown,
  opts?: { columnKey?: string; nullLabel?: string; truncate?: number | false }
): string {
  const { columnKey, nullLabel = "—", truncate = false } = opts ?? {};
  if (value == null) return nullLabel;
  if (typeof value === "number") {
    const precision = columnKey ? COLUMN_PRECISION[columnKey] : undefined;
    if (precision !== undefined && Number.isFinite(value)) return value.toFixed(precision);
    return String(value);
  }
  if (typeof value === "string") {
    if (truncate && value.length > truncate) return value.slice(0, truncate - 3) + "...";
    return value;
  }
  if (typeof value === "boolean") return String(value);
  try { return JSON.stringify(value); } catch { return String(value); }
}
