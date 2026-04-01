/** WebGL needs actual hex values, not CSS vars. Keep in sync with globals.css. */
export const BRAND = {
  light: { bg: "#f8f9fa", ring: "#747caa", greyout: 0.25 },
  dark:  { bg: "#111113", ring: "#a8c5e9", greyout: 0.12 },
} as const;

/**
 * Theme-independent canvas rendering constants.
 *
 * Philosophy: the Cosmograph WebGL canvas always renders with "dark" palette
 * values (raw, un-boosted colors). In light mode a CSS `filter` on the
 * `<canvas>` element (via `--graph-canvas-filter` in globals.css) boosts
 * saturation + darkens — GPU-composited and instant. The canvas uses a
 * transparent WebGL background so the filter only hits colored content;
 * labels and the visible background `<div>` are unaffected.
 *
 * This means toggling dark/light never changes `pointColorBy`,
 * `pointColorPalette`, or `pointColorByFn`, so Cosmograph never re-reads
 * millions of DuckDB rows.
 *
 * Opacity is also theme-independent: a single density-scaled range that works
 * on both dark and light backgrounds.
 */
export const CANVAS = {
  /** Density-scaled opacity floor (dense graphs). */
  minOpacity: 0.55,
  /** Density-scaled opacity ceiling (sparse graphs). */
  maxOpacity: 0.85,
} as const;

/** Always-dark text for contrast on pastel backgrounds (both themes). */
export const DARK_ON_COLOR = "#1a1b1e";

/** Noise cluster color (HDBSCAN cluster 0). */
export const NOISE_COLOR = "#555555";
export const NOISE_COLOR_LIGHT = "#999999";

/** Fallback when cluster-mod lookup has no match. */
export const DEFAULT_POINT_COLOR = "#a8c5e9";
