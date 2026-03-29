/** Loop-safe min that avoids stack overflow from spread on large arrays. */
export function safeMin(values: number[]): number {
  if (values.length === 0) return 0;
  let min = Infinity;
  for (const v of values) if (v < min) min = v;
  return min;
}

/** Loop-safe max that avoids stack overflow from spread on large arrays. */
export function safeMax(values: number[]): number {
  if (values.length === 0) return 0;
  let max = -Infinity;
  for (const v of values) if (v > max) max = v;
  return max;
}

const COLUMN_PRECISION: Record<string, number> = {
  clusterProbability: 3,
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
