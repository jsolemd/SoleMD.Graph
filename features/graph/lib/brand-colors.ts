/** WebGL needs actual hex values, not CSS vars. Keep in sync with globals.css. */
export const BRAND = {
  light: { bg: "#f8f9fa", ring: "#747caa", label: "#1a1b1e", greyout: 0.25, pointOpacity: 0.5 },
  dark:  { bg: "#111113", ring: "#a8c5e9", label: "#e4e4e9", greyout: 0.12, pointOpacity: 0.7 },
} as const;

/** Always-dark text for contrast on pastel backgrounds (both themes). */
export const DARK_ON_COLOR = "#1a1b1e";

/** Noise cluster color (HDBSCAN cluster 0). */
export const NOISE_COLOR = "#555555";
export const NOISE_COLOR_LIGHT = "#999999";

/** Fallback when cluster-mod lookup has no match. */
export const DEFAULT_POINT_COLOR = "#a8c5e9";

/** Hardcoded map colors used by MapCanvas.tsx — extracted here for single-source maintenance. */
export const MAP_COLORS = {
  water: { light: '#eef0f2', dark: '#1a1c20' },
  choropleth: {
    light: ['#d0dcea', '#b8cede', '#8eacc8', '#6e94b8', '#5080a8'],
    dark: ['#1a2332', '#223040', '#2e4a68', '#3a6088', '#4878a8'],
  },
} as const;
