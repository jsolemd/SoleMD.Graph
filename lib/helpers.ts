export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat("en-US", options).format(value);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function coerceNullableNumber(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function coerceNullableString(value: number | string | null | undefined) {
  if (value == null || value === '') {
    return null
  }

  return String(value)
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
