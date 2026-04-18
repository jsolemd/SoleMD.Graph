/**
 * Shared numeric-range helpers for Cosmograph crossfilter widgets
 * (TimelineWidget, FilterHistogramWidget).
 */

/** Check if two numeric ranges are effectively equal (within floating-point tolerance). */
export function rangesEqual(
  left: [number, number],
  right: [number, number],
): boolean {
  return (
    Math.abs(left[0] - right[0]) < 1e-6 &&
    Math.abs(left[1] - right[1]) < 1e-6
  );
}

/**
 * Clamp a range to an extent and round according to step size.
 * step >= 1 rounds to integers (years, page numbers); step < 1 rounds to 3 decimals.
 */
export function normalizeRange(
  value: [number, number],
  extent: [number, number],
  step = 1,
): [number, number] {
  const min = Math.max(extent[0], Math.min(value[0], value[1]));
  const max = Math.min(extent[1], Math.max(value[0], value[1]));

  if (step >= 1) {
    return [Math.round(min), Math.round(max)];
  }

  return [Number(min.toFixed(3)), Number(max.toFixed(3))];
}
